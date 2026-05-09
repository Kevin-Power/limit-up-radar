"""
每日產生 LINE 群分享素材：文字版 + PNG 圖片版

用法：
  python scripts/generate_line_post.py             # 抓線上最新
  python scripts/generate_line_post.py --local     # 用本地 data/
  python scripts/generate_line_post.py --top 10    # 只取 TOP 10（預設 20）

輸出到 line_post/ 目錄，檔名會自動帶日期：
  line_post/{下次交易日}_觀察名單.txt
  line_post/{下次交易日}_觀察名單.png
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta
from urllib import request

from PIL import Image, ImageDraw, ImageFont

# ─── Config ───────────────────────────────────────────────
SITE = "https://limit-up-radar.vercel.app"
PASSWORD = os.environ.get("AUTH_PASSWORD", "jA6-UrARO2PPvKLb")
FONT_BD = "C:/Windows/Fonts/msjhbd.ttc"
FONT_RG = "C:/Windows/Fonts/msjh.ttc"

# Colors
BG = (15, 23, 42)
CARD = (30, 41, 59)
RED = (239, 68, 68)
AMBER = (245, 158, 11)
GREEN = (16, 185, 129)
BLUE = (59, 130, 246)
WHITE = (248, 250, 252)
MUTE = (148, 163, 184)
DIM = (100, 116, 139)


def fetch_focus_online():
    """Login and fetch /api/focus from production."""
    # Login
    body = json.dumps({"password": PASSWORD}).encode("utf-8")
    req = request.Request(
        f"{SITE}/api/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=30) as r:
        cookie = r.headers.get("set-cookie", "")
        token = ""
        for part in cookie.split(";"):
            if part.strip().startswith("session="):
                token = part.strip().split("=", 1)[1]
                break
    if not token:
        raise RuntimeError("Login failed - no session cookie")

    # Fetch focus
    req = request.Request(f"{SITE}/api/focus", headers={"Cookie": f"session={token}"})
    with request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_focus_local():
    """Compute focus locally from data/ (does not need server running)."""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    daily_dir = os.path.join(project_root, "data", "daily")
    bt_file = os.path.join(project_root, "data", "backtest.json")

    files = sorted(f for f in os.listdir(daily_dir) if f.endswith(".json"))
    if not files:
        raise RuntimeError("No daily data found")

    today_path = os.path.join(daily_dir, files[-1])
    with open(today_path, encoding="utf-8") as f:
        today = json.load(f)
    with open(bt_file, encoding="utf-8") as f:
        bt = json.load(f)

    # Reuse online format minimally
    return {
        "date": today["date"],
        "taiex": today["market_summary"]["taiex_close"],
        "taiexChg": today["market_summary"]["taiex_change_pct"],
        "totalLimitUp": sum(len(g["stocks"]) for g in today["groups"]),
        "trendingGroups": [],  # local fallback skips trending
        "focusStocks": [],
        "realBacktest": {
            "avgOpenWinRate": bt["avgOpenWinRate"],
            "avgOpenReturn": bt["avgOpenReturn"],
            "totalSamples": bt["totalSamples"],
            "totalDays": bt["totalDays"],
        },
    }


def short_g(name):
    return name.replace(" / ", "・").replace("AI邊緣運算", "AI邊緣").replace("醫療器材", "醫材")


def next_trading_day(date_str):
    """Skip Sat/Sun. Returns YYYY-MM-DD."""
    d = datetime.strptime(date_str, "%Y-%m-%d")
    d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def build_text(d, picks, next_day):
    bt = d["realBacktest"]
    # Use plain [N] instead of variation-selector emoji to avoid
    # font fallback issues on phones / old text editors
    n_emoji = [f"[{i:>2}]" for i in range(1, 21)]

    md = next_day[5:7].lstrip("0") + "/" + next_day[8:10].lstrip("0")
    text = f"""🔥 {md} 觀察名單 TOP {len(picks)}
━━━━━━━━━━━━━━━━━━
📊 平台回測 {bt['totalSamples']} 樣本
   隔日開盤勝率 {bt['avgOpenWinRate']}%／報酬 +{bt['avgOpenReturn']}%
📅 資料日期：{d['date']}
📈 大盤 {d['taiex']:,.0f}（{d['taiexChg']:+.2f}%）
🔴 今日漲停 {d['totalLimitUp']} 檔／{len(d.get('trendingGroups', []))} 個延續族群
"""
    if d.get("trendingGroups"):
        text += "\n🎯 延續強勢族群（連 ≥2 天）\n"
        for g in d["trendingGroups"]:
            text += f"  ・{short_g(g['name'])}（連{g['days']}天 / {g['todayCount']}檔）\n"

    # Group separators by score tier
    tiers = [(90, "🔴 90 分組｜首選優先"),
             (85, "🟠 85 分組"),
             (80, "🟡 80 分組"),
             (75, "🔵 75 分組"),
             (65, "⚪ 65-70 分組"),
             (50, "⚫ 50-60 分組")]
    last_tier = None
    for i, p in enumerate(picks, 1):
        # Find tier for this stock
        tier_label = None
        for thr, lbl in tiers:
            if p["score"] >= thr:
                tier_label = lbl
                break
        if tier_label != last_tier:
            text += f"\n━━━━━━━━━━━━━━━━━━\n{tier_label}\n━━━━━━━━━━━━━━━━━━\n"
            last_tier = tier_label

        rev = f"營收+{int(p['revYoY'])}%" if p.get("revYoY") and p["revYoY"] > 0 else ""
        net = f"法人+{int(p['majorNet']/1000)}張" if p.get("majorNet", 0) > 0 else ""
        tag_str = "／".join([t for t in [rev, net] if t])

        text += f"\n{n_emoji[i-1]} {p['code']} {p['name']} ${p['close']}\n"
        text += f"   {short_g(p['group'])}"
        if p.get("groupDays", 0) >= 2:
            text += f"（連{p['groupDays']}天）"
        text += "\n"
        if tag_str:
            text += f"   {tag_str}\n"
        text += f"   追${p['entryAggressive']}／停${p['stopLoss']}／標${p['target1']}-${p['target2']}\n"

    text += """
━━━━━━━━━━━━━━━━━━
📌 操作建議
━━━━━━━━━━━━━━━━━━
✓ 進場：09:00 開盤
✓ 出場：09:00-09:05 內市價賣
✓ 單檔上限：總資金 10%
✓ 總部位：不超過 50%

⚠️ 過去績效不代表未來
⚠️ 99 樣本 / 10 天偏多頭區間
⚠️ 本訊息僅供參考，不構成投資建議

📱 完整分析 → limit-up-radar.vercel.app
"""
    return text


def build_image(d, picks, next_day):
    bt = d["realBacktest"]
    W, H = 1080, 1920
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    def f(size, bold=True):
        # Explicit index=0 to load the main CJK weight in Microsoft JhengHei TTC
        return ImageFont.truetype(FONT_BD if bold else FONT_RG, size, index=0)

    for y in range(0, H, 40):
        for x in range(0, W, 40):
            draw.point((x, y), fill=(30, 41, 59))

    y = 50
    md = next_day[5:7].lstrip("0") + "/" + next_day[8:10].lstrip("0")
    draw.text((40, y), "// 股文觀指", font=f(36, True), fill=RED)
    draw.text((W - 40, y + 8), f"{md} 觀察名單", font=f(28, True), fill=MUTE, anchor="ra")
    y += 60
    draw.text((40, y), f"下週 TOP {len(picks)}", font=f(72, True), fill=WHITE)
    y += 95

    box_h = 180
    draw.rectangle([(40, y), (W - 40, y + box_h)], fill=CARD, outline=RED, width=3)
    draw.text((W // 2, y + 25), "平台真實回測勝率", font=f(28, False), fill=MUTE, anchor="ma")
    draw.text((W // 2, y + 60), f"{bt['avgOpenWinRate']}%", font=f(110, True), fill=RED, anchor="ma")
    draw.text((W // 2, y + 155), f"{bt['totalSamples']} 樣本 · 10 天 · 平均 +{bt['avgOpenReturn']}%",
              font=f(22, False), fill=MUTE, anchor="ma")
    y += box_h + 30

    draw.text((40, y), f"📈 TAIEX {d['taiex']:,.0f}", font=f(28, True), fill=WHITE)
    chg_color = GREEN if d["taiexChg"] < 0 else RED
    draw.text((40 + 280, y), f"({d['taiexChg']:+.2f}%)", font=f(28, True), fill=chg_color)
    draw.text((W - 40, y), f"今日漲停 {d['totalLimitUp']} 檔", font=f(28, True), fill=AMBER, anchor="ra")
    y += 50
    draw.line([(40, y), (W - 40, y)], fill=DIM, width=1)
    y += 30

    def score_color(s):
        if s >= 90: return RED
        if s >= 80: return AMBER
        if s >= 70: return BLUE
        return MUTE

    col_w = (W - 80 - 20) // 2
    left_x, right_x = 40, 40 + col_w + 20
    row_h = 100
    half = (len(picks) + 1) // 2
    for i, p in enumerate(picks):
        col = 0 if i < half else 1
        row = i if col == 0 else i - half
        x = left_x if col == 0 else right_x
        yy = y + row * row_h

        draw.rectangle([(x, yy), (x + col_w, yy + row_h - 10)], fill=CARD)
        sc = p["score"]
        draw.rectangle([(x, yy), (x + 8, yy + row_h - 10)], fill=score_color(sc))
        draw.text((x + 25, yy + 10), f"{i+1:>2}", font=f(28, True), fill=score_color(sc))
        draw.text((x + 25, yy + 45), f"{sc}分", font=f(18, True), fill=score_color(sc))

        code_x = x + 95
        draw.text((code_x, yy + 8), p["code"], font=f(26, True), fill=WHITE)
        name = p["name"][:5] if len(p["name"]) > 5 else p["name"]
        draw.text((code_x + 90, yy + 10), name, font=f(22, True), fill=WHITE)
        draw.text((x + col_w - 15, yy + 10), f"${p['close']}", font=f(22, True), fill=AMBER, anchor="ra")

        grp = short_g(p["group"])[:12]
        draw.text((code_x, yy + 45), grp, font=f(16, False), fill=MUTE)

        tags = []
        if p.get("revYoY") and p["revYoY"] > 0:
            tags.append(f"營收+{int(p['revYoY'])}%")
        if p.get("majorNet", 0) > 0:
            tags.append(f"法人+{int(p['majorNet']/1000)}張")
        if p.get("groupDays", 0) >= 2:
            tags.append(f"連{p['groupDays']}天")
        draw.text((code_x, yy + 68), " · ".join(tags[:2])[:25], font=f(15, False), fill=DIM)

    y += half * row_h + 10

    draw.line([(40, y), (W - 40, y)], fill=DIM, width=1)
    y += 25
    draw.text((W // 2, y), "📌 進場 09:00 ｜ 出場 09:05 內市價賣", font=f(24, True), fill=AMBER, anchor="ma")
    y += 45
    draw.text((W // 2, y), "單檔不超過總資金 10% ｜ 總部位不超過 50%", font=f(20, False), fill=MUTE, anchor="ma")
    y += 50
    draw.text((W // 2, y), "⚠️ 過去績效不代表未來 · 本訊息僅供參考，不構成投資建議",
              font=f(18, False), fill=DIM, anchor="ma")
    y += 35
    draw.text((W // 2, y), "limit-up-radar.vercel.app", font=f(22, True), fill=RED, anchor="ma")

    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true", help="Use local data instead of online API")
    ap.add_argument("--top", type=int, default=20, help="Number of picks (default 20)")
    args = ap.parse_args()

    print("Fetching focus data...")
    if args.local:
        d = fetch_focus_local()
        if not d.get("focusStocks"):
            print("ERROR: --local mode needs full focus computation, not yet supported.")
            print("Run without --local to fetch from production API.")
            sys.exit(1)
    else:
        d = fetch_focus_online()

    picks = d["focusStocks"][:args.top]
    if not picks:
        print("No picks found.")
        sys.exit(1)

    next_day = next_trading_day(d["date"])

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(project_root, "line_post")
    os.makedirs(out_dir, exist_ok=True)

    md = next_day[5:7] + next_day[8:10]
    txt_path = os.path.join(out_dir, f"{next_day}_觀察名單.txt")
    png_path = os.path.join(out_dir, f"{next_day}_觀察名單.png")

    text = build_text(d, picks, next_day)
    with open(txt_path, "w", encoding="utf-8") as fp:
        fp.write(text)
    print(f"Saved: {txt_path} ({len(text):,} 字)")

    img = build_image(d, picks, next_day)
    img.save(png_path, "PNG", quality=95)
    print(f"Saved: {png_path} ({os.path.getsize(png_path)/1024:.0f} KB)")

    print(f"\n下次交易日: {next_day}")
    print(f"TOP {len(picks)} 檔已產出（資料日期 {d['date']}）")


if __name__ == "__main__":
    main()
