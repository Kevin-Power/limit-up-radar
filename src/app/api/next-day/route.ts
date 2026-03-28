import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

interface StockEntry {
  code: string;
  name: string;
  industry: string;
  close: number;
  change_pct: number;
  volume: number;
  major_net: number;
  streak: number;
  market?: string;
}

interface GroupEntry {
  name: string;
  color: string;
  stocks: StockEntry[];
}

interface DailyFile {
  date: string;
  market_summary: { taiex_close: number; limit_up_count: number };
  groups: GroupEntry[];
}

export interface NextDayStock {
  code: string;
  name: string;
  group: string;
  groupColor: string;
  limitPrice: number;
  volumeRatio: number;
  streak: number;
  nextOpen: number | null;
  nextOpenPct: number | null;
  nextClose: number | null;
  nextClosePct: number | null;
  label: string;
}

export interface NextDayData {
  limitDate: string;
  nextDate: string;
  totalLimitUp: number;
  stocks: NextDayStock[];
  openWinRate: number;
  closeWinRate: number;
  avgOpenPct: number;
  avgClosePct: number;
}

// Fetch one month of TWSE data for a stock and return a date->price map
async function fetchTWSEPrices(
  stockNo: string,
  yyyymm: string
): Promise<Map<string, { open: number; close: number; volume: number }>> {
  const map = new Map<string, { open: number; close: number; volume: number }>();
  try {
    const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${yyyymm}01&stockNo=${stockNo}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 7200 },
    });
    if (!res.ok) return map;
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return map;
    for (const row of json.data) {
      if (row.length < 7) continue;
      const [rocY, mm, dd] = row[0].split("/");
      const year = parseInt(rocY) + 1911;
      const dateStr = `${year}-${mm}-${dd}`;
      const open = parseFloat(row[3].replace(/,/g, ""));
      const close = parseFloat(row[6].replace(/,/g, ""));
      const vol = Math.round(parseFloat(row[1].replace(/,/g, "")) / 1000);
      if (open && close) map.set(dateStr, { open, close, volume: vol });
    }
  } catch { /* ignore */ }
  return map;
}

async function fetchTPExPrices(
  stockNo: string,
  yyyymm: string
): Promise<Map<string, { open: number; close: number; volume: number }>> {
  const map = new Map<string, { open: number; close: number; volume: number }>();
  try {
    const year = parseInt(yyyymm.slice(0, 4));
    const month = yyyymm.slice(4, 6);
    const rocYear = year - 1911;
    const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${rocYear}/${month}&stkno=${stockNo}&_=0`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.tpex.org.tw/" },
      next: { revalidate: 7200 },
    });
    if (!res.ok) return map;
    const json = await res.json();
    if (!Array.isArray(json.aaData)) return map;
    for (const row of json.aaData) {
      if (row.length < 7) continue;
      const [mm, dd] = row[0].split("/");
      const dateStr = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      const open = parseFloat(row[3].replace(/,/g, ""));
      const close = parseFloat(row[6].replace(/,/g, ""));
      const vol = Math.round(parseFloat(row[1].replace(/,/g, "")) / 1000);
      if (open && close) map.set(dateStr, { open, close, volume: vol });
    }
  } catch { /* ignore */ }
  return map;
}

function classifyLabel(openPct: number | null, closePct: number | null): string {
  if (openPct === null) return "無資料";
  if (openPct >= 9.5) return "續漲停";
  if (closePct !== null && closePct >= 5) return "強漲";
  if (openPct >= 2) return "強勢漲";
  if (openPct >= 0) return "銘碼漲";
  if (openPct >= -3) return "開高走低";
  return "直接跌";
}

export async function GET() {
  const dataDir = path.join(process.cwd(), "data", "daily");
  let files: string[] = [];
  try {
    files = (await fs.readdir(dataDir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return NextResponse.json([], { status: 200 });
  }

  const dailyFiles: DailyFile[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(dataDir, file), "utf8");
      dailyFiles.push(JSON.parse(raw));
    } catch { /* skip */ }
  }

  if (dailyFiles.length < 2) {
    return NextResponse.json([], { status: 200 });
  }

  // Get the month string (YYYYMM) from the dates
  const allMonths = new Set(dailyFiles.map((d) => d.date.slice(0, 7).replace("-", "")));

  // Collect all unique stock codes
  const allCodes = new Set<string>();
  for (const day of dailyFiles) {
    for (const g of day.groups) {
      for (const s of g.stocks) allCodes.add(s.code);
    }
  }

  // Fetch price maps for all stocks (parallel, cached)
  // Limit to one month at a time based on first available month
  const monthStr = Array.from(allMonths)[0] ?? dailyFiles[0].date.slice(0, 4) + dailyFiles[0].date.slice(5, 7);

  // Batch fetch: try TWSE first (cached heavily)
  const priceMaps = new Map<string, Map<string, { open: number; close: number; volume: number }>>();
  await Promise.all(
    Array.from(allCodes).map(async (code) => {
      let map = await fetchTWSEPrices(code, monthStr);
      if (map.size === 0) map = await fetchTPExPrices(code, monthStr);
      priceMaps.set(code, map);
    })
  );

  // Also fetch next month if dates span across months
  const months = Array.from(allMonths);
  if (months.length > 1) {
    await Promise.all(
      Array.from(allCodes).map(async (code) => {
        for (const m of months.slice(1)) {
          let extra = await fetchTWSEPrices(code, m);
          if (extra.size === 0) extra = await fetchTPExPrices(code, m);
          const existing = priceMaps.get(code) ?? new Map();
          for (const [date, val] of extra.entries()) existing.set(date, val);
          priceMaps.set(code, existing);
        }
      })
    );
  }

  const results: NextDayData[] = [];

  // For each consecutive pair
  for (let i = 0; i < dailyFiles.length - 1; i++) {
    const dayN = dailyFiles[i];
    const dayN1 = dailyFiles[i + 1];

    const stocks: NextDayStock[] = [];

    for (const g of dayN.groups) {
      for (const s of g.stocks) {
        const priceMap = priceMaps.get(s.code);
        const nextDayData = priceMap?.get(dayN1.date);

        const nextOpen = nextDayData?.open ?? null;
        const nextClose = nextDayData?.close ?? null;
        const nextOpenPct = nextOpen !== null ? ((nextOpen - s.close) / s.close) * 100 : null;
        const nextClosePct = nextClose !== null ? ((nextClose - s.close) / s.close) * 100 : null;

        stocks.push({
          code: s.code,
          name: s.name,
          group: g.name,
          groupColor: g.color,
          limitPrice: s.close,
          volumeRatio: s.volume > 0 ? +(s.volume / 10000).toFixed(1) : 0,
          streak: s.streak,
          nextOpen,
          nextOpenPct: nextOpenPct !== null ? +nextOpenPct.toFixed(2) : null,
          nextClose,
          nextClosePct: nextClosePct !== null ? +nextClosePct.toFixed(2) : null,
          label: classifyLabel(nextOpenPct, nextClosePct),
        });
      }
    }

    const withData = stocks.filter((s) => s.nextOpenPct !== null);
    const openWinRate = withData.length > 0
      ? Math.round((withData.filter((s) => (s.nextOpenPct ?? 0) > 0).length / withData.length) * 100)
      : 0;
    const closeWinRate = withData.length > 0
      ? Math.round((withData.filter((s) => (s.nextClosePct ?? 0) > 0).length / withData.length) * 100)
      : 0;
    const avgOpenPct = withData.length > 0
      ? +(withData.reduce((sum, s) => sum + (s.nextOpenPct ?? 0), 0) / withData.length).toFixed(2)
      : 0;
    const avgClosePct = withData.length > 0
      ? +(withData.reduce((sum, s) => sum + (s.nextClosePct ?? 0), 0) / withData.length).toFixed(2)
      : 0;

    results.push({
      limitDate: dayN.date,
      nextDate: dayN1.date,
      totalLimitUp: dayN.market_summary.limit_up_count,
      stocks,
      openWinRate,
      closeWinRate,
      avgOpenPct,
      avgClosePct,
    });
  }

  return NextResponse.json(results, {
    headers: {
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
