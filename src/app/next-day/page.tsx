import type { Metadata } from "next";
import NextDayPage from "./_client";

export const metadata: Metadata = {
  title: "隔日表現",
  description:
    "追蹤台股漲停股票隔日表現，分析續漲、開高走低、直接跌等走勢分布，協助判斷漲停板隔日操作策略。",
  alternates: { canonical: "/next-day" },
  openGraph: {
    title: "隔日表現 — 漲停雷達",
    description:
      "追蹤台股漲停股票隔日表現，分析續漲、開高走低、直接跌等走勢分布。",
    url: "/next-day",
  },
};

export default function Page() {
  return <NextDayPage />;
}
