// src/app/api/stock/[code]/limitup-history/route.ts
//
// Returns real next-day open/close return computed from TWSE STOCK_DAY OHLC.
// "Next-day open %"  = (next_day_open  - limit_up_close) / limit_up_close * 100
// "Next-day close %" = (next_day_close - limit_up_close) / limit_up_close * 100
//
// Historical data so we cache aggressively.
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

interface LimitUpEntry {
  date: string;
  group: string;
  nextDayOpenPct: number | null;
  nextDayClosePct: number | null;
}

interface OHLC { open: number | null; close: number | null }

async function fetchOHLC(code: string, date: string): Promise<OHLC | null> {
  const yyyymm = date.replace(/-/g, "").slice(0, 6) + "01";
  const targetRoc = `${parseInt(date.slice(0, 4)) - 1911}/${date.slice(5, 7)}/${date.slice(8, 10)}`;

  // TWSE STOCK_DAY
  try {
    const url = new URL("https://www.twse.com.tw/exchangeReport/STOCK_DAY");
    url.searchParams.set("response", "json");
    url.searchParams.set("date", yyyymm);
    url.searchParams.set("stockNo", code);
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 86400 }, // historical, cache 1 day
    });
    if (res.ok) {
      const d = await res.json();
      if (d.stat === "OK") {
        for (const row of d.data ?? []) {
          if (String(row[0]).trim() === targetRoc) {
            const open = parseFloat(String(row[3]).replace(/,/g, "")) || null;
            const close = parseFloat(String(row[6]).replace(/,/g, "")) || null;
            return { open, close };
          }
        }
      }
    }
  } catch { /* fall through */ }

  // TPEx (new endpoint: tradingStock returns single-day OHLC)
  try {
    const url = new URL("https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock");
    url.searchParams.set("date", `${date.slice(0, 4)}/${date.slice(5, 7)}/${date.slice(8, 10)}`);
    url.searchParams.set("code", code);
    url.searchParams.set("response", "json");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 86400 },
    });
    if (res.ok) {
      const d = await res.json();
      const tables = d?.tables ?? [];
      for (const t of tables) {
        for (const row of t?.data ?? []) {
          if (String(row[0]).trim() === targetRoc) {
            // Fields: ['日期', '成交張數', '成交仟元', '開盤', '最高', '最低', '收盤', '漲跌']
            const open = parseFloat(String(row[3]).replace(/,/g, "")) || null;
            const close = parseFloat(String(row[6]).replace(/,/g, "")) || null;
            return { open, close };
          }
        }
      }
    }
  } catch { /* fall through */ }

  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  if (!fs.existsSync(DATA_DIR)) return NextResponse.json([]);

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) return NextResponse.json([]);

  // Find days where this stock was in limit-up + remember its close + group
  type Hit = { date: string; group: string; close: number; nextDate: string | null };
  const hits: Hit[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, files[i]), "utf-8");
      const data = JSON.parse(raw);
      const date: string = data.date;
      const nextDate = i + 1 < files.length ? files[i + 1].replace(".json", "") : null;
      for (const g of data.groups ?? []) {
        for (const s of g.stocks ?? []) {
          if (s.code === code) {
            hits.push({ date, group: g.name ?? "", close: s.close, nextDate });
          }
        }
      }
    } catch { /* skip corrupt */ }
  }

  // Most recent 10 — fetch real next-day OHLC for each
  hits.sort((a, b) => b.date.localeCompare(a.date));
  const recent = hits.slice(0, 10);

  const entries: LimitUpEntry[] = await Promise.all(
    recent.map(async (h): Promise<LimitUpEntry> => {
      if (!h.nextDate || !h.close) {
        return { date: h.date, group: h.group, nextDayOpenPct: null, nextDayClosePct: null };
      }
      const ohlc = await fetchOHLC(code, h.nextDate);
      const openPct = ohlc?.open ? ((ohlc.open - h.close) / h.close) * 100 : null;
      const closePct = ohlc?.close ? ((ohlc.close - h.close) / h.close) * 100 : null;
      return {
        date: h.date,
        group: h.group,
        nextDayOpenPct: openPct != null ? Math.round(openPct * 100) / 100 : null,
        nextDayClosePct: closePct != null ? Math.round(closePct * 100) / 100 : null,
      };
    })
  );

  return NextResponse.json(entries, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" },
  });
}
