"""評分修補單元測試。

修補來源：data/strategy_analysis.json 的 90+ 屍體解剖
- prevVolume >= 20000 lots cohort 全市場 win 31.2% → 強烈 cohort 黑名單
- major_net > 0 cohort 在 90+ win 54.8% vs major_net=0 win 69.2% → 法人小買不加分
- heavyweight cohort win 50% vs 非 55.5%（中性偏負）→ 權值股加分降為 +10

過熱量能 (lots >= 20000) 相關測試以「行為測試」為主：實際呼叫
`scoreStock()`（透過 Node native TS strip），對回傳的 score / tags 做斷言。
這避免了純 regex 在重構或抽常數時誤判 fail。
"""
import json
import os
import pathlib
import re
import shutil
import subprocess

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SCORING_PATH = REPO_ROOT / "src" / "lib" / "scoring.ts"
SCORING = SCORING_PATH.read_text(encoding="utf-8")
RUNNER = REPO_ROOT / "scripts" / "tests" / "_score_runner.mjs"


def _run_score(stock_kwargs: dict, **extra) -> dict:
    """Invoke scoreStock through Node + TS-strip and return {score, tags}."""
    node = shutil.which("node")
    if node is None:
        pytest.skip("node not on PATH — skipping behavior test")
    payload = {
        "stock": {
            "code": "0000",
            "name": "TEST",
            "close": 100.0,
            "volume": 0,
            "major_net": 0,
            "streak": 0,
            **stock_kwargs,
        },
        "group": {"name": "_test_group", "color": "#000", "stocks": []},
        "trendingGroups": [],
        **extra,
    }
    proc = subprocess.run(
        [node, "--experimental-strip-types", str(RUNNER), json.dumps(payload)],
        capture_output=True, cwd=str(REPO_ROOT),
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
    )
    stdout = proc.stdout.decode("utf-8", errors="replace")
    stderr = proc.stderr.decode("utf-8", errors="replace")
    assert proc.returncode == 0, f"runner failed: {stderr}"
    # Runner prints JSON on its last stdout line; strip Node warnings if any.
    last_line = stdout.strip().splitlines()[-1]
    return json.loads(last_line)


# ── 行為測試：高量黑名單 ─────────────────────────────────────────────
def test_high_volume_blacklist_behavior():
    """volume = 20_000 lots（2千萬股）應觸發「過熱量能」tag。

    比較 just-below vs just-at threshold 兩次呼叫的 score 差，
    應等於 -25（過熱量能扣分），與其他無關訊號隔離。
    """
    high = _run_score({"volume": 20_000_000})  # 20_000 lots（恰好觸發）
    low = _run_score({"volume": 19_999_000})  # 19_999 lots（剛好未觸發）
    assert any("過熱量能" in t for t in high["tags"]), high["tags"]
    assert not any("過熱量能" in t for t in low["tags"]), low["tags"]
    # 兩者除 lots 之外完全相同 → score 差就是過熱量能那一條規則的貢獻
    assert (high["score"] - low["score"]) == -25, (
        f"expected delta = -25, got high={high['score']} low={low['score']}"
    )


def test_high_volume_threshold_boundary():
    """剛好低於門檻 (19_999 lots) 不應該觸發過熱量能扣分。"""
    result = _run_score({"volume": 19_999_000})
    assert not any("過熱量能" in t for t in result["tags"]), result["tags"]


def test_volume_none_falls_back_to_zero_lots():
    """volume = None / NaN 應視為 0 lots，走「量極小」branch (-30)。"""
    result = _run_score({"volume": None})
    assert result["score"] == -30, f"expected -30 for null volume, got {result['score']}"
    assert any("量極小" in t for t in result["tags"]), result["tags"]


def test_volume_zero_treated_as_extreme_low():
    """volume = 0 走「量極小」(-30)，不是「過熱量能」。"""
    result = _run_score({"volume": 0})
    assert result["score"] == -30
    assert any("量極小" in t for t in result["tags"])
    assert not any("過熱量能" in t for t in result["tags"])


# ── 既有 source-level 斷言（放寬，允許具名常數）───────────────────
def test_high_volume_blacklist_source_marker():
    """source 應出現「過熱量能」tag 字串（重構保險）。"""
    assert "過熱量能" in SCORING, "scoring.ts 應包含 過熱量能 tag"
    # 接受字面常數或具名常數；只要與 score -= 25/30/50 同段就好。
    assert re.search(
        r"score\s*-=\s*(25|30|50|[A-Z_][A-Z0-9_]*)\s*;\s*\n\s*tags\.push\(\"⚠️過熱量能\"\)",
        SCORING,
    ), "缺少過熱量能扣分結構"


# ── P1-3 / P1-4 placeholder（尚未實作；現階段預期 fail）────────────
@pytest.mark.xfail(reason="P1-3 尚未實作：法人小買 +5 仍存在", strict=False)
def test_major_net_small_buy_no_bonus():
    """major_net > 0 (小於 200K) 應移除 +5 加分（屍體解剖證實無效）。"""
    assert not re.search(r"major_net\s*>\s*0\s*\)\s*\{\s*score\s*\+=\s*5",
                         SCORING), "法人小買超 +5 應移除"


def test_heavyweight_bonus_downgraded():
    """權值股加分從 +25 降為 +10（cohort win 50%，原 +25 過度推升至 90+）。"""
    # 允許 if (isHeavyweight) { 與 score += 10 之間有註解或空白
    assert re.search(r"isHeavyweight\s*\)\s*\{[\s\S]*?score\s*\+=\s*10",
                     SCORING), "isHeavyweight 加分應為 +10"
    assert not re.search(r"isHeavyweight\s*\)\s*\{[\s\S]*?score\s*\+=\s*25",
                         SCORING), "isHeavyweight 不應再 +25"
