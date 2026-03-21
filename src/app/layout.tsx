import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "漲停雷達",
  description: "台股漲停族群分類與分析平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
