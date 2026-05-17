import type { Metadata } from "next";
import SupplyChainClient from "./_client";

export const metadata: Metadata = {
  title: "供應鏈追蹤",
  description: "台股龍頭股上下游供應鏈關係 + 今日漲停整合表現，找出族群連動效應。",
  alternates: { canonical: "/supply-chain" },
};

export default function Page() {
  return <SupplyChainClient />;
}
