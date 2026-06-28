import type { Metadata } from "next";
import AdvancedClient from "./_client";

export const metadata: Metadata = {
  title: "進階教室",
  description: "進階交易工具教學。首發主題：選擇權精華——權利金、Call/Put、Greeks、避險與風控，以教育角度說明，非投資建議。",
  alternates: { canonical: "/advanced" },
};

export default function Page() {
  return <AdvancedClient />;
}
