"use client";

import { useState } from "react";
import TopNav from "@/components/TopNav";
import { formatPct, formatPrice } from "@/lib/utils";

/* ================================================================
   TYPES
   ================================================================ */

type ImpactLevel = "critical" | "high" | "medium" | "low";
type Category = "all" | "central_bank" | "geopolitics" | "economic_data" | "industry" | "sentiment";

interface NewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  timeAgo: string;
  impact: ImpactLevel;
  category: Category;
  relatedStocks: { code: string; name: string }[];
  markets: string[];
}

/* ================================================================
   MOCK DATA
   ================================================================ */

const CATEGORY_LABELS: Record<Category, string> = {
  all: "全部",
  central_bank: "央行政策",
  geopolitics: "地緣政治",
  economic_data: "經濟數據",
  industry: "產業動態",
  sentiment: "市場情緒",
};

const IMPACT_LABELS: Record<ImpactLevel, string> = {
  critical: "重大",
  high: "高",
  medium: "中",
  low: "低",
};

const IMPACT_COLORS: Record<ImpactLevel, string> = {
  critical: "bg-red text-white",
  high: "bg-amber text-white",
  medium: "bg-blue text-white",
  low: "bg-bg-3 text-txt-3",
};

const CATEGORY_BADGE_COLORS: Record<Category, string> = {
  all: "bg-bg-3 text-txt-3",
  central_bank: "bg-red/15 text-red",
  geopolitics: "bg-amber/15 text-amber",
  economic_data: "bg-blue/15 text-blue",
  industry: "bg-green/15 text-green",
  sentiment: "bg-accent/15 text-accent",
};

const TRENDING_TAGS = [
  "AI伺服器", "Fed升息", "台積電", "地緣風險", "輝達財報",
  "日圓貶值", "半導體設備", "通膨數據", "外資回補", "庫存回補",
];

const MOCK_NEWS: NewsItem[] = [
  {
    id: 1,
    title: "Fed維持利率不變 暗示年內僅降息一碼 市場反應分歧",
    summary: "聯準會3月決議維持利率於5.25-5.50%區間不變，點陣圖顯示今年可能僅降息一次，低於市場預期的兩次，美債殖利率應聲走揚。",
    source: "Reuters",
    timeAgo: "2小時前",
    impact: "critical",
    category: "central_bank",
    relatedStocks: [{ code: "2881", name: "富邦金" }, { code: "2882", name: "國泰金" }],
    markets: ["美股", "台股", "匯率"],
  },
  {
    id: 2,
    title: "輝達推出新一代Blackwell Ultra架構 台系供應鏈全面受惠",
    summary: "輝達宣布Blackwell Ultra GPU將於Q3量產，單晶片運算效能提升40%，台積電CoWoS產能持續吃緊，相關散熱與封裝供應鏈訂單能見度拉高。",
    source: "Bloomberg",
    timeAgo: "3小時前",
    impact: "critical",
    category: "industry",
    relatedStocks: [{ code: "2330", name: "台積電" }, { code: "3661", name: "世芯-KY" }, { code: "6669", name: "緯穎" }],
    markets: ["台股", "美股"],
  },
  {
    id: 3,
    title: "台灣2月外銷訂單年增32% 連續第五個月正成長",
    summary: "經濟部公布2月外銷訂單金額達485億美元，年增32.1%，其中資通訊產品訂單年增45%，電子產品訂單年增28%，優於市場預期。",
    source: "經濟日報",
    timeAgo: "4小時前",
    impact: "high",
    category: "economic_data",
    relatedStocks: [{ code: "2317", name: "鴻海" }, { code: "2382", name: "廣達" }],
    markets: ["台股"],
  },
  {
    id: 4,
    title: "日本央行暗示4月可能再次升息 日圓急升至148",
    summary: "日本央行總裁植田和男表示通膨持續朝目標邁進，市場解讀為4月升息機率大增，日圓兌美元急升，出口類股承壓。",
    source: "Nikkei",
    timeAgo: "5小時前",
    impact: "high",
    category: "central_bank",
    relatedStocks: [],
    markets: ["日股", "匯率", "台股"],
  },
  {
    id: 5,
    title: "中東局勢升溫 布蘭特原油突破90美元關卡",
    summary: "紅海航運持續受到攻擊威脅，加上OPEC+延長減產協議，布蘭特原油價格突破每桶90美元，航運與塑化類股走揚。",
    source: "CNBC",
    timeAgo: "6小時前",
    impact: "high",
    category: "geopolitics",
    relatedStocks: [{ code: "2603", name: "長榮" }, { code: "2615", name: "萬海" }],
    markets: ["原油", "台股", "航運"],
  },
  {
    id: 6,
    title: "外資連三日買超台股逾500億 鎖定AI與半導體族群",
    summary: "外資法人連續三個交易日大舉買超台股，累計買超金額突破500億元，主要集中在台積電、聯發科等AI相關權值股。",
    source: "工商時報",
    timeAgo: "7小時前",
    impact: "medium",
    category: "sentiment",
    relatedStocks: [{ code: "2330", name: "台積電" }, { code: "2454", name: "聯發科" }],
    markets: ["台股"],
  },
  {
    id: 7,
    title: "台灣央行意外升息半碼 房貸族壓力增加",
    summary: "台灣央行3月理監事會議決議升息半碼至2.125%，為連續第六次升息，同時上調存準率，營建與金融類股波動加大。",
    source: "中央社",
    timeAgo: "8小時前",
    impact: "critical",
    category: "central_bank",
    relatedStocks: [{ code: "2891", name: "中信金" }, { code: "2912", name: "統一超" }],
    markets: ["台股", "房市"],
  },
  {
    id: 8,
    title: "蘋果Vision Pro二代傳Q4量產 光學鏡頭供應鏈啟動",
    summary: "供應鏈消息指出蘋果Vision Pro二代將於今年Q4開始量產，Micro OLED與Pancake光學鏡頭需求大增，相關供應商營收可期。",
    source: "DigiTimes",
    timeAgo: "9小時前",
    impact: "medium",
    category: "industry",
    relatedStocks: [{ code: "3008", name: "大立光" }, { code: "2474", name: "可成" }],
    markets: ["台股", "蘋果供應鏈"],
  },
  {
    id: 9,
    title: "美國3月CPI年增3.5% 高於預期 降息時程恐再延後",
    summary: "美國勞工部公布3月消費者物價指數年增3.5%，核心CPI年增3.8%，雙雙高於市場預期，聯準會降息時間表可能進一步推遲。",
    source: "Reuters",
    timeAgo: "10小時前",
    impact: "high",
    category: "economic_data",
    relatedStocks: [],
    markets: ["美股", "債市", "台股"],
  },
  {
    id: 10,
    title: "PCB產業庫存回補需求湧現 三大廠Q2營收看增兩成",
    summary: "隨著AI伺服器與智慧型手機需求回溫，PCB產業庫存回補動能強勁，欣興、南電、景碩等龍頭廠Q2營收預估季增15-25%。",
    source: "MoneyDJ",
    timeAgo: "11小時前",
    impact: "medium",
    category: "industry",
    relatedStocks: [{ code: "3037", name: "欣興" }, { code: "8046", name: "南電" }],
    markets: ["台股"],
  },
  {
    id: 11,
    title: "融資餘額創近三年新高 散戶槓桿操作升溫引關注",
    summary: "台股融資餘額突破2,800億元，創下近三年新高水準，市場擔憂散戶過度槓桿操作恐成為未來修正的潛在風險。",
    source: "自由財經",
    timeAgo: "12小時前",
    impact: "medium",
    category: "sentiment",
    relatedStocks: [],
    markets: ["台股"],
  },
  {
    id: 12,
    title: "電動車銷量持續放緩 特斯拉下調全球售價因應競爭",
    summary: "全球電動車銷量成長放緩至年增12%，特斯拉宣布在多個市場下調售價以刺激需求，台灣電動車供應鏈相關個股短線承壓。",
    source: "Bloomberg",
    timeAgo: "1天前",
    impact: "low",
    category: "industry",
    relatedStocks: [{ code: "2308", name: "台達電" }, { code: "6488", name: "環球晶" }],
    markets: ["美股", "台股"],
  },
];

/* ================================================================
   MAIN PAGE
   ================================================================ */

export default function NewsPage() {
  const [category, setCategory] = useState<Category | "all">("all");
  const [impactFilter, setImpactFilter] = useState<ImpactLevel | "all">("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);

  const filtered = MOCK_NEWS.filter((n) => {
    if (category !== "all" && n.category !== category) return false;
    if (impactFilter !== "all" && n.impact !== impactFilter) return false;
    if (activeTag && !n.title.includes(activeTag) && !n.relatedStocks.some((s) => s.name.includes(activeTag))) {
      return false;
    }
    return true;
  });

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1">
      <TopNav />

      <main className="max-w-4xl mx-auto px-4 pt-20 pb-16 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-0 tracking-tight">市場情資</h1>
          <p className="text-xs text-txt-3 mt-1">全球財經新聞與台股相關情報</p>
        </div>

        {/* Filter Bar */}
        <div className="bg-bg-1 border border-border rounded-lg p-4 space-y-3">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1">
            {(Object.keys(CATEGORY_LABELS) as (Category | "all")[]).map((cat) => (
              <button
                key={cat}
                onClick={() => { setCategory(cat); setVisibleCount(8); }}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  category === cat
                    ? "bg-red text-white"
                    : "bg-bg-2 text-txt-3 hover:text-txt-1"
                }`}
              >
                {CATEGORY_LABELS[cat as Category] ?? "全部"}
              </button>
            ))}
          </div>

          {/* Impact Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-txt-4">影響程度:</span>
            <button
              onClick={() => setImpactFilter("all")}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                impactFilter === "all" ? "bg-accent text-white" : "bg-bg-2 text-txt-3 hover:text-txt-1"
              }`}
            >
              全部
            </button>
            {(Object.keys(IMPACT_LABELS) as ImpactLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => { setImpactFilter(level); setVisibleCount(8); }}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  impactFilter === level ? IMPACT_COLORS[level] : "bg-bg-2 text-txt-3 hover:text-txt-1"
                }`}
              >
                {IMPACT_LABELS[level]}
              </button>
            ))}
          </div>
        </div>

        {/* Trending Tags */}
        <div className="flex flex-wrap gap-2">
          {TRENDING_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => { setActiveTag(activeTag === tag ? null : tag); setVisibleCount(8); }}
              className={`px-3 py-1 text-[10px] rounded-full font-medium transition-colors ${
                activeTag === tag
                  ? "bg-accent text-white"
                  : "bg-bg-1 border border-border text-txt-3 hover:text-txt-1 hover:border-accent/50"
              }`}
            >
              # {tag}
            </button>
          ))}
        </div>

        {/* News Cards */}
        <div className="space-y-3">
          {visible.length === 0 && (
            <div className="text-center text-txt-4 text-xs py-12">無符合條件的新聞</div>
          )}
          {visible.map((news) => (
            <article
              key={news.id}
              className="bg-bg-1 border border-border rounded-lg p-4 hover:border-accent/30 transition-colors"
            >
              {/* Top badges */}
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${IMPACT_COLORS[news.impact]}`}>
                  {IMPACT_LABELS[news.impact]}
                </span>
                <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${CATEGORY_BADGE_COLORS[news.category]}`}>
                  {CATEGORY_LABELS[news.category]}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-sm font-semibold text-txt-0 leading-snug mb-1.5 line-clamp-1">
                {news.title}
              </h3>

              {/* Summary */}
              <p className="text-xs text-txt-2 leading-relaxed mb-3 line-clamp-2">
                {news.summary}
              </p>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px]">
                {/* Source + time */}
                <span className="text-txt-4">
                  {news.source} - {news.timeAgo}
                </span>

                {/* Related stocks */}
                {news.relatedStocks.length > 0 && (
                  <div className="flex items-center gap-1">
                    {news.relatedStocks.map((s) => (
                      <span
                        key={s.code}
                        className="px-1.5 py-0.5 bg-red/10 text-red rounded text-[9px] font-mono"
                      >
                        {s.code} {s.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Affected markets */}
                <div className="flex items-center gap-1">
                  {news.markets.map((m) => (
                    <span key={m} className="px-1.5 py-0.5 bg-bg-3 text-txt-4 rounded text-[9px]">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Load More */}
        {visibleCount < filtered.length && (
          <div className="text-center pt-2">
            <button
              onClick={() => setVisibleCount((c) => c + 8)}
              className="px-6 py-2 bg-bg-1 border border-border text-txt-2 text-xs rounded-lg hover:bg-bg-2 transition-colors"
            >
              載入更多
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
