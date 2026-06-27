"""評分修補單元測試。

修補來源：data/strategy_analysis.json 的 90+ 屍體解剖
- prevVolume >= 20000 lots cohort 全市場 win 31.2% → 強烈 cohort 黑名單
- major_net > 0 cohort 在 90+ win 54.8% vs major_net=0 win 69.2% → 法人小買不加分
- heavyweight cohort win 50% vs 非 55.5%（中性偏負）→ 權值股加分降為 +10
"""
import re
import pathlib

SCORING = pathlib.Path("src/lib/scoring.ts").read_text(encoding="utf-8")


def test_high_volume_blacklist_exists():
    """prevVolume >= 20000 lots 應該有顯式扣分或 tag。"""
    # 接受 -25 / -30 / -50 任一強扣分數
    assert re.search(r"lots\s*>=?\s*20[_]?000.*?score\s*-=\s*(25|30|50)",
                     SCORING, re.S), "缺少 lots >= 20000 過熱量能扣分"


def test_major_net_small_buy_no_bonus():
    """major_net > 0 (小於 200K) 應移除 +5 加分（屍體解剖證實無效）。"""
    # 原本：else if (stock.major_net > 0) { score += 5; tags.push("法人小買超"); }
    # 應變為：移除整個 branch 或 +0
    # 簡單檢查：「法人小買超」tag 不應再附帶 +5
    assert not re.search(r"major_net\s*>\s*0\s*\)\s*\{\s*score\s*\+=\s*5",
                         SCORING), "法人小買超 +5 應移除"


def test_heavyweight_bonus_downgraded():
    """權值股加分從 +25 降為 +10（cohort win 50%，原 +25 過度推升至 90+）。"""
    assert re.search(r"isHeavyweight\s*\)\s*\{\s*score\s*\+=\s*10",
                     SCORING), "isHeavyweight 加分應為 +10"
    assert not re.search(r"isHeavyweight\s*\)\s*\{\s*score\s*\+=\s*25",
                         SCORING), "isHeavyweight 不應再 +25"
