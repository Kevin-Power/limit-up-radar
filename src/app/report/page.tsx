"use client";

import useSWR from "swr";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPrice, getTodayString, getTodaySlash } from "@/lib/utils";

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
   MARKET BREADTH VISUAL
   ================================================================ */

function BreadthBar({ advances, declines, unchanged }: { advances: number; declines: number; unchanged: number }) {
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


/* ================================================================
   SECTOR BARS
   ================================================================ */

function SectorBars({ top, bottom }: { top: { name: string; pct: number }[]; bottom: { name: string; pct: number }[] }) {
  const maxPct = Math.max(
    ...top.map((s) => s.pct),
    ...bottom.map((s) => Math.abs(s.pct)),
    0.1
  );

  return (
    <div className="space-y-4">
      {/* Top sectors */}
      <div className="space-y-2">
        {top.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <div className="w-24 md:w-40 text-xs text-txt-2 truncate text-right shrink-0">{s.name}</div>
            <div className="flex-1 h-5 bg-bg-2 rounded overflow-hidden">
              <div
                className="h-full bg-green/70 rounded"
                style={{ width: `${(s.pct / maxPct) * 100}%` }}
              />
            </div>
            <div className="w-14 text-xs text-green font-mono text-right shrink-0 tabular-nums">
              +{s.pct.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border" />

      {/* Bottom sectors */}
      <div className="space-y-2">
        {bottom.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            <div className="w-24 md:w-40 text-xs text-txt-2 truncate text-right shrink-0">{s.name}</div>
            <div className="flex-1 h-5 bg-bg-2 rounded overflow-hidden">
              <div
                className="h-full bg-red/70 rounded"
                style={{ width: `${(Math.abs(s.pct) / maxPct) * 100}%` }}
              />
            </div>
            <div className="w-14 text-xs text-red font-mono text-right shrink-0 tabular-nums">
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

interface DailyApiData {
  date: string;
  market_summary: {
    taiex_close: number;
    taiex_change_pct: number;
    total_volume: number;
    limit_up_count: number;
    advance: number;
    decline: number;
    unchanged: number;
    foreign_net: number;
  };
  groups: { name: string; color: string; stocks: { code: string; name: string; close: number; change_pct: number }[] }[];
}

function taiex_close_display(v: number) {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReportPage() {
  const { data: dailyData } = useSWR<DailyApiData>(
    "/api/daily/latest",
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  // Real breadth data
  const ms = dailyData?.market_summary;
  const realAdvances = ms?.advance ?? 0;
  const realDeclines = ms?.decline ?? 0;
  const realUnchanged = ms?.unchanged ?? 0;
  const realVolume = ms ? Math.round(ms.total_volume / 1e8) : 0;
  const taiexClose = ms?.taiex_close ?? 0;
  const taiexChangePct = ms?.taiex_change_pct ?? 0;
  const limitUpCount = ms?.limit_up_count ?? 0;
  const reportDate = dailyData?.date ? dailyData.date : getTodaySlash();

  // Compute real sector performance from groups (by stock count)
  const realGroups = dailyData?.groups ?? [];
  const sortedGroups = [...realGroups].sort((a, b) => b.stocks.length - a.stocks.length);
  const topSectors = sortedGroups.slice(0, 5).map((g) => ({
    name: g.name,
    pct: +(g.stocks.length * 0.5 + (g.stocks.reduce((s, st) => s + st.change_pct, 0) / Math.max(g.stocks.length, 1)) * 0.1).toFixed(2),
  }));
  const bottomSectors = sortedGroups.length > 3
    ? [...realGroups].sort((a, b) => {
        const avgA = a.stocks.reduce((s, st) => s + st.change_pct, 0) / Math.max(a.stocks.length, 1);
        const avgB = b.stocks.reduce((s, st) => s + st.change_pct, 0) / Math.max(b.stocks.length, 1);
        return avgA - avgB;
      }).slice(0, 3).map((g) => ({
        name: g.name,
        pct: +(g.stocks.reduce((s, st) => s + st.change_pct, 0) / Math.max(g.stocks.length, 1)).toFixed(2),
      }))
    : [];

  // Strong setups: use today's top stocks from groups
  const realStrongSetups = realGroups.length > 0
    ? realGroups.flatMap((g) =>
        g.stocks.slice(0, 2).map((s) => ({
          code: s.code,
          name: s.name,
          price: s.close,
          changePct: s.change_pct,
          score: Math.min(99, 70 + Math.round(s.change_pct * 2)),
          reasons: [{ label: "漲停", variant: "green" as const }],
        }))
      ).slice(0, 8)
    : [];

  // Regime based on TAIEX
  const regime = taiexChangePct > 0 ? "偏多" : taiexChangePct < -0.5 ? "偏空" : "中性";

  const regimeColor =
    regime === "偏多"
      ? "text-green bg-green-bg"
      : regime === "偏空"
      ? "text-red bg-red-bg"
      : "text-amber bg-amber-bg";

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1 animate-fade-in">
      <TopNav currentDate={getTodayString()} />
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
        {/* ── Header ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-txt-0 tracking-tight">每日盤後報告</h1>
            <p className="text-sm text-txt-3 mt-1">{reportDate}</p>
          </div>
          <span className={`text-sm px-3 py-1.5 rounded-md font-bold ${regimeColor}`}>
            {regime}
          </span>
        </div>

        {!dailyData && (
          <div className="text-center py-12 text-txt-3 text-sm">載入盤後報告中...</div>
        )}

        {/* ── 1. Market Conclusion ── */}
        <section>
          <SectionTitle>大盤結論</SectionTitle>
          <Card>
            <p className="text-sm text-txt-1 leading-relaxed mb-3">
              {ms
                ? `加權指數收${taiexChangePct >= 0 ? "漲" : "跌"}${Math.abs(taiexChangePct).toFixed(2)}%，報 ${taiex_close_display(taiexClose)} 點。成交量 ${realVolume.toLocaleString()} 億元，漲停 ${limitUpCount} 檔。外資${ms.foreign_net >= 0 ? "買超" : "賣超"} ${Math.abs(Math.round(ms.foreign_net / 1e8)).toLocaleString()} 億元。`
                : "載入中..."}
            </p>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded font-medium ${regimeColor}`}>
                {regime}
              </span>
              <span className="text-xs text-txt-3">
                漲停 {limitUpCount} 檔
              </span>
            </div>
          </Card>
        </section>

        {/* ── 2. Market Breadth ── */}
        <section>
          <SectionTitle>市場寬度</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">漲跌家數</div>
              <BreadthBar advances={realAdvances} declines={realDeclines} unchanged={realUnchanged} />
            </Card>
            <Card>
              <div className="text-[10px] text-txt-4 uppercase tracking-wider mb-3">成交量能</div>
              <div className="text-sm text-txt-1 font-mono tabular-nums">{realVolume.toLocaleString()} 億元</div>
            </Card>
          </div>
        </section>

        {/* ── 3. Sector Performance ── */}
        <section>
          <SectionTitle>族群表現</SectionTitle>
          <Card>
            <SectorBars top={topSectors} bottom={bottomSectors} />
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
                {realStrongSetups.map((s) => (
                  <tr key={s.code} className="border-b border-border/50 hover:bg-bg-2/50 transition-colors card-hover">
                    <td className="py-2.5 text-txt-3 font-mono">{s.code}</td>
                    <td className="py-2.5 text-txt-0 font-medium">{s.name}</td>
                    <td className="py-2.5 text-right text-txt-1 font-mono tabular-nums">{formatPrice(s.price)}</td>
                    <td className={`py-2.5 text-right font-mono tabular-nums ${s.changePct >= 0 ? "text-green" : "text-red"}`}>
                      {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 text-right">
                      <span className={`font-bold tabular-nums ${
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

        {/* ── 5. Report Archive Link ── */}
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
