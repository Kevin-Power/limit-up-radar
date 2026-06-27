"""過擬合驗證：score>=75 AND gap>=5% → T+2 開盤出場
驗證項：
  1. 樣本大小、計算重現
  2. 前後半時間切分
  3. 月度切分
  4. 閾值敏感度（gap 4/5/6/7/8；score 70/75/80）
  5. Bootstrap 1000 次
  6. 與「score>=75 全用 T+2 open」基線比較
"""
import json
import os
import sys
import random
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs                       # noqa: E402
from run_backtest_0903 import build_pick_days   # noqa: E402

COMMISSION_RT = 0.1425 * 0.28 * 2 / 100
TAX = 0.003
COST_RT = (COMMISSION_RT + TAX) * 100  # 0.3798

SCORE_MIN = 75
CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "opt_verify_gap5_t2open.json")
NOMINAL_TWD = 1_000_000


def load_cache(code, date):
    p = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def stat_pack(rets):
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "evPct": None,
                "median": None, "totalDeltaTWD": 0}
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "evPct": round(mean(rets), 3),
        "median": round(median(rets), 3),
        "totalNetPct": round(sum(rets), 2),
        "totalDeltaTWD": round(sum(rets) / 100 * NOMINAL_TWD),
    }


def bootstrap_ci(rets, iters=1000, seed=42):
    if not rets:
        return None
    rng = random.Random(seed)
    n = len(rets)
    evs = []
    wins = []
    for _ in range(iters):
        sample = [rets[rng.randrange(n)] for _ in range(n)]
        evs.append(mean(sample))
        wins.append(sum(1 for r in sample if r > 0) / n * 100)
    evs.sort()
    wins.sort()
    lo, hi = int(iters * 0.025), int(iters * 0.975)
    p_pos = sum(1 for e in evs if e > 0) / iters
    return {
        "evMean": round(mean(evs), 3),
        "ev2_5": round(evs[lo], 3),
        "ev97_5": round(evs[hi], 3),
        "winRateMean": round(mean(wins), 1),
        "winRate2_5": round(wins[lo], 1),
        "winRate97_5": round(wins[hi], 1),
        "probEvPositive": round(p_pos, 3),
    }


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

    # 預載
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

    # 收集 score>=75 的交易：entry=T+1 開盤, exit=T+2 開盤
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
            t2_open = next_bars[0]["open"]
            if entry <= 0 or not t2_open:
                continue
            prev_close = p["prevClose"]
            gap_pct = (entry - prev_close) / prev_close * 100
            ret = (t2_open - entry) / entry * 100 - COST_RT
            trades.append({
                "date": d["entryDate"],
                "code": p["code"],
                "score": p["score"],
                "gapPct": round(gap_pct, 3),
                "ret": round(ret, 4),
            })
    print(f"≥{SCORE_MIN} 分樣本：{len(trades)}")

    # ── (1) 規則本身：gap≥5 ──
    target = [t for t in trades if t["gapPct"] >= 5]
    target_stats = stat_pack([t["ret"] for t in target])
    print(f"\ngap>=5 子集 n={target_stats['n']}, 勝率{target_stats['winRate']}%, "
          f"EV{target_stats['evPct']}%, 累計 {target_stats['totalDeltaTWD']:+,}")

    # 基線（score>=75 全部）
    baseline = stat_pack([t["ret"] for t in trades])
    print(f"基線(全 score>=75) n={baseline['n']}, 勝率{baseline['winRate']}%, "
          f"EV{baseline['evPct']}%, 累計 {baseline['totalDeltaTWD']:+,}")

    # ── (2) 前後半時間切分 ──
    target_sorted = sorted(target, key=lambda t: (t["date"], t["code"]))
    half = len(target_sorted) // 2
    h1 = stat_pack([t["ret"] for t in target_sorted[:half]])
    h2 = stat_pack([t["ret"] for t in target_sorted[half:]])
    print(f"\n前半 n={h1['n']} 勝率{h1['winRate']}% EV{h1['evPct']}%  "
          f"(日期 {target_sorted[0]['date']} ~ {target_sorted[half-1]['date']})")
    print(f"後半 n={h2['n']} 勝率{h2['winRate']}% EV{h2['evPct']}%  "
          f"(日期 {target_sorted[half]['date']} ~ {target_sorted[-1]['date']})")

    # ── (3) 月度 ──
    monthly = defaultdict(list)
    for t in target:
        monthly[t["date"][:7]].append(t["ret"])
    monthly_stats = {m: stat_pack(v) for m, v in sorted(monthly.items())}
    print("\n月度：")
    for m, s in monthly_stats.items():
        print(f"  {m}  n={s['n']:>3} 勝率{s['winRate']}% EV{s['evPct']:+.3f}%")

    # ── (4) 閾值敏感度 ──
    print("\nGap 閾值敏感度：")
    gap_sens = {}
    for g in [3, 4, 4.5, 5, 5.5, 6, 7, 8]:
        sub = [t["ret"] for t in trades if t["gapPct"] >= g]
        s = stat_pack(sub)
        gap_sens[f"gap>={g}"] = s
        print(f"  gap>={g:<4}  n={s['n']:>3} 勝率{s['winRate']}% EV{s['evPct']:+.3f}%")

    print("\nScore 閾值敏感度（固定 gap>=5）：")
    score_sens = {}
    for sc in [70, 75, 80, 85, 90]:
        sub = [t["ret"] for t in trades if t["gapPct"] >= 5 and t["score"] >= sc]
        s = stat_pack(sub)
        score_sens[f"score>={sc}"] = s
        print(f"  score>={sc}  n={s['n']:>3} 勝率{s['winRate']}% EV{s['evPct']:+.3f}%")

    # ── (5) Bootstrap ──
    print("\nBootstrap 1000 次（gap>=5, score>=75）：")
    bs = bootstrap_ci([t["ret"] for t in target])
    print(f"  EV 平均 {bs['evMean']}, 95% CI [{bs['ev2_5']}, {bs['ev97_5']}]")
    print(f"  勝率 平均 {bs['winRateMean']}%, 95% CI [{bs['winRate2_5']}%, {bs['winRate97_5']}%]")
    print(f"  P(EV>0) = {bs['probEvPositive']}")

    # ── (6) 與基線在「同樣 81 筆」上比較：
    # 這條規則的「真實貢獻」是相對「同樣的 81 筆若使用基線出場（也是 T+2 open）」
    # 但 gap≥5 子集的基線出場本來就是 T+2 open（基線策略本來就是 T+2 開盤）
    # 所以「維持 T+2 出場」相對基線沒有任何改變！
    # 真正要比的是相對「動態出場」或其他出場策略
    same_n_baseline_ret = [t["ret"] for t in target]
    print(f"\n⚠️ 注意：基線本來就是 T+2 開盤出場，gap>=5 子集 EV {target_stats['evPct']}%")
    print(f"      『維持 T+2 open』在基線下沒有任何改動。聲稱『+1721185 元』需檢查比較對象。")
    # 估算：gap>=5 的子集，相對「全 score>=75」的整體 EV 提升 * n
    base_ev = baseline["evPct"]
    target_ev = target_stats["evPct"]
    print(f"  與全基線 EV 差：{target_ev:+.3f}% vs {base_ev:+.3f}%   "
          f"差 {target_ev - base_ev:+.3f} pp × n={target_stats['n']} = "
          f"{(target_ev - base_ev) * target_stats['n'] / 100 * NOMINAL_TWD:+,.0f} TWD")

    # ── (7) 與 opt_gap_score_exit.json 的 rule B（動態出場）比較 ──
    # 在 gap>=5 子集裡，rule B 的 exitMap：5-8/8-10/10+ 都已是 T2_open
    # 所以「維持 T+2 開盤」其實就是 rule B 在 gap>=5 的決定 → 不是新規則！
    print("\n⚠️ 既有 opt_gap_score_exit.json 的 Rule B 在 gap>=5 桶已選 T2_open。")
    print("   『score>=75 AND gap>=5 → T+2 開盤出場』實質上 = 既有 Rule B 在 gap>=5 的行為")

    out = {
        "meta": {
            "rule": "score>=75 AND gap>=5 -> T+2 open",
            "costRtPct": round(COST_RT, 4),
            "nominalTwdPerTrade": NOMINAL_TWD,
            "totalScoreGe75": len(trades),
        },
        "target": target_stats,
        "baseline_all_score75": baseline,
        "firstHalf": h1,
        "secondHalf": h2,
        "monthly": monthly_stats,
        "gapThresholdSensitivity": gap_sens,
        "scoreThresholdSensitivity": score_sens,
        "bootstrap1000": bs,
        "notes": [
            "T+2 open 本來就是基線出場 — 『維持』而非『改變』。",
            "Rule B 在 gap>=5/8-10/10+ 全部選 T+2 open，與此規則一致。",
            "聲稱 +1721185 元 = 比較對象需釐清；若對照『早出場』則合理，若對照基線則無變化。",
        ],
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=2)
    print(f"\n結果存至 {OUT_PATH}")


if __name__ == "__main__":
    main()
