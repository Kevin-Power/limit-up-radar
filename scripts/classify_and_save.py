# -*- coding: utf-8 -*-
"""
漲停雷達 - Daily classify & save script.

Fetches TWSE daily quotes, classifies limit-up stocks into groups,
fetches TAIEX index data, and saves a JSON file for the app.

Usage:
    python scripts/classify_and_save.py              # auto-detect latest trading day
    python scripts/classify_and_save.py 2026-03-20   # specific date
"""
import sys
import io
import json
import os
import time
import argparse
import re
from datetime import datetime, timedelta

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import requests

from scraper.twse import fetch_daily_quotes

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TWSE_INDEX_URL = "https://www.twse.com.tw/exchangeReport/MI_INDEX"
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds
REQUEST_TIMEOUT = 30

# ---------------------------------------------------------------------------
# TAIEX index helpers
# ---------------------------------------------------------------------------

def fetch_taiex_index(date: str) -> dict:
    """Fetch TAIEX index data (close, change, change_pct) from TWSE.

    The MI_INDEX endpoint returns multiple tables.  The first table usually
    contains broad market indices.  We look for the row whose name contains
    '發行量加權股價指數' (TAIEX).
    """
    twse_date = date.replace("-", "")
    params = {"response": "json", "date": twse_date, "type": "ALLBUT0999"}
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(
                TWSE_INDEX_URL, params=params, headers=headers, timeout=REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            data = resp.json()
            break
        except (requests.RequestException, ValueError) as exc:
            if attempt < MAX_RETRIES - 1:
                print(f"  [retry {attempt + 1}] TAIEX fetch failed: {exc}")
                time.sleep(RETRY_DELAY)
            else:
                print(f"  [error] Could not fetch TAIEX after {MAX_RETRIES} attempts")
                return {}

    if data.get("stat") != "OK":
        return {}

    tables = data.get("tables", [])
    # Try each table looking for the TAIEX row
    for table in tables:
        tbl_data = table.get("data", [])
        for row in tbl_data:
            if len(row) >= 4:
                name = str(row[0]).strip()
                if "發行量加權股價指數" in name or "加權指數" in name:
                    try:
                        close_str = re.sub(r"[,\s]", "", str(row[1]))
                        close = float(close_str)
                        change_str = re.sub(r"[,\s]", "", str(row[2]))
                        change = float(change_str)
                        change_pct = round(change / (close - change) * 100, 2) if close != change else 0.0
                        return {
                            "taiex_close": close,
                            "taiex_change": change,
                            "taiex_change_pct": change_pct,
                        }
                    except (ValueError, ZeroDivisionError):
                        continue
    return {}


# ---------------------------------------------------------------------------
# Trading day detection
# ---------------------------------------------------------------------------

def is_weekend(d: datetime) -> bool:
    return d.weekday() >= 5  # Saturday=5, Sunday=6


def find_latest_trading_day(start: datetime | None = None, max_lookback: int = 7) -> str:
    """Try dates backwards from *start* (default: today) until we find one
    that TWSE has data for.  Returns YYYY-MM-DD string."""
    if start is None:
        start = datetime.now()

    for offset in range(max_lookback):
        candidate = start - timedelta(days=offset)
        if is_weekend(candidate):
            continue
        date_str = candidate.strftime("%Y-%m-%d")
        print(f"  Trying date: {date_str} ...", end=" ")

        try:
            quotes = _fetch_with_retry(date_str)
            if quotes and len(quotes) > 50:
                print(f"OK ({len(quotes)} stocks)")
                return date_str
            else:
                print("no data (holiday?)")
        except Exception as exc:
            print(f"error: {exc}")

        time.sleep(2)  # be gentle to TWSE

    raise RuntimeError(f"Could not find trading day data in last {max_lookback} days")


def _fetch_with_retry(date: str, retries: int = MAX_RETRIES) -> list[dict]:
    """Fetch daily quotes with automatic retry on failure."""
    last_exc = None
    for attempt in range(retries):
        try:
            return fetch_daily_quotes(date)
        except Exception as exc:
            last_exc = exc
            if attempt < retries - 1:
                print(f"\n    [retry {attempt + 1}] {exc}")
                time.sleep(RETRY_DELAY)
    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def classify_stocks(limit_up_stocks: list[dict]) -> list[dict]:
    """Classify limit-up stocks into thematic groups."""

    STOCK_GROUPS = {
        # Steel / Price Hike
        "2007": "steel", "2014": "steel", "2025": "steel",
        "2032": "steel", "2038": "steel", "2002": "steel",
        "2013": "steel", "2012": "steel",
        # Electronics / IC Design
        "4919": "ic_design", "6533": "ic_design", "2388": "ic_design",
        "2454": "ic_design", "6770": "ic_design", "3034": "ic_design",
        # Semiconductor Test / Advanced Packaging
        "6515": "semi_test", "6438": "semi_test", "3131": "semi_test",
        "3413": "semi_test", "6510": "semi_test", "6223": "semi_test",
        "6683": "semi_test",
        # Connector / Passive Components
        "3023": "connector", "3321": "connector", "6672": "connector",
        # Optical Storage / Legacy Tech
        "2323": "optical", "2349": "optical", "3050": "optical",
        # Precision Machining / Metal
        "3049": "precision", "1235": "precision", "3229": "precision",
        "2369": "precision",
        # AI / Server
        "6781": "ai_server", "2399": "ai_server", "3324": "ai_server",
        "3017": "ai_server", "8210": "ai_server", "2376": "ai_server",
        # Medical / Biotech
        "7795": "medical", "4726": "medical", "4174": "medical",
        # Plastics / Chemical
        "1456": "plastic", "8215": "plastic",
        # Thermal / Cooling
        "1471": "thermal",
        # Aerospace / Defense
        "3135": "aerospace", "6831": "aerospace",
        # PCB / CCL
        "3037": "pcb", "8046": "pcb",
        # Optical Communication
        "3081": "optical_comm", "4904": "optical_comm",
        # Solar / Green Energy
        "3576": "green", "6244": "green",
        # Construction / Assets
        "2515": "construction", "5534": "construction",
    }

    GROUP_INFO = {
        "steel": {
            "name": "鋼鐵 / 鋼價調漲",
            "color": "#ef4444",
            "badges": ["HOT"],
            "reason": "鋼價調漲帶動鋼鐵族群全面攻頂",
        },
        "ic_design": {
            "name": "IC設計 / AI邊緣運算",
            "color": "#3b82f6",
            "badges": ["FOCUS"],
            "reason": "Edge AI晶片需求爆發，IC設計族群受惠",
        },
        "semi_test": {
            "name": "半導體測試 / 先進封裝",
            "color": "#a855f7",
            "badges": ["FOCUS"],
            "reason": "先進封裝需求帶動測試設備族群",
        },
        "connector": {
            "name": "連接器 / 被動元件",
            "color": "#06b6d4",
            "badges": [],
            "reason": "5G/AI伺服器帶動高速連接器需求",
        },
        "optical": {
            "name": "光儲存 / 記憶媒體",
            "color": "#8b5cf6",
            "badges": [],
            "reason": "資料中心備份需求帶動光碟片出貨量回升",
        },
        "precision": {
            "name": "精密機械 / 金屬加工",
            "color": "#f59e0b",
            "badges": [],
            "reason": "航太與半導體設備零組件需求帶動精密加工族群",
        },
        "ai_server": {
            "name": "AI伺服器 / 散熱",
            "color": "#ef4444",
            "badges": ["HOT", "FOCUS"],
            "reason": "AI伺服器散熱與機殼供應鏈訂單持續爆發",
        },
        "medical": {
            "name": "生技 / 醫療器材",
            "color": "#22c55e",
            "badges": [],
            "reason": "醫材新產品認證與生技族群人氣回升",
        },
        "plastic": {
            "name": "塑化 / 材料",
            "color": "#f97316",
            "badges": [],
            "reason": "原物料價格回升帶動塑化類股表現",
        },
        "thermal": {
            "name": "散熱零件",
            "color": "#ec4899",
            "badges": [],
            "reason": "AI伺服器散熱需求持續爆發",
        },
        "aerospace": {
            "name": "航太 / 國防",
            "color": "#14b8a6",
            "badges": ["NEW"],
            "reason": "國防預算增加與無人機產業鏈受惠",
        },
        "pcb": {
            "name": "PCB / CCL基板",
            "color": "#8b5cf6",
            "badges": ["HOT"],
            "reason": "AI高速傳輸帶動高頻高速PCB需求爆發",
        },
        "optical_comm": {
            "name": "光通訊 / 矽光子",
            "color": "#ec4899",
            "badges": ["NEW"],
            "reason": "800G光模組需求提前，矽光子技術突破",
        },
        "green": {
            "name": "太陽能 / 綠能",
            "color": "#f97316",
            "badges": ["NEW"],
            "reason": "政府加速綠能裝置目標，碳費正式上路",
        },
        "construction": {
            "name": "營建 / 資產",
            "color": "#84cc16",
            "badges": [],
            "reason": "利率政策與土地標售帶動資產股補漲",
        },
        "others": {
            "name": "個股亮點",
            "color": "#64748b",
            "badges": [],
            "reason": "個別利多驅動的漲停股",
        },
    }

    groups: dict[str, list] = {}
    for stock in limit_up_stocks:
        code = stock["stock_code"]
        group_key = STOCK_GROUPS.get(code, "others")
        groups.setdefault(group_key, []).append(stock)

    result = []
    for key, stocks in groups.items():
        info = GROUP_INFO.get(key, GROUP_INFO["others"])
        group = {
            "name": info["name"],
            "color": info["color"],
            "badges": info["badges"],
            "reason": info["reason"],
            "stocks": [
                {
                    "code": s["stock_code"],
                    "name": s["stock_name"],
                    "industry": "",
                    "close": s["close"],
                    "change_pct": s["change_pct"],
                    "volume": s["volume"],
                    "major_net": 0,
                    "streak": 1,
                }
                for s in stocks
            ],
        }
        result.append(group)

    # Sort by stock count desc
    result.sort(key=lambda g: len(g["stocks"]), reverse=True)
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="漲停雷達 daily data pipeline")
    parser.add_argument(
        "date",
        nargs="?",
        default=None,
        help="Trading date in YYYY-MM-DD format. Default: auto-detect latest trading day.",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("漲停雷達 - Daily Update Pipeline")
    print("=" * 60)

    # ---- Determine date ----
    if args.date:
        date = args.date
        print(f"\n[1/4] Using specified date: {date}")
        quotes = _fetch_with_retry(date)
        if not quotes:
            print(f"ERROR: No data returned for {date}. Market may be closed.")
            sys.exit(1)
    else:
        print("\n[1/4] Auto-detecting latest trading day...")
        date = find_latest_trading_day()

    print(f"\n[2/4] Fetching quotes for {date}...")
    quotes = _fetch_with_retry(date)
    if not quotes:
        print("ERROR: No quotes data. Exiting.")
        sys.exit(1)

    # ---- Market breadth ----
    print(f"\n[3/4] Calculating market data...")
    advancing = len([q for q in quotes if q["change"] > 0])
    declining = len([q for q in quotes if q["change"] < 0])
    unchanged = len([q for q in quotes if q["change"] == 0])
    limit_up = [q for q in quotes if q["is_limit_up"]]
    limit_down_count = len([q for q in quotes if q["change_pct"] <= -9.5])
    total_volume = sum(q["volume"] for q in quotes)

    # ---- TAIEX index ----
    print("  Fetching TAIEX index data...")
    taiex = fetch_taiex_index(date)
    taiex_close = taiex.get("taiex_close", 0)
    taiex_change_pct = taiex.get("taiex_change_pct", 0)
    if taiex:
        print(f"  TAIEX: {taiex_close:,.2f} ({taiex_change_pct:+.2f}%)")
    else:
        print("  WARNING: Could not fetch TAIEX index data, using 0")

    # ---- Classify ----
    groups = classify_stocks(limit_up)

    # ---- Build output JSON (matches DailyData TypeScript type) ----
    daily_data = {
        "date": date,
        "market_summary": {
            "taiex_close": taiex_close,
            "taiex_change_pct": taiex_change_pct,
            "total_volume": total_volume,
            "limit_up_count": len(limit_up),
            "limit_down_count": limit_down_count,
            "advance": advancing,
            "decline": declining,
            "unchanged": unchanged,
            "foreign_net": 0,
            "trust_net": 0,
            "dealer_net": 0,
        },
        "groups": groups,
    }

    # ---- Save to data/daily/<date>.json ----
    print(f"\n[4/4] Saving data...")
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "daily")
    os.makedirs(data_dir, exist_ok=True)
    filepath = os.path.join(data_dir, f"{date}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(daily_data, f, ensure_ascii=False, indent=2)

    # ---- Summary ----
    print("\n" + "=" * 60)
    print(f"  Date:           {date}")
    print(f"  TAIEX:          {taiex_close:,.2f} ({taiex_change_pct:+.2f}%)")
    print(f"  Total stocks:   {len(quotes)}")
    print(f"  Advancing:      {advancing}")
    print(f"  Declining:      {declining}")
    print(f"  Unchanged:      {unchanged}")
    print(f"  Limit-up:       {len(limit_up)}")
    print(f"  Limit-down:     {limit_down_count}")
    print(f"  Groups:         {len(groups)}")
    for g in groups:
        names = ", ".join(s["name"] for s in g["stocks"])
        print(f"    {g['name']} ({len(g['stocks'])}): {names}")
    print(f"\n  Saved to: {filepath}")
    print("=" * 60)


if __name__ == "__main__":
    main()
