"""實戰可執行性驗證：POSITIVE TILT 規則
規則：「個股亮點 OR 光通訊/矽光子」+ cluster<=7 加碼
聲稱：勝率 67.3%、EV 3.39%

驗證面向：
  1. 進場前可計算嗎？（分類在 T 日收盤後完成、T+1 開盤前已知）
  2. 流動性夠不夠？（T+1 開盤量、平均流動性）
  3. T+1 是否漲停 → 無法買進
  4. 同日觸發檔數分佈（資金/精力夠應對嗎）
  5. 「光通訊」n=9 是否集中在少數幾天 → sample-size 風險
  6. 不同月份穩定性
"""
import json
import os
import sys
from collections import defaultdict, Counter
from statistics import mean, median

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs

SCORE_MIN = 75
COST_ROUND_TRIP_PCT = 0.3798
POSITION_TWD = 1_000_000

CACHE_DIR = os.path.join("data", "intraday_cache")
DAILY_DIR = "data/daily"
OUT_FILE = "data/opt_positive_tilt_exec.json"

TARGET_CATS = {"個股亮點", "光通訊 / 矽光子"}


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
    return bars[0]["open"] if bars else None


def build_pick_categories(days):
    out = {}
    for d in days:
        date = d["date"]
        for g in d["groups"]:
            for s in g["stocks"]:
                key = (date, s["code"])
                out.setdefault(key, []).append(g["name"])
    return out


def build_pick_meta(days):
    """{(date, code): {close, volume, market}} —T 日收盤資訊。"""
    out = {}
    for d in days:
        date = d["date"]
        for g in d["groups"]:
            for s in g["stocks"]:
                key = (date, s["code"])
                if key not in out:
                    out[key] = {
                        "close": s.get("close"),
                        "volume": s.get("volume"),  # T 日（漲停日）成交量(股)
                        "market": s.get("market"),
                        "industry": s.get("industry"),
                    }
    return out


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
        "maxWin": round(max(rets), 2),
        "maxLoss": round(min(rets), 2),
    }


def collect_trades_full(days, rev_maps, hw, disp, pick_cats, pick_meta):
    trades = []
    skipped = {"no_bars_entry": 0, "no_bars_exit": 0, "limit_up_entry": 0,
               "no_open_price": 0}
    for i in range(len(days) - 2):
        pick_date = days[i]["date"]
        entry_date = days[i + 1]["date"]
        exit_date = days[i + 2]["date"]

        picks = hs.reconstruct_picks(days, i, rev_maps, hw, disp, cap=None)
        picks = [p for p in picks if p["score"] >= SCORE_MIN]
        if not picks:
            continue

        for p in picks:
            code = p["code"]
            entry_bars = load_bars(code, entry_date)
            if not entry_bars:
                skipped["no_bars_entry"] += 1
                continue
            exit_bars = load_bars(code, exit_date)
            if not exit_bars:
                skipped["no_bars_exit"] += 1
                continue
            entry = first_open(entry_bars)
            exit_p = first_open(exit_bars)
            if not entry or not exit_p:
                skipped["no_open_price"] += 1
                continue

            # T+1 開盤是否漲停 → 無法買進
            t0_close = pick_meta.get((pick_date, code), {}).get("close")
            limit_up_entry = False
            if t0_close:
                # 台股漲停 = 前日收盤 × 1.10（含 ±0.01 容差）
                limit_price = round(t0_close * 1.10, 2)
                # 用第一根 K 線最低判斷：若 low >= limit_price - 容差，視為漲停鎖死
                first_bar = entry_bars[0]
                # 較嚴謹：開盤即漲停 = entry == limit_price 且 first_bar low == limit_price
                if entry >= limit_price - 0.05 and first_bar["low"] >= limit_price - 0.05:
                    limit_up_entry = True

            # 流動性 — T+1 開盤第一根成交量（min bar 無成交量 → 用次 3 根累計推估）
            # 因 intraday cache 沒帶 volume，這邊改用 T 日收盤成交量（pick_meta.volume）
            t_volume_shares = pick_meta.get((pick_date, code), {}).get("volume") or 0
            t_dollar_vol = t_volume_shares * (t0_close or 0)  # T 日成交值(元)

            gross = (exit_p - entry) / entry * 100
            net = gross - COST_ROUND_TRIP_PCT
            cats = pick_cats.get((pick_date, code), [])
            trades.append({
                "pickDate": pick_date,
                "entryDate": entry_date,
                "exitDate": exit_date,
                "code": code,
                "name": p["name"],
                "score": p["score"],
                "entry": round(entry, 3),
                "exit": round(exit_p, 3),
                "gross": round(gross, 4),
                "net": round(net, 4),
                "categories": cats,
                "limitUpAtEntry": limit_up_entry,
                "tDayDollarVol": round(t_dollar_vol, 0),
                "tDayVolumeShares": t_volume_shares,
                "tDayClose": t0_close,
            })
            if limit_up_entry:
                skipped["limit_up_entry"] += 1
    return trades, skipped


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
    pick_meta = build_pick_meta(days)

    print(f"Loaded {len(days)} daily files; window {days[0]['date']} ~ {days[-1]['date']}")
    trades, skipped = collect_trades_full(days, rev_maps, hw, disp, pick_cats, pick_meta)
    print(f"Collected {len(trades)} trades (score>={SCORE_MIN})")
    print(f"  skipped: {skipped}")

    # 篩 POSITIVE TILT 標的
    tilt_trades = [t for t in trades if any(c in TARGET_CATS for c in t["categories"])]
    print(f"\n=== TILT TRADES (個股亮點 OR 光通訊/矽光子) ===")
    print(f"  n={len(tilt_trades)}")

    # 1. 兩個 category 各別細節
    cat_breakdown = {}
    for cat in TARGET_CATS:
        sub = [t for t in trades if cat in t["categories"]]
        rets = [t["net"] for t in sub]
        cat_breakdown[cat] = {
            "stats": stat_block(rets),
            "uniqueDays": len(set(t["pickDate"] for t in sub)),
            "uniqueStocks": len(set(t["code"] for t in sub)),
            "topStocksByFreq": Counter(t["name"] for t in sub).most_common(5),
            "byMonth": {},
        }
        for m in sorted({t["pickDate"][:7] for t in sub}):
            mrets = [t["net"] for t in sub if t["pickDate"].startswith(m)]
            cat_breakdown[cat]["byMonth"][m] = stat_block(mrets)

    print(f"\n=== PER-CATEGORY DETAIL ===")
    for cat, info in cat_breakdown.items():
        s = info["stats"]
        print(f"\n  [{cat}]  n={s['n']} win={s.get('winRate')}% EV={s.get('evPct')}%")
        print(f"    uniqueDays={info['uniqueDays']} uniqueStocks={info['uniqueStocks']}")
        print(f"    topStocks: {info['topStocksByFreq']}")
        for m, ms in info["byMonth"].items():
            print(f"    {m}: n={ms['n']} win={ms.get('winRate')}% EV={ms.get('evPct')}%")

    # 2. cluster<=7 條件下的 tilt 效果
    cluster_size_map = defaultdict(int)
    for t in trades:
        for c in t["categories"]:
            cluster_size_map[(t["pickDate"], c)] += 1
    tilt_le7 = []
    tilt_gt7 = []
    for t in tilt_trades:
        sizes = [cluster_size_map[(t["pickDate"], c)] for c in t["categories"]]
        max_size = max(sizes) if sizes else 1
        if max_size <= 7:
            tilt_le7.append(t["net"])
        else:
            tilt_gt7.append(t["net"])
    print(f"\n=== TILT × cluster filter ===")
    print(f"  cluster<=7: {stat_block(tilt_le7)}")
    print(f"  cluster>7:  {stat_block(tilt_gt7)}")

    # 3. 漲停鎖死 → 無法執行
    tilt_exec_le7 = [t for t in tilt_trades
                     if not t["limitUpAtEntry"]
                     and max([cluster_size_map[(t["pickDate"], c)]
                              for c in t["categories"]] or [1]) <= 7]
    tilt_exec_le7_rets = [t["net"] for t in tilt_exec_le7]
    tilt_blocked_le7 = [t for t in tilt_trades
                        if t["limitUpAtEntry"]
                        and max([cluster_size_map[(t["pickDate"], c)]
                                 for c in t["categories"]] or [1]) <= 7]
    print(f"\n=== 漲停鎖死過濾 (僅 cluster<=7) ===")
    print(f"  可執行: {stat_block(tilt_exec_le7_rets)}")
    print(f"  被鎖死 n={len(tilt_blocked_le7)} (但 hypothetical EV={mean([t['net'] for t in tilt_blocked_le7]) if tilt_blocked_le7 else 0:.3f}%)")

    # 4. 同日觸發檔數分佈
    by_day = defaultdict(list)
    for t in tilt_exec_le7:
        by_day[t["pickDate"]].append(t)
    triggers_per_day = [len(v) for v in by_day.values()]
    print(f"\n=== 同日觸發檔數分佈 (cluster<=7 可執行) ===")
    print(f"  總日數: {len(triggers_per_day)}")
    print(f"  平均/中位: {mean(triggers_per_day):.2f} / {median(triggers_per_day):.1f}")
    print(f"  最大同日觸發: {max(triggers_per_day)}")
    trig_counter = Counter(triggers_per_day)
    for k in sorted(trig_counter):
        print(f"    {k} 檔: {trig_counter[k]} 天")

    # 5. 流動性分佈（T 日漲停日的成交值）
    dollar_vols = [t["tDayDollarVol"] for t in tilt_exec_le7 if t["tDayDollarVol"] > 0]
    if dollar_vols:
        dollar_vols.sort()
        print(f"\n=== 流動性（T 日漲停日成交值,元） ===")
        print(f"  min: {min(dollar_vols):,.0f}")
        print(f"  p10: {dollar_vols[len(dollar_vols)//10]:,.0f}")
        print(f"  p25: {dollar_vols[len(dollar_vols)//4]:,.0f}")
        print(f"  median: {dollar_vols[len(dollar_vols)//2]:,.0f}")
        print(f"  p75: {dollar_vols[3*len(dollar_vols)//4]:,.0f}")
        print(f"  max: {max(dollar_vols):,.0f}")
        # 100 萬部位 vs T 日成交值 → 衝擊比
        # 假設 T+1 開盤量 = T 日的 10%（保守估）
        very_thin = sum(1 for v in dollar_vols if v < 10_000_000)  # < 1000 萬成交值
        thin = sum(1 for v in dollar_vols if v < 50_000_000)
        print(f"  < 1000 萬成交值: {very_thin} 筆 ({very_thin/len(dollar_vols)*100:.1f}%)")
        print(f"  < 5000 萬成交值: {thin} 筆 ({thin/len(dollar_vols)*100:.1f}%)")

    # 6. 6 月專屬檢驗（因已知 6 月策略失效）
    june_tilt = [t for t in tilt_exec_le7 if t["pickDate"].startswith("2026-06")]
    print(f"\n=== 6 月 tilt 表現（已知 6 月策略失效） ===")
    print(f"  {stat_block([t['net'] for t in june_tilt])}")

    # 7. 「個股亮點」其實是 fallback bucket — 看名稱長相
    others_trades = [t for t in trades if "個股亮點" in t["categories"]]
    print(f"\n=== 「個股亮點」實際成員樣本（前 30） ===")
    seen = set()
    for t in others_trades:
        if t["code"] not in seen:
            print(f"  {t['code']} {t['name']:10s} net={t['net']:+6.2f}% score={t['score']}")
            seen.add(t["code"])
            if len(seen) >= 30:
                break

    output = {
        "rule": "POSITIVE TILT: '個股亮點' or '光通訊 / 矽光子' + cluster<=7",
        "claimedEffect": {"winRate": 67.3, "evPct": 3.39},
        "window": {"from": days[0]["date"], "to": days[-1]["date"], "tradingDays": len(days)},
        "tiltTotal": stat_block([t["net"] for t in tilt_trades]),
        "tiltClusterLE7": stat_block(tilt_le7),
        "tiltExecutableLE7": stat_block(tilt_exec_le7_rets),
        "catBreakdown": cat_breakdown,
        "triggersPerDay": {
            "totalDays": len(triggers_per_day),
            "mean": round(mean(triggers_per_day), 2) if triggers_per_day else 0,
            "median": median(triggers_per_day) if triggers_per_day else 0,
            "max": max(triggers_per_day) if triggers_per_day else 0,
            "distribution": dict(trig_counter),
        },
        "liquidity": {
            "min": min(dollar_vols) if dollar_vols else 0,
            "p25": dollar_vols[len(dollar_vols)//4] if dollar_vols else 0,
            "median": dollar_vols[len(dollar_vols)//2] if dollar_vols else 0,
            "p75": dollar_vols[3*len(dollar_vols)//4] if dollar_vols else 0,
            "thinUnder10M": sum(1 for v in dollar_vols if v < 10_000_000),
            "thinUnder50M": sum(1 for v in dollar_vols if v < 50_000_000),
            "n": len(dollar_vols),
        },
        "juneStress": stat_block([t["net"] for t in june_tilt]),
        "limitUpBlocked": len(tilt_blocked_le7),
        "execRate": round(len(tilt_exec_le7) / (len(tilt_le7) + len(tilt_gt7) - len(tilt_gt7)) * 100, 1) if tilt_le7 else 0,
    }
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2, default=str)
    print(f"\nSaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
