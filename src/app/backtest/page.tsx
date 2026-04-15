import type { Metadata } from "next";
import BacktestPage from "./_client";

export const metadata: Metadata = {
  title: "策略回測",
  description:
    "回測台股漲停族群交易策略，模擬歷史績效與風險指標，驗證選股邏輯的有效性。",
  alternates: { canonical: "/backtest" },
  openGraph: {
    title: "策略回測 — 股文觀指",
    description:
      "回測台股漲停族群交易策略，模擬歷史績效與風險指標。",
    url: "/backtest",
  },
};

export default function Page() {
  return <BacktestPage />;
}
