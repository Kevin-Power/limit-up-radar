# 流量與行為分析 (Vercel Analytics) 設計

**日期：** 2026-05-24
**作者：** Claude（與用戶 brainstorming）
**狀態：** Draft → 待用戶確認

---

## 1. 目標 (Why)

目前平台**完全沒有任何流量追蹤** — 無法回答「有多少人在用」「哪些頁面熱門」「用戶最常查哪些股票」。本案加入輕量分析，從今天起累積真實數據，並反饋選股優化。

## 2. 範圍 (Scope)

### 包含
- 安裝 `@vercel/analytics`（頁面瀏覽 PV / 訪客）
- 安裝 `@vercel/speed-insights`（頁面效能，免費附加）
- 在 `src/app/layout.tsx` `<body>` 內掛 `<Analytics />` + `<SpeedInsights />`
- 自訂事件追蹤股票點擊：在 `/focus` 的精選追蹤標的與全部漲停股列表中，點股票時觸發 `track('stock_view', { code, name, source })`

### 不包含
- **不自架 SQLite/DB**（serverless 唯讀檔案系統無法持久化）
- 不改動 middleware 認證
- 不做後台儀表板頁（數據看 Vercel Dashboard → Analytics 分頁）
- 不追蹤個資（Vercel Analytics 預設無 cookie、隱私友善）
- 不在每個頁面的每個股票連結都加追蹤 — 第一版只追 `/focus`（流量最大、最有選股價值的頁）

## 3. 設計細節

### 3.1 套件安裝

```bash
npm install @vercel/analytics @vercel/speed-insights
```

兩者皆為 Vercel 官方套件，無 peer-dependency 衝突（Next.js 16 支援）。

### 3.2 全站 PV 追蹤

`src/app/layout.tsx`（server component）`<body>` 內：

```tsx
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// ...
<body className="font-sans antialiased">
  {children}
  <Analytics />
  <SpeedInsights />
</body>
```

兩個元件都是 client component，但可從 server component 直接 render（Vercel 官方支援此用法）。`/next` 子路徑為 Next.js App Router 專用入口。

### 3.3 股票點擊追蹤

**新元件 `src/app/focus/_tracked-link.tsx`：**

```tsx
"use client";
import Link from "next/link";
import { track } from "@vercel/analytics";

export function TrackedStockLink(props: {
  code: string;
  name: string;
  source: string;          // 'top_pick' | 'full_list'
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/stock/${props.code}`}
      className={props.className}
      onClick={() => track("stock_view", { code: props.code, name: props.name, source: props.source })}
    >
      {props.children}
    </Link>
  );
}
```

**改用點：** `src/app/focus/_client.tsx` 中
- topPicks 卡片的 `<Link href={/stock/${s.code}}>` → `<TrackedStockLink code={s.code} name={s.name} source="top_pick" ...>`
- 全部漲停股表格的 `<Link href={/stock/${s.code}}>` → `<TrackedStockLink ... source="full_list" ...>`

保留原 `className` 與內容不變，僅換 wrapper。

### 3.4 族群點擊追蹤（輕量）

延續族群區塊目前是純 `<div>` 不可點。**第一版不改成連結**（避免擴大範圍），只在「精選追蹤標的」內股票的族群名稱旁不加追蹤。族群追蹤延後到未來族群頁建立時再做。

> 修正：為避免 scope creep，3.4 族群點擊**移出本期範圍**，只做股票點擊（3.3）。範圍章節已更新。

### 3.5 驗證方式

- `track` 事件在本地 dev 不會送出（Vercel Analytics 僅在 production 環境啟用），本地僅確認 build 通過、無 console error
- 部署後在瀏覽器開 DevTools → Network，篩 `/_vercel/insights` 與 `/_vercel/speed-insights`，確認有 beacon 送出
- 點一檔股票 → Network 應出現 `event` beacon，payload 含 `stock_view`
- 24 小時後 Vercel Dashboard → Analytics 應顯示 PV + Custom Events

## 4. 測試 / 驗證

無自動測試框架，手動驗證：

1. `npm run build` 通過
2. 部署後 `/focus` 載入，DevTools Network 有 `/_vercel/insights/view` beacon
3. 點 topPick 股票 → 有 `/_vercel/insights/event` beacon，payload `stock_view` + source=`top_pick`
4. 點全部列表股票 → beacon source=`full_list`
5. 24h 後 Vercel Dashboard 顯示數據

## 5. 風險與權衡

| 風險 | 緩解 |
|------|------|
| Hobby plan 自訂事件有額度上限 | 只追股票點擊（非每個互動），用量低；超量時 Vercel 僅停收不影響網站 |
| 數據存 Vercel 非自有 DB | 接受；未來要原始數據再上 Turso |
| `track()` 在 SSR 報錯 | `TrackedStockLink` 為 `"use client"`，`track` 僅在 onClick（瀏覽器端）呼叫，無 SSR 問題 |
| Analytics 元件拖慢首屏 | Vercel 元件為 async defer 載入，影響極小；SpeedInsights 可監控 |

## 6. 上線步驟

1. 寫 spec ✅
2. 寫 plan
3. subagent 實作（裝套件 → layout → TrackedStockLink → 換用點 → build）
4. push → Vercel 部署
5. 部署後驗證 beacon
6. 提醒用戶：數據需 24h 累積，之後可在 Vercel Dashboard 看

---

**下一步：** 用戶 review → writing-plans → 實作。
