"use client";

import { useState, useMemo } from "react";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPrice, formatPct, formatNumber } from "@/lib/utils";

// --- Seeded RNG helpers (same as stock detail page) ---

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function makeRng(seed: string) {
  let state = hashSeed(seed);
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// --- Stock lookup maps ---

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

const STOCK_PRICES: Record<string, number> = {
  "3324": 1065, "3017": 1945, "6515": 8190, "6223": 3860,
  "2330": 1810, "2454": 1620, "6669": 3725, "2376": 235,
  "3037": 460, "2317": 195, "4977": 181.5, "4743": 52,
  "3576": 20.7, "2014": 18.45, "1301": 45.05, "1303": 72.3,
  "2007": 8.48, "2025": 11.6, "1325": 24.8, "2542": 67.5,
  "2388": 32.5, "6670": 142, "1471": 13.05, "3363": 734,
  "7795": 403, "6274": 554, "2401": 20.45, "2458": 128,
  "2548": 119.5, "2012": 32.5, "2379": 480.5, "5274": 11750,
  "6446": 620, "1402": 25.9, "2368": 165, "2421": 112,
  "4904": 85, "5534": 45.2,
};

// --- Mock data generators ---

function generatePriceSeries(seed: string, basePrice: number, count = 30): number[] {
  const rng = makeRng(seed + "_chart");
  const startOffset = 0.88 + rng() * 0.09;
  const prices: number[] = [basePrice * startOffset];
  for (let i = 1; i < count; i++) {
    const drift = (basePrice - prices[i - 1]) * 0.03;
    const noise = (rng() - 0.5) * basePrice * 0.015;
    const next = prices[i - 1] + drift + noise;
    prices.push(Math.max(Math.min(next, basePrice * 1.15), basePrice * 0.85));
  }
  return prices;
}

function generateDateLabels(count = 30): string[] {
  const labels: string[] = [];
  const now = new Date(2026, 2, 20);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0) d.setDate(d.getDate() - 2);
    else if (dow === 6) d.setDate(d.getDate() - 1);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return labels;
}

interface StockCompareData {
  code: string;
  name: string;
  close: number;
  changePct: number;
  volume: number;
  pe: number;
  roe: number;
  revenueYoy: number;
  rsi: number;
  macdSignal: "golden_cross" | "death_cross" | "neutral";
  kdSignal: "golden_cross" | "death_cross" | "neutral";
  priceSeries: number[];
}

function mockCompareData(code: string): StockCompareData | null {
  const name = STOCK_NAMES[code];
  const close = STOCK_PRICES[code];
  if (!name || !close) return null;

  const rng = makeRng(code + "_compare");
  const changePct = (rng() - 0.3) * 8;
  const volume = Math.round((close > 500 ? 3000 : close > 100 ? 12000 : 25000) * (0.5 + rng() * 2));
  const pe = 8 + rng() * 40;
  const roe = 3 + rng() * 30;
  const revenueYoy = (rng() - 0.3) * 60;

  const rsi = 30 + rng() * 50;
  const macdOptions: Array<"golden_cross" | "death_cross" | "neutral"> = ["golden_cross", "death_cross", "neutral"];
  const macdSignal = macdOptions[Math.floor(rng() * 3)];
  const kdK = 20 + rng() * 65;
  const kdD = 20 + rng() * 60;
  const kdSignal: "golden_cross" | "death_cross" | "neutral" =
    kdK > kdD + 5 ? "golden_cross" : kdK < kdD - 5 ? "death_cross" : "neutral";

  const priceSeries = generatePriceSeries(code, close, 30);

  return { code, name, close, changePct, volume, pe, roe, revenueYoy, rsi, macdSignal, kdSignal, priceSeries };
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
  if (s === "golden_cross") return "Golden Cross";
  if (s === "death_cross") return "Death Cross";
  return "Neutral";
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

function PriceChart({ stocks }: { stocks: StockCompareData[] }) {
  const dateLabels = useMemo(() => generateDateLabels(30), []);
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

  function toX(i: number) {
    return PAD.left + (i / 29) * plotW;
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
  const xLabelIdxs = [0, 5, 10, 15, 20, 25, 29];

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
              {dateLabels[idx]}
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

  const stocks = useMemo(() => {
    return codes.map((c) => mockCompareData(c)).filter(Boolean) as StockCompareData[];
  }, [codes]);

  function addStock() {
    const code = inputValue.trim();
    if (!code) return;
    if (codes.length >= 4) return;
    if (codes.includes(code)) return;
    if (!STOCK_NAMES[code]) return;
    setCodes([...codes, code]);
    setInputValue("");
  }

  function removeStock(code: string) {
    if (codes.length <= 2) return;
    setCodes(codes.filter((c) => c !== code));
  }

  // Comparison rows definition
  const rows: { label: string; getValue: (s: StockCompareData) => string; getNumeric: (s: StockCompareData) => number; dir: CompareDir }[] = [
    { label: "收盤價", getValue: (s) => formatPrice(s.close), getNumeric: (s) => s.close, dir: "high" },
    { label: "漲跌幅", getValue: (s) => formatPct(s.changePct), getNumeric: (s) => s.changePct, dir: "high" },
    { label: "成交量", getValue: (s) => formatNumber(s.volume), getNumeric: (s) => s.volume, dir: "high" },
    { label: "本益比", getValue: (s) => s.pe.toFixed(1), getNumeric: (s) => s.pe, dir: "low" },
    { label: "ROE", getValue: (s) => s.roe.toFixed(1) + "%", getNumeric: (s) => s.roe, dir: "high" },
    { label: "月營收YoY", getValue: (s) => formatPct(s.revenueYoy), getNumeric: (s) => s.revenueYoy, dir: "high" },
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
                <span className="text-txt-3">{STOCK_NAMES[code]}</span>
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

          {inputValue.trim() && !STOCK_NAMES[inputValue.trim()] && (
            <p className="text-[11px] text-red mt-2">找不到代號 {inputValue.trim()}</p>
          )}
        </div>

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
            <PriceChart stocks={stocks} />

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
                            {s.rsi.toFixed(1)}
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

        {stocks.length < 2 && (
          <div className="bg-bg-1 rounded-lg border border-border p-8 text-center">
            <p className="text-sm text-txt-3">請至少選擇 2 檔股票進行比較</p>
          </div>
        )}
      </main>
    </div>
  );
}
