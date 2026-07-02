"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { fetcher } from "@/lib/fetcher";
import { signColor } from "@/lib/format";
import { formatNumber } from "@/lib/utils";
import { SkeletonBox } from "@/components/Skeleton";

// ── API 型別（/api/track-record）──
interface OvernightPick {
  code: string; name: string; group: string; score: number; close: number; streak: number;
}
interface WatchPick {
  code: string; name: string; watchScore: number; grade: "high" | "mid" | "low"; lots: number; streak: number;
}
interface Snapshot {
  date: string;
  capturedFor: string;
  source: "forward" | "backfill";
  generatedAt: string;
  overnightFormulaVersion: string;
  watchFormulaVersion: string;
  overnight: OvernightPick[];
  daytradeWatch: WatchPick[];
  notes: string;
}
interface OvernightStat {
  n: number;
  avgOpenRetPct: number | null;
  medianOpenRetPct: number | null;
  winRateGrossPct: number | null;
  winRateOverCostPct: number | null;
}
interface DaytradeStat {
  n: number;
  avgAmplitudePct: number | null;
  medianAmplitudePct: number | null;
}
interface SourceSummary {
  gradedDays: number;
  overnight: { total: OvernightStat; bands: Record<string, OvernightStat> };
  daytrade: { total: DaytradeStat; grades: { high: DaytradeStat; mid: DaytradeStat; low: DaytradeStat } };
}
interface DayRow {
  date: string;
  nextDate: string | null;
  source: "forward" | "backfill";
  status: "graded" | "pending_next_day" | "no_intraday_coverage";
  overnight: { picks: number; graded: number; gaps: number; avgOpenRetPct: number | null; wins: number };
  daytrade: { rows: number; graded: number; gaps: number; avgAmplitudePct: number | null };
}
interface Summary {
  generatedAt: string;
  formulaVersions: { overnight: string[]; watch: string[] };
  costAssumptionPct: number;
  window: {
    from: string; to: string; snapshots: number;
    gradedDays: number; pendingNextDay: number; noIntradayCoverage: number;
  };
  coverage: {
    overnight: { picks: number; graded: number; gaps: number };
    daytrade: { rows: number; graded: number; gaps: number };
  };
  bySource: { forward?: SourceSummary; backfill?: SourceSummary };
  days: DayRow[];
  method: string;
  disclosure: string;
}
interface Resp {
  available: boolean;
  latest: Snapshot | null;
  snapshots: { date: string; source: string; overnightCount: number; watchCount: number }[];
  summary: Summary | null;
  disclosure: string;
}

const fmtDate = (d: string | null | undefined) => (d ? d.replace(/-/g, "/") : "—");
const pctSigned = (v: number | null | undefined) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

const SOURCE_BADGE = {
  forward: { label: "前向定格", cls: "bg-amber/10 text-amber" },
  backfill: { label: "回溯重建", cls: "bg-blue/10 text-blue" },
} as const;

const GRADE_LABEL = { high: "高觀察", mid: "中觀察", low: "低觀察" } as const;

// ── 最新定格快照（等待結算）──
function LatestSnapshot({ snap }: { snap: Snapshot }) {
  const [showAllWatch, setShowAllWatch] = useState(false);
  const badge = SOURCE_BADGE[snap.source] ?? SOURCE_BADGE.backfill;
  const watchShown = showAllWatch ? snap.daytradeWatch : snap.daytradeWatch.slice(0, 10);

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
        <h2 className="text-lg font-bold text-txt-0">最新定格快照</h2>
      </div>
      <p className="text-xs text-txt-3 mb-1">
        定格日 <span className="text-txt-1 font-semibold tabular-nums">{fmtDate(snap.date)}</span>
        <span className="text-txt-4"> · 供{snap.capturedFor}結算 · 定格後不可回改 · 等待次一交易日真實資料</span>
      </p>
      <p className="text-[10px] font-mono text-txt-4 mb-3">
        overnight={snap.overnightFormulaVersion} · watch={snap.watchFormulaVersion}
      </p>

      {/* 隔日衝 topPicks */}
      <h3 className="text-sm font-bold text-txt-1 mb-2">隔日衝 topPicks（score ≥ 50，前 15）</h3>
      {snap.overnight.length === 0 ? (
        <p className="text-xs text-txt-4 mb-4">當日無 score ≥ 50 之候選。</p>
      ) : (
        <div className="overflow-x-auto mb-4">
          <div className="border border-border rounded-xl overflow-hidden min-w-[560px]">
            <div className="grid grid-cols-[0.5fr_1.6fr_1.3fr_0.8fr_0.9fr_0.6fr] gap-0 px-4 py-2.5 bg-bg-2 border-b border-border">
              {["#", "代號 / 名稱", "族群", "分數", "定格收盤", "連板"].map((h) => (
                <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
              ))}
            </div>
            {snap.overnight.map((p, i) => (
              <Link
                key={p.code}
                href={`/stock/${p.code}`}
                className="grid grid-cols-[0.5fr_1.6fr_1.3fr_0.8fr_0.9fr_0.6fr] gap-0 px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
              >
                <div className="text-[10px] tabular-nums text-txt-4">{i + 1}</div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-txt-0 truncate">{p.name}</div>
                  <div className="text-[10px] font-mono text-txt-4">{p.code}</div>
                </div>
                <div className="text-[11px] text-txt-3 truncate pr-2">{p.group || "—"}</div>
                <div className="text-xs font-bold tabular-nums text-txt-0">{p.score}</div>
                <div className="text-xs tabular-nums text-txt-2">{p.close}</div>
                <div className="text-xs tabular-nums text-txt-3">{p.streak > 1 ? p.streak : "—"}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 當沖觀察清單 */}
      <h3 className="text-sm font-bold text-txt-1 mb-1">當沖觀察清單</h3>
      <p className="text-[11px] text-txt-4 mb-2">觀察度只衡量流動性與關注度，之後只對照「次日振幅」——與報酬無關。</p>
      {snap.daytradeWatch.length === 0 ? (
        <p className="text-xs text-txt-4">當日無觀察候選。</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="border border-border rounded-xl overflow-hidden min-w-[520px]">
              <div className="grid grid-cols-[0.5fr_1.6fr_1fr_0.9fr_1fr_0.6fr] gap-0 px-4 py-2.5 bg-bg-2 border-b border-border">
                {["#", "代號 / 名稱", "觀察度", "分級", "定格量(張)", "連板"].map((h) => (
                  <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
                ))}
              </div>
              {watchShown.map((w, i) => (
                <Link
                  key={w.code}
                  href={`/stock/${w.code}`}
                  className="grid grid-cols-[0.5fr_1.6fr_1fr_0.9fr_1fr_0.6fr] gap-0 px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="text-[10px] tabular-nums text-txt-4">{i + 1}</div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-txt-0 truncate">{w.name}</div>
                    <div className="text-[10px] font-mono text-txt-4">{w.code}</div>
                  </div>
                  <div className="text-xs font-bold tabular-nums text-txt-0">{w.watchScore}</div>
                  <div className={`text-xs ${w.grade === "high" ? "text-amber font-bold" : w.grade === "mid" ? "text-txt-2 font-semibold" : "text-txt-4"}`}>
                    {GRADE_LABEL[w.grade]}
                  </div>
                  <div className="text-xs tabular-nums text-txt-2">{formatNumber(w.lots)}</div>
                  <div className="text-xs tabular-nums text-txt-3">{w.streak > 1 ? w.streak : "—"}</div>
                </Link>
              ))}
            </div>
          </div>
          {snap.daytradeWatch.length > 10 && (
            <button onClick={() => setShowAllWatch((v) => !v)} className="mt-2 text-[11px] text-txt-3 hover:text-txt-1 transition-colors">
              {showAllWatch ? "收合" : `顯示全部 ${snap.daytradeWatch.length} 檔`}
            </button>
          )}
        </>
      )}
      <p className="mt-3 text-[10px] text-txt-4 leading-relaxed max-w-3xl">{snap.notes}</p>
    </section>
  );
}

// ── 已結算彙總（單一 source 區塊）──
const OVERNIGHT_COLS = "grid grid-cols-[1fr_0.7fr_1.1fr_1fr_1fr_1.2fr] gap-0";
const DT_COLS = "grid grid-cols-[1fr_0.7fr_1.2fr_1fr] gap-0";
const BAND_LABELS: Record<string, string> = { "50-59": "50–59 分", "60-74": "60–74 分", "75+": "≥75 分" };

function SourceBlock({ kind, s, costPct }: { kind: "forward" | "backfill"; s: SourceSummary | undefined; costPct: number }) {
  const badge = SOURCE_BADGE[kind];
  const hasOvernight = (s?.overnight.total.n ?? 0) > 0;
  const hasDaytrade = (s?.daytrade.total.n ?? 0) > 0;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
        <span className="text-xs text-txt-3">
          {kind === "forward"
            ? "公式凍結後每日收盤即時定格的乾淨樣本"
            : "以現行凍結公式回溯重建（名單為現況、營收近似對齊，僅供參考）"}
          {s ? ` · 已結算 ${s.gradedDays} 日` : ""}
        </span>
      </div>

      {!s || (!hasOvernight && !hasDaytrade) ? (
        <p className="text-xs text-txt-4 mb-2">
          {kind === "forward"
            ? "乾淨 forward 樣本自公式凍結日起累積——目前尚無已結算樣本（需定格日的次一交易日有分時收錄）。"
            : "尚無已結算的回溯樣本（需次一交易日有分時收錄）。"}
        </p>
      ) : (
        <>
          {/* 隔日衝：分數帶 vs 次日開盤報酬 */}
          <h4 className="text-[13px] font-bold text-txt-1 mb-1.5">隔日衝：分數帶 vs 次日開盤報酬（毛）</h4>
          {!hasOvernight ? (
            <p className="text-xs text-txt-4 mb-3">無樣本。</p>
          ) : (
            <div className="overflow-x-auto mb-1.5">
              <div className="border border-border rounded-xl overflow-hidden min-w-[620px] max-w-3xl">
                <div className={`${OVERNIGHT_COLS} px-4 py-2.5 bg-bg-2 border-b border-border`}>
                  {["分數帶", "樣本", "平均開盤報酬", "中位數", "勝率(毛>0)", `勝率(>+${costPct}%成本)`].map((h) => (
                    <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
                  ))}
                </div>
                {[...Object.entries(s.overnight.bands), ["合計", s.overnight.total] as const].map(([band, st]) => (
                  <div key={band} className={`${OVERNIGHT_COLS} px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 ${band === "合計" ? "bg-bg-2/50" : ""}`}>
                    <div className="text-xs font-semibold text-txt-1">{BAND_LABELS[band] ?? band}</div>
                    <div className="text-xs tabular-nums text-txt-3">{st.n}</div>
                    <div className={`text-xs font-bold tabular-nums ${st.avgOpenRetPct != null ? signColor(st.avgOpenRetPct) : "text-txt-4"}`}>
                      {pctSigned(st.avgOpenRetPct)}
                    </div>
                    <div className={`text-xs tabular-nums ${st.medianOpenRetPct != null ? signColor(st.medianOpenRetPct) : "text-txt-4"}`}>
                      {pctSigned(st.medianOpenRetPct)}
                    </div>
                    <div className="text-xs tabular-nums text-txt-2">{st.winRateGrossPct != null ? `${st.winRateGrossPct}%` : "—"}</div>
                    <div className="text-xs tabular-nums text-txt-2">{st.winRateOverCostPct != null ? `${st.winRateOverCostPct}%` : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[10px] text-txt-4 mb-4 max-w-3xl">
            次日開盤 = 次日 1 分 K 第一根開盤價（部分收錄）；報酬為毛數字。成本情境：現股來回約 {costPct}%（手續費 0.1425%×2＋證交稅 0.3%，未含滑價）。
          </p>

          {/* 當沖：分級 vs 次日振幅（不講勝率） */}
          <h4 className="text-[13px] font-bold text-txt-1 mb-1.5">當沖觀察：分級 vs 次日振幅（毛）</h4>
          {!hasDaytrade ? (
            <p className="text-xs text-txt-4">無樣本。</p>
          ) : (
            <>
              <div className="overflow-x-auto mb-1.5">
                <div className="border border-border rounded-xl overflow-hidden min-w-[420px] max-w-xl">
                  <div className={`${DT_COLS} px-4 py-2.5 bg-bg-2 border-b border-border`}>
                    {["觀察度分級", "樣本", "平均次日振幅", "中位數"].map((h) => (
                      <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
                    ))}
                  </div>
                  {([["high", s.daytrade.grades.high], ["mid", s.daytrade.grades.mid], ["low", s.daytrade.grades.low], ["合計", s.daytrade.total]] as const).map(([k, st]) => (
                    <div key={k} className={`${DT_COLS} px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 ${k === "合計" ? "bg-bg-2/50" : ""}`}>
                      <div className="text-xs font-semibold text-txt-1">{k === "合計" ? "合計" : GRADE_LABEL[k as "high" | "mid" | "low"]}</div>
                      <div className="text-xs tabular-nums text-txt-3">{st.n}</div>
                      <div className="text-xs font-bold tabular-nums text-txt-0">{st.avgAmplitudePct != null ? `${st.avgAmplitudePct}%` : "—"}</div>
                      <div className="text-xs tabular-nums text-txt-2">{st.medianAmplitudePct != null ? `${st.medianAmplitudePct}%` : "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-txt-4 max-w-3xl">
                當沖區塊只驗證「觀察度是否對應較高次日振幅」（波動可預測性）；振幅不是報酬，兩者無已驗證關係。
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── 已結算彙總 ──
function SettledSummary({ summary }: { summary: Summary }) {
  const [showDays, setShowDays] = useState(false);
  const settledDays = summary.days.filter((d) => d.status === "graded").slice(-15).reverse();

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-block px-2 py-0.5 rounded-full bg-blue/10 text-blue text-[10px] font-semibold">已結算</span>
        <h2 className="text-lg font-bold text-txt-0">戰績彙總（forward 與 backfill 分開統計）</h2>
      </div>
      <p className="text-xs text-txt-3 mb-1">
        窗口 {fmtDate(summary.window.from)}~{fmtDate(summary.window.to)} · 快照 {summary.window.snapshots} 份 ·
        已結算 {summary.window.gradedDays} 日 · 等待次日資料 {summary.window.pendingNextDay} 日 ·
        次日無分時收錄 {summary.window.noIntradayCoverage} 日
      </p>
      <p className="text-[10px] font-mono text-txt-4 mb-1">
        公式版本：overnight [{summary.formulaVersions.overnight.join(", ")}] · watch [{summary.formulaVersions.watch.join(", ")}]
      </p>
      <p className="text-[11px] text-txt-4 mb-4">
        Coverage 缺口（無分時收錄、不估價）：隔日衝 {summary.coverage.overnight.gaps}/{summary.coverage.overnight.picks} 檔次 ·
        當沖 {summary.coverage.daytrade.gaps}/{summary.coverage.daytrade.rows} 檔次
      </p>

      <SourceBlock kind="forward" s={summary.bySource.forward} costPct={summary.costAssumptionPct} />
      <SourceBlock kind="backfill" s={summary.bySource.backfill} costPct={summary.costAssumptionPct} />

      {settledDays.length > 0 && (
        <>
          <button onClick={() => setShowDays((v) => !v)} className="text-[11px] text-txt-3 hover:text-txt-1 transition-colors mb-2">
            {showDays ? "收合每日明細" : `顯示最近 ${settledDays.length} 個已結算日明細`}
          </button>
          {showDays && (
            <div className="overflow-x-auto">
              <div className="border border-border rounded-xl overflow-hidden min-w-[640px] max-w-3xl">
                <div className="grid grid-cols-[1fr_1fr_0.9fr_1fr_1.1fr_1fr] gap-0 px-4 py-2.5 bg-bg-2 border-b border-border">
                  {["定格日", "結算日", "類型", "隔日衝(結/缺)", "平均開盤報酬", "當沖(結/缺)"].map((h) => (
                    <div key={h} className="text-[9px] font-semibold text-txt-4 uppercase tracking-wider">{h}</div>
                  ))}
                </div>
                {settledDays.map((d) => (
                  <div key={d.date} className="grid grid-cols-[1fr_1fr_0.9fr_1fr_1.1fr_1fr] gap-0 px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0">
                    <div className="text-xs tabular-nums text-txt-1">{fmtDate(d.date)}</div>
                    <div className="text-xs tabular-nums text-txt-3">{fmtDate(d.nextDate)}</div>
                    <div className={`text-[10px] font-semibold ${d.source === "forward" ? "text-amber" : "text-blue"}`}>
                      {SOURCE_BADGE[d.source].label}
                    </div>
                    <div className="text-xs tabular-nums text-txt-2">{d.overnight.graded}/{d.overnight.gaps}</div>
                    <div className={`text-xs font-bold tabular-nums ${d.overnight.avgOpenRetPct != null ? signColor(d.overnight.avgOpenRetPct) : "text-txt-4"}`}>
                      {pctSigned(d.overnight.avgOpenRetPct)}
                    </div>
                    <div className="text-xs tabular-nums text-txt-2">{d.daytrade.graded}/{d.daytrade.gaps}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function TrackRecordClient() {
  const { data, error } = useSWR<Resp>("/api/track-record", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <TopNav />
      <NavBar />
      <main id="main" className="flex-1 overflow-y-auto">
        <div className="container-page-wide py-6 animate-fade-in">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block px-2 py-0.5 rounded-full bg-amber/10 text-amber text-[10px] font-semibold">隔日衝</span>
              <h1 className="text-2xl font-extrabold text-txt-0 tracking-tight">前向戰績紀錄</h1>
            </div>
            <p className="text-sm text-txt-3 max-w-3xl leading-relaxed">
              誠實統計閉環：每日收盤後以<span className="text-txt-1">凍結版本化公式</span>把「明日焦點」與「當沖觀察」候選
              <span className="text-txt-1">定格存檔</span>，日後用次一交易日<span className="text-txt-1">真實資料結算</span>、永久累積。
              定格檔不可回改；<span className="text-amber">前向定格</span>（公式凍結後產生的乾淨樣本）與
              <span className="text-blue">回溯重建</span>（用現行公式回算歷史）嚴格分開統計。本頁非投資建議。
            </p>
          </div>

          {error ? (
            <div className="bg-bg-1 border border-border rounded-lg py-16 text-center">
              <p className="text-sm font-bold text-red mb-1">資料無法載入</p>
              <p className="text-xs text-txt-3">請稍後再試</p>
            </div>
          ) : !data ? (
            <SkeletonBox className="w-full h-[480px] rounded-lg" />
          ) : !data.available || !data.latest ? (
            <div className="bg-bg-1 border border-border rounded-lg py-16 text-center">
              <p className="text-sm text-txt-3 mb-1">尚無定格快照</p>
              <p className="text-[11px] text-txt-4">請於收盤後執行 snapshot_focus 產生每日定格檔</p>
            </div>
          ) : (
            <>
              <LatestSnapshot snap={data.latest} />
              {data.summary ? (
                <SettledSummary summary={data.summary} />
              ) : (
                <section className="mb-10">
                  <div className="bg-bg-1 border border-border rounded-lg py-10 text-center">
                    <p className="text-sm text-txt-3 mb-1">尚無結算彙總</p>
                    <p className="text-[11px] text-txt-4">定格日的次一交易日有資料後，執行 grade_focus 產生 summary</p>
                  </div>
                </section>
              )}
              <p className="text-[10px] text-txt-4 leading-relaxed max-w-3xl">{data.disclosure}</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
