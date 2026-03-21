"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { DailyData } from "@/lib/types";
import { shiftDate } from "@/lib/utils";
import TopNav from "@/components/TopNav";
import TickerBar from "@/components/TickerBar";
import DateNav from "@/components/DateNav";
import GroupBlock from "@/components/GroupBlock";
import SidePanel from "@/components/SidePanel";

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

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate={displayDate} />
      {displayData?.market_summary && (
        <TickerBar summary={displayData.market_summary} />
      )}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-5">
          {displayDate && (
            <DateNav
              date={displayDate}
              limitUpCount={displayData?.market_summary?.limit_up_count ?? 0}
              groupCount={displayData?.groups?.length ?? 0}
              onPrev={() => setCurrentDate(shiftDate(displayDate, -1))}
              onNext={() => setCurrentDate(shiftDate(displayDate, 1))}
            />
          )}
          {isLoading && (
            <div className="text-txt-3 text-sm text-center py-20">載入中...</div>
          )}
          {error && !isLoading && (
            <div className="text-txt-3 text-sm text-center py-20">此日期無資料</div>
          )}
          {displayData?.groups?.map((group) => (
            <GroupBlock key={group.name} group={group} />
          ))}
        </main>
        {displayData && <SidePanel data={displayData} />}
      </div>
    </div>
  );
}
