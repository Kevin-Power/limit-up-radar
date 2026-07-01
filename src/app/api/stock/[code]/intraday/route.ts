import { NextRequest, NextResponse } from "next/server";
import { latestIntradayForCode } from "@/lib/data-files";
import { computeIntradayStats } from "@/lib/intraday";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  if (!/^\d{4,6}[A-Z]?$/.test(code)) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }

  const res = latestIntradayForCode(code);
  const headers = {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
  };

  if (!res) {
    // 該股不在分時收錄池，或無有效資料。
    return NextResponse.json({ available: false }, { headers });
  }

  // 過稀的資料（不足 10 根）不算指標，僅回傳原始資料供畫圖。
  const stats = res.bars.length >= 10 ? computeIntradayStats(res.bars) : null;

  return NextResponse.json(
    {
      available: true,
      date: res.date,
      bars: res.bars,
      barCount: res.bars.length,
      sparse: res.bars.length < 60,
      stats,
    },
    { headers }
  );
}
