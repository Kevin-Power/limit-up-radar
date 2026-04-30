import type { Metadata } from "next";
import SopClient from "./_client";

export const metadata: Metadata = {
  title: "操作手冊 SOP",
  description: "明日焦點實戰操作流程 - 從盤後選股到隔日開盤賣出的完整 SOP",
  alternates: { canonical: "/sop" },
};

export default function Page() {
  return <SopClient />;
}
