"""把 Sinopac「營收統計速報」.xls 轉成 data/revenue/{period}.json。

用法:
    python scripts/import_revenue.py "C:/path/to/Sinopac...速報....xls"
    python scripts/import_revenue.py <xls> --out data/revenue/2026-05.json

特色：欄位對應以「表頭文字斷言」鎖定 —— 若來源報表欄位順序/名稱變動，
會直接報錯而非默默對錯欄（這正是過去 "industries column mapping" 出包的原因）。

注意：JSON 的 "volume" 欄位實際存的是「本益比 PE」（沿用既有 2026-03/04 的
schema 命名，非真正成交量）。維持一致以免破壞 /revenue 頁與 scoring。
"""
import argparse
import json
import math
import os
import re
import sys

import pandas as pd

# ── 個股主表 欄位索引 ───────────────────────────────────────
S_CODE, S_NAME = 0, 1
S_REVMONTH, S_REVYOY, S_REVYOY3 = 5, 6, 7
S_REVMOM, S_REVMOM3 = 8, 9
S_REVCUM, S_REVCUMYOY, S_REVCUMYOY3 = 10, 11, 12
S_PRICE, S_VOLUME = 13, 14            # col14 = 本益比(PE)，沿用既有 schema 存到 "volume"
S_CHG1, S_CHG5, S_CHG10, S_CHG20, S_CHG40 = 15, 16, 17, 18, 19
S_INDUSTRY = 20

# ── 類股主表 欄位索引 ───────────────────────────────────────
I_NAME, I_COUNT = 1, 2
I_REVMONTH, I_REVYOY, I_REVYOY3 = 3, 4, 5
I_REVMOM, I_REVMOM3 = 6, 7
I_REVCUM, I_REVCUMYOY, I_REVCUMYOY3 = 8, 9, 10
I_PRICE, I_VOLUME = 11, 12
I_CHG1, I_CHG5, I_CHG10, I_CHG20, I_CHG40 = 13, 14, 15, 16, 17


def _assert_contains(header, idx, *needles):
    val = "" if idx >= len(header) or pd.isna(header[idx]) else str(header[idx])
    for n in needles:
        if n not in val:
            raise SystemExit(
                f"表頭斷言失敗：col{idx} 預期含 '{n}'，實際為 '{val}'。"
                f"\n來源報表格式可能已變動，請檢查欄位對應再跑。"
            )


def num(x, ndigits=2):
    """數值 → round 後的 float；空白/非數字 → None。"""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(v):
        return None
    return round(v, ndigits)


def code_str(x):
    if x is None:
        return None
    if isinstance(x, float):
        if math.isnan(x):
            return None
        if x.is_integer():
            return str(int(x))
        return str(x)
    return str(x).strip() or None


def parse_period_and_date(stock_header):
    """從 '202605單月營收(百萬)' 與 '20260610收盤價' 推出 period / dataDate。"""
    m1 = re.search(r"(\d{4})(\d{2})單月營收", str(stock_header[S_REVMONTH]))
    m2 = re.search(r"(\d{4})(\d{2})(\d{2})收盤價", str(stock_header[S_PRICE]))
    if not m1:
        raise SystemExit("無法從表頭推出 period（找不到 'YYYYMM單月營收'）")
    if not m2:
        raise SystemExit("無法從表頭推出 dataDate（找不到 'YYYYMMDD收盤價'）")
    period = f"{m1.group(1)}-{m1.group(2)}"
    data_date = f"{m2.group(1)}-{m2.group(2)}-{m2.group(3)}"
    return period, data_date


def build_stocks(df):
    out = []
    for row in df.itertuples(index=False, name=None):
        code = code_str(row[S_CODE])
        if not code or not re.fullmatch(r"\d{3,6}[A-Z]?", code):
            continue  # 跳過 ▼▲ / 標題 / 合計列
        out.append({
            "code": code,
            "name": str(row[S_NAME]).strip(),
            "revMonth": num(row[S_REVMONTH]),
            "revYoY": num(row[S_REVYOY]),
            "revYoY3yr": num(row[S_REVYOY3]),
            "revMoM": num(row[S_REVMOM]),
            "revMoM3yr": num(row[S_REVMOM3]),
            "revCum": num(row[S_REVCUM]),
            "revCumYoY": num(row[S_REVCUMYOY]),
            "revCumYoY3yr": num(row[S_REVCUMYOY3]),
            "price": num(row[S_PRICE]),
            "volume": num(row[S_VOLUME]),       # = 本益比 PE（既有 schema 命名）
            "chg1d": num(row[S_CHG1]),
            "chg5d": num(row[S_CHG5]),
            "chg10d": num(row[S_CHG10]),
            "chg20d": num(row[S_CHG20]),
            "chg40d": num(row[S_CHG40]),
            "industry": (None if pd.isna(row[S_INDUSTRY]) else str(row[S_INDUSTRY]).strip()),
        })
    return out


def build_industries(df):
    out = []
    for row in df.itertuples(index=False, name=None):
        name = row[I_NAME]
        if name is None or (isinstance(name, float) and math.isnan(name)):
            continue
        name = str(name).strip()
        if not name or name in ("▼", "▲"):
            continue
        cnt = num(row[I_COUNT])
        if cnt is None:
            continue
        out.append({
            "name": name,
            "count": int(round(cnt)),
            "revMonth": num(row[I_REVMONTH]),
            "revYoY": num(row[I_REVYOY]),
            "revYoY3yr": num(row[I_REVYOY3]),
            "revMoM": num(row[I_REVMOM]),
            "revMoM3yr": num(row[I_REVMOM3]),
            "revCum": num(row[I_REVCUM]),
            "revCumYoY": num(row[I_REVCUMYOY]),
            "revCumYoY3yr": num(row[I_REVCUMYOY3]),
            "price": num(row[I_PRICE]),
            "volume": num(row[I_VOLUME]),
            "chg1d": num(row[I_CHG1]),
            "chg5d": num(row[I_CHG5]),
            "chg10d": num(row[I_CHG10]),
            "chg20d": num(row[I_CHG20]),
            "chg40d": num(row[I_CHG40]),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xls", help="Sinopac 營收速報 .xls 路徑")
    ap.add_argument("--out", default=None, help="輸出路徑（預設 data/revenue/{period}.json）")
    args = ap.parse_args()

    xl = pd.ExcelFile(args.xls, engine="xlrd")
    if "個股主表" not in xl.sheet_names or "類股主表" not in xl.sheet_names:
        raise SystemExit(f"找不到預期工作表，實際有：{xl.sheet_names}")

    stock_df = xl.parse("個股主表", header=None)
    ind_df = xl.parse("類股主表", header=None)

    sh = stock_df.iloc[0].tolist()
    ih = ind_df.iloc[0].tolist()
    # 表頭斷言（鎖定欄位對應，格式一變就報錯）
    _assert_contains(sh, S_REVMONTH, "單月營收", "百萬")
    _assert_contains(sh, S_REVYOY, "單月營收YoY")
    _assert_contains(sh, S_REVCUM, "累計營收", "百萬")
    _assert_contains(sh, S_REVCUMYOY, "累計營收YoY")
    _assert_contains(sh, S_PRICE, "收盤價")
    _assert_contains(sh, S_VOLUME, "本益比")
    _assert_contains(sh, S_INDUSTRY, "類股")
    _assert_contains(ih, I_COUNT, "公司數")
    _assert_contains(ih, I_REVMONTH, "單月營收", "億")
    _assert_contains(ih, I_PRICE, "收盤價")
    _assert_contains(ih, I_VOLUME, "本益比")

    period, data_date = parse_period_and_date(sh)
    stocks = build_stocks(stock_df)
    industries = build_industries(ind_df)

    obj = {
        "period": period,
        "dataDate": data_date,
        "source": "Sinopac",
        "totalStocks": len(stocks),
        "industries": industries,
        "stocks": stocks,
    }

    # ── 內建驗證 ────────────────────────────────────────────
    assert 1000 <= len(stocks) <= 2500, f"股票數異常: {len(stocks)}"
    assert 40 <= len(industries) <= 130, f"類股數異常: {len(industries)}"
    keys = {"code", "name", "revMonth", "revYoY", "revYoY3yr", "revMoM", "revMoM3yr",
            "revCum", "revCumYoY", "revCumYoY3yr", "price", "volume",
            "chg1d", "chg5d", "chg10d", "chg20d", "chg40d", "industry"}
    for s in stocks:
        assert set(s.keys()) == keys, f"{s.get('code')} 欄位不符: {set(s.keys()) ^ keys}"
    # revYoY 合理範圍抽檢（大多落在 ±200% 內；極端值也存在但不該全爆）
    yoys = [s["revYoY"] for s in stocks if s["revYoY"] is not None]
    assert yoys, "revYoY 全為 None，疑似對錯欄"

    out_path = args.out or os.path.join("data", "revenue", f"{period}.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)

    print(f"period={period}  dataDate={data_date}  source=Sinopac")
    print(f"stocks={len(stocks)}  industries={len(industries)}  revYoY有值={len(yoys)}")
    print(f"saved: {out_path} ({os.path.getsize(out_path)/1024:.0f} KB)")
    print("\n抽檢前 3 檔：")
    for s in stocks[:3]:
        print(f"  {s['code']} {s['name']:<5} revMonth={s['revMonth']} revYoY={s['revYoY']} "
              f"revCum={s['revCum']} price={s['price']} PE(volume)={s['volume']} ind={s['industry']}")
    print("抽檢前 2 類股：")
    for i in industries[:2]:
        print(f"  {i['name']:<8} count={i['count']} revMonth={i['revMonth']} revYoY={i['revYoY']}")


if __name__ == "__main__":
    main()
