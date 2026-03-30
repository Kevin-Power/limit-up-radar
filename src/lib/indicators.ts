// src/lib/indicators.ts
// Technical indicator functions shared by backtest, technicals, and other routes

export function calcEMA(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { ema.push(NaN); continue; }
    if (i === period - 1) {
      ema.push(prices.slice(0, period).reduce((s, v) => s + v, 0) / period);
      continue;
    }
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calcKD(
  highs: number[], lows: number[], closes: number[], period = 9
): { k: number[]; d: number[] } {
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

export function calcMACD(
  prices: number[], fast = 12, slow = 26, signal = 9
): { macd: number[]; signal: number[]; hist: number[] } {
  const emaFast = calcEMA(prices, fast);
  const emaSlow = calcEMA(prices, slow);
  const macd = prices.map((_, i) =>
    isNaN(emaFast[i]) || isNaN(emaSlow[i]) ? NaN : emaFast[i] - emaSlow[i]
  );
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

export function calcRSI(prices: number[], period = 14): number[] {
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

export function calcMA(prices: number[], period: number): number[] {
  return prices.map((_, i) => {
    if (i < period - 1) return NaN;
    return prices.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
  });
}
