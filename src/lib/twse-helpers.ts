// src/lib/twse-helpers.ts
// TWSE/TPEx monthly OHLCV fetching helpers, shared by history, ema, technicals, chip routes

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function parseNum(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

export function toROCYear(westernYear: number): number {
  return westernYear - 1911;
}

export function parseTWSEDate(s: string): string {
  const [roc, mm, dd] = s.split("/");
  const year = parseInt(roc) + 1911;
  return `${year}-${mm}-${dd}`;
}

export async function fetchTWSEMonth(stockNo: string, yyyymm: string): Promise<CandleData[]> {
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
        if (row.length < 7) return null;
        const open = parseNum(row[3]);
        const close = parseNum(row[6]);
        if (!open || !close) return null;
        return {
          date: parseTWSEDate(row[0]),
          open,
          high: parseNum(row[4]),
          low: parseNum(row[5]),
          close,
          volume: Math.round(parseNum(row[1]) / 1000),
        } as CandleData;
      })
      .filter(Boolean) as CandleData[];
  } catch {
    return [];
  }
}

export async function fetchTPExMonth(stockNo: string, yyyymm: string): Promise<CandleData[]> {
  const year = parseInt(yyyymm.slice(0, 4));
  const month = yyyymm.slice(4, 6);
  const rocYear = toROCYear(year);
  const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${rocYear}/${month}&stkno=${stockNo}&_=0`;
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
        if (row.length < 7) return null;
        const [mm, dd] = row[0].split("/");
        const open = parseNum(row[3]);
        const close = parseNum(row[6]);
        if (!open || !close) return null;
        return {
          date: `${rocYear + 1911}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
          open,
          high: parseNum(row[4]),
          low: parseNum(row[5]),
          close,
          volume: Math.round(parseNum(row[1]) / 1000),
        } as CandleData;
      })
      .filter(Boolean) as CandleData[];
  } catch {
    return [];
  }
}

/** Get last N months as "YYYYMM" strings (newest first).
 *  Uses new Date(y, m-i, 1) to avoid setMonth overflow at month-end. */
export function lastNMonths(n: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return months;
}

/** Fetch recent nMonths of OHLCV (auto-tries TWSE, falls back to TPEx) */
export async function fetchRecentCandles(stockNo: string, nMonths = 2): Promise<CandleData[]> {
  const months = lastNMonths(nMonths);
  const results = await Promise.all(
    months.map(async (ym) => {
      const twse = await fetchTWSEMonth(stockNo, ym);
      if (twse.length > 0) return twse;
      return fetchTPExMonth(stockNo, ym);
    })
  );
  return results.flat().sort((a, b) => a.date.localeCompare(b.date));
}
