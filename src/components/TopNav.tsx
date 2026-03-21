"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TopNavProps {
  currentDate: string;
}

const NAV_ITEMS = [
  { label: "每日總覽", href: "/", disabled: false },
  { label: "隔日表現", href: "/next-day", disabled: false },
  { label: "歷史數據", href: "/history", disabled: false },
  { label: "處置預測", href: "/disposal", disabled: true },
  { label: "統計分析", href: "/stats", disabled: true },
];

export default function TopNav({ currentDate }: TopNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-between h-11 px-5 bg-bg-1 border-b border-border">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-sm text-txt-0 tracking-tight whitespace-nowrap hover:opacity-80 transition-opacity"
        >
          <div className="w-[7px] h-[7px] bg-red rounded-sm" />
          漲停雷達
        </Link>

        {/* Divider + nav tabs: hidden on mobile */}
        <div className="hidden md:flex items-center gap-0">
          <div className="w-px h-5 bg-border mr-4" />
          <div className="flex h-11">
            {NAV_ITEMS.map(({ label, href, disabled }) => {
              const isActive = pathname === href;

              if (disabled) {
                return (
                  <span
                    key={label}
                    className="px-3.5 text-xs font-medium tracking-wide border-b-2 border-transparent text-txt-4 cursor-not-allowed flex items-center"
                    title="即將推出"
                  >
                    {label}
                  </span>
                );
              }

              return (
                <Link
                  key={label}
                  href={href}
                  className={`px-3.5 text-xs font-medium tracking-wide border-b-2 transition-colors flex items-center ${
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
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] text-txt-4 font-medium">
          <div className="w-[5px] h-[5px] rounded-full bg-green animate-pulse" />
          <span className="hidden sm:inline">已更新</span>
        </div>

        {/* Search box: hidden on mobile */}
        <div className="relative hidden md:block">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[13px] text-txt-4">⌕</span>
          <input
            type="text"
            placeholder="搜尋代號 / 名稱"
            className="bg-bg-3 border border-border rounded-md py-1 pl-7 pr-2.5 text-xs text-txt-2 w-[180px] outline-none focus:border-border-hover placeholder:text-txt-4"
          />
        </div>

        <div className="text-[11px] text-txt-4 tabular-nums tracking-wider whitespace-nowrap">
          {currentDate.replace(/-/g, "/")}
        </div>

        {/* Hamburger icon: visible only on mobile */}
        <button
          className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-[5px] text-txt-3 hover:text-txt-1 transition-colors"
          aria-label="選單"
        >
          <span className="w-5 h-[1.5px] bg-current rounded-full" />
          <span className="w-5 h-[1.5px] bg-current rounded-full" />
          <span className="w-5 h-[1.5px] bg-current rounded-full" />
        </button>
      </div>
    </nav>
  );
}
