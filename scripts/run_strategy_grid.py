"""策略網格回測 — 純用已快取的 1 分 K，不需 Shioaji 登入。

網格：入場時間(5) × 入場條件(4) × 出場規則(15) × 評分門檻(3) = 900 組合
輸出：依期望值排序排行表，並列出正期望值策略。

用法：
  python scripts/run_strategy_grid.py
  python scripts/run_strategy_grid.py --top 40
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from backtest_0903 import EXIT_RULES, simulate_exit, aggregate_rule
from run_backtest_0903 import build_pick_days

CACHE_DIR = os.path.join("data", "intraday_cache")

ENTRY_TIMES = [
    ("09:01", "開盤1分"),
    ("09:03", "09:03"),
    ("09:05", "09:05"),
    ("09:10", "09:10"),
    ("09:30", "09:30"),
]

ENTRY_CONDITIONS = [
    ("unconditional", "無條件"),
    ("above_prev",    "高昨收"),
    ("red_k",         "紅K"),
    ("both",          "紅K+高昨收"),
]

SCORE_THRESHOLDS = [50, 60, 70]


# ── 快取讀取 ────────────────────────────────────────────────────
def _load_cache(code, date):
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
            return data if data else None
    except Exception:
        return None


def preload_bars(pick_days):
    """一次性讀所有快取 → dict[(code,date)]=bars（避免巢狀 I/O）。"""
    needed = set()
    for d in pick_days:
        for p in d["picks"]:
            needed.add((p["code"], d["entryDate"]))
            if d.get("nextDate"):
                needed.add((p["code"], d["nextDate"]))
    bars_map = {}
    for (code, date) in needed:
        b = _load_cache(code, date)
        bars_map[(code, date)] = b if b else []
    return bars_map


# ── 入場邏輯 ─────────────────────────────────────────────────────
def bar_at_time(bars, target_time, cutoff_extra=5):
    """取 ≤target_time 最近一根；第一根超出 cutoff_extra 分鐘則 None。"""
    if not bars:
        return None
    candidates = [b for b in bars if b["time"] <= target_time]
    if candidates:
        return candidates[-1]
    first = min(bars, key=lambda b: b["time"])
    tt = target_time.split(":")
    cut = int(tt[0]) * 60 + int(tt[1]) + cutoff_extra
    ft = first["time"].split(":")
    fm = int(ft[0]) * 60 + int(ft[1])
    return None if fm > cut else first


def entry_signal_v2(bars, prev_close, target_time, condition):
    """回 {"price","entered","bar_time"} 或 None。"""
    if not bars:
        return None
    b = bar_at_time(bars, target_time)
    if b is None:
        return None
    day_open = bars[0]["open"]
    price = b["close"]
    if condition == "unconditional":
        entered = True
    elif condition == "above_prev":
        entered = price > prev_close
    elif condition == "red_k":
        entered = price > day_open
    else:  # both
        entered = (price > day_open) and (price > prev_close)
    return {"price": price, "entered": entered, "bar_time": b["time"]}


# ── 網格核心 ─────────────────────────────────────────────────────
def run_combo(pick_days, bars_map, threshold, entry_time, entry_condition):
    """單一 (threshold, entry_time, entry_condition) 組合 → trades list。"""
    trades = []
    for d in pick_days:
        for p in d["picks"]:
            if p["score"] < threshold:
                continue
            day_bars = bars_map.get((p["code"], d["entryDate"]), [])
            sig = entry_signal_v2(day_bars, p["prevClose"], entry_time, entry_condition)
            if not sig or not sig["entered"]:
                continue
            after = [b for b in day_bars if b["time"] > sig["bar_time"]]
            day_close = day_bars[-1]["close"] if day_bars else None
            next_bars = bars_map.get((p["code"], d["nextDate"]), []) if d.get("nextDate") else []
            next_open  = next_bars[0]["open"]  if next_bars else None
            next_close = next_bars[-1]["close"] if next_bars else None
            trades.append({
                "entry": sig["price"], "dayClose": day_close,
                "nextOpen": next_open, "nextClose": next_close,
                "barsAfter": after,
            })
    return trades


def build_grid(pick_days, bars_map):
    results = []
    for threshold in SCORE_THRESHOLDS:
        for (et_key, et_label) in ENTRY_TIMES:
            for (ec_key, ec_label) in ENTRY_CONDITIONS:
                trades = run_combo(pick_days, bars_map, threshold, et_key, ec_key)
                for rule in EXIT_RULES:
                    rets = [simulate_exit(t, rule) for t in trades]
                    agg = aggregate_rule(rets)
                    results.append({
                        "threshold": threshold,
                        "entryTime": et_key, "entryLabel": et_label,
                        "entryCondition": ec_key, "conditionLabel": ec_label,
                        "exitKey": rule["key"], "exitLabel": rule["label"],
                        "strategyLabel": f"≥{threshold}分 {et_label} {ec_label} → {rule['label']}",
                        **agg,
                    })
    results.sort(key=lambda r: (r.get("meanNet") or -99), reverse=True)
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=30)
    ap.add_argument("--min-trades", type=int, default=30)
    args = ap.parse_args()

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("載入每日選股資料...")
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    heavyweight, known_disposal = hs.load_categories()
    pick_days = build_pick_days(days, rev_maps, heavyweight, known_disposal)
    total_picks = sum(len(d["picks"]) for d in pick_days)
    print(f"選股日 {len(pick_days)} 天，score≥50 精選總計 {total_picks} 筆")

    print("預載 1 分 K 快取...")
    bars_map = preload_bars(pick_days)
    cached = sum(1 for v in bars_map.values() if v)
    print(f"快取命中 {cached}/{len(bars_map)} 筆 (code,date) 對")

    n_combos = len(SCORE_THRESHOLDS) * len(ENTRY_TIMES) * len(ENTRY_CONDITIONS) * len(EXIT_RULES)
    print(f"跑 {len(SCORE_THRESHOLDS)} 門檻 × {len(ENTRY_TIMES)} 時間 × "
          f"{len(ENTRY_CONDITIONS)} 條件 × {len(EXIT_RULES)} 出場規則 = {n_combos} 組合...")

    results = build_grid(pick_days, bars_map)
    qualified = [r for r in results if r["trades"] >= args.min_trades]

    # ── 排行表 ──────────────────────────────────────────────────
    print(f"\n{'排名':<4} {'策略':55s} {'筆數':>5} {'勝率':>6} {'期望值/筆':>10} {'獲利因子':>8}")
    print("─" * 93)
    for rank, r in enumerate(qualified[:args.top], 1):
        pf_str = "∞" if r["profitFactor"] is None else f"{r['profitFactor']:.2f}"
        wr_str = f"{r['winRate']:.0f}%" if r["winRate"] is not None else "—"
        ev_str = f"{r['meanNet']:+.3f}%" if r["meanNet"] is not None else "—"
        mark = " ★" if (r.get("meanNet") or 0) > 0 else ""
        print(f"#{rank:<3} {r['strategyLabel'][:55]:55s} {r['trades']:>5} "
              f"{wr_str:>6} {ev_str:>10} {pf_str:>8}{mark}")

    # ── 正期望值策略 ─────────────────────────────────────────────
    positive = [r for r in qualified if (r.get("meanNet") or 0) > 0]
    print(f"\n══ 正期望值策略（≥{args.min_trades}筆）：{len(positive)} 個 ══")
    if positive:
        print(f"{'策略':55s} {'筆數':>5} {'勝率':>6} {'期望值':>10} {'總報酬':>9} {'最大回檔':>9}")
        print("─" * 97)
        for r in positive:
            pf_s = "∞" if r["profitFactor"] is None else f"{r['profitFactor']:.2f}"
            print(f"{r['strategyLabel'][:55]:55s} {r['trades']:>5} "
                  f"{r['winRate']:.0f}%{'':<4} {r['meanNet']:>+8.3f}%  "
                  f"{r['totalNet']:>+7.1f}%  -{r['maxDrawdown']:>6.1f}%")
    else:
        print("  （無正期望值策略）")

    # ── 各入場條件最佳 ──────────────────────────────────────────
    print("\n══ 各入場條件最佳結果 ══")
    for (ec_key, ec_label) in ENTRY_CONDITIONS:
        subset = [r for r in qualified if r["entryCondition"] == ec_key]
        if not subset:
            continue
        best = subset[0]
        print(f"  {ec_label:<12}  最佳：{best['exitLabel']:<22} "
              f"EV={best['meanNet']:+.3f}%  勝率={best['winRate']:.0f}%  n={best['trades']}")

    # ── 儲存 ────────────────────────────────────────────────────
    out = os.path.join("data", "strategy_grid.json")
    with open(out, "w", encoding="utf-8") as fp:
        json.dump({
            "totalCombinations": n_combos,
            "qualifiedCombinations": len(qualified),
            "positiveEV": len(positive),
            "minTrades": args.min_trades,
            "grid": SCORE_THRESHOLDS,
            "entryTimes": ENTRY_TIMES,
            "entryConditions": ENTRY_CONDITIONS,
            "top50": qualified[:50],
        }, fp, ensure_ascii=False, indent=2)
    print(f"\n完整結果存至 {out}")


if __name__ == "__main__":
    main()
