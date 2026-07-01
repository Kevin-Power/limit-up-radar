// Single source of truth for global navigation items.
// Both TopNav (mobile hamburger menu) and NavBar (desktop scrolling bar)
// render from this list so the two never drift out of sync.
//
// 導覽依「操作風格」分群：核心 / 當沖 / 隔日衝 / 波段 / 工具，
// 讓不同操作風格的使用者能快速找到對應資訊。

export type NavGroupKey = "core" | "daytrade" | "overnight" | "swing" | "tool";

export interface NavItem {
  label: string;
  href: string;
  group: NavGroupKey;
}

export interface NavGroupMeta {
  key: NavGroupKey;
  label: string;
  hint: string;
}

export const NAV_GROUPS_META: NavGroupMeta[] = [
  { key: "core", label: "核心", hint: "大盤與每日總覽" },
  { key: "daytrade", label: "當沖", hint: "盤中分時與風險" },
  { key: "overnight", label: "隔日衝", hint: "隔日開盤策略" },
  { key: "swing", label: "波段", hint: "趨勢／籌碼／基本面" },
  { key: "tool", label: "工具", hint: "自選與教學" },
];

const RAW: Record<NavGroupKey, [string, string][]> = {
  core: [
    ["每日總覽", "/"],
    ["國際市場", "/global"],
    ["市場情資", "/news"],
    ["盤後報告", "/report"],
    ["報告存檔", "/archive"],
  ],
  daytrade: [
    ["當沖速覽", "/daytrade"],
    ["處置預測", "/disposal"],
  ],
  overnight: [
    ["明日焦點", "/focus"],
    ["今日計畫", "/today-plan"],
    ["隔日表現", "/next-day"],
    ["策略監控", "/strategy-monitor"],
    ["策略回測", "/backtest"],
    ["統計分析", "/stats"],
  ],
  swing: [
    ["族群強弱", "/sectors"],
    ["快樂小馬", "/pony"],
    ["進階選股", "/screener"],
    ["供應鏈", "/supply-chain"],
    ["營收速報", "/revenue"],
    ["股票比較", "/compare"],
  ],
  tool: [
    ["自選股", "/watchlist"],
    ["研究工作台", "/workspace"],
    ["操作手冊", "/sop"],
    ["交易教室", "/learn"],
    ["進階教室", "/advanced"],
  ],
};

export const NAV_GROUPS: { key: NavGroupKey; label: string; hint: string; items: NavItem[] }[] =
  NAV_GROUPS_META.map((g) => ({
    ...g,
    items: RAW[g.key].map(([label, href]) => ({ label, href, group: g.key })),
  }));

// Flat list preserved for consumers that don't need grouping (e.g. search).
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
