import type { Metadata } from "next";
import StatsPage from "./_client";

export const metadata: Metadata = {
  title: "族群統計",
  description:
    "台股漲停族群統計分析，呈現各族群漲停頻率、強度排名與歷史趨勢。",
  alternates: { canonical: "/stats" },
  openGraph: {
    title: "族群統計 — 股文觀指",
    description:
      "台股漲停族群統計分析，呈現各族群漲停頻率、強度排名與歷史趨勢。",
    url: "/stats",
  },
};

export default function Page() {
  return <StatsPage />;
}
