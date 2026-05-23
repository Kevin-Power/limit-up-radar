"use client";

export interface IndustryFlow {
  dates: string[];
  industries: string[];
  matrix: (number | null)[][];
}

/** Pure helper: pick a Tailwind bg class given a value and max abs in the matrix */
export function cellClass(value: number | null, maxAbs: number): string {
  if (value === null) return "bg-bg-3/40";
  if (maxAbs === 0) return "bg-bg-2";
  const ratio = Math.min(1, Math.abs(value) / maxAbs);
  // Quantize to 5 buckets so Tailwind can JIT them
  const bucket = ratio < 0.2 ? 1 : ratio < 0.4 ? 2 : ratio < 0.6 ? 3 : ratio < 0.8 ? 4 : 5;
  if (value > 0) {
    const map = ["", "bg-red/10", "bg-red/25", "bg-red/45", "bg-red/65", "bg-red/85"];
    return `${map[bucket]} text-txt-0`;
  }
  if (value < 0) {
    const map = ["", "bg-green/10", "bg-green/25", "bg-green/45", "bg-green/65", "bg-green/85"];
    return `${map[bucket]} text-txt-0`;
  }
  return "bg-bg-2";
}

export function IndustryFlowHeatmap({ flow }: { flow: IndustryFlow }) {
  if (flow.dates.length === 0 || flow.industries.length === 0) return null;

  // Compute max absolute value across matrix for color scaling
  let maxAbs = 0;
  for (const row of flow.matrix) {
    for (const v of row) {
      if (v !== null) maxAbs = Math.max(maxAbs, Math.abs(v));
    }
  }

  // Sort industries by recent sum desc (most recent date) so important ones first
  const lastIdx = flow.dates.length - 1;
  const order = flow.industries
    .map((ind, i) => ({ ind, score: flow.matrix[i][lastIdx] ?? 0, i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15); // cap at 15 rows

  return (
    <div className="bg-bg-1 border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-txt-0">
          主力資金 {flow.dates.length} 日流向
          <span className="ml-2 text-[10px] font-normal text-txt-4">紅買綠賣，深淺對應金額</span>
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-txt-4">
              <th className="text-left px-2 py-1.5 sticky left-0 bg-bg-1">產業</th>
              {flow.dates.map((d) => (
                <th key={d} className="text-right px-2 py-1.5 tabular-nums">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map(({ ind, i }) => (
              <tr key={ind} className="border-t border-border/30">
                <td className="px-2 py-1.5 text-txt-2 sticky left-0 bg-bg-1">{ind}</td>
                {flow.matrix[i].map((v, di) => (
                  <td
                    key={di}
                    className={`text-right px-2 py-1.5 tabular-nums ${cellClass(v, maxAbs)}`}
                    title={
                      v === null
                        ? `${flow.dates[di]} ${ind}：當日無資料`
                        : `${flow.dates[di]} ${ind}：主力 ${v > 0 ? "+" : ""}${(v / 1000).toFixed(0)} 張`
                    }
                  >
                    {v === null ? "-" : `${v > 0 ? "+" : ""}${(v / 1000).toFixed(0)}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-txt-4 mt-2">
        單位：千股（張）。null 格表示該產業當日未出現於漲停族群。
      </p>
    </div>
  );
}
