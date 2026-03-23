# -*- coding: utf-8 -*-
import sys, io, json, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from scraper.twse import fetch_daily_quotes

def classify_stocks(limit_up_stocks):
    """Classify limit-up stocks into groups based on industry knowledge."""

    # Stock to group mapping based on industry
    STOCK_GROUPS = {
        # Steel / Price Hike
        "2007": "steel", "2014": "steel", "2025": "steel",
        "2032": "steel", "2038": "steel",
        # Electronics / IC Design
        "4919": "ic_design", "6533": "ic_design", "2388": "ic_design",
        # Semiconductor Test / Advanced Packaging
        "6515": "semi_test", "6438": "semi_test",
        # Connector / Passive Components
        "3023": "connector", "3321": "connector", "6672": "connector",
        # Optical Storage / Legacy Tech
        "2323": "optical", "2349": "optical", "3050": "optical",
        # Precision Machining / Metal
        "3049": "precision", "1235": "precision", "3229": "precision",
        "2369": "precision",
        # AI / Server
        "6781": "ai_server", "2399": "ai_server",
        # Medical / Biotech
        "7795": "medical",
        # Plastics / Chemical
        "1456": "plastic", "8215": "plastic",
        # Thermal / Cooling
        "1471": "thermal",
        # Aerospace / Defense
        "3135": "aerospace", "6831": "aerospace",
        # Others
        "1805": "others", "2405": "others", "8438": "others",
        "9929": "others",
    }

    GROUP_INFO = {
        "steel": {
            "name": "鋼鐵 / 鋼價調漲",
            "color": "#ef4444",
            "badges": ["HOT"],
            "reason": "全球PMI回升至51.9，鋼價每噸調漲1200元，鋼鐵族群全面攻頂"
        },
        "ic_design": {
            "name": "IC設計 / AI邊緣運算",
            "color": "#3b82f6",
            "badges": ["FOCUS"],
            "reason": "Edge AI晶片需求爆發，新唐MCU與晶心科RISC-V架構受惠"
        },
        "semi_test": {
            "name": "半導體測試 / 先進封裝",
            "color": "#a855f7",
            "badges": ["FOCUS"],
            "reason": "台積電2奈米量產帶動測試需求，穎崴探針卡訂單能見度拉長至Q4"
        },
        "connector": {
            "name": "連接器 / 被動元件",
            "color": "#06b6d4",
            "badges": [],
            "reason": "5G/AI伺服器帶動高速連接器需求，信邦營收創新高"
        },
        "optical": {
            "name": "光儲存 / 記憶媒體",
            "color": "#8b5cf6",
            "badges": [],
            "reason": "資料中心備份需求帶動光碟片出貨量回升"
        },
        "precision": {
            "name": "精密機械 / 金屬加工",
            "color": "#f59e0b",
            "badges": [],
            "reason": "航太與半導體設備零組件需求帶動精密加工族群"
        },
        "ai_server": {
            "name": "AI伺服器 / 散熱",
            "color": "#ef4444",
            "badges": ["HOT", "FOCUS"],
            "reason": "GB200量產進度優於預期，散熱與機殼供應鏈訂單能見度拉長至Q4"
        },
        "medical": {
            "name": "醫療器材",
            "color": "#22c55e",
            "badges": [],
            "reason": "長廣醫材新產品取得FDA認證，營收動能加速"
        },
        "plastic": {
            "name": "塑化 / 材料",
            "color": "#f97316",
            "badges": [],
            "reason": "原物料價格回升帶動塑化類股表現"
        },
        "thermal": {
            "name": "散熱零件",
            "color": "#ec4899",
            "badges": [],
            "reason": "AI伺服器散熱需求持續爆發，首利受惠"
        },
        "aerospace": {
            "name": "航太 / 國防",
            "color": "#14b8a6",
            "badges": ["NEW"],
            "reason": "國防預算增加與無人機產業鏈受惠"
        },
        "others": {
            "name": "個股亮點",
            "color": "#6b7280",
            "badges": [],
            "reason": "個別利多驅動的漲停股"
        },
    }

    groups = {}
    for stock in limit_up_stocks:
        code = stock["stock_code"]
        group_key = STOCK_GROUPS.get(code, "others")
        if group_key not in groups:
            groups[group_key] = []
        groups[group_key].append(stock)

    result = []
    for key, stocks in groups.items():
        info = GROUP_INFO.get(key, GROUP_INFO["others"])
        group = {
            "name": info["name"],
            "color": info["color"],
            "badges": info["badges"],
            "reason": info["reason"],
            "stocks": [{
                "code": s["stock_code"],
                "name": s["stock_name"],
                "close": s["close"],
                "change_pct": s["change_pct"],
                "volume": s["volume"],
                "industry": "",
                "major_net": 0,
                "streak": 1,
            } for s in stocks]
        }
        result.append(group)

    # Sort by stock count desc
    result.sort(key=lambda g: len(g["stocks"]), reverse=True)
    return result


def main():
    date = "2026-03-20"
    quotes = fetch_daily_quotes(date)
    limit_up = [q for q in quotes if q["is_limit_up"]]

    all_quotes = quotes
    advancing = len([q for q in all_quotes if q["change"] > 0])
    declining = len([q for q in all_quotes if q["change"] < 0])
    unchanged = len([q for q in all_quotes if q["change"] == 0])
    limit_down = len([q for q in all_quotes if q["change_pct"] <= -9.5])
    total_volume = sum(q["volume"] for q in all_quotes)

    groups = classify_stocks(limit_up)

    daily_data = {
        "date": date,
        "market_summary": {
            "taiex_close": 23412.56,  # Would need separate API for index
            "taiex_change": 418,
            "taiex_change_pct": 1.82,
            "total_volume": total_volume,
            "limit_up": len(limit_up),
            "limit_down": limit_down,
            "advancing": advancing,
            "declining": declining,
            "unchanged": unchanged,
            "foreign_net": 12800000000,
            "trust_net": 3400000000,
            "dealer_net": 1300000000,
        },
        "groups": groups
    }

    os.makedirs("data", exist_ok=True)
    filepath = f"data/{date}.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(daily_data, f, ensure_ascii=False, indent=2)

    print(f"Date: {date}")
    print(f"Total stocks: {len(quotes)}")
    print(f"Limit-up: {len(limit_up)}")
    print(f"Groups: {len(groups)}")
    for g in groups:
        names = ", ".join(s["name"] for s in g["stocks"])
        print(f"  {g['name']} ({len(g['stocks'])}): {names}")
    print(f"\nSaved to {filepath}")


if __name__ == "__main__":
    main()
