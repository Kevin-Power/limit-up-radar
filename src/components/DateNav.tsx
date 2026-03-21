"use client";

import { formatDateDisplay, getWeekday } from "@/lib/utils";

interface DateNavProps {
  date: string;
  limitUpCount: number;
  groupCount: number;
  onPrev: () => void;
  onNext: () => void;
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

export default function DateNav({ date, limitUpCount, groupCount, onPrev, onNext }: DateNavProps) {
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
      <div className="flex gap-1.5">
        <SummaryChip label={`${limitUpCount} 檔漲停`} color="red" />
        <SummaryChip label={`${groupCount} 族群`} color="blue" />
      </div>
    </div>
  );
}
