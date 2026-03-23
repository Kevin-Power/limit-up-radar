import type { Metadata } from "next";
import "@/styles/globals.css";

const SITE_URL = "https://limit-up-radar.vercel.app";

export const metadata: Metadata = {
  title: {
    default: "漲停雷達 — AI 驅動的台股漲停族群分類平台",
    template: "%s — 漲停雷達",
  },
  description:
    "AI 驅動的台股漲停族群分類與分析平台，提供即時漲停板追蹤、族群歸類、隔日表現統計、策略回測與國際市場動態。",
  keywords: [
    "台股",
    "漲停",
    "族群分類",
    "AI分析",
    "漲停板",
    "漲停雷達",
    "台灣股市",
    "技術分析",
    "策略回測",
    "選股",
    "EMA",
    "隔日沖",
  ],
  authors: [{ name: "漲停雷達" }],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  openGraph: {
    title: "漲停雷達 — AI 驅動的台股漲停族群分類平台",
    description:
      "AI 驅動的台股漲停族群分類與分析平台，提供即時漲停板追蹤、族群歸類、隔日表現統計、策略回測與國際市場動態。",
    url: SITE_URL,
    siteName: "漲停雷達",
    type: "website",
    locale: "zh_TW",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "漲停雷達 — 台股漲停族群分類平台",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "漲停雷達 — AI 驅動的台股漲停族群分類平台",
    description:
      "AI 驅動的台股漲停族群分類與分析平台，提供即時漲停板追蹤、族群歸類、隔日表現統計、策略回測與國際市場動態。",
    images: ["/og-image.svg"],
  },
  icons: {
    icon: "/favicon.svg",
  },
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
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
