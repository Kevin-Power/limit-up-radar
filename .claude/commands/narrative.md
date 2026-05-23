---
description: 產出今日盤後 AI Narrative，寫入 data/narrative/{date}.json，重生 LINE 貼文並 push
---

執行步驟（請逐步完成、不要省略）：

## 1. 確認最新交易日

```bash
ls data/daily/*.json | sort | tail -1
```

取最新檔的 date 部分作為 `{date}`（格式 `YYYY-MM-DD`）。

## 2. 讀取今日資料

- 讀 `data/daily/{date}.json` — `market_summary`（TAIEX/外資/投信/自營）、所有 `groups` 與其 `stocks`、`bearish_engulfing`
- 從 `/api/focus`（如本地 dev server 在跑可 curl）或自行掃 daily JSON 計算評分取得 topPicks 前 10–15 名
- 若 dev server 沒跑，可直接讀 `data/categories.json` 取得權值股清單；自己依 `src/lib/scoring.ts` 邏輯算 score

## 3. 撰寫 narrative JSON

依 `docs/superpowers/specs/2026-05-24-phase-a-intelligence-design.md` 第 3.1 節 schema 撰寫：

```json
{
  "schema_version": 1,
  "date": "{date}",
  "source_daily_date": "{date}",
  "generated_at": "{現在 ISO timestamp，含 +08:00}",
  "generated_by": "claude-code-session",
  "provider": "anthropic-claude",
  "summary": "...",
  "leading_groups": [...],
  "tomorrow_watch": "...",
  "risk": "...",
  "stocks": { "{code}": "...", ... }
}
```

### 欄位撰寫指引

- **`summary`**：100–150 字繁體中文。含 TAIEX 數據（點數、漲跌幅）+ 法人三大（外資/投信/自營淨額）+ 主流族群判讀 + 量能觀察
- **`leading_groups`**：3–4 個今日強勢族群（從 `groups` 中挑出，依股票數 × 延續天數綜合排序）
- **`tomorrow_watch`**：60–100 字。指出 3–5 檔具體標的（代號 + 名稱 + 上榜理由），加上族群延續性判斷（哪個族群可能擴散、哪個可能熄火）
- **`risk`**：40–80 字。優先強調空吞警示（從 `bearish_engulfing` 中挑出最危險的 1–2 檔）+ 技術破位關鍵價位（TAIEX 跌破某點位的後果）
- **`stocks`**：**至少前 10 名 topPicks**，每檔 60–100 字。結構：
  - 上榜理由（族群強度、營收、主力買賣超、連板天數其中之一或多項）
  - 操作建議（追價/承接/停損價位 — 可從 `calculatePriceLevels()` 邏輯推算或直接引用 entryAggressive/entryPullback/stopLoss）

### 撰寫守則

- 語氣中性、有觀點、不過度推薦
- 主流族群以「延續性」+「強度」綜合判斷，不是只看今天爆出多少檔
- 風險點優先強調空吞警示與技術破位
- **嚴禁**：預測明日價格、保證獲利、暗示明牌、用「飆股」「絕對」等情緒性字眼
- 結尾不需要免責聲明（前端 NarrativeCard 已加）

## 4. 寫檔

寫入 `data/narrative/{date}.json`，UTF-8、`indent=2`、`ensure_ascii=False`。

## 5. 重生 LINE 貼文

```bash
python scripts/generate_line_post.py
```

此步驟會自動讀剛剛產的 narrative 並 prepend 到 `line_post/{next_date}_觀察名單.txt`。

## 6. Commit + push

```bash
git add data/narrative/ line_post/
git commit -m "feat(narrative): 產生 {date} AI 盤後分析"
git push
```

Vercel 自動部署後，`https://limit-up-radar.vercel.app/focus` 頂部會出現「🤖 AI 盤後分析」卡片，每檔精選追蹤標的下方會顯示對應 AI 簡評。

## 7. 驗證上線

```bash
sleep 90 && curl -s -c /tmp/c.txt -X POST "https://limit-up-radar.vercel.app/api/auth/login" -H "Content-Type: application/json" -d '{"password":"AUTH_PASSWORD_HERE"}' -o /dev/null && curl -s -b /tmp/c.txt "https://limit-up-radar.vercel.app/api/narrative/latest" | python -c "import json,sys; d=json.load(sys.stdin); print({'date':d.get('date'),'stale':d.get('stale'),'stocks':len(d.get('stocks',{}))})"
```

Expected：`{'date': '{date}', 'stale': False, 'stocks': 10+}`
