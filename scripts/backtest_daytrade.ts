// scripts/backtest_daytrade.ts
//
// 當沖候選「日內回測」（不留倉）：
// 對每個交易日 D 的當沖觀察清單（computeWatchList），在「次一交易日 D+1」的
// 1 分 K 上模擬「開盤買進 → 各固定時點賣出」的日內毛/淨報酬，依觀察度分級彙總。
//
// 誠實邊界：
//   - 決策(選股)只用 D 收盤資料；進出用 D+1 盤中「已觀察到」的價，非 look-ahead。
//   - 進場價 = D+1 第一根 1 分 K 開盤；開盤即鎖漲停實務上可能買不到（回測無法排除，揭露之）。
//   - 只涵蓋 intraday_cache 有收錄的標的/交易日 → 覆蓋偏差，無收錄者跳過不估價。
//   - 當沖成本情境：手續費 0.1425%×2 + 當沖證交稅 0.15% = 0.435%（未含滑價）。
//   - 固定時點賣出（非事後挑最佳），避免過擬合。當日最高/最低僅列為「理論區間」參考。
//
// 用法（repo root）：npx tsx scripts/backtest_daytrade.ts
import fs from "node:fs";
import path from "node:path";
import {
  listDailyFiles,
  loadDailyFile,
  intradayDates,
  listIntradayForDate,
  type IntradayBar,
} from "../src/lib/data-files";
import { computeWatchList } from "../src/lib/daytrade-watch";
import type { DailyData } from "../src/lib/types";

const OUT = path.join(process.cwd(), "data", "analysis", "daytrade_backtest.json");
const COST_DAYTRADE_PCT = 0.435; // 手續費 0.1425%×2 + 當沖證交稅 0.15%

const EXITS = ["09:15", "09:30", "10:00", "11:00", "13:00", "收盤"] as const;
type Exit = (typeof EXITS)[number];

function loadDisposalSet(): Set<string> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "categories.json"), "utf-8"));
    return new Set<string>(raw?.disposal?.codes ?? []);
  } catch {
    return new Set<string>();
  }
}

// 第一根 time >= hhmm 的 bar（bars 為時間升冪）
function barAtOrAfter(bars: IntradayBar[], hhmm: string): IntradayBar | null {
  for (const b of bars) if (b.time >= hhmm) return b;
  return null;
}

function exitPrice(bars: IntradayBar[], exit: Exit): number | null {
  if (exit === "收盤") return bars[bars.length - 1]?.close ?? null;
  const b = barAtOrAfter(bars, exit);
  return b ? b.close : null;
}

function summarize(rets: number[]) {
  const n = rets.length;
  if (n === 0) return { n: 0, avgGross: null, median: null, avgNet: null, winGrossPct: null, winNetPct: null };
  const s = [...rets].sort((a, b) => a - b);
  const sum = rets.reduce((a, b) => a + b, 0);
  const winsGross = rets.filter((r) => r > 0).length;
  const winsNet = rets.filter((r) => r - COST_DAYTRADE_PCT > 0).length;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    n,
    avgGross: r2(sum / n),
    median: r2(s[Math.floor((n - 1) / 2)]),
    avgNet: r2(sum / n - COST_DAYTRADE_PCT),
    winGrossPct: r1((winsGross / n) * 100),
    winNetPct: r1((winsNet / n) * 100),
  };
}

function main() {
  const files = listDailyFiles(); // newest-first
  if (files.length < 2) {
    console.error("daily 檔不足，無法回測。");
    process.exit(1);
  }
  const dailyByDate = new Map<string, DailyData>();
  for (const f of files) {
    const d = loadDailyFile<DailyData>(f);
    if (d) dailyByDate.set(f.replace(/\.json$/, ""), d);
  }
  const asc = files.map((f) => f.replace(/\.json$/, "")).reverse(); // 舊→新
  const disposalSet = loadDisposalSet();
  const idDates = new Set(intradayDates());

  // 次日 intraday map 快取：date → (code → bars)
  const barsCache = new Map<string, Map<string, IntradayBar[]>>();
  function barsFor(date: string): Map<string, IntradayBar[]> | null {
    if (!idDates.has(date)) return null;
    const cached = barsCache.get(date);
    if (cached) return cached;
    const m = new Map<string, IntradayBar[]>();
    for (const { code, bars } of listIntradayForDate(date)) {
      if (bars.length >= 10) m.set(code, bars);
    }
    barsCache.set(date, m);
    return m;
  }

  // 累積：exit → rets[]；grade → exit → rets[]
  const byExit: Record<Exit, number[]> = { "09:15": [], "09:30": [], "10:00": [], "11:00": [], "13:00": [], "收盤": [] };
  const byGrade: Record<"high" | "mid" | "low", Record<Exit, number[]>> = {
    high: { "09:15": [], "09:30": [], "10:00": [], "11:00": [], "13:00": [], "收盤": [] },
    mid: { "09:15": [], "09:30": [], "10:00": [], "11:00": [], "13:00": [], "收盤": [] },
    low: { "09:15": [], "09:30": [], "10:00": [], "11:00": [], "13:00": [], "收盤": [] },
  };
  // 理論區間（開盤買→當日最高/最低）
  const toHigh: number[] = [];
  const toLow: number[] = [];

  let gradedDays = 0;
  let candidates = 0;
  let graded = 0;
  let gaps = 0;

  for (let i = 0; i < asc.length - 1; i++) {
    const D = asc[i];
    const next = asc[i + 1];
    const bmap = barsFor(next);
    if (!bmap || bmap.size === 0) continue;
    const today = dailyByDate.get(D);
    if (!today) continue;

    const prevGroups: { name: string }[][] = [];
    for (let k = 1; k <= 2; k++) {
      const pd = dailyByDate.get(asc[i - k]);
      if (pd) prevGroups.push(pd.groups);
    }
    const last6: DailyData[] = [];
    for (let k = 0; k < 6; k++) {
      const dd = dailyByDate.get(asc[i - k]);
      if (dd) last6.push(dd);
    }
    const { rows } = computeWatchList(today, prevGroups, last6, disposalSet);

    let dayGraded = 0;
    for (const r of rows) {
      candidates++;
      const bars = bmap.get(r.code);
      if (!bars) {
        gaps++;
        continue;
      }
      const entry = bars[0].open;
      if (!(entry > 0)) {
        gaps++;
        continue;
      }
      graded++;
      dayGraded++;
      for (const ex of EXITS) {
        const px = exitPrice(bars, ex);
        if (px == null) continue;
        const ret = ((px - entry) / entry) * 100;
        byExit[ex].push(ret);
        byGrade[r.grade][ex].push(ret);
      }
      let hi = bars[0].high;
      let lo = bars[0].low;
      for (const b of bars) {
        if (b.high > hi) hi = b.high;
        if (b.low < lo) lo = b.low;
      }
      toHigh.push(((hi - entry) / entry) * 100);
      toLow.push(((lo - entry) / entry) * 100);
    }
    if (dayGraded > 0) gradedDays++;
  }

  const out = {
    generatedAt: new Date().toISOString(),
    method:
      "當沖候選(觀察清單)日內回測：D 收盤選股、D+1 第一根 1 分 K 開盤買進、各固定時點賣出之毛報酬；" +
      "淨報酬扣當沖來回成本 " + COST_DAYTRADE_PCT + "%(手續費0.1425%×2+當沖證交稅0.15%，未含滑價)。" +
      "只涵蓋 intraday_cache 有收錄之標的/交易日(覆蓋偏差)；進場價為開盤，開盤即鎖漲停實務上可能買不到。固定時點非事後挑最佳。",
    costDaytradePct: COST_DAYTRADE_PCT,
    exits: EXITS,
    window: { from: asc[0], to: asc[asc.length - 1], gradedDays },
    coverage: { candidates, graded, gaps },
    byExit: Object.fromEntries(EXITS.map((e) => [e, summarize(byExit[e])])),
    byGrade: {
      high: Object.fromEntries(EXITS.map((e) => [e, summarize(byGrade.high[e])])),
      mid: Object.fromEntries(EXITS.map((e) => [e, summarize(byGrade.mid[e])])),
      low: Object.fromEntries(EXITS.map((e) => [e, summarize(byGrade.low[e])])),
    },
    theoretical: { toHigh: summarize(toHigh), toLow: summarize(toLow) },
    disclosure:
      "本回測驗證『當沖候選在次日開盤買進、日內固定時點賣出』的歷史報酬分布，非投資建議、不保證未來。" +
      "當沖為極高風險；報酬為毛數字，淨欄已扣 " + COST_DAYTRADE_PCT + "% 來回成本但未含滑價與買不到的執行摩擦。",
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf-8");

  console.log(`\n=== 當沖候選日內回測 (${out.window.from} ~ ${out.window.to}) ===`);
  console.log(`已結算日 ${gradedDays}、候選 ${candidates}、grade ${graded}、缺口(無收錄) ${gaps}`);
  console.log("開盤買 → 各時點賣（毛均 / 淨均 / 毛勝率 / 淨勝率）：");
  for (const e of EXITS) {
    const s = out.byExit[e];
    console.log(`  ${e.padEnd(5)} n=${s.n}  毛均 ${s.avgGross}%  淨均 ${s.avgNet}%  毛勝 ${s.winGrossPct}%  淨勝 ${s.winNetPct}%`);
  }
  console.log(`理論區間：開盤→當日最高 平均 +${out.theoretical.toHigh.avgGross}% / 開盤→當日最低 平均 ${out.theoretical.toLow.avgGross}%`);
  console.log(`saved: ${path.relative(process.cwd(), OUT)}`);
}

main();
