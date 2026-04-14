"use client";

import Link from "next/link";

const QUICK_LINKS = [
  { label: "首頁", href: "/" },
  { label: "隔日表現", href: "/next-day" },
  { label: "快樂小馬", href: "/pony" },
  { label: "策略回測", href: "/backtest" },
  { label: "進階選股", href: "/screener" },
  { label: "營收速報", href: "/revenue" },
];

const RESOURCES = [
  {
    label: "GitHub",
    href: "https://github.com/Kevin-Power/limit-up-radar",
    external: true,
  },
  {
    label: "Landing Page",
    href: "/landing",
    external: false,
  },
  {
    label: "API 文件",
    href: "#",
    external: false,
    comingSoon: true,
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-bg-0">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {/* Three-column grid */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* Column 1: Brand */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-txt-0">
                <span className="text-red">//</span> 漲停雷達
              </span>
              <span className="rounded bg-bg-2 px-1.5 py-0.5 text-[9px] font-medium text-txt-4">
                v1.0
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-txt-3">
              AI 驅動的台股分析平台
            </p>
            <p className="mt-3 text-xs text-txt-4">
              即時漲停族群分類、隔日表現追蹤、策略回測與國際市場動態。
            </p>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-txt-3">
              快速連結
            </h3>
            <ul className="mt-3 space-y-2">
              {QUICK_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-txt-2 transition-colors hover:text-txt-0"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Resources */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-txt-3">
              資源
            </h3>
            <ul className="mt-3 space-y-2">
              {RESOURCES.map((res) => (
                <li key={res.label} className="flex items-center gap-1.5">
                  {res.external ? (
                    <a
                      href={res.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-txt-2 transition-colors hover:text-txt-0"
                    >
                      {res.label}
                      <span className="ml-1 text-[10px] text-txt-4">&nearr;</span>
                    </a>
                  ) : (
                    <Link
                      href={res.href}
                      className={`text-sm transition-colors ${
                        res.comingSoon
                          ? "cursor-default text-txt-4"
                          : "text-txt-2 hover:text-txt-0"
                      }`}
                    >
                      {res.label}
                    </Link>
                  )}
                  {res.comingSoon && (
                    <span className="rounded bg-bg-2 px-1.5 py-0.5 text-[9px] text-txt-4">
                      coming soon
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-center gap-2 border-t border-border pt-6 text-[11px] text-txt-4 sm:flex-row sm:justify-between">
          <span>&copy; 2026 漲停雷達. Built with Next.js + Claude.</span>
          <span>資料來源: TWSE / TPEx</span>
        </div>
      </div>
    </footer>
  );
}
