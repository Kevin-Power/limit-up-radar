import { StockGroup } from "@/lib/types";
import StockRow from "./StockRow";

interface GroupBlockProps {
  group: StockGroup;
}

const BADGE_STYLES: Record<string, string> = {
  HOT: "bg-red-bg text-red",
  FOCUS: "bg-red-bg text-red",
  NEW: "bg-blue-bg text-blue",
};

function getBadgeStyle(badge: string): string {
  if (BADGE_STYLES[badge]) return BADGE_STYLES[badge];
  if (badge.includes("連")) return "bg-amber-bg text-amber";
  return "bg-blue-bg text-blue";
}

export default function GroupBlock({ group }: GroupBlockProps) {
  const headers = ["代號", "名稱", "收盤價", "漲幅", "成交量", "主力", "5日"];
  return (
    <div className="bg-bg-1 border border-border rounded-lg mb-3 overflow-hidden hover:border-border-hover transition-colors">
      <div className="flex items-start justify-between px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-0.5" style={{ backgroundColor: group.color }} />
          <div>
            <span className="text-sm font-bold text-txt-0 tracking-tight">{group.name}</span>
            {group.badges.map((badge) => (
              <span key={badge} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1.5 ${getBadgeStyle(badge)}`}>{badge}</span>
            ))}
          </div>
        </div>
        <div className="text-[11px] text-txt-4 font-medium">{group.stocks.length} 檔</div>
      </div>
      <div className="px-4 pb-2.5 pl-[36px] text-xs text-txt-3 leading-relaxed">{group.reason}</div>
      <div className="grid grid-cols-[44px_1fr_100px_80px_90px_90px_80px] px-4 py-1.5 bg-bg-2 border-t border-b border-border">
        {headers.map((h, i) => (
          <div key={i} className={`text-[10px] font-semibold uppercase tracking-wider text-txt-4 ${i >= 2 ? "text-right" : ""}`}>{h}</div>
        ))}
      </div>
      {group.stocks.map((stock) => (
        <StockRow key={stock.code} stock={stock} groupColor={group.color} />
      ))}
    </div>
  );
}
