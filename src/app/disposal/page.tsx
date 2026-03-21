"use client";

import { useState } from "react";
import TopNav from "@/components/TopNav";

// ─── Mock data ────────────────────────────────────────────────────────────────

type RiskLevel = "高危" | "注意" | "觀察";
type Status = "正常交易" | "預警中" | "已處置";

interface DisposalStock {
  code: string;
  name: string;
  streak: number;
  daysToDisposal: string;
  risk: RiskLevel;
  status: Status;
}

const DISPOSAL_STOCKS: DisposalStock[] = [
  { code: "3324", name: "雙鴻",   streak: 5, daysToDisposal: "已達標準", risk: "高危", status: "預警中"  },
  { code: "3017", name: "奇鋐",   streak: 4, daysToDisposal: "1天",      risk: "高危", status: "預警中"  },
  { code: "3131", name: "弘塑",   streak: 3, daysToDisposal: "2天",      risk: "注意", status: "正常交易" },
  { code: "3037", name: "欣興",   streak: 3, daysToDisposal: "2天",      risk: "注意", status: "正常交易" },
  { code: "2388", name: "威盛",   streak: 2, daysToDisposal: "1天",      risk: "注意", status: "正常交易" },
  { code: "4174", name: "浩鼎",   streak: 6, daysToDisposal: "已達標準", risk: "高危", status: "已處置"  },
  { code: "6510", name: "精測",   streak: 1, daysToDisposal: "2天",      risk: "觀察", status: "正常交易" },
  { code: "5534", name: "長虹",   streak: 2, daysToDisposal: "2天",      risk: "觀察", status: "正常交易" },
];

interface HistoricalCase {
  name: string;
  code: string;
  disposalDate: string;
  duration: string;
  result: string;
}

const HISTORICAL_CASES: HistoricalCase[] = [
  { code: "1234", name: "某電子",   disposalDate: "2026-01-08", duration: "10 個交易日", result: "解除後跌 12%" },
  { code: "5566", name: "某生技",   disposalDate: "2025-11-20", duration: "20 個交易日", result: "解除後跌 8%"  },
  { code: "8888", name: "某半導體", disposalDate: "2025-09-03", duration: "5 個交易日",  result: "解除後漲 3%"  },
  { code: "2299", name: "某通訊",   disposalDate: "2025-06-15", duration: "10 個交易日", result: "解除後平盤"    },
  { code: "7711", name: "某營建",   disposalDate: "2025-03-22", duration: "20 個交易日", result: "解除後跌 18%" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }) {
  const cls: Record<RiskLevel, string> = {
    高危: "bg-red/10 text-red border border-red/30",
    注意: "bg-amber/10 text-amber border border-amber/30",
    觀察: "bg-blue/10 text-blue border border-blue/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${cls[level]}`}>
      {level}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const cls: Record<Status, string> = {
    正常交易: "text-txt-3",
    預警中:   "text-amber font-semibold",
    已處置:   "text-red font-semibold",
  };
  return <span className={`text-xs ${cls[status]}`}>{status}</span>;
}

function StreakDots({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: Math.min(count, 6) }).map((_, i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-red" />
      ))}
      <span className="text-xs tabular-nums text-txt-2 ml-1">{count} 天</span>
    </div>
  );
}

function InfoSection() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-2 hover:bg-bg-3 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-txt-1">處置標準說明</span>
        <span className="text-txt-4 text-xs">{open ? "▲ 收起" : "▼ 展開"}</span>
      </button>
      {open && (
        <div className="px-4 py-4 bg-bg-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { rule: "連續 3 日漲停", detail: "第 4 日起改為人工撮合管控，限制委託量" },
            { rule: "連續 5 日異常波動", detail: "改為分盤交易，每 5 分鐘撮合一次，流動性大降" },
            { rule: "10 個交易日漲幅超過 50%", detail: "列入注意股，加強監控，公告預警" },
            { rule: "成交量異常放大", detail: "主管機關列入觀察名單，後續可能升格為處置" },
          ].map(({ rule, detail }) => (
            <div key={rule} className="flex gap-3 p-3 bg-bg-2 rounded-lg border border-border">
              <div className="w-1.5 flex-shrink-0 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-amber" />
              </div>
              <div>
                <div className="text-xs font-semibold text-txt-1 mb-0.5">{rule}</div>
                <div className="text-[11px] text-txt-4 leading-relaxed">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DisposalPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate="2026-03-20" />
      <main className="flex-1 overflow-y-auto p-5 max-w-5xl mx-auto w-full">

        {/* Demo banner */}
        <div className="flex items-center gap-2 px-3 py-2 bg-amber/10 border border-amber/30 rounded-lg text-xs text-amber font-medium mb-5">
          <span>⚠</span>
          <span>示範資料 — 此頁面顯示模擬數據，僅供功能展示，不構成投資建議</span>
        </div>

        {/* Title */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-txt-0 tracking-tight">處置預測</h1>
          <p className="text-xs text-txt-4 mt-1">監控接近或已達台灣證交所處置標準的個股，提前預警流動性風險</p>
        </div>

        {/* Risk table */}
        <div className="mb-6">
          <div className="text-xs font-semibold text-txt-3 uppercase tracking-wider mb-3">處置風險警告</div>
          <div className="border border-border rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] gap-0 px-4 py-2 bg-bg-2 border-b border-border text-[10px] font-semibold text-txt-4 uppercase tracking-wider">
              <div>股票</div>
              <div>代號</div>
              <div>連板天數</div>
              <div>距離處置</div>
              <div>風險等級</div>
              <div>狀態</div>
            </div>

            {/* Rows */}
            {DISPOSAL_STOCKS.map((s, idx) => (
              <div
                key={s.code}
                className={`grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] gap-0 px-4 py-3 items-center border-b border-white/[0.03] last:border-b-0 transition-colors hover:bg-white/[0.02] ${
                  s.status === "已處置" ? "bg-red/[0.03]" : ""
                }`}
              >
                <div className="text-[13px] font-semibold text-txt-0">{s.name}</div>
                <div className="text-xs font-semibold text-txt-3 tabular-nums">{s.code}</div>
                <div><StreakDots count={s.streak} /></div>
                <div className={`text-xs tabular-nums font-semibold ${s.daysToDisposal === "已達標準" ? "text-red" : s.daysToDisposal === "1天" ? "text-amber" : "text-txt-2"}`}>
                  {s.daysToDisposal}
                </div>
                <div><RiskBadge level={s.risk} /></div>
                <div><StatusBadge status={s.status} /></div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-txt-4 text-right">
            共 {DISPOSAL_STOCKS.length} 檔監控中 · 每日收盤後更新
          </div>
        </div>

        {/* Collapsible rule info */}
        <InfoSection />

        {/* Historical cases */}
        <div>
          <div className="text-xs font-semibold text-txt-3 uppercase tracking-wider mb-3">歷史處置案例</div>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-0 px-4 py-2 bg-bg-2 border-b border-border text-[10px] font-semibold text-txt-4 uppercase tracking-wider">
              <div>股票</div>
              <div>處置日期</div>
              <div>處置期間</div>
              <div>解除後結果</div>
            </div>
            {HISTORICAL_CASES.map((c) => (
              <div
                key={c.code}
                className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-0 px-4 py-3 items-center border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors"
              >
                <div>
                  <div className="text-[13px] font-semibold text-txt-0">{c.name}</div>
                  <div className="text-[10px] text-txt-4">{c.code}</div>
                </div>
                <div className="text-xs tabular-nums text-txt-2">{c.disposalDate}</div>
                <div className="text-xs text-txt-2">{c.duration}</div>
                <div className={`text-xs font-semibold ${c.result.includes("漲") ? "text-red" : c.result.includes("跌") ? "text-green" : "text-txt-3"}`}>
                  {c.result}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-txt-4">
            * 歷史資料僅供參考，過去績效不代表未來表現
          </div>
        </div>

      </main>
    </div>
  );
}
