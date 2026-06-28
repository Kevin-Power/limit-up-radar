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
