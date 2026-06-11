"""Tests for dynamic backtest sample/day numbers in the LINE post generator.

Regression guard for the stale hardcoded "99 樣本 / 10 天" disclaimer:
the private build_text/build_image must pull totalSamples (and totalDays
when present) from d["realBacktest"], never hardcode them.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_line_post as g


def _make_d(real_backtest):
    return {
        "date": "2099-01-01",
        "taiex": 20000,
        "taiexChg": 1.23,
        "totalLimitUp": 15,
        "trendingGroups": [],
        "realBacktest": real_backtest,
    }


# ── _sample_days helper ────────────────────────────────────
def test_sample_days_with_days_slash():
    bt = {"totalSamples": 198, "totalDays": 10}
    assert g._sample_days(bt, " / ") == "198 樣本 / 10 天"


def test_sample_days_with_days_middot():
    bt = {"totalSamples": 198, "totalDays": 10}
    assert g._sample_days(bt, " · ") == "198 樣本 · 10 天"


def test_sample_days_omits_days_when_absent():
    bt = {"totalSamples": 198}
    assert g._sample_days(bt, " / ") == "198 樣本"


def test_sample_days_omits_days_when_falsy():
    bt = {"totalSamples": 198, "totalDays": 0}
    assert g._sample_days(bt, " / ") == "198 樣本"


# ── build_text disclaimer ──────────────────────────────────
def test_build_text_uses_dynamic_samples_and_days():
    d = _make_d({"totalSamples": 198, "totalDays": 10,
                 "avgOpenWinRate": 70, "avgOpenReturn": 3.43})
    text = g.build_text(d, [], "2099-01-02")
    assert "⚠️ 198 樣本 / 10 天偏多頭區間" in text
    assert "99 樣本" not in text


def test_build_text_omits_days_when_missing():
    d = _make_d({"totalSamples": 198,
                 "avgOpenWinRate": 70, "avgOpenReturn": 3.43})
    text = g.build_text(d, [], "2099-01-02")
    assert "⚠️ 198 樣本偏多頭區間" in text
    assert "10 天" not in text


# ── 公開版：分析/教育定位（誠實信任錨）─────────────────────
def test_public_text_anchor_is_honest_and_dynamic():
    d = _make_d({"totalSamples": 199, "totalDays": 10,
                 "avgOpenWinRate": 75, "avgOpenReturn": 4.0})
    d["focusStocks"] = []
    text = g.build_public_text(d, [], "2099-01-02")
    # 信任錨必須標明「未含交易成本」且樣本數動態
    assert "199 樣本" in text
    assert "未含交易成本" in text
    # 不得出現舊的「平台真實回測」績效式措辭
    assert "平台真實回測" not in text


def test_public_text_disclaimer_mentions_costs():
    d = _make_d({"totalSamples": 199, "totalDays": 10,
                 "avgOpenWinRate": 75, "avgOpenReturn": 4.0})
    text = g.build_public_text(d, [], "2099-01-02")
    assert "未含交易成本與滑價" in text
