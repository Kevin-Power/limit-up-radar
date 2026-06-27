"use client";
import { useState, useEffect, useCallback, useMemo } from "react";

const STORAGE_KEY = "limit-up-radar-watchlist";

export type WatchEntry = { code: string; addedAt: string };

/** 取得今日 ISO 日期字串 (YYYY-MM-DD)。 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 解析 localStorage 內容成 WatchEntry[]。
 * 向下相容：
 *  - 舊格式 string[]（純代碼陣列） → 遷移成 [{code, addedAt: ""}]，舊資料無日期 → 空字串。
 *  - 新格式 {code, addedAt}[] → 原樣返回（過濾無效項）。
 * 純函式，方便理解與測試。
 */
export function parseStored(raw: string | null): WatchEntry[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const out: WatchEntry[] = [];
  const seen = new Set<string>();
  for (const item of data) {
    let code: string | undefined;
    let addedAt = "";
    if (typeof item === "string") {
      // 舊格式：純代碼，無加入日期
      code = item;
      addedAt = "";
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      if (typeof obj.code === "string") {
        code = obj.code;
        addedAt = typeof obj.addedAt === "string" ? obj.addedAt : "";
      }
    }
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, addedAt });
  }
  return out;
}

/** 序列化 WatchEntry[] 成 localStorage 字串（純函式）。 */
export function serialize(entries: WatchEntry[]): string {
  return JSON.stringify(entries);
}

export function useWatchlist() {
  const [entries, setEntries] = useState<WatchEntry[]>([]);

  useEffect(() => {
    try {
      const parsed = parseStored(localStorage.getItem(STORAGE_KEY));
      setEntries(parsed);
      // 載入即把舊格式回寫成新格式，完成遷移
      try {
        localStorage.setItem(STORAGE_KEY, serialize(parsed));
      } catch {}
    } catch {}
  }, []);

  const toggle = useCallback((code: string) => {
    setEntries(prev => {
      const exists = prev.some(e => e.code === code);
      const next = exists
        ? prev.filter(e => e.code !== code)
        : [...prev, { code, addedAt: todayISO() }];
      try { localStorage.setItem(STORAGE_KEY, serialize(next)); } catch {}
      return next;
    });
  }, []);

  // 維持既有 API：watchlist 為純代碼陣列，給所有現有 StarButton 消費者用
  const watchlist = useMemo(() => entries.map(e => e.code), [entries]);

  const isWatched = useCallback(
    (code: string) => entries.some(e => e.code === code),
    [entries],
  );

  return { watchlist, entries, toggle, isWatched, count: entries.length };
}
