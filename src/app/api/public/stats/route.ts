// Public-readable headline stats — no specific picks.
// Safe to expose: aggregate numbers only, no per-stock data.
import { NextResponse } from "next/server";
import path from "path";
import {
  REVENUE_DIR,
  listDailyFiles,
  listJsonFiles,
  loadDailyFile,
  safeReadJSON,
} from "@/lib/data-files";

const BACKTEST_FILE = path.join(process.cwd(), "data", "backtest.json");

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
    const files = listDailyFiles();
    out.totalTradingDays = files.length;
    if (files.length > 0) {
      const latest = loadDailyFile<{
        date: string;
        market_summary?: { taiex_close?: number; taiex_change_pct?: number };
        groups?: { stocks?: unknown[] }[];
      }>(files[0]);
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
  const bt = safeReadJSON<Record<string, number>>(BACKTEST_FILE);
  if (bt) {
    out.backtest = {
      winRate: bt.avgOpenWinRate ?? null,
      avgReturn: bt.avgOpenReturn ?? null,
      samples: bt.totalSamples ?? null,
      days: bt.totalDays ?? null,
    };
  }

  // Revenue coverage
  try {
    const revFiles = listJsonFiles(REVENUE_DIR);
    if (revFiles.length > 0) {
      const rev = safeReadJSON<{ stocks?: unknown[] }>(path.join(REVENUE_DIR, revFiles[0]));
      if (rev?.stocks) out.revenueStocks = rev.stocks.length;
    }
  } catch { /* ignore */ }

  return NextResponse.json(out, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
