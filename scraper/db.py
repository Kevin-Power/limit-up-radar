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
