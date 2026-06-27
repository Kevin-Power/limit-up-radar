"""維度：族群／類股 (category/group) 績效分析。

策略基線：score≥75，T+1 開盤競價買進，T+2 開盤賣出
成本：2.8 折 = 0.1425% × 0.28 = 0.0399% 單邊 × 2 + 賣出證交稅 0.3% = 0.3798% 來回
資料：data/daily/*.json (有 groups[].name 為族群名稱)，intraday_cache 取 1 分 K

任務：
  1. 各族群勝率、平均 EV、總損益、樣本數
  2. 同日多檔同族群是否互相加成
  3. 族群動能濾網（近 N 日族群平均 EV 強度）
  4. 多族群歸屬的處理：一檔股票會被歸入它出現的所有族群（=> 同一筆交易可能計入多族群）
"""
import json
import math
import os
import sys
from collections import defaultdict
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs

# ── 基線設定 ────────────────────────────────────────────────────
SCORE_MIN = 75
COST_ROUND_TRIP_PCT = 0.0399 * 2 + 0.30   # 2.8 折來回 = 0.3798%
COST = round(COST_ROUND_TRIP_PCT, 4)
POSITION_TWD = 1_000_000   # 假設每筆 100 萬 (與 +186 萬基線一致)

CACHE_DIR = os.path.join("data", "intraday_cache")
OUT_FILE = "data/opt_categories.json"


def load_bars(code, date):
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as fp:
            d = json.load(fp)
        return d if d else None
    except Exception:
        return None


def first_open(bars):
    """取最早 bar 的 open 作為開盤競價成交價。"""
    if not bars:
        return None
    return bars[0]["open"]


def build_pick_categories(days):
    """{(pickDate, code): [group_name, ...]} — 同檔可屬多族群。"""
    out = {}
    for d in days:
        date = d["date"]
        for g in d["groups"]:
            for s in g["stocks"]:
                key = (date, s["code"])
                out.setdefault(key, []).append(g["name"])
    return out


def collect_trades(days, rev_maps, hw, disp, pick_cats):
    """產生交易明細，每筆含 categories（list）。

    交易模型：pickDate i 收盤後選股 → T+1=entry, T+2=exit。
    """
    trades = []
    for i in range(len(days) - 2):
        pick_date = days[i]["date"]
        entry_date = days[i + 1]["date"]
        exit_date = days[i + 2]["date"]

        picks = hs.reconstruct_picks(days, i, rev_maps, hw, disp, cap=None)
        picks = [p for p in picks if p["score"] >= SCORE_MIN]
        if not picks:
            continue

        for p in picks:
            entry_bars = load_bars(p["code"], entry_date)
            exit_bars = load_bars(p["code"], exit_date)
            if not entry_bars or not exit_bars:
                continue
            entry = first_open(entry_bars)
            exit_p = first_open(exit_bars)
            if not entry or not exit_p:
                continue
            gross = (exit_p - entry) / entry * 100
            net = gross - COST
            cats = pick_cats.get((pick_date, p["code"]), [])
            trades.append({
                "pickDate": pick_date,
                "entryDate": entry_date,
                "exitDate": exit_date,
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "entry": round(entry, 3),
                "exit": round(exit_p, 3),
                "gross": round(gross, 4),
                "net": round(net, 4),
                "categories": cats,
            })
    return trades


def stat_block(rets):
    n = len(rets)
    if n == 0:
        return {"n": 0}
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "evPct": round(sum(rets) / n, 3),
        "median": round(median(rets), 3),
        "totalPct": round(sum(rets), 2),
        "totalTWD": round(sum(rets) / 100 * POSITION_TWD, 0),
        "maxWin": round(max(rets), 2),
        "maxLoss": round(min(rets), 2),
    }


def per_category_stats(trades):
    """以族群為 key 統計（同一筆交易可貢獻到多個族群）。"""
    bucket = defaultdict(list)
    for t in trades:
        for c in t["categories"]:
            bucket[c].append(t["net"])
    out = []
    for cat, rets in bucket.items():
        s = stat_block(rets)
        s["category"] = cat
        out.append(s)
    # 排序：先按 n>=10 切，n大優先 EV 高
    out.sort(key=lambda x: (-x["evPct"], -x["n"]))
    return out


def cluster_effect(trades):
    """同日同族群多檔的擁擠度 vs 報酬。

    模型：對每筆交易，找它所屬「最大族群」的當日同族群檔數（cluster_size），
    分桶後算各桶 EV，找出擁擠到反指標的門檻。
    """
    cluster_size = defaultdict(int)
    for t in trades:
        for c in t["categories"]:
            cluster_size[(t["pickDate"], c)] += 1
    per_trade_size = []
    for t in trades:
        sizes = [cluster_size[(t["pickDate"], c)] for c in t["categories"]]
        per_trade_size.append((max(sizes) if sizes else 1, t["net"]))

    # 桶分
    buckets = [("solo(1)", lambda s: s == 1),
               ("pair(2)", lambda s: s == 2),
               ("small(3-4)", lambda s: 3 <= s <= 4),
               ("mid(5-7)", lambda s: 5 <= s <= 7),
               ("large(8+)", lambda s: s >= 8)]
    by_bucket = defaultdict(list)
    for sz, net in per_trade_size:
        for k, fn in buckets:
            if fn(sz):
                by_bucket[k].append(net)
                break

    # 簡單規則：cluster<=7 才買
    keep_le7 = [net for sz, net in per_trade_size if sz <= 7]
    keep_le4 = [net for sz, net in per_trade_size if sz <= 4]
    return {
        "byBucket": {k: stat_block(v) for k, v in by_bucket.items()},
        "ruleClusterLE7": stat_block(keep_le7),
        "ruleClusterLE4": stat_block(keep_le4),
    }


def monthly_category(trades):
    """月度 × 族群表現，看輪動。"""
    bucket = defaultdict(lambda: defaultdict(list))   # cat -> month -> rets
    for t in trades:
        month = t["pickDate"][:7]
        for c in t["categories"]:
            bucket[c][month].append(t["net"])
    out = {}
    for cat, mmap in bucket.items():
        out[cat] = {m: stat_block(rs) for m, rs in mmap.items()}
    return out


def momentum_filter(trades, lookback_days=5, min_ev=0.0):
    """族群近 N 個交易日的滾動平均 EV ≥ min_ev 才買。

    步驟：
      1. 計算每個族群每個 entryDate 的當日 EV（該族群在該日的所有交易淨報酬均值）
      2. 對每筆交易，回看 entryDate 之前 N 個交易日該族群 EV 均值
      3. 若 ≥ min_ev 則保留
    一檔屬多族群 → 用「至少一個族群通過」邏輯（OR）
    """
    # 先建立日期-族群 EV 對照
    daily_cat_rets = defaultdict(lambda: defaultdict(list))
    all_dates = sorted({t["entryDate"] for t in trades})
    for t in trades:
        for c in t["categories"]:
            daily_cat_rets[c][t["entryDate"]].append(t["net"])
    daily_cat_ev = {c: {d: mean(rs) for d, rs in dmap.items()}
                    for c, dmap in daily_cat_rets.items()}

    def cat_momentum(cat, entry_date):
        """回看 entry_date 之前 lookback_days 個有交易日的均值。"""
        dates_with_data = [d for d in daily_cat_ev.get(cat, {})
                           if d < entry_date]
        dates_with_data.sort()
        recent = dates_with_data[-lookback_days:]
        if not recent:
            return None
        return mean(daily_cat_ev[cat][d] for d in recent)

    kept, dropped = [], []
    for t in trades:
        moms = [cat_momentum(c, t["entryDate"]) for c in t["categories"]]
        moms = [m for m in moms if m is not None]
        if not moms:
            # 沒歷史資料 → 觀望(drop)，避免冷啟動誤判
            dropped.append(t["net"])
            continue
        # OR：任一族群動能 ≥ 門檻 → 進場
        if max(moms) >= min_ev:
            kept.append(t["net"])
        else:
            dropped.append(t["net"])
    return {
        "lookback": lookback_days,
        "minEV": min_ev,
        "kept": stat_block(kept),
        "dropped": stat_block(dropped),
    }


def grid_search_filter(trades):
    """搜尋 (lookback, min_ev) 網格找最佳。"""
    results = []
    for lb in [3, 5, 7, 10]:
        for mev in [-1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0]:
            r = momentum_filter(trades, lb, mev)
            r["lookbackDays"] = lb
            r["minEVThreshold"] = mev
            results.append(r)
    # 排序：保留 net total 最大 (且 kept.n >= 30 為優先)
    results.sort(key=lambda x: -((x["kept"]["totalPct"] if x["kept"]["n"] >= 30 else -999)))
    return results


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    pick_cats = build_pick_categories(days)

    print(f"Loaded {len(days)} daily files; window {days[0]['date']} ~ {days[-1]['date']}")
    trades = collect_trades(days, rev_maps, hw, disp, pick_cats)
    print(f"Collected {len(trades)} trades (score>={SCORE_MIN}, T+1 open->T+2 open)")

    base_rets = [t["net"] for t in trades]
    baseline = stat_block(base_rets)
    print(f"\n=== BASELINE ===")
    print(f"  n={baseline['n']} win={baseline['winRate']}% EV={baseline['evPct']}% total={baseline['totalPct']}% (TWD {baseline['totalTWD']:,.0f})")

    # 1. 族群表現排行（降低 n 門檻到 5，因 score>=75 樣本集中）
    cat_stats = per_category_stats(trades)
    print(f"\n=== ALL CATEGORIES (n>=5) ===")
    sig = [c for c in cat_stats if c["n"] >= 5]
    for c in sorted(sig, key=lambda x: -x["evPct"]):
        print(f"  {c['category']:25s} n={c['n']:3d} win={c['winRate']:5.1f}% EV={c['evPct']:+6.2f}% total={c['totalPct']:+7.2f}%")
    print(f"\n=== ALL CATEGORIES (n>=10) ===")
    sig10 = [c for c in cat_stats if c["n"] >= 10]
    for c in sorted(sig10, key=lambda x: -x["evPct"]):
        print(f"  {c['category']:25s} n={c['n']:3d} win={c['winRate']:5.1f}% EV={c['evPct']:+6.2f}% total={c['totalPct']:+7.2f}%")

    # 2. 同日同族群多檔（擁擠度）
    cluster = cluster_effect(trades)
    print(f"\n=== CLUSTER EFFECT (same day same category multiplicity) ===")
    for k in ["solo(1)", "pair(2)", "small(3-4)", "mid(5-7)", "large(8+)"]:
        s = cluster["byBucket"].get(k, {"n": 0})
        if s.get("n", 0) > 0:
            print(f"  {k:12s} n={s['n']:3d} win={s['winRate']:5.1f}% EV={s['evPct']:+6.2f}% total={s['totalPct']:+7.2f}%")
    print(f"  RULE cluster<=7: n={cluster['ruleClusterLE7']['n']} EV={cluster['ruleClusterLE7']['evPct']}% total={cluster['ruleClusterLE7']['totalPct']}%")
    print(f"  RULE cluster<=4: n={cluster['ruleClusterLE4']['n']} EV={cluster['ruleClusterLE4']['evPct']}% total={cluster['ruleClusterLE4']['totalPct']}%")

    # 2b. 月度×族群輪動
    mc = monthly_category(trades)
    print(f"\n=== MONTHLY ROTATION (cat: 04 / 05 / 06) ===")
    for cat in sorted(mc.keys(), key=lambda c: -sum(mc[c][m]["n"] for m in mc[c])):
        line = f"  {cat:25s}"
        for m in ["2026-04", "2026-05", "2026-06"]:
            s = mc[cat].get(m, {"n": 0})
            if s.get("n", 0) > 0:
                line += f"  {m[-2:]}: n={s['n']:2d} EV={s['evPct']:+6.2f}%"
            else:
                line += f"  {m[-2:]}: -"
        total_n = sum(mc[cat][m]["n"] for m in mc[cat])
        if total_n >= 5:
            print(line)

    # 3. 動能濾網網格
    grid = grid_search_filter(trades)
    print(f"\n=== TOP 5 MOMENTUM FILTERS ===")
    for r in grid[:5]:
        k, d = r["kept"], r["dropped"]
        print(f"  lb={r['lookbackDays']} thr={r['minEVThreshold']:+.1f}% "
              f"kept n={k['n']:3d} win={k['winRate']:5.1f}% EV={k['evPct']:+6.2f}% total={k['totalPct']:+7.2f}% "
              f"| dropped n={d['n']:3d} EV={d['evPct']:+6.2f}%")

    # 4. 黑名單規則（排除 bottom N 個族群）
    bad_cats = [c["category"] for c in sorted(sig, key=lambda x: x["evPct"])[:5]]
    blacklist_kept = []
    blacklist_dropped = []
    for t in trades:
        if any(c in bad_cats for c in t["categories"]):
            blacklist_dropped.append(t["net"])
        else:
            blacklist_kept.append(t["net"])
    blacklist = {
        "blacklist": bad_cats,
        "kept": stat_block(blacklist_kept),
        "dropped": stat_block(blacklist_dropped),
    }
    print(f"\n=== BLACKLIST (drop bottom 5) ===")
    print(f"  blacklist: {bad_cats}")
    print(f"  kept: n={blacklist['kept']['n']} win={blacklist['kept']['winRate']}% EV={blacklist['kept']['evPct']}% total={blacklist['kept']['totalPct']}%")
    print(f"  dropped: n={blacklist['dropped']['n']} EV={blacklist['dropped']['evPct']}%")

    # 5. 白名單（只買 top N）
    good_cats = [c["category"] for c in sorted(sig, key=lambda x: -x["evPct"])[:5]]
    wl_kept, wl_dropped = [], []
    for t in trades:
        if any(c in good_cats for c in t["categories"]):
            wl_kept.append(t["net"])
        else:
            wl_dropped.append(t["net"])
    whitelist = {
        "whitelist": good_cats,
        "kept": stat_block(wl_kept),
        "dropped": stat_block(wl_dropped),
    }
    print(f"\n=== WHITELIST (only top 5) ===")
    print(f"  whitelist: {good_cats}")
    print(f"  kept: n={whitelist['kept']['n']} win={whitelist['kept']['winRate']}% EV={whitelist['kept']['evPct']}% total={whitelist['kept']['totalPct']}%")
    print(f"  dropped: n={whitelist['dropped']['n']} EV={whitelist['dropped']['evPct']}%")

    # 6. 組合規則：cluster<=7 + 動能濾網
    cluster_size_map = defaultdict(int)
    for t in trades:
        for c in t["categories"]:
            cluster_size_map[(t["pickDate"], c)] += 1
    combo_kept = []
    for t in trades:
        sizes = [cluster_size_map[(t["pickDate"], c)] for c in t["categories"]]
        if not sizes or max(sizes) > 7:
            continue
        combo_kept.append(t["net"])
    combo = {"rule": "cluster<=7 only", "kept": stat_block(combo_kept)}
    print(f"\n=== COMBO RULE (cluster<=7) ===")
    print(f"  n={combo['kept']['n']} win={combo['kept']['winRate']}% EV={combo['kept']['evPct']}% total={combo['kept']['totalPct']}% TWD {combo['kept']['totalTWD']:,.0f}")

    output = {
        "dimension": "category/group",
        "method": (
            f"基線：score>={SCORE_MIN}, T+1 open buy, T+2 open sell, 2.8 折成本(round-trip={COST}%). "
            "一檔股票若屬多族群 → 計入每個族群統計（重複計算，避免片面歸屬偏誤）。"
            "但「篩選規則」上，使用 OR 邏輯（任一族群通過即進場），避免雙重剔除偏誤。"
        ),
        "costPctRoundTrip": COST,
        "window": {"from": days[0]["date"], "to": days[-1]["date"], "tradingDays": len(days)},
        "baseline": baseline,
        "categories": cat_stats,
        "clusterEffect": cluster,
        "momentumGrid": grid,
        "blacklistTopWorst5": blacklist,
        "whitelistTopBest5": whitelist,
        "comboClusterLE7": combo,
        "monthlyByCategory": monthly_category(trades),
    }
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)
    print(f"\nSaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
