// src/app/api/ema/batch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchRecentCandles } from "@/lib/twse-helpers";
import { calculateEMA, detectSignal, EmaResult } from "@/lib/ema";

async function computeEmaForCode(code: string): Promise<EmaResult | null> {
  try {
    const candles = await fetchRecentCandles(code, 2);
    const closes = candles.map((c) => c.close);
    if (closes.length < 30) {
      return null;
    }
    const ema11Series = calculateEMA(closes, 11);
    const ema24Series = calculateEMA(closes, 24);
    const { signal, crossoverDay } = detectSignal(ema11Series, ema24Series);
    return {
      ema11: ema11Series[ema11Series.length - 1],
      ema24: ema24Series[ema24Series.length - 1],
      signal, crossoverDay, ema11Series, ema24Series,
      prices: closes, isReal: true,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const codesParam = req.nextUrl.searchParams.get("codes") ?? "";
  const codes = codesParam.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 100);

  if (codes.length === 0) {
    return NextResponse.json({});
  }

  // Process in chunks of 8 to avoid TWSE rate limits
  const CHUNK = 8;
  const result: Record<string, EmaResult> = {};
  for (let i = 0; i < codes.length; i += CHUNK) {
    const chunk = codes.slice(i, i + CHUNK);
    const settled = await Promise.allSettled(chunk.map(computeEmaForCode));
    settled.forEach((r, idx) => {
      const ema = r.status === "fulfilled" ? r.value : null;
      if (ema) {
        result[chunk[idx]] = ema;
      }
      // Skip stocks with insufficient data (null results)
    });
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
