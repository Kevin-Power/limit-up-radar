import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

export async function GET() {
  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json({ error: "dataUnavailable" }, { status: 503 });
  }

  try {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length === 0) {
      return NextResponse.json({ error: "dataUnavailable" }, { status: 503 });
    }

    const raw = fs.readFileSync(path.join(DATA_DIR, files[0]), "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch (e) {
    console.error("daily/latest read failed:", e);
    return NextResponse.json({ error: "dataUnavailable" }, { status: 503 });
  }
}
