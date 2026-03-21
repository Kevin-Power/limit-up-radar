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
