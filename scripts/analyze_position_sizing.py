"""部位配置方案分析 — 探索「每筆都 1 張」之外的方案。

策略基線：score≥75，T+1 開盤競價買進，T+2 開盤賣出。
資料來源：reconstruct_picks + intraday_cache（取 09:00 真實開盤價）。

評估配置法：
  A. baseline_1lot       — 每筆 1 張（既有基準）
  B. equal_amount        — 每筆固定金額（10萬／30萬／50萬）
  C. score_tiered        — 分數加碼：75-79=1x, 80-89=1.5x, 90+=2x
  D. gap_inverse         — gap 小的加碼：gap≤2%=2x, 2-5%=1.5x, >5%=1x
  E. concentration_cap   — 同族群當日 ≤2 檔（保留分數高的）
  F. volatility_inverse  — 個股波動越大部位越小（基底10萬/實際=10萬/std%）

資金情境：1M / 3M / 5M
若資金不夠當天訊號 → 按 score 由高到低排序，逐檔扣費直到資金不足。
"""
from __future__ import annotations

import json
import math
import os
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
os.chdir(ROOT)

import honest_stats as hs   # noqa: E402

DAILY_DIR = ROOT / "data" / "daily"
INTRA_DIR = ROOT / "data" / "intraday_cache"
OUT_FILE = ROOT / "data" / "opt_position_sizing.json"

SCORE_THRESHOLD = 75
LOT_SIZE = 1000
FEE_RATE = 0.001425 * 0.28  # 2.8 折
TAX_RATE = 0.003            # 賣出證交稅
ROUND_TRIP_PCT = (FEE_RATE * 2 + TAX_RATE) * 100  # 0.38% 等價


# ════════════════════════════════════════════════════════════
# 資料載入：選股 + 真實 09:00 開盤價
# ════════════════════════════════════════════════════════════

def load_intraday_open(code: str, date: str) -> float | None:
    """讀 intraday_cache 的 09:00 真實開盤 (取最早一根的 open)。"""
    f = INTRA_DIR / f"{code}_{date}.json"
    if not f.exists():
        return None
    try:
        with open(f, encoding="utf-8") as fp:
            bars = json.load(fp)
        if not bars:
            return None
        # 取最早一根（時間升冪）的 open，作為 T+1 開盤競價買進價
        bars_sorted = sorted(bars, key=lambda b: b["time"])
        return float(bars_sorted[0]["open"])
    except Exception:
        return None


def build_trade_dataset():
    """回 trades=[{pickDate, entryDate, exitDate, code, name, score, group,
                    prevClose, entryPx, exitPx, retPct, sigmaPct}]
    sigmaPct = 進場日的 1 分 K 報酬標準差（%），無資料 → None。
    """
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    heavyweight, known_disposal = hs.load_categories()

    # 建立 code→group 對應（每天的選股都帶族群）
    trades = []
    n_days = len(days)
    for i in range(n_days - 2):    # 需要 i+1 (進場)、i+2 (出場)
        pick_date = days[i]["date"]
        entry_date = days[i + 1]["date"]
        exit_date = days[i + 2]["date"]

        picks_full = hs.reconstruct_picks(days, i, rev_maps, heavyweight,
                                          known_disposal, cap=None)
        picks = [p for p in picks_full if p["score"] >= SCORE_THRESHOLD]
        if not picks:
            continue

        # 補上族群名稱
        code_to_group: dict[str, str] = {}
        for g in days[i]["groups"]:
            for s in g["stocks"]:
                code_to_group.setdefault(s["code"], g["name"])

        for p in picks:
            entry_px = load_intraday_open(p["code"], entry_date)
            exit_px = load_intraday_open(p["code"], exit_date)
            if entry_px is None or exit_px is None:
                continue
            ret_pct = (exit_px - entry_px) / entry_px * 100
            # 進場日的 1 分 K 報酬波動 (%)
            sigma_pct = _intraday_sigma_pct(p["code"], entry_date)
            gap_pct = (entry_px - p["close"]) / p["close"] * 100
            trades.append({
                "pickDate": pick_date,
                "entryDate": entry_date,
                "exitDate": exit_date,
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "group": code_to_group.get(p["code"], ""),
                "prevClose": p["close"],
                "entryPx": entry_px,
                "exitPx": exit_px,
                "gapPct": gap_pct,
                "retPct": ret_pct,
                "sigmaPct": sigma_pct,
            })

    return trades


def _intraday_sigma_pct(code: str, date: str) -> float | None:
    f = INTRA_DIR / f"{code}_{date}.json"
    if not f.exists():
        return None
    try:
        with open(f, encoding="utf-8") as fp:
            bars = json.load(fp)
        if len(bars) < 10:
            return None
        closes = [b["close"] for b in sorted(bars, key=lambda b: b["time"])]
        rets = [(closes[k] - closes[k - 1]) / closes[k - 1] * 100
                for k in range(1, len(closes)) if closes[k - 1] > 0]
        if len(rets) < 5:
            return None
        return statistics.pstdev(rets)
    except Exception:
        return None


# ════════════════════════════════════════════════════════════
# 部位配置策略
# ════════════════════════════════════════════════════════════

def sizing_baseline_1lot(_capital: float, day_trades: list[dict]) -> list[dict]:
    """每筆 1 張，按分數排序，資金不夠就跳過。"""
    sized = []
    cash = _capital
    for t in sorted(day_trades, key=lambda x: -x["score"]):
        cost = t["entryPx"] * LOT_SIZE * (1 + FEE_RATE)
        if cost > cash:
            continue
        cash -= cost
        sized.append({**t, "lots": 1, "investedTWD": cost})
    return sized


def _size_by_target_amount(capital: float, day_trades: list[dict],
                           target_amount_fn) -> list[dict]:
    """target_amount_fn(trade) 回該筆預算金額（TWD），按 score 高→低分配。"""
    sized = []
    cash = capital
    for t in sorted(day_trades, key=lambda x: -x["score"]):
        target = target_amount_fn(t)
        lots = max(1, int(target // (t["entryPx"] * LOT_SIZE)))
        cost = t["entryPx"] * LOT_SIZE * lots * (1 + FEE_RATE)
        if cost > cash:
            # 試最小 1 張
            min_cost = t["entryPx"] * LOT_SIZE * (1 + FEE_RATE)
            if min_cost > cash:
                continue
            lots = 1
            cost = min_cost
        cash -= cost
        sized.append({**t, "lots": lots, "investedTWD": cost})
    return sized


def sizing_equal_amount(capital: float, day_trades: list[dict],
                        target_per_trade: float) -> list[dict]:
    """每筆固定金額目標。"""
    return _size_by_target_amount(capital, day_trades,
                                  lambda t: target_per_trade)


def sizing_score_tiered(capital: float, day_trades: list[dict],
                        base_amount: float) -> list[dict]:
    """分數加碼。"""
    def amt(t):
        s = t["score"]
        if s >= 90:
            return base_amount * 2.0
        if s >= 80:
            return base_amount * 1.5
        return base_amount
    return _size_by_target_amount(capital, day_trades, amt)


def sizing_gap_inverse(capital: float, day_trades: list[dict],
                       base_amount: float) -> list[dict]:
    """gap 小的加碼，避開追高。"""
    def amt(t):
        g = t["gapPct"]
        if g <= 2:
            return base_amount * 2.0
        if g <= 5:
            return base_amount * 1.5
        return base_amount
    return _size_by_target_amount(capital, day_trades, amt)


def sizing_volatility_inverse(capital: float, day_trades: list[dict],
                              base_amount: float) -> list[dict]:
    """波動率反向：base / sigma；無 sigma 用 base。"""
    def amt(t):
        sig = t["sigmaPct"]
        if sig is None or sig <= 0:
            return base_amount
        # 0.3% 標準差視為標準（≈接近大盤級），>1% 是高波動
        return max(base_amount * 0.5, min(base_amount * 2, base_amount * (0.5 / sig)))
    return _size_by_target_amount(capital, day_trades, amt)


def sizing_concentration_cap(capital: float, day_trades: list[dict],
                             base_amount: float, max_per_group: int = 2) -> list[dict]:
    """同族群當日 ≤ max_per_group 檔（保留分數高的）+ 等金額。"""
    sorted_t = sorted(day_trades, key=lambda x: -x["score"])
    group_count: dict[str, int] = {}
    filtered = []
    for t in sorted_t:
        g = t.get("group") or "_"
        if group_count.get(g, 0) >= max_per_group:
            continue
        group_count[g] = group_count.get(g, 0) + 1
        filtered.append(t)
    return _size_by_target_amount(capital, filtered, lambda _t: base_amount)


# ════════════════════════════════════════════════════════════
# 績效計算
# ════════════════════════════════════════════════════════════

def simulate_portfolio(trades: list[dict], sizing_fn, capital: float,
                       **kwargs) -> dict:
    """依日期分組，每天用 sizing_fn 配置部位；T+2 開盤平倉。

    淨損益 = lots*LOT_SIZE*(exitPx-entryPx) - 手續費(雙邊) - 證交稅(賣)
    """
    by_date: dict[str, list[dict]] = {}
    for t in trades:
        by_date.setdefault(t["entryDate"], []).append(t)

    daily_pnl: list[tuple[str, float]] = []
    all_trade_results: list[dict] = []
    invested_history: list[float] = []
    for date in sorted(by_date):
        day = by_date[date]
        sized = sizing_fn(capital, day, **kwargs)
        day_pnl = 0.0
        day_invested = 0.0
        for st in sized:
            shares = st["lots"] * LOT_SIZE
            buy_cost = st["entryPx"] * shares
            sell_gross = st["exitPx"] * shares
            buy_fee = buy_cost * FEE_RATE
            sell_fee = sell_gross * FEE_RATE
            sell_tax = sell_gross * TAX_RATE
            pnl = sell_gross - buy_cost - buy_fee - sell_fee - sell_tax
            day_pnl += pnl
            day_invested += buy_cost + buy_fee
            all_trade_results.append({**st, "pnl": pnl})
        daily_pnl.append((date, day_pnl))
        invested_history.append(day_invested)

    # 績效指標
    pnl_series = [p for _, p in daily_pnl]
    total_pnl = sum(pnl_series)
    n_trades = len(all_trade_results)
    n_days = len(daily_pnl)
    wins = sum(1 for r in all_trade_results if r["pnl"] > 0)
    win_rate = wins / n_trades * 100 if n_trades else 0

    # 權益曲線（從 capital 起）
    equity = [capital]
    for _, p in daily_pnl:
        equity.append(equity[-1] + p)
    peak = capital
    mdd_twd = 0.0
    mdd_pct = 0.0
    for e in equity:
        peak = max(peak, e)
        dd = peak - e
        mdd_twd = max(mdd_twd, dd)
        mdd_pct = max(mdd_pct, dd / peak * 100 if peak > 0 else 0)

    # 年化（42 天樣本，假設 252 交易日）
    final_equity = equity[-1]
    total_return = (final_equity / capital - 1) if capital > 0 else 0
    if n_days > 0:
        annualized = (final_equity / capital) ** (252 / n_days) - 1
    else:
        annualized = 0

    # Sharpe：日報酬序列
    daily_ret_pct = [(p / capital) * 100 for p in pnl_series]
    if len(daily_ret_pct) > 1:
        mean = statistics.mean(daily_ret_pct)
        sd = statistics.pstdev(daily_ret_pct)
        sharpe = (mean / sd * math.sqrt(252)) if sd > 0 else None
    else:
        sharpe = None

    # 平均資金利用率
    avg_invested = statistics.mean(invested_history) if invested_history else 0
    util_pct = avg_invested / capital * 100 if capital > 0 else 0

    return {
        "capital": capital,
        "trades": n_trades,
        "tradingDays": n_days,
        "totalPnL_TWD": round(total_pnl, 0),
        "totalReturnPct": round(total_return * 100, 2),
        "annualizedPct": round(annualized * 100, 2),
        "winRatePct": round(win_rate, 1),
        "mdd_TWD": round(mdd_twd, 0),
        "mdd_pct": round(mdd_pct, 2),
        "sharpe": round(sharpe, 2) if sharpe is not None else None,
        "avgInvestedTWD": round(avg_invested, 0),
        "capitalUtilizationPct": round(util_pct, 1),
        "finalEquity_TWD": round(final_equity, 0),
    }


# ════════════════════════════════════════════════════════════
# 主流程
# ════════════════════════════════════════════════════════════

def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print(f"[1/3] 建立 trade dataset (score>={SCORE_THRESHOLD})...")
    trades = build_trade_dataset()
    print(f"  共 {len(trades)} 筆有效交易"
          f"（橫跨 {len({t['entryDate'] for t in trades})} 個進場日）")

    # 基線統計（每筆 1 張，不限資金）
    raw_rets = [t["retPct"] - ROUND_TRIP_PCT for t in trades]
    base_wins = sum(1 for r in raw_rets if r > 0)
    print(f"  基線(無資金限制): {len(trades)}筆 勝率{base_wins/len(trades)*100:.1f}% "
          f"EV{statistics.mean(raw_rets):+.2f}%")

    # 各配置法 × 資金情境
    capitals = [1_000_000, 3_000_000, 5_000_000]
    configs = []

    print("\n[2/3] 跑各配置法 × 資金情境...")
    # 每筆 1 張
    for cap in capitals:
        configs.append({
            "name": "baseline_1lot",
            "label": "每筆 1 張",
            "capital": cap,
            "result": simulate_portfolio(trades, sizing_baseline_1lot, cap),
        })

    # 等金額（base = capital / 預期當日訊號數 ~ 6-7 檔 → 取 capital/10）
    for cap in capitals:
        target = cap / 10  # 預留十筆部位
        configs.append({
            "name": "equal_amount",
            "label": f"等金額 {target/10000:.0f}萬/筆",
            "capital": cap,
            "result": simulate_portfolio(trades, sizing_equal_amount, cap,
                                         target_per_trade=target),
        })

    # 分數加碼
    for cap in capitals:
        base = cap / 12   # 高分加碼後總曝險 ~ capital
        configs.append({
            "name": "score_tiered",
            "label": f"分數加碼 base={base/10000:.0f}萬",
            "capital": cap,
            "result": simulate_portfolio(trades, sizing_score_tiered, cap,
                                         base_amount=base),
        })

    # gap 反向
    for cap in capitals:
        base = cap / 12
        configs.append({
            "name": "gap_inverse",
            "label": f"gap 反向 base={base/10000:.0f}萬",
            "capital": cap,
            "result": simulate_portfolio(trades, sizing_gap_inverse, cap,
                                         base_amount=base),
        })

    # 波動率反向
    for cap in capitals:
        base = cap / 10
        configs.append({
            "name": "volatility_inverse",
            "label": f"波動反向 base={base/10000:.0f}萬",
            "capital": cap,
            "result": simulate_portfolio(trades, sizing_volatility_inverse, cap,
                                         base_amount=base),
        })

    # 族群集中度限制（+等金額）
    for cap in capitals:
        base = cap / 8    # 篩掉後預期 5-6 檔
        configs.append({
            "name": "concentration_cap_2",
            "label": f"族群≤2 等金額 {base/10000:.0f}萬",
            "capital": cap,
            "result": simulate_portfolio(trades, sizing_concentration_cap, cap,
                                         base_amount=base, max_per_group=2),
        })

    # 找各資金情境下最佳配置（依年化）
    print("\n[3/3] 結果摘要：")
    best_per_cap = {}
    for cap in capitals:
        cap_configs = [c for c in configs if c["capital"] == cap]
        cap_configs.sort(key=lambda c: -c["result"]["totalPnL_TWD"])
        best_per_cap[cap] = cap_configs[0]
        print(f"\n=== 資金 {cap/10000:.0f} 萬 ===")
        baseline_pnl = next(c["result"]["totalPnL_TWD"]
                            for c in cap_configs if c["name"] == "baseline_1lot")
        for c in cap_configs:
            r = c["result"]
            delta = r["totalPnL_TWD"] - baseline_pnl
            print(f"  {c['label']:30s} 損益 {r['totalPnL_TWD']:>+12,.0f} "
                  f"(Δ{delta:>+11,.0f}) 年化 {r['annualizedPct']:>+7.1f}% "
                  f"MDD {r['mdd_pct']:>5.1f}% Sharpe {r['sharpe']} "
                  f"利用率 {r['capitalUtilizationPct']:.0f}%")

    # 推薦
    recommendation = max(configs, key=lambda c: c["result"]["totalPnL_TWD"])
    print(f"\n[最佳] {recommendation['label']} @ {recommendation['capital']/10000:.0f}萬: "
          f"總損益 {recommendation['result']['totalPnL_TWD']:+,.0f}")

    out = {
        "dimension": "部位配置 (position sizing)",
        "tradeUniverse": {
            "scoreThreshold": SCORE_THRESHOLD,
            "totalTrades": len(trades),
            "entryDays": len({t["entryDate"] for t in trades}),
            "baselineEV_pct": round(statistics.mean(raw_rets), 3),
            "baselineWinRate": round(base_wins / len(trades) * 100, 1),
        },
        "costModel": {
            "feeRate": FEE_RATE,
            "taxRate": TAX_RATE,
            "roundTripPct": round(ROUND_TRIP_PCT, 3),
        },
        "configs": configs,
        "bestPerCapital": {
            str(cap): {"name": best_per_cap[cap]["name"],
                       "label": best_per_cap[cap]["label"],
                       "result": best_per_cap[cap]["result"]}
            for cap in capitals
        },
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=2)
    print(f"\nsaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
