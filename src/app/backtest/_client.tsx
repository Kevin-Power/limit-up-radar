"use client";

import { useState, useMemo } from "react";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPct, formatPrice, getTodayString } from "@/lib/utils";

/* ================================================================
   SEEDED RNG
   ================================================================ */
function seededRng(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = (h ^ (h >>> 16)) * 0x45d9f3b;
    h = (h ^ (h >>> 16)) * 0x45d9f3b;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 0xffffffff;
  };
}

/* ================================================================
   STRATEGIES & TYPES
   ================================================================ */
type StrategyKey = "ema" | "kd" | "macd" | "rsi";

const STRATEGIES: { key: StrategyKey; label: string; desc: string }[] = [
  { key: "ema", label: "EMA 交叉", desc: "EMA11/24 黃金/死亡交叉" },
  { key: "kd", label: "KD 隨機指標", desc: "K 值穿越 D 值" },
  { key: "macd", label: "MACD 信號", desc: "MACD 穿越信號線" },
  { key: "rsi", label: "RSI 超買超賣", desc: "RSI > 80 賣出, < 20 買入" },
];

interface Trade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  returnPct: number;
  holdDays: number;
  win: boolean;
}

interface BacktestResult {
  totalReturn: number;
  winRate: number;
  tradeCount: number;
  maxDrawdown: number;
  trades: Trade[];
  equityCurve: number[];
  benchmarkCurve: number[];
  avgReturn: number;
  avgHoldDays: number;
  maxWin: number;
  maxLoss: number;
  maxConsecWins: number;
  maxConsecLosses: number;
  sharpeRatio: number;
}

/* ================================================================
   GENERATE MOCK DATA
   ================================================================ */
function generateTradingDates(start: string, count: number): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  while (dates.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${dd}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function generateBacktest(strategyKey: string, _params: Record<string, number>): BacktestResult {
  const rng = seededRng(`backtest-${strategyKey}-v3`);
  const tradeCount = Math.floor(rng() * 6) + 15; // 15-20
  const allDates = generateTradingDates("2025-06-02", 200);
  const trades: Trade[] = [];

  let currentIdx = 0;
  for (let i = 0; i < tradeCount; i++) {
    const gap = Math.floor(rng() * 5) + 2;
    const entryIdx = currentIdx + gap;
    if (entryIdx >= allDates.length - 10) break;

    const holdDays = Math.floor(rng() * 15) + 2;
    const exitIdx = Math.min(entryIdx + holdDays, allDates.length - 1);
    currentIdx = exitIdx;

    const entryPrice = Math.round((50 + rng() * 400) * 10) / 10;
    const isWin = rng() > 0.42;
    const magnitude = rng() * 12 + 0.5;
    const returnPct = isWin ? magnitude : -magnitude;
    const exitPrice = Math.round(entryPrice * (1 + returnPct / 100) * 10) / 10;

    trades.push({
      entryDate: allDates[entryIdx],
      entryPrice,
      exitDate: allDates[exitIdx],
      exitPrice,
      returnPct: Math.round(returnPct * 100) / 100,
      holdDays: exitIdx - entryIdx,
      win: isWin,
    });
  }

  // Compute stats
  const wins = trades.filter((t) => t.win).length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const avgReturn = trades.length > 0 ? trades.reduce((s, t) => s + t.returnPct, 0) / trades.length : 0;
  const avgHoldDays = trades.length > 0 ? Math.round(trades.reduce((s, t) => s + t.holdDays, 0) / trades.length) : 0;
  const maxWin = trades.length > 0 ? Math.max(...trades.map((t) => t.returnPct)) : 0;
  const maxLoss = trades.length > 0 ? Math.min(...trades.map((t) => t.returnPct)) : 0;

  // Consecutive wins / losses
  let maxConsecWins = 0;
  let maxConsecLosses = 0;
  let cw = 0;
  let cl = 0;
  for (const t of trades) {
    if (t.win) {
      cw++;
      cl = 0;
      maxConsecWins = Math.max(maxConsecWins, cw);
    } else {
      cl++;
      cw = 0;
      maxConsecLosses = Math.max(maxConsecLosses, cl);
    }
  }

  // Equity curve
  const equityCurve: number[] = [100];
  let equity = 100;
  let tradeIdx = 0;
  for (let i = 1; i < 200; i++) {
    if (tradeIdx < trades.length) {
      const dateIdx = allDates.indexOf(trades[tradeIdx].exitDate);
      if (i === dateIdx || (i > dateIdx && tradeIdx < trades.length)) {
        equity *= 1 + trades[tradeIdx].returnPct / 100;
        tradeIdx++;
      }
    }
    // Add small daily noise
    equity *= 1 + (rng() - 0.5) * 0.004;
    equityCurve.push(Math.round(equity * 100) / 100);
  }

  // Benchmark: buy & hold with slight upward bias
  const benchmarkCurve: number[] = [100];
  let bench = 100;
  const rng2 = seededRng(`bench-${strategyKey}`);
  for (let i = 1; i < 200; i++) {
    bench *= 1 + (rng2() - 0.48) * 0.015;
    benchmarkCurve.push(Math.round(bench * 100) / 100);
  }

  const totalReturn = Math.round((equity - 100) * 100) / 100;

  // Max drawdown
  let peak = equityCurve[0];
  let maxDD = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe ratio (simplified)
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
  }
  const meanR = returns.reduce((s, r) => s + r, 0) / returns.length;
  const stdR = Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length);
  const sharpeRatio = stdR > 0 ? Math.round((meanR / stdR) * Math.sqrt(252) * 100) / 100 : 0;

  return {
    totalReturn,
    winRate: Math.round(winRate * 10) / 10,
    tradeCount: trades.length,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    trades,
    equityCurve,
    benchmarkCurve,
    avgReturn: Math.round(avgReturn * 100) / 100,
    avgHoldDays,
    maxWin: Math.round(maxWin * 100) / 100,
    maxLoss: Math.round(maxLoss * 100) / 100,
    maxConsecWins,
    maxConsecLosses,
    sharpeRatio,
  };
}

/* ================================================================
   SORT HELPERS
   ================================================================ */
type SortField = "entryDate" | "exitDate" | "returnPct" | "holdDays" | "entryPrice" | "exitPrice";

function sortTrades(trades: Trade[], field: SortField, asc: boolean): Trade[] {
  return [...trades].sort((a, b) => {
    let va: number | string = a[field];
    let vb: number | string = b[field];
    if (typeof va === "string") {
      return asc ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
    }
    return asc ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });
}

/* ================================================================
   COMPONENT
   ================================================================ */
export default function BacktestPage() {
  const [strategy, setStrategy] = useState<StrategyKey>("ema");

  // EMA params
  const [emaFast, setEmaFast] = useState(11);
  const [emaSlow, setEmaSlow] = useState(24);
  // KD params
  const [kdBuy, setKdBuy] = useState(20);
  const [kdSell, setKdSell] = useState(80);
  // MACD params
  const [macdFast, setMacdFast] = useState(12);
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSignal, setMacdSignal] = useState(9);
  // RSI params
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiOverbought, setRsiOverbought] = useState(80);
  const [rsiOversold, setRsiOversold] = useState(20);

  // Sort state
  const [sortField, setSortField] = useState<SortField>("entryDate");
  const [sortAsc, setSortAsc] = useState(true);

  const params = useMemo((): Record<string, number> => {
    if (strategy === "kd") return { buy: kdBuy, sell: kdSell };
    if (strategy === "macd") return { fast: macdFast, slow: macdSlow, signal: macdSignal };
    if (strategy === "rsi") return { period: rsiPeriod, overbought: rsiOverbought, oversold: rsiOversold };
    return { fast: emaFast, slow: emaSlow };
  }, [strategy, emaFast, emaSlow, kdBuy, kdSell, macdFast, macdSlow, macdSignal, rsiPeriod, rsiOverbought, rsiOversold]);

  const result = useMemo(() => generateBacktest(strategy, params), [strategy, params]);
  const sortedTrades = useMemo(() => sortTrades(result.trades, sortField, sortAsc), [result.trades, sortField, sortAsc]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return "";
    return sortAsc ? " ^" : " v";
  }

  // SVG chart dimensions
  const chartW = 760;
  const chartH = 260;
  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const allValues = [...result.equityCurve, ...result.benchmarkCurve];
  const minY = Math.min(...allValues) * 0.97;
  const maxY = Math.max(...allValues) * 1.03;

  function toX(i: number) {
    return padL + (i / (result.equityCurve.length - 1)) * plotW;
  }
  function toY(v: number) {
    return padT + (1 - (v - minY) / (maxY - minY)) * plotH;
  }

  const strategyPath = result.equityCurve.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const benchmarkPath = result.benchmarkCurve.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  // Area fill under strategy curve
  const areaPath = `${strategyPath} L${toX(result.equityCurve.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

  // Y-axis labels
  const yTicks = 5;
  const yLabels: number[] = [];
  for (let i = 0; i <= yTicks; i++) {
    yLabels.push(Math.round(minY + (maxY - minY) * (i / yTicks)));
  }

  // Date labels for X-axis
  const tradingDates = generateTradingDates("2025-06-02", 200);
  const xLabelIndices = [0, 40, 80, 120, 160, 199];

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1 animate-fade-in">
      <TopNav currentDate={getTodayString()} />
      <NavBar />

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-txt-0 tracking-tight">策略回測</h1>
          <p className="text-xs text-txt-3 mt-1">歷史數據驗證交易策略表現</p>
        </div>

        {/* Strategy Selector Tabs */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {STRATEGIES.map((s) => (
            <button
              key={s.key}
              onClick={() => { setStrategy(s.key); setSortField("entryDate"); setSortAsc(true); }}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all card-hover ${
                strategy === s.key
                  ? "bg-red text-white shadow-md"
                  : "bg-bg-2 text-txt-3 hover:bg-bg-3 hover:text-txt-1"
              }`}
            >
              <span className="block">{s.label}</span>
              <span className={`block text-[10px] mt-0.5 ${strategy === s.key ? "text-white/70" : "text-txt-4"}`}>
                {s.desc}
              </span>
            </button>
          ))}
        </div>

        {/* Parameter Controls */}
        <div className="bg-bg-1 border border-border rounded-xl p-4 mb-5">
          <h2 className="text-xs font-semibold text-txt-2 mb-3">參數設定</h2>
          <div className="flex flex-wrap gap-4">
            {strategy === "ema" && (
              <>
                <ParamInput label="快線週期" value={emaFast} onChange={setEmaFast} min={2} max={50} />
                <ParamInput label="慢線週期" value={emaSlow} onChange={setEmaSlow} min={5} max={100} />
              </>
            )}
            {strategy === "kd" && (
              <>
                <ParamInput label="K 買入閾值" value={kdBuy} onChange={setKdBuy} min={5} max={50} />
                <ParamInput label="K 賣出閾值" value={kdSell} onChange={setKdSell} min={50} max={95} />
              </>
            )}
            {strategy === "macd" && (
              <>
                <ParamInput label="快線" value={macdFast} onChange={setMacdFast} min={2} max={30} />
                <ParamInput label="慢線" value={macdSlow} onChange={setMacdSlow} min={10} max={50} />
                <ParamInput label="信號線" value={macdSignal} onChange={setMacdSignal} min={2} max={20} />
              </>
            )}
            {strategy === "rsi" && (
              <>
                <ParamInput label="RSI 週期" value={rsiPeriod} onChange={setRsiPeriod} min={2} max={30} />
                <ParamInput label="超買" value={rsiOverbought} onChange={setRsiOverbought} min={60} max={95} />
                <ParamInput label="超賣" value={rsiOversold} onChange={setRsiOversold} min={5} max={40} />
              </>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <KpiCard
            label="總報酬率"
            value={`${result.totalReturn > 0 ? "+" : ""}${result.totalReturn.toFixed(2)}%`}
            color={result.totalReturn >= 0 ? "text-green" : "text-red"}
          />
          <KpiCard
            label="勝率"
            value={`${result.winRate.toFixed(1)}%`}
            color={result.winRate >= 50 ? "text-green" : "text-amber"}
          />
          <KpiCard label="交易次數" value={`${result.tradeCount}`} color="text-blue" />
          <KpiCard
            label="最大回撤"
            value={`-${result.maxDrawdown.toFixed(2)}%`}
            color="text-red"
          />
        </div>

        {/* Equity Curve Chart */}
        <div className="bg-bg-1 border border-border rounded-xl p-4 mb-5">
          <h2 className="text-xs font-semibold text-txt-2 mb-3">權益曲線</h2>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full min-w-[600px]" preserveAspectRatio="xMidYMid meet">
              {/* Grid lines */}
              {yLabels.map((v, i) => (
                <g key={i}>
                  <line
                    x1={padL}
                    y1={toY(v)}
                    x2={chartW - padR}
                    y2={toY(v)}
                    stroke="var(--border)"
                    strokeWidth="0.5"
                    strokeDasharray="4,3"
                  />
                  <text x={padL - 6} y={toY(v) + 3} textAnchor="end" fill="var(--text-4)" fontSize="9">
                    {v}
                  </text>
                </g>
              ))}

              {/* X-axis date labels */}
              {xLabelIndices.map((idx) => (
                <text
                  key={idx}
                  x={toX(idx)}
                  y={chartH - 5}
                  textAnchor="middle"
                  fill="var(--text-4)"
                  fontSize="8"
                >
                  {tradingDates[idx]?.slice(5) || ""}
                </text>
              ))}

              {/* Area fill */}
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--red)" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="var(--red)" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#areaGrad)" />

              {/* Benchmark line (dashed gray) */}
              <path
                d={benchmarkPath}
                fill="none"
                stroke="var(--text-4)"
                strokeWidth="1.2"
                strokeDasharray="5,4"
                opacity="0.6"
              />

              {/* Strategy line */}
              <path d={strategyPath} fill="none" stroke="var(--red)" strokeWidth="2" />

              {/* Legend */}
              <g transform={`translate(${padL + 10}, ${padT + 8})`}>
                <line x1="0" y1="0" x2="16" y2="0" stroke="var(--red)" strokeWidth="2" />
                <text x="20" y="3" fill="var(--text-2)" fontSize="9">策略</text>
                <line x1="60" y1="0" x2="76" y2="0" stroke="var(--text-4)" strokeWidth="1.2" strokeDasharray="5,4" />
                <text x="80" y="3" fill="var(--text-4)" fontSize="9">Buy & Hold</text>
              </g>
            </svg>
          </div>
        </div>

        {/* Trade History Table */}
        <div className="bg-bg-1 border border-border rounded-xl p-4 mb-5">
          <h2 className="text-xs font-semibold text-txt-2 mb-3">交易紀錄</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg-2 text-txt-3">
                  <th className="py-2 px-2 text-left font-medium cursor-pointer hover:text-txt-1 select-none" onClick={() => handleSort("entryDate")}>
                    進場日期{sortIcon("entryDate")}
                  </th>
                  <th className="py-2 px-2 text-right font-medium cursor-pointer hover:text-txt-1 select-none" onClick={() => handleSort("entryPrice")}>
                    進場價{sortIcon("entryPrice")}
                  </th>
                  <th className="py-2 px-2 text-left font-medium cursor-pointer hover:text-txt-1 select-none" onClick={() => handleSort("exitDate")}>
                    出場日期{sortIcon("exitDate")}
                  </th>
                  <th className="py-2 px-2 text-right font-medium cursor-pointer hover:text-txt-1 select-none" onClick={() => handleSort("exitPrice")}>
                    出場價{sortIcon("exitPrice")}
                  </th>
                  <th className="py-2 px-2 text-right font-medium cursor-pointer hover:text-txt-1 select-none" onClick={() => handleSort("returnPct")}>
                    報酬%{sortIcon("returnPct")}
                  </th>
                  <th className="py-2 px-2 text-right font-medium cursor-pointer hover:text-txt-1 select-none" onClick={() => handleSort("holdDays")}>
                    持有天數{sortIcon("holdDays")}
                  </th>
                  <th className="py-2 px-2 text-center font-medium">結果</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((t, i) => (
                  <tr
                    key={i}
                    className={`border-b border-border/50 transition-colors ${
                      t.win ? "bg-green/[0.04] hover:bg-green/[0.08]" : "bg-red/[0.04] hover:bg-red/[0.08]"
                    }`}
                  >
                    <td className="py-2 px-2 text-txt-2 tabular-nums">{t.entryDate}</td>
                    <td className="py-2 px-2 text-right text-txt-2 tabular-nums">{formatPrice(t.entryPrice)}</td>
                    <td className="py-2 px-2 text-txt-2 tabular-nums">{t.exitDate}</td>
                    <td className="py-2 px-2 text-right text-txt-2 tabular-nums">{formatPrice(t.exitPrice)}</td>
                    <td className={`py-2 px-2 text-right font-semibold tabular-nums ${t.win ? "text-green" : "text-red"}`}>
                      {t.returnPct > 0 ? "+" : ""}{t.returnPct.toFixed(2)}%
                    </td>
                    <td className="py-2 px-2 text-right text-txt-3 tabular-nums">{t.holdDays}</td>
                    <td className="py-2 px-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          t.win ? "bg-green-bg text-green" : "bg-red-bg text-red"
                        }`}
                      >
                        {t.win ? "WIN" : "LOSS"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Statistics Summary */}
        <div className="bg-bg-1 border border-border rounded-xl p-4 mb-8">
          <h2 className="text-xs font-semibold text-txt-2 mb-3">統計摘要</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCell label="平均報酬" value={`${result.avgReturn > 0 ? "+" : ""}${result.avgReturn.toFixed(2)}%`} color={result.avgReturn >= 0 ? "text-green" : "text-red"} />
            <StatCell label="平均持有天數" value={`${result.avgHoldDays}`} color="text-txt-1" />
            <StatCell label="最大單筆獲利" value={`+${result.maxWin.toFixed(2)}%`} color="text-green" />
            <StatCell label="最大單筆虧損" value={`${result.maxLoss.toFixed(2)}%`} color="text-red" />
            <StatCell label="連續獲利" value={`${result.maxConsecWins}`} color="text-green" />
            <StatCell label="連續虧損" value={`${result.maxConsecLosses}`} color="text-red" />
            <StatCell label="Sharpe Ratio" value={`${result.sharpeRatio.toFixed(2)}`} color={result.sharpeRatio >= 1 ? "text-green" : result.sharpeRatio >= 0 ? "text-amber" : "text-red"} />
          </div>
        </div>
      </main>
    </div>
  );
}

/* ================================================================
   SUB-COMPONENTS
   ================================================================ */
function ParamInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[11px] text-txt-3 whitespace-nowrap">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        className="w-16 bg-bg-3 border border-border rounded-md px-2 py-1 text-xs text-txt-1 tabular-nums outline-none focus:border-border-hover text-center"
      />
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg-1 border border-border rounded-xl p-4 text-center card-hover">
      <p className="text-[10px] text-txt-4 font-medium mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-bg-2 rounded-lg p-3 text-center">
      <p className="text-[10px] text-txt-4 font-medium mb-1">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
