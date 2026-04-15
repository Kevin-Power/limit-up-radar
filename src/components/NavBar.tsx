"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useEffect, useState } from "react";

const NAV_ITEMS = [
  { label: "每日總覽", href: "/" },
  { label: "明日焦點", href: "/focus" },
  { label: "隔日表現", href: "/next-day" },
  { label: "研究工作台", href: "/workspace" },
  { label: "快樂小馬", href: "/pony" },
  { label: "策略回測", href: "/backtest" },
  { label: "進階選股", href: "/screener" },
  { label: "營收速報", href: "/revenue" },
  { label: "交易教室", href: "/learn" },
  { label: "國際市場", href: "/global" },
  { label: "市場情資", href: "/news" },
  { label: "盤後報告", href: "/report" },
  { label: "統計分析", href: "/stats" },
  { label: "處置預測", href: "/disposal" },
  { label: "股票比較", href: "/compare" },
];

export default function NavBar() {
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function checkScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  // Scroll active item into view on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector("[data-active=true]") as HTMLElement;
    if (active) {
      active.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
      setTimeout(checkScroll, 50);
    }
  }, [pathname]);

  return (
    <div className="glass sticky top-[36px] z-40 bg-bg-1 border-b border-border relative">
      {/* Left fade */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-bg-1 to-transparent z-10 pointer-events-none" />
      )}
      {/* Right fade + arrow hint */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-bg-1 to-transparent z-10 flex items-center justify-end pr-1.5 pointer-events-none">
          <span className="text-[10px] text-txt-4 animate-pulse">&rsaquo;</span>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex items-center h-9 px-3 md:px-5 gap-0 overflow-x-auto scrollbar-none"
      >
        {NAV_ITEMS.map(({ label, href }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={label}
              href={href}
              data-active={isActive}
              className={`px-3 text-[11px] font-medium tracking-wide border-b-2 transition-all duration-200 flex items-center whitespace-nowrap h-9 flex-shrink-0 ${
                isActive
                  ? "text-txt-0 border-red"
                  : "text-txt-3 border-transparent hover:text-txt-1 hover:border-txt-3"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
