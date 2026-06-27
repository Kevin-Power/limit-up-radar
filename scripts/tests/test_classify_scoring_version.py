"""TDD: classify_and_save.py 必須把 SCORING_VERSION 寫進 daily JSON。

目的：讓回測 / kill switch / Backtest0903 可以驗證歷史資料是用哪個版本的評分算的。
舊檔案無此欄位 → 回測時當作 "legacy" 處理。
"""
import pathlib
import re

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
CLASSIFY_PATH = REPO_ROOT / "scripts" / "classify_and_save.py"
CLASSIFY_SRC = CLASSIFY_PATH.read_text(encoding="utf-8")


def test_classify_imports_scoring_version():
    """classify_and_save.py 必須 import SCORING_VERSION (來自 honest_stats)。"""
    # 接受 `from honest_stats import ... SCORING_VERSION ...`
    # 或 `from scripts.honest_stats import ... SCORING_VERSION ...`
    # 或 `import honest_stats` + 使用 honest_stats.SCORING_VERSION
    has_from_import = re.search(
        r"from\s+(?:scripts\.)?honest_stats\s+import\s+[^\n]*SCORING_VERSION",
        CLASSIFY_SRC,
    )
    has_module_use = (
        re.search(r"import\s+(?:scripts\.)?honest_stats", CLASSIFY_SRC)
        and "honest_stats.SCORING_VERSION" in CLASSIFY_SRC
    )
    assert has_from_import or has_module_use, (
        "classify_and_save.py 必須 import SCORING_VERSION（from honest_stats import SCORING_VERSION 或等價形式）"
    )


def test_daily_data_includes_scoring_version():
    """daily_data dict 必須含 scoringVersion 欄位且值來自 SCORING_VERSION 常數。"""
    # 在 daily_data = { ... } 的 dict 中要有 "scoringVersion": SCORING_VERSION
    # 用較寬鬆 regex 容許單/雙引號與空白
    pattern = re.compile(
        r'["\']scoringVersion["\']\s*:\s*SCORING_VERSION',
    )
    assert pattern.search(CLASSIFY_SRC), (
        'daily_data 必須含 "scoringVersion": SCORING_VERSION 欄位'
    )


def test_scoring_version_field_in_daily_data_block():
    """scoringVersion 必須出現在 daily_data 區塊內（不能放在無關地方）。"""
    # 找到 `daily_data = {` 起點，往下抓到對應的 `}`（簡化：抓到 1500 字內）
    m = re.search(r"daily_data\s*=\s*\{", CLASSIFY_SRC)
    assert m, "找不到 daily_data = { 區塊"
    # 取 daily_data 起點往下 1500 字
    block = CLASSIFY_SRC[m.start():m.start() + 1500]
    assert "scoringVersion" in block, (
        "scoringVersion 必須出現在 daily_data dict 內部"
    )
