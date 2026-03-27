"""TPEx (OTC / 上櫃) daily quotes scraper.

Fetches after-hours quote data from the TPEx website and returns a list of
dicts in the same format as scraper.twse.fetch_daily_quotes().
"""

import re
import time
import requests
from typing import Any

TPEX_QUOTES_URL = (
    "https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php"
)

MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds


def _parse_number(s: str) -> float:
    """Remove commas/spaces and parse as float."""
    try:
        cleaned = re.sub(r"[,\s]", "", str(s))
        return float(cleaned)
    except (ValueError, AttributeError):
        return 0.0


def _to_roc_date(date: str) -> str:
    """Convert 'YYYY-MM-DD' to ROC date format 'YYY/MM/DD'.

    Example: '2026-03-26' -> '115/03/26'
    """
    parts = date.split("-")
    roc_year = int(parts[0]) - 1911
    return f"{roc_year}/{parts[1]}/{parts[2]}"


def _is_regular_stock(code: str) -> bool:
    """Return True if the code is a regular 4-digit OTC stock (not ETF/warrant/etc)."""
    if not re.match(r"^\d{4}$", code):
        return False
    # Filter out codes starting with 00 (ETFs) - already handled by 4-digit check
    # Codes like 006xxx are 6-digit ETFs so they won't pass the 4-digit check
    return True


def fetch_tpex_quotes(date: str) -> list[dict]:
    """Fetch TPEx (OTC) daily quotes for a given date.

    Args:
        date: Trading date in 'YYYY-MM-DD' format.

    Returns:
        List of quote dicts with keys: date, stock_code, stock_name, open,
        high, low, close, change, change_pct, volume, turnover, is_limit_up,
        market.
    """
    roc_date = _to_roc_date(date)
    params = {"l": "zh-tw", "d": roc_date, "se": "AL", "o": "json"}
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}

    data: dict[str, Any] = {}
    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(
                TPEX_QUOTES_URL, params=params, headers=headers, timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            break
        except (requests.RequestException, ValueError) as exc:
            if attempt < MAX_RETRIES - 1:
                print(f"  [retry {attempt + 1}] TPEx fetch failed: {exc}")
                time.sleep(RETRY_DELAY)
            else:
                print(f"  [error] Could not fetch TPEx data after {MAX_RETRIES} attempts")
                return []

    tables = data.get("tables", [])
    if not tables:
        return []

    rows = tables[0].get("data", [])
    if not rows:
        return []

    quotes: list[dict] = []
    for row in rows:
        if len(row) < 10:
            continue
        try:
            code = str(row[0]).strip()
            if not _is_regular_stock(code):
                continue

            name = str(row[1]).strip()
            close = _parse_number(row[2])
            change_str = str(row[3]).strip()
            open_price = _parse_number(row[4])
            high = _parse_number(row[5])
            low = _parse_number(row[6])
            volume = int(_parse_number(row[7]))
            turnover = _parse_number(row[8])

            # Parse change value (may have +/- prefix or be "0.00")
            change_val = _parse_number(change_str)
            if change_str.startswith("-"):
                change_val = -abs(change_val)

            # Skip stocks with no trading (close == 0)
            if close <= 0:
                continue

            prev_close = close - change_val
            if prev_close > 0:
                change_pct = round(change_val / prev_close * 100, 2)
            else:
                change_pct = 0.0

            is_limit_up = change_pct >= 9.5

            quote = {
                "date": date,
                "stock_code": code,
                "stock_name": name,
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "change": change_val,
                "change_pct": change_pct,
                "volume": volume,
                "turnover": turnover,
                "is_limit_up": is_limit_up,
                "market": "OTC",
            }
            quotes.append(quote)
        except (IndexError, ValueError):
            continue

    return quotes
