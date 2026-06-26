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
