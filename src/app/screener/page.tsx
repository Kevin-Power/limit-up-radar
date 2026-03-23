import type { Metadata } from "next";
import ScreenerPage from "./_client";

export const metadata: Metadata = {
  title: "智慧選股",
  description:
    "多維度台股智慧選股工具，依價值、成長、技術面與動能篩選潛力標的。",
  alternates: { canonical: "/screener" },
  openGraph: {
    title: "智慧選股 — 漲停雷達",
    description:
      "多維度台股智慧選股工具，依價值、成長、技術面與動能篩選潛力標的。",
    url: "/screener",
  },
};

export default function Page() {
  return <ScreenerPage />;
}
