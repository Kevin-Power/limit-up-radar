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

function classifyImpact(title: string): NewsArticle["impact"] {
  if (/聯準會|Fed|升息|降息|央行|危機|崩盤|暴跌|暴漲|大跌|大漲/.test(title)) return "critical";
  if (/外資|財報|GDP|通膨|地緣|戰爭|制裁|漲停|跌停|千億/.test(title)) return "high";
  if (/台積電|輝達|蘋果|三星|訂單|展望|法說|季報/.test(title)) return "medium";
  return "low";
}

function classifyCategory(title: string): string {
  if (/聯準會|Fed|央行|利率|貨幣|升息|降息/.test(title)) return "central_bank";
  if (/地緣|戰爭|制裁|紅海|中東|台海|兩岸|關稅/.test(title)) return "geopolitics";
  if (/GDP|通膨|CPI|PMI|外銷訂單|失業率|就業|經濟數據/.test(title)) return "economic_data";
  if (/AI|半導體|伺服器|晶片|供應鏈|訂單|財報|法說|產能|漲停/.test(title)) return "industry";
  return "sentiment";
}

function parseRssDate(dateStr: string): number {
  try {
    return Math.floor(new Date(dateStr).getTime() / 1000);
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

function stripCdata(s: string): string {
  // Remove CDATA wrappers without /s flag for ES2017 compat
  return s.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => m.slice(9, m.length - 3)).trim();
}

async function fetchGoogleNewsRss(query: string): Promise<NewsArticle[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; newsbot/1.0)" },
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];
  const xml = await res.text();

  const articles: NewsArticle[] = [];
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

  for (const match of itemMatches as RegExpExecArray[]) {
    const item = match[1];
    const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
    const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);
    const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const descMatch = item.match(/<description>([\s\S]*?)<\/description>/);

    if (!titleMatch) continue;

    const rawTitle = stripCdata(titleMatch[1]);
    // Google News appends " - Source" to titles; strip it
    const title = rawTitle.replace(/\s*-\s*[^-]+$/, "").trim() || rawTitle;
    const source = sourceMatch ? stripCdata(sourceMatch[1]) : "新聞";
    const link = linkMatch ? stripCdata(linkMatch[1]).trim() : "";
    const pubDate = pubDateMatch ? parseRssDate(pubDateMatch[1]) : Math.floor(Date.now() / 1000);
    const desc = descMatch ? stripCdata(descMatch[1]).replace(/<[^>]+>/g, "").trim() : "";

    // Use description as summary if it has content beyond title
    const summary = desc.length > title.length ? desc.slice(0, 120) : "";

    articles.push({
      id: link || `${pubDate}-${title.slice(0, 10)}`,
      title,
      summary,
      source,
      publishedAt: pubDate,
      url: link,
      relatedTickers: [],
      category: classifyCategory(title),
      impact: classifyImpact(title),
    });
  }

  return articles;
}

export async function GET() {
  try {
    const queries = ["台股 漲停", "台灣股市 大盤", "台積電 半導體"];
    const seen = new Set<string>();
    const articles: NewsArticle[] = [];

    const results = await Promise.allSettled(queries.map(fetchGoogleNewsRss));

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const a of result.value) {
        const key = a.title.slice(0, 30);
        if (seen.has(key)) continue;
        seen.add(key);
        articles.push(a);
      }
    }

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
