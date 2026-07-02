import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { scoreStock } from "@/lib/scoring";
import {
  listDailyFiles,
  loadDailyFile,
  loadLatestRevenue,
} from "@/lib/data-files";
import {
  computeFocusPicks,
  computeFocusTrends,
  selectTopPicks,
  type FocusCategories,
  type FocusRevenueInfo,
} from "@/lib/focus-picks";

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
  bearish_engulfing?: { code?: string }[];
}

function loadDaily(file: string): DailyData | null {
  return loadDailyFile<DailyData>(file);
}

function loadRealBacktest(): unknown {
  try {
    const p = path.join(process.cwd(), "data", "backtest.json");
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function loadRevenue(): Record<string, FocusRevenueInfo> {
  try {
    const data = loadLatestRevenue<{ stocks: { code: string; revYoY: number | null; revCumYoY: number | null; revMonth: number | null }[] }>();
    if (!data) return {};
    const map: Record<string, FocusRevenueInfo> = {};
    for (const s of data.stocks) {
      map[s.code] = { revYoY: s.revYoY, revCumYoY: s.revCumYoY, revMonth: s.revMonth };
    }
    return map;
  } catch {
    return {};
  }
}

function loadCategories(): FocusCategories {
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

export async function GET() {
  // Get last 3 trading days
  let files: string[];
  try {
    files = listDailyFiles();
  } catch {
    return NextResponse.json({ error: "no data" }, { status: 404 });
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "no data" }, { status: 404 });
  }

  // 近 7 日視窗（最新在前；null 佔位保持與檔案序一致）：
  // 3 日算族群趨勢、6 日算連板/處置、7 日算近期空吞
  const windowDays: (DailyData | null)[] = files.slice(0, 7).map((f) => loadDaily(f));
  const today = windowDays[0];
  const { heavyweight, disposal: knownDisposal } = loadCategories();

  if (!today) {
    return NextResponse.json({ error: "no data" }, { status: 404 });
  }

  const revMap = loadRevenue();

  // === 隔日衝候選組裝（凍結公式單一來源：src/lib/focus-picks.ts）===
  const focusStocks = computeFocusPicks(windowDays, revMap, {
    heavyweight,
    disposal: knownDisposal,
  });
  const { trendingGroups, groupDays } = computeFocusTrends(windowDays);

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

  // === 市場氣氛（買進日可得、非 look-ahead）===
  // 兩盞燈，皆為呈現/提示，不改分數、不自動過濾：
  // 1) 過熱燈：今日 ≥75 分標的檔數(picksN75)。OOS(LOO 三月全正)顯示 ≤15 檔時
  //    隔日 EV 明顯較高、>25 檔訊號氾濫市場過熱、隔日易齊跌。
  // 2) 氣氛燈：今日大盤 breadth（漲跌家數/法人/漲停跌停/大盤漲跌），僅供空手減碼參考。
  const ms = today.market_summary as Record<string, number>;
  const picksN75 = focusStocks.filter((s) => s.score >= 75).length;
  const overheatLevel: "normal" | "caution" | "hot" =
    picksN75 <= 15 ? "normal" : picksN75 <= 25 ? "caution" : "hot";
  const advance = ms.advance ?? 0;
  const decline = ms.decline ?? 0;
  const foreignNet = ms.foreign_net ?? 0;
  const trustNet = ms.trust_net ?? 0;
  const limitUp = ms.limit_up_count ?? 0;
  const limitDown = ms.limit_down_count ?? 0;
  const taiexChgVal = ms.taiex_change_pct ?? 0;
  let moodBull = 0;
  if (taiexChgVal > 0) moodBull++;
  if (advance > decline) moodBull++;
  if (foreignNet + trustNet > 0) moodBull++;
  if (limitUp > limitDown * 2) moodBull++;
  const moodLevel: "bullish" | "neutral" | "bearish" =
    moodBull >= 3 ? "bullish" : moodBull <= 1 ? "bearish" : "neutral";
  const marketMood = {
    picksN75,
    overheatLevel,
    moodLevel,
    taiexChg: taiexChgVal,
    advance,
    decline,
    foreignNet,
    trustNet,
    limitUp,
    limitDown,
  };

  return NextResponse.json({
    date: today.date,
    taiex: today.market_summary.taiex_close,
    taiexChg: today.market_summary.taiex_change_pct,
    marketMood,
    totalLimitUp: today.groups.reduce((sum, g) => sum + g.stocks.length, 0),
    trendingGroups: trendingSummary,
    focusStocks,
    topPicks: selectTopPicks(focusStocks),
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
    bearishEngulfing: today.bearish_engulfing ?? [],
    industryFlow,
  }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
