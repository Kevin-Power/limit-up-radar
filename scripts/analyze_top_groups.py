"""分析：只做當日「Top-N 大族群」的精選，是否改善 R1 策略 EV？

族群定義：每日 daily JSON 內 groups[].stocks[] 的「股票數」越多 = 越熱。
比較 N=2/3/4/5 vs 不過濾，看勝率/EV/總賺。
"""
import argparse, json, os, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from lib.r1_exit import decide_r1_exit, compute_r1_return
from run_backtest_0903 import build_pick_days

CACHE = os.path.join("data", "intraday_cache")
COST = 0.585

def load_bars(code, date):
    p = os.path.join(CACHE, f"{code}_{date}.json")
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else []
    except Exception:
        return []

def build_pick_to_group_map(days):
    """從 daily/*.json 建 {(date, code): group_name}。"""
    m = {}
    for d in days:
        for g in d.get("groups", []):
            for s in g.get("stocks", []):
                m[(d["date"], s["code"])] = g["name"]
    return m

def top_groups_by_date(days, n):
    """{date: [group_names sorted by stock count desc]}"""
    out = {}
    for d in days:
        groups = sorted(d.get("groups", []), key=lambda g: -len(g.get("stocks", [])))
        out[d["date"]] = [g["name"] for g in groups[:n]]
    return out

def run_filtered_backtest(pick_days, code_to_group, top_groups_map, score_min=75):
    """跑 R1 backtest，過濾到 top-groups。回傳 stats dict。"""
    trades = []
    for d in pick_days:
        entry_date = d["entryDate"]
        next_date = d.get("nextDate")
        if not next_date:
            continue
        allowed = set(top_groups_map.get(d["pickDate"], []))
        for p in d["picks"]:
            if p["score"] < score_min:
                continue
            if allowed and code_to_group.get((d["pickDate"], p["code"])) not in allowed:
                continue
            t1_bars = load_bars(p["code"], entry_date)
            t2_bars = load_bars(p["code"], next_date)
            if not t1_bars or not t2_bars:
                continue
            entry = t1_bars[0]["open"]
            t2_open = t2_bars[0]["open"]
            decision = decide_r1_exit(entry, t1_bars, t2_open)
            if decision is None:
                continue
            ret = compute_r1_return(entry, decision["exit_price"])
            if ret is None:
                continue
            trades.append({
                "dEntry": entry_date, "code": p["code"], "name": p["name"],
                "score": p["score"], "ret": ret, "rule": decision["rule"],
                "group": code_to_group.get((d["pickDate"], p["code"])),
            })
    return trades

def stats(trades):
    n = len(trades)
    if n == 0:
        return {"n": 0, "winRate": None, "evPct": None, "totalPct": 0}
    rets = [t["ret"] for t in trades]
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "evPct": round(sum(rets) / n, 3),
        "totalPct": round(sum(rets), 2),
        "maxWin": round(max(rets), 3),
        "maxLoss": round(min(rets), 3),
    }

def monthly_stats(trades):
    by_m = defaultdict(list)
    for t in trades:
        by_m[t["dEntry"][:7]].append(t["ret"])
    out = {}
    for m, rets in sorted(by_m.items()):
        n = len(rets)
        wins = sum(1 for r in rets if r > 0)
        out[m] = {"n": n, "winRate": round(wins/n*100, 1), "ev": round(sum(rets)/n, 3)}
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--score-min", type=int, default=75)
    args = ap.parse_args()
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass

    print("載入...")
    days = hs.load_daily_files()
    rm = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    pick_days = build_pick_days(days, rm, hw, disp)
    code_to_group = build_pick_to_group_map(days)

    # baseline: 無過濾
    base_trades = run_filtered_backtest(pick_days, code_to_group, {}, args.score_min)
    base_stats = stats(base_trades)
    print(f"\n=== 基線（無族群過濾，score>={args.score_min}）===")
    print(f"n={base_stats['n']} win={base_stats['winRate']}% EV={base_stats['evPct']}% total={base_stats['totalPct']}%")
    print("月度:")
    for m, s in monthly_stats(base_trades).items():
        print(f"  {m}: n={s['n']:>3} win={s['winRate']:>5}% EV={s['ev']:+.3f}%")

    # Top-N 族群過濾
    print(f"\n=== Top-N 大族群過濾比較 ===")
    print(f"{'N':>3} {'n':>5} {'win':>6} {'EV':>10} {'總賺':>10}  vs 基線")
    print("─" * 60)
    for n in [2, 3, 4, 5]:
        top_map = top_groups_by_date(days, n)
        ftrades = run_filtered_backtest(pick_days, code_to_group, top_map, args.score_min)
        s = stats(ftrades)
        diff_ev = (s.get('evPct') or 0) - (base_stats.get('evPct') or 0)
        diff_w = (s.get('winRate') or 0) - (base_stats.get('winRate') or 0)
        print(f"{n:>3} {s['n']:>5} {s['winRate']:>5}% {s['evPct']:>+8.3f}% "
              f"{s['totalPct']:>+9.2f}%  ΔEV={diff_ev:+.3f}% Δwin={diff_w:+.1f}pp")

    # 詳細看 Top-3
    print(f"\n=== Top-3 月度詳細 ===")
    top3 = run_filtered_backtest(pick_days, code_to_group, top_groups_by_date(days, 3), args.score_min)
    for m, s in monthly_stats(top3).items():
        print(f"  {m}: n={s['n']:>3} win={s['winRate']:>5}% EV={s['ev']:+.3f}%")

    # 從族群觀點看：哪些族群最常被選
    print(f"\n=== Top-3 族群名稱出現次數（前 10 名）===")
    name_count = defaultdict(int)
    for d in days:
        top = sorted(d.get("groups", []), key=lambda g: -len(g.get("stocks", [])))[:3]
        for g in top:
            name_count[g["name"]] += 1
    for name, cnt in sorted(name_count.items(), key=lambda kv: -kv[1])[:10]:
        print(f"  {name:30s} {cnt} 天")

if __name__ == "__main__":
    main()
