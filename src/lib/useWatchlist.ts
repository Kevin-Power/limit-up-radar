"use client";
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "limit-up-radar-watchlist";

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setWatchlist(JSON.parse(saved));
    } catch {}
  }, []);

  const toggle = useCallback((code: string) => {
    setWatchlist(prev => {
      const next = prev.includes(code)
        ? prev.filter(c => c !== code)
        : [...prev, code];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const isWatched = useCallback((code: string) => watchlist.includes(code), [watchlist]);

  return { watchlist, toggle, isWatched, count: watchlist.length };
}
