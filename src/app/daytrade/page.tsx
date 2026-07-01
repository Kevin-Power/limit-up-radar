import type { Metadata } from "next";
import DaytradeClient from "./_client";

export const metadata: Metadata = {
  title: "當沖速覽",
  description: "以最近一個完整分時收錄交易日為準，依當沖視角（振幅、開盤強度、尾盤位置）排列個股分時型態。分時為盤後收錄、非即時，僅供教育研究，非投資建議。",
  alternates: { canonical: "/daytrade" },
};

export default function Page() {
  return <DaytradeClient />;
}
