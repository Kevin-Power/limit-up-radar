"""驗證「T+5 收盤出場」在實戰中是否可執行。

實戰視角檢查項目：
1. 資料時序：T+1 開盤前需要的資訊是否都備齊？
2. 流動性：T+1 開盤競價能買到多少？T+5 收盤能賣出嗎？
3. 漲跌停限制：T+1 是否有股票直接漲停鎖死買不到？T+5 是否跌停鎖死賣不掉？
4. Look-ahead bias：T+5 規則本身是否需要未來資料？
5. 同時觸發負擔：T+1 開盤同時要買幾檔？
6. 持倉重疊：若每天都進場，T+5 出場期間身上同時掛幾檔？
7. 結果穩定性：T+5 EV +2.83% 是否被少數極端值帶上？
"""
import json
import os
import statistics
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from run_backtest_0903 import build_pick_days

CACHE_DIR = os.path.join("data", "intraday_cache")
DAILY_DIR = os.path.join("data", "daily")
PRICE_CACHE_FILE = "data/_price_month_cache.json"
OUT_FILE = "data/opt_t5_executability.json"
SCORE_MIN = 75
COST_PCT = 0.0399 * 2 + 0.30

_PRICE_CACHE = None


def load_price_cache():
    global _PRICE_CACHE
    if _PRICE_CACHE is None:
        with open(PRICE_CACHE_FILE, encoding="utf-8") as f:
            _PRICE_CACHE = json.load(f)
    return _PRICE_CACHE


def get_month_price(code, date, side):
    """先查 _price_month_cache.json，回 {open|close} 或 None。"""
    cache = load_price_cache()
    yyyymm = date[:7].replace("-", "")
    key = f"{code}|{yyyymm}"
    m = cache.get(key)
    if not m or date not in m:
        return None
    return m[date].get(side)


def load_bars(code, date):
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def build_daily_close_map():
    """build (code, date) -> {close, volume_wan, prev_close}."""
    m = {}
    for f in sorted(os.listdir(DAILY_DIR)):
        if not f.endswith(".json"):
            continue
        date = f[:-5]
        with open(os.path.join(DAILY_DIR, f), encoding="utf-8") as fp:
            d = json.load(fp)
        for g in d.get("groups", []):
            for s in g.get("stocks", []):
                m[(s["code"], date)] = {
                    "close": s.get("close"),
                    "volumeWan": s.get("volumeWan") or s.get("volume_wan") or 0,
                }
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


def opening_auction_size(bars):
    """第 1 分 K 的成交量（張）。1 分 K 提供 volume 嗎？檢查。"""
    if not bars:
        return None
    first = bars[0]
    return first.get("volume")  # 可能為 None


def is_limit_up(prev_close, today_open):
    """T+1 開盤是否漲停價（無法買到）？台股漲幅 10%。"""
    if prev_close is None or today_open is None or prev_close <= 0:
        return False
    pct = (today_open - prev_close) / prev_close * 100
    return pct >= 9.9


def is_limit_down(prev_close, today_close):
    """T+5 收盤是否跌停（賣不掉）？"""
    if prev_close is None or today_close is None or prev_close <= 0:
        return False
    pct = (today_close - prev_close) / prev_close * 100
    return pct <= -9.9


def net_ret(entry, exit_price):
    if entry is None or exit_price is None or entry <= 0:
        return None
    gross = (exit_price - entry) / entry * 100
    return gross - COST_PCT


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
    daily_map = build_daily_close_map()

    findings = {
        "totalPicks": 0,
        "barsCoverage": {"hasBars": 0, "noBars": 0},
        "openingAuctionLimitUp": 0,   # T+1 開盤即漲停（無法成交）
        "t5LimitDown": 0,             # T+5 收盤跌停
        "openingVolumeStats": [],     # 第 1 分 K 成交量分布（張）
        "byEntryDate": defaultdict(int),  # 每日同時觸發幾檔
        "concurrentHoldings": [],     # 任一時點同時持倉股數
        "tradeReturns": [],           # T+5 各筆 net%
        "extremeWinners": [],         # 報酬 > +30% 的筆數
        "extremeLosers": [],          # 報酬 < -15% 的筆數
        "gapdownAtT1Open": 0,         # T+1 開盤就跌破前日收
        "missingT5Data": 0,
        "examples": [],
    }

    # 建構持倉時間軸（每個進場日同時持有的數量）
    # 簡化：T+1 開盤進場、T+5 收盤出場 → 5 個交易日內持倉
    holding_calendar = defaultdict(int)  # date -> 持倉檔數

    for d in pick_days:
        entry_date = d["entryDate"]
        picks_today = 0
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            findings["totalPicks"] += 1
            picks_today += 1
            code = p["code"]
            prev_close = p["prevClose"]  # T+0 (pickDate) 收盤 = T+1 前日收

            bars = load_bars(code, entry_date)
            t1_open = None
            if bars:
                findings["barsCoverage"]["hasBars"] += 1
                t1_open = bars[0]["open"]
                opening_vol = bars[0].get("volume")
                if opening_vol is not None:
                    findings["openingVolumeStats"].append(opening_vol)
            else:
                findings["barsCoverage"]["noBars"] += 1
                t1_open = get_month_price(code, entry_date, "open")
                if t1_open is None:
                    continue  # 連 T+1 開盤都不知道，跳過

            # 1. 開盤即漲停？
            if is_limit_up(prev_close, t1_open):
                findings["openingAuctionLimitUp"] += 1
                findings["examples"].append({
                    "type": "limit_up_at_open",
                    "code": code, "date": entry_date,
                    "prevClose": prev_close, "open": t1_open,
                    "openingVolume": opening_vol,
                })

            # 2. T+1 開盤跌破前日收 (gap-down)
            if t1_open < prev_close * 0.99:
                findings["gapdownAtT1Open"] += 1

            # 3. T+5 收盤（offset = 4，因 entry 在 T+1，T+5 = entry+4）
            t5_date = get_trading_dates(daily_dates, entry_date, 4)
            if not t5_date:
                findings["missingT5Data"] += 1
                continue

            # 取 T+5 收盤：bars → 月線快取 → daily_map
            t5_bars = load_bars(code, t5_date)
            t5_close = None
            t5_prev_close = None  # T+4 收
            if t5_bars:
                t5_close = t5_bars[-1]["close"]
            if t5_close is None:
                t5_close = get_month_price(code, t5_date, "close")
            if t5_close is None and (code, t5_date) in daily_map:
                t5_close = daily_map[(code, t5_date)]["close"]
            if t5_close is None:
                findings["missingT5Data"] += 1
                continue

            t4_date = get_trading_dates(daily_dates, entry_date, 3)
            if t4_date:
                t4_bars = load_bars(code, t4_date)
                if t4_bars:
                    t5_prev_close = t4_bars[-1]["close"]
                if t5_prev_close is None:
                    t5_prev_close = get_month_price(code, t4_date, "close")

            # 4. T+5 收盤跌停？
            if t5_prev_close and is_limit_down(t5_prev_close, t5_close):
                findings["t5LimitDown"] += 1

            ret = net_ret(t1_open, t5_close)
            if ret is not None:
                findings["tradeReturns"].append(ret)
                if ret > 30:
                    findings["extremeWinners"].append({"code": code, "ret": round(ret, 2),
                                                       "entryDate": entry_date})
                if ret < -15:
                    findings["extremeLosers"].append({"code": code, "ret": round(ret, 2),
                                                      "entryDate": entry_date})

            # 5. 持倉日曆 (T+1 開盤進場、T+5 收盤出場 → 持有 T+1 ~ T+5 共 5 天)
            for off in range(0, 5):
                hd = get_trading_dates(daily_dates, entry_date, off)
                if hd:
                    holding_calendar[hd] += 1

        if picks_today > 0:
            findings["byEntryDate"][entry_date] = picks_today

    # 統計
    ret_list = findings["tradeReturns"]
    n_trades = len(ret_list)
    if n_trades > 0:
        ret_sorted = sorted(ret_list, reverse=True)
        top5pct_n = max(1, n_trades // 20)
        top5pct_sum = sum(ret_sorted[:top5pct_n])
        total = sum(ret_list)
        findings["returnsAnalysis"] = {
            "n": n_trades,
            "mean": round(statistics.mean(ret_list), 3),
            "median": round(statistics.median(ret_list), 3),
            "winRate": round(sum(1 for r in ret_list if r > 0) / n_trades * 100, 1),
            "stdev": round(statistics.stdev(ret_list), 3) if n_trades > 1 else 0,
            "maxWin": round(max(ret_list), 2),
            "maxLoss": round(min(ret_list), 2),
            "totalNet": round(total, 2),
            "top5pctContribution": round(top5pct_sum / total * 100, 1) if total else None,
            "top5pctN": top5pct_n,
            "top5pctSum": round(top5pct_sum, 2),
            # 排除 top5% 後的 EV
            "evWithoutTop5pct": round(statistics.mean(ret_sorted[top5pct_n:]), 3),
        }

    # 開盤成交量分布
    if findings["openingVolumeStats"]:
        vols = sorted(findings["openingVolumeStats"])
        findings["openingVolumeAnalysis"] = {
            "n": len(vols),
            "min": vols[0],
            "p10": vols[len(vols) // 10],
            "p25": vols[len(vols) // 4],
            "median": vols[len(vols) // 2],
            "p75": vols[3 * len(vols) // 4],
            "p90": vols[9 * len(vols) // 10],
            "max": vols[-1],
            "note": "1 分 K 第一根成交量（張），代表開盤競價可成交的池子",
            "lowVolPct": round(sum(1 for v in vols if v < 50) / len(vols) * 100, 1),
        }

    # 同時觸發分布
    daily_counts = list(findings["byEntryDate"].values())
    if daily_counts:
        dc_sorted = sorted(daily_counts)
        findings["dailyPicksDistribution"] = {
            "tradingDays": len(daily_counts),
            "totalPicks": sum(daily_counts),
            "mean": round(statistics.mean(daily_counts), 2),
            "median": dc_sorted[len(dc_sorted) // 2],
            "max": dc_sorted[-1],
            "p90": dc_sorted[9 * len(dc_sorted) // 10],
            "daysWith10plus": sum(1 for c in daily_counts if c >= 10),
            "daysWith5plus": sum(1 for c in daily_counts if c >= 5),
        }

    # 同時持倉分布
    holds = sorted(holding_calendar.values())
    if holds:
        findings["concurrentHoldingsDist"] = {
            "days": len(holds),
            "mean": round(statistics.mean(holds), 1),
            "median": holds[len(holds) // 2],
            "max": holds[-1],
            "p90": holds[9 * len(holds) // 10],
            "p75": holds[3 * len(holds) // 4],
            "note": "T+1 進場、T+5 出場 → 持倉時長 5 個交易日，任一時點疊加的部位數",
        }

    # 簡化 examples
    findings["examples"] = findings["examples"][:10]
    findings["extremeWinners"] = sorted(findings["extremeWinners"],
                                        key=lambda x: x["ret"], reverse=True)[:10]
    findings["extremeLosers"] = sorted(findings["extremeLosers"],
                                       key=lambda x: x["ret"])[:10]
    findings["byEntryDate"] = dict(list(findings["byEntryDate"].items())[:5])  # 摘要

    # 去除原始大陣列
    del findings["tradeReturns"]
    del findings["openingVolumeStats"]

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(findings, f, ensure_ascii=False, indent=2)

    print(f"\n=== T+5 收盤出場：實戰可執行性分析 ===")
    print(f"總精選: {findings['totalPicks']}")
    print(f"bars 命中: {findings['barsCoverage']['hasBars']} / 缺: {findings['barsCoverage']['noBars']}")
    print(f"T+1 開盤即漲停（買不到）: {findings['openingAuctionLimitUp']}")
    print(f"T+1 開盤跌破昨收（gap-down）: {findings['gapdownAtT1Open']}")
    print(f"T+5 跌停（賣不掉）: {findings['t5LimitDown']}")
    print(f"T+5 資料缺漏: {findings['missingT5Data']}")
    if "returnsAnalysis" in findings:
        r = findings["returnsAnalysis"]
        print(f"\n報酬：n={r['n']} 勝率{r['winRate']}% EV{r['mean']}% "
              f"中位{r['median']}% sd{r['stdev']} max{r['maxWin']} min{r['maxLoss']}")
        print(f"前 5% ({r['top5pctN']} 筆) 貢獻 {r['top5pctContribution']}% 總報酬")
        print(f"排除前 5% 後 EV: {r['evWithoutTop5pct']}%")
    if "openingVolumeAnalysis" in findings:
        v = findings["openingVolumeAnalysis"]
        print(f"\n開盤第一根 K 成交量（張）：min={v['min']} p10={v['p10']} "
              f"中位={v['median']} p90={v['p90']} max={v['max']}")
        print(f"<50張比例: {v['lowVolPct']}%")
    if "dailyPicksDistribution" in findings:
        d = findings["dailyPicksDistribution"]
        print(f"\n每日同時觸發：天數{d['tradingDays']} 平均{d['mean']}檔 "
              f"中位{d['median']} 最多{d['max']} p90={d['p90']}")
        print(f"當天≥10檔的天數: {d['daysWith10plus']} / ≥5檔: {d['daysWith5plus']}")
    if "concurrentHoldingsDist" in findings:
        c = findings["concurrentHoldingsDist"]
        print(f"\n同時持倉（T+5 期間疊加）：平均{c['mean']} 中位{c['median']} "
              f"p75={c['p75']} p90={c['p90']} max={c['max']}")
    print(f"\nsaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
