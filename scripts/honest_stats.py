"""誠實期望值體檢 — 用真實隔日 OHLC 算「扣成本後到底有沒有 edge」。

與 run_backtest.py 的差異（更誠實）：
  1. 評分為 scoring.ts 的**完整**鏡像（含其漏掉的 權值股+25 / 近期空吞−25）。
  2. 營收檔按 dataDate ≤ 選股日 選擇（point-in-time），非永遠用 2026-03。
  3. 統計給 中位數 / 截尾平均 / Wilson 95% CI / 多空 regime 切分，
     並提供三種成本情境：毛 / 扣費稅 0.435% / 保守含滑價 1.0%。
  4. 全部歷史日永久納入（非滾動 10 天），高分群（≥60）與全樣本分開。

用法：python scripts/honest_stats.py        # 輸出 data/analysis/honest_stats.json
仍屬「模擬重建」（以現行邏輯回算歷史，含未來函數風險）——輸出有標註。
"""
import json
import math
import os
import re
import statistics
import sys
import tempfile
import time

# ── 成本常數（台股現股當沖）─────────────────────────────────
COST_FEES_PCT = 0.435          # 手續費 0.1425%×2 + 當沖證交稅 0.15%
COST_CONSERVATIVE_PCT = 1.0    # 費稅 + 保守滑價（低流動性小型股）

PICK_THRESHOLD = 50
HC_THRESHOLD = 60              # 高分可操作群（對齊 TRADE_THRESHOLD）
MAX_PICKS = 20

DAILY_DIR = "data/daily"
REV_DIR = "data/revenue"
CAT_FILE = "data/categories.json"
OUT_FILE = "data/analysis/honest_stats.json"


# ════════════════════════════════════════════════════════════
# 純函式（單元測試對象）
# ════════════════════════════════════════════════════════════

def wilson_ci(wins: int, n: int, z: float = 1.96):
    """Wilson score 95% CI，回傳 (lo%, hi%)。n=0 → (0,0)。"""
    if n == 0:
        return (0.0, 0.0)
    p = wins / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (round((center - margin) * 100, 1), round((center + margin) * 100, 1))


def summarize(rets):
    """報酬序列 → {samples, winRate, ciLow, ciHigh, mean, median,
    trimmedMeanTop3, p10, p25, p75, p90}。空序列回 None 欄位。"""
    n = len(rets)
    if n == 0:
        return {"samples": 0, "winRate": None, "ciLow": None, "ciHigh": None,
                "mean": None, "median": None, "trimmedMeanTop3": None,
                "p10": None, "p25": None, "p75": None, "p90": None}
    wins = sum(1 for r in rets if r > 0)
    lo, hi = wilson_ci(wins, n)
    s = sorted(rets)

    def pct(q):
        idx = q * (n - 1)
        f, c = int(math.floor(idx)), int(math.ceil(idx))
        if f == c:
            return s[f]
        return s[f] + (s[c] - s[f]) * (idx - f)

    trimmed = s[:-3] if n > 3 else s[:1] if n == 1 else s[: max(1, n - 3)]
    return {
        "samples": n,
        "winRate": round(wins / n * 100, 1),
        "ciLow": lo, "ciHigh": hi,
        "mean": round(statistics.mean(rets), 2),
        "median": round(statistics.median(rets), 2),
        "trimmedMeanTop3": round(statistics.mean(trimmed), 2) if trimmed else None,
        "p10": round(pct(0.10), 2), "p25": round(pct(0.25), 2),
        "p75": round(pct(0.75), 2), "p90": round(pct(0.90), 2),
    }


def apply_cost(rets, cost_pct):
    """毛報酬序列 → 扣除來回成本後的淨報酬序列。"""
    return [r - cost_pct for r in rets]


def regime_split(rows):
    """rows=[{ret, taiexNextChg}] → (up_rows, down_rows)。平盤(0)歸 up。"""
    up = [r for r in rows if r["taiexNextChg"] >= 0]
    down = [r for r in rows if r["taiexNextChg"] < 0]
    return up, down


def score_stock_full(stock, *, group_name, trending, leader_code, rev_yoy,
                     is_disposal, recent_bearish, is_heavyweight):
    """scoring.ts scoreStock() 的完整 Python 鏡像。

    run_backtest.py 的鏡像漏了 is_heavyweight(+25) 與 recent_bearish(−25)，
    此處補齊 — 這是本腳本與舊回測選股不同的主因之一。
    """
    score = 0
    if is_disposal:
        score -= 50
    if recent_bearish:
        score -= 25
    lots = stock["volume"] / 1000
    if lots < 500:
        score -= 30
    elif lots < 2000:
        score -= 15
    if group_name in trending:
        score += 30
    if rev_yoy is not None and rev_yoy > 20:
        score += 25
        if rev_yoy > 50:
            score += 10
    if stock["major_net"] > 0:
        score += 20
    if stock.get("streak", 1) >= 2:
        score += 15
    if stock["volume"] > 5_000_000:
        score += 5
    if leader_code == stock["code"]:
        score += 10
    if is_heavyweight:
        score += 25
    return score


# ════════════════════════════════════════════════════════════
# 資料載入 / 選股重建（IO）
# ════════════════════════════════════════════════════════════

def load_daily_files():
    files = sorted(f for f in os.listdir(DAILY_DIR) if f.endswith(".json"))
    days = []
    for f in files:
        with open(os.path.join(DAILY_DIR, f), encoding="utf-8") as fp:
            days.append(json.load(fp))
    return days


def load_revenue_maps():
    """[(dataDate, {code: revYoY})] 依 dataDate 升冪。"""
    out = []
    for f in sorted(os.listdir(REV_DIR)):
        if not f.endswith(".json"):
            continue
        with open(os.path.join(REV_DIR, f), encoding="utf-8") as fp:
            d = json.load(fp)
        out.append((d.get("dataDate", "9999-99-99"),
                    {s["code"]: s.get("revYoY") for s in d.get("stocks", [])}))
    out.sort(key=lambda t: t[0])
    return out


def revenue_for_date(rev_maps, pick_date):
    """最新一份 dataDate ≤ pick_date 的營收 map；沒有 → {}（point-in-time）。"""
    chosen = {}
    for data_date, m in rev_maps:
        if data_date <= pick_date:
            chosen = m
        else:
            break
    return chosen


def load_categories():
    try:
        with open(CAT_FILE, encoding="utf-8") as fp:
            raw = json.load(fp)
        hw = {c for c in (raw.get("heavyweight", {}).get("codes") or {}).keys()
              if re.fullmatch(r"\d{4}", c)}
        disp = set(raw.get("disposal", {}).get("codes") or [])
        return hw, disp
    except Exception:
        return set(), set()


def reconstruct_picks(days, i, rev_maps, heavyweight, known_disposal, cap=MAX_PICKS):
    """重建第 i 天的選股（≥50），依分數降冪。cap=None → 不設上限。"""
    td = days[i]
    # 趨勢族群：i, i-1, i-2 出現 ≥2 天
    group_days = {}
    for j in range(max(0, i - 2), i + 1):
        for g in days[j]["groups"]:
            group_days[g["name"]] = group_days.get(g["name"], 0) + 1
    trending = {n for n, d in group_days.items() if d >= 2}

    # 6 日窗（含當日）：處置 / 連續
    window = days[max(0, i - 5): i + 1][::-1]   # 最近在前
    codes_per_day = [{s["code"] for g in d["groups"] for s in g["stocks"]} for d in window]
    all_codes = set().union(*codes_per_day) if codes_per_day else set()
    disposal = set()
    for c in all_codes:
        if sum(1 for cs in codes_per_day if c in cs) >= 3:
            disposal.add(c)

    # 近 7 日（含當日）空吞 codes
    bearish = set()
    for d in days[max(0, i - 6): i + 1]:
        for b in d.get("bearish_engulfing", []) or []:
            if b.get("code"):
                bearish.add(b["code"])

    rev = revenue_for_date(rev_maps, td["date"])

    picks = []
    for g in td["groups"]:
        sorted_g = sorted(g["stocks"], key=lambda s: -s["volume"])
        leader = sorted_g[0]["code"] if sorted_g else None
        for s in g["stocks"]:
            sc = score_stock_full(
                s, group_name=g["name"], trending=trending, leader_code=leader,
                rev_yoy=rev.get(s["code"]),
                is_disposal=(s["code"] in disposal or s["code"] in known_disposal),
                recent_bearish=s["code"] in bearish,
                is_heavyweight=s["code"] in heavyweight,
            )
            if sc >= PICK_THRESHOLD:
                picks.append({"code": s["code"], "name": s["name"],
                              "close": s["close"], "score": sc})
    picks.sort(key=lambda p: -p["score"])
    return picks if cap is None else picks[:cap]


# ════════════════════════════════════════════════════════════
# 真實價格（TWSE/TPEx 月資料 + 磁碟快取）
# ════════════════════════════════════════════════════════════

CACHE_PATH = os.path.join(tempfile.gettempdir(), "honest_stats_price_cache.json")
_consecutive_empty = 0   # TWSE 限流偵測：連續空回應過多 → 長休


def _requests():
    import requests
    import urllib3
    urllib3.disable_warnings()
    return requests


def _roc_to_ad(roc_date):
    """'115/06/05' → '2026-06-05'；格式不符回 None。"""
    parts = str(roc_date).strip().split("/")
    if len(parts) != 3:
        return None
    try:
        return f"{int(parts[0]) + 1911}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
    except ValueError:
        return None


def parse_tpex_trading_stock(payload):
    """TPEx /www/zh-tw/afterTrading/tradingStock 回應 → {date:{open,close}}。

    rows: ['日期(ROC)','成交張數','成交仟元','開盤','最高','最低','收盤','漲跌']
    """
    out = {}
    for t in payload.get("tables", []) or []:
        for row in t.get("data", []) or []:
            try:
                date = _roc_to_ad(row[0])
                if not date:
                    continue
                o = str(row[3]).replace(",", "").strip()
                c = str(row[6]).replace(",", "").strip()
                if o in ("--", "") or c in ("--", ""):
                    continue
                out[date] = {"open": float(o), "close": float(c)}
            except (ValueError, IndexError):
                continue
    return out


def _fetch_twse_month(requests, code, yyyymm):
    r = requests.get("https://www.twse.com.tw/exchangeReport/STOCK_DAY",
                     params={"response": "json", "date": f"{yyyymm}01", "stockNo": code},
                     headers={"User-Agent": "Mozilla/5.0"}, timeout=12, verify=False)
    d = r.json()
    result = {}
    if d.get("stat") == "OK":
        for row in d.get("data", []):
            try:
                date = _roc_to_ad(row[0])
                o = row[3].replace(",", "") if row[3] not in ("--", "") else ""
                c = row[6].replace(",", "") if row[6] not in ("--", "") else ""
                if date and o and c:
                    result[date] = {"open": float(o), "close": float(c)}
            except (ValueError, IndexError):
                continue
    return result


def _fetch_tpex_month(requests, code, yyyymm):
    # 新端點：給定該月任一日即回整月日資料表
    r = requests.get("https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock",
                     params={"date": f"{yyyymm[:4]}/{yyyymm[4:6]}/01",
                             "code": code, "response": "json"},
                     headers={"User-Agent": "Mozilla/5.0",
                              "Referer": "https://www.tpex.org.tw/"},
                     timeout=12, verify=False)
    return parse_tpex_trading_stock(r.json())


def fetch_month(code, yyyymm, cache):
    """回傳 {date:{open,close}}。TWSE → TPEx(新端點)；空結果重試一輪再認輸。

    教訓：TWSE 對連續掃描會限流（暫時回空），空回應絕不能首輪就快取。
    """
    global _consecutive_empty
    key = f"{code}|{yyyymm}"
    if key in cache and cache[key]:
        return cache[key]
    requests = _requests()

    result = {}
    for attempt in range(3):
        try:
            result = _fetch_twse_month(requests, code, yyyymm)
        except Exception:
            result = {}
        if not result:
            try:
                result = _fetch_tpex_month(requests, code, yyyymm)
            except Exception:
                result = {}
        if result:
            break
        # 連兩源皆空：可能限流，退避後重試（最後一輪放棄）
        if attempt < 2:
            time.sleep(3.0 * (attempt + 1))

    if result:
        _consecutive_empty = 0
    else:
        _consecutive_empty += 1
        if _consecutive_empty >= 6:   # 疑似被 TWSE 封鎖 → 長休再走
            print(f"  [throttle] {_consecutive_empty} consecutive empties, cooling down 20s...")
            time.sleep(20)
            _consecutive_empty = 0

    cache[key] = result
    time.sleep(0.6)
    return result


def load_cache():
    try:
        with open(CACHE_PATH, encoding="utf-8") as fp:
            cache = json.load(fp)
        # 丟棄先前快取的空結果（可能是限流期間的假陰性），讓其重試
        return {k: v for k, v in cache.items() if v}
    except Exception:
        return {}


def save_cache(cache):
    try:
        with open(CACHE_PATH, "w", encoding="utf-8") as fp:
            json.dump(cache, fp)
    except Exception:
        pass


# ════════════════════════════════════════════════════════════
# 主流程
# ════════════════════════════════════════════════════════════

def cohort_report(rows):
    """rows=[{ret(毛), taiexNextChg, ...}] → 三情境 + regime 報告。"""
    gross = [r["ret"] for r in rows]
    rep = {
        "samples": len(rows),
        "scenarios": {
            "gross": summarize(gross),
            "netFees": summarize(apply_cost(gross, COST_FEES_PCT)),
            "netConservative": summarize(apply_cost(gross, COST_CONSERVATIVE_PCT)),
        },
    }
    up, down = regime_split(rows)
    rep["regime"] = {
        "taiexUp": {
            "days": len({r["date"] for r in up}),
            "gross": summarize([r["ret"] for r in up]),
            "netConservative": summarize(apply_cost([r["ret"] for r in up], COST_CONSERVATIVE_PCT)),
        },
        "taiexDown": {
            "days": len({r["date"] for r in down}),
            "gross": summarize([r["ret"] for r in down]),
            "netConservative": summarize(apply_cost([r["ret"] for r in down], COST_CONSERVATIVE_PCT)),
        },
    }
    return rep


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    days = load_daily_files()
    rev_maps = load_revenue_maps()
    heavyweight, known_disposal = load_categories()
    cache = load_cache()

    all_rows, hc_rows = [], []
    per_day = []
    missing = 0

    for i in range(len(days) - 1):           # 最後一天沒有隔日，不能當選股日
        pick_date = days[i]["date"]
        next_date = days[i + 1]["date"]
        taiex_next = days[i + 1]["market_summary"]["taiex_change_pct"]
        picks = reconstruct_picks(days, i, rev_maps, heavyweight, known_disposal)
        if not picks:
            continue

        day_rows = []
        for p in picks:
            month = next_date[:7].replace("-", "")
            prices = fetch_month(p["code"], month, cache)
            ohlc = prices.get(next_date)
            if not ohlc:
                missing += 1
                continue
            gross = (ohlc["open"] - p["close"]) / p["close"] * 100
            row = {"date": pick_date, "next": next_date, "code": p["code"],
                   "name": p["name"], "score": p["score"],
                   "ret": round(gross, 2), "taiexNextChg": taiex_next}
            day_rows.append(row)
            all_rows.append(row)
            if p["score"] >= HC_THRESHOLD:
                hc_rows.append(row)

        if day_rows:
            hc_day = [r["ret"] for r in day_rows if r["score"] >= HC_THRESHOLD]
            per_day.append({
                "date": pick_date, "next": next_date, "taiexNextChg": taiex_next,
                "picks": len(picks), "fetched": len(day_rows),
                "grossMeanAll": round(statistics.mean([r["ret"] for r in day_rows]), 2),
                "hcSamples": len(hc_day),
                "grossMeanHC": round(statistics.mean(hc_day), 2) if hc_day else None,
            })
            print(f"{pick_date} -> {next_date}: all={len(day_rows)} hc={len(hc_day)} "
                  f"grossAll={per_day[-1]['grossMeanAll']:+.2f}%")
        save_cache(cache)

    top_outliers = sorted(all_rows, key=lambda r: -r["ret"])[:5]
    output = {
        "generatedOn": days[-1]["date"],
        "method": ("模擬重建（以現行 scoring 邏輯回算歷史，含未來函數風險）。"
                   "今日收盤買、隔日開盤賣；毛報酬以真實 TWSE/TPEx 隔日開盤計算。"),
        "window": {"from": days[0]["date"], "to": days[-2]["date"],
                   "pickDays": len(per_day)},
        "params": {"pickThreshold": PICK_THRESHOLD, "hcThreshold": HC_THRESHOLD,
                   "cap": MAX_PICKS, "costFeesPct": COST_FEES_PCT,
                   "costConservativePct": COST_CONSERVATIVE_PCT},
        "missing": missing,
        "cohorts": {
            "all": cohort_report(all_rows),
            "highConviction": cohort_report(hc_rows),
        },
        "topOutliers": [{"date": r["date"], "code": r["code"], "name": r["name"],
                         "grossPct": r["ret"]} for r in top_outliers],
        "perDay": per_day,
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)

    print(f"\n=== HONEST STATS ({output['window']['from']} ~ {output['window']['to']}) ===")
    for name, rows in (("ALL(top20>=50)", all_rows), ("HC(>=60)", hc_rows)):
        if not rows:
            print(f"{name}: no samples")
            continue
        g = summarize([r['ret'] for r in rows])
        n1 = summarize(apply_cost([r['ret'] for r in rows], COST_FEES_PCT))
        n2 = summarize(apply_cost([r['ret'] for r in rows], COST_CONSERVATIVE_PCT))
        print(f"{name}: n={g['samples']}")
        print(f"  gross : win {g['winRate']}% CI[{g['ciLow']},{g['ciHigh']}] "
              f"mean {g['mean']:+.2f} med {g['median']:+.2f} trim3 {g['trimmedMeanTop3']:+.2f}")
        print(f"  fees  : win {n1['winRate']}% med {n1['median']:+.2f}")
        print(f"  conserv: win {n2['winRate']}% mean {n2['mean']:+.2f} med {n2['median']:+.2f}")
    print(f"missing fetches: {missing}")
    print(f"saved: {OUT_FILE}")


if __name__ == "__main__":
    main()
