# 漲停雷達 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Taiwan stock limit-up radar with TWSE scraper, SQLite storage, Claude classification workflow, and a professional dark-themed frontend showing daily limit-up groups.

**Architecture:** Python scraper fetches TWSE data into SQLite. Claude manually classifies stocks into groups saved as JSON. Next.js serves API routes reading from JSON/SQLite and renders a financial-terminal-style UI.

**Tech Stack:** Python 3 (requests, sqlite3), Next.js 14 (App Router), TypeScript, Tailwind CSS, SWR, better-sqlite3

**Spec:** `docs/superpowers/specs/2026-03-21-limit-up-radar-design.md`

---

## File Structure

```
漲停族群分類/
├── scraper/
│   ├── requirements.txt          # Python dependencies
│   ├── db.py                     # SQLite schema & connection
│   ├── twse.py                   # TWSE API scraper
│   ├── main.py                   # CLI entry point
│   └── tests/
│       ├── test_db.py            # DB schema tests
│       └── test_twse.py          # Scraper tests (mocked HTTP)
├── data/
│   ├── stocks.db                 # SQLite database (generated)
│   └── daily/                    # Claude classification JSONs
│       └── .gitkeep
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (dark theme, Inter font)
│   │   ├── page.tsx              # Main page (daily overview)
│   │   └── api/
│   │       └── daily/
│   │           ├── latest/
│   │           │   └── route.ts  # GET /api/daily/latest
│   │           └── [date]/
│   │               └── route.ts  # GET /api/daily/[date]
│   ├── components/
│   │   ├── TopNav.tsx            # Top navigation bar
│   │   ├── TickerBar.tsx         # Market data ticker
│   │   ├── DateNav.tsx           # Date navigation with arrows
│   │   ├── GroupBlock.tsx        # Single group card with stock table
│   │   ├── StockRow.tsx          # Individual stock row in table
│   │   ├── Sparkline.tsx         # Mini SVG trend line
│   │   └── SidePanel.tsx         # Right panel (heatmap, rankings)
│   ├── lib/
│   │   ├── db.ts                 # better-sqlite3 connection
│   │   ├── types.ts              # TypeScript interfaces
│   │   └── utils.ts              # Number formatting, date helpers
│   └── styles/
│       └── globals.css           # Tailwind imports + custom CSS vars
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── next.config.mjs
└── .gitignore
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.mjs`, `.gitignore`
- Create: `src/styles/globals.css`, `src/app/layout.tsx`
- Create: `scraper/requirements.txt`
- Create: `data/daily/.gitkeep`

- [ ] **Step 1: Initialize Next.js project**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

Expected: Next.js project initialized with App Router, TypeScript, Tailwind.

- [ ] **Step 2: Install additional dependencies**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
npm install better-sqlite3 swr
npm install -D @types/better-sqlite3
```

- [ ] **Step 3: Create .gitignore additions**

Append to `.gitignore`:
```
# Database
data/stocks.db

# Superpowers
.superpowers/
```

- [ ] **Step 4: Create Python scraper requirements**

Create `scraper/requirements.txt`:
```
requests>=2.31.0
pytest>=7.4.0
```

- [ ] **Step 5: Install Python dependencies**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
pip install -r scraper/requirements.txt
```

- [ ] **Step 6: Create data directory**

Run:
```bash
mkdir -p "C:/Users/pc/漲停族群分類/data/daily"
touch "C:/Users/pc/漲停族群分類/data/daily/.gitkeep"
```

- [ ] **Step 7: Configure Tailwind for dark theme**

Replace `src/styles/globals.css` with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-0: #07080c;
  --bg-1: #0c0e14;
  --bg-2: #111318;
  --bg-3: #16181f;
  --bg-4: #1c1f27;
  --border: rgba(255, 255, 255, 0.05);
  --border-hover: rgba(255, 255, 255, 0.1);
  --text-0: #f1f5f9;
  --text-1: #cbd5e1;
  --text-2: #94a3b8;
  --text-3: #64748b;
  --text-4: #475569;
  --red: #ef4444;
  --red-bg: rgba(239, 68, 68, 0.08);
  --green: #22c55e;
  --green-bg: rgba(34, 197, 94, 0.08);
  --blue: #3b82f6;
  --blue-bg: rgba(59, 130, 246, 0.08);
  --amber: #f59e0b;
  --amber-bg: rgba(245, 158, 11, 0.08);
  --accent: #6366f1;
}

body {
  background: var(--bg-0);
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

* {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 8: Configure tailwind.config.ts**

Update `tailwind.config.ts` to extend colors with the CSS variables:
```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          0: "var(--bg-0)",
          1: "var(--bg-1)",
          2: "var(--bg-2)",
          3: "var(--bg-3)",
          4: "var(--bg-4)",
        },
        border: {
          DEFAULT: "var(--border)",
          hover: "var(--border-hover)",
        },
        txt: {
          0: "var(--text-0)",
          1: "var(--text-1)",
          2: "var(--text-2)",
          3: "var(--text-3)",
          4: "var(--text-4)",
        },
        red: {
          DEFAULT: "var(--red)",
          bg: "var(--red-bg)",
        },
        green: {
          DEFAULT: "var(--green)",
          bg: "var(--green-bg)",
        },
        blue: {
          DEFAULT: "var(--blue)",
          bg: "var(--blue-bg)",
        },
        amber: {
          DEFAULT: "var(--amber)",
          bg: "var(--amber-bg)",
        },
        accent: "var(--accent)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 9: Create root layout**

Replace `src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "漲停雷達",
  description: "台股漲停族群分類與分析平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Verify dev server starts**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
npm run dev
```

Expected: Server starts at http://localhost:3000, dark background visible.

- [ ] **Step 11: Initialize git and commit**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
git init
git add -A
git commit -m "chore: scaffold Next.js + Python project structure"
```

---

## Task 2: Python Scraper — SQLite Schema & DB Module

**Files:**
- Create: `scraper/db.py`
- Create: `scraper/tests/test_db.py`

- [ ] **Step 1: Write failing test for DB schema creation**

Create `scraper/tests/__init__.py` (empty file).

Create `scraper/tests/test_db.py`:
```python
import os
import sqlite3
import tempfile
import pytest
from scraper.db import init_db, get_connection

def test_init_db_creates_tables():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        init_db(db_path)
        conn = sqlite3.connect(db_path)
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row[0] for row in cursor.fetchall()]
        conn.close()
        assert "daily_quotes" in tables
        assert "institutional_trades" in tables
        assert "margin_trading" in tables
        assert "broker_trades" in tables

def test_get_connection_returns_working_connection():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        init_db(db_path)
        conn = get_connection(db_path)
        conn.execute("SELECT 1")
        conn.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
python -m pytest scraper/tests/test_db.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'scraper.db'`

- [ ] **Step 3: Create scraper package init and db module**

Create `scraper/__init__.py` (empty file).

Create `scraper/db.py`:
```python
import sqlite3
import os

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stocks.db")

def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS daily_quotes (
            date TEXT NOT NULL,
            stock_code TEXT NOT NULL,
            stock_name TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            change REAL,
            change_pct REAL,
            volume INTEGER,
            turnover REAL,
            is_limit_up INTEGER DEFAULT 0,
            PRIMARY KEY (date, stock_code)
        );

        CREATE TABLE IF NOT EXISTS institutional_trades (
            date TEXT NOT NULL,
            stock_code TEXT NOT NULL,
            foreign_buy INTEGER DEFAULT 0,
            foreign_sell INTEGER DEFAULT 0,
            trust_buy INTEGER DEFAULT 0,
            trust_sell INTEGER DEFAULT 0,
            dealer_buy INTEGER DEFAULT 0,
            dealer_sell INTEGER DEFAULT 0,
            PRIMARY KEY (date, stock_code)
        );

        CREATE TABLE IF NOT EXISTS margin_trading (
            date TEXT NOT NULL,
            stock_code TEXT NOT NULL,
            margin_buy INTEGER DEFAULT 0,
            margin_sell INTEGER DEFAULT 0,
            margin_balance INTEGER DEFAULT 0,
            short_buy INTEGER DEFAULT 0,
            short_sell INTEGER DEFAULT 0,
            short_balance INTEGER DEFAULT 0,
            PRIMARY KEY (date, stock_code)
        );

        CREATE TABLE IF NOT EXISTS broker_trades (
            date TEXT NOT NULL,
            stock_code TEXT NOT NULL,
            broker_name TEXT NOT NULL,
            buy_volume INTEGER DEFAULT 0,
            sell_volume INTEGER DEFAULT 0,
            net_volume INTEGER DEFAULT 0,
            PRIMARY KEY (date, stock_code, broker_name)
        );
    """)
    conn.close()

def get_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
python -m pytest scraper/tests/test_db.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scraper/
git commit -m "feat: add SQLite database schema and connection module"
```

---

## Task 3: Python Scraper — TWSE Daily Quotes

**Files:**
- Create: `scraper/twse.py`
- Create: `scraper/tests/test_twse.py`

- [ ] **Step 1: Write failing test for TWSE data parsing**

Create `scraper/tests/test_twse.py`:
```python
import json
from scraper.twse import parse_daily_quotes, is_limit_up

# Sample TWSE API response structure (abbreviated)
SAMPLE_TWSE_RESPONSE = {
    "stat": "OK",
    "date": "20260320",
    "title": "115年03月20日 每日收盤行情",
    "fields9": [
        "證券代號", "證券名稱", "成交股數", "成交筆數", "成交金額",
        "開盤價", "最高價", "最低價", "收盤價", "漲跌(+/-)",
        "漲跌價差", "最後揭示買價", "最後揭示買量", "最後揭示賣價",
        "最後揭示賣量", "本益比"
    ],
    "data9": [
        ["2330", "台積電", "45,678,901", "23,456", "29,876,543,210",
         "650.00", "660.00", "648.00", "658.00", "+",
         "8.00", "658.00", "100", "659.00", "200", "25.30"],
        ["2002", "中鋼", "142,876,000", "45,678", "4,634,385,200",
         "30.50", "32.45", "30.20", "32.45", "+",
         "2.95", "32.45", "500", "32.50", "300", "15.20"],
    ]
}

def test_parse_daily_quotes_extracts_fields():
    quotes = parse_daily_quotes(SAMPLE_TWSE_RESPONSE, "2026-03-20")
    assert len(quotes) == 2
    tsmc = quotes[0]
    assert tsmc["stock_code"] == "2330"
    assert tsmc["stock_name"] == "台積電"
    assert tsmc["close"] == 658.0
    assert tsmc["change"] == 8.0
    assert tsmc["volume"] == 45678901

def test_parse_daily_quotes_handles_commas_in_numbers():
    quotes = parse_daily_quotes(SAMPLE_TWSE_RESPONSE, "2026-03-20")
    assert quotes[1]["volume"] == 142876000

def test_is_limit_up():
    # 普通股漲幅限制 10%
    assert is_limit_up(close=32.45, prev_close=29.50) is True   # exactly 10%
    assert is_limit_up(close=32.00, prev_close=29.50) is False  # < 10%

def test_parse_daily_quotes_bad_stat():
    bad_response = {"stat": "ERROR", "data9": []}
    quotes = parse_daily_quotes(bad_response, "2026-03-20")
    assert quotes == []
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
python -m pytest scraper/tests/test_twse.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Implement TWSE scraper**

Create `scraper/twse.py`:
```python
import requests
import time
from typing import Any

TWSE_DAILY_URL = "https://www.twse.com.tw/exchangeReport/MI_INDEX"

def parse_number(s: str) -> float:
    """Parse a number string that may contain commas, or return 0.0 on failure."""
    try:
        return float(s.replace(",", ""))
    except (ValueError, AttributeError):
        return 0.0

def is_limit_up(close: float, prev_close: float) -> bool:
    """Check if the stock hit limit-up (10% for regular stocks)."""
    if prev_close <= 0:
        return False
    change_pct = (close - prev_close) / prev_close * 100
    return change_pct >= 9.5  # Allow small rounding tolerance

def parse_daily_quotes(response_data: dict[str, Any], date: str) -> list[dict]:
    """Parse TWSE MI_INDEX API response into list of stock quote dicts."""
    if response_data.get("stat") != "OK":
        return []

    data = response_data.get("data9", [])
    quotes = []

    for row in data:
        if len(row) < 11:
            continue

        try:
            close = parse_number(row[8])
            change_val = parse_number(row[10])
            sign = row[9].strip()
            if sign == "-":
                change_val = -change_val

            prev_close = close - change_val if close > 0 else 0
            change_pct = (change_val / prev_close * 100) if prev_close > 0 else 0.0

            quote = {
                "date": date,
                "stock_code": row[0].strip(),
                "stock_name": row[1].strip(),
                "open": parse_number(row[5]),
                "high": parse_number(row[6]),
                "low": parse_number(row[7]),
                "close": close,
                "change": change_val,
                "change_pct": round(change_pct, 2),
                "volume": int(parse_number(row[2])),
                "turnover": parse_number(row[4]),
                "is_limit_up": is_limit_up(close, prev_close),
            }
            quotes.append(quote)
        except (IndexError, ValueError):
            continue

    return quotes

def fetch_daily_quotes(date: str) -> list[dict]:
    """Fetch daily quotes from TWSE for a given date (format: YYYY-MM-DD).

    The TWSE API expects date in YYYYMMDD format.
    Returns parsed list of stock quotes.
    """
    twse_date = date.replace("-", "")
    params = {
        "response": "json",
        "date": twse_date,
        "type": "ALLBUT0999",
    }
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
    }

    resp = requests.get(TWSE_DAILY_URL, params=params, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return parse_daily_quotes(data, date)
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
python -m pytest scraper/tests/test_twse.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scraper/twse.py scraper/tests/test_twse.py
git commit -m "feat: add TWSE daily quotes scraper with parsing logic"
```

---

## Task 4: Python Scraper — Main CLI Entry Point

**Files:**
- Create: `scraper/main.py`

- [ ] **Step 1: Create main.py CLI**

Create `scraper/main.py`:
```python
"""
漲停雷達 — 每日爬蟲入口

Usage:
    python -m scraper.main                    # 抓取今天的資料
    python -m scraper.main 2026-03-20         # 抓取指定日期
    python -m scraper.main --init             # 僅初始化資料庫
"""
import sys
import sqlite3
from datetime import date

from scraper.db import init_db, get_connection, DEFAULT_DB_PATH
from scraper.twse import fetch_daily_quotes

def save_quotes(conn: sqlite3.Connection, quotes: list[dict]) -> int:
    """Insert quotes into daily_quotes, skip duplicates. Returns count inserted."""
    inserted = 0
    for q in quotes:
        try:
            conn.execute(
                """INSERT OR IGNORE INTO daily_quotes
                   (date, stock_code, stock_name, open, high, low, close,
                    change, change_pct, volume, turnover, is_limit_up)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (q["date"], q["stock_code"], q["stock_name"],
                 q["open"], q["high"], q["low"], q["close"],
                 q["change"], q["change_pct"], q["volume"],
                 q["turnover"], int(q["is_limit_up"])),
            )
            inserted += conn.total_changes
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    return inserted

def main():
    if "--init" in sys.argv:
        init_db()
        print(f"Database initialized at {DEFAULT_DB_PATH}")
        return

    target_date = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()

    print(f"=== 漲停雷達爬蟲 ===")
    print(f"日期: {target_date}")
    print()

    # Initialize DB
    init_db()

    # Fetch daily quotes
    print("正在抓取 TWSE 每日收盤行情...")
    quotes = fetch_daily_quotes(target_date)
    print(f"  取得 {len(quotes)} 筆股票資料")

    limit_up_stocks = [q for q in quotes if q["is_limit_up"]]
    print(f"  其中 {len(limit_up_stocks)} 檔漲停")

    # Save to DB
    conn = get_connection()
    save_quotes(conn, quotes)
    conn.close()
    print(f"  已儲存至資料庫")

    # Print limit-up summary
    if limit_up_stocks:
        print()
        print("=== 漲停股列表 ===")
        for s in sorted(limit_up_stocks, key=lambda x: x["volume"], reverse=True):
            print(f"  {s['stock_code']} {s['stock_name']:　<6} "
                  f"收盤: {s['close']:>8.2f}  漲幅: {s['change_pct']:>6.2f}%  "
                  f"成交量: {s['volume']:>12,}")

    print()
    print("完成！請在 Claude Code 中執行族群分類。")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Test the CLI help flow**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
python -m scraper.main --init
```

Expected: `Database initialized at ...data/stocks.db`

- [ ] **Step 3: Commit**

```bash
git add scraper/main.py
git commit -m "feat: add scraper CLI entry point with save-to-db logic"
```

---

## Task 5: Sample Classification JSON

**Files:**
- Create: `data/daily/2026-03-20.json`

- [ ] **Step 1: Create sample JSON for development**

Create `data/daily/2026-03-20.json`:
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
      "reason": "GB200 量產進度優於預期，散熱與機殼供應鏈訂單能見度拉長至 Q4，帶動族群全面攻頂",
      "stocks": [
        {
          "code": "3324",
          "name": "雙鴻",
          "industry": "散熱模組",
          "close": 385.0,
          "change_pct": 10.0,
          "volume": 18432,
          "major_net": 2847,
          "streak": 3
        },
        {
          "code": "3017",
          "name": "奇鋐",
          "industry": "散熱模組",
          "close": 412.5,
          "change_pct": 10.0,
          "volume": 24108,
          "major_net": 1923,
          "streak": 2
        },
        {
          "code": "8210",
          "name": "勤誠",
          "industry": "伺服器機殼",
          "close": 289.0,
          "change_pct": 10.0,
          "volume": 12567,
          "major_net": 956,
          "streak": 0
        },
        {
          "code": "2376",
          "name": "技嘉",
          "industry": "伺服器/主機板",
          "close": 456.0,
          "change_pct": 10.0,
          "volume": 31204,
          "major_net": 4512,
          "streak": 0
        }
      ]
    },
    {
      "name": "半導體設備 / 先進封裝",
      "color": "#22c55e",
      "badges": ["FOCUS"],
      "reason": "CoWoS 產能擴充加速，先進封裝設備商接單滿載，測試廠稼動率飆升至歷史新高",
      "stocks": [
        {
          "code": "3131",
          "name": "弘塑",
          "industry": "半導體設備",
          "close": 1285.0,
          "change_pct": 10.0,
          "volume": 5432,
          "major_net": 1204,
          "streak": 0
        },
        {
          "code": "3413",
          "name": "京鼎",
          "industry": "半導體設備",
          "close": 567.0,
          "change_pct": 10.0,
          "volume": 8921,
          "major_net": 876,
          "streak": 0
        },
        {
          "code": "6510",
          "name": "精測",
          "industry": "半導體測試",
          "close": 892.0,
          "change_pct": 10.0,
          "volume": 3845,
          "major_net": 634,
          "streak": 0
        }
      ]
    },
    {
      "name": "鋼鐵 / 原物料",
      "color": "#f59e0b",
      "badges": [],
      "reason": "中國限產政策推升亞洲鋼價創近期新高，加上基建需求回溫，鋼鐵股集體反映漲價題材",
      "stocks": [
        {
          "code": "2002",
          "name": "中鋼",
          "industry": "鋼鐵",
          "close": 32.45,
          "change_pct": 10.0,
          "volume": 142876,
          "major_net": 15302,
          "streak": 0
        },
        {
          "code": "2014",
          "name": "中鴻",
          "industry": "鋼鐵",
          "close": 24.80,
          "change_pct": 10.0,
          "volume": 87432,
          "major_net": 8456,
          "streak": 0
        }
      ]
    },
    {
      "name": "光通訊 / 矽光子",
      "color": "#ec4899",
      "badges": ["NEW"],
      "reason": "800G 光模組需求提前，矽光子技術突破帶動相關供應鏈強勢表態",
      "stocks": [
        {
          "code": "3081",
          "name": "聯亞",
          "industry": "光通訊元件",
          "close": 198.5,
          "change_pct": 10.0,
          "volume": 9845,
          "major_net": 2156,
          "streak": 0
        },
        {
          "code": "4904",
          "name": "遠傳",
          "industry": "光纖通訊",
          "close": 85.6,
          "change_pct": 10.0,
          "volume": 34521,
          "major_net": 1834,
          "streak": 0
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add data/
git commit -m "feat: add sample classification JSON for development"
```

---

## Task 6: TypeScript Types & Utilities

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Create TypeScript interfaces**

Create `src/lib/types.ts`:
```ts
export interface MarketSummary {
  taiex_close: number;
  taiex_change_pct: number;
  total_volume: number;
  limit_up_count: number;
  limit_down_count: number;
  advance: number;
  decline: number;
  unchanged: number;
  foreign_net: number;
  trust_net: number;
  dealer_net: number;
}

export interface Stock {
  code: string;
  name: string;
  industry: string;
  close: number;
  change_pct: number;
  volume: number;
  major_net: number;
  streak: number;
}

export interface StockGroup {
  name: string;
  color: string;
  badges: string[];
  reason: string;
  stocks: Stock[];
}

export interface DailyData {
  date: string;
  market_summary: MarketSummary;
  groups: StockGroup[];
}
```

- [ ] **Step 2: Create utility functions**

Create `src/lib/utils.ts`:
```ts
/**
 * Format a number with commas: 12345 → "12,345"
 */
export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Format volume in 億 if large enough: 384700000000 → "3,847 億"
 */
export function formatVolume(n: number): string {
  if (n >= 1e8) {
    return `${formatNumber(Math.round(n / 1e8))} 億`;
  }
  return formatNumber(n);
}

/**
 * Format net buy/sell: 2847 → "+2,847", -500 → "-500"
 */
export function formatNet(n: number): string {
  const prefix = n > 0 ? "+" : "";
  return `${prefix}${formatNumber(n)}`;
}

/**
 * Format percentage: 10.0 → "+10.00%"
 */
export function formatPct(n: number): string {
  const prefix = n > 0 ? "+" : "";
  return `${prefix}${n.toFixed(2)}%`;
}

/**
 * Format price with appropriate decimals
 */
export function formatPrice(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

/**
 * Convert date string to display format: "2026-03-20" → "2026.03.20"
 */
export function formatDateDisplay(date: string): string {
  return date.replace(/-/g, ".");
}

/**
 * Get weekday in Chinese: "2026-03-20" → "週五"
 */
export function getWeekday(date: string): string {
  const days = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  return days[new Date(date).getDay()];
}

/**
 * Shift date by N days: ("2026-03-20", -1) → "2026-03-19"
 */
export function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/
git commit -m "feat: add TypeScript types and utility functions"
```

---

## Task 7: Next.js API Routes

**Files:**
- Create: `src/app/api/daily/latest/route.ts`
- Create: `src/app/api/daily/[date]/route.ts`
- Create: `src/app/api/dates/route.ts`

- [ ] **Step 1: Create API route for specific date**

Create directories and `src/app/api/daily/[date]/route.ts`:
```ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  const { date } = await params;

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const jsonPath = path.join(DATA_DIR, `${date}.json`);

  if (!fs.existsSync(jsonPath)) {
    return NextResponse.json({ error: "No data for this date" }, { status: 404 });
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  return NextResponse.json(data);
}
```

- [ ] **Step 2: Create API route for latest date**

Create `src/app/api/daily/latest/route.ts`:
```ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

export async function GET() {
  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json({ error: "No data directory" }, { status: 404 });
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    return NextResponse.json({ error: "No data available" }, { status: 404 });
  }

  const latestFile = files[0];
  const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, latestFile), "utf-8"));
  return NextResponse.json(data);
}
```

- [ ] **Step 3: Create API route for available dates**

Create `src/app/api/dates/route.ts`:
```ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data", "daily");

export async function GET() {
  if (!fs.existsSync(DATA_DIR)) {
    return NextResponse.json({ dates: [] });
  }

  const dates = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort()
    .reverse();

  return NextResponse.json({ dates });
}
```

- [ ] **Step 4: Verify API works**

Run dev server and test:
```bash
cd "C:/Users/pc/漲停族群分類"
npm run dev
```

Then visit: `http://localhost:3000/api/daily/latest`
Expected: JSON response with sample data.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/
git commit -m "feat: add API routes for daily data, latest, and dates"
```

---

## Task 8: Frontend — TopNav Component

**Files:**
- Create: `src/components/TopNav.tsx`

- [ ] **Step 1: Create TopNav component**

Create `src/components/TopNav.tsx`:
```tsx
"use client";

interface TopNavProps {
  currentDate: string;
}

export default function TopNav({ currentDate }: TopNavProps) {
  return (
    <nav className="flex items-center justify-between h-11 px-5 bg-bg-1 border-b border-border">
      {/* Left: Brand + Tabs */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 font-bold text-sm text-txt-0 tracking-tight whitespace-nowrap">
          <div className="w-[7px] h-[7px] bg-red rounded-sm" />
          漲停雷達
        </div>
        <div className="w-px h-5 bg-border" />
        <div className="flex h-11">
          {["每日總覽", "隔日表現", "歷史數據", "處置預測", "統計分析"].map(
            (label, i) => (
              <button
                key={label}
                className={`px-3.5 text-xs font-medium tracking-wide border-b-2 transition-colors ${
                  i === 0
                    ? "text-txt-0 border-red"
                    : "text-txt-3 border-transparent hover:text-txt-1"
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>
      </div>

      {/* Right: Status + Search + Clock */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] text-txt-4 font-medium">
          <div className="w-[5px] h-[5px] rounded-full bg-green animate-pulse" />
          已更新
        </div>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-txt-4">
            ⌕
          </span>
          <input
            type="text"
            placeholder="搜尋代號 / 名稱"
            className="bg-bg-3 border border-border rounded-md py-1 pl-7 pr-2.5 text-xs text-txt-2 w-[180px] outline-none focus:border-border-hover placeholder:text-txt-4"
          />
        </div>
        <div className="text-[11px] text-txt-4 tabular-nums tracking-wider whitespace-nowrap">
          {currentDate.replace(/-/g, "/")}
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TopNav.tsx
git commit -m "feat: add TopNav component"
```

---

## Task 9: Frontend — TickerBar Component

**Files:**
- Create: `src/components/TickerBar.tsx`

- [ ] **Step 1: Create TickerBar component**

Create `src/components/TickerBar.tsx`:
```tsx
import { MarketSummary } from "@/lib/types";
import { formatNumber, formatPct, formatVolume } from "@/lib/utils";

interface TickerBarProps {
  summary: MarketSummary;
}

function TickerItem({
  label,
  value,
  type = "neutral",
}: {
  label: string;
  value: string;
  type?: "up" | "dn" | "neutral";
}) {
  const colorClass =
    type === "up" ? "text-red" : type === "dn" ? "text-green" : "text-txt-2";
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-[11px] text-txt-4 font-medium">{label}</span>
      <span className={`text-xs font-semibold ${colorClass}`}>{value}</span>
    </div>
  );
}

function Separator() {
  return <div className="w-px h-4 bg-border flex-shrink-0" />;
}

export default function TickerBar({ summary }: TickerBarProps) {
  const s = summary;
  const taiexType = s.taiex_change_pct >= 0 ? "up" : "dn";
  const foreignType = s.foreign_net >= 0 ? "up" : "dn";
  const trustType = s.trust_net >= 0 ? "up" : "dn";
  const dealerType = s.dealer_net >= 0 ? "up" : "dn";

  return (
    <div className="flex items-center h-9 px-5 bg-bg-1 border-b border-border gap-6 overflow-hidden">
      <TickerItem
        label="加權"
        value={formatNumber(s.taiex_close)}
        type={taiexType}
      />
      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
          taiexType === "up" ? "bg-red-bg text-red" : "bg-green-bg text-green"
        }`}
      >
        {formatPct(s.taiex_change_pct)}
      </span>
      <Separator />
      <TickerItem
        label="成交"
        value={formatVolume(s.total_volume)}
        type="neutral"
      />
      <Separator />
      <TickerItem
        label="漲停"
        value={String(s.limit_up_count)}
        type="up"
      />
      <TickerItem
        label="跌停"
        value={String(s.limit_down_count)}
        type="dn"
      />
      <Separator />
      <TickerItem label="漲" value={String(s.advance)} type="up" />
      <TickerItem label="跌" value={String(s.decline)} type="dn" />
      <TickerItem label="平" value={String(s.unchanged)} type="neutral" />
      <Separator />
      <TickerItem
        label="外資"
        value={formatVolume(Math.abs(s.foreign_net))}
        type={foreignType}
      />
      <TickerItem
        label="投信"
        value={formatVolume(Math.abs(s.trust_net))}
        type={trustType}
      />
      <TickerItem
        label="自營"
        value={formatVolume(Math.abs(s.dealer_net))}
        type={dealerType}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TickerBar.tsx
git commit -m "feat: add TickerBar component"
```

---

## Task 10: Frontend — DateNav Component

**Files:**
- Create: `src/components/DateNav.tsx`

- [ ] **Step 1: Create DateNav component**

Create `src/components/DateNav.tsx`:
```tsx
"use client";

import { formatDateDisplay, getWeekday } from "@/lib/utils";

interface DateNavProps {
  date: string;
  limitUpCount: number;
  groupCount: number;
  onPrev: () => void;
  onNext: () => void;
}

function SummaryChip({
  label,
  color,
}: {
  label: string;
  color: "red" | "blue" | "amber";
}) {
  const styles = {
    red: "bg-red-bg text-red",
    blue: "bg-blue-bg text-blue",
    amber: "bg-amber-bg text-amber",
  };
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold ${styles[color]}`}>
      {label}
    </span>
  );
}

export default function DateNav({
  date,
  limitUpCount,
  groupCount,
  onPrev,
  onNext,
}: DateNavProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          className="w-7 h-7 bg-bg-3 border border-border rounded flex items-center justify-center text-txt-3 text-xs hover:border-border-hover hover:text-txt-1 transition-colors"
        >
          ‹
        </button>
        <div className="text-lg font-bold text-txt-0 tracking-tight tabular-nums">
          {formatDateDisplay(date)}
          <span className="text-xs text-txt-4 ml-2 font-normal">
            {getWeekday(date)}
          </span>
        </div>
        <button
          onClick={onNext}
          className="w-7 h-7 bg-bg-3 border border-border rounded flex items-center justify-center text-txt-3 text-xs hover:border-border-hover hover:text-txt-1 transition-colors"
        >
          ›
        </button>
      </div>
      <div className="flex gap-1.5">
        <SummaryChip label={`${limitUpCount} 檔漲停`} color="red" />
        <SummaryChip label={`${groupCount} 族群`} color="blue" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DateNav.tsx
git commit -m "feat: add DateNav component"
```

---

## Task 11: Frontend — Sparkline, StockRow, GroupBlock Components

**Files:**
- Create: `src/components/Sparkline.tsx`
- Create: `src/components/StockRow.tsx`
- Create: `src/components/GroupBlock.tsx`

- [ ] **Step 1: Create Sparkline SVG component**

Create `src/components/Sparkline.tsx`:
```tsx
interface SparklineProps {
  color: string;
}

/**
 * Decorative sparkline showing an upward trend.
 * In Phase 2, this will accept real historical data points.
 */
export default function Sparkline({ color }: SparklineProps) {
  // Generate a deterministic upward trend for now
  const points = "0,18 8,16 16,17 24,12 32,8 40,5 48,3 56,1";
  return (
    <svg className="w-14 h-[22px]" viewBox="0 0 56 22">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Create StockRow component**

Create `src/components/StockRow.tsx`:
```tsx
import { Stock } from "@/lib/types";
import { formatPrice, formatPct, formatNumber, formatNet } from "@/lib/utils";
import Sparkline from "./Sparkline";

interface StockRowProps {
  stock: Stock;
  groupColor: string;
}

export default function StockRow({ stock, groupColor }: StockRowProps) {
  const s = stock;
  return (
    <div className="grid grid-cols-[44px_1fr_100px_80px_90px_90px_80px] px-4 py-2 items-center border-b border-white/[0.02] last:border-b-0 cursor-pointer hover:bg-white/[0.015] transition-colors">
      {/* Code */}
      <div className="text-xs font-semibold text-txt-2 tabular-nums">
        {s.code}
      </div>

      {/* Name + Industry */}
      <div>
        <div className="text-[13px] font-semibold text-txt-0 flex items-center gap-1">
          {s.name}
          {s.streak > 0 && (
            <span className="flex gap-0.5 ml-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-1 h-1 rounded-full ${
                    i < s.streak ? "bg-red" : "bg-bg-4"
                  }`}
                />
              ))}
            </span>
          )}
        </div>
        <div className="text-[10px] text-txt-4 mt-0.5">{s.industry}</div>
      </div>

      {/* Price */}
      <div className="text-right text-[13px] font-bold text-red tabular-nums">
        {formatPrice(s.close)}
      </div>

      {/* Change % */}
      <div className="text-right text-xs font-semibold text-red tabular-nums">
        {formatPct(s.change_pct)}
      </div>

      {/* Volume */}
      <div className="text-right text-xs text-txt-2 tabular-nums">
        {formatNumber(s.volume)}
      </div>

      {/* Major net */}
      <div
        className={`text-right text-xs font-semibold tabular-nums ${
          s.major_net >= 0 ? "text-red" : "text-green"
        }`}
      >
        {formatNet(s.major_net)}
      </div>

      {/* Sparkline */}
      <div className="flex justify-end">
        <Sparkline color={groupColor} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create GroupBlock component**

Create `src/components/GroupBlock.tsx`:
```tsx
import { StockGroup } from "@/lib/types";
import StockRow from "./StockRow";

interface GroupBlockProps {
  group: StockGroup;
}

const BADGE_STYLES: Record<string, string> = {
  HOT: "bg-red-bg text-red",
  FOCUS: "bg-red-bg text-red",
  NEW: "bg-blue-bg text-blue",
};

function getBadgeStyle(badge: string): string {
  // Check for known badges
  if (BADGE_STYLES[badge]) return BADGE_STYLES[badge];
  // Default for streak badges like "連3日"
  if (badge.includes("連")) return "bg-amber-bg text-amber";
  return "bg-blue-bg text-blue";
}

export default function GroupBlock({ group }: GroupBlockProps) {
  return (
    <div className="bg-bg-1 border border-border rounded-lg mb-3 overflow-hidden hover:border-border-hover transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-0.5"
            style={{ backgroundColor: group.color }}
          />
          <div>
            <span className="text-sm font-bold text-txt-0 tracking-tight">
              {group.name}
            </span>
            {group.badges.map((badge) => (
              <span
                key={badge}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1.5 ${getBadgeStyle(badge)}`}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-txt-4 font-medium">
          {group.stocks.length} 檔
        </div>
      </div>

      {/* Reason */}
      <div className="px-4 pb-2.5 pl-[36px] text-xs text-txt-3 leading-relaxed">
        {group.reason}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[44px_1fr_100px_80px_90px_90px_80px] px-4 py-1.5 bg-bg-2 border-t border-b border-border">
        {["代號", "名稱", "", "", "", "", ""].map((h, i) => {
          const labels = ["代號", "名稱", "收盤價", "漲幅", "成交量", "主力", "5日"];
          return (
            <div
              key={i}
              className={`text-[10px] font-semibold uppercase tracking-wider text-txt-4 ${
                i >= 2 ? "text-right" : ""
              }`}
            >
              {labels[i]}
            </div>
          );
        })}
      </div>

      {/* Stock rows */}
      {group.stocks.map((stock) => (
        <StockRow key={stock.code} stock={stock} groupColor={group.color} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Sparkline.tsx src/components/StockRow.tsx src/components/GroupBlock.tsx
git commit -m "feat: add Sparkline, StockRow, and GroupBlock components"
```

---

## Task 12: Frontend — SidePanel Component

**Files:**
- Create: `src/components/SidePanel.tsx`

- [ ] **Step 1: Create SidePanel component**

Create `src/components/SidePanel.tsx`:
```tsx
import { DailyData, Stock, StockGroup } from "@/lib/types";
import { formatNumber, formatVolume } from "@/lib/utils";

interface SidePanelProps {
  data: DailyData;
}

function PanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 border-b border-border">
      <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

function DistRow({
  label,
  count,
  maxCount,
  color,
}: {
  label: string;
  count: number;
  maxCount: number;
  color: string;
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="text-[11px] text-txt-2 w-20 truncate">{label}</div>
      <div className="flex-1 h-1.5 bg-bg-3 rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="text-[10px] text-txt-4 w-6 text-right tabular-nums">
        {count}
      </div>
    </div>
  );
}

function InstitutionalRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const isBuy = value >= 0;
  const barWidth = Math.min(Math.abs(value) / 200e8 * 50, 50); // Scale relative to 200億

  return (
    <div className="flex items-center py-1.5">
      <div className="text-xs text-txt-2 font-medium w-12">{label}</div>
      <div className="flex-1 mx-2.5 relative h-3.5">
        <div className="absolute inset-0 bg-bg-3 rounded-sm" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
        {isBuy ? (
          <div
            className="absolute top-0 h-full rounded-sm left-1/2"
            style={{
              width: `${barWidth}%`,
              background:
                "linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.4))",
            }}
          />
        ) : (
          <div
            className="absolute top-0 h-full rounded-sm"
            style={{
              width: `${barWidth}%`,
              right: "50%",
              background:
                "linear-gradient(270deg, rgba(34,197,94,0.15), rgba(34,197,94,0.4))",
            }}
          />
        )}
      </div>
      <div
        className={`text-[11px] font-bold tabular-nums w-14 text-right ${
          isBuy ? "text-red" : "text-green"
        }`}
      >
        {isBuy ? "+" : ""}
        {formatVolume(Math.abs(value))}
      </div>
    </div>
  );
}

export default function SidePanel({ data }: SidePanelProps) {
  const { market_summary: s, groups } = data;

  // Get all stocks sorted by major_net
  const allStocks: (Stock & { groupColor: string })[] = groups.flatMap((g) =>
    g.stocks.map((st) => ({ ...st, groupColor: g.color }))
  );
  const topBuyers = [...allStocks]
    .sort((a, b) => b.major_net - a.major_net)
    .slice(0, 5);

  const maxGroupCount = Math.max(...groups.map((g) => g.stocks.length), 1);

  return (
    <div className="w-[300px] flex-shrink-0 bg-bg-1 border-l border-border overflow-y-auto">
      {/* Group distribution */}
      <PanelSection title="族群分布">
        {groups.map((g) => (
          <DistRow
            key={g.name}
            label={g.name}
            count={g.stocks.length}
            maxCount={maxGroupCount}
            color={g.color}
          />
        ))}
      </PanelSection>

      {/* Institutional */}
      <PanelSection title="三大法人買賣超">
        <InstitutionalRow label="外資" value={s.foreign_net} />
        <InstitutionalRow label="投信" value={s.trust_net} />
        <InstitutionalRow label="自營商" value={s.dealer_net} />
      </PanelSection>

      {/* Top buyers */}
      <PanelSection title="主力買超排行">
        {topBuyers.map((st, i) => (
          <div
            key={st.code}
            className="flex items-center gap-2 py-1.5 border-b border-white/[0.02] last:border-b-0"
          >
            <div
              className={`w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                i < 3
                  ? "bg-red-bg text-red"
                  : "bg-bg-3 text-txt-4"
              }`}
            >
              {i + 1}
            </div>
            <div className="flex-1 text-xs text-txt-1 font-medium">
              {st.name}{" "}
              <span className="text-txt-4">{st.code}</span>
            </div>
            <div className="text-[11px] font-bold text-red tabular-nums">
              +{formatNumber(st.major_net)}
            </div>
          </div>
        ))}
      </PanelSection>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SidePanel.tsx
git commit -m "feat: add SidePanel component with group distribution and rankings"
```

---

## Task 13: Frontend — Main Page Assembly

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create the main page**

Replace `src/app/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { DailyData } from "@/lib/types";
import { shiftDate } from "@/lib/utils";
import TopNav from "@/components/TopNav";
import TickerBar from "@/components/TickerBar";
import DateNav from "@/components/DateNav";
import GroupBlock from "@/components/GroupBlock";
import SidePanel from "@/components/SidePanel";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Home() {
  const [currentDate, setCurrentDate] = useState<string | null>(null);

  // First, load the latest available date
  const { data: latestData } = useSWR<DailyData>(
    currentDate ? null : "/api/daily/latest",
    fetcher
  );

  // Once we have a date, fetch that specific date's data
  const { data, error, isLoading } = useSWR<DailyData>(
    currentDate ? `/api/daily/${currentDate}` : null,
    fetcher
  );

  // Set initial date from latest data
  useEffect(() => {
    if (latestData?.date && !currentDate) {
      setCurrentDate(latestData.date);
    }
  }, [latestData, currentDate]);

  const displayData = currentDate ? data : latestData;
  const displayDate = currentDate || latestData?.date || "";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate={displayDate} />
      {displayData?.market_summary && (
        <TickerBar summary={displayData.market_summary} />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-5">
          {displayDate && (
            <DateNav
              date={displayDate}
              limitUpCount={displayData?.market_summary?.limit_up_count ?? 0}
              groupCount={displayData?.groups?.length ?? 0}
              onPrev={() => setCurrentDate(shiftDate(displayDate, -1))}
              onNext={() => setCurrentDate(shiftDate(displayDate, 1))}
            />
          )}

          {isLoading && (
            <div className="text-txt-3 text-sm text-center py-20">
              載入中...
            </div>
          )}

          {error && !isLoading && (
            <div className="text-txt-3 text-sm text-center py-20">
              此日期無資料
            </div>
          )}

          {displayData?.groups?.map((group) => (
            <GroupBlock key={group.name} group={group} />
          ))}
        </main>

        {/* Side panel */}
        {displayData && <SidePanel data={displayData} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the complete UI**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
npm run dev
```

Visit http://localhost:3000. Expected: Full professional financial terminal UI with:
- Top navigation bar with brand + tabs
- Ticker bar with market data
- Date navigation
- Group blocks with stock tables
- Side panel with rankings

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: assemble main page with all components"
```

---

## Task 14: Final Polish & Build Verification

- [ ] **Step 1: Delete default Next.js boilerplate files**

Remove unused files that came with create-next-app (e.g., `src/app/favicon.ico` content, default page styles).
Clean up any remaining boilerplate in `src/app/page.tsx` if needed.

- [ ] **Step 2: Run production build**

Run:
```bash
cd "C:/Users/pc/漲停族群分類"
npm run build
```

Expected: Build succeeds without errors.

- [ ] **Step 3: Fix any build errors**

Address TypeScript or lint errors if any.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: clean up boilerplate, verify production build"
```

---

## Summary

After completing all 14 tasks, you will have:

1. **Python scraper** that fetches TWSE daily data and stores it in SQLite
2. **Sample classification JSON** for development
3. **Next.js API routes** serving daily data from JSON files
4. **Professional dark-themed UI** with:
   - Top navigation bar
   - Market ticker bar
   - Date navigation
   - Group blocks with stock tables, sparklines, streak indicators
   - Side panel with group distribution, institutional flow, and major buyer rankings
5. **Ready for daily workflow**: run scraper → ask Claude to classify → website shows results
