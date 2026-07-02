import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { listDailyFiles, loadDailyFile, intradayDates, listIntradayForDate } from "@/lib/data-files";
import { computeIntradayStats } from "@/lib/intraday";
import { computeWatchList, WATCH_FORMULA_VERSION } from "@/lib/daytrade-watch";
import type { DailyData } from "@/lib/types";

// 當沖觀察度「回溯驗證」：以現行觀察度公式重算歷史每日觀察清單，對照『次日』該股
// 1 分 K 振幅（intraday_cache），依觀察度分級(high/mid/low)彙總平均次日振幅。
// 觀察度只用當日收盤資料算（非 look-ahead）；驗證的是「振幅可預測性」而非報酬/勝率。
// 次日振幅樣本受 intraday_cache 覆蓋限制（僅盤後收錄之精選標的），有覆蓋偏差。

function loadDisposalSet(): Set<string> {
  try {
    const p = path.join(process.cwd(), "data", "categories.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    return new Set<string>(raw?.disposal?.codes ?? []);
  } catch {
    return new Set<string>();
  }
}

function summarize(arr: number[]): { n: number; avg: number | null; median: number | null } {
  if (!arr.length) return { n: 0, avg: null, median: null };
  const s = [...arr].sort((a, b) => a - b);
  const avg = +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
  const median = +s[Math.floor((s.length - 1) / 2)].toFixed(2);
  return { n: arr.length, avg, median };
}

export async function GET() {
  const files = listDailyFiles(); // newest-first
  const method =
    `回溯重建：以現行觀察度公式(${WATCH_FORMULA_VERSION})重算歷史每日觀察清單，對照「次日」該股 1 分 K 振幅` +
    `(intraday_cache，僅涵蓋盤後收錄之精選標的)。觀察度只用當日收盤資料算(非 look-ahead)；驗證的是「振幅可預測性」非報酬/勝率。` +
    `次日振幅樣本受 intraday_cache 覆蓋限制(僅收錄股)，有覆蓋偏差；公式凍結並版本化，之後只往前累積。`;

  if (files.length < 2) {
    return NextResponse.json({ available: false, formulaVersion: WATCH_FORMULA_VERSION, method });
  }

  const dailyByDate = new Map<string, DailyData>();
  for (const f of files) {
    const d = loadDailyFile<DailyData>(f);
    if (d) dailyByDate.set(f.replace(/\.json$/, ""), d);
  }
  const asc = files.map((f) => f.replace(/\.json$/, "")).reverse(); // chronological ascending
  const disposalSet = loadDisposalSet();

  // 次日振幅 map，只對有 intraday 收錄的日期建立
  const idDates = new Set(intradayDates());
  const ampCache = new Map<string, Map<string, number>>();
  function ampMapFor(date: string): Map<string, number> | null {
    if (!idDates.has(date)) return null;
    const cached = ampCache.get(date);
    if (cached) return cached;
    const m = new Map<string, number>();
    for (const { code, bars } of listIntradayForDate(date)) {
      if (bars.length >= 10) m.set(code, computeIntradayStats(bars).amplitudePct);
    }
    ampCache.set(date, m);
    return m;
  }

  const buckets: Record<"high" | "mid" | "low", number[]> = { high: [], mid: [], low: [] };
  const perDay: { date: string; next: string; graded: number }[] = [];
  let gradedSamples = 0;

  for (let i = 0; i < asc.length - 1; i++) {
    const D = asc[i];
    const next = asc[i + 1];
    const ampMap = ampMapFor(next);
    if (!ampMap || ampMap.size === 0) continue;
    const today = dailyByDate.get(D);
    if (!today) continue;

    const prev: { name: string }[][] = [];
    for (let k = 1; k <= 2; k++) {
      const pd = dailyByDate.get(asc[i - k]);
      if (pd) prev.push(pd.groups);
    }
    const last6: DailyData[] = [];
    for (let k = 0; k < 6; k++) {
      const dd = dailyByDate.get(asc[i - k]);
      if (dd) last6.push(dd);
    }

    const { rows } = computeWatchList(today, prev, last6, disposalSet);
    let dayGraded = 0;
    for (const r of rows) {
      const amp = ampMap.get(r.code);
      if (amp == null) continue;
      buckets[r.grade].push(amp);
      dayGraded++;
      gradedSamples++;
    }
    if (dayGraded > 0) perDay.push({ date: D, next, graded: dayGraded });
  }

  const grades = {
    high: summarize(buckets.high),
    mid: summarize(buckets.mid),
    low: summarize(buckets.low),
  };
  const spread =
    grades.high.avg != null && grades.low.avg != null
      ? +(grades.high.avg - grades.low.avg).toFixed(2)
      : null;

  return NextResponse.json(
    {
      available: gradedSamples > 0,
      formulaVersion: WATCH_FORMULA_VERSION,
      gradedDays: perDay.length,
      gradedSamples,
      windowFrom: perDay[0]?.date ?? null,
      windowTo: perDay[perDay.length - 1]?.date ?? null,
      grades,
      spread,
      method,
    },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
  );
}
