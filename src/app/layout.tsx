import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const SITE_URL = "https://limit-up-radar.vercel.app";

export const metadata: Metadata = {
  title: {
    default: "股文觀指 — AI 驅動的台股漲停族群分類平台",
    template: "%s — 股文觀指",
  },
  description:
    "AI 驅動的台股漲停族群分類與分析平台，提供即時漲停板追蹤、族群歸類、隔日表現統計、策略回測與國際市場動態。",
  keywords: [
    "台股",
    "漲停",
    "族群分類",
    "AI分析",
    "漲停板",
    "股文觀指",
    "台灣股市",
    "技術分析",
    "策略回測",
    "選股",
    "EMA",
    "隔日沖",
  ],
  authors: [{ name: "股文觀指" }],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  openGraph: {
    title: "股文觀指 — AI 驅動的台股漲停族群分類平台",
    description:
      "AI 驅動的台股漲停族群分類與分析平台，提供即時漲停板追蹤、族群歸類、隔日表現統計、策略回測與國際市場動態。",
    url: SITE_URL,
    siteName: "股文觀指",
    type: "website",
    locale: "zh_TW",
    // og:image 由 file convention（src/app/opengraph-image.tsx）自動產生 1200x630 PNG
  },
  twitter: {
    card: "summary_large_image",
    title: "股文觀指 — AI 驅動的台股漲停族群分類平台",
    description:
      "AI 驅動的台股漲停族群分類與分析平台，提供即時漲停板追蹤、族群歸類、隔日表現統計、策略回測與國際市場動態。",
    // twitter:image 由 file convention（opengraph-image）自動產生
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#07080c" />
        <meta name="color-scheme" content="dark light" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="股文觀指" />
        {/* apple-touch-icon is generated as PNG by src/app/apple-icon.tsx (next/og) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "股文觀指",
              description: "AI 驅動的台股漲停族群分類平台",
              url: "https://limit-up-radar.vercel.app",
              applicationCategory: "FinanceApplication",
              operatingSystem: "Web",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "TWD",
              },
            }),
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-bg-1 focus:text-txt-0 focus:border focus:border-border focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-red"
        >
          跳至主要內容
        </a>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
