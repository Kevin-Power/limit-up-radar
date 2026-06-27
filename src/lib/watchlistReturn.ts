/**
 * 自選股損益日誌：純函式邏輯，方便理解與驗證（無框架測試，用 tsc + 自我檢查）。
 */

export interface Candle {
  date: string; // YYYY-MM-DD
  close: number;
}

/**
 * 找出「加入日」當作進場價的收盤價。
 * 規則：
 *  - addedAt 為空 → null（無法計算）。
 *  - history 為空 → null。
 *  - 找 date === addedAt 的收盤；若當天無資料（假日/停牌/加入時間早於最早資料），
 *    取 addedAt 當天「或之後」最早一筆收盤當進場價（最接近加入日的可成交日）。
 *  - 若所有資料都早於 addedAt（addedAt 比最新一筆還新）→ null。
 */
export function findEntryClose(history: Candle[], addedAt: string): number | null {
  if (!addedAt) return null;
  if (!history || history.length === 0) return null;
  // history 假設已由 API 依日期升冪排序；保險起見複製後排序。
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  for (const c of sorted) {
    if (c.date >= addedAt) {
      return Number.isFinite(c.close) ? c.close : null;
    }
  }
  return null;
}

/**
 * 計算自加入報酬率（百分比）。
 * 進場價或現價無效 → null。
 */
export function computeReturnPct(currentClose: number | null | undefined, entryClose: number | null): number | null {
  if (entryClose == null || !Number.isFinite(entryClose) || entryClose === 0) return null;
  if (currentClose == null || !Number.isFinite(currentClose)) return null;
  return ((currentClose - entryClose) / entryClose) * 100;
}

/** 計算加入天數（以今日 ISO 日期字串為基準）。addedAt 空或無效 → null。 */
export function daysSince(addedAt: string, todayISO: string): number | null {
  if (!addedAt) return null;
  const a = Date.parse(addedAt + "T00:00:00Z");
  const t = Date.parse(todayISO + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(t)) return null;
  const diff = Math.round((t - a) / 86400000);
  return diff < 0 ? 0 : diff;
}
