import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { safeReadJSON } from "@/lib/data-files";

// 前向戰績閉環（N2）讀取端：回傳最新「定格快照」＋已結算 summary。
// 本 route 只讀 data/track-record/（由 scripts/snapshot_focus.ts / grade_focus.ts 產生），
// 不做任何即時計算 —— 定格檔一旦寫入即不可變，公式版本記錄在檔內。

const TRACK_DIR = path.join(process.cwd(), "data", "track-record");
const FOCUS_DIR = path.join(TRACK_DIR, "focus");

const DISCLOSURE =
  "「前向戰績」是誠實統計工具：每日收盤後用凍結版本化公式把候選定格存檔，日後以次一交易日真實資料結算，" +
  "檔案不可回改。forward = 公式凍結後當日即時定格（乾淨樣本）；backfill = 以現行公式回溯重建歷史" +
  "（處置/權值名單為現況、月營收以公布時點近似對齊，僅供參考、與 forward 分開統計）。" +
  "結算價格來自部分盤後收錄之 1 分 K（覆蓋不全，缺口如實列出、不估價）。所有數字為毛數字，" +
  "未含手續費、證交稅與滑價。當沖區塊只驗證「次日振幅」（波動可預測性），與報酬無關。" +
  "本頁非投資建議、不構成買賣推薦、不投射或保證未來績效。";

interface SnapshotFile {
  date: string;
  capturedFor: string;
  source: "forward" | "backfill";
  generatedAt: string;
  overnightFormulaVersion: string;
  watchFormulaVersion: string;
  revenueFile: string | null;
  overnight: { code: string; name: string; group: string; score: number; close: number; streak: number }[];
  daytradeWatch: { code: string; name: string; watchScore: number; grade: "high" | "mid" | "low"; lots: number; streak: number }[];
  notes: string;
}

export async function GET() {
  const empty = {
    available: false,
    latest: null,
    snapshots: [],
    summary: null,
    disclosure: DISCLOSURE,
  };

  if (!fs.existsSync(FOCUS_DIR)) {
    return NextResponse.json(empty);
  }

  const files = fs
    .readdirSync(FOCUS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse(); // 最新在前

  if (files.length === 0) {
    return NextResponse.json(empty);
  }

  // 最新可讀的定格快照（完整內容）
  let latest: SnapshotFile | null = null;
  for (const f of files) {
    const snap = safeReadJSON<SnapshotFile>(path.join(FOCUS_DIR, f));
    if (snap) {
      latest = snap;
      break;
    }
  }

  // 快照索引（輕量 meta，最新在前，最多 60 筆）
  const snapshots: { date: string; source: string; overnightCount: number; watchCount: number }[] = [];
  for (const f of files.slice(0, 60)) {
    const snap = safeReadJSON<SnapshotFile>(path.join(FOCUS_DIR, f));
    if (!snap) continue;
    snapshots.push({
      date: snap.date,
      source: snap.source,
      overnightCount: snap.overnight?.length ?? 0,
      watchCount: snap.daytradeWatch?.length ?? 0,
    });
  }

  const summary = safeReadJSON<Record<string, unknown>>(path.join(TRACK_DIR, "summary.json"));

  return NextResponse.json(
    {
      available: latest != null,
      latest,
      snapshots,
      summary,
      disclosure: DISCLOSURE,
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } }
  );
}
