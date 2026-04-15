import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DAILY_DIR = path.join(process.cwd(), "data", "daily");
const REV_DIR = path.join(process.cwd(), "data", "revenue");

interface DailyStock {
  code: string;
  name: string;
  close: number;
  change_pct: number;
  volume: number;
  major_net: number;
  streak: number;
}

interface DailyGroup {
  name: string;
  color: string;
  stocks: DailyStock[];
}

interface DailyData {
  date: string;
  market_summary: Record<string, number>;
  groups: DailyGroup[];
}

function loadDaily(file: string): DailyData | null {
  try {
    const p = path.join(DAILY_DIR, file);
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function loadRevenue(): Record<string, { revYoY: number | null; revCumYoY: number | null; revMonth: number | null }> {
  try {
    const files = fs.readdirSync(REV_DIR).filter((f) => f.endsWith(".json")).sort().reverse();
    if (!files.length) return {};
    const data = JSON.parse(fs.readFileSync(path.join(REV_DIR, files[0]), "utf-8"));
    const map: Record<string, { revYoY: number | null; revCumYoY: number | null; revMonth: number | null }> = {};
    for (const s of data.stocks) {
      map[s.code] = { revYoY: s.revYoY, revCumYoY: s.revCumYoY, revMonth: s.revMonth };
    }
    return map;
  } catch {
    return {};
  }
}

export async function GET() {
  // Get last 3 trading days
  const files = fs.readdirSync(DAILY_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    return NextResponse.json({ error: "no data" }, { status: 404 });
  }

  const today = loadDaily(files[0]);
  const yesterday = files.length > 1 ? loadDaily(files[1]) : null;
  const dayBefore = files.length > 2 ? loadDaily(files[2]) : null;

  if (!today) {
    return NextResponse.json({ error: "no data" }, { status: 404 });
  }

  const revMap = loadRevenue();

  // Build group appearance map (how many of last 3 days each group appeared)
  const groupDays: Record<string, number> = {};
  for (const g of today.groups) {
    groupDays[g.name] = (groupDays[g.name] || 0) + 1;
  }
  if (yesterday) {
    for (const g of yesterday.groups) {
      groupDays[g.name] = (groupDays[g.name] || 0) + 1;
    }
  }
  if (dayBefore) {
    for (const g of dayBefore.groups) {
      groupDays[g.name] = (groupDays[g.name] || 0) + 1;
    }
  }

  // Trending groups: appeared 2+ days in last 3
  const trendingGroups = new Set(
    Object.entries(groupDays).filter(([, days]) => days >= 2).map(([name]) => name)
  );

  // Score each stock
  interface FocusStock {
    code: string;
    name: string;
    close: number;
    changePct: number;
    volume: number;
    majorNet: number;
    streak: number;
    group: string;
    groupColor: string;
    score: number;
    tags: string[];
    revYoY: number | null;
    revMonth: number | null;
    groupDays: number;
  }

  const focusStocks: FocusStock[] = [];

  for (const g of today.groups) {
    for (const s of g.stocks) {
      const rev = revMap[s.code];
      const tags: string[] = [];
      let score = 0;

      // Condition 1: Trending group (2+ days)
      const gd = groupDays[g.name] || 1;
      if (trendingGroups.has(g.name)) {
        score += 30;
        tags.push("趨勢族群");
      }

      // Condition 2: Revenue YoY > 20%
      if (rev?.revYoY != null && rev.revYoY > 20) {
        score += 25;
        tags.push("營收成長");
        if (rev.revYoY > 50) {
          score += 10;
          tags.push("高成長");
        }
      }

      // Condition 3: Major net buy (positive = institutions buying)
      if (s.major_net > 0) {
        score += 20;
        tags.push("法人買超");
      }

      // Condition 4: Streak >= 2 (momentum)
      if (s.streak >= 2) {
        score += 15;
        tags.push(`${s.streak}連板`);
      }

      // Condition 5: Volume significant (> 500 lots)
      if (s.volume > 5000000) {
        score += 5;
      }

      // Condition 6: Group leader (first in group by volume)
      const groupStocksSorted = [...g.stocks].sort((a, b) => b.volume - a.volume);
      if (groupStocksSorted[0]?.code === s.code) {
        score += 10;
        tags.push("族群龍頭");
      }

      focusStocks.push({
        code: s.code,
        name: s.name,
        close: s.close,
        changePct: s.change_pct,
        volume: s.volume,
        majorNet: s.major_net,
        streak: s.streak,
        group: g.name,
        groupColor: g.color,
        score,
        tags,
        revYoY: rev?.revYoY ?? null,
        revMonth: rev?.revMonth ?? null,
        groupDays: gd,
      });
    }
  }

  // Sort by score desc
  focusStocks.sort((a, b) => b.score - a.score);

  // Trending group summary
  const trendingSummary = today.groups
    .filter((g) => trendingGroups.has(g.name))
    .map((g) => ({
      name: g.name,
      color: g.color,
      todayCount: g.stocks.length,
      days: groupDays[g.name],
    }))
    .sort((a, b) => b.days - a.days || b.todayCount - a.todayCount);

  return NextResponse.json({
    date: today.date,
    taiex: today.market_summary.taiex_close,
    taiexChg: today.market_summary.taiex_change_pct,
    totalLimitUp: today.groups.reduce((sum, g) => sum + g.stocks.length, 0),
    trendingGroups: trendingSummary,
    focusStocks,
    topPicks: focusStocks.filter((s) => s.score >= 50).slice(0, 15),
  }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
