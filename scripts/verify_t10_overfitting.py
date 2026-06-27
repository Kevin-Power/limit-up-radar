"""過擬合驗證：T+10 收盤出場規則

對 opt_exit_timing.json 中聲稱的 T+10_close 規則做穩健性測試：
1. 重抽（bootstrap）100 次，看勝率與 EV 信賴區間
2. 時間切半（前/後段比較）
3. 月度切分
4. 與 T+5、T+7、T+9、T+11 相鄰持有期比較（規則小幅調整）
5. 樣本完整度檢查（資料邊界效應）
"""
import json
import math
import os
import random
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from run_backtest_0903 import build_pick_days

CACHE_DIR = os.path.join("data", "intraday_cache")
DAILY_DIR = os.path.join("data", "daily")
COST_PCT = 0.0399 * 2 + 0.30  # 0.3798
SCORE_MIN = 75
PRICE_CACHE_FILE = "data/_price_month_cache.json"
OUT_FILE = "data/verify_t10_overfitting.json"


def load_price_cache():
    try:
        with open(PRICE_CACHE_FILE, encoding="utf-8") as f:
            return {k: v for k, v in json.load(f).items() if v}
    except Exception:
        return {}


def load_bars(code, date, bars_cache):
    if (code, date) in bars_cache:
        return bars_cache[(code, date)]
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            bars = json.load(f)
        bars_cache[(code, date)] = bars if bars else None
    except Exception:
        bars_cache[(code, date)] = None
    return bars_cache[(code, date)]


def build_daily_close_map():
    m = {}
    for f in sorted(os.listdir(DAILY_DIR)):
        if not f.endswith(".json"):
            continue
        date = f[:-5]
        with open(os.path.join(DAILY_DIR, f), encoding="utf-8") as fp:
            d = json.load(fp)
        for g in d.get("groups", []):
            for s in g.get("stocks", []):
                m[(s["code"], date)] = s["close"]
    return m


def get_price(code, date, side, bars_cache, price_cache, daily_close_map):
    if date is None:
        return None
    bars = load_bars(code, date, bars_cache)
    if bars:
        return bars[0]["open"] if side == "open" else bars[-1]["close"]
    yyyymm = date[:7].replace("-", "")
    key = f"{code}|{yyyymm}"
    if key in price_cache and price_cache[key]:
        md = price_cache[key]
        if date in md:
            return md[date][side]
    if side == "close" and (code, date) in daily_close_map:
        return daily_close_map[(code, date)]
    return None


def get_trading_dates(daily_dates, base_date, offset):
    try:
        idx = daily_dates.index(base_date)
    except ValueError:
        return None
    target = idx + offset
    if target < 0 or target >= len(daily_dates):
        return None
    return daily_dates[target]


def net_ret(entry, exit_price):
    if entry is None or exit_price is None or entry <= 0:
        return None
    return (exit_price - entry) / entry * 100 - COST_PCT


def quick_stats(rets):
    rets = [r for r in rets if r is not None]
    n = len(rets)
    if n == 0:
        return {"n": 0}
    wins = sum(1 for r in rets if r > 0)
    mean = statistics.mean(rets)
    sd = statistics.stdev(rets) if n > 1 else 0
    return {
        "n": n,
        "winRate": round(wins / n * 100, 2),
        "meanNet": round(mean, 3),
        "medianNet": round(statistics.median(rets), 3),
        "sd": round(sd, 3),
        "totalNet": round(sum(rets), 2),
        "minRet": round(min(rets), 2),
        "maxRet": round(max(rets), 2),
    }


def bootstrap_mean_ci(rets, n_boot=1000, conf=0.95):
    rets = [r for r in rets if r is not None]
    n = len(rets)
    if n < 10:
        return None
    rng = random.Random(42)
    means = []
    wins = []
    for _ in range(n_boot):
        sample = [rets[rng.randrange(n)] for _ in range(n)]
        means.append(statistics.mean(sample))
        wins.append(sum(1 for r in sample if r > 0) / n * 100)
    means.sort()
    wins.sort()
    lo_idx = int(n_boot * (1 - conf) / 2)
    hi_idx = int(n_boot * (1 + conf) / 2) - 1
    return {
        "mean_lo": round(means[lo_idx], 3),
        "mean_hi": round(means[hi_idx], 3),
        "mean_median": round(means[n_boot // 2], 3),
        "win_lo": round(wins[lo_idx], 2),
        "win_hi": round(wins[hi_idx], 2),
        "n_boot": n_boot,
        "pct_negative_mean": round(sum(1 for m in means if m <= 0) / n_boot * 100, 2),
    }


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("載入 daily / 營收 / 分類 ...")
    days = hs.load_daily_files()
    daily_dates = [d["date"] for d in days]
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()

    print("建構選股 pick_days ...")
    pick_days = build_pick_days(days, rev_maps, hw, disp)
    daily_close_map = build_daily_close_map()
    bars_cache = {}
    price_cache = load_price_cache()
    print(f"price_cache 已有 {len(price_cache)} 個 month-pairs")

    # 收集所有 trade（含多種持有期）
    holds = [2, 3, 5, 7, 9, 10, 11, 12, 15]
    trades = []  # list of dict: {entryDate, code, score, entry, exits:{hold:price}}

    for d in pick_days:
        entry_date = d["entryDate"]
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            code = p["code"]
            entry = get_price(code, entry_date, "open",
                              bars_cache, price_cache, daily_close_map)
            if entry is None:
                continue
            exits = {}
            for h in holds:
                # h-day hold = exit at T+(h-1) since entryDate is T+1
                # but historically T+N_close = entry at T+1, sell at T+N close
                # so for T+10_close: exit_date = entryDate + (10-1) trading days
                exit_date = get_trading_dates(daily_dates, entry_date, h - 1)
                price = get_price(code, exit_date, "close",
                                  bars_cache, price_cache, daily_close_map)
                exits[h] = price
            trades.append({
                "pickDate": d["pickDate"],
                "entryDate": entry_date,
                "code": code,
                "name": p["name"],
                "score": p["score"],
                "entry": entry,
                "exits": exits,
            })

    print(f"\n總 trade 數: {len(trades)}")
    n_total = len(trades)

    # 計算各 hold 的 returns
    rets_by_hold = {h: [] for h in holds}
    for t in trades:
        for h in holds:
            rets_by_hold[h].append(net_ret(t["entry"], t["exits"][h]))

    # ── 1. 相鄰持有期比較（穩健性：閾值±10%）─────────────
    print("\n=== 1. 相鄰持有期穩健性（T+10 ±幾日）===")
    adjacent = {}
    for h in holds:
        stats_h = quick_stats(rets_by_hold[h])
        adjacent[f"T+{h}_close"] = stats_h
        if stats_h.get("n"):
            print(f"T+{h:<2}: n={stats_h['n']:<4} 勝率={stats_h['winRate']:>5}% "
                  f"EV={stats_h['meanNet']:>+6.2f}% 中位={stats_h['medianNet']:>+6.2f}% "
                  f"總={stats_h['totalNet']:>+7.1f}%")

    # ── 2. 時間切半（前後半比較）─────────────────────────────
    print("\n=== 2. 時間切半（前/後半 T+10）===")
    # 依 entryDate 排序所有 trades
    t10_data = [(t["entryDate"], net_ret(t["entry"], t["exits"][10])) for t in trades]
    t10_data = [(d, r) for d, r in t10_data if r is not None]
    t10_data.sort()
    n_t10 = len(t10_data)
    half = n_t10 // 2
    first_half = [r for _, r in t10_data[:half]]
    second_half = [r for _, r in t10_data[half:]]
    fh_stats = quick_stats(first_half)
    sh_stats = quick_stats(second_half)
    time_split = {
        "first_half": {**fh_stats,
                       "dateRange": [t10_data[0][0], t10_data[half - 1][0]] if half > 0 else None},
        "second_half": {**sh_stats,
                        "dateRange": [t10_data[half][0], t10_data[-1][0]] if half < n_t10 else None},
    }
    print(f"前半 (n={fh_stats['n']}, {time_split['first_half']['dateRange']}): "
          f"勝率={fh_stats['winRate']}% EV={fh_stats['meanNet']:+.2f}%")
    print(f"後半 (n={sh_stats['n']}, {time_split['second_half']['dateRange']}): "
          f"勝率={sh_stats['winRate']}% EV={sh_stats['meanNet']:+.2f}%")

    # ── 3. 月度切分 ───────────────────────────────────────────
    print("\n=== 3. 月度 T+10 表現 ===")
    monthly = {}
    by_month = {}
    for t in trades:
        m = t["entryDate"][:7]
        r = net_ret(t["entry"], t["exits"][10])
        if r is None:
            continue
        by_month.setdefault(m, []).append(r)
    for m in sorted(by_month):
        s = quick_stats(by_month[m])
        monthly[m] = s
        print(f"  {m}: n={s['n']:<4} 勝率={s['winRate']:>5}% EV={s['meanNet']:>+6.2f}% 總={s['totalNet']:>+7.1f}%")

    # ── 4. Bootstrap 1000 次 ─────────────────────────────────
    print("\n=== 4. Bootstrap 1000 次（T+10）===")
    boot = bootstrap_mean_ci([r for _, r in t10_data], n_boot=1000)
    print(f"  EV 95% CI: [{boot['mean_lo']:+.2f}%, {boot['mean_hi']:+.2f}%]")
    print(f"  勝率 95% CI: [{boot['win_lo']}%, {boot['win_hi']}%]")
    print(f"  Bootstrap 中位 EV: {boot['mean_median']:+.2f}%")
    print(f"  P(EV <= 0): {boot['pct_negative_mean']}%")

    # ── 5. 對 T+5 / T+7 / T+9 / T+11 / T+12 各 bootstrap ────
    print("\n=== 5. 相鄰 hold 的 Bootstrap（穩健嗎？）===")
    boot_by_hold = {}
    for h in [5, 7, 9, 10, 11, 12]:
        rets_h = [r for r in rets_by_hold[h] if r is not None]
        if len(rets_h) < 30:
            continue
        b = bootstrap_mean_ci(rets_h, n_boot=500)
        boot_by_hold[f"T+{h}_close"] = b
        print(f"  T+{h:<2}: EV CI=[{b['mean_lo']:+.2f}%, {b['mean_hi']:+.2f}%]  "
              f"P(EV≤0)={b['pct_negative_mean']}%")

    # ── 6. 樣本完整度（資料邊界效應）─────────────────────────
    # T+10 需要 entryDate 後第 10 個交易日，越接近資料尾巴越缺資料
    print("\n=== 6. 資料邊界效應 ===")
    last_date = daily_dates[-1]
    t10_required_buffer = 10  # 需要 entry + 10 個交易日
    # entryDate 在 daily_dates 中的索引
    coverage_check = {"with_t10": 0, "missing_t10": 0, "tail_skewed": 0}
    eligible_n = 0
    for t in trades:
        try:
            idx = daily_dates.index(t["entryDate"])
        except ValueError:
            continue
        eligible_n += 1
        future_days_left = len(daily_dates) - 1 - idx
        if future_days_left >= 10:
            coverage_check["with_t10"] += 1
            if t["exits"][10] is None:
                coverage_check["tail_skewed"] += 1  # 該有但沒有 (intraday/月線缺)
        else:
            coverage_check["missing_t10"] += 1
    print(f"  總 trade: {eligible_n}")
    print(f"  有足夠未來日 (≥10): {coverage_check['with_t10']}")
    print(f"  未來日不足 (邊界，無 T+10): {coverage_check['missing_t10']}")
    print(f"  該有但價格缺漏: {coverage_check['tail_skewed']}")

    # ── 7. 「中位 vs 平均」分析 — 看是否被少數大贏家拉抬 ───
    print("\n=== 7. T+10 報酬分佈（mean vs median 偏離）===")
    t10_rets = [r for _, r in t10_data]
    t10_sorted = sorted(t10_rets)
    n_t10s = len(t10_sorted)
    distribution = {
        "n": n_t10s,
        "mean": round(statistics.mean(t10_sorted), 3),
        "median": round(statistics.median(t10_sorted), 3),
        "p10": round(t10_sorted[int(n_t10s * 0.1)], 3),
        "p25": round(t10_sorted[int(n_t10s * 0.25)], 3),
        "p75": round(t10_sorted[int(n_t10s * 0.75)], 3),
        "p90": round(t10_sorted[int(n_t10s * 0.9)], 3),
        "p95": round(t10_sorted[int(n_t10s * 0.95)], 3),
        "max": round(t10_sorted[-1], 3),
        "min": round(t10_sorted[0], 3),
        "top5_contribution_pct": round(sum(t10_sorted[-5:]) / sum(t10_sorted) * 100, 2) if sum(t10_sorted) != 0 else None,
        "top10_contribution_pct": round(sum(t10_sorted[-10:]) / sum(t10_sorted) * 100, 2) if sum(t10_sorted) != 0 else None,
    }
    for k, v in distribution.items():
        print(f"  {k}: {v}")

    # ── 8. 與 T+2 同樣本對比（公平度檢查）───────────────────
    print("\n=== 8. 同樣本 T+2 vs T+10 ===")
    same_idx = [i for i, t in enumerate(trades)
                if net_ret(t["entry"], t["exits"][2]) is not None
                and net_ret(t["entry"], t["exits"][10]) is not None]
    t2_ss = [net_ret(trades[i]["entry"], trades[i]["exits"][2]) for i in same_idx]
    t10_ss = [net_ret(trades[i]["entry"], trades[i]["exits"][10]) for i in same_idx]
    ss_compare = {
        "n": len(same_idx),
        "T+2": quick_stats(t2_ss),
        "T+10": quick_stats(t10_ss),
    }
    print(f"  同樣本 n={len(same_idx)}")
    print(f"  T+2:  勝率={ss_compare['T+2']['winRate']}% EV={ss_compare['T+2']['meanNet']:+.2f}%")
    print(f"  T+10: 勝率={ss_compare['T+10']['winRate']}% EV={ss_compare['T+10']['meanNet']:+.2f}%")

    output = {
        "rule_under_test": "T+10_close (持有10交易日後賣出)",
        "n_trades_total": n_total,
        "adjacent_holds": adjacent,
        "time_split_t10": time_split,
        "monthly_t10": monthly,
        "bootstrap_t10": boot,
        "bootstrap_adjacent": boot_by_hold,
        "data_boundary": coverage_check,
        "t10_distribution": distribution,
        "same_sample_t2_vs_t10": ss_compare,
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\nsaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
