"use client";

import { useState } from "react";
import Link from "next/link";
import { Stock } from "@/lib/types";
import { formatPrice, formatPct, formatNumber, formatNet } from "@/lib/utils";
import Sparkline from "./Sparkline";
import { analyzeEma, getSignalLabel, getSignalColor } from "@/lib/ema";

interface StockRowProps {
  stock: Stock;
  groupColor: string;
}

export default function StockRow({ stock, groupColor }: StockRowProps) {
  const [expanded, setExpanded] = useState(false);
  const s = stock;

  return (
    <div>
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.02] last:border-b-0 cursor-pointer hover:bg-white/[0.02] transition-colors group"
      >
        {/* Code */}
        <div className="w-11 flex-shrink-0">
          <Link
            href={`/stock/${s.code}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-semibold text-txt-2 tabular-nums hover:text-txt-0 hover:underline underline-offset-2 transition-colors"
          >
            {s.code}
          </Link>
        </div>

        {/* Name + Industry */}
        <div className="w-24 flex-shrink-0">
          <div className="text-[13px] font-semibold text-txt-0 flex items-center gap-1 whitespace-nowrap">
            <Link
              href={`/stock/${s.code}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline underline-offset-2 hover:text-red/90 transition-colors"
            >
              {s.name}
            </Link>
            {s.streak > 0 && (
              <span className="flex gap-0.5 ml-0.5">
                {Array.from({ length: Math.min(s.streak, 5) }).map((_, i) => (
                  <span key={i} className="w-1 h-1 rounded-full bg-red" />
                ))}
              </span>
            )}
          </div>
          <div className="text-[10px] text-txt-4 mt-0.5 whitespace-nowrap">{s.industry}</div>
        </div>

        {/* Price */}
        <div className="w-20 text-right text-[13px] font-bold text-red tabular-nums flex-shrink-0">
          {formatPrice(s.close)}
        </div>

        {/* Change % */}
        <div className="w-16 text-right flex-shrink-0">
          <span className="text-[11px] font-semibold text-red bg-red-bg px-1.5 py-0.5 rounded tabular-nums">
            {formatPct(s.change_pct)}
          </span>
        </div>

        {/* Volume: hidden on mobile */}
        <div className="hidden md:block w-20 text-right text-xs text-txt-2 tabular-nums flex-shrink-0">
          {formatNumber(s.volume)}
        </div>

        {/* Major net: hidden on mobile */}
        <div className={`hidden md:block w-20 text-right text-xs font-semibold tabular-nums flex-shrink-0 ${s.major_net === 0 ? "text-txt-4" : s.major_net > 0 ? "text-red" : "text-green"}`}>
          {s.major_net === 0 ? "-" : formatNet(s.major_net)}
        </div>

        {/* Sparkline: hidden on mobile */}
        <div className="hidden md:flex w-14 justify-end flex-shrink-0">
          <Sparkline color={groupColor} seed={s.code} />
        </div>

        {/* EMA Signal Badge: hidden on mobile */}
        {(() => {
          const ema = analyzeEma(s.code, s.close);
          const sc = getSignalColor(ema.signal);
          return (
            <div className="hidden md:flex w-10 justify-end flex-shrink-0">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${sc.bg} ${sc.text} ${sc.border}`}>
                {getSignalLabel(ema.signal)}
              </span>
            </div>
          );
        })()}

        {/* Expand indicator: hidden on mobile */}
        <div className="hidden md:block w-4 text-txt-4 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {expanded ? "▾" : "▸"}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 py-3 bg-bg-2/50 border-b border-white/[0.02] animate-in">
          <div className="grid grid-cols-4 gap-4 ml-11">
            <div>
              <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-1">開盤價</div>
              <div className="text-xs text-txt-1 tabular-nums">{formatPrice(s.close * 0.95)}</div>
            </div>
            <div>
              <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-1">最高價</div>
              <div className="text-xs text-red tabular-nums">{formatPrice(s.close)}</div>
            </div>
            <div>
              <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-1">最低價</div>
              <div className="text-xs text-txt-1 tabular-nums">{formatPrice(s.close * 0.93)}</div>
            </div>
            <div>
              <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-1">成交額</div>
              <div className="text-xs text-txt-1 tabular-nums">
                {formatNumber(Math.round(s.close * s.volume / 1000))}千
              </div>
            </div>
            <div>
              <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-1">連板天數</div>
              <div className="text-xs text-txt-1">{s.streak > 0 ? `${s.streak} 天` : "—"}</div>
            </div>
            <div>
              <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-1">主力淨買</div>
              <div className={`text-xs font-semibold ${s.major_net === 0 ? "text-txt-4" : s.major_net > 0 ? "text-red" : "text-green"}`}>
                {s.major_net === 0 ? "-" : `${formatNet(s.major_net)} 張`}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-1">漲停價</div>
              <div className="text-xs text-red tabular-nums">{formatPrice(s.close)}</div>
            </div>
            <div>
              <div className="text-[9px] text-txt-4 uppercase tracking-wider mb-1">成交比重</div>
              <div className="text-xs text-txt-1 tabular-nums">
                {(s.volume / 10000).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
