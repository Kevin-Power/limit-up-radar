// scripts/grade_focus.ts
//
// 前向戰績閉環（N2）— 結算端：
// 對 data/track-record/focus/{date}.json 中「次一交易日已有資料」的定格快照結算：
//   - 隔日衝 picks vs 次日開盤報酬：以該股次日 intraday_cache 第一根 1 分 K 的 open 當次日開盤，
//     openRetPct = (次日開盤 − 定格日收盤) / 定格日收盤 × 100（毛數字）。
//   - 當沖觀察 vs 次日振幅：computeIntradayStats(次日 1 分 K).amplitudePct（毛數字）。
//     ※ 當沖只驗證「振幅可預測性」，不使用、也不得使用「勝率」字樣。
// 彙總寫 data/track-record/summary.json（forward / backfill 嚴格分開統計）。
//
// 用法（在 repo root 執行）：
//   npx tsx scripts/grade_focus.ts
//
// 鐵則：
//   - 結算只用「次日(含以後)」本機現成資料（data/daily 檔序決定次一交易日、intraday_cache 供價格），不連網。
//   - intraday_cache 僅涵蓋部分盤後收錄標的與交易日：無收錄者跳過並計入 coverage 缺口，不得估價。
//   - 所有報酬為毛數字；勝率（僅隔日衝）另附「扣成本情境」（現股來回約 0.585%：手續費 0.1425%×2 + 證交稅 0.3%，未含滑價）。
import fs from "node:fs";
import path from "node:path";
import {
  listDailyDates,
  intradayDates,
  listIntradayForDate,
  safeReadJSON,
} from "../src/lib/data-files";
import { computeIntradayStats } from "../src/lib/intraday";

const TRACK_DIR = path.join(process.cwd(), "data", "track-record", "focus");
const SUMMARY_PATH = path.join(process.cwd(), "data", "track-record", "summary.json");

/** 現股買賣來回成本情境（%）：手續費 0.1425%×2 + 證交稅 0.3%，未含滑價。 */
const COST_ASSUMPTION_PCT = 0.585;

interface Snapshot {
  date: string;
  source: "forward" | "backfill";
  overnightFormulaVersion: string;
  watchFormulaVersion: string;
  overnight: { code: string; name: string; group: string; score: number; close: number; streak: number }[];
  daytradeWatch: { code: string; name: string; watchScore: number; grade: "high" | "mid" | "low"; lots: number; streak: number }[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round1 = (v: number) => Math.round(v * 10) / 10;

function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return round2(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return round2(s[Math.floor((s.length - 1) / 2)]);
}

// ── 隔日衝分數帶分桶 ──
type Band = "50-59" | "60-74" | "75+";
const BANDS: Band[] = ["50-59", "60-74", "75+"];
const bandOf = (score: number): Band => (score >= 75 ? "75+" : score >= 60 ? "60-74" : "50-59");

interface OvernightBucket {
  rets: number[];
}
interface DaytradeBucket {
  amps: number[];
}

function summarizeOvernight(b: OvernightBucket) {
  const n = b.rets.length;
  const wins = b.rets.filter((r) => r > 0).length;
  const winsOverCost = b.rets.filter((r) => r > COST_ASSUMPTION_PCT).length;
  return {
    n,
    avgOpenRetPct: avg(b.rets),          // 毛平均開盤報酬 %
    medianOpenRetPct: median(b.rets),
    winRateGrossPct: n ? round1((wins / n) * 100) : null,          // 毛報酬 > 0
    winRateOverCostPct: n ? round1((winsOverCost / n) * 100) : null, // 毛報酬 > 0.585%（成本情境）
  };
}

function summarizeDaytrade(b: DaytradeBucket) {
  // 當沖只講振幅（波動可預測性），不講勝率/報酬。
  return {
    n: b.amps.length,
    avgAmplitudePct: avg(b.amps),
    medianAmplitudePct: median(b.amps),
  };
}

interface SourceAgg {
  days: number;
  overnight: { total: OvernightBucket; bands: Record<Band, OvernightBucket> };
  daytrade: { total: DaytradeBucket; grades: Record<"high" | "mid" | "low", DaytradeBucket> };
}

function newSourceAgg(): SourceAgg {
  return {
    days: 0,
    overnight: {
      total: { rets: [] },
      bands: { "50-59": { rets: [] }, "60-74": { rets: [] }, "75+": { rets: [] } },
    },
    daytrade: {
      total: { amps: [] },
      grades: { high: { amps: [] }, mid: { amps: [] }, low: { amps: [] } },
    },
  };
}

function main() {
  if (!fs.existsSync(TRACK_DIR)) {
    console.error(`找不到 ${TRACK_DIR} — 請先跑 npx tsx scripts/snapshot_focus.ts（可加 --backfill）。`);
    process.exit(1);
  }

  const snapFiles = fs
    .readdirSync(TRACK_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort(); // 舊 → 新
  if (snapFiles.length === 0) {
    console.error("data/track-record/focus 沒有任何定格快照。");
    process.exit(1);
  }

  const dailyAsc = listDailyDates().reverse(); // 舊 → 新（次一交易日以 daily 檔序決定）
  const idDates = new Set(intradayDates());

  // 每個「次日」建一次價格快取：code → { open, amp }
  const nextDayCache = new Map<string, Map<string, { open: number; amp: number | null }>>();
  function nextDayMap(date: string): Map<string, { open: number; amp: number | null }> {
    const cached = nextDayCache.get(date);
    if (cached) return cached;
    const m = new Map<string, { open: number; amp: number | null }>();
    for (const { code, bars } of listIntradayForDate(date)) {
      if (!bars.length || !(bars[0].open > 0)) continue;
      m.set(code, {
        open: bars[0].open,
        // 振幅需要足夠的 bar 數才有意義（與 /api/daytrade-track 同門檻）
        amp: bars.length >= 10 ? computeIntradayStats(bars).amplitudePct : null,
      });
    }
    nextDayCache.set(date, m);
    return m;
  }

  const agg: Record<"forward" | "backfill", SourceAgg> = {
    forward: newSourceAgg(),
    backfill: newSourceAgg(),
  };
  const overnightVersions = new Set<string>();
  const watchVersions = new Set<string>();

  const days: {
    date: string;
    nextDate: string | null;
    source: "forward" | "backfill";
    status: "graded" | "pending_next_day" | "no_intraday_coverage";
    overnight: { picks: number; graded: number; gaps: number; avgOpenRetPct: number | null; wins: number };
    daytrade: { rows: number; graded: number; gaps: number; avgAmplitudePct: number | null };
  }[] = [];

  let pendingNextDay = 0;
  let noIntradayCoverage = 0;
  let gradedDays = 0;
  const cov = {
    overnight: { picks: 0, graded: 0, gaps: 0 },
    daytrade: { rows: 0, graded: 0, gaps: 0 },
  };

  for (const f of snapFiles) {
    const snap = safeReadJSON<Snapshot>(path.join(TRACK_DIR, f));
    if (!snap) {
      console.error(`[fail] ${f} 讀取失敗，跳過。`);
      continue;
    }
    overnightVersions.add(snap.overnightFormulaVersion);
    watchVersions.add(snap.watchFormulaVersion);
    const source: "forward" | "backfill" = snap.source === "forward" ? "forward" : "backfill";

    const idx = dailyAsc.indexOf(snap.date);
    const next = idx >= 0 && idx + 1 < dailyAsc.length ? dailyAsc[idx + 1] : null;
    if (!next) {
      pendingNextDay++;
      days.push({
        date: snap.date, nextDate: null, source, status: "pending_next_day",
        overnight: { picks: snap.overnight.length, graded: 0, gaps: 0, avgOpenRetPct: null, wins: 0 },
        daytrade: { rows: snap.daytradeWatch.length, graded: 0, gaps: 0, avgAmplitudePct: null },
      });
      continue;
    }
    if (!idDates.has(next)) {
      noIntradayCoverage++;
      days.push({
        date: snap.date, nextDate: next, source, status: "no_intraday_coverage",
        overnight: { picks: snap.overnight.length, graded: 0, gaps: snap.overnight.length, avgOpenRetPct: null, wins: 0 },
        daytrade: { rows: snap.daytradeWatch.length, graded: 0, gaps: snap.daytradeWatch.length, avgAmplitudePct: null },
      });
      cov.overnight.picks += snap.overnight.length;
      cov.overnight.gaps += snap.overnight.length;
      cov.daytrade.rows += snap.daytradeWatch.length;
      cov.daytrade.gaps += snap.daytradeWatch.length;
      continue;
    }

    const m = nextDayMap(next);
    const a = agg[source];

    // 隔日衝：次日開盤報酬（毛）
    const dayRets: number[] = [];
    let oGaps = 0;
    for (const p of snap.overnight) {
      cov.overnight.picks++;
      const nd = m.get(p.code);
      if (!nd || !(p.close > 0)) {
        oGaps++;
        cov.overnight.gaps++;
        continue;
      }
      const ret = ((nd.open - p.close) / p.close) * 100;
      dayRets.push(ret);
      cov.overnight.graded++;
      a.overnight.total.rets.push(ret);
      a.overnight.bands[bandOf(p.score)].rets.push(ret);
    }

    // 當沖觀察：次日振幅（毛）
    const dayAmps: number[] = [];
    let dGaps = 0;
    for (const w of snap.daytradeWatch) {
      cov.daytrade.rows++;
      const nd = m.get(w.code);
      if (!nd || nd.amp == null) {
        dGaps++;
        cov.daytrade.gaps++;
        continue;
      }
      dayAmps.push(nd.amp);
      cov.daytrade.graded++;
      a.daytrade.total.amps.push(nd.amp);
      a.daytrade.grades[w.grade].amps.push(nd.amp);
    }

    if (dayRets.length > 0 || dayAmps.length > 0) {
      a.days++;
      gradedDays++;
    }
    days.push({
      date: snap.date,
      nextDate: next,
      source,
      status: "graded",
      overnight: {
        picks: snap.overnight.length,
        graded: dayRets.length,
        gaps: oGaps,
        avgOpenRetPct: avg(dayRets),
        wins: dayRets.filter((r) => r > 0).length,
      },
      daytrade: {
        rows: snap.daytradeWatch.length,
        graded: dayAmps.length,
        gaps: dGaps,
        avgAmplitudePct: avg(dayAmps),
      },
    });
  }

  const bySource = (Object.keys(agg) as ("forward" | "backfill")[]).reduce(
    (acc, k) => {
      const a = agg[k];
      acc[k] = {
        gradedDays: a.days,
        overnight: {
          total: summarizeOvernight(a.overnight.total),
          bands: Object.fromEntries(BANDS.map((b) => [b, summarizeOvernight(a.overnight.bands[b])])),
        },
        daytrade: {
          total: summarizeDaytrade(a.daytrade.total),
          grades: {
            high: summarizeDaytrade(a.daytrade.grades.high),
            mid: summarizeDaytrade(a.daytrade.grades.mid),
            low: summarizeDaytrade(a.daytrade.grades.low),
          },
        },
      };
      return acc;
    },
    {} as Record<string, unknown>
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    formulaVersions: {
      overnight: [...overnightVersions].sort(),
      watch: [...watchVersions].sort(),
    },
    costAssumptionPct: COST_ASSUMPTION_PCT,
    window: {
      from: snapFiles[0].replace(/\.json$/, ""),
      to: snapFiles[snapFiles.length - 1].replace(/\.json$/, ""),
      snapshots: snapFiles.length,
      gradedDays,
      pendingNextDay,
      noIntradayCoverage,
    },
    coverage: cov,
    bySource,
    days,
    method:
      "定格日快照（凍結公式、只用當日收盤資訊）以「次一交易日」真實資料結算：" +
      "隔日衝 = 次日 intraday_cache 第一根 1 分 K 開盤 vs 定格日收盤之毛報酬；" +
      "當沖觀察 = 次日 1 分 K 振幅(高−低)/開盤（只驗證振幅可預測性，非報酬）。" +
      "次一交易日以 data/daily 檔序決定；intraday_cache 僅涵蓋部分盤後收錄標的，" +
      "無收錄者計入 coverage 缺口、不估價（有覆蓋偏差）。forward 與 backfill 分開統計。",
    disclosure:
      "所有報酬與振幅皆為毛數字，未含手續費、證交稅與滑價；勝率（僅隔日衝）另附「毛報酬 > " +
      COST_ASSUMPTION_PCT +
      "%」的成本情境欄位。backfill 為以現行凍結公式回溯重建、含名單現況與營收對齊之近似限制，" +
      "乾淨的 forward 樣本自公式凍結日起才開始累積。本統計非投資建議、不投射未來、不保證績效。",
  };

  fs.mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2) + "\n", "utf-8");

  console.log(`結算完成 → ${path.relative(process.cwd(), SUMMARY_PATH)}`);
  console.log(
    `快照 ${snapFiles.length} 份：已結算 ${gradedDays} 日、等待次日資料 ${pendingNextDay} 日、次日無分時收錄 ${noIntradayCoverage} 日。`
  );
  console.log(
    `隔日衝 coverage：picks ${cov.overnight.picks}、graded ${cov.overnight.graded}、缺口 ${cov.overnight.gaps}；` +
      `當沖 coverage：rows ${cov.daytrade.rows}、graded ${cov.daytrade.graded}、缺口 ${cov.daytrade.gaps}。`
  );
}

main();
