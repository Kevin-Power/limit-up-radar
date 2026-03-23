"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";

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

interface HistoricalCase {
  code: string;
  name: string;
  disposalDate: string;
  reason: string;
  duration: string;
  drawdown: number;
  recovery30d: number;
}

// ── Mock Data ────────────────────────────────────────────────────────────────

const DISPOSAL_STOCKS: DisposalStock[] = [
  { code: "6683", name: "雍智",   industry: "IC載板",    streak: 5, gain10d: 62.3, daysHit: 5, daysRequired: 5, risk: "高危", status: "預警中",   volumeAnomaly: true },
  { code: "4765", name: "精金",   industry: "精密加工",  streak: 4, gain10d: 55.1, daysHit: 4, daysRequired: 5, risk: "高危", status: "預警中",   volumeAnomaly: true },
  { code: "3363", name: "上詮",   industry: "光通訊",    streak: 6, gain10d: 78.5, daysHit: 5, daysRequired: 5, risk: "高危", status: "已處置",   volumeAnomaly: true },
  { code: "7795", name: "長廣",   industry: "醫療器材",  streak: 5, gain10d: 58.7, daysHit: 5, daysRequired: 5, risk: "高危", status: "已處置",   volumeAnomaly: true },
  { code: "4977", name: "眾達-KY", industry: "高速傳輸", streak: 3, gain10d: 42.8, daysHit: 3, daysRequired: 5, risk: "注意", status: "正常交易", volumeAnomaly: true },
  { code: "3037", name: "欣興",   industry: "PCB",       streak: 3, gain10d: 38.2, daysHit: 3, daysRequired: 5, risk: "注意", status: "正常交易", volumeAnomaly: false },
  { code: "1471", name: "首利",   industry: "散熱零件",  streak: 3, gain10d: 35.6, daysHit: 3, daysRequired: 5, risk: "注意", status: "正常交易", volumeAnomaly: true },
  { code: "2007", name: "燁興",   industry: "鋼鐵",      streak: 3, gain10d: 33.4, daysHit: 3, daysRequired: 5, risk: "注意", status: "預警中",   volumeAnomaly: false },
  { code: "6274", name: "台燿",   industry: "CCL基板",   streak: 2, gain10d: 28.9, daysHit: 2, daysRequired: 5, risk: "觀察", status: "正常交易", volumeAnomaly: false },
  { code: "2401", name: "凌陽",   industry: "IC設計",    streak: 2, gain10d: 24.1, daysHit: 2, daysRequired: 5, risk: "觀察", status: "正常交易", volumeAnomaly: false },
  { code: "2548", name: "華固",   industry: "營建",      streak: 2, gain10d: 22.7, daysHit: 2, daysRequired: 5, risk: "觀察", status: "正常交易", volumeAnomaly: true },
  { code: "2458", name: "義隆",   industry: "IC設計",    streak: 2, gain10d: 21.3, daysHit: 2, daysRequired: 5, risk: "觀察", status: "正常交易", volumeAnomaly: false },
  { code: "3189", name: "景碩",   industry: "IC載板",    streak: 1, gain10d: 18.5, daysHit: 1, daysRequired: 5, risk: "觀察", status: "正常交易", volumeAnomaly: false },
  { code: "2014", name: "中鴻",   industry: "鋼鐵",      streak: 1, gain10d: 15.2, daysHit: 1, daysRequired: 5, risk: "觀察", status: "正常交易", volumeAnomaly: false },
  { code: "4743", name: "合一",   industry: "生技製藥",  streak: 1, gain10d: 12.8, daysHit: 1, daysRequired: 5, risk: "觀察", status: "正常交易", volumeAnomaly: false },
  { code: "6446", name: "藥華藥", industry: "生技製藥",  streak: 1, gain10d: 11.4, daysHit: 1, daysRequired: 5, risk: "觀察", status: "正常交易", volumeAnomaly: false },
];

const HISTORICAL_CASES: HistoricalCase[] = [
  { code: "6683", name: "雍智",   disposalDate: "2026-02-18", reason: "連續5日漲停",      duration: "10個交易日", drawdown: -18.5, recovery30d: -5.2 },
  { code: "3363", name: "上詮",   disposalDate: "2026-01-08", reason: "10日漲幅超過80%",   duration: "20個交易日", drawdown: -32.1, recovery30d: -12.4 },
  { code: "7795", name: "長廣",   disposalDate: "2025-12-15", reason: "連續5日漲停",      duration: "10個交易日", drawdown: -15.8, recovery30d: 3.2 },
  { code: "4765", name: "精金",   disposalDate: "2025-11-20", reason: "成交量異常+連漲",   duration: "5個交易日",  drawdown: -8.3,  recovery30d: 7.6 },
  { code: "1471", name: "首利",   disposalDate: "2025-09-03", reason: "10日漲幅超過60%",   duration: "10個交易日", drawdown: -22.4, recovery30d: -8.1 },
  { code: "3037", name: "欣興",   disposalDate: "2025-07-11", reason: "連續5日漲停",      duration: "10個交易日", drawdown: -14.2, recovery30d: 1.5 },
  { code: "4977", name: "眾達-KY", disposalDate: "2025-05-22", reason: "成交量異常放大",   duration: "5個交易日",  drawdown: -6.7,  recovery30d: 12.3 },
  { code: "2007", name: "燁興",   disposalDate: "2025-03-10", reason: "連續5日漲停",      duration: "20個交易日", drawdown: -28.9, recovery30d: -15.6 },
  { code: "3189", name: "景碩",   disposalDate: "2025-01-14", reason: "10日漲幅超過55%",   duration: "10個交易日", drawdown: -11.3, recovery30d: 4.8 },
];

// Impact chart data: days relative to disposal vs avg price change %
const IMPACT_DATA = [
  { day: -5, value: 0 },
  { day: -4, value: 4.2 },
  { day: -3, value: 9.8 },
  { day: -2, value: 18.5 },
  { day: -1, value: 28.3 },
  { day: 0,  value: 35.1 },
  { day: 1,  value: 30.2 },
  { day: 2,  value: 24.5 },
  { day: 3,  value: 19.8 },
  { day: 4,  value: 16.1 },
  { day: 5,  value: 13.5 },
  { day: 6,  value: 11.2 },
  { day: 7,  value: 9.8 },
  { day: 8,  value: 8.1 },
  { day: 9,  value: 7.2 },
  { day: 10, value: 6.5 },
  { day: 11, value: 5.1 },
  { day: 12, value: 4.8 },
  { day: 13, value: 3.9 },
  { day: 14, value: 3.2 },
  { day: 15, value: 2.8 },
  { day: 16, value: 2.1 },
  { day: 17, value: 1.5 },
  { day: 18, value: 0.8 },
  { day: 19, value: 0.2 },
  { day: 20, value: -0.5 },
];

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
    "高危": "bg-red/10 text-red border border-red/30",
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

function ImpactChart() {
  const width = 700;
  const height = 280;
  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 40;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const minDay = -5;
  const maxDay = 20;
  const minVal = -5;
  const maxVal = 40;

  const xScale = (d: number) => padL + ((d - minDay) / (maxDay - minDay)) * chartW;
  const yScale = (v: number) => padT + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

  const pathD = IMPACT_DATA.map((p, i) =>
    `${i === 0 ? "M" : "L"}${xScale(p.day).toFixed(1)},${yScale(p.value).toFixed(1)}`
  ).join(" ");

  const areaD = pathD + ` L${xScale(20).toFixed(1)},${yScale(0).toFixed(1)} L${xScale(-5).toFixed(1)},${yScale(0).toFixed(1)} Z`;

  const yTicks = [-5, 0, 5, 10, 15, 20, 25, 30, 35, 40];
  const xTicks = [-5, 0, 5, 10, 15, 20];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 300 }}>
      {/* Grid lines */}
      {yTicks.map(v => (
        <line key={`y${v}`} x1={padL} x2={width - padR} y1={yScale(v)} y2={yScale(v)}
          stroke="var(--border)" strokeWidth={v === 0 ? 1 : 0.5} strokeDasharray={v === 0 ? "" : "3,3"} />
      ))}

      {/* Disposal day vertical line */}
      <line x1={xScale(0)} x2={xScale(0)} y1={padT} y2={padT + chartH}
        stroke="var(--red)" strokeWidth={1} strokeDasharray="4,3" opacity={0.6} />
      <text x={xScale(0)} y={padT - 6} textAnchor="middle" fill="var(--red)" fontSize={10} fontWeight={600}>
        T=0
      </text>

      {/* Area fill */}
      <path d={areaD} fill="url(#impactGrad)" opacity={0.15} />
      <defs>
        <linearGradient id="impactGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--amber)" />
          <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Line */}
      <path d={pathD} fill="none" stroke="var(--amber)" strokeWidth={2} />

      {/* Peak dot */}
      <circle cx={xScale(0)} cy={yScale(35.1)} r={3.5} fill="var(--red)" />
      <text x={xScale(0) + 8} y={yScale(35.1) - 6} fill="var(--red)" fontSize={10} fontWeight={600}>
        +35.1%
      </text>

      {/* End dot */}
      <circle cx={xScale(20)} cy={yScale(-0.5)} r={3} fill="var(--green)" />
      <text x={xScale(20) - 8} y={yScale(-0.5) - 8} fill="var(--green)" fontSize={10} fontWeight={600} textAnchor="end">
        -0.5%
      </text>

      {/* Y-axis labels */}
      {yTicks.map(v => (
        <text key={`yl${v}`} x={padL - 8} y={yScale(v) + 3.5} textAnchor="end" fill="var(--text-4)" fontSize={9}>
          {v > 0 ? `+${v}%` : `${v}%`}
        </text>
      ))}

      {/* X-axis labels */}
      {xTicks.map(d => (
        <text key={`xl${d}`} x={xScale(d)} y={padT + chartH + 16} textAnchor="middle" fill="var(--text-4)" fontSize={9}>
          {d === 0 ? "T" : d > 0 ? `T+${d}` : `T${d}`}
        </text>
      ))}

      {/* Axis label */}
      <text x={width / 2} y={height - 4} textAnchor="middle" fill="var(--text-4)" fontSize={10}>
        Day (relative to disposal)
      </text>
    </svg>
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

  const sorted = useMemo(() => sortStocks(DISPOSAL_STOCKS, sortKey, sortAsc), [sortKey, sortAsc]);

  const countWarning = DISPOSAL_STOCKS.filter(s => s.risk === "高危").length;
  const countAlert = DISPOSAL_STOCKS.filter(s => s.status === "預警中").length;
  const countDisposed = DISPOSAL_STOCKS.filter(s => s.status === "已處置").length;

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
      <TopNav currentDate="2026-03-21" />
      <NavBar />
      <main className="flex-1 overflow-y-auto p-5 max-w-6xl mx-auto w-full space-y-6">

        {/* Demo banner */}
        <div className="flex items-center gap-2 px-3 py-2 bg-amber/10 border border-amber/30 rounded-lg text-xs text-amber font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber flex-shrink-0" />
          <span>示範資料 -- 此頁面顯示模擬數據，僅供功能展示，不構成投資建議</span>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-xl font-bold text-txt-0 tracking-tight">處置風險監控</h1>
          <p className="text-xs text-txt-4 mt-1">監控接近或已達台灣證交所處置標準的個股，提前預警流動性風險</p>
        </div>

        {/* ─── 1. KPI Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          <KPICard label="處置警告股" value={countWarning} color="red" />
          <KPICard label="預警中" value={countAlert} color="amber" />
          <KPICard label="已處置" value={countDisposed} color="blue" />
        </div>

        {/* ─── 2. Risk Monitoring Table ─────────────────────────────────── */}
        <div>
          <div className="text-xs font-semibold text-txt-3 uppercase tracking-wider mb-3">處置風險監控表</div>
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[60px_80px_80px_90px_80px_110px_80px_70px_70px] gap-0 px-4 py-2 bg-bg-2 border-b border-border text-[10px] font-semibold text-txt-4 uppercase tracking-wider">
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
                  className={`grid grid-cols-[60px_80px_80px_90px_80px_110px_80px_70px_70px] gap-0 px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 transition-colors hover:bg-white/[0.03] ${rowBg}`}
                >
                  <div className="text-xs font-semibold text-txt-3 tabular-nums">
                    <Link href={`/stock/${s.code}`} className="hover:text-txt-1 hover:underline underline-offset-2 transition-colors">
                      {s.code}
                    </Link>
                  </div>
                  <div className="text-[13px] font-semibold text-txt-0">
                    <Link href={`/stock/${s.code}`} className="hover:text-white hover:underline underline-offset-2 transition-colors">
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
          <div className="mt-2 text-[10px] text-txt-4 text-right">
            {DISPOSAL_STOCKS.length} stocks monitored / updated after market close
          </div>
        </div>

        {/* ─── 3. Disposal Rules ────────────────────────────────────────── */}
        <InfoSection />

        {/* ─── 4. Impact Analysis Chart ─────────────────────────────────── */}
        <div>
          <div className="text-xs font-semibold text-txt-3 uppercase tracking-wider mb-3">處置影響分析</div>
          <div className="border border-border rounded-lg bg-bg-1 p-4">
            <div className="text-[11px] text-txt-4 mb-3">
              Average stock price change (%) relative to disposal date (T=0), based on historical cases
            </div>
            <ImpactChart />
            <div className="flex items-center gap-6 mt-3 text-[10px] text-txt-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-amber inline-block rounded" />
                <span>Avg price change</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red inline-block" />
                <span>Disposal date peak</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-px bg-red inline-block" style={{ borderTop: "1px dashed var(--red)" }} />
                <span>T=0 disposal start</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── 5. Historical Cases ──────────────────────────────────────── */}
        <div>
          <div className="text-xs font-semibold text-txt-3 uppercase tracking-wider mb-3">歷史處置案例</div>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[60px_70px_90px_120px_90px_90px_110px] gap-0 px-4 py-2 bg-bg-2 border-b border-border text-[10px] font-semibold text-txt-4 uppercase tracking-wider">
              <div>代號</div>
              <div>名稱</div>
              <div>處置日期</div>
              <div>處置原因</div>
              <div>處置期間</div>
              <div>期間跌幅%</div>
              <div>解除後30日</div>
            </div>
            {HISTORICAL_CASES.map((c) => (
              <div
                key={`${c.code}-${c.disposalDate}`}
                className="grid grid-cols-[60px_70px_90px_120px_90px_90px_110px] gap-0 px-4 py-2.5 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
              >
                <div className="text-xs font-semibold text-txt-3 tabular-nums">
                  <Link href={`/stock/${c.code}`} className="hover:text-txt-1 hover:underline underline-offset-2 transition-colors">
                    {c.code}
                  </Link>
                </div>
                <div className="text-[13px] font-semibold text-txt-0">
                  <Link href={`/stock/${c.code}`} className="hover:text-white hover:underline underline-offset-2 transition-colors">
                    {c.name}
                  </Link>
                </div>
                <div className="text-xs tabular-nums text-txt-2">{c.disposalDate}</div>
                <div className="text-[11px] text-txt-3">{c.reason}</div>
                <div className="text-xs text-txt-2">{c.duration}</div>
                <div className={`text-xs font-semibold tabular-nums ${c.drawdown <= -20 ? "text-green" : "text-green"}`}>
                  {c.drawdown.toFixed(1)}%
                </div>
                <div className={`text-xs font-semibold tabular-nums ${c.recovery30d > 0 ? "text-red" : c.recovery30d < 0 ? "text-green" : "text-txt-3"}`}>
                  {c.recovery30d > 0 ? "+" : ""}{c.recovery30d.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-txt-4">
            * Historical data for reference only. Past performance does not predict future results.
          </div>
        </div>

        {/* ─── 6. Disposal Statistics ───────────────────────────────────── */}
        <div>
          <div className="text-xs font-semibold text-txt-3 uppercase tracking-wider mb-3">處置統計</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-bg-1 border border-border rounded-lg p-4">
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-1">近一年處置次數</div>
              <div className="text-xl font-bold text-txt-0 tabular-nums">23</div>
              <div className="text-[10px] text-txt-4 mt-0.5">cases in past 12 months</div>
            </div>
            <div className="bg-bg-1 border border-border rounded-lg p-4">
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-1">平均處置期間</div>
              <div className="text-xl font-bold text-txt-0 tabular-nums">11.2 <span className="text-sm font-normal text-txt-3">days</span></div>
              <div className="text-[10px] text-txt-4 mt-0.5">average trading days</div>
            </div>
            <div className="bg-bg-1 border border-border rounded-lg p-4">
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-1">處置後平均跌幅</div>
              <div className="text-xl font-bold text-green tabular-nums">-17.6%</div>
              <div className="text-[10px] text-txt-4 mt-0.5">avg decline during disposal</div>
            </div>
            <div className="bg-bg-1 border border-border rounded-lg p-4">
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-1">解除後回升比例</div>
              <div className="text-xl font-bold text-amber tabular-nums">34.8%</div>
              <div className="text-[10px] text-txt-4 mt-0.5">recovered within 30 days</div>
            </div>
          </div>
        </div>

        {/* Bottom spacer */}
        <div className="h-8" />
      </main>
    </div>
  );
}
