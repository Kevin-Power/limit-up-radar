# 全站真實資料升級設計

**日期:** 2026-03-28
**目標:** 移除所有 MOCK_STOCKS 與 seeded-RNG mock，讓 Pony 選股、進階選股、首頁 EMA badges、個股詳情頁全部使用真實 TWSE/TPEx 資料

---

## 現況問題

| 位置 | 問題 |
|------|------|
| `src/app/pony/_client.tsx` | `MOCK_STOCKS` hardcoded；`useMemo` 空依賴陣列 bug |
| `src/app/screener/_client.tsx` | `MOCK_STOCKS` hardcoded；PE/ROE 用 charCode 偽造；score 欄假值；4 個 FilterMode tab 依賴假欄位；sort useMemo 漏 dependency |
| `src/app/stock/[code]/page.tsx` | `STOCK_NAMES` / `STOCK_PRICES` hardcoded；`generateCandleData()` + `mockTechnicalData()` + `mockChipData()` + `mockLimitUpHistory()` + `mockPeerStocks()` 全部 seeded-RNG |
| `src/components/StockRow.tsx` | 直接呼叫 `analyzeEma()` mock，應改為接受外部 prop |
| `src/components/GroupBlock.tsx` | 未傳遞 emaMap；表頭缺 EMA 欄位 |
| `src/lib/ema.ts` | `EmaResult` 缺 `isReal` 欄位 |

---

## Step 1：修改 `src/lib/ema.ts`

新增 `isReal` 欄位至 `EmaResult`：

```ts
export interface EmaResult {
  ema11: number;
  ema24: number;
  signal: EmaSignal;
  ema11Series: number[];
  ema24Series: number[];
  prices: number[];
  crossoverDay: number;
  isReal: boolean;  // true = TWSE 真實資料；false = mock fallback
}
```

`analyzeEma()` 回傳值加上 `isReal: false`。

---

## Step 2：新增 `/api/ema/[code]`

**邏輯：**
- 複用 `fetchTWSEMonth` / `fetchTPExMonth` helper（從 history route 複製至 lib，避免 internal API call）
- 抓最近 2 個月 OHLCV（約 40 個交易日）
- 若 `candles.length < 30` → fallback `analyzeEma()` mock，`isReal: false`
- 計算 EMA11 / EMA24，偵測交叉

**Response:** `EmaResult & { code: string }`
**Cache:** `revalidate: 3600`

---

## Step 3：新增 `/api/ema/batch`

Query: `?codes=3324,3017,2330,...`

**並行控制：**
- 將 codes 分組，每組最多 8 支，組間不加 delay
- 組內 `Promise.allSettled`，失敗項回傳 mock fallback
- Response: `Record<string, EmaResult>`
- Cache: `revalidate: 3600`

---

## Step 4：新增 `/api/pe`

**來源：** `https://www.twse.com.tw/exchangeReport/BWIBBU_d?response=json&date=YYYYMMDD&selectType=ALL`

**TWSE 欄位對應：**
- `fields[0]` = 股票代號
- `fields[2]` = 殖利率 (%) → `dividendYield`
- `fields[4]` = 本益比 → `pe`
- `fields[5]` = 股價淨值比 → `pb`

**日期策略：** 今日日期；TWSE 回傳空時往前找最多 5 個交易日

**Response:** `Record<string, { pe: number; pb: number; dividendYield: number }>`
**Cache:** `revalidate: 7200`

---

## Step 5：新增 `/api/stock/[code]/technicals`

計算技術指標（從真實 OHLCV）：

**邏輯：**
- 呼叫同樣的 TWSE/TPEx history helper，取最近 3 個月（約 60 交易日）
- 計算：MA5 / MA10 / MA20 / MA60、RSI(14)、KD(%K/%D)、MACD signal
- 邏輯複用 `/api/backtest` 現有的 `computeRSI` / `computeKD` / `computeMACD` 函數（抽取至 `src/lib/indicators.ts`）
- 推導 `overall`：close > MA20 & RSI > 50 → bullish；反之 bearish；其他 neutral

**Response:**
```ts
{
  ma5: number; ma10: number; ma20: number; ma60: number;
  rsi: number;
  macdSignal: "golden_cross" | "death_cross" | "neutral";
  kd_k: number; kd_d: number;
  overall: "bullish" | "neutral" | "bearish";
  isReal: boolean;
}
```
**Cache:** `revalidate: 3600`

---

## Step 6：新增 `/api/stock/[code]/chip`

3 日法人買賣資料：

**來源：** `https://www.twse.com.tw/fund/TWT38U?response=json&date=YYYYMMDD&stockNo=XXXX`

**逐日抓最近 3 個交易日，回傳：**
```ts
{
  foreign3d: number[];   // 外資 3日淨買（張）
  trust3d: number[];     // 投信
  dealer3d: number[];    // 自營
  isReal: boolean;
}
```
- `topBuyers` / `topSellers`（券商分點）：TWSE `BROKERAGE` API 需個別申請，**本次不實作**，改顯示「—」
- `marginBuy` / `marginSell` / `shortSell` / `shortCover`：來源 `https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date=YYYYMMDD&stockNo=XXXX`

**Cache:** `revalidate: 3600`

---

## Step 7：新增 `/api/stock/[code]/limitup-history`

查詢本地 `data/daily/*.json` 檔案，找出該股票曾漲停的日期：

**邏輯：**
- 讀取 `data/daily/` 所有 JSON 檔，找出含有該 `code` 的 groups
- 回傳最近 10 筆，每筆包含 date、group name
- `nextDayOpenPct` / `nextDayClosePct`：從下一個交易日 JSON 取得對應股票 change_pct（若無則 null）

**Response:** `LimitUpEntry[]`
**Cache:** 不快取（讀本地檔，極快）

---

## Step 8：修改 Pony 頁 (`src/app/pony/_client.tsx`)

1. 刪除 `MOCK_STOCKS`
2. `useSWR("/api/daily/latest")` → 展平所有 groups 的 stocks 為 `sourceStocks`
3. **用 `/api/ema/batch`**（唯一路徑，不用個別呼叫）：`useSWR("/api/ema/batch?codes=" + codes.join(","))`
4. **修正 `useMemo` 空依賴 bug**：依賴改為 `[sourceStocks, emaData]`
5. Rows = `useMemo(() => merge(sourceStocks, emaData), [sourceStocks, emaData])`
6. Loading：skeleton rows；EMA 欄位在 emaData 取得前顯示 `—`

---

## Step 9：修改 Screener 頁 (`src/app/screener/_client.tsx`)

1. 刪除 `MOCK_STOCKS`
2. `useSWR("/api/daily/latest")` + `useSWR("/api/pe")`
3. **移除欄位：** score、ROE、RevenueYoY
4. **移除 4 個 FilterMode tab**（依賴假欄位）
5. 保留欄位：代號、名稱、收盤價、漲跌幅、成交量、主力淨買、連板、PE、PB
6. **修正 sort useMemo 漏 dependency**：加入 `ACTIVE_STOCKS` 為依賴
7. 篩選條件（真實資料）：成交量、連板、族群、PE、EMA 訊號（來自 `/api/ema/batch`）

---

## Step 10：修改個股詳情頁 (`src/app/stock/[code]/page.tsx`)

**刪除所有 mock：**
1. 刪除 `STOCK_NAMES` / `STOCK_PRICES` hardcoded maps → stock name 與 close 優先從 daily data groups 查找；若找不到（股票當日未漲停，或假日），name 顯示 code（股票代號），close 取 `realCandles` 最後一筆的 `close`；不另行查詢名稱 API
2. 刪除 `generateCandleData()` → 改用 `useSWR("/api/stock/${code}/history")`
3. 刪除 hardcoded 日期 → 從 candles 最後一筆取得
4. 刪除 `mockTechnicalData()` → 改用 `useSWR("/api/stock/${code}/technicals")`
5. 刪除 `mockChipData()` → 改用 `useSWR("/api/stock/${code}/chip")`
6. 刪除 `mockLimitUpHistory()` → 改用 `useSWR("/api/stock/${code}/limitup-history")`
7. 刪除 `mockPeerStocks()` → peer stocks 已有真實 group stocks（`groupStocks.filter(s => s.code !== code)`），PE 值從 `/api/pe` 取得
8. EMA → 改用 `useSWR("/api/ema/${code}")`，K 線疊加真實 ema11Series / ema24Series

**抽取共用 indicators 邏輯：**
- 新建 `src/lib/indicators.ts`：`computeMA`, `computeRSI`, `computeKD`, `computeMACD`
- `/api/backtest/route.ts` 改 import 自 `src/lib/indicators.ts`
- `/api/stock/[code]/technicals/route.ts` 也 import 自 `src/lib/indicators.ts`

---

## Step 11：修改首頁 StockRow EMA Badges

**`src/app/page.tsx`：**
1. 取得 daily data 後，提取所有 codes
2. `useSWR("/api/ema/batch?codes=..." )` 取得 batch EMA 結果
3. 派生 `emaSignalMap: Record<string, EmaSignal>`：
   ```ts
   const emaSignalMap = useMemo(() =>
     Object.fromEntries(Object.entries(batchEma ?? {}).map(([k, v]) => [k, v.signal])),
     [batchEma]
   );
   ```
4. 傳 `emaSignalMap` 給 `GroupBlock`

**`src/components/GroupBlock.tsx`：**
- 接收 `emaSignalMap?: Record<string, EmaSignal>` prop
- 傳遞 `emaSignal={emaSignalMap?.[stock.code]}` 給每個 `StockRow`
- **新增 EMA 欄位表頭**（避免表頭欄位錯位）

**`src/components/StockRow.tsx`：**
- 新增 `emaSignal?: EmaSignal` prop
- 刪除內部 `analyzeEma()` 呼叫
- 有 `emaSignal` 時顯示 badge，無時顯示空格佔位

---

## 資料流

```
首頁
  ↓ useSWR /api/daily/latest
  ↓ useSWR /api/ema/batch?codes=...  (批量，並行 ≤8，cached 1h)
  → emaSignalMap → GroupBlock → StockRow (real badge)

Pony 頁
  ↓ useSWR /api/daily/latest → sourceStocks
  ↓ useSWR /api/ema/batch?codes=...  (同一批次 API)
  → useMemo([sourceStocks, emaData]) → 表格

Screener 頁
  ↓ useSWR /api/daily/latest
  ↓ useSWR /api/pe
  ↓ useSWR /api/ema/batch?codes=...  (可選，用於 EMA 篩選)
  → 表格 (real)

個股詳情頁 /stock/[code]
  ↓ useSWR /api/stock/[code]/history      → K 線
  ↓ useSWR /api/ema/[code]                → EMA11/24 疊加
  ↓ useSWR /api/stock/[code]/technicals   → MA/RSI/KD/MACD
  ↓ useSWR /api/stock/[code]/chip         → 法人籌碼
  ↓ useSWR /api/stock/[code]/limitup-history → 漲停歷史
  ↓ useSWR /api/pe                        → PE/PB（用於 peer stocks）
```

---

## 快取一致性說明

首頁 `/api/ema/batch` 與 Pony 頁 `/api/ema/batch` 使用**相同 URL 與 cache key**，快取一致。個股詳情頁 `/api/ema/[code]` 為獨立快取視窗（1h），與 batch 最多差 1h，屬可接受的 best-effort 一致性。

---

## 不在本次範圍

- ROE / 營收 YoY（MOPS API）
- 券商分點買賣（需申請 TWSE 特殊資料）
- EMA 警示 push notification
- 歷史 EMA 回溯

---

## 驗證計畫

1. `npx tsc --noEmit` 通過，無 TypeScript 錯誤
2. `/pony` — 顯示今日真實漲停股（數量動態），EMA 含 `isReal: true`
3. `/screener` — 顯示真實股票，PE/PB 為真實數值，無 score 欄位
4. `/` — StockRow badge 正常，與 pony 頁同一股票訊號一致（同批次快取）
5. `/stock/3324` — K 線為真實 OHLCV，技術指標與 backtest API 計算結果一致
6. 假日 fallback — EMA API 回傳 `isReal: false` 時 badge 仍顯示（mock值）
