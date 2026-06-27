# 股文觀指 — 整站審計優先級路線圖

> 日期：2026-06-27 ｜ 範圍：9 維度全站審計（UX、效能、無障礙、資料正確性、程式碼品質、行動體驗、SEO、功能缺口、安全性）
> 性質：審計合成報告，本文件不修改任何程式碼。所有發現皆已用 Read/Grep 實際核對。
> 工作量標記：S（<半天）／M（半天~2天）／L（2~5天）／XL（>1週）

---

## 1. 執行摘要

**整站健康度：結構紮實但「展示層信任缺口」與「行動／無障礙基礎」拖後腿。**
底層資料管線真實（TWSE/TPEx/Yahoo）、型別安全優秀（0 真實 any）、認證與安全姿態良好（JWT httpOnly + 白名單 middleware + fail-closed），這是平台最大的本錢。但使用者每天會親身踩到的問題集中在三塊：**資料展示會誤導**（隔日頁紅綠顛倒、寫死今天日期、永遠亮綠點「即時更新中」）、**行動與無障礙未達標**（手機 K 線點不出十字線、漢堡選單缺兩頁、次要文字對比不足 4.5）、以及**研究到執行的最後一哩斷掉**（自選星號丟黑洞、R1 出場清單只活在回測表）。這些多半是低成本、高感受度的修補。

### 最該優先做的 3 件事
1. **修掉會傷信任的資料誤導**（紅綠顛倒 + 寫死日期 + 假即時點）— critical/high，總成本約 1 天，違反專案「股價不准誤導」鐵則。
2. **抽出單一 NAV 常數並補齊孤島頁／導覽**（手機選單缺 workspace + strategy-monitor、strategy-monitor 整頁無導覽、archive 隱形）— 一個 S 改動解決多個導覽斷裂。
3. **daily API 加 Cache-Control + 次要文字色票調亮**（最高流量端點走 CDN + 全站對比達標）— 各一行/一票，立即全站受惠。

---

## 2. 分級路線圖

### 🔴 P0 立即修（critical / 高使用者影響 / 低成本）

| # | 標題 | 維度 | 為什麼 | 怎麼改 | 量 |
|---|------|------|--------|--------|----|
| P0-1 | 隔日表現頁紅綠漲跌色完全顛倒 | 資料正確性 | 全站其他頁紅漲綠跌，唯獨此頁綠漲紅跌。大跌日整頁負報酬亮成紅色（看似在跌實際是漲），台股使用者會嚴重誤判方向。已核對 `next-day/_client.tsx:273,550-557,661` 用 `>0?green:red` | 三處改 `pct>0?"text-red":pct<0?"text-green":"text-txt-3"`，比照同檔 focus 正確寫法 | S |
| P0-2 | TopNav「資料即時更新中」綠色脈動點為不實陳述 | 資料正確性 | 已核對 `TopNav.tsx:214` 恆亮 `bg-green animate-pulse` title="資料即時更新中"。實際是盤後每日一次靜態快照，盤中不變。直接違反「不准誤導」鐵則 | 改中性灰點＋「資料截至」；資料非最近交易日時改琥珀色＋「資料較舊」；移除 pulse 與「即時更新中」字樣 | S |
| P0-3 | 多數頁把資料日期寫死成今天 | 資料正確性 | 10 個頁傳 `currentDate={getTodayString()}`，週末或抓取失敗時把過期資料當「資料 今天」展示。首頁用真實 displayDate 是對的 | 移除這些頁的 `currentDate`，讓 TopNav 用內建 useLatestDate() fallback 帶出真實快照日期 | S |
| P0-4 | strategy-monitor 整頁無導覽列，進入後無法返回 | UX | 已核對 `NavBar.tsx` 含 strategy-monitor，但該頁 page.tsx 直接渲染 `<main>`，無 TopNav/NavBar。使用者進入後沒有任何站內導覽或返回路徑 | 比照 focus 包入 `<TopNav/>`＋`<NavBar/>`，統一頁面骨架 | S |
| P0-5 | 手機漢堡選單缺 workspace 與 strategy-monitor | UX | NavBar 有 18 項、TopNav（漢堡）只有 16 項，少這兩頁。漢堡是手機主要導覽入口，等於手機完全到不了這兩頁。兩份清單手動維護必然續漂 | 抽單一 `src/lib/nav.ts`，TopNav + NavBar 同時 import，一次補齊並杜絕漂移 | S |
| P0-6 | daily API 完全沒有 Cache-Control | 效能 | 全站最高頻端點（首頁/個股/next-day 都打），每次都重讀檔+parse，無 CDN 快取。資料一天才更新一次。其他 route 都已加 s-maxage，唯獨最熱的漏掉 | 兩 route 加 `Cache-Control: public, s-maxage=300, stale-while-revalidate=86400`（歷史 [date] 可 s-maxage=3600 甚至 immutable） | S |

P0 全部為 S，合計約 1~1.5 天，是整份報告 ROI 最高的批次。

### 🟡 P1 近期（明顯改善體驗）

| # | 標題 | 維度 | 為什麼 / 怎麼改 | 量 |
|---|------|------|------|----|
| P1-1 | 次要文字色 txt-3/txt-4 對比不足 4.5 | 無障礙 | text-3 實測 3.7~4.2、text-4 僅 2.3~2.6，大量用於產業名/時間戳/標籤/Footer。調 `--text-3→#94a3b8`、`--text-4→#64748b`，亮色主題 text-4 同步提亮。小調色票全站受惠 | S |
| P1-2 | OG 圖只有 SVG，社群（含 LINE）分享無預覽圖 | SEO | FB/X/LINE/Slack 多不渲染 SVG og:image。專案有 LINE 推播，分享無縮圖影響實際點擊。產 1200x630 og-image.png，layout 與各頁 openGraph.images 改指 PNG | S |
| P1-3 | PWA 圖示全 SVG，iOS 加到主畫面破圖 | 行動 | manifest 與 apple-touch-icon 全 SVG，iOS 不支援會白底/截圖。產 PNG 180/192/512（含 maskable），manifest 與 layout 改指 PNG | S |
| P1-4 | /landing 無自己的 metadata | SEO | 全站 JWT 擋住，唯一對外可索引頁就是 landing，卻是 client component 繼承首頁標題與 canonical:"/"。拆 server component / landing/layout.tsx 設專屬 title/desc/openGraph/canonical:"/landing" | M |
| P1-5 | 排序表頭用 div/th+onClick 無鍵盤支援 | 無障礙 | disposal/next-day/backtest/revenue 表頭只綁 onClick，鍵盤與螢幕閱讀器無法排序。包 `<button>` 或加 role/tabIndex/onKeyDown + aria-sort，GroupBlock 已有正確範本 | M |
| P1-6 | K 線圖手機完全無觸控事件 | 行動 | `KLineChart.tsx:385` 只綁 mouse 事件，手機點不出十字線/OHLC，看盤核心功能在手機失效。加 onTouchStart/Move 用 touches[0] 換算座標 + touchAction:'pan-y' + tooltip 邊界翻轉 | M |
| P1-7 | 週K/月K 為死按鈕 | 行動 | 可點但無效的 UI。短期 disabled/移除；正解依 period 把日資料聚合成週/月 K | M |
| P1-8 | 多頁只處理 loading 不處理 fetch 失敗 | UX | revenue/global/focus/news/stock 用 SWR 但未解構 error，失敗時永遠轉圈或空白。統一解構 error 加錯誤分支（可做 `<DataState>` wrapper），backtest/sop 已有正確範本 | M |
| P1-9 | SWR fetcher 17 處重複且全缺 r.ok 檢查 | 程式碼品質 | API 回 503/HTML 時 r.json() 壞掉或把 {error} 當資料。抽 `src/lib/fetcher.ts` 檢查 !r.ok throw 帶 status，各檔 import。與 P1-8 配套 | M |
| P1-10 | 隔日缺值以 0% 呈現像持平 | 資料正確性 | `nextOpenPct ?? 0` 把「無資料」顯示成 0.00% 持平並回退漲停價，扭曲族群正報酬率與勝率分母。缺值傳 null，統計排除 null，UI 顯示「—」 | M |
| P1-11 | /watchlist 自選股頁缺失 | 功能缺口 | StarButton 只寫 localStorage，全站無清單頁，加星等於丟黑洞。新增 /watchlist 複用 useWatchlist + ema/batch + daily/latest 顯示星號清單（含當日漲跌、EMA 訊號） | M |
| P1-12 | 缺 skip-to-content + 多頁缺 h1/標題層級 | 無障礙 | 鍵盤須穿越整個導覽；多頁無 h1。layout body 首加 sr-only focus 可見 skip-link + main 加 id；族群名/區塊標題改 h2/h3 | M |
| P1-13 | viewport-fit/dvh 缺失，瀏海機與 URL bar 切版 | 行動 | 加 `export const viewport { viewportFit:'cover' }` + safe-area-inset padding；h-screen/vh 改 dvh（首頁 page.tsx:145 等） | M |
| P1-14 | stats route 每次重讀 62 個 daily JSON | 效能 | 加 `export const revalidate` + 回應 Cache-Control；groupMap 的 indexOf 改 Map | S |
| P1-15 | 國際市場頁紅綠慣例自相矛盾 | 資料正確性 | 與 P0-1 同類但影響較小，統一為紅漲綠跌（IndexCard 各色） | S |
| P1-16 | 技術指標回測器零免責 | 資料正確性 | 加一行免責：歷史回測非未來保證、未計交易成本、樣本數警告 | S |

### 🟢 P2 有空再做（nice-to-have）

| # | 標題 | 維度 | 摘要 | 量 |
|---|------|------|------|----|
| P2-1 | 整列可點 div 無鍵盤（StockRow） | 無障礙 | 移除列 onClick 改由 Link 承載，或加 role/tabIndex/keydown | M |
| P2-2 | 觸控目標普遍 <44px | 行動 | StarButton/排序表頭/NavBar 連結擴大可點區到 44px | M |
| P2-3 | 密集表格 min-w-[1100px] 首欄不固定 | 行動 | 首欄 sticky left-0，或次要欄 hidden md:、或手機改卡片 | L |
| P2-4 | K 線/Sparkline SVG 無替代描述 | 無障礙 | SVG 加 role="img"+aria-label 或 aria-hidden | M |
| P2-5 | 後端「讀最新 daily」邏輯複製 11 處 | 程式碼品質 | 抽 `src/lib/data-files.ts` helper | M |
| P2-6 | 紅綠色判斷散落 59 處 | 程式碼品質 | 抽 `signColor()` + `<PctCell>` | M |
| P2-7 | client 元件零 code-split | 效能 | KLineChart/Backtest0903 等改 next/dynamic ssr:false | M |
| P2-8 | 個股頁一次 8 SWR、pe/revenue 抓整表 | 效能 | 加 dedupingInterval/revalidateOnFocus:false；提供 ?code= 單檔端點 | M |
| P2-9 | Skeleton 僅首頁用 | UX | 拆可重用原子，替換各頁純文字「載入中」 | M |
| P2-10 | 頁面容器寬度/padding 跨頁不一 | UX | 建 2~3 級寬度 token 統一 | M |
| P2-11 | sitemap 列 26 個被轉址內頁 | SEO | sitemap 只留真正公開頁；或開放 /learn 公開並一致化 | M |
| P2-12 | 6 內頁缺 per-page metadata | SEO | report/news/compare/history/archive/workspace 補 metadata | M |
| P2-13 | 個股頁無動態 metadata/結構化資料 | SEO | generateMetadata 動態 title + FinancialProduct/Breadcrumb JSON-LD（開放公開後再拉高） | L |
| P2-14 | R1 今日 actionable 出場清單 | 功能缺口 | 把回測 R1 規則前移到今日 topPicks，輸出今日 R1 出場價區間 | L |
| P2-15 | 個人損益日誌（照做賺賠回顧） | 功能缺口 | watchlist 記加入日 + 算自加入報酬 + 命中率卡，純前端 | M |
| P2-16 | 網頁端零提醒機制 | 功能缺口 | Notification API + 固定時點本地排程做出場/到價提醒 | L |
| P2-17 | 今日族群強弱/資金流排行榜 | 功能缺口 | 用 daily/latest groups 聚合排序，資料現成 | M |
| P2-18 | code 參數未驗證即拼上游 URL | 安全性 | stock/ema/technicals/chip/supply-chain 各加 `/^\d{4,6}[A-Z]?$/`，仿 pe route | S |
| P2-19 | backtest 數值參數無上界 | 安全性 | Number.isFinite + clamp（period 1~250、fast<slow） | S |
| P2-20 | 登入無速率限制 | 安全性 | IP in-memory 滑動視窗 + 固定延遲 + timingSafeEqual | M |
| P2-21 | RealBacktest 型別兩處重複宣告 | 程式碼品質 | 合併到 src/lib/types.ts | S |
| P2-22 | SupplyChainMap 1876 行 .jsx | 程式碼品質 | 改 .tsx + CSS 變數色票 + 拆子元件 | L |
| P2-23 | Fear & Greed 為 VIX 推導未標示 | 資料正確性 | 改抓真實來源或標題改「情緒推估（依 VIX）」 | M |
| P2-24 | focus-visible 外框對比不足 | 無障礙 | 提高 outline 亮度/雙環確保達 3.0 | S |
| P2-25 | archive 孤島頁 + compare 無 footer | UX | 加入共用 NAV_ITEMS 或 Footer QUICK_LINKS（若 archive 停用則刪除） | S |

---

## 3. Quick Wins（成本 S、影響 high — 最划算，建議第一批）

這些單獨拉出，因為投入產出比最高，幾乎都是一行到一票的改動：

- **P0-1 隔日頁紅綠對調**（S）— 三行，消除大跌日整頁誤判方向。
- **P0-2 移除假「即時更新中」綠點**（S）— 一處，守住「不准誤導」鐵則。
- **P0-3 移除寫死今天日期**（S）— 10 頁刪一個 prop，過期資料不再冒充最新。
- **P0-4 strategy-monitor 補導覽**（S）— 包兩個元件，修復斷裂頁。
- **P0-5 / P0-6 抽 nav.ts + daily 加 Cache-Control**（各 S）— 各一處改動，修復手機到不了的頁 + 最熱端點走 CDN。
- **P1-1 調亮 txt-3/txt-4 色票**（S）— 改兩個 CSS 變數，全站對比達標。
- **P1-2 / P1-3 OG PNG + PWA PNG 圖示**（各 S）— 解決分享無預覽圖 + iOS 破圖。
- **P1-14 stats route 加 revalidate**（S）／**P1-16 回測器免責**（S）／**P2-18 code 格式驗證**（S，5 分鐘/路由）。

> 建議：先一次清掉「P0 全部 + P1-1/2/3/14/16」，預估 2~2.5 天即可讓信任、導覽、效能、分享、對比五個面向同時跳一級。

---

## 4. 按主題分組（方便批次執行）

### 套餐 A｜資料可信度（最該先做，守鐵則）
P0-1 隔日紅綠對調 · P0-2 假即時點 · P0-3 寫死日期 · P1-10 缺值 0% · P1-15 國際頁紅綠 · P1-16 回測器免責 · P2-23 Fear&Greed 標示
→ 主題一致、可一次 review，直接消除所有「會誤導使用者」的點。

### 套餐 B｜導覽與資訊架構
P0-4 strategy-monitor 導覽 · P0-5 抽 nav.ts 補手機選單 · P2-25 archive/compare 入口
→ 全靠單一 NAV 常數收斂，一個 PR 解決多個孤島/斷裂。

### 套餐 C｜效能（CDN 與快取）
P0-6 daily Cache-Control · P1-14 stats revalidate · P2-7 code-split · P2-8 個股頁 SWR 去重
→ 由「一行加 header」到「結構優化」遞進，前兩項立即見效。

### 套餐 D｜無障礙（WCAG AA）
P1-1 色票對比 · P1-5 表頭鍵盤排序 · P1-12 skip-link + 標題層級 · P2-1 整列鍵盤 · P2-4 SVG 替代描述 · P2-24 focus 外框
→ 色票（S）先做，其餘按頁逐步補。

### 套餐 E｜行動體驗
P1-3 PWA PNG · P1-6 K 線觸控 · P1-7 週/月K · P1-13 viewport/dvh · P2-2 觸控目標 · P2-3 sticky 首欄
→ 台股使用者大量用手機看盤，感受度高。

### 套餐 F｜SEO 與社群分享
P1-2 OG PNG · P1-4 landing metadata · P2-11 sitemap 一致化 · P2-12 內頁 metadata · P2-13 個股動態 metadata
→ 注意：SEO 效益受「全站需登入」前提限制，先做 landing + OG（對分享立即有效），其餘待商業決策是否開放公開頁。

### 套餐 G｜程式碼品質（技術債，使用者短期無感）
P1-9 共用 fetcher · P2-5 data-files helper · P2-6 sign-color · P2-21 RealBacktest 型別 · P2-22 SupplyChainMap
→ 配合套餐 A/C 順手抽共用，不必獨立排期。

### 套餐 H｜功能閉環（研究 → 執行）
P1-11 /watchlist · P2-14 R1 今日清單 · P2-15 損益日誌 · P2-16 提醒 · P2-17 族群強弱榜
→ 與平台定位最契合的成長性投資，資料源全現成；先做 watchlist 打通最痛的閉環。

### 套餐 I｜安全性（縱深防禦）
P2-18 code 驗證 · P2-19 backtest clamp · P2-20 登入速率限制
→ 安全姿態本已 good，這些是加固非救火，可低優先排入。

---

## 5. 明確排除（看似問題其實沒問題 / 不建議現在做）

- **better-sqlite3「未使用的依賴」** — 列在 package.json 但 src 內確認未使用。不構成 N+1 或 SQLi 風險；除非要縮 bundle，否則不急著移除。**無 SQLi 風險，記為健康。**
- **layout 的 ld+json dangerouslySetInnerHTML** — 內容為靜態常數，非使用者輸入，無 XSS 風險。**健康，不需改。**
- **public/stats 公開端點** — 刻意公開且僅含聚合數字，無敏感資料。**設計正確，不需改。**
- **daily/[date] 與檔案讀取路由的路徑處理** — 已驗證安全（無路徑穿越）。建議僅作為基準，把同等嚴謹度推廣到 stock/[code]，本身不需改。
- **supply-chain/[code] 以使用者輸入做物件鍵查找** — 屬安全查找（非檔案/SQL），無需修改。
- **整站 SEO 大改 / 個股動態 metadata（P2-13）** — 在「全站需登入」前提下，多數內頁對爬蟲是 307 轉址，投入大改 SEO 的邊際效益低。**先別做**，等商業上決定是否開放公開頁（如 /learn）再投入；現階段只做 landing + OG 即可。
- **全站快捷鍵可停用設定 / service worker push** — 屬 nice-to-have，使用者痛點低，不建議在前述批次完成前投入。
- **示範數據圖卡（統計頁）** — 已有「示範數據／誠實統計」徽章，屬誠實揭露範圍。可微調視覺權重但非必要，**不算缺陷**。

---

## 附：整站本錢（做得好、不要動）

- 資料管線真實（TWSE/TPEx/Yahoo），統計頁誠實標示、回測有完整免責。
- 型別安全優秀（0 真實 any）、API route 與認證錯誤處理扎實、無 console.log 殘留、無真正死碼。
- 安全姿態 good：JWT httpOnly cookie + 白名單 middleware + JWT_SECRET fail-closed + .env 已 gitignore。
- 視覺語言成熟：統一 CSS token、深淺主題、tabular-nums 數字對齊。
- 架構輕量：純 SVG 圖表、系統字型、無 web font、JSON 檔 <40KB。

這些是平台差異化的根基，任何重構都應保留。
