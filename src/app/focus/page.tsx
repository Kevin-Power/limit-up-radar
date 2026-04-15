import type { Metadata } from "next";
import FocusClient from "./_client";

export const metadata: Metadata = {
  title: "明日焦點",
  description: "根據族群趨勢、營收、籌碼、技術面交叉篩選，推薦明日值得追蹤的股票。",
  alternates: { canonical: "/focus" },
};

export default function Page() {
  return <FocusClient />;
}
