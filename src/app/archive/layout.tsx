import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "報告存檔",
  description:
    "台股每日盤後報告歷史存檔：回顧過往漲停族群分類與市場紀錄，個人研究紀錄分享，非投顧、不構成投資建議。",
  alternates: { canonical: "/archive" },
};

export default function ArchiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
