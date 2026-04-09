"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPrice, formatPct, formatNumber } from "@/lib/utils";
import type { CandleData } from "@/lib/twse-helpers";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// --- Stock name lookup (display only, not fake prices) ---

const STOCK_NAMES: Record<string, string> = {
  "3324": "雙鴻", "3017": "奇鋐", "6515": "穎崴", "6223": "旺矽",
  "2330": "台積電", "2454": "聯發科", "6669": "緯穎", "2376": "技嘉",
  "3037": "欣興", "2317": "鴻海", "4977": "眾達-KY", "4743": "合一",
  "3576": "聯合再生", "2014": "中鴻", "1301": "台塑", "1303": "南亞",
  "2007": "燁興", "2025": "千興", "1325": "恒大", "2542": "興富發",
  "2388": "威健", "6670": "復盛應用", "1471": "首利", "3363": "上詮",
  "7795": "長廣", "6274": "台燿", "2401": "凌陽", "2458": "義隆",
  "2548": "華固", "2012": "春雨", "2459": "敦吉", "5522": "遠翔",
  "2379": "瑞昱", "5274": "信驊", "6446": "藥華藥", "1402": "遠東新",
  "2368": "金像電", "2421": "建準", "4904": "遠傳", "5534": "長虹",
};

// --- Date label helper ---

function histToDateLabels(hist: CandleData[]): string[] {
  return hist.slice(-30).map((d) => {
    const parts = d.date.split("-");
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  });
}

// --- Interfaces ---

interface StockCompareData {
  code: string;
  name: string;
  close: number;
  changePct: number;
  volume: number;
  pe: number;
  pb: number;
  rsi: number;
  macdSignal: "golden_cross" | "death_cross" | "neutral";
  kdSignal: "golden_cross" | "death_cross" | "neutral";
  priceSeries: number[];
}

interface TechnicalsData {
  rsi: number;
  macdSignal: "golden_cross" | "death_cross" | "neutral";
  kd_k: number;
  kd_d: number;
  isReal: boolean;
}

interface PeData {
  pe: number;
  pb: number;
  dividendYield: number;
}

// --- Build stock data from real API responses ---

function buildStockData(
  code: string,
  hist: CandleData[] | undefined,
  peData: Record<string, PeData> | undefined,
  technicals: TechnicalsData | undefined
): StockCompareData | null {
  if (!hist || hist.length < 5) return null;

  const last = hist[hist.length - 1];
  const prev = hist[hist.length - 2];
  const close = last.close;
  const changePct = prev ? ((close - prev.close) / prev.close) * 100 : 0;
  const volume = last.volume;
  const priceSeries = hist.slice(-30).map((d) => d.close);
  const name = STOCK_NAMES[code] ?? code;

  const pe = peData?.[code]?.pe ?? 0;
  const pb = peData?.[code]?.pb ?? 0;

  const rsi = technicals?.isReal ? technicals.rsi : 0;

  const macdSignal: "golden_cross" | "death_cross" | "neutral" =
    technicals?.isReal ? technicals.macdSignal : "neutral";

  const kdK = technicals?.isReal ? (technicals.kd_k ?? 50) : 50;
  const kdD = technicals?.isReal ? (technicals.kd_d ?? 50) : 50;
  const kdSignal: "golden_cross" | "death_cross" | "neutral" =
    kdK > kdD + 5 ? "golden_cross" : kdK < kdD - 5 ? "death_cross" : "neutral";

  return { code, name, close, changePct, volume, pe, pb, rsi, macdSignal, kdSignal, priceSeries };
}

// --- Chart colors ---

const LINE_COLORS = ["#ef4444", "#3b82f6", "#f59e0b", "#10b981"];

// --- Normalize prices to base 100 ---

function normalizeSeries(series: number[]): number[] {
  if (series.length === 0) return [];
  const base = series[0];
  if (base === 0) return series.map(() => 100);
  return series.map((v) => (v / base) * 100);
}

// --- Helper: find best/worst index ---

type CompareDir = "high" | "low";

function rankIndices(values: number[], dir: CompareDir): { best: number; worst: number } {
  let bestIdx = 0;
  let worstIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (dir === "high") {
      if (values[i] > values[bestIdx]) bestIdx = i;
      if (values[i] < values[worstIdx]) worstIdx = i;
    } else {
      if (values[i] < values[bestIdx]) bestIdx = i;
      if (values[i] > values[worstIdx]) worstIdx = i;
    }
  }
  return { best: bestIdx, worst: worstIdx };
}

// --- Signal helpers ---

function signalLabel(s: "golden_cross" | "death_cross" | "neutral"): string {
  if (s === "golden_cross") return "金叉";
  if (s === "death_cross") return "死叉";
  return "中性";
}

function signalColor(s: "golden_cross" | "death_cross" | "neutral"): string {
  if (s === "golden_cross") return "text-green bg-green/10";
  if (s === "death_cross") return "text-red bg-red/10";
  return "text-amber bg-amber/10";
}

function rsiColor(rsi: number): string {
  if (rsi >= 60) return "text-green bg-green/10";
  if (rsi <= 35) return "text-red bg-red/10";
  return "text-amber bg-amber/10";
}

// --- SVG Price Chart ---

function PriceChart({ stocks, dateLabels }: { stocks: StockCompareData[]; dateLabels?: string[] }) {
  const W = 720;
  const H = 320;
  const PAD = { top: 30, right: 20, bottom: 40, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const allNormalized = useMemo(
    () => stocks.map((s) => normalizeSeries(s.priceSeries)),
    [stocks]
  );

  const allValues = allNormalized.flat();
  const minVal = Math.min(...allValues) - 1;
  const maxVal = Math.max(...allValues) + 1;
  const range = maxVal - minVal || 1;

  const seriesLen = allNormalized[0]?.length ?? 30;
  const fallbackLabels = useMemo(() => {
    const labels: string[] = [];
    const now = new Date();
    for (let i = seriesLen - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }
    return labels;
  }, [seriesLen]);

  const labels = dateLabels ?? fallbackLabels;

  function toX(i: number) {
    return PAD.left + (i / Math.max(seriesLen - 1, 1)) * plotW;
  }
  function toY(v: number) {
    return PAD.top + plotH - ((v - minVal) / range) * plotH;
  }

  // Y-axis ticks
  const yTicks: number[] = [];
  const step = range / 5;
  for (let i = 0; i <= 5; i++) {
    yTicks.push(minVal + step * i);
  }

  // X-axis label indices (every 5th)
  const lastIdx = seriesLen - 1;
  const xLabelIdxs = [0, 5, 10, 15, 20, 25, lastIdx].filter((v, i, a) => v <= lastIdx && a.indexOf(v) === i);

  return (
    <div className="bg-bg-2 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold text-txt-1 mb-3">30 日相對績效 (基期 = 100)</h3>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[500px]" style={{ maxWidth: W }}>
          {/* Grid lines */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
                stroke="currentColor" className="text-border" strokeWidth="0.5" strokeDasharray="3,3"
              />
              <text x={PAD.left - 6} y={toY(v) + 3} textAnchor="end" className="fill-txt-4" fontSize="10">
                {v.toFixed(1)}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xLabelIdxs.map((idx) => (
            <text
              key={idx} x={toX(idx)} y={H - PAD.bottom + 18}
              textAnchor="middle" className="fill-txt-4" fontSize="10"
            >
              {labels[idx]}
            </text>
          ))}

          {/* Base 100 line */}
          <line
            x1={PAD.left} y1={toY(100)} x2={W - PAD.right} y2={toY(100)}
            stroke="currentColor" className="text-txt-4" strokeWidth="1" strokeDasharray="6,4" opacity="0.5"
          />
          <text x={W - PAD.right + 4} y={toY(100) + 3} className="fill-txt-4" fontSize="9">100</text>

          {/* Stock lines */}
          {allNormalized.map((series, si) => {
            const points = series.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
            return (
              <polyline
                key={si}
                points={points}
                fill="none"
                stroke={LINE_COLORS[si]}
                strokeWidth="2"
                strokeLinejoin="round"
              />
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 px-1">
        {stocks.map((s, i) => {
          const norm = allNormalized[i];
          const last = norm[norm.length - 1];
          const perf = last - 100;
          return (
            <div key={s.code} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-[3px] rounded-full inline-block" style={{ backgroundColor: LINE_COLORS[i] }} />
              <span className="text-txt-2 font-medium">{s.code} {s.name}</span>
              <span className={`font-bold tabular-nums ${perf >= 0 ? "text-green" : "text-red"}`}>
                {perf >= 0 ? "+" : ""}{perf.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Main page ---

export default function ComparePage() {
  const [codes, setCodes] = useState<string[]>(["2330", "2454"]);
  const [inputValue, setInputValue] = useState("");

  // Fetch history for each stock
  const { data: hist0 } = useSWR<CandleData[]>(codes[0] ? `/api/stock/${codes[0]}/history` : null, fetcher, { revalidateOnFocus: false });
  const { data: hist1 } = useSWR<CandleData[]>(codes[1] ? `/api/stock/${codes[1]}/history` : null, fetcher, { revalidateOnFocus: false });
  const { data: hist2 } = useSWR<CandleData[]>(codes[2] ? `/api/stock/${codes[2]}/history` : null, fetcher, { revalidateOnFocus: false });
  const { data: hist3 } = useSWR<CandleData[]>(codes[3] ? `/api/stock/${codes[3]}/history` : null, fetcher, { revalidateOnFocus: false });
  const allHists = [hist0, hist1, hist2, hist3];

  // Fetch technicals for each stock
  const { data: tech0 } = useSWR<TechnicalsData>(codes[0] ? `/api/stock/${codes[0]}/technicals` : null, fetcher, { revalidateOnFocus: false });
  const { data: tech1 } = useSWR<TechnicalsData>(codes[1] ? `/api/stock/${codes[1]}/technicals` : null, fetcher, { revalidateOnFocus: false });
  const { data: tech2 } = useSWR<TechnicalsData>(codes[2] ? `/api/stock/${codes[2]}/technicals` : null, fetcher, { revalidateOnFocus: false });
  const { data: tech3 } = useSWR<TechnicalsData>(codes[3] ? `/api/stock/${codes[3]}/technicals` : null, fetcher, { revalidateOnFocus: false });
  const allTechs = [tech0, tech1, tech2, tech3];

  // Fetch PE/PB data
  const { data: peData } = useSWR<Record<string, PeData>>("/api/pe", fetcher, { revalidateOnFocus: false });

  const stocks = useMemo(() => {
    return codes
      .map((c, i) => buildStockData(c, allHists[i], peData, allTechs[i]))
      .filter(Boolean) as StockCompareData[];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes, hist0, hist1, hist2, hist3, peData, tech0, tech1, tech2, tech3]);

  // Date labels from first stock's real history
  const dateLabels = useMemo(() => {
    const firstHist = allHists.find((h) => h && h.length > 5);
    return firstHist ? histToDateLabels(firstHist) : undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist0, hist1, hist2, hist3]);

  function addStock() {
    const code = inputValue.trim();
    if (!code) return;
    if (codes.length >= 4) return;
    if (codes.includes(code)) return;
    setCodes([...codes, code]);
    setInputValue("");
  }

  function removeStock(code: string) {
    if (codes.length <= 2) return;
    setCodes(codes.filter((c) => c !== code));
  }

  // Loading state: data still fetching
  const isLoading = codes.length >= 2 && stocks.length < 2;

  // Comparison rows definition (real data only: no ROE, no revenueYoy)
  const rows: { label: string; getValue: (s: StockCompareData) => string; getNumeric: (s: StockCompareData) => number; dir: CompareDir }[] = [
    { label: "收盤價", getValue: (s) => formatPrice(s.close), getNumeric: (s) => s.close, dir: "high" },
    { label: "漲跌幅", getValue: (s) => formatPct(s.changePct), getNumeric: (s) => s.changePct, dir: "high" },
    { label: "成交量", getValue: (s) => formatNumber(s.volume), getNumeric: (s) => s.volume, dir: "high" },
    { label: "本益比", getValue: (s) => s.pe ? s.pe.toFixed(1) : "-", getNumeric: (s) => s.pe, dir: "low" },
    { label: "股價淨值比", getValue: (s) => s.pb ? s.pb.toFixed(2) : "-", getNumeric: (s) => s.pb, dir: "low" },
  ];

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1">
      <TopNav />
      <NavBar />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-txt-0">股票比較</h1>
          <p className="text-xs text-txt-3 mt-1">選擇 2-4 檔股票進行多維度比較分析</p>
        </div>

        {/* Stock selector */}
        <div className="bg-bg-1 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            {codes.map((code) => (
              <div
                key={code}
                className="flex items-center gap-1.5 bg-bg-3 border border-border rounded-md px-3 py-1.5 text-xs"
              >
                <span className="font-bold text-txt-0 tabular-nums">{code}</span>
                <span className="text-txt-3">{stocks.find((s) => s.code === code)?.name ?? STOCK_NAMES[code] ?? ""}</span>
                {codes.length > 2 && (
                  <button
                    onClick={() => removeStock(code)}
                    className="ml-1 text-txt-4 hover:text-red transition-colors text-[11px] font-bold"
                    title="移除"
                  >
                    x
                  </button>
                )}
              </div>
            ))}

            {codes.length < 4 && (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addStock()}
                  placeholder="輸入代號"
                  className="bg-bg-3 border border-border rounded-md px-2.5 py-1.5 text-xs text-txt-1 w-[90px] outline-none focus:border-border-hover placeholder:text-txt-4"
                />
                <button
                  onClick={addStock}
                  className="bg-red text-white text-xs font-semibold px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
                >
                  加入
                </button>
              </div>
            )}
          </div>

        </div>

        {isLoading && (
          <div className="bg-bg-1 rounded-lg border border-border p-8 text-center">
            <p className="text-sm text-txt-3">載入中...</p>
          </div>
        )}

        {stocks.length >= 2 && (
          <>
            {/* Comparison table */}
            <div className="bg-bg-1 rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-txt-0">基本面比較</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-bg-2">
                      <th className="text-left px-4 py-2.5 text-txt-3 font-medium w-[120px]">指標</th>
                      {stocks.map((s, i) => (
                        <th key={s.code} className="text-right px-4 py-2.5 font-semibold text-txt-1 min-w-[120px]">
                          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: LINE_COLORS[i] }} />
                          {s.code} {s.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const numerics = stocks.map((s) => row.getNumeric(s));
                      const { best, worst } = rankIndices(numerics, row.dir);
                      return (
                        <tr key={row.label} className="border-b border-border last:border-b-0 hover:bg-bg-2/50 transition-colors">
                          <td className="px-4 py-2.5 text-txt-3 font-medium">{row.label}</td>
                          {stocks.map((s, i) => {
                            let cellClass = "text-txt-1";
                            if (stocks.length > 1 && i === best) cellClass = "text-green font-bold";
                            if (stocks.length > 1 && i === worst && best !== worst) cellClass = "text-red font-bold";
                            return (
                              <td key={s.code} className={`px-4 py-2.5 text-right tabular-nums ${cellClass}`}>
                                {row.getValue(s)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Price chart overlay */}
            <PriceChart stocks={stocks} dateLabels={dateLabels} />

            {/* Technical indicators comparison */}
            <div className="bg-bg-1 rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-txt-0">技術指標比較</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-bg-2">
                      <th className="text-left px-4 py-2.5 text-txt-3 font-medium w-[120px]">指標</th>
                      {stocks.map((s, i) => (
                        <th key={s.code} className="text-center px-4 py-2.5 font-semibold text-txt-1 min-w-[120px]">
                          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: LINE_COLORS[i] }} />
                          {s.code} {s.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* RSI */}
                    <tr className="border-b border-border">
                      <td className="px-4 py-2.5 text-txt-3 font-medium">RSI</td>
                      {stocks.map((s) => (
                        <td key={s.code} className="px-4 py-2.5 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${rsiColor(s.rsi)}`}>
                            {s.rsi ? s.rsi.toFixed(1) : "-"}
                          </span>
                        </td>
                      ))}
                    </tr>
                    {/* MACD Signal */}
                    <tr className="border-b border-border">
                      <td className="px-4 py-2.5 text-txt-3 font-medium">MACD</td>
                      {stocks.map((s) => (
                        <td key={s.code} className="px-4 py-2.5 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${signalColor(s.macdSignal)}`}>
                            {signalLabel(s.macdSignal)}
                          </span>
                        </td>
                      ))}
                    </tr>
                    {/* KD Signal */}
                    <tr className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5 text-txt-3 font-medium">KD</td>
                      {stocks.map((s) => (
                        <td key={s.code} className="px-4 py-2.5 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${signalColor(s.kdSignal)}`}>
                            {signalLabel(s.kdSignal)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!isLoading && stocks.length < 2 && (
          <div className="bg-bg-1 rounded-lg border border-border p-8 text-center">
            <p className="text-sm text-txt-3">請至少選擇 2 檔股票進行比較</p>
          </div>
        )}
      </main>
    </div>
  );
}
