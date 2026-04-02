"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import useSWR from "swr";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPct, formatPrice } from "@/lib/utils";
import type { NextDayData } from "@/app/api/next-day/route";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

type StockLabel = "續漲停" | "強漲" | "強勢漲" | "銘碼漲" | "開高走低" | "直接跌" | "無資料";
type Market = "上" | "櫃";

interface NextDayStock {
  code: string;
  name: string;
  group: string;
  groupColor: string;
  market: Market;
  limitPrice: number;    // 漲停價
  volumeRatio: number;   // 量比
  nextOpen: number;      // 隔日開盤價
  nextOpenPct: number;   // 隔日開盤報酬%
  nextAvg: number;       // 隔日均價
  nextAvgPct: number;    // 隔日均價報酬%
  nextClose: number;     // 隔日收盤價
  nextClosePct: number;  // 隔日收盤報酬%
  weightedReturn: number; // 加權報酬%
  label: StockLabel;
}

interface DayData {
  limitDate: string;
  nextDate: string;
  totalLimitUp: number;
  stocks: NextDayStock[];
}

interface GroupPerf {
  name: string;
  color: string;
  count: number;
  positiveCount: number;
  positiveRate: number;
  openAvg: number;
  avgAvg: number;
  closeAvg: number;
  streak: number; // 連續天數
}

/* ═══════════════════════════════════════════════════════════════
   Label Config
   ═══════════════════════════════════════════════════════════════ */

const LABEL_CONFIG: Record<StockLabel, { bg: string; text: string; border: string }> = {
  "續漲停": { bg: "bg-red/20", text: "text-red", border: "border-red/30" },
  "強漲":   { bg: "bg-[rgba(249,115,22,0.15)]", text: "text-[#f97316]", border: "border-[#f97316]/30" },
  "強勢漲": { bg: "bg-green/15", text: "text-green", border: "border-green/30" },
  "銘碼漲": { bg: "bg-amber/15", text: "text-amber", border: "border-amber/30" },
  "開高走低": { bg: "bg-[rgba(234,179,8,0.12)]", text: "text-[#eab308]", border: "border-[#eab308]/25" },
  "直接跌": { bg: "bg-blue/12", text: "text-blue", border: "border-blue/25" },
  "無資料": { bg: "bg-bg-3", text: "text-txt-4", border: "border-border" },
};

const GROUP_COLORS: Record<string, string> = {
  "AI伺服器／散熱": "#06b6d4",
  "半導體設備／檢測": "#a855f7",
  "IC設計": "#6366f1",
  "生技新藥": "#10b981",
  "塑化": "#3b82f6",
  "鋼鐵": "#64748b",
  "PCB／CCL銅箔基板": "#f97316",
  "光通訊": "#14b8a6",
  "電子代工": "#ec4899",
  "營建資產": "#ef4444",
  "低價投機／籌碼面": "#f59e0b",
  "電子零組件": "#8b5cf6",
  "綠能／鈣鈦礦太陽能": "#84cc16",
};

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function pctPositive(arr: number[]): number {
  if (!arr.length) return 0;
  return (arr.filter((v) => v > 0).length / arr.length) * 100;
}

function computeDayStats(day: DayData) {
  const s = day.stocks;
  const openAvg = avg(s.map((x) => x.nextOpenPct));
  const avgAvg = avg(s.map((x) => x.nextAvgPct));
  const closeAvg = avg(s.map((x) => x.nextClosePct));
  const openPositive = pctPositive(s.map((x) => x.nextOpenPct));
  const avgPositive = pctPositive(s.map((x) => x.nextAvgPct));
  const closePositive = pctPositive(s.map((x) => x.nextClosePct));
  const continuedCount = s.filter((x) => x.label === "續漲停").length;
  return { openAvg, avgAvg, closeAvg, openPositive, avgPositive, closePositive, continuedCount, totalCount: s.length };
}

function computeGroupPerfs(day: DayData): GroupPerf[] {
  const groupMap = new Map<string, NextDayStock[]>();
  for (const s of day.stocks) {
    if (!groupMap.has(s.group)) groupMap.set(s.group, []);
    groupMap.get(s.group)!.push(s);
  }
  return Array.from(groupMap.entries())
    .map(([name, stocks]) => {
      const closeArr = stocks.map((s) => s.nextClosePct);
      const positiveCount = closeArr.filter((v) => v > 0).length;
      return {
        name,
        color: stocks[0]?.groupColor || "#64748b",
        count: stocks.length,
        positiveCount,
        positiveRate: (positiveCount / stocks.length) * 100,
        openAvg: avg(stocks.map((s) => s.nextOpenPct)),
        avgAvg: avg(stocks.map((s) => s.nextAvgPct)),
        closeAvg: avg(closeArr),
        streak: 0,
      };
    })
    .sort((a, b) => b.positiveRate - a.positiveRate || b.closeAvg - a.closeAvg);
}

const ALL_LABELS: StockLabel[] = ["續漲停", "強漲", "強勢漲", "銘碼漲", "開高走低", "直接跌"];

/* ═══════════════════════════════════════════════════════════════
   SVG Line Chart
   ═══════════════════════════════════════════════════════════════ */

interface ChartLine { values: number[]; color: string; label: string }

function LineChart({ lines, labels, title, height = 200 }: {
  lines: ChartLine[]; labels: string[]; title: string; height?: number;
}) {
  const W = 900, H = height;
  const PAD = { top: 40, right: 90, bottom: 35, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const allVals = lines.flatMap((l) => l.values);
  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals);
  const range = dataMax - dataMin || 1;
  const yMin = dataMin - range * 0.15;
  const yMax = dataMax + range * 0.15;
  const xStep = labels.length > 1 ? chartW / (labels.length - 1) : chartW;
  const toX = (i: number) => PAD.left + i * xStep;
  const toY = (v: number) => PAD.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount }, (_, i) => yMin + ((yMax - yMin) * i) / (tickCount - 1));

  return (
    <div className="bg-bg-2 border border-border rounded-lg p-4 overflow-hidden">
      <h3 className="text-sm font-semibold text-txt-1 mb-3 tracking-tight">{title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={toY(v)} y2={toY(v)}
              stroke="var(--border)" strokeDasharray={v === 0 ? "none" : "4,3"} strokeWidth={v === 0 ? 1.5 : 0.8} />
            <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fill="var(--text-4)" fontSize="11" fontFamily="Inter, system-ui">
              {v.toFixed(v === 0 ? 0 : 1)}%
            </text>
          </g>
        ))}
        {yMin <= 0 && yMax >= 0 && (
          <line x1={PAD.left} x2={W - PAD.right} y1={toY(0)} y2={toY(0)}
            stroke="var(--border-hover)" strokeWidth={1} strokeDasharray="6,4" />
        )}
        {labels.map((label, i) => (
          <text key={i} x={toX(i)} y={H - 8} textAnchor="middle" fill="var(--text-4)" fontSize="11" fontFamily="Inter, system-ui">
            {label}
          </text>
        ))}
        {lines.map((line, li) => {
          const pts = line.values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
          const area = [
            `${toX(0)},${toY(line.values[0])}`,
            ...line.values.map((v, i) => `${toX(i)},${toY(v)}`),
            `${toX(line.values.length - 1)},${toY(yMin)}`,
            `${toX(0)},${toY(yMin)}`,
          ].join(" ");
          const gId = `g${li}${title.replace(/[^a-z]/gi, "")}`;
          return (
            <g key={li}>
              <defs>
                <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={line.color} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={line.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={area} fill={`url(#${gId})`} />
              <polyline points={pts} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {line.values.map((v, i) => (
                <circle key={i} cx={toX(i)} cy={toY(v)} r="4" fill={line.color} stroke="var(--bg-2)" strokeWidth="2" />
              ))}
              <text x={W - PAD.right + 8} y={toY(line.values[line.values.length - 1]) + 4}
                fill={line.color} fontSize="11" fontWeight="600" fontFamily="Inter, system-ui">
                ○ {line.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   KPI Card
   ═══════════════════════════════════════════════════════════════ */

function KpiCard({ label, value, subLabel, subValue, accent }: {
  label: string; value: string; subLabel: string; subValue: string; accent: string;
}) {
  return (
    <div className="relative overflow-hidden bg-bg-2 border border-border rounded-lg px-5 py-4 hover:border-border-hover transition-all">
      <div className="absolute top-0 left-0 right-0 h-[2px] opacity-40" style={{ backgroundColor: accent }} />
      <div className="text-[11px] text-txt-3 font-medium tracking-wide mb-2">{label}</div>
      <div className="text-2xl font-bold tabular-nums tracking-tight leading-none mb-1.5" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[10px] text-txt-4">
        {subLabel} <span style={{ color: accent }}>{subValue}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Label Badge
   ═══════════════════════════════════════════════════════════════ */

function LabelBadge({ label }: { label: StockLabel }) {
  const c = LABEL_CONFIG[label] ?? LABEL_CONFIG["無資料"];
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded ${c.bg} ${c.text} border ${c.border}`}>
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Market Badge
   ═══════════════════════════════════════════════════════════════ */

function MarketBadge({ market }: { market: Market }) {
  return market === "上" ? (
    <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded bg-green/15 text-green border border-green/20">
      上
    </span>
  ) : (
    <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded bg-blue/15 text-blue border border-blue/20">
      櫃
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Price + Pct Cell
   ═══════════════════════════════════════════════════════════════ */

function PriceCell({ price, pct }: { price: number; pct: number }) {
  const color = pct > 0 ? "text-green" : pct < 0 ? "text-red" : "text-txt-3";
  return (
    <div className="flex items-baseline justify-end gap-1.5">
      <span className="text-txt-2 tabular-nums">{formatPrice(price)}</span>
      <span className={`text-[10px] font-semibold tabular-nums ${color}`}>{formatPct(pct)}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Volume Ratio
   ═══════════════════════════════════════════════════════════════ */

function VolumeRatio({ ratio }: { ratio: number }) {
  const color = ratio >= 3 ? "text-red font-bold" : ratio >= 2 ? "text-amber font-semibold" : "text-txt-3";
  return <span className={`tabular-nums text-[11px] ${color}`}>{ratio.toFixed(1)}x</span>;
}

/* ═══════════════════════════════════════════════════════════════
   Streak Badge
   ═══════════════════════════════════════════════════════════════ */

function StreakBadge({ days }: { days: number }) {
  if (!days) return <span className="text-txt-4 text-[11px]">—</span>;
  const color = days >= 3 ? "bg-red/20 text-red border-red/30" : "bg-amber/15 text-amber border-amber/25";
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border ${color}`}>
      {days}天
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════ */

function mapRealToDay(r: NextDayData): DayData {
  const stocks: NextDayStock[] = r.stocks.map((s) => {
    const op = s.nextOpenPct ?? 0;
    const cl = s.nextClosePct ?? 0;
    const avg = (op + cl) / 2;
    return {
      code: s.code,
      name: s.name,
      group: s.group,
      groupColor: s.groupColor,
      market: "上" as Market,
      limitPrice: s.limitPrice,
      volumeRatio: s.volumeRatio,
      nextOpen: s.nextOpen ?? s.limitPrice,
      nextOpenPct: op,
      nextAvg: s.nextOpen != null && s.nextClose != null ? (s.nextOpen + s.nextClose) / 2 : s.limitPrice,
      nextAvgPct: avg,
      nextClose: s.nextClose ?? s.limitPrice,
      nextClosePct: cl,
      weightedReturn: +(op * 0.3 + avg * 0.3 + cl * 0.4).toFixed(2),
      label: s.label as StockLabel,
    };
  });
  return {
    limitDate: r.limitDate,
    nextDate: r.nextDate,
    totalLimitUp: r.totalLimitUp,
    stocks,
  };
}

export default function NextDayPage() {
  const { data: realData, isLoading } = useSWR<NextDayData[]>(
    "/api/next-day",
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  const DATA: DayData[] = useMemo(() => {
    if (realData && realData.length > 0) {
      return realData.map(mapRealToDay);
    }
    return [];
  }, [realData]);

  const [dateIndex, setDateIndex] = useState(0);
  const currentIndex = Math.min(dateIndex, Math.max(0, DATA.length - 1));
  const realDateIndex = Math.max(0, DATA.length - 1 - currentIndex); // show latest first

  const [activeFilter, setActiveFilter] = useState<StockLabel | "all">("all");
  const [sortKey, setSortKey] = useState("weightedReturn");
  const [sortAsc, setSortAsc] = useState(false);

  const day = DATA.length > 0 ? (DATA[realDateIndex] ?? DATA[DATA.length - 1]) : null;
  const stats = day ? computeDayStats(day) : null;
  const groupPerfs = useMemo(() => day ? computeGroupPerfs(day) : [], [day]);

  // Filter counts
  const filterCounts = useMemo(() => {
    if (!day) return { all: 0 } as Record<string, number>;
    const counts: Record<string, number> = { all: day.stocks.length };
    ALL_LABELS.forEach((l) => { counts[l] = day.stocks.filter((s) => s.label === l).length; });
    return counts;
  }, [day]);

  // Filtered + sorted stocks
  const displayStocks = useMemo(() => {
    if (!day) return [];
    let list = activeFilter === "all" ? [...day.stocks] : day.stocks.filter((s) => s.label === activeFilter);
    list.sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "nextOpenPct": va = a.nextOpenPct; vb = b.nextOpenPct; break;
        case "nextAvgPct": va = a.nextAvgPct; vb = b.nextAvgPct; break;
        case "nextClosePct": va = a.nextClosePct; vb = b.nextClosePct; break;
        case "weightedReturn": va = a.weightedReturn; vb = b.weightedReturn; break;
        case "volumeRatio": va = a.volumeRatio; vb = b.volumeRatio; break;
        case "code": va = a.code; vb = b.code; break;
        default: va = a.weightedReturn; vb = b.weightedReturn;
      }
      if (typeof va === "number" && typeof vb === "number") return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return list;
  }, [day, activeFilter, sortKey, sortAsc]);

  function handleSort(key: string) {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  // History chart data
  const histLabels = DATA.map((d) => d.nextDate.slice(5).replace("-", "/"));
  const histAvg: ChartLine[] = [
    { values: DATA.map((d) => computeDayStats(d).openAvg), color: "#3b82f6", label: "開盤" },
    { values: DATA.map((d) => computeDayStats(d).avgAvg), color: "#f59e0b", label: "均價" },
    { values: DATA.map((d) => computeDayStats(d).closeAvg), color: "#ef4444", label: "收盤" },
  ];
  const histRate: ChartLine[] = [
    { values: DATA.map((d) => computeDayStats(d).openPositive), color: "#3b82f6", label: "開盤" },
    { values: DATA.map((d) => computeDayStats(d).avgPositive), color: "#f59e0b", label: "均價" },
    { values: DATA.map((d) => computeDayStats(d).closePositive), color: "#ef4444", label: "收盤" },
  ];

  const SortIcon = ({ k }: { k: string }) =>
    sortKey === k ? <span className="ml-0.5 text-accent">{sortAsc ? "▲" : "▼"}</span> : null;

  /* Loading / empty state */
  if (isLoading || !realData) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <TopNav currentDate="" />
        <NavBar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-txt-3 text-sm animate-pulse">載入隔日表現資料中...</p>
        </main>
      </div>
    );
  }

  if (!day || !stats) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <TopNav currentDate="" />
        <NavBar />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-txt-4 text-sm">尚無隔日表現資料</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate={day.nextDate} />
      <NavBar />

      <main className="flex-1 overflow-y-auto animate-fade-in">
        {/* ─── Hero Header ─── */}
        <div className="relative border-b border-border">
          <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.03] to-transparent pointer-events-none" />
          <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5 text-center">
            <h1 className="text-lg font-bold text-txt-0 tracking-tight flex items-center justify-center gap-2">
              <span className="text-xl">📊</span> 漲停隔日表現
            </h1>
            <p className="text-[11px] text-txt-4 mt-1">
              漲停日 {day.limitDate.replace(/-/g, "/")} → 隔日 {day.nextDate.replace(/-/g, "/")}
            </p>
            <div className="flex items-center justify-center gap-3 mt-3">
              <button onClick={() => setDateIndex((i) => Math.max(0, i - 1))} disabled={dateIndex === 0}
                className="w-8 h-8 rounded-lg bg-bg-3 border border-border flex items-center justify-center text-txt-3 hover:text-txt-0 hover:bg-bg-4 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                ◀
              </button>
              <div className="px-5 py-1.5 bg-bg-3 border border-border rounded-lg">
                <span className="text-base font-bold text-accent tabular-nums tracking-wider">
                  {day.nextDate.replace(/-/g, "/")}
                </span>
              </div>
              <button onClick={() => setDateIndex((i) => Math.min(DATA.length - 1, i + 1))} disabled={dateIndex === DATA.length - 1}
                className="w-8 h-8 rounded-lg bg-bg-3 border border-border flex items-center justify-center text-txt-3 hover:text-txt-0 hover:bg-bg-4 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                ▶
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5 space-y-5">
          {/* ─── KPI Cards ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="開盤均報酬" value={formatPct(stats.openAvg)}
              subLabel="正報酬率" subValue={`${stats.openPositive.toFixed(1)}%`}
              accent="#22c55e" />
            <KpiCard label="均價均報酬" value={formatPct(stats.avgAvg)}
              subLabel="正報酬率" subValue={`${stats.avgPositive.toFixed(1)}%`}
              accent="#3b82f6" />
            <KpiCard label="收盤均報酬" value={formatPct(stats.closeAvg)}
              subLabel="正報酬率" subValue={`${stats.closePositive.toFixed(1)}%`}
              accent="#f59e0b" />
            <KpiCard label="續漲停" value={`${stats.continuedCount} 檔`}
              subLabel="" subValue={`${day.totalLimitUp} 檔漲停`}
              accent="#ef4444" />
          </div>

          {/* ─── 歷史趨勢 ─── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">📈</span>
              <h2 className="text-sm font-semibold text-txt-0">歷史趨勢</h2>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LineChart lines={histAvg} labels={histLabels} title="均報酬 %" />
              <LineChart lines={histRate} labels={histLabels} title="正報酬率 %" />
            </div>
          </div>

          {/* ─── 族群正報酬率 ─── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">🏷️</span>
              <h2 className="text-sm font-semibold text-txt-0">族群正報酬率</h2>
            </div>
            <div className="bg-bg-2 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-border bg-bg-3/50">
                    <th className="text-left px-4 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">族群</th>
                    <th className="text-center px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">連續</th>
                    <th className="text-center px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">
                      正報酬率 <span className="text-txt-4 cursor-help" title="收盤正報酬的比例">ⓘ</span>
                    </th>
                    <th className="text-right px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">開盤</th>
                    <th className="text-right px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">均價</th>
                    <th className="text-right px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">收盤</th>
                  </tr>
                </thead>
                <tbody>
                  {groupPerfs.map((g) => (
                    <tr key={g.name} className="border-b border-border/50 last:border-0 hover:bg-bg-3/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
                          <span className="font-medium text-txt-1 text-[12px]">{g.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <StreakBadge days={g.streak} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-bold tabular-nums ${g.positiveRate >= 80 ? "text-green" : g.positiveRate >= 50 ? "text-amber" : "text-red"}`}>
                              {g.positiveRate.toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-txt-4">{g.positiveCount}/{g.count}</span>
                          </div>
                          <div className="h-[3px] w-16 bg-bg-4 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${g.positiveRate >= 80 ? "bg-green" : g.positiveRate >= 50 ? "bg-amber" : "bg-red"}`}
                              style={{ width: `${g.positiveRate}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${g.openAvg > 0 ? "text-green" : "text-red"}`}>
                        {formatPct(g.openAvg)}
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${g.avgAvg > 0 ? "text-green" : "text-red"}`}>
                        {formatPct(g.avgAvg)}
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${g.closeAvg > 0 ? "text-green" : "text-red"}`}>
                        {formatPct(g.closeAvg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── 個股明細 ─── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">📋</span>
              <h2 className="text-sm font-semibold text-txt-0">個股明細（{day.stocks.length} 檔）</h2>
            </div>
            <p className="text-[10px] text-txt-4 mb-3">
              標籤根據隔日買賣開盤與收盤價格分類，僅描述已發生之走勢。
            </p>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setActiveFilter("all")}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium border transition-all ${
                  activeFilter === "all"
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "bg-bg-3 text-txt-3 border-border hover:text-txt-1 hover:border-border-hover"
                }`}>
                全部 {filterCounts.all}
              </button>
              {ALL_LABELS.map((label) => {
                const cnt = filterCounts[label] || 0;
                if (cnt === 0) return null;
                const lc = LABEL_CONFIG[label];
                const isActive = activeFilter === label;
                return (
                  <button key={label} onClick={() => setActiveFilter(isActive ? "all" : label)}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-medium border transition-all ${
                      isActive
                        ? `${lc.bg} ${lc.text} ${lc.border}`
                        : "bg-bg-3 text-txt-3 border-border hover:text-txt-1 hover:border-border-hover"
                    }`}>
                    {label} {cnt}
                  </button>
                );
              })}
            </div>

            {/* Stock Table */}
            <div className="bg-bg-2 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs min-w-[1100px]">
                <thead>
                  <tr className="border-b border-border bg-bg-3/50">
                    <th className="text-center px-2 py-2.5 text-[10px] font-medium text-txt-4 w-10">所</th>
                    <th onClick={() => handleSort("code")}
                      className="text-left px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2 w-16">
                      代號<SortIcon k="code" />
                    </th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">名稱</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">漲停價</th>
                    <th onClick={() => handleSort("volumeRatio")}
                      className="text-center px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2">
                      量比<SortIcon k="volumeRatio" />
                    </th>
                    <th onClick={() => handleSort("nextOpenPct")}
                      className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2">
                      隔日開<SortIcon k="nextOpenPct" />
                    </th>
                    <th onClick={() => handleSort("nextAvgPct")}
                      className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2">
                      隔日均價<SortIcon k="nextAvgPct" />
                    </th>
                    <th onClick={() => handleSort("nextClosePct")}
                      className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2">
                      隔日收<SortIcon k="nextClosePct" />
                    </th>
                    <th onClick={() => handleSort("weightedReturn")}
                      className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2">
                      加權<SortIcon k="weightedReturn" />
                    </th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">標籤</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">族群</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStocks.map((s) => (
                    <tr key={s.code} className="border-b border-border/50 last:border-0 hover:bg-bg-3/30 transition-colors row-hover">
                      <td className="px-2 py-2.5 text-center"><MarketBadge market={s.market} /></td>
                      <td className="px-3 py-2.5 font-mono text-txt-3 text-[11px]">
                        <Link href={`/stock/${s.code}`} className="hover:text-txt-0 hover:underline underline-offset-2 transition-colors">
                          {s.code}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-txt-1">
                        <Link href={`/stock/${s.code}`} className="hover:text-txt-0 transition-colors">{s.name}</Link>
                      </td>
                      <td className="px-3 py-2.5 text-right text-txt-2 tabular-nums">{formatPrice(s.limitPrice)}</td>
                      <td className="px-3 py-2.5 text-center"><VolumeRatio ratio={s.volumeRatio} /></td>
                      <td className="px-3 py-2.5 text-right"><PriceCell price={s.nextOpen} pct={s.nextOpenPct} /></td>
                      <td className="px-3 py-2.5 text-right"><PriceCell price={s.nextAvg} pct={s.nextAvgPct} /></td>
                      <td className="px-3 py-2.5 text-right"><PriceCell price={s.nextClose} pct={s.nextClosePct} /></td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${s.weightedReturn > 0 ? "text-green" : s.weightedReturn < 0 ? "text-red" : "text-txt-3"}`}>
                        {formatPct(s.weightedReturn)}
                      </td>
                      <td className="px-3 py-2.5 text-center"><LabelBadge label={s.label} /></td>
                      <td className="px-3 py-2.5 text-left">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: s.groupColor }} />
                          <span className="text-[11px] text-txt-3 truncate max-w-[140px]">{s.group}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-4 text-[10px] text-txt-4 border-t border-border/50 space-y-1">
            <p>資料來源：臺灣證券交易所／證券櫃檯買賣中心</p>
            <p className="text-amber/80">本站資訊僅供參考，不構成任何投資建議。投資人應獨立判斷，審慎評估並自負盈虧。</p>
          </div>
        </div>
      </main>
    </div>
  );
}
