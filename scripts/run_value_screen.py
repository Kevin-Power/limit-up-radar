"""長期價值選股 CLI。

跑出符合「連續5年ROE>15% + 連續5年稅後淨利>5億」的台股，並依使用者公式
算出 合理價值 / 安全邊際價 / 便宜‧合理‧昂貴價，輸出到：
  - SQLite 資料表 value_screen
  - data/value-screen.json（結構化，可供前端使用）
  - data/value-screen.md（人類可讀報表）

用法（在本機，網路須可連 api.finmindtrade.com）：
    export FINMIND_TOKEN="你的token"          # 可選，但強烈建議
    # 掃整個市場（量大、慢）
    python -m scripts.run_value_screen --limit 0
    # 只掃自選清單
    python -m scripts.run_value_screen --codes 2330,2912,5904,1264,2395
    # 只掃 0050 權值股（讀 data/categories.json heavyweight）
    python -m scripts.run_value_screen --heavyweight

注意：本沙箱（Claude 雲端環境）的對外網路被限制，只能連 GitHub，故無法在此
即時抓 FinMind。請於本機執行。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date

from scraper.db import init_db, get_connection, DEFAULT_DB_PATH
from scraper.finmind import (
    FinMindClient,
    FinMindError,
    NET_INCOME_PARENT_KEYWORDS,
    EQUITY_PARENT_KEYWORDS,
    ORDINARY_SHARE_KEYWORDS,
)
from scraper import value_screener as vs

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def load_universe(args, client: FinMindClient) -> list[dict]:
    if args.codes:
        codes = [c.strip() for c in args.codes.split(",") if c.strip()]
        return [{"stock_id": c, "stock_name": "", "industry_category": ""} for c in codes]

    if args.heavyweight:
        path = os.path.join(DATA_DIR, "categories.json")
        with open(path, encoding="utf-8") as f:
            cats = json.load(f)
        codes = cats.get("heavyweight", {}).get("codes", {})
        return [
            {"stock_id": c, "stock_name": n, "industry_category": ""}
            for c, n in codes.items()
        ]

    universe = client.stock_list()
    if args.listed_only:
        universe = [u for u in universe if u.get("type") == "twse"]
    if args.limit and args.limit > 0:
        universe = universe[: args.limit]
    return universe


def evaluate_one(client: FinMindClient, info: dict, latest_year: int, start_date: str, args) -> vs.ScreenResult:
    code = info["stock_id"]
    fs = client.financial_statement(code, start_date)
    bs = client.balance_sheet(code, start_date)
    per_rows = client.per(code, start_date)

    net_income = vs.extract_annual(fs, NET_INCOME_PARENT_KEYWORDS)
    equity = vs.extract_annual(bs, EQUITY_PARENT_KEYWORDS)
    share_cap = vs.extract_annual(bs, ORDINARY_SHARE_KEYWORDS)
    pe_hl = vs.yearly_pe_high_low(per_rows)

    current_price = None
    dividend_yield = None
    if per_rows:
        last = per_rows[-1]
        try:
            dividend_yield = float(last.get("dividend_yield"))
        except (TypeError, ValueError):
            pass
    try:
        price_rows = client.price(code, start_date=f"{latest_year + 1}-01-01")
        if price_rows:
            current_price = float(price_rows[-1].get("close"))
    except (FinMindError, TypeError, ValueError):
        pass

    return vs.evaluate_stock(
        stock_code=code,
        stock_name=info.get("stock_name", ""),
        industry=info.get("industry_category", ""),
        latest_year=latest_year,
        net_income_parent=net_income,
        equity_parent=equity,
        ordinary_share_capital=share_cap,
        pe_high_low=pe_hl,
        current_price=current_price,
        dividend_yield=dividend_yield,
        years=args.years,
        roe_min=args.roe_min,
        net_income_min=args.ni_min,
    )


def save_db(results: list[vs.ScreenResult], run_date: str) -> None:
    init_db()
    conn = get_connection()
    for r in results:
        conn.execute(
            """INSERT OR REPLACE INTO value_screen
               (run_date, latest_year, stock_code, stock_name, industry, passed,
                avg_roe, min_roe, min_net_income, latest_bvps, reasonable_pe,
                pe_high_avg, pe_low_avg, cheap_price, fair_value, expensive_price,
                margin_price, current_price, upside_pct, dividend_yield, note)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (run_date, r.latest_year, r.stock_code, r.stock_name, r.industry,
             int(r.passed), r.avg_roe, r.min_roe, r.min_net_income, r.latest_bvps,
             r.reasonable_pe, r.pe_high_avg, r.pe_low_avg, r.cheap_price,
             r.fair_value, r.expensive_price, r.margin_price, r.current_price,
             r.upside_pct, r.dividend_yield, r.note),
        )
    conn.commit()
    conn.close()


def _fmt(v, nd=2):
    return f"{v:.{nd}f}" if isinstance(v, (int, float)) else "—"


def write_reports(results: list[vs.ScreenResult], run_date: str, latest_year: int) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    passed = [r for r in results if r.passed]

    # JSON
    with open(os.path.join(DATA_DIR, "value-screen.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "_meta": {
                    "runDate": run_date,
                    "latestYear": latest_year,
                    "rule": "連續5年ROE>15% + 連續5年稅後淨利>5億；合理價值=淨值×平均ROE×最合理本益比；安全邊際=合理價值/1.2",
                    "scanned": len(results),
                    "passed": len(passed),
                },
                "picks": [r.to_row() for r in results],
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    # Markdown
    lines = [
        f"# 長期價值選股名單（{run_date}，採用 {latest_year} 年報）",
        "",
        "規則：連續 5 年 ROE>15% 且 連續 5 年稅後淨利>5 億。",
        "合理價值 = 最新年度每股淨值 × 五年平均ROE × 最合理本益比；安全邊際價 = 合理價值 / 1.2。",
        "",
        f"掃描 {len(results)} 檔，符合 **{len(passed)}** 檔。",
        "",
        "| 代號 | 名稱 | 產業 | 平均ROE% | 最低ROE% | 最新淨值 | 合理PE | 便宜價 | 合理價值 | 安全邊際價 | 現價 | 折溢價% | 殖利率% |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in passed:
        lines.append(
            f"| {r.stock_code} | {r.stock_name} | {r.industry} | "
            f"{_fmt(r.avg_roe,1)} | {_fmt(r.min_roe,1)} | {_fmt(r.latest_bvps)} | "
            f"{_fmt(r.reasonable_pe,1)} | {_fmt(r.cheap_price)} | {_fmt(r.fair_value)} | "
            f"{_fmt(r.margin_price)} | {_fmt(r.current_price)} | {_fmt(r.upside_pct,1)} | "
            f"{_fmt(r.dividend_yield,2)} |"
        )
    lines += [
        "",
        "> 折溢價% = (合理價值/現價 − 1)×100，正值代表現價低於合理價值。",
        "> 操作參考：現價 ≤ 安全邊際價才分批「慢慢買」；成本 +20% 停利；不設停損（除非跌出上述條件）。",
        "> 數字依公開財報計算，僅供研究，非投資建議。",
    ]
    with open(os.path.join(DATA_DIR, "value-screen.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    p = argparse.ArgumentParser(description="長期價值選股")
    p.add_argument("--codes", help="自選股票代號，逗號分隔（如 2330,2912）")
    p.add_argument("--heavyweight", action="store_true", help="只掃 0050 權值股")
    p.add_argument("--listed-only", action="store_true", help="只掃上市(twse)")
    p.add_argument("--limit", type=int, default=50, help="掃描檔數上限（0=全部）")
    p.add_argument("--years", type=int, default=5, help="連續年數")
    p.add_argument("--roe-min", type=float, default=15.0, help="ROE 門檻，百分比")
    p.add_argument("--ni-min", type=float, default=500_000_000.0, help="稅後淨利門檻(元)")
    p.add_argument("--latest-year", type=int, default=None, help="最新財報年度（預設自動推算）")
    p.add_argument("--token", default=None, help="FinMind token（預設讀 FINMIND_TOKEN）")
    args = p.parse_args()

    latest_year = args.latest_year or vs.default_latest_year()
    start_date = f"{latest_year - args.years}-01-01"
    run_date = date.today().isoformat()
    client = FinMindClient(token=args.token)

    print(f"=== 長期價值選股 ===")
    print(f"最新年度: {latest_year}　視窗: {latest_year - args.years + 1}~{latest_year}")
    print(f"門檻: ROE>{args.roe_min}%　稅後淨利>{args.ni_min/1e8:.0f}億　連續{args.years}年")
    print()

    try:
        universe = load_universe(args, client)
    except FinMindError as e:
        print(f"取得股票清單失敗：{e}", file=sys.stderr)
        sys.exit(1)
    print(f"待掃描 {len(universe)} 檔\n")

    results: list[vs.ScreenResult] = []
    for i, info in enumerate(universe, 1):
        code = info["stock_id"]
        try:
            r = evaluate_one(client, info, latest_year, start_date, args)
            results.append(r)
            flag = "✓符合" if r.passed else " "
            print(f"[{i}/{len(universe)}] {code} {info.get('stock_name',''):<6} {flag}")
        except FinMindError as e:
            print(f"[{i}/{len(universe)}] {code} 取得失敗：{e}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001  單檔出錯不中斷整批
            print(f"[{i}/{len(universe)}] {code} 計算錯誤：{e}", file=sys.stderr)

    results = vs.sort_picks(results)
    save_db(results, run_date)
    write_reports(results, run_date, latest_year)

    passed = [r for r in results if r.passed]
    print(f"\n=== 完成：掃描 {len(results)} 檔，符合 {len(passed)} 檔 ===")
    for r in passed:
        up = f"{r.upside_pct:+.1f}%" if r.upside_pct is not None else "—"
        print(f"  {r.stock_code} {r.stock_name:<6} 合理價值 {(_fmt(r.fair_value)):>8}  "
              f"安全邊際 {(_fmt(r.margin_price)):>8}  現價 {(_fmt(r.current_price)):>8}  折溢價 {up}")
    print("\n報表已寫入 data/value-screen.md 與 data/value-screen.json")


if __name__ == "__main__":
    main()
