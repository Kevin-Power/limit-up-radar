"""驗證 daily-update.yml 包含 kill_switch step 與 commit kill_switch.json。

workflow YAML 沒辦法跑 unit test，但可以做：
  1. YAML 解析合法
  2. 含 'Run kill switch calc' step
  3. step 用 continue-on-error
  4. step gate: data_found == 'true'
  5. 'Commit and push data' step 的 git add 含 data/kill_switch.json
"""
import os
import yaml

WORKFLOW_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..",
    ".github", "workflows", "daily-update.yml"
)


def _load():
    with open(WORKFLOW_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _steps():
    data = _load()
    return data["jobs"]["fetch-and-push"]["steps"]


def test_yaml_parses():
    data = _load()
    assert "jobs" in data
    assert "fetch-and-push" in data["jobs"]


def test_kill_switch_step_present():
    steps = _steps()
    names = [s.get("name", "") for s in steps]
    assert "Run kill switch calc" in names, f"step 名稱列表: {names}"


def test_kill_switch_step_continue_on_error():
    steps = _steps()
    ks = next(s for s in steps if s.get("name") == "Run kill switch calc")
    assert ks.get("continue-on-error") is True


def test_kill_switch_step_gated_on_data_found():
    steps = _steps()
    ks = next(s for s in steps if s.get("name") == "Run kill switch calc")
    cond = ks.get("if", "")
    assert "data_found" in cond and "true" in cond


def test_kill_switch_step_calls_script():
    steps = _steps()
    ks = next(s for s in steps if s.get("name") == "Run kill switch calc")
    run_block = ks.get("run", "")
    assert "scripts/run_kill_switch.py" in run_block
    assert "data/backtest_0903.json" in run_block


def test_kill_switch_step_after_backtest():
    """kill_switch 必須在 Run real backtest 之後（讀取 backtest_0903.json）。"""
    steps = _steps()
    names = [s.get("name", "") for s in steps]
    backtest_idx = next(
        (i for i, n in enumerate(names) if "Run real backtest" in n), -1
    )
    ks_idx = names.index("Run kill switch calc")
    assert backtest_idx >= 0
    assert ks_idx > backtest_idx, "kill_switch 必須在 backtest step 之後"


def test_commit_step_includes_kill_switch_json():
    steps = _steps()
    commit_step = next(s for s in steps if s.get("name") == "Commit and push data")
    run_block = commit_step.get("run", "")
    assert "data/kill_switch.json" in run_block
