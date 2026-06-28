import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "每日盤後報告",
  description:
    "台股每日盤後報告：當日漲停族群分類、市場強弱與隔日觀察重點，個人研究紀錄分享，非投顧、不構成投資建議。",
  alternates: { canonical: "/report" },
};

export default function ReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
