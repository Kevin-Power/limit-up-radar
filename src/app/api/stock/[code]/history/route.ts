import { NextRequest, NextResponse } from "next/server";

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ROC year ↔ western year
function toROCYear(westernYear: number): number {
  return westernYear - 1911;
}

// Parse TWSE date string "115/03/28" → "2026-03-28"
function parseTWSEDate(s: string): string {
  const [roc, mm, dd] = s.split("/");
  const year = parseInt(roc) + 1911;
  return `${year}-${mm}-${dd}`;
}

// Remove commas from numeric strings e.g. "1,234,567" → 1234567
function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

// Fetch one month of TWSE data; returns [] on failure
async function fetchTWSEMonth(stockNo: string, yyyymm: string): Promise<CandleData[]> {
  const date = `${yyyymm}01`;
  const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date}&stockNo=${stockNo}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return [];

    return json.data
      .map((row: string[]) => {
        // fields: 日期, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌價差, 成交筆數
        if (row.length < 7) return null;
        const dateStr = parseTWSEDate(row[0]);
        const open = parseNum(row[3]);
        const high = parseNum(row[4]);
        const low = parseNum(row[5]);
        const close = parseNum(row[6]);
        const volume = Math.round(parseNum(row[1]) / 1000); // convert shares → lots (張)
        if (!open || !close) return null;
        return { date: dateStr, open, high, low, close, volume } as CandleData;
      })
      .filter(Boolean) as CandleData[];
  } catch {
    return [];
  }
}

// Fetch one month of TPEx data; returns [] on failure
async function fetchTPExMonth(stockNo: string, yyyymm: string): Promise<CandleData[]> {
  const year = parseInt(yyyymm.slice(0, 4));
  const month = yyyymm.slice(4, 6);
  const rocYear = toROCYear(year);
  const d = `${rocYear}/${month}`;
  const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${d}&stkno=${stockNo}&_=0`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.tpex.org.tw/" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json.aaData) || json.aaData.length === 0) return [];

    return json.aaData
      .map((row: string[]) => {
        // fields: 日期(MM/DD), 成交股數, 成交金額, 開盤, 最高, 最低, 收盤, 漲跌, 成交筆數
        if (row.length < 7) return null;
        const [mm, dd] = row[0].split("/");
        const westernYear = rocYear + 1911;
        const dateStr = `${westernYear}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        const open = parseNum(row[3]);
        const high = parseNum(row[4]);
        const low = parseNum(row[5]);
        const close = parseNum(row[6]);
        const volume = Math.round(parseNum(row[1]) / 1000);
        if (!open || !close) return null;
        return { date: dateStr, open, high, low, close, volume } as CandleData;
      })
      .filter(Boolean) as CandleData[];
  } catch {
    return [];
  }
}

// Get last N months as "YYYYMM" strings (newest first)
function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return months;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const months = lastNMonths(4); // fetch 4 months to ensure ~60 trading days

  // Try TWSE first (fetch all months in parallel)
  let twseResults = await Promise.all(months.map((m) => fetchTWSEMonth(code, m)));
  let candles: CandleData[] = twseResults.flat();

  // If TWSE returned no data, try TPEx
  if (candles.length === 0) {
    const tpexResults = await Promise.all(months.map((m) => fetchTPExMonth(code, m)));
    candles = tpexResults.flat();
  }

  // Sort ascending by date and deduplicate
  candles.sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set<string>();
  candles = candles.filter((c) => {
    if (seen.has(c.date)) return false;
    seen.add(c.date);
    return true;
  });

  // Return last 60 trading days
  const result = candles.slice(-60);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
