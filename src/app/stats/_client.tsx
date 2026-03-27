"use client";

import { useState } from "react";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";

/* ================================================================
   MOCK DATA
   ================================================================ */

const GROUPS = [
  "AI伺服器 / 散熱",
  "半導體測試 / 先進封裝",
  "IC設計 / AI邊緣運算",
  "矽光子 / 高速傳輸",
  "PCB / CCL基板",
  "鋼鐵 / 鋼價調漲",
  "塑化 / 油價",
  "生技 / 醫藥",
  "營建 / 資產",
  "光通訊",
  "IC設計 / 邊緣運算",
  "個股亮點",
];

const RECENT_DATES = [
  "03/09","03/10","03/11","03/12","03/13",
  "03/16","03/17","03/18","03/19","03/20",
];

// Heatmap data: group x date -> limit-up count
const HEATMAP_DATA: Record<string, number[]> = {
  "AI伺服器 / 散熱":        [5,4,2,3,4,6,3,5,4,7],
  "半導體測試 / 先進封裝":   [4,3,1,2,3,5,4,3,5,6],
  "IC設計 / AI邊緣運算":     [3,2,2,1,3,4,3,2,4,5],
  "矽光子 / 高速傳輸":      [2,3,1,2,2,3,2,3,3,4],
  "PCB / CCL基板":          [2,2,1,1,2,3,1,2,2,3],
  "鋼鐵 / 鋼價調漲":        [1,1,2,3,2,1,1,2,1,1],
  "塑化 / 油價":            [0,1,2,1,1,2,3,2,1,1],
  "生技 / 醫藥":            [1,0,1,1,0,2,1,1,2,1],
  "營建 / 資產":            [0,1,0,1,1,0,1,0,1,1],
  "光通訊":                 [3,2,1,1,2,2,1,2,1,3],
  "IC設計 / 邊緣運算":      [1,2,1,0,1,2,2,1,2,3],
  "個股亮點":               [0,0,1,1,0,1,2,1,0,2],
};

const GROUP_HEAT = [
  { name: "AI伺服器 / 散熱",       count: 43, prev: 35, trend: "up" as const },
  { name: "半導體測試 / 先進封裝",  count: 36, prev: 30, trend: "up" as const },
  { name: "IC設計 / AI邊緣運算",    count: 29, prev: 32, trend: "down" as const },
  { name: "矽光子 / 高速傳輸",     count: 25, prev: 19, trend: "up" as const },
  { name: "PCB / CCL基板",         count: 19, prev: 19, trend: "flat" as const },
  { name: "光通訊",                count: 18, prev: 14, trend: "up" as const },
  { name: "鋼鐵 / 鋼價調漲",       count: 15, prev: 18, trend: "down" as const },
  { name: "塑化 / 油價",           count: 14, prev: 11, trend: "up" as const },
  { name: "IC設計 / 邊緣運算",     count: 15, prev: 10, trend: "up" as const },
  { name: "生技 / 醫藥",           count: 10, prev: 13, trend: "down" as const },
  { name: "個股亮點",              count: 8,  prev: 11, trend: "down" as const },
  { name: "營建 / 資產",           count: 6,  prev: 9,  trend: "down" as const },
];

const NEXT_DAY_STATS = {
  open:  { win: 68, avg: 1.8 },
  avg:   { win: 62, avg: 1.2 },
  close: { win: 55, avg: 0.6 },
};

const MONTHLY_TREND = [
  { date: "03/02", count: 18 },
  { date: "03/03", count: 23 },
  { date: "03/04", count: 31 },
  { date: "03/05", count: 12 },
  { date: "03/06", count: 27 },
  { date: "03/09", count: 44 },
  { date: "03/10", count: 38 },
  { date: "03/11", count: 19 },
  { date: "03/12", count: 25 },
  { date: "03/13", count: 33 },
  { date: "03/16", count: 41 },
  { date: "03/17", count: 29 },
  { date: "03/18", count: 36 },
  { date: "03/19", count: 48 },
  { date: "03/20", count: 54 },
];

const STREAK_RATES = [
  { label: "2 連板", total: 220, success: 99,  rate: 45, avgHold: 2.3 },
  { label: "3 連板", total: 99,  success: 28,  rate: 28, avgHold: 3.8 },
  { label: "4 連板", total: 28,  success: 4,   rate: 14, avgHold: 5.1 },
  { label: "5 連板+",total: 4,   success: 1,   rate: 25, avgHold: 7.2 },
];

const VOLUME_DIST = [
  { label: "> 1x",  count: 312, pct: 100 },
  { label: "> 2x",  count: 198, pct: 63 },
  { label: "> 3x",  count: 124, pct: 40 },
  { label: "> 5x",  count: 67,  pct: 21 },
  { label: "> 10x", count: 23,  pct: 7 },
];

const TIME_WIN_RATES = [
  { period: "T+1",  win: 55, avg: 0.6,  max: 10.0, min: -7.5  },
  { period: "T+3",  win: 48, avg: -0.2, max: 18.5, min: -12.3 },
  { period: "T+5",  win: 43, avg: -1.1, max: 25.0, min: -18.7 },
  { period: "T+10", win: 38, avg: -2.5, max: 35.2, min: -25.1 },
];

/* ================================================================
   SUB-COMPONENTS
   ================================================================ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-txt-0 tracking-tight mb-4 flex items-center gap-2">
      <span className="w-1 h-4 bg-red rounded-full inline-block" />
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
   1. KPI SUMMARY ROW
   ================================================================ */

function KpiRow() {
  const totalLimitUp = MONTHLY_TREND.reduce((s, d) => s + d.count, 0);
  const avgDaily = (totalLimitUp / MONTHLY_TREND.length).toFixed(1);
  const positiveRate = "55.2";
  const strongestGroup = "AI伺服器";

  const kpis = [
    { label: "本月漲停總數",  value: String(totalLimitUp), sub: `${MONTHLY_TREND.length} 交易日`, color: "#ef4444" },
    { label: "平均每日漲停",  value: avgDaily, sub: "家 / 日", color: "#3b82f6" },
    { label: "正報酬率",      value: `${positiveRate}%`, sub: "隔日收盤", color: "#22c55e" },
    { label: "最強族群",      value: strongestGroup, sub: "43 次漲停", color: "#f59e0b" },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="bg-bg-1 border border-border rounded-lg p-4 relative overflow-hidden card-hover"
        >
          <div
            className="absolute top-0 left-0 w-full h-[2px]"
            style={{ background: k.color }}
          />
          <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-1">{k.label}</div>
          <div className="text-xl font-bold text-txt-0 tracking-tight">{k.value}</div>
          <div className="text-[10px] text-txt-3 mt-0.5">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ================================================================
   2. SECTOR ROTATION HEATMAP
   ================================================================ */

function SectorRotationHeatmap() {
  const maxVal = Math.max(...Object.values(HEATMAP_DATA).flat());

  function cellColor(val: number): string {
    if (val === 0) return "rgba(255,255,255,0.02)";
    const intensity = val / maxVal;
    if (intensity > 0.7) return "rgba(34,197,94,0.7)";
    if (intensity > 0.5) return "rgba(34,197,94,0.45)";
    if (intensity > 0.3) return "rgba(34,197,94,0.25)";
    return "rgba(34,197,94,0.12)";
  }

  return (
    <Card className="col-span-1 xl:col-span-2">
      <SectionTitle>族群輪動分析（近 10 日）</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr>
              <th className="text-left text-txt-4 font-medium pb-2 pr-3 min-w-[140px]">族群</th>
              {RECENT_DATES.map((d) => (
                <th key={d} className="text-center text-txt-4 font-medium pb-2 px-1 min-w-[36px]">{d.slice(3)}</th>
              ))}
              <th className="text-right text-txt-4 font-medium pb-2 pl-2 min-w-[32px]">合計</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => {
              const values = HEATMAP_DATA[group] || [];
              const total = values.reduce((s, v) => s + v, 0);
              return (
                <tr key={group} className="border-t border-white/[0.03]">
                  <td className="py-1.5 pr-3 text-txt-2 truncate max-w-[140px]">{group}</td>
                  {values.map((v, i) => (
                    <td key={i} className="py-1.5 px-1 text-center">
                      <div
                        className="w-full h-6 rounded-[3px] flex items-center justify-center text-[9px] font-medium"
                        style={{
                          background: cellColor(v),
                          color: v > 0 ? "rgba(255,255,255,0.8)" : "transparent",
                        }}
                      >
                        {v > 0 ? v : ""}
                      </div>
                    </td>
                  ))}
                  <td className="py-1.5 pl-2 text-right text-txt-1 font-semibold">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10px] text-txt-4">
        <span>色階:</span>
        {[
          { label: "0", bg: "rgba(255,255,255,0.02)" },
          { label: "1-2", bg: "rgba(34,197,94,0.12)" },
          { label: "3-4", bg: "rgba(34,197,94,0.25)" },
          { label: "5+", bg: "rgba(34,197,94,0.45)" },
          { label: "7+", bg: "rgba(34,197,94,0.7)" },
        ].map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-[2px]" style={{ background: s.bg }} />
            {s.label}
          </span>
        ))}
      </div>
    </Card>
  );
}

/* ================================================================
   3. GROUP HEAT RANKING
   ================================================================ */

function GroupHeatChart() {
  const maxCount = Math.max(...GROUP_HEAT.map((g) => g.count));

  function trendArrow(t: "up" | "down" | "flat") {
    if (t === "up") return <span className="text-red ml-1">^</span>;
    if (t === "down") return <span className="text-green ml-1">v</span>;
    return <span className="text-txt-4 ml-1">--</span>;
  }

  return (
    <Card>
      <SectionTitle>族群熱度排行（近 30 日）</SectionTitle>
      <div className="space-y-2">
        {GROUP_HEAT.map((g, idx) => {
          const pct = Math.round((g.count / maxCount) * 100);
          return (
            <div key={g.name} className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{
                  background: idx < 3 ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.04)",
                  color: idx < 3 ? "#ef4444" : "#64748b",
                }}
              >
                {idx + 1}
              </div>
              <div className="w-36 text-[11px] text-txt-2 truncate flex-shrink-0">{g.name}</div>
              <div className="flex-1 h-5 bg-bg-3 rounded-sm overflow-hidden relative">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, rgba(239,68,68,0.3) 0%, rgba(239,68,68,0.7) 100%)`,
                  }}
                />
              </div>
              <div className="w-8 text-xs text-txt-1 tabular-nums text-right flex-shrink-0 font-semibold">
                {g.count}
              </div>
              <div className="w-8 text-[10px] tabular-nums text-right flex-shrink-0">
                {trendArrow(g.trend)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[10px] text-txt-4 text-right">
        ^ 較前期上升 / v 較前期下降 / -- 持平
      </div>
    </Card>
  );
}

/* ================================================================
   4. NEXT DAY PERFORMANCE
   ================================================================ */

function NextDayPerformance() {
  const metrics = [
    { key: "open"  as const, label: "開盤", color: "#ef4444" },
    { key: "avg"   as const, label: "均價", color: "#3b82f6" },
    { key: "close" as const, label: "收盤", color: "#f59e0b" },
  ];

  return (
    <Card>
      <SectionTitle>漲停後隔日表現統計</SectionTitle>
      <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">
        {/* Three donuts */}
        <div className="flex gap-4">
          {metrics.map((m) => {
            const stat = NEXT_DAY_STATS[m.key];
            const radius = 32;
            const circ = 2 * Math.PI * radius;
            const filled = (stat.win / 100) * circ;
            return (
              <div key={m.key} className="flex flex-col items-center gap-1">
                <div className="relative">
                  <svg width="80" height="80" viewBox="0 0 80 80">
                    <circle
                      cx="40" cy="40" r={radius}
                      fill="none"
                      stroke="rgba(255,255,255,0.04)"
                      strokeWidth="6"
                    />
                    <circle
                      cx="40" cy="40" r={radius}
                      fill="none"
                      stroke={m.color}
                      strokeWidth="6"
                      strokeDasharray={`${filled} ${circ - filled}`}
                      strokeLinecap="round"
                      transform="rotate(-90 40 40)"
                      style={{
                        transition: "stroke-dasharray 1s ease-out",
                      }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm font-bold text-txt-0">{stat.win}%</span>
                    <span className="text-[8px] text-txt-4">勝率</span>
                  </div>
                </div>
                <span className="text-[10px] text-txt-3 font-medium">{m.label}</span>
              </div>
            );
          })}
        </div>

        {/* Win rate comparison */}
        <div className="flex-1 space-y-3 pt-2">
          <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-2">平均漲幅比較</div>
          {metrics.map((m) => {
            const stat = NEXT_DAY_STATS[m.key];
            const barW = Math.max(Math.abs(stat.avg) * 15, 4);
            return (
              <div key={m.key} className="flex items-center gap-2">
                <span className="w-8 text-[10px] text-txt-3 text-right">{m.label}</span>
                <div className="flex-1 h-4 bg-bg-3 rounded-sm relative flex items-center">
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${barW}%`,
                      background: m.color,
                      opacity: 0.6,
                      marginLeft: stat.avg < 0 ? "auto" : undefined,
                    }}
                  />
                </div>
                <span
                  className="w-12 text-xs font-bold tabular-nums text-right"
                  style={{ color: stat.avg >= 0 ? "#ef4444" : "#22c55e" }}
                >
                  {stat.avg >= 0 ? "+" : ""}{stat.avg}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/* ================================================================
   5. MONTHLY TREND WITH MOVING AVERAGE
   ================================================================ */

function MonthlyTrendChart() {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const maxCount = Math.max(...MONTHLY_TREND.map((d) => d.count));
  const minCount = Math.min(...MONTHLY_TREND.map((d) => d.count));
  const avgCount = Math.round(MONTHLY_TREND.reduce((s, d) => s + d.count, 0) / MONTHLY_TREND.length);

  // 3-day moving average
  const ma: number[] = MONTHLY_TREND.map((_, i) => {
    if (i < 2) return MONTHLY_TREND[i].count;
    return Math.round((MONTHLY_TREND[i].count + MONTHLY_TREND[i - 1].count + MONTHLY_TREND[i - 2].count) / 3);
  });

  const chartW = 600;
  const chartH = 160;
  const padL = 0;
  const padR = 0;
  const padT = 20;
  const padB = 0;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const barW = innerW / MONTHLY_TREND.length;

  // Moving average SVG path
  const maPath = ma
    .map((v, i) => {
      const x = padL + i * barW + barW / 2;
      const y = padT + innerH - (v / maxCount) * innerH;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <Card className="col-span-1 xl:col-span-2">
      <SectionTitle>月度漲停趨勢（2026 年 3 月）</SectionTitle>

      {/* Stats row */}
      <div className="flex gap-6 mb-4 text-[10px]">
        <span className="text-txt-4">MAX <span className="text-txt-1 font-bold ml-1">{maxCount}</span></span>
        <span className="text-txt-4">MIN <span className="text-txt-1 font-bold ml-1">{minCount}</span></span>
        <span className="text-txt-4">AVG <span className="text-txt-1 font-bold ml-1">{avgCount}</span></span>
        <span className="flex items-center gap-1 text-txt-4">
          <span className="inline-block w-3 h-[2px]" style={{ background: "#f59e0b" }} />
          3 日均線
        </span>
      </div>

      <svg width="100%" viewBox={`0 0 ${chartW} ${chartH + 24}`} className="overflow-visible">
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="1" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={padL}
            y1={padT + innerH * (1 - frac)}
            x2={padL + innerW}
            y2={padT + innerH * (1 - frac)}
            stroke="rgba(255,255,255,0.04)"
            strokeDasharray="2 4"
          />
        ))}

        {/* AVG line */}
        <line
          x1={padL}
          y1={padT + innerH - (avgCount / maxCount) * innerH}
          x2={padL + innerW}
          y2={padT + innerH - (avgCount / maxCount) * innerH}
          stroke="rgba(255,255,255,0.12)"
          strokeDasharray="4 3"
        />

        {/* Bars */}
        {MONTHLY_TREND.map((d, i) => {
          const barH = (d.count / maxCount) * innerH;
          const x = padL + i * barW + barW * 0.15;
          const y = padT + innerH - barH;
          const w = barW * 0.7;
          const isToday = d.date === "03/20";
          const isHover = hoverIdx === i;
          return (
            <g
              key={d.date}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "default" }}
            >
              {/* Hover background */}
              <rect
                x={padL + i * barW}
                y={padT}
                width={barW}
                height={innerH}
                fill="transparent"
              />
              <rect
                x={x}
                y={y}
                width={w}
                height={barH}
                rx={2}
                fill={isToday ? "#ef4444" : (isHover ? "url(#barGradHover)" : "url(#barGrad)")}
              />
              {/* Hover label */}
              {isHover && (
                <text
                  x={padL + i * barW + barW / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fill="#f1f5f9"
                  fontSize="10"
                  fontWeight="700"
                >
                  {d.count}
                </text>
              )}
              {/* Date label */}
              <text
                x={padL + i * barW + barW / 2}
                y={padT + innerH + 14}
                textAnchor="middle"
                fill={isToday ? "#ef4444" : "#475569"}
                fontSize="9"
                fontWeight={isToday ? "700" : "400"}
              >
                {d.date}
              </text>
            </g>
          );
        })}

        {/* Moving average line */}
        <path
          d={maPath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
        {/* MA dots */}
        {ma.map((v, i) => (
          <circle
            key={i}
            cx={padL + i * barW + barW / 2}
            cy={padT + innerH - (v / maxCount) * innerH}
            r="2.5"
            fill="#f59e0b"
            opacity="0.6"
          />
        ))}
      </svg>
    </Card>
  );
}

/* ================================================================
   6. STREAK SUCCESS TABLE
   ================================================================ */

function StreakSuccessTable() {
  return (
    <Card>
      <SectionTitle>連板成功率統計</SectionTitle>
      <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {["類型", "樣本數", "成功數", "成功率", "比率", "平均持有天數"].map((h, i) => (
              <th
                key={h}
                className={`text-[10px] font-semibold text-txt-4 uppercase tracking-wider pb-2 ${
                  i === 0 ? "text-left" : i === 4 ? "text-left pl-3" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STREAK_RATES.map((row) => (
            <tr key={row.label} className="border-b border-white/[0.03] last:border-b-0">
              <td className="py-3 text-txt-1 font-medium">{row.label}</td>
              <td className="py-3 text-right text-txt-3 tabular-nums">{row.total}</td>
              <td className="py-3 text-right text-txt-3 tabular-nums">{row.success}</td>
              <td className="py-3 text-right font-bold tabular-nums">
                <span className={row.rate >= 30 ? "text-red" : row.rate >= 15 ? "text-amber" : "text-txt-2"}>
                  {row.rate}%
                </span>
              </td>
              <td className="py-3 pl-3">
                <div className="w-28 h-2 bg-bg-3 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${row.rate}%`,
                      background: `linear-gradient(90deg, rgba(239,68,68,0.3), rgba(239,68,68,0.7))`,
                    }}
                  />
                </div>
              </td>
              <td className="py-3 text-right text-txt-2 tabular-nums">{row.avgHold} 日</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="mt-3 text-[10px] text-txt-4">
        * 成功定義: 次日未跌停且漲幅 &gt; 0%
      </div>
    </Card>
  );
}

/* ================================================================
   7. VOLUME ANALYSIS
   ================================================================ */

function VolumeAnalysis() {
  const maxCount = Math.max(...VOLUME_DIST.map((v) => v.count));

  const colors = [
    "rgba(59,130,246,0.4)",
    "rgba(59,130,246,0.5)",
    "rgba(59,130,246,0.6)",
    "rgba(99,102,241,0.65)",
    "rgba(139,92,246,0.7)",
  ];

  return (
    <Card>
      <SectionTitle>量能分析 -- 爆量分布</SectionTitle>
      <div className="text-[10px] text-txt-4 mb-4">漲停日相對 20 日均量之倍數分布</div>
      <div className="space-y-3">
        {VOLUME_DIST.map((v, idx) => {
          const barPct = Math.round((v.count / maxCount) * 100);
          return (
            <div key={v.label} className="flex items-center gap-3">
              <div className="w-12 text-[11px] text-txt-2 text-right font-medium flex-shrink-0">{v.label}</div>
              <div className="flex-1 h-6 bg-bg-3 rounded-sm overflow-hidden relative">
                <div
                  className="h-full rounded-sm flex items-center px-2"
                  style={{
                    width: `${barPct}%`,
                    background: colors[idx],
                  }}
                >
                  <span className="text-[9px] text-white/70 font-medium">{v.pct}%</span>
                </div>
              </div>
              <div className="w-10 text-xs text-txt-1 tabular-nums text-right flex-shrink-0 font-semibold">
                {v.count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-white/[0.03]">
        <div className="flex justify-between text-[10px] text-txt-4">
          <span>樣本: {VOLUME_DIST[0].count} 檔漲停股</span>
          <span>統計區間: 近 30 交易日</span>
        </div>
      </div>
    </Card>
  );
}

/* ================================================================
   8. TIME PERIOD WIN RATE
   ================================================================ */

function TimePeriodWinRate() {
  return (
    <Card>
      <SectionTitle>時段勝率分析</SectionTitle>
      <div className="text-[10px] text-txt-4 mb-4">漲停買進後不同持有期間之勝率與報酬</div>
      <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {["持有期間", "勝率", "平均報酬", "最大獲利", "最大虧損", "勝率分布"].map((h, i) => (
              <th
                key={h}
                className={`text-[10px] font-semibold text-txt-4 uppercase tracking-wider pb-2 ${
                  i === 0 ? "text-left" : i === 5 ? "text-left pl-3" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIME_WIN_RATES.map((row) => (
            <tr key={row.period} className="border-b border-white/[0.03] last:border-b-0">
              <td className="py-3 text-txt-1 font-medium">{row.period}</td>
              <td className="py-3 text-right font-bold tabular-nums">
                <span className={row.win >= 50 ? "text-red" : "text-green"}>
                  {row.win}%
                </span>
              </td>
              <td className="py-3 text-right tabular-nums">
                <span className={row.avg >= 0 ? "text-red" : "text-green"}>
                  {row.avg >= 0 ? "+" : ""}{row.avg}%
                </span>
              </td>
              <td className="py-3 text-right tabular-nums text-red">+{row.max}%</td>
              <td className="py-3 text-right tabular-nums text-green">{row.min}%</td>
              <td className="py-3 pl-3">
                <div className="w-28 h-3 bg-bg-3 rounded-full overflow-hidden flex">
                  <div
                    className="h-full"
                    style={{
                      width: `${row.win}%`,
                      background: "rgba(239,68,68,0.5)",
                    }}
                  />
                  <div
                    className="h-full"
                    style={{
                      width: `${100 - row.win}%`,
                      background: "rgba(34,197,94,0.3)",
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[10px] text-txt-4">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(239,68,68,0.5)" }} />
          勝 (收盤 &gt; 買入價)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(34,197,94,0.3)" }} />
          敗 (收盤 &lt;= 買入價)
        </span>
      </div>
    </Card>
  );
}

/* ================================================================
   PAGE
   ================================================================ */

export default function StatsPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate="2026-03-20" />
      <NavBar />

      <main className="flex-1 overflow-y-auto p-4 md:p-5 animate-fade-in">
        {/* Demo banner */}
        <div className="mb-5 px-3 py-2 bg-amber-bg border border-amber/30 rounded-lg flex items-center gap-2 text-xs text-amber font-medium">
          <span className="text-amber font-bold">DEMO</span>
          <span>-- 示範資料，以下統計均為模擬數據，非實際歷史資料</span>
        </div>

        <h1 className="text-base font-bold text-txt-0 tracking-tight mb-5">統計分析</h1>

        {/* KPI Row */}
        <div className="mb-4">
          <KpiRow />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <SectorRotationHeatmap />
          <GroupHeatChart />
          <NextDayPerformance />
          <MonthlyTrendChart />
          <StreakSuccessTable />
          <VolumeAnalysis />
          <TimePeriodWinRate />
        </div>
      </main>
    </div>
  );
}
