"use client";

import { useEffect, useState, useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DailyData, Stock, StockGroup } from "@/lib/types";
import { EmaResult } from "@/lib/ema";
import { shiftDate, formatPrice, formatPct, formatNumber } from "@/lib/utils";
import { buildCsvString, downloadCsv } from "@/components/DateNav";
import TopNav from "@/components/TopNav";
import TickerBar from "@/components/TickerBar";
import DateNav from "@/components/DateNav";
import GroupBlock from "@/components/GroupBlock";
import SidePanel from "@/components/SidePanel";
import Skeleton from "@/components/Skeleton";
import Highlights from "@/components/Highlights";
import KeyboardHelp from "@/components/KeyboardHelp";
import BackToTop from "@/components/BackToTop";
import NavBar from "@/components/NavBar";
import { useWatchlist } from "@/lib/useWatchlist";
import StarButton from "@/components/StarButton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Home() {
  const [currentDate, setCurrentDate] = useState<string | null>(null);
  const { toggle: toggleWatch, isWatched, count: watchlistCount } = useWatchlist();
  const [watchlistCollapsed, setWatchlistCollapsed] = useState(false);
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);

  const apiUrl = currentDate ? `/api/daily/${currentDate}` : "/api/daily/latest";
  const { data: fetchedData, isLoading } = useSWR<DailyData>(apiUrl, fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 30000,
  });

  const showSkeleton = isLoading && !fetchedData;

  // Extract all stock codes from daily data for batch EMA
  const allCodes = useMemo(() => {
    if (!fetchedData?.groups) return [];
    return fetchedData.groups.flatMap((g: StockGroup) => g.stocks.map((s) => s.code));
  }, [fetchedData]);

  const emaUrl = allCodes.length > 0 ? `/api/ema/batch?codes=${allCodes.join(",")}` : null;
  const { data: emaData } = useSWR<Record<string, EmaResult>>(emaUrl, fetcher);

  // Once we get latest data, remember its date for navigation
  useEffect(() => {
    if (fetchedData?.date && !currentDate) {
      setCurrentDate(fetchedData.date);
    }
  }, [fetchedData, currentDate]);

  const displayData: DailyData | null = fetchedData?.groups ? fetchedData : null;
  const displayDate = displayData?.date ?? null;

  // Track data fetch time for freshness indicator
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    if (fetchedData?.groups) {
      setFetchedAt(new Date());
    }
  }, [fetchedData]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const freshnessLabel = useMemo(() => {
    if (!fetchedAt) return null;
    const diffMs = now.getTime() - fetchedAt.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "剛剛更新";
    if (diffMin < 60) return `更新於 ${diffMin} 分鐘前`;
    const hh = fetchedAt.getHours().toString().padStart(2, "0");
    const mm = fetchedAt.getMinutes().toString().padStart(2, "0");
    return `最後更新: ${hh}:${mm}`;
  }, [fetchedAt, now]);

  // Flatten all stocks with their group name for the search box and selection
  const allStocks: (Stock & { group: string })[] =
    displayData?.groups?.flatMap((g) =>
      g.stocks.map((s) => ({ ...s, group: g.name }))
    ) ?? [];

  const router = useRouter();
  const NAV_ROUTES = ["/", "/next-day", "/pony", "/backtest", "/screener", "/global", "/news", "/report", "/stats"];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      if (e.key === "Escape") {
        setSelectedStockCode(null);
        return;
      } else if (e.key === "ArrowLeft" && displayDate) {
        setCurrentDate(shiftDate(displayDate, -1));
      } else if (e.key === "ArrowRight" && displayDate) {
        setCurrentDate(shiftDate(displayDate, 1));
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('input[type="text"]');
        if (searchInput) {
          if (document.activeElement === searchInput) {
            searchInput.blur();
          } else {
            searchInput.focus();
          }
        }
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        const streakLabel = Array.from(document.querySelectorAll('span')).find(el => el.textContent?.includes('連板股追蹤'));
        const streakSection = streakLabel?.closest('.mt-6');
        if (streakSection) {
          streakSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        if (displayData) {
          const csv = buildCsvString(displayData);
          downloadCsv(csv, `漲停雷達_${displayData.date}.csv`);
        }
      } else if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key) - 1;
        if (idx < NAV_ROUTES.length) {
          e.preventDefault();
          router.push(NAV_ROUTES[idx]);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [displayDate, displayData, router]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate={displayDate ?? undefined} stocks={allStocks} />
      {showSkeleton ? (
        <div className="h-8 skeleton" />
      ) : displayData?.market_summary ? (
        <TickerBar summary={displayData.market_summary} />
      ) : null}
      <NavBar />
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden animate-fade-in">
        <main className="flex-1 overflow-y-auto p-5">
          <h1 className="sr-only">漲停雷達 — 每日漲停族群總覽</h1>
          {displayDate && (
            <DateNav
              date={displayDate}
              limitUpCount={displayData?.market_summary?.limit_up_count ?? 0}
              groupCount={displayData?.groups?.length ?? 0}
              onPrev={() => setCurrentDate(shiftDate(displayDate, -1))}
              onNext={() => setCurrentDate(shiftDate(displayDate, 1))}
              data={displayData ?? undefined}
            />
          )}
          {freshnessLabel && (
            <div className="flex items-center gap-1.5 mb-3 -mt-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green" />
              </span>
              <span className="text-[10px] text-txt-4 tabular-nums">{freshnessLabel}</span>
            </div>
          )}
          {showSkeleton && <Skeleton />}
          {!fetchedData?.groups && !showSkeleton && !isLoading && (
            <div className="text-txt-3 text-sm text-center py-20">此日期無資料</div>
          )}
          {!showSkeleton && displayData && <Highlights data={displayData} />}

          {/* Watchlist / 自選股 Section */}
          {!showSkeleton && watchlistCount > 0 && (() => {
            const watchedStocks = allStocks.filter(s => isWatched(s.code));
            if (watchedStocks.length === 0) return null;
            return (
              <div className="mb-4">
                <div
                  className="flex items-center gap-2 mb-3 cursor-pointer select-none"
                  onClick={() => setWatchlistCollapsed(!watchlistCollapsed)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={!watchlistCollapsed}
                  aria-label={`自選股 — ${watchlistCollapsed ? "展開" : "收合"}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setWatchlistCollapsed(!watchlistCollapsed); } }}
                >
                  <svg viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" strokeWidth={1} className="w-4 h-4 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-txt-4">自選股</span>
                  <span className="text-[10px] text-txt-4 bg-bg-2 px-1.5 py-0.5 rounded tabular-nums">{watchedStocks.length} 檔</span>
                  <span className="text-txt-4 text-[10px] ml-auto">{watchlistCollapsed ? "▸" : "▾"}</span>
                </div>
                {!watchlistCollapsed && (
                  <div className="bg-bg-1 border border-yellow-500/20 rounded-lg overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-1.5 bg-bg-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-txt-4">
                      <div className="w-4 flex-shrink-0" />
                      <div className="w-11 flex-shrink-0">代號</div>
                      <div className="w-20 flex-shrink-0">名稱</div>
                      <div className="w-20 text-right flex-shrink-0">收盤價</div>
                      <div className="w-16 text-right flex-shrink-0">漲幅</div>
                      <div className="hidden md:block w-20 text-right flex-shrink-0">成交量</div>
                      <div className="flex-1 text-right">所屬族群</div>
                    </div>
                    {/* Rows */}
                    {watchedStocks.map((s) => (
                      <div
                        key={s.code}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.02] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="w-4 flex-shrink-0 flex items-center justify-center">
                          <StarButton code={s.code} isWatched={true} onToggle={toggleWatch} />
                        </div>
                        <div className="w-11 flex-shrink-0">
                          <Link
                            href={`/stock/${s.code}`}
                            className="text-xs font-semibold text-txt-2 tabular-nums hover:text-txt-0 hover:underline underline-offset-2 transition-colors"
                          >
                            {s.code}
                          </Link>
                        </div>
                        <div className="w-20 flex-shrink-0">
                          <Link
                            href={`/stock/${s.code}`}
                            className="text-[13px] font-semibold text-txt-0 hover:underline underline-offset-2 hover:text-red/90 transition-colors"
                          >
                            {s.name}
                          </Link>
                        </div>
                        <div className="w-20 text-right text-[13px] font-bold text-red tabular-nums flex-shrink-0">
                          {formatPrice(s.close)}
                        </div>
                        <div className="w-16 text-right flex-shrink-0">
                          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${
                            s.change_pct >= 0 ? "text-red bg-red-bg" : "text-green bg-green-bg"
                          }`}>
                            {formatPct(s.change_pct)}
                          </span>
                        </div>
                        <div className="hidden md:block w-20 text-right text-xs text-txt-2 tabular-nums flex-shrink-0">
                          {formatNumber(s.volume)}
                        </div>
                        <div className="flex-1 text-right">
                          <span className="text-[10px] text-txt-4 truncate">{s.group}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {!showSkeleton && displayData?.groups?.map((group) => (
            <GroupBlock
              key={group.name}
              group={group}
              totalStocks={displayData.groups.reduce((s, g) => s + g.stocks.length, 0)}
              isWatched={isWatched}
              onToggleWatch={toggleWatch}
              emaData={emaData ?? undefined}
              selectedCode={selectedStockCode}
              onSelectStock={(code) => setSelectedStockCode(prev => prev === code ? null : code)}
            />
          ))}

          {/* Streak Tracker */}
          {!showSkeleton && (() => {
            const streakStocks = allStocks
              .filter((s) => s.streak > 1)
              .sort((a, b) => b.streak - a.streak || b.change_pct - a.change_pct);
            if (streakStocks.length === 0) return null;
            return (
              <div className="mt-6 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-txt-4">連板股追蹤</span>
                  <span className="text-[10px] text-txt-4 bg-bg-2 px-1.5 py-0.5 rounded tabular-nums">{streakStocks.length} 檔</span>
                </div>
                <div className="bg-bg-1 border border-border rounded-lg overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-3 px-4 py-1.5 bg-bg-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-txt-4">
                    <div className="w-11 flex-shrink-0">代號</div>
                    <div className="w-20 flex-shrink-0">名稱</div>
                    <div className="w-16 flex-shrink-0 text-center">連板</div>
                    <div className="w-20 text-right flex-shrink-0">收盤價</div>
                    <div className="w-16 text-right flex-shrink-0">漲幅</div>
                    <div className="hidden md:block w-20 text-right flex-shrink-0">成交量</div>
                    <div className="flex-1 text-right">所屬族群</div>
                  </div>
                  {/* Rows */}
                  {streakStocks.map((s) => (
                    <div
                      key={s.code}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.02] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="w-11 flex-shrink-0">
                        <Link
                          href={`/stock/${s.code}`}
                          className="text-xs font-semibold text-txt-2 tabular-nums hover:text-txt-0 hover:underline underline-offset-2 transition-colors"
                        >
                          {s.code}
                        </Link>
                      </div>
                      <div className="w-20 flex-shrink-0">
                        <Link
                          href={`/stock/${s.code}`}
                          className="text-[13px] font-semibold text-txt-0 hover:underline underline-offset-2 hover:text-red/90 transition-colors"
                        >
                          {s.name}
                        </Link>
                      </div>
                      <div className="w-16 flex-shrink-0 flex items-center justify-center gap-0.5">
                        {Array.from({ length: Math.min(s.streak, 7) }).map((_, i) => (
                          <span key={i} className="w-2 h-2 rounded-full bg-red" />
                        ))}
                        <span className="text-[11px] font-bold text-red tabular-nums ml-1">{s.streak}</span>
                      </div>
                      <div className="w-20 text-right text-[13px] font-bold text-red tabular-nums flex-shrink-0">
                        {formatPrice(s.close)}
                      </div>
                      <div className="w-16 text-right flex-shrink-0">
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${
                          s.change_pct >= 0 ? "text-red bg-red-bg" : "text-green bg-green-bg"
                        }`}>
                          {formatPct(s.change_pct)}
                        </span>
                      </div>
                      <div className="hidden md:block w-20 text-right text-xs text-txt-2 tabular-nums flex-shrink-0">
                        {formatNumber(s.volume)}
                      </div>
                      <div className="flex-1 text-right">
                        <span className="text-[10px] text-txt-4 truncate">{s.group}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </main>
        {displayData && (
          <div className="w-full md:w-auto">
            <SidePanel
              data={displayData}
              selectedCode={selectedStockCode}
              emaData={emaData ?? undefined}
              onCloseStock={() => setSelectedStockCode(null)}
            />
          </div>
        )}
      </div>
      <BackToTop />
      <KeyboardHelp />
    </div>
  );
}
