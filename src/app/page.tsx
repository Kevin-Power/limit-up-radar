"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DailyData, Stock } from "@/lib/types";
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
  const { watchlist, toggle: toggleWatch, isWatched, count: watchlistCount } = useWatchlist();
  const [watchlistCollapsed, setWatchlistCollapsed] = useState(false);

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

  const router = useRouter();
  const NAV_ROUTES = ["/", "/next-day", "/pony", "/backtest", "/screener", "/global", "/news", "/report", "/stats"];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      if (e.key === "ArrowLeft" && displayDate) {
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

          {/* Watchlist / 自選股 Section */}
          {!showSkeleton && watchlistCount > 0 && (() => {
            const watchedStocks = allStocks.filter(s => isWatched(s.code));
            if (watchedStocks.length === 0) return null;
            return (
              <div className="mb-4">
                <div
                  className="flex items-center gap-2 mb-3 cursor-pointer select-none"
                  onClick={() => setWatchlistCollapsed(!watchlistCollapsed)}
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
            <SidePanel data={displayData} />
          </div>
        )}
      </div>
      <BackToTop />
      <KeyboardHelp />
    </div>
  );
}
