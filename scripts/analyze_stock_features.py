"""個股特徵維度分析 — 找出可以「永遠買」或「永遠不買」的特徵。

任務：
  針對「score≥70 → T+1 開盤競價買進 → T+2 開盤賣出」這條 274 筆基線策略，
  逐一掃描多維度特徵，量化每個過濾規則的：
    · 筆數 / 勝率 / 淨期望值 / 累計報酬
    · 相對基線的損益變化

特徵維度：
  A. 價位區間（低價/中價/高價）
  B. 上市 vs 上櫃（market 欄位）
  C. 行業（industry 欄位 + categories 的權值股 / 處置股）
  D. 出現次數（精選常客 vs 突發）
  E. 評分組成（哪幾個訊號 +25 最容易贏）
  F. 是否權值股
  G. 前日成交量（張數）
  H. 前一日漲跌幅
  I. 連續 streak 天數
  J. 主力買賣超
  K. 是否來自當日大族群（同族群股數 ≥3）

輸出：
  data/opt_stock_features.json — 各維度的所有 cohort 結果 + Top 規則
"""
import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from run_backtest_0903 import build_pick_days

CACHE_DIR = os.path.join("data", "intraday_cache")
COST = 0.585      # overnight 0.1425%×2 + 0.30% 稅
SCORE_MIN = 70    # 基線
ENTRY_TYPE = "open_price"   # 競價買進（最佳已驗證）
OUT_FILE = os.path.join("data", "opt_stock_features.json")


def _load_cache(code, date):
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def _stats(rets):
    """rets: 淨報酬序列（已扣成本）"""
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "ev": None, "total": 0.0, "median": None}
    wins = sum(1 for r in rets if r > 0)
    mean = sum(rets) / n
    s = sorted(rets)
    med = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "ev": round(mean, 4),
        "total": round(sum(rets), 2),
        "median": round(med, 4),
    }


def _confidence(n):
    if n >= 80:
        return "high"
    if n >= 30:
        return "medium"
    return "low"


# ─── 建構帶完整特徵的交易紀錄 ───────────────────────────────
def collect_trades_with_features(pick_days, days_by_date, bars_map, hw,
                                  rev_maps, score_min=SCORE_MIN):
    """每筆交易附加特徵：industry / market / isHeavyweight / prevVolume /
       prevChangePct / streak / majorNet / appearances / groupSize / revYoY"""
    # 先建 code → 出現次數（在整個樣本期 score≥50 出現幾天）
    code_appearances = defaultdict(int)
    for d in pick_days:
        seen = set()
        for p in d["picks"]:
            if p["code"] not in seen:
                code_appearances[p["code"]] += 1
                seen.add(p["code"])

    # 從 daily JSON 取每檔股票當日完整資訊（含 industry/market/volume/...）
    def lookup_stock_full(date, code):
        day = days_by_date.get(date)
        if not day:
            return None
        for g in day["groups"]:
            for s in g["stocks"]:
                if s["code"] == code:
                    # 也回傳該族群名與成員數
                    return s, g["name"], len(g["stocks"])
        return None

    trades = []
    for d in pick_days:
        pick_date = d["pickDate"]
        entry_date = d["entryDate"]
        next_date = d.get("nextDate")
        if not next_date:
            continue
        for p in d["picks"]:
            if p["score"] < score_min:
                continue
            day_bars = bars_map.get((p["code"], entry_date), [])
            next_bars = bars_map.get((p["code"], next_date), [])
            if not day_bars or not next_bars:
                continue

            # 入場價 / 出場價
            if ENTRY_TYPE == "open_price":
                entry = day_bars[0]["open"]
            else:
                b = next((b for b in day_bars if b["time"] <= "09:01"), day_bars[0])
                entry = b["close"]
            exit_p = next_bars[0]["open"]
            if entry <= 0:
                continue

            ret = (exit_p - entry) / entry * 100 - COST

            # 從選股當日 daily JSON 取完整欄位
            full = lookup_stock_full(pick_date, p["code"])
            if not full:
                continue
            s_info, group_name, group_size = full

            # 前一日資訊（如有）
            # pick_date 是選股當日（漲停日），所以「前日成交量」=前一交易日
            pick_idx = next((i for i, dd in enumerate(days_by_date_keys) if dd == pick_date), None)
            prev_change_pct = None
            prev_volume = None
            prev_close_for_change = None
            if pick_idx is not None and pick_idx > 0:
                prev_date = days_by_date_keys[pick_idx - 1]
                prev_full = lookup_stock_full(prev_date, p["code"])
                if prev_full:
                    pinfo = prev_full[0]
                    prev_change_pct = pinfo.get("change_pct")
                    prev_volume = pinfo.get("volume")
                    prev_close_for_change = pinfo.get("close")

            trades.append({
                "pickDate": pick_date,
                "entryDate": entry_date,
                "code": p["code"],
                "name": p["name"],
                "score": p["score"],
                "ret": round(ret, 4),
                # 特徵
                "industry": s_info.get("industry") or "",
                "market": s_info.get("market") or "",  # TWSE / TPEx
                "isHeavyweight": p["code"] in hw,
                "pickClose": s_info.get("close"),       # 選股當日（漲停日）收盤 → 價位區間
                "pickVolume": s_info.get("volume"),    # 選股當日成交量（張）
                "majorNet": s_info.get("major_net", 0),
                "streak": s_info.get("streak", 1),
                "groupName": group_name,
                "groupSize": group_size,
                "appearances": code_appearances[p["code"]],
                "prevChangePct": prev_change_pct,
                "prevVolume": prev_volume,
                "prevWasLimit": (prev_change_pct is not None and prev_change_pct >= 9.5),
            })
    return trades


def cohort_table(trades, key_fn, baseline_stats):
    """key_fn: trade -> label。回 [{label, stats, delta_ev_pct, delta_total}]"""
    buckets = defaultdict(list)
    for t in trades:
        try:
            k = key_fn(t)
        except Exception:
            k = None
        if k is None:
            continue
        if isinstance(k, list):
            for kk in k:
                buckets[kk].append(t["ret"])
        else:
            buckets[k].append(t["ret"])
    out = []
    for label, rets in buckets.items():
        s = _stats(rets)
        # 相對基線改善（EV 差）
        ev_delta = (s["ev"] - baseline_stats["ev"]) if s["ev"] is not None else None
        out.append({
            "label": str(label),
            "n": s["n"],
            "winRate": s["winRate"],
            "ev": s["ev"],
            "total": s["total"],
            "median": s["median"],
            "evDelta": round(ev_delta, 4) if ev_delta is not None else None,
            "confidence": _confidence(s["n"]),
        })
    out.sort(key=lambda r: -(r["ev"] if r["ev"] is not None else -999))
    return out


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    print("載入資料...")
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()

    # 全域可用：日期 → daily JSON / 日期升冪
    global days_by_date_keys
    days_by_date = {d["date"]: d for d in days}
    days_by_date_keys = [d["date"] for d in days]

    pick_days = build_pick_days(days, rev_maps, hw, disp)
    print(f"選股日 {len(pick_days)} 天")

    # 預載 1 分 K 快取（入場日 + 下一日）
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
    print(f"快取命中 {hit}/{len(needed)}")

    trades = collect_trades_with_features(
        pick_days, days_by_date, bars_map, hw, rev_maps, score_min=SCORE_MIN
    )
    print(f"基線交易 {len(trades)} 筆")

    rets = [t["ret"] for t in trades]
    baseline = _stats(rets)
    print(f"基線：勝率 {baseline['winRate']}% / EV {baseline['ev']:+.4f}% / 總 {baseline['total']:+.2f}%")

    # ─── 維度 A：價位區間 ───────────────────────────────
    def price_bucket(t):
        c = t["pickClose"]
        if c is None:
            return None
        if c < 30:
            return "<30 低價"
        if c < 100:
            return "30-100 中低"
        if c < 200:
            return "100-200 中價"
        if c < 500:
            return "200-500 中高"
        return ">=500 高價"
    coh_price = cohort_table(trades, price_bucket, baseline)

    # ─── 維度 B：上市/上櫃 ─────────────────────────────
    coh_market = cohort_table(trades, lambda t: t["market"] or "(空)", baseline)

    # ─── 維度 C：行業（前 15 大）────────────────────────
    coh_industry_all = cohort_table(trades, lambda t: t["industry"] or "(空)", baseline)
    # 只看 n≥8 的行業（避免 1-2 筆雜訊）
    coh_industry = [r for r in coh_industry_all if r["n"] >= 8]

    # ─── 維度 D：出現次數 ───────────────────────────────
    def appear_bucket(t):
        a = t["appearances"]
        if a == 1:
            return "1 突發"
        if a <= 3:
            return "2-3 偶發"
        if a <= 6:
            return "4-6 常客"
        return ">=7 死忠"
    coh_appear = cohort_table(trades, appear_bucket, baseline)

    # ─── 維度 E：評分區間 ───────────────────────────────
    def score_bucket(t):
        s = t["score"]
        if s < 75:
            return "70-74"
        if s < 80:
            return "75-79"
        if s < 90:
            return "80-89"
        if s < 100:
            return "90-99"
        return ">=100"
    coh_score = cohort_table(trades, score_bucket, baseline)

    # ─── 維度 F：是否權值股 ─────────────────────────────
    coh_hw = cohort_table(
        trades, lambda t: "權值股" if t["isHeavyweight"] else "非權值股", baseline
    )

    # ─── 維度 G：前日成交量（張） ───────────────────────
    def prev_vol_bucket(t):
        v = t["prevVolume"]
        if v is None:
            return None
        lots = v / 1000
        if lots < 500:
            return "<500張 低量"
        if lots < 2000:
            return "500-2000張 中量"
        if lots < 5000:
            return "2000-5000張 高量"
        if lots < 20000:
            return "5000-2萬張 爆量"
        return ">=2萬張 巨量"
    coh_prev_vol = cohort_table(trades, prev_vol_bucket, baseline)

    # ─── 維度 H：前一日漲跌幅 ───────────────────────────
    def prev_chg_bucket(t):
        c = t["prevChangePct"]
        if c is None:
            return None
        if c < -3:
            return "<-3% 大跌"
        if c < 0:
            return "-3~0 小跌"
        if c < 3:
            return "0-3 小漲"
        if c < 7:
            return "3-7 中漲"
        if c < 9.5:
            return "7-9.5 強漲"
        return ">=9.5 漲停"
    coh_prev_chg = cohort_table(trades, prev_chg_bucket, baseline)

    # ─── 維度 I：連續 streak ───────────────────────────
    def streak_bucket(t):
        s = t["streak"]
        if s == 1:
            return "1 單根"
        if s == 2:
            return "2 連二"
        if s == 3:
            return "3 連三"
        return ">=4 連四+"
    coh_streak = cohort_table(trades, streak_bucket, baseline)

    # ─── 維度 J：主力買賣超 ─────────────────────────────
    def major_bucket(t):
        m = t.get("majorNet", 0) or 0
        if m > 5000:
            return ">+5000 重壓"
        if m > 0:
            return "0~5000 小買超"
        if m == 0:
            return "0 中性"
        if m > -5000:
            return "-5000~0 小賣超"
        return "<-5000 重砍"
    coh_major = cohort_table(trades, major_bucket, baseline)

    # ─── 維度 K：族群規模 ───────────────────────────────
    def group_size_bucket(t):
        g = t["groupSize"]
        if g == 1:
            return "1 獨股"
        if g == 2:
            return "2 對"
        if g <= 4:
            return "3-4 小族"
        if g <= 8:
            return "5-8 中族"
        return ">=9 大族"
    coh_group = cohort_table(trades, group_size_bucket, baseline)

    # ─── 維度 L：前日是否漲停 ───────────────────────────
    coh_prev_limit = cohort_table(
        trades, lambda t: "前日漲停" if t["prevWasLimit"] else "前日非漲停", baseline
    )

    # ─── 找出最強的「白名單」過濾規則（單條件） ─────────
    # 條件：n>=20 且 EV > 基線 且 winRate > 基線
    def collect_rules(cohorts, dim_name, prefix):
        out = []
        for c in cohorts:
            if c["n"] < 15 or c["ev"] is None:
                continue
            out.append({
                "dim": dim_name,
                "rule": f"{prefix}={c['label']}",
                "n": c["n"],
                "winRate": c["winRate"],
                "ev": c["ev"],
                "total": c["total"],
                "evDelta": c["evDelta"],
                "confidence": c["confidence"],
            })
        return out

    all_rules = []
    all_rules += collect_rules(coh_price, "price", "價位")
    all_rules += collect_rules(coh_market, "market", "市場")
    all_rules += collect_rules(coh_industry, "industry", "行業")
    all_rules += collect_rules(coh_appear, "appearances", "出現次數")
    all_rules += collect_rules(coh_score, "score", "評分")
    all_rules += collect_rules(coh_hw, "heavyweight", "權值")
    all_rules += collect_rules(coh_prev_vol, "prevVolume", "前日量")
    all_rules += collect_rules(coh_prev_chg, "prevChange", "前日漲跌")
    all_rules += collect_rules(coh_streak, "streak", "連續")
    all_rules += collect_rules(coh_major, "majorNet", "主力")
    all_rules += collect_rules(coh_group, "groupSize", "族群規模")
    all_rules += collect_rules(coh_prev_limit, "prevLimit", "前日漲停")

    whitelist = sorted([r for r in all_rules if r["ev"] > baseline["ev"]],
                       key=lambda r: -r["ev"])
    blacklist = sorted([r for r in all_rules if r["ev"] < 0],
                       key=lambda r: r["ev"])

    # ─── 多重組合過濾測試 ──────────────────────────────
    # 過濾 1：排除「30-100 中低 + 前日漲停 + 突發出現」這類候選
    # 我們動態算幾個強白名單組合
    def apply_filters(filters):
        """filters: list of trade->bool"""
        kept = [t for t in trades if all(f(t) for f in filters)]
        if not kept:
            return None
        return _stats([t["ret"] for t in kept])

    combos = []

    # 組合 1：上市股 + 價位 < 200（最常見的安全 zone）
    f1 = apply_filters([
        lambda t: t["market"] == "TWSE",
        lambda t: t["pickClose"] is not None and t["pickClose"] < 200,
    ])
    if f1:
        combos.append({"rule": "TWSE 上市 AND 價位<200", **f1})

    # 組合 2：排除前日漲停 + 排除 streak>=3（避免追高末段）
    f2 = apply_filters([
        lambda t: not t["prevWasLimit"],
        lambda t: t["streak"] <= 2,
    ])
    if f2:
        combos.append({"rule": "前日非漲停 AND streak<=2", **f2})

    # 組合 3：成交量低於 2 萬張（流動性 ok 但不過熱）
    f3 = apply_filters([
        lambda t: t["prevVolume"] is not None and t["prevVolume"] / 1000 < 20000,
    ])
    if f3:
        combos.append({"rule": "前日量<2萬張", **f3})

    # 組合 4：低價股（<30）+ 出現次數 >=2（有跟風基礎）
    f4 = apply_filters([
        lambda t: t["pickClose"] is not None and t["pickClose"] < 30,
        lambda t: t["appearances"] >= 2,
    ])
    if f4:
        combos.append({"rule": "價位<30 AND 出現>=2", **f4})

    # 組合 5：去除「30-100 + 前日漲停」這類已驗證劣勢
    f5 = apply_filters([
        lambda t: not (t["pickClose"] is not None and 30 <= t["pickClose"] < 100
                       and t["prevWasLimit"]),
    ])
    if f5:
        combos.append({"rule": "排除「中低價且前日漲停」", **f5})

    # 組合 6：高分（>=80）+ 上市 + 排除前日漲停
    f6 = apply_filters([
        lambda t: t["score"] >= 80,
        lambda t: t["market"] == "TWSE",
        lambda t: not t["prevWasLimit"],
    ])
    if f6:
        combos.append({"rule": "score>=80 AND TWSE AND 前日非漲停", **f6})

    # 組合 7：族群>=3 + 上市 + 低價
    f7 = apply_filters([
        lambda t: t["groupSize"] >= 3,
        lambda t: t["market"] == "TWSE",
    ])
    if f7:
        combos.append({"rule": "族群>=3 AND TWSE", **f7})

    # 組合 8：核心避雷 — 排除（TPEx 上櫃 + 前日漲停）
    f8 = apply_filters([
        lambda t: not (t["market"] == "TPEx" and t["prevWasLimit"]),
    ])
    if f8:
        combos.append({"rule": "排除「上櫃且前日漲停」", **f8})

    # 計算每個 cohort 的等價 TWD（基線 511.28% = 186 萬）
    TWD_PER_PCT = 1860000 / baseline["total"] if baseline["total"] > 0 else 0
    for dim, cohs in [("price", coh_price), ("market", coh_market),
                       ("industry", coh_industry), ("appearances", coh_appear),
                       ("score", coh_score), ("heavyweight", coh_hw),
                       ("prevVolume", coh_prev_vol), ("prevChange", coh_prev_chg),
                       ("streak", coh_streak), ("majorNet", coh_major),
                       ("groupSize", coh_group), ("prevLimit", coh_prev_limit)]:
        for c in cohs:
            c["twdTotal"] = round(c["total"] * TWD_PER_PCT, 0) if c["total"] is not None else 0
    for c in combos:
        c["twdTotal"] = round(c["total"] * TWD_PER_PCT, 0) if c.get("total") is not None else 0

    output = {
        "baseline": {
            "scoreMin": SCORE_MIN,
            "entryType": ENTRY_TYPE,
            "cost": COST,
            "windowStart": days[0]["date"],
            "windowEnd": days[-1]["date"],
            "userQuotedTWD": 1860000,
            "twdPerPct": round(TWD_PER_PCT, 0),
            **baseline,
        },
        "cohorts": {
            "price": coh_price,
            "market": coh_market,
            "industry": coh_industry,           # n>=8
            "industry_full": coh_industry_all,
            "appearances": coh_appear,
            "score": coh_score,
            "heavyweight": coh_hw,
            "prevVolume": coh_prev_vol,
            "prevChange": coh_prev_chg,
            "streak": coh_streak,
            "majorNet": coh_major,
            "groupSize": coh_group,
            "prevLimit": coh_prev_limit,
        },
        "whitelist": whitelist[:15],
        "blacklist": blacklist[:15],
        "combinedFilters": combos,
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)

    print(f"\nsaved: {OUT_FILE}")
    print("\n=== 白名單 TOP 8 ===")
    for r in whitelist[:8]:
        print(f"  {r['rule']:30s} n={r['n']:>3} 勝率{r['winRate']:>5.1f}% EV{r['ev']:+.3f}% Δ{r['evDelta']:+.3f}")
    print("\n=== 黑名單 TOP 8 ===")
    for r in blacklist[:8]:
        print(f"  {r['rule']:30s} n={r['n']:>3} 勝率{r['winRate']:>5.1f}% EV{r['ev']:+.3f}% Δ{r['evDelta']:+.3f}")
    print("\n=== 組合過濾 ===")
    for c in combos:
        print(f"  {c['rule']:35s} n={c['n']:>3} 勝率{c['winRate']:>5.1f}% EV{c['ev']:+.3f}% 總{c['total']:+.1f}")


if __name__ == "__main__":
    main()
