"use client";

import { useState, useEffect } from "react";

type MarketStatus = "pre" | "trading" | "post" | "closed";

interface StatusConfig {
  label: string;
  dotClass: string;
  pulse: boolean;
}

const STATUS_MAP: Record<MarketStatus, StatusConfig> = {
  pre:     { label: "盤前",   dotClass: "bg-amber",  pulse: true },
  trading: { label: "交易中", dotClass: "bg-green",   pulse: true },
  post:    { label: "盤後",   dotClass: "bg-amber",  pulse: false },
  closed:  { label: "休市",   dotClass: "bg-txt-4",  pulse: false },
};

function getTaiwanNow(): Date {
  // Get current time in Asia/Taipei
  const str = new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" });
  return new Date(str);
}

function getMarketStatus(now: Date): MarketStatus {
  const day = now.getDay();
  if (day === 0 || day === 6) return "closed";

  const hhmm = now.getHours() * 100 + now.getMinutes();

  if (hhmm >= 830 && hhmm < 900) return "pre";
  if (hhmm >= 900 && hhmm < 1330) return "trading";
  if (hhmm >= 1330 && hhmm < 1430) return "post";
  return "closed";
}

function getCountdown(now: Date): string | null {
  const day = now.getDay();
  const hhmm = now.getHours() * 100 + now.getMinutes();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // During trading: countdown to close (13:30)
  if (day >= 1 && day <= 5 && hhmm >= 900 && hhmm < 1330) {
    const closeMinutes = 13 * 60 + 30;
    const diff = closeMinutes - nowMinutes;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return `距收盤 ${h}小時${m}分`;
  }

  // Closed: countdown to next open (09:00)
  // Calculate next trading day's 09:00
  let daysUntilOpen = 0;
  let targetDay = day;

  if (day >= 1 && day <= 5 && hhmm < 900) {
    // Weekday before open - opens today
    daysUntilOpen = 0;
  } else if (day === 5 && hhmm >= 1330) {
    // Friday after close - next Monday
    daysUntilOpen = 3;
  } else if (day === 6) {
    daysUntilOpen = 2;
  } else if (day === 0) {
    daysUntilOpen = 1;
  } else if (day >= 1 && day <= 4 && hhmm >= 1330) {
    // Weekday after close - next day
    daysUntilOpen = 1;
  } else {
    return null;
  }

  const openMinutes = 9 * 60; // 09:00
  let totalMinDiff: number;

  if (daysUntilOpen === 0) {
    totalMinDiff = openMinutes - nowMinutes;
  } else {
    const remainToday = 24 * 60 - nowMinutes;
    totalMinDiff = remainToday + (daysUntilOpen - 1) * 24 * 60 + openMinutes;
  }

  if (totalMinDiff <= 0) return null;

  const h = Math.floor(totalMinDiff / 60);
  const m = totalMinDiff % 60;

  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `距開盤 ${d}天${rh}小時`;
  }
  return `距開盤 ${h}小時${m}分`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function MarketClock() {
  const [time, setTime] = useState<string>("");
  const [status, setStatus] = useState<MarketStatus>("closed");
  const [countdown, setCountdown] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    function tick() {
      const now = getTaiwanNow();
      setTime(formatTime(now));
      setStatus(getMarketStatus(now));
      setCountdown(getCountdown(now));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) {
    // SSR placeholder to avoid hydration mismatch
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-txt-4 font-medium">
        <div className="w-[5px] h-[5px] rounded-full bg-txt-4" />
        <span className="hidden sm:inline">--:--:--</span>
      </div>
    );
  }

  const cfg = STATUS_MAP[status];

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-txt-4 font-medium tabular-nums">
      <div
        className={`${cfg.pulse ? "pulse-dot" : ""} w-[5px] h-[5px] rounded-full ${cfg.dotClass} ${cfg.pulse ? "animate-pulse" : ""}`}
      />
      <span className="hidden sm:inline">{cfg.label}</span>
      <span className="text-txt-3 tracking-wider">{time}</span>
      {countdown && (
        <span className="hidden lg:inline text-txt-4 ml-0.5">
          {countdown}
        </span>
      )}
    </div>
  );
}
