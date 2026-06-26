"""永豐 Shioaji 1 分 K 抓取 + 磁碟快取（IO 層，不做單元測試）。

bar 結構（回給 backtest_0903 的純函式）：
  {"time":"HH:MM","open","high","low","close"}，依時間升冪。

憑證：環境變數 SHIOAJI_API_KEY / SHIOAJI_SECRET_KEY。
首跑驗證：確認 09:03 那根 time 標記正確、歷史可回溯至最早 daily 檔。
"""
import json
import os
import time

CACHE_DIR = os.path.join("data", "intraday_cache")


def login():
    """登入永豐，回 (api, 是否成功)。失敗 raise。"""
    import shioaji as sj
    key = os.environ.get("SHIOAJI_API_KEY")
    secret = os.environ.get("SHIOAJI_SECRET_KEY")
    if not key or not secret:
        raise RuntimeError("缺 SHIOAJI_API_KEY / SHIOAJI_SECRET_KEY 環境變數")
    api = sj.Shioaji()
    api.login(api_key=key, secret_key=secret, fetch_contract=True)
    return api


def _cache_path(code, date):
    return os.path.join(CACHE_DIR, f"{code}_{date}.json")


def _load_cache(code, date):
    try:
        with open(_cache_path(code, date), encoding="utf-8") as fp:
            data = json.load(fp)
            return data if data else None   # [] 視同快取失效，允許重試
    except Exception:
        return None


def _save_cache(code, date, bars):
    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        with open(_cache_path(code, date), "w", encoding="utf-8") as fp:
            json.dump(bars, fp, ensure_ascii=False)
    except Exception:
        pass


def _parse_kbars(kbars, date):
    """Shioaji kbars → bar list（限定 date 當日，升冪）。用 pandas 處理 ts。"""
    import pandas as pd
    df = pd.DataFrame({**kbars})
    if df.empty:
        return []
    df["dt"] = pd.to_datetime(df["ts"])
    df = df[df["dt"].dt.strftime("%Y-%m-%d") == date]
    bars = []
    for _, r in df.iterrows():
        bars.append({"time": r["dt"].strftime("%H:%M"),
                     "open": float(r["Open"]), "high": float(r["High"]),
                     "low": float(r["Low"]), "close": float(r["Close"])})
    bars.sort(key=lambda b: b["time"])
    return bars


def fetch_minute_bars(api, code, date, sleep=0.5):
    """回某檔某日 1 分 K（先讀快取）。無資料回 []。date='YYYY-MM-DD'。"""
    cached = _load_cache(code, date)
    if cached is not None:
        return cached
    bars = []
    try:
        contract = api.Contracts.Stocks[code]
        if contract is not None:
            kb = api.kbars(contract, start=date, end=date)
            bars = _parse_kbars(kb, date)
    except Exception as e:
        print(f"  [shioaji] {code} {date} 失敗: {e}")
        bars = []
    _save_cache(code, date, bars)
    time.sleep(sleep)
    return bars


def make_provider(api):
    """回 bars_provider(code, date) 給 build_report 用。"""
    return lambda code, date: fetch_minute_bars(api, code, date)
