"""09:03 進場策略回測純函式測試。"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backtest_0903 as bt


def _bars(seq):
    """seq=[(time, o,h,l,c)] → bar dict list。"""
    return [{"time": t, "open": o, "high": h, "low": l, "close": c}
            for (t, o, h, l, c) in seq]


# ── bar_at_0903 ─────────────────────────────────────────────
def test_bar_at_0903_exact():
    bars = _bars([("09:01", 10, 10, 10, 10), ("09:03", 11, 12, 11, 11.5)])
    assert bt.bar_at_0903(bars)["close"] == 11.5


def test_bar_at_0903_fallback_nearest_before():
    # 缺 09:03，取 ≤09:03 最近一根（09:02）
    bars = _bars([("09:01", 10, 10, 10, 10), ("09:02", 10, 11, 10, 10.8),
                  ("09:05", 12, 12, 12, 12)])
    assert bt.bar_at_0903(bars)["close"] == 10.8


def test_bar_at_0903_none_when_starts_too_late():
    bars = _bars([("09:07", 10, 10, 10, 10)])
    assert bt.bar_at_0903(bars) is None


# ── entry_signal ────────────────────────────────────────────
def test_entry_signal_red_k_above_prev_close():
    bars = _bars([("09:01", 100, 101, 100, 100.5), ("09:03", 100.5, 103, 100.5, 102)])
    sig = bt.entry_signal(bars, prev_close=99.0)
    assert sig == {"open": 100, "p0903": 102, "entered": True}


def test_entry_signal_red_k_but_below_prev_close():
    bars = _bars([("09:01", 100, 101, 100, 100.5), ("09:03", 100.5, 101, 100.5, 100.8)])
    sig = bt.entry_signal(bars, prev_close=101.0)   # 102>open but 100.8<101 昨收
    assert sig["entered"] is False


def test_entry_signal_not_red_k_locked_limit_up():
    # 跳空鎖漲停：開盤=09:03 持平 → 非紅K
    bars = _bars([("09:01", 110, 110, 110, 110), ("09:03", 110, 110, 110, 110)])
    sig = bt.entry_signal(bars, prev_close=100.0)
    assert sig["entered"] is False


def test_entry_signal_none_when_no_0903():
    bars = _bars([("09:08", 100, 100, 100, 100)])
    assert bt.entry_signal(bars, prev_close=99.0) is None
