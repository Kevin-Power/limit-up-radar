"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { signColor } from "@/lib/format";

interface FocusStock {
  code: string;
  name: string;
  close: number;
  changePct: number;
  group: string;
  groupColor: string;
  score: number;
  tags: string[];
  streak: number;
  streakRisk?: "low" | "medium" | "high";
}

interface FocusData {
  date: string;
  taiex: number;
  taiexChg: number;
  totalLimitUp: number;
  focusStocks: FocusStock[];
  topPicks: FocusStock[];
}

const SCORE_THRESHOLD = 75;

function ScoreBadge({ score }: { score: number }) {
  if (score >= 80)
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red/20 text-red">極強</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber/20 text-amber">強</span>;
}

export default function TodayPlanClient() {
  const { data, isLoading, error } = useSWR<FocusData>("/api/focus", fetcher, {
    revalidateOnFocus: false,
  });

  // Dedupe across topPicks + focusStocks, keep score >= threshold, sort by score desc.
  const plan = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const merged: FocusStock[] = [];
    for (const s of [...(data.topPicks ?? []), ...(data.focusStocks ?? [])]) {
      if (s.score < SCORE_THRESHOLD) continue;
      if (seen.has(s.code)) continue;
      seen.add(s.code);
      merged.push(s);
    }
    merged.sort((a, b) => b.score - a.score);
    return merged;
  }, [data]);

  const apiError = error || (data && "error" in data);

  return (
    <>
      <TopNav />
      <NavBar />
      <main className="max-w-[1000px] mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-0">
            今日 R1 出場清單
            {data && !apiError && (
              <span className="ml-2 text-sm font-normal text-txt-3">{data.date}</span>
            )}
          </h1>
          <p className="text-xs text-txt-4 mt-1 leading-relaxed">
            把已驗證的 R1 策略前移到今日可執行清單（研究 → 執行）。
            篩出評分 ≥ {SCORE_THRESHOLD} 的高分標的，附上隔日進場與出場規則，方便當作行動參考。
          </p>
        </div>

        {/* === Loading === */}
        {isLoading && (
          <div className="space-y-3">
            <div className="text-center py-20 text-txt-3">分析中...</div>
          </div>
        )}

        {/* === Error === */}
        {!isLoading && apiError && (
          <div className="bg-bg-1 border border-border rounded-xl p-8 text-center">
            <p className="text-sm text-txt-2 mb-1">無法載入今日資料</p>
            <p className="text-xs text-txt-4">
              請稍後再試，或回到{" "}
              <Link href="/focus" className="text-red hover:underline">
                明日焦點
              </Link>{" "}
              查看完整分析。
            </p>
          </div>
        )}

        {/* === Loaded === */}
        {!isLoading && !apiError && data && (
          <>
            {/* R1 規則說明 */}
            <div className="bg-bg-1 border border-border rounded-xl p-5">
              <h2 className="text-sm font-bold text-txt-0 mb-3">R1 策略規則</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-bg-2/50 border border-border/50 rounded-lg px-4 py-3">
                  <div className="text-[10px] text-txt-4 mb-1">進場計畫</div>
                  <div className="text-txt-1 font-semibold mb-1">明早 09:00 競價買進</div>
                  <p className="text-[11px] text-txt-3 leading-relaxed">
                    於開盤集合競價以市價或昨收附近掛單進場，不追高。
                  </p>
                </div>
                <div className="bg-bg-2/50 border border-border/50 rounded-lg px-4 py-3">
                  <div className="text-[10px] text-txt-4 mb-1">出場計畫</div>
                  <div className="text-txt-1 font-semibold mb-1">依開盤跳空幅度決定</div>
                  <p className="text-[11px] text-txt-3 leading-relaxed">
                    開盤跳空 <span className="text-red font-semibold">0~5%</span> → 隔日 09:15 賣出；
                    其餘情況 → 後天 09:00 開盤賣出。
                  </p>
                </div>
              </div>
            </div>

            {/* === Empty: 今日無高分標的 === */}
            {plan.length === 0 ? (
              <div className="bg-bg-1 border border-border rounded-xl p-10 text-center">
                <div className="text-3xl mb-3">🛑</div>
                <p className="text-sm font-semibold text-txt-1 mb-1">
                  今日無高分標的，R1 策略今日不進場
                </p>
                <p className="text-xs text-txt-4 mb-4">
                  目前沒有評分 ≥ {SCORE_THRESHOLD} 的標的。空手也是一種紀律。
                </p>
                <Link
                  href="/focus"
                  className="inline-block px-4 py-2 bg-bg-2 border border-border rounded-lg text-xs font-medium text-txt-2 hover:text-red hover:border-red/30 transition-colors"
                >
                  查看完整評分清單
                </Link>
              </div>
            ) : (
              <div className="bg-bg-1 border border-border rounded-xl p-5">
                <h2 className="text-sm font-bold text-txt-0 mb-1">
                  今日可執行清單
                  <span className="ml-2 text-[10px] font-normal text-txt-4">
                    評分 ≥ {SCORE_THRESHOLD} · 共 {plan.length} 檔
                  </span>
                </h2>
                <p className="text-[10px] text-txt-4 mb-4">
                  以下為符合條件的高分標的，套用上方 R1 進出場規則。價位皆為昨收，實際執行以隔日盤面為準。
                </p>

                <div className="space-y-3">
                  {plan.map((s) => (
                    <div
                      key={s.code}
                      className="bg-bg-2/50 border border-border/50 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/stock/${s.code}`}
                            className="flex items-center gap-2 hover:underline"
                          >
                            <span className="font-mono text-sm font-bold text-txt-0">{s.code}</span>
                            <span className="text-sm text-txt-1">{s.name}</span>
                          </Link>
                          <ScoreBadge score={s.score} />
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                            style={{ color: s.groupColor }}
                          >
                            {s.group}
                          </span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-bold tabular-nums text-txt-0">{s.score}</div>
                          <div className="text-[9px] text-txt-4">評分</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] mb-3">
                        <span className="text-txt-2">
                          昨收 <span className="font-semibold text-txt-0 tabular-nums">{s.close}</span>
                        </span>
                        <span className="text-txt-4">|</span>
                        <span className="text-txt-2">
                          今日漲跌{" "}
                          <span
                            className={`font-semibold tabular-nums ${signColor(s.changePct)}`}
                          >
                            {s.changePct > 0 ? "+" : ""}
                            {s.changePct.toFixed(2)}%
                          </span>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-red/5 border border-red/15 rounded px-3 py-2">
                          <div className="text-[9px] text-txt-4 mb-0.5">進場</div>
                          <div className="text-txt-1">明早 09:00 競價買進</div>
                        </div>
                        <div className="bg-blue/5 border border-blue/15 rounded px-3 py-2">
                          <div className="text-[9px] text-txt-4 mb-0.5">R1 出場</div>
                          <div className="text-txt-1 leading-relaxed">
                            跳空 0~5% → 隔日 09:15 賣；否則後天 09:00 開盤賣
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 完整免責 */}
            <div className="bg-bg-1 border border-border rounded-xl p-5">
              <h2 className="text-xs font-bold text-txt-2 mb-2">風險揭露與免責聲明</h2>
              <ul className="space-y-1.5 text-[10px] text-txt-4 leading-relaxed list-disc list-inside">
                <li>本清單僅將既有評分與 R1 規則整理成可執行格式，<strong className="text-txt-3">不重新計算策略、不構成投資建議</strong>。</li>
                <li>歷史回測與統計表現<strong className="text-txt-3">不保證未來結果</strong>，過去績效非未來獲利之承諾。</li>
                <li>所有進出場規則與價位僅供參考，實際成交受開盤跳空、流動性、滑價與交易成本影響。</li>
                <li>投資有風險，盈虧需<strong className="text-txt-3">自行承擔</strong>，請依個人風險承受度與資金規劃審慎判斷。</li>
                <li>本平台為個人研究紀錄，非投顧服務，不對任何投資決策結果負責。</li>
              </ul>
            </div>
          </>
        )}
      </main>
    </>
  );
}
