import type { Metadata } from "next";

const TITLE = "股文觀指 — 台股漲停族群資料庫｜大師專區";
const DESCRIPTION =
  "公開、可稽核的台股漲停族群資料庫：AI 族群分類、隔日 OHLC 行為統計、四套策略回測與 14 大國際指數追蹤。個人研究紀錄分享，非投顧、未收費、不構成投資建議。";

export const metadata: Metadata = {
  // absolute 跳過 root layout 的 title.template（"%s — 股文觀指"），避免重複後綴
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/landing" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/landing",
    siteName: "股文觀指",
    type: "website",
    locale: "zh_TW",
    // og:image 由 file convention（src/app/opengraph-image.tsx）自動繼承
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
