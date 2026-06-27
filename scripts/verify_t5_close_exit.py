"""過擬合驗證：T+1 開盤買 → T+5 收盤賣 (score≥75)

驗證面向：
  1. 樣本大小 vs 已知 274 (T+2 open) 是否合理擴增到 438
  2. 前/後半 split 一致性
  3. 閾值敏感性：score 70/75/80
  4. 持有期敏感性：T+3/T+4/T+5/T+6/T+7 收盤
  5. Bootstrap 1000 次 — EV 與勝率信賴區間

固定使用 _price_month_cache.json（TWSE/TPEx 真實日 OHLC，open/close）
成本：來回 0.38% (2.8 折手續費 0.0399%×2 + 證交稅 0.3%)
"""
import json
import math
import os
import random
import statistics
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_FILE = os.path.join(PROJECT, "data", "_price_month_cache.json")
OUT_FILE = os.path.join(PROJECT, "data", "opt_verify_t5_close.json")

COST_ROUNDTRIP = 0.38   # 2.8折手續費 0.0399%x2 + 賣方證交稅 0.3% ≈ 0.38%
SCORE_THRESHOLDS = [70, 75, 80]
HOLD_DAYS = [3, 4, 5, 6, 7]


def load_price_cache():
    with open(CACHE_FILE, encoding="utf-8") as fp:
        cache = json.load(fp)
    # cache key: "code|YYYYMM" -> {date: {open, close}}
    # 攤平成 code -> {date: {open,close}}
    flat = defaultdict(dict)
    for k, v in cache.items():
        if not v:
            continue
        code = k.split("|")[0]
        for date, ohlc in v.items():
            flat[code][date] = ohlc
    return flat


def trading_days_after(code_prices, start_date, n):
    """從 start_date（不含）起，找該股第 n 個有報價的日期。"""
    candidates = sorted(d for d in code_prices.keys() if d > start_date)
    if len(candidates) >= n:
        return candidates[n - 1]
    return None


def build_trades(days, rev_maps, hw, disp, prices, score_min):
    """每個選股日 i：選 score≥min 的股，T+1 open 進場。"""
    trades = []
    for i in range(len(days) - 1):
        picks = hs.reconstruct_picks(days, i, rev_maps, hw, disp, cap=None)
        picks = [p for p in picks if p["score"] >= score_min]
        if not picks:
            continue
        entry_date = days[i + 1]["date"]
        for p in picks:
            cp = prices.get(p["code"])
            if not cp:
                continue
            entry_ohlc = cp.get(entry_date)
            if not entry_ohlc:
                continue
            trades.append({
                "pickDate": days[i]["date"],
                "entryDate": entry_date,
                "code": p["code"],
                "score": p["score"],
                "entryPrice": entry_ohlc["open"],
                "codePrices": cp,
            })
    return trades


def realize(trade, hold_days, exit_kind="close"):
    """從 entryDate 之後第 hold_days 個交易日的 close 或 open 出場。
    回淨報酬%（含成本）。資料缺則回 None。"""
    cp = trade["codePrices"]
    exit_date = trading_days_after(cp, trade["entryDate"], hold_days)
    if not exit_date:
        # 沒有足夠後續資料 → entryDate 本身那天起算？不，hold_days 起算
        # entryDate 是 T+1 開盤買；T+5 close = entryDate 之後第 4 天 close
        return None
    exit_ohlc = cp.get(exit_date)
    if not exit_ohlc:
        return None
    exit_px = exit_ohlc["close"] if exit_kind == "close" else exit_ohlc["open"]
    gross = (exit_px - trade["entryPrice"]) / trade["entryPrice"] * 100
    return round(gross - COST_ROUNDTRIP, 4)


def aggregate(rets):
    rets = [r for r in rets if r is not None]
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "mean": None, "median": None}
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 2),
        "mean": round(statistics.mean(rets), 3),
        "median": round(statistics.median(rets), 3),
        "total": round(sum(rets), 2),
    }


def bootstrap_ci(rets, n_iter=1000, alpha=0.05):
    """有放回重抽 → 樣本平均的分布 → 信賴區間 + 為正的機率。"""
    rets = [r for r in rets if r is not None]
    if not rets:
        return None
    rng = random.Random(42)
    means = []
    n = len(rets)
    for _ in range(n_iter):
        sample = [rets[rng.randint(0, n - 1)] for _ in range(n)]
        means.append(sum(sample) / n)
    means.sort()
    lo = means[int(n_iter * alpha / 2)]
    hi = means[int(n_iter * (1 - alpha / 2))]
    p_positive = sum(1 for m in means if m > 0) / n_iter
    return {
        "ciLow": round(lo, 3),
        "ciHigh": round(hi, 3),
        "pPositive": round(p_positive, 3),
    }


def half_split_check(trades, hold_days):
    """依 entryDate 排序 → 切半，比較兩半 EV/勝率。"""
    sorted_t = sorted(trades, key=lambda t: (t["entryDate"], t["code"]))
    n = len(sorted_t)
    if n < 20:
        return None
    half = n // 2
    a = [realize(t, hold_days) for t in sorted_t[:half]]
    b = [realize(t, hold_days) for t in sorted_t[half:]]
    return {
        "firstHalf": aggregate(a),
        "secondHalf": aggregate(b),
        "evGap": round((aggregate(b)["mean"] or 0) - (aggregate(a)["mean"] or 0), 3),
    }


def monthly_breakdown(trades, hold_days):
    by_month = defaultdict(list)
    for t in trades:
        m = t["entryDate"][:7]
        r = realize(t, hold_days)
        if r is not None:
            by_month[m].append(r)
    return {m: aggregate(rs) for m, rs in sorted(by_month.items())}


def main():
    os.chdir(PROJECT)
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    prices = load_price_cache()
    print(f"loaded {len(days)} daily files; {len(prices)} stock price series")

    # 主驗證：score≥75 + T+5 close
    trades75 = build_trades(days, rev_maps, hw, disp, prices, score_min=75)
    print(f"score≥75 entry-able trades: {len(trades75)}")

    rets_t5 = [realize(t, 5) for t in trades75]
    main_agg = aggregate(rets_t5)
    main_boot = bootstrap_ci(rets_t5)
    main_half = half_split_check(trades75, 5)
    main_monthly = monthly_breakdown(trades75, 5)
    print(f"score≥75 T+5 close: n={main_agg['n']} mean={main_agg['mean']} "
          f"win={main_agg['winRate']}%")
    print(f"  bootstrap CI: {main_boot}")
    print(f"  half split: {main_half}")
    print(f"  monthly: {main_monthly}")

    # 閾值敏感性
    threshold_sens = {}
    for s in SCORE_THRESHOLDS:
        ts = build_trades(days, rev_maps, hw, disp, prices, score_min=s)
        rets = [realize(t, 5) for t in ts]
        threshold_sens[f"score>={s}"] = aggregate(rets)
        print(f"  score>={s}: {threshold_sens[f'score>={s}']}")

    # 持有期敏感性（固定 score≥75）
    hold_sens = {}
    for h in HOLD_DAYS:
        rets = [realize(t, h) for t in trades75]
        hold_sens[f"T+{h}_close"] = aggregate(rets)
        print(f"  T+{h} close: {hold_sens[f'T+{h}_close']}")

    # 與基線比較：T+2 open (baseline 274/EV+1.87%)
    baseline_rets = [realize(t, 1, exit_kind="open") for t in trades75]
    # T+2 open = entryDate 之後第 1 個交易日的 open
    baseline_agg = aggregate(baseline_rets)
    print(f"  baseline T+2 open (score>=75): {baseline_agg}")

    # ±10% 閾值微調
    micro = {}
    for s in [68, 72, 75, 78, 82]:
        ts = build_trades(days, rev_maps, hw, disp, prices, score_min=s)
        rets = [realize(t, 5) for t in ts]
        micro[f"score>={s}"] = aggregate(rets)

    result = {
        "rule": "score>=75, T+1 open buy, T+5 close sell",
        "claim": {"winRate": 51.2, "ev": 2.83, "n": 438},
        "observed": main_agg,
        "bootstrap": main_boot,
        "halfSplit": main_half,
        "monthly": main_monthly,
        "thresholdSensitivity": threshold_sens,
        "holdDaysSensitivity": hold_sens,
        "microThresholdSweep": micro,
        "baselineT2open_score75": baseline_agg,
        "costRoundtripPct": COST_ROUNDTRIP,
        "note": "用 _price_month_cache 真實日 OHLC；entryDate=T+1，T+5 close = entryDate 之後第 4 個交易日 close",
    }
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(result, fp, ensure_ascii=False, indent=2)
    print(f"saved: {OUT_FILE}")


if __name__ == "__main__":
    main()
