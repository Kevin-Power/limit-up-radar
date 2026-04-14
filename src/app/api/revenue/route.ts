import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "revenue");

export async function GET() {
  try {
    const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).sort().reverse();
    if (files.length === 0) {
      return NextResponse.json({ error: "no data" }, { status: 404 });
    }
    const latest = fs.readFileSync(path.join(DATA_DIR, files[0]), "utf-8");
    return NextResponse.json(JSON.parse(latest), {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch {
    return NextResponse.json({ error: "failed to load revenue data" }, { status: 500 });
  }
}
