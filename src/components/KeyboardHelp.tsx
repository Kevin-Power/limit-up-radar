"use client";

import { useEffect, useState } from "react";

const SHORTCUTS = [
  { key: "← →", desc: "切換日期（前一天 / 後一天）" },
  { key: "?", desc: "顯示快捷鍵說明" },
  { key: "Esc", desc: "關閉此視窗" },
];

export default function KeyboardHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.key === "?" || e.key === "/") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Floating "?" button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="顯示快捷鍵說明"
        className="fixed bottom-5 right-5 z-40 w-8 h-8 rounded-full bg-bg-3 border border-border text-txt-4 text-xs font-bold hover:border-border-hover hover:text-txt-1 transition-all duration-200 flex items-center justify-center shadow-lg"
      >
        ?
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Modal */}
          <div className="relative bg-bg-2 border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-[6px] h-[6px] bg-red rounded-sm" />
                <span className="text-sm font-semibold text-txt-0 tracking-tight">
                  快捷鍵說明
                </span>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="關閉"
                className="text-txt-4 hover:text-txt-1 transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Shortcut list */}
            <div className="px-5 py-4 space-y-3">
              {SHORTCUTS.map(({ key, desc }) => (
                <div key={key} className="flex items-center gap-4">
                  <kbd className="inline-flex items-center justify-center min-w-[52px] px-2.5 py-1 bg-bg-4 border border-border rounded-md text-[11px] font-semibold text-txt-1 font-mono tracking-wider shadow-sm flex-shrink-0">
                    {key}
                  </kbd>
                  <span className="text-xs text-txt-2">{desc}</span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-border text-center text-[10px] text-txt-4">
              按 <kbd className="text-[10px] px-1 py-0.5 bg-bg-4 border border-border rounded font-mono">Esc</kbd> 或點擊外部關閉
            </div>
          </div>
        </div>
      )}
    </>
  );
}
