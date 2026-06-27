"""調查為何 score≥90 的 91 筆交易勝率只有 49.4%。

對每個交易日重建精選（cap=None），拆解每檔股票的 score 貢獻明細，
比對隔日報酬，找出在高分區段「過熱」或「失效」的訊號。

輸出：data/analysis/score90_investigation.json
"""
import json
import os
import sys
import statistics
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs

OUT_FILE = "data/analysis/score90_investigation.json"
BACKTEST_FILE = "data/backtest_0903.json"

# 訊號標籤
SIGNAL_NAMES = [
    "disposal_-50",
    "recent_bearish_-25",
    "lots_lt_500_-30",
    "lots_lt_2000_-15",
    "trending_group_+30",
    "rev_yoy_gt_20_+25",
    "rev_yoy_gt_50_+10",
    "major_net_pos_+20",
    "streak_ge_2_+15",
    "volume_gt_5M_+5",
    "leader_+10",
    "heavyweight_+25",
]


def score_breakdown(stock, *, group_name, trending, leader_code, rev_yoy,
                    is_disposal, recent_bearish, is_heavyweight):
    """回傳 (final_score, {signal: contribution}) — 與 score_stock_full 同邏輯。"""
    contribs = {k: 0 for k in SIGNAL_NAMES}
    score = 0
    if is_disposal:
        score -= 50
        contribs["disposal_-50"] = -50
    if recent_bearish:
        score -= 25
        contribs["recent_bearish_-25"] = -25
    lots = stock["volume"] / 1000
    if lots < 500:
        score -= 30
        contribs["lots_lt_500_-30"] = -30
    elif lots < 2000:
        score -= 15
        contribs["lots_lt_2000_-15"] = -15
    if group_name in trending:
        score += 30
        contribs["trending_group_+30"] = 30
    if rev_yoy is not None and rev_yoy > 20:
        score += 25
        contribs["rev_yoy_gt_20_+25"] = 25
        if rev_yoy > 50:
            score += 10
            contribs["rev_yoy_gt_50_+10"] = 10
    if stock["major_net"] > 0:
        score += 20
        contribs["major_net_pos_+20"] = 20
    if stock.get("streak", 1) >= 2:
        score += 15
        contribs["streak_ge_2_+15"] = 15
    if stock["volume"] > 5_000_000:
        score += 5
        contribs["volume_gt_5M_+5"] = 5
    if leader_code == stock["code"]:
        score += 10
        contribs["leader_+10"] = 10
    if is_heavyweight:
        score += 25
        contribs["heavyweight_+25"] = 25
    return score, contribs


def reconstruct_picks_with_signals(days, i, rev_maps, heavyweight, known_disposal):
    """同 hs.reconstruct_picks，但回傳每檔的訊號明細。"""
    td = days[i]
    group_days = {}
    for j in range(max(0, i - 2), i + 1):
        for g in days[j]["groups"]:
            group_days[g["name"]] = group_days.get(g["name"], 0) + 1
    trending = {n for n, d in group_days.items() if d >= 2}

    window = days[max(0, i - 5): i + 1][::-1]
    codes_per_day = [{s["code"] for g in d["groups"] for s in g["stocks"]} for d in window]
    all_codes = set().union(*codes_per_day) if codes_per_day else set()
    disposal = set()
    for c in all_codes:
        if sum(1 for cs in codes_per_day if c in cs) >= 3:
            disposal.add(c)

    bearish = set()
    for d in days[max(0, i - 6): i + 1]:
        for b in d.get("bearish_engulfing", []) or []:
            if b.get("code"):
                bearish.add(b["code"])

    rev = rev_maps and hs.revenue_for_date(rev_maps, td["date"]) or {}

    picks = []
    for g in td["groups"]:
        sorted_g = sorted(g["stocks"], key=lambda s: -s["volume"])
        leader = sorted_g[0]["code"] if sorted_g else None
        for s in g["stocks"]:
            sc, contribs = score_breakdown(
                s, group_name=g["name"], trending=trending, leader_code=leader,
                rev_yoy=rev.get(s["code"]),
                is_disposal=(s["code"] in disposal or s["code"] in known_disposal),
                recent_bearish=s["code"] in bearish,
                is_heavyweight=s["code"] in heavyweight,
            )
            if sc >= 50:
                picks.append({
                    "code": s["code"], "name": s["name"],
                    "close": s["close"], "score": sc, "contribs": contribs,
                    "group": g["name"], "streak": s.get("streak", 1),
                    "volume": s["volume"], "major_net": s["major_net"],
                    "rev_yoy": rev.get(s["code"]),
                })
    picks.sort(key=lambda p: -p["score"])
    return picks


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    heavyweight, known_disposal = hs.load_categories()

    # 載入回測：用其 bestReturnNet（已扣費，09:03 進場策略）
    with open(BACKTEST_FILE, encoding="utf-8") as fp:
        bt = json.load(fp)
    trade_map = {(t["pickDate"], t["code"]): t for t in bt["trades"]}

    # 為了簡化：用 nextOpen vs prevClose 的毛報酬，避免綁定特定 TP/SL
    def gross_ret(t):
        return (t["nextOpen"] - t["prevClose"]) / t["prevClose"] * 100

    # 同時也計算「隔日 open 進場、再隔日 open 出場」（T+2）的毛報酬
    # backtest 表 entry = 09:03 價，dayClose 是 D+1 收盤
    # 真正測試「次日開盤買、再隔日開盤賣」就用 nextOpen vs prevClose（即 D+1 開盤 vs D 收盤）
    # 這是 honest_stats 的口徑（隔日開盤賣 = T+1 open）—— 我們就用這個

    # 重建所有日子的 picks + signals
    all_rows = []  # 每筆精選一行（不 cap）
    for i in range(len(days) - 1):
        pick_date = days[i]["date"]
        picks = reconstruct_picks_with_signals(days, i, rev_maps, heavyweight, known_disposal)
        for p in picks[:20]:  # 取 cap=20，對齊產線
            key = (pick_date, p["code"])
            t = trade_map.get(key)
            if not t:
                continue
            # 用 nextOpen vs prevClose 做毛報酬（隔日 open 賣）
            # 缺資料就跳過；用 open 也行 → 退而求其次用 dayClose
            sell_px = t.get("nextOpen") or t.get("dayClose")
            if sell_px is None or t.get("prevClose") is None:
                continue
            ret = (sell_px - t["prevClose"]) / t["prevClose"] * 100
            # 扣 0.435% 費稅
            net_ret = ret - 0.435
            all_rows.append({
                "date": pick_date, "code": p["code"], "name": p["name"],
                "score": p["score"], "ret": round(ret, 3), "net_ret": round(net_ret, 3),
                "contribs": p["contribs"],
                "group": p["group"], "streak": p["streak"],
                "volume": p["volume"], "major_net": p["major_net"],
                "rev_yoy": p["rev_yoy"],
            })

    print(f"成功比對 {len(all_rows)} 筆（精選∩有 backtest 成交）")

    # 分群
    def group_rows(min_score, max_score=None):
        return [r for r in all_rows
                if r["score"] >= min_score and (max_score is None or r["score"] < max_score)]

    g50_89 = group_rows(50, 90)
    g90 = group_rows(90)
    g85_89 = group_rows(85, 90)
    g75_89 = group_rows(75, 90)

    def summary(rows, label):
        if not rows:
            return {"label": label, "n": 0}
        rets = [r["net_ret"] for r in rows]
        wins = sum(1 for r in rets if r > 0)
        return {
            "label": label, "n": len(rows),
            "winRate": round(wins / len(rows) * 100, 1),
            "meanRet": round(statistics.mean(rets), 3),
            "medianRet": round(statistics.median(rets), 3),
            "sumRet": round(sum(rets), 1),
        }

    cohort_summary = [
        summary(g50_89, "50-89"),
        summary(g75_89, "75-89"),
        summary(g85_89, "85-89"),
        summary(g90, "90+"),
    ]
    for s in cohort_summary:
        print(s)

    # 訊號 lift 分析：在 90+ 內，每個訊號的「贏家觸發率 vs 輸家觸發率」
    def signal_lift(rows):
        winners = [r for r in rows if r["net_ret"] > 0]
        losers = [r for r in rows if r["net_ret"] <= 0]
        out = []
        for sig in SIGNAL_NAMES:
            w_hit = sum(1 for r in winners if r["contribs"][sig] != 0)
            l_hit = sum(1 for r in losers if r["contribs"][sig] != 0)
            w_rate = w_hit / max(1, len(winners))
            l_rate = l_hit / max(1, len(losers))
            lift = w_rate / l_rate if l_rate > 0 else (float('inf') if w_rate > 0 else 1.0)
            # 平均報酬：觸發 vs 未觸發
            with_sig = [r["net_ret"] for r in rows if r["contribs"][sig] != 0]
            without_sig = [r["net_ret"] for r in rows if r["contribs"][sig] == 0]
            out.append({
                "signal": sig,
                "winnerHits": w_hit, "loserHits": l_hit,
                "winnerRate": round(w_rate * 100, 1),
                "loserRate": round(l_rate * 100, 1),
                "lift": round(lift, 3) if lift != float('inf') else "inf",
                "withSigN": len(with_sig),
                "withSigMean": round(statistics.mean(with_sig), 3) if with_sig else None,
                "withSigWinRate": round(sum(1 for r in with_sig if r > 0) / max(1, len(with_sig)) * 100, 1),
                "withoutSigN": len(without_sig),
                "withoutSigMean": round(statistics.mean(without_sig), 3) if without_sig else None,
                "withoutSigWinRate": round(sum(1 for r in without_sig if r > 0) / max(1, len(without_sig)) * 100, 1),
            })
        return out

    lift_90 = signal_lift(g90)
    lift_50_89 = signal_lift(g50_89)

    print("\n=== 90+ 訊號 lift（贏家觸發率 / 輸家觸發率）===")
    for s in sorted(lift_90, key=lambda x: -abs((float(x['lift']) if x['lift'] != 'inf' else 99) - 1)):
        if s["winnerHits"] + s["loserHits"] >= 5:
            print(f"  {s['signal']:30s} W={s['winnerRate']:5.1f}% L={s['loserRate']:5.1f}% "
                  f"lift={s['lift']} | withSig win={s['withSigWinRate']}% mean={s['withSigMean']}")

    # 訊號出現率：90+ 區段 vs 50-89 區段（找「過熱訊號」）
    def signal_freq(rows):
        n = len(rows)
        return {sig: round(sum(1 for r in rows if r["contribs"][sig] != 0) / max(1, n) * 100, 1)
                for sig in SIGNAL_NAMES}

    freq_90 = signal_freq(g90)
    freq_50_89 = signal_freq(g50_89)
    overheat = []
    for sig in SIGNAL_NAMES:
        delta = freq_90[sig] - freq_50_89[sig]
        overheat.append({
            "signal": sig,
            "freq_90+": freq_90[sig], "freq_50-89": freq_50_89[sig], "delta": round(delta, 1),
        })
    overheat.sort(key=lambda x: -x["delta"])

    print("\n=== 訊號頻率：90+ vs 50-89（找過熱訊號）===")
    for s in overheat:
        print(f"  {s['signal']:30s} 90+={s['freq_90+']:5.1f}% 50-89={s['freq_50-89']:5.1f}% Δ={s['delta']:+.1f}")

    # === 模擬修法 ===
    # 修法 A：在 90+ 區段，移除「過熱且 lift<1」的訊號加分
    # 找候選：lift < 0.9 且 出現頻率 > 50% 的加分訊號
    candidates_a = []
    for s in lift_90:
        if s["signal"].endswith(tuple(f"+{i}" for i in [5, 10, 15, 20, 25, 30])):
            lift_val = float(s["lift"]) if s["lift"] != "inf" else 99
            if lift_val < 0.95 and (s["winnerHits"] + s["loserHits"]) >= 10:
                candidates_a.append(s["signal"])
    print(f"\n候選「降權訊號」(lift<0.95 且 n>=10): {candidates_a}")

    # 修法 B：streak >= 3 連續漲停在 90+ 是否負向？
    streak_groups = defaultdict(list)
    for r in g90:
        streak_groups[min(r["streak"], 5)].append(r["net_ret"])
    print("\n=== 90+ 按 streak 分群 ===")
    for k in sorted(streak_groups.keys()):
        rets = streak_groups[k]
        if rets:
            wins = sum(1 for r in rets if r > 0)
            print(f"  streak={k}: n={len(rets)} win={wins/len(rets)*100:.1f}% mean={statistics.mean(rets):+.3f}")

    # 修法 C：模擬「將 streak_ge_2 +15 改成 +0」對 90+ 區段的影響
    # 即：新 score = old_score - (15 if streak_ge_2 觸發 else 0)
    def resimulate(rows, signal, delta):
        """rebuild final score with signal delta. Re-cohort by new score."""
        new_rows = []
        for r in rows:
            new_score = r["score"]
            if r["contribs"].get(signal, 0) != 0:
                new_score += delta
            nr = dict(r)
            nr["new_score"] = new_score
            new_rows.append(nr)
        return new_rows

    # 對所有 50-89 + 90+ 套用：streak_ge_2 改 +5（從 +15 → +5，差 -10）
    def fix_simulation(label, signal, delta):
        new_all = resimulate(all_rows, signal, delta)
        # 重 cohort by new_score
        g90_new = [r for r in new_all if r["new_score"] >= 90]
        g75_89_new = [r for r in new_all if 75 <= r["new_score"] < 90]
        g50_89_new = [r for r in new_all if 50 <= r["new_score"] < 90]
        return {
            "fix": label,
            "90+": summary(g90_new, "90+ (after fix)"),
            "75-89": summary(g75_89_new, "75-89 (after fix)"),
            "50-89": summary(g50_89_new, "50-89 (after fix)"),
        }

    fixes = []
    fixes.append(fix_simulation("streak_ge_2_+15 → +5 (delta -10)", "streak_ge_2_+15", -10))
    fixes.append(fix_simulation("streak_ge_2_+15 → 0 (delta -15)", "streak_ge_2_+15", -15))
    fixes.append(fix_simulation("major_net_pos_+20 → +10 (delta -10)", "major_net_pos_+20", -10))
    fixes.append(fix_simulation("heavyweight_+25 → +10 (delta -15)", "heavyweight_+25", -15))
    fixes.append(fix_simulation("rev_yoy_gt_50_+10 → 0", "rev_yoy_gt_50_+10", -10))
    fixes.append(fix_simulation("trending_group_+30 → +20", "trending_group_+30", -10))

    print("\n=== 修法模擬 ===")
    for f in fixes:
        print(f"\n{f['fix']}")
        for k in ["90+", "75-89", "50-89"]:
            s = f[k]
            print(f"  {k}: n={s['n']} win={s.get('winRate')}% mean={s.get('meanRet')} sum={s.get('sumRet')}")

    # === 連續修法 D：score>=85 時不再加 major_net & streak ===
    def fix_high_score_cap(label, *, cap_at, removed_signals):
        """若原始 score >= cap_at，且觸發 removed_signals 中任一，把該訊號移除（即 score 扣回）。"""
        new_all = []
        for r in all_rows:
            new_score = r["score"]
            if r["score"] >= cap_at:
                for sig in removed_signals:
                    new_score -= r["contribs"].get(sig, 0)
            nr = dict(r)
            nr["new_score"] = new_score
            new_all.append(nr)
        g90_new = [r for r in new_all if r["new_score"] >= 90]
        g75_89_new = [r for r in new_all if 75 <= r["new_score"] < 90]
        g50_89_new = [r for r in new_all if 50 <= r["new_score"] < 90]
        return {
            "fix": label,
            "90+": summary(g90_new, "90+"),
            "75-89": summary(g75_89_new, "75-89"),
            "50-89": summary(g50_89_new, "50-89"),
        }

    fixes.append(fix_high_score_cap(
        "score>=85 時 major_net+20 不加",
        cap_at=85, removed_signals=["major_net_pos_+20"]))
    fixes.append(fix_high_score_cap(
        "score>=85 時 streak+15 不加",
        cap_at=85, removed_signals=["streak_ge_2_+15"]))
    fixes.append(fix_high_score_cap(
        "score>=85 時 (streak+15, major_net+20) 都不加",
        cap_at=85, removed_signals=["streak_ge_2_+15", "major_net_pos_+20"]))
    fixes.append(fix_high_score_cap(
        "score>=85 時 (streak, major_net, rev_gt_50) 都不加",
        cap_at=85,
        removed_signals=["streak_ge_2_+15", "major_net_pos_+20", "rev_yoy_gt_50_+10"]))

    # 修法 E：根據 stock_features 黑名單反推 — major_net>0 反而虧（69% vs 55%），
    #         heavyweight 50% vs 非 59.5%，extreme volume 31%。把這三個壞訊號全面降權。
    fixes.append(fix_simulation("major_net_pos_+20 → 0 (全面)", "major_net_pos_+20", -20))
    fixes.append(fix_simulation("heavyweight_+25 → 0 (全面)", "heavyweight_+25", -25))

    # 修法 F：用每日同分排序「翻牌」測試 — 若同分照成交量倒排（先選低量），會發生什麼？
    # 即：當 score 並列時，目前實質按 score 排，cap 20。
    # 這裡先簡單做：cap=10（更嚴格），看高分群是否變更差
    def cap_simulation(label, cap):
        from collections import defaultdict
        by_day = defaultdict(list)
        for r in all_rows:
            by_day[r["date"]].append(r)
        kept = []
        for day_rows in by_day.values():
            day_rows.sort(key=lambda r: -r["score"])
            kept.extend(day_rows[:cap])
        g90 = [r for r in kept if r["score"] >= 90]
        g75_89 = [r for r in kept if 75 <= r["score"] < 90]
        g50_89 = [r for r in kept if 50 <= r["score"] < 90]
        return {
            "fix": label,
            "90+": summary(g90, "90+"),
            "75-89": summary(g75_89, "75-89"),
            "50-89": summary(g50_89, "50-89"),
        }

    fixes.append(cap_simulation("cap=10 (更嚴)", 10))
    fixes.append(cap_simulation("cap=5 (極嚴)", 5))

    # 修法 G：黑名單 — 直接刪除符合「大型權值×大量×major_net>0」的 90+ 樣本
    def blacklist_simulation(label, predicate):
        kept = [r for r in all_rows if not predicate(r)]
        g90 = [r for r in kept if r["score"] >= 90]
        g75_89 = [r for r in kept if 75 <= r["score"] < 90]
        g50_89 = [r for r in kept if 50 <= r["score"] < 90]
        return {
            "fix": label,
            "90+": summary(g90, "90+"),
            "75-89": summary(g75_89, "75-89"),
            "50-89": summary(g50_89, "50-89"),
            "kept_total": len(kept),
        }

    # 預設「過熱」定義：volume > 2億張 + heavyweight + major_net > 0
    fixes.append(blacklist_simulation(
        "排除：volume>2萬張 (從 stock_features 黑名單)",
        lambda r: r["volume"] > 20_000_000))
    fixes.append(blacklist_simulation(
        "排除：score>=90 且 heavyweight",
        lambda r: r["score"] >= 90 and r["contribs"].get("heavyweight_+25", 0) > 0))
    fixes.append(blacklist_simulation(
        "排除：score>=85 且 volume>5億張 (過熱量)",
        lambda r: r["score"] >= 85 and r["volume"] > 50_000_000))

    print("\n=== 高分降溫修法 + 全面降權 + cap + blacklist ===")
    for f in fixes[6:]:
        print(f"\n{f['fix']}")
        for k in ["90+", "75-89", "50-89"]:
            s = f[k]
            print(f"  {k}: n={s['n']} win={s.get('winRate')}% mean={s.get('meanRet')} sum={s.get('sumRet')}")

    # 90+ 個別樣本（前 20 筆虧最多的）
    g90_sorted = sorted(g90, key=lambda r: r["net_ret"])
    worst_20 = [{
        "date": r["date"], "code": r["code"], "name": r["name"],
        "score": r["score"], "net_ret": r["net_ret"],
        "group": r["group"], "streak": r["streak"],
        "rev_yoy": r["rev_yoy"],
        "active_signals": [k for k, v in r["contribs"].items() if v != 0],
    } for r in g90_sorted[:20]]

    output = {
        "method": "對每個交易日重建 cap=20 精選，比對 backtest_0903 隔日 open 毛報酬扣 0.435% 費稅",
        "totalRows": len(all_rows),
        "cohortSummary": cohort_summary,
        "signalLift_90plus": lift_90,
        "signalLift_50to89": lift_50_89,
        "signalFreq_90plus": freq_90,
        "signalFreq_50to89": freq_50_89,
        "overheatSignals": overheat,
        "streakByGroup_90plus": {str(k): {
            "n": len(streak_groups[k]),
            "winRate": round(sum(1 for r in streak_groups[k] if r > 0) / max(1, len(streak_groups[k])) * 100, 1),
            "mean": round(statistics.mean(streak_groups[k]), 3) if streak_groups[k] else None,
        } for k in sorted(streak_groups.keys())},
        "fixes": fixes,
        "worst20_in_90plus": worst_20,
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)
    print(f"\nsaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
