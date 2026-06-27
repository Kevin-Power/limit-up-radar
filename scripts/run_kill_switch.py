"""Kill switch 指標計算（資訊型，不自動切策略）。

輸出 data/kill_switch.json:
{
  "updatedAt": "YYYY-MM-DD",
  "window": 10,
  "timeline": [
    {"date": "2026-06-25", "ret": 1.5, "rollingEv10": 0.42,
     "rollingEv20": 0.31, "streakLosses": 0, "marketStatus": "green"}
  ],
  "latest": {
    "rollingEv10": ...,
    "rollingEv20": ...,
    "streakLosses": ...,
    "marketStatus": "green|amber|red",
    "marketYesterdayChg": -1.6
  },
  "warnings": [
    "rollingEv10 ≤ -0.5%：策略短期失效，考慮降倉",
    ...
  ]
}

threshold 依 June 診斷實證（不是直覺）：
- rollingEv10 ≤ -0.5%  → amber
- rollingEv10 ≤ -1.0%  → red
- streakLosses ≥ 5     → amber
- streakLosses ≥ 8     → red
- 前一日大盤 ≤ -1.5%   → red（最重要的單一訊號）
- 前一日大盤 -1.5~-0.5 → amber
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

BACKTEST_FILE = "data/backtest_0903.json"
OUT_FILE = "data/kill_switch.json"

def rolling_ev(rets, window=10):
    """每個 index 的 trailing window EV；< window 的位置回 None。"""
    out = []
    for i in range(len(rets)):
        if i + 1 < window:
            out.append(None)
        else:
            slice_ = [r for r in rets[i+1-window:i+1] if r is not None]
            out.append(round(sum(slice_) / len(slice_), 3) if slice_ else None)
    return out

def current_streak_losses(rets):
    """從尾巴開始數連續 < 0 筆數。"""
    n = 0
    for r in reversed(rets):
        if r is not None and r < 0:
            n += 1
        else:
            break
    return n

def market_warning_status(chg_pct):
    """前一日大盤漲跌 → green / amber / red。"""
    if chg_pct is None: return "green"
    if chg_pct <= -1.5: return "red"
    if chg_pct <= -0.5: return "amber"
    return "green"

def _load_taiex_chg():
    """從 daily/*.json 抽 taiex 收盤漲跌；回 [{date, chgPct}, ...]。

    注意：daily JSON 實際欄位是 'market_summary'.'taiex_change_pct'（snake_case），
    不是 'market'.'taiexChgPct'。"""
    daily_dir = "data/daily"
    out = []
    for f in sorted(os.listdir(daily_dir)):
        if not f.endswith(".json"): continue
        try:
            with open(os.path.join(daily_dir, f), encoding="utf-8") as fp:
                d = json.load(fp)
            chg = (d.get("market_summary") or {}).get("taiex_change_pct")
            if chg is None: continue
            out.append({"date": d["date"], "chgPct": chg})
        except Exception:
            continue
    return out

def build_kill_switch_data(trades, taiex, window=10):
    """trades: [{dEntry, r1Ret}] 依時間升冪；taiex: [{date, chgPct}]"""
    trades = sorted([t for t in trades if t.get("r1Ret") is not None],
                    key=lambda t: t["dEntry"])
    rets = [t["r1Ret"] for t in trades]
    roll10 = rolling_ev(rets, window=window)
    roll20 = rolling_ev(rets, window=20)
    taiex_map = {t["date"]: t["chgPct"] for t in taiex}

    # 找每筆 trade 進場前一日的大盤漲跌
    sorted_dates = sorted(taiex_map.keys())
    def prev_taiex(d):
        prev = None
        for dt in sorted_dates:
            if dt < d:
                prev = taiex_map[dt]
            else:
                break
        return prev

    timeline = []
    for i, t in enumerate(trades):
        prev_chg = prev_taiex(t["dEntry"])
        timeline.append({
            "date": t["dEntry"],
            "ret": t["r1Ret"],
            "rollingEv10": roll10[i],
            "rollingEv20": roll20[i],
            "marketYesterdayChg": prev_chg,
            "marketStatus": market_warning_status(prev_chg),
        })

    streak = current_streak_losses(rets)
    latest_ev10 = roll10[-1] if roll10 else None
    latest_ev20 = roll20[-1] if roll20 else None
    last_market = timeline[-1]["marketYesterdayChg"] if timeline else None

    warnings = []
    if latest_ev10 is not None and latest_ev10 <= -1.0:
        warnings.append(f"⛔ rollingEv10 = {latest_ev10}% (≤ -1.0%) — 策略嚴重失效，建議停手觀望")
    elif latest_ev10 is not None and latest_ev10 <= -0.5:
        warnings.append(f"⚠️ rollingEv10 = {latest_ev10}% (≤ -0.5%) — 短期失效，考慮降倉")
    if streak >= 8:
        warnings.append(f"⛔ 連續虧損 {streak} 筆 — 立即停手")
    elif streak >= 5:
        warnings.append(f"⚠️ 連續虧損 {streak} 筆 — 觀察是否進入連敗期")
    if last_market is not None and last_market <= -1.5:
        warnings.append(f"⛔ 大盤前一日 {last_market}% — 隔日 skip 新進場（June 實證 +0.29% 救贖）")

    return {
        "window": window,
        "timeline": timeline,
        "latest": {
            "rollingEv10": latest_ev10,
            "rollingEv20": latest_ev20,
            "streakLosses": streak,
            "marketStatus": market_warning_status(last_market),
            "marketYesterdayChg": last_market,
        },
        "warnings": warnings,
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", type=int, default=10)
    args = ap.parse_args()
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)

    with open(BACKTEST_FILE, encoding="utf-8") as fp:
        bt = json.load(fp)
    if "r1Stats" not in bt:
        print("ERROR: backtest_0903.json 缺 r1Stats，請先跑 P0-2 backtest", file=sys.stderr)
        sys.exit(1)
    trades = bt.get("trades", [])
    taiex = _load_taiex_chg()
    data = build_kill_switch_data(trades, taiex, window=args.window)
    data["updatedAt"] = trades[-1]["dEntry"] if trades else None

    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(data, fp, ensure_ascii=False, indent=2)
    print(f"saved: {OUT_FILE}")
    print(f"latest rolling10={data['latest']['rollingEv10']}% "
          f"streak={data['latest']['streakLosses']} "
          f"market={data['latest']['marketStatus']}")
    for w in data["warnings"]:
        print(" ", w)

if __name__ == "__main__":
    main()
