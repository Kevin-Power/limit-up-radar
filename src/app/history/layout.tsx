import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "歷史統計",
  description:
    "台股漲停與族群歷史統計：每日漲停檔數、隔日表現與長期趨勢回顧，個人研究紀錄分享，非投顧、不構成投資建議。",
  alternates: { canonical: "/history" },
};

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
