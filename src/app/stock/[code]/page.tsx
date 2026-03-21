"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import { DailyData, Stock, StockGroup } from "@/lib/types";
import { formatPrice, formatPct, formatNumber, formatNet } from "@/lib/utils";

// ─── Seeded RNG helpers ────────────────────────────────────────────────────────

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

/** Generate trending-up price series for the SVG chart */
function generatePriceSeries(seed: string, basePrice: number, count = 30): number[] {
  const rng = makeRng(seed + "_chart");
  const prices: number[] = [basePrice * 0.85];
  for (let i = 1; i < count; i++) {
    const drift = basePrice * 0.005;           // slight upward drift
    const noise = (rng() - 0.42) * basePrice * 0.012;
    prices.push(Math.max(prices[i - 1] + drift + noise, basePrice * 0.5));
  }
  return prices;
}

/** Convert price series to SVG polyline points */
function pricesToPolyline(prices: number[], width: number, height: number): string {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  return prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = height - ((p - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Convert price series to SVG filled area path */
function pricesToAreaPath(prices: number[], width: number, height: number): string {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M ${pts[0]} L ${pts.join(" L ")} L ${width},${height} L 0,${height} Z`;
}

// ─── Mock data generators ──────────────────────────────────────────────────────

interface LimitUpEntry {
  date: string;
  group: string;
  nextDayPct: number;
}

function mockLimitUpHistory(code: string): LimitUpEntry[] {
  const rng = makeRng(code + "_history");
  const months = ["2026-03", "2026-02", "2026-01", "2025-12", "2025-11"];
  const groups = ["AI 伺服器", "半導體設備", "光通訊", "PCB 基板", "IC 設計"];
  return months.map((m, i) => ({
    date: `${m}-${String(Math.floor(rng() * 20 + 1)).padStart(2, "0")}`,
    group: groups[Math.floor(rng() * groups.length)],
    nextDayPct: (rng() - 0.45) * 8,
  }));
}

interface MetricItem {
  label: string;
  value: string;
  highlight?: boolean;
}

function buildMetrics(stock: Stock, rng: () => number): MetricItem[] {
  const open = stock.close * (0.9 + rng() * 0.05);
  const high = stock.close;
  const low = open * (0.93 + rng() * 0.04);
  return [
    { label: "開盤",   value: formatPrice(open) },
    { label: "最高",   value: formatPrice(high), highlight: true },
    { label: "最低",   value: formatPrice(low) },
    { label: "成交量", value: formatNumber(stock.volume) + " 張" },
    { label: "主力買超", value: formatNet(stock.major_net) + " 張", highlight: stock.major_net > 0 },
    { label: "連板天數", value: stock.streak > 0 ? `${stock.streak} 天` : "—" },
    { label: "本益比", value: (15 + rng() * 25).toFixed(1) },
    { label: "市值",   value: Math.round(stock.close * (800 + rng() * 5000)) + " 億" },
  ];
}

// ─── Chart component ───────────────────────────────────────────────────────────

function PriceChart({ code, basePrice, color }: { code: string; basePrice: number; color: string }) {
  const W = 800;
  const H = 200;
  const prices = generatePriceSeries(code, basePrice);
  const line = pricesToPolyline(prices, W, H);
  const area = pricesToAreaPath(prices, W, H);
  const gradId = `grad_${code}`;

  return (
    <div className="w-full border border-border rounded-lg overflow-hidden bg-bg-2 mb-6">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-[200px]"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <path d={area} fill={`url(#${gradId})`} />
        {/* Line */}
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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

  // Fallback mock stock if not found in API
  const displayStock: Stock = stock ?? {
    code,
    name: `股票 ${code}`,
    industry: "—",
    close: 100,
    change_pct: 10,
    volume: 10000,
    major_net: 1000,
    streak: 0,
  };

  const displayGroup = group ?? { name: "—", color: "#ef4444", badges: [], reason: "—", stocks: [] };
  const rng = makeRng(code);
  const metrics = buildMetrics(displayStock, rng);
  const limitUpHistory = mockLimitUpHistory(code);

  // Which groups this stock appeared in (mock: use allGroups or displayGroup)
  const appearedGroups: { name: string; color: string }[] = group
    ? [{ name: group.name, color: group.color }]
    : [];
  // Add a couple of mock historical groups
  const mockHistGroups = [
    { name: "AI 伺服器 / 散熱", color: "#ef4444" },
    { name: "半導體設備", color: "#22c55e" },
  ].filter((g) => g.name !== displayGroup.name);
  const allAppearedGroups = [...appearedGroups, ...mockHistGroups.slice(0, 2)];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate="2026-03-20" stocks={stock ? [stock] : []} />
      <main className="flex-1 overflow-y-auto p-5">
        <div className="max-w-4xl mx-auto">

          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-txt-4 hover:text-txt-1 transition-colors mb-4"
          >
            <span className="text-sm">←</span> 返回
          </Link>

          {loading ? (
            <div className="text-txt-4 text-sm text-center py-20">載入中...</div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-txt-4 tabular-nums">{displayStock.code}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-bg-3 border border-border rounded text-txt-3">
                      {displayStock.industry}
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold text-txt-0 tracking-tight">{displayStock.name}</h1>
                  {displayGroup.name !== "—" && (
                    <div className="text-xs text-txt-4 mt-1">{displayGroup.name}</div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-2xl font-bold text-red tabular-nums">
                    {formatPrice(displayStock.close)}
                  </div>
                  <div className="mt-1">
                    <span className="text-sm font-semibold text-red bg-red-bg px-2 py-0.5 rounded tabular-nums">
                      {formatPct(displayStock.change_pct)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price chart */}
              <PriceChart
                code={code}
                basePrice={displayStock.close}
                color={displayGroup.color}
              />

              {/* Metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {metrics.map(({ label, value, highlight }) => (
                  <div key={label} className="bg-bg-2 border border-border rounded-lg px-3 py-3">
                    <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-1">{label}</div>
                    <div className={`text-sm font-bold tabular-nums ${highlight ? "text-red" : "text-txt-1"}`}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Historical limit-up records */}
              <div className="mb-6">
                <div className="text-xs font-semibold text-txt-3 uppercase tracking-wider mb-3">歷史漲停紀錄</div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[1fr_1fr_1fr] gap-0 px-4 py-2 bg-bg-2 border-b border-border text-[10px] font-semibold text-txt-4 uppercase tracking-wider">
                    <div>日期</div>
                    <div>所屬族群</div>
                    <div>隔日表現</div>
                  </div>
                  {limitUpHistory.map((entry) => (
                    <div
                      key={entry.date}
                      className="grid grid-cols-[1fr_1fr_1fr] gap-0 px-4 py-3 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="text-xs tabular-nums text-txt-2">{entry.date}</div>
                      <div className="text-xs text-txt-2 truncate pr-2">{entry.group}</div>
                      <div className={`text-xs font-semibold tabular-nums ${entry.nextDayPct > 0 ? "text-red" : entry.nextDayPct < 0 ? "text-green" : "text-txt-3"}`}>
                        {entry.nextDayPct > 0 ? "+" : ""}{entry.nextDayPct.toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 所屬族群 */}
              <div>
                <div className="text-xs font-semibold text-txt-3 uppercase tracking-wider mb-3">所屬族群</div>
                <div className="flex flex-wrap gap-2">
                  {allAppearedGroups.map(({ name, color }) => (
                    <span
                      key={name}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold border"
                      style={{
                        backgroundColor: `${color}18`,
                        borderColor: `${color}40`,
                        color,
                      }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
