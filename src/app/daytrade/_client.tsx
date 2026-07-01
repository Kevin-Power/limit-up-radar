"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { fetcher } from "@/lib/fetcher";
import { signColor } from "@/lib/format";
import { formatNumber } from "@/lib/utils";
import { SkeletonBox } from "@/components/Skeleton";

interface Row {
  code: string;
  name: string;
  industry: string;
  group: string;
  change_pct: number | null;
  volume: number | null;
  streak: number;
  amplitudePct: number;
  closeVsOpenPct: number;
  morningPct: number;
  closePosition: number;
  hod: number;
  lod: number;
}

interface Resp {
  available: boolean;
  date: string | null;
  count: number;
  rows: Row[];
}

type SortKey = "amplitudePct" | "morningPct" | "closePosition" | "closeVsOpenPct";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "amplitudePct", label: "振幅" },
  { key: "morningPct", label: "開盤半小時" },
  { key: "closeVsOpenPct", label: "相對開盤" },
  { key: "closePosition", label: "尾盤位置" },
];

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

export default function DaytradeClient() {
  const { data, error } = useSWR<Resp>("/api/daytrade", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });
  const [sort, setSort] = useState<SortKey>("amplitudePct");

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    return [...data.rows].sort((a, b) => b[sort] - a[sort]);
  }, [data, sort]);

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <TopNav />
      <NavBar />
      <main id="main" className="flex-1 overflow-y-auto">
        <div className="container-page-wide py-6 animate-fade-in">
          {/* Header */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block px-2 py-0.5 rounded-full bg-amber/10 text-amber text-[10px] font-semibold">當沖</span>
              <h1 className="text-2xl font-extrabold text-txt-0 tracking-tight">當沖速覽 · 分時型態</h1>
            </div>
            <p className="text-sm text-txt-3 max-w-2xl leading-relaxed">
              以「最近一個完整分時收錄交易日」為準，列出當日有 1 分 K 分時資料的個股，並用當沖視角指標排序：
              <span className="text-txt-1">振幅</span>（波動大小）、
              <span className="text-txt-1">開盤半小時強度</span>、
              <span className="text-txt-1">尾盤位置</span>（收盤落在當日高低區間的位置）。
            </p>
          </div>

          {error ? (
            <div className="bg-bg-1 border border-border rounded-lg py-16 text-center">
              <p className="text-sm font-bold text-red mb-1">資料無法載入</p>
              <p className="text-xs text-txt-3">請稍後再試</p>
            </div>
          ) : !data ? (
            <SkeletonBox className="w-full h-[420px] rounded-lg" />
          ) : !data.available || rows.length === 0 ? (
            <div className="bg-bg-1 border border-border rounded-lg py-16 text-center">
              <p className="text-sm text-txt-3">目前無分時收錄資料</p>
              <p className="text-[11px] text-txt-4 mt-1">分時走勢僅收錄部分精選標的與交易日</p>
            </div>
          ) : (
            <>
              {/* Meta + sort */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="text-xs text-txt-3">
                  分時資料日 <span className="text-txt-1 font-semibold tabular-nums">{data.date?.replace(/-/g, "/")}</span>
                  <span className="text-txt-4"> · 共 {rows.length} 檔 · 1 分 K · 毛價</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-txt-4 mr-1">排序</span>
                  {SORTS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSort(s.key)}
                      className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                        sort === s.key
                          ? "bg-amber/15 text-amber border-amber/30 font-semibold"
                          : "bg-bg-2 text-txt-3 border-border hover:text-txt-1"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <div className="border border-border rounded-xl overflow-hidden min-w-[720px]">
                  <div className="grid grid-cols-[0.5fr_1.4fr_1.1fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-0 px-4 py-2.5 bg-bg-2 border-b border-border">
                    {["#", "代號 / 名稱", "族群", "收盤%", "相對開盤", "振幅", "開盤半小時", "尾盤位置"].map((h) => (
                      <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  {rows.map((r, i) => (
                    <Link
                      key={r.code}
                      href={`/stock/${r.code}`}
                      className="grid grid-cols-[0.5fr_1.4fr_1.1fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-0 px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="text-[10px] tabular-nums text-txt-4">{i + 1}</div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-txt-0 truncate">
                          {r.name}
                          {r.streak > 1 && <span className="ml-1 text-[9px] text-red">{r.streak}板</span>}
                        </div>
                        <div className="text-[10px] font-mono text-txt-4">{r.code} · {r.industry}</div>
                      </div>
                      <div className="text-[11px] text-txt-3 truncate pr-2">{r.group || "—"}</div>
                      <div className={`text-xs font-semibold tabular-nums ${r.change_pct != null ? signColor(r.change_pct) : "text-txt-4"}`}>
                        {r.change_pct != null ? pct(r.change_pct) : "—"}
                      </div>
                      <div className={`text-xs font-semibold tabular-nums ${signColor(r.closeVsOpenPct)}`}>{pct(r.closeVsOpenPct)}</div>
                      <div className="text-xs font-bold tabular-nums text-txt-1">{r.amplitudePct.toFixed(2)}%</div>
                      <div className={`text-xs font-semibold tabular-nums ${signColor(r.morningPct)}`}>{pct(r.morningPct)}</div>
                      <div className={`text-xs font-semibold tabular-nums ${r.closePosition >= 0.5 ? "text-red" : "text-green"}`}>
                        {Math.round(r.closePosition * 100)}%
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              <p className="mt-4 text-[10px] text-txt-4 leading-relaxed max-w-3xl">
                分時資料為盤後收錄之精選標的歷史，非即時、未必為最新交易日；所有百分比為毛數字（未計手續費／證交稅）。
                「尾盤位置」＝收盤價落在當日高低區間的相對位置（越高代表收盤越靠當日高點）。
                本頁為型態教育與研究工具，非投資建議、不構成買賣推薦，亦不保證未來績效。
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
