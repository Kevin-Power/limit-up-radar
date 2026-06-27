"""Kill switch 指標計算測試。"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from run_kill_switch import (  # noqa: E402
    rolling_ev, current_streak_losses, market_warning_status, build_kill_switch_data
)

def test_rolling_ev_basic():
    rets = [1.0, 2.0, -1.0, 3.0, -2.0]
    assert rolling_ev(rets, window=3) == [None, None, round((1+2-1)/3,3),
                                          round((2-1+3)/3,3), round((-1+3-2)/3,3)]

def test_rolling_ev_short():
    """資料 < window → 全 None"""
    assert rolling_ev([1, 2], window=3) == [None, None]

def test_streak_losses_counts_trailing():
    assert current_streak_losses([1, -1, -2, -3]) == 3
    assert current_streak_losses([-1, 1]) == 0
    assert current_streak_losses([]) == 0
    assert current_streak_losses([-1, -2, -3, -4, -5]) == 5

def test_market_warning_status():
    """大盤前一日 ≤ -1.5% → 'red'，-1.5 ~ -0.5 → 'amber'，> -0.5 → 'green'"""
    assert market_warning_status(-2.0) == "red"
    assert market_warning_status(-1.5) == "red"
    assert market_warning_status(-1.0) == "amber"
    assert market_warning_status(-0.4) == "green"
    assert market_warning_status(0.5) == "green"

def test_build_kill_switch_smoke():
    """整合：給假 backtest，期望輸出含 timeline / latest / warnings keys"""
    fake_trades = [
        {"dEntry": "2026-06-01", "r1Ret": 1.5},
        {"dEntry": "2026-06-02", "r1Ret": -2.0},
        {"dEntry": "2026-06-03", "r1Ret": 0.8},
    ]
    fake_taiex = [{"date": "2026-06-02", "chgPct": -1.6}]  # 06-03 進場前 = 06-02 收
    out = build_kill_switch_data(fake_trades, fake_taiex, window=2)
    assert "timeline" in out
    assert "latest" in out
    assert "warnings" in out
    assert isinstance(out["timeline"], list)
    assert out["latest"]["streakLosses"] == 0   # last is +0.8


def test_prev_taiex_bisect_lookup():
    """確認 prev_taiex 用 bisect 找到 < dEntry 的最後一個 taiex 日期。"""
    fake_trades = [
        {"dEntry": "2026-06-05", "r1Ret": 1.0},  # 前一個 taiex < 06-05 = 06-04
        {"dEntry": "2026-06-10", "r1Ret": 2.0},  # 前一個 taiex < 06-10 = 06-09
        {"dEntry": "2026-06-01", "r1Ret": 3.0},  # 前一個 taiex < 06-01 = None
    ]
    fake_taiex = [
        {"date": "2026-06-02", "chgPct": 0.5},
        {"date": "2026-06-04", "chgPct": -0.8},
        {"date": "2026-06-09", "chgPct": -1.6},
    ]
    out = build_kill_switch_data(fake_trades, fake_taiex, window=2)
    # timeline 按 dEntry 升冪排序：06-01, 06-05, 06-10
    tl = out["timeline"]
    assert tl[0]["date"] == "2026-06-01"
    assert tl[0]["marketYesterdayChg"] is None  # 06-01 之前無 taiex
    assert tl[1]["date"] == "2026-06-05"
    assert tl[1]["marketYesterdayChg"] == -0.8  # 06-04
    assert tl[2]["date"] == "2026-06-10"
    assert tl[2]["marketYesterdayChg"] == -1.6  # 06-09


def test_prev_taiex_exact_date_excluded():
    """進場當日 d 的 taiex 不算（要嚴格 < d）。"""
    fake_trades = [{"dEntry": "2026-06-05", "r1Ret": 1.0}]
    # 06-05 當日有 taiex，但應該找 < 06-05 的 → 06-04
    fake_taiex = [
        {"date": "2026-06-04", "chgPct": -0.5},
        {"date": "2026-06-05", "chgPct": 0.9},
    ]
    out = build_kill_switch_data(fake_trades, fake_taiex, window=2)
    assert out["timeline"][0]["marketYesterdayChg"] == -0.5
