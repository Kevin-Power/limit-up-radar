"use client";

export interface Narrative {
  schema_version: number;
  date: string;
  source_daily_date: string;
  generated_at: string;
  generated_by: string;
  provider: string;
  summary: string;
  leading_groups: string[];
  tomorrow_watch: string;
  risk: string;
  stocks: Record<string, string>;
  stale?: boolean;
  latest_daily_date?: string;
}

export function NarrativeCard({ narrative }: { narrative: Narrative }) {
  return (
    <div className="bg-gradient-to-br from-blue/5 via-bg-1 to-amber/5 border-2 border-blue/30 rounded-xl p-5 space-y-3">
      {/* Stale banner */}
      {narrative.stale && (
        <div className="bg-amber/15 border border-amber/40 rounded px-3 py-2 text-[11px] text-amber">
          ⚠️ 此分析基於 {narrative.source_daily_date}，但最新交易日為 {narrative.latest_daily_date}。建議重新產出（執行 <code className="font-mono">/narrative</code>）。
        </div>
      )}

      {/* Title row */}
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 bg-blue text-white text-[10px] font-bold rounded">🤖 AI 盤後分析</span>
        <span className="text-[10px] text-txt-4">{narrative.date} · {narrative.provider}</span>
      </div>

      {/* Summary */}
      <p className="text-sm text-txt-1 leading-relaxed">{narrative.summary}</p>

      {/* Leading groups */}
      {narrative.leading_groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-txt-4">主流族群：</span>
          {narrative.leading_groups.map((g) => (
            <span key={g} className="px-2 py-0.5 bg-red/15 text-red text-[11px] font-semibold rounded">
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Tomorrow watch */}
      <div className="bg-bg-2/50 border-l-2 border-blue/50 rounded px-3 py-2">
        <div className="text-[10px] text-blue font-bold mb-1">🎯 明日關注</div>
        <p className="text-[12px] text-txt-2 leading-relaxed">{narrative.tomorrow_watch}</p>
      </div>

      {/* Risk */}
      <div className="bg-bg-2/50 border-l-2 border-amber/50 rounded px-3 py-2">
        <div className="text-[10px] text-amber font-bold mb-1">⚠️ 風險提醒</div>
        <p className="text-[12px] text-txt-2 leading-relaxed">{narrative.risk}</p>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-txt-4 text-center pt-1">
        AI 分析僅供參考，不構成投資建議；過去績效不代表未來結果。
      </p>
    </div>
  );
}
