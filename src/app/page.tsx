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
    taiex_close: 23412.56,
    taiex_change_pct: 1.82,
    total_volume: 384700000000,
    limit_up_count: 32,
    limit_down_count: 3,
    advance: 892,
    decline: 421,
    unchanged: 187,
    foreign_net: 12800000000,
    trust_net: 3400000000,
    dealer_net: 1300000000,
  },
  groups: [
    {
      name: "AI 伺服器 / 散熱",
      color: "#e74c3c",
      badges: ["主流題材", "外資買超"],
      reason: "AI 資本支出持續擴張，散熱需求大增帶動族群全面走強",
      stocks: [
        { code: "3017", name: "奇鋐", industry: "散熱模組", close: 328.5, change_pct: 10.0, volume: 48520000, major_net: 185000000, streak: 2 },
        { code: "6669", name: "緯穎", industry: "伺服器", close: 1985.0, change_pct: 10.0, volume: 12340000, major_net: 420000000, streak: 1 },
        { code: "3152", name: "璟德", industry: "散熱", close: 215.0, change_pct: 10.0, volume: 22150000, major_net: 95000000, streak: 1 },
        { code: "2376", name: "技嘉", industry: "伺服器", close: 378.0, change_pct: 8.52, volume: 35600000, major_net: 210000000, streak: 1 },
      ],
    },
    {
      name: "半導體設備 / 先進封裝",
      color: "#3498db",
      badges: ["法人買超", "技術突破"],
      reason: "先進封裝產能擴建帶動設備股輪動表現",
      stocks: [
        { code: "3037", name: "欣興", industry: "IC載板", close: 218.5, change_pct: 10.0, volume: 38900000, major_net: 310000000, streak: 3 },
        { code: "6274", name: "台燿", industry: "PCB材料", close: 142.0, change_pct: 10.0, volume: 15200000, major_net: 67000000, streak: 1 },
        { code: "3661", name: "世芯-KY", industry: "IC設計", close: 2780.0, change_pct: 7.36, volume: 8750000, major_net: 520000000, streak: 2 },
      ],
    },
    {
      name: "銅箔 / 原物料",
      color: "#e67e22",
      badges: ["漲價題材"],
      reason: "國際銅價創高，銅箔基板報價調漲帶動相關個股表現",
      stocks: [
        { code: "2328", name: "廣宇", industry: "銅箔基板", close: 67.5, change_pct: 10.0, volume: 42100000, major_net: 58000000, streak: 2 },
        { code: "1456", name: "第一銅", industry: "銅製品", close: 34.2, change_pct: 10.0, volume: 55600000, major_net: 32000000, streak: 1 },
        { code: "2062", name: "橋椿", industry: "金屬製品", close: 98.7, change_pct: 8.15, volume: 18700000, major_net: 45000000, streak: 1 },
      ],
    },
    {
      name: "光通訊 / 矽光子",
      color: "#9b59b6",
      badges: ["新技術", "外資關注"],
      reason: "矽光子技術突破帶動光通訊族群資金湧入",
      stocks: [
        { code: "4960", name: "奇美材", industry: "光學膜", close: 89.3, change_pct: 10.0, volume: 28400000, major_net: 120000000, streak: 1 },
        { code: "2393", name: "億光", industry: "光電", close: 58.6, change_pct: 10.0, volume: 31200000, major_net: 78000000, streak: 2 },
        { code: "3714", name: "富采", industry: "LED", close: 42.8, change_pct: 7.54, volume: 25600000, major_net: 35000000, streak: 1 },
        { code: "6209", name: "今國光", industry: "光學鏡頭", close: 76.5, change_pct: 6.98, volume: 12800000, major_net: 22000000, streak: 1 },
      ],
    },
    {
      name: "PCB / CCL 基板",
      color: "#1abc9c",
      badges: ["產業復甦"],
      reason: "PCB 產業進入旺季，CCL 基板需求回溫推升族群走勢",
      stocks: [
        { code: "8046", name: "南電", industry: "PCB", close: 435.0, change_pct: 10.0, volume: 21500000, major_net: 280000000, streak: 1 },
        { code: "2353", name: "宏碁", industry: "PCB", close: 52.3, change_pct: 10.0, volume: 68200000, major_net: 95000000, streak: 1 },
        { code: "3189", name: "景碩", industry: "IC載板", close: 168.0, change_pct: 8.39, volume: 14500000, major_net: 110000000, streak: 2 },
      ],
    },
    {
      name: "IC 設計 / AI 邊緣運算",
      color: "#2ecc71",
      badges: ["AI應用", "成長股"],
      reason: "邊緣運算 AI 晶片需求爆發，帶動 IC 設計族群輪動走高",
      stocks: [
        { code: "3443", name: "創意", industry: "IC設計", close: 1520.0, change_pct: 10.0, volume: 9800000, major_net: 380000000, streak: 2 },
        { code: "5274", name: "信驊", industry: "IC設計", close: 2450.0, change_pct: 9.15, volume: 5600000, major_net: 290000000, streak: 1 },
        { code: "6547", name: "高端疫苗", industry: "IC設計", close: 185.0, change_pct: 7.56, volume: 22100000, major_net: 65000000, streak: 1 },
        { code: "3034", name: "聯詠", industry: "IC設計", close: 538.0, change_pct: 6.75, volume: 18900000, major_net: 155000000, streak: 1 },
        { code: "2454", name: "聯發科", industry: "IC設計", close: 1285.0, change_pct: 5.34, volume: 32500000, major_net: 620000000, streak: 1 },
      ],
    },
    {
      name: "太陽能 / 綠能",
      color: "#f1c40f",
      badges: ["政策利多"],
      reason: "政府綠能政策加碼，太陽能模組需求顯著回升",
      stocks: [
        { code: "6244", name: "茂迪", industry: "太陽能電池", close: 52.1, change_pct: 10.0, volume: 45600000, major_net: 48000000, streak: 1 },
        { code: "3576", name: "聯合再生", industry: "太陽能", close: 18.5, change_pct: 10.0, volume: 82300000, major_net: 36000000, streak: 1 },
        { code: "6443", name: "元晶", industry: "太陽能電池", close: 28.9, change_pct: 8.24, volume: 37800000, major_net: 21000000, streak: 1 },
      ],
    },
    {
      name: "生技 / 醫美器材",
      color: "#e91e63",
      badges: ["營收亮眼"],
      reason: "醫美需求回溫加上新藥進度推進，帶動生技族群表現",
      stocks: [
        { code: "1795", name: "美時", industry: "製藥", close: 285.0, change_pct: 10.0, volume: 16700000, major_net: 130000000, streak: 1 },
        { code: "6548", name: "長佳智能", industry: "醫療器材", close: 198.0, change_pct: 10.0, volume: 11200000, major_net: 85000000, streak: 2 },
        { code: "4147", name: "中裕", industry: "新藥", close: 215.5, change_pct: 7.75, volume: 19500000, major_net: 72000000, streak: 1 },
        { code: "1760", name: "寶齡富錦", industry: "製藥", close: 142.0, change_pct: 6.39, volume: 8900000, major_net: 28000000, streak: 1 },
      ],
    },
    {
      name: "營建 / 資產",
      color: "#795548",
      badges: ["資產題材"],
      reason: "都更政策推動加上商用不動產交易升溫，營建資產股受惠",
      stocks: [
        { code: "2504", name: "國產", industry: "水泥", close: 38.5, change_pct: 10.0, volume: 52300000, major_net: 42000000, streak: 1 },
        { code: "2542", name: "興富發", industry: "營建", close: 68.2, change_pct: 10.0, volume: 38700000, major_net: 88000000, streak: 2 },
        { code: "2548", name: "華固", industry: "營建", close: 118.5, change_pct: 7.27, volume: 14200000, major_net: 55000000, streak: 1 },
      ],
    },
    {
      name: "價值股亮點",
      color: "#607d8b",
      badges: ["高殖利率", "法人回補"],
      reason: "高殖利率個股獲法人回補，價值投資風格回歸",
      stocks: [
        { code: "2412", name: "中華電", industry: "電信", close: 132.5, change_pct: 3.52, volume: 28400000, major_net: 185000000, streak: 3 },
        { code: "9904", name: "寶成", industry: "製鞋", close: 42.8, change_pct: 5.15, volume: 35100000, major_net: 62000000, streak: 1 },
        { code: "1402", name: "遠東新", industry: "紡織", close: 32.6, change_pct: 4.49, volume: 41200000, major_net: 38000000, streak: 1 },
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
