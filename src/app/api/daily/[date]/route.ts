import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const jsonPath = path.join(DATA_DIR, `${date}.json`);

  if (!fs.existsSync(jsonPath)) {
    return NextResponse.json({ error: "No data for this date" }, { status: 404 });
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  return NextResponse.json(data);
}
