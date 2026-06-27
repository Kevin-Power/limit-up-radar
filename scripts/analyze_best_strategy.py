"""深度分析：≥70分 開盤買進 → 隔日開盤賣出 策略。

報告內容：
  1. 每日組合報酬（equity curve）
  2. 月度勝率 / 期望值
  3. 評分分層（50-59 / 60-69 / 70-79 / 80+）
  4. 開盤跳空條件過濾（gap < X%）
  5. 入場價：競價(open) vs 09:01 收盤
  6. 穩健性（前後半）
  7. 連敗 / 連勝統計
  8. 報酬分佈（偏態 / 尾部）
"""
import json, math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from run_backtest_0903 import build_pick_days

CACHE_DIR  = os.path.join("data", "intraday_cache")
COST       = 0.585   # overnight 0.1425%×2 + 0.30% 稅

def _load_cache(code, date):
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f); return d if d else None
    except Exception:
        return None

# ── 基本統計 ──────────────────────────────────────────────────
def stats(rets):
    n = len(rets)
    if n == 0:
        return {}
    mean   = sum(rets) / n
    wins   = sum(1 for r in rets if r > 0)
    var    = sum((r - mean) ** 2 for r in rets) / n
    sd     = math.sqrt(var)
    srets  = sorted(rets)
    med    = srets[n // 2] if n % 2 else (srets[n // 2 - 1] + srets[n // 2]) / 2
    # skewness
    skew   = sum((r - mean) ** 3 for r in rets) / n / (sd ** 3) if sd > 0 else 0
    sharpe = (mean / sd) * math.sqrt(252) if sd > 0 else 0
    # max drawdown (per-trade cumulative)
    eq = 1.0; peak = 1.0; mdd = 0.0
    for r in rets:
        eq *= (1 + r / 100); peak = max(peak, eq); mdd = max(mdd, (peak - eq) / peak)
    # consecutive
    max_w = max_l = cur_w = cur_l = 0
    for r in rets:
        if r > 0: cur_w += 1; cur_l = 0; max_w = max(max_w, cur_w)
        else:     cur_l += 1; cur_w = 0; max_l = max(max_l, cur_l)
    return {
        "n": n, "mean": round(mean, 4), "median": round(med, 4),
        "sd": round(sd, 4), "winRate": round(wins / n * 100, 1),
        "skew": round(skew, 3), "sharpe": round(sharpe, 3),
        "total": round(sum(rets), 2), "mdd": round(mdd * 100, 2),
        "maxWin": round(max(rets), 3), "maxLoss": round(min(rets), 3),
        "maxConsecWin": max_w, "maxConsecLoss": max_l,
    }

def section(title):
    print(f"\n{'═'*68}")
    print(f"  {title}")
    print(f"{'═'*68}")

# ── 建構交易 ─────────────────────────────────────────────────
def collect_trades(pick_days, bars_map, score_min=70, entry_type="open_close"):
    """entry_type: 'open_close'=09:01收盤, 'open_price'=開盤競價"""
    trades = []
    for d in pick_days:
        for p in d["picks"]:
            if p["score"] < score_min:
                continue
            day_bars  = bars_map.get((p["code"], d["entryDate"]), [])
            next_bars = bars_map.get((p["code"], d["nextDate"]),  []) if d.get("nextDate") else []
            if not day_bars or not next_bars:
                continue
            # 入場價
            if entry_type == "open_price":
                entry = day_bars[0]["open"]
            else:  # 09:01 收盤
                b = next((b for b in day_bars if b["time"] <= "09:01"), day_bars[0])
                entry = b["close"]
            # 出場價
            exit_p = next_bars[0]["open"]
            if entry <= 0:
                continue
            gap_pct      = (entry - p["prevClose"]) / p["prevClose"] * 100  # 開盤跳空%
            next_day_ret = (exit_p - entry) / entry * 100 - COST
            trades.append({
                "pickDate"  : d["pickDate"],
                "entryDate" : d["entryDate"],
                "nextDate"  : d["nextDate"],
                "code"      : p["code"],
                "name"      : p["name"],
                "score"     : p["score"],
                "prevClose" : p["prevClose"],
                "entry"     : round(entry, 2),
                "exit"      : round(exit_p, 2),
                "gapPct"    : round(gap_pct, 3),
                "ret"       : round(next_day_ret, 4),
            })
    return trades

def daily_portfolio(trades):
    """等倉位 → 每日組合報酬 = 當日所有持股平均。"""
    by_date = {}
    for t in trades:
        by_date.setdefault(t["entryDate"], []).append(t["ret"])
    return {d: sum(v)/len(v) for d, v in sorted(by_date.items())}

def equity_curve(daily_rets):
    """等比複利成長曲線（從 100 出發）。"""
    eq = 100.0; curve = [eq]
    for r in daily_rets:
        eq *= (1 + r / 100); curve.append(round(eq, 2))
    return curve

def mini_chart(values, width=50):
    """文字 sparkline。"""
    mn, mx = min(values), max(values)
    rng = mx - mn or 1
    chars = "▁▂▃▄▅▆▇█"
    return "".join(chars[min(7, int((v - mn) / rng * 8))] for v in values)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)

    print("載入資料...")
    days       = hs.load_daily_files()
    rev_maps   = hs.load_revenue_maps()
    hw, disp   = hs.load_categories()
    pick_days  = build_pick_days(days, rev_maps, hw, disp)

    # 預載快取
    needed = set()
    for d in pick_days:
        for p in d["picks"]:
            needed.add((p["code"], d["entryDate"]))
            if d.get("nextDate"): needed.add((p["code"], d["nextDate"]))
    bars_map = {}
    for (c, dt) in needed:
        b = _load_cache(c, dt)
        bars_map[(c, dt)] = b if b else []
    print(f"選股日 {len(pick_days)} 天，快取 {sum(1 for v in bars_map.values() if v)}/{len(bars_map)} 筆命中")

    base_trades = collect_trades(pick_days, bars_map, score_min=70, entry_type="open_close")

    # ════════════════════════════════════════════════════════
    section("1. 核心策略：≥70分 開盤1分 → 隔日開盤（基線）")
    s = stats([t["ret"] for t in base_trades])
    print(f"  交易筆數  : {s['n']}")
    print(f"  勝率      : {s['winRate']}%")
    print(f"  期望值/筆 : {s['mean']:+.4f}%")
    print(f"  中位數    : {s['median']:+.4f}%")
    print(f"  標準差    : {s['sd']:.4f}%")
    print(f"  偏態      : {s['skew']:+.3f}  {'（右偏，大贏多）' if s['skew']>0.2 else '（左偏，大輸多）' if s['skew']<-0.2 else '（近似對稱）'}")
    print(f"  年化Sharpe: {s['sharpe']:+.3f}  {'(良好)' if s['sharpe']>1 else '(一般)' if s['sharpe']>0 else '(負)'}")
    print(f"  最大單筆賺: {s['maxWin']:+.3f}%  最大單筆虧: {s['maxLoss']:+.3f}%")
    print(f"  最長連勝  : {s['maxConsecWin']} 筆  最長連敗: {s['maxConsecLoss']} 筆")
    print(f"  總累計    : {s['total']:+.1f}%（各筆等額 $1）")
    print(f"  最大回檔  : -{s['mdd']:.1f}%（按交易序列）")

    # 每日組合模擬
    dp = daily_portfolio(base_trades)
    daily_ret_list = list(dp.values())
    ds = stats(daily_ret_list)
    eq = equity_curve(daily_ret_list)
    cagr = (eq[-1] / 100) ** (252 / len(daily_ret_list)) - 1
    print(f"\n  ── 等倉位組合（每日平均）──")
    print(f"  交易天數  : {len(daily_ret_list)}")
    print(f"  平均每日報酬: {ds['mean']:+.4f}%  日標準差: {ds['sd']:.4f}%")
    print(f"  組合Sharpe: {ds['sharpe']:+.3f}")
    print(f"  期末淨值  : {eq[-1]:.1f}（從 100 出發）")
    print(f"  推算年化報酬: {cagr*100:+.1f}%")
    print(f"  組合最大回檔: -{ds['mdd']:.1f}%（按日序列）")
    print(f"\n  淨值走勢（每日）：")
    print(f"  {mini_chart(eq)}")
    print(f"  {eq[0]:.0f} ─────────────────────────────────── {eq[-1]:.0f}")

    # ════════════════════════════════════════════════════════
    section("2. 月度拆分")
    by_month = {}
    for t in base_trades:
        m = t["entryDate"][:7]
        by_month.setdefault(m, []).append(t["ret"])
    print(f"  {'月份':8s} {'筆數':>5} {'勝率':>6} {'期望值':>8} {'總報酬':>8}")
    print("  " + "─" * 42)
    for m, rets in sorted(by_month.items()):
        ms = stats(rets)
        mark = " ✓" if ms["mean"] > 0 else " ✗"
        print(f"  {m:8s} {ms['n']:>5} {ms['winRate']:>5.0f}% "
              f"{ms['mean']:>+7.3f}% {ms['total']:>+7.1f}%{mark}")

    # ════════════════════════════════════════════════════════
    section("3. 評分分層分析")
    buckets = [(50,59),(60,69),(70,79),(80,89),(90,100)]
    all_bk = collect_trades(pick_days, bars_map, score_min=50, entry_type="open_close")
    print(f"  {'評分區間':10s} {'筆數':>5} {'勝率':>6} {'期望值':>8} {'總報酬':>8}")
    print("  " + "─" * 44)
    for lo, hi in buckets:
        bk_rets = [t["ret"] for t in all_bk if lo <= t["score"] <= hi]
        if not bk_rets:
            continue
        bs = stats(bk_rets)
        mark = " ✓" if bs["mean"] > 0 else ""
        print(f"  {lo}-{hi}分    {bs['n']:>5} {bs['winRate']:>5.0f}% "
              f"{bs['mean']:>+7.3f}% {bs['total']:>+7.1f}%{mark}")

    # ════════════════════════════════════════════════════════
    section("4. 入場價比較：競價(open) vs 09:01收盤")
    oc_trades = base_trades
    op_trades = collect_trades(pick_days, bars_map, score_min=70, entry_type="open_price")
    oc_s = stats([t["ret"] for t in oc_trades])
    op_s = stats([t["ret"] for t in op_trades])
    print(f"  {'入場方式':20s} {'筆數':>5} {'勝率':>6} {'期望值':>9} {'Sharpe':>8}")
    print("  " + "─" * 50)
    print(f"  {'09:01收盤（目前）':20s} {oc_s['n']:>5} {oc_s['winRate']:>5.0f}% "
          f"{oc_s['mean']:>+8.4f}% {oc_s['sharpe']:>8.3f}")
    print(f"  {'開盤競價(auction)':20s} {op_s['n']:>5} {op_s['winRate']:>5.0f}% "
          f"{op_s['mean']:>+8.4f}% {op_s['sharpe']:>8.3f}")
    # gap between open_price and open_close entry
    diffs = [oc["entry"] - op["entry"] for oc, op in zip(
        sorted(oc_trades, key=lambda t:(t["entryDate"],t["code"])),
        sorted(op_trades, key=lambda t:(t["entryDate"],t["code"]))
        ) if oc["code"]==op["code"] and oc["entryDate"]==op["entryDate"]]
    if diffs:
        avg_diff = sum(diffs)/len(diffs)
        print(f"  09:01收盤 平均比競價高 {avg_diff:+.3f} 元（成本差異）")

    # ════════════════════════════════════════════════════════
    section("5. 開盤跳空過濾（gap = 開盤 vs 昨收）")
    thresholds = [3, 5, 7, 10]
    print(f"  {'Gap條件':18s} {'筆數':>5} {'勝率':>6} {'期望值':>9} {'Sharpe':>8}")
    print("  " + "─" * 50)
    # all (no filter)
    s_all = stats([t["ret"] for t in op_trades])
    print(f"  {'全部（無過濾）':18s} {s_all['n']:>5} {s_all['winRate']:>5.0f}% "
          f"{s_all['mean']:>+8.4f}% {s_all['sharpe']:>8.3f}")
    # positive gap (gap >= 0: open >= prevClose)
    pg = [t["ret"] for t in op_trades if t["gapPct"] >= 0]
    if pg:
        pgs = stats(pg)
        print(f"  {'gap≥0（高開）':18s} {pgs['n']:>5} {pgs['winRate']:>5.0f}% "
              f"{pgs['mean']:>+8.4f}% {pgs['sharpe']:>8.3f}")
    ng = [t["ret"] for t in op_trades if t["gapPct"] < 0]
    if ng:
        ngs = stats(ng)
        print(f"  {'gap<0（低開）':18s} {ngs['n']:>5} {ngs['winRate']:>5.0f}% "
              f"{ngs['mean']:>+8.4f}% {ngs['sharpe']:>8.3f}")
    for th in thresholds:
        below = [t["ret"] for t in op_trades if t["gapPct"] < th]
        above = [t["ret"] for t in op_trades if t["gapPct"] >= th]
        if below:
            bs2 = stats(below)
            print(f"  {'gap<'+str(th)+'%':18s} {bs2['n']:>5} {bs2['winRate']:>5.0f}% "
                  f"{bs2['mean']:>+8.4f}% {bs2['sharpe']:>8.3f}")
        if above:
            as2 = stats(above)
            print(f"  {'gap≥'+str(th)+'%（追高）':18s} {as2['n']:>5} {as2['winRate']:>5.0f}% "
                  f"{as2['mean']:>+8.4f}% {as2['sharpe']:>8.3f}")

    # ════════════════════════════════════════════════════════
    section("6. 穩健性：前後半拆分（依入場日）")
    sorted_t = sorted(base_trades, key=lambda t: (t["entryDate"], t["code"]))
    half = len(sorted_t) // 2
    h1 = stats([t["ret"] for t in sorted_t[:half]])
    h2 = stats([t["ret"] for t in sorted_t[half:]])
    d1 = sorted_t[0]["entryDate"]
    dm = sorted_t[half]["entryDate"]
    d2 = sorted_t[-1]["entryDate"]
    print(f"  前半（{d1}~{dm}）: n={h1['n']}  EV={h1['mean']:+.4f}%  勝率={h1['winRate']}%  {'✓ 正期望' if h1['mean']>0 else '✗ 負期望'}")
    print(f"  後半（{dm}~{d2}）: n={h2['n']}  EV={h2['mean']:+.4f}%  勝率={h2['winRate']}%  {'✓ 正期望' if h2['mean']>0 else '✗ 負期望'}")
    consistent = (h1["mean"] > 0) == (h2["mean"] > 0)
    print(f"  穩健性：{'✅ 前後半同向' if consistent else '⚠️  前後半不一致'}")

    # ════════════════════════════════════════════════════════
    section("7. 最佳 vs 最差交易 Top10")
    sorted_by_ret = sorted(base_trades, key=lambda t: t["ret"], reverse=True)
    print(f"  ── 最佳 10 筆 ──")
    print(f"  {'進場日':12s} {'代碼':8s} {'名稱':12s} {'分數':>5} {'跳空':>7} {'報酬':>8}")
    for t in sorted_by_ret[:10]:
        print(f"  {t['entryDate']:12s} {t['code']:8s} {t['name'][:10]:12s} "
              f"{t['score']:>5} {t['gapPct']:>+6.1f}% {t['ret']:>+7.3f}%")
    print(f"  ── 最差 10 筆 ──")
    for t in sorted_by_ret[-10:]:
        print(f"  {t['entryDate']:12s} {t['code']:8s} {t['name'][:10]:12s} "
              f"{t['score']:>5} {t['gapPct']:>+6.1f}% {t['ret']:>+7.3f}%")

    # ════════════════════════════════════════════════════════
    section("8. 報酬分佈")
    rets = [t["ret"] for t in base_trades]
    buckets8 = [(-10,-5),(-5,-3),(-3,-1.5),(-1.5,0),(0,1.5),(1.5,3),(3,5),(5,10)]
    print(f"  {'報酬區間':15s} {'筆數':>5} {'佔比':>6}  bar")
    print("  " + "─" * 55)
    for lo8, hi8 in buckets8:
        cnt = sum(1 for r in rets if lo8 <= r < hi8)
        pct = cnt / len(rets) * 100
        bar = "█" * int(pct)
        print(f"  {lo8:+.1f}%~{hi8:+.1f}%      {cnt:>5} {pct:>5.1f}%  {bar}")

    # ════════════════════════════════════════════════════════
    section("9. 綜合結論")
    best_s = stats([t["ret"] for t in base_trades])
    dp2    = daily_portfolio(base_trades)
    eq2    = equity_curve(list(dp2.values()))
    cagr2  = (eq2[-1] / 100) ** (252 / len(dp2)) - 1
    print(f"""
  策略    ：評分 ≥70分，隔日開盤（09:01收盤）買進 → 再隔日開盤賣出
  樣本    ：{best_s['n']} 筆 / {len(dp2)} 天（2026-03 ~ 2026-06）

  【每筆交易】
  · 勝率 {best_s['winRate']}%，期望值 {best_s['mean']:+.4f}%/筆
  · 最長連敗 {best_s['maxConsecLoss']} 筆（需準備承受連虧）
  · 偏態 {best_s['skew']:+.3f}（{'大贏 > 大輸' if best_s['skew'] > 0 else '大輸 > 大贏'}）

  【等倉位組合】（每天等分持有當日進場股）
  · 平均每日 +{ds['mean']:.3f}%
  · 組合 Sharpe {ds['sharpe']:.2f}
  · 推算年化 {cagr2*100:+.1f}%
  · 組合最大回檔 -{ds['mdd']:.1f}%

  【穩健性】
  · 前半 EV {h1['mean']:+.4f}%，後半 EV {h2['mean']:+.4f}%，{'一致 ✅' if consistent else '不一致 ⚠️'}

  【風險提示】
  · {len(dp2)} 天僅 ≈ 2.5 個月，樣本仍偏少
  · 等倉位組合最大回檔 -{ds['mdd']:.1f}%，單日最多持 {max(len(v) for v in by_month.values())} 檔同時持有
  · 未考慮流動性風險（小型股開盤成交量）
""")

    # 儲存
    out = os.path.join("data", "strategy_analysis.json")
    with open(out, "w", encoding="utf-8") as fp:
        json.dump({
            "baseTrades": len(base_trades),
            "stats": best_s,
            "dailyPortfolio": {"days": len(dp), "finalEquity": eq2[-1], "cagr": round(cagr2*100,2)},
            "monthlyBreakdown": {m: stats(v) for m, v in by_month.items()},
            "halfSplit": {"firstHalf": h1, "secondHalf": h2, "consistent": consistent},
            "equityCurve": eq2,
        }, fp, ensure_ascii=False, indent=2)
    print(f"  詳細資料存至 {out}")

if __name__ == "__main__":
    main()
