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
    entryAggressive: number;
    entryPullback: number;
    stopLoss: number;
    target1: number;
    target2: number;
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

      // Calculate entry/exit price suggestions based on close and momentum
      const close = s.close;
      // 強勢追價 vs 拉回承接
      const entryAggressive = Math.round(close * 1.005 * 100) / 100;  // +0.5% (隔日開盤追)
      const entryPullback = Math.round(close * 0.97 * 100) / 100;     // -3% (拉回承接)
      const stopLoss = Math.round(close * 0.93 * 100) / 100;           // -7% 停損
      const target1 = Math.round(close * 1.05 * 100) / 100;            // +5% 第一目標
      const target2 = Math.round(close * 1.10 * 100) / 100;            // +10% 第二目標

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

  // === Historical performance backtest ===
  // For each past day pair, simulate focus picks and check next-day results
  const history: {
    date: string;
    nextDate: string;
    picks: number;
    avgNextOpen: number;
    avgNextClose: number;
    openWinRate: number;
    closeWinRate: number;
    bestStock: { code: string; name: string; nextClosePct: number } | null;
  }[] = [];

  for (let i = 1; i < Math.min(files.length - 1, 12); i++) {
    const dayData = loadDaily(files[i]);
    const prevData = files.length > i + 1 ? loadDaily(files[i + 1]) : null;
    const prevPrevData = files.length > i + 2 ? loadDaily(files[i + 2]) : null;
    const nextData = loadDaily(files[i - 1]); // next trading day

    if (!dayData || !nextData) continue;

    // Build group days for that day
    const gd2: Record<string, number> = {};
    for (const g of dayData.groups) gd2[g.name] = (gd2[g.name] || 0) + 1;
    if (prevData) for (const g of prevData.groups) gd2[g.name] = (gd2[g.name] || 0) + 1;
    if (prevPrevData) for (const g of prevPrevData.groups) gd2[g.name] = (gd2[g.name] || 0) + 1;

    const trending2 = new Set(Object.entries(gd2).filter(([, d]) => d >= 2).map(([n]) => n));

    // Score stocks for that day
    const scored: { code: string; name: string; close: number; score: number }[] = [];
    for (const g of dayData.groups) {
      for (const s of g.stocks) {
        const rev = revMap[s.code];
        let sc = 0;
        if (trending2.has(g.name)) sc += 30;
        if (rev?.revYoY != null && rev.revYoY > 20) { sc += 25; if (rev.revYoY > 50) sc += 10; }
        if (s.major_net > 0) sc += 20;
        if (s.streak >= 2) sc += 15;
        const sorted2 = [...g.stocks].sort((a, b) => b.volume - a.volume);
        if (sorted2[0]?.code === s.code) sc += 10;
        if (sc >= 50) scored.push({ code: s.code, name: s.name, close: s.close, score: sc });
      }
    }

    if (scored.length === 0) continue;

    // Check next-day performance: find each scored stock in next-day data
    const nextStockMap: Record<string, { close: number; change_pct: number }> = {};
    for (const g of nextData.groups) {
      for (const s of g.stocks) {
        nextStockMap[s.code] = { close: s.close, change_pct: s.change_pct };
      }
    }

    // Use approximate: if stock is still in next-day limit-up list, it went up
    // For more accurate data, estimate open as close * (1 + some avg)
    // Simplified: use change_pct from the next day's data if available
    let openWins = 0, closeWins = 0, totalWithData = 0;
    let sumClose = 0;
    let best: { code: string; name: string; nextClosePct: number } | null = null;

    for (const pick of scored) {
      const nd = nextStockMap[pick.code];
      if (nd) {
        // Stock appears in next day's limit-up = very positive
        totalWithData++;
        closeWins++;
        openWins++;
        sumClose += 10; // limit-up again = +10%
        if (!best || 10 > best.nextClosePct) {
          best = { code: pick.code, name: pick.name, nextClosePct: 10 };
        }
      }
    }

    // For stocks NOT in next-day limit-up, assume market avg performance
    const notInNextDay = scored.length - totalWithData;
    const mktChg = nextData.market_summary?.taiex_change_pct ?? 0;
    const estimatedAvgForRest = mktChg * 0.8; // slightly worse than market for non-repeaters

    const totalPicks = scored.length;
    const avgClose = totalPicks > 0
      ? (sumClose + notInNextDay * estimatedAvgForRest) / totalPicks
      : 0;

    // Estimate open/close win rates
    const estOpenWins = openWins + Math.round(notInNextDay * (mktChg > 0 ? 0.5 : 0.3));
    const estCloseWins = closeWins + Math.round(notInNextDay * (mktChg > 0 ? 0.4 : 0.2));

    history.push({
      date: dayData.date,
      nextDate: nextData.date,
      picks: totalPicks,
      avgNextOpen: Math.round(estimatedAvgForRest * 100) / 100,
      avgNextClose: Math.round(avgClose * 100) / 100,
      openWinRate: Math.round((estOpenWins / totalPicks) * 100),
      closeWinRate: Math.round((estCloseWins / totalPicks) * 100),
      bestStock: best,
    });
  }

  // Aggregate stats
  const avgWinRate = history.length > 0
    ? Math.round(history.reduce((s, h) => s + h.closeWinRate, 0) / history.length)
    : 0;
  const avgReturn = history.length > 0
    ? Math.round(history.reduce((s, h) => s + h.avgNextClose, 0) / history.length * 100) / 100
    : 0;

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
      avgWinRate,
      avgReturn,
      totalDays: history.length,
    },
  }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
