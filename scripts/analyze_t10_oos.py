"""T+10 收盤出場規則的「樣本外」驗證。

聲稱：score≥75 + T+1 開盤買 + T+10 收盤賣 → 勝率 49.4%、EV 3.85%、n=438
目標：驗證這個規則是否「樣本外」依然成立。

驗證方法：
  1. 訓練段 = 前 70% 進場日，測試段 = 後 30%（依進場日切）
  2. 比較訓練 vs 測試的勝率、EV、Sharpe
  3. 對比 T+2 開盤（基線）在兩段的表現
  4. 特別檢查 2026-06（已知策略失效月）下 T+10 規則是否還能救
  5. 訓練段做「閾值最適化」（試 score 60/65/70/75/80）→ 拿到測試段檢驗
"""
import json
import math
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from run_backtest_0903 import build_pick_days
from analyze_exit_timing import (
    CACHE_DIR, COST_PCT, build_daily_close_map, get_price,
    get_trading_dates, load_bars, load_price_cache, save_price_cache, net_ret
)

OUT_FILE = "data/opt_t10_oos.json"


def stats(rets):
    rets = [r for r in rets if r is not None]
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "meanNet": None, "medianNet": None,
                "sd": None, "totalNet": None, "sharpe": None, "mdd": None,
                "maxWin": None, "maxLoss": None}
    wins = sum(1 for r in rets if r > 0)
    mean = statistics.mean(rets)
    med = statistics.median(rets)
    sd = statistics.stdev(rets) if n > 1 else 0
    sharpe = (mean / sd) * math.sqrt(252) if sd > 0 else 0
    eq = 1.0
    peak = 1.0
    mdd = 0.0
    for r in rets:
        eq *= (1 + r / 100)
        peak = max(peak, eq)
        mdd = max(mdd, (peak - eq) / peak * 100)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "meanNet": round(mean, 3),
        "medianNet": round(med, 3),
        "sd": round(sd, 3),
        "totalNet": round(sum(rets), 2),
        "sharpe": round(sharpe, 2),
        "mdd": round(mdd, 2),
        "maxWin": round(max(rets), 2),
        "maxLoss": round(min(rets), 2),
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

    print("建構 pick_days ...")
    pick_days = build_pick_days(days, rev_maps, hw, disp)
    daily_close_map = build_daily_close_map()
    bars_cache = {}
    price_cache = load_price_cache()

    # ── 收集所有 trade 紀錄（不過濾分數，後面再分層） ──────────
    print("收集 trade 紀錄（不限分數）...")
    trades = []  # 每筆：{pickDate, entryDate, code, score, entry, t2_open, t10_close, t2_ret, t10_ret}
    skip_no_entry = 0
    skip_no_t2 = 0
    skip_no_t10 = 0
    for d in pick_days:
        entry_date = d["entryDate"]
        t2 = get_trading_dates(daily_dates, entry_date, 1)
        t10 = get_trading_dates(daily_dates, entry_date, 9)
        for p in d["picks"]:
            entry = get_price(p["code"], entry_date, "open",
                              bars_cache, price_cache, daily_close_map)
            if entry is None:
                skip_no_entry += 1
                continue
            t2_open = get_price(p["code"], t2, "open",
                                bars_cache, price_cache, daily_close_map)
            t10_close = get_price(p["code"], t10, "close",
                                  bars_cache, price_cache, daily_close_map)
            if t2_open is None:
                skip_no_t2 += 1
            if t10_close is None:
                skip_no_t10 += 1
            trades.append({
                "pickDate": d["pickDate"],
                "entryDate": entry_date,
                "code": p["code"], "name": p["name"],
                "score": p["score"], "entry": entry,
                "t2_open": t2_open, "t10_close": t10_close,
                "t2_ret": net_ret(entry, t2_open),
                "t10_ret": net_ret(entry, t10_close),
            })
    save_price_cache(price_cache)
    print(f"trades 共 {len(trades)}；缺資料：no_entry={skip_no_entry}, "
          f"no_t2={skip_no_t2}, no_t10={skip_no_t10}")

    # ── 依進場日切前 70% / 後 30% ──────────────────────────────
    entry_dates_sorted = sorted({t["entryDate"] for t in trades})
    n_dates = len(entry_dates_sorted)
    split_idx = int(n_dates * 0.7)
    train_dates = set(entry_dates_sorted[:split_idx])
    test_dates = set(entry_dates_sorted[split_idx:])
    split_boundary = entry_dates_sorted[split_idx] if split_idx < n_dates else None
    print(f"\n進場日範圍 {entry_dates_sorted[0]} ~ {entry_dates_sorted[-1]}, "
          f"共 {n_dates} 天")
    print(f"切點：訓練 {len(train_dates)} 天 ({entry_dates_sorted[0]} ~ "
          f"{entry_dates_sorted[split_idx-1]})，測試 {len(test_dates)} 天 "
          f"({split_boundary} ~ {entry_dates_sorted[-1]})")

    # ── 分段、分閾值比較 ────────────────────────────────────────
    def filter_rets(trades_subset, score_min, key):
        return [t[key] for t in trades_subset
                if t["score"] >= score_min and t[key] is not None]

    train_trades = [t for t in trades if t["entryDate"] in train_dates]
    test_trades = [t for t in trades if t["entryDate"] in test_dates]

    # 6 月專屬子集（已知失效月）
    jun_trades = [t for t in trades if t["entryDate"].startswith("2026-06")]
    not_jun_trades = [t for t in trades if not t["entryDate"].startswith("2026-06")]

    # 閾值掃描表 — 訓練 vs 測試
    thresholds = [60, 65, 70, 75, 80, 85]
    threshold_results = {}
    for thr in thresholds:
        threshold_results[thr] = {
            "train": {
                "T+2_open": stats(filter_rets(train_trades, thr, "t2_ret")),
                "T+10_close": stats(filter_rets(train_trades, thr, "t10_ret")),
            },
            "test": {
                "T+2_open": stats(filter_rets(test_trades, thr, "t2_ret")),
                "T+10_close": stats(filter_rets(test_trades, thr, "t10_ret")),
            },
            "full": {
                "T+2_open": stats(filter_rets(trades, thr, "t2_ret")),
                "T+10_close": stats(filter_rets(trades, thr, "t10_ret")),
            },
            "jun_only": {
                "T+2_open": stats(filter_rets(jun_trades, thr, "t2_ret")),
                "T+10_close": stats(filter_rets(jun_trades, thr, "t10_ret")),
            },
            "not_jun": {
                "T+2_open": stats(filter_rets(not_jun_trades, thr, "t2_ret")),
                "T+10_close": stats(filter_rets(not_jun_trades, thr, "t10_ret")),
            },
        }

    # ── 月度切片：每個月 T+2 vs T+10 ──────────────────────────
    monthly = {}
    for t in trades:
        if t["score"] < 75:
            continue
        ym = t["entryDate"][:7]
        monthly.setdefault(ym, {"t2": [], "t10": []})
        if t["t2_ret"] is not None:
            monthly[ym]["t2"].append(t["t2_ret"])
        if t["t10_ret"] is not None:
            monthly[ym]["t10"].append(t["t10_ret"])
    monthly_summary = {ym: {"T+2_open": stats(d["t2"]),
                            "T+10_close": stats(d["t10"])}
                       for ym, d in sorted(monthly.items())}

    # ── 訓練段最佳閾值 → 套到測試段 ────────────────────────────
    # 取「meanNet 最大」的 score 閾值（限 train n>=30）
    train_t10_by_thr = {thr: threshold_results[thr]["train"]["T+10_close"] for thr in thresholds}
    eligible_thrs = [thr for thr, s in train_t10_by_thr.items()
                     if s.get("n", 0) >= 30 and s.get("meanNet") is not None]
    if eligible_thrs:
        best_thr = max(eligible_thrs,
                       key=lambda thr: train_t10_by_thr[thr]["meanNet"])
        best_train = threshold_results[best_thr]["train"]["T+10_close"]
        best_test = threshold_results[best_thr]["test"]["T+10_close"]
    else:
        best_thr = None
        best_train = None
        best_test = None

    # ── 計算 drift（訓練→測試的退化量） ────────────────────────
    def drift(train_s, test_s, key):
        if (train_s is None or test_s is None
                or train_s.get(key) is None or test_s.get(key) is None):
            return None
        return round(test_s[key] - train_s[key], 3)

    drift_table = {}
    for thr in thresholds:
        for rule in ("T+2_open", "T+10_close"):
            tr = threshold_results[thr]["train"][rule]
            te = threshold_results[thr]["test"][rule]
            drift_table[f"thr{thr}_{rule}"] = {
                "train_n": tr.get("n"),
                "test_n": te.get("n"),
                "winRateDrift_pp": drift(tr, te, "winRate"),
                "meanNetDrift_pp": drift(tr, te, "meanNet"),
                "totalNetDrift": drift(tr, te, "totalNet"),
            }

    output = {
        "rule": "score>=75, T+1 open buy, T+10 close sell",
        "claim": {"winRate": 49.4, "meanNet": 3.85, "n": 438},
        "dataRange": {"start": entry_dates_sorted[0], "end": entry_dates_sorted[-1]},
        "split": {
            "method": "70/30 by entry date (chronological)",
            "trainDates": [entry_dates_sorted[0], entry_dates_sorted[split_idx-1]],
            "testDates": [split_boundary, entry_dates_sorted[-1]],
            "n_train_dates": len(train_dates),
            "n_test_dates": len(test_dates),
        },
        "trainOptimizedThreshold": {
            "bestThreshold": best_thr,
            "trainStats": best_train,
            "testStats": best_test,
            "robust": (best_test is not None
                       and best_train is not None
                       and best_test.get("meanNet") is not None
                       and best_train.get("meanNet") is not None
                       and (best_train["meanNet"] - (best_test["meanNet"] or 0)) <= 3.0),
        },
        "thresholdSweep": threshold_results,
        "monthlyBreakdown_score75": monthly_summary,
        "drift": drift_table,
        "note": (
            "drift = test - train，越大越糟 (winRate 單位 pp，meanNet 單位 %)；"
            "若 |meanNetDrift| > 3pp 或 |winRateDrift| > 10pp 視為失效。"
            "jun_only = 已知策略失效月，看 T+10 能否在該月救回獲利。"
        ),
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("\n=== 訓練 vs 測試（score≥75，T+10 close） ===")
    tr75 = threshold_results[75]["train"]["T+10_close"]
    te75 = threshold_results[75]["test"]["T+10_close"]
    print(f"train n={tr75.get('n')} win={tr75.get('winRate')}% "
          f"EV={tr75.get('meanNet')}% total={tr75.get('totalNet')}%")
    print(f"test  n={te75.get('n')} win={te75.get('winRate')}% "
          f"EV={te75.get('meanNet')}% total={te75.get('totalNet')}%")

    print("\n=== 訓練 vs 測試（score≥75，T+2 open 基線對比） ===")
    tr75b = threshold_results[75]["train"]["T+2_open"]
    te75b = threshold_results[75]["test"]["T+2_open"]
    print(f"train n={tr75b.get('n')} win={tr75b.get('winRate')}% "
          f"EV={tr75b.get('meanNet')}% total={tr75b.get('totalNet')}%")
    print(f"test  n={te75b.get('n')} win={te75b.get('winRate')}% "
          f"EV={te75b.get('meanNet')}% total={te75b.get('totalNet')}%")

    print("\n=== 6 月專段（score≥75） ===")
    j75 = threshold_results[75]["jun_only"]
    print(f"T+2_open  : {j75['T+2_open']}")
    print(f"T+10_close: {j75['T+10_close']}")

    print("\n=== 月度（score≥75） ===")
    for ym, s in monthly_summary.items():
        t2 = s["T+2_open"]
        t10 = s["T+10_close"]
        print(f"{ym}: T+2 n={t2.get('n')} win={t2.get('winRate')}% EV={t2.get('meanNet')}% | "
              f"T+10 n={t10.get('n')} win={t10.get('winRate')}% EV={t10.get('meanNet')}%")

    print(f"\nsaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
