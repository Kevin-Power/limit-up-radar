"""
分析「score>=75 AND gap>=5% → T+2 開盤出場」優化的實戰可執行性。

關鍵實戰問題：
1. gap%必須在 T+1 09:00 開盤後才知 → 09:00:00 競價單就掛不出此規則
2. T+1 開盤即漲停 (gap>=9.5%) 的標的，掛單也買不到
3. 同日多檔觸發時的資金/精力限制
4. 持有到 T+2 開盤包含一次隔夜，跳空風險
5. 「競價開盤價」是否能成交（無撮合量？）
"""
import json
import os
import sys
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs                               # noqa: E402
from run_backtest_0903 import build_pick_days          # noqa: E402

COMMISSION_RT = 0.1425 * 0.28 * 2 / 100
TAX = 0.003
COST_RT = (COMMISSION_RT + TAX) * 100  # 0.3798%

SCORE_MIN = 75
GAP_MIN = 5.0
LIMIT_UP_THRESHOLD = 9.5  # T+1 開盤漲幅達此 → 視為「無法買進」
CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "opt_gap5_score75_exec.json")


def load_cache(code, date):
    p = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)

    print("載入 daily / 營收 / 分類 ...")
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    pick_days = build_pick_days(days, rev_maps, hw, disp)
    print(f"pick_days: {len(pick_days)}")

    # 預載 intraday cache
    # 注意：entryDate = T+1 (進場), nextDate = T+2 (出場)
    needed = set()
    for d in pick_days:
        if not d.get("nextDate"):
            continue
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            needed.add((p["code"], d["entryDate"]))
            needed.add((p["code"], d["nextDate"]))
    bars_map = {}
    hit = 0
    for (c, dt) in needed:
        b = load_cache(c, dt)
        bars_map[(c, dt)] = b if b else []
        if b:
            hit += 1
    print(f"快取命中 {hit}/{len(needed)}")

    # 對 score>=75 標的，篩 gap>=5%，分析可執行性
    rows = []
    score75_count = 0
    no_intra_count = 0
    bad_open_count = 0

    for d in pick_days:
        if not d.get("nextDate"):
            continue
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            score75_count += 1
            # entryDate = T+1 進場日; nextDate = T+2 出場日
            t1_bars = bars_map.get((p["code"], d["entryDate"]), [])
            if not t1_bars:
                no_intra_count += 1
                continue
            t1_open = t1_bars[0]["open"]
            prev_close = p["prevClose"]  # T0 收盤
            if t1_open <= 0 or prev_close <= 0:
                bad_open_count += 1
                continue
            gap_pct = (t1_open - prev_close) / prev_close * 100
            if gap_pct < GAP_MIN:
                continue

            # T+2 開盤
            t2_open = None
            t2_date = d.get("nextDate")
            if t2_date:
                t2_bars = bars_map.get((p["code"], t2_date), [])
                if t2_bars:
                    t2_open = t2_bars[0]["open"]

            # 報酬
            ret_gross = None
            ret_net = None
            if t2_open and t2_open > 0:
                ret_gross = (t2_open - t1_open) / t1_open * 100
                ret_net = ret_gross - COST_RT

            # 第一分鐘 close → 用來判斷「能否在 09:00:01 後追進」
            first_min_close = t1_bars[0]["close"]
            first_min_high = t1_bars[0]["high"]
            first_min_low = t1_bars[0]["low"]
            # 第一分鐘 range
            first_min_range_pp = (first_min_high - first_min_low) / t1_open * 100 if t1_open else 0

            is_limit_up_open = gap_pct >= LIMIT_UP_THRESHOLD
            # 第一分鐘是否在漲停價附近 (close 距 prev_close 漲幅 >=9.5%)
            first_min_pct = (first_min_close - prev_close) / prev_close * 100
            stays_at_limit_at_t1m1 = first_min_pct >= LIMIT_UP_THRESHOLD

            rows.append({
                "code": p["code"],
                "t0_date": d["pickDate"],
                "t1_date": d["entryDate"],
                "t2_date": d.get("nextDate"),
                "score": p["score"],
                "prev_close": prev_close,
                "t1_open": round(t1_open, 3),
                "gap_pct": round(gap_pct, 3),
                "first_min_close": first_min_close,
                "first_min_pct": round(first_min_pct, 3),
                "first_min_range_pp": round(first_min_range_pp, 3),
                "is_limit_up_open": is_limit_up_open,
                "stays_at_limit_t1m1": stays_at_limit_at_t1m1,
                "t2_open": t2_open,
                "ret_gross": round(ret_gross, 3) if ret_gross is not None else None,
                "ret_net": round(ret_net, 3) if ret_net is not None else None,
            })

    print(f"score>=75: {score75_count}, gap>=5% filtered: {len(rows)}")

    # 同日觸發分布
    by_t0_date = defaultdict(list)
    for r in rows:
        by_t0_date[r["t0_date"]].append(r)
    concurrent_dist = defaultdict(int)
    for d, lst in by_t0_date.items():
        concurrent_dist[len(lst)] += 1
    for r in rows:
        r["concurrent_n"] = len(by_t0_date[r["t0_date"]])

    # 統計
    valid = [r for r in rows if r["ret_net"] is not None]
    n = len(valid)
    wins = sum(1 for r in valid if r["ret_net"] > 0)
    win_rate = round(wins / n * 100, 1) if n else 0
    ev_net = round(mean([r["ret_net"] for r in valid]), 3) if n else 0
    ev_gross = round(mean([r["ret_gross"] for r in valid]), 3) if n else 0

    # 排除漲停開盤無法買進的
    executable = [r for r in valid if not r["is_limit_up_open"]]
    ne = len(executable)
    win_e = sum(1 for r in executable if r["ret_net"] > 0)
    win_rate_e = round(win_e / ne * 100, 1) if ne else 0
    ev_e = round(mean([r["ret_net"] for r in executable]), 3) if ne else 0

    # 月別（可執行子集）
    month_stats = defaultdict(list)
    for r in executable:
        m = r["t0_date"][:7]
        month_stats[m].append(r["ret_net"])
    month_summary = {}
    for m, rets in sorted(month_stats.items()):
        if rets:
            month_summary[m] = {
                "n": len(rets),
                "evPct": round(mean(rets), 3),
                "winRate": round(sum(1 for x in rets if x > 0) / len(rets) * 100, 1),
            }

    # 同時觸發 N 檔的 EV
    ev_by_concurrent = defaultdict(list)
    for r in valid:
        ev_by_concurrent[r["concurrent_n"]].append(r["ret_net"])
    concurrent_ev = {
        str(k): {
            "n_samples": len(v),
            "evPct": round(mean(v), 3),
            "winRate": round(sum(1 for x in v if x > 0) / len(v) * 100, 1),
        }
        for k, v in sorted(ev_by_concurrent.items())
    }

    # 隔夜風險：T+2 開盤 vs T+1 收盤的跳空分布
    # 對 executable 標的：t1 close 與 t2 open 差距
    overnight_gaps = []
    for r in rows:
        t1_bars = bars_map.get((r["code"], r["t1_date"]), [])
        if t1_bars and r.get("t2_open"):
            t1_close = max(t1_bars, key=lambda x: x["time"])["close"]
            og = (r["t2_open"] - t1_close) / t1_close * 100 if t1_close else None
            if og is not None:
                overnight_gaps.append(og)
    overnight_summary = {}
    if overnight_gaps:
        overnight_gaps_sorted = sorted(overnight_gaps)
        overnight_summary = {
            "n": len(overnight_gaps),
            "mean_pp": round(mean(overnight_gaps), 3),
            "median_pp": round(median(overnight_gaps), 3),
            "p10_pp": round(overnight_gaps_sorted[int(len(overnight_gaps_sorted) * 0.1)], 3),
            "p90_pp": round(overnight_gaps_sorted[int(len(overnight_gaps_sorted) * 0.9)], 3),
            "negative_pct": round(sum(1 for g in overnight_gaps if g < 0) / len(overnight_gaps) * 100, 1),
            "large_drop_pct": round(sum(1 for g in overnight_gaps if g <= -3) / len(overnight_gaps) * 100, 1),
        }

    result = {
        "meta": {
            "rule": "score>=75 AND gap>=5% (T+1 開盤跳空 >=5%) → T+2 開盤出場",
            "claimed": {"winRate": 63, "evPct": 2.13},
            "cost_rt_pct": COST_RT,
            "limit_up_threshold": LIMIT_UP_THRESHOLD,
        },
        "filter_pipeline": {
            "total_score75_picks": score75_count,
            "no_t1_intraday": no_intra_count,
            "bad_open": bad_open_count,
            "passed_gap5": len(rows),
            "passed_gap5_pct_of_score75": round(len(rows) / max(score75_count, 1) * 100, 1),
        },
        "executability": {
            "total_triggered": len(rows),
            "t1_open_at_limit_up": sum(1 for r in rows if r["is_limit_up_open"]),
            "t1_open_at_limit_up_pct": round(
                sum(1 for r in rows if r["is_limit_up_open"]) / max(len(rows), 1) * 100, 1
            ),
            "stays_at_limit_after_1min": sum(1 for r in rows if r["stays_at_limit_t1m1"]),
        },
        "concurrent_distribution": {
            f"{k}_stocks_in_same_day": v for k, v in sorted(concurrent_dist.items())
        },
        "max_concurrent_same_day": max(concurrent_dist.keys()) if concurrent_dist else 0,
        "ev_by_concurrent_n": concurrent_ev,
        "performance_all_triggered": {
            "n": n,
            "winRate": win_rate,
            "evPct_gross": ev_gross,
            "evPct_net": ev_net,
        },
        "performance_executable_only": {
            "note": f"排除 T+1 開盤即漲停 (gap>={LIMIT_UP_THRESHOLD}%) 無法買進",
            "n": ne,
            "winRate": win_rate_e,
            "evPct_net": ev_e,
            "delta_from_claim_pp": round(ev_e - 2.13, 3),
        },
        "month_breakdown_executable": month_summary,
        "overnight_risk": overnight_summary,
        "critical_concerns": [
            "1_LOOKAHEAD: gap%在 T+1 09:00:00 開盤才確定 → 09:00 競價無法用此規則預掛單",
            "2_DECISION_TIMING: 必須等 09:00 開盤後才能下單，最快 09:00:30 ~ 09:01:00 才能執行，已偏離 09:00 競價",
            f"3_LIMIT_UP_BLOCK: {sum(1 for r in rows if r['is_limit_up_open'])}/{len(rows)} 在 T+1 開盤即漲停 (gap>=9.5%) → 掛單買不到",
            f"4_CONCURRENT: 最多單日 {max(concurrent_dist.keys()) if concurrent_dist else 0} 檔同時觸發，散戶實務難以全買",
            "5_OVERNIGHT_RISK: 持有跨夜跳空風險，6月小樣本中位數可能由幾筆大跳空主導",
        ],
        "sample_rows_head": rows[:30],
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"\nWritten: {OUT_PATH}")
    print(f"All triggered: n={n} WR={win_rate}% EV={ev_net}%")
    print(f"Executable only: n={ne} WR={win_rate_e}% EV={ev_e}%")
    print(f"Limit-up-open block: {sum(1 for r in rows if r['is_limit_up_open'])}/{len(rows)}")
    print(f"Max concurrent: {result['max_concurrent_same_day']}")
    print(f"Concurrent dist: {dict(concurrent_dist)}")


if __name__ == "__main__":
    main()
