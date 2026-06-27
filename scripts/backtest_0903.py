"""09:03 紅K進場策略回測 — 純函式（進場/出場/成本/指標/挑最佳）。

bar 結構：{"time":"HH:MM","open","high","low","close"}，依時間升冪。
重用 honest_stats.summarize 做分布統計。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from honest_stats import summarize  # noqa: E402
from lib.r1_exit import decide_r1_exit, compute_r1_return  # noqa: E402

# ── 成本（扣百分點，與 honest_stats 一致）────────────────────
COST_DAYTRADE = 0.435    # 0.1425%×2 + 當沖稅 0.15%
COST_OVERNIGHT = 0.585   # 0.1425%×2 + 隔日稅 0.30%

_OPEN = "09:00"
_T0903 = "09:03"
_CUTOFF = "09:06"   # 09:06（含）前都無成交 → 視為無 09:03 價


def bar_at_0903(bars):
    """取 time=='09:03' 的 K；缺則取 ≤09:03 最近一根；若第一根 >09:06 → None。"""
    if not bars:
        return None
    candidates = [b for b in bars if _OPEN <= b["time"] <= _T0903]
    if candidates:
        return candidates[-1]
    # 無 ≤09:03 的 bar：若最早一根已晚於 09:06，放棄
    first = min(bars, key=lambda b: b["time"])
    if first["time"] > _CUTOFF:
        return None
    return first


def entry_signal(bars, prev_close):
    """回 {"open","p0903","entered"}；無法取 09:03 價 → None。
    entered = (p0903 > open) and (p0903 > prev_close)。
    """
    b = bar_at_0903(bars)
    if b is None or not bars:
        return None
    day_open = bars[0]["open"]
    p0903 = b["close"]
    entered = (p0903 > day_open) and (p0903 > prev_close)
    return {"open": day_open, "p0903": p0903, "entered": entered}


def simple_return(entry, exit_price, cost):
    """毛報酬% 減成本%。"""
    gross = (exit_price - entry) / entry * 100
    return round(gross - cost, 3)


def simulate_tp_sl(entry, bars_after, tp_pct, sl_pct, day_close, cost):
    """逐根掃 09:03 後的 K：先觸停損則 -sl，先觸停利則 +tp，
    同根同觸假設先停損（保守）；都沒觸 → 收盤平倉。回淨報酬%。"""
    tp_price = entry * (1 + tp_pct / 100)
    sl_price = entry * (1 - sl_pct / 100)
    for b in bars_after:
        hit_sl = b["low"] <= sl_price
        hit_tp = b["high"] >= tp_price
        if hit_sl:                      # 含同根同觸 → 保守停損優先
            return round(-sl_pct - cost, 3)
        if hit_tp:
            return round(tp_pct - cost, 3)
    gross = (day_close - entry) / entry * 100
    return round(gross - cost, 3)


def simulate_exit(trade, rule):
    """依 rule['kind'] 分派；缺必要資料回 None。
    trade 需含 entry, dayClose, nextOpen, nextClose, barsAfter。"""
    kind = rule["kind"]
    if kind == "daytrade_close":
        return simple_return(trade["entry"], trade["dayClose"], COST_DAYTRADE)
    if kind == "next_open":
        if trade.get("nextOpen") is None:
            return None
        return simple_return(trade["entry"], trade["nextOpen"], COST_OVERNIGHT)
    if kind == "next_close":
        if trade.get("nextClose") is None:
            return None
        return simple_return(trade["entry"], trade["nextClose"], COST_OVERNIGHT)
    if kind == "tp_sl":
        return simulate_tp_sl(trade["entry"], trade["barsAfter"],
                              rule["tp"], rule["sl"], trade["dayClose"], COST_DAYTRADE)
    raise ValueError(f"unknown rule kind: {kind}")


def profit_factor(rets):
    """總獲利 / 總虧損；無虧損且有獲利 → None（前端顯示 ∞）。"""
    gains = sum(r for r in rets if r > 0)
    losses = -sum(r for r in rets if r < 0)
    if losses == 0:
        return None if gains > 0 else 0.0
    return round(gains / losses, 2)


def max_drawdown(rets):
    """依序複利建權益曲線，回最大回檔%（正數）。"""
    eq = 100.0
    peak = 100.0
    mdd = 0.0
    for r in rets:
        eq *= (1 + r / 100)
        peak = max(peak, eq)
        mdd = max(mdd, (peak - eq) / peak * 100)
    return round(mdd, 2)


def aggregate_rule(rets):
    """淨報酬序列（可含 None）→ 規則級指標 dict。"""
    rets = [r for r in rets if r is not None]
    s = summarize(rets)
    return {
        "trades": s["samples"],
        "winRate": s["winRate"],
        "meanNet": s["mean"],
        "medianNet": s["median"],
        "totalNet": round(sum(rets), 2) if rets else 0,
        "profitFactor": profit_factor(rets),
        "maxDrawdown": max_drawdown(rets),
        "maxWin": round(max(rets), 2) if rets else None,
        "maxLoss": round(min(rets), 2) if rets else None,
    }


# ── 出場規則註冊表 ──────────────────────────────────────────
_TP_GRID = [3, 5, 7, 10]
_SL_GRID = [2, 3, 5]

EXIT_RULES = (
    [
        {"key": "daytrade_close", "label": "當沖收盤", "kind": "daytrade_close"},
        {"key": "next_open", "label": "隔日開盤", "kind": "next_open"},
        {"key": "next_close", "label": "隔日收盤", "kind": "next_close"},
    ]
    + [
        {"key": f"tp{tp}_sl{sl}", "label": f"停利{tp}%/停損{sl}%(當沖)",
         "kind": "tp_sl", "tp": tp, "sl": sl}
        for tp in _TP_GRID for sl in _SL_GRID
    ]
)


def pick_best(rule_results, min_trades=30):
    """rule_results=[{key,label,trades,meanNet,profitFactor,winRate,...}]。
    依淨期望值挑最佳（樣本≥min_trades 優先），同分比獲利因子→勝率。
    回最佳 dict + lowConfidence + caveat；無可用 → None。"""
    valid = [r for r in rule_results if r.get("meanNet") is not None]
    if not valid:
        return None
    eligible = [r for r in valid if (r.get("trades") or 0) >= min_trades]
    pool = eligible or valid

    def sort_key(r):
        return (r["meanNet"], r.get("profitFactor") or 0, r.get("winRate") or 0)

    best = max(pool, key=sort_key)
    caveat = "TP/SL 為樣本內最佳化，有過擬合風險" if best["key"].startswith("tp") else ""
    return {**best, "lowConfidence": not eligible, "caveat": caveat}


def _bars_after_0903(bars):
    """09:03 之後（不含 09:03 那根）的 K，供停利停損掃描與盤中高低。
    排除 09:03 本身：進場在 09:03 收盤，該根 09:00–09:03 的高低發生在買進前，
    若納入會虛構出停利/停損觸發。"""
    return [b for b in bars if b["time"] > _T0903]


def _day_open_close(bars):
    """(第一根 open, 最後一根 close)；無 bars → (None, None)。"""
    if not bars:
        return None, None
    return bars[0]["open"], bars[-1]["close"]


def build_report(pick_days, bars_provider, rules=EXIT_RULES, min_trades=30):
    """核心回測：pick_days + bars_provider(code,date)->bars → 報告 dict。

    funnel：totalPicks（有 D+1 的精選）→ noData → passedFilter → traded。
    每筆成交存進 trades；各規則彙總後挑最佳；前後半穩健性檢查。
    """
    total_picks = no_data = not_entered = passed = 0
    entry_dates = []
    trades = []          # 含 barsAfter（記憶體用，寫檔前移除）

    for d in pick_days:
        entry_date = d["entryDate"]
        for p in d["picks"]:
            total_picks += 1
            day_bars = bars_provider(p["code"], entry_date)
            sig = entry_signal(day_bars, p["prevClose"])
            if sig is None:
                no_data += 1
                continue
            if not sig["entered"]:
                not_entered += 1
                continue
            passed += 1
            day_open, day_close = _day_open_close(day_bars)
            next_bars = bars_provider(p["code"], d["nextDate"]) if d.get("nextDate") else []
            next_open, next_close = _day_open_close(next_bars)
            after = _bars_after_0903(day_bars)
            day_high_after = max((b["high"] for b in after), default=sig["p0903"])
            day_low_after = min((b["low"] for b in after), default=sig["p0903"])
            trades.append({
                "pickDate": d["pickDate"], "dEntry": entry_date,
                "code": p["code"], "name": p["name"], "score": p["score"],
                "prevClose": p["prevClose"], "open": sig["open"], "p0903": sig["p0903"],
                "entry": sig["p0903"],
                "dayHighAfter": round(day_high_after, 2), "dayLowAfter": round(day_low_after, 2),
                "dayClose": day_close, "nextOpen": next_open, "nextClose": next_close,
                "barsAfter": after,
                "t1Bars": day_bars,        # R1 用：T+1 全日 1 分 K（進場=entryDate 09:03，故 T+1=當日）
                "t2Open": next_open,        # R1 用：T+2 開盤
            })
            entry_dates.append(entry_date)

    # 各規則彙總
    rule_results = []
    for rule in rules:
        rets = [simulate_exit(t, rule) for t in trades]
        rule_results.append({"key": rule["key"], "label": rule["label"],
                             **aggregate_rule(rets)})

    best = pick_best(rule_results, min_trades=min_trades)

    # 穩健性：依進場日排序切前後半，各自挑最佳 key
    ordered = sorted(trades, key=lambda t: (t["dEntry"], t["code"]))
    half = len(ordered) // 2
    robustness = {"firstHalfBest": None, "secondHalfBest": None, "consistent": None}
    if half >= 1:
        def best_key(subset):
            rr = [{"key": r["key"], "label": r["label"],
                   **aggregate_rule([simulate_exit(t, r) for t in subset])}
                  for r in rules]
            b = pick_best(rr, min_trades=0)
            return b["key"] if b else None
        fh, sh = best_key(ordered[:half]), best_key(ordered[half:])
        robustness = {"firstHalfBest": fh, "secondHalfBest": sh, "consistent": fh == sh}

    # 為 trades 加上「最佳規則」的出場價與報酬，並移除 barsAfter / t1Bars
    best_rule = next((r for r in rules if r["key"] == best["key"]), None) if best else None
    out_trades = []
    for t in trades:
        ret = simulate_exit(t, best_rule) if best_rule else None
        slim = {k: v for k, v in t.items() if k not in ("barsAfter", "t1Bars")}
        slim["bestReturnNet"] = ret
        out_trades.append(slim)

    # === R1 統計（P0-2）===
    r1_per_trade = [simulate_r1(t) for t in trades]
    r1_rets = [x["ret"] for x in r1_per_trade]
    r1_stats = {**aggregate_rule(r1_rets), "rule": "R1_dynamic",
                "label": "R1 動態出場 (gap 0~5% → 09:15, 否則 T+2 開)"}

    # baseline = best rule（既有邏輯）
    baseline_stats = dict(best) if best else None

    monthly_r1 = aggregate_monthly([
        {"dEntry": t["dEntry"], "ret": r}
        for t, r in zip(trades, r1_rets)
    ])
    monthly_baseline = aggregate_monthly([
        {"dEntry": t["dEntry"], "ret": t["bestReturnNet"]}
        for t in out_trades
    ])

    # 把 R1 per-trade 結果合併到 out_trades
    for t, r in zip(out_trades, r1_per_trade):
        t["r1Ret"] = r["ret"]
        t["r1Rule"] = r["rule"]
        t["r1GapPct"] = r["gapPct"]
        t["r1ExitPrice"] = r["exitPrice"]

    return {
        "dateRange": {"start": min(entry_dates), "end": max(entry_dates)} if entry_dates
                     else {"start": None, "end": None},
        "tradingDays": len(pick_days),
        "pickThreshold": 50,
        "pickCap": None,
        "fees": {"daytradeCostPct": COST_DAYTRADE, "overnightCostPct": COST_OVERNIGHT},
        "funnel": {"totalPicks": total_picks, "noData": no_data,
                   "notEntered": not_entered, "passedFilter": passed},
        "rules": rule_results,
        "best": best,
        "baselineStats": baseline_stats,
        "r1Stats": r1_stats,
        "monthlyBaseline": monthly_baseline,
        "monthlyR1": monthly_r1,
        "robustness": robustness,
        "trades": out_trades,
        "methodology": (
            "永豐 Shioaji 真實 1 分 K。選股池=當日 score≥50 全部；隔日 09:03 "
            "紅K(現價>開盤)且高於昨收才進場；多種出場規則回測，依淨期望值挑最佳。"
            "成本：當沖0.435%、隔日0.585%（扣百分點）。"
            "R1 動態出場：gap 0~5% → T+1 09:15 出，否則 T+2 開盤出。"),
    }


# ── R1 動態出場整合（P0-2）──────────────────────────────────
def simulate_r1(trade):
    """對單筆 trade 套 R1 規則，回 {ret, rule, gapPct, exitPrice}。缺資料 → 全 None。"""
    t1_bars = trade.get("t1Bars") or []
    t2_open = trade.get("t2Open")
    decision = decide_r1_exit(trade["entry"], t1_bars, t2_open)
    if decision is None:
        return {"ret": None, "rule": None, "gapPct": None, "exitPrice": None}
    ret = compute_r1_return(trade["entry"], decision["exit_price"])
    return {"ret": ret, "rule": decision["rule"],
            "gapPct": round(decision["gap_pct"], 3),
            "exitPrice": decision["exit_price"]}


def aggregate_monthly(trades_with_ret):
    """[{dEntry: 'YYYY-MM-DD', ret: float|None}, ...] → {'YYYY-MM': {trades, winRate, ev, total}}。"""
    by_month = {}
    for t in trades_with_ret:
        if t["ret"] is None:
            continue
        ym = t["dEntry"][:7]
        by_month.setdefault(ym, []).append(t["ret"])
    out = {}
    for ym, rets in sorted(by_month.items()):
        out[ym] = {
            "trades": len(rets),
            "winRate": round(sum(1 for r in rets if r > 0) / len(rets) * 100, 1),
            "ev": round(sum(rets) / len(rets), 3),
            "total": round(sum(rets), 2),
        }
    return out
