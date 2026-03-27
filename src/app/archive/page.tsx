"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { formatPct, formatPrice, getTodayString } from "@/lib/utils";

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

const MOCK_REPORTS: Report[] = [
  { date: "2026-03-26", marketChange: 1.25,  limitUpCount: 54, verdict: "bullish", topGroup: "AI 伺服器 / 散熱" },
  { date: "2026-03-25", marketChange: 0.83,  limitUpCount: 48, verdict: "bullish", topGroup: "半導體設備" },
  { date: "2026-03-24", marketChange: -0.42, limitUpCount: 36, verdict: "neutral", topGroup: "光通訊" },
  { date: "2026-03-23", marketChange: 0.67,  limitUpCount: 29, verdict: "neutral", topGroup: "PCB / CCL" },
  { date: "2026-03-22", marketChange: 1.58,  limitUpCount: 41, verdict: "bullish", topGroup: "AI 伺服器 / 散熱" },
  { date: "2026-03-19", marketChange: 0.35,  limitUpCount: 33, verdict: "neutral", topGroup: "IC 設計" },
  { date: "2026-03-18", marketChange: -0.78, limitUpCount: 25, verdict: "bearish", topGroup: "鋼鐵 / 原物料" },
  { date: "2026-03-17", marketChange: -1.12, limitUpCount: 19, verdict: "bearish", topGroup: "生技" },
  { date: "2026-03-16", marketChange: 0.95,  limitUpCount: 38, verdict: "bullish", topGroup: "半導體設備" },
  { date: "2026-03-15", marketChange: 1.82,  limitUpCount: 44, verdict: "bullish", topGroup: "AI 伺服器 / 散熱" },
  { date: "2026-03-12", marketChange: 0.21,  limitUpCount: 27, verdict: "neutral", topGroup: "電動車" },
  { date: "2026-03-11", marketChange: -1.55, limitUpCount: 12, verdict: "bearish", topGroup: "航運" },
  { date: "2026-03-10", marketChange: 0.72,  limitUpCount: 31, verdict: "neutral", topGroup: "光通訊" },
  { date: "2026-03-09", marketChange: 0.48,  limitUpCount: 23, verdict: "neutral", topGroup: "金融" },
  { date: "2026-03-08", marketChange: -0.33, limitUpCount: 18, verdict: "bearish", topGroup: "PCB / CCL" },
];

const COMPARISON_GROUPS_A = ["AI 伺服器 / 散熱", "半導體設備", "光通訊", "IC 設計", "電動車"];
const COMPARISON_GROUPS_B = ["AI 伺服器 / 散熱", "半導體設備", "PCB / CCL", "鋼鐵 / 原物料", "生技"];

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
  const [startDate, setStartDate] = useState("2026-03-01");
  const [endDate, setEndDate] = useState(today);
  const [sortCol, setSortCol] = useState<"date" | "marketChange" | "limitUpCount">("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Comparison
  const [compareA, setCompareA] = useState(MOCK_REPORTS[0]?.date ?? today);
  const [compareB, setCompareB] = useState(MOCK_REPORTS[4]?.date ?? today);
  const [showComparison, setShowComparison] = useState(false);

  const filteredReports = useMemo(() => {
    const arr = MOCK_REPORTS.filter((r) => r.date >= startDate && r.date <= endDate);
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
  }, [startDate, endDate, sortCol, sortAsc]);

  function handleSort(col: "date" | "marketChange" | "limitUpCount") {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  }

  const reportA = MOCK_REPORTS.find((r) => r.date === compareA);
  const reportB = MOCK_REPORTS.find((r) => r.date === compareB);

  // Quick stats
  const bullishStreak = (() => {
    let count = 0;
    for (const r of MOCK_REPORTS) {
      if (r.verdict === "bullish") count++;
      else break;
    }
    return count;
  })();

  const avgLimitUp = Math.round(MOCK_REPORTS.reduce((s, r) => s + r.limitUpCount, 0) / MOCK_REPORTS.length);
  const maxLimitUpReport = MOCK_REPORTS.reduce((max, r) => r.limitUpCount > max.limitUpCount ? r : max, MOCK_REPORTS[0]);

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
              {maxLimitUpReport.date.slice(5).replace("-", "/")}
              <span className="text-sm text-txt-3 ml-1">({maxLimitUpReport.limitUpCount}檔)</span>
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
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
                className="bg-bg-2 border border-border rounded px-3 py-1.5 text-xs text-txt-1"
              >
                {MOCK_REPORTS.map((r) => (
                  <option key={r.date} value={r.date}>{r.date}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-txt-4 block mb-1">報告 B</label>
              <select
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
                className="bg-bg-2 border border-border rounded px-3 py-1.5 text-xs text-txt-1"
              >
                {MOCK_REPORTS.map((r) => (
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

          {showComparison && reportA && reportB && (
            <div className="space-y-4">
              {/* Side by side cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Report A */}
                <div className="bg-bg-2 rounded-lg p-4 border border-border">
                  <div className="text-[10px] text-txt-4 mb-2">報告 A - {reportA.date}</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-txt-3">大盤</span>
                      <span className={reportA.marketChange >= 0 ? "text-red" : "text-green"}>
                        {reportA.marketChange >= 0 ? "+" : ""}{reportA.marketChange.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-txt-3">漲停數</span>
                      <span className="text-txt-1 font-mono">{reportA.limitUpCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-txt-3">結論</span>
                      <span className={`px-1.5 py-0.5 text-[9px] rounded ${VERDICT_COLORS[reportA.verdict]}`}>
                        {VERDICT_LABELS[reportA.verdict]}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-txt-3">最強族群</span>
                      <span className="text-txt-1">{reportA.topGroup}</span>
                    </div>
                  </div>
                </div>

                {/* Report B */}
                <div className="bg-bg-2 rounded-lg p-4 border border-border">
                  <div className="text-[10px] text-txt-4 mb-2">報告 B - {reportB.date}</div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-txt-3">大盤</span>
                      <span className={reportB.marketChange >= 0 ? "text-red" : "text-green"}>
                        {reportB.marketChange >= 0 ? "+" : ""}{reportB.marketChange.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-txt-3">漲停數</span>
                      <span className="text-txt-1 font-mono">{reportB.limitUpCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-txt-3">結論</span>
                      <span className={`px-1.5 py-0.5 text-[9px] rounded ${VERDICT_COLORS[reportB.verdict]}`}>
                        {VERDICT_LABELS[reportB.verdict]}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-txt-3">最強族群</span>
                      <span className="text-txt-1">{reportB.topGroup}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group changes */}
              <div className="bg-bg-2 rounded-lg p-4 border border-border">
                <div className="text-[10px] text-txt-4 mb-3">族群變化</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <div className="text-[10px] text-txt-4 mb-1.5">A 有 / B 無 (新出現)</div>
                    <div className="flex flex-wrap gap-1">
                      {COMPARISON_GROUPS_A.filter((g) => !COMPARISON_GROUPS_B.includes(g)).map((g) => (
                        <span key={g} className="px-2 py-0.5 bg-red/10 text-red rounded text-[10px]">{g}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-txt-4 mb-1.5">B 有 / A 無 (已消失)</div>
                    <div className="flex flex-wrap gap-1">
                      {COMPARISON_GROUPS_B.filter((g) => !COMPARISON_GROUPS_A.includes(g)).map((g) => (
                        <span key={g} className="px-2 py-0.5 bg-green/10 text-green rounded text-[10px]">{g}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-[10px] text-txt-4 mb-1.5">共同族群</div>
                  <div className="flex flex-wrap gap-1">
                    {COMPARISON_GROUPS_A.filter((g) => COMPARISON_GROUPS_B.includes(g)).map((g) => (
                      <span key={g} className="px-2 py-0.5 bg-bg-3 text-txt-2 rounded text-[10px]">{g}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}
