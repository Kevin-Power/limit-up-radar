import type { Metadata } from "next";
import TrackRecordClient from "./_client";

export const metadata: Metadata = {
  title: "戰績紀錄",
  description:
    "前向戰績閉環：每日收盤後以凍結版本化公式定格「明日焦點」與「當沖觀察」候選，日後用次一交易日真實資料結算、永久累積。明確區分 forward 定格與 backfill 回溯重建。誠實統計工具，非投資建議。",
  alternates: { canonical: "/track-record" },
};

export default function Page() {
  return <TrackRecordClient />;
}
