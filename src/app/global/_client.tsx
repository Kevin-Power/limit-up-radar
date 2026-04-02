"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { getTodayString } from "@/lib/utils";
import type { GlobalIndex } from "@/app/api/market/global/route";

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
   TYPES & CONSTANTS
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
  realSparkline?: number[];
}

const REGION_INFO: { key: Region; label: string; labelEn: string }[] = [
  { key: "americas", label: "美洲", labelEn: "Americas" },
  { key: "asia",     label: "亞太", labelEn: "Asia-Pacific" },
  { key: "europe",   label: "歐洲", labelEn: "Europe" },
];

function getRegionSentiment(region: Region, indices: IndexData[]): { label: string; color: string } {
  const items = indices.filter((i) => i.region === region);
  if (items.length === 0) return { label: "中性", color: "text-amber bg-amber-bg" };
  const upCount = items.filter((i) => i.changePct > 0).length;
  const ratio = upCount / items.length;
  if (ratio >= 0.6) return { label: "偏多", color: "text-green bg-green-bg" };
  if (ratio <= 0.4) return { label: "偏空", color: "text-red bg-red-bg" };
  return { label: "中性", color: "text-amber bg-amber-bg" };
}

/* ================================================================
   RISK DATA
   ================================================================ */

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
  const sparkData = idx.realSparkline;
  const path = sparkData ? sparklinePath(sparkData, 100, 28) : "";
  const strokeColor = isUp ? "var(--green)" : "var(--red)";
  const sign = isUp ? "+" : "";

  return (
    <div className={`bg-bg-1 border ${borderColor} rounded-lg p-4 hover:border-border-hover transition-colors card-hover`}>
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

      <div className="text-lg font-bold text-txt-0 tracking-tight mb-1 tabular-nums">
        {idx.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      <div className={`text-xs font-mono tabular-nums ${changeColor} mb-2`}>
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

function realToIndexData(r: GlobalIndex): IndexData {
  return {
    id: r.symbol.toLowerCase().replace(/[\^=\-.]/g, ""),
    name: r.name,
    nameCn: r.nameCn,
    region: r.region,
    value: r.price,
    change: r.change,
    changePct: r.changePct,
    sparkSeed: 0,
    volatility: 0,
    emaSignal: r.changePct >= 0 ? "multi" : "short",
    realSparkline: r.sparkline.length > 2 ? r.sparkline : undefined,
  };
}

export default function GlobalPage() {
  const [activeRegion, setActiveRegion] = useState<Region | "all">("all");

  const { data: realData } = useSWR<GlobalIndex[]>(
    "/api/market/global",
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false, dedupingInterval: 900000 }
  );

  const displayIndices: IndexData[] = realData && realData.length > 0
    ? realData.map(realToIndexData)
    : [];

  const riskData = useMemo(() => {
    if (!realData) return null;
    const vixItem = realData.find(r => r.symbol === "^VIX");
    const tnxItem = realData.find(r => r.symbol === "^TNX");
    const dxyItem = realData.find(r => r.symbol === "DX-Y.NYB");
    const vix = vixItem?.price ?? 0;
    const fearGreed = vix < 15 ? 75 : vix <= 20 ? 60 : vix <= 25 ? 40 : vix <= 30 ? 25 : 15;
    return {
      vix,
      us10y: tnxItem?.price ?? 0,
      us10yChange: tnxItem?.change ?? 0,
      dxy: dxyItem?.price ?? 0,
      dxyChange: dxyItem?.change ?? 0,
      fearGreed,
    };
  }, [realData]);

  const filteredIndices =
    activeRegion === "all"
      ? displayIndices
      : displayIndices.filter((i) => i.region === activeRegion);

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1 animate-fade-in">
      <TopNav currentDate={getTodayString()} />
      <NavBar />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
        {/* ── Header ── */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-txt-0 tracking-tight">國際市場</h1>
          <p className="text-sm text-txt-3 mt-1">全球主要指數即時概覽</p>
        </div>

        {/* ── Regional Summary Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {REGION_INFO.map((r) => {
            const items = displayIndices.filter((i) => i.region === r.key);
            const upCount = items.filter((i) => i.changePct > 0).length;
            const ratio = items.length > 0 ? upCount / items.length : 0.5;
            const sentiment = ratio >= 0.6 ? { label: "偏多", color: "text-green bg-green-bg" }
              : ratio <= 0.4 ? { label: "偏空", color: "text-red bg-red-bg" }
              : { label: "中性", color: "text-amber bg-amber-bg" };
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
          {displayIndices.length === 0 && (
            <div className="text-center py-12 text-txt-3 text-sm">載入國際市場資料中...</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredIndices.map((idx) => (
              <IndexCard key={idx.id} idx={idx} />
            ))}
          </div>
        </section>

        {/* ── Global Risk Tone ── */}
        <section>
          <SectionTitle>全球風險情緒</SectionTitle>
          {riskData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* VIX Gauge */}
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">VIX 恐慌指數</div>
              <VixGauge value={riskData.vix} />
            </Card>

            {/* US 10Y */}
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">美國10年期公債殖利率</div>
              <div className="text-xl font-bold text-txt-0 tracking-tight tabular-nums">{riskData.us10y.toFixed(2)}%</div>
              <div className={`text-xs ${riskData.us10yChange >= 0 ? "text-red" : "text-green"} mt-1`}>
                {riskData.us10yChange >= 0 ? "+" : ""}{riskData.us10yChange.toFixed(2)} (較前日)
              </div>
            </Card>

            {/* DXY */}
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">美元指數 DXY</div>
              <div className="text-xl font-bold text-txt-0 tracking-tight tabular-nums">{riskData.dxy.toFixed(2)}</div>
              <div className={`text-xs ${riskData.dxyChange >= 0 ? "text-red" : "text-green"} mt-1`}>
                {riskData.dxyChange >= 0 ? "+" : ""}{riskData.dxyChange.toFixed(2)} (較前日)
              </div>
            </Card>

            {/* Fear & Greed */}
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">Fear & Greed Index</div>
              <FearGreedGauge value={riskData.fearGreed} />
            </Card>
          </div>
          ) : (
            <div className="text-center py-8 text-txt-3 text-sm">載入風險資料中...</div>
          )}
        </section>
      </main>
    </div>
  );
}
