import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NARRATIVE_DIR = path.join(process.cwd(), "data", "narrative");
const DAILY_DIR = path.join(process.cwd(), "data", "daily");

function latestDateInDir(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return files[0].replace(/\.json$/, "");
}

export async function GET() {
  const narrativeDate = latestDateInDir(NARRATIVE_DIR);
  if (!narrativeDate) {
    return NextResponse.json({ error: "no narrative available" }, { status: 404 });
  }

  const file = path.join(NARRATIVE_DIR, `${narrativeDate}.json`);
  let narrative: Record<string, unknown>;
  try {
    narrative = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    console.error("narrative/latest read failed:", e);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }

  const latestDaily = latestDateInDir(DAILY_DIR);
  const sourceDailyDate = String(narrative.source_daily_date ?? narrative.date ?? "");
  const stale = latestDaily !== null && sourceDailyDate !== "" && sourceDailyDate < latestDaily;

  return NextResponse.json(
    {
      ...narrative,
      stale,
      latest_daily_date: latestDaily,
    },
    {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    }
  );
}
