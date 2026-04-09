// src/app/api/stock/[code]/chip/route.ts
import { NextRequest, NextResponse } from "next/server";

function lastNTradingDates(n: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  // Walk back up to 14 calendar days to find n trading days
  for (let i = 0; i < 14 && dates.length < n; i++) {
    const check = new Date(d);
    check.setDate(d.getDate() - i);
    const dow = check.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(
        `${check.getFullYear()}${String(check.getMonth() + 1).padStart(2, "0")}${String(check.getDate()).padStart(2, "0")}`
      );
    }
  }
  return dates;
}

// T86: 三大法人買賣超彙總表 — all three institutional investors in one call
// Fields: [code, name, fgnBuy, fgnSell, fgnNet, fgnDealerBuy, fgnDealerSell, fgnDealerNet,
//          trustBuy, trustSell, trustNet, dealerNet, dealerSelfBuy, dealerSelfSell, dealerSelfNet,
//          dealerHedgeBuy, dealerHedgeSell, dealerHedgeNet, totalNet]
async function fetchInstitutional(stockNo: string, dateStr: string) {
  const url = `https://www.twse.com.tw/fund/T86?response=json&date=${dateStr}&selectType=ALL`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return null;
    for (const row of json.data) {
      if (String(row[0]).trim() !== stockNo) continue;
      const parseN = (s: string) => parseInt(String(s).replace(/,/g, "")) || 0;
      return {
        foreign: parseN(row[4]),   // 外陸資買賣超股數(不含外資自營商)
        trust: parseN(row[10]),    // 投信買賣超股數
        dealer: parseN(row[11]),   // 自營商買賣超股數(合計)
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const dates = lastNTradingDates(3);

  const results = await Promise.allSettled(dates.map((d) => fetchInstitutional(code, d)));
  const valid = results
    .map((r, i) => ({ date: dates[i], data: r.status === "fulfilled" ? r.value : null }))
    .filter((x) => x.data !== null);

  if (valid.length === 0) {
    return NextResponse.json({ foreign3d: [], trust3d: [], dealer3d: [], isReal: false });
  }

  return NextResponse.json({
    foreign3d: valid.map((x) => x.data!.foreign),
    trust3d: valid.map((x) => x.data!.trust),
    dealer3d: valid.map((x) => x.data!.dealer),
    isReal: true,
  }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
