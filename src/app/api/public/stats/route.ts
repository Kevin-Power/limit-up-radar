// Public-readable headline stats — no specific picks.
// Safe to expose: aggregate numbers only, no per-stock data.
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DAILY_DIR = path.join(process.cwd(), "data", "daily");
const BACKTEST_FILE = path.join(process.cwd(), "data", "backtest.json");
const REV_DIR = path.join(process.cwd(), "data", "revenue");

function readJSON(p: string) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

export async function GET() {
  const out: {
    date: string | null;
    taiex: number | null;
    taiexChg: number | null;
    limitUp: number | null;
    groupCount: number | null;
    backtest: {
      winRate: number;
      avgReturn: number;
      samples: number;
      days: number;
    } | null;
    revenueStocks: number | null;
    totalTradingDays: number;
  } = {
    date: null, taiex: null, taiexChg: null, limitUp: null, groupCount: null,
    backtest: null, revenueStocks: null, totalTradingDays: 0,
  };

  // Latest daily
  try {
    const files = fs.readdirSync(DAILY_DIR).filter((f) => f.endsWith(".json")).sort().reverse();
    out.totalTradingDays = files.length;
    if (files.length > 0) {
      const latest = readJSON(path.join(DAILY_DIR, files[0]));
      if (latest) {
        out.date = latest.date;
        out.taiex = latest.market_summary?.taiex_close ?? null;
        out.taiexChg = latest.market_summary?.taiex_change_pct ?? null;
        out.groupCount = latest.groups?.length ?? null;
        out.limitUp = latest.groups?.reduce(
          (s: number, g: { stocks?: unknown[] }) => s + (g.stocks?.length ?? 0),
          0
        ) ?? null;
      }
    }
  } catch { /* ignore */ }

  // Backtest
  const bt = readJSON(BACKTEST_FILE);
  if (bt) {
    out.backtest = {
      winRate: bt.avgOpenWinRate,
      avgReturn: bt.avgOpenReturn,
      samples: bt.totalSamples,
      days: bt.totalDays,
    };
  }

  // Revenue coverage
  try {
    const revFiles = fs.readdirSync(REV_DIR).filter((f) => f.endsWith(".json")).sort().reverse();
    if (revFiles.length > 0) {
      const rev = readJSON(path.join(REV_DIR, revFiles[0]));
      if (rev?.stocks) out.revenueStocks = rev.stocks.length;
    }
  } catch { /* ignore */ }

  return NextResponse.json(out, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
