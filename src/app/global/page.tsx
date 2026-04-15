import type { Metadata } from "next";
import GlobalPage from "./_client";

export const metadata: Metadata = {
  title: "國際市場",
  description:
    "國際股市與商品市場即時動態，追蹤美股、日股、歐股及原物料行情對台股的影響。",
  alternates: { canonical: "/global" },
  openGraph: {
    title: "國際市場 — 股文觀指",
    description:
      "國際股市與商品市場即時動態，追蹤全球行情對台股的影響。",
    url: "/global",
  },
};

export default function Page() {
  return <GlobalPage />;
}
