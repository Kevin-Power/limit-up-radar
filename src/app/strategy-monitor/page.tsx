import type { Metadata } from "next";
import StrategyMonitorClient from "./_client";

export const metadata: Metadata = {
  title: "策略監控 | 漲停雷達",
  description:
    "rolling EV、連敗、市場 regime 警示的策略監控儀表板。",
  alternates: { canonical: "/strategy-monitor" },
};

export default function Page() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-2">策略監控儀表板</h1>
      <p className="text-xs text-txt-3 mb-6">
        rolling EV、連敗、市場 regime 警示。指標為資訊型，不自動切策略。
      </p>
      <StrategyMonitorClient />
    </main>
  );
}
