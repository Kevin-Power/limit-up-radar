import { NextRequest, NextResponse } from "next/server";
import { CandleData, fetchTWSEMonth, fetchTPExMonth, lastNMonths } from "@/lib/twse-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const months = lastNMonths(4); // fetch 4 months to ensure ~60 trading days

  // Try TWSE first (fetch all months in parallel)
  let twseResults = await Promise.all(months.map((m) => fetchTWSEMonth(code, m)));
  let candles: CandleData[] = twseResults.flat();

  // If TWSE returned no data, try TPEx
  if (candles.length === 0) {
    const tpexResults = await Promise.all(months.map((m) => fetchTPExMonth(code, m)));
    candles = tpexResults.flat();
  }

  // Sort ascending by date and deduplicate
  candles.sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set<string>();
  candles = candles.filter((c) => {
    if (seen.has(c.date)) return false;
    seen.add(c.date);
    return true;
  });

  // Return last 60 trading days
  const result = candles.slice(-60);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
