// src/app/api/ema/[code]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchRecentCandles } from "@/lib/twse-helpers";
import { calculateEMA, detectSignal, analyzeEma, EmaResult } from "@/lib/ema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  try {
    const candles = await fetchRecentCandles(code, 2);
    const closes = candles.map((c) => c.close);

    // Insufficient data — fallback to mock
    if (closes.length < 30) {
      const price = closes.length > 0 ? closes[closes.length - 1] : 100;
      const mock = analyzeEma(code, price);
      return NextResponse.json({ code, ...mock }, {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
      });
    }

    const ema11Series = calculateEMA(closes, 11);
    const ema24Series = calculateEMA(closes, 24);
    const { signal, crossoverDay } = detectSignal(ema11Series, ema24Series);

    const result: EmaResult & { code: string } = {
      code,
      ema11: ema11Series[ema11Series.length - 1],
      ema24: ema24Series[ema24Series.length - 1],
      signal,
      crossoverDay,
      ema11Series,
      ema24Series,
      prices: closes,
      isReal: true,
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch {
    const mock = analyzeEma(code, 100);
    return NextResponse.json({ code, ...mock });
  }
}
