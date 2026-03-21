import sys
import sqlite3
from datetime import date

from scraper.db import init_db, get_connection, DEFAULT_DB_PATH
from scraper.twse import fetch_daily_quotes

def save_quotes(conn: sqlite3.Connection, quotes: list[dict]) -> int:
    count = 0
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
            count += 1
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    return count

def main():
    if "--init" in sys.argv:
        init_db()
        print(f"Database initialized at {DEFAULT_DB_PATH}")
        return

    target_date = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()

    print(f"=== 漲停雷達爬蟲 ===")
    print(f"日期: {target_date}")
    print()

    init_db()

    print("正在抓取 TWSE 每日收盤行情...")
    quotes = fetch_daily_quotes(target_date)
    print(f"  取得 {len(quotes)} 筆股票資料")

    limit_up_stocks = [q for q in quotes if q["is_limit_up"]]
    print(f"  其中 {len(limit_up_stocks)} 檔漲停")

    conn = get_connection()
    save_quotes(conn, quotes)
    conn.close()
    print(f"  已儲存至資料庫")

    if limit_up_stocks:
        print()
        print("=== 漲停股列表 ===")
        for s in sorted(limit_up_stocks, key=lambda x: x["volume"], reverse=True):
            print(f"  {s['stock_code']} {s['stock_name']:<6} "
                  f"收盤: {s['close']:>8.2f}  漲幅: {s['change_pct']:>6.2f}%  "
                  f"成交量: {s['volume']:>12,}")

    print()
    print("完成！請在 Claude Code 中執行族群分類。")

if __name__ == "__main__":
    main()
