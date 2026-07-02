// scripts/snapshot_focus.ts
//
// 前向戰績閉環（N2）— 定格端：
// 以「定格日收盤(含以前)」可得資訊，用凍結版本化公式算出
//   1) 隔日衝 topPicks（score ≥ 50 前 15，公式：src/lib/focus-picks.ts FOCUS_FORMULA_VERSION）
//   2) 當沖觀察清單（公式：src/lib/daytrade-watch.ts WATCH_FORMULA_VERSION）
// 寫入 data/track-record/focus/{date}.json，永久保存、日後由 grade_focus.ts 用次日真實資料結算。
//
// 用法（在 repo root 執行）：
//   npx tsx scripts/snapshot_focus.ts                    # 定格最新 daily 日（forward）
//   npx tsx scripts/snapshot_focus.ts --date=2026-06-20  # 定格指定日（非最新日視為 backfill）
//   npx tsx scripts/snapshot_focus.ts --backfill         # 回溯重建所有 daily 日期（source:"backfill"）
//   加 --force 可覆蓋已存在的快照（預設冪等：已存在即跳過）
//
// 鐵則：
//   - 無 look-ahead：只讀定格日(含以前)的 daily / categories / 已公布月營收。
//   - forward vs backfill 嚴格分離標記：forward = 公式凍結後於當日收盤定格（乾淨）；
//     backfill = 用現行凍結公式回算歷史（categories 名單為現況、營收檔以公布時點近似，含此限制）。
//   - 不連網、不動 git。
import fs from "node:fs";
import path from "node:path";
import {
  DAILY_DIR,
  REVENUE_DIR,
  listDailyFiles,
  loadDailyFile,
  listJsonFiles,
  safeReadJSON,
} from "../src/lib/data-files";
import {
  computeFocusPicks,
  selectTopPicks,
  FOCUS_FORMULA_VERSION,
} from "../src/lib/focus-picks";
import { computeWatchList, WATCH_FORMULA_VERSION } from "../src/lib/daytrade-watch";
import type { DailyData } from "../src/lib/types";

const TRACK_DIR = path.join(process.cwd(), "data", "track-record", "focus");

// daily JSON 可能帶 bearish_engulfing（focus-picks 需要）
type DailyDoc = DailyData & { bearish_engulfing?: { code?: string }[] };

interface SnapshotOvernightRow {
  code: string;
  name: string;
  group: string;
  score: number;
  close: number;
  streak: number;
}

interface SnapshotWatchRow {
  code: string;
  name: string;
  watchScore: number;
  grade: "high" | "mid" | "low";
  lots: number;
  streak: number;
}

interface Snapshot {
  date: string;
  capturedFor: string; // 「次一交易日」— 定格時尚不知實際日期（假日/休市），由結算端以 daily 檔序決定
  source: "forward" | "backfill";
  generatedAt: string;
  overnightFormulaVersion: string;
  watchFormulaVersion: string;
  revenueFile: string | null; // 定格時採用的月營收檔（透明化 look-ahead 控制）
  overnight: SnapshotOvernightRow[];
  daytradeWatch: SnapshotWatchRow[];
  notes: string;
}

function parseArgs(argv: string[]) {
  let date: string | null = null;
  let backfill = false;
  let force = false;
  for (const a of argv.slice(2)) {
    if (a === "--backfill") backfill = true;
    else if (a === "--force") force = true;
    else if (a.startsWith("--date=")) date = a.slice("--date=".length);
    else {
      console.error(`未知參數：${a}`);
      console.error("用法：npx tsx scripts/snapshot_focus.ts [--date=YYYY-MM-DD] [--backfill] [--force]");
      process.exit(1);
    }
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`--date 格式錯誤（需 YYYY-MM-DD）：${date}`);
    process.exit(1);
  }
  return { date, backfill, force };
}

function loadCategories(): { heavyweight: Set<string>; disposal: Set<string> } {
  const raw = safeReadJSON<{
    heavyweight?: { codes?: Record<string, unknown> };
    disposal?: { codes?: string[] };
  }>(path.join(process.cwd(), "data", "categories.json"));
  return {
    heavyweight: new Set(
      Object.keys(raw?.heavyweight?.codes ?? {}).filter((c) => /^\d{4}$/.test(c))
    ),
    disposal: new Set(raw?.disposal?.codes ?? []),
  };
}

/**
 * 定格日當下「已公布」的月營收檔。
 * - forward：最新檔（= /api/focus 的 loadLatestRevenue 行為，定格當日一定已公布）。
 * - backfill：月營收約於次月 10 日公布 → YYYY-MM.json 視為自「次月 10 日」起可得，
 *   取公布日 ≤ 定格日的最新一檔（近似對齊，避免用未來營收回算歷史）。
 */
function pickRevenueFile(captureDate: string, forward: boolean): string | null {
  const files = listJsonFiles(REVENUE_DIR); // newest-first
  if (forward) return files[0] ?? null;
  for (const f of files) {
    const m = f.match(/^(\d{4})-(\d{2})\.json$/);
    if (!m) continue;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const ny = mo === 12 ? y + 1 : y;
    const nm = mo === 12 ? 1 : mo + 1;
    const availableFrom = `${ny}-${String(nm).padStart(2, "0")}-10`;
    if (availableFrom <= captureDate) return f;
  }
  return null;
}

function loadRevenueMap(file: string | null): Record<string, { revYoY: number | null; revCumYoY: number | null; revMonth: number | null }> {
  if (!file) return {};
  const data = safeReadJSON<{ stocks?: { code: string; revYoY: number | null; revCumYoY: number | null; revMonth: number | null }[] }>(
    path.join(REVENUE_DIR, file)
  );
  const map: Record<string, { revYoY: number | null; revCumYoY: number | null; revMonth: number | null }> = {};
  for (const s of data?.stocks ?? []) {
    map[s.code] = { revYoY: s.revYoY, revCumYoY: s.revCumYoY, revMonth: s.revMonth };
  }
  return map;
}

const FORWARD_NOTE =
  "forward 定格：公式凍結後於當日收盤即時定格，僅用當日(含以前)可得資訊，事後不得修改。";
const BACKFILL_NOTE =
  "backfill 回溯重建：以現行凍結公式回算歷史。已知限制：categories.json 的處置/權值名單為現況、非當日狀態；" +
  "月營收檔以「次月10日公布」近似對齊；與真正 forward 定格可能有細微差異，統計時應與 forward 分開呈現。";

function buildSnapshot(
  captureDate: string,
  files: string[], // daily 檔名，最新在前
  idx: number, // captureDate 在 files 的索引
  source: "forward" | "backfill",
  categories: { heavyweight: Set<string>; disposal: Set<string> }
): Snapshot | null {
  // 視窗：定格日起往前最多 7 個交易日（null 佔位保持檔案序，與 /api/focus 完全一致）
  const window: (DailyDoc | null)[] = files
    .slice(idx, idx + 7)
    .map((f) => loadDailyFile<DailyDoc>(f));
  const today = window[0];
  if (!today) return null;

  const revenueFile = pickRevenueFile(captureDate, source === "forward");
  const revMap = loadRevenueMap(revenueFile);

  // 隔日衝：凍結公式（與 /api/focus 同一來源）
  const focusStocks = computeFocusPicks(window, revMap, categories);
  const topPicks = selectTopPicks(focusStocks);

  // 當沖觀察：凍結公式（與 /api/daytrade-watch 同一來源）
  const prevGroups = window
    .slice(1, 3)
    .filter((d): d is DailyDoc => d != null)
    .map((d) => d.groups);
  const last6 = window.slice(0, 6).filter((d): d is DailyDoc => d != null);
  const { rows: watchRows } = computeWatchList(today, prevGroups, last6, categories.disposal);

  return {
    date: captureDate,
    capturedFor: "次一交易日",
    source,
    generatedAt: new Date().toISOString(),
    overnightFormulaVersion: FOCUS_FORMULA_VERSION,
    watchFormulaVersion: WATCH_FORMULA_VERSION,
    revenueFile,
    overnight: topPicks.map((p) => ({
      code: p.code,
      name: p.name,
      group: p.group,
      score: p.score,
      close: p.close,
      streak: p.streak,
    })),
    daytradeWatch: watchRows.map((r) => ({
      code: r.code,
      name: r.name,
      watchScore: r.watchScore,
      grade: r.grade,
      lots: r.lots,
      streak: r.streak,
    })),
    notes: source === "forward" ? FORWARD_NOTE : BACKFILL_NOTE,
  };
}

function main() {
  const { date, backfill, force } = parseArgs(process.argv);

  if (!fs.existsSync(DAILY_DIR)) {
    console.error(`找不到 ${DAILY_DIR} — 請在 repo root 執行本腳本。`);
    process.exit(1);
  }
  const files = listDailyFiles(); // newest-first
  if (files.length === 0) {
    console.error("data/daily 沒有任何 daily 檔，無法定格。");
    process.exit(1);
  }
  const dates = files.map((f) => f.replace(/\.json$/, ""));
  const latestDate = dates[0];
  const categories = loadCategories();

  fs.mkdirSync(TRACK_DIR, { recursive: true });

  // 目標日期清單
  let targets: string[];
  if (backfill) {
    targets = [...dates].sort(); // 舊 → 新
  } else {
    const d = date ?? latestDate;
    if (!dates.includes(d)) {
      console.error(`daily 無 ${d} 的資料（可用範圍 ${dates[dates.length - 1]} ~ ${latestDate}）。`);
      process.exit(1);
    }
    targets = [d];
  }

  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const d of targets) {
    const outPath = path.join(TRACK_DIR, `${d}.json`);
    if (fs.existsSync(outPath) && !force) {
      skipped++;
      if (!backfill) console.log(`[skip] ${d} 已存在（用 --force 覆蓋）：${outPath}`);
      continue;
    }

    // source 判定：--backfill 一律 backfill；單日模式僅「定格最新 daily 日」算 forward，
    // 指定舊日期本質上是回溯重建，誠實標 backfill。
    const source: "forward" | "backfill" =
      backfill ? "backfill" : d === latestDate ? "forward" : "backfill";
    if (!backfill && source === "backfill") {
      console.log(`[note] ${d} 非最新 daily 日，標記 source:"backfill"（回溯重建）。`);
    }

    const idx = dates.indexOf(d);
    const snap = buildSnapshot(d, files, idx, source, categories);
    if (!snap) {
      failed++;
      console.error(`[fail] ${d} daily 檔讀取失敗，跳過。`);
      continue;
    }
    fs.writeFileSync(outPath, JSON.stringify(snap, null, 2) + "\n", "utf-8");
    written++;
    console.log(
      `[${snap.source}] ${d} 定格完成：隔日衝 ${snap.overnight.length} 檔 / 當沖觀察 ${snap.daytradeWatch.length} 檔 → ${path.relative(process.cwd(), outPath)}`
    );
  }

  console.log("");
  console.log(`完成：寫入 ${written}、跳過(已存在) ${skipped}、失敗 ${failed}。`);
  console.log(`公式版本：overnight=${FOCUS_FORMULA_VERSION} / watch=${WATCH_FORMULA_VERSION}`);
  console.log("下一步：npx tsx scripts/grade_focus.ts 以次日真實資料結算。");
}

main();
