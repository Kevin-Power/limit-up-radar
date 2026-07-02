"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { fetcher } from "@/lib/fetcher";
import { signColor } from "@/lib/format";
import { formatNumber, formatNet } from "@/lib/utils";
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

// ── 明日當沖觀察清單（forward，來自今日收盤 daily）──
interface WatchRow {
  code: string; name: string; market: string | null; group: string; groupColor: string;
  close: number; changePct: number; volume: number; lots: number; streak: number; majorNet: number;
  watchScore: number; grade: "high" | "mid" | "low"; tags: string[];
  histAmplitude: { amplitudePct: number; date: string } | null;
}
interface ShortlistRow extends WatchRow {
  reasons: string[];
  riskFlags: string[];
}
interface WatchResp {
  available: boolean; date: string | null; basedOn: string; count: number;
  rows: WatchRow[]; excluded: { code: string; name: string; reason: "disposal" | "low_liquidity" }[]; disclosure: string;
  // 精選欄位標 optional：CDN 快取的舊版回應可能沒有，缺欄時只是不顯示精選區
  shortlist?: ShortlistRow[];
  shortlistRuleVersion?: string;
  shortlistCriteria?: string;
  shortlistDisclosure?: string;
}

// 固定教育文案（適用所有標的，非個股化操作指示）
const DISCIPLINE = [
  "進場前先設定停損價與當日最大虧損金額，觸價即出，不凹單",
  "日內了結、不留倉——當沖部位過夜即承擔隔日跳空風險",
  "量縮、轉弱、跌破自設防守價先退，不加碼攤平",
  "開盤即鎖漲停可能根本買不到；漲停打開瞬間流動性驟變，追價風險高",
  "現股當沖資格、券源與處置限制以交易所及券商公告為準",
];
const GRADE = {
  high: { label: "高觀察", cls: "text-amber font-bold" },
  mid: { label: "中觀察", cls: "text-txt-2 font-semibold" },
  low: { label: "低觀察", cls: "text-txt-4" },
} as const;
const WATCH_COLS = "grid grid-cols-[0.4fr_1.5fr_1.1fr_1fr_0.8fr_0.6fr_0.9fr_0.8fr_1.4fr] gap-0";

// ── 明日精選觀察（觀察清單的高匯聚子集，同一份 API 資料）──
function ShortlistCards({ data }: { data: WatchResp }) {
  // 舊版 CDN 快取回應可能沒有 shortlist 欄位——此時整個精選區不渲染，
  // 避免把「快取缺欄」誤顯示成「今日無符合門檻標的」。
  if (!data.shortlist) return null;
  const shortlist = data.shortlist;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-block px-2 py-0.5 rounded-full bg-amber/10 text-amber text-[10px] font-semibold">明日精選觀察</span>
        <h2 className="text-lg font-bold text-txt-0">高匯聚重點名單</h2>
      </div>
      <p className="text-xs text-txt-3 mb-3">
        以 <span className="text-txt-1 font-semibold tabular-nums">{data.date?.replace(/-/g, "/")}</span> 收盤資料產生 ·
        入選門檻：<span className="text-txt-2">{data.shortlistCriteria}</span>
        {data.shortlistRuleVersion && <span className="text-txt-4 font-mono"> · 規則 {data.shortlistRuleVersion}</span>}
      </p>
      {data.shortlistDisclosure && (
        <div className="bg-amber/5 border border-amber/20 rounded-lg p-3 mb-3">
          <p className="text-[11px] text-txt-3 leading-relaxed">
            <span className="font-semibold text-amber">精選 ≠ 勝率、不預測方向：</span>{data.shortlistDisclosure}
          </p>
        </div>
      )}
      {shortlist.length === 0 ? (
        <div className="bg-bg-1 border border-border rounded-lg py-8 text-center">
          <p className="text-sm text-txt-3">今日無符合匯聚門檻的標的</p>
          <p className="text-[11px] text-txt-4 mt-1">門檻固定、寧缺勿濫，不降規則湊數</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {shortlist.map((s) => (
            <Link
              key={s.code}
              href={`/stock/${s.code}`}
              className="block bg-bg-1 border border-border rounded-xl p-4 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-txt-0 truncate">{s.name}</span>
                    {s.market && <span className="text-[9px] text-txt-4">{s.market === "OTC" ? "櫃" : "上"}</span>}
                    <span className="text-[10px] font-mono text-txt-4">{s.code}</span>
                  </div>
                  <div className="text-[10px] text-txt-3 mt-0.5 truncate">{s.group || "—"}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[9px] px-1.5 py-0.5 rounded bg-amber/10 text-amber font-semibold whitespace-nowrap">
                    重點觀察 · {s.watchScore}
                  </div>
                  <div className={`text-xs font-bold tabular-nums mt-1 ${signColor(s.changePct)}`}>
                    {s.close} · {pct(s.changePct)}
                  </div>
                </div>
              </div>
              <ul className="space-y-0.5">
                {s.reasons.map((r) => (
                  <li key={r} className="text-[11px] text-txt-2 leading-relaxed flex gap-1.5">
                    <span className="text-amber shrink-0">·</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
              {s.riskFlags.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/[0.04] space-y-0.5">
                  {s.riskFlags.map((f) => (
                    <p key={f} className="text-[10px] text-amber leading-relaxed">⚠ {f}</p>
                  ))}
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-white/[0.04] flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-txt-4 tabular-nums">
                <span>量 {formatNumber(s.lots)} 張</span>
                <span>連板 {s.streak > 1 ? s.streak : "—"}</span>
                <span className={signColor(s.majorNet)}>主力 {s.majorNet === 0 ? "—" : formatNet(s.majorNet)}</span>
                <span title={s.histAmplitude ? "盤後收錄之最近分時交易日，非最新交易日" : undefined}>
                  {s.histAmplitude
                    ? `最近收錄 ${s.histAmplitude.date.replace(/-/g, "/")} 振幅 ${s.histAmplitude.amplitudePct}%`
                    : "分時收錄 —"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div className="mt-3 bg-bg-1 border border-border rounded-lg p-3">
        <p className="text-[11px] font-semibold text-txt-1 mb-1.5">當沖紀律提示（固定教育文案 · 適用所有標的 · 非個股操作建議）</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {DISCIPLINE.map((d) => (
            <li key={d} className="text-[10px] text-txt-3 leading-relaxed flex gap-1.5">
              <span className="text-txt-4 shrink-0">—</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DaytradeWatch() {
  const { data } = useSWR<WatchResp>("/api/daytrade-watch", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });
  const [expanded, setExpanded] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  if (!data) return <SkeletonBox className="w-full h-[360px] rounded-lg mb-10" />;
  if (!data.available || data.rows.length === 0) {
    return (
      <div className="bg-bg-1 border border-border rounded-lg py-12 text-center mb-10">
        <p className="text-sm text-txt-3">目前無觀察清單資料</p>
      </div>
    );
  }
  const shown = expanded ? data.rows : data.rows.slice(0, 15);

  return (
    <>
    {/* 精選子集卡片（同一份 API 回應） */}
    <ShortlistCards data={data} />
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-block px-2 py-0.5 rounded-full bg-amber/10 text-amber text-[10px] font-semibold">明日焦點</span>
        <h2 className="text-lg font-bold text-txt-0">明日當沖觀察清單</h2>
      </div>
      <p className="text-xs text-txt-3 mb-3">
        以 <span className="text-txt-1 font-semibold tabular-nums">{data.date?.replace(/-/g, "/")}</span> 收盤資料產生 · 供下一交易日盤前參考 · 共 {data.count} 檔（已排除處置／低流動 {data.excluded.length} 檔）
      </p>
      <div className="bg-amber/5 border border-amber/20 rounded-lg p-3 mb-3">
        <p className="text-[11px] text-txt-3 leading-relaxed">
          <span className="font-semibold text-amber">觀察度 ≠ 勝率：</span>{data.disclosure}
        </p>
      </div>
      <div className="overflow-x-auto">
        <div className="border border-border rounded-xl overflow-hidden min-w-[780px]">
          <div className={`${WATCH_COLS} px-4 py-2.5 bg-bg-2 border-b border-border`}>
            {["#", "代號 / 名稱", "族群", "觀察度", "今日量(張)", "連板", "主力(張)", "分時振幅", "標記"].map((h) => (
              <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
            ))}
          </div>
          {shown.map((r, i) => (
            <Link
              key={r.code}
              href={`/stock/${r.code}`}
              className={`${WATCH_COLS} px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors`}
            >
              <div className="text-[10px] tabular-nums text-txt-4">{i + 1}</div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-txt-0 truncate">
                  {r.name}
                  {r.market && <span className="ml-1 text-[9px] text-txt-4">{r.market === "OTC" ? "櫃" : "上"}</span>}
                </div>
                <div className="text-[10px] font-mono text-txt-4">{r.code}</div>
              </div>
              <div className="text-[11px] text-txt-3 truncate pr-2">{r.group || "—"}</div>
              <div className={`text-xs tabular-nums ${GRADE[r.grade].cls}`}>{r.watchScore} · {GRADE[r.grade].label}</div>
              <div className="text-xs tabular-nums text-txt-2">{formatNumber(r.lots)}</div>
              <div className="text-xs tabular-nums text-txt-3">{r.streak > 1 ? `${r.streak}` : "—"}</div>
              <div className={`text-xs tabular-nums ${signColor(r.majorNet)}`}>{r.majorNet === 0 ? "—" : formatNet(r.majorNet)}</div>
              <div className="text-[11px] tabular-nums text-txt-3" title={r.histAmplitude ? `收錄日 ${r.histAmplitude.date}` : undefined}>
                {r.histAmplitude ? `${r.histAmplitude.amplitudePct}%` : "—"}
              </div>
              <div className="flex flex-wrap gap-1">
                {r.tags.slice(0, 2).map((t) => (
                  <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-bg-3 text-txt-3 whitespace-nowrap">{t}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-2">
        {data.rows.length > 15 && (
          <button onClick={() => setExpanded((v) => !v)} className="text-[11px] text-txt-3 hover:text-txt-1 transition-colors">
            {expanded ? "收合" : `顯示全部 ${data.rows.length} 檔`}
          </button>
        )}
        {data.excluded.length > 0 && (
          <button onClick={() => setShowExcluded((v) => !v)} className="text-[11px] text-txt-4 hover:text-txt-2 transition-colors">
            {showExcluded ? "隱藏排除清單" : `已排除 ${data.excluded.length} 檔（處置／低流動）`}
          </button>
        )}
      </div>
      {showExcluded && (
        <p className="mt-2 text-[10px] text-txt-4 leading-relaxed">
          {data.excluded.map((e) => `${e.name}(${e.code})${e.reason === "disposal" ? "·處置" : "·流動不足"}`).join("、")}
        </p>
      )}
    </section>
    </>
  );
}

// ── 觀察度回溯驗證（觀察度分級 vs 次日振幅）──
interface TrackGrade { n: number; avg: number | null; median: number | null }
interface TrackResp {
  available: boolean;
  formulaVersion: string;
  gradedDays?: number;
  gradedSamples?: number;
  windowFrom?: string | null;
  windowTo?: string | null;
  grades?: { high: TrackGrade; mid: TrackGrade; low: TrackGrade };
  spread?: number | null;
  method: string;
}
const GRADE_ROW: { key: "high" | "mid" | "low"; label: string }[] = [
  { key: "high", label: "高觀察" },
  { key: "mid", label: "中觀察" },
  { key: "low", label: "低觀察" },
];

function DaytradeTrack() {
  const { data } = useSWR<TrackResp>("/api/daytrade-track", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30 * 60_000,
  });
  if (!data) return <SkeletonBox className="w-full h-[220px] rounded-lg mb-10" />;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-block px-2 py-0.5 rounded-full bg-blue/10 text-blue text-[10px] font-semibold">回溯驗證</span>
        <h2 className="text-lg font-bold text-txt-0">觀察度 vs 次日振幅</h2>
      </div>
      {!data.available || !data.grades ? (
        <p className="text-xs text-txt-4 leading-relaxed max-w-2xl">
          回溯驗證樣本累積中——需要「觀察清單日的次日」有分時收錄才能評分，目前尚無足夠樣本。{data.method}
        </p>
      ) : (
        <>
          <p className="text-xs text-txt-3 mb-3">
            公式 <span className="font-mono text-txt-2">{data.formulaVersion}</span> ·
            窗口 {data.windowFrom?.replace(/-/g, "/")}~{data.windowTo?.replace(/-/g, "/")} ·
            {data.gradedDays} 日 / {data.gradedSamples} 樣本
          </p>
          <div className="overflow-x-auto">
            <div className="border border-border rounded-xl overflow-hidden max-w-lg">
              <div className="grid grid-cols-[1fr_0.8fr_1.1fr_1fr] px-4 py-2.5 bg-bg-2 border-b border-border">
                {["觀察度分級", "樣本數", "平均次日振幅", "中位數"].map((h) => (
                  <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
                ))}
              </div>
              {GRADE_ROW.map(({ key, label }) => {
                const g = data.grades![key];
                return (
                  <div key={key} className="grid grid-cols-[1fr_0.8fr_1.1fr_1fr] px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0">
                    <div className="text-xs font-semibold text-txt-1">{label}</div>
                    <div className="text-xs tabular-nums text-txt-3">{g.n}</div>
                    <div className="text-xs font-bold tabular-nums text-txt-0">{g.avg != null ? `${g.avg}%` : "—"}</div>
                    <div className="text-xs tabular-nums text-txt-2">{g.median != null ? `${g.median}%` : "—"}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {data.spread != null && (
            <p className="text-[11px] text-txt-3 mt-2">
              高觀察 − 低觀察 平均次日振幅差 ={" "}
              <span className={`font-bold tabular-nums ${data.spread > 0 ? "text-amber" : "text-txt-3"}`}>
                {data.spread > 0 ? "+" : ""}{data.spread}%
              </span>
              {data.spread > 0
                ? "（正值：高觀察度確實對應較高次日振幅——驗證的是波動可預測性，非報酬或勝率）"
                : "（非正值：目前資料下觀察度未顯示對次日振幅有鑑別力）"}
            </p>
          )}
          <p className="text-[10px] text-txt-4 mt-2 leading-relaxed max-w-3xl">{data.method}</p>
        </>
      )}
    </section>
  );
}

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
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block px-2 py-0.5 rounded-full bg-amber/10 text-amber text-[10px] font-semibold">當沖</span>
              <h1 className="text-2xl font-extrabold text-txt-0 tracking-tight">當沖速覽</h1>
            </div>
            <p className="text-sm text-txt-3 max-w-2xl leading-relaxed">
              由上而下：<span className="text-txt-1">明日精選觀察</span>（觀察清單中多條件匯聚的重點子集）、
              <span className="text-txt-1">明日當沖觀察清單</span>（今日收盤產生的高流動／高關注候選，觀察度非勝率）、
              <span className="text-txt-1">回溯驗證</span>與<span className="text-txt-1">歷史分時型態</span>（最近收錄日的 1 分 K 走勢研究）。
              當沖為高風險操作，本頁非投資建議、不構成買賣推薦。
            </p>
          </div>

          {/* 明日當沖觀察清單（forward） */}
          <DaytradeWatch />

          {/* 觀察度回溯驗證（觀察度分級 vs 次日振幅） */}
          <DaytradeTrack />

          {/* 歷史分時型態（historical） */}
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-txt-0">歷史分時型態研究</h2>
          </div>
          <p className="text-xs text-txt-3 mb-3 max-w-2xl leading-relaxed">
            最近一個完整分時收錄交易日的個股 1 分 K，依當沖視角指標排序：
            <span className="text-txt-1">振幅</span>、<span className="text-txt-1">開盤半小時強度</span>、
            <span className="text-txt-1">尾盤位置</span>（收盤落在當日高低區間的位置）。
          </p>

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
