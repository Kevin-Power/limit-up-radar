import type { Metadata } from "next";
import DisposalPage from "./_client";

export const metadata: Metadata = {
  title: "處置股追蹤",
  description:
    "台股處置股與注意股追蹤，即時監控高風險標的處置狀態與警示資訊。",
  alternates: { canonical: "/disposal" },
  openGraph: {
    title: "處置股追蹤 — 漲停雷達",
    description:
      "台股處置股與注意股追蹤，即時監控高風險標的處置狀態與警示資訊。",
    url: "/disposal",
  },
};

export default function Page() {
  return <DisposalPage />;
}
