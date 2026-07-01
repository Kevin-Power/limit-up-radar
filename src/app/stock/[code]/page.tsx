"use client";

import { use, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { DailyData, Stock, StockGroup } from "@/lib/types";
import { formatPrice, formatPct, formatNumber, formatNet } from "@/lib/utils";
import { signColor } from "@/lib/format";
import { getSignalFullLabel, getSignalColor } from "@/lib/ema";
import type { EmaResult } from "@/lib/ema";
import dynamic from "next/dynamic";
import { type CandleData } from "@/components/KLineChart";
import { SkeletonBox } from "@/components/Skeleton";
import StarButton from "@/components/StarButton";
import { useWatchlist } from "@/lib/useWatchlist";
import { fetcher } from "@/lib/fetcher";
import IntradayChart from "@/components/IntradayChart";
import type { IntradayBar } from "@/lib/data-files";

interface IntradayResp {
  available: boolean;
  date?: string;
  bars?: IntradayBar[];
  barCount?: number;
  sparse?: boolean;
  stats?: {
    dayOpen: number;
    last: number;
    hod: number;
    hodTime: string;
    lod: number;
    lodTime: string;
    amplitudePct: number;
    closeVsOpenPct: number;
    morningPct: number;
    closePosition: number;
  } | null;
}

interface LimitUpEntry {
  date: string;
  group: string;
  nextDayOpenPct: number | null;
  nextDayClosePct: number | null;
}

const fmtSignedPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

// Heavy client-only chart — code-split to keep first-load bundle small (audit P2-7)
const KLineChart = dynamic(() => import("@/components/KLineChart"), {
  ssr: false,
  loading: () => (
    <SkeletonBox className="w-full h-[420px] rounded-lg" />
  ),
});

// --- Section label component ---

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-sm font-bold text-txt-1 tracking-wide whitespace-nowrap">{children}</h2>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// --- RSI Gauge ---

function RsiGauge({ value }: { value: number }) {
  const w = 120;
  const h = 14;
  const fillW = (value / 100) * w;
  let fillColor = "#f59e0b"; // amber for neutral
  if (value > 70) fillColor = "#ef4444";
  else if (value < 30) fillColor = "#22c55e";

  return (
    <div className="flex items-center gap-2">
      <svg width={w} height={h}>
        <rect x="0" y="2" width={w} height="10" rx="3" fill="rgba(255,255,255,0.05)" />
        <rect x="0" y="2" width={fillW} height="10" rx="3" fill={fillColor} opacity="0.7" />
        {/* Overbought / oversold markers */}
        <line x1={(30 / 100) * w} y1="0" x2={(30 / 100) * w} y2={h} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <line x1={(70 / 100) * w} y1="0" x2={(70 / 100) * w} y2={h} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      </svg>
      <span className="text-xs font-bold tabular-nums" style={{ color: fillColor }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

// --- Chip bar visual ---

function ChipBar({ values, label }: { values: number[]; label: string }) {
  // API returns newest-first; reverse to display oldest→newest (left→right)
  const ordered = [...values].reverse();
  const total = values.reduce((a, b) => a + b, 0);
  const maxAbs = Math.max(...values.map(Math.abs), 1);
  const allLabels = ["前日", "昨日", "今日"];
  const dateLabels = allLabels.slice(0, ordered.length);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-txt-3 tracking-wider">{label}</span>
        <span className={`text-xs font-bold tabular-nums ${signColor(total)}`}>
          {total > 0 ? "+" : ""}{formatNumber(total)}
        </span>
      </div>
      <div className="flex gap-1">
        {ordered.map((v, i) => {
          const barW = Math.max((Math.abs(v) / maxAbs) * 100, 8);
          return (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div
                className="h-4 rounded-sm"
                style={{
                  width: `${barW}%`,
                  backgroundColor: v >= 0 ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)",
                }}
              />
              <span className="text-[9px] tabular-nums text-txt-4">
                {v > 0 ? "+" : ""}{formatNumber(v)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-0.5">
        {dateLabels.map((d, i) => (
          <span key={i} className="flex-1 text-[8px] text-txt-4">{d}</span>
        ))}
      </div>
    </div>
  );
}

// --- Page ---

interface PageProps {
  params: Promise<{ code: string }>;
}

// Shared SWR options — cut duplicate requests across the 8 hooks on this page
// (audit P2-8). Per-stock endpoints are immutable for a session; the two
// whole-table endpoints (pe/revenue) are identical across every stock page,
// so a longer dedupingInterval lets SWR's cache serve them without re-fetching.
const SWR_OPTS = { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 } as const;
// pe/revenue fetch the entire market table — far heavier and shared by all
// stock pages, so dedupe over a longer window.
const SWR_OPTS_TABLE = { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 } as const;

export default function StockDetailPage({ params }: PageProps) {
  const { code } = use(params);
  const { toggle: toggleWatch, isWatched } = useWatchlist();
  const [stock, setStock] = useState<Stock | null>(null);
  const [group, setGroup] = useState<StockGroup | null>(null);
  const [allGroups, setAllGroups] = useState<StockGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/daily/latest")
      .then((r) => r.json())
      .then((data: DailyData) => {
        setAllGroups(data.groups ?? []);
        for (const g of data.groups ?? []) {
          const found = g.stocks.find((s) => s.code === code);
          if (found) {
            setStock(found);
            setGroup(g);
            break;
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [code]);

  // Real K-line history from TWSE/TPEx
  const { data: realCandles, error: candlesError } = useSWR<CandleData[]>(
    `/api/stock/${code}/history`,
    fetcher,
    SWR_OPTS
  );

  // Real API data — normalize { code, data: null } to null when signal is absent
  const { data: emaRaw } = useSWR<EmaResult & { code: string }>(
    `/api/ema/${code}`, fetcher, SWR_OPTS
  );
  const emaResult = emaRaw?.signal ? emaRaw : null;
  const { data: techData } = useSWR(
    `/api/stock/${code}/technicals`, fetcher, SWR_OPTS
  );
  const { data: chipData } = useSWR(
    `/api/stock/${code}/chip`, fetcher, SWR_OPTS
  );
  const { data: limitUpHistory } = useSWR<LimitUpEntry[]>(
    `/api/stock/${code}/limitup-history`, fetcher, SWR_OPTS
  );
  const { data: intraday } = useSWR<IntradayResp>(
    `/api/stock/${code}/intraday`, fetcher, SWR_OPTS
  );

  // 隔日衝彙總：由歷史漲停紀錄的隔日開盤/收盤%聚合（毛數字、未含成本）
  const nextDaySummary = useMemo(() => {
    const arr = (limitUpHistory ?? []).filter((e) => e.nextDayOpenPct != null);
    if (arr.length === 0) return null;
    const n = arr.length;
    const openWin = arr.filter((e) => (e.nextDayOpenPct ?? 0) > 0).length;
    const avgOpen = arr.reduce((s, e) => s + (e.nextDayOpenPct ?? 0), 0) / n;
    const closeArr = arr.filter((e) => e.nextDayClosePct != null);
    const avgClose = closeArr.length
      ? closeArr.reduce((s, e) => s + (e.nextDayClosePct ?? 0), 0) / closeArr.length
      : null;
    return { n, openWinRate: (openWin / n) * 100, avgOpen, avgClose };
  }, [limitUpHistory]);
  const { data: peData } = useSWR<Record<string, { pe: number; pb: number }>>(
    "/api/pe", fetcher, SWR_OPTS_TABLE
  );
  const { data: revData } = useSWR<{ stocks: { code: string; revMonth: number | null; revYoY: number | null; revMoM: number | null; revCum: number | null; revCumYoY: number | null }[] }>(
    "/api/revenue", fetcher, SWR_OPTS_TABLE
  );
  const stockRev = useMemo(() => {
    if (!revData?.stocks) return null;
    return revData.stocks.find((s) => s.code === code) ?? null;
  }, [revData, code]);

  // stock name: from daily data
  const stockName = useMemo(() => {
    if (!allGroups.length) return code;
    for (const g of allGroups) {
      const found = g.stocks.find((s) => s.code === code);
      if (found) return found.name;
    }
    return code;
  }, [allGroups, code]);

  const stockPrice = useMemo(() => {
    for (const g of allGroups) {
      const found = g.stocks.find((s) => s.code === code);
      if (found) return found.close;
    }
    return realCandles?.[realCandles.length - 1]?.close ?? 0;
  }, [allGroups, realCandles, code]);

  const displayStock: Stock = stock ?? {
    code,
    name: stockName,
    industry: "--",
    close: stockPrice,
    change_pct: 0,
    volume: 0,
    major_net: 0,
    streak: 0,
  };

  const displayGroup = group ?? { name: "--", color: "#ef4444", badges: [], reason: "--", stocks: [] };

  const isPositive = displayStock.change_pct >= 0;
  const changeAmount = displayStock.close * (displayStock.change_pct / 100) / (1 + displayStock.change_pct / 100);

  // PE from real API
  const stockPe = peData?.[code]?.pe ?? 0;
  const stockPb = peData?.[code]?.pb ?? 0;

  // Last candle for open/high/low
  const lastCandle = realCandles?.[realCandles.length - 1] ?? null;

  // Peers from same group with real PE
  const peers = useMemo(() => {
    return displayGroup.stocks
      .filter((s) => s.code !== code)
      .slice(0, 4)
      .map((s) => ({
        code: s.code,
        name: s.name,
        price: s.close,
        changePct: s.change_pct,
        volume: s.volume,
        pe: peData?.[s.code]?.pe ?? 0,
      }));
  }, [displayGroup.stocks, code, peData]);

  // Groups this stock appeared in
  const appearedGroups: { name: string; color: string }[] = [];
  for (const g of allGroups) {
    if (g.stocks.some((s) => s.code === code)) {
      appearedGroups.push({ name: g.name, color: g.color });
    }
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <TopNav stocks={stock ? [stock] : []} />
      <NavBar />
      <main id="main" className="flex-1 overflow-y-auto">
        <div className="container-page-narrow py-5 animate-fade-in">
          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-txt-4 hover:text-txt-1 transition-colors mb-5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-60">
              <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            返回
          </Link>

          {loading ? (
            <div className="text-txt-4 text-sm text-center py-20">載入中...</div>
          ) : (
            <>
              {/* ============================================================
                  SECTION 1: Stock Header
                  ============================================================ */}
              <div className="bg-bg-1 border border-border rounded-xl p-5 mb-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-mono font-semibold text-txt-3">{displayStock.code}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-bg-3 border border-border rounded font-semibold text-txt-3">
                        {displayStock.industry}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <h1 className="text-xl md:text-3xl font-bold text-txt-0 tracking-tight">{displayStock.name}</h1>
                      <StarButton code={code} isWatched={isWatched(code)} onToggle={toggleWatch} size="md" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://www.google.com/search?q=${displayStock.code}+${displayStock.name}+外資買超`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2.5 py-1 rounded bg-bg-3 border border-border text-txt-3 hover:text-txt-1 hover:border-border-hover transition-colors"
                      >
                        外資動向
                      </a>
                      <a
                        href={`https://www.google.com/search?q=${displayStock.code}+${displayStock.name}+新聞`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2.5 py-1 rounded bg-bg-3 border border-border text-txt-3 hover:text-txt-1 hover:border-border-hover transition-colors"
                      >
                        相關新聞
                      </a>
                      <a
                        href={`https://mops.twse.com.tw/mops/web/t05st01?encodeURIComponent=1&step=1&firstin=1&co_id=${displayStock.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2.5 py-1 rounded bg-bg-3 border border-border text-txt-3 hover:text-txt-1 hover:border-border-hover transition-colors"
                      >
                        公司公告
                      </a>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="flex items-baseline gap-2 justify-end">
                      <span className={`text-xl md:text-3xl font-bold tabular-nums ${isPositive ? "text-red" : "text-green"}`}>
                        {formatPrice(displayStock.close)}
                      </span>
                      <span className={`text-lg ${isPositive ? "text-red" : "text-green"}`}>
                        {isPositive ? "^" : "v"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 justify-end">
                      <span
                        className={`text-sm font-semibold tabular-nums ${isPositive ? "text-red" : "text-green"}`}
                      >
                        {isPositive ? "+" : ""}{changeAmount.toFixed(2)}
                      </span>
                      <span
                        className={`text-sm font-bold px-2.5 py-0.5 rounded tabular-nums ${
                          isPositive ? "bg-red-bg text-red" : "bg-green-bg text-green"
                        }`}
                      >
                        {formatPct(displayStock.change_pct)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ============================================================
                  SECTION 2.5: K-Line / Candlestick Technical Chart
                  ============================================================ */}
              <div className="mb-6">
                <SectionLabel>技術分析圖表</SectionLabel>
                {candlesError ? (
                  <div className="bg-bg-1 border border-border rounded-lg py-16 text-center">
                    <p className="text-sm font-bold text-red mb-1">K 線資料無法載入</p>
                    <p className="text-xs text-txt-3">請稍後再試或檢查網路連線</p>
                  </div>
                ) : (
                  <KLineChart
                    data={realCandles ?? []}
                    showMA={true}
                    showVolume={true}
                    showMACD={true}
                    showKD={true}
                  />
                )}
              </div>

              {/* ============================================================
                  SECTION 2.6: Intraday / 分時走勢（當沖視角）
                  ============================================================ */}
              <div className="mb-6">
                <SectionLabel>分時走勢 · 當沖視角</SectionLabel>
                {intraday?.available && intraday.bars && intraday.bars.length > 1 ? (
                  <div className="bg-bg-1 border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-txt-3">
                        分時資料日 <span className="text-txt-1 font-semibold tabular-nums">{intraday.date?.replace(/-/g, "/")}</span>
                      </span>
                      <span className="text-[10px] text-txt-4">1 分 K · 毛價（未含手續費／稅）</span>
                    </div>
                    <IntradayChart bars={intraday.bars} dayOpen={intraday.stats?.dayOpen ?? intraday.bars[0].open} />
                    {intraday.stats && (
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
                        {[
                          { label: "開盤", value: intraday.stats.dayOpen.toFixed(2), tone: null as boolean | null },
                          { label: "收/現價", value: intraday.stats.last.toFixed(2), tone: intraday.stats.closeVsOpenPct >= 0 },
                          { label: "相對開盤", value: fmtSignedPct(intraday.stats.closeVsOpenPct), tone: intraday.stats.closeVsOpenPct >= 0 },
                          { label: "當日振幅", value: `${intraday.stats.amplitudePct.toFixed(2)}%`, tone: null },
                          { label: "開盤半小時", value: fmtSignedPct(intraday.stats.morningPct), tone: intraday.stats.morningPct >= 0 },
                          { label: "尾盤位置", value: `${Math.round(intraday.stats.closePosition * 100)}%`, tone: intraday.stats.closePosition >= 0.5 },
                        ].map(({ label, value, tone }) => (
                          <div key={label} className={`rounded-lg px-2.5 py-2 border ${tone === true ? "bg-red-bg border-red/10" : tone === false ? "bg-green-bg border-green/10" : "bg-bg-2 border-border"}`}>
                            <div className="text-[9px] text-txt-4 mb-0.5">{label}</div>
                            <div className={`text-[13px] font-bold tabular-nums ${tone === true ? "text-red" : tone === false ? "text-green" : "text-txt-1"}`}>{value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="mt-3 text-[10px] text-txt-4 leading-relaxed">
                      分時資料為盤後收錄之精選標的歷史，非即時、未必為最新交易日；尾盤位置＝收盤價落在當日高低區間的位置（越高越強）。僅供型態教育與研究，非投資建議。
                    </p>
                  </div>
                ) : intraday && !intraday.available ? (
                  <div className="bg-bg-1 border border-border rounded-lg py-10 text-center">
                    <p className="text-sm text-txt-3">此標的尚無分時資料</p>
                    <p className="text-[11px] text-txt-4 mt-1">分時走勢僅收錄部分精選漲停標的與交易日</p>
                  </div>
                ) : (
                  <SkeletonBox className="w-full h-[240px] rounded-lg" />
                )}
              </div>

              {/* ============================================================
                  SECTION 3: Key Metrics Grid (2 x 4)
                  ============================================================ */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  { label: "Open", sub: "開盤", value: lastCandle ? formatPrice(lastCandle.open) : "\u2014", positive: lastCandle ? lastCandle.open >= lastCandle.close * 0.95 : null },
                  { label: "High", sub: "最高", value: lastCandle ? formatPrice(lastCandle.high) : "\u2014", positive: lastCandle ? true : null },
                  { label: "Low", sub: "最低", value: lastCandle ? formatPrice(lastCandle.low) : "\u2014", positive: lastCandle ? false : null },
                  { label: "Volume", sub: "成交量", value: formatNumber(displayStock.volume) + " 張", positive: null },
                  { label: "Major Net", sub: "主力買超", value: formatNet(displayStock.major_net) + " 張", positive: displayStock.major_net > 0 },
                  { label: "Streak", sub: "連板天數", value: displayStock.streak > 0 ? `${displayStock.streak} 天` : "--", positive: displayStock.streak > 0 ? true : null },
                  { label: "P/E", sub: "本益比", value: stockPe ? stockPe.toFixed(1) : "\u2014", positive: null },
                  { label: "P/B", sub: "股價淨值比", value: stockPb ? stockPb.toFixed(2) : "\u2014", positive: null },
                ].map(({ label, sub, value, positive }) => (
                  <div
                    key={label}
                    className={`rounded-lg px-3.5 py-3 border ${
                      positive === true
                        ? "bg-red-bg border-red/10"
                        : positive === false
                        ? "bg-green-bg border-green/10"
                        : "bg-bg-2 border-border"
                    }`}
                  >
                    <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-0.5">{label}</div>
                    <div className="text-[10px] text-txt-4 mb-1">{sub}</div>
                    <div
                      className={`text-sm font-bold tabular-nums ${
                        positive === true ? "text-red" : positive === false ? "text-green" : "text-txt-1"
                      }`}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Revenue Section */}
              {stockRev && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                  {[
                    { label: "月營收", sub: "百萬", value: stockRev.revMonth != null ? stockRev.revMonth.toLocaleString() : "—", positive: null },
                    { label: "營收 YoY", sub: "年增率", value: stockRev.revYoY != null ? `${stockRev.revYoY > 0 ? "+" : ""}${stockRev.revYoY.toFixed(2)}%` : "—", positive: stockRev.revYoY != null ? (stockRev.revYoY > 0 ? true : stockRev.revYoY < 0 ? false : null) : null },
                    { label: "營收 MoM", sub: "月增率", value: stockRev.revMoM != null ? `${stockRev.revMoM > 0 ? "+" : ""}${stockRev.revMoM.toFixed(2)}%` : "—", positive: stockRev.revMoM != null ? (stockRev.revMoM > 0 ? true : stockRev.revMoM < 0 ? false : null) : null },
                    { label: "累計營收", sub: "百萬", value: stockRev.revCum != null ? stockRev.revCum.toLocaleString() : "—", positive: null },
                    { label: "累計 YoY", sub: "年增率", value: stockRev.revCumYoY != null ? `${stockRev.revCumYoY > 0 ? "+" : ""}${stockRev.revCumYoY.toFixed(2)}%` : "—", positive: stockRev.revCumYoY != null ? (stockRev.revCumYoY > 0 ? true : stockRev.revCumYoY < 0 ? false : null) : null },
                  ].map(({ label, sub, value, positive }) => (
                    <div key={label} className={`rounded-lg px-3.5 py-3 border ${positive === true ? "bg-red-bg border-red/10" : positive === false ? "bg-green-bg border-green/10" : "bg-bg-2 border-border"}`}>
                      <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-0.5">{label}</div>
                      <div className="text-[10px] text-txt-4 mb-1">{sub}</div>
                      <div className={`text-sm font-bold tabular-nums ${positive === true ? "text-red" : positive === false ? "text-green" : "text-txt-1"}`}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Two-column layout for Technical + Chip analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
                {/* ============================================================
                    SECTION 4: Technical Analysis
                    ============================================================ */}
                <div className="bg-bg-1 border border-border rounded-xl p-5">
                  <SectionLabel>技術面分析</SectionLabel>

                  {/* 快樂小馬 EMA11/24 */}
                  {emaResult && (() => {
                    const sc = getSignalColor(emaResult.signal);
                    return (
                      <div className="mb-5">
                        <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-2 flex items-center gap-2">
                          HAPPY PONY / 快樂小馬 EMA11 x EMA24
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>
                            {getSignalFullLabel(emaResult.signal)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 md:gap-4 mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-[2px] bg-blue rounded" />
                            <span className="text-[11px] text-txt-3">EMA11</span>
                            <span className="text-sm font-bold text-blue tabular-nums">{emaResult.ema11.toFixed(1)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-[2px] bg-amber rounded" />
                            <span className="text-[11px] text-txt-3">EMA24</span>
                            <span className="text-sm font-bold text-amber tabular-nums">{emaResult.ema24.toFixed(1)}</span>
                          </div>
                          <div className="text-[11px] text-txt-4">
                            差值: <span className={`font-bold ${emaResult.ema11 > emaResult.ema24 ? "text-red" : "text-green"}`}>
                              {(emaResult.ema11 - emaResult.ema24) > 0 ? "+" : ""}{(emaResult.ema11 - emaResult.ema24).toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {/* Mini EMA chart */}
                        <div className="bg-bg-3 rounded-lg p-3 border border-border">
                          <svg viewBox="0 0 400 100" className="w-full" style={{ height: 80 }}>
                            {(() => {
                              const last30_11 = emaResult.ema11Series.slice(-30);
                              const last30_24 = emaResult.ema24Series.slice(-30);
                              const all = [...last30_11, ...last30_24];
                              const min = Math.min(...all);
                              const max = Math.max(...all);
                              const range = max - min || 1;
                              const toX = (i: number) => (i / 29) * 380 + 10;
                              const toY = (v: number) => 90 - ((v - min) / range) * 80;
                              const pts11 = last30_11.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
                              const pts24 = last30_24.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
                              return (
                                <>
                                  <polyline points={pts24} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.7" />
                                  <polyline points={pts11} fill="none" stroke="#3b82f6" strokeWidth="2" />
                                </>
                              );
                            })()}
                          </svg>
                          <div className="flex items-center justify-center gap-4 mt-1 text-[9px] text-txt-4">
                            <span className="flex items-center gap-1"><span className="w-3 h-[2px] bg-blue inline-block rounded" /> EMA11</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-[2px] bg-amber inline-block rounded" /> EMA24</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Moving Averages */}
                  <div className="mb-5">
                    <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider mb-2">均線</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "MA5 (5日)", value: techData?.ma5 },
                        { label: "MA10 (10日)", value: techData?.ma10 },
                        { label: "MA20 (20日)", value: techData?.ma20 },
                        { label: "MA60 (60日)", value: techData?.ma60 },
                      ].map(({ label, value }) => {
                        const aboveMA = value != null && displayStock.close > value;
                        return (
                          <div key={label} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-bg-2">
                            <span className="text-[10px] text-txt-3">{label}</span>
                            <span className={`text-xs font-bold tabular-nums ${value == null ? "text-txt-3" : aboveMA ? "text-red" : "text-green"}`}>
                              {value != null ? formatPrice(value) : "\u2014"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* RSI */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider">RSI (14)</span>
                      <span className="text-[9px] text-txt-4">
                        {techData?.rsi != null
                          ? techData.rsi > 70 ? "超買" : techData.rsi < 30 ? "超賣" : "中性"
                          : "\u2014"}
                      </span>
                    </div>
                    {techData?.rsi != null ? <RsiGauge value={techData.rsi} /> : <span className="text-xs text-txt-3">{"\u2014"}</span>}
                  </div>

                  {/* MACD */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider">MACD 信號</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          techData?.macdSignal === "golden_cross"
                            ? "bg-red-bg text-red"
                            : techData?.macdSignal === "death_cross"
                            ? "bg-green-bg text-green"
                            : "bg-bg-3 text-txt-3"
                        }`}
                      >
                        {techData?.macdSignal === "golden_cross" ? "金叉" : techData?.macdSignal === "death_cross" ? "死叉" : techData?.macdSignal ? "中性" : "\u2014"}
                      </span>
                    </div>
                  </div>

                  {/* KD */}
                  <div className="mb-4">
                    <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider mb-1.5">KD 指標</div>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-txt-4">K:</span>
                        <span className="text-xs font-bold tabular-nums text-txt-1">{techData?.kd_k != null ? techData.kd_k.toFixed(1) : "\u2014"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-txt-4">D:</span>
                        <span className="text-xs font-bold tabular-nums text-txt-1">{techData?.kd_d != null ? techData.kd_d.toFixed(1) : "\u2014"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-txt-4">K-D:</span>
                        <span className={`text-xs font-bold tabular-nums ${techData?.kd_k != null && techData?.kd_d != null ? (techData.kd_k > techData.kd_d ? "text-red" : "text-green") : "text-txt-3"}`}>
                          {techData?.kd_k != null && techData?.kd_d != null
                            ? `${(techData.kd_k - techData.kd_d) > 0 ? "+" : ""}${(techData.kd_k - techData.kd_d).toFixed(1)}`
                            : "\u2014"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 波段訊號 (swing) */}
                  {techData?.maAlignment && (
                    <div className="mb-4">
                      <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider mb-2">波段訊號</div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${techData.maAlignment === "bull" ? "bg-red-bg text-red" : techData.maAlignment === "bear" ? "bg-green-bg text-green" : "bg-amber-bg text-amber"}`}>
                          {techData.maAlignment === "bull" ? "均線多頭排列" : techData.maAlignment === "bear" ? "均線空頭排列" : "均線糾結"}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${techData.aboveMA60 ? "bg-red-bg text-red" : "bg-green-bg text-green"}`}>
                          {techData.aboveMA60 ? "站上季線" : "季線之下"}
                        </span>
                        {techData.nearHigh20 ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-bg text-red">近 20 日新高</span>
                        ) : techData.pctFromHigh20 != null ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-bg-2 text-txt-3">距 20 日高 {techData.pctFromHigh20}%</span>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Overall Signal */}
                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider">綜合信號</span>
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded ${
                          techData?.overall === "bullish"
                            ? "bg-red-bg text-red"
                            : techData?.overall === "bearish"
                            ? "bg-green-bg text-green"
                            : "bg-amber-bg text-amber"
                        }`}
                      >
                        {techData?.overall === "bullish" ? "偏多" : techData?.overall === "bearish" ? "偏空" : techData?.overall ? "中性" : "\u2014"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ============================================================
                    SECTION 5: Chip Analysis
                    ============================================================ */}
                <div className="bg-bg-1 border border-border rounded-xl p-5">
                  <SectionLabel>籌碼面分析</SectionLabel>

                  {/* 3-day institutional */}
                  <div className="mb-5">
                    <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider mb-2">
                      三大法人近{chipData?.foreign3d?.length ?? 3}日買賣超（股）
                    </div>
                    <ChipBar values={chipData?.foreign3d ?? []} label="外資" />
                    <ChipBar values={chipData?.trust3d ?? []} label="投信" />
                    <ChipBar values={chipData?.dealer3d ?? []} label="自營商" />
                  </div>

                </div>
              </div>

              {/* ============================================================
                  SECTION 6: Limit-Up History
                  ============================================================ */}
              <div className="mb-6">
                <SectionLabel>歷史漲停紀錄 · 隔日衝彙總</SectionLabel>
                {nextDaySummary && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "樣本數", sub: "筆歷史漲停", value: `${nextDaySummary.n}`, tone: null as boolean | null },
                      { label: "隔日開盤勝率", sub: "開盤>平盤", value: `${nextDaySummary.openWinRate.toFixed(0)}%`, tone: nextDaySummary.openWinRate >= 50 },
                      { label: "平均隔日開盤", sub: "毛/未含成本", value: fmtSignedPct(nextDaySummary.avgOpen), tone: nextDaySummary.avgOpen >= 0 },
                      { label: "平均隔日收盤", sub: "毛/未含成本", value: nextDaySummary.avgClose != null ? fmtSignedPct(nextDaySummary.avgClose) : "—", tone: nextDaySummary.avgClose != null ? nextDaySummary.avgClose >= 0 : null },
                    ].map(({ label, sub, value, tone }) => (
                      <div key={label} className={`rounded-lg px-3.5 py-3 border ${tone === true ? "bg-red-bg border-red/10" : tone === false ? "bg-green-bg border-green/10" : "bg-bg-2 border-border"}`}>
                        <div className="text-[10px] text-txt-4 mb-0.5">{label}</div>
                        <div className="text-[9px] text-txt-4 mb-1">{sub}</div>
                        <div className={`text-sm font-bold tabular-nums ${tone === true ? "text-red" : tone === false ? "text-green" : "text-txt-1"}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
                {nextDaySummary && (
                  <p className="text-[10px] text-txt-4 mb-3 leading-relaxed">
                    彙總自本檔歷史漲停之隔日表現（{nextDaySummary.n} 筆，毛數字未計手續費／證交稅）。R1 動態出場參考：隔日開盤 gap 0~5% → 09:15 賣；其它 → T+2 開盤賣。此為歷史統計，非投資建議、不代表未來績效。
                  </p>
                )}
                <div className="overflow-x-auto">
                <div className="border border-border rounded-xl overflow-hidden min-w-[500px]">
                  <div className="grid grid-cols-[1fr_1.2fr_0.8fr_0.8fr] gap-0 px-4 py-2.5 bg-bg-2 border-b border-border">
                    {["日期", "族群", "隔日開盤%", "隔日收盤%"].map((h) => (
                      <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  {(limitUpHistory ?? []).map((entry: { date: string; group: string; nextDayOpenPct: number | null; nextDayClosePct: number | null }, i: number) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_1.2fr_0.8fr_0.8fr] gap-0 px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="text-xs tabular-nums text-txt-2">{entry.date}</div>
                      <div className="text-xs text-txt-2 truncate pr-2">{entry.group}</div>
                      <div
                        className={`text-xs font-semibold tabular-nums ${
                          entry.nextDayOpenPct != null
                            ? signColor(entry.nextDayOpenPct)
                            : "text-txt-3"
                        }`}
                      >
                        {entry.nextDayOpenPct != null
                          ? `${entry.nextDayOpenPct > 0 ? "+" : ""}${entry.nextDayOpenPct.toFixed(2)}%`
                          : "\u2014"}
                      </div>
                      <div
                        className={`text-xs font-semibold tabular-nums ${
                          entry.nextDayClosePct != null
                            ? signColor(entry.nextDayClosePct)
                            : "text-txt-3"
                        }`}
                      >
                        {entry.nextDayClosePct != null
                          ? `${entry.nextDayClosePct > 0 ? "+" : ""}${entry.nextDayClosePct.toFixed(2)}%`
                          : "\u2014"}
                      </div>
                    </div>
                  ))}
                  {(limitUpHistory ?? []).length === 0 && (
                    <div className="px-4 py-4 text-xs text-txt-4 text-center">無歷史漲停紀錄</div>
                  )}
                </div>
                </div>
              </div>

              {/* ============================================================
                  SECTION 7: Peer Comparison
                  ============================================================ */}
              <div className="mb-6">
                <SectionLabel>同族群比較</SectionLabel>
                <div className="overflow-x-auto">
                <div className="border border-border rounded-xl overflow-hidden min-w-[500px]">
                  <div className="grid grid-cols-[0.6fr_1fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-0 px-4 py-2.5 bg-bg-2 border-b border-border">
                    {["代號", "名稱", "收盤", "漲幅%", "成交量", "本益比"].map((h) => (
                      <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  {peers.map((p) => (
                    <Link
                      key={p.code}
                      href={`/stock/${p.code}`}
                      className="grid grid-cols-[0.6fr_1fr_0.8fr_0.8fr_0.8fr_0.6fr] gap-0 px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="text-xs font-mono tabular-nums text-txt-3">{p.code}</div>
                      <div className="text-xs text-txt-1 font-semibold truncate pr-2">{p.name}</div>
                      <div className="text-xs font-bold tabular-nums text-txt-1">{formatPrice(p.price)}</div>
                      <div
                        className={`text-xs font-semibold tabular-nums ${
                          signColor(p.changePct)
                        }`}
                      >
                        {p.changePct > 0 ? "+" : ""}{p.changePct.toFixed(2)}%
                      </div>
                      <div className="text-xs tabular-nums text-txt-2">{formatNumber(p.volume)}</div>
                      <div className="text-xs tabular-nums text-txt-2">{p.pe ? p.pe.toFixed(1) : "\u2014"}</div>
                    </Link>
                  ))}
                  {peers.length === 0 && (
                    <div className="px-4 py-4 text-xs text-txt-4 text-center">No peer data available</div>
                  )}
                </div>
                </div>
              </div>

              {/* ============================================================
                  SECTION 8: Groups
                  ============================================================ */}
              <div className="mb-10">
                <SectionLabel>Groups / 所屬族群</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {appearedGroups.map(({ name, color }) => (
                    <span
                      key={name}
                      className="px-3.5 py-1.5 rounded-full text-xs font-semibold border"
                      style={{
                        backgroundColor: `${color}18`,
                        borderColor: `${color}40`,
                        color,
                      }}
                    >
                      {name}
                    </span>
                  ))}
                  {appearedGroups.length === 0 && (
                    <span className="text-xs text-txt-4">No group data available</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
