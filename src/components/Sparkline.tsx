interface SparklineProps {
  color: string;
}

export default function Sparkline({ color }: SparklineProps) {
  const points = "0,18 8,16 16,17 24,12 32,8 40,5 48,3 56,1";
  return (
    <svg className="w-14 h-[22px]" viewBox="0 0 56 22">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
