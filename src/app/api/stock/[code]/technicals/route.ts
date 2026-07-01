// src/app/api/stock/[code]/technicals/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchRecentCandles } from "@/lib/twse-helpers";
import { calcMA, calcRSI, calcKD, calcMACD } from "@/lib/indicators";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  if (!/^\d{4,6}[A-Z]?$/.test(code)) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }

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

    // ── 波段訊號（swing）──
    // 均線排列：多頭 ma5>ma10>ma20>ma60、空頭反之、其餘糾結
    let maAlignment: "bull" | "bear" | "mixed" = "mixed";
    if (![ma5, ma10, ma20, ma60].some((v) => isNaN(v))) {
      if (ma5 > ma10 && ma10 > ma20 && ma20 > ma60) maAlignment = "bull";
      else if (ma5 < ma10 && ma10 < ma20 && ma20 < ma60) maAlignment = "bear";
    }
    const aboveMA60 = !isNaN(ma60) && price > ma60; // 站上季線
    const high20 = highs.length >= 20 ? Math.max(...highs.slice(-20)) : NaN;
    const nearHigh20 = !isNaN(high20) && price >= high20 * 0.99; // 近/創 20 日新高（1% 內）
    const pctFromHigh20 = !isNaN(high20) && high20 ? Math.round((price / high20 - 1) * 10000) / 100 : null;

    const n2n = (v: number) => (isNaN(v) ? null : Math.round(v * 100) / 100);
    return NextResponse.json(
      { ma5: n2n(ma5), ma10: n2n(ma10), ma20: n2n(ma20), ma60: n2n(ma60),
        rsi: n2n(rsi), macdSignal, kd_k: n2n(kd_k), kd_d: n2n(kd_d), overall,
        maAlignment, aboveMA60, nearHigh20, pctFromHigh20, high20: n2n(high20), isReal: true },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } }
    );
  } catch {
    return NextResponse.json({ isReal: false });
  }
}
