"""樣本外驗證：Rule B「按 gap 桶分派最佳出場」是否 robust？

方法：
  1. 把所有 ≥75 分交易按日期排序，切前 70% (train) / 後 30% (test)
  2. 在 train 上算各 gap 桶最佳出場 → train_exit_map
  3. 把 train_exit_map 套用到 test，看 EV/勝率/月度
  4. 對照：train vs test、test vs baseline、各月份表現
  5. 特別檢查 2026-06（已知策略失效月）

  + 多種切點 (60/40, 70/30, 80/20) 對照 robustness
  + 月度 Walk-forward：用「截至當月」資料 fit，下個月測試
輸出: data/opt_oos_ruleB.json
"""
import json
import math
import os
import sys
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs                              # noqa: E402
from run_backtest_0903 import build_pick_days         # noqa: E402

COMMISSION_RT = 0.1425 * 0.28 * 2 / 100
TAX = 0.003
COST_RT = (COMMISSION_RT + TAX) * 100
SCORE_MIN = 75
CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "opt_oos_ruleB.json")

GAP_BUCKETS = [
    ("neg", -100, 0),
    ("0-3", 0, 3),
    ("3-5", 3, 5),
    ("5-8", 5, 8),
    ("8-10", 8, 10),
    ("10+", 10, 100),
]
EXIT_TIMES_T1 = ["09:01", "09:05", "09:15", "10:00", "11:30"]
EXIT_T1_CLOSE = "T1_close"
EXIT_T2_OPEN = "T2_open"
ALL_EXITS = EXIT_TIMES_T1 + [EXIT_T1_CLOSE, EXIT_T2_OPEN]


def load_cache(code, date):
    p = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def bar_close_at_or_before(bars, hhmm):
    cands = [b for b in bars if b["time"] <= hhmm]
    if not cands:
        return None
    return cands[-1]["close"]


def day_close(bars):
    if not bars:
        return None
    return max(bars, key=lambda x: x["time"])["close"]


def first_minute_close(bars):
    if not bars:
        return None
    return min(bars, key=lambda x: x["time"])["close"]


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
                "ciLow": None, "ciHigh": None, "totalNetPct": 0,
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


def gap_bucket(g):
    for name, lo, hi in GAP_BUCKETS:
        if lo <= g < hi:
            return name
    return None


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
            t1_close = day_close(day_bars)
            t2_open = next_bars[0]["open"]

            exits = {}
            for tt in EXIT_TIMES_T1:
                px = bar_close_at_or_before(day_bars, tt)
                exits[tt] = (round((px - entry) / entry * 100 - COST_RT, 4)
                             if px is not None else None)
            exits[EXIT_T1_CLOSE] = (
                round((t1_close - entry) / entry * 100 - COST_RT, 4)
                if t1_close else None
            )
            exits[EXIT_T2_OPEN] = (
                round((t2_open - entry) / entry * 100 - COST_RT, 4)
                if t2_open else None
            )

            trades.append({
                "entryDate": d["entryDate"],
                "code": p["code"],
                "score": p["score"],
                "gapPct": round(gap_pct, 3),
                "exits": exits,
                "baselineRet": exits[EXIT_T2_OPEN],
            })
    return trades


def fit_exit_map(train_trades, min_n_per_bucket=5):
    """在 train 上算出各 gap 桶最佳出場（EV 最大）"""
    exit_map = {}
    diag = {}
    for gb, _, _ in GAP_BUCKETS:
        bucket = [t for t in train_trades if gap_bucket(t["gapPct"]) == gb]
        if len(bucket) < min_n_per_bucket:
            exit_map[gb] = EXIT_T2_OPEN  # 默認
            diag[gb] = {"n": len(bucket), "note": "too few, fallback T2_open"}
            continue
        best_ek = EXIT_T2_OPEN
        best_ev = -1e9
        ev_by_exit = {}
        for ek in ALL_EXITS:
            rets = [t["exits"][ek] for t in bucket if t["exits"].get(ek) is not None]
            if not rets:
                continue
            ev = sum(rets) / len(rets)
            ev_by_exit[ek] = round(ev, 3)
            if ev > best_ev:
                best_ev = ev
                best_ek = ek
        exit_map[gb] = best_ek
        diag[gb] = {"n": len(bucket), "bestExit": best_ek,
                    "bestEV": round(best_ev, 3), "evByExit": ev_by_exit}
    return exit_map, diag


def apply_exit_map(trades, exit_map):
    rets = []
    for t in trades:
        gb = gap_bucket(t["gapPct"])
        ek = exit_map.get(gb, EXIT_T2_OPEN)
        r = t["exits"].get(ek)
        if r is None:
            r = t["baselineRet"]
        if r is not None:
            rets.append(r)
    return rets


def by_month_stats(trades, exit_map):
    groups = defaultdict(list)
    for t in trades:
        gb = gap_bucket(t["gapPct"])
        ek = exit_map.get(gb, EXIT_T2_OPEN)
        r = t["exits"].get(ek)
        if r is None:
            r = t["baselineRet"]
        if r is not None:
            groups[t["entryDate"][:7]].append(r)
    return {m: stat_pack(v) for m, v in sorted(groups.items())}


def split_by_pct(trades_sorted, train_pct):
    n = len(trades_sorted)
    cut = int(n * train_pct)
    return trades_sorted[:cut], trades_sorted[cut:]


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

    needed = set()
    for d in pick_days:
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            needed.add((p["code"], d["entryDate"]))
            if d.get("nextDate"):
                needed.add((p["code"], d["nextDate"]))
    bars_map = {}
    for (c, dt) in needed:
        b = load_cache(c, dt)
        bars_map[(c, dt)] = b if b else []

    trades = collect_trades(pick_days, bars_map, SCORE_MIN)
    trades_sorted = sorted(trades, key=lambda t: (t["entryDate"], t["code"]))
    print(f"有效交易 {len(trades_sorted)} 筆，期間 "
          f"{trades_sorted[0]['entryDate']} ~ {trades_sorted[-1]['entryDate']}")

    out = {
        "meta": {
            "scoreMin": SCORE_MIN,
            "costRtPct": round(COST_RT, 4),
            "nTotal": len(trades_sorted),
            "dateFrom": trades_sorted[0]["entryDate"],
            "dateTo": trades_sorted[-1]["entryDate"],
            "claimedEV": 2.209,
            "claimedWinRate": 69.6,
            "claimedExitMap": {
                "neg": "11:30", "0-3": "09:15", "3-5": "09:15",
                "5-8": "T2_open", "8-10": "T2_open", "10+": "T2_open"
            },
        },
        "splits": {},
    }

    # ── 多種切點 OOS ──
    for train_pct in [0.6, 0.7, 0.8]:
        train, test = split_by_pct(trades_sorted, train_pct)
        if not test:
            continue
        exit_map, diag = fit_exit_map(train)
        # in-sample (train)
        train_rets = apply_exit_map(train, exit_map)
        # out-of-sample (test)
        test_rets = apply_exit_map(test, exit_map)
        # baseline (T+2 open) on test
        baseline_map = {gb: EXIT_T2_OPEN for gb, _, _ in GAP_BUCKETS}
        test_baseline_rets = apply_exit_map(test, baseline_map)

        split_key = f"train{int(train_pct*100)}_test{int((1-train_pct)*100)}"
        out["splits"][split_key] = {
            "trainPeriod": [train[0]["entryDate"], train[-1]["entryDate"]],
            "testPeriod": [test[0]["entryDate"], test[-1]["entryDate"]],
            "fittedExitMap": exit_map,
            "trainStats": stat_pack(train_rets),
            "testStats": stat_pack(test_rets),
            "testBaselineStats": stat_pack(test_baseline_rets),
            "testByMonth": by_month_stats(test, exit_map),
            "testBaselineByMonth": by_month_stats(test, baseline_map),
            "fitDiag": diag,
        }

    # ── 月度 Walk-forward ──
    # 對每個月 m: 用 m 之前的資料 fit, 預測 m
    months = sorted({t["entryDate"][:7] for t in trades_sorted})
    wf_rets = []
    wf_per_month = []
    for i, m in enumerate(months):
        train = [t for t in trades_sorted if t["entryDate"][:7] < m]
        test = [t for t in trades_sorted if t["entryDate"][:7] == m]
        if len(train) < 30 or not test:
            wf_per_month.append({"month": m, "n": len(test), "note": "skip (insufficient train)"})
            continue
        exit_map, _ = fit_exit_map(train)
        rets = apply_exit_map(test, exit_map)
        wf_per_month.append({
            "month": m,
            "trainN": len(train),
            "testN": len(test),
            "exitMap": exit_map,
            "stats": stat_pack(rets),
            "baselineStats": stat_pack(apply_exit_map(test, {gb: EXIT_T2_OPEN for gb, _, _ in GAP_BUCKETS})),
        })
        wf_rets.extend(rets)
    out["walkForward"] = {
        "overall": stat_pack(wf_rets),
        "byMonth": wf_per_month,
    }

    # ── 觀察 train_exit_map 的「穩定性」 ──
    # 每個切點下，神挑的 exit_map 是否一致？
    map_variants = []
    for sk, v in out["splits"].items():
        map_variants.append((sk, v["fittedExitMap"]))
    # 計算 6 個 gap 桶在不同切點下的「最佳出場」有幾個不同的選擇
    stability = {}
    for gb, _, _ in GAP_BUCKETS:
        picks_set = set(em[gb] for _, em in map_variants)
        stability[gb] = {
            "uniqueChoices": len(picks_set),
            "choices": sorted(picks_set),
        }
    out["exitMapStability"] = stability

    # ── 與 LOO 對照 ──
    # 把現有 opt_gap_score_exit.json 的 loo_oos 拉進來
    try:
        with open("data/opt_gap_score_exit.json", encoding="utf-8") as f:
            prev = json.load(f)
        out["existingLOO"] = prev.get("robustness", {}).get("loo_oos", {})
        out["existingMonthly"] = {
            "ruleB": prev.get("robustness", {}).get("ruleB_monthly", {}),
            "baseline": prev.get("robustness", {}).get("baseline_monthly", {}),
        }
    except Exception:
        pass

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    # ── Console summary ──
    print("\n=== 樣本外 (chronological 70/30) ===")
    s = out["splits"].get("train70_test30")
    if s:
        print(f"  train: {s['trainPeriod']}  n={s['trainStats']['n']}  EV {s['trainStats']['evPct']}%  勝率 {s['trainStats']['winRate']}%")
        print(f"  test : {s['testPeriod']}   n={s['testStats']['n']}   EV {s['testStats']['evPct']}%  勝率 {s['testStats']['winRate']}%")
        print(f"  test baseline (T+2 open): EV {s['testBaselineStats']['evPct']}%  勝率 {s['testBaselineStats']['winRate']}%")
        print(f"  fittedExitMap: {s['fittedExitMap']}")
        print(f"  test by month:")
        for m, mm in s["testByMonth"].items():
            bm = s["testBaselineByMonth"].get(m, {})
            print(f"    {m}: ruleB n={mm['n']} EV{mm['evPct']}% 勝率{mm['winRate']}%  | baseline EV{bm.get('evPct')}%")

    print("\n=== Exit Map 穩定性 (3 種切點下) ===")
    for gb, info in out["exitMapStability"].items():
        print(f"  gap {gb}: {info['uniqueChoices']} 種選擇 {info['choices']}")

    print("\n=== Walk-Forward 月度 ===")
    for m in wf_per_month:
        if m.get("stats"):
            s = m["stats"]; bs = m["baselineStats"]
            print(f"  {m['month']}: trainN={m['trainN']} testN={m['testN']} "
                  f"EV{s['evPct']}% 勝率{s['winRate']}%  | baseline EV{bs['evPct']}%")
        else:
            print(f"  {m['month']}: {m.get('note')}")
    if wf_rets:
        ov = out["walkForward"]["overall"]
        print(f"  整體 walk-forward: n={ov['n']} EV{ov['evPct']}% 勝率{ov['winRate']}%")

    print(f"\n結果存至 {OUT_PATH}")


if __name__ == "__main__":
    main()
