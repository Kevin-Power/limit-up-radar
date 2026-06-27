"""R1 動態出場規則單元測試。

R1 spec（已驗證）：
- gap_pct = (T+1 open / entry_price - 1) * 100
- 0 <= gap_pct < 5  → exit_at = T+1 09:15 close
- gap_pct < 0 或 gap_pct >= 5 → exit_at = T+2 open
- 找不到 T+1 09:15 K → 視為缺資料，回 None
- 找不到 T+2 open → 視為缺資料，回 None
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lib.r1_exit import decide_r1_exit, compute_r1_return  # noqa: E402

OVERNIGHT_COST = 0.585  # 與 backtest_0903 一致

def _bar(t, o=100, h=100, l=100, c=100):
    return {"time": t, "open": o, "high": h, "low": l, "close": c}

# ── decide_r1_exit ──────────────────────────────────────────────
def test_gap_in_band_uses_0915():
    """gap 3% (in 0~5 band) → 用 T+1 09:15"""
    entry = 100.0
    t1_bars = [_bar("09:00", o=103, h=103, l=103, c=103),
               _bar("09:15", o=104, h=104, l=104, c=104)]
    out = decide_r1_exit(entry, t1_bars, t2_open=None)
    assert out["rule"] == "T1_0915"
    assert out["exit_price"] == 104
    assert abs(out["gap_pct"] - 3.0) < 1e-6

def test_gap_negative_uses_t2_open():
    """gap -1% → T+2 開盤"""
    entry = 100.0
    t1_bars = [_bar("09:00", o=99, h=99, l=99, c=99)]
    out = decide_r1_exit(entry, t1_bars, t2_open=101.0)
    assert out["rule"] == "T2_open"
    assert out["exit_price"] == 101.0

def test_gap_over_5_uses_t2_open():
    """gap +7% → T+2 開盤（避免假突破回殺）"""
    entry = 100.0
    t1_bars = [_bar("09:00", o=107, h=107, l=107, c=107)]
    out = decide_r1_exit(entry, t1_bars, t2_open=108.0)
    assert out["rule"] == "T2_open"
    assert out["exit_price"] == 108.0

def test_gap_exactly_5_uses_t2_open():
    """邊界：gap 5.0% 走 T+2（>=5 條件）"""
    entry = 100.0
    t1_bars = [_bar("09:00", o=105, h=105, l=105, c=105)]
    out = decide_r1_exit(entry, t1_bars, t2_open=105.0)
    assert out["rule"] == "T2_open"

def test_gap_exactly_0_uses_0915():
    """邊界：gap 0% 走 09:15（>=0 條件）"""
    entry = 100.0
    t1_bars = [_bar("09:00", o=100, h=100, l=100, c=100),
               _bar("09:15", o=100, h=100, l=100, c=100)]
    out = decide_r1_exit(entry, t1_bars, t2_open=None)
    assert out["rule"] == "T1_0915"

def test_missing_0915_returns_none():
    """T+1 沒有 09:15 那根 K → None"""
    entry = 100.0
    t1_bars = [_bar("09:00", o=103, h=103, l=103, c=103),
               _bar("09:10", o=104, h=104, l=104, c=104)]  # 缺 09:15
    out = decide_r1_exit(entry, t1_bars, t2_open=None)
    assert out is None

def test_missing_t2_open_returns_none():
    """gap < 0 但 T+2 沒資料 → None"""
    entry = 100.0
    t1_bars = [_bar("09:00", o=99, h=99, l=99, c=99)]
    out = decide_r1_exit(entry, t1_bars, t2_open=None)
    assert out is None

def test_empty_t1_returns_none():
    out = decide_r1_exit(100.0, [], t2_open=101.0)
    assert out is None

# ── compute_r1_return ───────────────────────────────────────────
def test_return_subtracts_overnight_cost():
    """淨報酬 = 毛報酬% - 0.585%"""
    r = compute_r1_return(entry=100, exit_price=104)
    assert abs(r - (4.0 - OVERNIGHT_COST)) < 1e-6

def test_return_handles_loss():
    r = compute_r1_return(entry=100, exit_price=99)
    assert abs(r - (-1.0 - OVERNIGHT_COST)) < 1e-6

def test_return_none_when_exit_none():
    r = compute_r1_return(entry=100, exit_price=None)
    assert r is None
