export interface MarketSummary {
  taiex_close: number;
  taiex_change_pct: number;
  total_volume: number;
  limit_up_count: number;
  limit_down_count: number;
  advance: number;
  decline: number;
  unchanged: number;
  foreign_net: number;
  trust_net: number;
  dealer_net: number;
}

export interface Stock {
  code: string;
  name: string;
  industry: string;
  close: number;
  change_pct: number;
  volume: number;
  major_net: number;
  streak: number;
  market?: "TWSE" | "OTC";
}

export interface StockGroup {
  name: string;
  color: string;
  badges: string[];
  reason: string;
  stocks: Stock[];
}

export interface DailyData {
  date: string;
  market_summary: MarketSummary;
  groups: StockGroup[];
}

export interface RealBacktest {
  updatedAt: string;
  totalDays: number;
  totalSamples: number;
  avgOpenWinRate: number;
  avgCloseWinRate: number;
  avgOpenReturn: number;
  avgCloseReturn: number;
  methodology: string;
  history: {
    date: string;
    nextDate: string;
    picks: number;
    fetched: number;
    openWinRate: number;
    closeWinRate: number;
    avgOpenPct: number;
    avgClosePct: number;
    bestStock: { code: string; name: string; closePct: number } | null;
  }[];
}
