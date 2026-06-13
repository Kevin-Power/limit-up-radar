"""長期價值選股核心邏輯單元測試（不碰網路）。"""
from datetime import date

from scraper import value_screener as vs


# --- 年度視窗 --------------------------------------------------------------
def test_default_latest_year_after_april():
    assert vs.default_latest_year(date(2026, 6, 7)) == 2025
    assert vs.default_latest_year(date(2026, 4, 1)) == 2025


def test_default_latest_year_before_april():
    assert vs.default_latest_year(date(2026, 2, 15)) == 2024


def test_window_years():
    assert vs.window_years(2025, 5) == [2021, 2022, 2023, 2024, 2025]


# --- extract_annual --------------------------------------------------------
def _fs_row(d, name, val):
    return {"date": d, "origin_name": name, "value": val}


def test_extract_annual_picks_year_end_only():
    rows = [
        _fs_row("2024-03-31", "本期淨利（淨損）", 1.0),   # 季報，應略過
        _fs_row("2024-12-31", "本期淨利（淨損）", 9.0),   # 年底，採用
        _fs_row("2025-12-31", "本期淨利（淨損）", 8.0),
    ]
    out = vs.extract_annual(rows, ["本期淨利（淨損）"])
    assert out == {2024: 9.0, 2025: 8.0}


def test_extract_annual_respects_keyword_priority():
    rows = [
        _fs_row("2025-12-31", "淨利（淨損）歸屬於母公司業主", 7.0),
        _fs_row("2025-12-31", "本期淨利（淨損）", 10.0),
    ]
    # 優先取「歸屬母公司」，不應抓到本期淨利合計
    out = vs.extract_annual(rows, ["淨利（淨損）歸屬於母公司業主", "本期淨利（淨損）"])
    assert out == {2025: 7.0}


def test_extract_annual_falls_back_to_next_keyword():
    rows = [_fs_row("2025-12-31", "本期淨利（淨損）", 10.0)]
    out = vs.extract_annual(rows, ["淨利（淨損）歸屬於母公司業主", "本期淨利（淨損）"])
    assert out == {2025: 10.0}


# --- yearly_pe_high_low ----------------------------------------------------
def test_yearly_pe_high_low_excludes_non_positive():
    rows = [
        {"date": "2024-01-05", "PER": 12.0},
        {"date": "2024-06-20", "PER": 18.0},
        {"date": "2024-09-01", "PER": -3.0},   # 虧損，排除
        {"date": "2025-02-02", "PER": 10.0},
    ]
    out = vs.yearly_pe_high_low(rows)
    assert out[2024] == (12.0, 18.0)
    assert out[2025] == (10.0, 10.0)


# --- compute_roe_series ----------------------------------------------------
def test_compute_roe_uses_average_equity():
    ni = {2025: 200.0}
    eq = {2024: 800.0, 2025: 1200.0}  # 平均 1000
    out = vs.compute_roe_series(ni, eq, use_average_equity=True)
    assert out[2025] == 20.0  # 200/1000*100


def test_compute_roe_end_equity_when_no_prior():
    ni = {2025: 200.0}
    eq = {2025: 1000.0}
    out = vs.compute_roe_series(ni, eq, use_average_equity=True)
    assert out[2025] == 20.0


# --- compute_bvps ----------------------------------------------------------
def test_compute_bvps_par_10():
    eq = {2025: 10_000_000_000.0}     # 100 億
    cap = {2025: 1_000_000_000.0}     # 10 億股本 → 1 億股
    out = vs.compute_bvps(eq, cap, par_value=10.0)
    assert out[2025] == 100.0


# --- reasonable_pe_bands ---------------------------------------------------
def test_reasonable_pe_bands():
    hl = {y: (10.0, 20.0) for y in [2021, 2022, 2023, 2024, 2025]}
    bands = vs.reasonable_pe_bands(hl, [2021, 2022, 2023, 2024, 2025])
    assert bands["pe_low_avg"] == 10.0
    assert bands["pe_high_avg"] == 20.0
    assert bands["reasonable_pe"] == 15.0


# --- check_consecutive -----------------------------------------------------
def test_check_consecutive_missing_year():
    ok, mn, missing = vs.check_consecutive({2021: 20, 2022: 20}, [2021, 2022, 2023], 15)
    assert ok is False and missing == [2023]


def test_check_consecutive_below_threshold():
    ok, mn, missing = vs.check_consecutive({2021: 20, 2022: 14}, [2021, 2022], 15)
    assert ok is False and mn == 14 and missing == []


# --- evaluate_stock：整合 --------------------------------------------------
def _passing_inputs():
    years = [2020, 2021, 2022, 2023, 2024, 2025]
    equity = {y: 10_000_000_000.0 for y in years}        # 100 億，每年相同
    share_cap = {y: 1_000_000_000.0 for y in years}      # → 1 億股，淨值=100
    net_income = {y: 2_000_000_000.0 for y in years[1:]} # 20 億 → ROE 20%
    pe_hl = {y: (10.0, 20.0) for y in [2021, 2022, 2023, 2024, 2025]}
    return equity, share_cap, net_income, pe_hl


def test_evaluate_stock_passes_and_values():
    equity, share_cap, net_income, pe_hl = _passing_inputs()
    r = vs.evaluate_stock(
        stock_code="9999", stock_name="測試", latest_year=2025,
        net_income_parent=net_income, equity_parent=equity,
        ordinary_share_capital=share_cap, pe_high_low=pe_hl,
        current_price=250.0,
    )
    assert r.passed is True
    assert r.avg_roe == 20.0
    assert r.min_roe == 20.0
    assert r.latest_bvps == 100.0
    assert r.reasonable_pe == 15.0
    # 合理價值 = 100 × 0.20 × 15 = 300
    assert round(r.fair_value, 6) == 300.0
    assert round(r.cheap_price, 6) == 200.0       # × 10
    assert round(r.expensive_price, 6) == 400.0   # × 20
    assert round(r.margin_price, 6) == 250.0      # 300 / 1.2
    assert round(r.upside_pct, 6) == 20.0         # 300/250 - 1


def test_evaluate_stock_fails_one_low_roe_year():
    equity, share_cap, net_income, pe_hl = _passing_inputs()
    net_income[2023] = 1_400_000_000.0  # ROE 14% < 15%，仍 >5 億
    r = vs.evaluate_stock(
        stock_code="9999", latest_year=2025,
        net_income_parent=net_income, equity_parent=equity,
        ordinary_share_capital=share_cap, pe_high_low=pe_hl,
    )
    assert r.passed is False
    assert "ROE" in r.note


def test_evaluate_stock_fails_low_net_income():
    equity, share_cap, net_income, pe_hl = _passing_inputs()
    # 把整體權益縮小，使淨利 < 5 億但 ROE 仍 >15%
    small_eq = {y: 2_000_000_000.0 for y in equity}     # 20 億權益
    small_cap = {y: 1_000_000_000.0 for y in share_cap}
    small_ni = {y: 400_000_000.0 for y in net_income}   # 4 億 → ROE 20% 但 <5 億
    r = vs.evaluate_stock(
        stock_code="9999", latest_year=2025,
        net_income_parent=small_ni, equity_parent=small_eq,
        ordinary_share_capital=small_cap, pe_high_low=pe_hl,
    )
    assert r.passed is False
    assert "淨利" in r.note


def test_evaluate_stock_missing_year_fails():
    equity, share_cap, net_income, pe_hl = _passing_inputs()
    del net_income[2021]
    r = vs.evaluate_stock(
        stock_code="9999", latest_year=2025,
        net_income_parent=net_income, equity_parent=equity,
        ordinary_share_capital=share_cap, pe_high_low=pe_hl,
    )
    assert r.passed is False


# --- sort_picks ------------------------------------------------------------
def test_sort_picks_passed_first_then_by_upside():
    a = vs.ScreenResult(stock_code="A", passed=True, upside_pct=5.0, fair_value=1)
    b = vs.ScreenResult(stock_code="B", passed=True, upside_pct=30.0, fair_value=1)
    c = vs.ScreenResult(stock_code="C", passed=False, upside_pct=99.0)
    out = vs.sort_picks([a, b, c])
    assert [r.stock_code for r in out] == ["B", "A", "C"]
