# 09:03 紅K進場策略回測 — 設計文件

- 日期：2026-06-26
- 狀態：設計待確認
- 相關：`scripts/run_backtest.py`（現有精選勝率回測）、`src/app/backtest`（指標回測頁）、`src/lib/scoring.ts`（選股邏輯）

---

## 1. 背景與目標

平台首頁「精選追蹤標的」= 綜合評分 ≥ 50 的股票（`scoreStock`）。現有 `data/backtest.json` 測的是「**今日收盤買 → 隔日開盤/收盤賣**」。

使用者要測一個更貼近實戰的進場法：

> 隔日（D+1）09:03 當下，若是**紅K（現價 > 當日開盤）**且**高於昨天收盤價**，才在 09:03 買進；否則不進場。

出場規則由本設計「**跑多種規則、挑期望值最佳**」決定。

目標：在 `/backtest` 頁新增一個「09:03 紅K進場策略」常駐區塊，用**永豐 Shioaji 真實 1 分 K** 回測過去所有精選標的，誠實呈現勝率／期望值／最佳出場規則，並標註過擬合與樣本限制。

---

## 2. 策略定義（精確版）

### 2.1 選股池（每個交易日 D）
- 對 `data/daily/{D}.json` 跑與 `src/lib/scoring.ts` 完全一致的 `scoreStock`（`run_backtest.py` 已鏡像此邏輯，本案沿用同一套）。
- 取 **score ≥ 50 全部**（不設上限，對齊使用者畫面上的「精選追蹤標的 綜合評分 ≥ 50」）。`PICK_THRESHOLD=50`、`PICK_CAP=None`（可設定）。

### 2.2 進場（隔一個交易日 D+1，09:03）
對每檔精選標的，抓 D+1 的 1 分 K：
- `O` = D+1 當日開盤價（當日第一根 1 分 K 的 Open）
- `P0903` = ts 時間為 **09:03:00** 那根 1 分 K 的 Close（開盤後 3 分鐘現價）；若該根缺漏，取 ≤ 09:03 最近一根；若 09:06 前都無成交 → 視為無資料、跳過。
- `prevClose` = `closeD`（來自 `data/daily/{D}.json`，已有）
- **進場條件**：`P0903 > O`（紅K）**且** `P0903 > prevClose`（高於昨收）
- 兩條件皆成立 → 以 `entry = P0903` 買進（假設無滑價，可設定 slippage）；否則本檔當日不進場。

> 註：若 D+1 跳空鎖漲停且不打開，`P0903 ≈ O`（持平於漲停），`P0903 > O` 不成立 → 自然不進場（買不到也合理）。

### 2.3 出場（候選規則，全部回測後挑最佳）
所有規則皆「D+1 09:03 以 `entry` 買進」後：
1. **當沖收盤**：D+1 收盤價賣出（`closeD1`）。
2. **隔日開盤**：D+2 開盤價賣出（`openD2`）。
3. **隔日收盤**：D+2 收盤價賣出（`closeD2`）。
4. **停利停損網格（當沖）**：停利 TP ∈ {3,5,7,10}% × 停損 SL ∈ {2,3,5}%（共 12 組）。掃 D+1 09:03 之後的 1 分 K：
   - 先觸發 `low ≤ entry×(1−SL)` → 以停損價出場；先觸發 `high ≥ entry×(1+TP)` → 以停利價出場。
   - 同一根 K 同時觸及停利停損 → **假設先停損**（保守）。
   - 收盤前都沒觸發 → D+1 收盤平倉。

### 2.4 交易成本（淨報酬以此為準）
台股實際成本，挑最佳一律看**淨報酬**：
- 手續費：買賣各 0.1425%（`commission`，可設折數，預設 1.0）
- 證交稅：**當沖賣出 0.15%**；**非當沖（隔日）賣出 0.30%**
- `netReturn = exit×(1 − commission − tax) / (entry×(1 + commission)) − 1`
- 同時計算 gross（不含成本）供對照。

---

## 3. 資料來源：永豐 Shioaji

- Python 套件 `shioaji`，登入後抓歷史 1 分 K。
- 登入：`api.login(api_key=KEY, secret_key=SECRET)`（抓 K 線**不需** .pfx 下單憑證）。
- 合約：`api.Contracts.Stocks[code]`（上市 TSE／上櫃 OTC 皆可由代碼取得）。
- K 線：`api.kbars(contract, start="YYYY-MM-DD", end="YYYY-MM-DD")` → 轉 `pandas.DataFrame`，欄位 `ts/Open/High/Low/Close/Volume`，`ts` 為奈秒，需 `pd.to_datetime`。
- 結束 `api.logout()`。
- **限制**：免費額度有每日資料下載上限與 rate limit → 以本地快取（§5）避免重抓；每次請求間 sleep。
- **憑證**：`SHIOAJI_API_KEY` / `SHIOAJI_SECRET_KEY`，本地放 `.env.local`，自動化放 GitHub Secret。
- **首跑驗證項**：確認 Shioaji 1 分 K 的 `ts` 標記方式（區間起點 vs 終點），據以鎖定「09:03 那根」的正確定義；確認歷史 K 線可回溯到最早的 daily 檔（2026-03-20）。覆蓋不足則誠實縮短回測期間並於報告標明。

---

## 4. 系統架構與元件

沿用現有架構：**Python 離線腳本算 → 寫 JSON → Next.js 前端讀**。

```
data/daily/*.json ─┐
                   ├─► scripts/run_backtest_0903.py ──► data/backtest_0903.json ──► /backtest 頁新區塊
Shioaji 1分K ──────┘            │
                               └─► data/intraday_cache/{code}_{date}.json（K線快取）
```

元件（每個職責單一、可獨立測試）：

| 元件 | 職責 | 輸入 → 輸出 |
|---|---|---|
| `picks_for_day(daily, rev, ...)` | 重用既有選股邏輯產出某日 ≥50 標的 | daily JSON → [pick] |
| `shioaji_client`（薄封裝＋快取） | 抓某檔某日 1 分 K、D+2 開盤 | (code,date) → bars / None |
| `entry_signal(bars, prevClose)` | 算 O、P0903、判斷進場 | bars → {entered, entry, open, p0903} 或 None |
| `simulate_exit(entry, bars, nextOpen, rule)` | 單一規則出場、回傳報酬 | → returnPct(gross/net) |
| `metrics(returns)` | 勝率/期望值/中位數/最大回檔/獲利因子/最大單筆 | [ret] → dict |
| `pick_best(rule_results)` | 依淨期望值挑最佳＋穩健性檢查 | {rule→metrics} → best |
| `main()` | 串接、寫 `backtest_0903.json` | — |

> `picks_for_day` 應從 `run_backtest.py` 抽出共用，避免兩支腳本選股邏輯漂移（目前 `run_backtest.py` 的 `score_stock` 已鏡像 TS；本案抽成可重用函式，兩邊共用）。

---

## 5. 本地快取

- 路徑：`data/intraday_cache/{code}_{YYYY-MM-DD}.json`，存該檔該日 1 分 K（精簡欄位 `ts,open,high,low,close`）。
- 重跑時先讀快取，命中即不打 Shioaji（省額度、可離線重算不同出場網格）。
- 加入 `.gitignore`（快取不進版控；體積可能大）。

---

## 6. 輸出 JSON schema（`data/backtest_0903.json`）

```jsonc
{
  "updatedAt": "2026-06-25",
  "dateRange": { "start": "2026-03-21", "end": "2026-06-25" },
  "tradingDays": 60,
  "pickThreshold": 50,
  "pickCap": null,
  "fees": { "commission": 0.001425, "dayTradeTax": 0.0015, "overnightTax": 0.003, "slippage": 0 },
  "funnel": { "totalPicks": 331, "passedFilter": 180, "traded": 175, "noData": 5 },
  "rules": [
    {
      "key": "daytrade_close", "label": "當沖收盤", "params": {},
      "trades": 175, "winRate": 58, "avgReturnNet": 1.2, "avgReturnGross": 1.7,
      "medianReturn": 0.8, "totalReturnNet": 210, "maxDrawdown": 14, "profitFactor": 1.6,
      "maxWin": 9.9, "maxLoss": -7.2
    }
    // ... 隔日開盤 / 隔日收盤 / 12 組 TP×SL
  ],
  "best": { "key": "tp5_sl3", "label": "停利5%/停損3%(當沖)", /* metrics */ "caveat": "TP/SL 為樣本內最佳化，有過擬合風險" },
  "robustness": { "firstHalfBest": "...", "secondHalfBest": "...", "consistent": true },
  "trades": [
    { "dPick": "2026-06-23", "dEntry": "2026-06-24", "code": "5464", "name": "霖宏", "score": 86,
      "prevClose": 100.0, "open": 101.0, "p0903": 102.5, "entry": 102.5,
      "dayHighAfter": 110.0, "dayLowAfter": 101.0, "dayClose": 108.0, "nextOpen": 107.0 }
    // 每筆「有進場」的交易；前端／任何人可由此重算任一出場規則
  ],
  "methodology": "永豐 Shioaji 真實 1 分 K。選股池=當日 score≥50 全部；隔日 09:03 紅K(現價>開盤)且高於昨收才進場；多種出場規則回測，依淨期望值挑最佳。成本：手續費0.1425%、當沖稅0.15%/隔日稅0.3%。"
}
```

`trades` 只存「有進場」的交易，欄位足以重算任一出場規則（透明、檔案精簡）。規則級彙總由腳本算好。

**funnel 欄位定義**（皆為跨所有回測日的累計）：
- `totalPicks`：所有「存在 D+1」的精選標的（score≥50）總數。
- `noData`：其中 D+1 無 1 分 K 或 09:06 前無成交、無法評估者。
- `passedFilter`：可評估者中，09:03 紅K且高於昨收（進場條件成立）的檔數。
- `traded`：實際成交筆數（= `passedFilter`，且能取得至少一種出場價）。`passedFilter − traded` 為極端缺出場資料者。

---

## 7. 最佳策略選擇方法論（含過擬合處理）

- 候選：當沖收盤、隔日開盤、隔日收盤、TP×SL 12 組（當沖）。
- 排序：**淨期望值（avgReturnNet）** 由高到低；同分依 獲利因子 → 勝率。
- 門檻：可當「最佳」者須 `trades ≥ 30`，否則標 low-confidence。
- **過擬合誠實標註**：TP/SL 網格是樣本內最佳化 → `best.caveat` 明說；同時把**當沖收盤／隔日**這類無參數規則當穩健基準呈現。
- **穩健性檢查**：樣本前半／後半各自挑最佳，記錄是否一致（`robustness.consistent`）；不一致代表最佳規則不穩、需保守看待。
- 完整規則比較表全部呈現，不只給一個數字。

---

## 8. 邊界情況與錯誤處理

| 情況 | 處理 |
|---|---|
| D+1 無 1 分 K（停牌/無資料） | 跳過，計入 `funnel.noData` |
| 09:03 前無成交 | 取 ≤09:03 最近一根；09:06 前皆無 → 跳過 |
| 進場條件不符 | 不進場，計入 funnel（passedFilter 不增） |
| 開盤鎖漲停不打開 | `P0903≈O`，紅K 不成立 → 不進場 |
| TP/SL 同根同時觸發 | 假設先停損（保守） |
| 最後一天無 D+1 | 該 D 不納入 |
| 隔日出場但無 D+2 | 該筆僅排除於「隔日」規則 |
| Shioaji 登入/額度失敗 | 明確報錯中止，不寫半套 JSON；已抓快取仍可用 |

---

## 9. 前端整合（`/backtest` 頁新增區塊）

- 在 `/backtest` 頁頂部新增「09:03 紅K進場策略」區塊（既有 EMA/KD/MACD/RSI 互動回測器保留於下方）。
- 此區塊為**靜態報告**（如同 `data/backtest.json` 的呈現方式），非互動參數頁。
- 讀取：以 `/api/backtest-0903` route 讀 `data/backtest_0903.json`（或 server component 直接讀檔），回前端。
- 內容：
  - 最佳規則 KPI 卡（沿用 `KpiCard`）：勝率、淨期望值、總報酬、最大回檔、交易筆數。
  - **出場規則比較表**：所有候選規則的指標，最佳列高亮 + caveat。
  - **進場漏斗**：精選 N → 通過濾網 M → 實際成交。
  - **交易明細表**（沿用既有表格樣式）：日期/代碼/名稱/分數/進場價/出場價/報酬。
  - 標註：資料來源、期間、樣本數、過擬合與樣本限制免責。
- 沿用既有 `KpiCard`/`StatCell` 與 Tailwind 變數，不新造設計語言。

---

## 10. 自動化（Phase 2，先本地驗證）

- Phase 1：本地以 `.env.local` 憑證跑 `run_backtest_0903.py`，驗證 Shioaji 取數與報告正確。
- Phase 2：GitHub Action 在每日資料更新後加一步跑此腳本（`SHIOAJI_*` 放 Secret，runner 安裝 `shioaji`）。Shioaji 在 CI 的登入與額度需實測；先不阻擋 Phase 1。

---

## 11. 測試策略（pytest，沿用 `scripts/test_*.py` 風格）

純函式單元測試（不打線上 API，Shioaji 取數以 mock 餵假 bars）：
- `entry_signal`：紅K且高於昨收 / 只紅K不過昨收 / 跳空鎖漲停 / 09:03 缺漏 等案例。
- `simulate_exit`：當沖收盤、隔日、TP 先到、SL 先到、同根同觸（先停損）、皆未觸發收盤平倉，逐一以手算值驗證。
- 成本模型：當沖稅 vs 隔日稅、手續費計算正確。
- `metrics`：勝率/期望值/最大回檔/獲利因子 對照手算。
- `pick_best`：排序與 `trades≥30` 門檻、穩健性切半邏輯。

---

## 12. 不做（YAGNI）

- 不做盤中即時 09:03 警示（未來題）。
- 不做 09:03 策略的互動參數 UI（先靜態報告，與 `data/backtest.json` 同級）。
- 不做 tick 級（1 分 K 足夠）。
- 不做多進場時點掃描（09:05/09:10…）；列為未來可選延伸。

---

## 13. 待使用者確認 / 需提供

1. **永豐 Shioaji 憑證**：`SHIOAJI_API_KEY` / `SHIOAJI_SECRET_KEY`（執行前提供，放 `.env.local`）。
2. **手續費折數**：預設標準 0.1425%（折數 1.0）；若你有永豐折扣再調 `commission`。
3. **回測期間**：預設「所有有 1 分 K 覆蓋的 daily 檔」（約 2026-03-21 起）；覆蓋不足則自動縮短並標明。
4. **選股池上限**：預設全部 ≥50（無上限），與畫面一致；如要設上限再說。
