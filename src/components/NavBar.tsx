"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "每日總覽", href: "/" },
  { label: "隔日表現", href: "/next-day" },
  { label: "快樂小馬", href: "/pony" },
  { label: "策略回測", href: "/backtest" },
  { label: "進階選股", href: "/screener" },
  { label: "國際市場", href: "/global" },
  { label: "市場情資", href: "/news" },
  { label: "盤後報告", href: "/report" },
  { label: "統計分析", href: "/stats" },
  { label: "處置預測", href: "/disposal" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <div className="flex items-center h-9 px-5 gap-0 overflow-x-auto scrollbar-none bg-bg-1 border-b border-border">
      {NAV_ITEMS.map(({ label, href }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={label}
            href={href}
            className={`px-3 text-[11px] font-medium tracking-wide border-b-2 transition-colors flex items-center whitespace-nowrap h-9 flex-shrink-0 ${
              isActive
                ? "text-txt-0 border-red"
                : "text-txt-3 border-transparent hover:text-txt-1"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
