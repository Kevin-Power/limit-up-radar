import { Stock } from "@/lib/types";
import { formatPrice, formatPct, formatNumber, formatNet } from "@/lib/utils";
import Sparkline from "./Sparkline";

interface StockRowProps {
  stock: Stock;
  groupColor: string;
}

export default function StockRow({ stock, groupColor }: StockRowProps) {
  const s = stock;
  return (
    <div className="grid grid-cols-[44px_1fr_100px_80px_90px_90px_80px] px-4 py-2 items-center border-b border-white/[0.02] last:border-b-0 cursor-pointer hover:bg-white/[0.015] transition-colors">
      <div className="text-xs font-semibold text-txt-2 tabular-nums">{s.code}</div>
      <div>
        <div className="text-[13px] font-semibold text-txt-0 flex items-center gap-1">
          {s.name}
          {s.streak > 0 && (
            <span className="flex gap-0.5 ml-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} className={`w-1 h-1 rounded-full ${i < s.streak ? "bg-red" : "bg-bg-4"}`} />
              ))}
            </span>
          )}
        </div>
        <div className="text-[10px] text-txt-4 mt-0.5">{s.industry}</div>
      </div>
      <div className="text-right text-[13px] font-bold text-red tabular-nums">{formatPrice(s.close)}</div>
      <div className="text-right text-xs font-semibold text-red tabular-nums">{formatPct(s.change_pct)}</div>
      <div className="text-right text-xs text-txt-2 tabular-nums">{formatNumber(s.volume)}</div>
      <div className={`text-right text-xs font-semibold tabular-nums ${s.major_net >= 0 ? "text-red" : "text-green"}`}>{formatNet(s.major_net)}</div>
      <div className="flex justify-end"><Sparkline color={groupColor} /></div>
    </div>
  );
}
