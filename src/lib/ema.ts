/**
 * 快樂小馬 EMA11/24 策略計算模組
 *
 * EMA = (Price - Previous EMA) x Multiplier + Previous EMA
 * Multiplier = 2 / (Period + 1)
 */

// ─── Seeded RNG ──────────────────────────────────────────────

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function makeRng(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// ─── EMA Calculation ─────────────────────────────────────────

export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const ema: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1]);
  }
  return ema;
}

// ─── Crossover Signal ────────────────────────────────────────

export type EmaSignal = "golden_cross" | "death_cross" | "bullish" | "bearish";

export interface EmaResult {
  ema11: number;
  ema24: number;
  signal: EmaSignal;
  ema11Series: number[];
  ema24Series: number[];
  prices: number[];
  crossoverDay: number; // days since last crossover (0 = today)
}

export function detectSignal(ema11Series: number[], ema24Series: number[]): { signal: EmaSignal; crossoverDay: number } {
  const len = ema11Series.length;
  if (len < 2) return { signal: "bullish", crossoverDay: 999 };

  const curr11 = ema11Series[len - 1];
  const curr24 = ema24Series[len - 1];
  const prev11 = ema11Series[len - 2];
  const prev24 = ema24Series[len - 2];

  // Check for crossover today
  if (prev11 <= prev24 && curr11 > curr24) {
    return { signal: "golden_cross", crossoverDay: 0 };
  }
  if (prev11 >= prev24 && curr11 < curr24) {
    return { signal: "death_cross", crossoverDay: 0 };
  }

  // Look back for recent crossover (within 10 days)
  for (let d = 2; d <= Math.min(10, len - 1); d++) {
    const i = len - 1 - d;
    const p11 = ema11Series[i];
    const p24 = ema24Series[i];
    const n11 = ema11Series[i + 1];
    const n24 = ema24Series[i + 1];

    if (p11 <= p24 && n11 > n24) {
      return { signal: "golden_cross", crossoverDay: d };
    }
    if (p11 >= p24 && n11 < n24) {
      return { signal: "death_cross", crossoverDay: d };
    }
  }

  // No recent crossover, just report trend
  return {
    signal: curr11 > curr24 ? "bullish" : "bearish",
    crossoverDay: 999,
  };
}

// ─── Mock Price Generation ───────────────────────────────────

export function generateMockPrices(code: string, basePrice: number, count: number = 60): number[] {
  const rng = makeRng(code + "_ema_prices");
  const seedVal = rng();

  // Use code char sum for more varied distribution
  const codeSum = code.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const patternIdx = (codeSum + Math.floor(seedVal * 97)) % 8;
  // ~25% golden cross, ~12.5% death cross, ~37.5% bullish, ~25% bearish
  const pattern = patternIdx < 2 ? "golden" : patternIdx < 3 ? "death" : patternIdx < 6 ? "up" : "down";

  const prices: number[] = [basePrice * (0.80 + rng() * 0.15)];
  for (let i = 1; i < count; i++) {
    let drift: number;
    const phase = i / count;

    switch (pattern) {
      case "golden":
        // Down/flat first, then sharp up near end to force EMA11 cross above EMA24
        if (phase < 0.5) drift = basePrice * -0.003;
        else if (phase < 0.75) drift = basePrice * -0.001;
        else drift = basePrice * 0.015; // sharp reversal up
        break;
      case "death":
        // Up first, then sharp down near end to force EMA11 cross below EMA24
        if (phase < 0.5) drift = basePrice * 0.004;
        else if (phase < 0.75) drift = basePrice * 0.001;
        else drift = basePrice * -0.012; // sharp reversal down
        break;
      case "up":
        // Steady uptrend (bullish alignment)
        drift = basePrice * 0.003;
        break;
      case "down":
        // Steady downtrend (bearish alignment)
        drift = basePrice * -0.002;
        break;
      default:
        drift = 0;
    }

    const noise = (rng() - 0.5) * basePrice * 0.015;
    prices.push(Math.max(prices[i - 1] + drift + noise, basePrice * 0.3));
  }
  return prices;
}

// ─── Full Analysis ───────────────────────────────────────────

export function analyzeEma(code: string, basePrice: number): EmaResult {
  const prices = generateMockPrices(code, basePrice);
  const ema11Series = calculateEMA(prices, 11);
  const ema24Series = calculateEMA(prices, 24);
  const { signal, crossoverDay } = detectSignal(ema11Series, ema24Series);

  return {
    ema11: ema11Series[ema11Series.length - 1],
    ema24: ema24Series[ema24Series.length - 1],
    signal,
    ema11Series,
    ema24Series,
    prices,
    crossoverDay,
  };
}

// ─── Signal Display Helpers ──────────────────────────────────

export function getSignalLabel(signal: EmaSignal): string {
  switch (signal) {
    case "golden_cross": return "金叉";
    case "death_cross": return "死叉";
    case "bullish": return "多頭";
    case "bearish": return "空頭";
  }
}

export function getSignalFullLabel(signal: EmaSignal): string {
  switch (signal) {
    case "golden_cross": return "黃金交叉";
    case "death_cross": return "死亡交叉";
    case "bullish": return "多頭排列";
    case "bearish": return "空頭排列";
  }
}

export function getSignalColor(signal: EmaSignal): { text: string; bg: string; border: string } {
  switch (signal) {
    case "golden_cross":
      return { text: "text-red", bg: "bg-red/15", border: "border-red/30" };
    case "death_cross":
      return { text: "text-green", bg: "bg-green/15", border: "border-green/30" };
    case "bullish":
      return { text: "text-red/80", bg: "bg-red/8", border: "border-red/15" };
    case "bearish":
      return { text: "text-green/80", bg: "bg-green/8", border: "border-green/15" };
  }
}
