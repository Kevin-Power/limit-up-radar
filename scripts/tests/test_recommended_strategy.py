"""run_recommended_strategy.py 單元測試。

被測函式：
  - load_cache(code, date) → bars | None
  - compute_entry(code, entryDate) → first bar open | None
  - compute_exits_for_trade(trade) → {r1Ret, r1Rule, r1GapPct, r1ExitPrice, baselineRet}
  - aggregate_stats(rets) → {trades, winRate, meanNet, ...}
  - aggregate_monthly(trades_with_ret) → {YYYY-MM: {trades, winRate, ev, total}}
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import run_recommended_strategy as rrs  # noqa: E402


def _make_bars(rows):
    """rows: [(time, o, h, l, c), ...] → list[dict]"""
    return [{"time": t, "open": o, "high": h, "low": l, "close": c} for t, o, h, l, c in rows]


# ── load_cache ─────────────────────────────────────────────────
def test_load_cache_returns_bars(tmp_path, monkeypatch):
    bars = _make_bars([("09:00", 100, 101, 99, 100.5)])
    p = tmp_path / "1234_2026-06-25.json"
    p.write_text(json.dumps(bars), encoding="utf-8")
    monkeypatch.setattr(rrs, "CACHE_DIR", str(tmp_path))
    assert rrs.load_cache("1234", "2026-06-25") == bars


def test_load_cache_missing_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(rrs, "CACHE_DIR", str(tmp_path))
    assert rrs.load_cache("9999", "2026-01-01") is None


# ── compute_entry ──────────────────────────────────────────────
def test_compute_entry_first_bar_open(tmp_path, monkeypatch):
    bars = _make_bars([("09:00", 100.0, 101, 99, 100.5),
                       ("09:01", 100.5, 101, 100, 100.6)])
    (tmp_path / "1111_2026-06-25.json").write_text(json.dumps(bars), encoding="utf-8")
    monkeypatch.setattr(rrs, "CACHE_DIR", str(tmp_path))
    assert rrs.compute_entry("1111", "2026-06-25") == 100.0


def test_compute_entry_missing_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(rrs, "CACHE_DIR", str(tmp_path))
    assert rrs.compute_entry("9999", "2026-06-25") is None


def test_compute_entry_invalid_open_returns_none(tmp_path, monkeypatch):
    bars = _make_bars([("09:00", 0, 0, 0, 0)])
    (tmp_path / "2222_2026-06-25.json").write_text(json.dumps(bars), encoding="utf-8")
    monkeypatch.setattr(rrs, "CACHE_DIR", str(tmp_path))
    assert rrs.compute_entry("2222", "2026-06-25") is None


# ── compute_exits_for_trade ────────────────────────────────────
def test_compute_exits_gap_in_band_uses_0915(tmp_path, monkeypatch):
    """entry=100, T+1 open=103 (gap=3%) → R1 用 09:15 close, baseline 用 T+2 open。"""
    t1 = _make_bars([("09:00", 103, 103, 103, 103),
                     ("09:15", 104, 104, 104, 104)])
    t2 = _make_bars([("09:00", 110, 110, 110, 110)])
    (tmp_path / "3333_2026-06-26.json").write_text(json.dumps(t1), encoding="utf-8")
    (tmp_path / "3333_2026-06-27.json").write_text(json.dumps(t2), encoding="utf-8")
    monkeypatch.setattr(rrs, "CACHE_DIR", str(tmp_path))
    out = rrs.compute_exits_for_trade(
        entry=100.0, code="3333", entry_date="2026-06-26",
        t2_date="2026-06-27"
    )
    assert out["r1Rule"] == "T1_0915"
    assert out["r1ExitPrice"] == 104
    assert abs(out["r1GapPct"] - 3.0) < 1e-6
    # R1: 毛 4% - 0.585% = 3.415
    assert abs(out["r1Ret"] - 3.415) < 1e-3
    # baseline: T+2 open=110 → 毛 10% - 0.585% = 9.415
    assert abs(out["baselineRet"] - 9.415) < 1e-3


def test_compute_exits_gap_over_5_uses_t2_open(tmp_path, monkeypatch):
    """entry=100, T+1 open=107 (gap=7%) → R1 走 T+2 open。"""
    t1 = _make_bars([("09:00", 107, 107, 107, 107)])
    t2 = _make_bars([("09:00", 108, 108, 108, 108)])
    (tmp_path / "4444_2026-06-26.json").write_text(json.dumps(t1), encoding="utf-8")
    (tmp_path / "4444_2026-06-27.json").write_text(json.dumps(t2), encoding="utf-8")
    monkeypatch.setattr(rrs, "CACHE_DIR", str(tmp_path))
    out = rrs.compute_exits_for_trade(
        entry=100.0, code="4444", entry_date="2026-06-26",
        t2_date="2026-06-27"
    )
    assert out["r1Rule"] == "T2_open"
    assert out["r1ExitPrice"] == 108
    # R1 與 baseline 都應該等於 8% - 0.585%
    assert abs(out["r1Ret"] - 7.415) < 1e-3
    assert abs(out["baselineRet"] - 7.415) < 1e-3


def test_compute_exits_missing_t2_returns_none(tmp_path, monkeypatch):
    """缺 T+2 → R1 與 baseline 都 None。"""
    t1 = _make_bars([("09:00", 107, 107, 107, 107)])
    (tmp_path / "5555_2026-06-26.json").write_text(json.dumps(t1), encoding="utf-8")
    monkeypatch.setattr(rrs, "CACHE_DIR", str(tmp_path))
    out = rrs.compute_exits_for_trade(
        entry=100.0, code="5555", entry_date="2026-06-26",
        t2_date="2026-06-27"
    )
    assert out["r1Ret"] is None
    assert out["baselineRet"] is None


def test_compute_exits_no_next_next_date_baseline_none(tmp_path, monkeypatch):
    """t2_date=None → baseline 必 None；R1 若 gap 在帶內仍可算。"""
    t1 = _make_bars([("09:00", 103, 103, 103, 103),
                     ("09:15", 104, 104, 104, 104)])
    (tmp_path / "6666_2026-06-26.json").write_text(json.dumps(t1), encoding="utf-8")
    monkeypatch.setattr(rrs, "CACHE_DIR", str(tmp_path))
    out = rrs.compute_exits_for_trade(
        entry=100.0, code="6666", entry_date="2026-06-26",
        t2_date=None
    )
    assert out["baselineRet"] is None
    # R1 gap 3% 走 09:15 → 仍可算
    assert out["r1Rule"] == "T1_0915"
    assert abs(out["r1Ret"] - 3.415) < 1e-3


# ── aggregate_stats ────────────────────────────────────────────
def test_aggregate_stats_basic():
    s = rrs.aggregate_stats([2.0, -1.0, 3.0, -2.0, 1.0])
    assert s["trades"] == 5
    assert s["winRate"] == 60.0
    assert abs(s["meanNet"] - 0.6) < 1e-6
    assert abs(s["totalNet"] - 3.0) < 1e-6


def test_aggregate_stats_empty():
    s = rrs.aggregate_stats([])
    assert s["trades"] == 0
    assert s["winRate"] is None
    assert s["meanNet"] is None
    assert s["totalNet"] == 0


def test_aggregate_stats_drops_none():
    s = rrs.aggregate_stats([1.0, None, 2.0, None])
    assert s["trades"] == 2
    assert s["winRate"] == 100.0


# ── aggregate_monthly ─────────────────────────────────────────
def test_aggregate_monthly_groups_by_yymm():
    trades = [
        {"dEntry": "2026-04-15", "ret": 2.0},
        {"dEntry": "2026-04-20", "ret": -1.0},
        {"dEntry": "2026-05-01", "ret": 3.0},
    ]
    out = rrs.aggregate_monthly(trades)
    assert "2026-04" in out
    assert "2026-05" in out
    assert out["2026-04"]["trades"] == 2
    assert abs(out["2026-04"]["ev"] - 0.5) < 1e-6
    assert out["2026-05"]["trades"] == 1
    assert abs(out["2026-05"]["ev"] - 3.0) < 1e-6


def test_aggregate_monthly_skips_none():
    trades = [
        {"dEntry": "2026-04-15", "ret": 2.0},
        {"dEntry": "2026-04-20", "ret": None},
    ]
    out = rrs.aggregate_monthly(trades)
    assert out["2026-04"]["trades"] == 1
