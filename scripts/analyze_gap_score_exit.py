"""精細化 gap × score × 出場時機的交互作用分析。

基線（不重驗，引用為對照）:
  - 策略：score≥75，T+1 開盤競價買進，T+2 開盤賣出
  - 樣本：274 筆 / 42 天
  - 勝率 58%、每筆 EV +1.87%、2.8 折手續費下淨報酬 +186 萬

成本模型（2.8 折 + 隔日證交稅）:
  - 手續費 0.1425% × 0.28 = 0.0399% 單邊 → 來回 0.0798%
  - 證交稅 0.3%（賣出）
  - 等價百分點扣費 ≈ 0.38%（COST_RT）

研究目標:
  1. score≥75 內，把 gap 細分桶（負/0-3/3-5/5-8/8-10/10+），看勝率與 EV 是否單調
  2. 反向：gap 桶內 score 高低差別（避免雙重計算）
  3. 出場時機 × gap：不同 gap 桶對應「最佳出場時機」
     · 候選出場：T+1 09:01 / 09:05 / 09:15 / 10:00 / 11:30 / 收盤 / T+2 開盤
  4. 「跳空但收回」訊號：T+1 開盤跳空 +5%，但 09:01 已跌回 +2% → 後市更糟？

輸出: data/opt_gap_score_exit.json
"""
import json
import math
import os
import sys
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs                               # noqa: E402
from run_backtest_0903 import build_pick_days          # noqa: E402

# ── 成本（2.8 折）──────────────────────────────────────────────
COMMISSION_RT = 0.1425 * 0.28 * 2 / 100    # 來回手續費 0.0798%
TAX = 0.003                                  # 賣出證交稅 0.3%
COST_RT = (COMMISSION_RT + TAX) * 100        # 0.3798%（單位：百分點）

SCORE_MIN = 75                               # 基線門檻
CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "opt_gap_score_exit.json")

# 假定每筆名目單位：用基線「2.8 折下實賺 186 萬 / 274 筆 EV +1.87%」反推
# 186 萬 / 274 / (1.87% - 0.38% ≈ 1.49% 淨/筆) ≈ 45.6 萬名目 / 筆
# 為簡化只回報「相對基線淨報酬」與「EV 變化」，不再展開萬元
NOMINAL_TWD_PER_TRADE = 1_000_000  # 每筆假定 100 萬名目，方便估算


# ── 工具 ──────────────────────────────────────────────────────
def load_cache(code, date):
    p = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def bar_close_at_or_before(bars, hhmm):
    """≤hhmm 的最後一根 K 的 close；都沒有 → None。"""
    cands = [b for b in bars if b["time"] <= hhmm]
    if not cands:
        return None
    return cands[-1]["close"]


def first_minute_close(bars):
    """T+1 開盤後第一根 K 收盤（用來算「跳空後第一分鐘」訊號）。"""
    if not bars:
        return None
    # 取最早的一根 (通常 09:01)
    b = min(bars, key=lambda x: x["time"])
    return b["close"]


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
        return {"n": 0, "winRate": None, "evPct": None, "median": None,
                "ciLow": None, "ciHigh": None, "totalDeltaTWD": 0}
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
        "totalDeltaTWD": round(sum(rets) / 100 * NOMINAL_TWD_PER_TRADE),
    }


# ── 建構交易（含多個出場點）─────────────────────────────────
EXIT_TIMES_T1 = ["09:01", "09:05", "09:15", "10:00", "11:30"]   # T+1 日盤中
EXIT_T1_CLOSE = "T1_close"
EXIT_T2_OPEN = "T2_open"   # 基線


def collect_rich_trades(pick_days, bars_map, score_min=SCORE_MIN):
    """每筆交易抓多個出場時點，後續分析共用。

    entry: T+1 開盤 (auction)。
    gap: (T+1 open - prevClose) / prevClose * 100
    firstMinClose: T+1 第一分鐘 close（通常 09:01）
    """
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
            first_min = first_minute_close(day_bars)
            t1_close = day_close(day_bars)
            t2_open = next_bars[0]["open"]

            # 各時點淨報酬
            exits = {}
            for tt in EXIT_TIMES_T1:
                px = bar_close_at_or_before(day_bars, tt)
                if px is None:
                    exits[tt] = None
                else:
                    exits[tt] = round((px - entry) / entry * 100 - COST_RT, 4)
            exits[EXIT_T1_CLOSE] = (
                round((t1_close - entry) / entry * 100 - COST_RT, 4)
                if t1_close else None
            )
            exits[EXIT_T2_OPEN] = (
                round((t2_open - entry) / entry * 100 - COST_RT, 4)
                if t2_open else None
            )

            # 「跳空後第一分鐘是否守住」訊號
            # firstMinAdjPct = (firstMin - prevClose)/prevClose
            #  → gap >= 5 但 firstMinAdjPct < gap (且差距 >= 2pp) = 「跳空收回」
            first_min_pct = (
                (first_min - prev_close) / prev_close * 100 if first_min else None
            )
            pullback_pp = (gap_pct - first_min_pct) if first_min_pct is not None else None

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
                "firstMinPct": round(first_min_pct, 3) if first_min_pct is not None else None,
                "pullbackPP": round(pullback_pp, 3) if pullback_pp is not None else None,
                "exits": exits,
                # 基線報酬 = T+2 open
                "baselineRet": exits[EXIT_T2_OPEN],
            })
    return trades


# ── 桶定義 ────────────────────────────────────────────────────
GAP_BUCKETS = [
    ("neg", -100, 0),          # 低開
    ("0-3", 0, 3),
    ("3-5", 3, 5),
    ("5-8", 5, 8),
    ("8-10", 8, 10),
    ("10+", 10, 100),
]


def gap_bucket(g):
    for name, lo, hi in GAP_BUCKETS:
        if lo <= g < hi:
            return name
    return None


SCORE_BUCKETS = [
    ("75-79", 75, 80),
    ("80-89", 80, 90),
    ("90+", 90, 1000),
]


def score_bucket(s):
    for name, lo, hi in SCORE_BUCKETS:
        if lo <= s < hi:
            return name
    return None


# ── 分析 1：score≥75 下 gap 細分 ─────────────────────────────
def analyze_gap_buckets(trades, exit_key="T2_open"):
    by_bucket = defaultdict(list)
    for t in trades:
        b = gap_bucket(t["gapPct"])
        r = t["exits"].get(exit_key)
        if b and r is not None:
            by_bucket[b].append(r)
    return {b: stat_pack(by_bucket[b]) for b, _, _ in GAP_BUCKETS}


# ── 分析 2：gap 桶內 score 影響 ──────────────────────────────
def analyze_score_within_gap(trades, exit_key="T2_open"):
    out = {}
    for gb, _, _ in GAP_BUCKETS:
        sub = {}
        for sb, _, _ in SCORE_BUCKETS:
            rets = [
                t["exits"][exit_key]
                for t in trades
                if gap_bucket(t["gapPct"]) == gb
                and score_bucket(t["score"]) == sb
                and t["exits"].get(exit_key) is not None
            ]
            sub[sb] = stat_pack(rets)
        out[gb] = sub
    return out


# ── 分析 3：出場時機 × gap ────────────────────────────────────
def analyze_exit_by_gap(trades):
    """每個 gap 桶 → 各出場時點的 EV，挑最佳。"""
    out = {}
    all_exits = EXIT_TIMES_T1 + [EXIT_T1_CLOSE, EXIT_T2_OPEN]
    for gb, _, _ in GAP_BUCKETS:
        bucket_trades = [t for t in trades if gap_bucket(t["gapPct"]) == gb]
        if not bucket_trades:
            out[gb] = {"n": 0, "byExit": {}, "best": None}
            continue
        by_exit = {}
        for ek in all_exits:
            rets = [t["exits"][ek] for t in bucket_trades if t["exits"].get(ek) is not None]
            by_exit[ek] = stat_pack(rets)
        # 挑 EV 最大且樣本 ≥ max(10, n*0.7)
        n_total = len(bucket_trades)
        min_n = max(10, int(n_total * 0.5))
        elig = [(k, v) for k, v in by_exit.items()
                if v["n"] >= min_n and v["evPct"] is not None]
        elig.sort(key=lambda kv: kv[1]["evPct"], reverse=True)
        best = elig[0] if elig else None
        out[gb] = {
            "n": n_total,
            "byExit": by_exit,
            "best": {"exit": best[0], **best[1]} if best else None,
        }
    return out


# ── 分析 4：跳空收回訊號 ──────────────────────────────────────
def analyze_pullback_signal(trades, exit_key="T2_open"):
    """
    篩 gap ≥ 5%，按「09:01 是否守住」分組：
      strong : firstMinPct >= gapPct - 1（守住，回吐 <= 1pp）
      weak   : pullbackPP > 1 且 <= 3
      collapse : pullbackPP > 3 （跌回超過 3pp）
    """
    groups = {"strong": [], "weak": [], "collapse": []}
    detail = []
    for t in trades:
        if t["gapPct"] < 5:
            continue
        if t["pullbackPP"] is None:
            continue
        r = t["exits"].get(exit_key)
        if r is None:
            continue
        if t["pullbackPP"] <= 1:
            groups["strong"].append(r)
            tag = "strong"
        elif t["pullbackPP"] <= 3:
            groups["weak"].append(r)
            tag = "weak"
        else:
            groups["collapse"].append(r)
            tag = "collapse"
        detail.append({
            "code": t["code"], "date": t["entryDate"],
            "score": t["score"], "gapPct": t["gapPct"],
            "firstMinPct": t["firstMinPct"],
            "pullbackPP": t["pullbackPP"],
            "ret": r, "tag": tag,
        })
    return {k: stat_pack(v) for k, v in groups.items()}, detail


# ── 主流程 ────────────────────────────────────────────────────
def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("載入 daily / 營收 / 分類 ...")
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    pick_days = build_pick_days(days, rev_maps, hw, disp)

    # 預載快取
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
    print(f"選股日 {len(pick_days)} 天，快取 {hit}/{len(needed)} 命中")

    trades = collect_rich_trades(pick_days, bars_map, score_min=SCORE_MIN)
    print(f"≥{SCORE_MIN} 分有效交易：{len(trades)} 筆")

    # 基線統計（T+2 open）
    base_rets = [t["baselineRet"] for t in trades if t["baselineRet"] is not None]
    base = stat_pack(base_rets)
    print(f"基線(T+2 open)：n={base['n']} 勝率{base['winRate']}% EV{base['evPct']}%")

    # ── 1. score≥75 下 gap 細分 ──
    gap_table = analyze_gap_buckets(trades, exit_key=EXIT_T2_OPEN)

    # ── 2. gap 桶內 score 差別 ──
    score_within_gap = analyze_score_within_gap(trades, exit_key=EXIT_T2_OPEN)

    # ── 3. 出場時機 × gap ──
    exit_by_gap = analyze_exit_by_gap(trades)

    # ── 4. 跳空收回訊號 ──
    pullback_stats, pullback_detail = analyze_pullback_signal(trades, exit_key=EXIT_T2_OPEN)

    # ── 5. 推薦規則組合 ──
    # 規則 A: 排除「gap≥5 且 09:01 跌回 >3pp」
    rule_a_rets = []
    rule_a_excluded = 0
    for t in trades:
        if t["baselineRet"] is None:
            continue
        if (t["gapPct"] >= 5 and t["pullbackPP"] is not None
                and t["pullbackPP"] > 3):
            rule_a_excluded += 1
            continue
        rule_a_rets.append(t["baselineRet"])
    rule_a = stat_pack(rule_a_rets)
    rule_a["excluded"] = rule_a_excluded

    # 規則 B: 動態出場 — 各 gap 桶用其最佳出場
    rule_b_rets = []
    rule_b_map = {gb: exit_by_gap[gb]["best"]["exit"] if exit_by_gap[gb]["best"] else EXIT_T2_OPEN
                  for gb, _, _ in GAP_BUCKETS}
    for t in trades:
        gb = gap_bucket(t["gapPct"])
        if gb is None:
            continue
        ek = rule_b_map.get(gb, EXIT_T2_OPEN)
        r = t["exits"].get(ek)
        if r is None:
            # fallback 至基線
            r = t["baselineRet"]
        if r is not None:
            rule_b_rets.append(r)
    rule_b = stat_pack(rule_b_rets)
    rule_b["exitMap"] = rule_b_map

    # 規則 C: 同時用 A + B
    rule_c_rets = []
    for t in trades:
        if (t["gapPct"] >= 5 and t["pullbackPP"] is not None
                and t["pullbackPP"] > 3):
            continue
        gb = gap_bucket(t["gapPct"])
        ek = rule_b_map.get(gb, EXIT_T2_OPEN)
        r = t["exits"].get(ek)
        if r is None:
            r = t["baselineRet"]
        if r is not None:
            rule_c_rets.append(r)
    rule_c = stat_pack(rule_c_rets)

    # ── 樣本外驗證：leave-one-month-out（避免 Rule B 過擬合）──
    months = sorted({t["entryDate"][:7] for t in trades})
    oos_rets = []
    oos_meta = []
    for m in months:
        train = [t for t in trades if t["entryDate"][:7] != m]
        test = [t for t in trades if t["entryDate"][:7] == m]
        # 用 train 算各 gap 桶最佳出場
        train_exit_map = {}
        all_exits = EXIT_TIMES_T1 + [EXIT_T1_CLOSE, EXIT_T2_OPEN]
        for gb, _, _ in GAP_BUCKETS:
            best_ek, best_ev, best_n = EXIT_T2_OPEN, -999, 0
            for ek in all_exits:
                rets = [t["exits"][ek] for t in train
                        if gap_bucket(t["gapPct"]) == gb
                        and t["exits"].get(ek) is not None]
                if len(rets) >= max(8, int(len(train) * 0.03)) and rets:
                    ev = sum(rets) / len(rets)
                    if ev > best_ev:
                        best_ev, best_ek, best_n = ev, ek, len(rets)
            train_exit_map[gb] = best_ek
        # 套用 train 規則到 test
        m_rets = []
        for t in test:
            gb = gap_bucket(t["gapPct"])
            ek = train_exit_map.get(gb, EXIT_T2_OPEN)
            r = t["exits"].get(ek)
            if r is None:
                r = t["baselineRet"]
            if r is not None:
                m_rets.append(r)
                oos_rets.append(r)
        oos_meta.append({"holdout": m, "n": len(m_rets),
                         "ev": round(sum(m_rets)/len(m_rets), 3) if m_rets else None,
                         "trainExitMap": train_exit_map})
    oos = stat_pack(oos_rets)

    # ── 穩健性：rule B 在前後半的表現（防 overfit）──
    def by_half(trades_, exit_map):
        sorted_t = sorted(trades_, key=lambda t: (t["entryDate"], t["code"]))
        half = len(sorted_t) // 2
        def calc(sub):
            rets = []
            for t in sub:
                gb = gap_bucket(t["gapPct"])
                ek = exit_map.get(gb, EXIT_T2_OPEN)
                r = t["exits"].get(ek)
                if r is None:
                    r = t["baselineRet"]
                if r is not None:
                    rets.append(r)
            return stat_pack(rets)
        return calc(sorted_t[:half]), calc(sorted_t[half:])

    rule_b_h1, rule_b_h2 = by_half(trades, rule_b_map)
    # 月度
    def by_month(trades_, exit_map):
        groups = defaultdict(list)
        for t in trades_:
            gb = gap_bucket(t["gapPct"])
            ek = exit_map.get(gb, EXIT_T2_OPEN)
            r = t["exits"].get(ek)
            if r is None:
                r = t["baselineRet"]
            if r is not None:
                groups[t["entryDate"][:7]].append(r)
        return {m: stat_pack(v) for m, v in sorted(groups.items())}
    rule_b_monthly = by_month(trades, rule_b_map)
    base_monthly = by_month(trades, {gb: EXIT_T2_OPEN for gb, _, _ in GAP_BUCKETS})

    # ── 輸出 ──
    out = {
        "meta": {
            "scoreMin": SCORE_MIN,
            "costRtPct": round(COST_RT, 4),
            "nominalTwdPerTrade": NOMINAL_TWD_PER_TRADE,
            "dateRange": {
                "from": min(t["entryDate"] for t in trades) if trades else None,
                "to": max(t["entryDate"] for t in trades) if trades else None,
            },
            "exitGrid": EXIT_TIMES_T1 + [EXIT_T1_CLOSE, EXIT_T2_OPEN],
            "gapBuckets": [{"name": n, "lo": lo, "hi": hi} for n, lo, hi in GAP_BUCKETS],
            "scoreBuckets": [{"name": n, "lo": lo, "hi": hi} for n, lo, hi in SCORE_BUCKETS],
        },
        "baseline": base,
        "gapBuckets_T2open": gap_table,
        "scoreWithinGap_T2open": score_within_gap,
        "exitByGap": exit_by_gap,
        "pullbackSignal": {
            "groups": pullback_stats,
            "sampleDetail": pullback_detail[:50],
        },
        "rules": {
            "A_filter_pullback_gt3pp": rule_a,
            "B_dynamic_exit": rule_b,
            "C_A_plus_B": rule_c,
        },
        "robustness": {
            "ruleB_firstHalf": rule_b_h1,
            "ruleB_secondHalf": rule_b_h2,
            "ruleB_monthly": rule_b_monthly,
            "baseline_monthly": base_monthly,
            "loo_oos": {"stats": oos, "perHoldout": oos_meta},
        },
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=2)

    # ── Console summary ──
    print("\n=== Gap 細分（score≥75, T+2 open）===")
    print(f"{'桶':8s} {'n':>5} {'勝率':>6} {'EV%':>7} {'中位':>7} {'累計delta(NTD)':>16}")
    for gb, _, _ in GAP_BUCKETS:
        s = gap_table[gb]
        if s["n"] == 0:
            continue
        print(f"{gb:8s} {s['n']:>5} {s['winRate']:>5}% {s['evPct']:>+7.3f} "
              f"{s['median']:>+7.3f} {s['totalDeltaTWD']:>+16,}")

    print("\n=== 跳空收回訊號（gap≥5 內按 09:01 表現分組）===")
    for k, v in pullback_stats.items():
        if v["n"]:
            print(f"  {k:9s} n={v['n']:>3} 勝率{v['winRate']}% EV{v['evPct']:+.3f}% 中位{v['median']:+.3f}%")

    print("\n=== 出場時機 × gap（挑最佳）===")
    for gb, _, _ in GAP_BUCKETS:
        info = exit_by_gap[gb]
        if not info["best"]:
            continue
        b = info["best"]
        print(f"  gap {gb:6s} n={info['n']:>3}  最佳出場 {b['exit']:>10s}  "
              f"勝率{b['winRate']}% EV{b['evPct']:+.3f}%")

    print("\n=== 推薦規則組合 ===")
    print(f"  基線(全 score≥75, T+2 open)     n={base['n']} 勝率{base['winRate']}% EV{base['evPct']}% 累計delta {base['totalDeltaTWD']:+,}")
    print(f"  A 過濾跳空收回 >3pp             n={rule_a['n']} 勝率{rule_a['winRate']}% EV{rule_a['evPct']}% 累計delta {rule_a['totalDeltaTWD']:+,} (剔除 {rule_a_excluded})")
    print(f"  B 各 gap 桶用最佳出場           n={rule_b['n']} 勝率{rule_b['winRate']}% EV{rule_b['evPct']}% 累計delta {rule_b['totalDeltaTWD']:+,}")
    print(f"  C A+B                          n={rule_c['n']} 勝率{rule_c['winRate']}% EV{rule_c['evPct']}% 累計delta {rule_c['totalDeltaTWD']:+,}")

    print("\n=== 穩健性 — Rule B 前後半 ===")
    print(f"  前半 n={rule_b_h1['n']} 勝率{rule_b_h1['winRate']}% EV{rule_b_h1['evPct']}%")
    print(f"  後半 n={rule_b_h2['n']} 勝率{rule_b_h2['winRate']}% EV{rule_b_h2['evPct']}%")
    print("\n=== Rule B 月度 vs 基線月度 ===")
    print(f"  {'月':8s} {'baseN':>5} {'baseEV%':>8} {'ruleBN':>6} {'ruleB_EV%':>10}")
    for m in sorted(base_monthly.keys()):
        b1 = base_monthly[m]; b2 = rule_b_monthly[m]
        print(f"  {m:8s} {b1['n']:>5} {b1['evPct']:>+8.3f} {b2['n']:>6} {b2['evPct']:>+10.3f}")
    print("\n=== Leave-One-Month-Out 樣本外 ===")
    print(f"  總計 n={oos['n']} 勝率{oos['winRate']}% EV{oos['evPct']}% 累計delta {oos['totalDeltaTWD']:+,}")
    for h in oos_meta:
        print(f"    holdout {h['holdout']}: n={h['n']} EV{h['ev']}")
    print(f"\n結果存至 {OUT_PATH}")


if __name__ == "__main__":
    main()
