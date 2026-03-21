import { DailyData, Stock, StockGroup } from "@/lib/types";
import { formatNumber, formatVolume } from "@/lib/utils";

interface SidePanelProps {
  data: DailyData;
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3.5 border-b border-border">
      <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-3">
        {title}
      </div>
      {children}
    </div>
  );
}

/* ===== Heatmap Treemap ===== */
function HeatmapTreemap({ groups }: { groups: StockGroup[] }) {
  const allStocks = groups.flatMap((g) =>
    g.stocks.map((s) => ({ ...s, color: g.color, groupName: g.name }))
  );
  // Sort by volume desc for treemap layout
  const sorted = [...allStocks].sort((a, b) => b.volume - a.volume);
  const maxVol = Math.max(...sorted.map((s) => s.volume), 1);

  return (
    <div className="flex flex-wrap gap-[2px]">
      {sorted.slice(0, 16).map((s) => {
        const ratio = s.volume / maxVol;
        const size = Math.max(32, Math.round(28 + ratio * 24));
        return (
          <div
            key={s.code}
            className="rounded-sm flex flex-col items-center justify-center cursor-pointer hover:brightness-125 transition-all"
            style={{
              backgroundColor: s.color + "40",
              width: `${size}px`,
              height: `${size}px`,
              flexGrow: ratio > 0.5 ? 2 : 1,
            }}
            title={`${s.name} ${s.code}\n量: ${formatNumber(s.volume)}`}
          >
            <span className="text-[9px] font-semibold text-white/70 leading-none">
              {s.code}
            </span>
            <span className="text-[8px] text-white/50 leading-none mt-0.5">
              {s.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ===== Group Distribution ===== */
function DistRow({
  label,
  count,
  maxCount,
  color,
}: {
  label: string;
  count: number;
  maxCount: number;
  color: string;
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="text-[11px] text-txt-2 w-24 truncate">{label}</div>
      <div className="flex-1 h-1.5 bg-bg-3 rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="text-[10px] text-txt-4 w-6 text-right tabular-nums font-semibold">
        {count}
      </div>
    </div>
  );
}

/* ===== Institutional Bar ===== */
function InstitutionalRow({ label, value }: { label: string; value: number }) {
  const isBuy = value >= 0;
  const barWidth = Math.min(Math.abs(value) / 200e8 * 50, 50);

  return (
    <div className="flex items-center py-1.5">
      <div className="text-xs text-txt-2 font-medium w-12">{label}</div>
      <div className="flex-1 mx-2 relative h-4">
        <div className="absolute inset-0 bg-bg-3 rounded-sm" />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
        {isBuy ? (
          <div
            className="absolute top-0 h-full rounded-sm left-1/2 transition-all duration-500"
            style={{
              width: `${barWidth}%`,
              background: "linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.5))",
            }}
          />
        ) : (
          <div
            className="absolute top-0 h-full rounded-sm transition-all duration-500"
            style={{
              width: `${barWidth}%`,
              right: "50%",
              background: "linear-gradient(270deg, rgba(34,197,94,0.15), rgba(34,197,94,0.5))",
            }}
          />
        )}
      </div>
      <div
        className={`text-[11px] font-bold tabular-nums w-16 text-right ${isBuy ? "text-red" : "text-green"}`}
      >
        {isBuy ? "+" : ""}
        {formatVolume(Math.abs(value))}
      </div>
    </div>
  );
}

/* ===== Market Breadth Bar ===== */
function MarketBreadth({ advance, decline, unchanged }: { advance: number; decline: number; unchanged: number }) {
  const total = advance + decline + unchanged;
  if (total === 0) return null;
  const advPct = (advance / total) * 100;
  const decPct = (decline / total) * 100;

  return (
    <div>
      <div className="flex h-2 rounded-sm overflow-hidden gap-px">
        <div
          className="bg-red/60 rounded-sm transition-all duration-500"
          style={{ width: `${advPct}%` }}
        />
        <div
          className="bg-txt-4/30 rounded-sm transition-all duration-500"
          style={{ width: `${100 - advPct - decPct}%` }}
        />
        <div
          className="bg-green/60 rounded-sm transition-all duration-500"
          style={{ width: `${decPct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] tabular-nums">
        <span className="text-red font-semibold">{advance} 漲</span>
        <span className="text-txt-4">{unchanged} 平</span>
        <span className="text-green font-semibold">{decline} 跌</span>
      </div>
    </div>
  );
}

export default function SidePanel({ data }: SidePanelProps) {
  const { market_summary: s, groups } = data;

  const allStocks: (Stock & { groupColor: string })[] = groups.flatMap((g) =>
    g.stocks.map((st) => ({ ...st, groupColor: g.color }))
  );
  const topBuyers = [...allStocks]
    .sort((a, b) => b.major_net - a.major_net)
    .slice(0, 5);
  const maxGroupCount = Math.max(...groups.map((g) => g.stocks.length), 1);

  // Streak stocks
  const streakStocks = allStocks
    .filter((s) => s.streak >= 2)
    .sort((a, b) => b.streak - a.streak);

  return (
    <div className="w-full md:w-[320px] md:flex-shrink-0 bg-bg-1 border-t md:border-t-0 md:border-l border-border overflow-y-auto">
      {/* Market breadth */}
      <PanelSection title="市場廣度">
        <MarketBreadth
          advance={s.advance}
          decline={s.decline}
          unchanged={s.unchanged}
        />
      </PanelSection>

      {/* Heatmap */}
      <PanelSection title="漲停股熱力圖">
        <HeatmapTreemap groups={groups} />
      </PanelSection>

      {/* Group distribution */}
      <PanelSection title="族群分布">
        {groups.map((g) => (
          <DistRow
            key={g.name}
            label={g.name}
            count={g.stocks.length}
            maxCount={maxGroupCount}
            color={g.color}
          />
        ))}
      </PanelSection>

      {/* Institutional */}
      <PanelSection title="三大法人買賣超">
        <InstitutionalRow label="外資" value={s.foreign_net} />
        <InstitutionalRow label="投信" value={s.trust_net} />
        <InstitutionalRow label="自營商" value={s.dealer_net} />
      </PanelSection>

      {/* Top buyers */}
      <PanelSection title="主力買超排行">
        {topBuyers.map((st, i) => (
          <div
            key={st.code}
            className="flex items-center gap-2 py-1.5 border-b border-white/[0.02] last:border-b-0"
          >
            <div
              className={`w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                i < 3 ? "bg-red-bg text-red" : "bg-bg-3 text-txt-4"
              }`}
            >
              {i + 1}
            </div>
            <div
              className="w-1 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: st.groupColor }}
            />
            <div className="flex-1 text-xs text-txt-1 font-medium">
              {st.name}{" "}
              <span className="text-txt-4">{st.code}</span>
            </div>
            <div className="text-[11px] font-bold text-red tabular-nums">
              +{formatNumber(st.major_net)}
            </div>
          </div>
        ))}
      </PanelSection>

      {/* Streak stocks (連板股) */}
      {streakStocks.length > 0 && (
        <PanelSection title="連板股追蹤">
          {streakStocks.map((st) => (
            <div
              key={st.code}
              className="flex items-center gap-2 py-1.5 border-b border-white/[0.02] last:border-b-0"
            >
              <div className="flex gap-0.5">
                {Array.from({ length: st.streak }).map((_, i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-red" />
                ))}
              </div>
              <div className="flex-1 text-xs text-txt-1 font-medium">
                {st.name}{" "}
                <span className="text-txt-4">{st.code}</span>
              </div>
              <div className="text-[10px] text-amber font-semibold">
                {st.streak}連板
              </div>
            </div>
          ))}
        </PanelSection>
      )}

      {/* Footer */}
      <div className="p-3.5 mt-auto">
        <div className="flex flex-col gap-1 text-center">
          <span className="text-[11px] font-semibold text-txt-3 tracking-wide">漲停雷達 v1.0</span>
          <span className="text-[10px] text-txt-4">資料來源: TWSE</span>
          <span className="text-[10px] text-txt-4">AI 分類 by Claude</span>
        </div>
      </div>
    </div>
  );
}
