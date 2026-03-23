"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { DailyData, Stock, StockGroup } from "@/lib/types";
import { formatPrice, formatPct, formatNumber, formatNet } from "@/lib/utils";
import { analyzeEma, getSignalFullLabel, getSignalColor } from "@/lib/ema";

// --- Seeded RNG helpers ---

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

// --- Stock name & price lookup maps ---

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
  "3324": 1065, "3017": 329, "6515": 7930, "6223": 3860,
  "2330": 1840, "2454": 1700, "6669": 3775, "2376": 378,
  "3037": 215, "2317": 178, "4977": 285, "4743": 328,
  "3576": 23.4, "2014": 19.6, "1301": 42.8, "1303": 38.5,
  "2007": 8.63, "2025": 11.6, "1325": 24.8, "2542": 67.5,
  "2388": 32.5, "6670": 142, "1471": 54.2, "3363": 95.8,
  "7795": 188, "6274": 142, "2401": 38.5, "2458": 128,
  "2548": 95.2, "2012": 32.5, "2379": 520, "5274": 3200,
  "6446": 480, "1402": 28.5, "2368": 165, "2421": 112,
  "4904": 85, "5534": 45.2,
};

// --- Mock data generators ---

function generatePriceSeries(seed: string, basePrice: number, count = 30): number[] {
  const rng = makeRng(seed + "_chart");
  // Start at ~92% of base price and drift toward it, staying within +/- 15%
  const startOffset = 0.88 + rng() * 0.09; // 0.88 ~ 0.97
  const prices: number[] = [basePrice * startOffset];
  for (let i = 1; i < count; i++) {
    const drift = (basePrice - prices[i - 1]) * 0.03; // mean-revert toward base
    const noise = (rng() - 0.5) * basePrice * 0.015;
    const next = prices[i - 1] + drift + noise;
    prices.push(Math.max(Math.min(next, basePrice * 1.15), basePrice * 0.85));
  }
  return prices;
}

function generateVolumeSeries(seed: string, baseVol: number, count = 30): number[] {
  const rng = makeRng(seed + "_vol");
  const vols: number[] = [];
  for (let i = 0; i < count; i++) {
    vols.push(Math.max(baseVol * (0.3 + rng() * 1.4), baseVol * 0.1));
  }
  return vols;
}

function generateDateLabels(count = 30): string[] {
  const labels: string[] = [];
  const now = new Date(2026, 2, 20);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    // Skip weekends
    const dow = d.getDay();
    if (dow === 0) d.setDate(d.getDate() - 2);
    else if (dow === 6) d.setDate(d.getDate() - 1);
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }
  return labels;
}

interface LimitUpEntry {
  date: string;
  group: string;
  nextDayOpenPct: number;
  nextDayClosePct: number;
  nextDayVol: number;
}

function mockLimitUpHistory(code: string): LimitUpEntry[] {
  const rng = makeRng(code + "_history");
  const months = ["2026-03", "2026-02", "2026-01", "2025-12", "2025-11"];
  const groups = ["AI 伺服器", "半導體設備", "光通訊", "PCB 基板", "IC 設計"];
  return months.map((m) => ({
    date: `${m}-${String(Math.floor(rng() * 20 + 1)).padStart(2, "0")}`,
    group: groups[Math.floor(rng() * groups.length)],
    nextDayOpenPct: (rng() - 0.3) * 6,
    nextDayClosePct: (rng() - 0.45) * 8,
    nextDayVol: Math.round(5000 + rng() * 30000),
  }));
}

interface TechnicalData {
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  rsi: number;
  macdSignal: "golden_cross" | "death_cross" | "neutral";
  kd_k: number;
  kd_d: number;
  overall: "bullish" | "neutral" | "bearish";
}

function mockTechnicalData(code: string, price: number): TechnicalData {
  const rng = makeRng(code + "_tech");
  const ma5 = price * (0.97 + rng() * 0.06);
  const ma10 = price * (0.94 + rng() * 0.08);
  const ma20 = price * (0.90 + rng() * 0.12);
  const ma60 = price * (0.85 + rng() * 0.15);
  const rsi = 30 + rng() * 50;
  const signals: Array<"golden_cross" | "death_cross" | "neutral"> = ["golden_cross", "death_cross", "neutral"];
  const macdSignal = signals[Math.floor(rng() * 3)];
  const kd_k = 20 + rng() * 65;
  const kd_d = 20 + rng() * 60;

  let overall: "bullish" | "neutral" | "bearish" = "neutral";
  if (rsi > 55 && price > ma5 && price > ma20) overall = "bullish";
  else if (rsi < 40 && price < ma5 && price < ma20) overall = "bearish";

  return { ma5, ma10, ma20, ma60, rsi, macdSignal, kd_k, kd_d, overall };
}

interface ChipData {
  foreign3d: number[];
  trust3d: number[];
  dealer3d: number[];
  topBuyers: { name: string; net: number }[];
  topSellers: { name: string; net: number }[];
  marginBuy: number;
  marginSell: number;
  shortSell: number;
  shortCover: number;
}

function mockChipData(code: string): ChipData {
  const rng = makeRng(code + "_chip");
  return {
    foreign3d: [
      Math.round((rng() - 0.4) * 5000),
      Math.round((rng() - 0.4) * 4000),
      Math.round((rng() - 0.4) * 6000),
    ],
    trust3d: [
      Math.round((rng() - 0.5) * 2000),
      Math.round((rng() - 0.5) * 1500),
      Math.round((rng() - 0.5) * 2500),
    ],
    dealer3d: [
      Math.round((rng() - 0.5) * 1000),
      Math.round((rng() - 0.5) * 800),
      Math.round((rng() - 0.5) * 1200),
    ],
    topBuyers: [
      { name: "凱基-台北", net: Math.round(500 + rng() * 3000) },
      { name: "元大-館前", net: Math.round(300 + rng() * 2000) },
      { name: "富邦-台中", net: Math.round(200 + rng() * 1500) },
    ],
    topSellers: [
      { name: "美林", net: Math.round(500 + rng() * 3000) },
      { name: "摩根士丹利", net: Math.round(300 + rng() * 2000) },
      { name: "瑞銀", net: Math.round(200 + rng() * 1500) },
    ],
    marginBuy: Math.round(1000 + rng() * 8000),
    marginSell: Math.round(800 + rng() * 6000),
    shortSell: Math.round(200 + rng() * 3000),
    shortCover: Math.round(150 + rng() * 2500),
  };
}

interface PeerStock {
  code: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  pe: number;
}

function mockPeerStocks(code: string, groupStocks: Stock[]): PeerStock[] {
  const rng = makeRng(code + "_peer");
  // Use real group stocks if available, else generate mock
  if (groupStocks.length > 1) {
    return groupStocks
      .filter((s) => s.code !== code)
      .slice(0, 4)
      .map((s) => ({
        code: s.code,
        name: s.name,
        price: s.close,
        changePct: s.change_pct,
        volume: s.volume,
        pe: +(12 + rng() * 30).toFixed(1),
      }));
  }
  const names = ["台積電", "聯發科", "鴻海", "廣達"];
  const codes = ["2330", "2454", "2317", "2382"];
  return names.map((n, i) => ({
    code: codes[i],
    name: n,
    price: +(100 + rng() * 800).toFixed(0),
    changePct: +((rng() - 0.4) * 12).toFixed(2),
    volume: Math.round(5000 + rng() * 50000),
    pe: +(10 + rng() * 35).toFixed(1),
  }));
}

// --- Section label component ---

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-sm font-bold text-txt-1 tracking-wide whitespace-nowrap">{children}</h2>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// --- Price Chart Component (SVG) ---

function PriceChart({
  code,
  basePrice,
  baseVol,
  color,
}: {
  code: string;
  basePrice: number;
  baseVol: number;
  color: string;
}) {
  const W = 800;
  const CHART_H = 200;
  const VOL_H = 50;
  const TOTAL_H = CHART_H + VOL_H + 30; // extra for x-axis labels
  const PAD_L = 55;
  const PAD_R = 10;
  const PAD_T = 10;
  const CHART_BOTTOM = CHART_H;
  const VOL_TOP = CHART_H + 8;
  const VOL_BOTTOM = CHART_H + VOL_H;
  const DRAW_W = W - PAD_L - PAD_R;

  const prices = generatePriceSeries(code, basePrice);
  const volumes = generateVolumeSeries(code, baseVol);
  const dateLabels = generateDateLabels(prices.length);

  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const pRange = pMax - pMin || 1;
  const vMax = Math.max(...volumes);

  // Price Y-axis ticks (5 ticks)
  const priceTicks: number[] = [];
  for (let i = 0; i < 5; i++) {
    priceTicks.push(pMin + (pRange * i) / 4);
  }

  const priceToY = (p: number) =>
    PAD_T + (CHART_BOTTOM - PAD_T) - ((p - pMin) / pRange) * (CHART_BOTTOM - PAD_T - 4);

  const volToH = (v: number) => (v / vMax) * (VOL_BOTTOM - VOL_TOP - 4);

  // Build polyline
  const linePoints = prices
    .map((p, i) => {
      const x = PAD_L + (i / (prices.length - 1)) * DRAW_W;
      const y = priceToY(p);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Build area path
  const areaPath = (() => {
    const pts = prices.map((p, i) => {
      const x = PAD_L + (i / (prices.length - 1)) * DRAW_W;
      const y = priceToY(p);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const lastX = PAD_L + DRAW_W;
    const firstX = PAD_L;
    return `M ${pts[0]} L ${pts.join(" L ")} L ${lastX},${CHART_BOTTOM} L ${firstX},${CHART_BOTTOM} Z`;
  })();

  // Current price Y
  const currentPriceY = priceToY(prices[prices.length - 1]);

  const gradId = `grad_${code}`;

  // X-axis: show every 5th label
  const xLabels: { x: number; label: string }[] = [];
  for (let i = 0; i < prices.length; i += 5) {
    xLabels.push({
      x: PAD_L + (i / (prices.length - 1)) * DRAW_W,
      label: dateLabels[i],
    });
  }

  return (
    <div className="w-full border border-border rounded-lg overflow-hidden bg-bg-2 mb-6">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider">30-Day Price / Volume</span>
        <span className="text-[10px] text-txt-4">
          High: {formatPrice(pMax)} / Low: {formatPrice(pMin)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${TOTAL_H}`} preserveAspectRatio="none" className="w-full" style={{ height: 280 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y-axis grid lines and labels */}
        {priceTicks.map((tick, i) => {
          const y = priceToY(tick);
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              <text x={PAD_L - 8} y={y + 3} textAnchor="end" fill="#475569" fontSize="9" fontFamily="monospace">
                {formatPrice(tick)}
              </text>
            </g>
          );
        })}

        {/* Current price dashed line */}
        <line
          x1={PAD_L}
          y1={currentPriceY}
          x2={W - PAD_R}
          y2={currentPriceY}
          stroke={color}
          strokeWidth="1"
          strokeDasharray="4,3"
          opacity="0.6"
        />
        <text
          x={W - PAD_R + 2}
          y={currentPriceY + 3}
          fill={color}
          fontSize="8"
          fontFamily="monospace"
        >
          {formatPrice(prices[prices.length - 1])}
        </text>

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradId})`} />

        {/* Price line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* EMA overlay lines */}
        {(() => {
          const { ema11Series, ema24Series } = analyzeEma(code, basePrice);
          const last30_11 = ema11Series.slice(-30);
          const last30_24 = ema24Series.slice(-30);
          const ema11Points = last30_11
            .map((v, i) => {
              const x = PAD_L + (i / (prices.length - 1)) * DRAW_W;
              const y = priceToY(v);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
          const ema24Points = last30_24
            .map((v, i) => {
              const x = PAD_L + (i / (prices.length - 1)) * DRAW_W;
              const y = priceToY(v);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");
          return (
            <>
              <polyline points={ema24Points} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.6" strokeDasharray="4,2" />
              <polyline points={ema11Points} fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.7" />
            </>
          );
        })()}

        {/* Volume bars */}
        {volumes.map((v, i) => {
          const x = PAD_L + (i / (prices.length - 1)) * DRAW_W;
          const barW = DRAW_W / prices.length * 0.7;
          const barH = volToH(v);
          const isUp = i > 0 ? prices[i] >= prices[i - 1] : true;
          return (
            <rect
              key={i}
              x={x - barW / 2}
              y={VOL_BOTTOM - barH}
              width={barW}
              height={barH}
              fill={isUp ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}
              rx="1"
            />
          );
        })}

        {/* X-axis date labels */}
        {xLabels.map(({ x, label }, i) => (
          <text key={i} x={x} y={TOTAL_H - 4} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="monospace">
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// --- RSI Gauge ---

function RsiGauge({ value }: { value: number }) {
  const w = 120;
  const h = 14;
  const fillW = (value / 100) * w;
  let fillColor = "#f59e0b"; // amber for neutral
  if (value > 70) fillColor = "#ef4444";
  else if (value < 30) fillColor = "#22c55e";

  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={h}>
        <rect x="0" y="2" width={w} height="10" rx="3" fill="rgba(255,255,255,0.05)" />
        <rect x="0" y="2" width={fillW} height="10" rx="3" fill={fillColor} opacity="0.7" />
        {/* Overbought / oversold markers */}
        <line x1={(30 / 100) * w} y1="0" x2={(30 / 100) * w} y2={h} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <line x1={(70 / 100) * w} y1="0" x2={(70 / 100) * w} y2={h} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      </svg>
      <span className="text-xs font-bold tabular-nums" style={{ color: fillColor }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

// --- Chip bar visual ---

function ChipBar({ values, label }: { values: number[]; label: string }) {
  const total = values.reduce((a, b) => a + b, 0);
  const maxAbs = Math.max(...values.map(Math.abs), 1);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-txt-3 tracking-wider">{label}</span>
        <span className={`text-xs font-bold tabular-nums ${total > 0 ? "text-red" : total < 0 ? "text-green" : "text-txt-3"}`}>
          {total > 0 ? "+" : ""}{formatNumber(total)}
        </span>
      </div>
      <div className="flex gap-1">
        {values.map((v, i) => {
          const barW = Math.max((Math.abs(v) / maxAbs) * 100, 8);
          return (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div
                className="h-4 rounded-sm"
                style={{
                  width: `${barW}%`,
                  backgroundColor: v >= 0 ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)",
                }}
              />
              <span className="text-[9px] tabular-nums text-txt-4">
                {v > 0 ? "+" : ""}{formatNumber(v)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-0.5">
        {["D-2", "D-1", "Today"].map((d, i) => (
          <span key={i} className="flex-1 text-[8px] text-txt-4">{d}</span>
        ))}
      </div>
    </div>
  );
}

// --- Page ---

interface PageProps {
  params: Promise<{ code: string }>;
}

export default function StockDetailPage({ params }: PageProps) {
  const { code } = use(params);
  const [stock, setStock] = useState<Stock | null>(null);
  const [group, setGroup] = useState<StockGroup | null>(null);
  const [allGroups, setAllGroups] = useState<StockGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/daily/latest")
      .then((r) => r.json())
      .then((data: DailyData) => {
        setAllGroups(data.groups ?? []);
        for (const g of data.groups ?? []) {
          const found = g.stocks.find((s) => s.code === code);
          if (found) {
            setStock(found);
            setGroup(g);
            break;
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [code]);

  const fallbackPrice = STOCK_PRICES[code] ?? 100;
  const displayStock: Stock = stock ?? {
    code,
    name: STOCK_NAMES[code] ?? `Stock ${code}`,
    industry: "--",
    close: fallbackPrice,
    change_pct: 10,
    volume: 10000,
    major_net: 1000,
    streak: 0,
  };

  const displayGroup = group ?? { name: "--", color: "#ef4444", badges: [], reason: "--", stocks: [] };
  const rng = makeRng(code);
  const isPositive = displayStock.change_pct >= 0;
  const changeAmount = displayStock.close * (displayStock.change_pct / 100) / (1 + displayStock.change_pct / 100);
  const marketType = rng() > 0.3 ? "上市" : "上櫃";

  // Key metrics
  const openPrice = displayStock.close * (0.9 + rng() * 0.05);
  const highPrice = displayStock.close;
  const lowPrice = openPrice * (0.93 + rng() * 0.04);
  const pe = +(15 + rng() * 25).toFixed(1);
  const marketCap = Math.round(displayStock.close * (800 + rng() * 5000));

  // Technical
  const tech = mockTechnicalData(code, displayStock.close);

  // Chips
  const chip = mockChipData(code);

  // History
  const limitUpHistory = mockLimitUpHistory(code);

  // Peers
  const peers = mockPeerStocks(code, displayGroup.stocks);

  // Groups this stock appeared in
  const appearedGroups: { name: string; color: string }[] = [];
  for (const g of allGroups) {
    if (g.stocks.some((s) => s.code === code)) {
      appearedGroups.push({ name: g.name, color: g.color });
    }
  }
  const mockHistGroups = [
    { name: "AI 伺服器 / 散熱", color: "#ef4444" },
    { name: "半導體設備", color: "#22c55e" },
    { name: "光通訊", color: "#3b82f6" },
  ].filter((g) => !appearedGroups.some((a) => a.name === g.name));
  const allAppearedGroups = [...appearedGroups, ...mockHistGroups.slice(0, 3 - appearedGroups.length)].slice(0, 4);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate="2026-03-20" stocks={stock ? [stock] : []} />
      <NavBar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 md:px-5 py-5">
          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-txt-4 hover:text-txt-1 transition-colors mb-5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-60">
              <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </Link>

          {loading ? (
            <div className="text-txt-4 text-sm text-center py-20">Loading...</div>
          ) : (
            <>
              {/* ============================================================
                  SECTION 1: Stock Header
                  ============================================================ */}
              <div className="bg-bg-1 border border-border rounded-xl p-5 mb-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-mono font-semibold text-txt-3">{displayStock.code}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-bg-3 border border-border rounded font-semibold text-txt-3">
                        {displayStock.industry}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          marketType === "上市"
                            ? "bg-blue-bg text-blue border border-blue/20"
                            : "bg-amber-bg text-amber border border-amber/20"
                        }`}
                      >
                        {marketType}
                      </span>
                    </div>
                    <h1 className="text-xl md:text-3xl font-bold text-txt-0 tracking-tight mb-2">{displayStock.name}</h1>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://www.google.com/search?q=${displayStock.code}+外資買超`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2.5 py-1 rounded bg-bg-3 border border-border text-txt-3 hover:text-txt-1 hover:border-border-hover transition-colors"
                      >
                        Foreign Net Buy
                      </a>
                      <a
                        href={`https://www.google.com/search?q=${displayStock.code}+${displayStock.name}+新聞`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2.5 py-1 rounded bg-bg-3 border border-border text-txt-3 hover:text-txt-1 hover:border-border-hover transition-colors"
                      >
                        News
                      </a>
                      <a
                        href={`https://mops.twse.com.tw/mops/web/t05st01_0`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2.5 py-1 rounded bg-bg-3 border border-border text-txt-3 hover:text-txt-1 hover:border-border-hover transition-colors"
                      >
                        Announcements
                      </a>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="flex items-baseline gap-2 justify-end">
                      <span className={`text-xl md:text-3xl font-bold tabular-nums ${isPositive ? "text-red" : "text-green"}`}>
                        {formatPrice(displayStock.close)}
                      </span>
                      <span className={`text-lg ${isPositive ? "text-red" : "text-green"}`}>
                        {isPositive ? "^" : "v"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 justify-end">
                      <span
                        className={`text-sm font-semibold tabular-nums ${isPositive ? "text-red" : "text-green"}`}
                      >
                        {isPositive ? "+" : ""}{changeAmount.toFixed(2)}
                      </span>
                      <span
                        className={`text-sm font-bold px-2.5 py-0.5 rounded tabular-nums ${
                          isPositive ? "bg-red-bg text-red" : "bg-green-bg text-green"
                        }`}
                      >
                        {formatPct(displayStock.change_pct)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ============================================================
                  SECTION 2: Price Chart
                  ============================================================ */}
              <PriceChart
                code={code}
                basePrice={displayStock.close}
                baseVol={displayStock.volume}
                color={displayGroup.color}
              />

              {/* ============================================================
                  SECTION 3: Key Metrics Grid (2 x 4)
                  ============================================================ */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Open", sub: "開盤", value: formatPrice(openPrice), positive: openPrice >= displayStock.close * 0.95 },
                  { label: "High", sub: "最高", value: formatPrice(highPrice), positive: true },
                  { label: "Low", sub: "最低", value: formatPrice(lowPrice), positive: false },
                  { label: "Volume", sub: "成交量", value: formatNumber(displayStock.volume) + " lots", positive: null },
                  { label: "Major Net", sub: "主力買超", value: formatNet(displayStock.major_net) + " lots", positive: displayStock.major_net > 0 },
                  { label: "Streak", sub: "連板天數", value: displayStock.streak > 0 ? `${displayStock.streak} days` : "--", positive: displayStock.streak > 0 ? true : null },
                  { label: "P/E", sub: "本益比", value: pe.toFixed(1), positive: null },
                  { label: "Mkt Cap", sub: "市值", value: marketCap.toLocaleString() + " B", positive: null },
                ].map(({ label, sub, value, positive }) => (
                  <div
                    key={label}
                    className={`rounded-lg px-3.5 py-3 border ${
                      positive === true
                        ? "bg-red-bg border-red/10"
                        : positive === false
                        ? "bg-green-bg border-green/10"
                        : "bg-bg-2 border-border"
                    }`}
                  >
                    <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-0.5">{label}</div>
                    <div className="text-[10px] text-txt-4 mb-1">{sub}</div>
                    <div
                      className={`text-sm font-bold tabular-nums ${
                        positive === true ? "text-red" : positive === false ? "text-green" : "text-txt-1"
                      }`}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Two-column layout for Technical + Chip analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
                {/* ============================================================
                    SECTION 4: Technical Analysis
                    ============================================================ */}
                <div className="bg-bg-1 border border-border rounded-xl p-5">
                  <SectionLabel>Technical Analysis / 技術面分析</SectionLabel>

                  {/* 快樂小馬 EMA11/24 */}
                  {(() => {
                    const emaResult = analyzeEma(code, displayStock.close);
                    const sc = getSignalColor(emaResult.signal);
                    return (
                      <div className="mb-5">
                        <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-2 flex items-center gap-2">
                          HAPPY PONY / 快樂小馬 EMA11 x EMA24
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>
                            {getSignalFullLabel(emaResult.signal)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 md:gap-4 mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-[2px] bg-blue rounded" />
                            <span className="text-[11px] text-txt-3">EMA11</span>
                            <span className="text-sm font-bold text-blue tabular-nums">{emaResult.ema11.toFixed(1)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-[2px] bg-amber rounded" />
                            <span className="text-[11px] text-txt-3">EMA24</span>
                            <span className="text-sm font-bold text-amber tabular-nums">{emaResult.ema24.toFixed(1)}</span>
                          </div>
                          <div className="text-[11px] text-txt-4">
                            差值: <span className={`font-bold ${emaResult.ema11 > emaResult.ema24 ? "text-red" : "text-green"}`}>
                              {(emaResult.ema11 - emaResult.ema24) > 0 ? "+" : ""}{(emaResult.ema11 - emaResult.ema24).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {/* Mini EMA chart */}
                        <div className="bg-bg-3 rounded-lg p-3 border border-border">
                          <svg viewBox="0 0 400 100" className="w-full" style={{ height: 80 }}>
                            {(() => {
                              const last30_11 = emaResult.ema11Series.slice(-30);
                              const last30_24 = emaResult.ema24Series.slice(-30);
                              const all = [...last30_11, ...last30_24];
                              const min = Math.min(...all);
                              const max = Math.max(...all);
                              const range = max - min || 1;
                              const toX = (i: number) => (i / 29) * 380 + 10;
                              const toY = (v: number) => 90 - ((v - min) / range) * 80;
                              const pts11 = last30_11.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
                              const pts24 = last30_24.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
                              return (
                                <>
                                  <polyline points={pts24} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.7" />
                                  <polyline points={pts11} fill="none" stroke="#3b82f6" strokeWidth="2" />
                                </>
                              );
                            })()}
                          </svg>
                          <div className="flex items-center justify-center gap-4 mt-1 text-[9px] text-txt-4">
                            <span className="flex items-center gap-1"><span className="w-3 h-[2px] bg-blue inline-block rounded" /> EMA11</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-[2px] bg-amber inline-block rounded" /> EMA24</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Moving Averages */}
                  <div className="mb-5">
                    <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider mb-2">Moving Averages</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "MA5 (5日)", value: tech.ma5 },
                        { label: "MA10 (10日)", value: tech.ma10 },
                        { label: "MA20 (20日)", value: tech.ma20 },
                        { label: "MA60 (60日)", value: tech.ma60 },
                      ].map(({ label, value }) => {
                        const aboveMA = displayStock.close > value;
                        return (
                          <div key={label} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-bg-2">
                            <span className="text-[10px] text-txt-3">{label}</span>
                            <span className={`text-xs font-bold tabular-nums ${aboveMA ? "text-red" : "text-green"}`}>
                              {formatPrice(value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* RSI */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider">RSI (14)</span>
                      <span className="text-[9px] text-txt-4">
                        {tech.rsi > 70 ? "Overbought" : tech.rsi < 30 ? "Oversold" : "Neutral"}
                      </span>
                    </div>
                    <RsiGauge value={tech.rsi} />
                  </div>

                  {/* MACD */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider">MACD Signal</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          tech.macdSignal === "golden_cross"
                            ? "bg-red-bg text-red"
                            : tech.macdSignal === "death_cross"
                            ? "bg-green-bg text-green"
                            : "bg-bg-3 text-txt-3"
                        }`}
                      >
                        {tech.macdSignal === "golden_cross" ? "Golden Cross / 金叉" : tech.macdSignal === "death_cross" ? "Death Cross / 死叉" : "Neutral / 中性"}
                      </span>
                    </div>
                  </div>

                  {/* KD */}
                  <div className="mb-4">
                    <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider mb-1.5">KD Indicator</div>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-txt-4">K:</span>
                        <span className="text-xs font-bold tabular-nums text-txt-1">{tech.kd_k.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-txt-4">D:</span>
                        <span className="text-xs font-bold tabular-nums text-txt-1">{tech.kd_d.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-txt-4">K-D:</span>
                        <span className={`text-xs font-bold tabular-nums ${tech.kd_k > tech.kd_d ? "text-red" : "text-green"}`}>
                          {(tech.kd_k - tech.kd_d) > 0 ? "+" : ""}{(tech.kd_k - tech.kd_d).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Overall Signal */}
                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider">Overall Signal</span>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded ${
                          tech.overall === "bullish"
                            ? "bg-red-bg text-red"
                            : tech.overall === "bearish"
                            ? "bg-green-bg text-green"
                            : "bg-amber-bg text-amber"
                        }`}
                      >
                        {tech.overall === "bullish" ? "Bullish / 偏多" : tech.overall === "bearish" ? "Bearish / 偏空" : "Neutral / 中性"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ============================================================
                    SECTION 5: Chip Analysis
                    ============================================================ */}
                <div className="bg-bg-1 border border-border rounded-xl p-5">
                  <SectionLabel>Chip Analysis / 籌碼面分析</SectionLabel>

                  {/* 3-day institutional */}
                  <div className="mb-5">
                    <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider mb-2">3-Day Institutional Net (lots)</div>
                    <ChipBar values={chip.foreign3d} label="Foreign / 外資" />
                    <ChipBar values={chip.trust3d} label="Trust / 投信" />
                    <ChipBar values={chip.dealer3d} label="Dealer / 自營" />
                  </div>

                  {/* Top brokers */}
                  <div className="mb-5">
                    <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider mb-2">Top Brokers / 主要券商</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[9px] text-red mb-1 font-semibold">BUY SIDE</div>
                        {chip.topBuyers.map((b, i) => (
                          <div key={i} className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-b-0">
                            <span className="text-[10px] text-txt-2">{b.name}</span>
                            <span className="text-[10px] font-bold tabular-nums text-red">+{formatNumber(b.net)}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div className="text-[9px] text-green mb-1 font-semibold">SELL SIDE</div>
                        {chip.topSellers.map((s, i) => (
                          <div key={i} className="flex items-center justify-between py-1 border-b border-white/[0.03] last:border-b-0">
                            <span className="text-[10px] text-txt-2">{s.name}</span>
                            <span className="text-[10px] font-bold tabular-nums text-green">-{formatNumber(s.net)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Margin trading */}
                  <div>
                    <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider mb-2">Margin / 融資融券</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-bg-2 rounded-lg px-3 py-2">
                        <div className="text-[9px] text-txt-4 mb-0.5">Margin Buy / 融資買進</div>
                        <div className="text-xs font-bold tabular-nums text-txt-1">{formatNumber(chip.marginBuy)}</div>
                      </div>
                      <div className="bg-bg-2 rounded-lg px-3 py-2">
                        <div className="text-[9px] text-txt-4 mb-0.5">Margin Sell / 融資賣出</div>
                        <div className="text-xs font-bold tabular-nums text-txt-1">{formatNumber(chip.marginSell)}</div>
                      </div>
                      <div className="bg-bg-2 rounded-lg px-3 py-2">
                        <div className="text-[9px] text-txt-4 mb-0.5">Short Sell / 融券賣出</div>
                        <div className="text-xs font-bold tabular-nums text-txt-1">{formatNumber(chip.shortSell)}</div>
                      </div>
                      <div className="bg-bg-2 rounded-lg px-3 py-2">
                        <div className="text-[9px] text-txt-4 mb-0.5">Short Cover / 融券回補</div>
                        <div className="text-xs font-bold tabular-nums text-txt-1">{formatNumber(chip.shortCover)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ============================================================
                  SECTION 6: Limit-Up History
                  ============================================================ */}
              <div className="mb-6">
                <SectionLabel>Limit-Up History / 歷史漲停紀錄</SectionLabel>
                <div className="overflow-x-auto">
                <div className="border border-border rounded-xl overflow-hidden min-w-[500px]">
                  <div className="grid grid-cols-[1fr_1.2fr_0.8fr_0.8fr_0.8fr] gap-0 px-4 py-2.5 bg-bg-2 border-b border-border">
                    {["Date / 日期", "Group / 族群", "Next Open%", "Next Close%", "Volume"].map((h) => (
                      <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  {limitUpHistory.map((entry, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_1.2fr_0.8fr_0.8fr_0.8fr] gap-0 px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="text-xs tabular-nums text-txt-2">{entry.date}</div>
                      <div className="text-xs text-txt-2 truncate pr-2">{entry.group}</div>
                      <div
                        className={`text-xs font-semibold tabular-nums ${
                          entry.nextDayOpenPct > 0 ? "text-red" : entry.nextDayOpenPct < 0 ? "text-green" : "text-txt-3"
                        }`}
                      >
                        {entry.nextDayOpenPct > 0 ? "+" : ""}{entry.nextDayOpenPct.toFixed(2)}%
                      </div>
                      <div
                        className={`text-xs font-semibold tabular-nums ${
                          entry.nextDayClosePct > 0 ? "text-red" : entry.nextDayClosePct < 0 ? "text-green" : "text-txt-3"
                        }`}
                      >
                        {entry.nextDayClosePct > 0 ? "+" : ""}{entry.nextDayClosePct.toFixed(2)}%
                      </div>
                      <div className="text-xs tabular-nums text-txt-2">{formatNumber(entry.nextDayVol)}</div>
                    </div>
                  ))}
                </div>
                </div>
              </div>

              {/* ============================================================
                  SECTION 7: Peer Comparison
                  ============================================================ */}
              <div className="mb-6">
                <SectionLabel>Peer Comparison / 同族群比較</SectionLabel>
                <div className="overflow-x-auto">
                <div className="border border-border rounded-xl overflow-hidden min-w-[500px]">
                  <div className="grid grid-cols-[0.6fr_1fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-0 px-4 py-2.5 bg-bg-2 border-b border-border">
                    {["Code", "Name", "Price", "Change%", "Volume", "P/E"].map((h) => (
                      <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  {peers.map((p) => (
                    <Link
                      key={p.code}
                      href={`/stock/${p.code}`}
                      className="grid grid-cols-[0.6fr_1fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-0 px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="text-xs font-mono tabular-nums text-txt-3">{p.code}</div>
                      <div className="text-xs text-txt-1 font-semibold truncate pr-2">{p.name}</div>
                      <div className="text-xs font-bold tabular-nums text-txt-1">{formatPrice(p.price)}</div>
                      <div
                        className={`text-xs font-semibold tabular-nums ${
                          p.changePct > 0 ? "text-red" : p.changePct < 0 ? "text-green" : "text-txt-3"
                        }`}
                      >
                        {p.changePct > 0 ? "+" : ""}{p.changePct.toFixed(2)}%
                      </div>
                      <div className="text-xs tabular-nums text-txt-2">{formatNumber(p.volume)}</div>
                      <div className="text-xs tabular-nums text-txt-2">{p.pe}</div>
                    </Link>
                  ))}
                </div>
                </div>
              </div>

              {/* ============================================================
                  SECTION 8: Groups
                  ============================================================ */}
              <div className="mb-10">
                <SectionLabel>Groups / 所屬族群</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {allAppearedGroups.map(({ name, color }) => (
                    <span
                      key={name}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold border"
                      style={{
                        backgroundColor: `${color}18`,
                        borderColor: `${color}40`,
                        color,
                      }}
                    >
                      {name}
                    </span>
                  ))}
                  {allAppearedGroups.length === 0 && (
                    <span className="text-xs text-txt-4">No group data available</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
