"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { getTodayString } from "@/lib/utils";
import type { DisposalCandidate } from "@/app/api/disposal/route";

// ── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = "高危" | "注意" | "觀察";
type Status = "正常交易" | "預警中" | "已處置";

interface DisposalStock {
  code: string;
  name: string;
  industry: string;
  streak: number;
  gain10d: number;
  daysHit: number;
  daysRequired: number;
  risk: RiskLevel;
  status: Status;
  volumeAnomaly: boolean;
}

const DISPOSAL_RULES = [
  { color: "bg-red",   label: "連續漲停處置", detail: "連續3日漲停，第4日起改為人工撮合管控，限制委託量與價格範圍，大幅降低交易效率" },
  { color: "bg-amber", label: "異常波動處置", detail: "連續5日異常波動，改為分盤交易，每5分鐘撮合一次，流動性大幅下降，散戶難以即時出場" },
  { color: "bg-blue",  label: "短期漲幅過大", detail: "10個交易日內漲幅超過50%，列入注意股加強監控，公告預警，後續可能升格處置" },
  { color: "bg-txt-3", label: "成交量異常",   detail: "成交量較前20日均量放大超過5倍，主管機關列入觀察名單，進一步審查後可能公告處置" },
];

const TIMELINE_STEPS = [
  { label: "列入注意", desc: "符合初步條件" },
  { label: "公告預警", desc: "交易所發布" },
  { label: "正式處置", desc: "限制交易方式" },
  { label: "分盤撮合", desc: "每5分鐘一次" },
  { label: "解除處置", desc: "恢復正常交易" },
];

// ── Sub-components ───────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }) {
  const cls: Record<RiskLevel, string> = {
    "高危": "bg-red/10 text-red border border-red/30 glow-red",
    "注意": "bg-amber/10 text-amber border border-amber/30",
    "觀察": "bg-blue/10 text-blue border border-blue/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${cls[level]}`}>
      {level}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const cls: Record<Status, string> = {
    "正常交易": "bg-bg-3 text-txt-3 border border-border",
    "預警中":   "bg-amber/10 text-amber border border-amber/30",
    "已處置":   "bg-red/10 text-red border border-red/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${cls[status]}`}>
      {status}
    </span>
  );
}

function StreakDots({ count }: { count: number }) {
  const max = 6;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: Math.min(count, max) }).map((_, i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${count >= 5 ? "bg-red" : count >= 3 ? "bg-amber" : "bg-blue"}`} />
      ))}
      <span className="text-xs tabular-nums text-txt-2 ml-1">{count}</span>
    </div>
  );
}

function CountdownBar({ hit, total }: { hit: number; total: number }) {
  const pct = Math.min((hit / total) * 100, 100);
  const barColor = pct >= 100 ? "bg-red" : pct >= 60 ? "bg-amber" : "bg-blue";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 bg-bg-3 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-txt-3 whitespace-nowrap">{hit}/{total}</span>
    </div>
  );
}

function KPICard({ label, value, color }: { label: string; value: number; color: string }) {
  const borderCls: Record<string, string> = {
    red: "border-red/40",
    amber: "border-amber/40",
    blue: "border-blue/40",
  };
  const textCls: Record<string, string> = {
    red: "text-red",
    amber: "text-amber",
    blue: "text-blue",
  };
  return (
    <div className={`bg-bg-1 border ${borderCls[color] || "border-border"} rounded-lg p-4 flex flex-col gap-1`}>
      <div className="text-xs text-txt-4 font-medium">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${textCls[color] || "text-txt-0"}`}>{value}</div>
    </div>
  );
}

function InfoSection() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-2 hover:bg-bg-3 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-txt-1">處置標準說明</span>
        <span className="text-txt-4 text-xs select-none">{open ? "-- collapse --" : "-- expand --"}</span>
      </button>
      {open && (
        <div className="px-4 py-4 bg-bg-1 space-y-5">
          {/* Rule cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DISPOSAL_RULES.map(({ color, label, detail }) => (
              <div key={label} className="flex gap-3 p-3 bg-bg-2 rounded-lg border border-border">
                <div className="flex-shrink-0 mt-1.5">
                  <div className={`w-2 h-2 rounded-full ${color}`} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-txt-1 mb-1">{label}</div>
                  <div className="text-[11px] text-txt-4 leading-relaxed">{detail}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div>
            <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-wider mb-3">typical disposal process</div>
            <div className="flex items-start gap-0">
              {TIMELINE_STEPS.map((step, i) => (
                <div key={step.label} className="flex-1 flex flex-col items-center text-center relative">
                  {/* Connector line */}
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div className="absolute top-2.5 left-1/2 w-full h-px bg-border" />
                  )}
                  <div className={`relative z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[8px] font-bold
                    ${i <= 2 ? "border-amber bg-amber/20 text-amber" : "border-txt-4 bg-bg-2 text-txt-4"}`}>
                    {i + 1}
                  </div>
                  <div className="text-[10px] font-semibold text-txt-2 mt-1.5">{step.label}</div>
                  <div className="text-[9px] text-txt-4">{step.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = "risk" | "streak" | "gain10d";
const RISK_ORDER: Record<RiskLevel, number> = { "高危": 0, "注意": 1, "觀察": 2 };

function sortStocks(stocks: DisposalStock[], key: SortKey, asc: boolean): DisposalStock[] {
  return [...stocks].sort((a, b) => {
    let cmp = 0;
    if (key === "risk") cmp = RISK_ORDER[a.risk] - RISK_ORDER[b.risk];
    else if (key === "streak") cmp = b.streak - a.streak;
    else if (key === "gain10d") cmp = b.gain10d - a.gain10d;
    return asc ? -cmp : cmp;
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DisposalPage() {
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [sortAsc, setSortAsc] = useState(false);

  const { data: realCandidates } = useSWR<DisposalCandidate[]>(
    "/api/disposal",
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  // Map real candidates to DisposalStock shape
  const ACTIVE_STOCKS: DisposalStock[] = useMemo(() => {
    if (realCandidates && realCandidates.length > 0) {
      return realCandidates.map((c) => ({
        code: c.code,
        name: c.name,
        industry: c.industry,
        streak: c.streak,
        gain10d: c.gain,
        daysHit: c.daysLimitUp,
        daysRequired: 5,
        risk: c.risk,
        status: c.status,
        volumeAnomaly: c.daysLimitUp >= 3,
      }));
    }
    return [];
  }, [realCandidates]);

  const sorted = useMemo(() => sortStocks(ACTIVE_STOCKS, sortKey, sortAsc), [ACTIVE_STOCKS, sortKey, sortAsc]);

  const countWarning = ACTIVE_STOCKS.filter(s => s.risk === "高危").length;
  const countAlert = ACTIVE_STOCKS.filter(s => s.status === "預警中").length;
  const countDisposed = ACTIVE_STOCKS.filter(s => s.status === "已處置").length;

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortAsc ? " [asc]" : " [desc]";
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate={getTodayString()} />
      <NavBar />
      <main className="flex-1 overflow-y-auto p-4 md:p-5 max-w-6xl mx-auto w-full space-y-6 animate-fade-in">

        {/* Data status banner */}
        {!realCandidates && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue/10 border border-blue/30 rounded-lg text-xs text-blue font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-blue animate-pulse flex-shrink-0" />
            <span>載入中...</span>
          </div>
        )}
        {realCandidates && realCandidates.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-bg-2 border border-border rounded-lg text-xs text-txt-3 font-medium">
            <span>目前無接近處置標準的個股</span>
          </div>
        )}

        {/* Title */}
        <div>
          <h1 className="text-xl font-bold text-txt-0 tracking-tight">處置風險監控</h1>
          <p className="text-xs text-txt-4 mt-1">監控接近或已達台灣證交所處置標準的個股，提前預警流動性風險</p>
        </div>

        {/* ─── 1. KPI Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KPICard label="處置警告股" value={countWarning} color="red" />
          <KPICard label="預警中" value={countAlert} color="amber" />
          <KPICard label="已處置" value={countDisposed} color="blue" />
        </div>

        {/* ─── 2. Risk Monitoring Table ─────────────────────────────────── */}
        <div>
          <div className="text-xs font-semibold text-txt-3 uppercase tracking-wider mb-3">處置風險監控表</div>
          <div className="overflow-x-auto">
          <div className="border border-border rounded-lg overflow-hidden min-w-[720px]">
            {/* Header */}
            <div className="grid grid-cols-[60px_70px_70px_80px_75px_120px_80px_70px_60px] gap-1 px-4 py-2 bg-bg-2 border-b border-border text-[10px] font-semibold text-txt-4 uppercase tracking-wider">
              <div>代號</div>
              <div>名稱</div>
              <div>產業</div>
              <div className="cursor-pointer hover:text-txt-2 select-none" onClick={() => handleSort("streak")}>
                連板天數{sortIndicator("streak")}
              </div>
              <div className="cursor-pointer hover:text-txt-2 select-none" onClick={() => handleSort("gain10d")}>
                10日漲幅%{sortIndicator("gain10d")}
              </div>
              <div>距離處置</div>
              <div className="cursor-pointer hover:text-txt-2 select-none" onClick={() => handleSort("risk")}>
                風險等級{sortIndicator("risk")}
              </div>
              <div>狀態</div>
              <div>量能異常</div>
            </div>

            {/* Rows */}
            {sorted.map((s) => {
              const rowBg =
                s.status === "已處置" ? "bg-red/[0.04]" :
                s.risk === "高危" ? "bg-amber/[0.03]" : "";
              return (
                <div
                  key={s.code}
                  className={`grid grid-cols-[60px_70px_70px_80px_75px_120px_80px_70px_60px] gap-1 px-4 py-2.5 items-center border-b border-border/50 last:border-b-0 transition-colors row-hover ${rowBg}`}
                >
                  <div className="text-xs font-semibold text-txt-3 tabular-nums">
                    <Link href={`/stock/${s.code}`} className="hover:text-txt-1 hover:underline underline-offset-2 transition-colors">
                      {s.code}
                    </Link>
                  </div>
                  <div className="text-[13px] font-semibold text-txt-0">
                    <Link href={`/stock/${s.code}`} className="hover:text-txt-0 hover:underline underline-offset-2 transition-colors">
                      {s.name}
                    </Link>
                  </div>
                  <div className="text-[11px] text-txt-4">{s.industry}</div>
                  <div><StreakDots count={s.streak} /></div>
                  <div className={`text-xs tabular-nums font-semibold ${s.gain10d >= 50 ? "text-red" : s.gain10d >= 30 ? "text-amber" : "text-txt-2"}`}>
                    +{s.gain10d.toFixed(1)}%
                  </div>
                  <div><CountdownBar hit={s.daysHit} total={s.daysRequired} /></div>
                  <div><RiskBadge level={s.risk} /></div>
                  <div><StatusBadge status={s.status} /></div>
                  <div>
                    {s.volumeAnomaly ? (
                      <span className="text-[11px] font-semibold text-red">Yes</span>
                    ) : (
                      <span className="text-[11px] text-txt-4">--</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
          <div className="mt-2 text-[10px] text-txt-4 text-right">
            {ACTIVE_STOCKS.length} stocks monitored / updated after market close
          </div>
        </div>

        {/* ─── 3. Disposal Rules ────────────────────────────────────────── */}
        <InfoSection />

        {/* Bottom spacer */}
        <div className="h-8" />
      </main>
    </div>
  );
}
