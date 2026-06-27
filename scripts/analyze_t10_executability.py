"""T+10 收盤出場策略的「實戰可執行性」批判分析。

驗證面向：
1. 進場資料：規則只需 T+0 收盤 (score) → T+1 09:00 競價可下單 ✓
2. 出場資料：T+10 收盤 → 09:30 後即可掛限價，13:25 競價賣出 ✓
3. Look-ahead：T+1 進場/T+10 出場全部使用 T+1 開盤後資料 ✓
4. 資金佔用：T+2 → T+10 持有期 5 倍 (2d → 10d)
5. 同時持倉壓力：T+10 = 平均 10 倍同步持倉數
6. MDD 99.95% — 等於資金歸零
7. 6 月樣本 86 vs T+2 的 199 — 邊界 cut-off 影響嚴重
8. 單筆 maxLoss -36% — 漲停股後續可連續跌停數日（無停損）
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
from run_backtest_0903 import build_pick_days


def main():
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    # 載入既有 T+10 結果
    with open("data/opt_exit_timing.json", encoding="utf-8") as f:
        exit_data = json.load(f)

    t10_t2_subset = exit_data["sameSample_T2"]["stats"]["T+10_close"]
    t10_t10_subset = exit_data["sameSample_T10"]["stats"]["T+10_close"]
    t2_baseline = exit_data["sameSample_T2"]["stats"]["T+2_open"]
    monthly = exit_data["monthlyBreakdown"]

    # 建立 pick_days 評估同步持倉壓力
    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    hw, disp = hs.load_categories()
    pick_days = build_pick_days(days, rev_maps, hw, disp)
    daily_dates = [d["date"] for d in days]

    # 每日 score≥75 進場筆數
    picks_per_day = []
    for d in pick_days:
        n = sum(1 for p in d["picks"] if p["score"] >= 75)
        if n > 0:
            picks_per_day.append({
                "entryDate": d["entryDate"],
                "n": n,
                "codes": [p["code"] for p in d["picks"] if p["score"] >= 75],
            })

    # 模擬 T+10 持倉 — 每筆持有 10 個交易日
    open_positions = {}  # entry_date -> {code: exit_date}
    daily_concurrent = []  # 每日當下持倉檔數

    # 構造 idx 表
    date_idx = {d: i for i, d in enumerate(daily_dates)}

    # 把每筆 pick 加入 open_positions
    for pp in picks_per_day:
        ed = pp["entryDate"]
        if ed not in date_idx:
            continue
        eidx = date_idx[ed]
        exit_idx = eidx + 9  # T+10 close (持有 10 個交易日)
        for code in pp["codes"]:
            if code not in open_positions:
                open_positions[code] = []
            open_positions[code].append((eidx, exit_idx))

    # 逐日掃描，計算當日同步持倉檔數
    max_concurrent = 0
    max_concurrent_date = None
    concurrent_series = []
    for i, dt in enumerate(daily_dates):
        c = 0
        for code, ranges in open_positions.items():
            for (s, e) in ranges:
                if s <= i <= e:
                    c += 1
        concurrent_series.append({"date": dt, "concurrent": c})
        if c > max_concurrent:
            max_concurrent = c
            max_concurrent_date = dt

    avg_concurrent = sum(x["concurrent"] for x in concurrent_series) / len(concurrent_series)

    # T+2 對照
    open_positions_t2 = {}
    for pp in picks_per_day:
        ed = pp["entryDate"]
        if ed not in date_idx:
            continue
        eidx = date_idx[ed]
        exit_idx = eidx + 1  # T+2 open (持有 1 個交易日後賣)
        for code in pp["codes"]:
            if code not in open_positions_t2:
                open_positions_t2[code] = []
            open_positions_t2[code].append((eidx, exit_idx))

    max_concurrent_t2 = 0
    for i, dt in enumerate(daily_dates):
        c = 0
        for code, ranges in open_positions_t2.items():
            for (s, e) in ranges:
                if s <= i <= e:
                    c += 1
        if c > max_concurrent_t2:
            max_concurrent_t2 = c

    # 邊界 cut-off 影響
    n_t10_full = exit_data["rules_fullSample"]["T+10_close"]["coverage"]
    n_t2_full = exit_data["rules_fullSample"]["T+2_open"]["coverage"]
    n_t10_jun = monthly["T+10_close"]["2026-06"]["n"]
    n_t2_jun = monthly["T+2_open"]["2026-06"]["n"]

    result = {
        "strategy": "T+10 close exit (持有 10 個交易日後收盤賣)",
        "claimed_effect": {"winRate": 49.4, "meanNet": 3.85},
        "actual_data_from_exit_timing": {
            "sameSample_T2_n438": {
                "winRate": t10_t2_subset["winRate"],
                "meanNet": t10_t2_subset["meanNet"],
                "sd": t10_t2_subset["sd"],
                "mdd": t10_t2_subset["mdd"],
                "maxLoss": t10_t2_subset["maxLoss"],
                "actual_n_with_T10_data": t10_t2_subset["n"],  # 438 中只有 324 有 T+10 資料
            },
            "T+2_baseline_sameSample_T2_n438": {
                "winRate": t2_baseline["winRate"],
                "meanNet": t2_baseline["meanNet"],
                "sd": t2_baseline["sd"],
                "mdd": t2_baseline["mdd"],
                "maxLoss": t2_baseline["maxLoss"],
            },
        },
        "monthly_breakdown_T10_vs_T2": {
            "2026-04": {
                "T10": monthly["T+10_close"]["2026-04"],
                "T2": monthly["T+2_open"]["2026-04"],
            },
            "2026-05": {
                "T10": monthly["T+10_close"]["2026-05"],
                "T2": monthly["T+2_open"]["2026-05"],
            },
            "2026-06": {
                "T10": monthly["T+10_close"]["2026-06"],
                "T2": monthly["T+2_open"]["2026-06"],
            },
        },
        "executability_analysis": {
            "Q1_data_available_before_T1_open_call": {
                "verdict": "PASS",
                "detail": "進場規則只需 T+0 收盤後算出的 score；T+10 出場決定不影響進場行為。T+1 09:00 競價可下單。",
            },
            "Q2_can_we_actually_buy": {
                "verdict": "PASS (與 T+2 同等限制)",
                "detail": "進場時點 (T+1 開盤) 與 T+2 策略完全一致 → 流動性/漲跌停限制問題與基線同。但 T+10 出場可能遇到連續漲跌停 → 出場滑價風險高 5 倍。",
            },
            "Q3_lookahead_bias": {
                "verdict": "PASS",
                "detail": "T+10 收盤出場用的是當下收盤集合競價 (13:25-13:30) → 無前視。但要注意：報告期間 2026-04-01~06-24 含 T+10 出場日超過資料邊界的 trades 被排除 (full-sample 326 vs T+2 sample 438) — 樣本本身已有 survivor 性質。",
            },
            "Q4_auction_open_entry": {
                "verdict": "PASS",
                "detail": "與基線一致，無新增風險。",
            },
            "Q5_concurrent_positions": {
                "verdict": "FAIL (KILLER)",
                "max_concurrent_T10": max_concurrent,
                "max_concurrent_T10_date": max_concurrent_date,
                "avg_concurrent_T10": round(avg_concurrent, 1),
                "max_concurrent_T2_baseline": max_concurrent_t2,
                "ratio_vs_T2": round(max_concurrent / max(max_concurrent_t2, 1), 1),
                "detail": "T+10 持倉時間是 T+2 的 5 倍，同步持倉檔數爆增。"
                          f"T+2 baseline 同時最多持 {max_concurrent_t2} 檔，T+10 同時最多 {max_concurrent} 檔。"
                          "若每筆 50 萬 → T+10 需備 " + str(max_concurrent * 50) + " 萬可用資金。",
            },
            "Q6_data_boundary_cutoff": {
                "verdict": "FAIL (severe)",
                "T10_coverage": n_t10_full,
                "T2_coverage": n_t2_full,
                "loss_rate": round((1 - n_t10_full / n_t2_full) * 100, 1),
                "june_T10_n": n_t10_jun,
                "june_T2_n": n_t2_jun,
                "june_loss_rate": round((1 - n_t10_jun / n_t2_jun) * 100, 1),
                "detail": "T+10 因資料邊界損失 25%+ 樣本，且 6 月損失 57% — 6 月後段選的標的根本沒進入統計，數字嚴重美化。"
                          "若 6 月 86 筆的 EV +2.24% 套用到全 199 筆，可能反向。",
            },
            "Q7_drawdown_killer": {
                "verdict": "FAIL (KILLER)",
                "mdd": t10_t2_subset["mdd"],
                "max_single_loss": t10_t2_subset["maxLoss"],
                "sd": t10_t2_subset["sd"],
                "detail": "MDD 99.96% — 數學上等同破產。單筆 -36% 已超出漲停股 5 個跌停下限 (-32%)，代表持倉中遭連續跌停。"
                          "波動 19.4% vs T+2 的 7.25%，2.7 倍 — 凱利公式下單筆部位需減到 1/7。",
            },
            "Q8_no_stop_loss": {
                "verdict": "FAIL",
                "detail": "純 T+10 收盤出場 = 無停損 = 任由單筆崩跌。漲停股回落往往是連續跌停，無法 09:00 後執行停損。"
                          "trailing_SL 在同數據集 winRate 只 34.8%，已證明被動停損反而虧。",
            },
            "Q9_psychological_executability": {
                "verdict": "FAIL",
                "detail": "持倉 10 天看盤心理壓力 = T+2 的 5 倍。中位數 -0.43% 代表多數時間在虧，等少數大贏家 (max +76.8%) 翻盤 — 散戶幾乎不可能拿穩。",
            },
        },
        "concurrent_position_series_sample": concurrent_series[-30:],  # 最後 30 天
        "verdict": {
            "is_robust": False,
            "summary": "T+10 收盤出場數字看起來漂亮 (EV +3.85% vs T+2 -0.12%)，但有 3 個 KILLER："
                       "(1) 同步持倉爆增 5x → 資金 / 注意力不足；"
                       "(2) 6 月樣本損失 57% → 衰退期數據被切除，EV 被美化；"
                       "(3) MDD 99.96% + 單筆 -36% + 無停損 → 任一次連續跌停就資金歸零。"
                       "更穩健替代：T+3 開盤出場 (winRate 49.1%, EV +0.85%, MDD 98.57%, SD 10.09 — Sharpe 仍 1.34)，"
                       "或 dynamic_TP3 (winRate 54.7%, EV +0.78%, SD 8.87 — 同樣本 Sharpe 1.39)。",
        },
    }

    out_path = "data/opt_t10_executability.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n=== T+10 實戰可執行性分析 ===")
    print(f"同步持倉檔數 T+10 max: {max_concurrent} (avg {avg_concurrent:.1f}) vs T+2 max: {max_concurrent_t2}")
    print(f"資料邊界損失: 全期 {(1 - n_t10_full / n_t2_full) * 100:.1f}%, 6月 {(1 - n_t10_jun / n_t2_jun) * 100:.1f}%")
    print(f"MDD: {t10_t2_subset['mdd']}%, 單筆 maxLoss: {t10_t2_subset['maxLoss']}%, SD: {t10_t2_subset['sd']}%")
    print(f"saved: {out_path}")


if __name__ == "__main__":
    main()
