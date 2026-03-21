"use client";

import Link from "next/link";
import TopNav from "@/components/TopNav";

/* ─── Mock data ─────────────────────────────────────── */

const GROUP_HEAT = [
  { name: "AI 伺服器 / 散熱",      count: 28 },
  { name: "半導體設備 / 先進封裝",  count: 24 },
  { name: "IC 設計 / AI 邊緣運算",  count: 21 },
  { name: "光通訊 / 矽光子",        count: 18 },
  { name: "PCB / CCL 基板",         count: 16 },
  { name: "鋼鐵 / 原物料",          count: 12 },
  { name: "太陽能 / 綠能",          count: 10 },
  { name: "生技 / 醫療器材",        count: 8  },
  { name: "營建 / 資產",            count: 6  },
  { name: "個股亮點",               count: 4  },
];

const NEXT_DAY_STATS = {
  open_up_ratio: 68,
  avg_change: 1.2,
  best: { pct: 10.0, name: "奇鋐", code: "3017" },
  worst: { pct: -7.5, name: "聯亞", code: "3081" },
};

// Trading days in March 2026 with mock daily limit-up counts
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
  { label: "2 連板", success: 45, total: 220, next: 99 },
  { label: "3 連板", success: 28, total: 99, next: 28 },
  { label: "4 連板", success: 15, total: 28, next: 4 },
  { label: "5 連板+", success: 8, total: 4, next: 0 },
];

/* ─── Sub-components ─────────────────────────────────── */

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

/* ─── Section 1: 族群熱度排行 ────────────────────────── */
function GroupHeatChart() {
  const maxCount = Math.max(...GROUP_HEAT.map((g) => g.count));

  return (
    <Card>
      <SectionTitle>族群熱度排行（近 30 日）</SectionTitle>
      <div className="space-y-2.5">
        {GROUP_HEAT.map((g) => {
          const pct = Math.round((g.count / maxCount) * 100);
          return (
            <div key={g.name} className="flex items-center gap-3">
              <div className="w-40 text-xs text-txt-2 truncate flex-shrink-0 text-right">
                {g.name}
              </div>
              <div className="flex-1 h-5 bg-bg-3 rounded-sm overflow-hidden relative">
                <div
                  className="h-full bg-red/70 rounded-sm transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="w-8 text-xs text-txt-3 tabular-nums text-right flex-shrink-0">
                {g.count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[10px] text-txt-4 text-right">日出現次數（最高 {maxCount} 次）</div>
    </Card>
  );
}

/* ─── Section 2: 漲停後隔日表現 ──────────────────────── */
function NextDayStats() {
  const r = NEXT_DAY_STATS;
  // Donut ring: strokeDasharray trick
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const filled = (r.open_up_ratio / 100) * circ;

  return (
    <Card>
      <SectionTitle>漲停後隔日表現統計</SectionTitle>
      <div className="flex items-center gap-8">
        {/* Donut */}
        <div className="relative flex-shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle
              cx="36" cy="36" r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="8"
            />
            <circle
              cx="36" cy="36" r={radius}
              fill="none"
              stroke="#ef4444"
              strokeWidth="8"
              strokeDasharray={`${filled} ${circ - filled}`}
              strokeLinecap="round"
              transform="rotate(-90 36 36)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold text-txt-0">{r.open_up_ratio}%</span>
            <span className="text-[9px] text-txt-4">開漲</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-3 flex-1">
          <div>
            <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-0.5">平均隔日漲幅</div>
            <div className="text-base font-bold text-red">+{r.avg_change}%</div>
          </div>
          <div>
            <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-0.5">最佳隔日表現</div>
            <div className="text-sm font-semibold text-red">+{r.best.pct}%
              <Link href={`/stock/${r.best.code}`} className="text-xs text-txt-3 font-normal ml-1 hover:text-txt-1 hover:underline underline-offset-2 transition-colors">
                {r.best.name} ({r.best.code})
              </Link>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-0.5">最差隔日表現</div>
            <div className="text-sm font-semibold text-green">{r.worst.pct}%
              <Link href={`/stock/${r.worst.code}`} className="text-xs text-txt-3 font-normal ml-1 hover:text-txt-1 hover:underline underline-offset-2 transition-colors">
                {r.worst.name} ({r.worst.code})
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─── Section 3: 月度漲停趨勢 ────────────────────────── */
function MonthlyTrend() {
  const maxCount = Math.max(...MONTHLY_TREND.map((d) => d.count));

  return (
    <Card>
      <SectionTitle>月度漲停趨勢（2026 年 3 月）</SectionTitle>
      <div className="flex items-end gap-1.5 h-36">
        {MONTHLY_TREND.map((d) => {
          const heightPct = Math.round((d.count / maxCount) * 100);
          const isToday = d.date === "03/20";
          return (
            <div key={d.date} className="flex flex-col items-center gap-1 flex-1 group">
              <div className="text-[9px] text-txt-4 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                {d.count}
              </div>
              <div className="w-full flex items-end" style={{ height: "96px" }}>
                <div
                  className={`w-full rounded-t-sm transition-colors ${
                    isToday ? "bg-red" : "bg-red/30 group-hover:bg-red/50"
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <div className={`text-[9px] tabular-nums whitespace-nowrap ${isToday ? "text-red font-bold" : "text-txt-4"}`}>
                {d.date}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] text-txt-4 text-right">漲停家數（最高 {maxCount} 家）</div>
    </Card>
  );
}

/* ─── Section 4: 連板成功率 ──────────────────────────── */
function StreakSuccessTable() {
  return (
    <Card>
      <SectionTitle>連板成功率統計</SectionTitle>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-[10px] font-semibold text-txt-4 uppercase tracking-wider pb-2">類型</th>
            <th className="text-right text-[10px] font-semibold text-txt-4 uppercase tracking-wider pb-2">樣本數</th>
            <th className="text-right text-[10px] font-semibold text-txt-4 uppercase tracking-wider pb-2">成功數</th>
            <th className="text-right text-[10px] font-semibold text-txt-4 uppercase tracking-wider pb-2">成功率</th>
            <th className="text-left text-[10px] font-semibold text-txt-4 uppercase tracking-wider pb-2 pl-3">比率</th>
          </tr>
        </thead>
        <tbody>
          {STREAK_RATES.map((row) => (
            <tr key={row.label} className="border-b border-white/[0.03] last:border-b-0">
              <td className="py-2.5 text-txt-1 font-medium">{row.label}</td>
              <td className="py-2.5 text-right text-txt-3 tabular-nums">{row.total}</td>
              <td className="py-2.5 text-right text-txt-3 tabular-nums">{Math.round(row.total * row.success / 100)}</td>
              <td className="py-2.5 text-right font-bold tabular-nums">
                <span className={row.success >= 30 ? "text-red" : row.success >= 15 ? "text-amber" : "text-txt-2"}>
                  {row.success}%
                </span>
              </td>
              <td className="py-2.5 pl-3">
                <div className="w-24 h-1.5 bg-bg-3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red/60 rounded-full"
                    style={{ width: `${row.success}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-[10px] text-txt-4">
        * 成功定義：次日未跌停且漲幅 &gt; 0%
      </div>
    </Card>
  );
}

/* ─── Page ───────────────────────────────────────────── */
export default function StatsPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate="2026-03-20" />

      <main className="flex-1 overflow-y-auto p-5">
        {/* Demo banner */}
        <div className="mb-5 px-3 py-2 bg-amber-bg border border-amber/30 rounded-lg flex items-center gap-2 text-xs text-amber font-medium">
          <span>⚠</span>
          <span>示範資料 — 以下統計均為模擬數據，非實際歷史資料</span>
        </div>

        <h1 className="text-base font-bold text-txt-0 tracking-tight mb-5">統計分析</h1>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <GroupHeatChart />
          <NextDayStats />
          <MonthlyTrend />
          <StreakSuccessTable />
        </div>
      </main>
    </div>
  );
}
