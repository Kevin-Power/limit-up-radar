// src/app/api/pe/route.ts
import { NextResponse } from "next/server";

interface PeData { pe: number; pb: number; dividendYield: number }

async function fetchPeForDate(dateStr: string): Promise<Record<string, PeData> | null> {
  const url = `https://www.twse.com.tw/exchangeReport/BWIBBU_d?response=json&date=${dateStr}&selectType=ALL`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 7200 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return null;
    const map: Record<string, PeData> = {};
    for (const row of json.data) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const code = String(row[0]).trim();
      if (!/^\d{4}$/.test(code)) continue;
      const dividendYield = parseFloat(String(row[2]).replace(/,/g, "")) || 0;
      const pe = parseFloat(String(row[4]).replace(/,/g, "")) || 0;
      const pb = parseFloat(String(row[5]).replace(/,/g, "")) || 0;
      map[code] = { pe, pb, dividendYield };
    }
    return Object.keys(map).length > 0 ? map : null;
  } catch {
    return null;
  }
}

export async function GET() {
  // Try today, then walk back up to 5 trading days
  const base = new Date();
  for (let i = 0; i < 10; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const data = await fetchPeForDate(dateStr);
    if (data) {
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=7200, stale-while-revalidate=14400" },
      });
    }
  }
  return NextResponse.json({});
}
