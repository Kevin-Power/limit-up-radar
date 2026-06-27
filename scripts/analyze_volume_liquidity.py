"""成交量/流動性維度優化分析。

目標：找出可執行性高且報酬好的子集
- 用 D-1（前一日）成交量分桶 → 各桶勝率/EV
- 用 D-1 成交金額分桶 → 各桶勝率/EV
- 計算 5 日均量、量增比（D-1 量 / 5MA）→ 分桶
- 用開盤前 3 分鐘 1 分 K 算「開盤量推力」proxy（價格範圍/變動率 — 無 volume 欄位）
- 設計過濾規則並計算套用後總損益

基線策略：score≥75，T+1 開盤競價買進（day_bars[0].open），T+2 開盤賣出（next_bars[0].open）
成本：2.8 折手續費 = 0.1425% × 0.28 × 2 + 0.3% 稅 = 0.3798% ≈ 0.38%

注意：1 分 K 快取沒有 volume 欄位，因此「開盤前 3 分鐘成交量」只能用價格變動的代理指標。
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
# 2.8 折手續費 + 0.3% 證交稅
COST_PCT = 0.1425 * 0.28 * 2 + 0.30   # = 0.0798 + 0.30 = 0.3798
ASSUMED_TWD_PER_TRADE = 100_000        # 假設每筆 10 萬 → 換算總損益
SCORE_MIN = 75


def _load_bars(code, date):
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def wilson_ci(wins, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = wins / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (round((center - margin) * 100, 1), round((center + margin) * 100, 1))


def bucket_stats(label, trades):
    """trades=[{ret,...}] → {label, n, winRate, evPct, medianPct, totalNet, ciLow, ciHigh, totalTWD}"""
    rets = [t["ret"] for t in trades]
    n = len(rets)
    if n == 0:
        return {"label": label, "n": 0, "winRate": None, "evPct": None,
                "medianPct": None, "totalPct": 0, "totalTWD": 0,
                "ciLow": None, "ciHigh": None}
    wins = sum(1 for r in rets if r > 0)
    lo, hi = wilson_ci(wins, n)
    return {
        "label": label,
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "evPct": round(statistics.mean(rets), 3),
        "medianPct": round(statistics.median(rets), 3),
        "totalPct": round(sum(rets), 2),
        "totalTWD": round(sum(rets) / 100 * ASSUMED_TWD_PER_TRADE),
        "ciLow": lo, "ciHigh": hi,
    }


# ── 建構基線交易（含 volume 資訊） ──────────────────────────
def build_pick_lookup(days):
    """{(date, code): stock_dict} — 給 5MA / 歷史量查詢。"""
    lookup = {}
    for d in days:
        for g in d["groups"]:
            for s in g["stocks"]:
                lookup[(d["date"], s["code"])] = s
    return lookup


def collect_trades(pick_days, days, score_min=SCORE_MIN):
    """T+1 開盤競價買 → T+2 開盤賣。

    每筆附帶 D-1（pickDate 當日）的 volume / closePrice / industry。
    """
    # 找出日期索引
    date_idx = {d["date"]: i for i, d in enumerate(days)}
    pick_lookup = build_pick_lookup(days)

    trades = []
    for d in pick_days:
        pick_date = d["pickDate"]
        entry_date = d["entryDate"]
        next_date = d.get("nextDate")
        if not next_date:
            continue
        for p in d["picks"]:
            if p["score"] < score_min:
                continue
            code = p["code"]
            stock = pick_lookup.get((pick_date, code))
            if not stock:
                continue
            volume = stock.get("volume", 0)   # 股數
            prev_close = stock.get("close", 0)
            industry = stock.get("industry", "") or ""

            # 載入 entry / next 1 分 K
            day_bars = _load_bars(code, entry_date)
            next_bars = _load_bars(code, next_date)
            if not day_bars or not next_bars:
                continue
            entry = day_bars[0]["open"]
            exit_p = next_bars[0]["open"]
            if entry <= 0:
                continue
            gross = (exit_p - entry) / entry * 100
            net = gross - COST_PCT

            # 開盤前 3 分鐘的「價格推力」proxy（無 volume 欄位）
            first3 = [b for b in day_bars if b["time"] <= "09:03"]
            if first3:
                last_p = first3[-1]["close"]
                range_pct = (max(b["high"] for b in first3) - min(b["low"] for b in first3)) / entry * 100
                momentum_pct = (last_p - entry) / entry * 100
            else:
                range_pct = 0
                momentum_pct = 0

            # 5 日均量（D-1 為今天，往前算 D-2 ~ D-6 共 5 天的量）
            i = date_idx.get(pick_date)
            ma5_volume = None
            if i is not None:
                prev_vols = []
                for j in range(i - 1, max(-1, i - 6), -1):
                    s2 = pick_lookup.get((days[j]["date"], code))
                    if s2 and s2.get("volume"):
                        prev_vols.append(s2["volume"])
                if len(prev_vols) >= 3:
                    ma5_volume = sum(prev_vols) / len(prev_vols)

            trades.append({
                "pickDate": pick_date,
                "entryDate": entry_date,
                "code": code,
                "name": p["name"],
                "score": p["score"],
                "prevClose": prev_close,
                "entry": entry,
                "exit": exit_p,
                "ret": round(net, 4),
                "grossRet": round(gross, 4),
                "industry": industry,
                # 量能指標
                "prevDayVolumeShares": volume,                 # 股數
                "prevDayVolumeLots": round(volume / 1000),     # 張數
                "prevDayTurnoverTWD": round(volume * prev_close),
                "ma5VolumeLots": round(ma5_volume / 1000) if ma5_volume else None,
                "volumeRatio5MA": round(volume / ma5_volume, 2) if ma5_volume else None,
                # 開盤 3 分鐘代理指標
                "first3RangePct": round(range_pct, 3),
                "first3MomentumPct": round(momentum_pct, 3),
            })
    return trades


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("[1/4] 載入資料...")
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    pick_days = build_pick_days(days, rev_maps, hw, disp)
    print(f"      共 {len(days)} 個交易日，{len(pick_days)} 個選股日（含 D+1）")

    print(f"[2/4] 建構基線（score>={SCORE_MIN}, T+1 open → T+2 open）...")
    trades = collect_trades(pick_days, days, score_min=SCORE_MIN)
    print(f"      共 {len(trades)} 筆有完整 1 分 K 的交易")

    if not trades:
        print("無交易，結束")
        return

    rets = [t["ret"] for t in trades]
    baseline = {
        "n": len(trades),
        "winRate": round(sum(1 for r in rets if r > 0) / len(rets) * 100, 1),
        "evPct": round(statistics.mean(rets), 3),
        "totalPct": round(sum(rets), 2),
        "totalTWD": round(sum(rets) / 100 * ASSUMED_TWD_PER_TRADE),
    }
    print(f"      基線：勝率 {baseline['winRate']}%，EV {baseline['evPct']:+.3f}%，"
          f"總損益 {baseline['totalTWD']:,} TWD（假設每筆 10 萬）")

    print("[3/4] 分桶分析...")

    # ── 1. 前一日成交量分桶 (張數) ──
    vol_buckets = [
        ("< 200 張", 0, 200),
        ("200-500 張", 200, 500),
        ("500-1k 張", 500, 1000),
        ("1k-2k 張", 1000, 2000),
        ("2k-5k 張", 2000, 5000),
        ("5k-10k 張", 5000, 10000),
        ("10k-30k 張", 10000, 30000),
        ("30k+ 張", 30000, 10**12),
    ]
    vol_results = []
    for label, lo, hi in vol_buckets:
        sub = [t for t in trades if lo <= t["prevDayVolumeLots"] < hi]
        vol_results.append({**bucket_stats(label, sub), "loLots": lo, "hiLots": hi})
        s = vol_results[-1]
        if s["n"] > 0:
            print(f"      [量{label:>12}] n={s['n']:>3} 勝{s['winRate']:>5.1f}% "
                  f"EV{s['evPct']:+6.3f}% Total{s['totalTWD']:>10,} TWD CI[{s['ciLow']},{s['ciHigh']}]")

    # ── 2. 前一日成交金額分桶 (TWD) ──
    turnover_buckets = [
        ("< 1千萬", 0, 10_000_000),
        ("1千萬-5千萬", 10_000_000, 50_000_000),
        ("5千萬-1億", 50_000_000, 100_000_000),
        ("1億-5億", 100_000_000, 500_000_000),
        ("5億-10億", 500_000_000, 1_000_000_000),
        ("10億+", 1_000_000_000, 10**14),
    ]
    turnover_results = []
    for label, lo, hi in turnover_buckets:
        sub = [t for t in trades if lo <= t["prevDayTurnoverTWD"] < hi]
        turnover_results.append({**bucket_stats(label, sub), "loTWD": lo, "hiTWD": hi})
        s = turnover_results[-1]
        if s["n"] > 0:
            print(f"      [額{label:>10}] n={s['n']:>3} 勝{s['winRate']:>5.1f}% "
                  f"EV{s['evPct']:+6.3f}% Total{s['totalTWD']:>10,} TWD CI[{s['ciLow']},{s['ciHigh']}]")

    # ── 3. 量增比（D-1 量 / 5MA） ──
    ratio_buckets = [
        ("< 0.5x（萎縮）", 0, 0.5),
        ("0.5-0.8x", 0.5, 0.8),
        ("0.8-1.2x（持平）", 0.8, 1.2),
        ("1.2-2x", 1.2, 2.0),
        ("2-5x（爆量）", 2.0, 5.0),
        ("5-10x（巨爆量）", 5.0, 10.0),
        ("10x+（異常）", 10.0, 10**6),
    ]
    ratio_results = []
    with_ratio = [t for t in trades if t["volumeRatio5MA"] is not None]
    no_ratio = [t for t in trades if t["volumeRatio5MA"] is None]
    print(f"      [量增比] 有資料 {len(with_ratio)} / 無 5MA 資料 {len(no_ratio)}")
    for label, lo, hi in ratio_buckets:
        sub = [t for t in with_ratio if lo <= t["volumeRatio5MA"] < hi]
        ratio_results.append({**bucket_stats(label, sub), "loRatio": lo, "hiRatio": hi})
        s = ratio_results[-1]
        if s["n"] > 0:
            print(f"      [增{label:>14}] n={s['n']:>3} 勝{s['winRate']:>5.1f}% "
                  f"EV{s['evPct']:+6.3f}% Total{s['totalTWD']:>10,} TWD CI[{s['ciLow']},{s['ciHigh']}]")

    # ── 4. 開盤 3 分鐘價格範圍 proxy（波動度） ──
    range_buckets = [
        ("< 0.5%（靜）", 0, 0.5),
        ("0.5-1.5%", 0.5, 1.5),
        ("1.5-3%", 1.5, 3.0),
        ("3-5%", 3.0, 5.0),
        ("5%+（劇烈）", 5.0, 100),
    ]
    range_results = []
    for label, lo, hi in range_buckets:
        sub = [t for t in trades if lo <= t["first3RangePct"] < hi]
        range_results.append({**bucket_stats(label, sub), "loRange": lo, "hiRange": hi})
        s = range_results[-1]
        if s["n"] > 0:
            print(f"      [3分範圍{label:>12}] n={s['n']:>3} 勝{s['winRate']:>5.1f}% "
                  f"EV{s['evPct']:+6.3f}% Total{s['totalTWD']:>10,} TWD")

    # ── 5. 設計過濾規則組合 ──
    print("[4/4] 過濾規則設計與套用...")

    candidate_rules = [
        # (label, predicate)
        ("baseline (score>=75)", lambda t: True),
        # 下界：太冷不要
        ("Vol >= 500 張", lambda t: t["prevDayVolumeLots"] >= 500),
        ("Vol >= 1000 張", lambda t: t["prevDayVolumeLots"] >= 1000),
        ("Vol >= 2000 張", lambda t: t["prevDayVolumeLots"] >= 2000),
        # 上界：太爆不要
        ("Vol < 30000 張", lambda t: t["prevDayVolumeLots"] < 30000),
        ("Vol < 50000 張", lambda t: t["prevDayVolumeLots"] < 50000),
        # 量增比
        ("VolRatio < 5x", lambda t: t["volumeRatio5MA"] is None or t["volumeRatio5MA"] < 5),
        ("VolRatio < 3x", lambda t: t["volumeRatio5MA"] is None or t["volumeRatio5MA"] < 3),
        ("0.5x <= VolRatio < 5x", lambda t: t["volumeRatio5MA"] is None or 0.5 <= t["volumeRatio5MA"] < 5),
        # 金額
        ("Turnover >= 5千萬", lambda t: t["prevDayTurnoverTWD"] >= 50_000_000),
        ("Turnover >= 1億", lambda t: t["prevDayTurnoverTWD"] >= 100_000_000),
        # 組合（量在合理區間 + 量增比正常）
        ("Vol 500~30k + VolRatio<5x",
         lambda t: 500 <= t["prevDayVolumeLots"] < 30000
                   and (t["volumeRatio5MA"] is None or t["volumeRatio5MA"] < 5)),
        ("Vol 1k~30k + VolRatio<5x",
         lambda t: 1000 <= t["prevDayVolumeLots"] < 30000
                   and (t["volumeRatio5MA"] is None or t["volumeRatio5MA"] < 5)),
        ("Vol 1k~50k + VolRatio<10x",
         lambda t: 1000 <= t["prevDayVolumeLots"] < 50000
                   and (t["volumeRatio5MA"] is None or t["volumeRatio5MA"] < 10)),
        ("Vol 2k~30k", lambda t: 2000 <= t["prevDayVolumeLots"] < 30000),
        ("Vol 500~50k", lambda t: 500 <= t["prevDayVolumeLots"] < 50000),
        # 開盤 3 分鐘 proxy
        ("first3Range < 5%", lambda t: t["first3RangePct"] < 5),
        ("Vol>=500 + first3Range<5%",
         lambda t: t["prevDayVolumeLots"] >= 500 and t["first3RangePct"] < 5),
    ]

    rule_results = []
    for label, pred in candidate_rules:
        sub = [t for t in trades if pred(t)]
        s = bucket_stats(label, sub)
        # 與基線比較
        delta_twd = s["totalTWD"] - baseline["totalTWD"]
        s["deltaVsBaselineTWD"] = delta_twd
        s["coverage"] = round(s["n"] / baseline["n"] * 100, 1) if baseline["n"] else 0
        rule_results.append(s)
        print(f"      [規則] {label:<35} n={s['n']:>3} ({s['coverage']:>5.1f}%) "
              f"勝{s['winRate']:>5.1f}% EV{s['evPct']:+6.3f}% "
              f"Total{s['totalTWD']:>10,} (Δ{delta_twd:+,}) TWD")

    # ── 套用：以「最佳改善」規則 vs 基線 ──
    # 過濾掉 baseline 本身做排序
    improving = [r for r in rule_results
                 if r["label"] != "baseline (score>=75)" and r["n"] >= 50]
    improving.sort(key=lambda r: -r["totalTWD"])

    # ── 月度切分：volume 過濾規則在 6月失效期能否避險？──
    print("\n[Bonus] 月度切分：volume 過濾在 6月失效期的表現")
    print("=" * 68)

    def by_month(rule_pred):
        out = {}
        for t in trades:
            if not rule_pred(t):
                continue
            m = t["pickDate"][:7]
            out.setdefault(m, []).append(t["ret"])
        return {m: bucket_stats(m, [{"ret": r} for r in rets]) for m, rets in out.items()}

    monthly_check = {
        "baseline": by_month(lambda t: True),
        "Vol 2k~30k": by_month(lambda t: 2000 <= t["prevDayVolumeLots"] < 30000),
        "Turnover >= 1億": by_month(lambda t: t["prevDayTurnoverTWD"] >= 100_000_000),
        "Vol < 30000": by_month(lambda t: t["prevDayVolumeLots"] < 30000),
    }
    for rule_name, m in monthly_check.items():
        print(f"\n  [{rule_name}]")
        for month, s in sorted(m.items()):
            print(f"      {month}: n={s['n']:>3} 勝{s['winRate']:>5.1f}% "
                  f"EV{s['evPct']:+6.3f}% Total{s['totalTWD']:>+10,} TWD")

    output_extra = {"monthlyCheck": monthly_check}

    # ── 輸出 JSON ──
    output = {
        "dimension": "volume_liquidity",
        "baseline": baseline,
        "params": {
            "scoreMin": SCORE_MIN,
            "costPct": COST_PCT,
            "assumedTWDPerTrade": ASSUMED_TWD_PER_TRADE,
            "method": "T+1 open buy → T+2 open sell（與 user 提供的基線一致）",
        },
        "buckets": {
            "prevDayVolume": vol_results,
            "prevDayTurnover": turnover_results,
            "volumeRatio5MA": ratio_results,
            "first3MinRange": range_results,
        },
        "rules": rule_results,
        "topRules": improving[:5],
        "totalTrades": len(trades),
        "monthlyCheck": output_extra["monthlyCheck"],
        "caveats": [
            "1 分 K 快取無 volume 欄位 → 「開盤前 3 分鐘成交量」改用價格範圍(range_pct) 代理",
            "5MA 量需要至少 3 天歷史，部分新出現的個股無此資料",
            "套用 2.8 折手續費 0.0399%×2 + 證交稅 0.30% = 0.3798% 來回成本",
            "Total TWD = sum(ret_pct) × 假設每筆 10 萬",
            f"基線 score>={SCORE_MIN} 樣本數 {len(trades)} 與 user 提到的 274 略有差異（user 用 score>=70 + 09:01 close）",
        ],
    }

    out_path = "data/opt_volume_liquidity.json"
    os.makedirs("data", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n寫入: {out_path}")

    # ── 摘要 ──
    print(f"\n{'='*68}")
    print("  TOP 5 改善規則（依總損益 TWD 排序）")
    print(f"{'='*68}")
    for r in improving[:5]:
        print(f"  {r['label']:<35} n={r['n']:>3} 勝{r['winRate']:>5.1f}% "
              f"EV{r['evPct']:+6.3f}% Total{r['totalTWD']:>10,} "
              f"(Δ{r['deltaVsBaselineTWD']:+,}) TWD")


if __name__ == "__main__":
    main()
