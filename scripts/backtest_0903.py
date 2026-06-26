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
