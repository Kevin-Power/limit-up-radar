"""樣本外驗證：T+5 收盤出場規則

驗證問題：
1. 把交易（時間序）切前 70%（訓練）/ 後 30%（測試），勝率/EV 差多少？
2. 訓練 vs 測試 EV/勝率落差 > 10pp → 失效。
3. 2026-06 子段（已知策略失效月）下，T+5 規則能不能救回獲利？
4. 月度切分：每月 EV / 勝率，看是否任何單月撐住整體均值。

注意：
- 直接重用 analyze_exit_timing.py 的價格邏輯（intraday_cache + month cache）。
- score≥75 條件不變。
- 成本 0.3798%（2.8 折）。
- 不重新抓網路資料，全部用 data/_price_month_cache.json 與 intraday_cache。
"""
import json
import math
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from run_backtest_0903 import build_pick_days
from analyze_exit_timing import (
    build_daily_close_map, get_price, get_trading_dates, net_ret,
    load_price_cache, COST_PCT, SCORE_MIN,
)

OUT_FILE = "data/opt_t5_oos.json"


def stats_block(rets):
    rets = [r for r in rets if r is not None]
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "meanNet": None, "medianNet": None,
                "totalNet": 0.0, "sd": None}
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "meanNet": round(statistics.mean(rets), 3),
        "medianNet": round(statistics.median(rets), 3),
        "totalNet": round(sum(rets), 2),
        "sd": round(statistics.stdev(rets), 3) if n > 1 else 0,
    }


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("[load] daily / 營收 / 分類 ...")
    days = hs.load_daily_files()
    daily_dates = [d["date"] for d in days]
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()

    print("[build] pick_days ...")
    pick_days = build_pick_days(days, rev_maps, hw, disp)
    daily_close_map = build_daily_close_map()
    bars_cache = {}
    price_cache = load_price_cache()
    print(f"price_cache: {sum(1 for v in price_cache.values() if v)} 有效 month-pairs")

    # 收集每筆交易（score≥75）
    trades = []  # {entryDate, code, name, score, entry, t5_close, ret_t5, ret_t2_open}
    skipped_no_entry = 0
    skipped_no_t5 = 0

    for d in pick_days:
        entry_date = d["entryDate"]
        t2 = get_trading_dates(daily_dates, entry_date, 1)
        t5 = get_trading_dates(daily_dates, entry_date, 4)
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            code = p["code"]
            entry = get_price(code, entry_date, "open",
                              bars_cache, price_cache, daily_close_map)
            if entry is None:
                skipped_no_entry += 1
                continue
            t5_close = get_price(code, t5, "close",
                                 bars_cache, price_cache, daily_close_map)
            t2_open = get_price(code, t2, "open",
                                bars_cache, price_cache, daily_close_map)
            ret_t5 = net_ret(entry, t5_close)
            ret_t2 = net_ret(entry, t2_open)
            if ret_t5 is None:
                skipped_no_t5 += 1
                continue
            trades.append({
                "pickDate": d["pickDate"],
                "entryDate": entry_date,
                "code": code,
                "name": p["name"],
                "score": p["score"],
                "month": entry_date[:7],
                "ret_t5": ret_t5,
                "ret_t2_open": ret_t2,
            })

    print(f"[done] trades={len(trades)} skipped_no_entry={skipped_no_entry} "
          f"skipped_no_t5={skipped_no_t5}")
    if not trades:
        print("no trades — abort")
        return

    # 按 entryDate 升冪
    trades.sort(key=lambda t: (t["entryDate"], t["code"]))

    n = len(trades)
    cut = int(n * 0.7)
    train = trades[:cut]
    test = trades[cut:]

    # 全期 / 訓練 / 測試
    full = stats_block([t["ret_t5"] for t in trades])
    s_train = stats_block([t["ret_t5"] for t in train])
    s_test = stats_block([t["ret_t5"] for t in test])

    # 落差
    gap_winrate = (s_test["winRate"] - s_train["winRate"]) if s_train["winRate"] is not None else None
    gap_ev = (s_test["meanNet"] - s_train["meanNet"]) if s_train["meanNet"] is not None else None

    # 月度
    by_month = {}
    for t in trades:
        by_month.setdefault(t["month"], []).append(t["ret_t5"])
    monthly = {m: stats_block(rs) for m, rs in sorted(by_month.items())}

    # 6 月專屬
    june_trades = [t for t in trades if t["month"] == "2026-06"]
    june_block = stats_block([t["ret_t5"] for t in june_trades])

    # 與基線 T+2_open 在 2026-06 對比
    june_t2_block = stats_block([t["ret_t2_open"] for t in june_trades])

    # 訓練/測試的時間範圍
    train_range = (train[0]["entryDate"], train[-1]["entryDate"]) if train else (None, None)
    test_range = (test[0]["entryDate"], test[-1]["entryDate"]) if test else (None, None)

    # 訓練段挑出來的「贏家」是否能在測試段重複？
    # 把 train 按 stock-month 分組難度大，用 score band 切：≥75, 80, 85
    score_bands = [75, 80, 85, 90]
    train_by_band = {}
    test_by_band = {}
    for band in score_bands:
        train_by_band[band] = stats_block([t["ret_t5"] for t in train if t["score"] >= band])
        test_by_band[band] = stats_block([t["ret_t5"] for t in test if t["score"] >= band])

    # 訓練段表現最好的月份是哪個？拿到測試段還靈嗎？(訓練段沒測試段月)
    train_months = set(t["month"] for t in train)
    test_months = set(t["month"] for t in test)
    overlap = train_months & test_months
    only_test = sorted(test_months - train_months)

    # 訓練段月份最佳 EV 排序
    train_monthly = {m: stats_block([t["ret_t5"] for t in train if t["month"] == m])
                     for m in sorted(train_months)}

    # ── 寫結果 ─────────────────────────────────────────────
    output = {
        "rule": "T+5_close (持有 5 交易日, 第 5 日收盤平倉)",
        "scoreMin": SCORE_MIN,
        "costPct": COST_PCT,
        "totalTrades": n,
        "splitRatio": "70/30 (chronological by entryDate)",
        "fullSample": full,
        "train": {
            "range": train_range,
            "stats": s_train,
        },
        "test": {
            "range": test_range,
            "stats": s_test,
        },
        "gap": {
            "winRate_test_minus_train_pp": round(gap_winrate, 1) if gap_winrate is not None else None,
            "meanNet_test_minus_train_pct": round(gap_ev, 3) if gap_ev is not None else None,
            "fails_10pp_rule": (gap_winrate is not None and abs(gap_winrate) > 10),
        },
        "monthly": monthly,
        "june2026": {
            "T+5_close": june_block,
            "T+2_open_baseline": june_t2_block,
            "verdict": (
                "T+5 救回獲利" if (june_block.get("meanNet") or -9) > 0
                else "T+5 在 6 月仍虧"
            ),
        },
        "trainTestMonthOverlap": {
            "overlap": sorted(overlap),
            "trainOnly": sorted(train_months - test_months),
            "testOnly": only_test,
            "note": "若 test 月份在 train 內未出現過 → 樣本外才剛開始，更難判斷。",
        },
        "trainMonthly": train_monthly,
        "scoreBands": {
            "train": train_by_band,
            "test": test_by_band,
        },
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # ── 印報告 ─────────────────────────────────────────────
    print("\n=== T+5 收盤出場 — 樣本外驗證 ===")
    print(f"全樣本: n={full['n']}  勝率={full['winRate']}%  EV={full['meanNet']:+.3f}%  "
          f"med={full['medianNet']:+.3f}%  total={full['totalNet']:+.1f}%")
    print(f"\n訓練 70% ({train_range[0]} ~ {train_range[1]}):")
    print(f"  n={s_train['n']}  勝率={s_train['winRate']}%  EV={s_train['meanNet']:+.3f}%  "
          f"total={s_train['totalNet']:+.1f}%")
    print(f"\n測試 30% ({test_range[0]} ~ {test_range[1]}):")
    print(f"  n={s_test['n']}  勝率={s_test['winRate']}%  EV={s_test['meanNet']:+.3f}%  "
          f"total={s_test['totalNet']:+.1f}%")
    print(f"\n落差: winRate {gap_winrate:+.1f}pp   EV {gap_ev:+.3f}%   "
          f"失效?({abs(gap_winrate or 0) > 10})")

    print("\n=== 月度分布 ===")
    print(f"{'month':<10} {'n':>5} {'win%':>6} {'EV':>8} {'med':>8} {'total':>9}")
    for m, s in monthly.items():
        if s["n"] == 0:
            continue
        print(f"{m:<10} {s['n']:>5} {s['winRate']:>5}% {s['meanNet']:>+7.3f}% "
              f"{s['medianNet']:>+7.3f}% {s['totalNet']:>+8.2f}%")

    print(f"\n=== 2026-06 焦點（基線失效月）===")
    print(f"T+5_close: n={june_block['n']} 勝率={june_block['winRate']}% "
          f"EV={june_block['meanNet']:+.3f}% total={june_block['totalNet']:+.1f}%")
    print(f"T+2_open : n={june_t2_block['n']} 勝率={june_t2_block.get('winRate')}% "
          f"EV={june_t2_block.get('meanNet')}% total={june_t2_block.get('totalNet')}%")

    print("\n=== Score band (train / test) ===")
    for band in score_bands:
        tr = train_by_band[band]
        te = test_by_band[band]
        print(f">={band}: train n={tr['n']} win%={tr['winRate']} EV={tr['meanNet']} "
              f"| test n={te['n']} win%={te['winRate']} EV={te['meanNet']}")

    print(f"\nsaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
