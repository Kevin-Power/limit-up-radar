"use client";

import { DailyData, Stock, StockGroup } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

interface HighlightsProps {
  data: DailyData;
}

interface CardProps {
  accentColor: string;
  icon: React.ReactNode;
  title: string;
  primary: string;
  secondary: string;
}

function HighlightCard({ accentColor, icon, title, primary, secondary }: CardProps) {
  return (
    <div
      className="flex-shrink-0 flex items-stretch bg-bg-1 border border-border rounded-lg overflow-hidden hover:border-border-hover transition-colors"
      style={{ minWidth: "180px", maxWidth: "220px" }}
    >
      {/* Left accent bar */}
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: accentColor }} />
      <div className="flex flex-col justify-center px-3 py-2.5 gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]" style={{ color: accentColor }}>
            {icon}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-txt-4">{title}</span>
        </div>
        <div className="text-[13px] font-bold text-txt-0 truncate leading-tight mt-0.5">{primary}</div>
        <div className="text-[11px] text-txt-3 tabular-nums">{secondary}</div>
      </div>
    </div>
  );
}

export default function Highlights({ data }: HighlightsProps) {
  const { groups } = data;
  if (!groups || groups.length === 0) return null;

  // 1. 最強族群 — most stocks
  const topGroup: StockGroup = groups.reduce((best, g) =>
    g.stocks.length > best.stocks.length ? g : best
  );

  // Flatten all stocks
  const allStocks: Stock[] = groups.flatMap((g) => g.stocks);
  if (allStocks.length === 0) return null;

  // 2. 最大量 — highest volume
  const topVolume: Stock = allStocks.reduce((best, s) =>
    s.volume > best.volume ? s : best
  );

  // 3. 主力最愛 — highest major_net
  const topMajor: Stock = allStocks.reduce((best, s) =>
    s.major_net > best.major_net ? s : best
  );

  // 4. 連板王 — highest streak (only if > 0)
  const streakStocks = allStocks.filter((s) => s.streak > 0);
  const topStreak: Stock | null = streakStocks.length > 0
    ? streakStocks.reduce((best, s) => (s.streak > best.streak ? s : best))
    : null;

  return (
    <div className="mb-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-2">今日亮點</div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <HighlightCard
          accentColor="#ef4444"
          icon="★"
          title="最強族群"
          primary={topGroup.name}
          secondary={`${topGroup.stocks.length} 檔漲停`}
        />
        <HighlightCard
          accentColor="#3b82f6"
          icon="▲"
          title="最大量"
          primary={`${topVolume.name} ${topVolume.code}`}
          secondary={`量 ${formatNumber(topVolume.volume)}`}
        />
        <HighlightCard
          accentColor="#f59e0b"
          icon="◆"
          title="主力最愛"
          primary={`${topMajor.name} ${topMajor.code}`}
          secondary={`+${formatNumber(topMajor.major_net)} 張`}
        />
        {topStreak && (
          <HighlightCard
            accentColor="#f97316"
            icon="●"
            title="連板王"
            primary={`${topStreak.name} ${topStreak.code}`}
            secondary={`${topStreak.streak} 連板`}
          />
        )}
      </div>
    </div>
  );
}
