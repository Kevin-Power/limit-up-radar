"""樣本外驗證：POSITIVE TILT 規則
  rule: category ∈ {'個股亮點', '光通訊 / 矽光子'} AND cluster_size ≤ 7
  baseline: score>=75, T+1 open buy, T+2 open sell, cost round-trip = 0.3798%

方法：
  1. 收集所有交易（同 analyze_categories.py 邏輯）依 pickDate 升冪排序
  2. 70/30 train/test split（時間切，非隨機）
  3. 訓練段內：套用規則統計（驗證原聲稱效果）
  4. 測試段：套用同一規則，看勝率/EV 是否衰退
  5. 月份分解：特別看 2026-06（已知失效月）規則能否救援
"""
import json
import os
import sys
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs

SCORE_MIN = 75
COST = 0.0399 * 2 + 0.30   # 0.3798%
POSITION_TWD = 1_000_000

CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_FILE = "data/opt_oos_positive_tilt.json"

POSITIVE_CATS = {"個股亮點", "光通訊 / 矽光子"}
CLUSTER_MAX = 7


def load_bars(code, date):
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as fp:
            d = json.load(fp)
        return d if d else None
    except Exception:
        return None


def first_open(bars):
    if not bars:
        return None
    return bars[0]["open"]


def build_pick_categories(days):
    out = {}
    for d in days:
        date = d["date"]
        for g in d["groups"]:
            for s in g["stocks"]:
                key = (date, s["code"])
                out.setdefault(key, []).append(g["name"])
    return out


def collect_trades(days, rev_maps, hw, disp, pick_cats):
    trades = []
    for i in range(len(days) - 2):
        pick_date = days[i]["date"]
        entry_date = days[i + 1]["date"]
        exit_date = days[i + 2]["date"]

        picks = hs.reconstruct_picks(days, i, rev_maps, hw, disp, cap=None)
        picks = [p for p in picks if p["score"] >= SCORE_MIN]
        if not picks:
            continue

        for p in picks:
            entry_bars = load_bars(p["code"], entry_date)
            exit_bars = load_bars(p["code"], exit_date)
            if not entry_bars or not exit_bars:
                continue
            entry = first_open(entry_bars)
            exit_p = first_open(exit_bars)
            if not entry or not exit_p:
                continue
            gross = (exit_p - entry) / entry * 100
            net = gross - COST
            cats = pick_cats.get((pick_date, p["code"]), [])
            trades.append({
                "pickDate": pick_date,
                "entryDate": entry_date,
                "exitDate": exit_date,
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "net": round(net, 4),
                "categories": cats,
            })
    return trades


def stat_block(rets):
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "evPct": None, "median": None,
                "totalPct": 0, "totalTWD": 0, "maxWin": None, "maxLoss": None}
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "evPct": round(sum(rets) / n, 3),
        "median": round(median(rets), 3),
        "totalPct": round(sum(rets), 2),
        "totalTWD": round(sum(rets) / 100 * POSITION_TWD, 0),
        "maxWin": round(max(rets), 2),
        "maxLoss": round(min(rets), 2),
    }


def compute_cluster_sizes(trades):
    """(pickDate, category) -> 同日同族群檔數。需用全樣本算（不偏誤未來資訊）
    注意：cluster_size 在 pickDate 收盤就能算出（不需未來資料），所以 train/test 各自算。"""
    sz = defaultdict(int)
    for t in trades:
        for c in t["categories"]:
            sz[(t["pickDate"], c)] += 1
    return sz


def apply_rule(trades, cluster_sz):
    """套用 POSITIVE TILT：任一族群屬於白名單 AND 該族群當日 cluster ≤ 7"""
    kept, dropped = [], []
    for t in trades:
        match = False
        for c in t["categories"]:
            if c in POSITIVE_CATS:
                size = cluster_sz.get((t["pickDate"], c), 1)
                if size <= CLUSTER_MAX:
                    match = True
                    break
        if match:
            kept.append(t)
        else:
            dropped.append(t)
    return kept, dropped


def report_segment(trades, label):
    """對一段時間的交易跑「基線 vs 規則」對比。cluster_sz 用該段自身算。"""
    cluster_sz = compute_cluster_sizes(trades)
    kept, dropped = apply_rule(trades, cluster_sz)
    base_rets = [t["net"] for t in trades]
    kept_rets = [t["net"] for t in kept]
    dropped_rets = [t["net"] for t in dropped]
    return {
        "label": label,
        "dateRange": {
            "from": min(t["pickDate"] for t in trades) if trades else None,
            "to": max(t["pickDate"] for t in trades) if trades else None,
        },
        "baseline": stat_block(base_rets),
        "rule_kept": stat_block(kept_rets),
        "rule_dropped": stat_block(dropped_rets),
        "tradesKept": [{"pickDate": t["pickDate"], "code": t["code"], "name": t["name"],
                        "categories": t["categories"], "net": t["net"]} for t in kept],
    }


def monthly_breakdown(trades, cluster_sz):
    bucket_base = defaultdict(list)
    bucket_kept = defaultdict(list)
    kept_codes_per_month = defaultdict(list)
    for t in trades:
        m = t["pickDate"][:7]
        bucket_base[m].append(t["net"])
        match = False
        for c in t["categories"]:
            if c in POSITIVE_CATS:
                size = cluster_sz.get((t["pickDate"], c), 1)
                if size <= CLUSTER_MAX:
                    match = True
                    break
        if match:
            bucket_kept[m].append(t["net"])
            kept_codes_per_month[m].append({"date": t["pickDate"], "code": t["code"],
                                            "name": t["name"], "net": t["net"]})
    months = sorted(set(list(bucket_base.keys()) + list(bucket_kept.keys())))
    out = {}
    for m in months:
        out[m] = {
            "baseline": stat_block(bucket_base.get(m, [])),
            "rule_kept": stat_block(bucket_kept.get(m, [])),
            "keptDetail": kept_codes_per_month.get(m, []),
        }
    return out


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    pick_cats = build_pick_categories(days)

    trades = collect_trades(days, rev_maps, hw, disp, pick_cats)
    trades.sort(key=lambda t: (t["pickDate"], t["code"]))
    n_total = len(trades)
    print(f"Total trades: {n_total}")

    # 70/30 切，依 pickDate
    pickDates = sorted({t["pickDate"] for t in trades})
    cut_idx = int(len(pickDates) * 0.7)
    train_dates = set(pickDates[:cut_idx])
    test_dates = set(pickDates[cut_idx:])
    print(f"Pick days: {len(pickDates)}, train={len(train_dates)}, test={len(test_dates)}")
    print(f"Train range: {min(train_dates)} ~ {max(train_dates)}")
    print(f"Test range: {min(test_dates)} ~ {max(test_dates)}")

    train_trades = [t for t in trades if t["pickDate"] in train_dates]
    test_trades = [t for t in trades if t["pickDate"] in test_dates]

    full_cluster = compute_cluster_sizes(trades)

    full_rep = report_segment(trades, "FULL")
    train_rep = report_segment(train_trades, "TRAIN(70%)")
    test_rep = report_segment(test_trades, "TEST(30%)")

    # 月份分解（用全樣本的 cluster）
    monthly = monthly_breakdown(trades, full_cluster)

    # 對齊原始聲稱：用全樣本的 cluster_sz 跑（=原 analyze_categories 邏輯）
    kept_full, _ = apply_rule(trades, full_cluster)
    claimed_check = stat_block([t["net"] for t in kept_full])

    # 落差計算
    def delta(train_stat, test_stat):
        if train_stat["n"] == 0 or test_stat["n"] == 0:
            return None
        return {
            "winRateDeltaPP": round(test_stat["winRate"] - train_stat["winRate"], 1),
            "evDeltaPct": round(test_stat["evPct"] - train_stat["evPct"], 3),
        }

    base_delta = delta(train_rep["baseline"], test_rep["baseline"])
    rule_delta = delta(train_rep["rule_kept"], test_rep["rule_kept"])

    print(f"\n=== CLAIMED CHECK (full sample, cluster<=7 + positive cats) ===")
    print(f"  n={claimed_check['n']} win={claimed_check['winRate']}% EV={claimed_check['evPct']}% total={claimed_check['totalPct']}%")
    print(f"  (聲稱 n=52 win=67.3% EV=3.39%)")

    print(f"\n=== TRAIN(70%) ===")
    print(f"  Baseline n={train_rep['baseline']['n']} win={train_rep['baseline']['winRate']}% EV={train_rep['baseline']['evPct']}%")
    print(f"  Rule_kept n={train_rep['rule_kept']['n']} win={train_rep['rule_kept']['winRate']}% EV={train_rep['rule_kept']['evPct']}%")

    print(f"\n=== TEST(30%) ===")
    print(f"  Baseline n={test_rep['baseline']['n']} win={test_rep['baseline']['winRate']}% EV={test_rep['baseline']['evPct']}%")
    print(f"  Rule_kept n={test_rep['rule_kept']['n']} win={test_rep['rule_kept']['winRate']}% EV={test_rep['rule_kept']['evPct']}%")
    if rule_delta:
        print(f"  Rule delta vs train: winRate {rule_delta['winRateDeltaPP']:+.1f}pp, EV {rule_delta['evDeltaPct']:+.2f}%")

    print(f"\n=== MONTHLY BREAKDOWN (rule_kept) ===")
    for m, blk in monthly.items():
        b = blk["baseline"]
        k = blk["rule_kept"]
        print(f"  {m}: BASE n={b['n']:3d} EV={b['evPct']}% | KEPT n={k['n']:3d} win={k['winRate']}% EV={k['evPct']}% total={k['totalPct']}%")
        if k["n"] > 0:
            for d in blk["keptDetail"]:
                print(f"      {d['date']} {d['code']} {d['name']} net={d['net']:+.2f}%")

    output = {
        "rule": "POSITIVE TILT: cat ∈ {個股亮點, 光通訊/矽光子} AND cluster<=7",
        "claimedEffect": {"n": 52, "winRate": 67.3, "evPct": 3.39},
        "validationMethod": "70/30 time split + monthly breakdown (focus on 2026-06)",
        "baselineParams": {"scoreMin": SCORE_MIN, "costRoundTripPct": COST,
                          "positionTWD": POSITION_TWD},
        "split": {
            "trainDates": [min(train_dates), max(train_dates)],
            "testDates": [min(test_dates), max(test_dates)],
            "trainPickDays": len(train_dates),
            "testPickDays": len(test_dates),
        },
        "fullSampleCheck": claimed_check,
        "train": train_rep,
        "test": test_rep,
        "monthly": {m: {"baseline": blk["baseline"], "rule_kept": blk["rule_kept"],
                        "keptDetail": blk["keptDetail"]} for m, blk in monthly.items()},
        "delta": {"baseline": base_delta, "rule_kept": rule_delta},
    }
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)
    print(f"\nSaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
