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
import NavBar from "@/components/NavBar";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const DEMO_DATA: DailyData = {
  date: "2026-03-20",
  market_summary: {
    taiex_close: 33689,
    taiex_change_pct: 0.45,
    total_volume: 452100000000,
    limit_up_count: 54,
    limit_down_count: 2,
    advance: 892,
    decline: 421,
    unchanged: 187,
    foreign_net: 12800000000,
    trust_net: 3400000000,
    dealer_net: 1300000000,
  },
  groups: [
    {
      name: "鋼鐵 / 鋼價調漲",
      color: "#ef4444",
      badges: ["HOT"],
      reason: "中鴻4月內銷盤價調漲每噸1200元，全球PMI回升至51.9，鋼價底部支撐增強",
      stocks: [
        { code: "2007", name: "燁興", industry: "鋼鐵", close: 8.48, change_pct: -3.96, volume: 31450000, major_net: 4200000, streak: 1 },
        { code: "2014", name: "中鴻", industry: "鋼鐵", close: 18.45, change_pct: 1.65, volume: 187620000, major_net: 62000000, streak: 2 },
        { code: "2025", name: "千興", industry: "不鏽鋼", close: 11.55, change_pct: 9.95, volume: 6830000, major_net: 3500000, streak: 1 },
        { code: "2032", name: "新鋼", industry: "不鏽鋼", close: 17.05, change_pct: 9.65, volume: 24370000, major_net: 5800000, streak: 1 },
        { code: "2013", name: "中鋼構", industry: "鋼構", close: 43.2, change_pct: 9.90, volume: 27850000, major_net: 18000000, streak: 2 },
        { code: "2012", name: "春雨", industry: "鋼鐵", close: 28.9, change_pct: 9.85, volume: 48320000, major_net: 15000000, streak: 1 },
      ],
    },
    {
      name: "半導體測試 / 先進封裝",
      color: "#3b82f6",
      badges: ["FOCUS"],
      reason: "穎崴漲停再創歷史新高，AI晶片先進封裝需求帶動測試介面與設備族群全面走強",
      stocks: [
        { code: "6515", name: "穎崴", industry: "半導體設備", close: 8190, change_pct: 3.87, volume: 14230000, major_net: 185000000, streak: 3 },
        { code: "6223", name: "旺矽", industry: "半導體設備", close: 3860, change_pct: 4.89, volume: 8740000, major_net: 92000000, streak: 1 },
        { code: "7795", name: "長廣", industry: "半導體設備", close: 403, change_pct: -0.12, volume: 21560000, major_net: 38000000, streak: 2 },
        { code: "6683", name: "雍智", industry: "IC設計", close: 1285, change_pct: 3.62, volume: 16420000, major_net: 45000000, streak: 1 },
      ],
    },
    {
      name: "矽光子 / 高速傳輸",
      color: "#8b5cf6",
      badges: ["NEW"],
      reason: "矽光子技術突破帶動高速傳輸需求，資金積極卡位AI網通相關題材",
      stocks: [
        { code: "4977", name: "眾達-KY", industry: "光通訊", close: 181.5, change_pct: -1.89, volume: 28750000, major_net: 52000000, streak: 2 },
        { code: "3363", name: "上詮", industry: "光通訊", close: 734, change_pct: 5.17, volume: 39420000, major_net: 35000000, streak: 1 },
        { code: "4979", name: "華星光", industry: "光通訊", close: 142, change_pct: 5.50, volume: 17650000, major_net: 22000000, streak: 1 },
        { code: "6442", name: "光聖", industry: "光通訊", close: 78.5, change_pct: 4.80, volume: 13270000, major_net: 9500000, streak: 1 },
      ],
    },
    {
      name: "AI伺服器 / 散熱",
      color: "#f59e0b",
      badges: ["HOT", "FOCUS"],
      reason: "輝達機櫃導入新液冷技術，散熱需求大增帶動族群全面攻頂",
      stocks: [
        { code: "3017", name: "奇鋐", industry: "散熱模組", close: 1945, change_pct: -2.51, volume: 78540000, major_net: 285000000, streak: 3 },
        { code: "3324", name: "雙鴻", industry: "散熱模組", close: 1065, change_pct: 2.40, volume: 29870000, major_net: 420000000, streak: 3 },
        { code: "2421", name: "建準", industry: "散熱風扇", close: 165, change_pct: 8.52, volume: 47830000, major_net: 95000000, streak: 1 },
        { code: "6230", name: "超眾", industry: "散熱模組", close: 238, change_pct: 7.89, volume: 18640000, major_net: 52000000, streak: 1 },
        { code: "8210", name: "勤誠", industry: "機殼", close: 868, change_pct: -2.80, volume: 12350000, major_net: 48000000, streak: 2 },
      ],
    },
    {
      name: "塑化 / 油價地緣政治",
      color: "#22c55e",
      badges: [],
      reason: "油價重回百美元推升原物料漲價，石化族群受惠成本轉嫁效應",
      stocks: [
        { code: "1471", name: "首利", industry: "橡膠", close: 13.05, change_pct: -5.43, volume: 34720000, major_net: 18000000, streak: 1 },
        { code: "1301", name: "台塑", industry: "塑膠", close: 45.05, change_pct: 0.67, volume: 142380000, major_net: 78000000, streak: 1 },
        { code: "1303", name: "南亞", industry: "塑膠", close: 72.3, change_pct: -2.03, volume: 98650000, major_net: 55000000, streak: 1 },
        { code: "1326", name: "台化", industry: "塑膠", close: 42.5, change_pct: 2.45, volume: 73210000, major_net: 38000000, streak: 1 },
      ],
    },
    {
      name: "PCB / CCL基板",
      color: "#06b6d4",
      badges: [],
      reason: "AI伺服器高階PCB需求持續攀升，ABF載板與CCL材料同步受惠",
      stocks: [
        { code: "6274", name: "台燿", industry: "CCL", close: 554, change_pct: 4.33, volume: 27430000, major_net: 32000000, streak: 1 },
        { code: "6213", name: "聯茂", industry: "CCL", close: 192, change_pct: 8.45, volume: 23150000, major_net: 58000000, streak: 1 },
        { code: "2368", name: "金像電", industry: "PCB", close: 78.2, change_pct: 9.97, volume: 49870000, major_net: 42000000, streak: 1 },
      ],
    },
    {
      name: "光通訊 / 矽光子",
      color: "#a855f7",
      badges: [],
      reason: "800G/1.6T光模組升級週期啟動，光通訊族群輪動",
      stocks: [
        { code: "6426", name: "統新", industry: "光通訊", close: 198, change_pct: 4.87, volume: 15640000, major_net: 28000000, streak: 1 },
        { code: "3081", name: "聯亞", industry: "光通訊", close: 365, change_pct: 6.32, volume: 9870000, major_net: 42000000, streak: 1 },
        { code: "4908", name: "前鼎", industry: "光通訊", close: 68.5, change_pct: 9.95, volume: 19230000, major_net: 15000000, streak: 1 },
      ],
    },
    {
      name: "生技 / 醫藥器材",
      color: "#ec4899",
      badges: [],
      reason: "FDA新藥審查利多帶動生技族群表現",
      stocks: [
        { code: "4743", name: "合一", industry: "生技", close: 52, change_pct: -2.44, volume: 57340000, major_net: 152000000, streak: 2 },
        { code: "6446", name: "藥華藥", industry: "生技", close: 620, change_pct: 0.98, volume: 28760000, major_net: 115000000, streak: 1 },
        { code: "6712", name: "長聖", industry: "生技", close: 185, change_pct: 9.97, volume: 18430000, major_net: 42000000, streak: 1 },
      ],
    },
    {
      name: "營建 / 資產",
      color: "#78716c",
      badges: [],
      reason: "都更題材與降息預期帶動營建資產股走強",
      stocks: [
        { code: "2548", name: "華固", industry: "營建", close: 119.5, change_pct: 1.70, volume: 23540000, major_net: 35000000, streak: 1 },
        { code: "2542", name: "興富發", industry: "營建", close: 55.8, change_pct: 8.46, volume: 72310000, major_net: 52000000, streak: 2 },
        { code: "5522", name: "遠雄", industry: "營建", close: 61.5, change_pct: 7.56, volume: 36480000, major_net: 28000000, streak: 1 },
      ],
    },
    {
      name: "IC設計 / AI邊緣運算",
      color: "#14b8a6",
      badges: ["FOCUS"],
      reason: "邊緣AI晶片需求爆發，IC設計族群全面受惠",
      stocks: [
        { code: "5274", name: "信驊", industry: "IC設計", close: 11750, change_pct: 3.52, volume: 5430000, major_net: 245000000, streak: 1 },
        { code: "2379", name: "瑞昱", industry: "IC設計", close: 480.5, change_pct: 2.34, volume: 28750000, major_net: 135000000, streak: 1 },
        { code: "2458", name: "義隆", industry: "IC設計", close: 128, change_pct: -2.29, volume: 38620000, major_net: 55000000, streak: 2 },
        { code: "2401", name: "凌陽", industry: "IC設計", close: 20.45, change_pct: -0.24, volume: 53480000, major_net: 28000000, streak: 1 },
      ],
    },
  ],
};

export default function Home() {
  const [currentDate, setCurrentDate] = useState<string | null>(null);

  const { data: latestData, isLoading: isLatestLoading } = useSWR<DailyData>(
    currentDate ? null : "/api/daily/latest",
    fetcher
  );

  const { data, error, isLoading } = useSWR<DailyData>(
    currentDate ? `/api/daily/${currentDate}` : null,
    fetcher
  );

  const showSkeleton = isLoading || (isLatestLoading && !latestData);

  useEffect(() => {
    if (latestData?.date && !currentDate) {
      setCurrentDate(latestData.date);
    }
  }, [latestData, currentDate]);

  const rawData = currentDate ? data : latestData;
  const displayData = rawData?.groups ? rawData : DEMO_DATA;
  const displayDate = displayData.date;

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
      {showSkeleton ? (
        <div className="h-8 skeleton" />
      ) : displayData?.market_summary ? (
        <TickerBar summary={displayData.market_summary} />
      ) : null}
      <NavBar />
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden animate-fade-in">
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
          {showSkeleton && <Skeleton />}
          {error && !showSkeleton && (
            <div className="text-txt-3 text-sm text-center py-20">此日期無資料</div>
          )}
          {!showSkeleton && displayData && <Highlights data={displayData} />}
          {!showSkeleton && displayData?.groups?.map((group) => (
            <GroupBlock key={group.name} group={group} totalStocks={displayData.groups.reduce((s, g) => s + g.stocks.length, 0)} />
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
