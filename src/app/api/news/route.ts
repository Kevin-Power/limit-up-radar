import { NextResponse } from "next/server";

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: number; // unix timestamp seconds
  url: string;
  relatedTickers: string[];
  category: string;
  impact: "critical" | "high" | "medium" | "low";
}

// Classify impact by keywords in title
function classifyImpact(title: string): NewsArticle["impact"] {
  const t = title;
  if (/聯準會|Fed|升息|降息|央行|危機|崩盤|暴跌|暴漲/.test(t)) return "critical";
  if (/外資|財報|GDP|通膨|地緣|戰爭|制裁|漲停|大跌|大漲/.test(t)) return "high";
  if (/台積電|輝達|蘋果|三星|訂單|展望|法說/.test(t)) return "medium";
  return "low";
}

// Classify category by keywords
function classifyCategory(title: string): string {
  const t = title;
  if (/聯準會|Fed|央行|利率|貨幣|升息|降息/.test(t)) return "central_bank";
  if (/地緣|戰爭|制裁|紅海|中東|台海|兩岸/.test(t)) return "geopolitics";
  if (/GDP|通膨|CPI|PMI|外銷訂單|失業率|就業/.test(t)) return "economic_data";
  if (/AI|半導體|伺服器|晶片|供應鏈|訂單|財報|法說|產能/.test(t)) return "industry";
  return "sentiment";
}

export async function GET() {
  try {
    // Yahoo Finance search for Taiwan stock market news
    const queries = ["台股漲停", "台積電", "台灣半導體"];
    const seen = new Set<string>();
    const articles: NewsArticle[] = [];

    for (const q of queries) {
      try {
        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&newsCount=10&lang=zh-TW&region=TW`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; bot/1.0)" },
          next: { revalidate: 900 }, // cache 15 min
        });
        if (!res.ok) continue;
        const json = await res.json();
        const news: Array<{
          uuid: string;
          title: string;
          publisher: string;
          link: string;
          providerPublishTime: number;
          type: string;
          relatedTickers?: string[];
          summary?: string;
        }> = json?.news ?? [];

        for (const item of news) {
          if (seen.has(item.uuid)) continue;
          seen.add(item.uuid);
          articles.push({
            id: item.uuid,
            title: item.title,
            summary: item.summary ?? "",
            source: item.publisher,
            publishedAt: item.providerPublishTime,
            url: item.link,
            relatedTickers: item.relatedTickers ?? [],
            category: classifyCategory(item.title),
            impact: classifyImpact(item.title),
          });
        }
      } catch {
        // skip failed query
      }
    }

    // Sort by newest first, limit to 20
    articles.sort((a, b) => b.publishedAt - a.publishedAt);
    const top20 = articles.slice(0, 20);

    return NextResponse.json(top20, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
