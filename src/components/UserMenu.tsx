"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";

interface User {
  userId: string;
  displayName: string;
  pictureUrl: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function UserMenu() {
  const { data, mutate } = useSWR<{ user: User | null }>("/api/auth/me", fetcher, {
    revalidateOnFocus: true,
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const user = data?.user;

  if (!data) return null; // loading

  if (!user) {
    return (
      <a
        href="/api/auth/line"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: "#06C755" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
        LINE 登入
      </a>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full hover:opacity-80 transition-opacity"
      >
        {user.pictureUrl ? (
          <img
            src={user.pictureUrl}
            alt={user.displayName}
            width={28}
            height={28}
            className="rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-bg-3 flex items-center justify-center text-[11px] font-bold text-txt-2">
            {user.displayName.charAt(0)}
          </div>
        )}
        <span className="text-xs text-txt-2 hidden sm:inline max-w-[80px] truncate">
          {user.displayName}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 bg-bg-2 border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="text-xs font-semibold text-txt-1 truncate">{user.displayName}</div>
            <div className="text-[10px] text-txt-4 mt-0.5">LINE 帳號已連結</div>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              mutate({ user: null }, false);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 text-xs text-txt-3 hover:bg-bg-3 hover:text-txt-1 transition-colors"
          >
            登出
          </button>
        </div>
      )}
    </div>
  );
}
