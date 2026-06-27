"""樣本外驗證: score≥75 AND gap≥5% → 維持 T+2 開盤出場

聲稱效果: 勝率 63%, EV 2.13%, 樣本 81 筆

驗證方法:
  1. 時間切分: 前 70% (訓練) / 後 30% (測試)
  2. gap 閾值穩健性: 訓練段做 4%/5%/6% 各閾值的 EV, 看最佳是否在 5%
  3. 訓練 vs 測試的勝率/EV 落差
  4. 月度表現: 特別檢查 6 月 (已知失效月)
  5. 與基線比較: 過濾後是否真的優於 score≥75 全集

輸出: data/opt_oos_gap5_t2open.json
"""
import json
import math
import os
import sys
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs                               # noqa: E402
from run_backtest_0903 import build_pick_days          # noqa: E402

COMMISSION_RT = 0.1425 * 0.28 * 2 / 100
TAX = 0.003
COST_RT = (COMMISSION_RT + TAX) * 100   # 0.3798

SCORE_MIN = 75
GAP_MIN = 5.0
CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "opt_oos_gap5_t2open.json")


def load_cache(code, date):
    p = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def wilson_ci(wins, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = wins / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (round((center - margin) * 100, 1), round((center + margin) * 100, 1))


def stat_pack(rets):
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "evPct": None, "median": None,
                "ciLow": None, "ciHigh": None, "totalNetPct": 0.0,
                "totalDeltaTWD": 0}
    wins = sum(1 for r in rets if r > 0)
    ev = mean(rets)
    med = median(rets)
    lo, hi = wilson_ci(wins, n)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "evPct": round(ev, 3),
        "median": round(med, 3),
        "ciLow": lo, "ciHigh": hi,
        "totalNetPct": round(sum(rets), 2),
        "totalDeltaTWD": round(sum(rets) / 100 * 1_000_000),
    }


def collect_trades(pick_days, bars_map, score_min=SCORE_MIN):
    trades = []
    for d in pick_days:
        if not d.get("nextDate"):
            continue
        for p in d["picks"]:
            if p["score"] < score_min:
                continue
            day_bars = bars_map.get((p["code"], d["entryDate"]), [])
            next_bars = bars_map.get((p["code"], d["nextDate"]), [])
            if not day_bars or not next_bars:
                continue
            entry = day_bars[0]["open"]
            if entry <= 0:
                continue
            prev_close = p["prevClose"]
            gap_pct = (entry - prev_close) / prev_close * 100
            t2_open = next_bars[0]["open"]
            ret = (t2_open - entry) / entry * 100 - COST_RT
            trades.append({
                "pickDate": d["pickDate"],
                "entryDate": d["entryDate"],
                "nextDate": d["nextDate"],
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "gapPct": round(gap_pct, 3),
                "ret": round(ret, 4),
            })
    return trades


def evaluate(trades, score_min, gap_min):
    rets = [t["ret"] for t in trades
            if t["score"] >= score_min and t["gapPct"] >= gap_min]
    return stat_pack(rets)


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("載入資料 ...")
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    pick_days = build_pick_days(days, rev_maps, hw, disp)

    # 預載快取
    needed = set()
    for d in pick_days:
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            needed.add((p["code"], d["entryDate"]))
            if d.get("nextDate"):
                needed.add((p["code"], d["nextDate"]))
    bars_map = {}
    hit = 0
    for (c, dt) in needed:
        b = load_cache(c, dt)
        bars_map[(c, dt)] = b if b else []
        if b:
            hit += 1
    print(f"選股日 {len(pick_days)} 天, 快取 {hit}/{len(needed)}")

    trades = collect_trades(pick_days, bars_map, score_min=SCORE_MIN)
    print(f"score≥{SCORE_MIN} 全集: {len(trades)} 筆")

    # ── 全集統計 ─────────────────────────────
    baseline_all = stat_pack([t["ret"] for t in trades])
    rule_all = evaluate(trades, SCORE_MIN, GAP_MIN)
    print(f"基線(score≥75): n={baseline_all['n']} 勝率{baseline_all['winRate']}% EV{baseline_all['evPct']}%")
    print(f"規則(score≥75 & gap≥5): n={rule_all['n']} 勝率{rule_all['winRate']}% EV{rule_all['evPct']}%")

    # ── 1. 時間切分 70/30 ────────────────────
    dates = sorted({t["entryDate"] for t in trades})
    n_dates = len(dates)
    cut_idx = int(n_dates * 0.7)
    train_cutoff = dates[cut_idx - 1] if cut_idx > 0 else dates[0]
    test_start = dates[cut_idx] if cut_idx < n_dates else None
    print(f"\n切分: 訓練 {dates[0]} ~ {train_cutoff} ({cut_idx} 日)")
    if test_start:
        print(f"      測試 {test_start} ~ {dates[-1]} ({n_dates - cut_idx} 日)")

    train_trades = [t for t in trades if t["entryDate"] <= train_cutoff]
    test_trades = [t for t in trades if test_start and t["entryDate"] >= test_start]

    train_baseline = stat_pack([t["ret"] for t in train_trades])
    test_baseline = stat_pack([t["ret"] for t in test_trades])
    train_rule = evaluate(train_trades, SCORE_MIN, GAP_MIN)
    test_rule = evaluate(test_trades, SCORE_MIN, GAP_MIN)

    print(f"\n--- 70/30 切分 ---")
    print(f"訓練段 基線: n={train_baseline['n']} 勝率{train_baseline['winRate']}% EV{train_baseline['evPct']}%")
    print(f"訓練段 規則: n={train_rule['n']} 勝率{train_rule['winRate']}% EV{train_rule['evPct']}%")
    print(f"測試段 基線: n={test_baseline['n']} 勝率{test_baseline['winRate']}% EV{test_baseline['evPct']}%")
    print(f"測試段 規則: n={test_rule['n']} 勝率{test_rule['winRate']}% EV{test_rule['evPct']}%")

    # ── 2. gap 閾值穩健性 (訓練段) ──────────
    gap_grid = [3.0, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0]
    train_grid = {}
    test_grid = {}
    for g in gap_grid:
        train_grid[g] = evaluate(train_trades, SCORE_MIN, g)
        test_grid[g] = evaluate(test_trades, SCORE_MIN, g)
    # 找訓練段最佳閾值
    train_best = max(
        (g for g in gap_grid if train_grid[g]["n"] >= 20),
        key=lambda g: train_grid[g]["evPct"] if train_grid[g]["evPct"] is not None else -999,
        default=None,
    )

    print(f"\n--- gap 閾值穩健性 (訓練段) ---")
    print(f"{'gap':>6} {'n':>4} {'勝率':>6} {'EV%':>7}    | {'測試n':>5} {'測試勝率':>8} {'測試EV%':>8}")
    for g in gap_grid:
        s = train_grid[g]; s2 = test_grid[g]
        if s["n"] == 0:
            continue
        ev_str = f"{s['evPct']:+.3f}" if s['evPct'] is not None else "n/a"
        ev2_str = f"{s2['evPct']:+.3f}" if s2['evPct'] is not None else "n/a"
        wr2_str = f"{s2['winRate']}%" if s2['winRate'] is not None else "n/a"
        print(f"  ≥{g:>4.1f} {s['n']:>4} {s['winRate']}% {ev_str}    | {s2['n']:>5} {wr2_str:>8} {ev2_str}")
    print(f"訓練段最佳閾值: gap≥{train_best}")

    # ── 3. 月度檢查 (重點: 6 月) ────────────
    by_month_rule = defaultdict(list)
    by_month_base = defaultdict(list)
    for t in trades:
        m = t["entryDate"][:7]
        by_month_base[m].append(t["ret"])
        if t["gapPct"] >= GAP_MIN:
            by_month_rule[m].append(t["ret"])

    print(f"\n--- 月度 ---")
    print(f"{'月':9s} {'基線n':>5} {'基線EV%':>8} {'規則n':>5} {'規則EV%':>8} {'規則勝率':>8}")
    month_rows = {}
    for m in sorted(by_month_base.keys()):
        b = stat_pack(by_month_base[m])
        r = stat_pack(by_month_rule.get(m, []))
        month_rows[m] = {"baseline": b, "rule": r}
        r_ev = f"{r['evPct']:+.3f}" if r['evPct'] is not None else "  --  "
        r_wr = f"{r['winRate']}%" if r['winRate'] is not None else " -- "
        print(f"  {m:8s} {b['n']:>5} {b['evPct']:>+8.3f} {r['n']:>5} {r_ev:>8} {r_wr:>8}")

    # ── 4. 訓練 vs 測試落差 ─────────────────
    if train_rule["evPct"] is not None and test_rule["evPct"] is not None:
        wr_drop = train_rule["winRate"] - test_rule["winRate"]
        ev_drop = train_rule["evPct"] - test_rule["evPct"]
    else:
        wr_drop = None
        ev_drop = None

    # 訓練最佳閾值在測試的表現
    if train_best is not None:
        oos_at_best = test_grid[train_best]
    else:
        oos_at_best = None

    # ── 5. 跨閾值單調性檢查 ─────────────────
    # 是否「gap 越大 EV 越好」這個趨勢在測試段也成立?
    train_evs = [(g, train_grid[g]["evPct"]) for g in gap_grid
                 if train_grid[g]["n"] >= 10 and train_grid[g]["evPct"] is not None]
    test_evs = [(g, test_grid[g]["evPct"]) for g in gap_grid
                if test_grid[g]["n"] >= 5 and test_grid[g]["evPct"] is not None]

    # rank correlation (Spearman 簡化版)
    def rank_corr(xs):
        # xs: list of (gap, ev)
        if len(xs) < 3:
            return None
        gaps = [x[0] for x in xs]
        evs = [x[1] for x in xs]
        n = len(xs)
        def ranks(arr):
            sorted_idx = sorted(range(n), key=lambda i: arr[i])
            r = [0] * n
            for rank, i in enumerate(sorted_idx, 1):
                r[i] = rank
            return r
        rg = ranks(gaps); re = ranks(evs)
        # spearman
        d2 = sum((rg[i] - re[i]) ** 2 for i in range(n))
        return round(1 - 6 * d2 / (n * (n * n - 1)), 3)

    train_corr = rank_corr(train_evs)
    test_corr = rank_corr(test_evs)
    print(f"\n--- 單調性 (gap 越大 EV 越好) ---")
    print(f"訓練段 Spearman={train_corr}, 測試段 Spearman={test_corr}")

    # ── 結論 ─────────────────────────────────
    # robust 條件:
    #  a) 測試段 EV > 0 (扣費後仍賺)
    #  b) 測試段勝率落差 <= 10pp
    #  c) 6 月規則 EV > 6 月基線 EV (有救回)
    #  d) 訓練最佳閾值落在 4~6 之間 (5 附近) — 非極端
    june_base = month_rows.get("2026-06", {}).get("baseline", {})
    june_rule = month_rows.get("2026-06", {}).get("rule", {})
    june_rescue = (
        june_rule.get("evPct") is not None
        and june_base.get("evPct") is not None
        and june_rule["evPct"] > june_base["evPct"]
    )
    june_profitable = (
        june_rule.get("evPct") is not None and june_rule["evPct"] > 0.0
    )

    test_profitable = test_rule.get("evPct") is not None and test_rule["evPct"] > 0
    wr_ok = wr_drop is None or wr_drop <= 10
    threshold_ok = train_best is not None and 4.0 <= train_best <= 6.0

    out = {
        "meta": {
            "scoreMin": SCORE_MIN,
            "gapMin": GAP_MIN,
            "costRtPct": round(COST_RT, 4),
            "dateRange": {"from": dates[0], "to": dates[-1]},
            "trainCutoff": train_cutoff,
            "testStart": test_start,
        },
        "claim": {
            "winRate": 63.0,
            "evPct": 2.13,
            "n": 81,
        },
        "full_sample": {
            "baseline_score75": baseline_all,
            "rule_score75_gap5": rule_all,
        },
        "train_test_split_70_30": {
            "train": {
                "baseline": train_baseline,
                "rule": train_rule,
            },
            "test": {
                "baseline": test_baseline,
                "rule": test_rule,
            },
            "drop": {
                "winRatePP": wr_drop,
                "evPP": ev_drop,
            },
        },
        "gap_threshold_grid": {
            "grid": gap_grid,
            "train": {str(g): train_grid[g] for g in gap_grid},
            "test": {str(g): test_grid[g] for g in gap_grid},
            "trainBest": train_best,
            "oosAtTrainBest": oos_at_best,
            "spearman": {
                "train": train_corr,
                "test": test_corr,
            },
        },
        "monthly": month_rows,
        "june_check": {
            "baseline": june_base,
            "rule": june_rule,
            "rescued": june_rescue,
            "profitableInJune": june_profitable,
        },
        "robust_checks": {
            "testProfitable": test_profitable,
            "winRateDropOk": wr_ok,
            "thresholdStable": threshold_ok,
            "juneRescued": june_rescue,
        },
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=2, default=str)

    print(f"\n=== 結論 ===")
    print(f"測試段獲利: {test_profitable}")
    print(f"勝率落差≤10pp: {wr_ok} (drop={wr_drop})")
    print(f"閾值穩定 (4~6): {threshold_ok} (train best={train_best})")
    print(f"6 月救回 (規則EV>基線EV): {june_rescue}")
    print(f"6 月本身獲利: {june_profitable}")
    print(f"\n輸出至 {OUT_PATH}")


if __name__ == "__main__":
    main()
