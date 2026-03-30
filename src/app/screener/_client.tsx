"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPct, formatPrice, getTodayString } from "@/lib/utils";
import { DailyData, StockGroup } from "@/lib/types";

/* ================================================================
   TYPES
   ================================================================ */

interface Stock {
  code: string;
  name: string;
  close: number;
  change: number;
  volume: number;
  pe: number;
  pb: number;
  foreignNet: number;
  streak: number;
  group: string;
}

/* ================================================================
   SUB-COMPONENTS
   ================================================================ */

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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ScreenerPage() {
  const { data: dailyData } = useSWR<DailyData>("/api/daily/latest", fetcher);
  const { data: peData } = useSWR<Record<string, { pe: number; pb: number }>>("/api/pe", fetcher);

  const ACTIVE_STOCKS: Stock[] = useMemo(() => {
    if (!dailyData?.groups) return [];
    return dailyData.groups.flatMap((g: StockGroup) =>
      g.stocks.map((s) => ({
        code: s.code,
        name: s.name,
        close: s.close,
        change: s.change_pct,
        volume: s.volume,
        pe: peData?.[s.code]?.pe ?? 0,
        pb: peData?.[s.code]?.pb ?? 0,
        foreignNet: s.major_net,
        streak: s.streak,
        group: g.name,
      }))
    );
  }, [dailyData, peData]);

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sortCol, setSortCol] = useState<keyof Stock>("change");
  const [sortAsc, setSortAsc] = useState(false);

  // Filters
  const [groupFilter, setGroupFilter] = useState("");
  const [streakMinFilter, setStreakMinFilter] = useState("");
  const [volumeMinFilter, setVolumeMinFilter] = useState("");

  const groups = useMemo(() => {
    const set = new Set(ACTIVE_STOCKS.map((s) => s.group));
    return Array.from(set).sort();
  }, [ACTIVE_STOCKS]);

  const filtered = useMemo(() => {
    let list = ACTIVE_STOCKS;
    if (groupFilter) list = list.filter((s) => s.group === groupFilter);
    if (streakMinFilter) {
      const min = parseInt(streakMinFilter);
      if (!isNaN(min)) list = list.filter((s) => s.streak >= min);
    }
    if (volumeMinFilter) {
      const min = parseInt(volumeMinFilter) * 10000; // 萬張 → 張
      if (!isNaN(min)) list = list.filter((s) => s.volume >= min);
    }
    return list;
  }, [ACTIVE_STOCKS, groupFilter, streakMinFilter, volumeMinFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
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
  }, [filtered, sortCol, sortAsc]);

  function handleSort(col: keyof Stock) {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  }

  const SortIcon = ({ col }: { col: keyof Stock }) => (
    <span className="text-[8px] text-txt-4 ml-0.5">
      {sortCol === col ? (sortAsc ? "\u25B2" : "\u25BC") : "\u25BD"}
    </span>
  );

  const columns: { key: keyof Stock; label: string; align?: string }[] = [
    { key: "code",       label: "代號" },
    { key: "name",       label: "名稱" },
    { key: "close",      label: "收盤價",        align: "right" },
    { key: "change",     label: "漲跌幅",        align: "right" },
    { key: "volume",     label: "成交量(張)",     align: "right" },
    { key: "pe",         label: "本益比",        align: "right" },
    { key: "pb",         label: "股價淨值比",     align: "right" },
    { key: "foreignNet", label: "外資淨買(張)",   align: "right" },
    { key: "streak",     label: "連板",          align: "right" },
    { key: "group",      label: "族群" },
  ];

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1 animate-fade-in">
      <TopNav currentDate={getTodayString()} />
      <NavBar />

      <main className="max-w-7xl mx-auto px-4 pt-20 pb-16 space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-0 tracking-tight">進階選股</h1>
          <p className="text-xs text-txt-3 mt-1">多條件篩選漲停股</p>
        </div>

        {/* Filter Panel */}
        <Card>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="w-full flex items-center justify-between text-sm font-semibold text-txt-0 mb-3"
          >
            <span>篩選條件</span>
            <span className="text-txt-4 text-xs">{filtersOpen ? "收起 \u25B2" : "展開 \u25BC"}</span>
          </button>

          {filtersOpen && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="bg-bg-2 border border-border rounded px-2 py-1.5 text-xs text-txt-1"
                >
                  <option value="">所有族群</option>
                  {groups.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="連板 \u2265"
                  value={streakMinFilter}
                  onChange={(e) => setStreakMinFilter(e.target.value)}
                  className="w-24 bg-bg-2 border border-border rounded px-2 py-1.5 text-xs text-txt-1"
                />
                <input
                  type="number"
                  placeholder="成交量(萬張) \u2265"
                  value={volumeMinFilter}
                  onChange={(e) => setVolumeMinFilter(e.target.value)}
                  className="w-32 bg-bg-2 border border-border rounded px-2 py-1.5 text-xs text-txt-1"
                />
                <button
                  onClick={() => { setGroupFilter(""); setStreakMinFilter(""); setVolumeMinFilter(""); }}
                  className="px-3 py-1.5 bg-bg-2 text-txt-2 text-xs font-medium rounded-md hover:bg-bg-3 transition-colors"
                >
                  重置
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Loading skeleton */}
        {!dailyData && (
          <div className="space-y-2 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-bg-2 rounded" />
            ))}
          </div>
        )}

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-txt-3">
            共 <span className="text-txt-0 font-semibold">{sorted.length}</span> 檔符合條件
          </p>
          <button
            onClick={() => {
              const BOM = "\ufeff";
              const header = ["代號", "名稱", "收盤價", "漲跌幅%", "成交量(張)", "本益比", "股價淨值比", "外資淨買(張)", "連板", "族群"];
              const rows: string[] = [header.join(",")];
              for (const s of sorted) {
                rows.push([s.code, s.name, s.close, s.change, s.volume, s.pe, s.pb, s.foreignNet, s.streak, s.group].join(","));
              }
              const csv = BOM + rows.join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `選股結果_${new Date().toISOString().slice(0, 10)}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="px-3 py-1 bg-bg-2 text-txt-3 text-[10px] rounded-md hover:bg-bg-3 hover:text-txt-1 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            CSV 匯出
          </button>
        </div>

        {/* Results Table */}
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-3 font-medium text-txt-3 cursor-pointer hover:text-txt-1 whitespace-nowrap select-none ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.label}
                    <SortIcon col={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.code} className="border-b border-border/50 hover:bg-bg-2/50 transition-colors row-hover">
                  <td className="px-3 py-2.5">
                    <Link href={`/stock/${s.code}`} className="text-accent hover:underline font-mono">
                      {s.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-txt-1 font-medium">{s.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-txt-1 tabular-nums">{formatPrice(s.close)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${s.change >= 0 ? "text-red" : "text-green"}`}>
                    {formatPct(s.change)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-txt-2 tabular-nums">
                    {s.volume.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-txt-2 tabular-nums">
                    {s.pe ? s.pe.toFixed(1) : "\u2014"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-txt-2 tabular-nums">
                    {s.pb ? s.pb.toFixed(2) : "\u2014"}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${s.foreignNet >= 0 ? "text-red" : "text-green"}`}>
                    {s.foreignNet >= 0 ? "+" : ""}{s.foreignNet.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-txt-2 tabular-nums">
                    {s.streak > 0 ? s.streak : "\u2014"}
                  </td>
                  <td className="px-3 py-2.5 text-txt-3 whitespace-nowrap text-xs">
                    {s.group}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}
