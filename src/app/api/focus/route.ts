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

function loadCategories(): { heavyweight: Set<string>; disposal: Set<string> } {
  try {
    const p = path.join(process.cwd(), "data", "categories.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    return {
      heavyweight: new Set(Object.keys(raw?.heavyweight?.codes ?? {}).filter((c) => /^\d{4}$/.test(c))),
      disposal: new Set(raw?.disposal?.codes ?? []),
    };
  } catch {
    return { heavyweight: new Set(), disposal: new Set() };
  }
}

// Aggregate codes that triggered bearish engulfing in past N days
function loadRecentBearishCodes(files: string[], days = 7): Set<string> {
  const codes = new Set<string>();
  for (let i = 0; i < Math.min(files.length, days); i++) {
    try {
      const raw = fs.readFileSync(path.join(DAILY_DIR, files[i]), "utf-8");
      const d = JSON.parse(raw);
      for (const b of d.bearish_engulfing ?? []) {
        if (b?.code) codes.add(b.code);
      }
    } catch { /* skip */ }
  }
  return codes;
}

export async function GET() {
  // Get last 3 trading days
  let files: string[];
  try {
    files = fs.readdirSync(DAILY_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
  } catch {
    return NextResponse.json({ error: "no data" }, { status: 404 });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "no data" }, { status: 404 });
  }

  const today = loadDaily(files[0]);
  const yesterday = files.length > 1 ? loadDaily(files[1]) : null;
  const dayBefore = files.length > 2 ? loadDaily(files[2]) : null;
  const { heavyweight, disposal: knownDisposal } = loadCategories();
  const recentBearishCodes = loadRecentBearishCodes(files, 7);

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

  // === Per-stock risk metrics for new scoring params ===
  // 1. consecutiveUpDays: how many consecutive recent days has this stock been in limit-up?
  // 2. isDisposal: TWSE rule = 3+ limit-up days within 6 trading days
  const last6Days: DailyData[] = [];
  for (let i = 0; i < Math.min(files.length, 6); i++) {
    const d = loadDaily(files[i]);
    if (d) last6Days.push(d);
  }
  // Map: code → array of dates (most recent first) where stock hit limit-up
  const stockLimitUpDates = new Map<string, string[]>();
  for (const day of last6Days) {
    for (const g of day.groups) {
      for (const s of g.stocks) {
        if (!stockLimitUpDates.has(s.code)) stockLimitUpDates.set(s.code, []);
        stockLimitUpDates.get(s.code)!.push(day.date);
      }
    }
  }
  // consecutiveUpDays for today's stocks: count consecutive presence from index 0
  const consecutiveUpDaysMap = new Map<string, number>();
  const disposalCodes = new Set<string>();
  for (const [code, dates] of stockLimitUpDates) {
    // dates are in reverse chrono order; check consecutive from most recent
    let consec = 0;
    for (let i = 0; i < last6Days.length; i++) {
      if (dates.includes(last6Days[i].date)) consec++;
      else break;
    }
    consecutiveUpDaysMap.set(code, consec);
    // TWSE 處置: ≥3 limit-up days in last 6
    if (dates.length >= 3) disposalCodes.add(code);
  }

  // Score each stock
  interface FocusStock {
    code: string;
    name: string;
    close: number;
    changePct: number;
    volume: number;
    majorNet: number;
    streak: number;
    consecutiveUpDays: number;
    streakRisk: 'low' | 'medium' | 'high';
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
    open357Low: number;
    open357Mid: number;
    open357High: number;
    isBearish: boolean;
  }

  const focusStocks: FocusStock[] = [];

  // Today's bearish-engulfing codes (for UI filter flag)
  const todayBearishCodes = new Set<string>(
    ((today as DailyData & { bearish_engulfing?: { code: string }[] }).bearish_engulfing ?? [])
      .map((b) => b.code)
      .filter((c): c is string => typeof c === "string")
  );

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
        isDisposal: disposalCodes.has(s.code) || knownDisposal.has(s.code),
        consecutiveUpDays: consecutiveUpDaysMap.get(s.code) ?? 1,
        isHeavyweight: heavyweight.has(s.code),
        recentBearishEngulfing: recentBearishCodes.has(s.code),
      });

      const { entryAggressive, entryPullback, stopLoss, target1, target2,
              open357Low, open357Mid, open357High } =
        calculatePriceLevels(s.close);

      const consec = consecutiveUpDaysMap.get(s.code) ?? 1;

      focusStocks.push({
        code: s.code,
        name: s.name,
        close: s.close,
        changePct: s.change_pct,
        volume: s.volume,
        majorNet: s.major_net,
        streak: s.streak,
        consecutiveUpDays: consecutiveUpDaysMap.get(s.code) ?? 1,
        streakRisk: (s.streak ?? 1) <= 2 ? 'low' : (s.streak ?? 1) === 3 ? 'medium' : 'high',
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
        open357Low,
        open357Mid,
        open357High,
        isBearish: todayBearishCodes.has(s.code),
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

    // Per-stock metrics for the historical day (use 6-day window ending at dayData)
    const histLast6: DailyData[] = [];
    const dayIdx = files.indexOf(files[i]);
    for (let j = 0; j < 6 && (dayIdx + j) < files.length; j++) {
      const dh = loadDaily(files[dayIdx + j]);
      if (dh) histLast6.push(dh);
    }
    const histLimitUpDates = new Map<string, string[]>();
    for (const dh of histLast6) {
      for (const g of dh.groups) {
        for (const s of g.stocks) {
          if (!histLimitUpDates.has(s.code)) histLimitUpDates.set(s.code, []);
          histLimitUpDates.get(s.code)!.push(dh.date);
        }
      }
    }
    const histConsecMap = new Map<string, number>();
    const histDisposalCodes = new Set<string>();
    for (const [code, dates] of histLimitUpDates) {
      let consec = 0;
      for (let j = 0; j < histLast6.length; j++) {
        if (dates.includes(histLast6[j].date)) consec++;
        else break;
      }
      histConsecMap.set(code, consec);
      if (dates.length >= 3) histDisposalCodes.add(code);
    }

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
          isDisposal: histDisposalCodes.has(s.code) || knownDisposal.has(s.code),
          consecutiveUpDays: histConsecMap.get(s.code) ?? 1,
          isHeavyweight: heavyweight.has(s.code),
          // historical 空吞 不查 (避免 bias historical backtest)
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

  // === Industry flow heatmap (last up to 7 days × industries × major_net sum) ===
  const flowFiles = files.slice(0, Math.min(7, files.length));
  const flowDays: { date: string; perIndustry: Map<string, number | null> }[] = [];
  for (const f of flowFiles) {
    const d = loadDaily(f);
    if (!d) continue;
    const perIndustry = new Map<string, number | null>();
    for (const g of d.groups) {
      let sum = 0;
      let hasData = false;
      for (const s of g.stocks) {
        const mn = (s as { major_net?: number }).major_net;
        if (typeof mn === "number" && !Number.isNaN(mn)) {
          sum += mn;
          hasData = true;
        }
      }
      perIndustry.set(g.name, hasData ? sum : 0);
    }
    flowDays.push({ date: d.date, perIndustry });
  }
  // Reverse so oldest is leftmost
  flowDays.reverse();
  // Union of all industries appearing in any of the days
  const industriesSet = new Set<string>();
  for (const day of flowDays) {
    for (const ind of day.perIndustry.keys()) industriesSet.add(ind);
  }
  const industries = Array.from(industriesSet);
  const matrix: (number | null)[][] = industries.map((ind) =>
    flowDays.map((day) => (day.perIndustry.has(ind) ? day.perIndustry.get(ind)! : null))
  );
  const industryFlow = {
    dates: flowDays.map((d) => d.date.slice(5)), // MM-DD
    industries,
    matrix,
  };

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
    // 新增：今日空吞注意股 (從 daily JSON 拉)
    bearishEngulfing: (today as DailyData & { bearish_engulfing?: unknown[] }).bearish_engulfing ?? [],
    industryFlow,
  }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
