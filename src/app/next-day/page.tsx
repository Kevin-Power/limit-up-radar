"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import TopNav from "@/components/TopNav";
import { formatPct } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface NextDayStock {
  code: string;
  name: string;
  group: string;
  openPct: number;   // 開盤報酬%
  avgPct: number;    // 均價報酬%
  closePct: number;  // 收盤報酬%
  continued: boolean; // 是否續漲停
}

interface DayData {
  limitDate: string;
  nextDate: string;
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
  streak: string;
}

/* ═══════════════════════════════════════════════════════════════
   Mock Data — 10 trading days of next-day performance
   ═══════════════════════════════════════════════════════════════ */

const MOCK_DATA: DayData[] = [
  {
    limitDate: "2026-03-06",
    nextDate: "2026-03-07",
    stocks: [
      { code: "3324", name: "雙鴻", group: "AI 伺服器／散熱", openPct: -2.1, avgPct: -3.2, closePct: -4.5, continued: false },
      { code: "3017", name: "奇鋐", group: "AI 伺服器／散熱", openPct: -1.5, avgPct: -2.0, closePct: -3.8, continued: false },
      { code: "2002", name: "中鋼", group: "鋼鐵／原物料", openPct: 0.5, avgPct: 0.3, closePct: -0.2, continued: false },
      { code: "6770", name: "力積電", group: "半導體", openPct: 1.2, avgPct: 0.8, closePct: 0.5, continued: false },
    ],
  },
  {
    limitDate: "2026-03-07",
    nextDate: "2026-03-10",
    stocks: [
      { code: "3661", name: "世芯-KY", group: "IC設計／AI", openPct: 5.2, avgPct: 4.8, closePct: 3.1, continued: false },
      { code: "2330", name: "台積電", group: "半導體", openPct: 3.8, avgPct: 3.5, closePct: 2.8, continued: false },
      { code: "3324", name: "雙鴻", group: "AI 伺服器／散熱", openPct: 6.5, avgPct: 5.2, closePct: 4.0, continued: false },
      { code: "2014", name: "中鴻", group: "鋼鐵／原物料", openPct: 2.1, avgPct: 1.8, closePct: 0.9, continued: false },
      { code: "3443", name: "創意", group: "IC設計／AI", openPct: 4.2, avgPct: 3.6, closePct: 2.5, continued: false },
      { code: "6547", name: "高端疫苗", group: "生技", openPct: -1.2, avgPct: -2.0, closePct: -3.5, continued: false },
    ],
  },
  {
    limitDate: "2026-03-10",
    nextDate: "2026-03-11",
    stocks: [
      { code: "3661", name: "世芯-KY", group: "IC設計／AI", openPct: 7.2, avgPct: 6.5, closePct: 5.8, continued: true },
      { code: "3324", name: "雙鴻", group: "AI 伺服器／散熱", openPct: 5.8, avgPct: 4.9, closePct: 4.2, continued: false },
      { code: "2330", name: "台積電", group: "半導體", openPct: 4.5, avgPct: 3.8, closePct: 3.2, continued: false },
      { code: "2454", name: "聯發科", group: "IC設計／AI", openPct: 6.1, avgPct: 5.5, closePct: 4.8, continued: false },
      { code: "3443", name: "創意", group: "IC設計／AI", openPct: 5.5, avgPct: 4.2, closePct: 3.6, continued: false },
      { code: "6770", name: "力積電", group: "半導體", openPct: 3.2, avgPct: 2.8, closePct: 1.9, continued: false },
      { code: "2002", name: "中鋼", group: "鋼鐵／原物料", openPct: 1.8, avgPct: 1.2, closePct: 0.5, continued: false },
    ],
  },
  {
    limitDate: "2026-03-11",
    nextDate: "2026-03-12",
    stocks: [
      { code: "3661", name: "世芯-KY", group: "IC設計／AI", openPct: 3.5, avgPct: 2.8, closePct: 1.5, continued: false },
      { code: "2454", name: "聯發科", group: "IC設計／AI", openPct: 2.8, avgPct: 2.1, closePct: 1.2, continued: false },
      { code: "3324", name: "雙鴻", group: "AI 伺服器／散熱", openPct: 1.5, avgPct: 0.8, closePct: -0.2, continued: false },
      { code: "2303", name: "聯電", group: "半導體", openPct: 2.2, avgPct: 1.5, closePct: 0.8, continued: false },
      { code: "1301", name: "台塑", group: "塑化／油價", openPct: 3.8, avgPct: 2.5, closePct: 1.8, continued: false },
      { code: "1303", name: "南亞", group: "塑化／油價", openPct: 2.5, avgPct: 1.8, closePct: 0.5, continued: false },
    ],
  },
  {
    limitDate: "2026-03-12",
    nextDate: "2026-03-13",
    stocks: [
      { code: "2454", name: "聯發科", group: "IC設計／AI", openPct: 1.8, avgPct: 1.2, closePct: 0.5, continued: false },
      { code: "3443", name: "創意", group: "IC設計／AI", openPct: 2.5, avgPct: 1.8, closePct: -0.5, continued: false },
      { code: "2303", name: "聯電", group: "半導體", openPct: 1.2, avgPct: 0.5, closePct: -0.8, continued: false },
      { code: "6547", name: "高端疫苗", group: "生技", openPct: 4.5, avgPct: 3.8, closePct: 2.2, continued: false },
      { code: "1301", name: "台塑", group: "塑化／油價", openPct: 1.5, avgPct: 0.8, closePct: -0.5, continued: false },
    ],
  },
  {
    limitDate: "2026-03-13",
    nextDate: "2026-03-14",
    stocks: [
      { code: "3661", name: "世芯-KY", group: "IC設計／AI", openPct: 4.8, avgPct: 4.2, closePct: 3.5, continued: false },
      { code: "3324", name: "雙鴻", group: "AI 伺服器／散熱", openPct: 3.5, avgPct: 2.8, closePct: 1.2, continued: false },
      { code: "6770", name: "力積電", group: "半導體", openPct: 2.8, avgPct: 2.2, closePct: 1.5, continued: false },
      { code: "2002", name: "中鋼", group: "鋼鐵／原物料", openPct: 1.2, avgPct: 0.5, closePct: -0.8, continued: false },
      { code: "6547", name: "高端疫苗", group: "生技", openPct: 3.2, avgPct: 2.5, closePct: 1.8, continued: false },
      { code: "1301", name: "台塑", group: "塑化／油價", openPct: 5.5, avgPct: 4.8, closePct: 3.2, continued: false },
      { code: "1303", name: "南亞", group: "塑化／油價", openPct: 4.2, avgPct: 3.5, closePct: 2.8, continued: false },
    ],
  },
  {
    limitDate: "2026-03-16",
    nextDate: "2026-03-17",
    stocks: [
      { code: "3661", name: "世芯-KY", group: "IC設計／AI", openPct: 5.5, avgPct: 4.8, closePct: 3.8, continued: true },
      { code: "2454", name: "聯發科", group: "IC設計／AI", openPct: 4.2, avgPct: 3.5, closePct: 2.8, continued: false },
      { code: "3324", name: "雙鴻", group: "AI 伺服器／散熱", openPct: 3.8, avgPct: 3.2, closePct: 2.5, continued: false },
      { code: "2330", name: "台積電", group: "半導體", openPct: 2.5, avgPct: 2.0, closePct: 1.2, continued: false },
      { code: "3131", name: "弘塑", group: "半導體設備", openPct: 6.8, avgPct: 5.5, closePct: 4.2, continued: true },
      { code: "3413", name: "京鼎", group: "半導體設備", openPct: 4.5, avgPct: 3.8, closePct: 2.5, continued: false },
    ],
  },
  {
    limitDate: "2026-03-17",
    nextDate: "2026-03-18",
    stocks: [
      { code: "3661", name: "世芯-KY", group: "IC設計／AI", openPct: 4.2, avgPct: 3.5, closePct: 2.8, continued: false },
      { code: "2454", name: "聯發科", group: "IC設計／AI", openPct: 3.5, avgPct: 2.8, closePct: 2.2, continued: false },
      { code: "3443", name: "創意", group: "IC設計／AI", openPct: 3.8, avgPct: 3.2, closePct: 2.5, continued: false },
      { code: "3324", name: "雙鴻", group: "AI 伺服器／散熱", openPct: 2.8, avgPct: 2.2, closePct: 1.5, continued: false },
      { code: "6770", name: "力積電", group: "半導體", openPct: 3.2, avgPct: 2.5, closePct: 1.8, continued: false },
      { code: "3131", name: "弘塑", group: "半導體設備", openPct: 5.2, avgPct: 4.5, closePct: 3.8, continued: true },
      { code: "1301", name: "台塑", group: "塑化／油價", openPct: 2.5, avgPct: 1.8, closePct: 0.8, continued: false },
      { code: "1303", name: "南亞", group: "塑化／油價", openPct: 1.8, avgPct: 1.2, closePct: 0.5, continued: false },
    ],
  },
  {
    limitDate: "2026-03-18",
    nextDate: "2026-03-19",
    stocks: [
      { code: "3661", name: "世芯-KY", group: "IC設計／AI", openPct: 3.8, avgPct: 3.2, closePct: 2.5, continued: false },
      { code: "2454", name: "聯發科", group: "IC設計／AI", openPct: 2.5, avgPct: 2.0, closePct: 1.5, continued: false },
      { code: "3324", name: "雙鴻", group: "AI 伺服器／散熱", openPct: 4.2, avgPct: 3.5, closePct: 2.8, continued: false },
      { code: "8210", name: "勤誠", group: "AI 伺服器／散熱", openPct: 3.5, avgPct: 2.8, closePct: 2.2, continued: false },
      { code: "2330", name: "台積電", group: "半導體", openPct: 2.8, avgPct: 2.2, closePct: 1.5, continued: false },
      { code: "6547", name: "高端疫苗", group: "生技", openPct: 1.8, avgPct: 1.2, closePct: -0.5, continued: false },
      { code: "1301", name: "台塑", group: "塑化／油價", openPct: 4.5, avgPct: 3.8, closePct: 2.5, continued: false },
    ],
  },
  {
    limitDate: "2026-03-19",
    nextDate: "2026-03-20",
    stocks: [
      { code: "3661", name: "世芯-KY", group: "IC設計／AI", openPct: 6.4, avgPct: 4.5, closePct: 2.8, continued: false },
      { code: "2454", name: "聯發科", group: "IC設計／AI", openPct: 4.9, avgPct: 3.2, closePct: 1.5, continued: false },
      { code: "3443", name: "創意", group: "IC設計／AI", openPct: 5.2, avgPct: 3.8, closePct: 2.2, continued: false },
      { code: "3324", name: "雙鴻", group: "AI 伺服器／散熱", openPct: 5.8, avgPct: 4.2, closePct: 3.5, continued: true },
      { code: "8210", name: "勤誠", group: "AI 伺服器／散熱", openPct: 4.5, avgPct: 3.5, closePct: 2.8, continued: false },
      { code: "2330", name: "台積電", group: "半導體", openPct: 3.2, avgPct: 2.5, closePct: 1.8, continued: false },
      { code: "6770", name: "力積電", group: "半導體", openPct: 4.8, avgPct: 3.5, closePct: 2.2, continued: false },
      { code: "3131", name: "弘塑", group: "半導體設備", openPct: 7.6, avgPct: 5.8, closePct: 4.5, continued: true },
      { code: "3413", name: "京鼎", group: "半導體設備", openPct: 5.5, avgPct: 4.2, closePct: 3.2, continued: false },
      { code: "1301", name: "台塑", group: "塑化／油價", openPct: 6.8, avgPct: 7.1, closePct: 5.1, continued: true },
      { code: "1303", name: "南亞", group: "塑化／油價", openPct: 3.4, avgPct: 2.1, closePct: -2.1, continued: false },
      { code: "1326", name: "台化", group: "塑化／油價", openPct: 7.6, avgPct: 3.7, closePct: 0.3, continued: false },
      { code: "4919", name: "新唐", group: "IC設計／AI", openPct: 6.4, avgPct: 4.5, closePct: 2.8, continued: false },
      { code: "6547", name: "高端疫苗", group: "生技", openPct: 3.2, avgPct: 1.5, closePct: -1.8, continued: false },
      { code: "6669", name: "緯穎", group: "AI 伺服器／散熱", openPct: 4.9, avgPct: 3.1, closePct: -1.7, continued: false },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════
   Helper Functions
   ═══════════════════════════════════════════════════════════════ */

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function pctPositive(arr: number[]): number {
  if (!arr.length) return 0;
  return (arr.filter((v) => v > 0).length / arr.length) * 100;
}

function computeDayStats(day: DayData) {
  const openAvg = avg(day.stocks.map((s) => s.openPct));
  const avgAvg = avg(day.stocks.map((s) => s.avgPct));
  const closeAvg = avg(day.stocks.map((s) => s.closePct));
  const openPositive = pctPositive(day.stocks.map((s) => s.openPct));
  const avgPositive = pctPositive(day.stocks.map((s) => s.avgPct));
  const closePositive = pctPositive(day.stocks.map((s) => s.closePct));
  const continuedCount = day.stocks.filter((s) => s.continued).length;
  const totalCount = day.stocks.length;
  return { openAvg, avgAvg, closeAvg, openPositive, avgPositive, closePositive, continuedCount, totalCount };
}

function computeGroupPerfs(day: DayData): GroupPerf[] {
  const groupMap = new Map<string, NextDayStock[]>();
  for (const s of day.stocks) {
    if (!groupMap.has(s.group)) groupMap.set(s.group, []);
    groupMap.get(s.group)!.push(s);
  }

  const GROUP_COLORS: Record<string, string> = {
    "IC設計／AI": "#6366f1",
    "AI 伺服器／散熱": "#f59e0b",
    "半導體": "#3b82f6",
    "半導體設備": "#06b6d4",
    "鋼鐵／原物料": "#8b5cf6",
    "塑化／油價": "#ec4899",
    "生技": "#10b981",
  };

  return Array.from(groupMap.entries())
    .map(([name, stocks]) => {
      const openArr = stocks.map((s) => s.openPct);
      const closeArr = stocks.map((s) => s.closePct);
      const positiveCount = closeArr.filter((v) => v > 0).length;
      return {
        name,
        color: GROUP_COLORS[name] || "#64748b",
        count: stocks.length,
        positiveCount,
        positiveRate: (positiveCount / stocks.length) * 100,
        openAvg: avg(openArr),
        avgAvg: avg(stocks.map((s) => s.avgPct)),
        closeAvg: avg(closeArr),
        streak: "—",
      };
    })
    .sort((a, b) => b.positiveRate - a.positiveRate || b.closeAvg - a.closeAvg);
}

/* ═══════════════════════════════════════════════════════════════
   SVG Line Chart Component
   ═══════════════════════════════════════════════════════════════ */

interface ChartLine {
  values: number[];
  color: string;
  label: string;
}

function LineChart({
  lines,
  labels,
  title,
  yUnit = "%",
  height = 180,
}: {
  lines: ChartLine[];
  labels: string[];
  title: string;
  yUnit?: string;
  height?: number;
}) {
  const W = 900;
  const H = height;
  const PAD = { top: 40, right: 90, bottom: 35, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allVals = lines.flatMap((l) => l.values);
  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals);
  const range = dataMax - dataMin || 1;
  const yMin = dataMin - range * 0.15;
  const yMax = dataMax + range * 0.15;

  const xStep = labels.length > 1 ? chartW / (labels.length - 1) : chartW;

  function toX(i: number) {
    return PAD.left + i * xStep;
  }
  function toY(v: number) {
    return PAD.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
  }

  // Y-axis ticks
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount }, (_, i) => {
    const val = yMin + ((yMax - yMin) * i) / (tickCount - 1);
    return val;
  });

  return (
    <div className="bg-bg-2 border border-border rounded-lg p-4 overflow-hidden">
      <h3 className="text-sm font-semibold text-txt-1 mb-3 tracking-tight">{title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }}>
        {/* Grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={toY(v)}
              y2={toY(v)}
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray={v === 0 ? "none" : "4,3"}
              strokeWidth={v === 0 ? 1.5 : 0.8}
            />
            <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fill="#475569" fontSize="11" fontFamily="Inter, system-ui">
              {v.toFixed(v === 0 ? 0 : 1)}{yUnit}
            </text>
          </g>
        ))}

        {/* Zero line highlight */}
        {yMin <= 0 && yMax >= 0 && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={toY(0)}
            y2={toY(0)}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
            strokeDasharray="6,4"
          />
        )}

        {/* X-axis labels */}
        {labels.map((label, i) => (
          <text
            key={i}
            x={toX(i)}
            y={H - 8}
            textAnchor="middle"
            fill="#475569"
            fontSize="11"
            fontFamily="Inter, system-ui"
          >
            {label}
          </text>
        ))}

        {/* Lines + dots */}
        {lines.map((line, li) => {
          const points = line.values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
          // Gradient area under curve
          const areaPoints = [
            `${toX(0)},${toY(line.values[0])}`,
            ...line.values.map((v, i) => `${toX(i)},${toY(v)}`),
            `${toX(line.values.length - 1)},${toY(yMin)}`,
            `${toX(0)},${toY(yMin)}`,
          ].join(" ");
          const gradientId = `grad-${li}-${title.replace(/\s/g, "")}`;

          return (
            <g key={li}>
              {/* Area gradient */}
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={line.color} stopOpacity="0.15" />
                  <stop offset="100%" stopColor={line.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={areaPoints} fill={`url(#${gradientId})`} />

              {/* Line */}
              <polyline
                points={points}
                fill="none"
                stroke={line.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="chart-line"
              />

              {/* Dots */}
              {line.values.map((v, i) => (
                <g key={i}>
                  <circle cx={toX(i)} cy={toY(v)} r="4.5" fill={line.color} stroke="var(--bg-2)" strokeWidth="2" />
                </g>
              ))}

              {/* End label */}
              <text
                x={W - PAD.right + 8}
                y={toY(line.values[line.values.length - 1]) + 4}
                fill={line.color}
                fontSize="11"
                fontWeight="600"
                fontFamily="Inter, system-ui"
              >
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
   Mini Sparkline for group rows
   ═══════════════════════════════════════════════════════════════ */

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const W = 60;
  const H = 20;
  const min = Math.min(...values, 0);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="inline-block ml-2 opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   KPI Card Component
   ═══════════════════════════════════════════════════════════════ */

function KpiCard({
  label,
  value,
  subLabel,
  subValue,
  color,
  icon,
  large,
}: {
  label: string;
  value: string;
  subLabel: string;
  subValue: string;
  color: "green" | "blue" | "amber" | "red" | "accent";
  icon: string;
  large?: boolean;
}) {
  const colorMap = {
    green: { text: "text-green", bg: "bg-green-bg", border: "border-green/20", glow: "shadow-green/5" },
    blue: { text: "text-blue", bg: "bg-blue-bg", border: "border-blue/20", glow: "shadow-blue/5" },
    amber: { text: "text-amber", bg: "bg-amber-bg", border: "border-amber/20", glow: "shadow-amber/5" },
    red: { text: "text-red", bg: "bg-red-bg", border: "border-red/20", glow: "shadow-red/5" },
    accent: { text: "text-accent", bg: "bg-[rgba(99,102,241,0.08)]", border: "border-accent/20", glow: "shadow-accent/5" },
  };
  const c = colorMap[color];

  return (
    <div className={`relative overflow-hidden bg-bg-2 border ${c.border} rounded-lg px-5 py-4 group hover:border-opacity-50 transition-all duration-300 shadow-lg ${c.glow}`}>
      {/* Subtle gradient accent */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${c.bg} opacity-50`} />
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] text-txt-3 font-medium tracking-wide">{label}</span>
        <span className="text-base opacity-40">{icon}</span>
      </div>
      <div className={`${large ? "text-3xl" : "text-2xl"} font-bold ${c.text} tabular-nums tracking-tight leading-none mb-1.5`}>
        {value}
      </div>
      <div className="text-[10px] text-txt-4 flex items-center gap-1.5">
        <span className="text-txt-3">{subLabel}</span>
        <span className={c.text}>{subValue}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Stock Detail Table (collapsible per group)
   ═══════════════════════════════════════════════════════════════ */

function StockTable({ stocks, sortKey, onSort }: {
  stocks: NextDayStock[];
  sortKey: string;
  onSort: (key: string) => void;
}) {
  const headers = [
    { key: "code", label: "代號", align: "left" as const },
    { key: "name", label: "名稱", align: "left" as const },
    { key: "group", label: "族群", align: "left" as const },
    { key: "openPct", label: "開盤報酬", align: "right" as const },
    { key: "avgPct", label: "均價報酬", align: "right" as const },
    { key: "closePct", label: "收盤報酬", align: "right" as const },
    { key: "continued", label: "續漲停", align: "center" as const },
  ];

  return (
    <div className="bg-bg-2 border border-border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-bg-3/50">
            {headers.map((h) => (
              <th
                key={h.key}
                onClick={() => onSort(h.key)}
                className={`px-4 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2 transition-colors select-none ${
                  h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"
                } ${sortKey === h.key ? "text-txt-2" : ""}`}
              >
                {h.label}
                {sortKey === h.key && <span className="ml-1 text-accent">▼</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => (
            <tr key={s.code} className="border-b border-border/50 last:border-0 hover:bg-bg-3/30 transition-colors">
              <td className="px-4 py-2.5 font-mono text-txt-3 text-[11px]">
                <Link href={`/stock/${s.code}`} className="hover:text-txt-0 hover:underline underline-offset-2 transition-colors">
                  {s.code}
                </Link>
              </td>
              <td className="px-4 py-2.5 font-medium text-txt-1">
                <Link href={`/stock/${s.code}`} className="hover:text-txt-0 transition-colors">
                  {s.name}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-txt-3 text-[11px]">{s.group}</td>
              <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${s.openPct > 0 ? "text-green" : s.openPct < 0 ? "text-red" : "text-txt-3"}`}>
                {formatPct(s.openPct)}
              </td>
              <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${s.avgPct > 0 ? "text-green" : s.avgPct < 0 ? "text-red" : "text-txt-3"}`}>
                {formatPct(s.avgPct)}
              </td>
              <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${s.closePct > 0 ? "text-green" : s.closePct < 0 ? "text-red" : "text-txt-3"}`}>
                {formatPct(s.closePct)}
              </td>
              <td className="px-4 py-2.5 text-center">
                {s.continued ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red bg-red-bg px-2 py-0.5 rounded-full">
                    🔥 續漲停
                  </span>
                ) : (
                  <span className="text-txt-4 text-[10px]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════ */

export default function NextDayPage() {
  const [dateIndex, setDateIndex] = useState(MOCK_DATA.length - 1);
  const [sortKey, setSortKey] = useState("closePct");
  const [sortAsc, setSortAsc] = useState(false);
  const [showStocks, setShowStocks] = useState(true);

  const day = MOCK_DATA[dateIndex];
  const stats = computeDayStats(day);
  const groupPerfs = useMemo(() => computeGroupPerfs(day), [day]);

  // Sort stocks
  const sortedStocks = useMemo(() => {
    const sorted = [...day.stocks];
    sorted.sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "openPct": va = a.openPct; vb = b.openPct; break;
        case "avgPct": va = a.avgPct; vb = b.avgPct; break;
        case "closePct": va = a.closePct; vb = b.closePct; break;
        case "code": va = a.code; vb = b.code; break;
        case "name": va = a.name; vb = b.name; break;
        case "group": va = a.group; vb = b.group; break;
        default: va = a.closePct; vb = b.closePct;
      }
      if (typeof va === "number" && typeof vb === "number") {
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return sorted;
  }, [day.stocks, sortKey, sortAsc]);

  function handleSort(key: string) {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  // Historical data for charts
  const historyLabels = MOCK_DATA.map((d) => d.nextDate.slice(5).replace("-", "/"));
  const historyAvgReturn: ChartLine[] = [
    { values: MOCK_DATA.map((d) => computeDayStats(d).openAvg), color: "#3b82f6", label: "開盤" },
    { values: MOCK_DATA.map((d) => computeDayStats(d).avgAvg), color: "#f59e0b", label: "均價" },
    { values: MOCK_DATA.map((d) => computeDayStats(d).closeAvg), color: "#ef4444", label: "收盤" },
  ];
  const historyPositiveRate: ChartLine[] = [
    { values: MOCK_DATA.map((d) => computeDayStats(d).openPositive), color: "#3b82f6", label: "開盤" },
    { values: MOCK_DATA.map((d) => computeDayStats(d).avgPositive), color: "#f59e0b", label: "均價" },
    { values: MOCK_DATA.map((d) => computeDayStats(d).closePositive), color: "#ef4444", label: "收盤" },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate={day.nextDate} />

      <main className="flex-1 overflow-y-auto">
        {/* Hero header */}
        <div className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.03] to-transparent pointer-events-none" />
          <div className="max-w-[1400px] mx-auto px-6 py-6">
            <div className="text-center">
              <h1 className="text-lg font-bold text-txt-0 tracking-tight flex items-center justify-center gap-2">
                <span className="text-xl">📊</span>
                漲停隔日表現
              </h1>
              <p className="text-[11px] text-txt-4 mt-1">
                漲停日 {day.limitDate.replace(/-/g, "/")} → 隔日 {day.nextDate.replace(/-/g, "/")}
              </p>
            </div>

            {/* Date navigator */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setDateIndex((i) => Math.max(0, i - 1))}
                disabled={dateIndex === 0}
                className="w-8 h-8 rounded-lg bg-bg-3 border border-border flex items-center justify-center text-txt-3 hover:text-txt-0 hover:bg-bg-4 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ◀
              </button>
              <div className="px-5 py-1.5 bg-bg-3 border border-border rounded-lg">
                <span className="text-base font-bold text-accent tabular-nums tracking-wider">
                  {day.nextDate.replace(/-/g, "/")}
                </span>
              </div>
              <button
                onClick={() => setDateIndex((i) => Math.min(MOCK_DATA.length - 1, i + 1))}
                disabled={dateIndex === MOCK_DATA.length - 1}
                className="w-8 h-8 rounded-lg bg-bg-3 border border-border flex items-center justify-center text-txt-3 hover:text-txt-0 hover:bg-bg-4 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-6 py-5 space-y-5">
          {/* ═══ KPI Cards ═══ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="開盤均報酬"
              value={formatPct(stats.openAvg)}
              subLabel="正報酬率"
              subValue={`${stats.openPositive.toFixed(1)}%`}
              color="green"
              icon="📈"
            />
            <KpiCard
              label="均價均報酬"
              value={formatPct(stats.avgAvg)}
              subLabel="正報酬率"
              subValue={`${stats.avgPositive.toFixed(1)}%`}
              color="blue"
              icon="📊"
            />
            <KpiCard
              label="收盤均報酬"
              value={formatPct(stats.closeAvg)}
              subLabel="正報酬率"
              subValue={`${stats.closePositive.toFixed(1)}%`}
              color="amber"
              icon="📉"
            />
            <KpiCard
              label="續漲停"
              value={`${stats.continuedCount} 檔`}
              subLabel=""
              subValue={`${stats.totalCount} 檔漲停`}
              color="red"
              icon="🔥"
              large
            />
          </div>

          {/* ═══ 歷史趨勢 Charts ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">📈</span>
              <h2 className="text-sm font-semibold text-txt-0 tracking-tight">歷史趨勢</h2>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LineChart
                lines={historyAvgReturn}
                labels={historyLabels}
                title="均報酬 %"
              />
              <LineChart
                lines={historyPositiveRate}
                labels={historyLabels}
                title="正報酬率 %"
                yUnit="%"
              />
            </div>
          </div>

          {/* ═══ 族群正報酬率 Table ═══ */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">🏷️</span>
              <h2 className="text-sm font-semibold text-txt-0 tracking-tight">族群正報酬率</h2>
            </div>
            <div className="bg-bg-2 border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg-3/50">
                    <th className="text-left px-4 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">族群</th>
                    <th className="text-center px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">檔數</th>
                    <th className="text-center px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">連續</th>
                    <th className="text-center px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">
                      正報酬率
                      <span className="ml-1 text-txt-4 cursor-help" title="收盤價高於漲停日收盤價的比例">ⓘ</span>
                    </th>
                    <th className="text-right px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">開盤</th>
                    <th className="text-right px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">均價</th>
                    <th className="text-right px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">收盤</th>
                    <th className="text-center px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase w-20">走勢</th>
                  </tr>
                </thead>
                <tbody>
                  {groupPerfs.map((g) => (
                    <tr key={g.name} className="border-b border-border/50 last:border-0 hover:bg-bg-3/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
                          <span className="font-medium text-txt-1 text-[12px]">{g.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-txt-3 tabular-nums">{g.count}</td>
                      <td className="px-3 py-3 text-center text-txt-4">{g.streak}</td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={`font-bold tabular-nums ${g.positiveRate >= 80 ? "text-green" : g.positiveRate >= 50 ? "text-amber" : "text-red"}`}>
                            {g.positiveRate.toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-txt-4">{g.positiveCount}/{g.count}</span>
                        </div>
                        {/* Progress bar */}
                        <div className="mt-1 h-[3px] bg-bg-4 rounded-full overflow-hidden mx-2">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              g.positiveRate >= 80 ? "bg-green" : g.positiveRate >= 50 ? "bg-amber" : "bg-red"
                            }`}
                            style={{ width: `${g.positiveRate}%` }}
                          />
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
                      <td className="px-3 py-3 text-center">
                        <MiniSparkline
                          values={MOCK_DATA.slice(Math.max(0, dateIndex - 4), dateIndex + 1).map((d) => {
                            const gs = d.stocks.filter((s) => s.group === g.name);
                            return gs.length ? avg(gs.map((s) => s.closePct)) : 0;
                          })}
                          color={g.color}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ 個股明細 ═══ */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">📋</span>
                <h2 className="text-sm font-semibold text-txt-0 tracking-tight">個股明細</h2>
                <span className="text-[10px] text-txt-4 bg-bg-3 px-2 py-0.5 rounded-full">{day.stocks.length} 檔</span>
              </div>
              <button
                onClick={() => setShowStocks(!showStocks)}
                className="text-[11px] text-txt-3 hover:text-txt-1 transition-colors px-3 py-1 rounded-md bg-bg-3 border border-border hover:border-border-hover"
              >
                {showStocks ? "收合 ▲" : "展開 ▼"}
              </button>
            </div>
            {showStocks && (
              <StockTable stocks={sortedStocks} sortKey={sortKey} onSort={handleSort} />
            )}
          </div>

          {/* Footer note */}
          <div className="text-center py-4 text-[10px] text-txt-4 border-t border-border/50">
            示範資料 — 實際上線後將自動追蹤每日漲停股的隔日表現
          </div>
        </div>
      </main>
    </div>
  );
}
