"""09:03 紅K進場策略回測 — 純函式（進場/出場/成本/指標/挑最佳）。

bar 結構：{"time":"HH:MM","open","high","low","close"}，依時間升冪。
重用 honest_stats.summarize 做分布統計。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from honest_stats import summarize  # noqa: E402

# ── 成本（扣百分點，與 honest_stats 一致）────────────────────
COST_DAYTRADE = 0.435    # 0.1425%×2 + 當沖稅 0.15%
COST_OVERNIGHT = 0.585   # 0.1425%×2 + 隔日稅 0.30%

_OPEN = "09:00"
_T0903 = "09:03"
_CUTOFF = "09:06"   # 09:06 前都無成交 → 視為無 09:03 價


def bar_at_0903(bars):
    """取 time=='09:03' 的 K；缺則取 ≤09:03 最近一根；若第一根 >09:06 → None。"""
    if not bars:
        return None
    candidates = [b for b in bars if _OPEN <= b["time"] <= _T0903]
    if candidates:
        return candidates[-1]
    # 無 ≤09:03 的 bar：若最早一根已晚於 09:06，放棄
    first = min(bars, key=lambda b: b["time"])
    if first["time"] > _CUTOFF:
        return None
    return first


def entry_signal(bars, prev_close):
    """回 {"open","p0903","entered"}；無法取 09:03 價 → None。
    entered = (p0903 > open) and (p0903 > prev_close)。
    """
    b = bar_at_0903(bars)
    if b is None or not bars:
        return None
    day_open = bars[0]["open"]
    p0903 = b["close"]
    entered = (p0903 > day_open) and (p0903 > prev_close)
    return {"open": day_open, "p0903": p0903, "entered": entered}


def simple_return(entry, exit_price, cost):
    """毛報酬% 減成本%。"""
    gross = (exit_price - entry) / entry * 100
    return round(gross - cost, 3)


def simulate_tp_sl(entry, bars_after, tp_pct, sl_pct, day_close, cost):
    """逐根掃 09:03 後的 K：先觸停損則 -sl，先觸停利則 +tp，
    同根同觸假設先停損（保守）；都沒觸 → 收盤平倉。回淨報酬%。"""
    tp_price = entry * (1 + tp_pct / 100)
    sl_price = entry * (1 - sl_pct / 100)
    for b in bars_after:
        hit_sl = b["low"] <= sl_price
        hit_tp = b["high"] >= tp_price
        if hit_sl:                      # 含同根同觸 → 保守停損優先
            return round(-sl_pct - cost, 3)
        if hit_tp:
            return round(tp_pct - cost, 3)
    gross = (day_close - entry) / entry * 100
    return round(gross - cost, 3)


def simulate_exit(trade, rule):
    """依 rule['kind'] 分派；缺必要資料回 None。
    trade 需含 entry, dayClose, nextOpen, nextClose, barsAfter。"""
    kind = rule["kind"]
    if kind == "daytrade_close":
        return simple_return(trade["entry"], trade["dayClose"], COST_DAYTRADE)
    if kind == "next_open":
        if trade.get("nextOpen") is None:
            return None
        return simple_return(trade["entry"], trade["nextOpen"], COST_OVERNIGHT)
    if kind == "next_close":
        if trade.get("nextClose") is None:
            return None
        return simple_return(trade["entry"], trade["nextClose"], COST_OVERNIGHT)
    if kind == "tp_sl":
        return simulate_tp_sl(trade["entry"], trade["barsAfter"],
                              rule["tp"], rule["sl"], trade["dayClose"], COST_DAYTRADE)
    raise ValueError(f"unknown rule kind: {kind}")
