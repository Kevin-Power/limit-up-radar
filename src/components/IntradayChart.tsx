"use client";

import type { IntradayBar } from "@/lib/data-files";

// 分時走勢圖（當沖視角）。純 SVG、主題變數；台股慣例：收在開盤之上＝紅、之下＝綠。
// 以開盤價為基準線，標示當日最高／最低。x 軸為時間、y 軸為價格（毛價）。

const HOUR_MARKS = ["10:00", "11:00", "12:00", "13:00"];

export default function IntradayChart({
  bars,
  dayOpen,
}: {
  bars: IntradayBar[];
  dayOpen: number;
}) {
  if (!bars || bars.length < 2) return null;

  const W = 640;
  const H = 180;
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const min = Math.min(...lows, dayOpen);
  const max = Math.max(...highs, dayOpen);
  const range = max - min || 1;

  const n = bars.length;
  const x = (i: number) => padL + (i / (n - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - min) / range) * plotH;

  const last = bars[n - 1].close;
  const up = last >= dayOpen;
  const lineColor = up ? "var(--red)" : "var(--green)";

  const linePts = bars.map((b, i) => `${x(i).toFixed(1)},${y(b.close).toFixed(1)}`).join(" ");
  const areaPts = `${padL},${y(dayOpen).toFixed(1)} ${linePts} ${x(n - 1).toFixed(1)},${y(dayOpen).toFixed(1)}`;

  // 最高／最低點位置
  let hi = 0;
  let lo = 0;
  bars.forEach((b, i) => {
    if (b.high > bars[hi].high) hi = i;
    if (b.low < bars[lo].low) lo = i;
  });

  // 整點時間格線
  const hourLines = HOUR_MARKS.map((t) => bars.findIndex((b) => b.time >= t)).filter((i) => i > 0);

  const y0 = y(dayOpen);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`分時走勢圖，開盤 ${dayOpen}，現價 ${last}`}>
      {/* y 軸價格刻度（高/開/低） */}
      {[max, dayOpen, min].map((v, i) => (
        <g key={i}>
          <text x={padL - 6} y={y(v) + 3} fontSize="9" fill="var(--text-4)" textAnchor="end">
            {v.toFixed(1)}
          </text>
        </g>
      ))}

      {/* 整點時間格線 */}
      {hourLines.map((i, k) => (
        <g key={k}>
          <line x1={x(i)} y1={padT} x2={x(i)} y2={padT + plotH} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />
          <text x={x(i)} y={H - 6} fontSize="8.5" fill="var(--text-4)" textAnchor="middle">
            {bars[i].time}
          </text>
        </g>
      ))}
      <text x={padL} y={H - 6} fontSize="8.5" fill="var(--text-4)" textAnchor="middle">09:00</text>
      <text x={padL + plotW} y={H - 6} fontSize="8.5" fill="var(--text-4)" textAnchor="middle">13:30</text>

      {/* 開盤基準線 */}
      <line x1={padL} y1={y0} x2={padL + plotW} y2={y0} stroke="var(--border-hover)" strokeWidth="1" strokeDasharray="4 3" />
      <text x={padL + plotW} y={y0 - 4} fontSize="8.5" fill="var(--text-4)" textAnchor="end">開 {dayOpen.toFixed(1)}</text>

      {/* 走勢面積 + 線 */}
      <polygon points={areaPts} fill={lineColor} opacity="0.08" />
      <polyline points={linePts} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

      {/* 最高／最低標記 */}
      <circle cx={x(hi)} cy={y(bars[hi].high)} r="2.6" fill="var(--red)" />
      <text x={x(hi)} y={y(bars[hi].high) - 5} fontSize="8.5" fill="var(--red)" textAnchor="middle">
        高 {bars[hi].high.toFixed(1)} · {bars[hi].time}
      </text>
      <circle cx={x(lo)} cy={y(bars[lo].low)} r="2.6" fill="var(--green)" />
      <text x={x(lo)} y={y(bars[lo].low) + 12} fontSize="8.5" fill="var(--green)" textAnchor="middle">
        低 {bars[lo].low.toFixed(1)} · {bars[lo].time}
      </text>
    </svg>
  );
}
