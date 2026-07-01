import { NextResponse } from "next/server";
import { intradayDates, listIntradayForDate, loadDailyFile } from "@/lib/data-files";
import { computeIntradayStats } from "@/lib/intraday";
import type { DailyData } from "@/lib/types";

// 當沖速覽：以「最近一個有完整分時收錄的交易日」為準，列出當日有分時資料的個股，
// 計算當沖視角指標（振幅、開盤強度、尾盤位置…），預設依振幅由大到小排序。
// 分時為盤後收錄之精選標的、非即時；資料日未必為最新交易日。
export async function GET() {
  const dates = intradayDates();
  if (dates.length === 0) {
    return NextResponse.json({ available: false, date: null, count: 0, rows: [] });
  }
  const date = dates[0];
  const list = listIntradayForDate(date).filter((x) => x.bars.length >= 10);

  // 名稱／族群／收盤漲跌來自該日 daily（best-effort）
  const daily = loadDailyFile<DailyData>(`${date}.json`);
  const meta = new Map<
    string,
    { name: string; industry: string; group: string; change_pct: number; volume: number; streak: number }
  >();
  if (daily) {
    for (const g of daily.groups) {
      for (const s of g.stocks) {
        if (!meta.has(s.code)) {
          meta.set(s.code, {
            name: s.name,
            industry: s.industry,
            group: g.name,
            change_pct: s.change_pct,
            volume: s.volume,
            streak: s.streak,
          });
        }
      }
    }
  }

  const rows = list
    .map(({ code, bars }) => {
      const st = computeIntradayStats(bars);
      const m = meta.get(code);
      return {
        code,
        name: m?.name ?? code,
        industry: m?.industry ?? "",
        group: m?.group ?? "",
        change_pct: m?.change_pct ?? null,
        volume: m?.volume ?? null,
        streak: m?.streak ?? 0,
        amplitudePct: st.amplitudePct,
        closeVsOpenPct: st.closeVsOpenPct,
        morningPct: st.morningPct,
        closePosition: st.closePosition,
        hod: st.hod,
        lod: st.lod,
      };
    })
    .sort((a, b) => b.amplitudePct - a.amplitudePct);

  return NextResponse.json(
    { available: true, date, count: rows.length, rows },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
  );
}
