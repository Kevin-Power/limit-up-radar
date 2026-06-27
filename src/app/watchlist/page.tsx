import type { Metadata } from "next";
import WatchlistClient from "./_client";

export const metadata: Metadata = {
  title: "自選股",
  description: "自選股清單與損益日誌：現價、今日漲跌、EMA 訊號、是否在今日精選、自加入報酬與命中率。",
  alternates: { canonical: "/watchlist" },
};

export default function Page() {
  return <WatchlistClient />;
}
