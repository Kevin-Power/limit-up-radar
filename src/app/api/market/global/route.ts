import { NextResponse } from "next/server";

export interface GlobalIndex {
  id: string;
  symbol: string;
  name: string;
  nameCn: string;
  region: "americas" | "asia" | "europe";
  price: number;
  change: number;
  changePct: number;
  sparkline: number[]; // last 20 closes
  currency: string;
}

const INDEX_META: {
  symbol: string;
  name: string;
  nameCn: string;
  region: "americas" | "asia" | "europe";
}[] = [
  { symbol: "^GSPC",  name: "S&P 500",    nameCn: "標普 500",   region: "americas" },
  { symbol: "^IXIC",  name: "NASDAQ",     nameCn: "那斯達克",   region: "americas" },
  { symbol: "^DJI",   name: "Dow Jones",  nameCn: "道瓊工業",   region: "americas" },
  { symbol: "^VIX",   name: "VIX",        nameCn: "恐慌指數",   region: "americas" },
  { symbol: "^N225",  name: "Nikkei 225", nameCn: "日經 225",   region: "asia" },
  { symbol: "^HSI",   name: "Hang Seng",  nameCn: "恒生指數",   region: "asia" },
  { symbol: "^KS11",  name: "KOSPI",      nameCn: "韓國綜指",   region: "asia" },
  { symbol: "^TWII",  name: "TAIEX",      nameCn: "加權指數",   region: "asia" },
  { symbol: "^FTSE",  name: "FTSE 100",   nameCn: "英國 FTSE",  region: "europe" },
  { symbol: "^GDAXI", name: "DAX",        nameCn: "德國 DAX",   region: "europe" },
  { symbol: "^FCHI",  name: "CAC 40",     nameCn: "法國 CAC",   region: "europe" },
  { symbol: "GC=F",   name: "Gold",       nameCn: "黃金期貨",   region: "americas" },
  { symbol: "CL=F",   name: "Crude Oil",  nameCn: "原油期貨",   region: "americas" },
];

async function fetchIndex(meta: (typeof INDEX_META)[0]): Promise<GlobalIndex | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.symbol)}?interval=1d&range=30d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 900 }, // 15 min cache
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta2 = result.meta;
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    // filter nulls and take last 20
    const sparkline = closes.filter((v: number | null) => v != null).slice(-20) as number[];

    const price = meta2.regularMarketPrice ?? meta2.previousClose ?? 0;
    const prev = meta2.chartPreviousClose ?? meta2.previousClose ?? price;
    const change = price - prev;
    const changePct = prev ? (change / prev) * 100 : 0;

    return {
      id: meta.symbol,
      symbol: meta.symbol,
      name: meta.name,
      nameCn: meta.nameCn,
      region: meta.region,
      price,
      change,
      changePct,
      sparkline,
      currency: meta2.currency ?? "USD",
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const results = await Promise.all(INDEX_META.map(fetchIndex));
  const data = results.filter(Boolean) as GlobalIndex[];

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
    },
  });
}
