import type { Metadata } from "next";
import LearnClient from "./_client";

export const metadata: Metadata = {
  title: "交易教室",
  description: "漲停族群操作法完整教學，從基礎觀念到實戰工作流程。",
  alternates: { canonical: "/learn" },
};

export default function Page() {
  return <LearnClient />;
}
