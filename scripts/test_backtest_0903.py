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


# ── build_report（注入假 bars_provider）──────────────────────
def test_build_report_funnel_and_rules():
    pick_days = [{
        "pickDate": "2026-06-23", "entryDate": "2026-06-24", "nextDate": "2026-06-25",
        "picks": [
            {"code": "AAA", "name": "進場檔", "score": 80, "prevClose": 100.0},
            {"code": "BBB", "name": "不符檔", "score": 70, "prevClose": 100.0},
            {"code": "CCC", "name": "無資料", "score": 65, "prevClose": 100.0},
        ],
    }]

    def provider(code, date):
        if code == "AAA" and date == "2026-06-24":   # 紅K且高於昨收 → 進場
            return [{"time": "09:01", "open": 100, "high": 101, "low": 100, "close": 100.5},
                    {"time": "09:03", "open": 100.5, "high": 105, "low": 100.5, "close": 104},
                    {"time": "13:30", "open": 104, "high": 106, "low": 103, "close": 105}]
        if code == "BBB" and date == "2026-06-24":   # 紅K但低於昨收 → 不進場
            return [{"time": "09:01", "open": 98, "high": 99, "low": 98, "close": 98.5},
                    {"time": "09:03", "open": 98.5, "high": 99, "low": 98.5, "close": 99}]
        if code == "AAA" and date == "2026-06-25":   # D+2（隔日出場用）
            return [{"time": "09:01", "open": 107, "high": 108, "low": 106, "close": 107.5},
                    {"time": "13:30", "open": 107, "high": 108, "low": 106, "close": 106}]
        return []   # CCC 無資料

    rep = bt.build_report(pick_days, provider, min_trades=0)
    assert rep["funnel"] == {"totalPicks": 3, "noData": 1, "notEntered": 1, "passedFilter": 1}
    assert rep["dateRange"] == {"start": "2026-06-24", "end": "2026-06-24"}
    daytrade = next(r for r in rep["rules"] if r["key"] == "daytrade_close")
    assert daytrade["trades"] == 1
    # 進104 收105 毛+0.96% 扣0.435 ≈ 0.527
    assert daytrade["meanNet"] == pytest.approx(0.53, abs=0.05)
    assert rep["best"] is not None
    assert len(rep["trades"]) == 1
    assert rep["trades"][0]["code"] == "AAA"
    assert "bestReturnNet" in rep["trades"][0]


# ── P0-2 R1 整合測試 ────────────────────────────────────────
def test_simulate_r1_t1_0915_path():
    """gap 0~5% → 09:15 出場路徑。"""
    t1_bars = [
        {"time": "09:00", "open": 102, "high": 102, "low": 102, "close": 102},
        {"time": "09:15", "open": 103, "high": 104, "low": 102.5, "close": 103.5},
    ]
    trade = {"entry": 100, "t1Bars": t1_bars, "t2Open": 105}
    r = bt.simulate_r1(trade)
    # gap=(102/100-1)*100=2% in [0,5) → 09:15 close=103.5
    # gross=(103.5-100)/100*100=3.5, net=3.5-0.585=2.915
    assert r["rule"] == "T1_0915"
    assert r["gapPct"] == pytest.approx(2.0, abs=0.01)
    assert r["exitPrice"] == 103.5
    assert r["ret"] == pytest.approx(2.915, abs=0.01)


def test_simulate_r1_t2_open_path_negative_gap():
    """gap < 0 → T+2 開盤出場。"""
    t1_bars = [
        {"time": "09:00", "open": 98, "high": 99, "low": 97, "close": 98.5},
        {"time": "09:15", "open": 98.5, "high": 99, "low": 98, "close": 98.5},
    ]
    trade = {"entry": 100, "t1Bars": t1_bars, "t2Open": 101}
    r = bt.simulate_r1(trade)
    # gap=-2% → T2 open=101, gross=1%, net=1-0.585=0.415
    assert r["rule"] == "T2_open"
    assert r["exitPrice"] == 101
    assert r["ret"] == pytest.approx(0.415, abs=0.01)


def test_simulate_r1_t2_open_path_large_gap():
    """gap ≥ 5% → T+2 開盤出場。"""
    t1_bars = [
        {"time": "09:00", "open": 106, "high": 107, "low": 105, "close": 106.5},
        {"time": "09:15", "open": 106.5, "high": 107, "low": 106, "close": 106.8},
    ]
    trade = {"entry": 100, "t1Bars": t1_bars, "t2Open": 108}
    r = bt.simulate_r1(trade)
    # gap=6% ≥ 5 → T2 open=108
    assert r["rule"] == "T2_open"
    assert r["exitPrice"] == 108


def test_simulate_r1_no_data_returns_nones():
    r = bt.simulate_r1({"entry": 100, "t1Bars": [], "t2Open": None})
    assert r["ret"] is None and r["rule"] is None


def test_aggregate_monthly_groups_by_yyyymm():
    trades = [
        {"dEntry": "2026-05-10", "ret": 2.0},
        {"dEntry": "2026-05-20", "ret": -1.0},
        {"dEntry": "2026-06-01", "ret": 3.0},
        {"dEntry": "2026-06-15", "ret": None},   # 應被忽略
    ]
    out = bt.aggregate_monthly(trades)
    assert set(out.keys()) == {"2026-05", "2026-06"}
    assert out["2026-05"]["trades"] == 2
    assert out["2026-05"]["winRate"] == pytest.approx(50.0)
    assert out["2026-05"]["ev"] == pytest.approx(0.5)
    assert out["2026-05"]["total"] == pytest.approx(1.0)
    assert out["2026-06"]["trades"] == 1
    assert out["2026-06"]["winRate"] == pytest.approx(100.0)


def test_build_report_emits_r1_and_baseline_stats():
    """build_report 必須輸出 r1Stats / baselineStats / monthlyR1 / monthlyBaseline。"""
    pick_days = [{
        "pickDate": "2026-06-23", "entryDate": "2026-06-24", "nextDate": "2026-06-25",
        "picks": [
            {"code": "AAA", "name": "進場檔", "score": 80, "prevClose": 100.0},
        ],
    }]

    def provider(code, date):
        if code == "AAA" and date == "2026-06-24":
            # 多根 bar，含 09:15 供 R1 命中
            return [{"time": "09:01", "open": 100, "high": 101, "low": 100, "close": 100.5},
                    {"time": "09:03", "open": 100.5, "high": 105, "low": 100.5, "close": 104},
                    {"time": "09:15", "open": 104, "high": 105, "low": 103.5, "close": 104.5},
                    {"time": "13:30", "open": 104, "high": 106, "low": 103, "close": 105}]
        if code == "AAA" and date == "2026-06-25":
            return [{"time": "09:01", "open": 107, "high": 108, "low": 106, "close": 107.5},
                    {"time": "13:30", "open": 107, "high": 108, "low": 106, "close": 106}]
        return []

    rep = bt.build_report(pick_days, provider, min_trades=0)
    # 新增鍵存在
    assert "r1Stats" in rep
    assert "baselineStats" in rep
    assert "monthlyR1" in rep
    assert "monthlyBaseline" in rep
    # r1Stats 含 rule/label
    assert rep["r1Stats"]["rule"] == "R1_dynamic"
    assert "R1" in rep["r1Stats"]["label"]
    # 月度有 2026-06
    assert "2026-06" in rep["monthlyR1"]
    assert "2026-06" in rep["monthlyBaseline"]
    # 每筆 trade 有 r1 欄位
    t = rep["trades"][0]
    assert "r1Ret" in t and "r1Rule" in t and "r1GapPct" in t and "r1ExitPrice" in t
    # entry=104, t1_open=100 → gap=(100/104-1)*100≈-3.85% < 0 → T2 open=107
    assert t["r1Rule"] == "T2_open"
    assert t["r1ExitPrice"] == 107


# ── run_backtest_0903 console summary 不可 KeyError（regression）─────
def test_run_backtest_console_summary_uses_valid_funnel_keys(capsys):
    """run_backtest_0903.main 的 print 不可引用 funnel 不存在的 key。
    確保 funnel 只用 totalPicks/noData/notEntered/passedFilter，
    成交數改由 len(report['trades']) 取得（避免 KeyError）。"""
    pick_days = [{
        "pickDate": "2026-06-23", "entryDate": "2026-06-24", "nextDate": "2026-06-25",
        "picks": [
            {"code": "AAA", "name": "進場檔", "score": 80, "prevClose": 100.0},
        ],
    }]

    def provider(code, date):
        if code == "AAA" and date == "2026-06-24":
            return [{"time": "09:01", "open": 100, "high": 101, "low": 100, "close": 100.5},
                    {"time": "09:03", "open": 100.5, "high": 105, "low": 100.5, "close": 104},
                    {"time": "13:30", "open": 104, "high": 106, "low": 103, "close": 105}]
        if code == "AAA" and date == "2026-06-25":
            return [{"time": "09:01", "open": 107, "high": 108, "low": 106, "close": 107.5}]
        return []

    rep = bt.build_report(pick_days, provider, min_trades=0)
    f = rep["funnel"]
    # 完整跑 run_backtest_0903 print 邏輯 — 不可 KeyError
    traded = len(rep.get("trades", []))
    line = (f"漏斗：精選 {f['totalPicks']} → 無資料 {f['noData']} → "
            f"通過 {f['passedFilter']} → 成交 {traded}")
    assert "成交 1" in line   # AAA 進場成功
    assert "精選 1" in line
