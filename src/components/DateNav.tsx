"use client";

import { useState } from "react";
import { DailyData } from "@/lib/types";
import { formatDateDisplay, getWeekday, formatPrice, formatPct, formatNumber, formatNet } from "@/lib/utils";

interface DateNavProps {
  date: string;
  limitUpCount: number;
  groupCount: number;
  onPrev: () => void;
  onNext: () => void;
  data?: DailyData;
}

function SummaryChip({ label, color }: { label: string; color: "red" | "blue" | "amber" }) {
  const styles = {
    red: "bg-red-bg text-red",
    blue: "bg-blue-bg text-blue",
    amber: "bg-amber-bg text-amber",
  };
  return (
    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold ${styles[color]}`}>
      {label}
    </span>
  );
}

function buildExportText(data: DailyData): string {
  const dateStr = data.date.replace(/-/g, ".");
  const lines: string[] = [`漲停雷達 ${dateStr}`, ""];

  for (const group of data.groups) {
    const badgeStr = group.badges.length > 0 ? " " + group.badges.join(" ") : "";
    lines.push(`${group.name} (${group.stocks.length}檔)${badgeStr}`);
    if (group.reason) {
      lines.push(`  ${group.reason}`);
    }
    for (const s of group.stocks) {
      const streakStr = s.streak > 0 ? ` 連${s.streak}板` : "";
      lines.push(
        `  ${s.code} ${s.name} ${formatPrice(s.close)} ${formatPct(s.change_pct)} 量:${formatNumber(s.volume)} 主力:${formatNet(s.major_net)}${streakStr}`
      );
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export default function DateNav({ date, limitUpCount, groupCount, onPrev, onNext, data }: DateNavProps) {
  const [copied, setCopied] = useState(false);

  async function handleExport() {
    if (!data) return;
    const text = buildExportText(data);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that block clipboard API
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
      <div className="flex items-center gap-2">
        <button onClick={onPrev} className="w-7 h-7 bg-bg-3 border border-border rounded flex items-center justify-center text-txt-3 text-xs hover:border-border-hover hover:text-txt-1 transition-colors">‹</button>
        <div className="text-lg font-bold text-txt-0 tracking-tight tabular-nums">
          {formatDateDisplay(date)}
          <span className="text-xs text-txt-4 ml-2 font-normal">{getWeekday(date)}</span>
        </div>
        <button onClick={onNext} className="w-7 h-7 bg-bg-3 border border-border rounded flex items-center justify-center text-txt-3 text-xs hover:border-border-hover hover:text-txt-1 transition-colors">›</button>
      </div>
      <div className="flex items-center gap-1.5">
        <SummaryChip label={`${limitUpCount} 檔漲停`} color="red" />
        <SummaryChip label={`${groupCount} 族群`} color="blue" />
        {data && (
          <button
            onClick={handleExport}
            title="複製今日資料"
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
              copied
                ? "bg-blue-bg text-blue border-blue/30"
                : "bg-bg-3 text-txt-3 border-border hover:border-border-hover hover:text-txt-1"
            }`}
          >
            {copied ? (
              "已複製"
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3 h-3"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                匯出
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
