import requests
from typing import Any

TWSE_DAILY_URL = "https://www.twse.com.tw/exchangeReport/MI_INDEX"

def parse_number(s: str) -> float:
    try:
        return float(s.replace(",", ""))
    except (ValueError, AttributeError):
        return 0.0

def is_limit_up(close: float, prev_close: float) -> bool:
    if prev_close <= 0:
        return False
    change_pct = (close - prev_close) / prev_close * 100
    return change_pct >= 9.5

def parse_daily_quotes(response_data: dict[str, Any], date: str) -> list[dict]:
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
    twse_date = date.replace("-", "")
    params = {"response": "json", "date": twse_date, "type": "ALLBUT0999"}
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    resp = requests.get(TWSE_DAILY_URL, params=params, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return parse_daily_quotes(data, date)
