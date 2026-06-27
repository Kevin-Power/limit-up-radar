"""樣本外驗證：score≥75 AND 0≤gap<5% → T+1 09:15 出場。

聲稱效果：勝率 72.7%、EV 2.066%、樣本 99 筆。

驗證方法：
  1. 70/30 切分（依時間排序，前 70% 為訓練、後 30% 為測試）
  2. 訓練 EV / 測試 EV 對比
  3. 月度逐月檢視（特別關注 2026-06）
  4. Walk-forward：用滾動訓練窗預測下一段
  5. 比較三條對照：
     · 基線 (score≥75, T+2 open)
     · 規則本體 (score≥75, gap 0~5, T+1 09:15)
     · 規則但用 T+2 open（看「出場時點」貢獻）
     · 規則但全 gap（看「gap 過濾」貢獻）

預設立場：基線 6 月失敗；若規則 6 月還是負，就不算 robust。
"""
import json
import math
import os
import sys
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs                                # noqa: E402
from run_backtest_0903 import build_pick_days           # noqa: E402

# 成本（2.8 折）
COMMISSION_RT = 0.1425 * 0.28 * 2 / 100
TAX = 0.003
COST_RT = (COMMISSION_RT + TAX) * 100   # 0.3798%

SCORE_MIN = 75
GAP_LO = 0.0
GAP_HI = 5.0
EXIT_TIME = "09:15"
CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "opt_oos_gap0to5_915exit.json")


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
                "ciLow": None, "ciHigh": None, "totalNetPct": 0}
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
    }


def collect_trades(pick_days, bars_map):
    """每筆 ≥75 分股票 → 計算 entry, gap, 各種出場價。"""
    trades = []
    for d in pick_days:
        if not d.get("nextDate"):
            continue
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
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

            # T+1 09:15 出場
            px_915 = bar_close_at_or_before(day_bars, EXIT_TIME)
            # T+1 收盤
            t1_close = max(day_bars, key=lambda x: x["time"])["close"]
            # T+2 開盤（基線）
            t2_open = next_bars[0]["open"]

            ret_915 = (px_915 - entry) / entry * 100 - COST_RT if px_915 else None
            ret_t1c = (t1_close - entry) / entry * 100 - COST_RT
            ret_t2o = (t2_open - entry) / entry * 100 - COST_RT

            trades.append({
                "pickDate": d["pickDate"],
                "entryDate": d["entryDate"],
                "nextDate": d["nextDate"],
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "prevClose": prev_close,
                "entry": round(entry, 3),
                "gapPct": round(gap_pct, 3),
                "ret_915": round(ret_915, 4) if ret_915 is not None else None,
                "ret_t1close": round(ret_t1c, 4),
                "ret_t2open": round(ret_t2o, 4),
            })
    return trades


def filter_rule(trades):
    """規則：score≥75 AND 0 ≤ gap < 5"""
    return [t for t in trades if GAP_LO <= t["gapPct"] < GAP_HI]


def replicate_claim(trades):
    """重現原始聲稱（in-sample）"""
    rule = filter_rule(trades)
    rets = [t["ret_915"] for t in rule if t["ret_915"] is not None]
    return stat_pack(rets), len(rule)


def split_70_30(trades):
    """按 entryDate 排序，前 70% 訓練、後 30% 測試"""
    s = sorted(trades, key=lambda t: (t["entryDate"], t["code"]))
    n = len(s)
    cut = int(n * 0.7)
    return s[:cut], s[cut:]


def monthly_breakdown(trades, ret_key):
    groups = defaultdict(list)
    for t in trades:
        r = t.get(ret_key)
        if r is not None:
            groups[t["entryDate"][:7]].append(r)
    return {m: stat_pack(v) for m, v in sorted(groups.items())}


def walk_forward(trades, train_months=3, test_months=1):
    """滾動 3 個月訓練 / 1 個月測試。
    若訓練段 EV>0 才在測試段交易，否則該月「不交易」。
    記錄每個 fold 的訓練 EV 與測試 EV。
    """
    months = sorted({t["entryDate"][:7] for t in trades})
    if len(months) < train_months + test_months:
        return []
    folds = []
    for i in range(len(months) - train_months - test_months + 1):
        train_ms = months[i:i + train_months]
        test_ms = months[i + train_months:i + train_months + test_months]
        train = [t for t in trades if t["entryDate"][:7] in train_ms]
        test = [t for t in trades if t["entryDate"][:7] in test_ms]
        train_rule = filter_rule(train)
        test_rule = filter_rule(test)
        train_rets = [t["ret_915"] for t in train_rule if t["ret_915"] is not None]
        test_rets = [t["ret_915"] for t in test_rule if t["ret_915"] is not None]
        train_ev = mean(train_rets) if train_rets else None
        test_ev = mean(test_rets) if test_rets else None
        # 條件交易：訓練 EV>0 才操作
        conditioned = test_rets if (train_ev is not None and train_ev > 0) else []
        folds.append({
            "trainMonths": train_ms,
            "testMonths": test_ms,
            "trainN": len(train_rets),
            "trainEv": round(train_ev, 3) if train_ev is not None else None,
            "testN": len(test_rets),
            "testEv": round(test_ev, 3) if test_ev is not None else None,
            "conditionalN": len(conditioned),
            "conditionalSum": round(sum(conditioned), 2),
        })
    return folds


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("[1/4] 載入 daily / 營收 / 分類 ...")
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
    hit = 0
    for (c, dt) in needed:
        b = load_cache(c, dt)
        bars_map[(c, dt)] = b if b else []
        if b:
            hit += 1
    print(f"[2/4] 選股日 {len(pick_days)}，1m K 快取 {hit}/{len(needed)}")

    trades = collect_trades(pick_days, bars_map)
    print(f"[3/4] 有效 ≥75 分交易 {len(trades)} 筆")

    # ── 1) 重現原始聲稱 ──
    in_sample_stats, _ = replicate_claim(trades)
    print(f"\n=== 重現 in-sample (rule on all data) ===")
    print(f"  n={in_sample_stats['n']} 勝率{in_sample_stats['winRate']}% "
          f"EV{in_sample_stats['evPct']}% (聲稱 99/72.7%/2.066%)")

    # 對照組：基線（全 ≥75，T+2 open）
    base_rets = [t["ret_t2open"] for t in trades]
    baseline = stat_pack(base_rets)
    # 對照：基線+0~5gap 過濾，仍 T+2 open
    base_with_gap = stat_pack([t["ret_t2open"] for t in filter_rule(trades)])
    # 對照：全 gap、09:15 出場
    all_gap_915 = stat_pack([t["ret_915"] for t in trades if t["ret_915"] is not None])

    # ── 2) 70/30 切分 ──
    train, test = split_70_30(trades)
    train_rule = filter_rule(train)
    test_rule = filter_rule(test)
    train_rets = [t["ret_915"] for t in train_rule if t["ret_915"] is not None]
    test_rets = [t["ret_915"] for t in test_rule if t["ret_915"] is not None]
    train_stats = stat_pack(train_rets)
    test_stats = stat_pack(test_rets)

    train_date_range = (min(t["entryDate"] for t in train), max(t["entryDate"] for t in train)) if train else (None, None)
    test_date_range = (min(t["entryDate"] for t in test), max(t["entryDate"] for t in test)) if test else (None, None)

    print(f"\n=== 70/30 樣本外 ===")
    print(f"  訓練 {train_date_range[0]}~{train_date_range[1]}: n={train_stats['n']} 勝率{train_stats['winRate']}% EV{train_stats['evPct']}%")
    print(f"  測試 {test_date_range[0]}~{test_date_range[1]}: n={test_stats['n']} 勝率{test_stats['winRate']}% EV{test_stats['evPct']}%")

    # 勝率落差
    wr_gap = None
    if train_stats["winRate"] is not None and test_stats["winRate"] is not None:
        wr_gap = round(train_stats["winRate"] - test_stats["winRate"], 1)
        print(f"  勝率落差 {wr_gap}pp（>10pp 視為失效）")
    ev_gap = None
    if train_stats["evPct"] is not None and test_stats["evPct"] is not None:
        ev_gap = round(train_stats["evPct"] - test_stats["evPct"], 3)
        print(f"  EV 落差 {ev_gap}pp")

    # ── 3) 月度逐月 ──
    rule_monthly_915 = monthly_breakdown(filter_rule(trades), "ret_915")
    base_monthly_t2o = monthly_breakdown(trades, "ret_t2open")
    all_gap_monthly_915 = monthly_breakdown(trades, "ret_915")

    print(f"\n=== 月度逐月（規則 vs 基線 vs 全gap+09:15）===")
    print(f"  {'月':8s} {'規則n':>5} {'規則EV%':>8} {'規則勝':>7} | {'基線n':>5} {'基線EV%':>8} | {'全gap9:15 n':>10} {'全gap9:15 EV%':>14}")
    months = sorted(set(list(rule_monthly_915.keys()) + list(base_monthly_t2o.keys())))
    for m in months:
        r = rule_monthly_915.get(m, {"n": 0, "evPct": None, "winRate": None})
        b = base_monthly_t2o.get(m, {"n": 0, "evPct": None})
        a = all_gap_monthly_915.get(m, {"n": 0, "evPct": None})
        print(f"  {m:8s} {r['n']:>5} {str(r['evPct']):>8} {str(r['winRate']):>7} | "
              f"{b['n']:>5} {str(b['evPct']):>8} | {a['n']:>10} {str(a['evPct']):>14}")

    # 特別檢查 6 月
    june_rule = rule_monthly_915.get("2026-06", {"n": 0})
    june_base = base_monthly_t2o.get("2026-06", {"n": 0})
    june_all915 = all_gap_monthly_915.get("2026-06", {"n": 0})

    # ── 4) Walk-forward (rolling 3m train / 1m test) ──
    wf = walk_forward(trades, train_months=3, test_months=1)
    print(f"\n=== Walk-forward (3m訓練→1m測試) ===")
    for f in wf:
        print(f"  train {f['trainMonths']}: n={f['trainN']} EV{f['trainEv']} → "
              f"test {f['testMonths']}: n={f['testN']} EV{f['testEv']}")

    # ── 5) 拆解貢獻 ──
    # 比較規則 vs 規則但用 T+2 open（看出場時點的價值）
    rule_t2o_rets = [t["ret_t2open"] for t in filter_rule(trades)]
    rule_t2o = stat_pack(rule_t2o_rets)
    rule_t1c_rets = [t["ret_t1close"] for t in filter_rule(trades)]
    rule_t1c = stat_pack(rule_t1c_rets)

    print(f"\n=== 拆解：哪一部分有效 ===")
    print(f"  基線(全 score≥75, T+2 open):           n={baseline['n']} 勝率{baseline['winRate']}% EV{baseline['evPct']}%")
    print(f"  + gap 0~5 過濾 (T+2 open):             n={base_with_gap['n']} 勝率{base_with_gap['winRate']}% EV{base_with_gap['evPct']}%")
    print(f"  + 全 gap, 09:15 出場:                  n={all_gap_915['n']} 勝率{all_gap_915['winRate']}% EV{all_gap_915['evPct']}%")
    print(f"  規則 (gap 0~5, 09:15):                 n={in_sample_stats['n']} 勝率{in_sample_stats['winRate']}% EV{in_sample_stats['evPct']}%")
    print(f"  規則但 T+1 收盤出場:                    n={rule_t1c['n']} 勝率{rule_t1c['winRate']}% EV{rule_t1c['evPct']}%")
    print(f"  規則但 T+2 開盤出場:                    n={rule_t2o['n']} 勝率{rule_t2o['winRate']}% EV{rule_t2o['evPct']}%")

    out = {
        "meta": {
            "scoreMin": SCORE_MIN,
            "gapBucket": [GAP_LO, GAP_HI],
            "exitTime": EXIT_TIME,
            "costRtPct": round(COST_RT, 4),
            "totalTradesAvailable": len(trades),
            "dateRange": {
                "from": min(t["entryDate"] for t in trades) if trades else None,
                "to": max(t["entryDate"] for t in trades) if trades else None,
            },
        },
        "claim": {
            "n": 99, "winRate": 72.7, "evPct": 2.066,
        },
        "inSampleReplication": in_sample_stats,
        "controls": {
            "baseline_all_score75_T2open": baseline,
            "gap0to5_T2open": base_with_gap,
            "allGap_915exit": all_gap_915,
            "rule_T1close_exit": rule_t1c,
            "rule_T2open_exit": rule_t2o,
        },
        "split7030": {
            "trainDateRange": train_date_range,
            "testDateRange": test_date_range,
            "train": train_stats,
            "test": test_stats,
            "winRateGapPp": wr_gap,
            "evGapPp": ev_gap,
        },
        "monthly": {
            "rule_915": rule_monthly_915,
            "baseline_t2open": base_monthly_t2o,
            "allGap_915": all_gap_monthly_915,
        },
        "june2026_special_check": {
            "rule_915": june_rule,
            "baseline_t2open": june_base,
            "allGap_915": june_all915,
            "verdict": "rule SAVES June" if (june_rule.get("evPct") is not None and june_rule["evPct"] > 0)
                       else "rule STILL LOSES in June" if june_rule.get("n", 0) > 0
                       else "rule NO SAMPLE in June",
        },
        "walkForward": wf,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=2)
    print(f"\n結果存至 {OUT_PATH}")


if __name__ == "__main__":
    main()
