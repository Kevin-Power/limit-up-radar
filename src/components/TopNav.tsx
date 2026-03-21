"use client";

interface TopNavProps {
  currentDate: string;
}

export default function TopNav({ currentDate }: TopNavProps) {
  return (
    <nav className="flex items-center justify-between h-11 px-5 bg-bg-1 border-b border-border">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 font-bold text-sm text-txt-0 tracking-tight whitespace-nowrap">
          <div className="w-[7px] h-[7px] bg-red rounded-sm" />
          漲停雷達
        </div>
        <div className="w-px h-5 bg-border" />
        <div className="flex h-11">
          {["每日總覽", "隔日表現", "歷史數據", "處置預測", "統計分析"].map(
            (label, i) => (
              <button
                key={label}
                className={`px-3.5 text-xs font-medium tracking-wide border-b-2 transition-colors ${
                  i === 0
                    ? "text-txt-0 border-red"
                    : "text-txt-3 border-transparent hover:text-txt-1"
                }`}
              >
                {label}
              </button>
            )
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-[10px] text-txt-4 font-medium">
          <div className="w-[5px] h-[5px] rounded-full bg-green animate-pulse" />
          已更新
        </div>
        <div className="relative">
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
      </div>
    </nav>
  );
}
