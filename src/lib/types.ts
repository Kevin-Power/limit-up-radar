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
