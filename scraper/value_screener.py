"""長期價值選股 — 核心計算邏輯（純函式，不碰網路）。

對應使用者的存股規則：
  1. 連續 5 年 ROE > 15%
  2. 連續 5 年稅後淨利（歸屬母公司）> 5 億
  3. 最合理價值 = 最新年度每股淨值 × 五年平均ROE × 最合理本益比
        - 最新年度每股淨值：取「最新一個完整年度」（非最近一季）
        - 最合理ROE：過去五年平均
        - 最合理本益比：過去五年「每年最高本益比的平均」與「每年最低本益比的平均」再取平均
  4. 安全邊際價 = 合理價值 / 1.2
  5~7（慢慢買、參考股利、+20% 停利、不設停損）屬操作面，於報表呈現參考欄位。

所有 ROE 以「百分比」表示（例：20.5 代表 20.5%）。
金額以「元」為單位（5 億 = 500_000_000）。

資料來源無關：本模組只吃已正規化好的 dict，方便單元測試與替換資料源。
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date
from typing import Iterable, Optional


# ---------------------------------------------------------------------------
# 年度視窗
# ---------------------------------------------------------------------------
def default_latest_year(today: Optional[date] = None) -> int:
    """回傳「最新一個可用的完整年度」。

    台股年報（年度財報）依規定於隔年 3/31 前公布完畢。因此：
      - 4 月（含）之後 → 最新完整年度 = 去年
      - 1~3 月          → 最新完整年度 = 前年
    例：2026/6 → 2025；2026/2 → 2024。
    """
    today = today or date.today()
    return today.year - 1 if today.month >= 4 else today.year - 2


def window_years(latest_year: int, n: int = 5) -> list[int]:
    """以 latest_year 結尾、長度 n 的連續年度（由舊到新）。"""
    return list(range(latest_year - n + 1, latest_year + 1))


# ---------------------------------------------------------------------------
# 從 FinMind 風格的 (date, type, value, origin_name) 列表萃取年度數值
# ---------------------------------------------------------------------------
def _year_of(d: str) -> Optional[int]:
    try:
        return int(str(d)[:4])
    except (ValueError, TypeError):
        return None


def extract_annual(
    rows: Iterable[dict],
    origin_name_keywords: list[str],
    *,
    date_key: str = "date",
    name_key: str = "origin_name",
    value_key: str = "value",
    year_end_only: bool = True,
) -> dict[int, float]:
    """從財報列萃取「年度值」。

    FinMind 的損益表 / 資產負債表每一列形如：
        {"date": "2025-12-31", "stock_id": "2330",
         "type": "...", "value": 123.0, "origin_name": "淨利（淨損）..."}

    依 ``origin_name_keywords`` 的優先順序，挑出「第一個有資料的會計科目」，
    再取其年底（YYYY-12-31）數值，回傳 {年: 值}。

    用關鍵字比對中文 origin_name（FinMind 的中文科目名相對穩定），
    比硬編英文 type 代碼更耐改版。
    """
    rows = list(rows)
    for kw in origin_name_keywords:
        picked: dict[int, float] = {}
        for r in rows:
            name = str(r.get(name_key, ""))
            if kw not in name:
                continue
            d = str(r.get(date_key, ""))
            if year_end_only and not d.endswith("-12-31"):
                continue
            yr = _year_of(d)
            if yr is None:
                continue
            try:
                picked[yr] = float(r.get(value_key))
            except (TypeError, ValueError):
                continue
        if picked:
            return picked
    return {}


def yearly_pe_high_low(
    per_rows: Iterable[dict],
    *,
    date_key: str = "date",
    per_key: str = "PER",
) -> dict[int, tuple[float, float]]:
    """從每日本益比列算出「每年的 (最低PE, 最高PE)」。

    只採計 PER > 0 的交易日（虧損年度 PER 會是負值或 0，須排除）。
    回傳 {年: (min_pe, max_pe)}。
    """
    buckets: dict[int, list[float]] = {}
    for r in per_rows:
        yr = _year_of(str(r.get(date_key, "")))
        if yr is None:
            continue
        try:
            pe = float(r.get(per_key))
        except (TypeError, ValueError):
            continue
        if pe <= 0:
            continue
        buckets.setdefault(yr, []).append(pe)
    return {yr: (min(v), max(v)) for yr, v in buckets.items() if v}


# ---------------------------------------------------------------------------
# 衍生指標
# ---------------------------------------------------------------------------
def compute_roe_series(
    net_income_parent: dict[int, float],
    equity_parent: dict[int, float],
    *,
    use_average_equity: bool = True,
) -> dict[int, float]:
    """逐年 ROE(%) = 歸屬母公司淨利 / 母公司權益。

    use_average_equity=True 時，分母用 (期初+期末)/2（需有前一年期末權益），
    否則用期末權益。回傳 {年: ROE百分比}。
    """
    roe: dict[int, float] = {}
    for yr, ni in net_income_parent.items():
        end_eq = equity_parent.get(yr)
        if not end_eq:
            continue
        begin_eq = equity_parent.get(yr - 1)
        if use_average_equity and begin_eq:
            denom = (begin_eq + end_eq) / 2
        else:
            denom = end_eq
        if denom and denom > 0:
            roe[yr] = ni / denom * 100
    return roe


def compute_bvps(
    equity_parent: dict[int, float],
    ordinary_share_capital: dict[int, float],
    *,
    par_value: float = 10.0,
) -> dict[int, float]:
    """逐年每股淨值 = 母公司權益 / 在外流通股數。

    股數 = 普通股股本 / 面額（台股面額多為 10 元；少數非 10 元需自行調整）。
    回傳 {年: 每股淨值}。
    """
    bvps: dict[int, float] = {}
    for yr, eq in equity_parent.items():
        cap = ordinary_share_capital.get(yr)
        if not cap or cap <= 0:
            continue
        shares = cap / par_value
        if shares > 0:
            bvps[yr] = eq / shares
    return bvps


def reasonable_pe_bands(
    pe_high_low: dict[int, tuple[float, float]],
    years: list[int],
) -> Optional[dict[str, float]]:
    """近 N 年「最高PE平均 / 最低PE平均 / 最合理PE」。

    最合理本益比 = (最高PE平均 + 最低PE平均) / 2。
    需要 years 中至少有一年有 PE 資料；回傳 None 表示無法計算。
    """
    lows = [pe_high_low[y][0] for y in years if y in pe_high_low]
    highs = [pe_high_low[y][1] for y in years if y in pe_high_low]
    if not lows or not highs:
        return None
    low_avg = sum(lows) / len(lows)
    high_avg = sum(highs) / len(highs)
    return {
        "pe_low_avg": low_avg,
        "pe_high_avg": high_avg,
        "reasonable_pe": (low_avg + high_avg) / 2,
        "years_counted": len(lows),
    }


# ---------------------------------------------------------------------------
# 條件判斷 + 估值
# ---------------------------------------------------------------------------
@dataclass
class ScreenResult:
    stock_code: str
    stock_name: str = ""
    industry: str = ""
    latest_year: int = 0
    passed: bool = False
    note: str = ""

    avg_roe: Optional[float] = None
    min_roe: Optional[float] = None
    min_net_income: Optional[float] = None
    latest_bvps: Optional[float] = None

    pe_low_avg: Optional[float] = None
    pe_high_avg: Optional[float] = None
    reasonable_pe: Optional[float] = None

    cheap_price: Optional[float] = None
    fair_value: Optional[float] = None
    expensive_price: Optional[float] = None
    margin_price: Optional[float] = None

    current_price: Optional[float] = None
    upside_pct: Optional[float] = None
    dividend_yield: Optional[float] = None

    roe_by_year: dict = field(default_factory=dict)
    net_income_by_year: dict = field(default_factory=dict)

    def to_row(self) -> dict:
        return asdict(self)


def check_consecutive(
    series: dict[int, float],
    years: list[int],
    threshold: float,
) -> tuple[bool, Optional[float], list[int]]:
    """檢查 years 每一年都有資料且 > threshold。

    回傳 (是否全部通過, 區間內最小值, 缺資料的年度清單)。
    """
    missing = [y for y in years if y not in series]
    if missing:
        return False, None, missing
    vals = [series[y] for y in years]
    return all(v > threshold for v in vals), min(vals), []


def evaluate_stock(
    *,
    stock_code: str,
    latest_year: int,
    net_income_parent: dict[int, float],
    equity_parent: dict[int, float],
    ordinary_share_capital: dict[int, float],
    pe_high_low: dict[int, tuple[float, float]],
    stock_name: str = "",
    industry: str = "",
    current_price: Optional[float] = None,
    dividend_yield: Optional[float] = None,
    years: int = 5,
    roe_min: float = 15.0,
    net_income_min: float = 500_000_000.0,
    par_value: float = 10.0,
    use_average_equity: bool = True,
) -> ScreenResult:
    """套用全部規則，回傳單檔結果（含估值，無論是否通過硬性條件）。"""
    yrs = window_years(latest_year, years)
    res = ScreenResult(
        stock_code=stock_code,
        stock_name=stock_name,
        industry=industry,
        latest_year=latest_year,
        current_price=current_price,
        dividend_yield=dividend_yield,
    )

    roe_series = compute_roe_series(
        net_income_parent, equity_parent, use_average_equity=use_average_equity
    )
    bvps_series = compute_bvps(
        equity_parent, ordinary_share_capital, par_value=par_value
    )
    res.roe_by_year = {y: roe_series[y] for y in yrs if y in roe_series}
    res.net_income_by_year = {y: net_income_parent[y] for y in yrs if y in net_income_parent}

    # 條件 1：連續 5 年 ROE > 15%
    roe_ok, min_roe, roe_missing = check_consecutive(roe_series, yrs, roe_min)
    res.min_roe = min_roe
    if roe_series:
        present = [roe_series[y] for y in yrs if y in roe_series]
        res.avg_roe = sum(present) / len(present) if present else None

    # 條件 2：連續 5 年稅後淨利 > 5 億
    ni_ok, min_ni, ni_missing = check_consecutive(net_income_parent, yrs, net_income_min)
    res.min_net_income = min_ni

    # 最新年度每股淨值
    res.latest_bvps = bvps_series.get(latest_year)

    # 最合理本益比
    bands = reasonable_pe_bands(pe_high_low, yrs)
    if bands:
        res.pe_low_avg = bands["pe_low_avg"]
        res.pe_high_avg = bands["pe_high_avg"]
        res.reasonable_pe = bands["reasonable_pe"]

    # 估值：合理價值 = 淨值 × 平均ROE(小數) × 最合理本益比
    if res.latest_bvps and res.avg_roe and bands:
        roe_dec = res.avg_roe / 100.0
        base = res.latest_bvps * roe_dec  # ≈ 常態化 EPS
        res.cheap_price = base * bands["pe_low_avg"]
        res.fair_value = base * bands["reasonable_pe"]
        res.expensive_price = base * bands["pe_high_avg"]
        res.margin_price = res.fair_value / 1.2
        if current_price and current_price > 0:
            res.upside_pct = (res.fair_value / current_price - 1) * 100

    # 硬性條件總結
    problems = []
    if roe_missing:
        problems.append(f"ROE缺{years}年中的:{roe_missing}")
    elif not roe_ok:
        problems.append(f"ROE未連續>{roe_min}%(最低{min_roe:.1f}%)")
    if ni_missing:
        problems.append(f"淨利缺{years}年中的:{ni_missing}")
    elif not ni_ok:
        problems.append(f"淨利未連續>{net_income_min/1e8:.0f}億(最低{min_ni/1e8:.2f}億)")
    if not res.latest_bvps:
        problems.append(f"缺{latest_year}年淨值")
    if not bands:
        problems.append("缺本益比資料")

    res.passed = (roe_ok and ni_ok and res.fair_value is not None)
    res.note = "符合" if res.passed else "；".join(problems)
    return res


def sort_picks(results: list[ScreenResult]) -> list[ScreenResult]:
    """通過者排前面，並依「現價相對合理價的折價幅度」由高到低排序。"""
    def key(r: ScreenResult):
        up = r.upside_pct if r.upside_pct is not None else -1e9
        return (0 if r.passed else 1, -up)
    return sorted(results, key=key)
