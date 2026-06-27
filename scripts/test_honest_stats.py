"""Tests for honest_stats pure functions (TDD red phase).

誠實期望值體檢：淨期望值、中位數 vs 平均、Wilson CI、regime 切分、
以及「完整鏡像 scoring.ts」的評分函式（含 run_backtest.py 漏掉的
權值股 +25 與近期空吞 −25 兩個訊號）。
"""
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs


# ── Wilson 95% CI ───────────────────────────────────────────
def test_wilson_ci_known_value():
    lo, hi = hs.wilson_ci(8, 10)
    assert lo == pytest.approx(49.0, abs=0.5)   # ~49.0%
    assert hi == pytest.approx(94.3, abs=0.5)   # ~94.3%


def test_wilson_ci_bounds_and_order():
    lo, hi = hs.wilson_ci(149, 199)
    assert 0 < lo < 149 / 199 * 100 < hi < 100


def test_wilson_ci_zero_n():
    assert hs.wilson_ci(0, 0) == (0.0, 0.0)


# ── 分布統計 ────────────────────────────────────────────────
def test_summarize_median_vs_mean_outlier_gap():
    rets = [0.5, 0.6, 0.7, 0.8, 30.0]   # 一檔暴衝撐起平均
    s = hs.summarize(rets)
    assert s["median"] == pytest.approx(0.7)
    assert s["mean"] == pytest.approx(6.52, abs=0.01)
    # 截尾(去最高3)後：mean(0.5, 0.6) = 0.55
    assert s["trimmedMeanTop3"] == pytest.approx(0.55, abs=0.01)


def test_summarize_winrate_and_ci():
    rets = [1.0, 2.0, -1.0, -2.0]
    s = hs.summarize(rets)
    assert s["samples"] == 4
    assert s["winRate"] == pytest.approx(50.0)
    assert s["ciLow"] < 50.0 < s["ciHigh"]


def test_summarize_empty():
    s = hs.summarize([])
    assert s["samples"] == 0 and s["mean"] is None and s["median"] is None


# ── 成本情境 ────────────────────────────────────────────────
def test_apply_cost():
    assert hs.apply_cost([4.535, 0.0, -1.0], 0.435) == pytest.approx([4.1, -0.435, -1.435])


def test_cost_constants():
    # 費稅：0.1425%×2 + 當沖稅 0.15% = 0.435；保守情境 1.0%
    assert hs.COST_FEES_PCT == pytest.approx(0.435)
    assert hs.COST_CONSERVATIVE_PCT == pytest.approx(1.0)


# ── regime 切分（隔日大盤紅/綠）────────────────────────────
def test_regime_split():
    rows = [
        {"ret": 2.0, "taiexNextChg": 0.5},
        {"ret": -1.0, "taiexNextChg": -0.3},
        {"ret": 1.0, "taiexNextChg": 0.0},   # 平盤歸入 up（>=0）
    ]
    up, down = hs.regime_split(rows)
    assert [r["ret"] for r in up] == [2.0, 1.0]
    assert [r["ret"] for r in down] == [-1.0]


# ── 評分鏡像（完整 scoring.ts，含 run_backtest 漏掉的兩訊號）──
def _stock(**kw):
    base = {"code": "9999", "name": "測試", "close": 100.0,
            "volume": 6_000_000, "major_net": 1, "streak": 2}
    base.update(kw)
    return base


def test_score_full_all_positive_signals():
    # P1-3 後法人三級制：major_net=1 不觸發任何加分（需 >=200K）
    # P1-4 後權值股 +25 → +10
    # 趨勢+30 營收>50→+35 連板+15 量>5M→+5 龍頭+10 權值+10 = 105
    sc = hs.score_stock_full(
        _stock(), group_name="G", trending={"G"}, leader_code="9999",
        rev_yoy=60, is_disposal=False, recent_bearish=False, is_heavyweight=True,
    )
    assert sc == 105


def test_score_full_negative_signals():
    # 量300張−30 處置−50 空吞−25 = −105（無任何加分）
    sc = hs.score_stock_full(
        _stock(volume=300_000, major_net=0, streak=1),
        group_name="G", trending=set(), leader_code="other",
        rev_yoy=None, is_disposal=True, recent_bearish=True, is_heavyweight=False,
    )
    assert sc == -105


# ── TPEx 新端點 (tradingStock) 月資料解析 ──────────────────
def test_parse_tpex_trading_stock():
    payload = {"tables": [{"data": [
        ["115/06/05", "1,234", "56,789", "100.5", "102.0", "99.0", "101.5", "+1.0"],
        ["115/06/08", "2,000", "70,000", "--", "0", "0", "--", " "],     # 無交易日
        ["115/06/09", "1,500", "60,000", "103.0", "104.0", "101.0", "102.0", "-1.5"],
    ]}]}
    out = hs.parse_tpex_trading_stock(payload)
    assert out == {
        "2026-06-05": {"open": 100.5, "close": 101.5},
        "2026-06-09": {"open": 103.0, "close": 102.0},
    }


def test_parse_tpex_trading_stock_empty():
    assert hs.parse_tpex_trading_stock({"tables": [{"data": []}]}) == {}
    assert hs.parse_tpex_trading_stock({}) == {}


def test_score_full_heavyweight_and_bearish_are_wired():
    """run_backtest.py 鏡像漂移迴歸測試：這兩個訊號必須有作用。"""
    base = dict(group_name="G", trending=set(), leader_code="x",
                rev_yoy=None, is_disposal=False)
    s0 = hs.score_stock_full(_stock(streak=1, major_net=0), recent_bearish=False,
                             is_heavyweight=False, **base)
    # P1-4: 權值股加分由 +25 降為 +10（屍體解剖：權值股漲停 win 50% < 非權值 55.5%）
    assert hs.score_stock_full(_stock(streak=1, major_net=0), recent_bearish=False,
                               is_heavyweight=True, **base) == s0 + 10
    assert hs.score_stock_full(_stock(streak=1, major_net=0), recent_bearish=True,
                               is_heavyweight=False, **base) == s0 - 25


# ── reconstruct_picks cap 參數（09:03 回測需全部 ≥50）──────────
def test_reconstruct_picks_cap_none_returns_all():
    days = [{
        "date": "2026-06-10",
        "groups": [{"name": "G", "stocks": [
            {"code": f"{1000+i}", "name": f"s{i}", "close": 10.0,
             "volume": 6_000_000, "major_net": 1, "streak": 2}
            for i in range(25)
        ]}],
    }]
    # 趨勢族群需 2 天才成立；單日 → 不加 30，但量+5/法人+20/連板+15=40 < 50
    # 為了讓全部 ≥50，補一天讓 G 變趨勢族群（+30 → 70）
    days = [{"date": "2026-06-09", "groups": days[0]["groups"]}, days[0]]
    picks_capped = hs.reconstruct_picks(days, 1, [], set(), set())          # 預設 cap=20
    picks_all = hs.reconstruct_picks(days, 1, [], set(), set(), cap=None)   # 無上限
    assert len(picks_capped) == 20
    assert len(picks_all) == 25
