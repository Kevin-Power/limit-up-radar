import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "市場情資",
  description:
    "台股市場情資彙整：個股與族群相關新聞、題材追蹤，協助掌握盤面消息脈動，非投顧、不構成投資建議。",
  alternates: { canonical: "/news" },
};

export default function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
