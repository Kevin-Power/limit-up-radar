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
  r1Ret?: number | null;
  r1Rule?: "T1_0915" | "T2_open" | null;
  r1GapPct?: number | null;
  r1ExitPrice?: number | null;
  group?: string | null;
  inTop3?: boolean | null;
}
interface MonthRow { trades: number; winRate: number; ev: number; total: number }
interface Report {
  updatedAt: string; dateRange: { start: string | null; end: string | null };
  tradingDays: number;
  funnel: { totalPicks: number; noData: number; notEntered?: number; passedFilter: number; traded?: number };
  rules: RuleAgg[];
  best: (RuleAgg & { lowConfidence: boolean; caveat: string }) | null;
  robustness: { firstHalfBest: string | null; secondHalfBest: string | null; consistent: boolean | null };
  trades: TradeRow[];
  methodology: string;
  r1Stats?: RuleAgg & { rule: string; label: string };
  baselineStats?: RuleAgg & { lowConfidence?: boolean; caveat?: string };
  monthlyR1?: Record<string, MonthRow>;
  monthlyBaseline?: Record<string, MonthRow>;
  // Top-3 大族群子集
  r1StatsTop3?: RuleAgg & { rule: string; label: string };
  baselineStatsTop3?: RuleAgg & { lowConfidence?: boolean; caveat?: string };
  monthlyR1Top3?: Record<string, MonthRow>;
  monthlyBaselineTop3?: Record<string, MonthRow>;
}

function pf(v: number | null) { return v === null ? "∞" : v.toFixed(2); }
function pct(v: number | null | undefined) { return v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`; }

export default function RecommendedStrategy() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const [view, setView] = useState<'baseline' | 'r1'>('r1');
  const [groupFilter, setGroupFilter] = useState<'all' | 'top3'>('all');

  useEffect(() => {
    fetch("/api/strategy-recommended")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="bg-bg-1 border border-border rounded-xl p-4 mb-6 text-xs text-txt-3">
        推薦策略尚未產生回測資料（需先跑 <code>python scripts/run_recommended_strategy.py</code>）。
      </div>
    );
  }
  if (!data) {
    return (
      <div className="bg-bg-1 border border-border rounded-xl p-4 mb-6 text-xs text-txt-3">
        載入推薦策略回測中...
      </div>
    );
  }

  // 依「全部 / Top-3 大族群」+「baseline / r1」雙軸選資料源
  const useTop3 = groupFilter === 'top3';
  const activeStats = view === 'r1'
    ? (useTop3 ? data.r1StatsTop3 : data.r1Stats) ?? data.best
    : (useTop3 ? data.baselineStatsTop3 : data.baselineStats) ?? data.best;
  const activeMonthlyR1 = (useTop3 ? data.monthlyR1Top3 : data.monthlyR1) ?? data.monthlyR1;
  const activeMonthlyBaseline = (useTop3 ? data.monthlyBaselineTop3 : data.monthlyBaseline) ?? data.monthlyBaseline;
  const filteredTrades = useTop3 ? data.trades.filter(t => t.inTop3) : data.trades;
  const b = activeStats;
  const f = data.funnel;

  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-txt-0 tracking-tight">★ 推薦策略：開盤+R1 動態出場 (已驗證真實 alpha)</h2>
        <p className="text-xs text-txt-3 mt-1">
          score≥75 隔日開盤進場 + R1 動態出場 → 勝率 ~66%、EV ~2.2% ·
          {data.dateRange.start} ~ {data.dateRange.end} · {data.tradingDays} 選股日 ·
          真實永豐 1 分 K
        </p>
      </div>

      {/* baseline / R1 切換 Tab */}
      {data.r1Stats && (
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setView('baseline')}
            className={`px-3 py-1 rounded text-xs ${view === 'baseline' ? 'bg-red text-white' : 'bg-bg-2 text-txt-3'}`}
          >baseline（T+2 開盤一律出）</button>
          <button
            onClick={() => setView('r1')}
            className={`px-3 py-1 rounded text-xs ${view === 'r1' ? 'bg-red text-white' : 'bg-bg-2 text-txt-3'}`}
          >R1 動態出場（已驗證 alpha）★</button>
        </div>
      )}

      {/* 族群過濾 Toggle（資訊用，數據顯示 EV 不變、總賺 -18%）*/}
      {data.r1StatsTop3 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] text-txt-4">族群篩選：</span>
          <button
            onClick={() => setGroupFilter('all')}
            className={`px-2 py-0.5 rounded text-[11px] ${groupFilter === 'all' ? 'bg-blue text-white' : 'bg-bg-2 text-txt-3'}`}
          >全部</button>
          <button
            onClick={() => setGroupFilter('top3')}
            className={`px-2 py-0.5 rounded text-[11px] ${groupFilter === 'top3' ? 'bg-blue text-white' : 'bg-bg-2 text-txt-3'}`}
          >只看 Top-3 大族群</button>
          <span className="text-[10px] text-txt-4">
            （Top-3 = 當日精選股數最多的前 3 族；歷史數據顯示 EV 持平、總賺降 18%，僅供焦點觀察）
          </span>
        </div>
      )}

      {/* 最佳規則 / R1 KPI */}
      {b && (
        <div className="bg-bg-1 border border-border rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs font-semibold text-txt-2">
              {view === 'r1' && data.r1Stats ? 'R1 動態出場' : 'baseline 出場'}
            </span>
            <span className="px-2 py-0.5 rounded bg-red/15 text-red text-xs font-bold">{b.label}</span>
            {('lowConfidence' in b) && b.lowConfidence && (
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
          {('caveat' in b) && b.caveat && <p className="text-[10px] text-amber mt-2">⚠️ {b.caveat}</p>}
          <p className="text-[10px] text-txt-4 mt-1">
            穩健性：前半最佳「{data.robustness.firstHalfBest ?? "—"}」/ 後半「{data.robustness.secondHalfBest ?? "—"}」·
            {data.robustness.consistent === true ? " 一致 ✓" : data.robustness.consistent === false ? " 不一致（前後半最佳規則不一樣，保守看待）" : " 資料不足"}
          </p>
        </div>
      )}

      {/* 進場漏斗 */}
      <div className="bg-bg-1 border border-border rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-txt-2 mb-3">進場漏斗</h3>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Funnel label="精選標的" value={f.totalPicks} />
          <Funnel label="無 1 分 K" value={f.noData} muted />
          <Funnel label="未觸條件" value={f.notEntered ?? (f.totalPicks - f.noData - f.passedFilter)} muted />
          <Funnel label="進場" value={f.passedFilter} />
        </div>
      </div>

      {/* 規則比較表 */}
      <div className="bg-bg-1 border border-border rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-txt-2 mb-3">
          出場規則比較（依淨期望值）
          <span className="ml-2 text-txt-3 font-normal">— ★ 標記不隨上方 Tab 切換</span>
        </h3>
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
                <tr key={r.key} className={`border-b border-border/50 ${data.best && r.key === data.best.key ? "bg-red/[0.06]" : ""}`}>
                  <td className="py-2 px-2 text-txt-2">{r.label}{data.best && r.key === data.best.key && " ★"}</td>
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

      {/* 月度並排表（baseline vs R1）*/}
      {activeMonthlyR1 && activeMonthlyBaseline && (
        <div className="bg-bg-1 border border-border rounded-xl p-4 mb-4">
          <h3 className="text-xs font-semibold text-txt-2 mb-3">月度表現對比（baseline vs R1）{useTop3 && <span className="text-amber"> · Top-3 大族群</span>}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg-2 text-txt-3">
                  <th className="py-2 px-2 text-left">月份</th>
                  <th className="py-2 px-2 text-right">baseline 筆數</th>
                  <th className="py-2 px-2 text-right">baseline EV</th>
                  <th className="py-2 px-2 text-right">R1 筆數</th>
                  <th className="py-2 px-2 text-right">R1 EV</th>
                  <th className="py-2 px-2 text-right">R1 優勢</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(activeMonthlyR1).sort().map(ym => {
                  const r = activeMonthlyR1![ym];
                  const bm = activeMonthlyBaseline![ym] ?? { trades: 0, ev: 0, winRate: 0, total: 0 };
                  const diff = (r.ev ?? 0) - (bm.ev ?? 0);
                  return (
                    <tr key={ym} className="border-b border-border/50">
                      <td className="py-2 px-2 text-txt-2 tabular-nums">{ym}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{bm.trades}</td>
                      <td className={`py-2 px-2 text-right tabular-nums ${bm.ev >= 0 ? 'text-green' : 'text-red'}`}>{pct(bm.ev)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.trades}</td>
                      <td className={`py-2 px-2 text-right tabular-nums ${r.ev >= 0 ? 'text-green' : 'text-red'}`}>{pct(r.ev)}</td>
                      <td className={`py-2 px-2 text-right font-semibold tabular-nums ${diff >= 0 ? 'text-green' : 'text-red'}`}>{pct(diff)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-txt-4 mt-2">
            R1 規則：T+1 開盤 gap 0~5% → 09:15 出；其它 → T+2 開盤出。固定規則，非樣本內最佳化。
          </p>
        </div>
      )}

      {/* 交易明細 */}
      <div className="bg-bg-1 border border-border rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold text-txt-2 mb-3">
          交易明細（{view === 'r1' && data.r1Stats ? 'R1 動態出場' : 'baseline T+2 開盤出'}）
        </h3>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-2">
              <tr className="border-b border-border text-txt-3">
                <th className="py-2 px-2 text-left font-medium">進場日</th>
                <th className="py-2 px-2 text-left font-medium">代碼</th>
                <th className="py-2 px-2 text-left font-medium">名稱</th>
                <th className="py-2 px-2 text-right font-medium">分數</th>
                <th className="py-2 px-2 text-right font-medium">昨收</th>
                <th className="py-2 px-2 text-right font-medium">開盤進場</th>
                {view === 'r1' && data.r1Stats && (
                  <>
                    <th className="py-2 px-2 text-right font-medium">T+1 gap</th>
                    <th className="py-2 px-2 text-left font-medium">R1 規則</th>
                  </>
                )}
                <th className="py-2 px-2 text-right font-medium">淨報酬</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredTrades]
                .sort((a, c) => {
                  const av = view === 'r1' ? (a.r1Ret ?? a.bestReturnNet ?? -99) : (a.bestReturnNet ?? -99);
                  const cv = view === 'r1' ? (c.r1Ret ?? c.bestReturnNet ?? -99) : (c.bestReturnNet ?? -99);
                  return cv - av;
                })
                .map((t, i) => {
                  const ret = view === 'r1' && data.r1Stats ? (t.r1Ret ?? null) : t.bestReturnNet;
                  return (
                    <tr key={i} className={`border-b border-border/50 ${(ret ?? 0) >= 0 ? "bg-green/[0.04]" : "bg-red/[0.04]"}`}>
                      <td className="py-2 px-2 text-txt-2 tabular-nums">{t.dEntry}</td>
                      <td className="py-2 px-2 text-txt-2 tabular-nums">{t.code}</td>
                      <td className="py-2 px-2 text-txt-2">{t.name}</td>
                      <td className="py-2 px-2 text-right text-txt-3 tabular-nums">{t.score}</td>
                      <td className="py-2 px-2 text-right text-txt-3 tabular-nums">{t.prevClose}</td>
                      <td className="py-2 px-2 text-right text-txt-2 tabular-nums">{t.entry}</td>
                      {view === 'r1' && data.r1Stats && (
                        <>
                          <td className={`py-2 px-2 text-right tabular-nums ${(t.r1GapPct ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>{pct(t.r1GapPct)}</td>
                          <td className="py-2 px-2 text-left text-txt-3">{t.r1Rule ?? '—'}</td>
                        </>
                      )}
                      <td className={`py-2 px-2 text-right font-semibold tabular-nums ${(ret ?? 0) >= 0 ? "text-green" : "text-red"}`}>{pct(ret)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-txt-4 mb-2">{data.methodology}</p>
      <p className="text-[10px] text-txt-4">
        免責：歷史回測非未來保證。R1 規則為固定規則（gap 0~5%→09:15、其它→T+2 開），不是樣本內最佳化。
        成本已扣（隔日 0.585%）。
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
