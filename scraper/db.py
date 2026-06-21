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

        -- 長期價值選股結果（連續5年ROE>15% + 連續5年稅後淨利>5億 的合理價/安全邊際）
        CREATE TABLE IF NOT EXISTS value_screen (
            run_date       TEXT NOT NULL,   -- 本次篩選執行日 YYYY-MM-DD
            latest_year    INTEGER NOT NULL,-- 採用的最新財報年度（如 2025）
            stock_code     TEXT NOT NULL,
            stock_name     TEXT,
            industry       TEXT,
            passed         INTEGER DEFAULT 0,   -- 是否符合全部硬性條件
            avg_roe        REAL,            -- 五年平均ROE (%)
            min_roe        REAL,            -- 五年最低ROE (%)
            min_net_income REAL,            -- 五年最低稅後淨利 (元)
            latest_bvps    REAL,            -- 最新年度每股淨值
            reasonable_pe  REAL,            -- 最合理本益比 = (近5年最高PE均 + 最低PE均)/2
            pe_high_avg    REAL,
            pe_low_avg     REAL,
            cheap_price    REAL,            -- 便宜價 = 淨值×avgROE×最低PE均
            fair_value     REAL,            -- 合理價值 = 淨值×avgROE×最合理PE
            expensive_price REAL,           -- 昂貴價 = 淨值×avgROE×最高PE均
            margin_price   REAL,            -- 安全邊際價 = 合理價值 / 1.2
            current_price  REAL,
            upside_pct     REAL,            -- (合理價值/現價 - 1) * 100
            dividend_yield REAL,            -- 參考：現金殖利率 (%)
            note           TEXT,            -- 失敗原因或備註
            PRIMARY KEY (run_date, stock_code)
        );
    """)
    conn.close()

def get_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn
