import type { Metadata } from "next";
import SupplyChainMapClient from "./_client";

export const metadata: Metadata = {
  title: "供應鏈地圖 (Bloomberg SPLC 風格)",
  description: "AI 半導體完整供應鏈視覺化地圖：91 節點 / 338 條關係，台美聯動。",
  alternates: { canonical: "/supply-chain/map" },
};

export default function Page() {
  // SupplyChainMap is fullscreen — no nav wrapper to preserve UX
  return <SupplyChainMapClient />;
}
