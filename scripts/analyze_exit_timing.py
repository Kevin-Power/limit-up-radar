"""出場時機優化分析 — 比較 T+2 開盤即出 vs 其他出場時機。

基線：score≥75，T+1 開盤競價買進，T+2 開盤賣出 → 274 筆 / EV +1.87%

候選出場時機：
  1. T+2 開盤（基線）
  2. T+2 收盤
  3. T+3 開盤
  4. T+3 收盤
  5. T+5 收盤
  6. T+10 收盤
  7. 動態停利：T+2 開盤 ≥+3% → 出，否則放到 T+3 開盤
  8. 移動停損：T+2 開盤 < 進場價 → 出，否則放到 T+3 開盤
  9. 分批：50% T+2 開盤 + 50% T+3 開盤

成本：2.8 折手續費 + 證交稅 0.3% = 0.0399×2 + 0.30 = 0.3798% 來回。

價格來源策略（多源 fallback）：
  優先：data/intraday_cache（1 分 K 提供當日 open/close）
  次選：TWSE/TPEx 月 API（每月 1 次呼叫拿全月 OHLC，省限流）

為公平比較，最終比較表用「同樣本子集」(same-sample) — 即所有候選出場時機
都有資料的那批 trades。
"""
import json
import math
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from run_backtest_0903 import build_pick_days

CACHE_DIR = os.path.join("data", "intraday_cache")
DAILY_DIR = os.path.join("data", "daily")

# 2.8 折手續費 + 賣方證交稅
COST_PCT = 0.0399 * 2 + 0.30  # = 0.3798
SCORE_MIN = 75
OUT_FILE = "data/opt_exit_timing.json"
PRICE_CACHE_FILE = "data/_price_month_cache.json"  # 自己的本地長久快取


# ── 月線快取（避免重打 TWSE） ────────────────────────────────
def load_price_cache():
    try:
        with open(PRICE_CACHE_FILE, encoding="utf-8") as f:
            cache = json.load(f)
        return {k: v for k, v in cache.items() if v}
    except Exception:
        return {}


def save_price_cache(cache):
    os.makedirs(os.path.dirname(PRICE_CACHE_FILE), exist_ok=True)
    with open(PRICE_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f)


def fetch_month_prices(code, yyyymm, cache):
    """{date:{open,close}}；用 honest_stats.fetch_month。"""
    return hs.fetch_month(code, yyyymm, cache)


# ── 價格取得（多源 fallback） ───────────────────────────────
def load_bars(code, date, bars_cache):
    if (code, date) in bars_cache:
        return bars_cache[(code, date)]
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            bars = json.load(f)
        bars_cache[(code, date)] = bars if bars else None
    except Exception:
        bars_cache[(code, date)] = None
    return bars_cache[(code, date)]


def get_price(code, date, side, bars_cache, price_cache, daily_close_map):
    """取 (code, date) 的 open/close 價。
    side: 'open' 或 'close'
    優先順序：intraday cache → TWSE/TPEx 月線 → daily_close_map（僅 close）
    無資料回 None。
    """
    if date is None:
        return None
    # 1. intraday cache
    bars = load_bars(code, date, bars_cache)
    if bars:
        if side == "open":
            return bars[0]["open"]
        else:
            return bars[-1]["close"]
    # 2. TWSE/TPEx 月線
    yyyymm = date[:7].replace("-", "")
    month_data = fetch_month_prices(code, yyyymm, price_cache)
    if date in month_data:
        return month_data[date][side]
    # 3. close fallback：daily_close_map（限漲停股）
    if side == "close" and (code, date) in daily_close_map:
        return daily_close_map[(code, date)]
    return None


def build_daily_close_map():
    m = {}
    for f in sorted(os.listdir(DAILY_DIR)):
        if not f.endswith(".json"):
            continue
        date = f[:-5]
        with open(os.path.join(DAILY_DIR, f), encoding="utf-8") as fp:
            d = json.load(fp)
        for g in d.get("groups", []):
            for s in g.get("stocks", []):
                m[(s["code"], date)] = s["close"]
    return m


def get_trading_dates(daily_dates, base_date, offset):
    try:
        idx = daily_dates.index(base_date)
    except ValueError:
        return None
    target = idx + offset
    if target < 0 or target >= len(daily_dates):
        return None
    return daily_dates[target]


def net_ret(entry, exit_price):
    if entry is None or exit_price is None or entry <= 0:
        return None
    gross = (exit_price - entry) / entry * 100
    return gross - COST_PCT


# ── 統計 ────────────────────────────────────────────────────
def stats(rets):
    rets = [r for r in rets if r is not None]
    n = len(rets)
    if n == 0:
        return {"n": 0}
    wins = sum(1 for r in rets if r > 0)
    mean = statistics.mean(rets)
    med = statistics.median(rets)
    sd = statistics.stdev(rets) if n > 1 else 0
    sharpe = (mean / sd) * math.sqrt(252) if sd > 0 else 0
    eq = 1.0
    peak = 1.0
    mdd = 0.0
    for r in rets:
        eq *= (1 + r / 100)
        peak = max(peak, eq)
        mdd = max(mdd, (peak - eq) / peak * 100)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "meanNet": round(mean, 3),
        "medianNet": round(med, 3),
        "sd": round(sd, 3),
        "totalNet": round(sum(rets), 2),
        "sharpe": round(sharpe, 2),
        "mdd": round(mdd, 2),
        "maxWin": round(max(rets), 2),
        "maxLoss": round(min(rets), 2),
    }


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("載入 daily / 營收 / 分類 ...")
    days = hs.load_daily_files()
    daily_dates = [d["date"] for d in days]
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()

    print("建構選股 pick_days ...")
    pick_days = build_pick_days(days, rev_maps, hw, disp)
    daily_close_map = build_daily_close_map()
    bars_cache = {}
    price_cache = load_price_cache()

    # 預收集要 fetch 的 (code, yyyymm) 集合 — 一次撈，省限流
    needed_months = set()
    for d in pick_days:
        ed = d["entryDate"]
        # 入場日所在月
        for delta in range(0, 11):  # T+1 至 T+10
            ed_target = get_trading_dates(daily_dates, ed, delta - 1) if delta > 0 else ed
            if ed_target:
                needed_months.add(ed_target[:7].replace("-", ""))
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            # 對該 code 抓所有相關月
            for m in list(needed_months):
                pass
    # 改成：先收集 (code, month)
    needed = set()
    skipped_picks = 0
    for d in pick_days:
        ed = d["entryDate"]
        target_dates = [ed]
        for off in range(1, 11):
            t = get_trading_dates(daily_dates, ed, off)
            if t:
                target_dates.append(t)
        months = {x[:7].replace("-", "") for x in target_dates}
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            for m in months:
                needed.add((p["code"], m))

    todo = [(c, m) for (c, m) in needed if f"{c}|{m}" not in price_cache or not price_cache[f"{c}|{m}"]]
    print(f"price_cache 已有 {len(price_cache)} 個 month-pairs；尚需抓 {len(todo)} 個（總 {len(needed)}）")
    for i, (c, m) in enumerate(todo):
        try:
            fetch_month_prices(c, m, price_cache)
        except Exception as e:
            print(f"  fetch failed {c}|{m}: {e}")
        if (i + 1) % 30 == 0:
            print(f"  fetched {i+1}/{len(todo)}; saving cache...")
            save_price_cache(price_cache)
    save_price_cache(price_cache)
    print(f"完成。price_cache 現有 {sum(1 for v in price_cache.values() if v)} 有效 month-pairs")

    # ── 跑回測 ─────────────────────────────────────────────
    rules = [
        "T+2_open", "T+2_close", "T+3_open", "T+3_close",
        "T+5_close", "T+10_close",
        "dynamic_TP3", "trailing_SL", "split_50_50",
    ]
    rets_by_rule = {k: [] for k in rules}
    coverage = {k: 0 for k in rules}

    n_picks_total = 0
    trade_log = []

    for d in pick_days:
        entry_date = d["entryDate"]
        t2 = get_trading_dates(daily_dates, entry_date, 1)
        t3 = get_trading_dates(daily_dates, entry_date, 2)
        t5 = get_trading_dates(daily_dates, entry_date, 4)
        t10 = get_trading_dates(daily_dates, entry_date, 9)

        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            n_picks_total += 1
            code = p["code"]

            entry = get_price(code, entry_date, "open",
                              bars_cache, price_cache, daily_close_map)
            if entry is None:
                for k in rules:
                    rets_by_rule[k].append(None)
                continue

            t2_open = get_price(code, t2, "open", bars_cache, price_cache, daily_close_map)
            t2_close = get_price(code, t2, "close", bars_cache, price_cache, daily_close_map)
            t3_open = get_price(code, t3, "open", bars_cache, price_cache, daily_close_map)
            t3_close = get_price(code, t3, "close", bars_cache, price_cache, daily_close_map)
            t5_close = get_price(code, t5, "close", bars_cache, price_cache, daily_close_map)
            t10_close = get_price(code, t10, "close", bars_cache, price_cache, daily_close_map)

            rets_by_rule["T+2_open"].append(net_ret(entry, t2_open))
            rets_by_rule["T+2_close"].append(net_ret(entry, t2_close))
            rets_by_rule["T+3_open"].append(net_ret(entry, t3_open))
            rets_by_rule["T+3_close"].append(net_ret(entry, t3_close))
            rets_by_rule["T+5_close"].append(net_ret(entry, t5_close))
            rets_by_rule["T+10_close"].append(net_ret(entry, t10_close))

            # dynamic TP3
            if t2_open is not None:
                gain = (t2_open - entry) / entry * 100
                if gain >= 3.0:
                    rets_by_rule["dynamic_TP3"].append(net_ret(entry, t2_open))
                else:
                    rets_by_rule["dynamic_TP3"].append(net_ret(entry, t3_open))
            else:
                rets_by_rule["dynamic_TP3"].append(None)

            # trailing SL
            if t2_open is not None:
                if t2_open < entry:
                    rets_by_rule["trailing_SL"].append(net_ret(entry, t2_open))
                else:
                    rets_by_rule["trailing_SL"].append(net_ret(entry, t3_open))
            else:
                rets_by_rule["trailing_SL"].append(None)

            # split 50/50
            r1 = net_ret(entry, t2_open)
            r2 = net_ret(entry, t3_open)
            if r1 is not None and r2 is not None:
                rets_by_rule["split_50_50"].append(0.5 * r1 + 0.5 * r2)
            else:
                rets_by_rule["split_50_50"].append(None)

            trade_log.append({
                "pickDate": d["pickDate"], "entryDate": entry_date,
                "code": code, "name": p["name"], "score": p["score"],
                "entry": round(entry, 2),
                "t2_open": round(t2_open, 2) if t2_open else None,
                "t2_close": round(t2_close, 2) if t2_close else None,
                "t3_open": round(t3_open, 2) if t3_open else None,
                "t3_close": round(t3_close, 2) if t3_close else None,
                "t5_close": round(t5_close, 2) if t5_close else None,
                "t10_close": round(t10_close, 2) if t10_close else None,
            })

    for k in rules:
        coverage[k] = sum(1 for r in rets_by_rule[k] if r is not None)

    print(f"\n總精選筆數（score≥{SCORE_MIN}）: {n_picks_total}")

    # 各規則完整樣本
    results = {k: {**stats(rets_by_rule[k]), "coverage": coverage[k]} for k in rules}

    # 同樣本：T+2_open + T+3_open + T+3_close 都有資料的子集（核心對比）
    n_picks = len(rets_by_rule["T+2_open"])
    core_idx = [
        i for i in range(n_picks)
        if rets_by_rule["T+2_open"][i] is not None
        and rets_by_rule["T+2_close"][i] is not None
        and rets_by_rule["T+3_open"][i] is not None
        and rets_by_rule["T+3_close"][i] is not None
    ]
    same_sample_core = {k: stats([rets_by_rule[k][i] for i in core_idx]) for k in rules}

    # 擴大同樣本：含 T+5
    s5_idx = [i for i in core_idx if rets_by_rule["T+5_close"][i] is not None]
    same_sample_t5 = {k: stats([rets_by_rule[k][i] for i in s5_idx]) for k in rules}

    # 擴大同樣本：含 T+10
    s10_idx = [i for i in s5_idx if rets_by_rule["T+10_close"][i] is not None]
    same_sample_t10 = {k: stats([rets_by_rule[k][i] for i in s10_idx]) for k in rules}

    # 用最大「T+2 一致」樣本（T+2_open + T+2_close 都有）— 與基線最公平的對比
    t2_idx = [
        i for i in range(n_picks)
        if rets_by_rule["T+2_open"][i] is not None
        and rets_by_rule["T+2_close"][i] is not None
    ]
    same_sample_t2 = {k: stats([rets_by_rule[k][i] for i in t2_idx]) for k in rules}

    output = {
        "baseline": "score>=75, T+1 open buy, T+2 open sell",
        "costPct": COST_PCT,
        "scoreMin": SCORE_MIN,
        "nPicksTotal": n_picks_total,
        "rules_fullSample": results,
        "sameSample_T2": {
            "n": len(t2_idx),
            "note": "Subset where T+2 open AND T+2 close both have data (vs baseline)",
            "stats": same_sample_t2,
        },
        "sameSample_core": {
            "n": len(core_idx),
            "note": "Subset where T+2 open/close AND T+3 open/close all have data",
            "stats": same_sample_core,
        },
        "sameSample_T5": {
            "n": len(s5_idx),
            "note": "Core subset that also has T+5 close",
            "stats": same_sample_t5,
        },
        "sameSample_T10": {
            "n": len(s10_idx),
            "note": "T+5 subset that also has T+10 close",
            "stats": same_sample_t10,
        },
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("\n=== 完整樣本（各自最大可用，coverage 不同） ===")
    print(f"{'規則':<14} {'n':>5} {'勝率':>6} {'平均':>8} {'中位':>8} {'總計':>8} {'sd':>6} {'MDD':>6}")
    print("-" * 72)
    for k, r in results.items():
        if r["n"] == 0:
            continue
        print(f"{k:<14} {r['n']:>5} {r['winRate']:>5}% {r['meanNet']:>+7.2f}% "
              f"{r['medianNet']:>+7.2f}% {r['totalNet']:>+7.1f}% "
              f"{r['sd']:>5.2f} {r['mdd']:>5.1f}%")

    print(f"\n=== 同樣本 T+2 (n={len(t2_idx)}) — 最公平的 T+2 內對比 ===")
    print(f"{'規則':<14} {'勝率':>6} {'平均':>8} {'中位':>8} {'總計':>8}")
    print("-" * 52)
    for k, r in same_sample_t2.items():
        if r.get("n", 0) == 0:
            continue
        print(f"{k:<14} {r['winRate']:>5}% {r['meanNet']:>+7.2f}% "
              f"{r['medianNet']:>+7.2f}% {r['totalNet']:>+7.1f}%")

    print(f"\n=== 同樣本 core (n={len(core_idx)}) — T+2/T+3 完整對比 ===")
    for k, r in same_sample_core.items():
        if r.get("n", 0) == 0:
            continue
        print(f"{k:<14} {r['winRate']:>5}% {r['meanNet']:>+7.2f}% "
              f"{r['medianNet']:>+7.2f}% {r['totalNet']:>+7.1f}%")

    print(f"\n=== 同樣本 T+5 (n={len(s5_idx)}) ===")
    for k, r in same_sample_t5.items():
        if r.get("n", 0) == 0:
            continue
        print(f"{k:<14} {r['winRate']:>5}% {r['meanNet']:>+7.2f}% total {r['totalNet']:>+6.1f}%")

    print(f"\n=== 同樣本 T+10 (n={len(s10_idx)}) ===")
    for k, r in same_sample_t10.items():
        if r.get("n", 0) == 0:
            continue
        print(f"{k:<14} {r['winRate']:>5}% {r['meanNet']:>+7.2f}% total {r['totalNet']:>+6.1f}%")

    print(f"\nsaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
