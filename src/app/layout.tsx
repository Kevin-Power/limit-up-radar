import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "漲停雷達",
  description: "台股漲停族群分類與分析平台",
  openGraph: {
    title: "漲停雷達",
    description: "台股漲停族群分類與分析平台",
    type: "website",
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
    <html lang="zh-TW">
      <head>
        <meta name="theme-color" content="#07080c" />
        <meta name="color-scheme" content="dark" />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
