"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";

interface FocusStock {
  code: string;
  name: string;
  close: number;
  changePct: number;
  volume: number;
  majorNet: number;
  streak: number;
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
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(score, 100);
  const color = score >= 80 ? "bg-red" : score >= 60 ? "bg-amber" : score >= 40 ? "bg-blue" : "bg-txt-4";
  return (
    <div className="w-full h-1.5 bg-bg-3 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function FocusClient() {
  const { data, isLoading } = useSWR<FocusData>("/api/focus", fetcher);

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
              交叉比對族群趨勢 + 營收成長 + 法人籌碼 + 技術面，篩選明日值得追蹤標的
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

            {/* Performance Stats — HONEST: only verifiable next-day-still-limit-up rate */}
            {data.performance && data.performance.totalDays > 0 && (
              <div className="bg-bg-1 border border-border rounded-xl p-5">
                <h2 className="text-sm font-bold text-txt-0 mb-1">
                  次日命中率統計
                  <span className="ml-2 text-[10px] font-normal text-txt-4">
                    近 {data.performance.totalDays} 個交易日
                  </span>
                </h2>
                <p className="text-[10px] text-txt-4 mb-3">
                  {data.performance.methodology}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-bg-2 rounded-lg px-3 py-2.5 text-center">
                    <div className="text-xl font-bold tabular-nums text-red">{data.performance.avgNextLimitUpRate}%</div>
                    <div className="text-[10px] text-txt-4">次日續漲停率</div>
                  </div>
                  <div className="bg-bg-2 rounded-lg px-3 py-2.5 text-center">
                    <div className="text-xl font-bold tabular-nums text-amber">{data.performance.totalHits}</div>
                    <div className="text-[10px] text-txt-4">命中次數</div>
                  </div>
                  <div className="bg-bg-2 rounded-lg px-3 py-2.5 text-center">
                    <div className="text-xl font-bold tabular-nums text-blue">{data.performance.totalPicks}</div>
                    <div className="text-[10px] text-txt-4">總推薦數</div>
                  </div>
                  <div className="bg-bg-2 rounded-lg px-3 py-2.5 text-center">
                    <div className="text-xl font-bold tabular-nums text-txt-0">{data.performance.totalDays}</div>
                    <div className="text-[10px] text-txt-4">統計天數</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-txt-4 border-b border-border">
                        <th className="text-left px-2 py-1.5">選股日</th>
                        <th className="text-left px-2 py-1.5">驗證日</th>
                        <th className="text-right px-2 py-1.5">推薦數</th>
                        <th className="text-right px-2 py-1.5">次日漲停</th>
                        <th className="text-right px-2 py-1.5">命中率</th>
                        <th className="text-left px-2 py-1.5">命中標的</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.performance.history.map((h) => (
                        <tr key={h.date} className="border-b border-border/30 hover:bg-bg-2/50">
                          <td className="px-2 py-1.5 text-txt-2 tabular-nums">{h.date}</td>
                          <td className="px-2 py-1.5 text-txt-3 tabular-nums">{h.nextDate}</td>
                          <td className="text-right px-2 py-1.5 text-txt-1 tabular-nums">{h.picks}</td>
                          <td className="text-right px-2 py-1.5 text-txt-1 tabular-nums">{h.nextLimitUpCount}</td>
                          <td className="text-right px-2 py-1.5 tabular-nums">
                            <span className={h.nextLimitUpRate >= 30 ? "text-red" : h.nextLimitUpRate >= 15 ? "text-amber" : "text-txt-3"}>
                              {h.nextLimitUpRate}%
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            {h.bestStock ? (
                              <Link href={`/stock/${h.bestStock.code}`} className="text-txt-2 hover:text-red">
                                {h.bestStock.code} {h.bestStock.name}
                              </Link>
                            ) : <span className="text-txt-4">無</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

            {/* Top Picks */}
            <div className="bg-bg-1 border border-border rounded-xl p-5">
              <h2 className="text-sm font-bold text-txt-0 mb-1">
                精選追蹤標的
                <span className="ml-2 text-[10px] font-normal text-txt-4">綜合評分 ≥ 50</span>
              </h2>
              <p className="text-[10px] text-txt-4 mb-4">
                評分依據：趨勢族群(30) + 營收成長(25-35) + 法人買超(20) + 連板(15) + 龍頭(10)
              </p>

              {data.topPicks.length === 0 ? (
                <div className="text-center py-8 text-txt-3 text-sm">今日無符合條件標的</div>
              ) : (
                <div className="space-y-3">
                  {data.topPicks.map((s) => (
                    <Link
                      key={s.code}
                      href={`/stock/${s.code}`}
                      className="block bg-bg-2/50 border border-border/50 rounded-lg p-4 hover:border-border-hover hover:bg-bg-2 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Left */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-mono text-sm font-bold text-txt-0">{s.code}</span>
                            <span className="text-sm text-txt-1">{s.name}</span>
                            <ScoreBadge score={s.score} />
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

                          {/* Entry/Exit Price Suggestions */}
                          {s.entryAggressive && (
                            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10px]">
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
                        </div>

                        {/* Right — score bar */}
                        <div className="w-20 flex-shrink-0 text-right">
                          <div className="text-lg font-bold tabular-nums text-txt-0 mb-1">{s.score}</div>
                          <ScoreBar score={s.score} />
                          <div className="text-[9px] text-txt-4 mt-1">評分</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Full List */}
            <div className="bg-bg-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="text-sm font-bold text-txt-0">
                  全部漲停股評分
                  <span className="ml-2 text-[10px] font-normal text-txt-4">{data.focusStocks.length} 檔</span>
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
                    {data.focusStocks.map((s) => (
                      <tr key={s.code} className="border-b border-border/50 hover:bg-bg-2/50 transition-colors">
                        <td className="px-3 py-1.5">
                          <Link href={`/stock/${s.code}`} className="hover:underline">
                            <span className="font-mono text-txt-2">{s.code}</span>
                            <span className="ml-1.5 text-txt-1">{s.name}</span>
                          </Link>
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
              以上分析僅供參考，不構成投資建議。投資有風險，請自行判斷。
            </div>
          </>
        )}
      </main>
    </>
  );
}
