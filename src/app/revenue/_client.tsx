"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPct } from "@/lib/utils";

interface RevStock {
  code: string;
  name: string;
  revMonth: number | null;
  revYoY: number | null;
  revYoY3yr: number | null;
  revMoM: number | null;
  revCum: number | null;
  revCumYoY: number | null;
  price: number | null;
  volume: number | null;
  chg1d: number | null;
  chg5d: number | null;
  chg20d: number | null;
  industry: string;
}

interface RevIndustry {
  name: string;
  count: number;
  revMonth: number | null;
  revYoY: number | null;
  revCum: number | null;
  revCumYoY: number | null;
  chg1d: number | null;
  chg5d: number | null;
  chg20d: number | null;
}

interface RevData {
  period: string;
  dataDate: string;
  totalStocks: number;
  industries: RevIndustry[];
  stocks: RevStock[];
}

type SortKey = "revMonth" | "revYoY" | "revMoM" | "revCum" | "revCumYoY" | "price" | "chg1d" | "chg5d" | "chg20d";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function fmt(v: number | null): string {
  if (v == null) return "-";
  return v >= 1000 ? v.toLocaleString("zh-TW") : String(v);
}

function pctCell(v: number | null) {
  if (v == null) return <span className="text-txt-4">-</span>;
  const color = v > 0 ? "text-red" : v < 0 ? "text-green" : "text-txt-3";
  return <span className={color}>{v > 0 ? "+" : ""}{v.toFixed(2)}%</span>;
}

function YoYBadge({ v }: { v: number | null }) {
  if (v == null) return null;
  if (v >= 100) return <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-red/20 text-red">爆發</span>;
  if (v >= 50) return <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber/20 text-amber">高成長</span>;
  if (v >= 20) return <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue/20 text-blue">穩成長</span>;
  return null;
}

export default function RevenueClient() {
  const { data, isLoading } = useSWR<RevData>("/api/revenue", fetcher);
  const { data: dailyData } = useSWR("/api/daily/latest", fetcher);

  const [tab, setTab] = useState<"stocks" | "industries">("stocks");
  const [sortKey, setSortKey] = useState<SortKey>("revYoY");
  const [sortAsc, setSortAsc] = useState(false);
  const [industryFilter, setIndustryFilter] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [yoyMin, setYoyMin] = useState<"" | "0" | "20" | "50" | "100">("");

  // Limit-up stock codes for cross-reference
  const limitUpCodes = useMemo(() => {
    if (!dailyData?.groups) return new Set<string>();
    const codes = new Set<string>();
    for (const g of dailyData.groups) {
      for (const s of g.stocks) codes.add(s.code);
    }
    return codes;
  }, [dailyData]);

  const industries = useMemo(() => {
    if (!data?.stocks) return [];
    const set = new Set(data.stocks.map((s) => s.industry).filter(Boolean));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.stocks) return [];
    let list = data.stocks;
    if (industryFilter) list = list.filter((s) => s.industry === industryFilter);
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter((s) => s.code.includes(q) || s.name.toLowerCase().includes(q));
    }
    if (yoyMin) {
      const min = Number(yoyMin);
      list = list.filter((s) => s.revYoY != null && s.revYoY >= min);
    }
    list = [...list].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [data, industryFilter, searchQ, yoyMin, sortKey, sortAsc]);

  const indFiltered = useMemo(() => {
    if (!data?.industries) return [];
    return [...data.industries].sort((a, b) => {
      const av = a[sortKey as keyof RevIndustry] ?? -Infinity;
      const bv = b[sortKey as keyof RevIndustry] ?? -Infinity;
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return "";
    return sortAsc ? " ↑" : " ↓";
  }

  // Summary stats
  const summary = useMemo(() => {
    if (!data?.stocks) return null;
    const valid = data.stocks.filter((s) => s.revYoY != null);
    return {
      total: data.totalStocks,
      yoyPos: valid.filter((s) => s.revYoY! > 0).length,
      yoyNeg: valid.filter((s) => s.revYoY! < 0).length,
      yoyGt20: valid.filter((s) => s.revYoY! > 20).length,
      yoyGt50: valid.filter((s) => s.revYoY! > 50).length,
      yoyGt100: valid.filter((s) => s.revYoY! > 100).length,
      limitUpWithRev: data.stocks.filter((s) => limitUpCodes.has(s.code) && s.revYoY != null && s.revYoY > 20).length,
    };
  }, [data, limitUpCodes]);

  return (
    <>
      <TopNav />
      <NavBar />
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-txt-0">
              營收速報
              {data && <span className="ml-2 text-sm font-normal text-txt-3">{data.period} 月營收</span>}
            </h1>
            {data && (
              <p className="text-xs text-txt-4 mt-1">
                資料來源：永豐金 Sinopac｜資料日期：{data.dataDate}｜共 {data.totalStocks} 檔
              </p>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "總家數", val: summary.total, color: "text-txt-0" },
              { label: "YoY 正成長", val: summary.yoyPos, color: "text-red" },
              { label: "YoY 衰退", val: summary.yoyNeg, color: "text-green" },
              { label: "YoY > 20%", val: summary.yoyGt20, color: "text-blue" },
              { label: "YoY > 50%", val: summary.yoyGt50, color: "text-amber" },
              { label: "YoY > 100%", val: summary.yoyGt100, color: "text-red" },
              { label: "漲停+高成長", val: summary.limitUpWithRev, color: "text-red" },
            ].map((c) => (
              <div key={c.label} className="bg-bg-1 border border-border rounded-lg px-3 py-2.5 text-center">
                <div className={`text-lg font-bold tabular-nums ${c.color}`}>{c.val}</div>
                <div className="text-[10px] text-txt-4">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tab + Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-1">
            <button
              onClick={() => setTab("stocks")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${tab === "stocks" ? "bg-red text-white" : "bg-bg-2 text-txt-3 hover:text-txt-1"}`}
            >
              個股排行
            </button>
            <button
              onClick={() => setTab("industries")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${tab === "industries" ? "bg-red text-white" : "bg-bg-2 text-txt-3 hover:text-txt-1"}`}
            >
              產業排行
            </button>
          </div>

          {tab === "stocks" && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="搜尋代號/名稱"
                className="bg-bg-2 border border-border rounded-md px-2.5 py-1 text-xs text-txt-1 outline-none focus:border-border-hover w-36"
              />
              <select
                value={industryFilter}
                onChange={(e) => setIndustryFilter(e.target.value)}
                className="bg-bg-2 border border-border rounded-md px-2 py-1 text-xs text-txt-1 outline-none max-w-[160px]"
              >
                <option value="">全部產業</option>
                {industries.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
              <select
                value={yoyMin}
                onChange={(e) => setYoyMin(e.target.value as typeof yoyMin)}
                className="bg-bg-2 border border-border rounded-md px-2 py-1 text-xs text-txt-1 outline-none"
              >
                <option value="">YoY 不限</option>
                <option value="0">YoY {">"}  0%</option>
                <option value="20">YoY {">"} 20%</option>
                <option value="50">YoY {">"} 50%</option>
                <option value="100">YoY {">"} 100%</option>
              </select>
              <span className="text-[10px] text-txt-4">{filtered.length} 檔</span>
            </div>
          )}
        </div>

        {/* Loading */}
        {isLoading && <div className="text-center py-20 text-txt-3">載入營收資料中...</div>}

        {/* Stock Table */}
        {!isLoading && tab === "stocks" && (
          <div className="bg-bg-1 border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bg-2 text-txt-3 border-b border-border">
                    <th className="text-left px-3 py-2 sticky left-0 bg-bg-2 z-10 min-w-[120px]">股票</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1 whitespace-nowrap" onClick={() => toggleSort("revMonth")}>月營收(百萬){sortIcon("revMonth")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1 whitespace-nowrap" onClick={() => toggleSort("revYoY")}>YoY{sortIcon("revYoY")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1 whitespace-nowrap" onClick={() => toggleSort("revMoM")}>MoM{sortIcon("revMoM")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1 whitespace-nowrap" onClick={() => toggleSort("revCum")}>累計(百萬){sortIcon("revCum")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1 whitespace-nowrap" onClick={() => toggleSort("revCumYoY")}>累計YoY{sortIcon("revCumYoY")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1 whitespace-nowrap" onClick={() => toggleSort("price")}>股價{sortIcon("price")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1 whitespace-nowrap" onClick={() => toggleSort("chg1d")}>1日%{sortIcon("chg1d")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1 whitespace-nowrap" onClick={() => toggleSort("chg5d")}>5日%{sortIcon("chg5d")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1 whitespace-nowrap" onClick={() => toggleSort("chg20d")}>20日%{sortIcon("chg20d")}</th>
                    <th className="text-left px-2 py-2 whitespace-nowrap">產業</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((s) => {
                    const isLimitUp = limitUpCodes.has(s.code);
                    return (
                      <tr
                        key={s.code}
                        className={`border-b border-border/50 hover:bg-bg-2/50 transition-colors ${isLimitUp ? "bg-red/5" : ""}`}
                      >
                        <td className="px-3 py-1.5 sticky left-0 bg-bg-1 z-10">
                          <Link href={`/stock/${s.code}`} className="hover:underline">
                            <span className="font-mono text-txt-2">{s.code}</span>
                            <span className="ml-1.5 text-txt-1">{s.name}</span>
                          </Link>
                          {isLimitUp && <span className="ml-1 px-1 py-0.5 text-[8px] font-bold rounded bg-red text-white">漲停</span>}
                        </td>
                        <td className="text-right px-2 py-1.5 tabular-nums text-txt-1">{fmt(s.revMonth)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">
                          {pctCell(s.revYoY)}
                          <YoYBadge v={s.revYoY} />
                        </td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{pctCell(s.revMoM)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums text-txt-2">{fmt(s.revCum)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{pctCell(s.revCumYoY)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums text-txt-1">{s.price ?? "-"}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{pctCell(s.chg1d)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{pctCell(s.chg5d)}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">{pctCell(s.chg20d)}</td>
                        <td className="text-left px-2 py-1.5 text-txt-4 text-[10px] max-w-[100px] truncate">{s.industry}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length > 200 && (
              <div className="text-center py-2 text-[10px] text-txt-4 border-t border-border">
                顯示前 200 筆，共 {filtered.length} 筆
              </div>
            )}
          </div>
        )}

        {/* Industry Table */}
        {!isLoading && tab === "industries" && (
          <div className="bg-bg-1 border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bg-2 text-txt-3 border-b border-border">
                    <th className="text-left px-3 py-2 sticky left-0 bg-bg-2 z-10 min-w-[160px]">產業</th>
                    <th className="text-right px-2 py-2">家數</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1" onClick={() => toggleSort("revMonth")}>月營收(億){sortIcon("revMonth")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1" onClick={() => toggleSort("revYoY")}>YoY{sortIcon("revYoY")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1" onClick={() => toggleSort("revCum")}>累計(億){sortIcon("revCum")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1" onClick={() => toggleSort("revCumYoY")}>累計YoY{sortIcon("revCumYoY")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1" onClick={() => toggleSort("chg1d")}>1日%{sortIcon("chg1d")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1" onClick={() => toggleSort("chg5d")}>5日%{sortIcon("chg5d")}</th>
                    <th className="text-right px-2 py-2 cursor-pointer hover:text-txt-1" onClick={() => toggleSort("chg20d")}>20日%{sortIcon("chg20d")}</th>
                  </tr>
                </thead>
                <tbody>
                  {indFiltered.map((ind) => (
                    <tr key={ind.name} className="border-b border-border/50 hover:bg-bg-2/50 transition-colors">
                      <td className="px-3 py-1.5 sticky left-0 bg-bg-1 z-10">
                        <button
                          onClick={() => { setIndustryFilter(ind.name); setTab("stocks"); }}
                          className="text-txt-1 hover:text-red hover:underline text-left"
                        >
                          {ind.name}
                        </button>
                      </td>
                      <td className="text-right px-2 py-1.5 tabular-nums text-txt-2">{ind.count}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums text-txt-1">{ind.revMonth != null ? (ind.revMonth / 10).toFixed(1) : "-"}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums">{pctCell(ind.revYoY)}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums text-txt-2">{ind.revCum != null ? (ind.revCum / 10).toFixed(1) : "-"}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums">{pctCell(ind.revCumYoY)}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums">{pctCell(ind.chg1d)}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums">{pctCell(ind.chg5d)}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums">{pctCell(ind.chg20d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
