// /api/supply-chain — list all available anchor stocks
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ANCHORS_PATH = path.join(process.cwd(), "data", "supply-chain", "anchors.json");

interface AnchorEntry {
  name: string;
  role: string;
  theme: string;
  _skip?: boolean;
}

export async function GET() {
  try {
    const raw = fs.readFileSync(ANCHORS_PATH, "utf-8");
    const data = JSON.parse(raw);
    const anchors: Record<string, AnchorEntry> = data.anchors ?? {};
    const list = Object.entries(anchors)
      .filter(([, v]) => !v._skip)
      .map(([code, v]) => ({
        code,
        name: v.name,
        role: v.role,
        theme: v.theme,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    // Group by theme for UI display
    const byTheme: Record<string, typeof list> = {};
    for (const a of list) {
      if (!byTheme[a.theme]) byTheme[a.theme] = [];
      byTheme[a.theme].push(a);
    }

    return NextResponse.json({
      total: list.length,
      anchors: list,
      byTheme,
      meta: data._meta,
    }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" },
    });
  } catch (e) {
    console.error("anchors load failed:", e);
    return NextResponse.json({ error: "loadFailed" }, { status: 500 });
  }
}
