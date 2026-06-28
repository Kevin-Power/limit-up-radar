import type { Metadata } from "next";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import StrategyMonitorClient from "./_client";

export const metadata: Metadata = {
  title: "策略監控 | 漲停雷達",
  description:
    "rolling EV、連敗、市場 regime 警示的策略監控儀表板。",
  alternates: { canonical: "/strategy-monitor" },
};

export default function Page() {
  return (
    <div className="min-h-screen bg-bg-0 text-txt-1 animate-fade-in">
      <TopNav />
      <NavBar />

      <main id="main" className="container-page pt-20 pb-16">
        <h1 className="text-2xl font-bold mb-2">策略監控儀表板</h1>
        <p className="text-xs text-txt-3 mb-6">
          rolling EV、連敗、市場 regime 警示。指標為資訊型，不自動切策略。
        </p>
        <StrategyMonitorClient />
      </main>
    </div>
  );
}
