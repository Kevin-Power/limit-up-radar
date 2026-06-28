import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "漲停股工作台",
  description:
    "台股漲停股工作台：整合個股報價、技術與籌碼資訊於單一操作面板，個人研究紀錄分享，非投顧、不構成投資建議。",
  alternates: { canonical: "/workspace" },
};

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
