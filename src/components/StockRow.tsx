"use client";

import Link from "next/link";
import { Stock } from "@/lib/types";
import { formatPrice, formatPct, formatNumber, formatNet } from "@/lib/utils";
import Sparkline from "./Sparkline";
import { EmaResult, EmaSignal, getSignalLabel, getSignalColor } from "@/lib/ema";
import StarButton from "./StarButton";

interface StockRowProps {
  stock: Stock;
  groupColor: string;
  isWatched?: boolean;
  onToggleWatch?: (code: string) => void;
  emaResult?: EmaResult;
  isSelected?: boolean;
  onSelectStock?: (code: string) => void;
}

export default function StockRow({ stock, groupColor, isWatched = false, onToggleWatch, emaResult, isSelected, onSelectStock }: StockRowProps) {
  const s = stock;
  const emaSignal: EmaSignal | undefined = emaResult?.signal;

  return (
    <div>
      <div
        onClick={() => onSelectStock?.(s.code)}
        className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.02] last:border-b-0 cursor-pointer transition-colors group ${
          isSelected
            ? "bg-white/[0.05] border-l-2 border-l-red/60"
            : "hover:bg-white/[0.02]"
        }`}
      >
        {/* Star */}
        {onToggleWatch && (
          <div className="w-4 flex-shrink-0 flex items-center justify-center">
            <StarButton code={s.code} isWatched={isWatched} onToggle={onToggleWatch} />
          </div>
        )}

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

        {/* Sparkline: real price data if available */}
        <div className="hidden md:flex w-14 justify-end flex-shrink-0">
          <Sparkline color={groupColor} data={emaResult?.prices} />
        </div>

        {/* EMA Signal Badge: hidden on mobile */}
        <div className="hidden md:flex w-10 justify-end flex-shrink-0">
          {emaSignal ? (() => {
            const sc = getSignalColor(emaSignal);
            return (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${sc.bg} ${sc.text} ${sc.border}`}>
                {getSignalLabel(emaSignal)}
              </span>
            );
          })() : <span className="w-10" />}
        </div>

        {/* Chevron indicator */}
        <div className="hidden md:block w-4 text-txt-4 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          ▸
        </div>
      </div>
    </div>
  );
}
