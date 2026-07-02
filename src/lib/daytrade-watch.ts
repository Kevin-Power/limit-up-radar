// 相對路徑 import（不用 "@/" 別名）：讓 scripts/ 下的 npx tsx 腳本可直接載入本模組。
import { calculateTrendingGroups } from "./scoring";
import type { DailyData } from "./types";

// 當沖「觀察度」計算 — 單一事實來源（route 與回溯驗證共用，禁止再複製）。
// 觀察度衡量「明日可能的流動性與市場關注度」，**與勝率/報酬無任何已驗證關係**。
// 純函式：只吃當日收盤 daily 可得欄位，無 look-ahead、無 I/O（歷史振幅由呼叫端另外裝飾）。
// 修改公式時務必更新版本號，回溯驗證會記錄它，避免像評分那樣悄悄漂移。
export const WATCH_FORMULA_VERSION = "v1-2026-07-01";

export interface WatchScored {
  code: string;
  name: string;
  market: string | null;
  group: string;
  groupColor: string;
  close: number;
  changePct: number;
  volume: number;
  lots: number;
  streak: number;
  majorNet: number;
  watchScore: number;
  grade: "high" | "mid" | "low";
  tags: string[];
}

export interface WatchExcluded {
  code: string;
  name: string;
  reason: "disposal" | "low_liquidity";
}

/**
 * 重建某交易日的當沖觀察清單。
 * @param today       當日 daily
 * @param prevGroups  前 1~2 日的 groups（算族群趨勢）
 * @param last6       近 6 日 daily（含當日，算處置：6 日內 ≥3 次漲停）
 * @param disposalSet categories.json 的處置名單
 */
export function computeWatchList(
  today: DailyData,
  prevGroups: { name: string }[][],
  last6: DailyData[],
  disposalSet: Set<string>
): { rows: WatchScored[]; excluded: WatchExcluded[] } {
  const { trending } = calculateTrendingGroups(today.groups, prevGroups);

  const limitUpDayCount = new Map<string, number>();
  for (const d of last6) {
    const seen = new Set<string>();
    for (const g of d.groups) for (const s of g.stocks) seen.add(s.code);
    for (const c of seen) limitUpDayCount.set(c, (limitUpDayCount.get(c) ?? 0) + 1);
  }

  const rows: WatchScored[] = [];
  const excluded: WatchExcluded[] = [];

  for (const g of today.groups) {
    const groupFocus = g.stocks.length >= 5; // 今日同族群漲停 ≥5 檔
    for (const s of g.stocks) {
      const lots = s.volume / 1000;
      const isDisposal = (limitUpDayCount.get(s.code) ?? 0) >= 3 || disposalSet.has(s.code);
      if (isDisposal) { excluded.push({ code: s.code, name: s.name, reason: "disposal" }); continue; }
      if (lots < 2000) { excluded.push({ code: s.code, name: s.name, reason: "low_liquidity" }); continue; }

      let score = 0;
      const tags: string[] = [];
      if (lots >= 20000) { score += 30; tags.push("巨量人氣"); }
      else if (lots >= 10000) { score += 25; tags.push("大量"); }
      else if (lots >= 5000) { score += 18; }
      else { score += 8; }
      if (trending.has(g.name)) { score += 15; tags.push("趨勢族群"); }
      if (groupFocus) { score += 10; tags.push("族群聚焦"); }
      if (s.streak >= 2 && s.streak <= 4) { score += 10; tags.push(`${s.streak}連板人氣`); }
      else if (s.streak >= 5) { tags.push("⚠️高位連板·處置臨界"); }
      if (s.major_net >= 1_000_000) { score += 10; tags.push("主力買超"); }
      else if (s.major_net <= -500_000) { tags.push("⚠️主力賣超"); }
      if (s.close >= 15 && s.close <= 500) { score += 5; }
      else if (s.close < 10) { tags.push("低價股·檔位跳動%大"); }

      const grade: "high" | "mid" | "low" = score >= 60 ? "high" : score >= 40 ? "mid" : "low";
      rows.push({
        code: s.code, name: s.name, market: s.market ?? null, group: g.name, groupColor: g.color,
        close: s.close, changePct: s.change_pct, volume: s.volume, lots: Math.round(lots),
        streak: s.streak, majorNet: s.major_net, watchScore: score, grade, tags,
      });
    }
  }
  rows.sort((a, b) => b.watchScore - a.watchScore || b.volume - a.volume);
  return { rows, excluded };
}

// ── 明日精選觀察（shortlist）──
// **不是第 4 份評分公式**：純粹對 computeWatchList() 的 rows 做「多條件匯聚」過濾，
// 不新增、不調整任何分數；排序沿用 watchScore。門檻改動必須同步更新版本號與
// SHORTLIST_CRITERIA 描述文字（揭露用），避免規則悄悄漂移。
// 「精選」＝流動性與關注度匯聚，與勝率/報酬無任何已驗證關係（同 WATCH 揭露）。
export const SHORTLIST_RULE_VERSION = "v1-2026-07-02";
export const SHORTLIST_MAX = 8;

/** 精選門檻的人話描述（route/client 揭露用，必須與 pickShortlist 邏輯同步維護）。 */
export const SHORTLIST_CRITERIA =
  "高觀察（觀察度≥60）＋趨勢族群＋（主力買超 或 成交量≥10,000 張），依觀察度取前 8 檔；不足額不遞補";

export interface ShortlistEntry extends WatchScored {
  /** 入選理由（tags 轉人話，逐條可對照原始 tags 驗證） */
  reasons: string[];
  /** 風險旗標（由 tags 的 ⚠️ 標記與低價標記轉譯） */
  riskFlags: string[];
}

/**
 * 從觀察清單挑「高匯聚」精選子集。
 * 門檻（全部須滿足）：
 *   1. grade === "high"（watchScore ≥ 60）
 *   2. 具「趨勢族群」tag（所屬族群連日出現於趨勢名單）
 *   3. 具「主力買超」tag 或 成交量 ≥ 10,000 張（即「大量」以上，含巨量）
 * rows 已依 watchScore 排序，直接取前 SHORTLIST_MAX；當日無符合者回傳空陣列（寧缺勿濫）。
 */
export function pickShortlist(rows: WatchScored[]): ShortlistEntry[] {
  const out: ShortlistEntry[] = [];
  for (const r of rows) {
    if (out.length >= SHORTLIST_MAX) break;
    if (r.grade !== "high") continue;
    if (!r.tags.includes("趨勢族群")) continue;
    const bigVolume = r.lots >= 10_000;
    const majorBuy = r.tags.includes("主力買超");
    if (!bigVolume && !majorBuy) continue;

    const reasons: string[] = [];
    if (r.lots >= 20_000) reasons.push(`巨量成交 ${r.lots.toLocaleString("en-US")} 張，人氣與流動性集中`);
    else if (bigVolume) reasons.push(`萬張大量成交（${r.lots.toLocaleString("en-US")} 張）`);
    else reasons.push(`成交 ${r.lots.toLocaleString("en-US")} 張`);
    reasons.push(`「${r.group}」為趨勢族群（近日持續出現於趨勢名單）`);
    if (r.tags.includes("族群聚焦")) reasons.push("同族群今日 5 檔以上漲停，資金聚焦");
    if (majorBuy) reasons.push("今日主力籌碼買超（收盤後資料）");
    if (r.streak >= 2 && r.streak <= 4) reasons.push(`${r.streak} 連板，市場關注度延續`);

    const riskFlags: string[] = [];
    if (r.tags.includes("⚠️高位連板·處置臨界")) riskFlags.push("高位連板（≥5 板）·臨近處置門檻，隔日流動性風險大");
    if (r.tags.includes("⚠️主力賣超")) riskFlags.push("今日主力籌碼賣超，量大但籌碼背離");
    if (r.tags.some((t) => t.startsWith("低價股"))) riskFlags.push("低價股·單一檔位跳動百分比大，滑價風險高");

    out.push({ ...r, reasons, riskFlags });
  }
  return out;
}
