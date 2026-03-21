"use client";

import { useState, useMemo } from "react";
import { Stock, StockGroup } from "@/lib/types";
import StockRow from "./StockRow";
import { formatNumber } from "@/lib/utils";

interface GroupBlockProps {
  group: StockGroup;
}

const BADGE_STYLES: Record<string, string> = {
  HOT: "bg-red-bg text-red",
  FOCUS: "bg-red-bg text-red",
  NEW: "bg-blue-bg text-blue",
};

function getBadgeStyle(badge: string): string {
  if (BADGE_STYLES[badge]) return BADGE_STYLES[badge];
  if (badge.includes("連")) return "bg-amber-bg text-amber";
  return "bg-blue-bg text-blue";
}

type SortKey = "close" | "change_pct" | "volume" | "major_net";
type SortDir = "asc" | "desc";

interface SortState {
  key: SortKey;
  dir: SortDir;
}

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
  className?: string;
}

function SortableHeader({ label, sortKey, sort, onSort, className = "" }: SortableHeaderProps) {
  const isActive = sort?.key === sortKey;
  const arrow = isActive ? (sort?.dir === "desc" ? " ▼" : " ▲") : "";

  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`text-[10px] font-semibold uppercase tracking-wider text-right flex-shrink-0 transition-colors select-none ${
        isActive ? "text-txt-1" : "text-txt-4 hover:text-txt-3"
      } ${className}`}
    >
      {label}
      <span className={`tabular-nums ml-0.5 ${isActive ? "text-red" : "text-transparent"}`}>
        {isActive ? (sort?.dir === "desc" ? "▼" : "▲") : "▲"}
      </span>
    </button>
  );
}

export default function GroupBlock({ group }: GroupBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [sort, setSort] = useState<SortState | null>(null);

  const totalVolume = group.stocks.reduce((sum, s) => sum + s.volume, 0);
  const totalMajorNet = group.stocks.reduce((sum, s) => sum + s.major_net, 0);
  const streakStocks = group.stocks.filter((s) => s.streak > 0).length;

  function handleSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key === key) {
        // Toggle direction, or clear if already desc->asc and clicking asc
        return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      }
      return { key, dir: "desc" };
    });
  }

  const sortedStocks: Stock[] = useMemo(() => {
    if (!sort) return group.stocks;
    return [...group.stocks].sort((a, b) => {
      const aVal = a[sort.key];
      const bVal = b[sort.key];
      return sort.dir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [group.stocks, sort]);

  return (
    <div className="bg-bg-1 border border-border rounded-lg mb-3 overflow-hidden hover:border-border-hover transition-colors">
      {/* Header */}
      <div
        className="flex items-start justify-between px-4 pt-3.5 pb-2 cursor-pointer"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-sm flex-shrink-0 mt-0.5"
            style={{ backgroundColor: group.color }}
          />
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-txt-0 tracking-tight">
                {group.name}
              </span>
              {group.badges.map((badge) => (
                <span
                  key={badge}
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${getBadgeStyle(badge)}`}
                >
                  {badge}
                </span>
              ))}
            </div>
            {/* Mini stats under title */}
            <div className="flex items-center gap-3 mt-1 text-[10px] text-txt-4">
              <span>{group.stocks.length} 檔</span>
              <span>量 {formatNumber(totalVolume)}</span>
              <span className={totalMajorNet >= 0 ? "text-red" : "text-green"}>
                主力 {totalMajorNet >= 0 ? "+" : ""}{formatNumber(totalMajorNet)}
              </span>
              {streakStocks > 0 && (
                <span className="text-amber">{streakStocks} 檔連板</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-txt-4 text-[10px] mt-1">
          {collapsed ? "▸" : "▾"}
        </div>
      </div>

      {/* Reason */}
      <div className="px-4 pb-2.5 pl-[36px] text-xs text-txt-3 leading-relaxed">
        {group.reason}
      </div>

      {!collapsed && (
        <>
          {/* Table header */}
          <div className="flex items-center gap-3 px-4 py-1.5 bg-bg-2 border-t border-b border-border">
            <div className="w-11 text-[10px] font-semibold uppercase tracking-wider text-txt-4 flex-shrink-0">代號</div>
            <div className="w-24 text-[10px] font-semibold uppercase tracking-wider text-txt-4 flex-shrink-0">名稱</div>

            <SortableHeader
              label="收盤價"
              sortKey="close"
              sort={sort}
              onSort={handleSort}
              className="w-20"
            />
            <SortableHeader
              label="漲幅"
              sortKey="change_pct"
              sort={sort}
              onSort={handleSort}
              className="w-16"
            />
            <SortableHeader
              label="成交量"
              sortKey="volume"
              sort={sort}
              onSort={handleSort}
              className="hidden md:flex w-20"
            />
            <SortableHeader
              label="主力"
              sortKey="major_net"
              sort={sort}
              onSort={handleSort}
              className="hidden md:flex w-20"
            />

            <div className="hidden md:block w-14 text-[10px] font-semibold uppercase tracking-wider text-txt-4 text-right flex-shrink-0">5日</div>
            <div className="hidden md:block w-4 flex-shrink-0" />
          </div>

          {/* Stock rows */}
          {sortedStocks.map((stock) => (
            <StockRow key={stock.code} stock={stock} groupColor={group.color} />
          ))}
        </>
      )}
    </div>
  );
}
