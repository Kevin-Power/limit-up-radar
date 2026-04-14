import type { Metadata } from "next";
import RevenueClient from "./_client";

export const metadata: Metadata = {
  title: "營收速報",
  description: "上市櫃公司月營收統計速報，YoY/MoM 成長排行，依產業篩選。",
  alternates: { canonical: "/revenue" },
};

export default function Page() {
  return <RevenueClient />;
}
