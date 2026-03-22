"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import { Stock } from "@/lib/types";
import { formatPrice, formatPct } from "@/lib/utils";
import ThemeToggle from "./ThemeToggle";

interface TopNavProps {
  currentDate: string;
  stocks?: Stock[];
}

interface SearchStock extends Stock {
  group: string;
}

const NAV_ITEMS = [
  { label: "每日總覽", href: "/" },
  { label: "隔日表現", href: "/next-day" },
  { label: "快樂小馬", href: "/pony" },
  { label: "策略回測", href: "/backtest" },
  { label: "進階選股", href: "/screener" },
  { label: "國際市場", href: "/global" },
  { label: "市場情資", href: "/news" },
  { label: "盤後報告", href: "/report" },
  { label: "統計分析", href: "/stats" },
  { label: "處置預測", href: "/disposal" },
];

export default function TopNav({ currentDate, stocks = [] }: TopNavProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const results: SearchStock[] = query.trim().length === 0
    ? []
    : stocks
        .filter(
          (s) =>
            s.code.includes(query.trim()) ||
            s.name.includes(query.trim())
        )
        .slice(0, 8) as SearchStock[];

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [closeDropdown]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      closeDropdown();
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      closeDropdown();
      setQuery("");
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleResultClick() {
    closeDropdown();
    setQuery("");
  }

  return (
    <nav className="bg-bg-1 border-b border-border">
      {/* Row 1: Brand + Search + Date */}
      <div className="flex items-center justify-between h-11 px-5">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-sm text-txt-0 tracking-tight whitespace-nowrap hover:opacity-80 transition-opacity"
        >
          <div className="w-[7px] h-[7px] bg-red rounded-sm" />
          漲停雷達
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] text-txt-4 font-medium">
            <div className="w-[5px] h-[5px] rounded-full bg-green animate-pulse" />
            <span className="hidden sm:inline">已更新</span>
          </div>

          {/* Search box */}
          <div className="relative hidden md:block">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-txt-4 pointer-events-none z-10">&#x2315;</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onFocus={() => query.trim() && setOpen(true)}
              placeholder="搜尋代號 / 名稱"
              className="bg-bg-3 border border-border rounded-md py-1 pl-7 pr-2.5 text-xs text-txt-2 w-[160px] outline-none focus:border-border-hover placeholder:text-txt-4"
              autoComplete="off"
            />

            {open && results.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute right-0 top-full mt-1 w-[300px] bg-bg-1 border border-border rounded-lg shadow-xl overflow-hidden z-50"
              >
                {results.map((stock, idx) => (
                  <button
                    key={stock.code}
                    onClick={handleResultClick}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-white/[0.03] last:border-b-0 ${
                      idx === activeIndex ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="text-xs font-semibold text-txt-3 tabular-nums w-10 flex-shrink-0">
                      {stock.code}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-[13px] font-semibold text-txt-0 block truncate">
                        {stock.name}
                      </span>
                      {"group" in stock && (stock as SearchStock).group && (
                        <span className="text-[10px] text-txt-4 truncate block">
                          {(stock as SearchStock).group}
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-bold text-red tabular-nums flex-shrink-0">
                      {formatPrice(stock.close)}
                    </span>
                    <span className="text-[11px] font-semibold text-red bg-red-bg px-1.5 py-0.5 rounded tabular-nums flex-shrink-0">
                      {formatPct(stock.change_pct)}
                    </span>
                  </button>
                ))}
                <div className="px-3 py-1.5 bg-bg-2 border-t border-border text-[10px] text-txt-4 text-center">
                  共 {results.length} 筆結果
                </div>
              </div>
            )}

            {open && query.trim().length > 0 && results.length === 0 && (
              <div
                ref={dropdownRef}
                className="absolute right-0 top-full mt-1 w-[240px] bg-bg-1 border border-border rounded-lg shadow-xl z-50 px-4 py-3 text-xs text-txt-4 text-center"
              >
                無符合結果
              </div>
            )}
          </div>

          <ThemeToggle />

          <div className="text-[11px] text-txt-4 tabular-nums tracking-wider whitespace-nowrap">
            {(currentDate || "").replace(/-/g, "/")}
          </div>

          <button
            className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-[5px] text-txt-3 hover:text-txt-1 transition-colors"
            aria-label="選單"
            onClick={() => setMobileMenuOpen((v) => !v)}
          >
            <span className="w-5 h-[1.5px] bg-current rounded-full" />
            <span className="w-5 h-[1.5px] bg-current rounded-full" />
            <span className="w-5 h-[1.5px] bg-current rounded-full" />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-bg-1 border-t border-border">
          {NAV_ITEMS.map(({ label, href }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={label}
                href={href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-5 py-2.5 text-[13px] font-medium border-b border-border transition-colors ${
                  isActive
                    ? "text-txt-0 bg-bg-2"
                    : "text-txt-3 hover:text-txt-1 hover:bg-bg-2"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
