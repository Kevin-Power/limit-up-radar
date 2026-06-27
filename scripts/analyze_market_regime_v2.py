"""市場狀態過濾器 — 第二版：聚焦最有訊號的維度（精選池規模 + 大盤）。

第一版發現：picks75_le_15 過濾器讓 EV 從 1.92% → 4.26%，勝率 70%。
此版深入：
  - 精選池規模 cutoff 網格 (1~30)
  - 與大盤狀態組合
  - 月度穩健性檢查（避免只是「May 抓對」）
  - 留一交叉驗證（leave-one-month-out）
"""
import json
import math
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from run_backtest_0903 import build_pick_days

CACHE_DIR = os.path.join("data", "intraday_cache")
COST = 0.38
SCORE_MIN = int(os.environ.get("SCORE_MIN", "75"))
OUT_FILE = "data/opt_market_regime_v2.json"


def _load_cache(code, date):
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def collect_trades(pick_days, bars_map, score_min=SCORE_MIN):
    trades = []
    for d in pick_days:
        for p in d["picks"]:
            if p["score"] < score_min:
                continue
            day_bars = bars_map.get((p["code"], d["entryDate"]), [])
            next_bars = bars_map.get((p["code"], d["nextDate"]), []) if d.get("nextDate") else []
            if not day_bars or not next_bars:
                continue
            entry = day_bars[0]["open"]
            exit_p = next_bars[0]["open"]
            if entry <= 0:
                continue
            net = (exit_p - entry) / entry * 100 - COST
            trades.append({
                "pickDate": d["pickDate"], "entryDate": d["entryDate"], "nextDate": d["nextDate"],
                "code": p["code"], "name": p["name"], "score": p["score"],
                "ret": round(net, 4),
            })
    return trades


def per_day_stats(trades):
    """{pickDate: { n, totalRet, meanRet, winRate, picks75Count(已知前由 features 注入) }}"""
    by_day = {}
    for t in trades:
        by_day.setdefault(t["pickDate"], []).append(t)
    out = {}
    for d, ts in by_day.items():
        rets = [t["ret"] for t in ts]
        n = len(rets)
        wins = sum(1 for r in rets if r > 0)
        out[d] = {
            "n": n,
            "totalRet": round(sum(rets), 3),
            "meanRet": round(sum(rets) / n, 3),
            "winRate": round(wins / n * 100, 1),
        }
    return out


def grid_picks_cutoff(trades, pick_days, score_min=SCORE_MIN):
    """測試「當日 ≥75 精選 N 檔以下才執行」的 cutoff 網格 N=2..30。"""
    # 先建 pickDate → picks_n_75
    picks_count = {}
    for d in pick_days:
        n75 = sum(1 for p in d["picks"] if p["score"] >= score_min)
        picks_count[d["pickDate"]] = n75
    by_day = per_day_stats(trades)
    results = []
    cutoffs = list(range(2, 31))
    for cut in cutoffs:
        passed_rets, blocked_rets = [], []
        passed_days, blocked_days = set(), set()
        for t in trades:
            if picks_count.get(t["pickDate"], 0) <= cut:
                passed_rets.append(t["ret"])
                passed_days.add(t["pickDate"])
            else:
                blocked_rets.append(t["ret"])
                blocked_days.add(t["pickDate"])
        n_pass = len(passed_rets)
        n_block = len(blocked_rets)
        results.append({
            "cutoff": cut,
            "passDays": len(passed_days),
            "passTrades": n_pass,
            "passWinRate": round(sum(1 for r in passed_rets if r > 0) / n_pass * 100, 1) if n_pass else None,
            "passEV": round(sum(passed_rets) / n_pass, 3) if n_pass else None,
            "passTotalPct": round(sum(passed_rets), 2) if n_pass else 0,
            "blockTrades": n_block,
            "blockEV": round(sum(blocked_rets) / n_block, 3) if n_block else None,
            "blockTotalPct": round(sum(blocked_rets), 2) if n_block else 0,
        })
    return results, picks_count


def grid_avgscore_cutoff(trades, pick_days, score_min=SCORE_MIN):
    """當日 ≥75 精選的「平均分數」cutoff（過高 = 過熱）。"""
    avg_score = {}
    for d in pick_days:
        ps = [p for p in d["picks"] if p["score"] >= score_min]
        if ps:
            avg_score[d["pickDate"]] = sum(p["score"] for p in ps) / len(ps)
        else:
            avg_score[d["pickDate"]] = 0
    results = []
    cutoffs = [80, 82, 84, 85, 86, 87, 88, 90, 92]
    for cut in cutoffs:
        passed_rets, blocked_rets = [], []
        passed_days, blocked_days = set(), set()
        for t in trades:
            if avg_score.get(t["pickDate"], 0) <= cut:
                passed_rets.append(t["ret"])
                passed_days.add(t["pickDate"])
            else:
                blocked_rets.append(t["ret"])
                blocked_days.add(t["pickDate"])
        n_pass = len(passed_rets); n_block = len(blocked_rets)
        results.append({
            "cutoff": cut,
            "passDays": len(passed_days),
            "passTrades": n_pass,
            "passWinRate": round(sum(1 for r in passed_rets if r > 0) / n_pass * 100, 1) if n_pass else None,
            "passEV": round(sum(passed_rets) / n_pass, 3) if n_pass else None,
            "passTotalPct": round(sum(passed_rets), 2) if n_pass else 0,
            "blockEV": round(sum(blocked_rets) / n_block, 3) if n_block else None,
        })
    return results


def grid_vol5_cutoff(trades, days):
    """近 5 日大盤波動率 cutoff。"""
    closes_chg = {d["date"]: d.get("market_summary", {}).get("taiex_change_pct") for d in days}
    by_date = sorted(closes_chg.keys())
    vol_by_date = {}
    for i, dt in enumerate(by_date):
        # 含當天的近 5 日
        window = [closes_chg[by_date[j]] for j in range(max(0, i-4), i+1) if closes_chg[by_date[j]] is not None]
        vol_by_date[dt] = statistics.pstdev(window) if len(window) >= 2 else None
    results = []
    for cut in [0.8, 1.0, 1.2, 1.5, 1.8, 2.0, 2.5]:
        passed_rets, blocked_rets = [], []
        passed_days = set()
        for t in trades:
            v = vol_by_date.get(t["pickDate"])
            if v is not None and v <= cut:
                passed_rets.append(t["ret"]); passed_days.add(t["pickDate"])
            else:
                blocked_rets.append(t["ret"])
        n_pass = len(passed_rets); n_block = len(blocked_rets)
        results.append({
            "cutoff": cut,
            "passDays": len(passed_days),
            "passTrades": n_pass,
            "passWinRate": round(sum(1 for r in passed_rets if r > 0) / n_pass * 100, 1) if n_pass else None,
            "passEV": round(sum(passed_rets) / n_pass, 3) if n_pass else None,
            "passTotalPct": round(sum(passed_rets), 2) if n_pass else 0,
            "blockEV": round(sum(blocked_rets) / n_block, 3) if n_block else None,
        })
    return results


def monthly_robustness(trades, pick_days, picks_count, cutoffs=(10, 15, 20)):
    """各月套用 picks_count <= cutoff 後的勝率/EV，檢查穩健性。"""
    out = {}
    for cut in cutoffs:
        by_month = {}
        for t in trades:
            if picks_count.get(t["pickDate"], 0) > cut:
                continue
            m = t["entryDate"][:7]
            by_month.setdefault(m, []).append(t["ret"])
        out[f"cut_{cut}"] = {}
        for m, rets in sorted(by_month.items()):
            n = len(rets)
            wins = sum(1 for r in rets if r > 0)
            out[f"cut_{cut}"][m] = {
                "n": n,
                "winRate": round(wins / n * 100, 1) if n else None,
                "ev": round(sum(rets) / n, 3) if n else None,
                "total": round(sum(rets), 2) if n else 0,
            }
    # 基線各月
    base_month = {}
    for t in trades:
        m = t["entryDate"][:7]
        base_month.setdefault(m, []).append(t["ret"])
    out["baseline"] = {}
    for m, rets in sorted(base_month.items()):
        n = len(rets); wins = sum(1 for r in rets if r > 0)
        out["baseline"][m] = {
            "n": n,
            "winRate": round(wins / n * 100, 1) if n else None,
            "ev": round(sum(rets) / n, 3) if n else None,
            "total": round(sum(rets), 2) if n else 0,
        }
    return out


def leave_one_month_out(trades, picks_count, cutoffs=(10, 15, 20)):
    """留一月交叉驗證：用其他月決定 cutoff，套用到被留出月。
    這裡簡化：對每個 cutoff，計算「移除某月後，其他月的 EV」與「該月套用 cutoff 後 EV」。"""
    months = sorted({t["entryDate"][:7] for t in trades})
    out = {}
    for cut in cutoffs:
        out[f"cut_{cut}"] = []
        for hold_out in months:
            in_sample_rets, oos_rets = [], []
            for t in trades:
                if picks_count.get(t["pickDate"], 0) > cut:
                    continue
                if t["entryDate"][:7] == hold_out:
                    oos_rets.append(t["ret"])
                else:
                    in_sample_rets.append(t["ret"])
            out[f"cut_{cut}"].append({
                "holdoutMonth": hold_out,
                "inSampleEV": round(sum(in_sample_rets) / len(in_sample_rets), 3) if in_sample_rets else None,
                "oosEV": round(sum(oos_rets) / len(oos_rets), 3) if oos_rets else None,
                "oosN": len(oos_rets),
            })
    return out


def combo_filter(trades, picks_count, vol_by_date, picks_cut, vol_cut):
    """組合：picks <= picks_cut AND vol <= vol_cut。"""
    passed, blocked = [], []
    passed_days = set()
    for t in trades:
        pc = picks_count.get(t["pickDate"], 0)
        v = vol_by_date.get(t["pickDate"])
        if pc <= picks_cut and v is not None and v <= vol_cut:
            passed.append(t["ret"]); passed_days.add(t["pickDate"])
        else:
            blocked.append(t["ret"])
    n_pass = len(passed); n_block = len(blocked)
    return {
        "picksCut": picks_cut,
        "volCut": vol_cut,
        "passDays": len(passed_days),
        "passTrades": n_pass,
        "passWinRate": round(sum(1 for r in passed if r > 0) / n_pass * 100, 1) if n_pass else None,
        "passEV": round(sum(passed) / n_pass, 3) if n_pass else None,
        "passTotalPct": round(sum(passed), 2) if n_pass else 0,
        "blockEV": round(sum(blocked) / n_block, 3) if n_block else None,
    }


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
        b = _load_cache(c, dt)
        bars_map[(c, dt)] = b if b else []

    trades = collect_trades(pick_days, bars_map, score_min=SCORE_MIN)
    base_rets = [t["ret"] for t in trades]
    base_ev = sum(base_rets) / len(base_rets) if base_rets else 0
    base_win = sum(1 for r in base_rets if r > 0) / len(base_rets) * 100
    base_total = sum(base_rets)
    print(f"基線：n={len(trades)} 勝率={base_win:.1f}% EV={base_ev:+.3f}% 總={base_total:+.2f}%")

    # ── (1) picks count cutoff grid ──
    picks_grid, picks_count = grid_picks_cutoff(trades, pick_days)
    print("\n=== Picks-Count Cutoff Grid (>=75 picks <= N → 執行) ===")
    print(f"{'cut':>4} {'days':>5} {'n':>4} {'win%':>6} {'EV%':>7} {'totPct':>7} {'blockEV':>8}")
    for r in picks_grid:
        print(f"{r['cutoff']:>4} {r['passDays']:>5} {r['passTrades']:>4} "
              f"{r['passWinRate']!r:>6} {r['passEV']!r:>7} {r['passTotalPct']:>7.2f} {r['blockEV']!r:>8}")

    # ── (2) avg score cutoff grid ──
    avg_grid = grid_avgscore_cutoff(trades, pick_days)
    print("\n=== Avg Score Cutoff Grid (avg≥75 <= N → 執行) ===")
    print(f"{'cut':>4} {'days':>5} {'n':>4} {'win%':>6} {'EV%':>7} {'totPct':>7} {'blockEV':>8}")
    for r in avg_grid:
        print(f"{r['cutoff']:>4} {r['passDays']:>5} {r['passTrades']:>4} "
              f"{r['passWinRate']!r:>6} {r['passEV']!r:>7} {r['passTotalPct']:>7.2f} {r['blockEV']!r:>8}")

    # ── (3) vol5 cutoff grid ──
    vol_grid = grid_vol5_cutoff(trades, days)
    print("\n=== Vol5d Cutoff Grid (近5日大盤波動率 <= N → 執行) ===")
    print(f"{'cut':>4} {'days':>5} {'n':>4} {'win%':>6} {'EV%':>7} {'totPct':>7} {'blockEV':>8}")
    for r in vol_grid:
        print(f"{r['cutoff']:>4} {r['passDays']:>5} {r['passTrades']:>4} "
              f"{r['passWinRate']!r:>6} {r['passEV']!r:>7} {r['passTotalPct']:>7.2f} {r['blockEV']!r:>8}")

    # ── (4) monthly robustness ──
    mon = monthly_robustness(trades, pick_days, picks_count)
    print("\n=== Monthly Robustness ===")
    print(f"{'cut/month':12s}", end="")
    months = sorted(mon["baseline"].keys())
    for m in months:
        print(f"  {m}", end="")
    print()
    for k in ["baseline", "cut_10", "cut_15", "cut_20"]:
        print(f"{k:12s}", end="")
        for m in months:
            x = mon[k].get(m, {})
            if x.get("n"):
                print(f"  EV{x['ev']:+5.2f}({x['n']:>3})", end="")
            else:
                print(f"  {'---':>10}", end="")
        print()

    # ── (5) leave-one-out ──
    loo = leave_one_month_out(trades, picks_count)
    print("\n=== Leave-One-Month-Out (oosEV = 用其他月套同cut在留出月的結果) ===")
    for cut_key, rows in loo.items():
        print(f"  {cut_key}:")
        for r in rows:
            print(f"    holdout={r['holdoutMonth']}  inSampleEV={r['inSampleEV']}  "
                  f"oosEV={r['oosEV']}  oosN={r['oosN']}")

    # ── (6) combo picks * vol ──
    closes_chg = {d["date"]: d.get("market_summary", {}).get("taiex_change_pct") for d in days}
    by_date = sorted(closes_chg.keys())
    vol_by_date = {}
    for i, dt in enumerate(by_date):
        window = [closes_chg[by_date[j]] for j in range(max(0, i-4), i+1) if closes_chg[by_date[j]] is not None]
        vol_by_date[dt] = statistics.pstdev(window) if len(window) >= 2 else None

    print("\n=== Combo: picks<=X AND vol<=Y ===")
    print(f"{'picksCut':>8} {'volCut':>6} {'days':>5} {'n':>4} {'win%':>6} {'EV%':>7} {'totPct':>7} {'blockEV':>8}")
    combos = []
    for pc in [10, 15, 20]:
        for vc in [1.0, 1.5, 2.0]:
            r = combo_filter(trades, picks_count, vol_by_date, pc, vc)
            combos.append(r)
            print(f"{r['picksCut']:>8} {r['volCut']:>6} {r['passDays']:>5} {r['passTrades']:>4} "
                  f"{r['passWinRate']!r:>6} {r['passEV']!r:>7} {r['passTotalPct']:>7.2f} {r['blockEV']!r:>8}")

    output = {
        "baseline": {"n": len(trades), "winRate": round(base_win, 1),
                     "ev": round(base_ev, 3), "totalPct": round(base_total, 2)},
        "picksCountGrid": picks_grid,
        "avgScoreGrid": avg_grid,
        "vol5dGrid": vol_grid,
        "monthlyRobustness": mon,
        "leaveOneOut": loo,
        "comboGrid": combos,
        "pickDates": {d: picks_count.get(d, 0) for d in sorted(picks_count.keys())},
        "vol5dByDate": {d: round(vol_by_date[d], 3) if vol_by_date.get(d) else None for d in sorted(vol_by_date.keys())},
    }
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)
    print(f"\n寫入 {OUT_FILE}")


if __name__ == "__main__":
    main()
