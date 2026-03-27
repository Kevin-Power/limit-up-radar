"use client";

import Link from "next/link";
import { DailyData, Stock, StockGroup } from "@/lib/types";
import { formatNumber, formatPct, formatNet } from "@/lib/utils";

interface HighlightsProps {
  data: DailyData;
}

/* ---------- seeded sparkline ---------- */
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function MiniSparkline({ seed, width = 180, height = 40 }: { seed: number; width?: number; height?: number }) {
  const rng = seededRng(seed);
  const pts = 30;
  const data: number[] = [];
  let v = 50;
  for (let i = 0; i < pts; i++) {
    v += (rng() - 0.48) * 6;
    v = Math.max(10, Math.min(90, v));
    data.push(v);
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((d, i) => `${(i / (pts - 1)) * width},${height - ((d - min) / range) * (height - 4) - 2}`)
    .join(" ");
  const last = data[data.length - 1];
  const first = data[0];
  const color = last >= first ? "#ef4444" : "#22c55e";

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill="url(#sparkFill)"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------- highlight card ---------- */
interface CardProps {
  accentColor: string;
  icon: React.ReactNode;
  title: string;
  primary: string;
  secondary: string;
  barValue?: number; // 0-100
}

function HighlightCard({ accentColor, icon, title, primary, secondary, barValue }: CardProps) {
  return (
    <div className="flex-1 min-w-[160px] bg-bg-1 border border-border rounded-lg overflow-hidden hover:border-border-hover transition-colors card-hover">
      <div className="px-4 py-4">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-sm" style={{ color: accentColor }}>
            {icon}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-txt-4">{title}</span>
        </div>
        <div className="text-base font-bold text-txt-0 truncate leading-tight">{primary}</div>
        <div className="text-xs text-txt-3 tabular-nums mt-1">{secondary}</div>
        {barValue !== undefined && (
          <div className="mt-3 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(barValue, 100)}%`, backgroundColor: accentColor }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- stat pill ---------- */
function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-txt-4">{label}</span>
      <span className={`font-bold tabular-nums ${color || "text-txt-1"}`}>{value}</span>
    </div>
  );
}

/* ---------- main component ---------- */
export default function Highlights({ data }: HighlightsProps) {
  const { groups, market_summary: ms } = data;
  if (!groups || groups.length === 0) return null;

  // 1. Best group
  const topGroup: StockGroup = groups.reduce((best, g) =>
    g.stocks.length > best.stocks.length ? g : best
  );

  // Flatten all stocks
  const allStocks: Stock[] = groups.flatMap((g) => g.stocks);
  if (allStocks.length === 0) return null;

  // 2. Highest volume
  const topVolume: Stock = allStocks.reduce((best, s) =>
    s.volume > best.volume ? s : best
  );

  // 3. Highest major_net
  const topMajor: Stock = allStocks.reduce((best, s) =>
    s.major_net > best.major_net ? s : best
  );

  // 4. Highest streak
  const streakStocks = allStocks.filter((s) => s.streak > 0);
  const topStreak: Stock | null = streakStocks.length > 0
    ? streakStocks.reduce((best, s) => (s.streak > best.streak ? s : best))
    : null;

  const hasTaiex = ms.taiex_close !== 0;
  const taiexUp = ms.taiex_change_pct >= 0;
  const taiexColor = hasTaiex ? (taiexUp ? "text-red" : "text-green") : "text-txt-4";
  const taiexArrow = hasTaiex ? (taiexUp ? "▲" : "▼") : "";
  const taiexChange = hasTaiex ? ms.taiex_close * (ms.taiex_change_pct / 100 / (1 + ms.taiex_change_pct / 100)) : 0;

  // Bar values for visual weight (normalized 0-100)
  const maxVol = Math.max(...allStocks.map((s) => s.volume));
  const maxNet = Math.max(...allStocks.map((s) => s.major_net));

  const quickLinks = [
    { label: "隔日表現", href: "/next-day" },
    { label: "快樂小馬", href: "/pony" },
    { label: "策略回測", href: "/backtest" },
    { label: "國際市場", href: "/global" },
    { label: "盤後報告", href: "/report" },
  ];

  return (
    <div className="mb-6 space-y-4">
      {/* ===== MARKET SUMMARY BAR ===== */}
      <div className="bg-bg-1 border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-4">
          {/* Taiex main */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-1">
                加權指數
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-extrabold tabular-nums ${taiexColor}`}>
                  {hasTaiex ? formatNumber(Math.round(ms.taiex_close)) : "-"}
                </span>
                {hasTaiex && (
                  <>
                    <span className={`text-sm font-bold tabular-nums ${taiexColor}`}>
                      {taiexArrow} {formatNumber(Math.abs(Math.round(taiexChange)))}
                    </span>
                    <span className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded ${taiexUp ? "bg-red-bg text-red" : "bg-green-bg text-green"}`}>
                      {formatPct(ms.taiex_change_pct)}
                    </span>
                  </>
                )}
              </div>
            </div>
            {/* Sparkline */}
            <MiniSparkline seed={ms.taiex_close} width={140} height={36} />
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-10 bg-border flex-shrink-0" />

          {/* Key stats row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="glow-red rounded-md px-1.5 py-0.5"><StatPill label="漲停" value={`${ms.limit_up_count} 檔`} color="text-red" /></span>
            <StatPill label="跌停" value={`${ms.limit_down_count} 檔`} color="text-green" />
            <div className="hidden sm:block w-px h-4 bg-border" />
            <StatPill label="漲" value={ms.advance} color="text-red" />
            <StatPill label="跌" value={ms.decline} color="text-green" />
            <StatPill label="平" value={ms.unchanged} />
          </div>
        </div>
      </div>

      {/* ===== HIGHLIGHTS GRID ===== */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-2.5">今日亮點</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <HighlightCard
            accentColor="#ef4444"
            icon="★"
            title="最強族群"
            primary={topGroup.name}
            secondary={`${topGroup.stocks.length} 檔漲停`}
            barValue={(topGroup.stocks.length / allStocks.length) * 100}
          />
          <HighlightCard
            accentColor="#3b82f6"
            icon="▲"
            title="最大量"
            primary={`${topVolume.name} ${topVolume.code}`}
            secondary={`量 ${formatNumber(topVolume.volume)}`}
            barValue={maxVol > 0 ? (topVolume.volume / maxVol) * 100 : 50}
          />
          {topMajor.major_net > 0 ? (
            <HighlightCard
              accentColor="#f59e0b"
              icon="◆"
              title="主力最愛"
              primary={`${topMajor.name} ${topMajor.code}`}
              secondary={`${formatNet(topMajor.major_net)} 張`}
              barValue={maxNet > 0 ? (topMajor.major_net / maxNet) * 100 : 0}
            />
          ) : (
            <HighlightCard
              accentColor="#f59e0b"
              icon="▲"
              title="最大量"
              primary={`${topVolume.name} ${topVolume.code}`}
              secondary={`量 ${formatNumber(topVolume.volume)}`}
              barValue={maxVol > 0 ? (topVolume.volume / maxVol) * 100 : 50}
            />
          )}
          {topStreak ? (
            <HighlightCard
              accentColor="#f97316"
              icon="●"
              title="連板王"
              primary={`${topStreak.name} ${topStreak.code}`}
              secondary={`${topStreak.streak} 連板`}
              barValue={Math.min(topStreak.streak * 20, 100)}
            />
          ) : (
            <HighlightCard
              accentColor="#8b5cf6"
              icon="◇"
              title="族群數"
              primary={`${groups.length} 個族群`}
              secondary={`共 ${allStocks.length} 檔漲停`}
              barValue={60}
            />
          )}
        </div>
      </div>

      {/* ===== QUICK LINKS ===== */}
      <div className="flex flex-wrap gap-2">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-bg-1 border border-border text-txt-3 hover:text-txt-0 hover:border-border-hover transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
