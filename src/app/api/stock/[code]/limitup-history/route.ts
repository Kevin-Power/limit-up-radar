// src/app/api/stock/[code]/limitup-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

interface LimitUpEntry {
  date: string;
  group: string;
  nextDayOpenPct: number | null;
  nextDayClosePct: number | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json([]);
  }

  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse(); // newest first

  const entries: LimitUpEntry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileMap: Record<string, Record<string, number>> = {}; // date → { code: changePct }

  // Build a map of all dates and their stock change_pct for next-day lookup
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
      const data = JSON.parse(raw);
      const date: string = data.date;
      if (!fileMap[date]) {
        fileMap[date] = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const g of (data.groups ?? [])) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const s of (g.stocks ?? [])) {
            fileMap[date][s.code] = s.change_pct ?? 0;
          }
        }
      }
    } catch { /* skip corrupt files */ }
  }

  const sortedDates = Object.keys(fileMap).sort().reverse();

  for (let i = 0; i < sortedDates.length && entries.length < 10; i++) {
    const date = sortedDates[i];
    const nextDate = sortedDates[i - 1]; // previous in reverse = next trading day

    try {
      const file = files.find((f) => f.includes(date));
      if (!file) continue;
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
      const data = JSON.parse(raw);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const g of (data.groups ?? [])) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of (g.stocks ?? [])) {
          if (s.code === code) {
            entries.push({
              date,
              group: g.name ?? "",
              nextDayOpenPct: nextDate && fileMap[nextDate]?.[code] !== undefined
                ? fileMap[nextDate][code] : null,
              nextDayClosePct: nextDate && fileMap[nextDate]?.[code] !== undefined
                ? fileMap[nextDate][code] : null,
            });
          }
        }
      }
    } catch { /* skip */ }
  }

  return NextResponse.json(entries);
}
