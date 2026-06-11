# 公開版 LINE 貼文格式 — 設計 Spec

**日期**：2026-06-01
**狀態**：設計已確認，待實作
**範圍**：`scripts/generate_line_post.py` 新增公開發佈版輸出

---

## 1. 背景與目標

現有 `generate_line_post.py` 產出的 txt/png 是「私房版」——寫給**已認識平台、已登入**的人看。

目標：產出一個**不綁定特定通路的通用公開版**，讓陌生人在 LINE/Threads/FB/Dcard 等任何地方看到都有感，並能追蹤反應來源。用途是**手動轉貼驗證需求**（MVP 階段，先確認「內容有沒有人要」）。

**非目標**：自動 push、串接 LINE 官方帳號 API、跨平台自動發佈、PNG 公開版（v2 再做，先文字版）。

## 2. 已確認的決策

| 維度 | 決策 |
|------|------|
| 發佈通路 | 通用公開版，手動轉貼（不綁通路） |
| 內容策略 | **全給 + 輕導流**：完整名單/價位/AI 簡評公開，CTA 一行導流 |
| 合規語氣 | **中性陳述 + 強免責**：保留價位但中性措辭 + 開頭標註 + 結尾強免責 |
| 實作方式 | 同檔新增獨立函式 `build_public_text()` + `--public` flag |

## 3. 私房版 → 公開版的關鍵差異

1. **開頭價值主張**：陌生人不知道這是什麼。加一行自我介紹 + 免費聲明。
   例：`📡 漲停雷達｜每天盤後幫你把漲停股分好族群、抓出明天值得關注的，免費`
2. **回測數據前移當信任錨**：`{totalSamples} 樣本 / 勝率 {avgOpenWinRate}%` 是陌生人唯一願意往下看的理由，位置提前、更醒目。
3. **CTA 換落點**：現有導 `limit-up-radar.vercel.app`（撞密碼牆，公開讀者看不到）→ 改導**公開的** `/landing`，並加 UTM。
4. **去掉會員語氣**：移除假設「你是訂閱者」的措辭。

## 4. CTA + 追蹤

- CTA 連結：`https://limit-up-radar.vercel.app/landing?utm_source=social&utm_medium=post`
- 追蹤方式：Vercel Analytics 的 **referrer**（LINE/Threads/FB 來源不同）+ UTM 維度。**Hobby 方案 referrer 可用**，不需 custom events。
- 要分平台精準追蹤，手動換 `utm_source=line`/`threads` 即可（驗證期一個通用值就夠）。

## 5. 合規處理（中性陳述 + 強免責）

公開發佈具體個股 + 目標價在台灣可能觸及《證券投資信託及顧問法》非法薦股灰色地帶（即使免費、即使有免責）。處理：

- **開頭標註**：`本內容為個人交易紀錄與資料整理分享，非投顧服務，未收費，不構成個股推薦`
- **價位中性化**：保留價位數字，但措辭從指示語氣（「✓ 進場 09:00」）改為中性描述（「參考價位：追 X／停 Y／標 Z」「紀律提醒：…」）
- **結尾強免責**：保留現有三條，並補一條完整聲明（非投顧服務、未收費、不構成買賣要約、依此操作風險自負）
- narrative_block 內容本身已要求中性、禁明牌（見 `.claude/commands/narrative.md` 撰寫守則），維持原樣。

## 6. 排版

優化成「手機一屏好截圖」：分隔線精簡、emoji 層級清楚、單檔資訊密度比私房版略降（陌生人比熟客需要更少噪音）。

## 7. 實作方式（Approach C）

- 在 `generate_line_post.py` 內**新增** `build_public_text(d, picks, next_day)` 函式，與現有 `build_text()` 並存。
- `main()` 加 `--public` flag：
  - 不帶 `--public`：行為**完全不變**，產 `{next_day}_觀察名單.txt` + `.png`（私房版）
  - 帶 `--public`：產 `{next_day}_公開版.txt`（文字版優先；PNG 公開版列為 v2）
- 資料抓取（`fetch_focus_online` / `fetch_focus_local`）共用，只抓一次。
- `build_public_text()` 可複用 `short_g`、`next_trading_day`、tier 分層、`load_narrative_for` 等既有 helper。

## 8. 驗收條件

- [ ] `python scripts/generate_line_post.py --public` 產出 `line_post/{next_day}_公開版.txt`
- [ ] 不帶 `--public` 時，私房版輸出與行為**完全不變**（回歸驗證）
- [ ] 公開版含：開頭價值主張 + 個人紀錄聲明、回測信任錨前移、`/landing?utm_source=...` CTA（無密碼牆連結）、中性價位語氣、結尾強免責
- [ ] 公開版可直接複製貼到 LINE/Threads 等純文字環境，無亂碼、無斷字問題
