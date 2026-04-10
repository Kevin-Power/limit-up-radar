import requests
import re
from typing import Any

TWSE_DAILY_URL = "https://www.twse.com.tw/exchangeReport/MI_INDEX"

def parse_number(s: str) -> float:
    try:
        cleaned = re.sub(r"[,\s]", "", str(s))
        return float(cleaned)
    except (ValueError, AttributeError):
        return 0.0

def is_limit_up(close: float, prev_close: float) -> bool:
    if prev_close <= 0:
        return False
    change_pct = (close - prev_close) / prev_close * 100
    return change_pct >= 9.5

def extract_sign(html_or_text: str) -> str:
    """Extract +/- sign from HTML like <p style='color:red'>+</p> or plain text."""
    if ">" in html_or_text:
        match = re.search(r">([^<]*)<", html_or_text)
        if match:
            return match.group(1).strip()
    return html_or_text.strip()

def find_stock_table(tables: list[dict]) -> list[list]:
    """Find the table with individual stock data (has 16 fields and stock codes).

    Scans multiple rows because the first row may be an ETF with non-4-digit code
    (e.g. '00400A'). Accepts the table if at least one row in the first 20 has a
    4-digit numeric code.
    """
    for t in tables:
        data = t.get("data", [])
        fields = t.get("fields", [])
        if len(fields) >= 14 and len(data) > 100:
            for row in data[:20]:
                if len(row) >= 14:
                    code = str(row[0]).strip()
                    if re.match(r"^\d{4}$", code):
                        return data
    return []

def parse_daily_quotes_v2(tables: list[dict], date: str) -> list[dict]:
    """Parse the new TWSE API format (tables array)."""
    data = find_stock_table(tables)
    if not data:
        return []

    quotes = []
    for row in data:
        if len(row) < 16:
            continue
        try:
            code = str(row[0]).strip()
            if not re.match(r"^\d{4}$", code):
                continue

            name = str(row[1]).strip()
            volume = int(parse_number(row[2]))
            turnover = parse_number(row[4])
            open_price = parse_number(row[5])
            high = parse_number(row[6])
            low = parse_number(row[7])
            close = parse_number(row[8])

            sign = extract_sign(str(row[9]))
            change_val = parse_number(row[10])
            if sign == "-":
                change_val = -change_val
            elif sign == "X":
                change_val = 0

            prev_close = close - change_val if close > 0 else 0
            change_pct = (change_val / prev_close * 100) if prev_close > 0 else 0.0

            quote = {
                "date": date,
                "stock_code": code,
                "stock_name": name,
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "change": change_val,
                "change_pct": round(change_pct, 2),
                "volume": volume,
                "turnover": turnover,
                "is_limit_up": is_limit_up(close, prev_close),
            }
            quotes.append(quote)
        except (IndexError, ValueError):
            continue
    return quotes

def parse_daily_quotes(response_data: dict[str, Any], date: str) -> list[dict]:
    if response_data.get("stat") != "OK":
        return []

    # Try new format first (tables array)
    tables = response_data.get("tables", [])
    if tables:
        return parse_daily_quotes_v2(tables, date)

    # Fall back to old format (data9)
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
    twse_date = date.replace("-", "")
    params = {"response": "json", "date": twse_date, "type": "ALLBUT0999"}
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    resp = requests.get(TWSE_DAILY_URL, params=params, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return parse_daily_quotes(data, date)
