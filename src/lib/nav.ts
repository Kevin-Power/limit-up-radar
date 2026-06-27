// Single source of truth for global navigation items.
// Both TopNav (mobile hamburger menu) and NavBar (desktop scrolling bar)
// render from this list so the two never drift out of sync.

export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "每日總覽", href: "/" },
  { label: "明日焦點", href: "/focus" },
  { label: "自選股", href: "/watchlist" },
  { label: "操作手冊", href: "/sop" },
  { label: "隔日表現", href: "/next-day" },
  { label: "研究工作台", href: "/workspace" },
  { label: "快樂小馬", href: "/pony" },
  { label: "策略回測", href: "/backtest" },
  { label: "策略監控", href: "/strategy-monitor" },
  { label: "今日計畫", href: "/today-plan" },
  { label: "族群強弱", href: "/sectors" },
  { label: "進階選股", href: "/screener" },
  { label: "供應鏈", href: "/supply-chain" },
  { label: "營收速報", href: "/revenue" },
  { label: "交易教室", href: "/learn" },
  { label: "國際市場", href: "/global" },
  { label: "市場情資", href: "/news" },
  { label: "盤後報告", href: "/report" },
  { label: "統計分析", href: "/stats" },
  { label: "處置預測", href: "/disposal" },
  { label: "股票比較", href: "/compare" },
];
