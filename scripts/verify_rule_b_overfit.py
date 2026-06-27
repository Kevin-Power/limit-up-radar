"""對 Rule B（按 gap 桶分派最佳出場）做過擬合驗證。

紅旗檢查清單：
  1. 樣本量：每桶 n、特別是 8-10 / 10+
  2. 月度一致性：Rule B 在各月 vs 基線
  3. 前後半測試：是否有時段倚賴
  4. Bootstrap：重抽樣後 EV 分佈
  5. 閾值靈敏度：把 gap 桶界線 ±10% 移動，效果是否劇變
  6. Leave-One-Month-Out 樣本外 vs 樣本內差距
  7. 桶內最佳出場 vs 第二佳出場差距（過擬合徵兆：差距大且 n 小）

輸出 data/verify_rule_b_overfit.json
"""
import json
import math
import os
import random
import sys
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs                               # noqa: E402
from run_backtest_0903 import build_pick_days          # noqa: E402

COMMISSION_RT = 0.1425 * 0.28 * 2 / 100
TAX = 0.003
COST_RT = (COMMISSION_RT + TAX) * 100  # 0.3798

SCORE_MIN = 75
CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "verify_rule_b_overfit.json")

EXIT_TIMES_T1 = ["09:01", "09:05", "09:15", "10:00", "11:30"]
EXIT_T1_CLOSE = "T1_close"
EXIT_T2_OPEN = "T2_open"
ALL_EXITS = EXIT_TIMES_T1 + [EXIT_T1_CLOSE, EXIT_T2_OPEN]

GAP_BUCKETS = [
    ("neg", -100, 0),
    ("0-3", 0, 3),
    ("3-5", 3, 5),
    ("5-8", 5, 8),
    ("8-10", 8, 10),
    ("10+", 10, 100),
]


def gap_bucket(g, edges=None):
    if edges is None:
        edges = GAP_BUCKETS
    for name, lo, hi in edges:
        if lo <= g < hi:
            return name
    return None


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
        return {"n": 0, "winRate": None, "evPct": None}
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "evPct": round(mean(rets), 3),
        "median": round(median(rets), 3),
        "sumPct": round(sum(rets), 2),
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
            t1_close = day_close(day_bars)
            t2_open = next_bars[0]["open"]
            exits = {}
            for tt in EXIT_TIMES_T1:
                px = bar_close_at_or_before(day_bars, tt)
                exits[tt] = (None if px is None
                             else round((px - entry) / entry * 100 - COST_RT, 4))
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


# Rule B 規則本身（由原始 opt_gap_score_exit.json 派出）
RULE_B_EXIT_MAP = {
    "neg": "11:30",
    "0-3": "09:15",
    "3-5": "09:15",
    "5-8": "T2_open",
    "8-10": "T2_open",
    "10+": "T2_open",
}


def apply_rule(trades, exit_map, edges=None):
    rets = []
    for t in trades:
        gb = gap_bucket(t["gapPct"], edges)
        ek = exit_map.get(gb, EXIT_T2_OPEN)
        r = t["exits"].get(ek)
        if r is None:
            r = t["baselineRet"]
        if r is not None:
            rets.append(r)
    return rets


def fit_best_map(train_trades, min_n=5, edges=None):
    """在 train 上每桶找最佳出場（EV 最大）。"""
    if edges is None:
        edges = GAP_BUCKETS
    out = {}
    for gb, _, _ in edges:
        best_ek, best_ev = EXIT_T2_OPEN, -999
        for ek in ALL_EXITS:
            rets = [t["exits"][ek] for t in train_trades
                    if gap_bucket(t["gapPct"], edges) == gb
                    and t["exits"].get(ek) is not None]
            if len(rets) >= min_n and rets:
                ev = sum(rets) / len(rets)
                if ev > best_ev:
                    best_ev, best_ek = ev, ek
        out[gb] = best_ek
    return out


def baseline_rets(trades):
    return [t["baselineRet"] for t in trades if t["baselineRet"] is not None]


# ── Bootstrap ─────────────────────────────────────────────
def bootstrap(trades, n_boot=1000, seed=42):
    """重抽 trades，分別套基線 + Rule B（用同一 exit_map），看 Δ EV 分佈。"""
    rng = random.Random(seed)
    n = len(trades)
    diffs, ev_b_list, ev_base_list = [], [], []
    for _ in range(n_boot):
        sample = [trades[rng.randrange(n)] for _ in range(n)]
        rb = apply_rule(sample, RULE_B_EXIT_MAP)
        bb = baseline_rets(sample)
        if not rb or not bb:
            continue
        ev_b = sum(rb) / len(rb)
        ev_base = sum(bb) / len(bb)
        diffs.append(ev_b - ev_base)
        ev_b_list.append(ev_b)
        ev_base_list.append(ev_base)
    diffs.sort()
    ev_b_list.sort()
    ev_base_list.sort()
    def pct(arr, p):
        if not arr:
            return None
        idx = max(0, min(len(arr) - 1, int(round(p * (len(arr) - 1)))))
        return round(arr[idx], 3)
    pos = sum(1 for d in diffs if d > 0)
    return {
        "nBoot": n_boot,
        "validBoot": len(diffs),
        "evDiffMean": round(mean(diffs), 3) if diffs else None,
        "evDiffP05": pct(diffs, 0.05),
        "evDiffP50": pct(diffs, 0.50),
        "evDiffP95": pct(diffs, 0.95),
        "prDiffPositive": round(pos / len(diffs) * 100, 1) if diffs else None,
        "ruleB_EV_p05": pct(ev_b_list, 0.05),
        "ruleB_EV_p50": pct(ev_b_list, 0.50),
        "ruleB_EV_p95": pct(ev_b_list, 0.95),
        "base_EV_p05": pct(ev_base_list, 0.05),
        "base_EV_p50": pct(ev_base_list, 0.50),
        "base_EV_p95": pct(ev_base_list, 0.95),
    }


# ── 閾值靈敏度：移動 gap 邊界 ±10% ────────────────────────
def shifted_buckets(scale):
    """把 (lo, hi) 按 scale 縮放（保留 neg<0 與 10+ 範圍）。"""
    out = []
    for name, lo, hi in GAP_BUCKETS:
        if lo == -100:  # neg 不動
            out.append((name, lo, hi))
        elif hi == 100:  # 10+ 只移動 lo
            out.append((name, lo * scale, hi))
        else:
            out.append((name, lo * scale, hi * scale))
    return out


def edge_sensitivity(trades):
    """對 0/3/5/8/10 邊界 ±10% 觀察 EV 變動。"""
    out = {}
    for scale in [0.9, 0.95, 1.0, 1.05, 1.1]:
        edges = shifted_buckets(scale)
        # 用同一 RULE_B_EXIT_MAP（key 維持原桶名）
        rets = apply_rule(trades, RULE_B_EXIT_MAP, edges=edges)
        if rets:
            out[f"scale_{scale}"] = {
                "n": len(rets),
                "evPct": round(mean(rets), 3),
                "winRate": round(sum(1 for r in rets if r > 0) / len(rets) * 100, 1),
            }
    return out


# ── 桶內最佳 vs 次佳出場差距 ──────────────────────────────
def best_vs_second(trades):
    """每桶按 EV 排序，看最佳與第二、第三的 EV 差。差太大 + n 小 = 過擬合徵兆。"""
    out = {}
    for gb, _, _ in GAP_BUCKETS:
        sub = [t for t in trades if gap_bucket(t["gapPct"]) == gb]
        if not sub:
            continue
        ranks = []
        for ek in ALL_EXITS:
            rets = [t["exits"][ek] for t in sub if t["exits"].get(ek) is not None]
            if rets:
                ranks.append({
                    "exit": ek,
                    "n": len(rets),
                    "evPct": round(mean(rets), 3),
                    "winRate": round(sum(1 for r in rets if r > 0) / len(rets) * 100, 1),
                })
        ranks.sort(key=lambda x: x["evPct"], reverse=True)
        out[gb] = {
            "n": len(sub),
            "best": ranks[0] if ranks else None,
            "second": ranks[1] if len(ranks) > 1 else None,
            "ruleBchoice": RULE_B_EXIT_MAP.get(gb),
            "gapBestSecond_pp": (round(ranks[0]["evPct"] - ranks[1]["evPct"], 3)
                                  if len(ranks) > 1 else None),
            "ranks": ranks,
        }
    return out


# ── 隨機 exit_map 比較（null distribution）─────────────────
def random_exit_map_distribution(trades, n_iter=500, seed=7):
    """隨機指派每桶出場，看 EV 分佈。若 Rule B 在分佈尾部 = 有效；否則 = 過擬合或運氣。"""
    rng = random.Random(seed)
    evs = []
    keys = [gb for gb, _, _ in GAP_BUCKETS]
    for _ in range(n_iter):
        rand_map = {k: ALL_EXITS[rng.randrange(len(ALL_EXITS))] for k in keys}
        rets = apply_rule(trades, rand_map)
        if rets:
            evs.append(sum(rets) / len(rets))
    evs.sort()
    rule_b_rets = apply_rule(trades, RULE_B_EXIT_MAP)
    rule_b_ev = mean(rule_b_rets) if rule_b_rets else None
    if rule_b_ev is None or not evs:
        return {"iters": n_iter, "ruleB_percentile": None}
    rank = sum(1 for e in evs if e <= rule_b_ev)
    return {
        "iters": n_iter,
        "ruleB_EV": round(rule_b_ev, 3),
        "rand_EV_p05": round(evs[int(0.05 * len(evs))], 3),
        "rand_EV_p50": round(evs[int(0.5 * len(evs))], 3),
        "rand_EV_p95": round(evs[int(0.95 * len(evs))], 3),
        "ruleB_percentileVsRandom": round(rank / len(evs) * 100, 1),
        "note": "百分位接近 100 表示 Rule B 比隨機好；50 附近表示無實質差別",
    }


# ── 月度退化檢測：LOO 樣本外，每月 EV 差距 ────────────────
def loo_oos_breakdown(trades):
    months = sorted({t["entryDate"][:7] for t in trades})
    out = []
    all_oos_rets = []
    for m in months:
        train = [t for t in trades if t["entryDate"][:7] != m]
        test = [t for t in trades if t["entryDate"][:7] == m]
        emap = fit_best_map(train, min_n=5)
        test_rets = apply_rule(test, emap)
        train_in_rets = apply_rule(train, emap)
        # 同樣 train_in_rets 用 train 的 in-sample map，看 in vs out
        out.append({
            "holdout": m,
            "test_n": len(test_rets),
            "test_EV": round(mean(test_rets), 3) if test_rets else None,
            "test_WR": round(sum(1 for r in test_rets if r > 0) / len(test_rets) * 100, 1)
                       if test_rets else None,
            "train_inSample_EV": round(mean(train_in_rets), 3) if train_in_rets else None,
            "trainMap": emap,
        })
        all_oos_rets.extend(test_rets)
    summary = (stat_pack(all_oos_rets)
               if all_oos_rets else {"n": 0, "evPct": None, "winRate": None})
    return {"summary": summary, "perHoldout": out}


# ── Main ─────────────────────────────────────────────────
def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("載入...")
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

    trades = collect_trades(pick_days, bars_map)
    print(f"trades={len(trades)}")

    base = stat_pack(baseline_rets(trades))
    rule_b = stat_pack(apply_rule(trades, RULE_B_EXIT_MAP))
    print(f"baseline: {base}")
    print(f"ruleB:    {rule_b}")

    boot = bootstrap(trades, n_boot=1000)
    print(f"\nBootstrap Δ EV mean={boot['evDiffMean']} p05={boot['evDiffP05']} p95={boot['evDiffP95']}")
    print(f"  Pr(ruleB > baseline) = {boot['prDiffPositive']}%")

    sens = edge_sensitivity(trades)
    print("\n邊界靈敏度 (gap edges scaled):")
    for k, v in sens.items():
        print(f"  {k}: n={v['n']} EV={v['evPct']:+.3f}% WR={v['winRate']}%")

    bvs = best_vs_second(trades)
    print("\n桶內最佳 vs 次佳出場 EV 差:")
    for gb, info in bvs.items():
        if info["best"]:
            print(f"  gap {gb:6s} n={info['n']}  best={info['best']['exit']}({info['best']['evPct']:+.2f}) "
                  f"second={info['second']['exit'] if info['second'] else '-'}"
                  f"({info['second']['evPct'] if info['second'] else None}) "
                  f"gap_pp={info['gapBestSecond_pp']}")

    rnd = random_exit_map_distribution(trades, n_iter=500)
    print(f"\n隨機 exit_map 分佈: RuleB 在隨機分佈中的百分位 = {rnd['ruleB_percentileVsRandom']}%")

    loo = loo_oos_breakdown(trades)
    print(f"\nLeave-One-Month-Out 樣本外總計: {loo['summary']}")
    for h in loo["perHoldout"]:
        print(f"  holdout {h['holdout']}: test_n={h['test_n']} test_EV={h['test_EV']} "
              f"train_inSample_EV={h['train_inSample_EV']}")

    # 將 8-10 桶 T2_open vs 其他出場差距特別檢視
    bucket_8_10 = bvs.get("8-10", {})
    bucket_10p = bvs.get("10+", {})

    out = {
        "meta": {
            "scoreMin": SCORE_MIN,
            "costRtPct": round(COST_RT, 4),
            "ruleBExitMap": RULE_B_EXIT_MAP,
            "n_trades": len(trades),
        },
        "baseline": base,
        "ruleB": rule_b,
        "bootstrap": boot,
        "edgeSensitivity": sens,
        "bestVsSecond": bvs,
        "randomMapDistribution": rnd,
        "looOOS": loo,
        "redFlags": {
            "smallBuckets": {
                "8-10": bucket_8_10.get("n"),
                "10+": bucket_10p.get("n"),
            },
            "bucket_8_10_anomaly": {
                "note": "8-10 桶 T2_open EV vs 其他出場差距 — 強烈過擬合徵兆",
                "ranks": bucket_8_10.get("ranks"),
            },
            "loo_degradation": {
                "inSample_EV": rule_b.get("evPct"),
                "outOfSample_EV": loo["summary"].get("evPct"),
                "degradationPct": (
                    round((rule_b["evPct"] - loo["summary"]["evPct"]) / rule_b["evPct"] * 100, 1)
                    if rule_b.get("evPct") and loo["summary"].get("evPct") else None
                ),
            },
        },
    }

    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=2)
    print(f"\n結果存至 {OUT_PATH}")


if __name__ == "__main__":
    main()
