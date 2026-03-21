import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

export async function GET() {
  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json({ dates: [] });
  }

  const dates = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort()
    .reverse();

  return NextResponse.json({ dates });
}
