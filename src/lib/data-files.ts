// src/lib/data-files.ts
//
// Shared helpers for reading the on-disk daily/revenue JSON snapshots.
// Extracted from ~11 API routes that each re-implemented the
// "list JSON files, sort newest-first, read the latest" pattern.
//
// Behaviour is kept identical to the inlined versions so callers can swap in
// without observable change:
//   - listJsonFiles: readdirSync + .endsWith(".json") + .sort().reverse()
//   - safeReadJSON:  JSON.parse(readFileSync(...)) wrapped in try/catch -> null
import fs from "fs";
import path from "path";

export const DAILY_DIR = path.join(process.cwd(), "data", "daily");
export const REVENUE_DIR = path.join(process.cwd(), "data", "revenue");
export const INTRADAY_DIR = path.join(process.cwd(), "data", "intraday_cache");

/** 一分 K 分時資料（來自 Shioaji 收錄，僅 OHLC，無量）。 */
export interface IntradayBar {
  time: string; // "HH:MM"
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * 找出某代號「最近一個有資料」的分時檔（檔名格式 {code}_{YYYY-MM-DD}.json）。
 * intraday_cache 只涵蓋部分精選標的與交易日、且盤後收錄（非即時），
 * 故回傳的 date 未必是最新交易日；呼叫端需誠實標示。
 * 跳過空陣列/讀取失敗的檔，回傳第一個有內容者。
 */
export function latestIntradayForCode(
  code: string
): { date: string; bars: IntradayBar[] } | null {
  if (!fs.existsSync(INTRADAY_DIR)) return null;
  const prefix = `${code}_`;
  const files = fs
    .readdirSync(INTRADAY_DIR)
    .filter((f) => f.startsWith(prefix) && /_\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
  for (const f of files) {
    const bars = safeReadJSON<IntradayBar[]>(path.join(INTRADAY_DIR, f));
    if (Array.isArray(bars) && bars.length > 0) {
      return { date: f.slice(prefix.length).replace(/\.json$/, ""), bars };
    }
  }
  return null;
}

/** 分時收錄涵蓋的所有交易日（YYYY-MM-DD），最新在前。 */
export function intradayDates(): string[] {
  if (!fs.existsSync(INTRADAY_DIR)) return [];
  const set = new Set<string>();
  for (const f of fs.readdirSync(INTRADAY_DIR)) {
    const m = f.match(/_(\d{4}-\d{2}-\d{2})\.json$/);
    if (m) set.add(m[1]);
  }
  return [...set].sort().reverse();
}

/** 某交易日所有有分時資料的個股（跳過空/壞檔）。 */
export function listIntradayForDate(date: string): { code: string; bars: IntradayBar[] }[] {
  if (!fs.existsSync(INTRADAY_DIR)) return [];
  const suffix = `_${date}.json`;
  const out: { code: string; bars: IntradayBar[] }[] = [];
  for (const f of fs.readdirSync(INTRADAY_DIR)) {
    if (!f.endsWith(suffix)) continue;
    const bars = safeReadJSON<IntradayBar[]>(path.join(INTRADAY_DIR, f));
    if (Array.isArray(bars) && bars.length > 0) {
      out.push({ code: f.slice(0, f.length - suffix.length), bars });
    }
  }
  return out;
}

/**
 * List `.json` files in a directory, sorted newest-first (lexicographic
 * descending, which matches YYYY-MM-DD filenames). Returns [] if the
 * directory does not exist.
 */
export function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
}

/** Daily snapshot files, newest-first. */
export function listDailyFiles(): string[] {
  return listJsonFiles(DAILY_DIR);
}

/**
 * Daily dates (filenames with `.json` stripped), newest-first.
 * e.g. ["2026-06-27", "2026-06-26", ...]
 */
export function listDailyDates(): string[] {
  return listDailyFiles().map((f) => f.replace(".json", ""));
}

/** Parse a JSON file, returning null on any read/parse error. */
export function safeReadJSON<T = unknown>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Parse a daily file by its filename (e.g. "2026-06-27.json"). */
export function loadDailyFile<T = unknown>(file: string): T | null {
  return safeReadJSON<T>(path.join(DAILY_DIR, file));
}

/** Parse the most recent daily snapshot, or null if none / unreadable. */
export function loadLatestDaily<T = unknown>(): T | null {
  const files = listDailyFiles();
  if (!files.length) return null;
  return loadDailyFile<T>(files[0]);
}

/** Parse the most recent revenue snapshot, or null if none / unreadable. */
export function loadLatestRevenue<T = unknown>(): T | null {
  const files = listJsonFiles(REVENUE_DIR);
  if (!files.length) return null;
  return safeReadJSON<T>(path.join(REVENUE_DIR, files[0]));
}

/**
 * Latest date (YYYY-MM-DD) in a directory using a strict filename match.
 * Only files matching exactly `\d{4}-\d{2}-\d{2}\.json` are considered.
 * Returns null if the directory is missing or has no matching files.
 */
export function latestDateInDir(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return files[0].replace(/\.json$/, "");
}
