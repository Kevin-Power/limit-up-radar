"""Overfitting verification for the rule:
   POSITIVE TILT: '個股亮點' EV +3.13%, '光通訊/矽光子' EV +4.63% (n=9)
   combined with cluster (groupSize) <= 7.

   Strategy: T+1 open buy, T+2 open sell (entryType=open_price, score>=70).

   Tests:
     1. Sample size sanity
     2. Threshold sensitivity (cluster<=5,6,7,8,9,10,11,12)
     3. First-half vs second-half (date split)
     4. 1000-iter bootstrap on EV
     5. Per-rule contribution (individual group test)
"""
import json
import os
import random
import statistics
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs

# Constants - matched to baseline strategy
COST_OVERNIGHT_PCT = 0.38   # 2.8 折手續費 + 證交稅 (約 0.38%)
SCORE_MIN = 70
TARGET_GROUPS = {"個股亮點", "光通訊", "矽光子", "光通訊/矽光子"}
TARGET_GROUP_SUBSTRINGS = ["亮點", "光通訊", "矽光子"]
CLUSTER_THRESHOLD = 7

# Reuse intraday cache for D+1 open and D+2 open
INTRADAY_DIR = "data/intraday_cache"


def load_intraday(code, date):
    """Return list of bars or None if missing."""
    path = os.path.join(INTRADAY_DIR, f"{code}_{date}.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as fp:
            data = json.load(fp)
        # File may be either a list of bars or wrapped
        if isinstance(data, dict) and "bars" in data:
            return data["bars"]
        return data
    except Exception:
        return None


def opening_price(bars):
    """Return the open of the first bar (09:00)."""
    if not bars:
        return None
    bars_sorted = sorted(bars, key=lambda b: b.get("time", ""))
    return bars_sorted[0].get("open")


def group_matches(name):
    """Match flexible group naming."""
    if not name:
        return False
    return any(sub in name for sub in TARGET_GROUP_SUBSTRINGS)


def build_trades():
    """Recreate the picks under score>=70 with T+1 open entry / T+2 open exit.

    Returns list of trade dicts each containing:
      pickDate, entryDate, exitDate, code, name, score,
      groupName, clusterSize, groupMatch, retNet
    Skip trades where intraday cache is missing for entry or exit day.
    """
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    heavyweight, known_disposal = hs.load_categories()

    trades = []
    for i in range(len(days) - 2):  # need D+1 and D+2
        pick_date = days[i]["date"]
        entry_date = days[i + 1]["date"]
        exit_date = days[i + 2]["date"]
        picks = hs.reconstruct_picks(days, i, rev_maps, heavyweight, known_disposal, cap=None)
        if not picks:
            continue
        picks_70 = [p for p in picks if p["score"] >= SCORE_MIN]
        if not picks_70:
            continue

        # Build code -> (group_name, group_size) map from the pick day
        code_to_group = {}
        for g in days[i]["groups"]:
            gname = g["name"]
            gsize = len(g["stocks"])
            for s in g["stocks"]:
                # Only assign if not already (first wins)
                if s["code"] not in code_to_group:
                    code_to_group[s["code"]] = (gname, gsize)

        for p in picks_70:
            entry_bars = load_intraday(p["code"], entry_date)
            if not entry_bars:
                continue
            exit_bars = load_intraday(p["code"], exit_date)
            if not exit_bars:
                continue
            entry_open = opening_price(entry_bars)
            exit_open = opening_price(exit_bars)
            if entry_open is None or exit_open is None or entry_open <= 0:
                continue
            gross_pct = (exit_open - entry_open) / entry_open * 100
            net_pct = gross_pct - COST_OVERNIGHT_PCT
            gname, gsize = code_to_group.get(p["code"], ("", 0))
            trades.append({
                "pickDate": pick_date,
                "entryDate": entry_date,
                "exitDate": exit_date,
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "groupName": gname,
                "clusterSize": gsize,
                "groupMatch": group_matches(gname),
                "retNet": round(net_pct, 4),
            })
    return trades


def summarize(rets):
    if not rets:
        return {"n": 0, "winRate": None, "ev": None, "total": None, "median": None}
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": len(rets),
        "winRate": round(wins / len(rets) * 100, 2),
        "ev": round(statistics.mean(rets), 4),
        "total": round(sum(rets), 2),
        "median": round(statistics.median(rets), 4),
    }


def filter_rule(trades, cluster_max, require_group_match=True):
    """The proposed rule: group is in target list AND clusterSize <= cluster_max."""
    out = []
    for t in trades:
        if require_group_match and not t["groupMatch"]:
            continue
        if t["clusterSize"] > cluster_max:
            continue
        out.append(t)
    return out


def split_half_by_date(trades):
    """Split into first half / second half by pickDate."""
    sorted_t = sorted(trades, key=lambda t: t["pickDate"])
    half = len(sorted_t) // 2
    return sorted_t[:half], sorted_t[half:]


def bootstrap_ev(rets, n_iter=1000, seed=42):
    """Resample with replacement, compute distribution of mean."""
    if not rets:
        return None
    rng = random.Random(seed)
    n = len(rets)
    samples = []
    for _ in range(n_iter):
        boot = [rets[rng.randrange(n)] for _ in range(n)]
        samples.append(statistics.mean(boot))
    samples.sort()
    return {
        "iterations": n_iter,
        "mean": round(statistics.mean(samples), 4),
        "ci5": round(samples[int(0.05 * n_iter)], 4),
        "ci25": round(samples[int(0.25 * n_iter)], 4),
        "ci50": round(samples[int(0.50 * n_iter)], 4),
        "ci75": round(samples[int(0.75 * n_iter)], 4),
        "ci95": round(samples[int(0.95 * n_iter)], 4),
        "pPositive": round(sum(1 for s in samples if s > 0) / n_iter * 100, 2),
        "pAboveCost": round(sum(1 for s in samples if s > 0.5) / n_iter * 100, 2),
    }


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("Building trades (score>=70, T+1 open buy, T+2 open sell)...")
    trades = build_trades()
    print(f"Total reconstructed trades: {len(trades)}")

    # Group name distribution among matched trades
    name_counter = defaultdict(int)
    for t in trades:
        if t["groupMatch"]:
            name_counter[t["groupName"]] += 1
    print(f"Matched group names: {dict(name_counter)}")

    # Baseline (all score>=70)
    baseline = summarize([t["retNet"] for t in trades])
    print(f"Baseline (all): {baseline}")

    # The proposed rule
    rule_trades = filter_rule(trades, CLUSTER_THRESHOLD, require_group_match=True)
    rule_summary = summarize([t["retNet"] for t in rule_trades])
    print(f"Proposed rule (target groups + cluster<={CLUSTER_THRESHOLD}): {rule_summary}")

    # Sensitivity: vary cluster threshold +/-
    cluster_sweep = {}
    for ct in [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 999]:
        sub = filter_rule(trades, ct, require_group_match=True)
        cluster_sweep[ct] = summarize([t["retNet"] for t in sub])
    print("Cluster threshold sweep:")
    for ct, s in cluster_sweep.items():
        print(f"  cluster<={ct}: {s}")

    # Group-only (no cluster filter)
    group_only = [t for t in trades if t["groupMatch"]]
    group_only_summary = summarize([t["retNet"] for t in group_only])
    print(f"Group-only (no cluster): {group_only_summary}")

    # Per-group breakdown
    per_group = {}
    for name in set(t["groupName"] for t in trades if t["groupMatch"]):
        sub = [t for t in trades if t["groupName"] == name]
        per_group[name] = summarize([t["retNet"] for t in sub])
    print(f"Per-group: {per_group}")

    # Per-group with cluster filter
    per_group_clustered = {}
    for name in set(t["groupName"] for t in rule_trades):
        sub = [t for t in rule_trades if t["groupName"] == name]
        per_group_clustered[name] = summarize([t["retNet"] for t in sub])

    # Date-split (first vs second half) on the rule
    fh, sh = split_half_by_date(rule_trades)
    first_half = summarize([t["retNet"] for t in fh])
    second_half = summarize([t["retNet"] for t in sh])
    print(f"First half (rule): {first_half}")
    print(f"Second half (rule): {second_half}")

    # Date-split on baseline for reference
    fh_b, sh_b = split_half_by_date(trades)
    first_half_base = summarize([t["retNet"] for t in fh_b])
    second_half_base = summarize([t["retNet"] for t in sh_b])

    # Monthly breakdown
    monthly = defaultdict(list)
    for t in rule_trades:
        ym = t["pickDate"][:7]
        monthly[ym].append(t["retNet"])
    monthly_summary = {ym: summarize(rs) for ym, rs in sorted(monthly.items())}
    print(f"Monthly (rule): {monthly_summary}")

    # Bootstrap on the rule
    boot = bootstrap_ev([t["retNet"] for t in rule_trades], n_iter=1000)
    print(f"Bootstrap (rule, 1000 iter): {boot}")

    # Bootstrap on group-only
    boot_group = bootstrap_ev([t["retNet"] for t in group_only], n_iter=1000)

    # Held-out test: lock cluster<=7, vary group inclusion (leave-one-out by group)
    leave_one_out = {}
    matched_groups = sorted(set(t["groupName"] for t in rule_trades))
    for excluded in matched_groups:
        sub = [t for t in rule_trades if t["groupName"] != excluded]
        leave_one_out[f"exclude_{excluded}"] = summarize([t["retNet"] for t in sub])

    # Compare rule to baseline more carefully
    is_consistent = (
        first_half["ev"] is not None and second_half["ev"] is not None
        and first_half["ev"] > 0 and second_half["ev"] > 0
    )

    output = {
        "rule": "個股亮點 OR 光通訊/矽光子, cluster<=7",
        "claim": {"ev": 3.39, "winRate": 67.3, "n": 52},
        "actual": {
            "baseline_all": baseline,
            "rule_combined": rule_summary,
            "group_only_no_cluster": group_only_summary,
            "per_group_no_cluster": per_group,
            "per_group_with_cluster": per_group_clustered,
        },
        "sensitivity": {
            "cluster_sweep": cluster_sweep,
            "leave_one_group_out": leave_one_out,
        },
        "robustness": {
            "first_half": first_half,
            "second_half": second_half,
            "first_half_baseline": first_half_base,
            "second_half_baseline": second_half_base,
            "monthly": monthly_summary,
            "consistent_across_halves": is_consistent,
        },
        "bootstrap": {
            "rule": boot,
            "group_only": boot_group,
        },
        "diagnostics": {
            "matched_group_names": dict(name_counter),
            "n_target_groups": len(matched_groups),
        },
    }

    out_file = "data/opt_verify_highlight_silicon.json"
    with open(out_file, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)
    print(f"\nSaved: {out_file}")


if __name__ == "__main__":
    main()
