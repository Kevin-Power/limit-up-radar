import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

interface StockEntry {
  code: string;
  name: string;
  industry: string;
  close: number;
  change_pct: number;
  volume: number;
  major_net: number;
  streak: number;
}

interface GroupEntry {
  name: string;
  color: string;
  stocks: StockEntry[];
}

interface MarketSummary {
  taiex_close: number;
  taiex_change_pct: number;
  total_volume: number;
  limit_up_count: number;
  limit_down_count: number;
  advance: number;
  decline: number;
  unchanged: number;
  foreign_net: number;
  trust_net: number;
  dealer_net: number;
}

interface DailyFile {
  date: string;
  market_summary: MarketSummary;
  groups: GroupEntry[];
}

export interface DailyTrend {
  date: string;       // MM/DD
  fullDate: string;   // YYYY-MM-DD
  count: number;
  advance: number;
  decline: number;
  taiex: number;
  taiexChangePct: number;
}

export interface GroupStat {
  name: string;
  color: string;
  total: number;       // total limit-up appearances across all days
  days: number;        // how many trading days this group appeared
  avgPerDay: number;
  trend: "up" | "down" | "flat";
}

export interface HonestScenario {
  samples: number;
  winRate: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  mean: number | null;
  median: number | null;
  trimmedMeanTop3: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
}

export interface HonestCohort {
  samples: number;
  scenarios: {
    gross: HonestScenario;
    netFees: HonestScenario;
    netConservative: HonestScenario;
  };
  regime: {
    taiexUp: { days: number; gross: HonestScenario; netConservative: HonestScenario };
    taiexDown: { days: number; gross: HonestScenario; netConservative: HonestScenario };
  };
}

// 誠實期望值體檢輸出（scripts/honest_stats.py → data/analysis/honest_stats.json）
export interface HonestStats {
  generatedOn: string;
  method: string;
  window: { from: string; to: string; pickDays: number };
  params: {
    pickThreshold: number;
    hcThreshold: number;
    cap: number;
    costFeesPct: number;
    costConservativePct: number;
  };
  missing: number;
  cohorts: { all: HonestCohort; highConviction: HonestCohort };
  topOutliers: { date: string; code: string; name: string; grossPct: number }[];
}

export interface StatsData {
  dailyTrend: DailyTrend[];
  groupStats: GroupStat[];
  totalDays: number;
  totalLimitUps: number;
  avgLimitUpsPerDay: number;
  bestDay: { date: string; count: number };
  worstDay: { date: string; count: number };
  // Heatmap: group -> per-day counts (aligned to dailyTrend dates)
  heatmap: Record<string, number[]>;
  honestStats: HonestStats | null;
}

// Cache the aggregated stats response for 5 minutes; daily data only changes
// once per trading day, so re-reading 60+ JSON files on every request is wasteful.
export const revalidate = 300;

export async function GET() {
  const dataDir = path.join(process.cwd(), "data", "daily");

  let files: string[] = [];
  try {
    files = (await fs.readdir(dataDir))
      .filter((f) => f.endsWith(".json"))
      .sort();
  } catch {
    return NextResponse.json({ error: "No data" }, { status: 404 });
  }

  const dailyFiles: DailyFile[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(dataDir, file), "utf8");
      dailyFiles.push(JSON.parse(raw));
    } catch {
      // skip corrupt files
    }
  }

  if (dailyFiles.length === 0) {
    return NextResponse.json({ error: "No data" }, { status: 404 });
  }

  // Build daily trend
  const dailyTrend: DailyTrend[] = dailyFiles.map((d) => {
    const parts = d.date.split("-");
    const mm = parts[1] ?? "01";
    const dd = parts[2] ?? "01";
    return {
      date: `${parseInt(mm)}/${parseInt(dd)}`,
      fullDate: d.date,
      count: d.market_summary.limit_up_count,
      advance: d.market_summary.advance,
      decline: d.market_summary.decline,
      taiex: d.market_summary.taiex_close,
      taiexChangePct: d.market_summary.taiex_change_pct,
    };
  });

  // Group stats aggregation
  const groupMap: Map<string, { color: string; counts: number[]; total: number; days: number }> = new Map();
  const allDates = dailyFiles.map((d) => d.date);
  // O(1) date -> index lookup instead of allDates.indexOf() inside the nested loop
  const dateIndex = new Map<string, number>();
  allDates.forEach((date, i) => dateIndex.set(date, i));

  for (const day of dailyFiles) {
    const dayIdx = dateIndex.get(day.date) ?? -1;
    if (dayIdx < 0) continue;
    for (const g of day.groups) {
      const key = g.name;
      if (!groupMap.has(key)) {
        groupMap.set(key, { color: g.color, counts: new Array(allDates.length).fill(0), total: 0, days: 0 });
      }
      const entry = groupMap.get(key)!;
      entry.counts[dayIdx] = g.stocks.length;
      entry.total += g.stocks.length;
      entry.days += 1;
    }
  }

  // Compute trend (compare first half vs second half)
  const groupStats: GroupStat[] = Array.from(groupMap.entries()).map(([name, v]) => {
    const mid = Math.floor(v.counts.length / 2);
    const firstHalf = v.counts.slice(0, mid).reduce((a, b) => a + b, 0);
    const secondHalf = v.counts.slice(mid).reduce((a, b) => a + b, 0);
    let trend: "up" | "down" | "flat" = "flat";
    if (secondHalf > firstHalf + 1) trend = "up";
    else if (secondHalf < firstHalf - 1) trend = "down";

    return {
      name,
      color: v.color,
      total: v.total,
      days: v.days,
      avgPerDay: v.days > 0 ? +(v.total / v.days).toFixed(1) : 0,
      trend,
    };
  });
  groupStats.sort((a, b) => b.total - a.total);

  // Heatmap
  const heatmap: Record<string, number[]> = {};
  for (const [name, v] of groupMap.entries()) {
    heatmap[name] = v.counts;
  }

  const totalLimitUps = dailyTrend.reduce((s, d) => s + d.count, 0);
  const sortedByCount = [...dailyTrend].sort((a, b) => b.count - a.count);

  let honestStats: HonestStats | null = null;
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "data", "analysis", "honest_stats.json"),
      "utf8"
    );
    honestStats = JSON.parse(raw);
  } catch {
    // file absent until first honest_stats.py run — render nothing client-side
  }

  return NextResponse.json(
    {
      dailyTrend,
      groupStats,
      totalDays: dailyFiles.length,
      totalLimitUps,
      avgLimitUpsPerDay: dailyFiles.length > 0 ? +(totalLimitUps / dailyFiles.length).toFixed(1) : 0,
      bestDay: { date: sortedByCount[0]?.date ?? "-", count: sortedByCount[0]?.count ?? 0 },
      worstDay: { date: sortedByCount[sortedByCount.length - 1]?.date ?? "-", count: sortedByCount[sortedByCount.length - 1]?.count ?? 0 },
      heatmap,
      honestStats,
      // dates array for heatmap x-axis
      dates: dailyTrend.map((d) => d.date),
    } as StatsData & { dates: string[] },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
