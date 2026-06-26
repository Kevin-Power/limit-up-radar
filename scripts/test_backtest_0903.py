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


# ── simple_return ───────────────────────────────────────────
def test_simple_return_daytrade():
    # 進100 出105 毛+5%，扣當沖0.435 → 4.57（四捨五入兩位）
    assert bt.simple_return(100, 105, bt.COST_DAYTRADE) == pytest.approx(4.57, abs=0.01)


def test_simple_return_loss_overnight():
    assert bt.simple_return(100, 98, bt.COST_OVERNIGHT) == pytest.approx(-2.585, abs=0.01)


# ── simulate_tp_sl（逐K路徑）────────────────────────────────
def _after(seq):
    return [{"time": t, "high": h, "low": l, "close": c} for (t, h, l, c) in seq]


def test_tp_sl_take_profit_hit_first():
    bars = _after([("09:04", 103, 101, 102), ("09:05", 106, 104, 105)])  # 第2根觸 +5%
    # tp5 → 毛+5 扣0.435 = 4.57
    assert bt.simulate_tp_sl(100, bars, tp_pct=5, sl_pct=3, day_close=104,
                             cost=bt.COST_DAYTRADE) == pytest.approx(4.57, abs=0.01)


def test_tp_sl_stop_loss_hit_first():
    bars = _after([("09:04", 101, 96, 97)])   # low96 ≤ 97(sl3) 觸停損
    assert bt.simulate_tp_sl(100, bars, tp_pct=5, sl_pct=3, day_close=104,
                             cost=bt.COST_DAYTRADE) == pytest.approx(-3.435, abs=0.01)


def test_tp_sl_same_bar_both_assumes_stop_loss():
    bars = _after([("09:04", 106, 96, 100)])  # 同根同觸停利停損 → 保守取停損
    assert bt.simulate_tp_sl(100, bars, tp_pct=5, sl_pct=3, day_close=104,
                             cost=bt.COST_DAYTRADE) == pytest.approx(-3.435, abs=0.01)


def test_tp_sl_none_triggered_exits_at_close():
    bars = _after([("09:04", 102, 99, 101), ("13:30", 103, 100, 102)])  # 都沒觸發
    # 收盤102 毛+2 扣0.435 = 1.565
    assert bt.simulate_tp_sl(100, bars, tp_pct=5, sl_pct=3, day_close=102,
                             cost=bt.COST_DAYTRADE) == pytest.approx(1.565, abs=0.01)


# ── simulate_exit 分派 ──────────────────────────────────────
def _trade(**kw):
    base = {"entry": 100, "dayClose": 105, "nextOpen": 106, "nextClose": 104,
            "barsAfter": _after([("13:30", 105, 100, 105)])}
    base.update(kw)
    return base


def test_simulate_exit_daytrade_close():
    r = bt.simulate_exit(_trade(), {"key": "daytrade_close", "kind": "daytrade_close"})
    assert r == pytest.approx(4.57, abs=0.01)


def test_simulate_exit_next_open():
    r = bt.simulate_exit(_trade(), {"key": "next_open", "kind": "next_open"})
    assert r == pytest.approx(5.415, abs=0.01)   # 進100 出106 毛+6 扣0.585


def test_simulate_exit_next_open_missing_data_returns_none():
    r = bt.simulate_exit(_trade(nextOpen=None), {"key": "next_open", "kind": "next_open"})
    assert r is None


# ── profit_factor / max_drawdown ────────────────────────────
def test_profit_factor():
    assert bt.profit_factor([2, -1, 3, -2]) == pytest.approx(5 / 3, abs=0.01)


def test_profit_factor_no_losses_returns_none():
    assert bt.profit_factor([1, 2, 3]) is None


def test_max_drawdown_simple():
    # +10% 後 -20% → 從 110 跌到 88，回檔 (110-88)/110=20%
    assert bt.max_drawdown([10, -20]) == pytest.approx(20.0, abs=0.1)


def test_max_drawdown_all_up_zero():
    assert bt.max_drawdown([1, 2, 3]) == 0.0


# ── aggregate_rule ──────────────────────────────────────────
def test_aggregate_rule_basic():
    agg = bt.aggregate_rule([2.0, -1.0, 3.0, -2.0])
    assert agg["trades"] == 4
    assert agg["winRate"] == pytest.approx(50.0)
    assert agg["meanNet"] == pytest.approx(0.5)
    assert agg["totalNet"] == pytest.approx(2.0)
    assert agg["maxWin"] == 3.0 and agg["maxLoss"] == -2.0


def test_aggregate_rule_drops_none():
    agg = bt.aggregate_rule([1.0, None, -1.0])
    assert agg["trades"] == 2


# ── EXIT_RULES ──────────────────────────────────────────────
def test_exit_rules_registry():
    keys = {r["key"] for r in bt.EXIT_RULES}
    assert {"daytrade_close", "next_open", "next_close"} <= keys
    # 12 組停利停損 (4 TP × 3 SL)
    assert sum(1 for r in bt.EXIT_RULES if r["kind"] == "tp_sl") == 12
    assert len(bt.EXIT_RULES) == 15


# ── pick_best ───────────────────────────────────────────────
def test_pick_best_by_expectancy_with_min_trades():
    rules = [
        {"key": "a", "label": "A", "trades": 40, "meanNet": 1.0, "profitFactor": 1.5, "winRate": 55},
        {"key": "b", "label": "B", "trades": 40, "meanNet": 2.0, "profitFactor": 1.8, "winRate": 60},
        {"key": "c", "label": "C", "trades": 5,  "meanNet": 9.0, "profitFactor": 9.9, "winRate": 99},
    ]
    best = bt.pick_best(rules, min_trades=30)
    assert best["key"] == "b"            # c 樣本不足被排除
    assert best["lowConfidence"] is False


def test_pick_best_falls_back_when_none_eligible():
    rules = [{"key": "tp5_sl3", "label": "x", "trades": 5, "meanNet": 3.0,
              "profitFactor": 2.0, "winRate": 70}]
    best = bt.pick_best(rules, min_trades=30)
    assert best["key"] == "tp5_sl3"
    assert best["lowConfidence"] is True
    assert "過擬合" in best["caveat"]     # tp 規則帶過擬合提醒
