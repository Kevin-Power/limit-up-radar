// src/lib/focus-picks.ts
//
// 隔日衝「明日焦點」候選組裝 — 單一事實來源（/api/focus 與前向戰績定格共用，禁止再複製）。
// 從 /api/focus route 抽出的純函式：只吃「定格日收盤(含以前)」的 daily 視窗資料，
// 無 look-ahead、無 I/O（檔案載入由呼叫端負責）。
//
// 修改任何組裝/評分邏輯（含 scoring.ts 的 scoreStock）都會改變 FOCUS_FORMULA_VERSION，
// 前向戰績快照會記錄它 —— 這是防公式漂移的鎖（對齊稽核 N5）。
//
// 注意：import 一律用相對路徑（不用 "@/" 別名），讓 scripts/ 下的 npx tsx 腳本
// 能直接 import 本模組執行。
import { scoreStock, calculatePriceLevels, SCORING_VERSION } from "./scoring";

/**
 * 隔日衝公式版本 = 組裝層版本 + 底層評分版本。
 * 規則：本檔的候選組裝邏輯變動時，改 "focus-vN-日期"；
 * scoring.ts 的 SCORING_VERSION 變動會自動反映在此字串。
 */
export const FOCUS_FORMULA_VERSION = `focus-v1-2026-07-02+scoring-${SCORING_VERSION}`;

/** topPicks 篩選規則（與 /focus 頁一致；單一來源，勿在他處複製常數）。 */
export const TOP_PICKS_MIN_SCORE = 50;
export const TOP_PICKS_MAX = 15;

export interface FocusDailyStock {
  code: string;
  name: string;
  close: number;
  change_pct: number;
  volume: number;
  major_net: number;
  streak: number;
}

export interface FocusDailyGroup {
  name: string;
  color: string;
  stocks: FocusDailyStock[];
}

/** daily/{date}.json 中本模組需要的欄位子集（結構性相容即可傳入）。 */
export interface FocusDailyDay {
  date: string;
  groups: FocusDailyGroup[];
  bearish_engulfing?: { code?: string }[];
}

export interface FocusRevenueInfo {
  revYoY: number | null;
  revCumYoY?: number | null;
  revMonth: number | null;
}

export interface FocusCategories {
  /** TWSE 50 權值股代號集合（categories.json → heavyweight.codes）。 */
  heavyweight: Set<string>;
  /** 已知處置股代號集合（categories.json → disposal.codes）。 */
  disposal: Set<string>;
}

/** 與 /api/focus 回傳之 focusStocks 元素同構。 */
export interface FocusStock {
  code: string;
  name: string;
  close: number;
  changePct: number;
  volume: number;
  majorNet: number;
  streak: number;
  consecutiveUpDays: number;
  streakRisk: "low" | "medium" | "high";
  group: string;
  groupColor: string;
  score: number;
  tags: string[];
  revYoY: number | null;
  revMonth: number | null;
  groupDays: number;
  entryAggressive: number;
  entryPullback: number;
  stopLoss: number;
  target1: number;
  target2: number;
  open357Low: number;
  open357Mid: number;
  open357High: number;
  isBearish: boolean;
}

/**
 * 3 日族群趨勢（今日 + 前兩日）。window 為「最新在前」的 daily 陣列，
 * 允許 null 佔位（某日檔案缺失/損毀時保持位置對齊，行為與 route 原版一致）。
 */
export function computeFocusTrends(
  window: (FocusDailyDay | null | undefined)[]
): { trendingGroups: Set<string>; groupDays: Record<string, number> } {
  const today = window[0] ?? null;
  const yesterday = window[1] ?? null;
  const dayBefore = window[2] ?? null;

  const groupDays: Record<string, number> = {};
  if (today) {
    for (const g of today.groups) {
      groupDays[g.name] = (groupDays[g.name] || 0) + 1;
    }
  }
  if (yesterday) {
    for (const g of yesterday.groups) {
      groupDays[g.name] = (groupDays[g.name] || 0) + 1;
    }
  }
  if (dayBefore) {
    for (const g of dayBefore.groups) {
      groupDays[g.name] = (groupDays[g.name] || 0) + 1;
    }
  }

  const trendingGroups = new Set(
    Object.entries(groupDays).filter(([, days]) => days >= 2).map(([name]) => name)
  );
  return { trendingGroups, groupDays };
}

/**
 * 隔日衝候選組裝（定格日 = window[0]）。
 *
 * @param window     daily 視窗，「最新在前」，window[0] 為定格日；建議傳最近 7 日
 *                   （3 日算族群趨勢、6 日算連板/處置、7 日算近期空吞）。
 *                   缺日以 null 佔位可維持與檔案序完全一致。
 * @param revenueMap code → 月營收摘要（定格日當下「已公布」的最新一期；forward 用最新檔即可）。
 * @param categories categories.json 的 heavyweight / disposal 集合。
 * @returns 與 /api/focus focusStocks 同構、依 score 由高至低排序（穩定排序，同分保留組裝序）。
 */
export function computeFocusPicks(
  window: (FocusDailyDay | null | undefined)[],
  revenueMap: Record<string, FocusRevenueInfo>,
  categories: FocusCategories
): FocusStock[] {
  const today = window[0];
  if (!today) return [];
  const { heavyweight, disposal: knownDisposal } = categories;

  // 近 7 日（含定格日）曾觸發空吞的代號
  const recentBearishCodes = new Set<string>();
  for (let i = 0; i < Math.min(window.length, 7); i++) {
    const d = window[i];
    if (!d) continue;
    for (const b of d.bearish_engulfing ?? []) {
      if (b?.code) recentBearishCodes.add(b.code);
    }
  }

  const { trendingGroups, groupDays } = computeFocusTrends(window);

  // === 個股風險指標（近 6 日視窗）===
  // 1. consecutiveUpDays：連續幾日出現在漲停名單
  // 2. 處置推算：6 個交易日內漲停 ≥3 次（TWSE 規則近似）
  const last6Days: FocusDailyDay[] = [];
  for (let i = 0; i < Math.min(window.length, 6); i++) {
    const d = window[i];
    if (d) last6Days.push(d);
  }
  const stockLimitUpDates = new Map<string, string[]>();
  for (const day of last6Days) {
    for (const g of day.groups) {
      for (const s of g.stocks) {
        if (!stockLimitUpDates.has(s.code)) stockLimitUpDates.set(s.code, []);
        stockLimitUpDates.get(s.code)!.push(day.date);
      }
    }
  }
  // 量比分母：前幾個漲停日（last6Days[1:]）的平均量
  const prevAvgVolMap = new Map<string, number>();
  for (const [code] of stockLimitUpDates) {
    const vols: number[] = [];
    for (let i = 1; i < last6Days.length; i++) {
      for (const g of last6Days[i].groups) {
        const found = g.stocks.find((s) => s.code === code);
        if (found) vols.push(found.volume);
      }
    }
    if (vols.length > 0) {
      prevAvgVolMap.set(code, vols.reduce((a, b) => a + b, 0) / vols.length);
    }
  }

  const consecutiveUpDaysMap = new Map<string, number>();
  const disposalCodes = new Set<string>();
  for (const [code, dates] of stockLimitUpDates) {
    let consec = 0;
    for (let i = 0; i < last6Days.length; i++) {
      if (dates.includes(last6Days[i].date)) consec++;
      else break;
    }
    consecutiveUpDaysMap.set(code, consec);
    if (dates.length >= 3) disposalCodes.add(code);
  }

  // 定格日的空吞代號（UI 過濾旗標）
  const todayBearishCodes = new Set<string>(
    (today.bearish_engulfing ?? [])
      .map((b) => b?.code)
      .filter((c): c is string => typeof c === "string")
  );

  const focusStocks: FocusStock[] = [];
  for (const g of today.groups) {
    const groupStocksSorted = [...g.stocks].sort((a, b) => b.volume - a.volume);
    const leaderCode = groupStocksSorted[0]?.code;

    for (const s of g.stocks) {
      const rev = revenueMap[s.code];
      const gd = groupDays[g.name] || 1;

      const avgVol = prevAvgVolMap.get(s.code);
      const { score, tags } = scoreStock({
        stock: s,
        group: g,
        trendingGroups,
        groupVolumeLeaderCode: leaderCode,
        revYoY: rev?.revYoY,
        volumeRatio: avgVol != null && avgVol > 0 ? s.volume / avgVol : null,
        isDisposal: disposalCodes.has(s.code) || knownDisposal.has(s.code),
        consecutiveUpDays: consecutiveUpDaysMap.get(s.code) ?? 1,
        isHeavyweight: heavyweight.has(s.code),
        recentBearishEngulfing: recentBearishCodes.has(s.code),
      });

      const { entryAggressive, entryPullback, stopLoss, target1, target2,
              open357Low, open357Mid, open357High } =
        calculatePriceLevels(s.close);

      focusStocks.push({
        code: s.code,
        name: s.name,
        close: s.close,
        changePct: s.change_pct,
        volume: s.volume,
        majorNet: s.major_net,
        streak: s.streak,
        consecutiveUpDays: consecutiveUpDaysMap.get(s.code) ?? 1,
        streakRisk: (s.streak ?? 1) <= 2 ? "low" : (s.streak ?? 1) <= 4 ? "medium" : "high",
        group: g.name,
        groupColor: g.color,
        score,
        tags,
        revYoY: rev?.revYoY ?? null,
        revMonth: rev?.revMonth ?? null,
        groupDays: gd,
        entryAggressive,
        entryPullback,
        stopLoss,
        target1,
        target2,
        open357Low,
        open357Mid,
        open357High,
        isBearish: todayBearishCodes.has(s.code),
      });
    }
  }

  // score 由高至低（Array.prototype.sort 穩定：同分保留組裝順序，與 route 原行為一致）
  focusStocks.sort((a, b) => b.score - a.score);
  return focusStocks;
}

/** topPicks = score ≥ 50 的前 15 檔（與 /api/focus 的 topPicks 完全同規則）。 */
export function selectTopPicks(picks: FocusStock[]): FocusStock[] {
  return picks.filter((s) => s.score >= TOP_PICKS_MIN_SCORE).slice(0, TOP_PICKS_MAX);
}
