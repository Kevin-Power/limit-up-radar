interface SparklineProps {
  color: string;
  seed?: string; // stock code used as seed
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

function generatePoints(seed: string): string {
  const h = hashSeed(seed);
  // 8 x-positions: 0, 8, 16, 24, 32, 40, 48, 56
  // y range: 2-20 (lower = higher on SVG = higher price)
  // We want a general upward trend with variation
  const nums: number[] = [];
  let rng = h;
  for (let i = 0; i < 8; i++) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    nums.push(rng);
  }

  // Map to y values: start high (y~18) end low (y~2), with noise
  const points: string[] = [];
  for (let i = 0; i < 8; i++) {
    const x = i * 8;
    // Base trend: linearly from 18 down to 4 (upward in chart terms)
    const base = 18 - (14 * i) / 7;
    // Noise: ±4 units
    const noise = ((nums[i] % 800) / 100) - 4;
    const y = Math.max(2, Math.min(20, base + noise));
    points.push(`${x},${y.toFixed(1)}`);
  }
  return points.join(" ");
}

export default function Sparkline({ color, seed = "default" }: SparklineProps) {
  const points = generatePoints(seed);
  return (
    <svg className="w-14 h-[22px]" viewBox="0 0 56 22">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
