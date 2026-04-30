import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { scoreStock, calculatePriceLevels } from "@/lib/scoring";

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

function loadRealBacktest(): unknown {
  try {
    const p = path.join(process.cwd(), "data", "backtest.json");
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
    entryAggressive: number;
    entryPullback: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }

  const focusStocks: FocusStock[] = [];

  for (const g of today.groups) {
    const groupStocksSorted = [...g.stocks].sort((a, b) => b.volume - a.volume);
    const leaderCode = groupStocksSorted[0]?.code;

    for (const s of g.stocks) {
      const rev = revMap[s.code];
      const gd = groupDays[g.name] || 1;

      const { score, tags } = scoreStock({
        stock: s,
        group: g,
        trendingGroups,
        groupVolumeLeaderCode: leaderCode,
        revYoY: rev?.revYoY,
      });

      const { entryAggressive, entryPullback, stopLoss, target1, target2 } =
        calculatePriceLevels(s.close);

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
        entryAggressive,
        entryPullback,
        stopLoss,
        target1,
        target2,
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

  // === Historical hit-rate (NEXT-DAY LIMIT-UP RATE) ===
  // ONLY uses verifiable data: did our pick reach limit-up the next day?
  // We do NOT estimate price moves we cannot verify from data on disk.
  const history: {
    date: string;
    nextDate: string;
    picks: number;
    nextLimitUpCount: number;     // how many picks hit limit-up again
    nextLimitUpRate: number;       // % of picks that hit limit-up next day
    bestStock: { code: string; name: string } | null;
  }[] = [];

  for (let i = 1; i < Math.min(files.length - 1, 12); i++) {
    const dayData = loadDaily(files[i]);
    const prevData = files.length > i + 1 ? loadDaily(files[i + 1]) : null;
    const prevPrevData = files.length > i + 2 ? loadDaily(files[i + 2]) : null;
    const nextData = loadDaily(files[i - 1]); // next trading day

    if (!dayData || !nextData) continue;

    const gd2: Record<string, number> = {};
    for (const g of dayData.groups) gd2[g.name] = (gd2[g.name] || 0) + 1;
    if (prevData) for (const g of prevData.groups) gd2[g.name] = (gd2[g.name] || 0) + 1;
    if (prevPrevData) for (const g of prevPrevData.groups) gd2[g.name] = (gd2[g.name] || 0) + 1;

    const trending2 = new Set(Object.entries(gd2).filter(([, d]) => d >= 2).map(([n]) => n));

    const scored: { code: string; name: string; close: number; score: number }[] = [];
    for (const g of dayData.groups) {
      const sorted2 = [...g.stocks].sort((a, b) => b.volume - a.volume);
      const leaderCode = sorted2[0]?.code;
      for (const s of g.stocks) {
        const rev = revMap[s.code];
        const { score: sc } = scoreStock({
          stock: s,
          group: g,
          trendingGroups: trending2,
          groupVolumeLeaderCode: leaderCode,
          revYoY: rev?.revYoY,
        });
        if (sc >= 50) scored.push({ code: s.code, name: s.name, close: s.close, score: sc });
      }
    }

    if (scored.length === 0) continue;

    // Build set of next-day limit-up codes (verifiable from data files)
    const nextLimitUpCodes = new Set<string>();
    for (const g of nextData.groups) {
      for (const s of g.stocks) nextLimitUpCodes.add(s.code);
    }

    let nextLimitUp = 0;
    let best: { code: string; name: string } | null = null;
    for (const pick of scored) {
      if (nextLimitUpCodes.has(pick.code)) {
        nextLimitUp++;
        if (!best) best = { code: pick.code, name: pick.name };
      }
    }

    history.push({
      date: dayData.date,
      nextDate: nextData.date,
      picks: scored.length,
      nextLimitUpCount: nextLimitUp,
      nextLimitUpRate: Math.round((nextLimitUp / scored.length) * 100),
      bestStock: best,
    });
  }

  // Aggregate: average next-day limit-up rate (only counts verifiable hits)
  const avgNextLimitUpRate = history.length > 0
    ? Math.round(history.reduce((s, h) => s + h.nextLimitUpRate, 0) / history.length)
    : 0;
  const totalPicks = history.reduce((s, h) => s + h.picks, 0);
  const totalHits = history.reduce((s, h) => s + h.nextLimitUpCount, 0);

  return NextResponse.json({
    date: today.date,
    taiex: today.market_summary.taiex_close,
    taiexChg: today.market_summary.taiex_change_pct,
    totalLimitUp: today.groups.reduce((sum, g) => sum + g.stocks.length, 0),
    trendingGroups: trendingSummary,
    focusStocks,
    topPicks: focusStocks.filter((s) => s.score >= 50).slice(0, 15),
    performance: {
      history,
      avgNextLimitUpRate,         // % of picks that hit limit-up next day
      totalDays: history.length,
      totalPicks,
      totalHits,
      methodology: "次日命中率 = 推薦標的次日仍漲停的比率 (僅統計可驗證命中)",
    },
    realBacktest: loadRealBacktest(),
  }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
