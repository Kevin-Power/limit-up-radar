import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "股票比較",
  description:
    "並排比較多檔台股的基本面與技術指標，快速找出族群中的相對強勢標的，非投顧、不構成投資建議。",
  alternates: { canonical: "/compare" },
};

export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
