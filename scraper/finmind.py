"""FinMind 開放資料 API 客戶端（台股財報 / 每日本益比 / 股票清單）。

為什麼用 FinMind：本長期價值選股需要「連續 5 年」的逐年財報與每日本益比，
TWSE/TPEX 的每日行情 API 無法一次提供這些歷史財報；FinMind 免費、有結構化
的損益表、資產負債表與每日 PER/PBR，且不需爬蟲。

註冊免費帳號可拿到 API token，額度較高。用法：
    export FINMIND_TOKEN="你的token"
    python -m scripts.run_value_screen

無 token 也能用（匿名額度低、容易被限流）。

資料集對照（FinMind dataset）：
  - TaiwanStockInfo                 股票清單 + 產業別
  - TaiwanStockFinancialStatements  綜合損益表（取稅後淨利）
  - TaiwanStockBalanceSheet         資產負債表（取母公司權益、普通股股本）
  - TaiwanStockPER                  每日 本益比/股價淨值比/殖利率
"""
from __future__ import annotations

import os
import time
from typing import Optional

import requests

FINMIND_URL = "https://api.finmindtrade.com/api/v4/data"


class FinMindError(RuntimeError):
    pass


class FinMindClient:
    def __init__(
        self,
        token: Optional[str] = None,
        *,
        url: str = FINMIND_URL,
        timeout: int = 30,
        max_retries: int = 4,
        pause: float = 0.3,
    ):
        self.token = token if token is not None else os.environ.get("FINMIND_TOKEN", "")
        self.url = url
        self.timeout = timeout
        self.max_retries = max_retries
        self.pause = pause  # 每次呼叫後的禮貌性間隔，降低被限流機率
        self.session = requests.Session()

    def _get(self, dataset: str, **params) -> list[dict]:
        params["dataset"] = dataset
        if self.token:
            params["token"] = self.token
        backoff = 2.0
        last_exc: Optional[Exception] = None
        for attempt in range(self.max_retries):
            try:
                resp = self.session.get(self.url, params=params, timeout=self.timeout)
                # 402/429 = 額度用盡或限流：退避重試
                if resp.status_code in (402, 429):
                    raise FinMindError(f"限流/額度不足 (HTTP {resp.status_code})")
                resp.raise_for_status()
                payload = resp.json()
                if payload.get("status") not in (200, None):
                    raise FinMindError(payload.get("msg", "FinMind 回傳非 200"))
                time.sleep(self.pause)
                return payload.get("data", [])
            except (requests.RequestException, FinMindError) as exc:
                last_exc = exc
                if attempt < self.max_retries - 1:
                    time.sleep(backoff)
                    backoff *= 2
        raise FinMindError(f"FinMind 取得 {dataset} 失敗：{last_exc}")

    # --- 各資料集 ---------------------------------------------------------
    def stock_list(self) -> list[dict]:
        """回傳上市/上櫃普通股清單：[{stock_id, stock_name, industry_category, type}]。"""
        rows = self._get("TaiwanStockInfo")
        seen: dict[str, dict] = {}
        for r in rows:
            code = str(r.get("stock_id", "")).strip()
            # 只要 4 碼數字（排除 ETF/權證/特別股等）
            if len(code) != 4 or not code.isdigit():
                continue
            industry = r.get("industry_category", "")
            if industry in ("ETF", "Index", "大盤"):
                continue
            seen[code] = {
                "stock_id": code,
                "stock_name": r.get("stock_name", ""),
                "industry_category": industry,
                "type": r.get("type", ""),
            }
        return list(seen.values())

    def financial_statement(self, stock_id: str, start_date: str) -> list[dict]:
        return self._get(
            "TaiwanStockFinancialStatements", data_id=stock_id, start_date=start_date
        )

    def balance_sheet(self, stock_id: str, start_date: str) -> list[dict]:
        return self._get(
            "TaiwanStockBalanceSheet", data_id=stock_id, start_date=start_date
        )

    def per(self, stock_id: str, start_date: str) -> list[dict]:
        return self._get("TaiwanStockPER", data_id=stock_id, start_date=start_date)

    def price(self, stock_id: str, start_date: str) -> list[dict]:
        """每日收盤價（取最近一筆當現價）。"""
        return self._get("TaiwanStockPrice", data_id=stock_id, start_date=start_date)


# FinMind 中文科目關鍵字（依優先序比對 origin_name）------------------------
# 稅後淨利（優先取「歸屬母公司」；退而求其次取本期淨利合計）
NET_INCOME_PARENT_KEYWORDS = [
    "淨利（淨損）歸屬於母公司業主",
    "綜合損益總額歸屬於母公司業主",
    "本期淨利（淨損）",
    "本期稅後淨利",
]
# 母公司權益
EQUITY_PARENT_KEYWORDS = [
    "歸屬於母公司業主之權益合計",
    "歸屬於母公司業主之權益總計",
    "權益總額",
    "權益總計",
]
# 普通股股本
ORDINARY_SHARE_KEYWORDS = [
    "普通股股本",
    "股本",
]
