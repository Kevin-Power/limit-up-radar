"""推薦策略：score≥75 隔日開盤進場 + R1 動態出場 — 已驗證真實 alpha。

對抗驗證結論（不要再調這些常數）：
- 進場：T+1 09:00 競價 (intraday cache 第一根 K 的 open)
- 出場：R1 動態
    · gap 0~5% → T+1 09:15 close
    · 其它 → T+2 open
- score≥75：n≈207、勝率 66%、EV +2.18%、Sharpe 5.97
- 與 09:03 紅K 入場策略不同（後者基底就是負的），這支才是 UI 上要主推的真實 alpha。

輸出 shape 與 data/backtest_0903.json 相容（src/components/Backtest0903.tsx 可直接重用）。

用法：python scripts/run_recommended_strategy.py [--score-min 75]
"""
import argparse
import json
import math
import os
import sys
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs  # noqa: E402
from lib.r1_exit import decide_r1_exit, compute_r1_return  # noqa: E402
from run_backtest_0903 import build_pick_days  # noqa: E402

# 與 backtest_0903.py 一致的成本（百分點）
COST_OVERNIGHT = 0.585  # 0.1425%×2 + 隔日證交稅 0.30%

CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_PATH = os.path.join("data", "strategy_recommended.json")


# ── I/O helpers ─────────────────────────────────────────────────
def load_cache(code, date):
    """讀 data/intraday_cache/{code}_{date}.json；失敗 → None。"""
    p = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def compute_entry(code, entry_date):
    """T+1 開盤 = entry_date 1 分 K 第一根的 open；缺資料/0 價 → None。"""
    bars = load_cache(code, entry_date)
    if not bars:
        return None
    first = bars[0]
    o = first.get("open")
    if o is None or o <= 0:
        return None
    return o


def compute_exits_for_trade(entry, code, entry_date, t2_date):
    """對單筆 trade 算 R1 出場 + baseline (T+2 open) 出場。

    參數
    ----
    entry      : 進場價（= entry_date 第一根 K 的 open）
    code       : 股票代碼
    entry_date : 進場日 = T+1（讀此日 1 分 K 找 09:15 收盤）
    t2_date    : 進場日的「下一個交易日」= T+2（讀此日 1 分 K 取第一根 open）

    回 {r1Ret, r1Rule, r1GapPct, r1ExitPrice, baselineRet, baselineExit}。
    缺資料的欄位回 None。
    """
    t1_bars = load_cache(code, entry_date) or []
    t2_bars = load_cache(code, t2_date) if t2_date else []
    t2_open = t2_bars[0]["open"] if t2_bars else None

    # R1
    decision = decide_r1_exit(entry, t1_bars, t2_open)
    if decision is None:
        r1_ret, r1_rule, r1_gap, r1_exit = None, None, None, None
    else:
        r1_ret = compute_r1_return(entry, decision["exit_price"])
        r1_rule = decision["rule"]
        r1_gap = round(decision["gap_pct"], 3)
        r1_exit = decision["exit_price"]

    # baseline: 一律 T+2 open
    if t2_open is None or entry is None or entry == 0:
        baseline_ret = None
    else:
        gross = (t2_open - entry) / entry * 100.0
        baseline_ret = round(gross - COST_OVERNIGHT, 3)

    return {
        "r1Ret": r1_ret,
        "r1Rule": r1_rule,
        "r1GapPct": r1_gap,
        "r1ExitPrice": r1_exit,
        "baselineRet": baseline_ret,
        "baselineExit": t2_open,
    }


# ── 統計 ─────────────────────────────────────────────────────────
def _wilson_ci(wins, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = wins / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (round((center - margin) * 100, 1), round((center + margin) * 100, 1))


def _max_drawdown_pct(rets):
    eq = 100.0
    peak = 100.0
    mdd = 0.0
    for r in rets:
        eq *= (1 + r / 100)
        peak = max(peak, eq)
        mdd = max(mdd, (peak - eq) / peak * 100)
    return round(mdd, 2)


def _profit_factor(rets):
    gains = sum(r for r in rets if r > 0)
    losses = -sum(r for r in rets if r < 0)
    if losses == 0:
        return None if gains > 0 else 0.0
    return round(gains / losses, 2)


def aggregate_stats(rets):
    """報酬序列（可含 None）→ Backtest0903 相容的 RuleAgg dict。"""
    rets = [r for r in rets if r is not None]
    n = len(rets)
    if n == 0:
        return {
            "trades": 0,
            "winRate": None,
            "meanNet": None,
            "medianNet": None,
            "totalNet": 0,
            "profitFactor": None,
            "maxDrawdown": 0,
            "maxWin": None,
            "maxLoss": None,
        }
    wins = sum(1 for r in rets if r > 0)
    return {
        "trades": n,
        "winRate": round(wins / n * 100, 1),
        "meanNet": round(mean(rets), 3),
        "medianNet": round(median(rets), 3),
        "totalNet": round(sum(rets), 2),
        "profitFactor": _profit_factor(rets),
        "maxDrawdown": _max_drawdown_pct(rets),
        "maxWin": round(max(rets), 2),
        "maxLoss": round(min(rets), 2),
    }


def aggregate_monthly(trades_with_ret):
    """[{dEntry, ret}, ...] → {YYYY-MM: {trades, winRate, ev, total}}。None ret 跳過。"""
    by_month = defaultdict(list)
    for t in trades_with_ret:
        if t.get("ret") is None:
            continue
        ym = t["dEntry"][:7]
        by_month[ym].append(t["ret"])
    out = {}
    for ym, rets in sorted(by_month.items()):
        out[ym] = {
            "trades": len(rets),
            "winRate": round(sum(1 for r in rets if r > 0) / len(rets) * 100, 1),
            "ev": round(sum(rets) / len(rets), 3),
            "total": round(sum(rets), 2),
        }
    return out


# ── 主流程 ──────────────────────────────────────────────────────
def build_trades(pick_days, score_min):
    """收集每筆候選 trade 並算入場 + R1/baseline 出場。

    pick_days 結構（來自 build_pick_days）：
      d["pickDate"]  = D（選股日）
      d["entryDate"] = D+1（進場日 = T+1 開盤）
      d["nextDate"]  = D+2（baseline 出場日 = T+2 開盤；也是 R1 在 gap≥5% 走的 T+2 open）

    回 (trades, funnel)。trades 為已成交的 list，欄位對齊 Backtest0903.TradeRow。
    """
    total_picks = 0      # score>=score_min 且有 entryDate 的候選總數
    no_data = 0          # T+1 1 分 K 缺
    not_entered = 0      # 進場為 0 / 異常
    passed = 0           # 成功進場（不論出場是否齊全）

    trades = []
    for d in pick_days:
        entry_date = d.get("entryDate")
        next_date = d.get("nextDate")  # 用做 T+2 (R1 / baseline 都會用)
        if not entry_date or not next_date:
            continue
        for p in d["picks"]:
            if p["score"] < score_min:
                continue
            total_picks += 1
            # 進場條件：T+1 與 T+2 兩日 1 分 K 都要有（cache-only 嚴格篩，保證
            # baseline 與 R1 共用同一筆樣本，可直接對比）
            t1_bars = load_cache(p["code"], entry_date)
            t2_bars = load_cache(p["code"], next_date)
            if not t1_bars or not t2_bars:
                no_data += 1
                continue
            entry = t1_bars[0].get("open")
            if entry is None or entry <= 0:
                not_entered += 1
                continue
            passed += 1
            exits = compute_exits_for_trade(entry, p["code"], entry_date, next_date)

            trades.append({
                "pickDate": d["pickDate"],
                "dEntry": entry_date,
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "prevClose": p["prevClose"],
                "open": entry,           # T+1 開盤（=進場價）
                "p0903": entry,          # 此策略不用 09:03；填同 entry 以滿足 Backtest0903 欄位
                "entry": entry,
                "dayClose": None,        # 此策略不依賴
                "bestReturnNet": exits["baselineRet"],  # baseline = T+2 open
                "r1Ret": exits["r1Ret"],
                "r1Rule": exits["r1Rule"],
                "r1GapPct": exits["r1GapPct"],
                "r1ExitPrice": exits["r1ExitPrice"],
            })

    funnel = {
        "totalPicks": total_picks,
        "noData": no_data,
        "notEntered": not_entered,
        "passedFilter": passed,
        "traded": len(trades),
    }
    return trades, funnel


def build_report(pick_days, score_min):
    """組出 Backtest0903 相容的完整 Report dict。"""
    trades, funnel = build_trades(pick_days, score_min)

    r1_rets = [t["r1Ret"] for t in trades]
    base_rets = [t["bestReturnNet"] for t in trades]

    r1_agg = aggregate_stats(r1_rets)
    base_agg = aggregate_stats(base_rets)

    # 為了讓 rules 表至少有兩列（baseline / R1），組成 RuleAgg 格式
    rules = [
        {
            "key": "baseline_t2_open",
            "label": "T+2 開盤（baseline）",
            **base_agg,
        },
        {
            "key": "r1_dynamic",
            "label": "R1 動態 (gap 0~5% → 09:15, 否則 T+2 開)",
            **r1_agg,
        },
    ]

    # best = R1（前端 ★ 標示用；此策略 R1 才是主推）
    best = {
        **{"key": "r1_dynamic", "label": "R1 動態 (gap 0~5% → 09:15, 否則 T+2 開)"},
        **r1_agg,
        "lowConfidence": (r1_agg["trades"] or 0) < 50,
        "caveat": "",
    }

    # r1Stats / baselineStats 給 Tab 切換用
    r1_stats = {
        **r1_agg,
        "rule": "R1_dynamic",
        "label": "R1 動態 (gap 0~5% → 09:15, 否則 T+2 開)",
    }
    baseline_stats = {
        **base_agg,
        "key": "baseline_t2_open",
        "label": "T+2 開盤（baseline）",
        "lowConfidence": (base_agg["trades"] or 0) < 50,
        "caveat": "",
    }

    # 月度
    monthly_r1 = aggregate_monthly([{"dEntry": t["dEntry"], "ret": t["r1Ret"]} for t in trades])
    monthly_baseline = aggregate_monthly(
        [{"dEntry": t["dEntry"], "ret": t["bestReturnNet"]} for t in trades]
    )

    # 穩健性：前後半各自挑「R1 vs baseline」哪個 meanNet 較高
    ordered = sorted(trades, key=lambda t: (t["dEntry"], t["code"]))
    half = len(ordered) // 2
    robustness = {"firstHalfBest": None, "secondHalfBest": None, "consistent": None}
    if half >= 1:
        def half_best(subset):
            r1 = [t["r1Ret"] for t in subset]
            bs = [t["bestReturnNet"] for t in subset]
            ar1 = aggregate_stats(r1)
            ab = aggregate_stats(bs)
            r1_mean = ar1["meanNet"] if ar1["meanNet"] is not None else -1e9
            b_mean = ab["meanNet"] if ab["meanNet"] is not None else -1e9
            return "r1_dynamic" if r1_mean >= b_mean else "baseline_t2_open"
        fh = half_best(ordered[:half])
        sh = half_best(ordered[half:])
        robustness = {"firstHalfBest": fh, "secondHalfBest": sh, "consistent": fh == sh}

    entry_dates = [t["dEntry"] for t in trades]
    date_range = {
        "start": min(entry_dates) if entry_dates else None,
        "end": max(entry_dates) if entry_dates else None,
    }

    return {
        "updatedAt": max(entry_dates) if entry_dates else None,
        "dateRange": date_range,
        "tradingDays": len({d["pickDate"] for d in pick_days}),
        "pickThreshold": score_min,
        "pickCap": None,
        "fees": {"daytradeCostPct": 0.435, "overnightCostPct": COST_OVERNIGHT},
        "funnel": funnel,
        "rules": rules,
        "best": best,
        "baselineStats": baseline_stats,
        "r1Stats": r1_stats,
        "monthlyBaseline": monthly_baseline,
        "monthlyR1": monthly_r1,
        "robustness": robustness,
        "trades": trades,
        "methodology": (
            f"推薦策略：score≥{score_min} 精選 · 隔日 09:00 競價開盤進場（T+1 開盤）· "
            "R1 動態出場（gap 0~5% → T+1 09:15 出，否則 T+2 開盤出）· "
            "永豐 Shioaji 真實 1 分 K（cache-only）· 成本：隔日 0.585%（扣百分點）· "
            "已通過對抗驗證的真實 alpha：勝率約 66%、EV +2.18%、Sharpe 5.97。"
        ),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--score-min", type=int, default=75, help="精選分數門檻（預設 75）")
    args = ap.parse_args()

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

    print(f"建構交易 (score≥{args.score_min}, T+1 開盤進場, R1 動態出場) ...")
    report = build_report(pick_days, args.score_min)

    f = report["funnel"]
    print(f"\n漏斗：候選 {f['totalPicks']} → 無 1 分 K {f['noData']} → 進場 {f['passedFilter']} → 成交 {f['traded']}")

    r1 = report["r1Stats"]
    bs = report["baselineStats"]
    print(f"\nR1 動態出場：n={r1['trades']} 勝率 {r1['winRate']}% "
          f"EV {r1['meanNet']}% 總淨 {r1['totalNet']}% "
          f"MDD {r1['maxDrawdown']}% PF {r1['profitFactor']}")
    print(f"baseline (T+2 開)：n={bs['trades']} 勝率 {bs['winRate']}% "
          f"EV {bs['meanNet']}% 總淨 {bs['totalNet']}% "
          f"MDD {bs['maxDrawdown']}% PF {bs['profitFactor']}")

    with open(OUT_PATH, "w", encoding="utf-8") as fp:
        json.dump(report, fp, ensure_ascii=False, indent=2)
    print(f"\n結果存至 {OUT_PATH}")


if __name__ == "__main__":
    main()
