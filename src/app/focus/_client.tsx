"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import {
  FilterBar,
  passesFilter,
  paramsToFilter,
  filterToParams,
  type FilterState,
} from "./_filter-bar";
import { NarrativeCard, type Narrative } from "./_narrative";
import { IndustryFlowHeatmap, type IndustryFlow } from "./_heatmap";
import { TrackedStockLink } from "./_tracked-link";
import type { RealBacktest } from "@/lib/types";

interface FocusStock {
  code: string;
  name: string;
  close: number;
  changePct: number;
  volume: number;
  majorNet: number;
  streak: number;
  consecutiveUpDays?: number;
  streakRisk?: 'low' | 'medium' | 'high';
  group: string;
  groupColor: string;
  score: number;
  tags: string[];
  revYoY: number | null;
  revMonth: number | null;
  groupDays: number;
  entryAggressive?: number;
  entryPullback?: number;
  stopLoss?: number;
  target1?: number;
  target2?: number;
  open357Low?: number;
  open357Mid?: number;
  open357High?: number;
  isBearish?: boolean;
}

interface TrendingGroup {
  name: string;
  color: string;
  todayCount: number;
  days: number;
}

interface PerformanceDay {
  date: string;
  nextDate: string;
  picks: number;
  nextLimitUpCount: number;
  nextLimitUpRate: number;
  bestStock: { code: string; name: string } | null;
}

interface FocusData {
  date: string;
  taiex: number;
  taiexChg: number;
  totalLimitUp: number;
  trendingGroups: TrendingGroup[];
  focusStocks: FocusStock[];
  topPicks: FocusStock[];
  performance?: {
    history: PerformanceDay[];
    avgNextLimitUpRate: number;
    totalDays: number;
    totalPicks: number;
    totalHits: number;
    methodology: string;
  };
  realBacktest?: RealBacktest | null;
  bearishEngulfing?: BearishEngulfingStock[];
  industryFlow?: IndustryFlow;
}

interface BearishEngulfingStock {
  code: string;
  name: string;
  today_open: number;
  today_close: number;
  today_high: number;
  today_low: number;
  prev_high: number;
  prev_low: number;
  change_pct: number;
  volume: number;
  market: string;
}

function CopyReportButton() {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCopy() {
    setLoading(true);
    try {
      const res = await fetch("/api/daily-report");
      const data = await res.json();
      if (data.text) {
        await navigator.clipboard.writeText(data.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  return (
    <button
      onClick={handleCopy}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-2 border border-border rounded-lg text-xs font-medium text-txt-2 hover:text-red hover:border-red/30 transition-colors disabled:opacity-50"
    >
      {copied ? "已複製!" : loading ? "產生中..." : "一鍵複製每日分析文"}
    </button>
  );
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 80) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red/20 text-red">極強</span>;
  if (score >= 60) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber/20 text-amber">強</span>;
  if (score >= 40) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue/20 text-blue">中</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-bg-3 text-txt-4">弱</span>;
}

function StreakRiskBadge({ risk, streak }: { risk?: 'low' | 'medium' | 'high'; streak: number }) {
  if (!risk || risk === 'low') return null;
  if (risk === 'medium') return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber/20 text-amber border border-amber/30">
      ⚠️{streak}連板
    </span>
  );
  return (
    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red/20 text-red border border-red/30">
      🔥{streak}連板高追
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(score, 100));
  const color = score >= 80 ? "bg-red" : score >= 60 ? "bg-amber" : score >= 40 ? "bg-blue" : "bg-txt-4";
  return (
    <div className="w-full h-1.5 bg-bg-3 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function FocusClient() {
  const { data, isLoading } = useSWR<FocusData>("/api/focus", fetcher);
  const { data: narrative } = useSWR<Narrative>("/api/narrative/latest", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  // === Filter state synced with URL query params ===
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState<FilterState>(() =>
    paramsToFilter(new URLSearchParams(searchParams?.toString() ?? ""))
  );

  // Push filter changes back to URL (replace, no history entry)
  // Filter state is the source of truth; we write one-way to URL.
  useEffect(() => {
    const next = filterToParams(filter).toString();
    router.replace(next ? `/focus?${next}` : "/focus", { scroll: false });
  }, [filter, router]);

  // Derive available groups from today's stocks (unique, sorted by appearance order)
  const availableGroups = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const s of data.focusStocks) {
      if (!seen.has(s.group)) {
        seen.add(s.group);
        ordered.push(s.group);
      }
    }
    return ordered;
  }, [data]);

  // Apply filter to both lists
  const filteredTopPicks = useMemo(
    () => (data?.topPicks ?? []).filter((s) => passesFilter(s, filter)),
    [data?.topPicks, filter]
  );
  const filteredFocusStocks = useMemo(
    () => (data?.focusStocks ?? []).filter((s) => passesFilter(s, filter)),
    [data?.focusStocks, filter]
  );

  return (
    <>
      <TopNav />
      <NavBar />
      <main className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-txt-0">
              明日焦點
              {data && <span className="ml-2 text-sm font-normal text-txt-3">{data.date}</span>}
            </h1>
            <p className="text-xs text-txt-4 mt-1">
              交叉比對族群趨勢 + 營收成長 + 法人籌碼 + 技術面，整理隔日觀察名單與評分依據（研究紀錄，非建議）
            </p>
          </div>
          <CopyReportButton />
        </div>

        {isLoading && <div className="text-center py-20 text-txt-3">分析中...</div>}

        {data && (
          <>
            {/* Market Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-bg-1 border border-border rounded-lg px-4 py-3 text-center">
                <div className="text-lg font-bold tabular-nums text-txt-0">{data.taiex.toLocaleString()}</div>
                <div className="text-[10px] text-txt-4">TAIEX</div>
                <div className={`text-xs font-semibold tabular-nums ${data.taiexChg > 0 ? "text-red" : "text-green"}`}>
                  {data.taiexChg > 0 ? "+" : ""}{data.taiexChg.toFixed(2)}%
                </div>
              </div>
              <div className="bg-bg-1 border border-border rounded-lg px-4 py-3 text-center">
                <div className="text-lg font-bold tabular-nums text-red">{data.totalLimitUp}</div>
                <div className="text-[10px] text-txt-4">今日漲停</div>
              </div>
              <div className="bg-bg-1 border border-border rounded-lg px-4 py-3 text-center">
                <div className="text-lg font-bold tabular-nums text-amber">{data.trendingGroups.length}</div>
                <div className="text-[10px] text-txt-4">延續族群</div>
              </div>
              <div className="bg-bg-1 border border-border rounded-lg px-4 py-3 text-center">
                <div className="text-lg font-bold tabular-nums text-blue">{data.topPicks.length}</div>
                <div className="text-[10px] text-txt-4">精選標的</div>
              </div>
            </div>

            {/* AI Narrative — produced by Claude Code session */}
            {narrative && (
              <NarrativeCard narrative={narrative} />
            )}

            {/* REAL Backtest — fetched from TWSE next-day OHLC */}
            {data.realBacktest && data.realBacktest.totalSamples > 0 && (
              <div className="bg-gradient-to-br from-red/5 via-amber/5 to-red/5 border-2 border-red/30 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-red text-white text-[10px] font-bold rounded">真實回測</span>
                  <h2 className="text-sm font-bold text-txt-0">
                    隔日真實 OHLC 勝率
                  </h2>
                </div>
                <p className="text-[10px] text-txt-3 mb-4">
                  {data.realBacktest.methodology} · {data.realBacktest.totalDays} 天 · {data.realBacktest.totalSamples} 個樣本
                  · <span className="text-amber">未含交易成本與滑價，統計供研究；含成本分布見統計頁「誠實統計」</span>
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-bg-1 border border-red/20 rounded-lg px-3 py-3 text-center">
                    <div className="text-[10px] text-txt-4 mb-1">隔日開盤賣</div>
                    <div className="text-2xl font-bold tabular-nums text-red">{data.realBacktest.avgOpenWinRate}%</div>
                    <div className="text-[10px] text-txt-3">勝率</div>
                  </div>
                  <div className="bg-bg-1 border border-amber/20 rounded-lg px-3 py-3 text-center">
                    <div className="text-[10px] text-txt-4 mb-1">隔日開盤賣</div>
                    <div className={`text-2xl font-bold tabular-nums ${data.realBacktest.avgOpenReturn > 0 ? "text-red" : "text-green"}`}>
                      {data.realBacktest.avgOpenReturn > 0 ? "+" : ""}{data.realBacktest.avgOpenReturn}%
                    </div>
                    <div className="text-[10px] text-txt-3">平均報酬</div>
                  </div>
                  <div className="bg-bg-1 border border-blue/20 rounded-lg px-3 py-3 text-center">
                    <div className="text-[10px] text-txt-4 mb-1">隔日收盤賣</div>
                    <div className="text-2xl font-bold tabular-nums text-blue">{data.realBacktest.avgCloseWinRate}%</div>
                    <div className="text-[10px] text-txt-3">勝率</div>
                  </div>
                  <div className="bg-bg-1 border border-blue/20 rounded-lg px-3 py-3 text-center">
                    <div className="text-[10px] text-txt-4 mb-1">隔日收盤賣</div>
                    <div className={`text-2xl font-bold tabular-nums ${data.realBacktest.avgCloseReturn > 0 ? "text-red" : "text-green"}`}>
                      {data.realBacktest.avgCloseReturn > 0 ? "+" : ""}{data.realBacktest.avgCloseReturn}%
                    </div>
                    <div className="text-[10px] text-txt-3">平均報酬</div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-txt-4 border-b border-border">
                        <th className="text-left px-2 py-1.5">選股日</th>
                        <th className="text-left px-2 py-1.5">驗證日</th>
                        <th className="text-right px-2 py-1.5">樣本</th>
                        <th className="text-right px-2 py-1.5">開盤勝</th>
                        <th className="text-right px-2 py-1.5">開盤%</th>
                        <th className="text-right px-2 py-1.5">收盤勝</th>
                        <th className="text-right px-2 py-1.5">收盤%</th>
                        <th className="text-left px-2 py-1.5">最佳</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.realBacktest.history.map((h) => (
                        <tr key={h.date} className="border-b border-border/30 hover:bg-bg-2/30">
                          <td className="px-2 py-1.5 text-txt-2 tabular-nums">{h.date}</td>
                          <td className="px-2 py-1.5 text-txt-3 tabular-nums">{h.nextDate}</td>
                          <td className="text-right px-2 py-1.5 text-txt-1 tabular-nums">{h.fetched}</td>
                          <td className="text-right px-2 py-1.5 tabular-nums">
                            <span className={h.openWinRate >= 60 ? "text-red font-semibold" : h.openWinRate >= 40 ? "text-amber" : "text-green"}>{h.openWinRate}%</span>
                          </td>
                          <td className="text-right px-2 py-1.5 tabular-nums">
                            <span className={h.avgOpenPct > 0 ? "text-red" : "text-green"}>
                              {h.avgOpenPct > 0 ? "+" : ""}{h.avgOpenPct}%
                            </span>
                          </td>
                          <td className="text-right px-2 py-1.5 tabular-nums">
                            <span className={h.closeWinRate >= 60 ? "text-red font-semibold" : h.closeWinRate >= 40 ? "text-amber" : "text-green"}>{h.closeWinRate}%</span>
                          </td>
                          <td className="text-right px-2 py-1.5 tabular-nums">
                            <span className={h.avgClosePct > 0 ? "text-red" : "text-green"}>
                              {h.avgClosePct > 0 ? "+" : ""}{h.avgClosePct}%
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            {h.bestStock ? (
                              <Link href={`/stock/${h.bestStock.code}`} className="text-txt-2 hover:text-red">
                                {h.bestStock.code} <span className="text-red">+{h.bestStock.closePct}%</span>
                              </Link>
                            ) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ⚠️ 空吞注意股 (Bearish Engulfing) */}
            {data.bearishEngulfing && data.bearishEngulfing.length > 0 && (
              <div className="bg-gradient-to-br from-green/5 via-bg-1 to-green/5 border-2 border-green/30 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-green">
                    ⚠️ 空吞注意股
                    <span className="ml-2 text-[10px] font-normal text-txt-3">
                      今開破昨高 + 今收破昨低 (極弱反轉訊號)
                    </span>
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green/20 text-green">
                    {data.bearishEngulfing.length} 檔
                  </span>
                </div>
                <p className="text-[10px] text-txt-4 mb-3">
                  以下個股今日跳空高開後爆殺收破前日低點。<strong className="text-green">已持有者強烈停損</strong>；
                  <strong className="text-amber">追價者切勿進場</strong>。
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-txt-4 border-b border-border">
                        <th className="text-left px-2 py-1.5">代號</th>
                        <th className="text-left px-2 py-1.5">名稱</th>
                        <th className="text-right px-2 py-1.5">今開</th>
                        <th className="text-right px-2 py-1.5">今收</th>
                        <th className="text-right px-2 py-1.5">昨高</th>
                        <th className="text-right px-2 py-1.5">昨低</th>
                        <th className="text-right px-2 py-1.5">漲跌</th>
                        <th className="text-right px-2 py-1.5">成交張</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bearishEngulfing.slice(0, 20).map((b) => (
                        <tr key={b.code} className="border-b border-border/30 hover:bg-bg-2/50">
                          <td className="px-2 py-1.5">
                            <Link href={`/stock/${b.code}`} className="font-mono font-bold text-txt-1 hover:text-green">
                              {b.code}
                            </Link>
                          </td>
                          <td className="px-2 py-1.5 text-txt-2">{b.name}</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-txt-1">{b.today_open}</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-green font-bold">{b.today_close}</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-txt-3">{b.prev_high}</td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-txt-3">{b.prev_low}</td>
                          <td className="text-right px-2 py-1.5 tabular-nums">
                            <span className={b.change_pct < 0 ? "text-green font-bold" : "text-red"}>
                              {b.change_pct > 0 ? "+" : ""}{b.change_pct}%
                            </span>
                          </td>
                          <td className="text-right px-2 py-1.5 tabular-nums text-txt-3">
                            {Math.round(b.volume / 1000).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.bearishEngulfing.length > 20 && (
                  <p className="text-[10px] text-txt-4 text-center mt-2">
                    顯示前 20 檔（共 {data.bearishEngulfing.length} 檔，依成交量降序）
                  </p>
                )}
              </div>
            )}

            {/* Trending Groups */}
            {data.trendingGroups.length > 0 && (
              <div className="bg-bg-1 border border-border rounded-xl p-5">
                <h2 className="text-sm font-bold text-txt-0 mb-3">
                  延續性族群
                  <span className="ml-2 text-[10px] font-normal text-txt-4">近 3 日重複出現</span>
                </h2>
                <div className="flex flex-wrap gap-2">
                  {data.trendingGroups.map((g) => (
                    <div
                      key={g.name}
                      className="flex items-center gap-2 px-3 py-2 bg-bg-2 border border-border rounded-lg"
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                      <span className="text-xs font-semibold text-txt-1">{g.name}</span>
                      <span className="text-[10px] text-txt-4">{g.todayCount} 檔</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber/15 text-amber">
                        {g.days} 天
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Industry flow heatmap */}
            {data.industryFlow && data.industryFlow.dates.length > 0 && (
              <IndustryFlowHeatmap flow={data.industryFlow} />
            )}

            {/* Top Picks */}
            <div className="bg-bg-1 border border-border rounded-xl p-5">
              <h2 className="text-sm font-bold text-txt-0 mb-1">
                精選追蹤標的
                <span className="ml-2 text-[10px] font-normal text-txt-4">綜合評分 ≥ 50</span>
              </h2>
              <p className="text-[10px] text-txt-4 mb-4">
                評分依據：趨勢族群(30) + 營收成長(25-35) + 法人買超(25) + 連板(6-30) + 龍頭(10)
              </p>

              <div className="mb-4">
                <FilterBar
                  state={filter}
                  onChange={setFilter}
                  availableGroups={availableGroups}
                  visibleCount={filteredFocusStocks.length}
                  totalCount={data.focusStocks.length}
                />
              </div>

              {filteredTopPicks.length === 0 ? (
                <div className="text-center py-8 text-txt-3 text-sm">
                  {data.topPicks.length === 0
                    ? "今日無符合條件標的"
                    : "目前篩選條件下無符合標的"}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTopPicks.map((s) => (
                    <TrackedStockLink
                      key={s.code}
                      code={s.code}
                      name={s.name}
                      source="top_pick"
                      className="block bg-bg-2/50 border border-border/50 rounded-lg p-4 hover:border-border-hover hover:bg-bg-2 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Left */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className="font-mono text-sm font-bold text-txt-0">{s.code}</span>
                            <span className="text-sm text-txt-1">{s.name}</span>
                            <ScoreBadge score={s.score} />
                            <StreakRiskBadge risk={s.streakRisk} streak={s.streak} />
                          </div>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            {s.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-bg-3 text-txt-3"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          {/* AI per-stock comment */}
                          {narrative?.stocks?.[s.code] && (
                            <div className="mb-2 px-2 py-1.5 bg-amber/5 border-l-2 border-amber/40 rounded-r italic text-[11px] text-txt-2 leading-relaxed">
                              💬 {narrative.stocks[s.code]}
                            </div>
                          )}

                          {/* Metrics row */}
                          <div className="flex flex-wrap items-center gap-3 text-[11px]">
                            <span className="text-txt-2">
                              收盤 <span className="font-semibold text-txt-0">{s.close}</span>
                            </span>
                            <span className="text-txt-4">|</span>
                            <span className="text-txt-2">
                              族群 <span className="font-semibold" style={{ color: s.groupColor }}>{s.group}</span>
                              {s.groupDays >= 2 && (
                                <span className="ml-1 text-amber">({s.groupDays}天)</span>
                              )}
                            </span>
                            {s.revYoY != null && (
                              <>
                                <span className="text-txt-4">|</span>
                                <span className="text-txt-2">
                                  營收YoY{" "}
                                  <span className={`font-semibold ${s.revYoY > 0 ? "text-red" : "text-green"}`}>
                                    {s.revYoY > 0 ? "+" : ""}{s.revYoY.toFixed(1)}%
                                  </span>
                                </span>
                              </>
                            )}
                            {s.majorNet !== 0 && (
                              <>
                                <span className="text-txt-4">|</span>
                                <span className="text-txt-2">
                                  主力{" "}
                                  <span className={`font-semibold ${s.majorNet > 0 ? "text-red" : "text-green"}`}>
                                    {s.majorNet > 0 ? "+" : ""}{(s.majorNet / 1000).toFixed(0)}張
                                  </span>
                                </span>
                              </>
                            )}
                          </div>

                          {/* Entry/Exit reference levels (rule-based, personal record) */}
                          {s.entryAggressive != null && (
                            <p className="mt-2.5 text-[9px] text-txt-4">
                              參考價位為固定規則（收盤 +0.5%／−3%／−7%／+5%／+10%），屬個人紀錄參考區間，非預測或建議
                            </p>
                          )}
                          {s.entryAggressive != null && (
                            <div className="mt-1 grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10px]">
                              <div className="bg-red/10 rounded px-1.5 py-1 text-center">
                                <div className="text-txt-4 text-[9px]">追價</div>
                                <div className="text-red font-bold tabular-nums">{s.entryAggressive}</div>
                              </div>
                              <div className="bg-blue/10 rounded px-1.5 py-1 text-center">
                                <div className="text-txt-4 text-[9px]">承接</div>
                                <div className="text-blue font-bold tabular-nums">{s.entryPullback}</div>
                              </div>
                              <div className="bg-green/10 rounded px-1.5 py-1 text-center">
                                <div className="text-txt-4 text-[9px]">停損</div>
                                <div className="text-green font-bold tabular-nums">{s.stopLoss}</div>
                              </div>
                              <div className="bg-amber/10 rounded px-1.5 py-1 text-center">
                                <div className="text-txt-4 text-[9px]">目標1</div>
                                <div className="text-amber font-bold tabular-nums">{s.target1}</div>
                              </div>
                              <div className="bg-amber/15 rounded px-1.5 py-1 text-center">
                                <div className="text-txt-4 text-[9px]">目標2</div>
                                <div className="text-amber font-bold tabular-nums">{s.target2}</div>
                              </div>
                            </div>
                          )}
                          {/* 357 次日開盤觀察價位 */}
                          {s.open357Low != null && s.open357Mid != null && s.open357High != null && (
                            <div className="mt-2">
                              <p className="text-[9px] text-txt-4 mb-1">次日開盤 357 觀察價（+3%/+5%/+7%）</p>
                              <div className="grid grid-cols-3 gap-1 text-[10px]">
                                <div className="bg-bg-3 rounded px-1.5 py-1 text-center">
                                  <div className="text-txt-4 text-[9px]">低開觀察</div>
                                  <div className="text-txt-2 font-bold tabular-nums">{s.open357Low}</div>
                                </div>
                                <div className="bg-amber/10 rounded px-1.5 py-1 text-center">
                                  <div className="text-txt-4 text-[9px]">強勢追價</div>
                                  <div className="text-amber font-bold tabular-nums">{s.open357Mid}</div>
                                </div>
                                <div className="bg-red/10 rounded px-1.5 py-1 text-center">
                                  <div className="text-txt-4 text-[9px]">超強拉抬</div>
                                  <div className="text-red font-bold tabular-nums">{s.open357High}</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right — score bar */}
                        <div className="w-20 flex-shrink-0 text-right">
                          <div className="text-lg font-bold tabular-nums text-txt-0 mb-1">{s.score}</div>
                          <ScoreBar score={s.score} />
                          <div className="text-[9px] text-txt-4 mt-1">評分</div>
                        </div>
                      </div>
                    </TrackedStockLink>
                  ))}
                </div>
              )}
            </div>

            {/* Full List */}
            <div className="bg-bg-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="text-sm font-bold text-txt-0">
                  全部漲停股評分
                  <span className="ml-2 text-[10px] font-normal text-txt-4">
                    {filteredFocusStocks.length}/{data.focusStocks.length} 檔
                  </span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-bg-2 text-txt-3 border-b border-border">
                      <th className="text-left px-3 py-2">股票</th>
                      <th className="text-center px-2 py-2">評分</th>
                      <th className="text-left px-2 py-2">族群</th>
                      <th className="text-right px-2 py-2">收盤</th>
                      <th className="text-right px-2 py-2">營收YoY</th>
                      <th className="text-right px-2 py-2">主力</th>
                      <th className="text-left px-2 py-2">標籤</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFocusStocks.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-txt-3 text-sm">
                          目前篩選條件下無符合標的
                        </td>
                      </tr>
                    )}
                    {filteredFocusStocks.map((s) => (
                      <tr key={s.code} className="border-b border-border/50 hover:bg-bg-2/50 transition-colors">
                        <td className="px-3 py-1.5">
                          <TrackedStockLink code={s.code} name={s.name} source="full_list" className="hover:underline">
                            <span className="font-mono text-txt-2">{s.code}</span>
                            <span className="ml-1.5 text-txt-1">{s.name}</span>
                          </TrackedStockLink>
                        </td>
                        <td className="text-center px-2 py-1.5">
                          <ScoreBadge score={s.score} />
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="text-[10px]" style={{ color: s.groupColor }}>{s.group}</span>
                        </td>
                        <td className="text-right px-2 py-1.5 tabular-nums text-txt-1">{s.close}</td>
                        <td className="text-right px-2 py-1.5 tabular-nums">
                          {s.revYoY != null ? (
                            <span className={s.revYoY > 0 ? "text-red" : "text-green"}>
                              {s.revYoY > 0 ? "+" : ""}{s.revYoY.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-txt-4">-</span>
                          )}
                        </td>
                        <td className="text-right px-2 py-1.5 tabular-nums">
                          <span className={s.majorNet > 0 ? "text-red" : s.majorNet < 0 ? "text-green" : "text-txt-4"}>
                            {s.majorNet !== 0 ? `${(s.majorNet / 1000).toFixed(0)}張` : "-"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            {s.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="px-1 py-0.5 rounded text-[8px] bg-bg-3 text-txt-4">{tag}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="text-[10px] text-txt-4 text-center py-2">
              以上為個人研究紀錄與統計整理，非投顧服務，不構成投資建議。投資有風險，請自行判斷。
            </div>
          </>
        )}
      </main>
    </>
  );
}
