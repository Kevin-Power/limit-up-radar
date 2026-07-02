import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { listDailyFiles, loadDailyFile, latestIntradayForCode } from "@/lib/data-files";
import { computeIntradayStats } from "@/lib/intraday";
import { calculateTrendingGroups } from "@/lib/scoring";
import type { DailyData } from "@/lib/types";

// 明日當沖觀察清單：用今日收盤 daily 排「明日盤前值得盯的高波動/高流動候選」。
// 誠實命名為「觀察度」——衡量流動性與市場關注度，**與勝率/報酬無任何已驗證關係**。
// 當沖目前無經驗證回測 edge，全清單為觀察工具。歷史振幅僅徽章、不進分數（避免覆蓋偏差）。

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
  if (!files.length) {
    return NextResponse.json({ available: false, date: null, count: 0, rows: [], excluded: [], disclosure: DISCLOSURE });
  }
  const today = loadDailyFile<DailyData>(files[0]);
  if (!today) {
    return NextResponse.json({ available: false, date: null, count: 0, rows: [], excluded: [], disclosure: DISCLOSURE });
  }
  const prev = files.slice(1, 3).map((f) => loadDailyFile<DailyData>(f)).filter(Boolean) as DailyData[];
  const { trending } = calculateTrendingGroups(today.groups, prev.map((d) => d.groups));

  // 處置判定：近 6 日 ≥3 次漲停，或 categories.json disposal set
  const last6 = files.slice(0, 6).map((f) => loadDailyFile<DailyData>(f)).filter(Boolean) as DailyData[];
  const limitUpDayCount = new Map<string, number>();
  for (const d of last6) {
    const seen = new Set<string>();
    for (const g of d.groups) for (const s of g.stocks) seen.add(s.code);
    for (const c of seen) limitUpDayCount.set(c, (limitUpDayCount.get(c) ?? 0) + 1);
  }
  const knownDisposal = loadDisposalSet();

  interface WatchRow {
    code: string; name: string; market: string | null; group: string; groupColor: string;
    close: number; changePct: number; volume: number; lots: number; streak: number; majorNet: number;
    watchScore: number; grade: "high" | "mid" | "low"; tags: string[];
    histAmplitude: { amplitudePct: number; date: string } | null;
  }
  const rows: WatchRow[] = [];
  const excluded: { code: string; name: string; reason: "disposal" | "low_liquidity" }[] = [];

  for (const g of today.groups) {
    const groupFocus = g.stocks.length >= 5; // 今日同族群漲停 ≥5 檔
    for (const s of g.stocks) {
      const lots = s.volume / 1000;
      const isDisposal = (limitUpDayCount.get(s.code) ?? 0) >= 3 || knownDisposal.has(s.code);
      if (isDisposal) { excluded.push({ code: s.code, name: s.name, reason: "disposal" }); continue; }
      if (lots < 2000) { excluded.push({ code: s.code, name: s.name, reason: "low_liquidity" }); continue; }

      let score = 0;
      const tags: string[] = [];
      // 流動性（主軸）
      if (lots >= 20000) { score += 30; tags.push("巨量人氣"); }
      else if (lots >= 10000) { score += 25; tags.push("大量"); }
      else if (lots >= 5000) { score += 18; }
      else { score += 8; } // 2000–4999
      // 族群趨勢 / 聚焦
      if (trending.has(g.name)) { score += 15; tags.push("趨勢族群"); }
      if (groupFocus) { score += 10; tags.push("族群聚焦"); }
      // 連板人氣
      if (s.streak >= 2 && s.streak <= 4) { score += 10; tags.push(`${s.streak}連板人氣`); }
      else if (s.streak >= 5) { tags.push("⚠️高位連板·處置臨界"); }
      // 主力動向（當沖無方向主張：買超加分、賣超僅警示不扣分）
      if (s.major_net >= 1_000_000) { score += 10; tags.push("主力買超"); }
      else if (s.major_net <= -500_000) { tags.push("⚠️主力賣超"); }
      // 價位帶（tick/spread 友善）
      if (s.close >= 15 && s.close <= 500) { score += 5; }
      else if (s.close < 10) { tags.push("低價股·檔位跳動%大"); }

      const grade: "high" | "mid" | "low" = score >= 60 ? "high" : score >= 40 ? "mid" : "low";

      // 歷史振幅徽章（最近收錄日，非平均；覆蓋不全）
      let histAmplitude: { amplitudePct: number; date: string } | null = null;
      const intr = latestIntradayForCode(s.code);
      if (intr && intr.bars.length >= 10) {
        const st = computeIntradayStats(intr.bars);
        histAmplitude = { amplitudePct: Math.round(st.amplitudePct * 100) / 100, date: intr.date };
      }

      rows.push({
        code: s.code, name: s.name, market: s.market ?? null, group: g.name, groupColor: g.color,
        close: s.close, changePct: s.change_pct, volume: s.volume, lots: Math.round(lots),
        streak: s.streak, majorNet: s.major_net, watchScore: score, grade, tags, histAmplitude,
      });
    }
  }
  rows.sort((a, b) => b.watchScore - a.watchScore || b.volume - a.volume);

  return NextResponse.json(
    { available: true, date: today.date, basedOn: "today_close", count: rows.length, rows, excluded, disclosure: DISCLOSURE },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } }
  );
}
