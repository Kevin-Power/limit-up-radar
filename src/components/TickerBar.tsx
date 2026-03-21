import { MarketSummary } from "@/lib/types";
import { formatNumber, formatPct, formatVolume } from "@/lib/utils";

interface TickerBarProps {
  summary: MarketSummary;
}

function TickerItem({ label, value, type = "neutral" }: { label: string; value: string; type?: "up" | "dn" | "neutral" }) {
  const colorClass = type === "up" ? "text-red" : type === "dn" ? "text-green" : "text-txt-2";
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-[11px] text-txt-4 font-medium">{label}</span>
      <span className={`text-xs font-semibold ${colorClass}`}>{value}</span>
    </div>
  );
}

function Separator() {
  return <div className="w-px h-4 bg-border flex-shrink-0" />;
}

export default function TickerBar({ summary }: TickerBarProps) {
  const s = summary;
  const taiexType = s.taiex_change_pct >= 0 ? "up" : "dn";
  const foreignType = s.foreign_net >= 0 ? "up" : "dn";
  const trustType = s.trust_net >= 0 ? "up" : "dn";
  const dealerType = s.dealer_net >= 0 ? "up" : "dn";

  return (
    <div className="flex items-center h-9 px-5 bg-bg-1 border-b border-border gap-6 overflow-hidden">
      <TickerItem label="加權" value={formatNumber(s.taiex_close)} type={taiexType} />
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${taiexType === "up" ? "bg-red-bg text-red" : "bg-green-bg text-green"}`}>
        {formatPct(s.taiex_change_pct)}
      </span>
      <Separator />
      <TickerItem label="成交" value={formatVolume(s.total_volume)} type="neutral" />
      <Separator />
      <TickerItem label="漲停" value={String(s.limit_up_count)} type="up" />
      <TickerItem label="跌停" value={String(s.limit_down_count)} type="dn" />
      <Separator />
      <TickerItem label="漲" value={String(s.advance)} type="up" />
      <TickerItem label="跌" value={String(s.decline)} type="dn" />
      <TickerItem label="平" value={String(s.unchanged)} type="neutral" />
      <Separator />
      <TickerItem label="外資" value={formatVolume(Math.abs(s.foreign_net))} type={foreignType} />
      <TickerItem label="投信" value={formatVolume(Math.abs(s.trust_net))} type={trustType} />
      <TickerItem label="自營" value={formatVolume(Math.abs(s.dealer_net))} type={dealerType} />
    </div>
  );
}
