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
    return null; // Not logged in — middleware redirects to /landing
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
