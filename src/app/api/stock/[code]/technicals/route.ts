// src/app/api/stock/[code]/technicals/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchRecentCandles } from "@/lib/twse-helpers";
import { calcMA, calcRSI, calcKD, calcMACD } from "@/lib/indicators";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  try {
    const candles = await fetchRecentCandles(code, 3); // 3 months for MA60
    if (candles.length < 10) {
      return NextResponse.json({ isReal: false });
    }

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const last = closes.length - 1;

    const ma5  = calcMA(closes, 5)[last];
    const ma10 = calcMA(closes, 10)[last];
    const ma20 = calcMA(closes, 20)[last];
    const ma60 = calcMA(closes, 60)[last];
    const rsiArr = calcRSI(closes);
    const rsi = rsiArr[last];
    const { k: kArr, d: dArr } = calcKD(highs, lows, closes);
    const kd_k = kArr[last];
    const kd_d = dArr[last];
    const { macd, signal: sigLine } = calcMACD(closes);
    const macdVal = macd[last];
    const sigVal = sigLine[last];
    const prevMacd = macd[last - 1];
    const prevSig = sigLine[last - 1];

    let macdSignal: "golden_cross" | "death_cross" | "neutral" = "neutral";
    if (!isNaN(prevMacd) && !isNaN(prevSig)) {
      if (prevMacd <= prevSig && macdVal > sigVal) macdSignal = "golden_cross";
      else if (prevMacd >= prevSig && macdVal < sigVal) macdSignal = "death_cross";
    }

    const price = closes[last];
    let overall: "bullish" | "neutral" | "bearish" = "neutral";
    if (!isNaN(ma20) && !isNaN(rsi)) {
      if (price > ma20 && rsi > 50) overall = "bullish";
      else if (price < ma20 && rsi < 50) overall = "bearish";
    }

    return NextResponse.json(
      { ma5, ma10, ma20, ma60, rsi, macdSignal, kd_k, kd_d, overall, isReal: true },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } }
    );
  } catch {
    return NextResponse.json({ isReal: false });
  }
}
