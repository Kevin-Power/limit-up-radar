"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPrice, getTodayString } from "@/lib/utils";
import type { BacktestResult as RealBacktestResult, Trade } from "@/app/api/backtest/route";

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
const POPULAR_STOCKS = [
  { code: "2330", name: "台積電" }, { code: "2454", name: "聯發科" },
  { code: "2317", name: "鴻海" },   { code: "3017", name: "奇鋐" },
  { code: "6669", name: "緯穎" },   { code: "3324", name: "雙鴻" },
];

export default function BacktestPage() {
  const [strategy, setStrategy] = useState<StrategyKey>("ema");
  const [stockCode, setStockCode] = useState("2330");
  const [stockInput, setStockInput] = useState("2330");
  const [realResult, setRealResult] = useState<RealBacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const buildUrl = useCallback(() => {
    const base = `/api/backtest?code=${stockCode}&strategy=${strategy}`;
    if (strategy === "ema") return `${base}&emaFast=${emaFast}&emaSlow=${emaSlow}`;
    if (strategy === "kd") return `${base}&kdBuy=${kdBuy}&kdSell=${kdSell}`;
    if (strategy === "macd") return `${base}&macdFast=${macdFast}&macdSlow=${macdSlow}&macdSignal=${macdSignal}`;
    return `${base}&rsiPeriod=${rsiPeriod}&rsiOverbought=${rsiOverbought}&rsiOversold=${rsiOversold}`;
  }, [stockCode, strategy, emaFast, emaSlow, kdBuy, kdSell, macdFast, macdSlow, macdSignal, rsiPeriod, rsiOverbought, rsiOversold]);

  const runBacktest = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(buildUrl(), { cache: "no-store" })
      .then((r) => r.json())
      .then((d: RealBacktestResult) => {
        if (d.isReal) setRealResult(d);
        else setError("資料不足，請換一檔股票");
      })
      .catch(() => setError("回測資料載入失敗"))
      .finally(() => setLoading(false));
  }, [buildUrl]);

  // Auto-run on mount and when params change
  useEffect(() => { runBacktest(); }, [runBacktest]);

  const result = realResult;

  const sortedTrades = useMemo(() => result ? sortTrades(result.trades, sortField, sortAsc) : [], [result, sortField, sortAsc]);

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

  const allValues = result ? [...result.equityCurve, ...result.benchmarkCurve] : [100];
  const minY = Math.min(...allValues) * 0.97;
  const maxY = Math.max(...allValues) * 1.03;

  const curveLen = result ? result.equityCurve.length : 0;

  function toX(i: number) {
    return padL + (curveLen > 1 ? (i / (curveLen - 1)) * plotW : 0);
  }
  function toY(v: number) {
    return padT + (1 - (v - minY) / (maxY - minY)) * plotH;
  }

  const strategyPath = result ? result.equityCurve.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ") : "";
  const benchmarkPath = result ? result.benchmarkCurve.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ") : "";

  // Area fill under strategy curve
  const areaPath = result ? `${strategyPath} L${toX(curveLen - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z` : "";

  // Y-axis labels
  const yTicks = 5;
  const yLabels: number[] = [];
  for (let i = 0; i <= yTicks; i++) {
    yLabels.push(Math.round(minY + (maxY - minY) * (i / yTicks)));
  }

  // Date labels for X-axis
  const xIndices = curveLen <= 6
    ? Array.from({ length: curveLen }, (_, i) => i)
    : [0, Math.floor(curveLen * 0.2), Math.floor(curveLen * 0.4), Math.floor(curveLen * 0.6), Math.floor(curveLen * 0.8), curveLen - 1];
  // Build date array from dateRange
  const chartDates: string[] = result
    ? (() => {
        const dates: string[] = [];
        const d = new Date(result.dateRange.start);
        const end = new Date(result.dateRange.end);
        while (d <= end && dates.length < curveLen) {
          const day = d.getDay();
          if (day !== 0 && day !== 6) {
            dates.push(`${d.getMonth() + 1}/${d.getDate()}`);
          }
          d.setDate(d.getDate() + 1);
        }
        return dates;
      })()
    : [];

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

        {/* Stock Selector */}
        <div className="bg-bg-1 border border-border rounded-xl p-4 mb-5">
          <h2 className="text-xs font-semibold text-txt-2 mb-3">選擇股票</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && stockInput.length >= 4) {
                  setRealResult(null);
                  setStockCode(stockInput);
                }
              }}
              placeholder="股票代碼"
              className="w-24 bg-bg-3 border border-border rounded-md px-2 py-1.5 text-xs text-txt-1 outline-none focus:border-border-hover tabular-nums text-center"
            />
            <button
              onClick={() => { if (stockInput.length >= 4) { setRealResult(null); setStockCode(stockInput); } }}
              className="px-3 py-1.5 bg-red text-white rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
            >
              回測
            </button>
            <span className="text-txt-4 text-xs">快速選股：</span>
            {POPULAR_STOCKS.map((s) => (
              <button
                key={s.code}
                onClick={() => { setRealResult(null); setStockCode(s.code); setStockInput(s.code); }}
                className={`px-2.5 py-1 rounded-md text-xs transition-all ${
                  stockCode === s.code
                    ? "bg-red/20 text-red border border-red/40"
                    : "bg-bg-2 text-txt-3 hover:bg-bg-3 hover:text-txt-1 border border-border"
                }`}
              >
                {s.code} {s.name}
              </button>
            ))}
          </div>
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

        {/* Status Banner */}
        {loading ? (
          <div className="flex items-center gap-2 bg-bg-1 border border-border rounded-xl px-4 py-3 mb-5">
            <span className="inline-block w-3 h-3 border-2 border-red border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-txt-3">載入回測資料中...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 bg-red/10 border border-red/30 rounded-xl px-4 py-3 mb-5">
            <span className="inline-block w-2 h-2 rounded-full bg-red" />
            <span className="text-xs text-red font-medium">{error}</span>
          </div>
        ) : result ? (
          <div className="flex items-center gap-2 bg-green/10 border border-green/30 rounded-xl px-4 py-3 mb-5">
            <span className="inline-block w-2 h-2 rounded-full bg-green" />
            <span className="text-xs text-green font-semibold">LIVE</span>
            <span className="text-xs text-txt-2">{result.stockCode}</span>
            <span className="text-xs text-txt-4">·</span>
            <span className="text-xs text-txt-3">{result.dateRange.start} ~ {result.dateRange.end}</span>
            <span className="text-xs text-txt-4">·</span>
            <span className="text-xs text-txt-3">{result.dataPoints} 個交易日</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-bg-1 border border-border rounded-xl px-4 py-3 mb-5">
            <span className="text-xs text-txt-3">請選擇股票和策略進行回測</span>
          </div>
        )}

        {/* KPI Cards */}
        {result && <><div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
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
              {xIndices.map((idx) => (
                <text
                  key={idx}
                  x={toX(idx)}
                  y={chartH - 5}
                  textAnchor="middle"
                  fill="var(--text-4)"
                  fontSize="8"
                >
                  {chartDates[idx] || ""}
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
            <StatCell label="夏普比率" value={`${result.sharpeRatio.toFixed(2)}`} color={result.sharpeRatio >= 1 ? "text-green" : result.sharpeRatio >= 0 ? "text-amber" : "text-red"} />
          </div>
        </div></>}
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
