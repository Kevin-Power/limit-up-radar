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
from scraper.tpex import fetch_tpex_quotes

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TWSE_INDEX_URL = "https://www.twse.com.tw/exchangeReport/MI_INDEX"
TWSE_FMTQIK_URL = "https://www.twse.com.tw/exchangeReport/FMTQIK"
TWSE_BFI82U_URL = "https://www.twse.com.tw/fund/BFI82U"
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds
REQUEST_TIMEOUT = 30

# ---------------------------------------------------------------------------
# TAIEX index helpers
# ---------------------------------------------------------------------------

def _parse_number(s: str) -> float:
    """Remove commas/spaces and parse as float."""
    return float(re.sub(r"[,\s]", "", str(s)))


def fetch_taiex_index(date: str) -> dict:
    """Fetch TAIEX index data (close, change, change_pct) from TWSE.

    Strategy:
    1. Try FMTQIK endpoint first (monthly summary, clean format).
    2. Fall back to MI_INDEX tables[0] and find the row with the largest
       index value (TAIEX is always the largest, around 20000-35000).
       This avoids matching Chinese text which may be garbled due to encoding.
    """
    twse_date = date.replace("-", "")
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}

    # --- Strategy 1: FMTQIK endpoint (clean, reliable) ---
    result = _fetch_taiex_from_fmtqik(twse_date, headers)
    if result:
        return result

    # --- Strategy 2: MI_INDEX tables[0], find largest index value ---
    result = _fetch_taiex_from_mi_index(twse_date, headers)
    if result:
        return result

    return {}


def _fetch_taiex_from_fmtqik(twse_date: str, headers: dict) -> dict:
    """Fetch TAIEX from FMTQIK (monthly trading summary) endpoint.
    Returns data for the specific date from the monthly data."""
    params = {"response": "json", "date": twse_date}

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(
                TWSE_FMTQIK_URL, params=params, headers=headers, timeout=REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            data = resp.json()
            break
        except (requests.RequestException, ValueError) as exc:
            if attempt < MAX_RETRIES - 1:
                print(f"  [retry {attempt + 1}] FMTQIK fetch failed: {exc}")
                time.sleep(RETRY_DELAY)
            else:
                print(f"  [warn] FMTQIK unavailable, trying MI_INDEX fallback")
                return {}

    if data.get("stat") != "OK":
        return {}

    # FMTQIK data: each row is [date, volume, turnover, trade_count, close, change]
    # Date format in the response is "115/03/23" (ROC year)
    target_date = twse_date  # "20260323"
    year = int(target_date[:4])
    roc_year = year - 1911
    roc_date = f"{roc_year}/{target_date[4:6]}/{target_date[6:8]}"

    rows = data.get("data", [])
    for row in rows:
        if len(row) >= 6:
            row_date = str(row[0]).strip()
            if row_date == roc_date:
                try:
                    close = _parse_number(row[4])
                    change = _parse_number(row[5])
                    prev_close = close - change
                    change_pct = round(change / prev_close * 100, 2) if prev_close > 0 else 0.0
                    return {
                        "taiex_close": close,
                        "taiex_change": change,
                        "taiex_change_pct": change_pct,
                    }
                except (ValueError, ZeroDivisionError):
                    continue
    return {}


def _fetch_taiex_from_mi_index(twse_date: str, headers: dict) -> dict:
    """Fetch TAIEX from MI_INDEX tables[0], matching by largest index value
    instead of Chinese text (which may be garbled due to encoding)."""
    params = {"response": "json", "date": twse_date, "type": "ALLBUT0999"}

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
                print(f"  [retry {attempt + 1}] MI_INDEX fetch failed: {exc}")
                time.sleep(RETRY_DELAY)
            else:
                print(f"  [error] Could not fetch MI_INDEX after {MAX_RETRIES} attempts")
                return {}

    if data.get("stat") != "OK":
        return {}

    tables = data.get("tables", [])
    if not tables:
        return {}

    # tables[0] contains index data. Find TAIEX (加權指數).
    # IMPORTANT: TWSE has BOTH:
    #   - 發行量加權股價指數 (TAIEX, ~30000-50000)
    #   - 發行量加權股價報酬指數 (Total Return Index, ~250000+, includes dividends)
    # We want TAIEX, so cap at 100000 to exclude the much-higher return index.
    TAIEX_MIN = 5000
    TAIEX_MAX = 100000
    best_close = 0
    best_change = 0

    for table in tables[:2]:  # Only check first 2 tables (index tables)
        tbl_data = table.get("data", [])
        for row in tbl_data:
            if len(row) < 3:
                continue
            try:
                close_str = re.sub(r"[,\s]", "", str(row[1]))
                close = float(close_str)
                # Sanity check: TAIEX must be in reasonable range
                if close < TAIEX_MIN or close > TAIEX_MAX:
                    continue
                if close > best_close:
                    best_close = close
                    change_str = re.sub(r"[,\s%+]", "", str(row[2]))
                    best_change = float(change_str)
            except (ValueError, IndexError):
                continue

    if best_close >= TAIEX_MIN:
        prev_close = best_close - best_change
        change_pct = round(best_change / prev_close * 100, 2) if prev_close > 0 else 0.0
        return {
            "taiex_close": best_close,
            "taiex_change": best_change,
            "taiex_change_pct": change_pct,
        }

    return {}


# ---------------------------------------------------------------------------
# Institutional investor helpers
# ---------------------------------------------------------------------------

def fetch_institutional_data(date: str) -> dict:
    """Fetch daily institutional investor (三大法人) buy/sell totals from TWSE BFI82U.

    Returns dict with foreign_net, trust_net, dealer_net (in TWD).
    """
    twse_date = date.replace("-", "")
    params = {"response": "json", "dayDate": twse_date, "type": "day"}
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(
                TWSE_BFI82U_URL, params=params, headers=headers, timeout=REQUEST_TIMEOUT
            )
            resp.raise_for_status()
            data = resp.json()
            break
        except (requests.RequestException, ValueError) as exc:
            if attempt < MAX_RETRIES - 1:
                print(f"  [retry {attempt + 1}] BFI82U fetch failed: {exc}")
                time.sleep(RETRY_DELAY)
            else:
                print(f"  [error] Could not fetch institutional data after {MAX_RETRIES} attempts")
                return {}

    if data.get("stat") != "OK":
        return {}

    result = {"foreign_net": 0, "trust_net": 0, "dealer_net": 0}
    rows = data.get("data", [])

    # BFI82U returns rows for each institutional category.
    # Structure: each row has [name, buy, sell, net] (values with commas)
    # Instead of matching Chinese text (may be garbled), match by row position:
    # Row 0: 自營商(自行買賣) - Dealer (proprietary)
    # Row 1: 自營商(避險) - Dealer (hedging)
    # Row 2: 投信 - Trust (investment trust)
    # Row 3: 外資及陸資(不含外資自營商) - Foreign investors
    # Row 4: 外資自營商 - Foreign dealer
    # Row 5 or last: 合計 - Total
    #
    # Alternative: match by the net buy/sell column (last column of each row)
    # The exact structure may vary, so we use a robust approach:
    # - Foreign net = sum of rows containing "外" or rows 3+4
    # - Trust net = row containing "投信" or row 2
    # - Dealer net = sum of rows containing "自營" or rows 0+1

    foreign_net = 0
    trust_net = 0
    dealer_net = 0

    for i, row in enumerate(rows):
        if len(row) < 4:
            continue
        try:
            net_val = _parse_number(row[3]) if len(row) >= 4 else 0
            # Also check the last column which sometimes has the net value
            name = str(row[0]).strip()

            # Try matching by Chinese text first
            if "外資" in name and "自營" not in name:
                foreign_net += net_val
            elif "外資自營" in name or ("外資" in name and "自營" in name):
                foreign_net += net_val
            elif "投信" in name:
                trust_net = net_val
            elif "自營" in name:
                dealer_net += net_val
            else:
                # Fallback: match by position if text is garbled
                # Rows: 0=dealer prop, 1=dealer hedge, 2=trust, 3=foreign, 4=foreign dealer
                if i == 0 or i == 1:
                    dealer_net += net_val
                elif i == 2:
                    trust_net = net_val
                elif i == 3 or i == 4:
                    foreign_net += net_val
                # Skip total row (usually last)
        except (ValueError, IndexError):
            continue

    result["foreign_net"] = foreign_net
    result["trust_net"] = trust_net
    result["dealer_net"] = dealer_net
    return result


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
    """Classify limit-up stocks into thematic groups.

    Uses a two-tier approach:
    1. Explicit stock code mappings for well-known thematic plays.
    2. Industry-based classification using TWSE stock code ranges and name heuristics.
    This ensures stocks from the same sector are grouped even if not in the explicit map.
    """

    # --- Tier 1: Explicit stock-to-group mappings ---
    STOCK_GROUPS = {
        # Steel / Price Hike
        "2002": "steel", "2007": "steel", "2012": "steel", "2013": "steel",
        "2014": "steel", "2025": "steel", "2032": "steel", "2038": "steel",
        # Electronics / IC Design
        "2379": "ic_design", "2388": "ic_design", "2401": "ic_design",
        "2454": "ic_design", "2458": "ic_design", "3034": "ic_design",
        "4919": "ic_design", "5274": "ic_design", "6533": "ic_design",
        "6770": "ic_design",
        # Semiconductor Test / Advanced Packaging
        "3131": "semi_test", "3413": "semi_test", "6223": "semi_test",
        "6438": "semi_test", "6510": "semi_test", "6515": "semi_test",
        "6683": "semi_test",
        # Connector / Passive Components
        "3023": "connector", "3321": "connector", "6672": "connector",
        # Optical Storage / Legacy Tech
        "2323": "optical", "2349": "optical", "3050": "optical",
        # Precision Machining / Metal
        "1235": "precision", "2369": "precision", "3049": "precision",
        "3229": "precision",
        # AI / Server / Cooling
        "2376": "ai_server", "2399": "ai_server", "3017": "ai_server",
        "3324": "ai_server", "6781": "ai_server", "7711": "ai_server",
        "8210": "ai_server", "1471": "ai_server",
        # Medical / Biotech
        "4174": "medical", "4726": "medical", "4743": "medical",
        "6446": "medical", "6712": "medical", "7795": "medical",
        # Plastics / Chemical
        "1301": "plastic", "1303": "plastic", "1304": "plastic",
        "1305": "plastic", "1308": "plastic", "1309": "plastic",
        "1310": "plastic", "1312": "plastic", "1314": "plastic",
        "1326": "plastic", "1456": "plastic", "6585": "plastic",
        "8215": "plastic",
        # Aerospace / Defense
        "3135": "aerospace", "6831": "aerospace",
        # PCB / CCL
        "2368": "pcb", "3037": "pcb", "6213": "pcb", "6274": "pcb",
        "8046": "pcb",
        # Optical Communication
        "3081": "optical_comm", "3363": "optical_comm", "4904": "optical_comm",
        "4908": "optical_comm", "4977": "optical_comm", "4979": "optical_comm",
        "6426": "optical_comm", "6442": "optical_comm",
        # Solar / Green Energy
        "3576": "green", "6244": "green",
        # Construction / Assets
        "2515": "construction", "2542": "construction", "2548": "construction",
        "5522": "construction", "5534": "construction",
        # Food
        "1201": "food", "1203": "food", "1210": "food", "1215": "food",
        "1216": "food", "1217": "food", "1218": "food", "1219": "food",
        "1220": "food", "1225": "food", "1227": "food", "1229": "food",
        "1231": "food", "1232": "food", "1233": "food", "1234": "food",
        # Finance
        "2801": "finance", "2809": "finance", "2812": "finance",
        "2816": "finance", "2820": "finance", "2823": "finance",
        "2834": "finance", "2836": "finance", "2838": "finance",
        "2845": "finance", "2849": "finance", "2850": "finance",
        "2851": "finance", "2852": "finance", "2855": "finance",
        "2856": "finance", "2867": "finance", "2880": "finance",
        "2881": "finance", "2882": "finance", "2883": "finance",
        "2884": "finance", "2885": "finance", "2886": "finance",
        "2887": "finance", "2888": "finance", "2889": "finance",
        "2890": "finance", "2891": "finance", "2892": "finance",
        "5880": "finance",
        # Textile / Traditional
        "1402": "textile", "1409": "textile", "1410": "textile",
        "1413": "textile", "1416": "textile", "1417": "textile",
        "1418": "textile", "1419": "textile", "1423": "textile",
        "1432": "textile", "1434": "textile", "1440": "textile",
        "1441": "textile", "1442": "textile", "1443": "textile",
        "1444": "textile", "1445": "textile", "1446": "textile",
        "1447": "textile", "1449": "textile", "1451": "textile",
        "1452": "textile", "1453": "textile", "1454": "textile",
        "1455": "textile", "1459": "textile", "1460": "textile",
        "1463": "textile", "1464": "textile", "1465": "textile",
        "1466": "textile", "1467": "textile", "1468": "textile",
        "1470": "textile", "1473": "textile", "1474": "textile",
        "1476": "textile", "1477": "textile",
        # Gas / Utilities
        "9908": "gas", "9911": "gas", "9917": "gas", "9918": "gas",
        "9921": "gas", "9924": "gas", "9925": "gas", "9926": "gas",
        "9927": "gas", "9928": "gas", "9929": "gas", "9930": "gas",
        "9931": "gas", "9933": "gas", "9934": "gas", "9935": "gas",
        "9937": "gas", "9938": "gas", "9939": "gas", "9940": "gas",
        "9941": "gas", "9942": "gas", "9943": "gas", "9944": "gas",
        "9945": "gas", "9946": "gas",
        # Auto Parts
        "2201": "auto", "2204": "auto", "2206": "auto", "2207": "auto",
        "2208": "auto", "2211": "auto", "2227": "auto", "2228": "auto",
        "2231": "auto", "2233": "auto", "2236": "auto",
    }

    # --- Tier 2: Code-range-based industry classification ---
    def _classify_by_code_range(code: str, name: str) -> str:
        """Fallback classification based on TWSE stock code ranges and name."""
        c = int(code) if code.isdigit() else 0

        # Name-based heuristics
        name_lower = name.lower()
        if any(k in name for k in ["生技", "藥", "醫"]):
            return "medical"
        if any(k in name for k in ["鋼", "鐵", "金屬"]):
            return "steel"
        if any(k in name for k in ["營建", "建設", "開發"]):
            return "construction"
        if any(k in name for k in ["光電", "光通", "光纖"]):
            return "optical_comm"

        # Code range heuristics (TWSE industry code ranges)
        if 1101 <= c <= 1199:
            return "construction"    # Cement + some construction
        if 1201 <= c <= 1299:
            return "food"
        if 1301 <= c <= 1399:
            return "plastic"
        if 1401 <= c <= 1499:
            return "textile"
        if 1501 <= c <= 1599:
            return "electronics"     # Electric machinery
        if 1601 <= c <= 1699:
            return "electronics"     # Electrical cable
        if 2001 <= c <= 2099:
            return "steel"
        if 2101 <= c <= 2199:
            return "precision"       # Rubber
        if 2201 <= c <= 2299:
            return "auto"
        if 2301 <= c <= 2499:
            return "electronics"     # Electronics broad
        if 2501 <= c <= 2599:
            return "construction"
        if 2601 <= c <= 2699:
            return "precision"       # Shipping/transport
        if 2701 <= c <= 2799:
            return "others"          # Tourism
        if 2801 <= c <= 2899:
            return "finance"
        if 3001 <= c <= 3699:
            return "electronics"     # OTC electronics
        if 4100 <= c <= 4199:
            return "medical"         # Biotech
        if 4700 <= c <= 4799:
            return "medical"
        if 4900 <= c <= 4999:
            return "optical_comm"
        if 5200 <= c <= 5299:
            return "ic_design"
        if 5500 <= c <= 5599:
            return "construction"
        if 6100 <= c <= 6199:
            return "electronics"
        if 6200 <= c <= 6299:
            return "electronics"
        if 6400 <= c <= 6499:
            return "medical"
        if 6500 <= c <= 6599:
            return "electronics"
        if 6600 <= c <= 6699:
            return "electronics"
        if 6700 <= c <= 6799:
            return "medical"
        if 9900 <= c <= 9999:
            return "gas"

        return "others"

    GROUP_INFO = {
        "steel": {
            "name": "鋼鐵 / 金屬",
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
            "name": "塑化 / 化工",
            "color": "#f97316",
            "badges": [],
            "reason": "原物料價格回升帶動塑化類股表現",
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
        "food": {
            "name": "食品",
            "color": "#f59e0b",
            "badges": [],
            "reason": "食品類股業績回溫帶動股價表現",
        },
        "finance": {
            "name": "金融",
            "color": "#3b82f6",
            "badges": [],
            "reason": "金融股受惠升息與獲利成長",
        },
        "textile": {
            "name": "紡織 / 傳產",
            "color": "#78716c",
            "badges": [],
            "reason": "傳產族群訂單回溫帶動股價上揚",
        },
        "electronics": {
            "name": "電子 / 半導體",
            "color": "#06b6d4",
            "badges": [],
            "reason": "電子族群受惠終端需求回升",
        },
        "gas": {
            "name": "油電燃氣",
            "color": "#a3e635",
            "badges": [],
            "reason": "能源類股受惠價格調升與穩定配息",
        },
        "auto": {
            "name": "汽車零組件",
            "color": "#d946ef",
            "badges": [],
            "reason": "電動車與車用電子需求帶動汽車零組件族群",
        },
        "others": {
            "name": "個股亮點",
            "color": "#64748b",
            "badges": [],
            "reason": "個別利多驅動的漲停股",
        },
    }

    # --- Classify each stock ---
    groups: dict[str, list] = {}
    for stock in limit_up_stocks:
        code = stock["stock_code"]
        name = stock["stock_name"]
        # Try explicit mapping first, then code-range fallback
        group_key = STOCK_GROUPS.get(code)
        if group_key is None:
            group_key = _classify_by_code_range(code, name)
        groups.setdefault(group_key, []).append(stock)

    # --- Merge small groups: groups with only 1 stock go to "others"
    #     unless they have a specific thematic reason ---
    # (Keep single-stock groups for well-known themes, merge truly orphan ones)
    KEEP_SINGLE = {"steel", "ai_server", "semi_test", "ic_design", "pcb",
                   "optical_comm", "medical", "aerospace", "plastic", "gas",
                   "construction", "finance", "food"}
    merged_groups: dict[str, list] = {}
    for key, stocks in groups.items():
        if len(stocks) == 1 and key not in KEEP_SINGLE:
            merged_groups.setdefault("others", []).extend(stocks)
        else:
            merged_groups.setdefault(key, []).extend(stocks)

    # --- Build result ---
    # Determine industry label for each stock based on its group
    def _get_industry_label(group_key: str) -> str:
        label_map = {
            "steel": "鋼鐵", "ic_design": "IC設計", "semi_test": "半導體",
            "connector": "連接器", "optical": "光儲存", "precision": "機械",
            "ai_server": "AI伺服器", "medical": "生技", "plastic": "塑化",
            "aerospace": "航太", "pcb": "PCB", "optical_comm": "光通訊",
            "green": "綠能", "construction": "營建", "food": "食品",
            "finance": "金融", "textile": "紡織", "electronics": "電子",
            "gas": "油電燃氣", "auto": "汽車零組件",
        }
        return label_map.get(group_key, "")

    result = []
    for key, stocks in merged_groups.items():
        info = GROUP_INFO.get(key, GROUP_INFO["others"])
        industry = _get_industry_label(key)
        group = {
            "name": info["name"],
            "color": info["color"],
            "badges": info["badges"],
            "reason": info["reason"],
            "stocks": [
                {
                    "code": s["stock_code"],
                    "name": s["stock_name"],
                    "industry": industry,
                    "close": s["close"],
                    "change_pct": s["change_pct"],
                    "volume": s["volume"],
                    # NOTE: major_net requires a separate broker data source
                    # (e.g., 主力進出 from paid data providers). Set to 0 for now.
                    "major_net": 0,
                    "streak": 1,
                    "market": s.get("market", "TWSE"),
                }
                for s in stocks
            ],
        }
        result.append(group)

    # Sort by stock count desc, then by group name for stability
    result.sort(key=lambda g: (-len(g["stocks"]), g["name"]))
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
        print(f"\n[1/5] Using specified date: {date}")
        quotes = _fetch_with_retry(date)
        if not quotes:
            print(f"ERROR: No data returned for {date}. Market may be closed.")
            sys.exit(1)
    else:
        print("\n[1/5] Auto-detecting latest trading day...")
        date = find_latest_trading_day()

    print(f"\n[2/5] Fetching TWSE quotes for {date}...")
    quotes = _fetch_with_retry(date)
    if not quotes:
        print("ERROR: No TWSE quotes data. Exiting.")
        sys.exit(1)
    # Tag TWSE stocks with market field
    for q in quotes:
        q.setdefault("market", "TWSE")
    twse_count = len(quotes)

    print(f"  TWSE stocks: {twse_count}")

    # ---- Fetch TPEx (OTC) quotes ----
    print(f"\n[3/5] Fetching TPEx (OTC) quotes for {date}...")
    time.sleep(3)  # be gentle between API calls
    try:
        tpex_quotes = fetch_tpex_quotes(date)
        if tpex_quotes:
            tpex_limit_up = len([q for q in tpex_quotes if q["is_limit_up"]])
            print(f"  TPEx stocks: {len(tpex_quotes)} (limit-up: {tpex_limit_up})")
            quotes.extend(tpex_quotes)
        else:
            print("  WARNING: No TPEx data returned (holiday or API issue)")
    except Exception as exc:
        print(f"  WARNING: TPEx fetch failed: {exc}")

    # ---- Market breadth ----
    print(f"\n[4/5] Calculating market data...")
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

    # ---- Institutional investor data ----
    print("  Fetching institutional investor data...")
    time.sleep(3)  # be gentle to TWSE between requests
    inst = fetch_institutional_data(date)
    foreign_net = inst.get("foreign_net", 0)
    trust_net = inst.get("trust_net", 0)
    dealer_net = inst.get("dealer_net", 0)
    if inst:
        print(f"  Foreign: {foreign_net:,.0f}, Trust: {trust_net:,.0f}, Dealer: {dealer_net:,.0f}")
    else:
        print("  WARNING: Could not fetch institutional data, using 0")

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
            "foreign_net": foreign_net,
            "trust_net": trust_net,
            "dealer_net": dealer_net,
        },
        "groups": groups,
    }

    # ---- Save to data/daily/<date>.json ----
    print(f"\n[5/5] Saving data...")
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "daily")
    os.makedirs(data_dir, exist_ok=True)
    filepath = os.path.join(data_dir, f"{date}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(daily_data, f, ensure_ascii=False, indent=2)

    # ---- Summary ----
    twse_limit_up = len([q for q in limit_up if q.get("market", "TWSE") == "TWSE"])
    otc_limit_up = len([q for q in limit_up if q.get("market") == "OTC"])
    otc_total = len([q for q in quotes if q.get("market") == "OTC"])

    print("\n" + "=" * 60)
    print(f"  Date:           {date}")
    print(f"  TAIEX:          {taiex_close:,.2f} ({taiex_change_pct:+.2f}%)")
    print(f"  TWSE stocks:    {twse_count}")
    print(f"  TPEx stocks:    {otc_total}")
    print(f"  Total stocks:   {len(quotes)}")
    print(f"  Advancing:      {advancing}")
    print(f"  Declining:      {declining}")
    print(f"  Unchanged:      {unchanged}")
    print(f"  Limit-up:       {len(limit_up)} (TWSE: {twse_limit_up}, OTC: {otc_limit_up})")
    print(f"  Limit-down:     {limit_down_count}")
    print(f"  Groups:         {len(groups)}")
    for g in groups:
        names = ", ".join(s["name"] for s in g["stocks"])
        print(f"    {g['name']} ({len(g['stocks'])}): {names}")
    print(f"\n  Saved to: {filepath}")
    print("=" * 60)


if __name__ == "__main__":
    main()
