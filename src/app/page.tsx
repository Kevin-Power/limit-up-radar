"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { DailyData, Stock } from "@/lib/types";
import { shiftDate } from "@/lib/utils";
import TopNav from "@/components/TopNav";
import TickerBar from "@/components/TickerBar";
import DateNav from "@/components/DateNav";
import GroupBlock from "@/components/GroupBlock";
import SidePanel from "@/components/SidePanel";
import Skeleton from "@/components/Skeleton";
import Highlights from "@/components/Highlights";
import KeyboardHelp from "@/components/KeyboardHelp";
import BackToTop from "@/components/BackToTop";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Home() {
  const [currentDate, setCurrentDate] = useState<string | null>(null);

  const { data: latestData } = useSWR<DailyData>(
    currentDate ? null : "/api/daily/latest",
    fetcher
  );

  const { data, error, isLoading } = useSWR<DailyData>(
    currentDate ? `/api/daily/${currentDate}` : null,
    fetcher
  );

  useEffect(() => {
    if (latestData?.date && !currentDate) {
      setCurrentDate(latestData.date);
    }
  }, [latestData, currentDate]);

  const displayData = currentDate ? data : latestData;
  const displayDate = currentDate || latestData?.date || "";

  // Flatten all stocks with their group name for the search box
  const allStocks: (Stock & { group: string })[] =
    displayData?.groups?.flatMap((g) =>
      g.stocks.map((s) => ({ ...s, group: g.name }))
    ) ?? [];

  // Keyboard navigation: left arrow = previous day, right arrow = next day
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!displayDate) return;
      // Avoid triggering when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;
      if (e.key === "ArrowLeft") {
        setCurrentDate(shiftDate(displayDate, -1));
      } else if (e.key === "ArrowRight") {
        setCurrentDate(shiftDate(displayDate, 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [displayDate]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate={displayDate} stocks={allStocks} />
      {displayData?.market_summary && (
        <TickerBar summary={displayData.market_summary} />
      )}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-5">
          {displayDate && (
            <DateNav
              date={displayDate}
              limitUpCount={displayData?.market_summary?.limit_up_count ?? 0}
              groupCount={displayData?.groups?.length ?? 0}
              onPrev={() => setCurrentDate(shiftDate(displayDate, -1))}
              onNext={() => setCurrentDate(shiftDate(displayDate, 1))}
              data={displayData}
            />
          )}
          {isLoading && <Skeleton />}
          {error && !isLoading && (
            <div className="text-txt-3 text-sm text-center py-20">此日期無資料</div>
          )}
          {displayData && <Highlights data={displayData} />}
          {displayData?.groups?.map((group) => (
            <GroupBlock key={group.name} group={group} />
          ))}
        </main>
        {displayData && (
          <div className="w-full md:w-auto">
            <SidePanel data={displayData} />
          </div>
        )}
      </div>
      <BackToTop />
      <KeyboardHelp />
    </div>
  );
}
