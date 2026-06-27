"""市場狀態過濾器分析 — 找出能事前判斷「該不該執行當天選股」的訊號。

基線：≥75分（用戶設定）開盤競價買進 → 隔日開盤賣出 (T+1 open → T+2 open)
成本：2.8 折手續費 + 賣出稅 ≈ 0.38% 來回

候選過濾器：
  1. 大盤前一日漲跌（taiex_change_pct）
  2. 大盤連續 N 日方向
  3. 大盤近 N 日波動率
  4. 當日選股總數（>=50/>=70）
  5. 平均評分高低
  6. 漲跌家數比（advance/decline）
  7. 漲停家數
  8. 三大法人買賣超
  9. 上市/上櫃強弱差（用 picks 的 market 欄位代理）
  10. 成交量水位
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
COST = 0.38  # 2.8 折手續費單邊 0.0399%*2 + 賣稅 0.3% ≈ 0.38%
SCORE_MIN = 75   # 用戶設定的基線（任務文字）

OUT_FILE = "data/opt_market_regime.json"


def _load_cache(code, date):
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def collect_trades(pick_days, bars_map, score_min=SCORE_MIN):
    """T+1 開盤競價買 → T+2 開盤賣（淨報酬，扣 COST）。"""
    trades = []
    for d in pick_days:
        for p in d["picks"]:
            if p["score"] < score_min:
                continue
            day_bars = bars_map.get((p["code"], d["entryDate"]), [])
            next_bars = bars_map.get((p["code"], d["nextDate"]), []) if d.get("nextDate") else []
            if not day_bars or not next_bars:
                continue
            entry = day_bars[0]["open"]   # 開盤競價
            exit_p = next_bars[0]["open"]  # 隔日開盤
            if entry <= 0:
                continue
            net = (exit_p - entry) / entry * 100 - COST
            trades.append({
                "pickDate": d["pickDate"],
                "entryDate": d["entryDate"],
                "nextDate": d["nextDate"],
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "ret": round(net, 4),
            })
    return trades


def stats_basic(rets):
    """報酬序列 → 勝率/EV/總損益/筆數。空 → None 欄位。"""
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "mean": None, "total": None}
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "mean": round(sum(rets) / n, 4),
        "total": round(sum(rets), 2),
        "median": round(sorted(rets)[n // 2], 4),
    }


def apply_filter(trades, decision_map):
    """decision_map: {pickDate(=訊號日): True/False, True=執行}。
    依 pickDate 過濾 trades。回 (passed_trades, blocked_trades, passed_days, blocked_days)。"""
    passed = [t for t in trades if decision_map.get(t["pickDate"], False)]
    blocked = [t for t in trades if not decision_map.get(t["pickDate"], False)]
    pdays = sorted({t["pickDate"] for t in passed})
    bdays = sorted({t["pickDate"] for t in blocked})
    return passed, blocked, pdays, bdays


def equity_total_twd(trades, capital_per_trade_twd=10000):
    """每筆等額 capital_per_trade_twd 元 → 總損益 NTD。
    用 mean*n*capital 近似（與 user 基線 +186 萬一致：274 筆 * 1.87% * 36.4k）。
    為了對齊「+186 萬基線（≥70）/+175 萬（≥70）」，我們用每筆損益百分點直接乘上等比金額。
    最後輸出時統一使用 capital_per_trade_twd=362774 元 → 1 筆 1% = 3628 元，274*1.87%*362774 ≈ 186 萬。
    """
    # 反推：186 萬 / (274 * 1.87) = 3631 元/筆/%；對應 capital ≈ 363000 元
    # 用此標度讓任何子集的「以每筆等額 36.3 萬」損益可比
    total_pct = sum(t["ret"] for t in trades)
    return int(round(total_pct * capital_per_trade_twd / 100, 0))


# ── 大盤特徵抽取（per pickDate）─────────────────────────────
def build_market_features(days):
    """days = list of daily.json dicts (依日期升冪)
    回 {date: { feature_name: value, ... }}。
    每個特徵用「截至當天收盤（含當天）」可得的資訊，作為「明日是否執行」的決策。
    pickDate = D 的選股是 D 收盤後產生，下單在 D+1 早上 → 我們可以用 D 當天所有資訊。
    """
    feats = {}
    n = len(days)
    for i in range(n):
        d = days[i]
        ms = d.get("market_summary") or {}
        chg = ms.get("taiex_change_pct")
        close = ms.get("taiex_close")
        vol = ms.get("total_volume")
        lu = ms.get("limit_up_count") or 0
        ld = ms.get("limit_down_count") or 0
        adv = ms.get("advance") or 0
        dec = ms.get("decline") or 0
        foreign = ms.get("foreign_net") or 0

        # 近 N 日大盤漲跌
        chg_5 = [days[j]["market_summary"].get("taiex_change_pct") for j in range(max(0, i - 4), i + 1)
                 if days[j].get("market_summary", {}).get("taiex_change_pct") is not None]
        chg_10 = [days[j]["market_summary"].get("taiex_change_pct") for j in range(max(0, i - 9), i + 1)
                  if days[j].get("market_summary", {}).get("taiex_change_pct") is not None]
        chg_3 = [days[j]["market_summary"].get("taiex_change_pct") for j in range(max(0, i - 2), i + 1)
                 if days[j].get("market_summary", {}).get("taiex_change_pct") is not None]

        # 5MA / 10MA / 20MA（以收盤）
        closes_5 = [days[j]["market_summary"].get("taiex_close") for j in range(max(0, i - 4), i + 1)
                    if days[j].get("market_summary", {}).get("taiex_close")]
        closes_10 = [days[j]["market_summary"].get("taiex_close") for j in range(max(0, i - 9), i + 1)
                     if days[j].get("market_summary", {}).get("taiex_close")]
        closes_20 = [days[j]["market_summary"].get("taiex_close") for j in range(max(0, i - 19), i + 1)
                     if days[j].get("market_summary", {}).get("taiex_close")]
        ma5 = sum(closes_5) / len(closes_5) if closes_5 else None
        ma10 = sum(closes_10) / len(closes_10) if closes_10 else None
        ma20 = sum(closes_20) / len(closes_20) if closes_20 else None

        # 連續紅/黑 K
        streak_up = 0
        for j in range(i, -1, -1):
            c = days[j].get("market_summary", {}).get("taiex_change_pct")
            if c is None:
                break
            if c > 0:
                streak_up += 1
            else:
                break
        streak_dn = 0
        for j in range(i, -1, -1):
            c = days[j].get("market_summary", {}).get("taiex_change_pct")
            if c is None:
                break
            if c < 0:
                streak_dn += 1
            else:
                break

        # 5 日波動率（標準差）
        vol_5 = round(statistics.pstdev(chg_5), 3) if len(chg_5) >= 2 else None

        # 選股池規模（≥50 / ≥70 / ≥75）
        all_stocks = [s for g in d.get("groups", []) for s in g.get("stocks", [])]
        # 注意：daily.json 不含 score。要透過 reconstruct_picks 才能得到分數。
        # 此處先放原始檔上市櫃比、漲停數
        twse_cnt = sum(1 for s in all_stocks if s.get("market") == "TWSE")
        otc_cnt = sum(1 for s in all_stocks if s.get("market") in ("OTC", "TPEx"))

        feats[d["date"]] = {
            "taiexChg": chg,
            "taiexClose": close,
            "taiexVol": vol,
            "limitUp": lu,
            "limitDn": ld,
            "advance": adv,
            "decline": dec,
            "advDecRatio": round(adv / dec, 3) if dec > 0 else None,
            "foreignNet": foreign,
            "chg_5d_sum": round(sum(chg_5), 3) if chg_5 else None,
            "chg_10d_sum": round(sum(chg_10), 3) if chg_10 else None,
            "chg_3d_sum": round(sum(chg_3), 3) if chg_3 else None,
            "ma5_dist_pct": round((close - ma5) / ma5 * 100, 3) if ma5 and close else None,
            "ma10_dist_pct": round((close - ma10) / ma10 * 100, 3) if ma10 and close else None,
            "ma20_dist_pct": round((close - ma20) / ma20 * 100, 3) if ma20 and close else None,
            "streak_up": streak_up,
            "streak_dn": streak_dn,
            "vol_5d_sd": vol_5,
            "twse_lu_cnt": twse_cnt,
            "otc_lu_cnt": otc_cnt,
        }
    return feats


def add_pick_features(feats, pick_days):
    """補上選股池規模、平均評分（需 score）。"""
    for d in pick_days:
        date = d["pickDate"]
        if date not in feats:
            feats[date] = {}
        picks_all = d["picks"]
        picks_75 = [p for p in picks_all if p["score"] >= 75]
        picks_70 = [p for p in picks_all if p["score"] >= 70]
        picks_50 = [p for p in picks_all if p["score"] >= 50]
        feats[date]["picks_n_75"] = len(picks_75)
        feats[date]["picks_n_70"] = len(picks_70)
        feats[date]["picks_n_50"] = len(picks_50)
        feats[date]["avg_score_75"] = round(
            sum(p["score"] for p in picks_75) / len(picks_75), 2) if picks_75 else None
        feats[date]["max_score"] = max((p["score"] for p in picks_all), default=None)
    return feats


# ── 過濾器定義 ───────────────────────────────────────────────
def define_filters(feats):
    """回 [(name, description, decision_func(date) -> True/False/None)]。
    None = 資料不足，視為「不執行」。"""
    def f_taiex_up(date):
        v = feats.get(date, {}).get("taiexChg")
        return v is not None and v >= 0
    def f_taiex_up_strict(date):
        v = feats.get(date, {}).get("taiexChg")
        return v is not None and v >= 0.5
    def f_taiex_not_crash(date):
        v = feats.get(date, {}).get("taiexChg")
        return v is not None and v >= -1.0
    def f_taiex_not_big_drop(date):
        v = feats.get(date, {}).get("taiexChg")
        return v is not None and v >= -0.5
    def f_chg_5d_up(date):
        v = feats.get(date, {}).get("chg_5d_sum")
        return v is not None and v >= 0
    def f_chg_3d_up(date):
        v = feats.get(date, {}).get("chg_3d_sum")
        return v is not None and v >= 0
    def f_ma5_above(date):
        v = feats.get(date, {}).get("ma5_dist_pct")
        return v is not None and v >= 0
    def f_ma10_above(date):
        v = feats.get(date, {}).get("ma10_dist_pct")
        return v is not None and v >= 0
    def f_ma20_above(date):
        v = feats.get(date, {}).get("ma20_dist_pct")
        return v is not None and v >= 0
    def f_streak_not_dn3(date):
        v = feats.get(date, {}).get("streak_dn")
        return v is not None and v < 3
    def f_advdec_strong(date):
        v = feats.get(date, {}).get("advDecRatio")
        return v is not None and v >= 1.0
    def f_advdec_super(date):
        v = feats.get(date, {}).get("advDecRatio")
        return v is not None and v >= 1.5
    def f_limit_up_strong(date):
        v = feats.get(date, {}).get("limitUp")
        return v is not None and v >= 60
    def f_limit_up_not_dump(date):
        # 漲停家數過少（市場無人氣）→ 不執行
        v = feats.get(date, {}).get("limitUp")
        return v is not None and v >= 40
    def f_limit_dn_low(date):
        # 跌停家數過多（市場恐慌）→ 不執行
        v = feats.get(date, {}).get("limitDn")
        return v is not None and v <= 5
    def f_vol_low(date):
        # 波動率過高 → 不執行
        v = feats.get(date, {}).get("vol_5d_sd")
        return v is not None and v <= 1.5
    def f_picks_75_moderate(date):
        # 過多訊號（>=20）或過少（<=2）→ 不執行
        v = feats.get(date, {}).get("picks_n_75")
        return v is not None and 3 <= v <= 15
    def f_picks_75_not_few(date):
        v = feats.get(date, {}).get("picks_n_75")
        return v is not None and v >= 3
    def f_picks_75_not_flood(date):
        v = feats.get(date, {}).get("picks_n_75")
        return v is not None and v <= 15
    def f_foreign_buy(date):
        v = feats.get(date, {}).get("foreignNet")
        return v is not None and v >= 0
    # 組合過濾器
    def f_combo_safe(date):
        # 大盤未崩 + ma20 之上 + 連跌少於 3
        return (f_taiex_not_crash(date)
                and f_ma20_above(date)
                and f_streak_not_dn3(date))
    def f_combo_loose(date):
        # 大盤未大跌 + 5日漲幅非負
        return f_taiex_not_big_drop(date) and f_chg_5d_up(date)

    return [
        ("taiex_up_0", "大盤前一日紅K (taiex_change_pct >= 0)", f_taiex_up),
        ("taiex_up_0.5", "大盤前一日漲>=0.5%", f_taiex_up_strict),
        ("taiex_not_crash_-1", "大盤前一日未跌破 -1% (>=-1.0%)", f_taiex_not_crash),
        ("taiex_not_big_drop_-0.5", "大盤前一日跌幅小於 0.5% (>=-0.5%)", f_taiex_not_big_drop),
        ("chg_5d_sum_up", "近 5 日大盤累積漲幅 >= 0%", f_chg_5d_up),
        ("chg_3d_sum_up", "近 3 日大盤累積漲幅 >= 0%", f_chg_3d_up),
        ("ma5_above", "大盤站上 5MA", f_ma5_above),
        ("ma10_above", "大盤站上 10MA", f_ma10_above),
        ("ma20_above", "大盤站上 20MA", f_ma20_above),
        ("not_streak_dn3", "未連續 3 日下跌", f_streak_not_dn3),
        ("advdec_ge_1.0", "漲跌家數比 >= 1.0 (advance/decline)", f_advdec_strong),
        ("advdec_ge_1.5", "漲跌家數比 >= 1.5", f_advdec_super),
        ("limit_up_ge_60", "當日漲停家數 >= 60（市場熱絡）", f_limit_up_strong),
        ("limit_up_ge_40", "當日漲停家數 >= 40", f_limit_up_not_dump),
        ("limit_dn_le_5", "當日跌停家數 <= 5（無恐慌）", f_limit_dn_low),
        ("vol_5d_sd_le_1.5", "近 5 日大盤波動率 <= 1.5%", f_vol_low),
        ("picks75_3_to_15", "≥75 分精選 3~15 檔（適中）", f_picks_75_moderate),
        ("picks75_ge_3", "≥75 分精選 >= 3 檔", f_picks_75_not_few),
        ("picks75_le_15", "≥75 分精選 <= 15 檔（避免訊號氾濫）", f_picks_75_not_flood),
        ("foreign_net_buy", "外資當日買超（foreign_net >= 0）", f_foreign_buy),
        ("combo_safe", "組合：未崩 + ma20 之上 + 未連跌 3 日", f_combo_safe),
        ("combo_loose", "組合：未大跌 + 5 日累積漲幅非負", f_combo_loose),
    ]


def evaluate_filter(name, desc, decide, trades, feats, baseline_total_twd):
    """回單一過濾器的評估 dict。"""
    decision_map = {date: bool(decide(date)) for date in feats.keys()}
    passed, blocked, pdays, bdays = apply_filter(trades, decision_map)
    p_stats = stats_basic([t["ret"] for t in passed])
    b_stats = stats_basic([t["ret"] for t in blocked])
    p_twd = equity_total_twd(passed)
    b_twd = equity_total_twd(blocked)
    delta = p_twd - baseline_total_twd
    # 通過率：實際有交易日中，通過的天數比例
    trade_days_total = len({t["pickDate"] for t in trades})
    trade_days_passed = len({t["pickDate"] for t in passed})
    pass_rate = round(trade_days_passed / trade_days_total * 100, 1) if trade_days_total else 0
    return {
        "name": name,
        "description": desc,
        "passDays": trade_days_passed,
        "totalDays": trade_days_total,
        "passRate": pass_rate,
        "passed": {
            "n": p_stats["n"],
            "winRate": p_stats["winRate"],
            "ev": p_stats["mean"],
            "totalPct": p_stats["total"],
            "totalTWD": p_twd,
        },
        "blocked": {
            "n": b_stats["n"],
            "winRate": b_stats["winRate"],
            "ev": b_stats["mean"],
            "totalPct": b_stats["total"],
            "totalTWD": b_twd,
        },
        "deltaTWD_vs_baseline": delta,
    }


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("載入 daily / revenue / categories ...")
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    pick_days = build_pick_days(days, rev_maps, hw, disp)

    # 預載 intraday cache
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
        b = _load_cache(c, dt)
        bars_map[(c, dt)] = b if b else []
        if b:
            hit += 1
    print(f"intraday cache: {hit}/{len(bars_map)} 命中")

    trades = collect_trades(pick_days, bars_map, score_min=SCORE_MIN)
    print(f"基線交易筆數（≥{SCORE_MIN}, T+1 open → T+2 open）: {len(trades)}")
    base_stats = stats_basic([t["ret"] for t in trades])
    base_twd = equity_total_twd(trades)
    print(f"基線：勝率 {base_stats['winRate']}%, EV {base_stats['mean']:+.3f}%/筆, "
          f"總損益 {base_twd:,} 元（每筆 36.3 萬等額）")
    print(f"交易天數: {len({t['pickDate'] for t in trades})}")

    # 大盤特徵
    feats = build_market_features(days)
    feats = add_pick_features(feats, pick_days)

    # 評估所有過濾器
    filters = define_filters(feats)
    results = []
    for name, desc, decide in filters:
        r = evaluate_filter(name, desc, decide, trades, feats, base_twd)
        results.append(r)
        print(f"\n[{name}] {desc}")
        print(f"  通過: {r['passDays']}/{r['totalDays']} 天 ({r['passRate']}%) "
              f"| 通過交易: n={r['passed']['n']} 勝率={r['passed']['winRate']}% "
              f"EV={r['passed']['ev']}% 總={r['passed']['totalTWD']:,}元")
        print(f"  阻擋: 交易={r['blocked']['n']} 勝率={r['blocked']['winRate']}% "
              f"EV={r['blocked']['ev']}% 損益={r['blocked']['totalTWD']:,}元（避免的損失）")
        print(f"  ΔvsBaseline: {r['deltaTWD_vs_baseline']:+,} 元")

    # 排名：依「過濾後總損益」降冪，但要求通過率 >= 30%（樣本足夠）
    eligible = [r for r in results if r["passRate"] >= 30]
    ranked = sorted(eligible, key=lambda r: r["passed"]["totalTWD"], reverse=True)

    print("\n" + "=" * 70)
    print("Top 過濾器（依過濾後總損益）")
    print("=" * 70)
    for r in ranked[:8]:
        print(f"{r['passed']['totalTWD']:>15,}元  通過率{r['passRate']:>5.1f}%  "
              f"EV{r['passed']['ev']:>+6.3f}%  n={r['passed']['n']:>3}  {r['name']}")

    # 儲存
    output = {
        "baseline": {
            "scoreMin": SCORE_MIN,
            "n": base_stats["n"],
            "winRate": base_stats["winRate"],
            "ev": base_stats["mean"],
            "totalPct": base_stats["total"],
            "totalTWD": base_twd,
            "tradingDays": len({t["pickDate"] for t in trades}),
            "costPctRoundTrip": COST,
            "capitalPerTradeTWD": 10000,  # for reference (totalTWD uses 10k/trade scale)
        },
        "filters": results,
        "ranked_by_passed_twd": [r["name"] for r in ranked],
        "note": (
            f"baseline 用每筆 1 萬元×淨報酬% 累加。實際用戶說「+186 萬」是 ≥70 分基線，"
            f"capitalPerTradeTWD=362,774 等價於 274 筆×1.87%×36.3 萬。本檔用 1 萬元/筆是為了數字可比，"
            f"等比例放大 36.3x 即可對齊用戶基線。"
        ),
    }
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)
    print(f"\n寫入 {OUT_FILE}")


if __name__ == "__main__":
    main()
