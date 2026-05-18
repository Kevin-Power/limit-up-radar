/**
 * Unified scoring logic for "明日焦點" stock screening.
 * Used by both /api/focus and /api/daily-report to ensure consistency.
 */

export interface DailyStockMin {
  code: string;
  name: string;
  close: number;
  volume: number;
  major_net: number;
  streak: number;
}

export interface DailyGroupMin {
  name: string;
  color: string;
  stocks: DailyStockMin[];
}

export interface ScoreInput {
  stock: DailyStockMin;
  group: DailyGroupMin;
  trendingGroups: Set<string>;          // groups appearing 2+ days
  groupVolumeLeaderCode?: string;        // top-volume stock in this group
  revYoY?: number | null;
}

export interface ScoreResult {
  score: number;
  tags: string[];
}

/**
 * Score a stock for "明日焦點" recommendation.
 *
 * Positive signals:
 *   - 趨勢族群 (2+ days trending): +30
 *   - 營收 YoY > 20%: +25 (>50% extra +10)
 *   - 法人買超 (major_net > 0): +20
 *   - 連板 (streak >= 2): +15
 *   - 大量 (volume > 5M shares = 5,000 lots): +5
 *   - 族群龍頭 (top volume in group): +10
 *   - 權值股漲停 (isHeavyweight=true): +25 (TWSE 50 成分股漲停為強訊號，較罕見)
 *
 * Negative signals (liquidity / risk filters):
 *   - 流動性極低 (volume < 500 lots): -30 (essentially excluded from picks)
 *   - 流動性偏低 (volume < 2000 lots): -15
 *   - 連續 3 天紅 K 警示: tag only (caution flag for user)
 *   - 處置股 (isDisposal=true): -50 (excluded; disposal stocks are illiquid)
 *   - 近期空吞 (recentBearishEngulfing=true): -25 (反轉風險，假漲停可能)
 */
export function scoreStock(input: ScoreInput & {
  isDisposal?: boolean;
  consecutiveUpDays?: number; // 連續上漲天數
  isHeavyweight?: boolean;    // 權值股 (TWSE 50 成分)
  recentBearishEngulfing?: boolean; // 近期出現空吞反轉
}): ScoreResult {
  const {
    stock, group, trendingGroups, groupVolumeLeaderCode, revYoY,
    isDisposal, consecutiveUpDays, isHeavyweight, recentBearishEngulfing,
  } = input;
  let score = 0;
  const tags: string[] = [];

  // === Disposal stock: heavily penalize (illiquid, hard to trade) ===
  if (isDisposal) {
    score -= 50;
    tags.push("⚠️處置股");
  }

  // === Bearish engulfing recent: warn against fake breakout ===
  if (recentBearishEngulfing) {
    score -= 25;
    tags.push("⚠️近期空吞");
  }

  // === Liquidity filter (volume in shares; 1 lot = 1000 shares) ===
  const lots = stock.volume / 1000;
  if (lots < 500) {
    score -= 30;
    tags.push("⚠️量極小");
  } else if (lots < 2000) {
    score -= 15;
    tags.push("⚠️量小");
  }

  // === Positive signals ===
  if (trendingGroups.has(group.name)) {
    score += 30;
    tags.push("趨勢族群");
  }
  if (revYoY != null && revYoY > 20) {
    score += 25;
    tags.push("營收成長");
    if (revYoY > 50) {
      score += 10;
      tags.push("高成長");
    }
  }
  if (stock.major_net > 0) {
    score += 20;
    tags.push("法人買超");
  }
  if (stock.streak >= 2) {
    score += 15;
    tags.push(`${stock.streak}連板`);
  }
  if (stock.volume > 5_000_000) {
    score += 5;
  }
  if (groupVolumeLeaderCode === stock.code) {
    score += 10;
    tags.push("族群龍頭");
  }
  // === 權值股漲停 = 重大訊號 (TWSE 50 龍頭很少漲停，一旦發生通常帶領大盤) ===
  if (isHeavyweight) {
    score += 25;
    tags.push("⭐權值股");
  }

  // === Caution tag (no score change) ===
  if (consecutiveUpDays != null && consecutiveUpDays >= 3) {
    tags.push("⚠️連3紅注意回測");
  }

  return { score, tags };
}

/**
 * Calculate trending groups from today + previous N days.
 * A group is "trending" if it appears in 2+ days.
 */
export function calculateTrendingGroups(
  todayGroups: { name: string }[],
  prevDayGroups: { name: string }[][]
): { trending: Set<string>; groupDays: Record<string, number> } {
  const groupDays: Record<string, number> = {};
  for (const g of todayGroups) {
    groupDays[g.name] = (groupDays[g.name] || 0) + 1;
  }
  for (const dayGroups of prevDayGroups) {
    for (const g of dayGroups) {
      groupDays[g.name] = (groupDays[g.name] || 0) + 1;
    }
  }
  const trending = new Set(
    Object.entries(groupDays)
      .filter(([, d]) => d >= 2)
      .map(([n]) => n)
  );
  return { trending, groupDays };
}

/**
 * Calculate entry/exit price levels based on close price.
 */
export function calculatePriceLevels(close: number) {
  return {
    entryAggressive: Math.round(close * 1.005 * 100) / 100,
    entryPullback: Math.round(close * 0.97 * 100) / 100,
    stopLoss: Math.round(close * 0.93 * 100) / 100,
    target1: Math.round(close * 1.05 * 100) / 100,
    target2: Math.round(close * 1.10 * 100) / 100,
  };
}
