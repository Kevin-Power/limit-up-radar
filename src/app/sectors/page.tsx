import type { Metadata } from "next";
import SectorsClient from "./_client";

export const metadata: Metadata = {
  title: "今日族群強弱榜",
  description: "依今日漲停股聚合各族群的檔數、平均漲幅、主力資金集中度與趨勢天數，量化族群強弱排名。",
  alternates: { canonical: "/sectors" },
};

export default function Page() {
  return <SectorsClient />;
}
