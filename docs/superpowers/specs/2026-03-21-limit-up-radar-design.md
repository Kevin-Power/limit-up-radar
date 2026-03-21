# 漲停雷達 (Limit-Up Radar) — 設計文件

## 概述

一個台股漲停股族群分類與分析平台，透過 Python 爬蟲自動抓取 TWSE 每日收盤資料，由使用者每日呼叫 Claude 進行族群分類與原因分析，以 Next.js 全端應用呈現專業金融終端風格的資料介面。

## 目標

- 每日自動抓取漲停股及相關籌碼資料
- 以 AI（Claude 手動操作）將漲停股分類為族群並生成分析說明
- 提供比 chengwaye.com 更專業、資料更豐富的使用體驗
- 先本機運行，未來可部署至雲端

## 系統架構

```
Python 爬蟲 (TWSE) → SQLite → Next.js API Routes → Next.js 前端
                                    ↑
                          Claude 手動分類 (更新 JSON)
```

### 三層架構

1. **資料層**：Python 爬蟲 + SQLite 資料庫
2. **後端層**：Next.js API Routes
3. **前端層**：Next.js React + Tailwind CSS

## 資料層

### Python 爬蟲

**資料來源**：台灣證券交易所 (TWSE) 公開資料

**抓取內容**：
- 每日收盤行情（股價、漲跌、成交量）
- 漲停股篩選（漲幅達 10% 上限）
- 三大法人買賣超
- 融資融券餘額變化
- 主力券商買賣超（從證交所券商進出資料）

**抓取時機**：每日收盤後（14:00 後），手動或排程執行

**爬蟲模組結構**：
- `scraper/twse.py` — TWSE API 呼叫，取得每日收盤行情
- `scraper/institutional.py` — 三大法人買賣超
- `scraper/margin.py` — 融資融券
- `scraper/broker.py` — 主力券商進出
- `scraper/main.py` — 整合入口，執行所有爬蟲並寫入 SQLite

### SQLite 資料庫

**資料表設計**：

```sql
-- 每日收盤行情
daily_quotes (
  date TEXT,
  stock_code TEXT,
  stock_name TEXT,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  change REAL,
  change_pct REAL,
  volume INTEGER,
  turnover REAL,
  is_limit_up BOOLEAN,
  PRIMARY KEY (date, stock_code)
)

-- 族群分類結果（不使用，分類資料存於 data/daily/{date}.json）
-- 保留 schema 供未來參考

-- 三大法人買賣超
institutional_trades (
  date TEXT,
  stock_code TEXT,
  foreign_buy INTEGER,
  foreign_sell INTEGER,
  trust_buy INTEGER,
  trust_sell INTEGER,
  dealer_buy INTEGER,
  dealer_sell INTEGER,
  PRIMARY KEY (date, stock_code)
)

-- 融資融券
margin_trading (
  date TEXT,
  stock_code TEXT,
  margin_buy INTEGER,
  margin_sell INTEGER,
  margin_balance INTEGER,
  short_buy INTEGER,
  short_sell INTEGER,
  short_balance INTEGER,
  PRIMARY KEY (date, stock_code)
)

-- 主力券商買賣超
broker_trades (
  date TEXT,
  stock_code TEXT,
  broker_name TEXT,
  buy_volume INTEGER,
  sell_volume INTEGER,
  net_volume INTEGER,
  PRIMARY KEY (date, stock_code, broker_name)
)
```

### Claude 分類流程

每日工作流程：
1. 使用者執行 `python scraper/main.py` 抓取當日資料
2. 使用者在 Claude Code 中說「更新今天的漲停分類」
3. Claude 讀取 SQLite 中當日漲停股資料
4. Claude 依據產業關聯、題材、新聞等因素分類族群
5. Claude 將分類結果寫入 `data/daily/{YYYY-MM-DD}.json`
6. 網站自動讀取最新 JSON 顯示

**分類 JSON 格式**：

```json
{
  "date": "2026-03-20",
  "market_summary": {
    "taiex_close": 23412.56,
    "taiex_change_pct": 1.82,
    "total_volume": 384700000000,
    "limit_up_count": 54,
    "limit_down_count": 3,
    "advance": 892,
    "decline": 421,
    "unchanged": 187,
    "foreign_net": 12830000000,
    "trust_net": 3410000000,
    "dealer_net": -1270000000
  },
  "groups": [
    {
      "name": "AI 伺服器 / 散熱",
      "color": "#ef4444",
      "badges": ["HOT", "連3日"],
      "reason": "GB200 量產進度優於預期...",
      "stocks": ["3324", "3017", "8210", "2376"]
    }
  ]
}
```

## 後端層（Next.js API Routes）

### API 端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/daily/[date]` | GET | 取得指定日期的漲停分類資料 |
| `/api/daily/latest` | GET | 取得最新交易日資料 |
| `/api/stock/[code]` | GET | 取得個股歷史漲停紀錄與籌碼 |
| `/api/history` | GET | 取得歷史漲停統計（支援日期範圍查詢） |
| `/api/next-day/[date]` | GET | 取得某日漲停股的隔日表現 |
| `/api/dates` | GET | 取得所有有資料的交易日列表 |

### 資料讀取策略

- **JSON 檔為唯一分類資料來源**：`data/daily/{date}.json` 由 Claude 產生
- `group_classifications` SQLite 表不使用，分類結果僅存 JSON（簡化架構）
- 若無 JSON 檔，API 從 SQLite 讀取原始行情資料（僅顯示未分類漲停股列表）
- API 回傳統一格式，前端不需關心資料來源

## 前端層

### 技術選型

- **框架**：Next.js 14 (App Router)
- **樣式**：Tailwind CSS
- **圖表**：Recharts（走勢圖、柱狀圖）
- **狀態管理**：React hooks（SWR 做資料快取）
- **字型**：Inter（等寬數字 tabular-nums）

### 頁面結構

```
/                    — 每日漲停總覽（主頁面）
/history             — 歷史漲停數據
/stock/[code]        — 個股詳情頁
/next-day            — 隔日表現追蹤
/disposal            — 處置預測
/stats               — 統計分析
```

### 主頁面 UI 設計（已驗證 Mockup）

**風格**：專業金融終端，極簡暗色主題

**佈局**：
- **頂部導航列** (44px)：品牌 logo + 頁面切換 tabs + 搜尋框 + 時間
- **Ticker Bar** (36px)：加權/櫃買指數、成交量、漲跌家數、三大法人即時數據
- **主區域**：左右分欄
  - **左側（主內容區）**：日期導航 + 摘要標籤 + 族群區塊列表
  - **右側面板 (300px)**：熱力圖、族群分布、法人買賣超、主力排行、信用交易

**族群區塊設計**：
- 族群標題 + 色點標識 + 標籤（HOT / FOCUS / 連N日 / NEW）
- AI 分析原因說明（一行文字）
- 個股表格：代號、名稱、收盤價、漲幅、成交量、主力買賣超、5日走勢 sparkline
- 連板指示器：小圓點標記連續漲停天數

**配色系統**：
- 背景層級：`#07080c` → `#0c0e14` → `#111318` → `#16181f`
- 漲（紅）：`#ef4444`
- 跌（綠）：`#22c55e`
- 原物料（琥珀）：`#f59e0b`
- 標記（藍）：`#3b82f6`
- 強調（靛）：`#6366f1`

**數字排版**：所有數字使用 `font-variant-numeric: tabular-nums` 確保對齊

### 其他頁面簡述

**隔日表現 `/next-day`**：
- 追蹤前一交易日漲停股的今日表現
- 顯示：開盤漲跌、最高/最低、收盤結果
- 統計：漲停後隔日上漲/下跌比率

**歷史數據 `/history`**：
- 日曆視圖顯示每日漲停家數（顏色深淺代表數量）
- 可選日期查看當日分類結果
- 趨勢圖：漲停家數、族群熱度變化

**個股詳情 `/stock/[code]`**：
- K線圖 + 成交量
- 歷史漲停紀錄列表
- 籌碼面：法人買賣超趨勢、融資融券變化
- 曾出現的族群標籤

**處置預測 `/disposal`**：
- 計算連續漲停或異常交易天數
- 標記接近處置標準的個股
- 顯示處置條件與目前狀態

**統計分析 `/stats`**：
- 族群出現頻率排行
- 漲停後隔日表現統計
- 月度/季度漲停趨勢

## 通知系統（Phase 2）

- LINE Notify 或 Telegram Bot
- 觸發條件：每日收盤分類完成後自動推送
- 內容：今日漲停家數、主要族群、連板股提醒

## 分階段實施

### Phase 1：核心功能
- Python 爬蟲（TWSE 收盤行情 + 漲停篩選）
- SQLite 資料庫
- Claude 手動分類流程
- 主頁面（每日漲停總覽）
- 日期導航

### Phase 2：資料強化
- 三大法人買賣超
- 主力券商進出
- 融資融券
- 右側面板完整功能
- 隔日表現頁面

### Phase 3：進階功能
- 歷史數據頁面
- 個股詳情頁
- 處置預測
- 統計分析
- 通知系統（LINE/Telegram）

## 專案結構

```
漲停族群分類/
├── scraper/                  # Python 爬蟲
│   ├── requirements.txt
│   ├── main.py
│   ├── twse.py
│   ├── institutional.py
│   ├── margin.py
│   └── broker.py
├── data/
│   ├── stocks.db             # SQLite 資料庫
│   └── daily/                # Claude 分類 JSON
│       └── 2026-03-20.json
├── src/                      # Next.js 應用
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx          # 主頁面
│   │   ├── history/
│   │   ├── stock/[code]/
│   │   ├── next-day/
│   │   ├── disposal/
│   │   ├── stats/
│   │   └── api/
│   │       ├── daily/
│   │       ├── stock/
│   │       ├── history/
│   │       └── dates/
│   ├── components/
│   │   ├── TopNav.tsx
│   │   ├── TickerBar.tsx
│   │   ├── DateNav.tsx
│   │   ├── GroupBlock.tsx
│   │   ├── StockRow.tsx
│   │   ├── Sparkline.tsx
│   │   ├── HeatMap.tsx
│   │   ├── InstitutionalChart.tsx
│   │   └── SidePanel.tsx
│   ├── lib/
│   │   ├── db.ts             # SQLite 連接
│   │   ├── types.ts          # TypeScript 型別
│   │   └── utils.ts          # 工具函數
│   └── styles/
│       └── globals.css
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```
