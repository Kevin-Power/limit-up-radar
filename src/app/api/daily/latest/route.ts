import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

const DEMO_DATA = {
  date: "2026-03-20",
  market_summary: {
    taiex_close: 33689,
    taiex_change_pct: 0.45,
    total_volume: 452100000000,
    limit_up_count: 54,
    limit_down_count: 2,
    advance: 892,
    decline: 421,
    unchanged: 187,
    foreign_net: 12800000000,
    trust_net: 3400000000,
    dealer_net: 1300000000,
  },
  groups: [
    {
      name: "鋼鐵 / 鋼價調漲",
      color: "#ef4444",
      badges: ["HOT"],
      reason: "鋼價調漲帶動鋼鐵族群全面攻頂",
      stocks: [
        { code: "2007", name: "燁興", industry: "鋼鐵", close: 8.63, change_pct: 9.94, volume: 29180000, major_net: 15000000, streak: 1 },
        { code: "2014", name: "中鴻", industry: "鋼鐵", close: 19.6, change_pct: 9.80, volume: 248310000, major_net: 82000000, streak: 2 },
      ],
    },
    {
      name: "AI伺服器 / 散熱",
      color: "#ef4444",
      badges: ["HOT", "FOCUS"],
      reason: "AI伺服器散熱與機殼供應鏈訂單持續爆發",
      stocks: [
        { code: "3017", name: "奇鋐", industry: "散熱模組", close: 329, change_pct: 10.0, volume: 86310000, major_net: 320000000, streak: 3 },
        { code: "3324", name: "雙鴻", industry: "散熱模組", close: 1065, change_pct: 10.0, volume: 32400000, major_net: 480000000, streak: 3 },
      ],
    },
  ],
};

export async function GET() {
  // Try to find the most recent JSON file in data/daily/
  if (fs.existsSync(DATA_DIR)) {
    try {
      const files = fs
        .readdirSync(DATA_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .reverse();

      if (files.length > 0) {
        const latestFile = files[0];
        const raw = fs.readFileSync(path.join(DATA_DIR, latestFile), "utf-8");
        const data = JSON.parse(raw);
        return NextResponse.json(data);
      }
    } catch {
      // Fall through to demo data
    }
  }

  // Fallback to demo data
  return NextResponse.json(DEMO_DATA);
}
