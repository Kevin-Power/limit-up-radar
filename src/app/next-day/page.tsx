"use client";

import Link from "next/link";
import TopNav from "@/components/TopNav";
import { formatPct, formatPrice } from "@/lib/utils";

type Result = "up" | "down" | "flat";

interface NextDayEntry {
  code: string;
  name: string;
  group: string;
  yesterdayClose: number;
  todayOpen: number;
  todayClose: number;
  todayChangePct: number;
  result: Result;
}

const MOCK_NEXT_DAY: NextDayEntry[] = [
  { code: "3324", name: "雙鴻", group: "AI 伺服器", yesterdayClose: 385.0, todayOpen: 385.0, todayClose: 392.0, todayChangePct: 1.82, result: "up" },
  { code: "3017", name: "奇鋐", group: "AI 伺服器", yesterdayClose: 412.5, todayOpen: 412.5, todayClose: 405.0, todayChangePct: -1.82, result: "down" },
  { code: "8210", name: "勤誠", group: "AI 伺服器", yesterdayClose: 289.0, todayOpen: 289.0, todayClose: 295.5, todayChangePct: 2.25, result: "up" },
  { code: "2376", name: "技嘉", group: "AI 伺服器", yesterdayClose: 456.0, todayOpen: 450.0, todayClose: 445.0, todayChangePct: -2.41, result: "down" },
  { code: "3131", name: "弘塑", group: "半導體設備", yesterdayClose: 1285.0, todayOpen: 1285.0, todayClose: 1320.0, todayChangePct: 2.72, result: "up" },
  { code: "3413", name: "京鼎", group: "半導體設備", yesterdayClose: 567.0, todayOpen: 560.0, todayClose: 558.0, todayChangePct: -1.59, result: "down" },
  { code: "2002", name: "中鋼", group: "鋼鐵", yesterdayClose: 32.45, todayOpen: 32.45, todayClose: 33.10, todayChangePct: 2.00, result: "up" },
  { code: "2014", name: "中鴻", group: "鋼鐵", yesterdayClose: 24.80, todayOpen: 24.80, todayClose: 24.80, todayChangePct: 0.00, result: "flat" },
];

function computeStats(data: NextDayEntry[]) {
  const total = data.length;
  const upCount = data.filter((d) => d.result === "up").length;
  const downCount = data.filter((d) => d.result === "down").length;
  const flatCount = data.filter((d) => d.result === "flat").length;
  const successRate = total > 0 ? (upCount / total) * 100 : 0;
  const avgChange =
    total > 0
      ? data.reduce((sum, d) => sum + d.todayChangePct, 0) / total
      : 0;
  return { total, upCount, downCount, flatCount, successRate, avgChange };
}

function ResultBadge({ result }: { result: Result }) {
  if (result === "up")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green">
        <span>▲</span> 上漲
      </span>
    );
  if (result === "down")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red">
        <span>▼</span> 下跌
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-txt-3">
      <span>—</span> 持平
    </span>
  );
}

export default function NextDayPage() {
  const stats = computeStats(MOCK_NEXT_DAY);

  const upPct = stats.total > 0 ? (stats.upCount / stats.total) * 100 : 0;
  const downPct = stats.total > 0 ? (stats.downCount / stats.total) * 100 : 0;
  const flatPct = stats.total > 0 ? (stats.flatCount / stats.total) * 100 : 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate="2026-03-21" />

      <main className="flex-1 overflow-y-auto p-5">
        {/* Demo banner */}
        <div className="mb-4 flex items-center gap-2.5 px-4 py-2.5 rounded-md bg-amber-bg border border-amber text-amber text-xs font-medium">
          <span className="text-sm">⚠</span>
          <span>
            示範資料 — 實際資料需累積兩個交易日。目前顯示 Mock 資料供 UI
            預覽。
          </span>
        </div>

        {/* Page title */}
        <div className="mb-5">
          <h1 className="text-base font-semibold text-txt-0 tracking-tight">
            隔日表現分析
          </h1>
          <p className="mt-0.5 text-[11px] text-txt-4">
            前一交易日漲停股，次日開盤後的實際表現追蹤
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-bg-2 border border-border rounded-md px-4 py-3">
            <div className="text-[10px] text-txt-4 font-medium tracking-wide uppercase mb-1">
              總計
            </div>
            <div className="text-xl font-bold text-txt-0 tabular-nums">
              {stats.total}
            </div>
            <div className="text-[10px] text-txt-4 mt-0.5">檔漲停股</div>
          </div>

          <div className="bg-bg-2 border border-border rounded-md px-4 py-3">
            <div className="text-[10px] text-txt-4 font-medium tracking-wide uppercase mb-1">
              上漲
            </div>
            <div className="text-xl font-bold text-green tabular-nums">
              {stats.upCount}
            </div>
            <div className="text-[10px] text-green/60 mt-0.5">
              {upPct.toFixed(0)}% 成功率
            </div>
          </div>

          <div className="bg-bg-2 border border-border rounded-md px-4 py-3">
            <div className="text-[10px] text-txt-4 font-medium tracking-wide uppercase mb-1">
              下跌
            </div>
            <div className="text-xl font-bold text-red tabular-nums">
              {stats.downCount}
            </div>
            <div className="text-[10px] text-red/60 mt-0.5">
              {downPct.toFixed(0)}% 占比
            </div>
          </div>

          <div className="bg-bg-2 border border-border rounded-md px-4 py-3">
            <div className="text-[10px] text-txt-4 font-medium tracking-wide uppercase mb-1">
              平均漲跌幅
            </div>
            <div
              className={`text-xl font-bold tabular-nums ${
                stats.avgChange >= 0 ? "text-green" : "text-red"
              }`}
            >
              {formatPct(stats.avgChange)}
            </div>
            <div className="text-[10px] text-txt-4 mt-0.5">
              持平 {stats.flatCount} 檔
            </div>
          </div>
        </div>

        {/* Distribution bar */}
        <div className="mb-5 bg-bg-2 border border-border rounded-md px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-txt-4 font-medium tracking-wide uppercase">
              漲跌分布
            </span>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-green">
                <span className="inline-block w-2 h-2 rounded-sm bg-green" />
                上漲 {upPct.toFixed(0)}%
              </span>
              <span className="flex items-center gap-1 text-txt-3">
                <span className="inline-block w-2 h-2 rounded-sm bg-txt-4" />
                持平 {flatPct.toFixed(0)}%
              </span>
              <span className="flex items-center gap-1 text-red">
                <span className="inline-block w-2 h-2 rounded-sm bg-red" />
                下跌 {downPct.toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
            {upPct > 0 && (
              <div
                className="bg-green rounded-l-full"
                style={{ width: `${upPct}%` }}
              />
            )}
            {flatPct > 0 && (
              <div className="bg-txt-4" style={{ width: `${flatPct}%` }} />
            )}
            {downPct > 0 && (
              <div
                className="bg-red rounded-r-full"
                style={{ width: `${downPct}%` }}
              />
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-bg-2 border border-border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-3">
                <th className="text-left px-4 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase w-20">
                  代號
                </th>
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">
                  名稱
                </th>
                <th className="text-left px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">
                  族群
                </th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">
                  前日收盤
                </th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">
                  今日開盤
                </th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">
                  今日收盤
                </th>
                <th className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">
                  漲跌幅
                </th>
                <th className="text-center px-4 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase w-20">
                  結果
                </th>
              </tr>
            </thead>
            <tbody>
              {MOCK_NEXT_DAY.map((row, idx) => {
                const rowBg =
                  row.result === "up"
                    ? "bg-green-bg/50 hover:bg-green-bg"
                    : row.result === "down"
                    ? "bg-red-bg/50 hover:bg-red-bg"
                    : "hover:bg-bg-3";

                return (
                  <tr
                    key={row.code}
                    className={`border-b border-border last:border-0 transition-colors ${rowBg}`}
                  >
                    <td className="px-4 py-2.5 font-mono text-txt-3 text-[11px]">
                      <Link
                        href={`/stock/${row.code}`}
                        className="hover:text-txt-0 hover:underline underline-offset-2 transition-colors"
                      >
                        {row.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-txt-1">
                      <Link
                        href={`/stock/${row.code}`}
                        className="hover:text-txt-0 hover:underline underline-offset-2 transition-colors"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-txt-3">{row.group}</td>
                    <td className="px-3 py-2.5 text-right text-txt-2 tabular-nums">
                      {formatPrice(row.yesterdayClose)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-txt-2 tabular-nums">
                      {formatPrice(row.todayOpen)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-txt-1">
                      {formatPrice(row.todayClose)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-semibold tabular-nums ${
                        row.todayChangePct > 0
                          ? "text-green"
                          : row.todayChangePct < 0
                          ? "text-red"
                          : "text-txt-3"
                      }`}
                    >
                      {formatPct(row.todayChangePct)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <ResultBadge result={row.result} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Data note */}
        <div className="mt-4 text-center text-[10px] text-txt-4">
          需要至少兩個交易日的資料才能分析隔日表現 — 以上為示範數據
        </div>
      </main>
    </div>
  );
}
