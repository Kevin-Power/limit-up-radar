"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPct, formatPrice, getTodayString } from "@/lib/utils";
import {
  analyzeEma,
  getSignalLabel,
  getSignalFullLabel,
  getSignalColor,
  EmaSignal,
} from "@/lib/ema";

/* ================================================================
   MOCK DATA
   ================================================================ */

const MOCK_STOCKS = [
  { code: "3324", name: "雙鴻", close: 1065, changePct: 2.40, group: "AI 伺服器" },
  { code: "3017", name: "奇鋐", close: 1945, changePct: -2.51, group: "AI 伺服器" },
  { code: "6669", name: "緯穎", close: 3725, changePct: 2.19, group: "AI 伺服器" },
  { code: "2376", name: "技嘉", close: 235, changePct: 1.08, group: "AI 伺服器" },
  { code: "6515", name: "穎崴", close: 8190, changePct: 3.87, group: "半導體設備" },
  { code: "6223", name: "旺矽", close: 3860, changePct: 4.89, group: "半導體設備" },
  { code: "2330", name: "台積電", close: 1810, changePct: -1.63, group: "半導體" },
  { code: "2454", name: "聯發科", close: 1620, changePct: -0.31, group: "IC 設計" },
  { code: "5274", name: "信驊", close: 11750, changePct: 3.52, group: "IC 設計" },
  { code: "2379", name: "瑞昱", close: 480.5, changePct: 2.34, group: "IC 設計" },
  { code: "2014", name: "中鴻", close: 18.45, changePct: 1.65, group: "鋼鐵" },
  { code: "1301", name: "台塑", close: 45.05, changePct: 0.67, group: "塑化" },
  { code: "1303", name: "南亞", close: 72.3, changePct: -2.03, group: "塑化" },
  { code: "2317", name: "鴻海", close: 195, changePct: -0.51, group: "電子代工" },
  { code: "4743", name: "合一", close: 52, changePct: -2.44, group: "生技" },
  { code: "2401", name: "凌陽", close: 20.45, changePct: -0.24, group: "IC 設計" },
  { code: "3037", name: "欣興", close: 460, changePct: -1.28, group: "PCB" },
  { code: "4977", name: "眾達-KY", close: 181.5, changePct: -1.89, group: "光通訊" },
  { code: "2458", name: "義隆", close: 128, changePct: -2.29, group: "IC 設計" },
  { code: "3576", name: "聯合再生", close: 20.7, changePct: -3.72, group: "太陽能" },
];

/* ================================================================
   TYPES & HELPERS
   ================================================================ */

interface StockRow {
  code: string;
  name: string;
  close: number;
  changePct: number;
  group: string;
  ema11: number;
  ema24: number;
  diff: number;
  signal: EmaSignal;
  crossoverDay: number;
  ema11Series: number[];
  ema24Series: number[];
}

type SortKey =
  | "code"
  | "name"
  | "close"
  | "changePct"
  | "ema11"
  | "ema24"
  | "diff"
  | "signal"
  | "crossoverDay"
  | "group";

type SortDir = "asc" | "desc";

const SIGNAL_ORDER: Record<EmaSignal, number> = {
  golden_cross: 0,
  bullish: 1,
  death_cross: 2,
  bearish: 3,
};

type FilterKey = "all" | EmaSignal;

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "golden_cross", label: "黃金交叉" },
  { key: "bullish", label: "多頭排列" },
  { key: "death_cross", label: "死亡交叉" },
  { key: "bearish", label: "空頭排列" },
];

function formatCrossoverDay(signal: EmaSignal, day: number): string {
  if (signal !== "golden_cross" && signal !== "death_cross") return "-";
  if (day === 0) return "今日";
  return `${day}天前`;
}

/* ================================================================
   MINI EMA CHART (inline SVG 80x24)
   ================================================================ */

function MiniEmaChart({
  ema11Series,
  ema24Series,
}: {
  ema11Series: number[];
  ema24Series: number[];
}) {
  const last30_11 = ema11Series.slice(-30);
  const last30_24 = ema24Series.slice(-30);
  const all = [...last30_11, ...last30_24];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;

  const w = 80;
  const h = 24;
  const pad = 1;

  function toPath(series: number[]): string {
    return series
      .map((v, i) => {
        const x = pad + (i / (series.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <path d={toPath(last30_24)} fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.7" />
      <path d={toPath(last30_11)} fill="none" stroke="#3b82f6" strokeWidth="1.2" />
    </svg>
  );
}

/* ================================================================
   SORT ARROW
   ================================================================ */

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-txt-4 ml-0.5">&#x25B4;&#x25BE;</span>;
  return (
    <span className="text-accent ml-0.5">
      {dir === "asc" ? "\u25B4" : "\u25BE"}
    </span>
  );
}

/* ================================================================
   PAGE COMPONENT
   ================================================================ */

interface DailyApiData {
  date: string;
  groups: { name: string; color: string; stocks: { code: string; name: string; close: number; change_pct: number; industry: string }[] }[];
}

export default function PonyPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("diff");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [strategyOpen, setStrategyOpen] = useState(false);

  const { data: dailyData } = useSWR<DailyApiData>(
    "/api/daily/latest",
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  // Use real limit-up stocks if available, else fall back to mock
  const sourceStocks = useMemo(() => {
    if (!dailyData?.groups?.length) return MOCK_STOCKS;
    return dailyData.groups.flatMap((g) =>
      g.stocks.map((s) => ({
        code: s.code,
        name: s.name,
        close: s.close,
        changePct: s.change_pct,
        group: g.name,
      }))
    );
  }, [dailyData]);

  // Build enriched rows (stable, no deps on state)
  const rows: StockRow[] = useMemo(() => {
    return sourceStocks.map((s) => {
      const ema = analyzeEma(s.code, s.close);
      return {
        ...s,
        ema11: ema.ema11,
        ema24: ema.ema24,
        diff: ema.ema11 - ema.ema24,
        signal: ema.signal,
        crossoverDay: ema.crossoverDay,
        ema11Series: ema.ema11Series,
        ema24Series: ema.ema24Series,
      };
    });
  }, []);

  // Signal counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) {
      c[r.signal] = (c[r.signal] || 0) + 1;
    }
    return c;
  }, [rows]);

  // Filter + sort
  const displayed = useMemo(() => {
    let list = filter === "all" ? rows : rows.filter((r) => r.signal === filter);

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "code":
          cmp = a.code.localeCompare(b.code);
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "close":
          cmp = a.close - b.close;
          break;
        case "changePct":
          cmp = a.changePct - b.changePct;
          break;
        case "ema11":
          cmp = a.ema11 - b.ema11;
          break;
        case "ema24":
          cmp = a.ema24 - b.ema24;
          break;
        case "diff":
          cmp = a.diff - b.diff;
          break;
        case "signal":
          cmp = SIGNAL_ORDER[a.signal] - SIGNAL_ORDER[b.signal];
          break;
        case "crossoverDay":
          cmp = a.crossoverDay - b.crossoverDay;
          break;
        case "group":
          cmp = a.group.localeCompare(b.group);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [rows, filter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "code" || key === "name" || key === "group" ? "asc" : "desc");
    }
  }

  // Column headers
  const columns: { key: SortKey; label: string; align?: string }[] = [
    { key: "code", label: "代號" },
    { key: "name", label: "名稱" },
    { key: "close", label: "收盤價", align: "text-right" },
    { key: "changePct", label: "漲跌幅", align: "text-right" },
    { key: "ema11", label: "EMA11", align: "text-right" },
    { key: "ema24", label: "EMA24", align: "text-right" },
    { key: "diff", label: "差值", align: "text-right" },
    { key: "signal", label: "信號", align: "text-center" },
    { key: "crossoverDay", label: "交叉天數", align: "text-center" },
    { key: "group", label: "族群" },
  ];

  return (
    <div className="min-h-screen bg-bg-0 text-txt-0 animate-fade-in">
      <TopNav currentDate={getTodayString()} />
      <NavBar />

      <main className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
        {/* ── Header ─────────────────────────────────── */}
        <div className="mb-8">
          <h1 className="text-xl md:text-3xl font-bold text-txt-0 flex items-center gap-2">
            🐴 快樂小馬選股
          </h1>
          <p className="text-lg text-txt-2 mt-1">
            EMA 11 × EMA 24 交叉策略選股
          </p>
          <p className="text-sm text-txt-3 mt-1">
            快速找出漲停股中出現黃金交叉（EMA11上穿EMA24）的標的
          </p>
        </div>

        {/* ── Strategy Explanation Card ───────────────── */}
        <div className="bg-bg-1 border border-border rounded-lg mb-6">
          <button
            onClick={() => setStrategyOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bg-2 transition-colors rounded-lg"
          >
            <span className="text-sm font-medium text-txt-1">
              策略說明：EMA 交叉判讀邏輯
            </span>
            <span className="text-txt-3 text-xs">
              {strategyOpen ? "收起 ▲" : "展開 ▼"}
            </span>
          </button>

          {strategyOpen && (
            <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-start gap-2 bg-red-bg/30 border border-red/20 rounded-md px-3 py-2">
                <span className="text-red font-bold text-sm shrink-0">金叉</span>
                <span className="text-sm text-txt-2">
                  EMA11 上穿 EMA24 = 黃金交叉（多方信號）
                </span>
              </div>
              <div className="flex items-start gap-2 bg-green-bg/30 border border-green/20 rounded-md px-3 py-2">
                <span className="text-green font-bold text-sm shrink-0">死叉</span>
                <span className="text-sm text-txt-2">
                  EMA11 下穿 EMA24 = 死亡交叉（空方信號）
                </span>
              </div>
              <div className="flex items-start gap-2 bg-red-bg/20 border border-red/10 rounded-md px-3 py-2">
                <span className="text-red/80 font-bold text-sm shrink-0">多頭</span>
                <span className="text-sm text-txt-2">
                  EMA11 &gt; EMA24 = 多頭排列
                </span>
              </div>
              <div className="flex items-start gap-2 bg-green-bg/20 border border-green/10 rounded-md px-3 py-2">
                <span className="text-green/80 font-bold text-sm shrink-0">空頭</span>
                <span className="text-sm text-txt-2">
                  EMA11 &lt; EMA24 = 空頭排列
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Filter Tabs ────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-6">
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.key;
            const count = counts[tab.key] || 0;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  active
                    ? "bg-accent text-bg-0"
                    : "bg-bg-2 text-txt-2 hover:bg-bg-3 hover:text-txt-1"
                }`}
              >
                {tab.label}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    active ? "bg-bg-0/20 text-bg-0" : "bg-bg-3 text-txt-3"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Stock Table ────────────────────────────── */}
        <div className="bg-bg-1 border border-border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-2.5 font-medium text-txt-3 cursor-pointer hover:text-txt-1 select-none whitespace-nowrap ${
                      col.align || "text-left"
                    }`}
                  >
                    {col.label}
                    <SortArrow active={sortKey === col.key} dir={sortDir} />
                  </th>
                ))}
                <th className="px-3 py-2.5 font-medium text-txt-3 text-center whitespace-nowrap">
                  走勢
                </th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((row) => {
                const sc = getSignalColor(row.signal);
                const diffPositive = row.diff > 0;
                return (
                  <tr
                    key={row.code}
                    className="border-b border-border/50 hover:bg-bg-2/50 transition-colors row-hover"
                  >
                    {/* 代號 */}
                    <td className="px-3 py-2">
                      <Link
                        href={`/stock/${row.code}`}
                        className="text-accent hover:underline font-mono"
                      >
                        {row.code}
                      </Link>
                    </td>
                    {/* 名稱 */}
                    <td className="px-3 py-2 text-txt-1 whitespace-nowrap">
                      {row.name}
                    </td>
                    {/* 收盤價 */}
                    <td className="px-3 py-2 text-right font-mono text-txt-1 tabular-nums">
                      {formatPrice(row.close)}
                    </td>
                    {/* 漲跌幅 */}
                    <td className="px-3 py-2 text-right font-mono text-red tabular-nums">
                      {formatPct(row.changePct)}
                    </td>
                    {/* EMA11 */}
                    <td className="px-3 py-2 text-right font-mono text-blue tabular-nums">
                      {row.ema11.toFixed(1)}
                    </td>
                    {/* EMA24 */}
                    <td className="px-3 py-2 text-right font-mono text-amber tabular-nums">
                      {row.ema24.toFixed(1)}
                    </td>
                    {/* 差值 */}
                    <td
                      className={`px-3 py-2 text-right font-mono tabular-nums ${
                        diffPositive ? "text-red" : "text-green"
                      }`}
                    >
                      {diffPositive ? "+" : ""}
                      {row.diff.toFixed(1)}
                    </td>
                    {/* 信號 */}
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${sc.text} ${sc.bg} ${sc.border}`}
                      >
                        {getSignalLabel(row.signal)}
                      </span>
                    </td>
                    {/* 交叉天數 */}
                    <td className="px-3 py-2 text-center text-txt-2 text-xs">
                      {formatCrossoverDay(row.signal, row.crossoverDay)}
                    </td>
                    {/* 族群 */}
                    <td className="px-3 py-2 text-txt-3 whitespace-nowrap text-xs">
                      {row.group}
                    </td>
                    {/* 走勢 mini chart */}
                    <td className="px-3 py-2 text-center">
                      <MiniEmaChart
                        ema11Series={row.ema11Series}
                        ema24Series={row.ema24Series}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {displayed.length === 0 && (
            <div className="text-center py-12 text-txt-3">
              目前沒有符合條件的標的
            </div>
          )}
        </div>

        {/* ── Summary ────────────────────────────────── */}
        <div className="mt-4 text-xs text-txt-4 text-right">
          共 {displayed.length} 檔標的
          {filter !== "all" && `（篩選：${getSignalFullLabel(filter as EmaSignal)}）`}
        </div>
      </main>
    </div>
  );
}
