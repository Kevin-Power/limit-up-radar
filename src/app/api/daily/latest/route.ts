import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

export async function GET() {
  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json({ error: "No data directory" }, { status: 404 });
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    return NextResponse.json({ error: "No data available" }, { status: 404 });
  }

  const latestFile = files[0];
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, latestFile), "utf-8"));
  return NextResponse.json(data);
}
