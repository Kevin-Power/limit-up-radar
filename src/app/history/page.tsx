"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { formatDateDisplay, getTodayString } from "@/lib/utils";
import type { StatsData } from "@/app/api/stats/route";

interface DayRecord {
  date: string;
  count: number;
  topGroup: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function getColor(count: number): string {
  if (count === 0) return "bg-bg-3";
  if (count < 10) return "bg-blue/20";
  if (count < 20) return "bg-blue/40";
  if (count < 30) return "bg-amber/40";
  if (count < 45) return "bg-red/50";
  return "bg-red";
}

function getTileTitle(count: number): string {
  if (count === 0) return "無漲停";
  if (count < 10) return "偏少";
  if (count < 20) return "一般";
  if (count < 30) return "偏多";
  if (count < 45) return "強勢";
  return "極強";
}

function buildWeekGrid(records: DayRecord[]): (DayRecord | null)[][] {
  if (records.length === 0) return [];

  const byDate = new Map(records.map((r) => [r.date, r]));

  // Find Monday of the week containing the first record
  const firstDate = new Date(records[0].date);
  const dow = firstDate.getDay(); // 0=Sun
  // Shift so week starts on Monday (Mon=0..Sun=6)
  const mondayOffset = dow === 0 ? -6 : -(dow - 1);
  const weekStart = new Date(firstDate);
  weekStart.setDate(weekStart.getDate() + mondayOffset);

  const lastDate = new Date(records[records.length - 1].date);
  // Find Sunday of the last week
  const lastDow = lastDate.getDay();
  const sundayOffset = lastDow === 0 ? 0 : 7 - lastDow;
  const weekEnd = new Date(lastDate);
  weekEnd.setDate(weekEnd.getDate() + sundayOffset);

  const weeks: (DayRecord | null)[][] = [];
  const cursor = new Date(weekStart);

  while (cursor <= weekEnd) {
    const week: (DayRecord | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cursor.toISOString().split("T")[0];
      week.push(byDate.get(dateStr) ?? null);
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function getMonthLabels(weeks: (DayRecord | null)[][]): { label: string; col: number }[] {
  const labels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, col) => {
    const firstReal = week.find((d) => d !== null);
    if (!firstReal) return;
    const month = new Date(firstReal.date).getMonth();
    if (month !== lastMonth) {
      labels.push({
        label: `${new Date(firstReal.date).getMonth() + 1}月`,
        col,
      });
      lastMonth = month;
    }
  });
  return labels;
}

export default function HistoryPage() {
  const [selected, setSelected] = useState<DayRecord | null>(null);
  const { data: stats } = useSWR<StatsData & { dates: string[] }>("/api/stats", fetcher, { revalidateOnFocus: false });

  // Build real DayRecord[] from stats data
  const HISTORY: DayRecord[] = useMemo(() => {
    if (!stats || stats.dailyTrend.length === 0) return [];
    return stats.dailyTrend.map((d, i) => {
      // Find top group for this day from heatmap
      let topGroup = "—";
      let maxCount = 0;
      for (const [groupName, counts] of Object.entries(stats.heatmap)) {
        if ((counts[i] ?? 0) > maxCount) {
          maxCount = counts[i];
          topGroup = groupName;
        }
      }
      return { date: d.fullDate, count: d.count, topGroup };
    });
  }, [stats]);

  const weeks = useMemo(() => buildWeekGrid(HISTORY), [HISTORY]);
  const monthLabels = useMemo(() => getMonthLabels(weeks), [weeks]);

  // For the trend sparkline
  const maxCount = Math.max(...HISTORY.map((r) => r.count), 1);
  const sparklineH = 60;
  const sparklineW = 560;
  const points = HISTORY.map((r, i) => {
    const x = HISTORY.length > 1 ? (i / (HISTORY.length - 1)) * sparklineW : 0;
    const y = sparklineH - (r.count / maxCount) * sparklineH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  // Stats for the selected day or overall
  const avgCount =
    HISTORY.length > 0
      ? HISTORY.reduce((s, r) => s + r.count, 0) / HISTORY.length
      : 0;
  const peakDay = HISTORY.length > 0
    ? HISTORY.reduce((best, r) => (r.count > best.count ? r : best), HISTORY[0])
    : null;
  const tradingDays = HISTORY.length;
  const isReal = HISTORY.length > 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate={getTodayString()} />
      <NavBar />

      <main className="flex-1 overflow-y-auto p-4 md:p-5 animate-fade-in">
        {/* Page title */}
        <div className="mb-5">
          <h1 className="text-base font-semibold text-txt-0 tracking-tight">
            歷史數據
          </h1>
          <p className="mt-0.5 text-[11px] text-txt-4">
            {isReal ? `近 ${tradingDays} 個交易日漲停分布熱力圖` : "載入中..."}
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="bg-bg-2 border border-border rounded-md px-4 py-3">
            <div className="text-[10px] text-txt-4 font-medium tracking-wide uppercase mb-1">
              交易日數
            </div>
            <div className="text-xl font-bold text-txt-0 tabular-nums">
              {tradingDays}
            </div>
            <div className="text-[10px] text-txt-4 mt-0.5">近 90 天</div>
          </div>
          <div className="bg-bg-2 border border-border rounded-md px-4 py-3">
            <div className="text-[10px] text-txt-4 font-medium tracking-wide uppercase mb-1">
              日均漲停
            </div>
            <div className="text-xl font-bold text-amber tabular-nums">
              {avgCount.toFixed(1)}
            </div>
            <div className="text-[10px] text-txt-4 mt-0.5">檔 / 日</div>
          </div>
          <div className="bg-bg-2 border border-border rounded-md px-4 py-3">
            <div className="text-[10px] text-txt-4 font-medium tracking-wide uppercase mb-1">
              最強單日
            </div>
            <div className="text-xl font-bold text-red tabular-nums">
              {peakDay?.count ?? "—"}
            </div>
            <div className="text-[10px] text-txt-4 mt-0.5">
              {peakDay ? formatDateDisplay(peakDay.date) : "—"}
            </div>
          </div>
        </div>

        {/* Calendar heatmap */}
        <div className="bg-bg-2 border border-border rounded-md p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-medium text-txt-2">
              漲停熱力圖
            </span>
            {/* Legend */}
            <div className="flex items-center gap-1.5 text-[10px] text-txt-4">
              <span>少</span>
              {["bg-bg-3", "bg-blue/20", "bg-blue/40", "bg-amber/40", "bg-red/50", "bg-red"].map(
                (cls) => (
                  <span
                    key={cls}
                    className={`inline-block w-3 h-3 rounded-sm ${cls} border border-border`}
                  />
                )
              )}
              <span>多</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="inline-block min-w-max">
              {/* Month labels */}
              <div className="flex mb-1 pl-6">
                {weeks.map((_, col) => {
                  const label = monthLabels.find((m) => m.col === col);
                  return (
                    <div
                      key={col}
                      className="w-4 mr-0.5 text-[9px] text-txt-4 text-center"
                    >
                      {label ? label.label : ""}
                    </div>
                  );
                })}
              </div>

              {/* Grid rows: Mon-Sun */}
              {WEEKDAY_LABELS.map((dayLabel, rowIdx) => (
                <div key={rowIdx} className="flex items-center mb-0.5">
                  <span className="w-5 text-[9px] text-txt-4 text-right pr-1 shrink-0">
                    {rowIdx % 2 === 0 ? dayLabel : ""}
                  </span>
                  {weeks.map((week, col) => {
                    const cell = week[rowIdx];
                    if (!cell) {
                      return (
                        <div
                          key={col}
                          className="w-4 h-4 mr-0.5 rounded-sm bg-transparent"
                        />
                      );
                    }
                    const isSelected = selected?.date === cell.date;
                    return (
                      <button
                        key={col}
                        title={`${formatDateDisplay(cell.date)} — ${cell.count} 檔漲停 (${getTileTitle(cell.count)})`}
                        onClick={() =>
                          setSelected(isSelected ? null : cell)
                        }
                        className={`w-4 h-4 mr-0.5 rounded-sm transition-all cursor-pointer ${getColor(
                          cell.count
                        )} ${
                          isSelected
                            ? "ring-1 ring-txt-0 ring-offset-1 ring-offset-bg-2"
                            : "hover:opacity-80 hover:ring-1 hover:ring-border-hover"
                        }`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Selected day detail */}
        {selected && (
          <div className="mb-5 bg-bg-2 border border-border rounded-md px-5 py-4 animate-in">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-semibold text-txt-0">
                  {formatDateDisplay(selected.date)}
                </span>
                <span className="ml-3 text-[10px] text-txt-4">
                  當日詳情
                </span>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-txt-4 hover:text-txt-2 text-xs px-2 py-0.5 rounded border border-border hover:border-border-hover transition-colors"
              >
                關閉
              </button>
            </div>
            <div className="flex flex-wrap gap-4 md:gap-6">
              <div>
                <div className="text-[10px] text-txt-4 mb-1">漲停家數</div>
                <div
                  className={`text-2xl font-bold tabular-nums ${
                    selected.count >= 45
                      ? "text-red"
                      : selected.count >= 30
                      ? "text-red/80"
                      : selected.count >= 20
                      ? "text-amber"
                      : selected.count >= 10
                      ? "text-blue"
                      : "text-txt-3"
                  }`}
                >
                  {selected.count}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-txt-4 mb-1">強度評級</div>
                <div className="text-sm font-semibold text-txt-1 mt-1.5">
                  {getTileTitle(selected.count)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-txt-4 mb-1">主要族群</div>
                <div className="text-sm font-semibold text-txt-1 mt-1.5">
                  {selected.topGroup}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trend sparkline */}
        <div className="bg-bg-2 border border-border rounded-md p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-medium text-txt-2">
              每日漲停家數走勢
            </span>
            <span className="text-[10px] text-txt-4">{isReal ? `近 ${tradingDays} 個交易日 (真實資料)` : "載入中..."}</span>
          </div>

          {/* Y-axis labels + chart */}
          <div className="flex gap-2">
            <div className="flex flex-col justify-between text-[9px] text-txt-4 tabular-nums py-0.5 shrink-0 w-5 text-right">
              <span>{maxCount}</span>
              <span>{Math.round(maxCount / 2)}</span>
              <span>0</span>
            </div>
            <div className="flex-1 relative">
              <svg
                viewBox={`0 0 ${sparklineW} ${sparklineH}`}
                className="w-full"
                style={{ height: sparklineH }}
                preserveAspectRatio="none"
              >
                {/* Grid lines */}
                <line
                  x1="0"
                  y1="0"
                  x2={sparklineW}
                  y2="0"
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="1"
                />
                <line
                  x1="0"
                  y1={sparklineH / 2}
                  x2={sparklineW}
                  y2={sparklineH / 2}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="1"
                />
                <line
                  x1="0"
                  y1={sparklineH}
                  x2={sparklineW}
                  y2={sparklineH}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth="1"
                />
                {/* Filled area */}
                <polyline
                  points={`0,${sparklineH} ${points} ${sparklineW},${sparklineH}`}
                  fill="rgba(239,68,68,0.08)"
                  stroke="none"
                />
                {/* Line */}
                <polyline
                  points={points}
                  fill="none"
                  stroke="var(--red)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <Footer />
        </div>
      </main>
    </div>
  );
}
