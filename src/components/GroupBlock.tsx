"use client";

import { useState } from "react";
import { StockGroup } from "@/lib/types";
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

export default function GroupBlock({ group }: GroupBlockProps) {
  const [collapsed, setCollapsed] = useState(false);

  const totalVolume = group.stocks.reduce((sum, s) => sum + s.volume, 0);
  const totalMajorNet = group.stocks.reduce((sum, s) => sum + s.major_net, 0);
  const streakStocks = group.stocks.filter((s) => s.streak > 0).length;

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
            <div className="w-20 text-[10px] font-semibold uppercase tracking-wider text-txt-4 text-right flex-shrink-0">收盤價</div>
            <div className="w-16 text-[10px] font-semibold uppercase tracking-wider text-txt-4 text-right flex-shrink-0">漲幅</div>
            <div className="w-20 text-[10px] font-semibold uppercase tracking-wider text-txt-4 text-right flex-shrink-0">成交量</div>
            <div className="w-20 text-[10px] font-semibold uppercase tracking-wider text-txt-4 text-right flex-shrink-0">主力</div>
            <div className="w-14 text-[10px] font-semibold uppercase tracking-wider text-txt-4 text-right flex-shrink-0">5日</div>
            <div className="w-4 flex-shrink-0" />
          </div>

          {/* Stock rows */}
          {group.stocks.map((stock) => (
            <StockRow key={stock.code} stock={stock} groupColor={group.color} />
          ))}
        </>
      )}
    </div>
  );
}
