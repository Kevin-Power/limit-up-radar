import type { Metadata } from "next";
import PonyPage from "./_client";

export const metadata: Metadata = {
  title: "快樂小馬 EMA 策略",
  description:
    "快樂小馬 EMA 均線策略分析，透過 EMA 交叉訊號篩選台股潛力標的，提供買賣時機判斷。",
  alternates: { canonical: "/pony" },
  openGraph: {
    title: "快樂小馬 EMA 策略 — 漲停雷達",
    description:
      "快樂小馬 EMA 均線策略分析，透過 EMA 交叉訊號篩選台股潛力標的。",
    url: "/pony",
  },
};

export default function Page() {
  return <PonyPage />;
}
