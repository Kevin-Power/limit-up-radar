"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { formatPct, formatPrice, getTodayString } from "@/lib/utils";
import type { StatsData } from "@/app/api/stats/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ================================================================
   TYPES
   ================================================================ */

type Verdict = "bullish" | "neutral" | "bearish";

interface Report {
  date: string;
  marketChange: number;
  limitUpCount: number;
  verdict: Verdict;
  topGroup: string;
}

/* ================================================================
   MOCK DATA
   ================================================================ */

const VERDICT_LABELS: Record<Verdict, string> = {
  bullish: "偏多",
  neutral: "中性",
  bearish: "偏空",
};

const VERDICT_COLORS: Record<Verdict, string> = {
  bullish: "bg-red/15 text-red",
  neutral: "bg-amber/15 text-amber",
  bearish: "bg-green/15 text-green",
};

function buildReportsFromStats(stats: StatsData): Report[] {
  return stats.dailyTrend.map((d, i) => {
    const verdict: Verdict =
      d.taiexChangePct > 0.5 ? "bullish" : d.taiexChangePct < -0.5 ? "bearish" : "neutral";
    let topGroup = "—";
    let maxCnt = 0;
    for (const [gName, counts] of Object.entries(stats.heatmap)) {
      if ((counts[i] ?? 0) > maxCnt) {
        maxCnt = counts[i];
        topGroup = gName;
      }
    }
    return { date: d.fullDate, marketChange: d.taiexChangePct, limitUpCount: d.count, verdict, topGroup };
  }).reverse(); // newest first
}

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
   MAIN PAGE
   ================================================================ */

export default function ArchivePage() {
  const today = getTodayString();
  const { data: stats } = useSWR<StatsData & { dates: string[] }>("/api/stats", fetcher, { revalidateOnFocus: false });

  const ALL_REPORTS: Report[] = useMemo(() => {
    if (!stats || stats.dailyTrend.length === 0) return [];
    return buildReportsFromStats(stats);
  }, [stats]);

  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState(today);
  const [sortCol, setSortCol] = useState<"date" | "marketChange" | "limitUpCount">("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Comparison
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [showComparison, setShowComparison] = useState(false);

  // Set default comparison dates once data loads
  const effectiveA = compareA || ALL_REPORTS[0]?.date || today;
  const effectiveB = compareB || ALL_REPORTS[Math.min(4, ALL_REPORTS.length - 1)]?.date || today;

  const filteredReports = useMemo(() => {
    const arr = ALL_REPORTS.filter((r) => r.date >= startDate && r.date <= endDate);
    arr.sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (typeof va === "number" && typeof vb === "number") {
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [ALL_REPORTS, startDate, endDate, sortCol, sortAsc]);

  function handleSort(col: "date" | "marketChange" | "limitUpCount") {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  }

  const reportA = ALL_REPORTS.find((r) => r.date === effectiveA);
  const reportB = ALL_REPORTS.find((r) => r.date === effectiveB);

  // Quick stats
  const bullishStreak = (() => {
    let count = 0;
    for (const r of ALL_REPORTS) {
      if (r.verdict === "bullish") count++;
      else break;
    }
    return count;
  })();

  const avgLimitUp = ALL_REPORTS.length > 0
    ? Math.round(ALL_REPORTS.reduce((s, r) => s + r.limitUpCount, 0) / ALL_REPORTS.length)
    : 0;
  const maxLimitUpReport = ALL_REPORTS.length > 0
    ? ALL_REPORTS.reduce((max, r) => r.limitUpCount > max.limitUpCount ? r : max, ALL_REPORTS[0])
    : null;

  const SortIcon = ({ col }: { col: string }) => (
    <span className="text-[8px] text-txt-4 ml-0.5">
      {sortCol === col ? (sortAsc ? "▲" : "▼") : "▽"}
    </span>
  );

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1 animate-fade-in">
      <TopNav currentDate={today} />
      <NavBar />

      <main className="max-w-6xl mx-auto px-4 pt-20 pb-16 space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-0 tracking-tight">報告存檔</h1>
          <p className="text-xs text-txt-3 mt-1">歷史盤後報告查詢與比較</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-1">連續偏多天數</div>
            <div className="text-xl font-bold text-red tracking-tight tabular-nums">{bullishStreak} 天</div>
          </Card>
          <Card>
            <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-1">本月平均漲停數</div>
            <div className="text-xl font-bold text-txt-0 tracking-tight tabular-nums">{avgLimitUp} 檔</div>
          </Card>
          <Card>
            <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-1">最多漲停日</div>
            <div className="text-xl font-bold text-txt-0 tracking-tight">
              {maxLimitUpReport ? maxLimitUpReport.date.slice(5).replace("-", "/") : "—"}
              {maxLimitUpReport && <span className="text-sm text-txt-3 ml-1">({maxLimitUpReport.limitUpCount}檔)</span>}
            </div>
          </Card>
        </div>

        {/* Date Range Filter */}
        <Card>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-[10px] text-txt-4 block mb-1">起始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-bg-2 border border-border rounded px-3 py-1.5 text-xs text-txt-1"
              />
            </div>
            <div>
              <label className="text-[10px] text-txt-4 block mb-1">結束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-bg-2 border border-border rounded px-3 py-1.5 text-xs text-txt-1"
              />
            </div>
            <button className="px-4 py-1.5 bg-red text-white text-xs font-medium rounded-md hover:bg-red/90 transition-colors">
              查詢
            </button>
          </div>
        </Card>

        {/* Report List */}
        <Card className="overflow-x-auto !p-0">
          <div className="p-5 pb-0">
            <SectionTitle>報告列表</SectionTitle>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <th
                  onClick={() => handleSort("date")}
                  className="px-5 py-3 text-left font-medium text-txt-3 cursor-pointer hover:text-txt-1 select-none"
                >
                  日期 <SortIcon col="date" />
                </th>
                <th
                  onClick={() => handleSort("marketChange")}
                  className="px-3 py-3 text-right font-medium text-txt-3 cursor-pointer hover:text-txt-1 select-none"
                >
                  大盤走勢 <SortIcon col="marketChange" />
                </th>
                <th
                  onClick={() => handleSort("limitUpCount")}
                  className="px-3 py-3 text-right font-medium text-txt-3 cursor-pointer hover:text-txt-1 select-none"
                >
                  漲停家數 <SortIcon col="limitUpCount" />
                </th>
                <th className="px-3 py-3 text-center font-medium text-txt-3">盤勢結論</th>
                <th className="px-3 py-3 text-left font-medium text-txt-3">最強族群</th>
                <th className="px-3 py-3 text-center font-medium text-txt-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((r) => (
                <tr key={r.date} className="border-b border-border/50 transition-colors row-hover">
                  <td className="px-5 py-2.5 font-mono text-txt-1 tabular-nums">{r.date}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${r.marketChange >= 0 ? "text-red" : "text-green"}`}>
                    {r.marketChange >= 0 ? "+" : ""}{r.marketChange.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-txt-1 tabular-nums">{r.limitUpCount}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${VERDICT_COLORS[r.verdict]}`}>
                      {VERDICT_LABELS[r.verdict]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-txt-2">{r.topGroup}</td>
                  <td className="px-3 py-2.5 text-center">
                    <Link href="/" className="text-accent hover:underline text-[10px]">查看</Link>
                  </td>
                </tr>
              ))}
              {filteredReports.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-txt-4">無符合條件的報告</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {/* Report Comparison */}
        <Card>
          <SectionTitle>報告比較</SectionTitle>
          <div className="flex flex-wrap items-end gap-4 mb-5">
            <div>
              <label className="text-[10px] text-txt-4 block mb-1">報告 A</label>
              <select
                value={effectiveA}
                onChange={(e) => setCompareA(e.target.value)}
                className="bg-bg-2 border border-border rounded px-3 py-1.5 text-xs text-txt-1"
              >
                {ALL_REPORTS.map((r) => (
                  <option key={r.date} value={r.date}>{r.date}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-txt-4 block mb-1">報告 B</label>
              <select
                value={effectiveB}
                onChange={(e) => setCompareB(e.target.value)}
                className="bg-bg-2 border border-border rounded px-3 py-1.5 text-xs text-txt-1"
              >
                {ALL_REPORTS.map((r) => (
                  <option key={r.date} value={r.date}>{r.date}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowComparison(true)}
              className="px-4 py-1.5 bg-red text-white text-xs font-medium rounded-md hover:bg-red/90 transition-colors"
            >
              比較
            </button>
          </div>

          {showComparison && reportA && reportB && (() => {
            // Build groups for each day from heatmap
            const idxA = ALL_REPORTS.indexOf(reportA);
            const idxB = ALL_REPORTS.indexOf(reportB);
            // ALL_REPORTS is reversed, heatmap is oldest-first; map back
            const totalDays = stats?.dailyTrend.length ?? 0;
            const heatmapIdxA = totalDays - 1 - idxA;
            const heatmapIdxB = totalDays - 1 - idxB;
            const groupsA = Object.entries(stats?.heatmap ?? {}).filter(([, c]) => (c[heatmapIdxA] ?? 0) > 0).map(([g]) => g);
            const groupsB = Object.entries(stats?.heatmap ?? {}).filter(([, c]) => (c[heatmapIdxB] ?? 0) > 0).map(([g]) => g);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-bg-2 rounded-lg p-4 border border-border">
                    <div className="text-[10px] text-txt-4 mb-2">報告 A - {reportA.date}</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-txt-3">大盤</span><span className={reportA.marketChange >= 0 ? "text-red" : "text-green"}>{reportA.marketChange >= 0 ? "+" : ""}{reportA.marketChange.toFixed(2)}%</span></div>
                      <div className="flex justify-between"><span className="text-txt-3">漲停數</span><span className="text-txt-1 font-mono">{reportA.limitUpCount}</span></div>
                      <div className="flex justify-between"><span className="text-txt-3">結論</span><span className={`px-1.5 py-0.5 text-[9px] rounded ${VERDICT_COLORS[reportA.verdict]}`}>{VERDICT_LABELS[reportA.verdict]}</span></div>
                      <div className="flex justify-between"><span className="text-txt-3">最強族群</span><span className="text-txt-1">{reportA.topGroup}</span></div>
                    </div>
                  </div>
                  <div className="bg-bg-2 rounded-lg p-4 border border-border">
                    <div className="text-[10px] text-txt-4 mb-2">報告 B - {reportB.date}</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-txt-3">大盤</span><span className={reportB.marketChange >= 0 ? "text-red" : "text-green"}>{reportB.marketChange >= 0 ? "+" : ""}{reportB.marketChange.toFixed(2)}%</span></div>
                      <div className="flex justify-between"><span className="text-txt-3">漲停數</span><span className="text-txt-1 font-mono">{reportB.limitUpCount}</span></div>
                      <div className="flex justify-between"><span className="text-txt-3">結論</span><span className={`px-1.5 py-0.5 text-[9px] rounded ${VERDICT_COLORS[reportB.verdict]}`}>{VERDICT_LABELS[reportB.verdict]}</span></div>
                      <div className="flex justify-between"><span className="text-txt-3">最強族群</span><span className="text-txt-1">{reportB.topGroup}</span></div>
                    </div>
                  </div>
                </div>
                <div className="bg-bg-2 rounded-lg p-4 border border-border">
                  <div className="text-[10px] text-txt-4 mb-3">族群變化</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="text-[10px] text-txt-4 mb-1.5">A 有 / B 無 (新出現)</div>
                      <div className="flex flex-wrap gap-1">
                        {groupsA.filter((g) => !groupsB.includes(g)).map((g) => (
                          <span key={g} className="px-2 py-0.5 bg-red/10 text-red rounded text-[10px]">{g}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-txt-4 mb-1.5">B 有 / A 無 (已消失)</div>
                      <div className="flex flex-wrap gap-1">
                        {groupsB.filter((g) => !groupsA.includes(g)).map((g) => (
                          <span key={g} className="px-2 py-0.5 bg-green/10 text-green rounded text-[10px]">{g}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-[10px] text-txt-4 mb-1.5">共同族群</div>
                    <div className="flex flex-wrap gap-1">
                      {groupsA.filter((g) => groupsB.includes(g)).map((g) => (
                        <span key={g} className="px-2 py-0.5 bg-bg-3 text-txt-2 rounded text-[10px]">{g}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
