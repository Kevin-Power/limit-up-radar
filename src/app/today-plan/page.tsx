import type { Metadata } from "next";
import TodayPlanClient from "./_client";

export const metadata: Metadata = {
  title: "今日 R1 出場清單",
  description: "把已驗證的 R1 策略前移到今日可執行清單：高分標的的進場與隔日出場規則（研究紀錄，非投資建議）。",
  alternates: { canonical: "/today-plan" },
};

export default function Page() {
  return <TodayPlanClient />;
}
