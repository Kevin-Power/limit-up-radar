# Focus 頁面 — 互動式篩選列 (FilterBar) 設計

**日期：** 2026-05-22
**作者：** Claude (與用戶 brainstorming 產出)
**狀態：** Draft → 待用戶確認

---

## 1. 目標 (Why)

使用者在 `/focus` 頁面看到「精選追蹤標的」與「全部漲停股評分」兩個列表，目前完全由系統評分決定排序與顯示。

需求：**讓使用者自行依風格挑選**。例如：
- 保守派：「只看 80 分以上 + 排除空吞 + 只看權值」
- 主題派：「只看半導體 + 生技」
- 風險偏好：「中小型股 + 80 分以上」

技術上現有資料（`tags`、`group`、`score`、`bearishEngulfing` list）已足夠支撐，無需後端改動。

## 2. 範圍 (Scope)

**包含：**
- `src/app/focus/_client.tsx` 加上 FilterBar 元件
- 篩選同時套用到「精選追蹤標的」與「全部漲停股評分」兩個列表
- URL query params 持久化（可分享、可重新整理）
- 在 `/api/focus` route 為每檔股票新增 `isBearish: boolean` 欄位（伺服器端交叉比對 `bearishEngulfing` list 後標註）

**不包含：**
- 不改變評分演算法、不動 scoring.ts
- 不新增資料欄位（除了 `isBearish` 旗標）
- 不做 localStorage 跨日記憶（避免下一個交易日仍套用過時設定）
- 不影響其他頁面（/sop、/supply-chain 等）

## 3. 設計細節

### 3.1 UI 結構

在「精選追蹤標的」標題與股票卡片之間插入 FilterBar，CSS `sticky top-[<NavBar-height>]`，滾動時釘在 NavBar 下方。

```
┌─────────────────────────────────────────────────────────────┐
│ 精選追蹤標的  ≥ 50 分                                        │
│ 評分依據：趨勢族群(30) + 營收成長(25-35) + …                  │
│                                                              │
│ ─── FilterBar (sticky) ─────────────────────────────────── │
│ 🔍 篩選：                                                    │
│  評分    [全部 | 80+ | 60+]   ← segmented switch              │
│  權值    [全部 | 只看權值 | 排除權值]                          │
│  空吞    [全部 | 隱藏空吞 | 只看空吞]                          │
│  族群    [+ 選擇族群 ▾]  [電子/半導體 ×] [生技 ×]              │
│                                                              │
│  顯示 12/59 檔   [清除全部]                                  │
└─────────────────────────────────────────────────────────────┘
```

**互動：**
- **評分 / 權值 / 空吞**：三狀態 segmented control，互斥單選，預設「全部」。
- **族群**：多選 chip — 點 `[+ 選擇族群]` 跳出 dropdown，列出**今日有出現的族群**（從 `data.focusStocks` 的 `group` 欄位去重），點選後變成可刪除的 chip。
- **計數**：即時顯示「顯示 X/Y 檔」，Y 是套用篩選前的總數。
- **清除全部**：所有篩選歸 default，URL params 清空。

### 3.2 篩選邏輯（分組混合）

```ts
function passesFilter(stock: FocusStock, f: FilterState): boolean {
  // 評分維度
  if (f.scoreMin > 0 && stock.score < f.scoreMin) return false;

  // 權值維度
  const isHeavy = stock.tags.includes("權值");
  if (f.heavy === "only" && !isHeavy) return false;
  if (f.heavy === "exclude" && isHeavy) return false;

  // 空吞維度
  if (f.bearish === "hide" && stock.isBearish) return false;
  if (f.bearish === "only" && !stock.isBearish) return false;

  // 族群維度（OR within dimension）
  if (f.groups.length > 0 && !f.groups.includes(stock.group)) return false;

  return true;
}
```

- 同維度多選 = **OR**（族群選 [半導體, 生技] → 兩者都顯示）
- 跨維度 = **AND**（族群 AND 評分 AND 權值 AND 空吞）
- 「全部」狀態 = 該維度不參與過濾

### 3.3 URL 同步

```
/focus?score=80&heavy=only&bearish=hide&groups=電子/半導體,生技
```

| param | 值                          | default |
|-------|-----------------------------|---------|
| score | `0` / `60` / `80`           | `0`     |
| heavy | `all` / `only` / `exclude`  | `all`   |
| bearish | `all` / `hide` / `only`   | `all`   |
| groups | comma-separated 族群名稱（URL-encoded） | 空 |

- 用 `useSearchParams` 讀，`router.replace()` 寫（不留歷史紀錄、不觸發捲動）。
- 空值不寫入 URL，保持網址簡潔。

### 3.4 資料層改動

**`src/app/api/focus/route.ts`**

在回傳前計算 `isBearish` 旗標：

```ts
const bearishCodes = new Set((data.bearish_engulfing ?? []).map(b => b.code));

focusStocks.forEach(s => {
  s.isBearish = bearishCodes.has(s.code);
});
topPicks.forEach(s => {
  s.isBearish = bearishCodes.has(s.code);
});
```

**`src/app/focus/_client.tsx`** — `FocusStock` interface 加：

```ts
interface FocusStock {
  // ...existing fields
  isBearish?: boolean;
}
```

### 3.5 元件拆分

新增 `src/app/focus/_filter-bar.tsx`：

```ts
export type FilterState = {
  scoreMin: 0 | 60 | 80;
  heavy: "all" | "only" | "exclude";
  bearish: "all" | "hide" | "only";
  groups: string[];
};

export function passesFilter(stock: FocusStock, f: FilterState): boolean { ... }

export function FilterBar(props: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  availableGroups: string[];   // 今日有出現的族群清單
  visibleCount: number;
  totalCount: number;
}): JSX.Element { ... }
```

`_client.tsx` 內：
1. `useSearchParams` → derive 初始 `FilterState`
2. `useState<FilterState>` 管理當前狀態
3. `onChange` callback → `router.replace()` 寫回 URL
4. 用 `passesFilter` 過濾 `topPicks` 與 `focusStocks` 後再 render

### 3.6 空狀態

- 精選列表過濾後為空 → 顯示「目前無符合條件標的，[清除篩選]」按鈕。
- 全部列表過濾後為空 → 表格 body 顯示「無符合條件」。
- 篩選後計數歸 0 → FilterBar 計數變成 `0/59 檔` + 紅字提示。

## 4. 測試

由於這是純前端 UI 行為，採用以下驗證：

1. **單元測試**（建議但非必要）：對 `passesFilter` 函式覆蓋以下情境：
   - 全部 default → 任何股票都 pass
   - 評分 80+，股票 score=75 → 拒絕
   - 權值 only，股票無「權值」tag → 拒絕
   - 空吞 hide，股票 isBearish=true → 拒絕
   - 族群 [半導體, 生技]，股票 group=半導體 → pass
   - 多維度同時設定 → 全部符合才 pass
2. **手動驗證**：跑 `npm run dev`，逐一切換 FilterBar 各狀態，確認：
   - 兩個列表同步更新
   - URL 即時變動
   - 重新整理後篩選保留
   - 「清除全部」回到 default
3. **驗收條件**：在 https://limit-up-radar.vercel.app/focus 部署後，所有篩選組合可運作，計數正確。

## 5. 風險與權衡

- **Sticky FilterBar 在手機上佔空間**：mobile 簡化為「篩選 (3) ▾」單按鈕展開抽屜。但本期先做桌機完整版，mobile 折疊優化列為後續優化。
- **族群數量過多**：今日若有 8+ 族群，dropdown 滾動即可，不分頁。
- **URL params 與 client state 同步迴圈**：用 `useEffect` 比對舊新值才寫入，避免無限迴圈。

## 6. 部署

- 純前端與 API minor patch，無資料 schema 變動。
- 跟著現有 `git push` → Vercel auto deploy 流程即可。
- 部署後手動驗證 4 個篩選維度 + URL 分享行為。

---

**下一步：** 用戶 review 此 spec → writing-plans skill 產出實作計畫。
