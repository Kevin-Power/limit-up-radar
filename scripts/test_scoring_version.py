"""TDD: scoring.ts 與 honest_stats.py 的 SCORING_VERSION 必須完全相同。

背景：static audit 發現 scoring.ts / honest_stats.py / run_backtest.py
三套評分邏輯不同步，導致「90+分回測虧 49%」其實是用了不同版本的 score。
從 v3.2 起，兩個檔案頂端都要 export 同名常數 SCORING_VERSION，
本測試守住兩邊不再漂移。
"""
import os
import re
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs


REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCORING_TS = os.path.join(REPO_ROOT, "src", "lib", "scoring.ts")


def _read_ts_scoring_version() -> str:
    with open(SCORING_TS, encoding="utf-8") as f:
        src = f.read()
    # 例：export const SCORING_VERSION = "v3.2-2026-06-27";
    m = re.search(r'export\s+const\s+SCORING_VERSION\s*=\s*"([^"]+)"', src)
    assert m, "scoring.ts 沒有 export const SCORING_VERSION = \"...\""
    return m.group(1)


def test_python_has_scoring_version_attr():
    assert hasattr(hs, "SCORING_VERSION"), "honest_stats.py 缺少 SCORING_VERSION 常數"
    assert isinstance(hs.SCORING_VERSION, str) and hs.SCORING_VERSION


def test_ts_has_scoring_version_export():
    v = _read_ts_scoring_version()
    assert v, "scoring.ts SCORING_VERSION 為空字串"


def test_scoring_version_strings_match():
    ts_v = _read_ts_scoring_version()
    py_v = hs.SCORING_VERSION
    assert ts_v == py_v, (
        f"SCORING_VERSION 不一致：scoring.ts={ts_v!r} vs honest_stats.py={py_v!r}"
    )
