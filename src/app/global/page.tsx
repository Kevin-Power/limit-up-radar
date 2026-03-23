"use client";

import { useState } from "react";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPct, formatPrice } from "@/lib/utils";

/* ================================================================
   SEEDED RNG
   ================================================================ */

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateSparkline(seed: number, base: number, volatility: number): number[] {
  const rng = seededRng(seed);
  const points: number[] = [];
  let val = base;
  for (let i = 0; i < 30; i++) {
    val += (rng() - 0.48) * volatility;
    points.push(val);
  }
  return points;
}

function sparklinePath(data: number[], w: number, h: number): string {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/* ================================================================
   TYPES & MOCK DATA
   ================================================================ */

type Region = "americas" | "asia" | "europe";

interface IndexData {
  id: string;
  name: string;
  nameCn: string;
  region: Region;
  value: number;
  change: number;
  changePct: number;
  sparkSeed: number;
  volatility: number;
  emaSignal: "multi" | "short";
}

const INDICES: IndexData[] = [
  // Americas
  { id: "spx",   name: "S&P 500",           nameCn: "標普500",   region: "americas", value: 5823.45, change: 32.18,   changePct: 0.56,  sparkSeed: 101, volatility: 15, emaSignal: "multi" },
  { id: "ndx",   name: "NASDAQ",             nameCn: "那斯達克",  region: "americas", value: 19042.73, change: 148.52, changePct: 0.79,  sparkSeed: 102, volatility: 55, emaSignal: "multi" },
  { id: "dji",   name: "Dow Jones",          nameCn: "道瓊工業",  region: "americas", value: 43218.60, change: -85.30, changePct: -0.20, sparkSeed: 103, volatility: 120, emaSignal: "multi" },
  { id: "vix",   name: "VIX",                nameCn: "恐慌指數",  region: "americas", value: 18.42,    change: -0.85,  changePct: -4.41, sparkSeed: 104, volatility: 0.5, emaSignal: "short" },
  // Asia-Pacific
  { id: "twii",  name: "TAIEX",              nameCn: "加權指數",  region: "asia", value: 33689.12, change: 151.37,  changePct: 0.45,  sparkSeed: 201, volatility: 120, emaSignal: "multi" },
  { id: "n225",  name: "Nikkei 225",         nameCn: "日經225",   region: "asia", value: 39821.50, change: -124.30, changePct: -0.31, sparkSeed: 202, volatility: 150, emaSignal: "short" },
  { id: "hsi",   name: "Hang Seng",          nameCn: "恒生指數",  region: "asia", value: 17285.60, change: 98.73,   changePct: 0.57,  sparkSeed: 203, volatility: 60, emaSignal: "short" },
  { id: "kospi", name: "KOSPI",              nameCn: "韓國綜合",  region: "asia", value: 2634.18,  change: -12.45,  changePct: -0.47, sparkSeed: 204, volatility: 10, emaSignal: "short" },
  { id: "shcomp",name: "Shanghai Composite", nameCn: "上證綜指",  region: "asia", value: 3078.42,  change: 15.67,   changePct: 0.51,  sparkSeed: 205, volatility: 12, emaSignal: "multi" },
  // Europe
  { id: "dax",   name: "DAX",                nameCn: "德國DAX",   region: "europe", value: 18456.30, change: 72.15,   changePct: 0.39,  sparkSeed: 301, volatility: 50, emaSignal: "multi" },
  { id: "ftse",  name: "FTSE 100",           nameCn: "英國富時",  region: "europe", value: 8124.85,  change: -18.42,  changePct: -0.23, sparkSeed: 302, volatility: 25, emaSignal: "short" },
  { id: "cac",   name: "CAC 40",             nameCn: "法國CAC",   region: "europe", value: 8042.56,  change: 35.80,   changePct: 0.45,  sparkSeed: 303, volatility: 22, emaSignal: "multi" },
  { id: "stoxx", name: "STOXX 600",          nameCn: "歐洲600",   region: "europe", value: 512.38,   change: 1.92,    changePct: 0.38,  sparkSeed: 304, volatility: 1.5, emaSignal: "multi" },
  { id: "ibex",  name: "IBEX 35",            nameCn: "西班牙IBEX",region: "europe", value: 11284.70, change: -42.35,  changePct: -0.37, sparkSeed: 305, volatility: 35, emaSignal: "short" },
];

const REGION_INFO: { key: Region; label: string; labelEn: string }[] = [
  { key: "americas", label: "美洲", labelEn: "Americas" },
  { key: "asia",     label: "亞太", labelEn: "Asia-Pacific" },
  { key: "europe",   label: "歐洲", labelEn: "Europe" },
];

function getRegionSentiment(region: Region): { label: string; color: string } {
  const items = INDICES.filter((i) => i.region === region);
  const upCount = items.filter((i) => i.changePct > 0).length;
  const ratio = upCount / items.length;
  if (ratio >= 0.6) return { label: "偏多", color: "text-green bg-green-bg" };
  if (ratio <= 0.4) return { label: "偏空", color: "text-red bg-red-bg" };
  return { label: "中性", color: "text-amber bg-amber-bg" };
}

/* ================================================================
   RISK DATA
   ================================================================ */

const RISK_DATA = {
  vix: 18.42,
  us10y: 4.28,
  dxy: 104.35,
  fearGreed: 58,
};

function vixLevel(v: number): { label: string; color: string } {
  if (v < 15) return { label: "Low", color: "text-green" };
  if (v <= 25) return { label: "Moderate", color: "text-amber" };
  return { label: "High", color: "text-red" };
}

function fearGreedLabel(v: number): { label: string; color: string } {
  if (v <= 25) return { label: "Extreme Fear", color: "text-red" };
  if (v <= 45) return { label: "Fear", color: "text-amber" };
  if (v <= 55) return { label: "Neutral", color: "text-txt-2" };
  if (v <= 75) return { label: "Greed", color: "text-green" };
  return { label: "Extreme Greed", color: "text-green" };
}

/* ================================================================
   SUB-COMPONENTS
   ================================================================ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-txt-0 tracking-tight mb-4 flex items-center gap-2">
      <span className="w-1 h-4 bg-accent rounded-full inline-block" />
      {children}
    </h2>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-bg-1 border border-border rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

/* ================================================================
   INDEX CARD
   ================================================================ */

function IndexCard({ idx }: { idx: IndexData }) {
  const isUp = idx.changePct >= 0;
  const borderColor = isUp ? "border-green/40" : "border-red/40";
  const changeColor = isUp ? "text-green" : "text-red";
  const sparkData = generateSparkline(idx.sparkSeed, idx.value, idx.volatility);
  const path = sparklinePath(sparkData, 100, 28);
  const strokeColor = isUp ? "var(--green)" : "var(--red)";
  const sign = isUp ? "+" : "";

  return (
    <div className={`bg-bg-1 border ${borderColor} rounded-lg p-4 hover:border-border-hover transition-colors`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-xs text-txt-3 font-medium">{idx.name}</div>
          <div className="text-[10px] text-txt-4">{idx.nameCn}</div>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            idx.emaSignal === "multi"
              ? "text-green bg-green-bg"
              : "text-red bg-red-bg"
          }`}
        >
          {idx.emaSignal === "multi" ? "多頭" : "空頭"}
        </span>
      </div>

      <div className="text-lg font-bold text-txt-0 tracking-tight mb-1">
        {idx.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      <div className={`text-xs font-mono ${changeColor} mb-2`}>
        {sign}{idx.change.toFixed(2)} ({sign}{idx.changePct.toFixed(2)}%)
      </div>

      <svg viewBox="0 0 100 28" className="w-full h-7" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/* ================================================================
   VIX GAUGE
   ================================================================ */

function VixGauge({ value }: { value: number }) {
  const maxVix = 50;
  const pct = Math.min(value / maxVix, 1) * 100;
  const level = vixLevel(value);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-txt-3">VIX</span>
        <span className={`text-xs font-medium ${level.color}`}>{level.label}</span>
      </div>
      <div className="w-full h-2 bg-bg-3 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: value < 15 ? "var(--green)" : value <= 25 ? "var(--amber)" : "var(--red)",
          }}
        />
      </div>
      <div className="text-right text-xs font-mono text-txt-2 mt-0.5">{value.toFixed(2)}</div>
    </div>
  );
}

/* ================================================================
   FEAR & GREED GAUGE
   ================================================================ */

function FearGreedGauge({ value }: { value: number }) {
  const fg = fearGreedLabel(value);
  const pct = value;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-txt-3">Fear & Greed</span>
        <span className={`text-xs font-medium ${fg.color}`}>{fg.label}</span>
      </div>
      <div className="w-full h-2 bg-bg-3 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background:
              value <= 25
                ? "var(--red)"
                : value <= 45
                ? "var(--amber)"
                : value <= 55
                ? "var(--text-3)"
                : "var(--green)",
          }}
        />
      </div>
      <div className="text-right text-xs font-mono text-txt-2 mt-0.5">{value}/100</div>
    </div>
  );
}

/* ================================================================
   MAIN PAGE
   ================================================================ */

export default function GlobalPage() {
  const [activeRegion, setActiveRegion] = useState<Region | "all">("all");

  const filteredIndices =
    activeRegion === "all"
      ? INDICES
      : INDICES.filter((i) => i.region === activeRegion);

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1">
      <TopNav currentDate="2026-03-20" />
      <NavBar />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold text-txt-0 tracking-tight">國際市場</h1>
          <p className="text-sm text-txt-3 mt-1">全球主要指數即時概覽</p>
        </div>

        {/* ── Regional Summary Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {REGION_INFO.map((r) => {
            const sentiment = getRegionSentiment(r.key);
            const items = INDICES.filter((i) => i.region === r.key);
            const upCount = items.filter((i) => i.changePct > 0).length;
            return (
              <Card key={r.key}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-base font-bold text-txt-0">{r.label}</div>
                    <div className="text-[10px] text-txt-4">{r.labelEn}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded font-medium ${sentiment.color}`}>
                    {sentiment.label}
                  </span>
                </div>
                <div className="text-[11px] text-txt-3 mt-2">
                  {upCount} 漲 / {items.length - upCount} 跌 (共 {items.length} 指數)
                </div>
              </Card>
            );
          })}
        </div>

        {/* ── Region Filter ── */}
        <div className="flex gap-2">
          {[
            { key: "all" as const, label: "全部" },
            ...REGION_INFO.map((r) => ({ key: r.key, label: r.label })),
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveRegion(tab.key)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeRegion === tab.key
                  ? "bg-accent text-white"
                  : "bg-bg-2 text-txt-3 hover:text-txt-1"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Indices Grid ── */}
        <section>
          <SectionTitle>指數總覽</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredIndices.map((idx) => (
              <IndexCard key={idx.id} idx={idx} />
            ))}
          </div>
        </section>

        {/* ── Global Risk Tone ── */}
        <section>
          <SectionTitle>全球風險情緒</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* VIX Gauge */}
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">VIX 恐慌指數</div>
              <VixGauge value={RISK_DATA.vix} />
            </Card>

            {/* US 10Y */}
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">美國10年期公債殖利率</div>
              <div className="text-xl font-bold text-txt-0 tracking-tight">{RISK_DATA.us10y.toFixed(2)}%</div>
              <div className="text-xs text-red mt-1">+0.03 (較前日)</div>
            </Card>

            {/* DXY */}
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">美元指數 DXY</div>
              <div className="text-xl font-bold text-txt-0 tracking-tight">{RISK_DATA.dxy.toFixed(2)}</div>
              <div className="text-xs text-green mt-1">-0.18 (較前日)</div>
            </Card>

            {/* Fear & Greed */}
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">Fear & Greed Index</div>
              <FearGreedGauge value={RISK_DATA.fearGreed} />
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
