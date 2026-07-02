import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// 當沖候選日內回測結果（由 scripts/backtest_daytrade.ts 於本機產生並 commit）。
// 純讀檔；資料檔不存在時回 available:false。
export async function GET() {
  try {
    const p = path.join(process.cwd(), "data", "analysis", "daytrade_backtest.json");
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    return NextResponse.json(
      { available: true, ...data },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
    );
  } catch {
    return NextResponse.json({ available: false });
  }
}
