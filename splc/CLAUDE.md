# CLAUDE.md

> 給 Claude Code 接手這個專案時的工作指南。
> 用戶是 **Kevin（謝政輝 / Cheng-Hui Hsieh）**，台灣資安架構師，溝通用繁中、偏好直接精準。

---

## 🎯 當前任務：部署到 Vercel

**Kevin 要把這個專案部署到 Vercel，他不想自己動手——請陪他全程跑完。**

👉 **先讀 [DEPLOY.md](./DEPLOY.md)**，按那份的步驟逐步引導他執行。

完成後再回來看本檔，處理後續的功能擴充任務。

---

## 專案脈絡

**SPLC // AI 供應鏈地圖**：Bloomberg SPLC 終端風格的台美 AI 半導體供應鏈視覺化。本質上是一個資訊密度極高的 React SVG 圖，把 91 家公司、338 條供應關係按 7 個 tier（從 EDA 到 CSP）排成多欄式 Sankey-like 流向圖，給 Kevin 自己研究 AI 受惠族群、做產業地圖用。

**設計參考**：Bloomberg SPLC (Supply Chain) function — 黑底、橘色強調、等寬字、密集數字格、無多餘留白。**不要往「漂亮」改**；要往「終端機資訊密度」改。

---

## Quick Start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 產出 dist/
npm run preview  # 驗證 build 結果
```

---

## 架構決策（為什麼這樣寫）

### 1. 為什麼整個資料層 + UI 全在 `SupplyChainMap.jsx` 一個檔？

**起源**：原本是 Claude Artifact，artifact 環境要求單檔。

**現況**：~1900 行，含 `COMPANIES`、`CN_NAMES`、`CLUSTERS`、`EDGES`、`THEMES`、layout 演算法、所有子組件、主組件。

**該不該拆？** 看 Kevin 的下一步：
- 只是看圖、偶爾加幾家公司 → **別拆**，單檔搜尋取代最快
- 要長期維護、加單元測試、給其他人改 → **拆**，建議結構：

```
src/
├── data/
│   ├── companies.js      # COMPANIES + CN_NAMES (companyId -> 中文名)
│   ├── clusters.js       # CLUSTERS (tier 結構)
│   ├── edges.js          # EDGES (供應關係 [from, to, weight])
│   ├── themes.js         # THEMES (主題篩選)
│   └── country.js        # COUNTRY (國旗、顏色)
├── lib/
│   ├── layout.js         # buildLayout() — barycenter sweep 演算法
│   └── format.js         # fmtMcap, aiBarColor, cnOf
├── components/
│   ├── SupplyChainMap.jsx  # 主組件（state + 排版）
│   ├── ClusterHeader.jsx
│   ├── ClusterBox.jsx
│   ├── CompanyNode.jsx
│   ├── Edge.jsx
│   ├── DetailPanel.jsx
│   ├── Clock.jsx
│   ├── Ticker.jsx
│   └── Toolbar.jsx
└── App.jsx
```

**拆模組時的注意事項**：
- 子組件已經包了 `React.memo`，拆檔時保留 — 拖曳和 hover 的效能依賴它
- `useCallback` 包的事件處理器要繼續用 — 配合 `React.memo` 才有意義
- `buildLayout()` 是純函式，最容易先抽出來

### 2. Layout 演算法（`buildLayout`）

採 **column-based + barycenter sweep**，分 7 步：

1. **分群**：按 `cluster` 把公司分組
2. **建欄**：依 `tier` 建欄；空 cluster 自動摺疊（主題切換時）
3. **初排**：欄內按市值排
4. **Barycenter sweep**（核心）：每個節點重排到其相鄰節點的平均 y 座標 — 重複 8 次、雙向交替 — 把交叉線數最小化
5. **Cluster 重排**：同 tier 內 cluster 的垂直位置也用 barycenter 重排
6. **垂直居中**：把較短的 tier 對齊到最高 tier 的中央
7. **預算 edge 幾何**：所有 bezier path 預先算好（`edgeGeo`），避免每次 hover 重算

**改 layout 時**：先動 `NODE_W / NODE_H / COL_W / COL_GAP` 這些 const，不要動 sweep 邏輯。

### 3. 效能優化

- 拖曳時**繞過 React**：直接寫 `innerRef.current.style.transform`，鬆開滑鼠才 `setState` 一次。沒這個，91 節點 +338 邊在拖曳會掉幀
- Edge / CompanyNode / Ticker 全包 `React.memo`
- 滾輪縮放鎖游標位置：用 `scaleChange = next/prev` 算 pan 補償

**改互動時**：不要把上面三項拆掉，否則性能會崩。

---

## 資料 Schema

### Company

```js
COMPANIES[id] = {
  ticker:  '2330',           // 顯示用代號（台股 4 碼、美股 ticker）
  name:    'TSMC',           // 英文名
  country: 'TW',             // 國家代碼，見 COUNTRY 表
  cluster: 'foundry',        // tier 分群代號，見 CLUSTERS 表
  mcap:    1050,             // 市值（單位：十億美金 B）
  aiExp:   60,               // AI 營收佔比（0-100）
  role:    'Leading-edge foundry. N3/N2 + CoWoS advanced packaging.',
}
CN_NAMES[id] = '台積電';       // 顯示用繁中名（可選，沒填會 fallback 到 name）
```

### Edge（供應關係）

```js
['SUPPLIER_ID', 'CUSTOMER_ID', weight_0_to_100]
// 例：['TSM', 'NVDA', 90]  =  台積電是 NVIDIA 的供應商，關係強度 90%
```

**weight 的語意**：
- `90+` — 核心、不可替代的單一來源
- `60–80` — 主要供應商
- `30–55` — 次要供應商或多元採購中的一環
- `<30` — 邊緣關係或長尾客戶

### Cluster

```js
{ id:'foundry', label:'晶圓代工 / Foundry', tier:2, side:'up', icon:'box' }
```

`tier` 決定欄位的 X 座標（從左到右遞增）。`side` 是備用欄位、目前不影響 layout。

### Theme

```js
THEMES.cowos = {
  label: 'CoWoS 先進封裝',
  sub:   'ADV PKG',
  color: '#FFD700',
  members: new Set(['TSM', 'ASX', 'PTI', ...]),   // null = 全鏈
}
```

切到某主題時，所有不在 `members` 裡的節點和邊都隱藏 + 空 cluster 摺疊。

---

## 常見任務 Cheat Sheet

### 1. 加一家公司

```js
// 在 COMPANIES 加：
NEWCO: { ticker:'1234', name:'NewCo', country:'TW', cluster:'pcb',
         mcap:2.5, aiExp:60, role:'說明文字。' },

// 在 CN_NAMES 加：
NEWCO: '新公司',

// 在 EDGES 加供應關係：
['EMC','NEWCO',45],   // 台光電供應給它
['NEWCO','FXC',55],   // 它供應給鴻海
```

### 2. 加一個主題

```js
// 在 THEMES 物件下加：
silicon_photonics: {
  label: '矽光子',
  sub: 'SI-PHOTONICS',
  color: '#06b6d4',
  members: new Set([
    'TSM','GUC','ALCHIP',
    'COHR','ALAB','CRDO','SHPHEN','LUMENS','BROWAVE',
    'NVDA','AVGO','MRVL',
    'MSFT','META','GOOGL','AMZN',
  ]),
},
```

### 3. 調整某欄寬度 / 節點大小

`SupplyChainMap.jsx` 開頭：
```js
const COL_W   = 200;   // 欄寬
const COL_GAP = 36;    // 欄間距
const NODE_W  = 176;   // 節點寬
const NODE_H  = 64;    // 節點高
const NODE_GAP = 12;   // 同欄節點間距
```

### 4. 調整顏色主題

`SupplyChainMap.jsx` 的 `C` 物件 + `tailwind.config.js` 的 `colors.splc` 同步改。

### 5. 改成深藍底（取代 Bloomberg 黑橘）

把 `C.bg` 從 `#000` 改成 `#0a1929`、`C.orange` 換成 `#4a9eff` 試試。但 Kevin 風格上應該不會接受 — 先問再動。

### 6. 加新國家

`COUNTRY` 物件加一筆：`IL: { flag: '🇮🇱', label: 'IL', color: '#... ' }`。

---

## 已知限制與雷區

1. **市值單位**：`mcap` 是「十億美元（B）」。`fmtMcap` 會自動轉 `$M / $B / $T`。**別把單位改成台幣** — 中美廠混合會錯亂。
2. **Edge label 顯示**：邊線中段的 `value%` 標籤只在「該邊被高亮」**且** `showLabels === true` 時才畫。預設開，使用者可從 toolbar 關。
3. **`SSNMM` 跟 `SSNLF`** 都是三星，市值刻意設成 `0` 避免重複計算 — 別合併。
4. **`useChinese` 邏輯**：節點顯示中文的條件是「country=TW」或「country=US」或「有 CN_NAMES 條目」。其他國家用英文 — 如果要全部中文化，改 `CompanyNode` 開頭那行。
5. **詳情面板預設開在 NVDA**：`useState('NVDA')`。Kevin 可能會想改成 TSM 或 3036 文曄（他本人公司）。
6. **沒有資料持久化**：state 重整就回預設。如果要加「上次看的節點」記憶，用 `localStorage`（artifact 環境不行，本地 web 沒問題）。

---

## Kevin 可能的下一步（提前準備）

根據 Kevin 的研究與交易脈絡：

1. **加 3036 文曄 / 3702 大聯大**：他工作的公司 + pair trade 標的。會想加「半導體通路商」cluster
2. **接真實 API**：股價、市值、技術線（他自己有 TXFR1 ORB 系統）— 但目前是純 mock data
3. **匯出 / 截圖**：研究報告會想截全圖。可加 `html2canvas` 或 SVG export
4. **多語言**：研究報告或會議簡報用英文版（Prof. Wang 看的）
5. **嵌進 gwgz.xyz**：他的 WordPress 站。build 後設 `base` 為相對路徑、`<iframe>` 嵌

---

## 給 Claude Code 的工作守則

1. **每次改完跑 `npm run build`** 驗證沒語法錯
2. **大改前先讀完 `SupplyChainMap.jsx`** — 不要只看局部就動 layout 或 state
3. **改 `EDGES` 一定要驗 `a` 和 `b` 都存在於 `COMPANIES`** — 否則 layout sweep 會找不到節點悄悄掉
4. **加新欄位到 `COMPANIES` 條目時要全部補齊** — 缺欄會讓 detail panel 顯示 `undefined`
5. **保留繁中註解** — Kevin 看的，別擅自翻英文
6. **回應用繁中、簡潔、不囉嗦** — Kevin 偏好

---

## 聯絡

- 用戶：Kevin（謝政輝）
- 場景：個人研究、不對外發布的內部工具
- 風格參考：Bloomberg Terminal SPLC function
