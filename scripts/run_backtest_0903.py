"""09:03 紅K進場策略回測 orchestrator。

流程：載入 daily/營收/分類 → 重建每日 ≥50 精選（無上限）→ 登入永豐 →
供 1 分 K → build_report → 寫 data/backtest_0903.json。

用法：
  set SHIOAJI_API_KEY=... & set SHIOAJI_SECRET_KEY=... & python scripts/run_backtest_0903.py
  選用：--max-days N 只跑最近 N 個選股日（增量/省額度）
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
import backtest_0903 as bt
import shioaji_intraday as si

OUT_FILE = "data/backtest_0903.json"


def build_pick_days(days, rev_maps, heavyweight, known_disposal):
    """每個可當選股日的 i（需有 D+1）→ pick_days 結構。"""
    pick_days = []
    for i in range(len(days) - 1):
        picks = hs.reconstruct_picks(days, i, rev_maps, heavyweight, known_disposal, cap=None)
        if not picks:
            continue
        pick_days.append({
            "pickDate": days[i]["date"],
            "entryDate": days[i + 1]["date"],
            "nextDate": days[i + 2]["date"] if i + 2 < len(days) else None,
            "picks": [{"code": p["code"], "name": p["name"],
                       "score": p["score"], "prevClose": p["close"]} for p in picks],
        })
    return pick_days


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-days", type=int, default=0, help="只跑最近 N 個選股日 (0=全部)")
    args = ap.parse_args()

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    heavyweight, known_disposal = hs.load_categories()
    pick_days = build_pick_days(days, rev_maps, heavyweight, known_disposal)
    if args.max_days > 0:
        pick_days = pick_days[-args.max_days:]
    print(f"選股日 {len(pick_days)} 天，總精選 "
          f"{sum(len(d['picks']) for d in pick_days)} 檔，登入永豐抓 1 分 K...")

    api = si.login()
    try:
        provider = si.make_provider(api)
        report = bt.build_report(pick_days, provider)
    finally:
        try:
            api.logout()
        except Exception:
            pass

    report["updatedAt"] = days[-1]["date"]
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(report, fp, ensure_ascii=False, indent=2)

    f = report["funnel"]
    b = report["best"]
    print(f"\n漏斗：精選 {f['totalPicks']} → 無資料 {f['noData']} → "
          f"通過 {f['passedFilter']} → 成交 {f['traded']}")
    if b:
        print(f"最佳：{b['label']} 勝率{b['winRate']}% 期望值{b['meanNet']}% "
              f"獲利因子{b['profitFactor']} 最大回檔{b['maxDrawdown']}%"
              f"{' [樣本不足]' if b['lowConfidence'] else ''}")
    print(f"穩健性：前半最佳={report['robustness']['firstHalfBest']} "
          f"後半最佳={report['robustness']['secondHalfBest']} "
          f"一致={report['robustness']['consistent']}")
    print(f"saved: {OUT_FILE}")


if __name__ == "__main__":
    main()
