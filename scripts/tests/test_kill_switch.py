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
