interface SparklineProps {
  color: string;
  data?: number[]; // real price series; if absent show flat line
}

export default function Sparkline({ color, data }: SparklineProps) {
  if (!data || data.length < 2) {
    // Flat dashed line when no data
    return (
      <svg className="w-14 h-[22px]" viewBox="0 0 56 22">
        <line x1="2" y1="11" x2="54" y2="11" stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />
      </svg>
    );
  }

  const n = Math.min(data.length, 20);
  const pts = data.slice(-n);
  const mn = Math.min(...pts);
  const mx = Math.max(...pts);
  const range = mx - mn || 1;
  const points = pts
    .map((v, i) => {
      const x = (i / (n - 1)) * 54 + 1;
      const y = 20 - ((v - mn) / range) * 18;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="w-14 h-[22px]" viewBox="0 0 56 22">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
