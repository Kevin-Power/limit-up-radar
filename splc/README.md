# SPLC // AI 供應鏈地圖

Bloomberg SPLC 風格的 AI 半導體供應鏈視覺化地圖，聚焦 **台美聯動 TW↔US**。

- **91 個節點**：EDA/IP → 設備 → 晶圓代工/記憶體/PCB → IC 設計/ASIC 服務 → 封測/模組 → 散熱·電源·光通訊·機構 → 伺服器代工 → CSP 雲端客戶
- **338 條供應關係**：上游紅線 / 下游綠線 / 一般灰線
- **6 大主題**：CoWoS 先進封裝、液冷散熱、PCB/CCL、ASIC 客製矽、HBM 記憶體、伺服器 ODM
- **互動**：拖曳平移、滾輪縮放（鎖游標）、搜尋跳轉、置中聚焦、Hover 高亮、Click 詳情面板

## Quick Start

```bash
npm install
npm run dev
```

打開瀏覽器 → http://localhost:5173

## Build & Deploy

```bash
npm run build
# 產出在 dist/，純靜態，可直接放 nginx / IIS / GitHub Pages / WordPress
npm run preview   # 本機驗證 build 結果
```

## 技術堆疊

| 層 | 技術 | 版本 |
|---|---|---|
| Runtime | React | 18.3 |
| Build | Vite | 5.4 |
| Style | Tailwind CSS | 3.4 |
| Icons | lucide-react | 0.460 |

## 專案結構

```
splc/
├── src/
│   ├── main.jsx                # React 入口
│   ├── App.jsx                 # App 包裝
│   ├── index.css               # Tailwind + 全域樣式
│   └── components/
│       └── SupplyChainMap.jsx  # 主組件（含資料 + UI，可拆模組化見 CLAUDE.md）
├── public/
│   └── favicon.svg
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── CLAUDE.md                   # 給 Claude Code 接手用的專案指南
└── package.json
```

## 字型

- **JetBrains Mono** — 等寬字（數字、ticker、UI 標籤）
- **Noto Sans TC** — 繁中（公司中文名、主題標籤）

兩者皆從 Google Fonts CDN 載入，已在 `index.html` 預連線。

## 部署選項

**A. 純靜態 server**：build 後把 `dist/` 內容丟 nginx / IIS / Caddy
**B. GitHub Pages**：`vite.config.js` 設 `base: '/repo-name/'` 後 `npm run build` 推 `gh-pages` branch
**C. WordPress 嵌入**：build 後把 `dist/` 丟 `wp-content/uploads/splc/`，文章用 `<iframe>` 嵌
**D. Cloudflare Pages / Vercel**：repo connect 後設 build command `npm run build`、output `dist`

## 授權與聲明

- 資料為示意用途、非投資建議
- Bloomberg SPLC 是 Bloomberg L.P. 註冊商標；本專案僅為視覺風格致敬，無任何商業關聯
