"""驗證「score>=75 AND 0<=gap<5% -> T+1 09:15 出場」的實戰可執行性。

關注點:
1. 規則所需資料能否在 T+1 開盤競價前算出? (score, prevClose -> 是; gap -> 否，需開盤後)
2. 09:15 出場是否有流動性風險 (是否在漲停)?
3. 樣本量在實戰下能否執行 (同日多檔)?
4. 競價開盤價是否能成交 (是否漲停鎖死)?
5. 是否暗藏 look-ahead?
6. 與簡單 0913/T2 open 出場的差距是否經得起雜訊?
"""
import json
import os
import sys
from collections import defaultdict
from statistics import mean, median, stdev

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs                               # noqa: E402
from run_backtest_0903 import build_pick_days          # noqa: E402

CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "opt_exec_feasibility.json")

COMMISSION_RT = 0.1425 * 0.28 * 2 / 100
TAX = 0.003
COST_RT = (COMMISSION_RT + TAX) * 100   # 0.3798 pp

SCORE_MIN = 75


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


def is_limit_up(price, prev_close, tol=0.001):
    """價格是否在漲停 (10%) 附近。台股漲停 +10%，到小數第二位。"""
    if not prev_close:
        return False
    limit = round(prev_close * 1.1 + 1e-9, 2)
    return price >= limit * (1 - tol)


def project_root():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    os.chdir(project_root())
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    pick_days = build_pick_days(days, rev_maps, hw, disp)

    # 蒐集 score>=75 的交易，並標記是否符合 0<=gap<5
    trades = []
    pick_count_by_day = defaultdict(int)
    qualified_count_by_day = defaultdict(int)  # gap 條件符合者

    for d in pick_days:
        if not d.get("nextDate"):
            continue
        # 該日選股總數（score>=75，準備買進）
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            pick_count_by_day[d["entryDate"]] += 1

            day_bars = load_cache(p["code"], d["entryDate"]) or []
            next_bars = load_cache(p["code"], d["nextDate"]) or []
            if not day_bars or not next_bars:
                continue

            entry = day_bars[0]["open"]
            prev_close = p["prevClose"]
            if entry <= 0 or prev_close <= 0:
                continue
            gap_pct = (entry - prev_close) / prev_close * 100

            # 漲跌停限制檢查
            entry_limit_up = is_limit_up(entry, prev_close)

            # 09:15 出場價
            px_0915 = bar_close_at_or_before(day_bars, "09:15")
            px_0913 = bar_close_at_or_before(day_bars, "09:13")
            px_0905 = bar_close_at_or_before(day_bars, "09:05")
            t2_open = next_bars[0]["open"] if next_bars else None

            # 09:15 是否漲停 (賣不掉)
            limit_up_0915 = is_limit_up(px_0915, prev_close) if px_0915 else False

            # 各種出場報酬
            def ret(px):
                if px is None:
                    return None
                return round((px - entry) / entry * 100 - COST_RT, 4)

            r_0915 = ret(px_0915)
            r_0913 = ret(px_0913)
            r_0905 = ret(px_0905)
            r_t2o = ret(t2_open)

            in_rule = (0 <= gap_pct < 5)
            if in_rule:
                qualified_count_by_day[d["entryDate"]] += 1

            trades.append({
                "date": d["entryDate"],
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "prevClose": prev_close,
                "entry": entry,
                "gapPct": round(gap_pct, 3),
                "entryLimitUp": entry_limit_up,
                "px0905": px_0905,
                "px0913": px_0913,
                "px0915": px_0915,
                "limitUp0915": limit_up_0915,
                "r0905": r_0905,
                "r0913": r_0913,
                "r0915": r_0915,
                "rT2o": r_t2o,
                "barCount": len(day_bars),
                "firstBarTime": day_bars[0]["time"] if day_bars else None,
                "inRule": in_rule,
            })

    # ── 1. 規則樣本驗證 ──
    rule_trades = [t for t in trades if t["inRule"] and t["r0915"] is not None]
    n_rule = len(rule_trades)
    wins_rule = sum(1 for t in rule_trades if t["r0915"] > 0)
    ev_rule = mean(t["r0915"] for t in rule_trades) if rule_trades else 0
    win_rate_rule = wins_rule / n_rule * 100 if n_rule else 0

    # 對照: 同一批用 T+2 開盤
    ev_t2o = mean(t["rT2o"] for t in rule_trades if t["rT2o"] is not None) if rule_trades else 0
    wins_t2o = sum(1 for t in rule_trades if t["rT2o"] is not None and t["rT2o"] > 0)
    n_t2o = sum(1 for t in rule_trades if t["rT2o"] is not None)
    wr_t2o = wins_t2o / n_t2o * 100 if n_t2o else 0

    # ── 2. 競價進場可執行性 ──
    entry_blocked = [t for t in rule_trades if t["entryLimitUp"]]

    # ── 3. 09:15 出場流動性 (漲停鎖死) ──
    exit_blocked = [t for t in rule_trades if t["limitUp0915"]]

    # ── 4. 規則需要的資料 (gap) 在 T+1 開盤前能否獲得? ──
    # gap = (T+1 open - prevClose) / prevClose
    # T+1 open 只在 09:00 集合競價揭示後才知道
    # 所以這規則只能在「拿到開盤價之後、09:15 前」決定要不要持有
    # 等同「進場後再判斷」，跟一般入場策略邏輯不衝突，
    # 但意味著: 在 09:00 開盤前無法知道哪些標的會被買入

    # 假設情境 A: 「全部 score>=75 都先掛競價買進，09:01 後看 gap 決定是否平倉」
    #   → 不符合 rule，因為 rule 是 entry filter
    # 假設情境 B: 「09:00 開盤後立即看 gap, 若 0<=gap<5 才下市價買進」
    #   → 那「entry price」實質是 09:01-09:03 的市價，不是 09:00 開盤價
    #   → 回測用 09:00 open 當 entry 會高估獲利

    # 量化 09:00 open vs 09:01 close 的差距
    slip_pp = []
    for t in rule_trades:
        if t["px0905"] is None:
            continue
        # 第一根 bar 大多是 09:01；用其 close 模擬「實際能買進的價」
        # 簡化：用 09:05 close 代表「等看完 gap 後的市價」
        slip = (t["px0905"] - t["entry"]) / t["entry"] * 100
        slip_pp.append(slip)
    slip_mean = mean(slip_pp) if slip_pp else 0
    slip_median = median(slip_pp) if slip_pp else 0

    # 若延遲到 09:05 才買進，09:15 出場的「真實淨報酬」
    rule_real_rets = []
    for t in rule_trades:
        if t["px0905"] is None or t["px0915"] is None:
            continue
        gross = (t["px0915"] - t["px0905"]) / t["px0905"] * 100
        rule_real_rets.append(gross - COST_RT)
    n_real = len(rule_real_rets)
    ev_real = mean(rule_real_rets) if rule_real_rets else 0
    wr_real = (sum(1 for r in rule_real_rets if r > 0) / n_real * 100) if n_real else 0

    # ── 5. 同日多檔執行 ──
    multi_day_dist = defaultdict(int)
    for d, c in qualified_count_by_day.items():
        if c > 0:
            multi_day_dist[c] += 1
    avg_per_day = (sum(c for c in qualified_count_by_day.values() if c > 0) /
                   max(1, sum(1 for c in qualified_count_by_day.values() if c > 0)))
    max_per_day = max(qualified_count_by_day.values()) if qualified_count_by_day else 0

    # ── 6. 09:15 出場 vs 09:13 vs 09:05 的差距 (時間敏感性) ──
    sens = {}
    for label, key in [("09:05", "r0905"), ("09:13", "r0913"), ("09:15", "r0915"), ("T2_open", "rT2o")]:
        vals = [t[key] for t in rule_trades if t[key] is not None]
        if vals:
            sens[label] = {
                "n": len(vals),
                "winRate": round(sum(1 for v in vals if v > 0) / len(vals) * 100, 1),
                "evPct": round(mean(vals), 3),
                "median": round(median(vals), 3),
                "std": round(stdev(vals), 3) if len(vals) > 1 else 0,
            }

    # ── 7. 連續日報酬序列 (做點 bootstrap) ──
    sample_returns_0915 = [t["r0915"] for t in rule_trades]
    # simple bootstrap of EV
    import random
    random.seed(42)
    boots = []
    if sample_returns_0915:
        for _ in range(2000):
            sample = [random.choice(sample_returns_0915) for _ in sample_returns_0915]
            boots.append(mean(sample))
        boots.sort()
        ev_ci_low = boots[int(0.025 * len(boots))]
        ev_ci_high = boots[int(0.975 * len(boots))]
    else:
        ev_ci_low = ev_ci_high = None

    # ── 8. 月度分布 ──
    monthly = defaultdict(list)
    for t in rule_trades:
        monthly[t["date"][:7]].append(t["r0915"])
    monthly_stats = {}
    for m, rs in sorted(monthly.items()):
        if rs:
            wins = sum(1 for r in rs if r > 0)
            monthly_stats[m] = {
                "n": len(rs),
                "winRate": round(wins / len(rs) * 100, 1),
                "evPct": round(mean(rs), 3),
            }

    out = {
        "rule": "score>=75 AND 0<=gap<5% -> T+1 09:15 exit",
        "claimed": {"winRate": 72.7, "evPct": 2.066},
        "validated": {
            "n": n_rule,
            "winRate": round(win_rate_rule, 1),
            "evPct": round(ev_rule, 3),
            "evBootstrapCI95": [round(ev_ci_low, 3), round(ev_ci_high, 3)] if ev_ci_low is not None else None,
        },
        "ifInsteadT2Open": {
            "n": n_t2o, "winRate": round(wr_t2o, 1), "evPct": round(ev_t2o, 3),
            "delta_vs_0915": round(ev_rule - ev_t2o, 3),
        },
        "executionRisks": {
            "1_dataAvailableBeforeAuction": {
                "issue": "gap = (T+1 open - prevClose)/prevClose, 09:00 集合競價揭示後才知",
                "implication": "不能在 09:00 競價前決定『要不要買』；只能 09:00 開盤後看到 open 才下單，此時市價已偏離 open",
                "lookAheadBias": True,
            },
            "2_entryAtAuctionPriceFeasibility": {
                "issue": "回測用 day_bars[0]['open']=09:00 競價開盤價當 entry",
                "limitUpAtEntry_n": len(entry_blocked),
                "limitUpAtEntry_pct": round(len(entry_blocked) / max(1, n_rule) * 100, 1),
                "note": "若 entry 已漲停則買不到 (大量買單排隊)；但 gap<5 通常未到漲停",
            },
            "3_realEntryShouldBe0905": {
                "slippage_mean_pp": round(slip_mean, 3),
                "slippage_median_pp": round(slip_median, 3),
                "if_enter_at_0905_close_exit_0915": {
                    "n": n_real,
                    "winRate": round(wr_real, 1),
                    "evPct": round(ev_real, 3),
                    "delta_vs_claimed": round(ev_real - ev_rule, 3),
                },
                "implication": "若實際 09:00-09:05 才能下市價單，預期 EV 大幅縮水",
            },
            "4_exitLiquidity_0915": {
                "limitUpAt0915_n": len(exit_blocked),
                "limitUpAt0915_pct": round(len(exit_blocked) / max(1, n_rule) * 100, 1),
                "implication": "09:15 若鎖漲停則賣不掉，必須延後出場 → 回測高估出場價",
                "sample_blocked": [{"code": t["code"], "date": t["date"], "gap": t["gapPct"]}
                                   for t in exit_blocked[:10]],
            },
            "5_multiStockExecution": {
                "avg_picks_per_active_day": round(avg_per_day, 2),
                "max_picks_per_day": max_per_day,
                "active_days": len([c for c in qualified_count_by_day.values() if c > 0]),
                "distribution": dict(sorted(multi_day_dist.items())),
                "implication": "若同日多檔同時觸發, 09:00-09:01 短短一分鐘內需下多單，人工難執行",
            },
        },
        "sensitivity_byExitTime": sens,
        "monthly": monthly_stats,
        "overfitting_warning": {
            "exit_time_grid_explored": ["09:01","09:05","09:15","10:00","11:30","T1_close","T2_open"],
            "gap_buckets_explored": 6,
            "score_buckets_explored": 3,
            "implicit_tests": 7 * 6 * 3,
            "note": "從 126 個組合中挑出 EV 最大者；極高機率為 over-fit。Bonferroni 校正後 95%CI 通常不顯著",
        },
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"=== 規則驗證 ===")
    print(f"  rule trades n={n_rule} 勝率{win_rate_rule:.1f}% EV{ev_rule:.3f}%")
    print(f"  claimed: 72.7% / 2.066%")
    print(f"  bootstrap 95%CI EV = [{ev_ci_low:.3f}, {ev_ci_high:.3f}]")
    print(f"\n=== 對照 T+2 open ===")
    print(f"  T2_open: 勝率{wr_t2o:.1f}% EV{ev_t2o:.3f}%  (差距 {ev_rule-ev_t2o:+.3f}pp)")
    print(f"\n=== 執行風險 ===")
    print(f"  entry 漲停 (買不到): {len(entry_blocked)} 筆 ({len(entry_blocked)/max(1,n_rule)*100:.1f}%)")
    print(f"  09:15 漲停 (賣不掉): {len(exit_blocked)} 筆 ({len(exit_blocked)/max(1,n_rule)*100:.1f}%)")
    print(f"  open->09:05 滑點 中位{slip_median:+.3f}pp 平均{slip_mean:+.3f}pp")
    print(f"  若 09:05 才進場 09:15 出場: n={n_real} 勝率{wr_real:.1f}% EV{ev_real:.3f}%")
    print(f"\n=== 同日多檔 ===")
    print(f"  active days={len([c for c in qualified_count_by_day.values() if c > 0])}, max檔/日={max_per_day}, 平均{avg_per_day:.2f}")
    print(f"  分布: {dict(sorted(multi_day_dist.items()))}")
    print(f"\n=== 月度 ===")
    for m, s in monthly_stats.items():
        print(f"  {m}: n={s['n']} 勝率{s['winRate']}% EV{s['evPct']:+.3f}%")
    print(f"\n結果存至 {OUT_PATH}")


if __name__ == "__main__":
    main()
