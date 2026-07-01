import type { IntradayBar } from "@/lib/data-files";

// 當沖視角的分時衍生指標（純 OHLC，無量能）。價格皆為「毛」數字、未含手續費／證交稅。
export interface IntradayStats {
  dayOpen: number;
  last: number;
  hod: number; // 當日最高
  hodTime: string;
  lod: number; // 當日最低
  lodTime: string;
  amplitudePct: number; // 當日振幅 =(高-低)/開盤
  closeVsOpenPct: number; // 現價相對開盤
  morningPct: number; // 開盤至 09:30 強度
  closePosition: number; // 收在區間位置 0=最低 1=最高（尾盤強弱）
}

export function computeIntradayStats(bars: IntradayBar[]): IntradayStats {
  const dayOpen = bars[0].open;
  const last = bars[bars.length - 1].close;
  let hod = bars[0].high;
  let hodTime = bars[0].time;
  let lod = bars[0].low;
  let lodTime = bars[0].time;
  for (const b of bars) {
    if (b.high > hod) {
      hod = b.high;
      hodTime = b.time;
    }
    if (b.low < lod) {
      lod = b.low;
      lodTime = b.time;
    }
  }
  const range = hod - lod;
  const mb = bars.find((b) => b.time >= "09:30") ?? bars[Math.min(29, bars.length - 1)];
  return {
    dayOpen,
    last,
    hod,
    hodTime,
    lod,
    lodTime,
    amplitudePct: dayOpen ? (range / dayOpen) * 100 : 0,
    closeVsOpenPct: dayOpen ? ((last - dayOpen) / dayOpen) * 100 : 0,
    morningPct: dayOpen ? ((mb.close - dayOpen) / dayOpen) * 100 : 0,
    closePosition: range ? (last - lod) / range : 0.5,
  };
}
