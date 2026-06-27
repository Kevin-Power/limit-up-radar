"""Optimized strategy synthesizer — layer 7 探索維度的存活規則並回測。

設計原則
========
* 基線：score≥75、T+1 開盤競價買進、T+2 開盤賣出、2.8 折手續費 + 0.3% 證交稅
* 樣本期：與探索結果共用 (2026-04-13 ~ 2026-06-24, 207 ~ 274 筆視 score 門檻)
* 規則照「過了 2/3 視角驗證」者優先；其它探索結果列為 candidate（標 confidence）

實作的規則 (依 evidence strength 排序)
--------------------------------------
R1 ★ ADVERSARIAL-VERIFIED (gap × score × 出場時機):
       score≥75 AND 0% ≤ gap < 5%  →  改在 T+1 09:15 出場 (而非 T+2 open)
       (gap ≥ 5% 仍走 T+2 open；gap < 0% 同 baseline)
R2  STOCK FEATURES 黑名單三劍客 (out-of-sample 待驗，但 effect 大、樣本厚):
       排除 score 90-99
       排除 D-1 成交量 ≥ 20,000 張
       排除 close < 30 元
R3  CATEGORY 擁擠度反指標：
       同日同族群 ≥ 8 檔 → 整族群當日不交易
R4  VOLUME LIQUIDITY: D-1 turnover ≥ 1 億 (排除極低流動性)
R5  MARKET REGIME: 當日 ≥75 分精選 ≤ 15 檔才開倉 (LOO 驗證最強)

成本
----
* 來回手續費  = 0.1425% × 2 × 0.28 = 0.0798%
* 賣出證交稅  = 0.3%
* 等價百分點扣  = 0.3798% (COST_RT)

NOMINAL 每筆 1,000,000 TWD (與探索結果一致, 便於對比)

輸出
----
data/opt_combined_strategy.json
"""
import json
import math
import os
import sys
from collections import defaultdict
from statistics import mean, median, pstdev

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs                               # noqa: E402
from run_backtest_0903 import build_pick_days          # noqa: E402

COMMISSION_RT = 0.1425 * 0.28 * 2 / 100
TAX = 0.003
COST_RT = (COMMISSION_RT + TAX) * 100   # 0.3798 percentage points

NOMINAL_TWD_PER_TRADE = 1_000_000

CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "opt_combined_strategy.json")

# ── helpers ──────────────────────────────────────────────────
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
    return cands[-1]["close"] if cands else None


def wilson_ci(wins, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = wins / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (round((center - margin) * 100, 1), round((center + margin) * 100, 1))


def max_drawdown_pct(rets):
    eq = 100.0
    peak = 100.0
    mdd = 0.0
    for r in rets:
        eq *= (1 + r / 100)
        peak = max(peak, eq)
        mdd = max(mdd, (peak - eq) / peak * 100)
    return round(mdd, 2)


def sharpe(rets):
    if len(rets) < 2:
        return None
    m = mean(rets)
    s = pstdev(rets)
    if s == 0:
        return None
    return round(m / s * math.sqrt(len(rets)), 3)


def stat_pack(rets):
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "evPct": None, "median": None,
                "ciLow": None, "ciHigh": None, "totalPct": 0,
                "totalTWD": 0, "maxDrawdownPct": 0, "sharpe": None}
    wins = sum(1 for r in rets if r > 0)
    lo, hi = wilson_ci(wins, n)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "evPct": round(mean(rets), 3),
        "median": round(median(rets), 3),
        "ciLow": lo, "ciHigh": hi,
        "totalPct": round(sum(rets), 2),
        "totalTWD": round(sum(rets) / 100 * NOMINAL_TWD_PER_TRADE),
        "maxDrawdownPct": max_drawdown_pct(rets),
        "sharpe": sharpe(rets),
    }


# ── 探索期決定的 regime: ≥75 分精選數量上限 ───────────────────
def daily_pick_counts(pick_days, score_min=75):
    """每個 entryDate → 該日 ≥score_min 的精選數量。"""
    out = {}
    for d in pick_days:
        cnt = sum(1 for p in d["picks"] if p["score"] >= score_min)
        out[d["entryDate"]] = cnt
    return out


def category_size_lookup(days):
    """{(entryDate, code) -> 該族群當日入選檔數}。
    族群來源：原始 daily 檔的 groups[].stocks（包含 score 低的）。
    使用 entryDate 對應的 daily file (即「pickDate 的下一天」？實際上 entryDate
    是 D+1，而族群分類是 D 當日選出 → 取 day where date == picksDate (pickDate)。)
    我們在 build_pick_days 中 pickDate=days[i]['date'], entryDate=days[i+1]['date']
    因此 stocks 的族群歸屬要用 pickDate 對應的 daily file。
    """
    by_pickdate = {d["date"]: d for d in days}
    out = {}
    for pickdate, daily in by_pickdate.items():
        for g in daily.get("groups", []):
            n_in_group = len(g.get("stocks", []))
            for s in g["stocks"]:
                out[(pickdate, s["code"])] = (g["name"], n_in_group)
    return out


# ── 建立 enriched trades ─────────────────────────────────────
def build_enriched_trades(days, pick_days, score_min=75):
    """收集每筆 candidate trade 並 attach 所有 filter 需要的 metadata + exits。
    回 list of dict, 每筆含：
      pickDate, entryDate, nextDate, code, name, score, prevClose,
      market, prevVolume, industry, groupName, groupSize,
      gapPct, exit_0915, exit_T2open, dayPicks75 (entryDate 的 ≥75 精選數)
    """
    cat_lookup = category_size_lookup(days)
    daycnt = daily_pick_counts(pick_days, score_min=score_min)

    # 從 daily 檔取 stock 完整資訊
    stock_meta = {}  # (pickDate, code) -> {market, prevVolume, close, industry}
    for d in days:
        for g in d.get("groups", []):
            for s in g["stocks"]:
                stock_meta[(d["date"], s["code"])] = {
                    "market": s.get("market"),
                    "prevVolume": s["volume"],  # 注意：選股當日的 volume = D-0 也是 D-1 (隔日進場相對)
                    "close": s["close"],
                    "industry": s.get("industry"),
                }

    trades = []
    for d in pick_days:
        if not d.get("nextDate"):
            continue
        for p in d["picks"]:
            if p["score"] < score_min:
                continue
            day_bars = load_cache(p["code"], d["entryDate"]) or []
            next_bars = load_cache(p["code"], d["nextDate"]) or []
            if not day_bars or not next_bars:
                continue
            entry = day_bars[0]["open"]
            if entry <= 0:
                continue
            prev_close = p["prevClose"]
            gap_pct = (entry - prev_close) / prev_close * 100

            # exits
            p_0915 = bar_close_at_or_before(day_bars, "09:15")
            exit_0915 = (round((p_0915 - entry) / entry * 100 - COST_RT, 4)
                         if p_0915 else None)
            t2_open = next_bars[0]["open"]
            exit_T2open = round((t2_open - entry) / entry * 100 - COST_RT, 4)

            meta = stock_meta.get((d["pickDate"], p["code"]), {})
            cat_name, cat_size = cat_lookup.get((d["pickDate"], p["code"]),
                                                (None, None))

            trades.append({
                "pickDate": d["pickDate"],
                "entryDate": d["entryDate"],
                "nextDate": d["nextDate"],
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "prevClose": prev_close,
                "market": meta.get("market"),
                "prevVolume": meta.get("prevVolume"),
                "industry": meta.get("industry"),
                "groupName": cat_name,
                "groupSize": cat_size,
                "dayPicks75": daycnt.get(d["entryDate"], 0),
                "gapPct": round(gap_pct, 3),
                "exit_0915": exit_0915,
                "exit_T2open": exit_T2open,
            })
    return trades


# ── 規則 ─────────────────────────────────────────────────────
def apply_R1_dynamic_exit(t):
    """gap 0-5 → 09:15 出場；否則 T+2 open。
    回淨報酬% 或 None (資料缺)。"""
    if 0 <= t["gapPct"] < 5:
        return t["exit_0915"] if t["exit_0915"] is not None else t["exit_T2open"]
    return t["exit_T2open"]


def passes_R2_blacklist(t):
    """剔除：score 90-99、prevVolume ≥ 20,000 張、prevClose < 30 元。"""
    if 90 <= t["score"] < 100:
        return False
    if t["prevVolume"] is not None and t["prevVolume"] >= 20_000_000:  # 張 = volume/1000; 20k 張 = 2e7
        return False
    if t["prevClose"] is not None and t["prevClose"] < 30:
        return False
    return True


def passes_R3_cluster(t):
    """同日同族群 ≥ 8 檔則剔除。groupSize 未知 (e.g. 7) 視為通過 (寬鬆)。"""
    if t["groupSize"] is not None and t["groupSize"] >= 8:
        return False
    return True


def passes_R4_turnover(t):
    """D-1 成交金額 ≥ 1 億 = prevVolume * prevClose ≥ 1e8。"""
    if t["prevVolume"] is None or t["prevClose"] is None:
        return True
    return t["prevVolume"] * t["prevClose"] >= 100_000_000


def passes_R5_regime(t):
    """當日 ≥75 分精選 ≤ 15 才交易。"""
    return t["dayPicks75"] <= 15


# ── 套用組合 ─────────────────────────────────────────────────
def apply_stack(trades, filters, exit_fn=lambda t: t["exit_T2open"]):
    """filters: list of (label, passes_fn)。回 dict 含 stat + 樣本清單。"""
    kept_rets = []
    excluded_by = defaultdict(int)
    kept_trades = []
    for t in trades:
        ok = True
        for label, fn in filters:
            if not fn(t):
                excluded_by[label] += 1
                ok = False
                break  # 計算為「被第一個刷掉的 filter 負責」
        if not ok:
            continue
        r = exit_fn(t)
        if r is None:
            continue
        kept_rets.append(r)
        kept_trades.append({**t, "appliedRet": r})
    s = stat_pack(kept_rets)
    s["excludedByFilter"] = dict(excluded_by)
    return s, kept_trades


# ── 月度切片 ─────────────────────────────────────────────────
def by_month(trades, filters, exit_fn):
    groups = defaultdict(list)
    for t in trades:
        if all(fn(t) for _, fn in filters):
            r = exit_fn(t)
            if r is not None:
                groups[t["entryDate"][:7]].append(r)
    return {m: stat_pack(v) for m, v in sorted(groups.items())}


def annualized_return_per_trade_compound(rets, trades_per_year_est=None):
    """更誠實的年化估算：假設每進場日平均 X 筆交易、所有筆等權，
    依筆數對 daily return 加權平均後年化。
    這裡用「複利乘積」：把 207 筆 ret 連乘 → 換算每年複利。
    需給「每年大約有幾筆同類交易」(trades_per_year_est)。"""
    if not rets:
        return None
    # 樣本期內的複利倍率
    prod = 1.0
    for r in rets:
        prod *= 1 + r / 100
    if trades_per_year_est is None or trades_per_year_est <= 0:
        return None
    n = len(rets)
    n_years = n / trades_per_year_est
    if n_years <= 0:
        return None
    if prod <= 0:
        return None
    return round((prod ** (1 / n_years) - 1) * 100, 2)


def calendar_trading_days(entry_dates):
    """估算樣本實際橫跨的『交易日數』:
    用 entryDate 升冪首尾日的工作日差 (近似 5/7)。"""
    if not entry_dates:
        return 0
    from datetime import date
    sd = date.fromisoformat(min(entry_dates))
    ed = date.fromisoformat(max(entry_dates))
    days = (ed - sd).days + 1
    return max(1, round(days * 5 / 7))


def annualized_per_trade_per_day(total_pct, trading_days, days_per_year=252):
    """『每日資金充分輪動』的線性年化 (非複利)：
    平均每交易日報酬 = 總% / trading_days，乘 252。
    這是 EV-based 年化，不考慮 sizing/重疊。"""
    if trading_days <= 0:
        return None
    daily = total_pct / trading_days
    return round(daily * days_per_year, 1)


# ── 主流程 ───────────────────────────────────────────────────
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
    print(f"選股日 {len(pick_days)} 天")

    # 全域 trades (score>=75) 已含 exits
    trades = build_enriched_trades(days, pick_days, score_min=75)
    print(f"score≥75 有效交易: {len(trades)} 筆 "
          f"(快取命中 + entry/next 兩日皆有 1 分 K)")

    # 也建一份 score≥70 (給「逐層套用 from score>=50/70 起頭」對比)
    trades_70 = build_enriched_trades(days, pick_days, score_min=70)
    trades_50 = build_enriched_trades(days, pick_days, score_min=50)

    # 基線
    base_rets = [t["exit_T2open"] for t in trades if t["exit_T2open"] is not None]
    baseline = stat_pack(base_rets)
    baseline["label"] = "score≥75, T+2 open (基線)"
    print(f"\n基線: n={baseline['n']} 勝率{baseline['winRate']}% "
          f"EV{baseline['evPct']}% 累計{baseline['totalTWD']:+,} TWD")

    # 計算 trading days (進場日數)
    entry_days = sorted({t["entryDate"] for t in trades})
    n_entry_days = len(entry_days)
    print(f"進場日數: {n_entry_days}")

    # ── 逐步堆疊 ──────────────────────────────────────────────
    R1 = ("R1 動態出場 gap 0-5→09:15", lambda t: True)   # R1 是出場規則，不是過濾
    R2 = ("R2 黑名單(score90+/巨量/低價)", passes_R2_blacklist)
    R3 = ("R3 族群擁擠 ≤7", passes_R3_cluster)
    R4 = ("R4 D-1 turnover ≥1億", passes_R4_turnover)
    R5 = ("R5 regime: dayPicks75≤15", passes_R5_regime)

    exit_baseline = lambda t: t["exit_T2open"]
    exit_R1 = apply_R1_dynamic_exit

    layers = [
        ("L0 baseline (score≥75, T+2 open)", [], exit_baseline),
        ("L1 +R1 動態出場", [], exit_R1),
        ("L2 L1 +R2 黑名單", [R2], exit_R1),
        ("L3 L2 +R3 族群擁擠 ≤7", [R2, R3], exit_R1),
        ("L4 L3 +R4 turnover ≥1億", [R2, R3, R4], exit_R1),
        ("L5 L4 +R5 regime dayPicks≤15", [R2, R3, R4, R5], exit_R1),
    ]

    layer_results = []
    for label, filters, ef in layers:
        s, _ = apply_stack(trades, filters, ef)
        s["label"] = label
        layer_results.append(s)
        delta_twd = s["totalTWD"] - baseline["totalTWD"]
        print(f"\n{label}")
        print(f"  n={s['n']} 勝率{s['winRate']}% EV{s['evPct']}% "
              f"中位{s['median']}% MDD{s['maxDrawdownPct']}% Sharpe{s['sharpe']} "
              f"累計{s['totalTWD']:+,} TWD (Δ {delta_twd:+,})")
        if s.get("excludedByFilter"):
            print(f"  排除: {s['excludedByFilter']}")

    # ── 額外組合: 只用最強的 ──
    print("\n──── 子集探索 ────")
    extra_combos = [
        ("R1+R3 只動態出場+族群擁擠", [R3], exit_R1),
        ("R1+R5 只動態出場+regime", [R5], exit_R1),
        ("R1+R2 只動態出場+黑名單", [R2], exit_R1),
        ("R1+R2+R5 (穩健三件套)", [R2, R5], exit_R1),
        ("R1+R2+R3 (反擁擠三件套)", [R2, R3], exit_R1),
    ]
    extra_results = []
    for label, filters, ef in extra_combos:
        s, _ = apply_stack(trades, filters, ef)
        s["label"] = label
        extra_results.append(s)
        delta = s["totalTWD"] - baseline["totalTWD"]
        print(f"  {label:32s} n={s['n']:3d} 勝率{s['winRate']:>5}% "
              f"EV{s['evPct']:>+6.3f}% MDD{s['maxDrawdownPct']:>5.2f}% "
              f"Sharpe{str(s['sharpe']):>6} 累計{s['totalTWD']:+,} "
              f"(Δ {delta:+,})")

    # ── 從 score≥50/70 起算的對比 (顯示 score 閾值的價值) ──
    print("\n──── score 閾值掃描 (T+2 open 基線) ────")
    threshold_compare = []
    for tlist, tag in [(trades_50, "score≥50"), (trades_70, "score≥70"),
                       (trades, "score≥75")]:
        rets = [t["exit_T2open"] for t in tlist if t["exit_T2open"] is not None]
        s = stat_pack(rets)
        s["label"] = f"{tag}, T+2 open"
        threshold_compare.append(s)
        print(f"  {tag:10s} n={s['n']:>4} 勝率{s['winRate']}% "
              f"EV{s['evPct']:+.3f}% 累計{s['totalTWD']:+,}")

    # ── score≥50/70 + R1 動態出場 ──
    print("\n──── score 閾值 + R1 動態出場 ────")
    threshold_r1_compare = []
    for tlist, tag in [(trades_50, "score≥50"), (trades_70, "score≥70"),
                       (trades, "score≥75")]:
        rets = [apply_R1_dynamic_exit(t) for t in tlist]
        rets = [r for r in rets if r is not None]
        s = stat_pack(rets)
        s["label"] = f"{tag} + R1 動態出場"
        threshold_r1_compare.append(s)
        print(f"  {tag:10s} n={s['n']:>4} 勝率{s['winRate']}% "
              f"EV{s['evPct']:+.3f}% Sharpe{s['sharpe']} "
              f"MDD{s['maxDrawdownPct']}% 累計{s['totalTWD']:+,}")

    # ── 月度穩定性 (最佳組合 vs 基線) ──
    best_layer = max(layer_results[1:] + extra_results,
                     key=lambda x: x["totalTWD"] if x["n"] >= 50 else -1e9)
    print(f"\n──── 最佳組合月度 vs 基線 ────")
    print(f"最佳: {best_layer['label']}  totalTWD {best_layer['totalTWD']:+,} n={best_layer['n']}")

    # 找回最佳組合的 filter 設定
    best_filters = None
    best_exit = None
    for label, fs, ef in layers + extra_combos:
        if label == best_layer["label"]:
            best_filters = fs
            best_exit = ef
            break

    best_monthly = by_month(trades, best_filters, best_exit) if best_filters is not None else {}
    base_monthly = by_month(trades, [], exit_baseline)
    print(f"  {'月':10s} {'baseN':>6} {'baseEV%':>9} {'bestN':>6} {'bestEV%':>9}")
    for m in sorted(set(base_monthly) | set(best_monthly)):
        b = base_monthly.get(m, {"n": 0, "evPct": None})
        x = best_monthly.get(m, {"n": 0, "evPct": None})
        print(f"  {m:10s} {b['n']:>6} {str(b['evPct']):>9} "
              f"{x['n']:>6} {str(x['evPct']):>9}")

    # ── 年化估算: 用每進場日平均報酬 × 252 (線性，不複利) ──
    cal_td = calendar_trading_days(entry_days)
    avg_trades_per_entry_day = len(base_rets) / n_entry_days
    # baseline: total_pct 攤平到 n_entry_days, 再 × 252
    ann_base_lin = round(baseline["totalPct"] / n_entry_days * 252 / avg_trades_per_entry_day, 1)
    ann_best_lin = round(best_layer["totalPct"] / n_entry_days * 252 / avg_trades_per_entry_day, 1)
    # 上式是「每筆固定資金、N 筆並列」的單筆年化視角
    # 另一種：把每進場日的所有筆當「同一日全部下注、每筆獨立資金」→ 日報酬 = EV
    # 那年化 = EV × 252 (線性) / avg_trades_per_entry_day
    print(f"\n年化估算 (1 筆固定本金、線性外推):")
    print(f"  baseline EV {baseline['evPct']}%/筆 × {avg_trades_per_entry_day:.1f} 筆/日 "
          f"× 252 日 ≈ {ann_base_lin}% 年化")
    print(f"  best     EV {best_layer['evPct']}%/筆 × {avg_trades_per_entry_day:.1f} 筆/日 "
          f"× 252 日 ≈ {ann_best_lin}% 年化")
    print(f"  ⚠ 此為『理論值』 — 真實需考量 position sizing / 重疊資金 / 流動性")

    # ── 寫 JSON ──
    out = {
        "meta": {
            "scoreMin": 75,
            "costRtPct": round(COST_RT, 4),
            "nominalTwdPerTrade": NOMINAL_TWD_PER_TRADE,
            "dateRange": {
                "from": min(t["entryDate"] for t in trades) if trades else None,
                "to": max(t["entryDate"] for t in trades) if trades else None,
            },
            "nEntryDays": n_entry_days,
            "calendarTradingDays": cal_td,
            "ruleDescriptions": {
                "R1": "gap 0-5% → 09:15 出場；其它 → T+2 open (出場規則，非過濾)",
                "R2": "排除 score 90-99 OR D-1 vol≥20k張 OR close<30元",
                "R3": "排除同日同族群 ≥8 檔的擁擠類股",
                "R4": "D-1 turnover ≥1億 (排除極低流動性)",
                "R5": "當日 ≥75 分精選 ≤15 檔才開倉",
            },
            "verifiedRules": ["R1"],
            "candidateRules": ["R2", "R3", "R4", "R5"],
        },
        "baseline": baseline,
        "thresholdCompare": threshold_compare,
        "thresholdCompareWithR1": threshold_r1_compare,
        "layeredStack": layer_results,
        "extraCombos": extra_results,
        "bestPick": {
            "label": best_layer["label"],
            "stats": best_layer,
            "annualizedPctLinear": ann_best_lin,
            "vsBaselineDeltaTWD": best_layer["totalTWD"] - baseline["totalTWD"],
        },
        "annualizedBaselineLinear": ann_base_lin,
        "avgTradesPerEntryDay": round(avg_trades_per_entry_day, 2),
        "monthly": {
            "baseline": base_monthly,
            "best": best_monthly,
        },
    }
    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=2)
    print(f"\n結果存至 {OUT_PATH}")
    return out


if __name__ == "__main__":
    main()
