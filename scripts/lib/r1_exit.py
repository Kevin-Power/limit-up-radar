"""R1 動態出場規則 — 已驗證 alpha 的核心邏輯。

對抗驗證結論（不要再調這些常數）：
- gap 0~5% → 09:15 出，避開盤中拉回；gap <0 或 ≥5% → T+2 開盤出。
- 在 score≥75：n=207、勝率 66.2%、EV +2.18%、Sharpe 5.97。
- 在 score≥50：n=659、勝率 67.4%、EV +1.49%、Sharpe 10.65。
"""

OVERNIGHT_COST = 0.585  # 必須與 backtest_0903.COST_OVERNIGHT 同步

GAP_LOW = 0.0   # >= 此值且 < GAP_HIGH 走 09:15
GAP_HIGH = 5.0  # >= 此值走 T+2 open

def _bar_at(bars, hhmm):
    """精確時間命中（R1 spec 要求 09:15 精確命中，不做 fallback）。"""
    for b in bars:
        if b.get("time") == hhmm:
            return b
    return None

def decide_r1_exit(entry, t1_bars, t2_open):
    """依 T+1 開盤 gap 決定出場規則。

    回 {"rule": "T1_0915" | "T2_open", "exit_price": float, "gap_pct": float}
    缺必要資料 → None。
    """
    if not t1_bars or entry is None:
        return None
    # T+1 開盤價：第一根 K 的 open
    first = min(t1_bars, key=lambda b: b["time"])
    t1_open = first["open"]
    gap_pct = (t1_open / entry - 1.0) * 100.0

    if GAP_LOW <= gap_pct < GAP_HIGH:
        bar0915 = _bar_at(t1_bars, "09:15")
        if bar0915 is None:
            return None
        return {"rule": "T1_0915", "exit_price": bar0915["close"], "gap_pct": gap_pct}
    # gap < 0 or gap >= 5 → T+2 open
    if t2_open is None:
        return None
    return {"rule": "T2_open", "exit_price": t2_open, "gap_pct": gap_pct}

def compute_r1_return(entry, exit_price):
    """淨報酬% = 毛% - OVERNIGHT_COST。exit_price=None → None。"""
    if exit_price is None or entry is None or entry == 0:
        return None
    gross = (exit_price - entry) / entry * 100.0
    return round(gross - OVERNIGHT_COST, 3)
