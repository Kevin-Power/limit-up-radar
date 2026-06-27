"""過擬合驗證: score≥75 AND 0≤gap<5% → T+1 09:15 出場

聲稱效果: 勝率 72.7%, EV 2.066%, n=99, 相對基線 +2045000 元

從過擬合角度檢驗:
  1. 樣本大小 (n=99 vs 子樣本可能更小)
  2. 閾值是否事後最佳化?
     - gap 上下界 (-2/+2%, ±10%)
     - 出場時間 09:01/09:05/09:15/09:30
     - score 門檻 70/75/80
  3. 前後半時間穩定性 (split by date median)
  4. 月度穩定性 (per-month EV)
  5. Bootstrap 重抽 1000 次的 CI
  6. Leave-one-month-out
"""
import json
import os
import sys
import random
import math
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs                              # noqa: E402
from run_backtest_0903 import build_pick_days         # noqa: E402

COMMISSION_RT = 0.1425 * 0.28 * 2 / 100
TAX = 0.003
COST_RT = (COMMISSION_RT + TAX) * 100  # 0.3798 pp

SCORE_MIN = 75
CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "opt_verify_gap_0_5_0915.json")
NOMINAL = 1_000_000


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


def stat_pack(rets):
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "evPct": None, "median": None,
                "totalDeltaTWD": 0}
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "evPct": round(mean(rets), 3),
        "median": round(median(rets), 3),
        "totalDeltaTWD": round(sum(rets) / 100 * NOMINAL),
    }


def build_trades(pick_days, bars_map, score_min):
    """每筆 score≥score_min 的進場, 抓多個出場點。"""
    trades = []
    exit_grid = ["09:01", "09:03", "09:05", "09:10", "09:15",
                 "09:20", "09:30", "10:00", "11:30"]
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
            if prev_close <= 0:
                continue
            gap_pct = (entry - prev_close) / prev_close * 100
            exits = {}
            for tt in exit_grid:
                px = bar_close_at_or_before(day_bars, tt)
                exits[tt] = (
                    round((px - entry) / entry * 100 - COST_RT, 4)
                    if px is not None else None
                )
            t1_close = day_close(day_bars)
            exits["T1_close"] = (
                round((t1_close - entry) / entry * 100 - COST_RT, 4)
                if t1_close else None
            )
            t2_open = next_bars[0]["open"]
            exits["T2_open"] = (
                round((t2_open - entry) / entry * 100 - COST_RT, 4)
                if t2_open else None
            )
            trades.append({
                "pickDate": d["pickDate"],
                "entryDate": d["entryDate"],
                "code": p["code"],
                "score": p["score"],
                "gapPct": round(gap_pct, 3),
                "exits": exits,
            })
    return trades


def filter_by(trades, gap_lo, gap_hi, score_min, exit_key):
    """套規則 → list of returns。"""
    rets = []
    for t in trades:
        if t["score"] < score_min:
            continue
        if not (gap_lo <= t["gapPct"] < gap_hi):
            continue
        r = t["exits"].get(exit_key)
        if r is None:
            continue
        rets.append(r)
    return rets


def bootstrap_ci(rets, n_boot=1000, seed=42):
    """重抽 EV 與勝率 95% CI。"""
    rnd = random.Random(seed)
    if not rets:
        return {"evLo": None, "evHi": None, "wrLo": None, "wrHi": None,
                "evNegProb": None}
    evs = []
    wrs = []
    for _ in range(n_boot):
        samp = [rets[rnd.randrange(len(rets))] for _ in range(len(rets))]
        evs.append(mean(samp))
        wrs.append(sum(1 for r in samp if r > 0) / len(samp) * 100)
    evs.sort()
    wrs.sort()
    return {
        "evLo": round(evs[int(0.025 * n_boot)], 3),
        "evHi": round(evs[int(0.975 * n_boot)], 3),
        "wrLo": round(wrs[int(0.025 * n_boot)], 1),
        "wrHi": round(wrs[int(0.975 * n_boot)], 1),
        "evNegProb": round(sum(1 for e in evs if e < 0) / n_boot, 3),
        "evCostNegProb": round(sum(1 for e in evs if e < COST_RT) / n_boot, 3),
    }


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

    # 預載快取 (score≥70 以涵蓋鄰近閾值測試)
    needed = set()
    for d in pick_days:
        for p in d["picks"]:
            if p["score"] < 70:
                continue
            needed.add((p["code"], d["entryDate"]))
            if d.get("nextDate"):
                needed.add((p["code"], d["nextDate"]))
    bars_map = {}
    hit = 0
    for c, dt in needed:
        b = load_cache(c, dt)
        bars_map[(c, dt)] = b if b else []
        if b:
            hit += 1
    print(f"快取 {hit}/{len(needed)}")

    # 建立 score≥70 全部交易（含 70-74, 方便 score 閾值掃描）
    trades_70 = build_trades(pick_days, bars_map, score_min=70)
    print(f"score≥70 trades: {len(trades_70)}")
    trades_75 = [t for t in trades_70 if t["score"] >= 75]
    print(f"score≥75 trades: {len(trades_75)}")

    # ── 0. 重現主規則 ──
    main_rets = filter_by(trades_75, 0, 5, 75, "09:15")
    main_stat = stat_pack(main_rets)
    main_boot = bootstrap_ci(main_rets, n_boot=1000)
    print(f"\n主規則 score≥75 gap[0,5) 09:15 出場: {main_stat}")
    print(f"  Bootstrap 95% CI EV [{main_boot['evLo']}, {main_boot['evHi']}], "
          f"win [{main_boot['wrLo']}, {main_boot['wrHi']}]%")
    print(f"  EV<0 機率 {main_boot['evNegProb']}, EV<手續費 機率 {main_boot['evCostNegProb']}")

    # ── 1. 閾值敏感性: gap 邊界 ──
    gap_grid = []
    for lo in [-2, -1, 0, 1, 2]:
        for hi in [3, 4, 4.5, 5, 5.5, 6, 7]:
            if hi <= lo:
                continue
            rets = filter_by(trades_75, lo, hi, 75, "09:15")
            s = stat_pack(rets)
            gap_grid.append({"gapLo": lo, "gapHi": hi, **s})
    # 排序看主規則排第幾
    by_ev = sorted([g for g in gap_grid if g["n"] >= 30],
                   key=lambda x: x["evPct"] or -999, reverse=True)
    main_rank = next((i+1 for i, g in enumerate(by_ev)
                      if g["gapLo"] == 0 and g["gapHi"] == 5), None)
    print(f"\nGap 閾值掃描: 主規則 EV 排名 {main_rank}/{len(by_ev)} (n≥30)")
    print("  Top 5:")
    for g in by_ev[:5]:
        print(f"    gap[{g['gapLo']},{g['gapHi']}) n={g['n']} 勝率{g['winRate']}% EV{g['evPct']:+.3f}%")

    # ── 2. 出場時間敏感性 ──
    exit_grid_test = ["09:01", "09:03", "09:05", "09:10", "09:15",
                      "09:20", "09:30", "10:00", "11:30", "T1_close", "T2_open"]
    exit_scan = []
    for ek in exit_grid_test:
        rets = filter_by(trades_75, 0, 5, 75, ek)
        s = stat_pack(rets)
        exit_scan.append({"exit": ek, **s})
    print("\n出場時間掃描 (gap[0,5), score≥75):")
    for e in exit_scan:
        if e["n"]:
            mark = " ← 主" if e["exit"] == "09:15" else ""
            print(f"  {e['exit']:>9s} n={e['n']:>3} 勝率{e['winRate']}% EV{e['evPct']:+.3f}%{mark}")

    # ── 3. score 閾值敏感性 ──
    score_scan = []
    for sm in [70, 72, 74, 75, 76, 78, 80, 82, 85]:
        sub = [t for t in trades_70 if t["score"] >= sm]
        rets = filter_by(sub, 0, 5, sm, "09:15")
        s = stat_pack(rets)
        score_scan.append({"scoreMin": sm, **s})
    print("\nScore 閾值掃描 (gap[0,5), 09:15):")
    for e in score_scan:
        if e["n"]:
            mark = " ← 主" if e["scoreMin"] == 75 else ""
            print(f"  score≥{e['scoreMin']:>2} n={e['n']:>3} 勝率{e['winRate']}% EV{e['evPct']:+.3f}%{mark}")

    # ── 4. 時間穩定性: 前後半 (依日期) ──
    qualifying = [t for t in trades_75
                  if 0 <= t["gapPct"] < 5
                  and t["exits"].get("09:15") is not None]
    qualifying.sort(key=lambda t: t["entryDate"])
    half = len(qualifying) // 2
    h1 = [t["exits"]["09:15"] for t in qualifying[:half]]
    h2 = [t["exits"]["09:15"] for t in qualifying[half:]]
    h1_s = stat_pack(h1)
    h2_s = stat_pack(h2)
    h1_dates = (qualifying[0]["entryDate"], qualifying[half-1]["entryDate"]) if half else None
    h2_dates = (qualifying[half]["entryDate"], qualifying[-1]["entryDate"]) if half < len(qualifying) else None
    print(f"\n時間前後半 (依日期切):")
    print(f"  前半 {h1_dates}: {h1_s}")
    print(f"  後半 {h2_dates}: {h2_s}")

    # ── 5. 月度穩定性 ──
    by_month_rets = defaultdict(list)
    for t in qualifying:
        by_month_rets[t["entryDate"][:7]].append(t["exits"]["09:15"])
    monthly = {m: stat_pack(v) for m, v in sorted(by_month_rets.items())}
    print("\n月度:")
    for m, s in monthly.items():
        print(f"  {m} n={s['n']:>3} 勝率{s['winRate']}% EV{s['evPct']:+.3f}%")

    # ── 6. 連續日期窗 (rolling 10 天 EV) ──
    by_date = defaultdict(list)
    for t in qualifying:
        by_date[t["entryDate"]].append(t["exits"]["09:15"])
    dates = sorted(by_date.keys())
    rolling = []
    win = 10
    for i in range(len(dates) - win + 1):
        chunk = []
        for d in dates[i:i+win]:
            chunk.extend(by_date[d])
        if chunk:
            rolling.append({
                "from": dates[i], "to": dates[i+win-1],
                "n": len(chunk),
                "evPct": round(mean(chunk), 3),
                "winRate": round(sum(1 for r in chunk if r > 0) / len(chunk) * 100, 1),
            })

    # ── 7. Leave-one-month-out OOS ──
    months = sorted({t["entryDate"][:7] for t in qualifying})
    loo = []
    for m in months:
        test = [t for t in qualifying if t["entryDate"][:7] == m]
        rets = [t["exits"]["09:15"] for t in test]
        s = stat_pack(rets)
        loo.append({"holdout": m, **s})

    # ── 8. Bootstrap by-day (block bootstrap, 解決日內相關性) ──
    rnd = random.Random(7)
    day_lists = list(by_date.values())
    block_evs = []
    n_days = len(day_lists)
    for _ in range(1000):
        picks = [day_lists[rnd.randrange(n_days)] for _ in range(n_days)]
        flat = [r for lst in picks for r in lst]
        if flat:
            block_evs.append(mean(flat))
    block_evs.sort()
    block_ci = {
        "evLo": round(block_evs[25], 3),
        "evHi": round(block_evs[975], 3),
        "evNegProb": round(sum(1 for e in block_evs if e < 0) / 1000, 3),
    }
    print(f"\n按日 block bootstrap (處理日內相關性):")
    print(f"  EV 95% CI [{block_ci['evLo']}, {block_ci['evHi']}], EV<0 機率 {block_ci['evNegProb']}")

    # ── 9. 同樣規則套到 baseline 比較 ──
    base_rets = []
    for t in trades_75:
        if t["exits"].get("T2_open") is not None:
            base_rets.append(t["exits"]["T2_open"])
    base_s = stat_pack(base_rets)

    out = {
        "claim": {
            "rule": "score≥75 AND 0≤gap<5% → T+1 09:15 出場",
            "claimedN": 99,
            "claimedWinRate": 72.7,
            "claimedEvPct": 2.066,
            "claimedDeltaTwd": 2045000,
        },
        "reproduce": {
            "main": main_stat,
            "bootstrapCI": main_boot,
            "blockBootstrap": block_ci,
        },
        "baseline_score75_T2open": base_s,
        "robustness": {
            "gapBoundaryScan": gap_grid,
            "gapTopRanked": by_ev[:10],
            "mainGapRank": main_rank,
            "exitTimeScan": exit_scan,
            "scoreThresholdScan": score_scan,
            "halfSplit": {
                "h1": h1_s, "h2": h2_s,
                "h1Dates": h1_dates, "h2Dates": h2_dates,
            },
            "monthly": monthly,
            "leaveOneMonthOut": loo,
            "rolling10dayWindow": rolling,
        },
    }

    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=2)
    print(f"\n寫入 {OUT_PATH}")


if __name__ == "__main__":
    main()
