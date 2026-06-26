import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "backtest_0903.json");

export async function GET() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }
}
