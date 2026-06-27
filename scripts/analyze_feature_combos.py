"""組合過濾深度測試 — 找出最強的 N 條件組合規則。

基於 analyze_stock_features.py 的單維結論：
  · 出現次數 >=7 → 勝率 68.6% EV +4.34% (n=51)
  · 主力 = 0 → 勝率 69.2% EV +3.82% (n=65)
  · 評分 90-99 → 勝率 49% EV +0.18%（已知陷阱）
  · 前日量 >=2萬張 → 勝率 31% EV -0.20%
  · 低價股 <30 → 勝率 40% EV +0.20%
  · 連三+streak → 1 筆 -7.9%（不夠樣本）
  · IC設計行業 → 勝率 54.5% EV +0.68%
  · 5-8 中族群 → 勝率 65% EV +0.46%（內生波動大）

組合策略：
  · 黑名單：剔除多個劣勢條件，看剩下能否提升 EV
  · 白名單：疊加多個優勢條件，看是否仍有足夠樣本
"""
import json
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from run_backtest_0903 import build_pick_days

CACHE_DIR = os.path.join("data", "intraday_cache")
COST = 0.585
SCORE_MIN = 70
OUT_FILE = os.path.join("data", "opt_feature_combos.json")


def _load_cache(code, date):
    path = os.path.join(CACHE_DIR, f"{code}_{date}.json")
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
            return d if d else None
    except Exception:
        return None


def _stats(rets):
    n = len(rets)
    if n == 0:
        return {"n": 0, "winRate": None, "ev": None, "total": 0.0}
    wins = sum(1 for r in rets if r > 0)
    return {
        "n": n,
        "winRate": round(wins / n * 100, 1),
        "ev": round(sum(rets) / n, 4),
        "total": round(sum(rets), 2),
    }


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
    days_by_date = {d["date"]: d for d in days}
    days_by_date_keys = [d["date"] for d in days]

    pick_days = build_pick_days(days, rev_maps, hw, disp)

    # 預載快取
    needed = set()
    for d in pick_days:
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            needed.add((p["code"], d["entryDate"]))
            if d.get("nextDate"):
                needed.add((p["code"], d["nextDate"]))
    bars_map = {}
    for (c, dt) in needed:
        b = _load_cache(c, dt)
        bars_map[(c, dt)] = b if b else []

    # 出現次數
    code_appearances = defaultdict(int)
    for d in pick_days:
        seen = set()
        for p in d["picks"]:
            if p["code"] not in seen:
                code_appearances[p["code"]] += 1
                seen.add(p["code"])

    def lookup_stock_full(date, code):
        day = days_by_date.get(date)
        if not day:
            return None
        for g in day["groups"]:
            for s in g["stocks"]:
                if s["code"] == code:
                    return s, g["name"], len(g["stocks"])
        return None

    trades = []
    for d in pick_days:
        if not d.get("nextDate"):
            continue
        for p in d["picks"]:
            if p["score"] < SCORE_MIN:
                continue
            day_bars = bars_map.get((p["code"], d["entryDate"]), [])
            next_bars = bars_map.get((p["code"], d["nextDate"]), [])
            if not day_bars or not next_bars:
                continue
            entry = day_bars[0]["open"]
            exit_p = next_bars[0]["open"]
            if entry <= 0:
                continue
            ret = (exit_p - entry) / entry * 100 - COST
            full = lookup_stock_full(d["pickDate"], p["code"])
            if not full:
                continue
            s_info, group_name, group_size = full

            pick_idx = days_by_date_keys.index(d["pickDate"]) if d["pickDate"] in days_by_date_keys else None
            prev_change = None
            prev_volume = None
            if pick_idx is not None and pick_idx > 0:
                prev_date = days_by_date_keys[pick_idx - 1]
                prev_full = lookup_stock_full(prev_date, p["code"])
                if prev_full:
                    pinfo = prev_full[0]
                    prev_change = pinfo.get("change_pct")
                    prev_volume = pinfo.get("volume")

            trades.append({
                "ret": ret,
                "score": p["score"],
                "industry": s_info.get("industry", "") or "",
                "market": s_info.get("market", "") or "",
                "isHW": p["code"] in hw,
                "close": s_info.get("close"),
                "vol": s_info.get("volume"),
                "majorNet": s_info.get("major_net", 0),
                "streak": s_info.get("streak", 1),
                "groupSize": group_size,
                "appear": code_appearances[p["code"]],
                "prevChg": prev_change,
                "prevVol": prev_volume,
                "prevLimit": prev_change is not None and prev_change >= 9.5,
            })

    baseline = _stats([t["ret"] for t in trades])
    print(f"基線：n={baseline['n']} 勝率{baseline['winRate']}% EV{baseline['ev']:+.4f}%")

    def apply(filters, label):
        kept = [t for t in trades if all(f(t) for f in filters)]
        if not kept:
            return {"label": label, "n": 0, "winRate": None, "ev": None, "total": 0}
        s = _stats([t["ret"] for t in kept])
        s["label"] = label
        s["delta_ev"] = round(s["ev"] - baseline["ev"], 4)
        s["delta_total_vs_base"] = round(s["total"] - baseline["total"], 2)
        return s

    combos = []

    # ─── 黑名單組合（剔除什麼，剩下會更好） ──────────────
    # B1: 剔除「評分 90-99」
    combos.append(apply([
        lambda t: not (90 <= t["score"] <= 99),
    ], "排除 90-99 分"))

    # B2: 剔除「前日量>=2萬張」
    combos.append(apply([
        lambda t: not (t["prevVol"] is not None and t["prevVol"] / 1000 >= 20000),
    ], "排除 前日量>=2萬張"))

    # B3: 剔除「低價股<30」
    combos.append(apply([
        lambda t: not (t["close"] is not None and t["close"] < 30),
    ], "排除 價位<30"))

    # B4: 三合一黑名單
    combos.append(apply([
        lambda t: not (90 <= t["score"] <= 99),
        lambda t: not (t["prevVol"] is not None and t["prevVol"] / 1000 >= 20000),
        lambda t: not (t["close"] is not None and t["close"] < 30),
    ], "排除 90-99分 ∪ 前日巨量 ∪ 低價"))

    # B5: 四合一黑名單（再加 streak>=3）
    combos.append(apply([
        lambda t: not (90 <= t["score"] <= 99),
        lambda t: not (t["prevVol"] is not None and t["prevVol"] / 1000 >= 20000),
        lambda t: not (t["close"] is not None and t["close"] < 30),
        lambda t: t["streak"] <= 2,
    ], "排除 90-99分 ∪ 巨量 ∪ 低價 ∪ streak>=3"))

    # B6: 進階黑名單 — 加上「2-3 偶發 + 主力重壓」這類偏弱
    combos.append(apply([
        lambda t: not (90 <= t["score"] <= 99),
        lambda t: not (t["prevVol"] is not None and t["prevVol"] / 1000 >= 20000),
        lambda t: not (t["close"] is not None and t["close"] < 30),
        lambda t: not t["isHW"],  # 排除權值股（勝率 50% EV +0.94 偏弱）
    ], "排除 90-99分 ∪ 巨量 ∪ 低價 ∪ 權值股"))

    # ─── 白名單組合（疊加多個優勢） ─────────────────────
    # W1: 出現次數 >=7 → 主力 = 0（最強單條件交集）
    combos.append(apply([
        lambda t: t["appear"] >= 7,
        lambda t: t["majorNet"] == 0,
    ], "出現>=7 AND 主力=0"))

    # W2: 出現次數 >=4（包含常客+死忠）
    combos.append(apply([
        lambda t: t["appear"] >= 4,
    ], "出現>=4 (常客+死忠)"))

    # W3: 評分 70-89 (排除 90+ 陷阱)
    combos.append(apply([
        lambda t: 70 <= t["score"] <= 89,
    ], "70-89分 (排除 90+陷阱)"))

    # W4: 評分 70-89 + 排除 巨量 + 排除 低價
    combos.append(apply([
        lambda t: 70 <= t["score"] <= 89,
        lambda t: not (t["prevVol"] is not None and t["prevVol"] / 1000 >= 20000),
        lambda t: not (t["close"] is not None and t["close"] < 30),
    ], "70-89分 ∧ 排除巨量 ∧ 排除低價"))

    # W5: 70-89分 + 排除巨量 + 排除低價 + 非權值
    combos.append(apply([
        lambda t: 70 <= t["score"] <= 89,
        lambda t: not (t["prevVol"] is not None and t["prevVol"] / 1000 >= 20000),
        lambda t: not (t["close"] is not None and t["close"] < 30),
        lambda t: not t["isHW"],
    ], "70-89 ∧ 排除巨量低價權值"))

    # W6: 加碼 - 出現>=4
    combos.append(apply([
        lambda t: 70 <= t["score"] <= 89,
        lambda t: not (t["prevVol"] is not None and t["prevVol"] / 1000 >= 20000),
        lambda t: not (t["close"] is not None and t["close"] < 30),
        lambda t: t["appear"] >= 4,
    ], "70-89 ∧ 排除巨量低價 ∧ 出現>=4"))

    # W7: 70-89 ∧ 排除巨量 ∧ 排除低價 ∧ 大族群>=9
    combos.append(apply([
        lambda t: 70 <= t["score"] <= 89,
        lambda t: not (t["prevVol"] is not None and t["prevVol"] / 1000 >= 20000),
        lambda t: not (t["close"] is not None and t["close"] < 30),
        lambda t: t["groupSize"] >= 9,
    ], "70-89 ∧ 排除巨量低價 ∧ 大族群"))

    # W8: 70-89 ∧ 出現>=4 ∧ 大族群>=9
    combos.append(apply([
        lambda t: 70 <= t["score"] <= 89,
        lambda t: t["appear"] >= 4,
        lambda t: t["groupSize"] >= 9,
    ], "70-89 ∧ 出現>=4 ∧ 大族群>=9"))

    # W9: 70-89分 ∧ 排除巨量低價權值 ∧ 出現>=4
    combos.append(apply([
        lambda t: 70 <= t["score"] <= 89,
        lambda t: not (t["prevVol"] is not None and t["prevVol"] / 1000 >= 20000),
        lambda t: not (t["close"] is not None and t["close"] < 30),
        lambda t: not t["isHW"],
        lambda t: t["appear"] >= 4,
    ], "70-89 ∧ 排除巨量低價權值 ∧ 出現>=4"))

    # 排序
    combos.sort(key=lambda c: -(c.get("ev") or -999))

    print("\n=== 組合過濾規則（依 EV 降冪）===")
    print(f"{'規則':45s} {'樣本':>5} {'勝率':>6} {'EV':>9} {'總損益':>9} {'Δ總(vs基)':>12}")
    print("─" * 100)
    for c in combos:
        if c["n"] == 0:
            continue
        ev = c["ev"] if c["ev"] is not None else 0
        print(f"  {c['label']:45s} {c['n']:>5} {c['winRate']:>5.1f}% "
              f"{ev:>+8.3f}% {c['total']:>+8.1f}% {c.get('delta_total_vs_base',0):>+11.1f}%")

    output = {
        "baseline": baseline,
        "combos": combos,
    }
    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(output, fp, ensure_ascii=False, indent=2)
    print(f"\nsaved: {OUT_FILE}")


if __name__ == "__main__":
    main()
