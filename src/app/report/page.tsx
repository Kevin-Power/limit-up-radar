"use client";

import { useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPct, formatPrice } from "@/lib/utils";

/* ================================================================
   SUB-COMPONENTS
   ================================================================ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-txt-0 tracking-tight mb-4 flex items-center gap-2">
      <span className="w-1 h-4 bg-red rounded-full inline-block" />
      {children}
    </h2>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-bg-1 border border-border rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

function Chip({ label, variant }: { label: string; variant: "green" | "red" | "blue" | "amber" }) {
  const styles: Record<string, string> = {
    green: "text-green bg-green-bg",
    red:   "text-red bg-red-bg",
    blue:  "text-blue bg-blue-bg",
    amber: "text-amber bg-amber-bg",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${styles[variant]}`}>
      {label}
    </span>
  );
}

/* ================================================================
   MOCK DATA
   ================================================================ */

const REPORT_DATE = "2026/03/20";

const MARKET_CONCLUSION = {
  regime: "偏多" as const,
  streak: 3,
  summary:
    "加權指數收漲236點站上33,689點,量能溫和放大至4,128億元。AI伺服器散熱族群全面點火帶動電子股走強,半導體測試、矽光子類股漲停家數創近期新高。外資連三日買超,短線多頭格局延續。",
};

const BREADTH = {
  advances: 892,
  declines: 421,
  unchanged: 87,
  aboveMa20Pct: 63.5,
  todayVolume: 4128,
  avg5Volume: 3645,
};

const SECTOR_PERFORMANCE = {
  top: [
    { name: "AI伺服器 / 散熱",      pct: 4.82 },
    { name: "矽光子 / 高速傳輸",     pct: 3.65 },
    { name: "半導體測試 / 先進封裝",  pct: 2.91 },
    { name: "IC設計 / AI邊緣運算",   pct: 2.34 },
    { name: "PCB / CCL基板",        pct: 1.87 },
  ],
  bottom: [
    { name: "營建 / 資產",     pct: -1.23 },
    { name: "塑化 / 油價",     pct: -0.85 },
    { name: "鋼鐵 / 鋼價調漲", pct: -0.62 },
  ],
};

interface StrongStock {
  code: string;
  name: string;
  price: number;
  changePct: number;
  score: number;
  reasons: { label: string; variant: "green" | "blue" | "amber" }[];
}

const STRONG_SETUPS: StrongStock[] = [
  { code: "3324", name: "雙鴻",   price: 1065.0, changePct: 10.0,  score: 95, reasons: [{ label: "法人連買", variant: "green" }, { label: "營收加速", variant: "blue" }, { label: "KD金叉", variant: "amber" }] },
  { code: "3017", name: "奇鋐",   price: 329.0,  changePct: 10.0,  score: 92, reasons: [{ label: "法人連買", variant: "green" }, { label: "突破前高", variant: "blue" }] },
  { code: "6669", name: "緯穎",   price: 3775.0, changePct: 6.85,  score: 88, reasons: [{ label: "營收加速", variant: "blue" }, { label: "KD金叉", variant: "amber" }] },
  { code: "6515", name: "穎崴",   price: 7930.0, changePct: 5.32,  score: 85, reasons: [{ label: "法人連買", variant: "green" }, { label: "量能擴增", variant: "amber" }] },
  { code: "2454", name: "聯發科", price: 1700.0, changePct: 4.68,  score: 82, reasons: [{ label: "突破前高", variant: "blue" }, { label: "外資買超", variant: "green" }] },
  { code: "2376", name: "技嘉",   price: 378.0,  changePct: 10.0,  score: 80, reasons: [{ label: "KD金叉", variant: "amber" }, { label: "量能擴增", variant: "amber" }] },
  { code: "3037", name: "欣興",   price: 215.0,  changePct: 3.81,  score: 78, reasons: [{ label: "法人連買", variant: "green" }, { label: "營收加速", variant: "blue" }] },
  { code: "6223", name: "旺矽",   price: 3860.0, changePct: 3.15,  score: 75, reasons: [{ label: "外資買超", variant: "green" }, { label: "KD金叉", variant: "amber" }] },
];

interface RiskStock {
  code: string;
  name: string;
  price: number;
  changePct: number;
  riskScore: number;
  reasons: { label: string; variant: "red" | "amber" }[];
}

const RISK_LIST: RiskStock[] = [
  { code: "6683", name: "雍智",   price: 312.0,  changePct: -3.25, riskScore: 92, reasons: [{ label: "法人連賣", variant: "red" }, { label: "RSI過熱", variant: "amber" }, { label: "量縮破線", variant: "red" }] },
  { code: "4765", name: "精金",   price: 28.5,   changePct: -2.50, riskScore: 85, reasons: [{ label: "RSI過熱", variant: "amber" }, { label: "主力出貨", variant: "red" }] },
  { code: "1301", name: "台塑",   price: 42.8,   changePct: -1.87, riskScore: 78, reasons: [{ label: "法人連賣", variant: "red" }, { label: "跌破月線", variant: "amber" }] },
  { code: "2007", name: "燁興",   price: 8.63,   changePct: -1.36, riskScore: 72, reasons: [{ label: "量縮破線", variant: "red" }, { label: "KD死叉", variant: "amber" }] },
  { code: "1303", name: "南亞",   price: 38.5,   changePct: -0.75, riskScore: 65, reasons: [{ label: "外資賣超", variant: "red" }, { label: "RSI過熱", variant: "amber" }] },
];

/* ================================================================
   MARKET BREADTH VISUAL
   ================================================================ */

function BreadthBar() {
  const { advances, declines, unchanged } = BREADTH;
  const total = advances + declines + unchanged;
  const advPct = (advances / total) * 100;
  const unchPct = (unchanged / total) * 100;

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-txt-3 mb-1">
        <span className="text-green font-medium">{advances} 漲</span>
        <span className="text-txt-4">{unchanged} 平</span>
        <span className="text-red font-medium">{declines} 跌</span>
      </div>
      <div className="w-full h-3 rounded-full overflow-hidden flex">
        <div className="h-full bg-green" style={{ width: `${advPct}%` }} />
        <div className="h-full bg-bg-3" style={{ width: `${unchPct}%` }} />
        <div className="h-full bg-red" style={{ width: `${100 - advPct - unchPct}%` }} />
      </div>
    </div>
  );
}

function Ma20Gauge() {
  const pct = BREADTH.aboveMa20Pct;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-txt-3">站上20MA比例</span>
        <span className={`font-medium ${pct >= 50 ? "text-green" : "text-red"}`}>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-bg-3 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: pct >= 50 ? "var(--green)" : "var(--red)",
          }}
        />
      </div>
    </div>
  );
}

function VolumeComparison() {
  const { todayVolume, avg5Volume } = BREADTH;
  const ratio = todayVolume / avg5Volume;
  const pctOfAvg = (ratio * 100).toFixed(0);
  const isAbove = ratio >= 1;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-txt-3">量能 vs 5日均量</span>
        <span className={`font-medium ${isAbove ? "text-green" : "text-red"}`}>
          {pctOfAvg}%
        </span>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <div className="text-[10px] text-txt-4 mb-0.5">今日</div>
          <div className="h-5 bg-blue rounded" style={{ width: `${Math.min(ratio * 80, 100)}%` }} />
          <div className="text-[10px] text-txt-3 mt-0.5">{todayVolume.toLocaleString()} 億</div>
        </div>
        <div className="flex-1">
          <div className="text-[10px] text-txt-4 mb-0.5">5日均量</div>
          <div className="h-5 bg-bg-3 rounded" style={{ width: "80%" }} />
          <div className="text-[10px] text-txt-3 mt-0.5">{avg5Volume.toLocaleString()} 億</div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   SECTOR BARS
   ================================================================ */

function SectorBars() {
  const maxPct = Math.max(
    ...SECTOR_PERFORMANCE.top.map((s) => s.pct),
    ...SECTOR_PERFORMANCE.bottom.map((s) => Math.abs(s.pct))
  );

  return (
    <div className="space-y-4">
      {/* Top sectors */}
      <div className="space-y-2">
        {SECTOR_PERFORMANCE.top.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <div className="w-24 md:w-40 text-xs text-txt-2 truncate text-right shrink-0">{s.name}</div>
            <div className="flex-1 h-5 bg-bg-2 rounded overflow-hidden">
              <div
                className="h-full bg-green/70 rounded"
                style={{ width: `${(s.pct / maxPct) * 100}%` }}
              />
            </div>
            <div className="w-14 text-xs text-green font-mono text-right shrink-0">
              +{s.pct.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border" />

      {/* Bottom sectors */}
      <div className="space-y-2">
        {SECTOR_PERFORMANCE.bottom.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <div className="w-24 md:w-40 text-xs text-txt-2 truncate text-right shrink-0">{s.name}</div>
            <div className="flex-1 h-5 bg-bg-2 rounded overflow-hidden">
              <div
                className="h-full bg-red/70 rounded"
                style={{ width: `${(Math.abs(s.pct) / maxPct) * 100}%` }}
              />
            </div>
            <div className="w-14 text-xs text-red font-mono text-right shrink-0">
              {s.pct.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   MAIN PAGE
   ================================================================ */

export default function ReportPage() {
  const regimeColor =
    MARKET_CONCLUSION.regime === "偏多"
      ? "text-green bg-green-bg"
      : MARKET_CONCLUSION.regime === "偏空"
      ? "text-red bg-red-bg"
      : "text-amber bg-amber-bg";

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1">
      <TopNav currentDate="2026-03-20" />
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-txt-0 tracking-tight">每日盤後報告</h1>
            <p className="text-sm text-txt-3 mt-1">{REPORT_DATE}</p>
          </div>
          <span className={`text-sm px-3 py-1.5 rounded-md font-bold ${regimeColor}`}>
            {MARKET_CONCLUSION.regime}
          </span>
        </div>

        {/* ── 1. Market Conclusion ── */}
        <section>
          <SectionTitle>大盤結論</SectionTitle>
          <Card>
            <p className="text-sm text-txt-1 leading-relaxed mb-3">
              {MARKET_CONCLUSION.summary}
            </p>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded font-medium ${regimeColor}`}>
                {MARKET_CONCLUSION.regime}
              </span>
              <span className="text-xs text-txt-3">
                連{MARKET_CONCLUSION.streak}日
              </span>
            </div>
          </Card>
        </section>

        {/* ── 2. Market Breadth ── */}
        <section>
          <SectionTitle>市場寬度</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">漲跌家數</div>
              <BreadthBar />
            </Card>
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">均線分布</div>
              <Ma20Gauge />
            </Card>
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">成交量能</div>
              <VolumeComparison />
            </Card>
          </div>
        </section>

        {/* ── 3. Sector Performance ── */}
        <section>
          <SectionTitle>族群表現</SectionTitle>
          <Card>
            <SectorBars />
          </Card>
        </section>

        {/* ── 4. Strong Setups ── */}
        <section>
          <SectionTitle>強勢標的</SectionTitle>
          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-txt-4 border-b border-border">
                  <th className="text-left pb-2 font-medium">代碼</th>
                  <th className="text-left pb-2 font-medium">名稱</th>
                  <th className="text-right pb-2 font-medium">股價</th>
                  <th className="text-right pb-2 font-medium">漲幅</th>
                  <th className="text-right pb-2 font-medium">評分</th>
                  <th className="text-left pb-2 font-medium pl-4">理由</th>
                </tr>
              </thead>
              <tbody>
                {STRONG_SETUPS.map((s) => (
                  <tr key={s.code} className="border-b border-border/50 hover:bg-bg-2/50 transition-colors">
                    <td className="py-2.5 text-txt-3 font-mono">{s.code}</td>
                    <td className="py-2.5 text-txt-0 font-medium">{s.name}</td>
                    <td className="py-2.5 text-right text-txt-1 font-mono">{formatPrice(s.price)}</td>
                    <td className="py-2.5 text-right text-green font-mono">
                      +{s.changePct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 text-right">
                      <span className={`font-bold ${
                        s.score >= 90 ? "text-green" : s.score >= 80 ? "text-blue" : "text-amber"
                      }`}>
                        {s.score}
                      </span>
                    </td>
                    <td className="py-2.5 pl-4">
                      <div className="flex flex-wrap gap-1">
                        {s.reasons.map((r) => (
                          <Chip key={r.label} label={r.label} variant={r.variant} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        {/* ── 5. Risk List ── */}
        <section>
          <SectionTitle>風險警示</SectionTitle>
          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-txt-4 border-b border-border">
                  <th className="text-left pb-2 font-medium">代碼</th>
                  <th className="text-left pb-2 font-medium">名稱</th>
                  <th className="text-right pb-2 font-medium">股價</th>
                  <th className="text-right pb-2 font-medium">跌幅</th>
                  <th className="text-right pb-2 font-medium">風險分</th>
                  <th className="text-left pb-2 font-medium pl-4">警示原因</th>
                </tr>
              </thead>
              <tbody>
                {RISK_LIST.map((s) => (
                  <tr key={s.code} className="border-b border-border/50 hover:bg-bg-2/50 transition-colors">
                    <td className="py-2.5 text-txt-3 font-mono">{s.code}</td>
                    <td className="py-2.5 text-txt-0 font-medium">{s.name}</td>
                    <td className="py-2.5 text-right text-txt-1 font-mono">{formatPrice(s.price)}</td>
                    <td className="py-2.5 text-right text-red font-mono">
                      {s.changePct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 text-right">
                      <span className={`font-bold ${
                        s.riskScore >= 85 ? "text-red" : s.riskScore >= 70 ? "text-amber" : "text-txt-2"
                      }`}>
                        {s.riskScore}
                      </span>
                    </td>
                    <td className="py-2.5 pl-4">
                      <div className="flex flex-wrap gap-1">
                        {s.reasons.map((r) => (
                          <Chip key={r.label} label={r.label} variant={r.variant} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        {/* ── 6. Report Archive Link ── */}
        <div className="flex justify-end">
          <Link
            href="/history"
            className="text-sm text-accent hover:text-accent/80 transition-colors font-medium"
          >
            查看歷史報告 &gt;
          </Link>
        </div>
      </main>
    </div>
  );
}
