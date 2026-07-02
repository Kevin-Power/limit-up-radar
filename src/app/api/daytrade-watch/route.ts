import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { listDailyFiles, loadDailyFile, latestIntradayForCode } from "@/lib/data-files";
import { computeIntradayStats } from "@/lib/intraday";
import {
  computeWatchList,
  pickShortlist,
  SHORTLIST_RULE_VERSION,
  SHORTLIST_CRITERIA,
} from "@/lib/daytrade-watch";
import type { DailyData } from "@/lib/types";

// 明日當沖觀察清單：用今日收盤 daily 排「明日盤前值得盯的高波動/高流動候選」。
// 觀察度衡量流動性與市場關注度，**與勝率/報酬無任何已驗證關係**（無經驗證當沖 edge）。
// 評分邏輯集中在 src/lib/daytrade-watch.ts（與回溯驗證共用）；此處只裝飾歷史振幅徽章。

const SHORTLIST_DISCLOSURE =
  "「精選觀察」＝多重觀察條件同時匯聚（高觀察度＋趨勢族群＋主力買超或萬張以上大量），門檻規則固定、逐檔可對照原始 tags 驗證。它衡量的只是「明日流動性與市場關注度較集中、若要當沖值得優先盯盤」，不是勝率排序、不預測漲跌方向、不保證任何報酬——本平台回溯驗證迄今未發現觀察度對次日振幅有穩定鑑別力（見下方回溯驗證區塊），更沒有任何經驗證的當沖獲利 edge。當沖為極高風險操作，可能單日大幅虧損；開盤即鎖漲停可能根本無法成交。本區為統計整理與教育內容，非投資建議、不構成買賣推薦。";

const DISCLOSURE =
  "本清單是「觀察排序」，不是交易訊號。觀察度僅衡量明日可能的流動性與市場關注度（成交量、連板、族群趨勢、主力買賣超皆為今日收盤資料），與勝率或期望報酬無任何已驗證關係——本平台目前沒有任何經回測驗證的當沖 edge。當沖為極高風險操作：現股當沖資格以交易所與券商公告為準；處置股名單以今日收盤前資料推算，交易所盤後公告可能不同；若明日開盤即鎖漲跌停可能無法成交。歷史振幅徽章來自部分精選標的之盤後收錄 1 分 K（覆蓋不全、非即時），僅供型態參考。所有數字為毛數字，未計手續費、證交稅與滑價。本頁為統計與教育工具，非投資建議、不構成買賣推薦、不保證未來績效。";

function loadDisposalSet(): Set<string> {
  try {
    const p = path.join(process.cwd(), "data", "categories.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    return new Set<string>(raw?.disposal?.codes ?? []);
  } catch {
    return new Set<string>();
  }
}

export async function GET() {
  const files = listDailyFiles(); // newest-first
  const empty = {
    available: false, date: null, count: 0, rows: [], excluded: [], disclosure: DISCLOSURE,
    shortlist: [], shortlistRuleVersion: SHORTLIST_RULE_VERSION, shortlistCriteria: SHORTLIST_CRITERIA,
    shortlistDisclosure: SHORTLIST_DISCLOSURE,
  };
  if (!files.length) return NextResponse.json(empty);
  const today = loadDailyFile<DailyData>(files[0]);
  if (!today) return NextResponse.json(empty);

  const prev = files.slice(1, 3).map((f) => loadDailyFile<DailyData>(f)).filter(Boolean) as DailyData[];
  const last6 = files.slice(0, 6).map((f) => loadDailyFile<DailyData>(f)).filter(Boolean) as DailyData[];

  const { rows: scored, excluded } = computeWatchList(today, prev.map((d) => d.groups), last6, loadDisposalSet());

  // 裝飾歷史振幅徽章（最近收錄日，非平均；覆蓋不全）
  const histMap = new Map<string, { amplitudePct: number; date: string } | null>();
  const rows = scored.map((r) => {
    let histAmplitude: { amplitudePct: number; date: string } | null = null;
    const intr = latestIntradayForCode(r.code);
    if (intr && intr.bars.length >= 10) {
      const st = computeIntradayStats(intr.bars);
      histAmplitude = { amplitudePct: Math.round(st.amplitudePct * 100) / 100, date: intr.date };
    }
    histMap.set(r.code, histAmplitude);
    return { ...r, histAmplitude };
  });

  // 精選子集：對同一份 scored rows 做條件匯聚過濾（規則在 lib，非另一套評分）
  const shortlist = pickShortlist(scored).map((s) => ({
    ...s,
    histAmplitude: histMap.get(s.code) ?? null,
  }));

  return NextResponse.json(
    {
      available: true, date: today.date, basedOn: "today_close", count: rows.length, rows, excluded, disclosure: DISCLOSURE,
      shortlist, shortlistRuleVersion: SHORTLIST_RULE_VERSION, shortlistCriteria: SHORTLIST_CRITERIA,
      shortlistDisclosure: SHORTLIST_DISCLOSURE,
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } }
  );
}
