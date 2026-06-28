import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { DAILY_DIR, listDailyFiles } from "@/lib/data-files";

export async function GET() {
  if (!fs.existsSync(DAILY_DIR)) {
    return NextResponse.json({ error: "dataUnavailable" }, { status: 503 });
  }

  try {
    const files = listDailyFiles();

    if (files.length === 0) {
      return NextResponse.json({ error: "dataUnavailable" }, { status: 503 });
    }

    const raw = fs.readFileSync(path.join(DAILY_DIR, files[0]), "utf-8");
    return NextResponse.json(JSON.parse(raw), {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
      },
    });
  } catch (e) {
    console.error("daily/latest read failed:", e);
    return NextResponse.json({ error: "dataUnavailable" }, { status: 503 });
  }
}
