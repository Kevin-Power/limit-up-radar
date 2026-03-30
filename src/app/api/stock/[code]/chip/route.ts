// src/app/api/stock/[code]/chip/route.ts
import { NextRequest, NextResponse } from "next/server";

function lastNTradingDates(n: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  while (dates.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
      );
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

async function fetchInstitutional(stockNo: string, dateStr: string) {
  const url = `https://www.twse.com.tw/fund/TWT38U?response=json&date=${dateStr}&stockNo=${stockNo}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return null;
    // Find row for this stock
    for (const row of json.data) {
      if (String(row[0]).trim() !== stockNo) continue;
      const parseN = (s: string) => parseInt(String(s).replace(/,/g, "")) || 0;
      return {
        foreign: parseN(row[4]),  // 外資買超（張）
        trust: parseN(row[10]),   // 投信買超
        dealer: parseN(row[16]),  // 自營商買超
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
