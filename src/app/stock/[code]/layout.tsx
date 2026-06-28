import type { Metadata } from "next";
import { loadLatestDaily } from "@/lib/data-files";
import type { DailyData } from "@/lib/types";

const SITE_URL = "https://limit-up-radar.vercel.app";

// Same code shape accepted by the stock API routes (e.g. api/ema/[code]).
const CODE_RE = /^\d{4,6}[A-Z]?$/;

type Props = {
  params: Promise<{ code: string }>;
  children: React.ReactNode;
};

/**
 * Look up a stock's display name from the latest daily snapshot (server-side).
 * Returns null when the code is not present in today's groups, so callers can
 * fall back to the code alone.
 */
function lookupStockName(code: string): string | null {
  const daily = loadLatestDaily<DailyData>();
  if (!daily?.groups) return null;
  for (const g of daily.groups) {
    const found = g.stocks.find((s) => s.code === code);
    if (found) return found.name;
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;

  // Reject malformed codes (do not echo arbitrary input into <title>).
  if (!CODE_RE.test(code)) {
    return { title: "個股", alternates: { canonical: `/stock/${code}` } };
  }

  const name = lookupStockName(code);
  const title = name ? `${code} ${name}` : code;
  const description = name
    ? `${code} ${name} 個股技術面、籌碼面、歷史漲停紀錄與同族群比較，個人研究紀錄分享，非投顧、不構成投資建議。`
    : `${code} 個股技術面、籌碼面、歷史漲停紀錄與同族群比較，個人研究紀錄分享，非投顧、不構成投資建議。`;

  return {
    title,
    description,
    alternates: { canonical: `/stock/${code}` },
    openGraph: {
      title: `${title} — 股文觀指`,
      description,
      url: `${SITE_URL}/stock/${code}`,
      type: "website",
      locale: "zh_TW",
    },
  };
}

export default async function StockLayout({ params, children }: Props) {
  const { code } = await params;
  const valid = CODE_RE.test(code);
  const name = valid ? lookupStockName(code) : null;

  // BreadcrumbList + FinancialProduct structured data. Only emitted for
  // well-formed codes so we never inject unvalidated input into JSON-LD.
  const jsonLd = valid
    ? {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "首頁",
                item: SITE_URL,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: name ? `${code} ${name}` : code,
                item: `${SITE_URL}/stock/${code}`,
              },
            ],
          },
          {
            "@type": "FinancialProduct",
            name: name ? `${code} ${name}` : code,
            category: "Stock",
            url: `${SITE_URL}/stock/${code}`,
          },
        ],
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {children}
    </>
  );
}
