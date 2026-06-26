# 09:03 紅K進場策略回測 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為「精選追蹤標的（score≥50）」回測「隔日 09:03 紅K且高於昨收才進場」策略，用永豐 Shioaji 真實 1 分 K，跑多種出場規則挑最佳，結果呈現在 `/backtest` 頁。

**Architecture:** 沿用現有「Python 離線算 → 寫 JSON → Next.js 讀」模式。重用 `scripts/honest_stats.py` 的選股重建（`reconstruct_picks`，完整 scoring 鏡像）與統計（`summarize`/`wilson_ci`）。新增純函式模組做進出場模擬，IO 模組封裝 Shioaji+磁碟快取，orchestrator 串接並寫 `data/backtest_0903.json`，前端新增 `/api/backtest-0903` 與 `Backtest0903` 區塊。

**Tech Stack:** Python 3.13 + `shioaji` 1.3.2（已安裝）、pytest；Next.js (App Router) + TypeScript + Tailwind。

**成本模型（與專案既有 `honest_stats` 一致，扣百分點）：** 當沖來回 `COST_DAYTRADE=0.435`（0.1425%×2 + 當沖稅0.15%）；隔夜 `COST_OVERNIGHT=0.585`（0.1425%×2 + 隔日稅0.30%）。挑最佳一律看**淨報酬**。

**參考檔案：** `scripts/honest_stats.py`（重用）、`scripts/test_honest_stats.py`（測試風格）、`scripts/run_backtest.py`（舊回測）、`src/app/api/public/stats/route.ts`（讀 JSON 範式）、`src/app/backtest/_client.tsx`（前端樣式）。

---

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `scripts/honest_stats.py` | 修改 | `reconstruct_picks` 加 `cap` 參數（向後相容，預設不變） |
| `scripts/backtest_0903.py` | 新增 | **純函式**：進場訊號、出場模擬、成本、指標、挑最佳、組報告 |
| `scripts/shioaji_intraday.py` | 新增 | **IO**：Shioaji 登入/抓 1 分 K + 磁碟快取（pandas 解析） |
| `scripts/run_backtest_0903.py` | 新增 | orchestrator：載入資料→選股→供 bars→`build_report`→寫 JSON |
| `scripts/test_backtest_0903.py` | 新增 | `backtest_0903` 純函式單元測試 + orchestrator smoke 測試 |
| `.gitignore` | 修改 | 忽略 `data/intraday_cache/` |
| `src/app/api/backtest-0903/route.ts` | 新增 | 讀 `data/backtest_0903.json` |
| `src/components/Backtest0903.tsx` | 新增 | 09:03 策略報告區塊（KPI/規則表/漏斗/明細） |
| `src/app/backtest/_client.tsx` | 修改 | 於 `<main>` 頂部插入 `<Backtest0903 />` |

> 純函式（`backtest_0903.py`）與 IO（`shioaji_intraday.py`）分離，讓模擬邏輯可不靠線上 API 測試。

---

## Task 1: `reconstruct_picks` 加 `cap` 參數（重用選股、解除 20 檔上限）

**Files:**
- Modify: `scripts/honest_stats.py:181-225`
- Test: `scripts/test_honest_stats.py`（新增一個測試）

- [ ] **Step 1: 寫失敗測試**

在 `scripts/test_honest_stats.py` 末尾新增：

```python
# ── reconstruct_picks cap 參數（09:03 回測需全部 ≥50）──────────
def test_reconstruct_picks_cap_none_returns_all():
    days = [{
        "date": "2026-06-10",
        "groups": [{"name": "G", "stocks": [
            {"code": f"{1000+i}", "name": f"s{i}", "close": 10.0,
             "volume": 6_000_000, "major_net": 1, "streak": 2}
            for i in range(25)
        ]}],
    }]
    # 趨勢族群需 2 天才成立；單日 → 不加 30，但量+5/法人+20/連板+15=40 < 50
    # 為了讓全部 ≥50，補一天讓 G 變趨勢族群（+30 → 70）
    days = [{"date": "2026-06-09", "groups": days[0]["groups"]}, days[0]]
    picks_capped = hs.reconstruct_picks(days, 1, [], set(), set())          # 預設 cap=20
    picks_all = hs.reconstruct_picks(days, 1, [], set(), set(), cap=None)   # 無上限
    assert len(picks_capped) == 20
    assert len(picks_all) == 25
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python -m pytest scripts/test_honest_stats.py::test_reconstruct_picks_cap_none_returns_all -v`
Expected: FAIL — `reconstruct_picks() got an unexpected keyword argument 'cap'`

- [ ] **Step 3: 改 `reconstruct_picks` 簽章與回傳**

`scripts/honest_stats.py`：把函式定義那行（約 181 行）改為帶 `cap`：

```python
def reconstruct_picks(days, i, rev_maps, heavyweight, known_disposal, cap=MAX_PICKS):
    """重建第 i 天的選股（≥50），依分數降冪。cap=None → 不設上限。"""
```

並把最後一行（約 225 行）`return picks[:MAX_PICKS]` 改為：

```python
    picks.sort(key=lambda p: -p["score"])
    return picks if cap is None else picks[:cap]
```

- [ ] **Step 4: 跑測試確認通過（含回歸）**

Run: `python -m pytest scripts/test_honest_stats.py -v`
Expected: PASS（新測試通過，且既有測試全綠）

- [ ] **Step 5: Commit**

```bash
git add scripts/honest_stats.py scripts/test_honest_stats.py
git commit -m "refactor(honest_stats): reconstruct_picks 加 cap 參數 (09:03 回測重用)"
```

---

## Task 2: 進場訊號（`bar_at_0903` / `entry_signal`）

**Files:**
- Create: `scripts/backtest_0903.py`
- Test: `scripts/test_backtest_0903.py`

bar 結構：`{"time": "HH:MM", "open": float, "high": float, "low": float, "close": float}`，依時間升冪。

- [ ] **Step 1: 寫失敗測試**

建立 `scripts/test_backtest_0903.py`：

```python
"""09:03 進場策略回測純函式測試。"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backtest_0903 as bt


def _bars(seq):
    """seq=[(time, o,h,l,c)] → bar dict list。"""
    return [{"time": t, "open": o, "high": h, "low": l, "close": c}
            for (t, o, h, l, c) in seq]


# ── bar_at_0903 ─────────────────────────────────────────────
def test_bar_at_0903_exact():
    bars = _bars([("09:01", 10, 10, 10, 10), ("09:03", 11, 12, 11, 11.5)])
    assert bt.bar_at_0903(bars)["close"] == 11.5


def test_bar_at_0903_fallback_nearest_before():
    # 缺 09:03，取 ≤09:03 最近一根（09:02）
    bars = _bars([("09:01", 10, 10, 10, 10), ("09:02", 10, 11, 10, 10.8),
                  ("09:05", 12, 12, 12, 12)])
    assert bt.bar_at_0903(bars)["close"] == 10.8


def test_bar_at_0903_none_when_starts_too_late():
    bars = _bars([("09:07", 10, 10, 10, 10)])
    assert bt.bar_at_0903(bars) is None


# ── entry_signal ────────────────────────────────────────────
def test_entry_signal_red_k_above_prev_close():
    bars = _bars([("09:01", 100, 101, 100, 100.5), ("09:03", 100.5, 103, 100.5, 102)])
    sig = bt.entry_signal(bars, prev_close=99.0)
    assert sig == {"open": 100, "p0903": 102, "entered": True}


def test_entry_signal_red_k_but_below_prev_close():
    bars = _bars([("09:01", 100, 101, 100, 100.5), ("09:03", 100.5, 101, 100.5, 100.8)])
    sig = bt.entry_signal(bars, prev_close=101.0)   # 102>open but 100.8<101 昨收
    assert sig["entered"] is False


def test_entry_signal_not_red_k_locked_limit_up():
    # 跳空鎖漲停：開盤=09:03 持平 → 非紅K
    bars = _bars([("09:01", 110, 110, 110, 110), ("09:03", 110, 110, 110, 110)])
    sig = bt.entry_signal(bars, prev_close=100.0)
    assert sig["entered"] is False


def test_entry_signal_none_when_no_0903():
    bars = _bars([("09:08", 100, 100, 100, 100)])
    assert bt.entry_signal(bars, prev_close=99.0) is None
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python -m pytest scripts/test_backtest_0903.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backtest_0903'`

- [ ] **Step 3: 建立 `backtest_0903.py` 進場區段**

```python
"""09:03 紅K進場策略回測 — 純函式（進場/出場/成本/指標/挑最佳）。

bar 結構：{"time":"HH:MM","open","high","low","close"}，依時間升冪。
重用 honest_stats.summarize 做分布統計。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from honest_stats import summarize  # noqa: E402

# ── 成本（扣百分點，與 honest_stats 一致）────────────────────
COST_DAYTRADE = 0.435    # 0.1425%×2 + 當沖稅 0.15%
COST_OVERNIGHT = 0.585   # 0.1425%×2 + 隔日稅 0.30%

_OPEN = "09:00"
_T0903 = "09:03"
_CUTOFF = "09:06"   # 09:06 前都無成交 → 視為無 09:03 價


def bar_at_0903(bars):
    """取 time=='09:03' 的 K；缺則取 ≤09:03 最近一根；若第一根 >09:06 → None。"""
    if not bars:
        return None
    candidates = [b for b in bars if _OPEN <= b["time"] <= _T0903]
    if candidates:
        return candidates[-1]
    # 無 ≤09:03 的 bar：若最早一根已晚於 09:06，放棄
    first = min(bars, key=lambda b: b["time"])
    if first["time"] > _CUTOFF:
        return None
    return first


def entry_signal(bars, prev_close):
    """回 {"open","p0903","entered"}；無法取 09:03 價 → None。
    entered = (p0903 > open) and (p0903 > prev_close)。
    """
    b = bar_at_0903(bars)
    if b is None or not bars:
        return None
    day_open = bars[0]["open"]
    p0903 = b["close"]
    entered = (p0903 > day_open) and (p0903 > prev_close)
    return {"open": day_open, "p0903": p0903, "entered": entered}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `python -m pytest scripts/test_backtest_0903.py -v`
Expected: PASS（6 個進場相關測試全綠）

- [ ] **Step 5: Commit**

```bash
git add scripts/backtest_0903.py scripts/test_backtest_0903.py
git commit -m "feat(backtest_0903): 進場訊號 bar_at_0903/entry_signal + 測試"
```

---

## Task 3: 出場模擬（簡單出場 + 停利停損逐K + 成本）

**Files:**
- Modify: `scripts/backtest_0903.py`
- Test: `scripts/test_backtest_0903.py`

- [ ] **Step 1: 寫失敗測試**

在 `scripts/test_backtest_0903.py` 末尾新增：

```python
# ── simple_return ───────────────────────────────────────────
def test_simple_return_daytrade():
    # 進100 出105 毛+5%，扣當沖0.435 → 4.57（四捨五入兩位）
    assert bt.simple_return(100, 105, bt.COST_DAYTRADE) == pytest.approx(4.57, abs=0.01)


def test_simple_return_loss_overnight():
    assert bt.simple_return(100, 98, bt.COST_OVERNIGHT) == pytest.approx(-2.585, abs=0.01)


# ── simulate_tp_sl（逐K路徑）────────────────────────────────
def _after(seq):
    return [{"time": t, "high": h, "low": l, "close": c} for (t, h, l, c) in seq]


def test_tp_sl_take_profit_hit_first():
    bars = _after([("09:04", 103, 101, 102), ("09:05", 106, 104, 105)])  # 第2根觸 +5%
    # tp5 → 毛+5 扣0.435 = 4.57
    assert bt.simulate_tp_sl(100, bars, tp_pct=5, sl_pct=3, day_close=104,
                             cost=bt.COST_DAYTRADE) == pytest.approx(4.57, abs=0.01)


def test_tp_sl_stop_loss_hit_first():
    bars = _after([("09:04", 101, 96, 97)])   # low96 ≤ 97(sl3) 觸停損
    assert bt.simulate_tp_sl(100, bars, tp_pct=5, sl_pct=3, day_close=104,
                             cost=bt.COST_DAYTRADE) == pytest.approx(-3.435, abs=0.01)


def test_tp_sl_same_bar_both_assumes_stop_loss():
    bars = _after([("09:04", 106, 96, 100)])  # 同根同觸停利停損 → 保守取停損
    assert bt.simulate_tp_sl(100, bars, tp_pct=5, sl_pct=3, day_close=104,
                             cost=bt.COST_DAYTRADE) == pytest.approx(-3.435, abs=0.01)


def test_tp_sl_none_triggered_exits_at_close():
    bars = _after([("09:04", 102, 99, 101), ("13:30", 103, 100, 102)])  # 都沒觸發
    # 收盤102 毛+2 扣0.435 = 1.565
    assert bt.simulate_tp_sl(100, bars, tp_pct=5, sl_pct=3, day_close=102,
                             cost=bt.COST_DAYTRADE) == pytest.approx(1.565, abs=0.01)


# ── simulate_exit 分派 ──────────────────────────────────────
def _trade(**kw):
    base = {"entry": 100, "dayClose": 105, "nextOpen": 106, "nextClose": 104,
            "barsAfter": _after([("13:30", 105, 100, 105)])}
    base.update(kw)
    return base


def test_simulate_exit_daytrade_close():
    r = bt.simulate_exit(_trade(), {"key": "daytrade_close", "kind": "daytrade_close"})
    assert r == pytest.approx(4.57, abs=0.01)


def test_simulate_exit_next_open():
    r = bt.simulate_exit(_trade(), {"key": "next_open", "kind": "next_open"})
    assert r == pytest.approx(5.415, abs=0.01)   # 進100 出106 毛+6 扣0.585


def test_simulate_exit_next_open_missing_data_returns_none():
    r = bt.simulate_exit(_trade(nextOpen=None), {"key": "next_open", "kind": "next_open"})
    assert r is None
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python -m pytest scripts/test_backtest_0903.py -k "return or tp_sl or simulate_exit" -v`
Expected: FAIL — `AttributeError: module 'backtest_0903' has no attribute 'simple_return'`

- [ ] **Step 3: 加出場函式**

於 `scripts/backtest_0903.py` 末尾新增：

```python
def simple_return(entry, exit_price, cost):
    """毛報酬% 減成本%。"""
    gross = (exit_price - entry) / entry * 100
    return round(gross - cost, 3)


def simulate_tp_sl(entry, bars_after, tp_pct, sl_pct, day_close, cost):
    """逐根掃 09:03 後的 K：先觸停損則 -sl，先觸停利則 +tp，
    同根同觸假設先停損（保守）；都沒觸 → 收盤平倉。回淨報酬%。"""
    tp_price = entry * (1 + tp_pct / 100)
    sl_price = entry * (1 - sl_pct / 100)
    for b in bars_after:
        hit_sl = b["low"] <= sl_price
        hit_tp = b["high"] >= tp_price
        if hit_sl:                      # 含同根同觸 → 保守停損優先
            return round(-sl_pct - cost, 3)
        if hit_tp:
            return round(tp_pct - cost, 3)
    gross = (day_close - entry) / entry * 100
    return round(gross - cost, 3)


def simulate_exit(trade, rule):
    """依 rule['kind'] 分派；缺必要資料回 None。
    trade 需含 entry, dayClose, nextOpen, nextClose, barsAfter。"""
    kind = rule["kind"]
    if kind == "daytrade_close":
        return simple_return(trade["entry"], trade["dayClose"], COST_DAYTRADE)
    if kind == "next_open":
        if trade.get("nextOpen") is None:
            return None
        return simple_return(trade["entry"], trade["nextOpen"], COST_OVERNIGHT)
    if kind == "next_close":
        if trade.get("nextClose") is None:
            return None
        return simple_return(trade["entry"], trade["nextClose"], COST_OVERNIGHT)
    if kind == "tp_sl":
        return simulate_tp_sl(trade["entry"], trade["barsAfter"],
                              rule["tp"], rule["sl"], trade["dayClose"], COST_DAYTRADE)
    raise ValueError(f"unknown rule kind: {kind}")
```

- [ ] **Step 4: 跑測試確認通過**

Run: `python -m pytest scripts/test_backtest_0903.py -v`
Expected: PASS（全部進場+出場測試綠）

- [ ] **Step 5: Commit**

```bash
git add scripts/backtest_0903.py scripts/test_backtest_0903.py
git commit -m "feat(backtest_0903): 出場模擬 simple/tp_sl/simulate_exit + 測試"
```

---

## Task 4: 指標（獲利因子 / 最大回檔 / 規則彙總）

**Files:**
- Modify: `scripts/backtest_0903.py`
- Test: `scripts/test_backtest_0903.py`

- [ ] **Step 1: 寫失敗測試**

末尾新增：

```python
# ── profit_factor / max_drawdown ────────────────────────────
def test_profit_factor():
    assert bt.profit_factor([2, -1, 3, -2]) == pytest.approx(5 / 3, abs=0.01)


def test_profit_factor_no_losses_returns_none():
    assert bt.profit_factor([1, 2, 3]) is None


def test_max_drawdown_simple():
    # +10% 後 -20% → 從 110 跌到 88，回檔 (110-88)/110=20%
    assert bt.max_drawdown([10, -20]) == pytest.approx(20.0, abs=0.1)


def test_max_drawdown_all_up_zero():
    assert bt.max_drawdown([1, 2, 3]) == 0.0


# ── aggregate_rule ──────────────────────────────────────────
def test_aggregate_rule_basic():
    agg = bt.aggregate_rule([2.0, -1.0, 3.0, -2.0])
    assert agg["trades"] == 4
    assert agg["winRate"] == pytest.approx(50.0)
    assert agg["meanNet"] == pytest.approx(0.5)
    assert agg["totalNet"] == pytest.approx(2.0)
    assert agg["maxWin"] == 3.0 and agg["maxLoss"] == -2.0


def test_aggregate_rule_drops_none():
    agg = bt.aggregate_rule([1.0, None, -1.0])
    assert agg["trades"] == 2
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python -m pytest scripts/test_backtest_0903.py -k "profit_factor or drawdown or aggregate" -v`
Expected: FAIL — `AttributeError: ... 'profit_factor'`

- [ ] **Step 3: 加指標函式**

末尾新增：

```python
def profit_factor(rets):
    """總獲利 / 總虧損；無虧損且有獲利 → None（前端顯示 ∞）。"""
    gains = sum(r for r in rets if r > 0)
    losses = -sum(r for r in rets if r < 0)
    if losses == 0:
        return None if gains > 0 else 0.0
    return round(gains / losses, 2)


def max_drawdown(rets):
    """依序複利建權益曲線，回最大回檔%（正數）。"""
    eq = 100.0
    peak = 100.0
    mdd = 0.0
    for r in rets:
        eq *= (1 + r / 100)
        peak = max(peak, eq)
        mdd = max(mdd, (peak - eq) / peak * 100)
    return round(mdd, 2)


def aggregate_rule(rets):
    """淨報酬序列（可含 None）→ 規則級指標 dict。"""
    rets = [r for r in rets if r is not None]
    s = summarize(rets)
    return {
        "trades": s["samples"],
        "winRate": s["winRate"],
        "meanNet": s["mean"],
        "medianNet": s["median"],
        "totalNet": round(sum(rets), 2) if rets else 0,
        "profitFactor": profit_factor(rets),
        "maxDrawdown": max_drawdown(rets),
        "maxWin": round(max(rets), 2) if rets else None,
        "maxLoss": round(min(rets), 2) if rets else None,
    }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `python -m pytest scripts/test_backtest_0903.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/backtest_0903.py scripts/test_backtest_0903.py
git commit -m "feat(backtest_0903): profit_factor/max_drawdown/aggregate_rule + 測試"
```

---

## Task 5: 規則註冊表 + 挑最佳 + 穩健性

**Files:**
- Modify: `scripts/backtest_0903.py`
- Test: `scripts/test_backtest_0903.py`

- [ ] **Step 1: 寫失敗測試**

末尾新增：

```python
# ── EXIT_RULES ──────────────────────────────────────────────
def test_exit_rules_registry():
    keys = {r["key"] for r in bt.EXIT_RULES}
    assert {"daytrade_close", "next_open", "next_close"} <= keys
    # 12 組停利停損 (4 TP × 3 SL)
    assert sum(1 for r in bt.EXIT_RULES if r["kind"] == "tp_sl") == 12
    assert len(bt.EXIT_RULES) == 15


# ── pick_best ───────────────────────────────────────────────
def test_pick_best_by_expectancy_with_min_trades():
    rules = [
        {"key": "a", "label": "A", "trades": 40, "meanNet": 1.0, "profitFactor": 1.5, "winRate": 55},
        {"key": "b", "label": "B", "trades": 40, "meanNet": 2.0, "profitFactor": 1.8, "winRate": 60},
        {"key": "c", "label": "C", "trades": 5,  "meanNet": 9.0, "profitFactor": 9.9, "winRate": 99},
    ]
    best = bt.pick_best(rules, min_trades=30)
    assert best["key"] == "b"            # c 樣本不足被排除
    assert best["lowConfidence"] is False


def test_pick_best_falls_back_when_none_eligible():
    rules = [{"key": "tp5_sl3", "label": "x", "trades": 5, "meanNet": 3.0,
              "profitFactor": 2.0, "winRate": 70}]
    best = bt.pick_best(rules, min_trades=30)
    assert best["key"] == "tp5_sl3"
    assert best["lowConfidence"] is True
    assert "過擬合" in best["caveat"]     # tp 規則帶過擬合提醒
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python -m pytest scripts/test_backtest_0903.py -k "exit_rules or pick_best" -v`
Expected: FAIL — `AttributeError: ... 'EXIT_RULES'`

- [ ] **Step 3: 加規則表與挑最佳**

末尾新增：

```python
# ── 出場規則註冊表 ──────────────────────────────────────────
_TP_GRID = [3, 5, 7, 10]
_SL_GRID = [2, 3, 5]

EXIT_RULES = (
    [
        {"key": "daytrade_close", "label": "當沖收盤", "kind": "daytrade_close"},
        {"key": "next_open", "label": "隔日開盤", "kind": "next_open"},
        {"key": "next_close", "label": "隔日收盤", "kind": "next_close"},
    ]
    + [
        {"key": f"tp{tp}_sl{sl}", "label": f"停利{tp}%/停損{sl}%(當沖)",
         "kind": "tp_sl", "tp": tp, "sl": sl}
        for tp in _TP_GRID for sl in _SL_GRID
    ]
)


def pick_best(rule_results, min_trades=30):
    """rule_results=[{key,label,trades,meanNet,profitFactor,winRate,...}]。
    依淨期望值挑最佳（樣本≥min_trades 優先），同分比獲利因子→勝率。
    回最佳 dict + lowConfidence + caveat；無可用 → None。"""
    valid = [r for r in rule_results if r.get("meanNet") is not None]
    if not valid:
        return None
    eligible = [r for r in valid if (r.get("trades") or 0) >= min_trades]
    pool = eligible or valid

    def sort_key(r):
        return (r["meanNet"], r.get("profitFactor") or 0, r.get("winRate") or 0)

    best = max(pool, key=sort_key)
    caveat = "TP/SL 為樣本內最佳化，有過擬合風險" if best["key"].startswith("tp") else ""
    return {**best, "lowConfidence": not eligible, "caveat": caveat}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `python -m pytest scripts/test_backtest_0903.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/backtest_0903.py scripts/test_backtest_0903.py
git commit -m "feat(backtest_0903): EXIT_RULES 註冊表 + pick_best 挑最佳"
```

---

## Task 6: `build_report` 核心（可注入 bars_provider，免 Shioaji 可測）

**Files:**
- Modify: `scripts/backtest_0903.py`
- Test: `scripts/test_backtest_0903.py`

`build_report` 是 orchestrator 的純核心：吃「選股日清單」與一個 `bars_provider(code, date)` 回傳函式，產出完整報告 dict。Shioaji 細節留給 Task 7。

`pick_days` 結構（由 orchestrator 組）：
```python
{"pickDate": "2026-06-23", "entryDate": "2026-06-24", "nextDate": "2026-06-25",
 "picks": [{"code": "5464", "name": "霖宏", "score": 86, "prevClose": 100.0}]}
```

- [ ] **Step 1: 寫失敗測試**

末尾新增：

```python
# ── build_report（注入假 bars_provider）──────────────────────
def test_build_report_funnel_and_rules():
    pick_days = [{
        "pickDate": "2026-06-23", "entryDate": "2026-06-24", "nextDate": "2026-06-25",
        "picks": [
            {"code": "AAA", "name": "進場檔", "score": 80, "prevClose": 100.0},
            {"code": "BBB", "name": "不符檔", "score": 70, "prevClose": 100.0},
            {"code": "CCC", "name": "無資料", "score": 65, "prevClose": 100.0},
        ],
    }]

    def provider(code, date):
        if code == "AAA" and date == "2026-06-24":   # 紅K且高於昨收 → 進場
            return [{"time": "09:01", "open": 100, "high": 101, "low": 100, "close": 100.5},
                    {"time": "09:03", "open": 100.5, "high": 105, "low": 100.5, "close": 104},
                    {"time": "13:30", "open": 104, "high": 106, "low": 103, "close": 105}]
        if code == "BBB" and date == "2026-06-24":   # 紅K但低於昨收 → 不進場
            return [{"time": "09:01", "open": 98, "high": 99, "low": 98, "close": 98.5},
                    {"time": "09:03", "open": 98.5, "high": 99, "low": 98.5, "close": 99}]
        if code == "AAA" and date == "2026-06-25":   # D+2（隔日出場用）
            return [{"time": "09:01", "open": 107, "high": 108, "low": 106, "close": 107.5},
                    {"time": "13:30", "open": 107, "high": 108, "low": 106, "close": 106}]
        return []   # CCC 無資料

    rep = build_report(pick_days, provider, min_trades=0)
    assert rep["funnel"] == {"totalPicks": 3, "noData": 1, "passedFilter": 1, "traded": 1}
    assert rep["dateRange"] == {"start": "2026-06-24", "end": "2026-06-24"}
    daytrade = next(r for r in rep["rules"] if r["key"] == "daytrade_close")
    assert daytrade["trades"] == 1
    # 進104 收105 毛+0.96% 扣0.435 ≈ 0.527
    assert daytrade["meanNet"] == pytest.approx(0.53, abs=0.05)
    assert rep["best"] is not None
    assert len(rep["trades"]) == 1
    assert rep["trades"][0]["code"] == "AAA"
    assert "bestReturnNet" in rep["trades"][0]


from backtest_0903 import build_report  # noqa: E402  (放檔尾避免循環)
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `python -m pytest scripts/test_backtest_0903.py -k build_report -v`
Expected: FAIL — `ImportError: cannot import name 'build_report'`

- [ ] **Step 3: 實作 `build_report`**

末尾新增：

```python
def _bars_after_0903(bars):
    """09:03 之後（不含 09:03 那根）的 K，供停利停損掃描與盤中高低。
    排除 09:03 本身：進場在 09:03 收盤，該根 09:00–09:03 的高低發生在買進前，
    若納入會虛構出停利/停損觸發。"""
    return [b for b in bars if b["time"] > _T0903]


def _day_open_close(bars):
    """(第一根 open, 最後一根 close)；無 bars → (None, None)。"""
    if not bars:
        return None, None
    return bars[0]["open"], bars[-1]["close"]


def build_report(pick_days, bars_provider, rules=EXIT_RULES, min_trades=30):
    """核心回測：pick_days + bars_provider(code,date)->bars → 報告 dict。

    funnel：totalPicks（有 D+1 的精選）→ noData → passedFilter → traded。
    每筆成交存進 trades；各規則彙總後挑最佳；前後半穩健性檢查。
    """
    total_picks = no_data = passed = 0
    entry_dates = []
    trades = []          # 含 barsAfter（記憶體用，寫檔前移除）

    for d in pick_days:
        entry_date = d["entryDate"]
        for p in d["picks"]:
            total_picks += 1
            day_bars = bars_provider(p["code"], entry_date)
            sig = entry_signal(day_bars, p["prevClose"])
            if sig is None:
                no_data += 1
                continue
            if not sig["entered"]:
                continue
            passed += 1
            day_open, day_close = _day_open_close(day_bars)
            next_bars = bars_provider(p["code"], d["nextDate"]) if d.get("nextDate") else []
            next_open, next_close = _day_open_close(next_bars)
            after = _bars_after_0903(day_bars)
            day_high_after = max((b["high"] for b in after), default=sig["p0903"])
            day_low_after = min((b["low"] for b in after), default=sig["p0903"])
            trades.append({
                "pickDate": d["pickDate"], "dEntry": entry_date,
                "code": p["code"], "name": p["name"], "score": p["score"],
                "prevClose": p["prevClose"], "open": sig["open"], "p0903": sig["p0903"],
                "entry": sig["p0903"],
                "dayHighAfter": round(day_high_after, 2), "dayLowAfter": round(day_low_after, 2),
                "dayClose": day_close, "nextOpen": next_open, "nextClose": next_close,
                "barsAfter": after,
            })
            entry_dates.append(entry_date)

    # 各規則彙總
    rule_results = []
    for rule in rules:
        rets = [simulate_exit(t, rule) for t in trades]
        rule_results.append({"key": rule["key"], "label": rule["label"],
                             **aggregate_rule(rets)})

    best = pick_best(rule_results, min_trades=min_trades)

    # 穩健性：依進場日排序切前後半，各自挑最佳 key
    ordered = sorted(trades, key=lambda t: (t["dEntry"], t["code"]))
    half = len(ordered) // 2
    robustness = {"firstHalfBest": None, "secondHalfBest": None, "consistent": None}
    if half >= 1:
        def best_key(subset):
            rr = [{"key": r["key"], "label": r["label"],
                   **aggregate_rule([simulate_exit(t, r) for t in subset])}
                  for r in rules]
            b = pick_best(rr, min_trades=0)
            return b["key"] if b else None
        fh, sh = best_key(ordered[:half]), best_key(ordered[half:])
        robustness = {"firstHalfBest": fh, "secondHalfBest": sh, "consistent": fh == sh}

    # 為 trades 加上「最佳規則」的出場價與報酬，並移除 barsAfter
    best_rule = next((r for r in rules if r["key"] == best["key"]), None) if best else None
    out_trades = []
    for t in trades:
        ret = simulate_exit(t, best_rule) if best_rule else None
        slim = {k: v for k, v in t.items() if k != "barsAfter"}
        slim["bestReturnNet"] = ret
        out_trades.append(slim)

    return {
        "dateRange": {"start": min(entry_dates), "end": max(entry_dates)} if entry_dates
                     else {"start": None, "end": None},
        "tradingDays": len(pick_days),
        "pickThreshold": 50,
        "pickCap": None,
        "fees": {"daytradeCostPct": COST_DAYTRADE, "overnightCostPct": COST_OVERNIGHT},
        "funnel": {"totalPicks": total_picks, "noData": no_data,
                   "passedFilter": passed, "traded": len(trades)},
        "rules": rule_results,
        "best": best,
        "robustness": robustness,
        "trades": out_trades,
        "methodology": (
            "永豐 Shioaji 真實 1 分 K。選股池=當日 score≥50 全部；隔日 09:03 "
            "紅K(現價>開盤)且高於昨收才進場；多種出場規則回測，依淨期望值挑最佳。"
            "成本：當沖0.435%、隔日0.585%（扣百分點）。"),
    }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `python -m pytest scripts/test_backtest_0903.py -v`
Expected: PASS（全部，含 build_report）

- [ ] **Step 5: Commit**

```bash
git add scripts/backtest_0903.py scripts/test_backtest_0903.py
git commit -m "feat(backtest_0903): build_report 核心 (funnel/rules/best/robustness)"
```

---

## Task 7: Shioaji IO 模組（抓 1 分 K + 磁碟快取）

**Files:**
- Create: `scripts/shioaji_intraday.py`

> 此模組打外部 API、依賴憑證，**不寫單元測試**（避免 CI 打線上）。以 docstring 標註手動驗證步驟；Task 8 首跑驗證。

- [ ] **Step 1: 建立模組**

```python
"""永豐 Shioaji 1 分 K 抓取 + 磁碟快取（IO 層，不做單元測試）。

bar 結構（回給 backtest_0903 的純函式）：
  {"time":"HH:MM","open","high","low","close"}，依時間升冪。

憑證：環境變數 SHIOAJI_API_KEY / SHIOAJI_SECRET_KEY。
首跑驗證：確認 09:03 那根 time 標記正確、歷史可回溯至最早 daily 檔。
"""
import json
import os
import time

CACHE_DIR = os.path.join("data", "intraday_cache")


def login():
    """登入永豐，回 (api, 是否成功)。失敗 raise。"""
    import shioaji as sj
    key = os.environ.get("SHIOAJI_API_KEY")
    secret = os.environ.get("SHIOAJI_SECRET_KEY")
    if not key or not secret:
        raise RuntimeError("缺 SHIOAJI_API_KEY / SHIOAJI_SECRET_KEY 環境變數")
    api = sj.Shioaji()
    api.login(api_key=key, secret_key=secret, fetch_contract=True)
    return api


def _cache_path(code, date):
    return os.path.join(CACHE_DIR, f"{code}_{date}.json")


def _load_cache(code, date):
    try:
        with open(_cache_path(code, date), encoding="utf-8") as fp:
            return json.load(fp)
    except Exception:
        return None


def _save_cache(code, date, bars):
    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        with open(_cache_path(code, date), "w", encoding="utf-8") as fp:
            json.dump(bars, fp, ensure_ascii=False)
    except Exception:
        pass


def _parse_kbars(kbars, date):
    """Shioaji kbars → bar list（限定 date 當日，升冪）。用 pandas 處理 ts。"""
    import pandas as pd
    df = pd.DataFrame({**kbars})
    if df.empty:
        return []
    df["dt"] = pd.to_datetime(df["ts"])
    df = df[df["dt"].dt.strftime("%Y-%m-%d") == date]
    bars = []
    for _, r in df.iterrows():
        bars.append({"time": r["dt"].strftime("%H:%M"),
                     "open": float(r["Open"]), "high": float(r["High"]),
                     "low": float(r["Low"]), "close": float(r["Close"])})
    bars.sort(key=lambda b: b["time"])
    return bars


def fetch_minute_bars(api, code, date, sleep=0.5):
    """回某檔某日 1 分 K（先讀快取）。無資料回 []。date='YYYY-MM-DD'。"""
    cached = _load_cache(code, date)
    if cached is not None:
        return cached
    bars = []
    try:
        contract = api.Contracts.Stocks[code]
        if contract is not None:
            kb = api.kbars(contract, start=date, end=date)
            bars = _parse_kbars(kb, date)
    except Exception as e:
        print(f"  [shioaji] {code} {date} 失敗: {e}")
        bars = []
    _save_cache(code, date, bars)
    time.sleep(sleep)
    return bars


def make_provider(api):
    """回 bars_provider(code, date) 給 build_report 用。"""
    return lambda code, date: fetch_minute_bars(api, code, date)
```

- [ ] **Step 2: 語法檢查（不需登入）**

Run: `python -c "import scripts.shioaji_intraday as m; print('ok', hasattr(m,'fetch_minute_bars'))"` 失敗時改用：`cd scripts && python -c "import shioaji_intraday as m; print('ok', hasattr(m,'fetch_minute_bars'))"`
Expected: `ok True`

- [ ] **Step 3: Commit**

```bash
git add scripts/shioaji_intraday.py
git commit -m "feat(shioaji_intraday): 1分K抓取+磁碟快取 IO 模組"
```

---

## Task 8: Orchestrator `run_backtest_0903.py` + 首跑驗證

**Files:**
- Create: `scripts/run_backtest_0903.py`
- Modify: `.gitignore`

- [ ] **Step 1: 加 .gitignore（快取不進版控）**

`.gitignore` 末尾新增：

```
# 09:03 回測 1 分 K 快取（可重建）
data/intraday_cache/
```

- [ ] **Step 2: 建立 orchestrator**

```python
"""09:03 紅K進場策略回測 orchestrator。

流程：載入 daily/營收/分類 → 重建每日 ≥50 精選（無上限）→ 登入永豐 →
供 1 分 K → build_report → 寫 data/backtest_0903.json。

用法：
  set SHIOAJI_API_KEY=... & set SHIOAJI_SECRET_KEY=... & python scripts/run_backtest_0903.py
  選用：--max-days N 只跑最近 N 個選股日（增量/省額度）
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import honest_stats as hs
import backtest_0903 as bt
import shioaji_intraday as si

OUT_FILE = "data/backtest_0903.json"


def build_pick_days(days, rev_maps, heavyweight, known_disposal):
    """每個可當選股日的 i（需有 D+1）→ pick_days 結構。"""
    pick_days = []
    for i in range(len(days) - 1):
        picks = hs.reconstruct_picks(days, i, rev_maps, heavyweight, known_disposal, cap=None)
        if not picks:
            continue
        pick_days.append({
            "pickDate": days[i]["date"],
            "entryDate": days[i + 1]["date"],
            "nextDate": days[i + 2]["date"] if i + 2 < len(days) else None,
            "picks": [{"code": p["code"], "name": p["name"],
                       "score": p["score"], "prevClose": p["close"]} for p in picks],
        })
    return pick_days


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-days", type=int, default=0, help="只跑最近 N 個選股日 (0=全部)")
    args = ap.parse_args()

    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_root)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    days = hs.load_daily_files()
    rev_maps = hs.load_revenue_maps()
    heavyweight, known_disposal = hs.load_categories()
    pick_days = build_pick_days(days, rev_maps, heavyweight, known_disposal)
    if args.max_days > 0:
        pick_days = pick_days[-args.max_days:]
    print(f"選股日 {len(pick_days)} 天，總精選 "
          f"{sum(len(d['picks']) for d in pick_days)} 檔，登入永豐抓 1 分 K...")

    api = si.login()
    try:
        provider = si.make_provider(api)
        report = bt.build_report(pick_days, provider)
    finally:
        try:
            api.logout()
        except Exception:
            pass

    report["updatedAt"] = days[-1]["date"]
    with open(OUT_FILE, "w", encoding="utf-8") as fp:
        json.dump(report, fp, ensure_ascii=False, indent=2)

    f = report["funnel"]
    b = report["best"]
    print(f"\n漏斗：精選 {f['totalPicks']} → 無資料 {f['noData']} → "
          f"通過 {f['passedFilter']} → 成交 {f['traded']}")
    if b:
        print(f"最佳：{b['label']} 勝率{b['winRate']}% 期望值{b['meanNet']}% "
              f"獲利因子{b['profitFactor']} 最大回檔{b['maxDrawdown']}%"
              f"{' [樣本不足]' if b['lowConfidence'] else ''}")
    print(f"穩健性：前半最佳={report['robustness']['firstHalfBest']} "
          f"後半最佳={report['robustness']['secondHalfBest']} "
          f"一致={report['robustness']['consistent']}")
    print(f"saved: {OUT_FILE}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: 全 Python 測試回歸**

Run: `python -m pytest scripts/ -v`
Expected: PASS（所有 backtest_0903 與 honest_stats 測試綠）

- [ ] **Step 4: 首跑驗證（需使用者提供憑證）**

> ⚠️ 需要 `SHIOAJI_API_KEY` / `SHIOAJI_SECRET_KEY`。先小範圍驗證再全跑。

PowerShell：
```powershell
$env:SHIOAJI_API_KEY="<key>"; $env:SHIOAJI_SECRET_KEY="<secret>"
python scripts/run_backtest_0903.py --max-days 3
```
驗證重點：
- 終端漏斗數字合理（通過數 < 精選數）。
- 開 `data/backtest_0903.json`，抽一筆 trade 用永豐看盤/任一來源核對 `open`/`p0903`/`dayClose` 是否吻合 09:03 那根（確認 time 標記正確）。
- 若 09:03 對不上，調整 `shioaji_intraday._parse_kbars` 的時間對齊後重跑（清 `data/intraday_cache/` 該檔）。

驗證 OK 後全跑：
```powershell
python scripts/run_backtest_0903.py
```
Expected: 產出完整 `data/backtest_0903.json`，無例外。

- [ ] **Step 5: Commit**

```bash
git add scripts/run_backtest_0903.py .gitignore data/backtest_0903.json
git commit -m "feat(backtest_0903): orchestrator + 首跑產出 data/backtest_0903.json"
```

---

## Task 9: API route `/api/backtest-0903`

**Files:**
- Create: `src/app/api/backtest-0903/route.ts`

- [ ] **Step 1: 建立 route（仿 public/stats 讀檔範式）**

```typescript
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "backtest_0903.json");

export async function GET() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }
}
```

- [ ] **Step 2: 驗證 route 回傳**

Run（需先有 dev server，或在 Task 12 一併驗證）：
`curl -s http://localhost:3000/api/backtest-0903 | head -c 200`
Expected: JSON 開頭含 `"funnel"`（若尚未跑 dev server，本步驟可延到 Task 12）。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/backtest-0903/route.ts
git commit -m "feat(api): /api/backtest-0903 讀 backtest_0903.json"
```

---

## Task 10: 前端區塊 `Backtest0903.tsx`

**Files:**
- Create: `src/components/Backtest0903.tsx`

- [ ] **Step 1: 建立元件（自含型別、KPI、規則表、漏斗、明細）**

```tsx
"use client";

import { useEffect, useState } from "react";

interface RuleAgg {
  key: string; label: string; trades: number; winRate: number | null;
  meanNet: number | null; medianNet: number | null; totalNet: number;
  profitFactor: number | null; maxDrawdown: number; maxWin: number | null; maxLoss: number | null;
}
interface TradeRow {
  pickDate: string; dEntry: string; code: string; name: string; score: number;
  prevClose: number; open: number; p0903: number; entry: number;
  dayClose: number | null; bestReturnNet: number | null;
}
interface Report {
  updatedAt: string; dateRange: { start: string | null; end: string | null };
  tradingDays: number;
  funnel: { totalPicks: number; noData: number; passedFilter: number; traded: number };
  rules: RuleAgg[];
  best: (RuleAgg & { lowConfidence: boolean; caveat: string }) | null;
  robustness: { firstHalfBest: string | null; secondHalfBest: string | null; consistent: boolean | null };
  trades: TradeRow[];
  methodology: string;
}

function pf(v: number | null) { return v === null ? "∞" : v.toFixed(2); }
function pct(v: number | null) { return v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`; }

export default function Backtest0903() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/backtest-0903")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="bg-bg-1 border border-border rounded-xl p-4 mb-6 text-xs text-txt-3">
        09:03 進場策略尚未產生回測資料（需先跑 <code>run_backtest_0903.py</code>）。
      </div>
    );
  }
  if (!data) {
    return (
      <div className="bg-bg-1 border border-border rounded-xl p-4 mb-6 text-xs text-txt-3">
        載入 09:03 策略回測中...
      </div>
    );
  }

  const b = data.best;
  const f = data.funnel;

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-txt-0 tracking-tight">09:03 紅K進場策略</h2>
        <p className="text-xs text-txt-3 mt-1">
          精選標的(評分≥50) 隔日 09:03「現價&gt;開盤(紅K) 且 高於昨收」才進場 ·
          {data.dateRange.start} ~ {data.dateRange.end} · {data.tradingDays} 選股日 ·
          真實永豐 1 分 K
        </p>
      </div>

      {/* 最佳規則 KPI */}
      {b && (
        <div className="bg-bg-1 border border-border rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs font-semibold text-txt-2">最佳出場規則</span>
            <span className="px-2 py-0.5 rounded bg-red/15 text-red text-xs font-bold">{b.label}</span>
            {b.lowConfidence && (
              <span className="px-2 py-0.5 rounded bg-amber/15 text-amber text-[10px]">樣本不足，僅供參考</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Kpi label="淨期望值/筆" value={pct(b.meanNet)} color={(b.meanNet ?? 0) >= 0 ? "text-green" : "text-red"} />
            <Kpi label="勝率" value={b.winRate === null ? "—" : `${b.winRate.toFixed(1)}%`} color={(b.winRate ?? 0) >= 50 ? "text-green" : "text-amber"} />
            <Kpi label="總淨報酬" value={pct(b.totalNet)} color={b.totalNet >= 0 ? "text-green" : "text-red"} />
            <Kpi label="最大回檔" value={`-${b.maxDrawdown.toFixed(2)}%`} color="text-red" />
            <Kpi label="交易筆數" value={`${b.trades}`} color="text-blue" />
          </div>
          {b.caveat && <p className="text-[10px] text-amber mt-2">⚠️ {b.caveat}</p>}
          <p className="text-[10px] text-txt-4 mt-1">
            穩健性：前半最佳「{data.robustness.firstHalfBest ?? "—"}」/ 後半「{data.robustness.secondHalfBest ?? "—"}」·
            {data.robustness.consistent ? " 一致 ✓" : " 不一致（最佳規則不穩，保守看待）"}
          </p>
        </div>
      )}

      {/* 進場漏斗 */}
      <div className="bg-bg-1 border border-border rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-txt-2 mb-3">進場漏斗</h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Funnel label="精選標的" value={f.totalPicks} />
          <Funnel label="無 1 分 K" value={f.noData} muted />
          <Funnel label="通過濾網" value={f.passedFilter} />
          <Funnel label="實際成交" value={f.traded} />
        </div>
      </div>

      {/* 規則比較表 */}
      <div className="bg-bg-1 border border-border rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-txt-2 mb-3">出場規則比較（依淨期望值）</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-2 text-txt-3">
                <th className="py-2 px-2 text-left font-medium">出場規則</th>
                <th className="py-2 px-2 text-right font-medium">筆數</th>
                <th className="py-2 px-2 text-right font-medium">勝率</th>
                <th className="py-2 px-2 text-right font-medium">淨期望值</th>
                <th className="py-2 px-2 text-right font-medium">總淨報酬</th>
                <th className="py-2 px-2 text-right font-medium">獲利因子</th>
                <th className="py-2 px-2 text-right font-medium">最大回檔</th>
              </tr>
            </thead>
            <tbody>
              {[...data.rules].sort((a, c) => (c.meanNet ?? -99) - (a.meanNet ?? -99)).map((r) => (
                <tr key={r.key} className={`border-b border-border/50 ${b && r.key === b.key ? "bg-red/[0.06]" : ""}`}>
                  <td className="py-2 px-2 text-txt-2">{r.label}{b && r.key === b.key && " ★"}</td>
                  <td className="py-2 px-2 text-right text-txt-3 tabular-nums">{r.trades}</td>
                  <td className="py-2 px-2 text-right text-txt-2 tabular-nums">{r.winRate === null ? "—" : `${r.winRate.toFixed(0)}%`}</td>
                  <td className={`py-2 px-2 text-right font-semibold tabular-nums ${(r.meanNet ?? 0) >= 0 ? "text-green" : "text-red"}`}>{pct(r.meanNet)}</td>
                  <td className={`py-2 px-2 text-right tabular-nums ${r.totalNet >= 0 ? "text-green" : "text-red"}`}>{pct(r.totalNet)}</td>
                  <td className="py-2 px-2 text-right text-txt-3 tabular-nums">{pf(r.profitFactor)}</td>
                  <td className="py-2 px-2 text-right text-red tabular-nums">-{r.maxDrawdown.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 交易明細（最佳規則）*/}
      <div className="bg-bg-1 border border-border rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-txt-2 mb-3">交易明細（最佳規則出場）</h3>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-2">
              <tr className="border-b border-border text-txt-3">
                <th className="py-2 px-2 text-left font-medium">進場日</th>
                <th className="py-2 px-2 text-left font-medium">代碼</th>
                <th className="py-2 px-2 text-left font-medium">名稱</th>
                <th className="py-2 px-2 text-right font-medium">分數</th>
                <th className="py-2 px-2 text-right font-medium">昨收</th>
                <th className="py-2 px-2 text-right font-medium">09:03進場</th>
                <th className="py-2 px-2 text-right font-medium">淨報酬</th>
              </tr>
            </thead>
            <tbody>
              {[...data.trades].sort((a, c) => (c.bestReturnNet ?? -99) - (a.bestReturnNet ?? -99)).map((t, i) => (
                <tr key={i} className={`border-b border-border/50 ${(t.bestReturnNet ?? 0) >= 0 ? "bg-green/[0.04]" : "bg-red/[0.04]"}`}>
                  <td className="py-2 px-2 text-txt-2 tabular-nums">{t.dEntry}</td>
                  <td className="py-2 px-2 text-txt-2 tabular-nums">{t.code}</td>
                  <td className="py-2 px-2 text-txt-2">{t.name}</td>
                  <td className="py-2 px-2 text-right text-txt-3 tabular-nums">{t.score}</td>
                  <td className="py-2 px-2 text-right text-txt-3 tabular-nums">{t.prevClose}</td>
                  <td className="py-2 px-2 text-right text-txt-2 tabular-nums">{t.p0903}</td>
                  <td className={`py-2 px-2 text-right font-semibold tabular-nums ${(t.bestReturnNet ?? 0) >= 0 ? "text-green" : "text-red"}`}>{pct(t.bestReturnNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-txt-4 mb-2">{data.methodology}</p>
      <p className="text-[10px] text-txt-4">
        免責：歷史回測非未來保證；停利停損網格為樣本內最佳化，請參考穩健性與樣本數判讀。成本已扣（當沖0.435%／隔日0.585%）。
      </p>
    </section>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg-2 rounded-lg p-3 text-center">
      <p className="text-[10px] text-txt-4 font-medium mb-1">{label}</p>
      <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function Funnel({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${muted ? "bg-bg-2/50" : "bg-bg-2"}`}>
      <p className="text-[10px] text-txt-4 mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${muted ? "text-txt-4" : "text-txt-1"}`}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無錯誤（或僅與本檔無關的既有錯誤）。

- [ ] **Step 3: Commit**

```bash
git add src/components/Backtest0903.tsx
git commit -m "feat(ui): Backtest0903 09:03策略報告區塊"
```

---

## Task 11: 接進 `/backtest` 頁

**Files:**
- Modify: `src/app/backtest/_client.tsx:1-7`（import）與 `:179-184`（main 頂部）

- [ ] **Step 1: 加 import**

`src/app/backtest/_client.tsx` 在現有 import 區（約第 7 行 `import type ...` 之後）新增：

```tsx
import Backtest0903 from "@/components/Backtest0903";
```

- [ ] **Step 2: 在 main 頂部插入區塊**

找到（約 179-184 行）：

```tsx
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-txt-0 tracking-tight">策略回測</h1>
          <p className="text-xs text-txt-3 mt-1">歷史數據驗證交易策略表現</p>
        </div>
```

改為（在 Header 後、選股器前插入 `<Backtest0903 />` 與分隔）：

```tsx
      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-txt-0 tracking-tight">策略回測</h1>
          <p className="text-xs text-txt-3 mt-1">歷史數據驗證交易策略表現</p>
        </div>

        {/* 09:03 紅K進場策略（精選標的實戰回測）*/}
        <Backtest0903 />

        {/* 以下：技術指標互動回測器 */}
        <div className="mb-4 pt-2 border-t border-border">
          <h2 className="text-lg font-bold text-txt-0 tracking-tight">技術指標回測器</h2>
          <p className="text-xs text-txt-3 mt-1">單檔股票 × EMA/KD/MACD/RSI 參數回測</p>
        </div>
```

- [ ] **Step 3: 型別檢查**

Run: `npx tsc --noEmit`
Expected: 無新錯誤。

- [ ] **Step 4: Commit**

```bash
git add src/app/backtest/_client.tsx
git commit -m "feat(ui): /backtest 頁頂部接入 09:03 策略區塊"
```

---

## Task 12: build / lint / 瀏覽器驗證

**Files:** 無（驗證）

- [ ] **Step 1: Lint + Build**

Run: `npm run lint && npm run build`
Expected: 通過，無錯誤。

- [ ] **Step 2: 瀏覽器驗證**

啟動 dev server，開 `/backtest`：
- 09:03 策略區塊在最上方顯示：最佳規則 KPI、漏斗、規則比較表（最佳列高亮★）、交易明細。
- 規則表依淨期望值降冪；獲利因子 ∞ 正常顯示。
- 下方技術指標回測器仍正常運作。
（用 preview 工具截圖佐證。）

- [ ] **Step 3: Commit（如有微調）**

```bash
git add -A
git commit -m "chore: 09:03 策略回測 build/lint 驗證修整"
```

---

## Task 13（Phase 2，選用）：GitHub Action 自動化

**Files:**
- Modify: 既有每日更新 workflow（`.github/workflows/*.yml`）

> 先確認 Phase 1 本地穩定再做。Shioaji 在 CI 的登入與資料額度需實測。

- [ ] **Step 1: 在每日資料更新後加一步**

於既有 workflow 的資料更新步驟後新增（示意，依實際 workflow 調整）：

```yaml
      - name: Run 09:03 backtest
        env:
          SHIOAJI_API_KEY: ${{ secrets.SHIOAJI_API_KEY }}
          SHIOAJI_SECRET_KEY: ${{ secrets.SHIOAJI_SECRET_KEY }}
        run: |
          pip install shioaji
          python scripts/run_backtest_0903.py
```

並確保提交步驟包含 `data/backtest_0903.json`。

- [ ] **Step 2: 設定 GitHub Secrets**

在 repo Settings → Secrets 新增 `SHIOAJI_API_KEY` / `SHIOAJI_SECRET_KEY`。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "ci: 每日自動跑 09:03 策略回測 (Shioaji)"
```

---

## Self-Review

**Spec coverage：**
- 選股池 score≥50 全部 → Task 1（cap=None 重用 `reconstruct_picks`）、Task 8（`build_pick_days`）✓
- 09:03 紅K+高於昨收進場 → Task 2 `entry_signal` ✓
- 出場：當沖收盤/隔日開盤/隔日收盤/TP×SL 12 組 → Task 3 + Task 5 `EXIT_RULES`（共 15）✓
- 成本（當沖/隔日不同稅）→ Task 3 常數 + `simulate_exit` 分派 ✓
- 指標（勝率/期望值/總報酬/最大回檔/獲利因子/最大單筆）→ Task 4 ✓
- 挑最佳（淨期望值、min_trades、過擬合 caveat）→ Task 5 `pick_best` ✓
- 漏斗 → Task 6 `build_report.funnel` ✓
- 穩健性前後半 → Task 6 `robustness` ✓
- Shioaji 1 分 K + 快取 → Task 7 ✓
- 輸出 `data/backtest_0903.json` → Task 8 ✓
- 前端 `/backtest` 新區塊 → Task 9/10/11 ✓
- 測試（純函式 + smoke）→ Task 2–6 TDD、Task 8 pytest 回歸 ✓
- 自動化 Phase 2 → Task 13 ✓

**Placeholder scan：** 無 TBD/TODO；每段含可執行程式碼與指令。Task 7/8 的線上驗證明確標註需憑證（非 placeholder，是必要人工步驟）。

**Type/名稱一致性：**
- `reconstruct_picks(..., cap=None)` Task 1 定義、Task 8 呼叫一致。
- `bars_provider(code, date)`、`build_report(pick_days, bars_provider, rules, min_trades)`、`EXIT_RULES`、`pick_best`、`aggregate_rule`、`simulate_exit`、`entry_signal`、`bar_at_0903`、`simulate_tp_sl`、`simple_return` 跨 Task 2–8 命名一致。
- JSON 欄位（`funnel/rules/best/robustness/trades/methodology/dateRange/funnel.{totalPicks,noData,passedFilter,traded}`、trade `bestReturnNet/p0903/prevClose`）於 Task 6 產出、Task 10 型別/渲染一致。
- 成本 `COST_DAYTRADE=0.435`/`COST_OVERNIGHT=0.585` 與 spec 數字一致（以扣百分點實作，數值＝0.1425%×2＋對應稅）。

未發現缺口。
