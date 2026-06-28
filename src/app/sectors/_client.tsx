"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { IndustryFlowHeatmap, type IndustryFlow } from "../focus/_heatmap";

interface FocusStock {
  code: string;
  name: string;
  close: number;
  changePct: number;
  majorNet: number;
  group: string;
  groupColor: string;
  groupDays: number;
}

interface TrendingGroup {
  name: string;
  color: string;
  todayCount: number;
  days: number;
}

interface FocusData {
  date: string;
  trendingGroups: TrendingGroup[];
  focusStocks: FocusStock[];
  industryFlow?: IndustryFlow;
}

interface SectorAgg {
  name: string;
  color: string;
  count: number; // 漲停/聚焦檔數
  avgChangePct: number; // 平均漲幅
  netFlow: number; // 資金集中度 (sum majorNet)
  days: number; // 趨勢天數
  strength: number; // 綜合強弱分數
}

type SortKey = "strength" | "count" | "avgChangePct" | "netFlow" | "days";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "strength", label: "綜合強弱" },
  { key: "count", label: "檔數" },
  { key: "avgChangePct", label: "平均漲幅" },
  { key: "netFlow", label: "資金集中度" },
  { key: "days", label: "趨勢天數" },
];

/**
 * Pure helper: aggregate focus stocks into per-sector stats.
 * Exported for testability.
 */
export function aggregateSectors(
  focusStocks: FocusStock[],
  trendingGroups: TrendingGroup[]
): SectorAgg[] {
  const daysByGroup = new Map<string, number>();
  for (const g of trendingGroups) daysByGroup.set(g.name, g.days);

  const buckets = new Map<
    string,
    { color: string; count: number; sumChange: number; netFlow: number }
  >();

  for (const s of focusStocks) {
    const b = buckets.get(s.group) ?? {
      color: s.groupColor,
      count: 0,
      sumChange: 0,
      netFlow: 0,
    };
    b.count += 1;
    b.sumChange += s.changePct;
    b.netFlow += s.majorNet;
    // groupDays travels with the stock; keep the max seen as fallback
    if (!daysByGroup.has(s.group)) daysByGroup.set(s.group, s.groupDays);
    buckets.set(s.group, b);
  }

  const aggs: SectorAgg[] = [];
  for (const [name, b] of buckets) {
    const avgChangePct = b.count > 0 ? b.sumChange / b.count : 0;
    const days = daysByGroup.get(name) ?? 1;
    aggs.push({
      name,
      color: b.color,
      count: b.count,
      avgChangePct,
      netFlow: b.netFlow,
      days,
      strength: 0, // filled below
    });
  }

  // Composite strength: normalize each metric to 0..1 then weight.
  const maxCount = Math.max(1, ...aggs.map((a) => a.count));
  const maxChange = Math.max(1, ...aggs.map((a) => a.avgChangePct));
  const maxFlow = Math.max(1, ...aggs.map((a) => Math.abs(a.netFlow)));
  const maxDays = Math.max(1, ...aggs.map((a) => a.days));

  for (const a of aggs) {
    const nCount = a.count / maxCount;
    const nChange = a.avgChangePct / maxChange;
    const nFlow = a.netFlow / maxFlow; // can be negative
    const nDays = a.days / maxDays;
    a.strength =
      nCount * 0.4 + nChange * 0.25 + nFlow * 0.2 + nDays * 0.15;
  }

  return aggs;
}

function sortSectors(aggs: SectorAgg[], key: SortKey): SectorAgg[] {
  return [...aggs].sort((a, b) => {
    switch (key) {
      case "count":
        return b.count - a.count;
      case "avgChangePct":
        return b.avgChangePct - a.avgChangePct;
      case "netFlow":
        return b.netFlow - a.netFlow;
      case "days":
        return b.days - a.days;
      default:
        return b.strength - a.strength;
    }
  });
}

function StrengthBar({ ratio, color }: { ratio: number; color: string }) {
  const pct = Math.max(2, Math.min(100, ratio * 100));
  return (
    <div className="w-full h-2 bg-bg-3 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function SectorsClient() {
  const { data, isLoading, error } = useSWR<FocusData>("/api/focus", fetcher);
  const [sortKey, setSortKey] = useState<SortKey>("strength");

  // 404 = no daily data yet -> show friendly empty state, not a hard error.
  const isNoData = error instanceof Error && error.message === "404";
  const isRealError = !!error && !isNoData;

  const aggs = useMemo(
    () =>
      data && Array.isArray(data.focusStocks)
        ? aggregateSectors(data.focusStocks, data.trendingGroups ?? [])
        : [],
    [data]
  );

  const sorted = useMemo(() => sortSectors(aggs, sortKey), [aggs, sortKey]);

  // Max strength for relative bar scaling
  const maxStrength = useMemo(
    () => Math.max(0.0001, ...aggs.map((a) => a.strength)),
    [aggs]
  );

  return (
    <>
      <TopNav />
      <NavBar />
      <main id="main" className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-0">
            今日族群強弱榜
            {data && (
              <span className="ml-2 text-sm font-normal text-txt-3">
                {data.date}
              </span>
            )}
          </h1>
          <p className="text-xs text-txt-4 mt-1">
            依今日漲停股聚合各族群的檔數、平均漲幅、主力資金集中度與趨勢天數，量化各族群強弱（研究紀錄，非建議）
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-20 text-txt-3">載入族群資料中...</div>
        )}

        {/* Error */}
        {isRealError && !isLoading && (
          <div className="bg-bg-1 border border-red/30 rounded-xl p-8 text-center">
            <p className="text-sm text-red font-semibold mb-1">載入失敗</p>
            <p className="text-xs text-txt-4">
              無法取得族群資料，請稍後重新整理。
            </p>
          </div>
        )}

        {/* Empty (no daily data, or data present but no sectors) */}
        {!isLoading && !isRealError && (isNoData || (data && aggs.length === 0)) && (
          <div className="bg-bg-1 border border-border rounded-xl p-10 text-center">
            <p className="text-sm text-txt-2 font-semibold mb-1">
              今日尚無族群資料
            </p>
            <p className="text-xs text-txt-4">
              今日可能無漲停股或資料尚未更新。可先到{" "}
              <a href="/focus" className="text-red hover:underline">
                明日焦點
              </a>{" "}
              查看完整評分。
            </p>
          </div>
        )}

        {/* Content */}
        {data && !isLoading && aggs.length > 0 && (
          <>
            {/* Sort toggle */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-txt-4">排序依據</span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSortKey(opt.key)}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border before:absolute before:left-0 before:right-0 before:top-1/2 before:-translate-y-1/2 before:min-h-[44px] before:content-[''] ${
                    sortKey === opt.key
                      ? "bg-red/15 text-red border-red/30"
                      : "bg-bg-2 text-txt-3 border-border hover:text-txt-1"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Sector ranking */}
            <div className="space-y-2.5">
              {sorted.map((a, idx) => (
                <div
                  key={a.name}
                  className="bg-bg-1 border border-border rounded-xl p-4"
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <span className="w-7 text-center text-sm font-bold tabular-nums text-txt-3 flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: a.color }}
                    />
                    <span className="text-sm font-semibold text-txt-0">
                      {a.name}
                    </span>
                    {a.days >= 2 && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber/15 text-amber">
                        {a.days} 天延續
                      </span>
                    )}
                  </div>

                  {/* Strength bar */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1">
                      <StrengthBar
                        ratio={a.strength / maxStrength}
                        color={a.color}
                      />
                    </div>
                    <span className="text-[10px] text-txt-4 tabular-nums w-12 text-right">
                      強度 {(a.strength * 100).toFixed(0)}
                    </span>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="bg-bg-2/50 rounded-lg px-2 py-2">
                      <div className="text-base font-bold tabular-nums text-txt-0">
                        {a.count}
                      </div>
                      <div className="text-[10px] text-txt-4">漲停檔數</div>
                    </div>
                    <div className="bg-bg-2/50 rounded-lg px-2 py-2">
                      <div
                        className={`text-base font-bold tabular-nums ${
                          a.avgChangePct > 0
                            ? "text-red"
                            : a.avgChangePct < 0
                              ? "text-green"
                              : "text-txt-3"
                        }`}
                      >
                        {a.avgChangePct > 0 ? "+" : ""}
                        {a.avgChangePct.toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-txt-4">平均漲幅</div>
                    </div>
                    <div className="bg-bg-2/50 rounded-lg px-2 py-2">
                      <div
                        className={`text-base font-bold tabular-nums ${
                          a.netFlow > 0
                            ? "text-red"
                            : a.netFlow < 0
                              ? "text-green"
                              : "text-txt-3"
                        }`}
                      >
                        {a.netFlow > 0 ? "+" : ""}
                        {(a.netFlow / 1000).toFixed(0)}
                      </div>
                      <div className="text-[10px] text-txt-4">資金集中(張)</div>
                    </div>
                    <div className="bg-bg-2/50 rounded-lg px-2 py-2">
                      <div className="text-base font-bold tabular-nums text-txt-0">
                        {a.days}
                      </div>
                      <div className="text-[10px] text-txt-4">趨勢天數</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Industry flow heatmap (optional 7-day visual) */}
            {data.industryFlow && data.industryFlow.dates.length > 0 && (
              <IndustryFlowHeatmap flow={data.industryFlow} />
            )}

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
