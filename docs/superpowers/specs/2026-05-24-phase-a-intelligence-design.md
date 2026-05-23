# Phase A — 智慧深化（AI Narrative + 資金 Heatmap）設計

**日期：** 2026-05-24
**作者：** Claude（與用戶 brainstorming）
**狀態：** Draft → 待用戶確認
**前置：** `2026-05-22-focus-filterbar-design.md` 已上線

---

## 1. 目標 (Why)

讓 `/focus` 頁面從「機械評分排行」升級為「有觀點的盤後分析師」：

- **AI 每日 narrative**：4–5 句盤後解讀 + 隔日關注 + 風險點，讓非專業用戶秒懂今天市場
- **Per-stock AI 簡評**：每檔精選追蹤標的旁附 60–80 字解讀，回答「為什麼選這檔」
- **主力資金 7 日 heatmap**：把已有的 `major_net` 從個股維度提升到「產業 × 7 日」矩陣，一眼看資金從哪流向哪
- **LINE 觀察名單擴充**：把 narrative 內容塞進每日輸出檔，給客戶更高密度的價值

## 2. 範圍 (Scope)

### 包含
- 新檔案 `data/narrative/YYYY-MM-DD.json`，由 **Claude Code session 內的 Claude 直接產出**（不接外部 LLM API）
- 自製 slash command `.claude/commands/narrative.md`，使用者打 `/narrative` 即觸發產出
- 新 API route `/api/narrative/[date]` 與 `/api/narrative/latest`
- `/focus` 頁面新增三個區塊：
  - 頂部 AI Narrative 卡片（summary + leading_groups + tomorrow_watch + risk）
  - 主力資金 7 日 heatmap 區塊（產業 × 日期 × 淨額）
  - 每個 topPick 卡片內加 AI 簡評（若有）
- `scripts/generate_line_post.py` 整合 narrative 內容到輸出 txt + png

### 不包含
- **不接 Claude API、不裝 `@anthropic-ai/sdk`、不設 `ANTHROPIC_API_KEY` secret**
- **不改變既有評分演算法**
- **不爬新資料**（heatmap 用 `major_net` 既有欄位聚合，不抓分點）
- 分點主力（A3）延後到 Phase A.5
- 不做自動排程（GitHub Action 不跑 narrative；由人工或未來 cron 觸發）

## 3. 設計細節

### 3.1 Narrative JSON Schema

`data/narrative/2026-05-24.json`：

```json
{
  "schema_version": 1,
  "date": "2026-05-24",
  "source_daily_date": "2026-05-24",
  "generated_at": "2026-05-24T17:30:00+08:00",
  "generated_by": "claude-code-session",
  "provider": "anthropic-claude",
  "summary": "今日加權收 40,020 點 +0.20%，外資賣超 466 億，投信加碼 102 億。電子權值整理，光通訊與生技續強，市場資金往中小型輪動。",
  "leading_groups": ["電子/半導體", "光通訊/矽光子", "生技/醫療器材"],
  "tomorrow_watch": "聚焦 4916 事欣科（光通訊龍頭，營收 YoY +50%）、3090 日電貿（半導體連 3 日強勢）。族群延續性以 IC 設計觀察是否擴散。",
  "risk": "今日有 8 檔出現空吞警示，其中 2330 為權值股需特別留意。明日若 TAIEX 跌破 39,800 短線進入修正格局。",
  "stocks": {
    "4916": "光通訊龍頭，營收 YoY +50.2%、主力連 2 日買超 586 張、族群延續 2 天，技術面突破收極強。建議 90.35 追價、87.2 承接、停損 83.61。",
    "3090": "半導體連 3 天強勢族群龍頭，營收 YoY +28.1%、主力買超 109 張。族群完整度高，順勢操作為主。"
  }
}
```

**Schema 版本說明：**
- `schema_version: 1` — 為未來增加外部 LLM fallback 預留遷移欄位
- `source_daily_date` — 此 narrative 引用哪一天的 daily JSON；用於 staleness 判斷
- `provider` — 產出來源；目前固定 `"anthropic-claude"`，未來可能 `"openai"`、`"local"` 等
- `stocks[code]` 若缺，前端視為「該檔無 AI 簡評」（正常情況，前 10 名以外可缺）

**規則：**
- `summary`：100–150 字繁體中文，含 TAIEX 數據 + 法人三大 + 主流族群判讀
- `tomorrow_watch`：60–100 字，3–5 檔具體標的 + 族群延續性判斷
- `risk`：40–80 字，空吞警示 + 技術面關鍵價位
- `stocks[code]`：60–100 字，含上榜理由 + 操作節奏（追價/承接/停損價位可參考既有 `entryAggressive` 等欄位）
- `stocks` 至少涵蓋 topPicks 前 10 名

### 3.2 `/narrative` Slash Command

`.claude/commands/narrative.md`：

```markdown
# /narrative — 產出今日盤後 AI Narrative

執行步驟：

1. 讀取 `data/daily/` 內最新的 JSON（即今日資料）
2. 抓 `/api/focus` 取得 topPicks（須先確認 dev server 是否在跑；不在跑就讀 daily 自行 score）
3. 依 `docs/superpowers/specs/2026-05-24-phase-a-intelligence-design.md` 第 3.1 節 schema 產出 narrative
4. 寫入 `data/narrative/{date}.json`
5. 跑 `python scripts/generate_line_post.py` 重生 LINE 貼文（含 narrative）
6. `git add data/narrative/ line_post/` 並提交：「feat(narrative): 產生 {date} AI 盤後分析」
7. `git push` 觸發 Vercel 部署

撰寫指引：
- 語氣中性、有觀點，不過度推薦
- 主流族群以「延續性」+「強度」綜合判斷
- 風險點優先強調空吞警示與技術破位
- per-stock 簡評以「客觀數據 + 操作建議」結構
- 不可預測股價、不可保證獲利
```

### 3.3 API Routes

`src/app/api/narrative/[date]/route.ts`：
- GET → 讀 `data/narrative/{date}.json`，回傳 JSON 或 404
- 與 `/api/daily/[date]` 結構鏡像

`src/app/api/narrative/latest/route.ts`：
- GET → 取 `data/narrative/` 內最新檔
- 同時讀 `data/daily/` 取最新交易日 date
- 比對 `narrative.source_daily_date` vs latest daily date：
  - 相同 → 回傳 `{ ...narrative, stale: false }`
  - 不同（narrative 比 daily 舊）→ 回傳 `{ ...narrative, stale: true, latest_daily_date: "..." }`
- narrative 完全不存在時回 404

### 3.4 前端整合

**新元件 `src/app/focus/_narrative.tsx`：**
```tsx
export interface Narrative {
  schema_version: number;
  date: string;
  source_daily_date: string;
  generated_at: string;
  generated_by: string;
  provider: string;
  summary: string;
  leading_groups: string[];
  tomorrow_watch: string;
  risk: string;
  stocks: Record<string, string>;
  stale?: boolean;                   // API 注入
  latest_daily_date?: string;        // API 注入，stale=true 時帶
}

export function NarrativeCard({ narrative }: { narrative: Narrative }) {
  // 顯示：summary / leading_groups (chip) / tomorrow_watch / risk
  // stale=true 時頂部顯示黃色橫條：「⚠️ 此分析基於 {source_daily_date}，最新交易日為 {latest_daily_date}，建議重新產出」
  // 樣式：top of /focus 主視覺，漸層 background，AI icon
}
```

**位置：** `_client.tsx` 中插在「市場概覽 4 格」與「真實回測」之間。

**每檔股票 AI 簡評：** topPick 卡片內、tags 下方，渲染：
```tsx
{narrative?.stocks?.[s.code] && (
  <div className="mt-2 px-2 py-1.5 bg-amber/5 border-l-2 border-amber/40 italic text-[11px] text-txt-2">
    💬 {narrative.stocks[s.code]}
  </div>
)}
```

**SWR 整合：** `/api/focus` 不動，新增 `useSWR<Narrative>('/api/narrative/latest', ...)`。

### 3.5 主力資金 7 日 Heatmap（A4）

**新元件 `src/app/focus/_heatmap.tsx`：**

**資料來源：純前端聚合。** 由 API 端做：

`src/app/api/focus/route.ts` 回傳新欄位 `industryFlow`：
```ts
industryFlow: {
  dates: ["05-14", "05-15", "05-18", "05-20", "05-21", "05-22", "05-23"],  // 實際可取得的交易日，最多 7 天
  industries: ["電子/半導體", "光通訊/矽光子", ...],
  matrix: (number | null)[][]   // industries.length × dates.length；null = 該產業當日無資料；0 = 有資料但淨額為 0
}
```

**算法：**
- 取 `data/daily/` 內最新 N 個檔（N = min(7, 可取得檔數)）
- 每天遍歷 `groups[].stocks[].major_net` 按 `groups[].name` 加總
- 該產業當日完全沒在 daily 出現 → matrix 值 `null`
- 出現但 `major_net` 全為 0 或缺失 → matrix 值 `0`
- `null` vs `0` 區分讓 UI 能顯示「無資料」灰色 vs「有資料淨額為 0」中性色

**部分覆蓋處理：**
- 即使僅 3 天可用也要 render（標題顯示「主力資金 {N} 日流向」而非寫死 7）
- 完全 0 天可用（從未跑過 classify）→ 隱藏整個區塊

**UI 渲染：**
- 7×N 矩陣（N = 出現過的產業數，最多 12）
- 每格顏色：紅色淨買、綠色淨賣，飽和度依絕對值
- hover tooltip 顯示「2026-05-20 電子/半導體 主力 +2,847 張」
- 標題：「主力資金 7 日流向 — 紅買綠賣」

### 3.6 LINE 貼文整合

`scripts/generate_line_post.py` 修改：
- 若 `data/narrative/{date}.json` 存在 → 在 txt 開頭插入 narrative.summary + tomorrow_watch + risk
- png 圖片不變（先不渲染文字到圖片，避免字數爆版）

### 3.7 錯誤處理 / Fallback

| 情境 | 處理 |
|------|------|
| `data/narrative/` 完全沒檔 | API `/latest` 回 404；UI NarrativeCard 整段隱藏（既有頁面不受影響） |
| narrative 存在但 stale（`source_daily_date < latest_daily_date`）| API 回 200 + `stale: true`；UI 渲染內容 + 頂部黃色警示橫條 |
| `industryFlow.matrix` 全為 null（從未跑過 classify）| heatmap 整段隱藏 |
| `industryFlow.matrix` 部分有資料 | 正常渲染，標題寫實際天數，缺資料格用灰色 |
| `narrative.stocks[code]` 缺某檔 | 該檔卡片不顯示 AI 簡評（正常情況，前 10 名以外可缺） |
| `major_net` 欄位為 `undefined` | 視為 0 處理；`null` 則保留 null 語義 |

### 3.8 隱私 / 安全

- narrative 全是公開市場資料判讀，無用戶 PII
- `/narrative` slash command 寫入後 git push，內容公開於 repo（合理）
- API route 維持既有 middleware 認證（已有 JWT gate）

## 4. 測試 / 驗證

無自動測試框架，採以下手動驗證：

1. **Schema 正確性**：跑 `/narrative` 一次 → 檢查 JSON 5 個必填欄位都齊全、stocks 至少 10 筆
2. **API**：`curl /api/narrative/2026-05-24` → 200 + JSON 內容；不存在日期 → 404
3. **UI**：dev server 開 `/focus`，確認三個新區塊顯示；narrative 不存在時整段消失而非破版
4. **Heatmap**：hover 任一格顯示正確 tooltip；色階對應金額方向
5. **LINE 貼文**：narrative 存在 → txt 含 summary；不存在 → txt 維持原格式
6. **生產**：push → Vercel → 三個區塊在 https://limit-up-radar.vercel.app/focus 上正確顯示

## 5. 風險與權衡

| 風險 | 緩解 |
|------|------|
| narrative 未產出當天 /focus 看不到 AI 內容 | UI fallback 完整隱藏，不破版；使用者只是看不到「新功能」，舊內容全保留 |
| heatmap 對行動裝置太擠 | mobile 改為橫向 scroll，每日一行 |
| AI 簡評過於樂觀導致投資建議責任 | narrative 撰寫指引明訂「不可預測、不可保證」；UI 已有免責聲明 |
| `/narrative` 需要人工觸發 | 接受；未來可升級為 GitHub Action + 排程 |

## 6. 上線步驟

1. 寫 spec ✅
2. 寫 plan（writing-plans skill）
3. 依 plan 派 subagent 實作
4. 本地 dev 驗證 → push → Vercel 部署
5. 用戶第一次跑 `/narrative` 產今日資料 → 確認 /focus 上線版三區塊都活著

---

**下一步：** 用戶 review → writing-plans → subagent-driven-development 執行。
