import { NextRequest, NextResponse } from "next/server";

// ── Technical indicator helpers ──────────────────────────────────────────────

function calcEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { ema.push(NaN); continue; }
    if (i === period - 1) { ema.push(prices.slice(0, period).reduce((s, v) => s + v, 0) / period); continue; }
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcKD(highs: number[], lows: number[], closes: number[], period = 9): { k: number[]; d: number[] } {
  const k: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { k.push(NaN); d.push(NaN); continue; }
    const slice = { h: highs.slice(i - period + 1, i + 1), l: lows.slice(i - period + 1, i + 1) };
    const hh = Math.max(...slice.h);
    const ll = Math.min(...slice.l);
    const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
    const kv = i === period - 1 ? rsv : k[i - 1] * (2 / 3) + rsv * (1 / 3);
    const dv = i === period - 1 ? kv : d[i - 1] * (2 / 3) + kv * (1 / 3);
    k.push(kv);
    d.push(dv);
  }
  return { k, d };
}

function calcMACD(prices: number[], fast = 12, slow = 26, signal = 9): { macd: number[]; signal: number[]; hist: number[] } {
  const emaFast = calcEMA(prices, fast);
  const emaSlow = calcEMA(prices, slow);
  const macd = prices.map((_, i) => (isNaN(emaFast[i]) || isNaN(emaSlow[i])) ? NaN : emaFast[i] - emaSlow[i]);
  const validMacd = macd.filter((v) => !isNaN(v));
  const signalLine: number[] = macd.map(() => NaN);
  const signalEma = calcEMA(validMacd, signal);
  let vi = 0;
  for (let i = 0; i < macd.length; i++) {
    if (!isNaN(macd[i])) { signalLine[i] = signalEma[vi++] ?? NaN; }
  }
  const hist = macd.map((v, i) => isNaN(v) || isNaN(signalLine[i]) ? NaN : v - signalLine[i]);
  return { macd, signal: signalLine, hist };
}

function calcRSI(prices: number[], period = 14): number[] {
  const rsi: number[] = [NaN];
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    if (i <= period) {
      avgGain = (avgGain * (i - 1) + gain) / i;
      avgLoss = (avgLoss * (i - 1) + loss) / i;
      rsi.push(i < period ? NaN : avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
  }
  return rsi;
}

// ── Generate buy/sell signals ────────────────────────────────────────────────

type Signal = "buy" | "sell" | null;

function emaSignals(prices: number[], fast: number, slow: number): Signal[] {
  const ef = calcEMA(prices, fast);
  const es = calcEMA(prices, slow);
  return prices.map((_, i) => {
    if (i === 0 || isNaN(ef[i]) || isNaN(es[i]) || isNaN(ef[i - 1]) || isNaN(es[i - 1])) return null;
    if (ef[i - 1] <= es[i - 1] && ef[i] > es[i]) return "buy";
    if (ef[i - 1] >= es[i - 1] && ef[i] < es[i]) return "sell";
    return null;
  });
}

function kdSignals(highs: number[], lows: number[], closes: number[], buyLevel: number, sellLevel: number): Signal[] {
  const { k, d } = calcKD(highs, lows, closes);
  return closes.map((_, i) => {
    if (i === 0 || isNaN(k[i]) || isNaN(d[i]) || isNaN(k[i - 1]) || isNaN(d[i - 1])) return null;
    if (k[i - 1] <= d[i - 1] && k[i] > d[i] && k[i] < buyLevel) return "buy";
    if (k[i - 1] >= d[i - 1] && k[i] < d[i] && k[i] > sellLevel) return "sell";
    return null;
  });
}

function macdSignals(prices: number[], fast: number, slow: number, signal: number): Signal[] {
  const { macd, signal: sig } = calcMACD(prices, fast, slow, signal);
  return prices.map((_, i) => {
    if (i === 0 || isNaN(macd[i]) || isNaN(sig[i]) || isNaN(macd[i - 1]) || isNaN(sig[i - 1])) return null;
    if (macd[i - 1] <= sig[i - 1] && macd[i] > sig[i]) return "buy";
    if (macd[i - 1] >= sig[i - 1] && macd[i] < sig[i]) return "sell";
    return null;
  });
}

function rsiSignals(prices: number[], period: number, overbought: number, oversold: number): Signal[] {
  const rsi = calcRSI(prices, period);
  return prices.map((_, i) => {
    if (i === 0 || isNaN(rsi[i]) || isNaN(rsi[i - 1])) return null;
    if (rsi[i - 1] <= oversold && rsi[i] > oversold) return "buy";
    if (rsi[i - 1] >= overbought && rsi[i] < overbought) return "sell";
    return null;
  });
}

// ── Simulate trades ──────────────────────────────────────────────────────────

export interface Trade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  returnPct: number;
  holdDays: number;
  win: boolean;
}

export interface BacktestResult {
  totalReturn: number;
  winRate: number;
  tradeCount: number;
  maxDrawdown: number;
  trades: Trade[];
  equityCurve: number[];
  benchmarkCurve: number[];
  avgReturn: number;
  avgHoldDays: number;
  maxWin: number;
  maxLoss: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  sharpeRatio: number;
  dataPoints: number;
  stockCode: string;
  dateRange: { start: string; end: string };
  isReal: boolean;
}

interface OHLCVBar { date: string; open: number; high: number; low: number; close: number; volume: number; }

function simulateTrades(bars: OHLCVBar[], signals: Signal[], fee = 0.003): Trade[] {
  const trades: Trade[] = [];
  let inPosition = false;
  let entryIdx = 0;

  for (let i = 0; i < signals.length; i++) {
    if (!inPosition && signals[i] === "buy") {
      inPosition = true;
      entryIdx = i;
    } else if (inPosition && signals[i] === "sell") {
      const entry = bars[entryIdx];
      const exit = bars[i];
      const returnPct = ((exit.close / entry.close) - 1) * 100 - fee * 200;
      const holdDays = i - entryIdx;
      trades.push({
        entryDate: entry.date,
        entryPrice: entry.close,
        exitDate: exit.date,
        exitPrice: exit.close,
        returnPct: Math.round(returnPct * 100) / 100,
        holdDays,
        win: returnPct > 0,
      });
      inPosition = false;
    }
  }

  // Close open position at last bar
  if (inPosition && entryIdx < bars.length - 1) {
    const entry = bars[entryIdx];
    const exit = bars[bars.length - 1];
    const returnPct = ((exit.close / entry.close) - 1) * 100 - fee * 200;
    trades.push({
      entryDate: entry.date, entryPrice: entry.close,
      exitDate: exit.date, exitPrice: exit.close,
      returnPct: Math.round(returnPct * 100) / 100,
      holdDays: bars.length - 1 - entryIdx,
      win: returnPct > 0,
    });
  }

  return trades;
}

function buildResult(bars: OHLCVBar[], trades: Trade[], stockCode: string): BacktestResult {
  const wins = trades.filter((t) => t.win).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const avgReturn = trades.length > 0 ? trades.reduce((s, t) => s + t.returnPct, 0) / trades.length : 0;
  const avgHoldDays = trades.length > 0 ? Math.round(trades.reduce((s, t) => s + t.holdDays, 0) / trades.length) : 0;
  const maxWin = trades.length > 0 ? Math.max(...trades.map((t) => t.returnPct)) : 0;
  const maxLoss = trades.length > 0 ? Math.min(...trades.map((t) => t.returnPct)) : 0;

  let maxConsecWins = 0, maxConsecLosses = 0, cw = 0, cl = 0;
  for (const t of trades) {
    if (t.win) { cw++; cl = 0; maxConsecWins = Math.max(maxConsecWins, cw); }
    else { cl++; cw = 0; maxConsecLosses = Math.max(maxConsecLosses, cl); }
  }

  // Build equity curve aligned to all bars
  const equityCurve: number[] = bars.map(() => 100);
  let equity = 100;
  let ti = 0;
  for (let i = 0; i < bars.length; i++) {
    if (ti < trades.length && bars[i].date === trades[ti].exitDate) {
      equity *= (1 + trades[ti].returnPct / 100);
      ti++;
    }
    equityCurve[i] = Math.round(equity * 100) / 100;
  }

  // Benchmark: buy & hold from first bar close
  const base = bars[0].close;
  const benchmarkCurve = bars.map((b) => Math.round((b.close / base) * 100 * 100) / 100);

  const totalReturn = Math.round((equityCurve[equityCurve.length - 1] - 100) * 100) / 100;

  let peak = 100, maxDD = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }
  const meanR = dailyReturns.reduce((s, r) => s + r, 0) / (dailyReturns.length || 1);
  const stdR = Math.sqrt(dailyReturns.reduce((s, r) => s + (r - meanR) ** 2, 0) / (dailyReturns.length || 1));
  const sharpeRatio = stdR > 0 ? Math.round((meanR / stdR) * Math.sqrt(252) * 100) / 100 : 0;

  return {
    totalReturn, winRate: Math.round(winRate * 10) / 10,
    tradeCount: trades.length, maxDrawdown: Math.round(maxDD * 100) / 100,
    trades, equityCurve, benchmarkCurve,
    avgReturn: Math.round(avgReturn * 100) / 100, avgHoldDays,
    maxWin: Math.round(maxWin * 100) / 100, maxLoss: Math.round(maxLoss * 100) / 100,
    maxConsecWins, maxConsecLosses, sharpeRatio,
    dataPoints: bars.length,
    stockCode,
    dateRange: { start: bars[0].date, end: bars[bars.length - 1].date },
    isReal: true,
  };
}

// ── Fetch real OHLCV data ───────────────────────────────────────────────────

async function fetchBars(code: string): Promise<OHLCVBar[]> {
  // Use TWSE monthly data — fetch last 4 months
  const bars: OHLCVBar[] = [];
  const isTwse = !/^[5-9]/.test(code) || code.length !== 4;

  const now = new Date();
  for (let m = 3; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const dateStr = `${year}${month}01`;

    try {
      if (isTwse) {
        const url = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${code}`;
        const res = await fetch(url, { next: { revalidate: 7200 } });
        if (!res.ok) continue;
        const json = await res.json();
        if (json.stat !== "OK" || !json.data) continue;
        for (const row of json.data) {
          const raw = row[0].replace(/\//g, "-");
          const parts = raw.split("-");
          if (parts.length !== 3) continue;
          const isoDate = `${parseInt(parts[0]) + 1911}-${parts[1]}-${parts[2]}`;
          const parseNum = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;
          bars.push({ date: isoDate, open: parseNum(row[3]), high: parseNum(row[4]), low: parseNum(row[5]), close: parseNum(row[6]), volume: parseNum(row[1]) });
        }
      } else {
        const rocYear = year - 1911;
        const url = `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${rocYear}/${month}&stkno=${code}`;
        const res = await fetch(url, { next: { revalidate: 7200 } });
        if (!res.ok) continue;
        const json = await res.json();
        if (!json.aaData) continue;
        for (const row of json.aaData) {
          const parts = row[0].split("/");
          if (parts.length !== 3) continue;
          const isoDate = `${parseInt(parts[0]) + 1911}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
          const parseNum = (s: string) => parseFloat(s.replace(/,/g, "")) || 0;
          bars.push({ date: isoDate, open: parseNum(row[4]), high: parseNum(row[5]), low: parseNum(row[6]), close: parseNum(row[7]), volume: parseNum(row[1]) });
        }
      }
    } catch { continue; }
  }

  // Deduplicate and sort
  const seen = new Set<string>();
  return bars.filter((b) => { if (seen.has(b.date)) return false; seen.add(b.date); return b.open > 0 && b.close > 0; })
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const code = p.get("code") || "2330";
  const strategy = p.get("strategy") || "ema";

  const emaFast = parseInt(p.get("emaFast") || "11");
  const emaSlow = parseInt(p.get("emaSlow") || "24");
  const kdBuy = parseInt(p.get("kdBuy") || "20");
  const kdSell = parseInt(p.get("kdSell") || "80");
  const macdFast = parseInt(p.get("macdFast") || "12");
  const macdSlow = parseInt(p.get("macdSlow") || "26");
  const macdSig = parseInt(p.get("macdSignal") || "9");
  const rsiPeriod = parseInt(p.get("rsiPeriod") || "14");
  const rsiOB = parseInt(p.get("rsiOverbought") || "80");
  const rsiOS = parseInt(p.get("rsiOversold") || "20");

  const bars = await fetchBars(code);

  if (bars.length < 30) {
    return NextResponse.json({ error: "insufficient data", bars: bars.length }, { status: 422 });
  }

  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  let signals: Signal[];
  switch (strategy) {
    case "kd":   signals = kdSignals(highs, lows, closes, kdBuy, kdSell); break;
    case "macd": signals = macdSignals(closes, macdFast, macdSlow, macdSig); break;
    case "rsi":  signals = rsiSignals(closes, rsiPeriod, rsiOB, rsiOS); break;
    default:     signals = emaSignals(closes, emaFast, emaSlow);
  }

  const trades = simulateTrades(bars, signals);
  const result = buildResult(bars, trades, code);

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
