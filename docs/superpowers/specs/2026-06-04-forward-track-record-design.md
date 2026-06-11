# 真實前向戰績 (Forward Track Record) — 設計規格

- **Date:** 2026-06-04
- **Status:** Superseded-in-part（2026-06-11 定位轉向分析/教育，見
  `2026-06-11-analysis-education-repositioning-design.md` §7）——技術設計仍有效，
  定框改為「透明隔日行為資料集」（Phase 2），頭條指標改含成本中位數＋分布
- **Author:** Kevin-Power (with Claude)
- **Topic slug:** `forward-track-record`

## 一句話

把現在「回頭用今天的邏輯重算的滾動 10 天回測」升級成「逐日定格、隔日用真實 OHLC 結算、永久累積、可稽核」的**前向戰績紀錄**，並在過程中根除「評分邏輯寫兩遍」的結構性問題。

---

## 1. 目標 / 非目標

### 目標
1. 每個交易日把 `/api/focus` 的選股**原樣凍結**成不可變快照（point-in-time，凍結當下的程式邏輯）。
2. 隔日起用真實 TWSE/TPEx OHLC 結算每一筆（主指標＝開盤報酬，另存收盤與多日）。
3. 永久累積成可稽核的戰績，分**兩段**（真實前向 / 模擬回補）、**兩群**（全 top-20 / 高分群≥60 頭條）呈現。
4. 提供 `/track-record` 頁與 `/api/track-record`；focus 頁顯示 live 信任錨。
5. 順手把「選股組裝流程」抽成可重用純函式，消除 `scoring.ts`(TS) 與 `run_backtest.py`(Python) 的雙實作漂移。

### 非目標（本次不做，列入「之後」）
- 公開版（LINE / landing）信任錨切換成 live（等 live 樣本 ≥ ~20 天再做）。
- 退役 `run_backtest.py` / `/backtest` 頁（本次僅標記 legacy）。
- 進階視覺（互動式權益曲線、個股深連結）、告警/通知。

---

## 2. 背景與現況缺口

- `/api/focus` GET（`src/app/api/focus/route.ts`）即時計算 `focusStocks`：讀最近 daily、算趨勢族群(近 3 日出現 ≥2)、6 日窗計處置/連板、對每檔呼叫 `scoreStock()`(`src/lib/scoring.ts`) 與 `calculatePriceLevels()`，組裝後依分數排序。此組裝流程**寫死在 route handler 內**，無法被別處重用。
- `run_backtest.py` 每日於 GitHub Actions 執行：用 **Python 鏡像**的 `score_stock()` 重算過去 10 天選股 → 抓真實隔日 OHLC → 算勝率/報酬 → 寫 `data/backtest.json`（滾動視窗，舊資料會消失）。
- **已發現的 bug（本設計順手修掉）**：`run_backtest.py` 的 `score_stock()` 註解寫「Mirror scoring.ts exactly」，但實際**少了兩個訊號**：`⭐權值股 +25`（`isHeavyweight`）與 `⚠️近期空吞 −25`（`recentBearishEngulfing`）。導致回測重算的選股與線上 `/api/focus` 實際顯示**不一致**。
- 現況沒有任何 snapshot / track-record / forward 持久化（grep 確認無此概念）。

**缺口總結**：回測是「回頭重算（含未來函數）+ 滾動丟棄 + 無逐筆快照 + 無高分群切分 + 無前向定格」。本設計補上「逐日定格 + 隔日結算 + 永久累積 + 兩段兩群 + 同一套評分真相」。

---

## 3. 已鎖定的關鍵決策

| 決策 | 選擇 |
|---|---|
| 架構路線 | **A**：統一在 TS 真實路徑（抽 `focus-picks.ts` 共用） |
| 追蹤範圍 | 每日 top-20 全存；頭條數字用高分群 |
| 高分群門檻 | **score ≥ 60**（對齊 `run_backtest` 的 `TRADE_THRESHOLD=60`） |
| 結算主指標 | 買隔日開盤、開盤結算（對應 SOP）；收盤＋多日(+1/+2/+3)一併存 |
| 歷史 | 回補段標「模擬」、上線後為真實前向；兩段分開呈現 |
| 公開信任錨 | MVP 先不換（focus 頁顯示 live；公開錨暫用現有回測，≥~20 天再換） |
| 舊回測 | 保留標 legacy，之後退役 |

**Pick set 定義（與現有門檻一致）**：每日取 `focusStocks` 中 `score ≥ 50`、依分數降序、上限 20 檔 = cohort **`all`**；其中 `score ≥ 60` 的子集 = cohort **`highConviction`**（頭條）。

---

## 4. 架構

### 4.1 重構（消除雙實作、開放重用）
- 新增 `src/lib/focus-picks.ts`，匯出純函式：
  ```ts
  generateFocusPicks(input: {
    days: DailyData[];            // [today, yesterday, dayBefore, ... 至少近 6 日(供處置/連板/趨勢)]
    revenue: RevenueMap;          // code -> {revYoY, revMonth, ...}
    categories: { heavyweight: Set<string>; disposal: Set<string> };
    recentBearishCodes: Set<string>;
  }): FocusPick[]                 // 已排序，含 score/tags/price levels
  ```
  封裝：趨勢族群、6 日窗處置/連板、`scoreStock` + `calculatePriceLevels`、組裝、排序。
- `src/app/api/focus/route.ts` 改呼叫 `generateFocusPicks`（行為**不得改變**，由 §7 golden test 守住）。
- 抽 `src/lib/prices.ts`：把 `/api/next-day/route.ts` 的 `fetchTWSEPrices` / `fetchTPExPrices`（月資料 → date→{open,close,volume}）抽出共用；grader 使用。`/api/next-day` 改用之（行為不變）。

> 結果：snapshot / backfill / focus 共用**同一套選股真相**；`run_backtest.py` 的鏡像漂移對戰績不再有影響（且本設計不再依賴它）。

### 4.2 資料模型（JSON，進 git，沿用 `data/` 慣例）
```
data/track-record/
  picks/{YYYY-MM-DD}.json   # 不可變快照（pickDate 當天選股，for 隔日）
  summary.json              # 彙總（計算產物，可重生）
```

**`picks/{date}.json`**（`picks[]` 一旦寫入永不變更）：
```jsonc
{
  "pickDate": "2026-06-04",          // 選股當天（其收盤＝進場參考）
  "forDate": null,                    // 結算交易日；snapshot 時為 null，grade 時填入
  "segment": "live",                  // "live"=逐日定格 | "simulated"=回補
  "logicVersion": "1ac1cc6",          // 產生當下 git short sha（可把選股歸因到版本）
  "generatedOn": "2026-06-04",        // 僅存日期（快照按日去重、diff 友善）
  "thresholds": { "pick": 50, "highConviction": 60, "cap": 20 },
  "picks": [
    {
      "rank": 1, "code": "2303", "name": "聯電", "group": "電子 / 半導體",
      "score": 85, "isHighConviction": true,
      "entryRef": 143.5,              // = pickDate 收盤（開盤報酬基準）
      "entryAggressive": 144.22, "stopLoss": 133.46, "target1": 150.68, "target2": 157.85,
      "tags": ["趨勢族群", "法人買超", "..."],
      "outcome": null                 // 由 grader 補上（見下）
    }
    // ... 至多 20 筆
  ]
}
```

**`outcome`**（grader 填入；picks 清單本身不動）：
```jsonc
{
  "nextOpen": 150.0, "nextClose": 148.0,
  "openPct": 4.53, "closePct": 3.14,
  "d1Close": 148.0, "d2Close": 151.0, "d3Close": 149.5,   // forDate(+0/+1/+2) 收盤；未到則 null
  "maxClosePctWithin3": 5.23,
  "openWin": true, "closeWin": true,
  "gradedOn": "2026-06-05",
  "source": "TWSE"                    // "TWSE" | "TPEx" | "missing"
}
```

**`summary.json`**（aggregator 由所有 `picks/*.json` 重算）：
```jsonc
{
  "updatedOn": "2026-06-05",
  "liveSince": "2026-06-05",          // 第一筆 live 快照的 forDate
  "segments": {
    "live":      { "all": Stats, "highConviction": Stats },
    "simulated": { "all": Stats, "highConviction": Stats }
  },
  "equityCurve": {                     // 每點 {date, ret, cumRet, samples}
    "live_highConviction": [ ... ], "live_all": [ ... ],
    "simulated_highConviction": [ ... ], "simulated_all": [ ... ]
  },
  "headline": Stats                    // = segments.live.highConviction（信任錨用）
}
// Stats = { days, samples, openWinRate, avgOpenPct, closeWinRate, avgClosePct,
//           cumOpenReturn, bestPick, worstPick, bestDay, worstDay, dateRange }
```
彙總一律**樣本加權**（與現行 `run_backtest` 的 sample-weighted 聚合一致）；`source=="missing"` 不計入分母。

### 4.3 腳本（TS，於每日 Action 執行；單一 CLI 多子命令）
`scripts/track_record/cli.ts <command>`（以 `tsx` 執行），共用 `src/lib/focus-picks.ts`、`src/lib/prices.ts`：
- `snapshot`：讀最新 daily（＋近 6 日），用 `generateFocusPicks` 取 top-20(≥50) 寫 `picks/{latest}.json`，`segment="live"`、`logicVersion=git short sha`。**冪等＋不可變**：該日 live 快照已存在則不覆寫。
- `grade`：掃所有「`forDate` 對應交易日資料已可取得、且 outcome 尚未補齊」的快照，用 `prices.ts` 抓真實 OHLC 補 `outcome`（含 forDate 之決定：採 pickDate 之後第一個有 daily 檔的交易日）。多日欄位尚未到者填 null，後續 run 可再補（picks 不變）。
- `aggregate`：由所有 `picks/*.json` 重算 `summary.json`。
- `backfill`：一次性／冪等。對每個歷史 daily 日期（其後存在下一個交易日 daily 檔者）以 `generateFocusPicks` 重建 `picks/{date}.json`，`segment="simulated"`，再 grade。**永不覆寫** live 快照。

### 4.4 每日自動化掛載（`.github/workflows/daily-update.yml`）
在 `Run real backtest` 步驟後、`Commit and push data` 前加入：
- `Setup Node`（`actions/setup-node@v4`，配合既有 `package.json`）＋ `npm ci`。
- `npx tsx scripts/track_record/cli.ts snapshot`
- `npx tsx scripts/track_record/cli.ts grade`
- `npx tsx scripts/track_record/cli.ts aggregate`
- `git add` 增加 `data/track-record/`。
- 既有 `if: steps.classify.outputs.data_found == 'true'` 守門沿用（非交易日不動作）。
- T+1 自然節奏：今天 snapshot 凍結 → 明天該 run grade 結算。

### 4.5 API + UI
- `src/app/api/track-record/route.ts`：回傳 `summary.json` ＋ 逐日明細（讀 `data/track-record/picks/*.json`，可分頁）；設快取標頭比照其他 API。
- `src/app/track-record/page.tsx` + `_client.tsx`：
  - **頭條卡**：live 高分群 — 開盤勝率、平均開盤報酬、樣本數、「自 {liveSince} 起真實追蹤」。
  - **段落切換**（真實前向 / 模擬回補）、**族群切換**（高分群 / 全部）。
  - **累積報酬曲線**（cumulative open return）。
  - **逐日明細表**：日期 → 當日勝率/平均；展開看每筆選股 + outcome（含 source 標記）。
  - **模擬段聲明**：明確標「模擬回補（以現行邏輯重算歷史，含未來函數風險）」；live 段標「真實前向（逐日定格、凍結當下邏輯）」。
- **信任錨**：focus 頁（`src/app/focus/_client.tsx`）顯示 live headline；公開版 LINE/landing **本次不動**（暫用現有 `realBacktest`）。

---

## 5. 兩段 / 兩群 / 誠實標註

- **segment**：`live`（逐日定格、不可重算）vs `simulated`（回補、會隨邏輯變動而不同）。UI 與資料永遠分開，**絕不**把 simulated 當成 live 對外呈現。
- **cohort**：`all`（top-20，≥50）vs `highConviction`（≥60，頭條）。
- 頭條/信任錨一律取 `live.highConviction`；live 樣本不足門檻時 UI 顯示「樣本累積中」而非灌水數字。

---

## 6. 邊界與錯誤處理

- **缺隔日價**（下市/暫停/查無）：`outcome.source="missing"`，不計入勝率分母（比照 `run_backtest` 的 `fetched`）。
- **TWSE 憑證/限流**：重試 + TPEx fallback；沿用既有 `User-Agent` 與節流（每檔間隔）。
- **非交易日 / 無新資料**：snapshot 不動作（受 `data_found` 守門）。
- **forDate 推定**：採 pickDate 之後第一個存在 daily 檔的交易日（以 daily 檔日曆為交易日曆）。
- **冪等 / 不可變**：live 快照存在則不重產；grade 只補 `outcome`（picks 清單恆不變）。multi-day 欄位可在後續 run 由 null 補實。
- **logicVersion**：snapshot 時以 `git rev-parse --short HEAD` 取得。

---

## 7. 測試策略（TDD）

> **前置**：repo 目前**無 TS 測試框架**（只有 scraper 的 Python pytest）。需先加 `vitest`（TS 測試 runner）與 `tsx`（執行 TS CLI 腳本）為 devDependencies，並在 `package.json` 加 `test` script、`vitest.config.ts`。

1. **重構安全（characterization / golden test）**：在重構 focus route **之前**，先以現有 `data/daily/` 跑現行 `/api/focus`，存下 `focusStocks` golden 輸出；斷言 `generateFocusPicks` 對同輸入**逐欄完全重現** → 守住「行為不變」。
2. **單元**：
   - `generateFocusPicks`：趨勢族群判定、處置/連板窗、`isHighConviction` 旗標、排序與 cap。
   - grading 數學：`openPct/closePct` 公式、`openWin/closeWin`、`maxClosePctWithin3`、`source=missing` 排除。
   - `aggregate`：樣本加權勝率＝wins/samples、equityCurve 累積、segment/cohort 切分。
   - 冪等性：重跑 snapshot 不覆寫既有 live；grade 不改 picks、只補 outcome。
3. **prices.ts**：解析 TWSE/TPEx 月資料 → date map（用既有測試風格的固定 fixture）。

---

## 8. 變更清單（供寫 plan 用）

**新增**
- `src/lib/focus-picks.ts`（選股組裝純函式）
- `src/lib/prices.ts`（TWSE/TPEx 抓價共用）
- `scripts/track_record/cli.ts`（snapshot/grade/aggregate/backfill）
- `src/app/api/track-record/route.ts`
- `src/app/track-record/page.tsx`、`src/app/track-record/_client.tsx`
- 測試：`src/lib/__tests__/focus-picks.test.ts`、grading/aggregate 測試、golden fixture
- 工具：`package.json` 加 devDeps `vitest`、`tsx` ＋ `test` script；`vitest.config.ts`
- 資料：`data/track-record/picks/*.json`、`data/track-record/summary.json`（由 backfill 產生；不手寫）

**修改**
- `src/app/api/focus/route.ts`（改用 `generateFocusPicks`，行為不變）
- `src/app/api/next-day/route.ts`（改用 `prices.ts`，行為不變）
- `src/app/focus/_client.tsx`（加 live 信任錨）
- `.github/workflows/daily-update.yml`（加 Node + 三個 track-record 步驟 + git add）
- `components`/導覽：把 `/track-record` 加入 NavBar（沿用既有導覽 pattern）

**標記 legacy（不刪）**
- `scripts/run_backtest.py`、`src/app/backtest/*`、`data/backtest.json`

---

## 9. 風險

- **重構動到核心頁**：以 golden test + 小步重構降風險；focus 是高流量頁。
- **CI 增加 Node 步驟**：runner 已有 Node（deploy 步驟用 npm）；需 `npm ci` 時間成本可接受。
- **回補的未來函數**：simulated 段以現行邏輯重算歷史，本質含 look-ahead；以明確標註與「兩段分離」處理，不對外當真實戰績。
- **live 初期樣本少**：頭條以「樣本累積中」處理，公開錨延後切換。
- **新增測試/執行工具**：repo 無 TS 測試 runner，需引入 `vitest` + `tsx`（標準、輕量；一次性建置成本）。

---

## 10. 成功標準

- `/track-record` 能同時呈現 simulated（回補，有料可看）與 live（上線起累積）兩段、兩群，數字內部自洽且可由 `picks/*.json` 逐筆稽核。
- focus 頁顯示 live 高分群信任錨（樣本足時）。
- 每日 Action 自動 snapshot→grade→aggregate→commit，無人工介入。
- 重構後 `/api/focus` 行為與重構前逐欄一致（golden test 綠）。
- 既有 `run_backtest` 漂移問題不再影響戰績（戰績走 TS 單一真相）。
