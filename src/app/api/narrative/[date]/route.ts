import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NARRATIVE_DIR = path.join(process.cwd(), "data", "narrative");

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ date: string }> }
) {
  const { date } = await ctx.params;

  // Basic validation: only YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid date format" }, { status: 400 });
  }

  const file = path.join(NARRATIVE_DIR, `${date}.json`);
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: "narrative not found" }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(file, "utf-8");
    return NextResponse.json(JSON.parse(raw), {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch (e) {
    console.error("narrative read failed:", e);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
}
