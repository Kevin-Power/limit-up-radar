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
        { code: "2007", name: "燁興", industry: "鋼鐵", close: 8.63, change_pct: 9.94, volume: 29180000, major_net: 15000000, streak: 1 },
        { code: "2014", name: "中鴻", industry: "鋼鐵", close: 19.6, change_pct: 9.80, volume: 248310000, major_net: 82000000, streak: 2 },
        { code: "2025", name: "千興", industry: "不鏽鋼", close: 11.6, change_pct: 9.95, volume: 5460000, major_net: 8000000, streak: 1 },
        { code: "2032", name: "新鋼", industry: "不鏽鋼", close: 16.9, change_pct: 9.74, volume: 28200000, major_net: 12000000, streak: 1 },
        { code: "2013", name: "中鋼構", industry: "鋼構", close: 42.5, change_pct: 9.97, volume: 31500000, major_net: 35000000, streak: 2 },
        { code: "2012", name: "春雨", industry: "鋼鐵", close: 28.35, change_pct: 9.88, volume: 52000000, major_net: 28000000, streak: 1 },
      ],
    },
    {
      name: "半導體測試 / 先進封裝",
      color: "#3b82f6",
      badges: ["FOCUS"],
      reason: "穎崴漲停再創歷史新高，AI晶片先進封裝需求帶動測試介面與設備族群全面走強",
      stocks: [
        { code: "6515", name: "穎崴", industry: "半導體設備", close: 7930, change_pct: 9.99, volume: 12050000, major_net: 520000000, streak: 3 },
        { code: "6223", name: "旺矽", industry: "半導體設備", close: 3860, change_pct: 5.32, volume: 9800000, major_net: 185000000, streak: 1 },
        { code: "7795", name: "長廣", industry: "半導體設備", close: 435, change_pct: 9.99, volume: 24880000, major_net: 68000000, streak: 2 },
        { code: "6683", name: "雍智", industry: "IC設計", close: 312, change_pct: 9.89, volume: 18760000, major_net: 42000000, streak: 1 },
      ],
    },
    {
      name: "矽光子 / 高速傳輸",
      color: "#8b5cf6",
      badges: ["NEW"],
      reason: "矽光子技術突破帶動高速傳輸需求，資金積極卡位AI網通相關題材",
      stocks: [
        { code: "4977", name: "眾達-KY", industry: "光通訊", close: 285, change_pct: 10.00, volume: 34200000, major_net: 95000000, streak: 2 },
        { code: "3363", name: "上詮", industry: "光通訊", close: 178, change_pct: 10.00, volume: 45600000, major_net: 72000000, streak: 1 },
        { code: "4979", name: "華星光", industry: "光通訊", close: 245, change_pct: 5.50, volume: 21000000, major_net: 38000000, streak: 1 },
        { code: "6442", name: "光聖", industry: "光通訊", close: 89.5, change_pct: 4.80, volume: 16800000, major_net: 18000000, streak: 1 },
      ],
    },
    {
      name: "AI伺服器 / 散熱",
      color: "#f59e0b",
      badges: ["HOT", "FOCUS"],
      reason: "輝達機櫃導入新液冷技術，散熱需求大增帶動族群全面攻頂",
      stocks: [
        { code: "3017", name: "奇鋐", industry: "散熱模組", close: 329, change_pct: 10.00, volume: 86310000, major_net: 320000000, streak: 3 },
        { code: "3324", name: "雙鴻", industry: "散熱模組", close: 1065, change_pct: 10.00, volume: 32400000, major_net: 480000000, streak: 3 },
        { code: "2421", name: "建準", industry: "散熱風扇", close: 168, change_pct: 8.52, volume: 54000000, major_net: 125000000, streak: 1 },
        { code: "6230", name: "超眾", industry: "散熱模組", close: 245, change_pct: 7.89, volume: 21000000, major_net: 65000000, streak: 1 },
        { code: "8210", name: "勤誠", industry: "機殼", close: 289, change_pct: 10.00, volume: 15600000, major_net: 58000000, streak: 2 },
      ],
    },
    {
      name: "塑化 / 油價地緣政治",
      color: "#22c55e",
      badges: [],
      reason: "油價重回百美元推升原物料漲價，石化族群受惠成本轉嫁效應",
      stocks: [
        { code: "1471", name: "首利", industry: "橡膠", close: 13.95, change_pct: 9.84, volume: 40050000, major_net: 22000000, streak: 1 },
        { code: "1301", name: "台塑", industry: "塑膠", close: 42.8, change_pct: 3.25, volume: 185000000, major_net: 95000000, streak: 1 },
        { code: "1303", name: "南亞", industry: "塑膠", close: 38.5, change_pct: 2.89, volume: 123000000, major_net: 68000000, streak: 1 },
        { code: "1326", name: "台化", industry: "塑膠", close: 35.2, change_pct: 2.45, volume: 89000000, major_net: 42000000, streak: 1 },
      ],
    },
    {
      name: "PCB / CCL基板",
      color: "#06b6d4",
      badges: [],
      reason: "AI伺服器高階PCB需求持續攀升，ABF載板與CCL材料同步受惠",
      stocks: [
        { code: "6274", name: "台燿", industry: "CCL", close: 142, change_pct: 10.00, volume: 32000000, major_net: 67000000, streak: 1 },
        { code: "6213", name: "聯茂", industry: "CCL", close: 198, change_pct: 8.45, volume: 28000000, major_net: 85000000, streak: 1 },
        { code: "2368", name: "金像電", industry: "PCB", close: 76.5, change_pct: 9.97, volume: 56000000, major_net: 48000000, streak: 1 },
      ],
    },
    {
      name: "光通訊 / 矽光子",
      color: "#a855f7",
      badges: [],
      reason: "800G/1.6T光模組升級週期啟動，光通訊族群輪動",
      stocks: [
        { code: "6426", name: "統新", industry: "光通訊", close: 215, change_pct: 4.87, volume: 18900000, major_net: 32000000, streak: 1 },
        { code: "3081", name: "聯亞", industry: "光通訊", close: 385, change_pct: 6.32, volume: 12000000, major_net: 55000000, streak: 1 },
        { code: "4908", name: "前鼎", industry: "光通訊", close: 67.8, change_pct: 9.95, volume: 23400000, major_net: 28000000, streak: 1 },
      ],
    },
    {
      name: "生技 / 醫藥器材",
      color: "#ec4899",
      badges: [],
      reason: "FDA新藥審查利多帶動生技族群表現",
      stocks: [
        { code: "4743", name: "合一", industry: "生技", close: 328, change_pct: 10.00, volume: 65000000, major_net: 180000000, streak: 2 },
        { code: "6446", name: "藥華藥", industry: "生技", close: 485, change_pct: 7.23, volume: 32000000, major_net: 125000000, streak: 1 },
        { code: "6712", name: "長聖", industry: "生技", close: 198, change_pct: 9.97, volume: 21000000, major_net: 58000000, streak: 1 },
      ],
    },
    {
      name: "營建 / 資產",
      color: "#78716c",
      badges: [],
      reason: "都更題材與降息預期帶動營建資產股走強",
      stocks: [
        { code: "2548", name: "華固", industry: "營建", close: 128, change_pct: 9.95, volume: 28000000, major_net: 62000000, streak: 1 },
        { code: "2542", name: "興富發", industry: "營建", close: 56.3, change_pct: 8.46, volume: 89000000, major_net: 95000000, streak: 2 },
        { code: "5522", name: "遠雄", industry: "營建", close: 62.8, change_pct: 7.56, volume: 42000000, major_net: 48000000, streak: 1 },
      ],
    },
    {
      name: "IC設計 / AI邊緣運算",
      color: "#14b8a6",
      badges: ["FOCUS"],
      reason: "邊緣AI晶片需求爆發，IC設計族群全面受惠",
      stocks: [
        { code: "5274", name: "信驊", industry: "IC設計", close: 2890, change_pct: 6.78, volume: 8900000, major_net: 290000000, streak: 1 },
        { code: "2379", name: "瑞昱", industry: "IC設計", close: 485, change_pct: 5.43, volume: 34000000, major_net: 155000000, streak: 1 },
        { code: "2458", name: "義隆", industry: "IC設計", close: 142, change_pct: 9.92, volume: 45000000, major_net: 72000000, streak: 2 },
        { code: "2401", name: "凌陽", industry: "IC設計", close: 38.5, change_pct: 9.87, volume: 62000000, major_net: 35000000, streak: 1 },
      ],
    },
  ],
};

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
      {displayData?.market_summary && (
        <TickerBar summary={displayData.market_summary} />
      )}
      <NavBar />
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
