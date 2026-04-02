"use client";

import { useState, useMemo, useEffect } from "react";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { getTodayString } from "@/lib/utils";
import type { NewsArticle } from "@/app/api/news/route";


function timeAgoFromTimestamp(ts: number): string {
  const diffMs = Date.now() - ts * 1000;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  const days = Math.floor(hrs / 24);
  return `${days} 天前`;
}

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
   CONSTANTS
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

/* ================================================================
   MAIN PAGE
   ================================================================ */

export default function NewsPage() {
  const [category, setCategory] = useState<Category | "all">("all");
  const [impactFilter, setImpactFilter] = useState<ImpactLevel | "all">("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);

  const [realNews, setRealNews] = useState<NewsArticle[] | null>(null);

  useEffect(() => {
    fetch("/api/news", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: NewsArticle[]) => setRealNews(d))
      .catch(() => setRealNews([]));
  }, []);

  const NEWS: NewsItem[] = useMemo(() => {
    if (realNews && realNews.length > 0) {
      return realNews.map((a) => ({
        id: a.id ? parseInt(a.id.replace(/\D/g, "").slice(0, 9)) || Math.random() * 1e9 : Math.random() * 1e9,
        title: a.title,
        summary: a.summary || a.title,
        source: a.source,
        timeAgo: timeAgoFromTimestamp(a.publishedAt),
        impact: a.impact,
        category: (a.category as Category) || "industry",
        relatedStocks: (a.relatedTickers ?? []).slice(0, 3).map((t) => ({ code: t, name: t })),
        markets: ["台股"],
      }));
    }
    return [];
  }, [realNews]);

  const isReal = !!(realNews && realNews.length > 0);

  const filtered = NEWS.filter((n) => {
    if (category !== "all" && n.category !== category) return false;
    if (impactFilter !== "all" && n.impact !== impactFilter) return false;
    if (activeTag && !n.title.includes(activeTag) && !n.relatedStocks.some((s) => s.name.includes(activeTag))) {
      return false;
    }
    return true;
  });

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1 animate-fade-in">
      <TopNav currentDate={getTodayString()} />
      <NavBar />

      <main className="max-w-4xl mx-auto px-4 pt-20 pb-16 space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-txt-0 tracking-tight">市場情資</h1>
            {isReal && <span className="px-1.5 py-0.5 text-[9px] font-bold bg-green/15 text-green rounded">LIVE</span>}
          </div>
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
          {visible.length === 0 && !realNews && (
            <div className="text-center py-12 text-txt-3 text-sm">載入新聞中...</div>
          )}
          {visible.length === 0 && realNews && realNews.length === 0 && (
            <div className="text-center py-12 text-txt-3 text-sm">暫無新聞資料</div>
          )}
          {visible.length === 0 && realNews && realNews.length > 0 && (
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
      <Footer />
    </div>
  );
}
