import { DailyData, Stock } from "@/lib/types";
import { formatNumber, formatVolume } from "@/lib/utils";

interface SidePanelProps {
  data: DailyData;
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 border-b border-border">
      <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-3">{title}</div>
      {children}
    </div>
  );
}

function DistRow({ label, count, maxCount, color }: { label: string; count: number; maxCount: number; color: string }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="text-[11px] text-txt-2 w-20 truncate">{label}</div>
      <div className="flex-1 h-1.5 bg-bg-3 rounded-sm overflow-hidden">
        <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="text-[10px] text-txt-4 w-6 text-right tabular-nums">{count}</div>
    </div>
  );
}

function InstitutionalRow({ label, value }: { label: string; value: number }) {
  const isBuy = value >= 0;
  const barWidth = Math.min(Math.abs(value) / 200e8 * 50, 50);
  return (
    <div className="flex items-center py-1.5">
      <div className="text-xs text-txt-2 font-medium w-12">{label}</div>
      <div className="flex-1 mx-2.5 relative h-3.5">
        <div className="absolute inset-0 bg-bg-3 rounded-sm" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
        {isBuy ? (
          <div className="absolute top-0 h-full rounded-sm left-1/2" style={{ width: `${barWidth}%`, background: "linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.4))" }} />
        ) : (
          <div className="absolute top-0 h-full rounded-sm" style={{ width: `${barWidth}%`, right: "50%", background: "linear-gradient(270deg, rgba(34,197,94,0.15), rgba(34,197,94,0.4))" }} />
        )}
      </div>
      <div className={`text-[11px] font-bold tabular-nums w-14 text-right ${isBuy ? "text-red" : "text-green"}`}>
        {isBuy ? "+" : ""}{formatVolume(Math.abs(value))}
      </div>
    </div>
  );
}

export default function SidePanel({ data }: SidePanelProps) {
  const { market_summary: s, groups } = data;
  const allStocks: (Stock & { groupColor: string })[] = groups.flatMap((g) =>
    g.stocks.map((st) => ({ ...st, groupColor: g.color }))
  );
  const topBuyers = [...allStocks].sort((a, b) => b.major_net - a.major_net).slice(0, 5);
  const maxGroupCount = Math.max(...groups.map((g) => g.stocks.length), 1);

  return (
    <div className="w-[300px] flex-shrink-0 bg-bg-1 border-l border-border overflow-y-auto">
      <PanelSection title="族群分布">
        {groups.map((g) => (
          <DistRow key={g.name} label={g.name} count={g.stocks.length} maxCount={maxGroupCount} color={g.color} />
        ))}
      </PanelSection>
      <PanelSection title="三大法人買賣超">
        <InstitutionalRow label="外資" value={s.foreign_net} />
        <InstitutionalRow label="投信" value={s.trust_net} />
        <InstitutionalRow label="自營商" value={s.dealer_net} />
      </PanelSection>
      <PanelSection title="主力買超排行">
        {topBuyers.map((st, i) => (
          <div key={st.code} className="flex items-center gap-2 py-1.5 border-b border-white/[0.02] last:border-b-0">
            <div className={`w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${i < 3 ? "bg-red-bg text-red" : "bg-bg-3 text-txt-4"}`}>{i + 1}</div>
            <div className="flex-1 text-xs text-txt-1 font-medium">{st.name} <span className="text-txt-4">{st.code}</span></div>
            <div className="text-[11px] font-bold text-red tabular-nums">+{formatNumber(st.major_net)}</div>
          </div>
        ))}
      </PanelSection>
    </div>
  );
}
