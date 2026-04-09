"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import useSWR from "swr";
import Link from "next/link";
import { DailyData, Stock, StockGroup } from "@/lib/types";
import { EmaResult, getSignalLabel, getSignalColor } from "@/lib/ema";
import { formatPrice, formatPct, formatNumber } from "@/lib/utils";
import NavBar from "@/components/NavBar";
import TopNav from "@/components/TopNav";
import KLineChart, { type CandleData } from "@/components/KLineChart";
import StarButton from "@/components/StarButton";
import { useWatchlist } from "@/lib/useWatchlist";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ────────────────────────────── Left Panel ─────────────────────────────── */

function StockListItem({
  stock,
  groupColor,
  isSelected,
  onSelect,
  emaSignal,
}: {
  stock: Stock;
  groupColor: string;
  isSelected: boolean;
  onSelect: () => void;
  emaSignal?: EmaResult;
}) {
  const sc = emaSignal ? getSignalColor(emaSignal.signal) : null;

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b border-white/[0.03] last:border-b-0 ${
        isSelected
          ? "bg-white/[0.07] border-l-2 border-l-red/60"
          : "hover:bg-white/[0.03]"
      }`}
    >
      <div
        className="w-1 h-8 rounded-full flex-shrink-0"
        style={{ backgroundColor: groupColor }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-txt-2 tabular-nums">
            {stock.code}
          </span>
          <span className="text-xs font-semibold text-txt-0 truncate">
            {stock.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] font-bold text-red tabular-nums">
            {formatPrice(stock.close)}
          </span>
          <span className="text-[10px] text-red bg-red-bg px-1 py-0.5 rounded tabular-nums">
            {formatPct(stock.change_pct)}
          </span>
          {stock.streak > 1 && (
            <span className="text-[9px] text-amber tabular-nums">{stock.streak}連板</span>
          )}
        </div>
      </div>
      {sc && (
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${sc.bg} ${sc.text} ${sc.border}`}
        >
          {getSignalLabel(emaSignal!.signal)}
        </span>
      )}
    </button>
  );
}

/* ───────────────────────────── Right Panel ─────────────────────────────── */

interface ChipData {
  foreign3d: number[];
  trust3d: number[];
  dealer3d: number[];
  isReal: boolean;
}

function ChipBarRow({ label, values }: { label: string; values: number[] }) {
  if (!values || values.length === 0) return null;
  // API returns newest-first; reverse to display oldest→newest (left→right)
  const ordered = [...values].reverse();
  const total = values.reduce((a, b) => a + b, 0);
  const maxAbs = Math.max(...values.map(Math.abs), 1);
  const allLabels = ["前日", "昨日", "今日"];
  const dateLabels = allLabels.slice(0, ordered.length);
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="text-[11px] text-txt-3 w-14 flex-shrink-0">{label}</div>
      <div className="flex gap-1 flex-1 items-end" style={{ height: 32 }}>
        {ordered.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${Math.max((Math.abs(v) / maxAbs) * 28, 3)}px`,
              backgroundColor: v >= 0 ? "rgba(239,68,68,0.55)" : "rgba(34,197,94,0.55)",
            }}
            title={`${dateLabels[i]}: ${v > 0 ? "+" : ""}${formatNumber(v)}`}
          />
        ))}
      </div>
      <div
        className={`text-xs font-bold tabular-nums w-20 text-right flex-shrink-0 ${
          total > 0 ? "text-red" : total < 0 ? "text-green" : "text-txt-4"
        }`}
      >
        {total === 0 ? "—" : `${total > 0 ? "+" : ""}${formatNumber(total)}`}
      </div>
    </div>
  );
}

function RsiBar({ value }: { value: number }) {
  const color = value > 70 ? "#ef4444" : value < 30 ? "#22c55e" : "#f59e0b";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-bg-3 rounded-full overflow-hidden relative">
        <div className="absolute left-[30%] top-0 h-full w-px bg-white/10" />
        <div className="absolute left-[70%] top-0 h-full w-px bg-white/10" />
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, backgroundColor: color, opacity: 0.7 }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function StockAnalysisPanel({
  stock,
  groupName,
  groupColor,
}: {
  stock: Stock;
  groupName: string;
  groupColor: string;
}) {
  const { isWatched, toggle } = useWatchlist();

  const { data: candles } = useSWR<CandleData[]>(
    `/api/stock/${stock.code}/history`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: ema } = useSWR<EmaResult>(
    `/api/ema/${stock.code}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: chip } = useSWR<ChipData>(
    `/api/stock/${stock.code}/chip`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: tech } = useSWR(
    `/api/stock/${stock.code}/technicals`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const sc = ema ? getSignalColor(ema.signal) : null;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-0 border-b border-border px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-6 rounded-sm flex-shrink-0" style={{ backgroundColor: groupColor }} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-txt-4 tabular-nums font-semibold">{stock.code}</span>
              <span className="text-lg font-bold text-txt-0">{stock.name}</span>
              <StarButton code={stock.code} isWatched={isWatched(stock.code)} onToggle={toggle} />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-txt-4 bg-bg-3 px-1.5 py-0.5 rounded">{stock.industry || groupName}</span>
              <span className="text-xs text-txt-4">{groupName}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-red tabular-nums">{formatPrice(stock.close)}</div>
          <div className="flex items-center gap-2 justify-end mt-0.5">
            <span className="text-[11px] text-red bg-red-bg px-2 py-0.5 rounded tabular-nums font-bold">
              {formatPct(stock.change_pct)}
            </span>
            {stock.streak > 1 && (
              <span className="text-[11px] text-amber font-bold">{stock.streak}連板</span>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* K-Line Chart */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-2">K 線圖</div>
          <KLineChart
            data={candles ?? []}
            height={320}
            showMA={true}
            showVolume={true}
            showMACD={false}
            showKD={false}
          />
        </div>

        {/* Two-col: EMA + Technicals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* EMA */}
          <div className="bg-bg-1 border border-border rounded-lg p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-3">
              EMA 11 × 24 策略
            </div>
            {ema ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  {sc && (
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded border ${sc.bg} ${sc.text} ${sc.border}`}>
                      {getSignalLabel(ema.signal)}
                    </span>
                  )}
                  {ema.crossoverDay !== undefined && ema.crossoverDay >= 0 && ema.crossoverDay <= 60 && (
                    <span className="text-[10px] text-txt-4">
                      {ema.crossoverDay === 0 ? "今日交叉" : `${ema.crossoverDay}天前交叉`}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-bg-2 rounded p-2">
                    <div className="text-[9px] text-txt-4 mb-0.5">EMA11</div>
                    <div className="text-sm font-bold text-red tabular-nums">{ema.ema11.toFixed(2)}</div>
                  </div>
                  <div className="bg-bg-2 rounded p-2">
                    <div className="text-[9px] text-txt-4 mb-0.5">EMA24</div>
                    <div className="text-sm font-bold text-green tabular-nums">{ema.ema24.toFixed(2)}</div>
                  </div>
                </div>
                {/* Mini EMA sparkline */}
                <div className="bg-bg-2 rounded p-2">
                  <svg viewBox="0 0 200 50" className="w-full" style={{ height: 50 }}>
                    {(() => {
                      const n = Math.min(ema.ema11Series.length, 40);
                      const e11 = ema.ema11Series.slice(-n);
                      const e24 = ema.ema24Series.slice(-n);
                      const all = [...e11, ...e24];
                      const mn = Math.min(...all);
                      const mx = Math.max(...all);
                      const r = mx - mn || 1;
                      const x = (i: number) => ((i / (n - 1)) * 190 + 5).toFixed(1);
                      const y = (v: number) => (46 - ((v - mn) / r) * 40).toFixed(1);
                      const p11 = e11.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
                      const p24 = e24.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
                      return (
                        <>
                          <path d={p24} fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.8" />
                          <path d={p11} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.8" />
                        </>
                      );
                    })()}
                  </svg>
                </div>
              </>
            ) : (
              <div className="text-xs text-txt-4 py-4 text-center">EMA 資料載入中...</div>
            )}
          </div>

          {/* Technicals */}
          <div className="bg-bg-1 border border-border rounded-lg p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-3">
              技術指標
            </div>
            {tech ? (
              <div className="space-y-3">
                {/* RSI */}
                <div>
                  <div className="flex justify-between text-[10px] text-txt-4 mb-1">
                    <span>RSI (14)</span>
                    <span className={tech.rsi > 70 ? "text-red" : tech.rsi < 30 ? "text-green" : "text-amber"}>
                      {tech.rsi > 70 ? "超買" : tech.rsi < 30 ? "超賣" : "中性"}
                    </span>
                  </div>
                  <RsiBar value={tech.rsi ?? 50} />
                </div>
                {/* MACD */}
                <div className="flex items-center justify-between py-2 border-t border-border/50">
                  <span className="text-[10px] text-txt-4">MACD</span>
                  <span className={`text-[11px] font-bold ${
                    tech.macdSignal === "golden_cross" ? "text-red" :
                    tech.macdSignal === "death_cross" ? "text-green" : "text-txt-3"
                  }`}>
                    {tech.macdSignal === "golden_cross" ? "黃金交叉" :
                     tech.macdSignal === "death_cross" ? "死亡交叉" : "持平"}
                  </span>
                </div>
                {/* KD */}
                <div className="flex items-center justify-between py-2 border-t border-border/50">
                  <span className="text-[10px] text-txt-4">KD</span>
                  <div className="flex gap-3 text-[11px] tabular-nums">
                    <span className="text-txt-3">K <span className="text-txt-1 font-bold">{tech.k?.toFixed(1) ?? "—"}</span></span>
                    <span className="text-txt-3">D <span className="text-txt-1 font-bold">{tech.d?.toFixed(1) ?? "—"}</span></span>
                  </div>
                </div>
                {/* MA */}
                <div className="pt-2 border-t border-border/50 grid grid-cols-2 gap-1.5">
                  {[
                    { label: "MA5", value: tech.ma5 },
                    { label: "MA20", value: tech.ma20 },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-bg-2 rounded px-2 py-1.5 flex justify-between">
                      <span className="text-[10px] text-txt-4">{label}</span>
                      <span className={`text-[11px] font-bold tabular-nums ${
                        value != null && stock.close > value ? "text-red" : "text-green"
                      }`}>
                        {value != null ? formatPrice(value) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-txt-4 py-4 text-center">技術指標載入中...</div>
            )}
          </div>
        </div>

        {/* Chip */}
        <div className="bg-bg-1 border border-border rounded-lg p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-3">
            三大法人籌碼 (近{chip?.foreign3d?.length ?? 3}日)
          </div>
          {chip?.isReal ? (
            <>
              <ChipBarRow label="外資" values={chip.foreign3d} />
              <ChipBarRow label="投信" values={chip.trust3d} />
              <ChipBarRow label="自營商" values={chip.dealer3d} />
            </>
          ) : (
            <div className="text-xs text-txt-4 py-3 text-center">載入中...</div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "成交量", value: formatNumber(stock.volume) },
            { label: "主力淨買", value: stock.major_net === 0 ? "—" : `${stock.major_net > 0 ? "+" : ""}${formatNumber(stock.major_net)}` },
            { label: "連板天數", value: stock.streak > 0 ? `${stock.streak}天` : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-bg-1 border border-border rounded-lg px-3 py-2.5 text-center">
              <div className="text-[10px] text-txt-4 mb-1">{label}</div>
              <div className="text-sm font-bold text-txt-1 tabular-nums">{value}</div>
            </div>
          ))}
        </div>

        {/* Link to full detail */}
        <Link
          href={`/stock/${stock.code}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-bg-2 hover:bg-bg-3 border border-border hover:border-border-hover text-sm font-semibold text-txt-1 transition-all"
        >
          查看完整個股頁面 →
        </Link>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Main Page ──────────────────────────────── */

export default function WorkspacePage() {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const { data: daily } = useSWR<DailyData>("/api/daily/latest", fetcher, {
    revalidateOnFocus: false,
  });

  // Batch EMA for all stocks
  const allCodes = useMemo(() => {
    if (!daily?.groups) return [];
    return daily.groups.flatMap((g) => g.stocks.map((s) => s.code));
  }, [daily]);

  const { data: emaData } = useSWR<Record<string, EmaResult>>(
    allCodes.length > 0 ? `/api/ema/batch?codes=${allCodes.join(",")}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Auto-select first stock when data loads
  useEffect(() => {
    if (!selectedCode && daily?.groups?.[0]?.stocks?.[0]) {
      setSelectedCode(daily.groups[0].stocks[0].code);
    }
  }, [daily, selectedCode]);

  // Keyboard navigation
  const flatStocks = useMemo(() => {
    if (!daily?.groups) return [] as (Stock & { groupColor: string; groupName: string })[];
    return daily.groups.flatMap((g) =>
      g.stocks.map((s) => ({ ...s, groupColor: g.color, groupName: g.name }))
    );
  }, [daily]);

  const filteredStocks = useMemo(() => {
    if (!search.trim()) return flatStocks;
    const q = search.toLowerCase();
    return flatStocks.filter(
      (s) => s.code.includes(q) || s.name.toLowerCase().includes(q)
    );
  }, [flatStocks, search]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!selectedCode) return;
      const idx = filteredStocks.findIndex((s) => s.code === selectedCode);
      if (e.key === "ArrowDown" && idx < filteredStocks.length - 1) {
        e.preventDefault();
        setSelectedCode(filteredStocks[idx + 1].code);
      } else if (e.key === "ArrowUp" && idx > 0) {
        e.preventDefault();
        setSelectedCode(filteredStocks[idx - 1].code);
      }
    },
    [selectedCode, filteredStocks]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const selectedStockInfo = flatStocks.find((s) => s.code === selectedCode);

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const totalStocks = daily?.groups?.reduce((n, g) => n + g.stocks.length, 0) ?? 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav stocks={flatStocks} />
      <NavBar />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Panel: Stock List ── */}
        <div className="w-[260px] flex-shrink-0 bg-bg-1 border-r border-border flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-txt-2">
                {daily?.date ?? "—"}
              </span>
              <span className="text-[10px] text-txt-4 tabular-nums">
                {totalStocks} 檔漲停
              </span>
            </div>
            {/* Search */}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋代號或名稱..."
              className="w-full bg-bg-2 border border-border rounded px-2.5 py-1.5 text-xs text-txt-1 placeholder:text-txt-4 outline-none focus:border-border-hover"
            />
          </div>

          {/* Stock list */}
          <div className="flex-1 overflow-y-auto">
            {!daily && (
              <div className="text-xs text-txt-4 text-center py-10">載入中...</div>
            )}

            {search.trim() ? (
              /* Search results (flat) */
              filteredStocks.length > 0 ? (
                filteredStocks.map((s) => (
                  <StockListItem
                    key={s.code}
                    stock={s}
                    groupColor={s.groupColor}
                    isSelected={selectedCode === s.code}
                    onSelect={() => setSelectedCode(s.code)}
                    emaSignal={emaData?.[s.code]}
                  />
                ))
              ) : (
                <div className="text-xs text-txt-4 text-center py-10">無結果</div>
              )
            ) : (
              /* Grouped view */
              daily?.groups?.map((group: StockGroup) => {
                const collapsed = collapsedGroups.has(group.name);
                return (
                  <div key={group.name}>
                    <button
                      onClick={() => toggleGroup(group.name)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 bg-bg-2 border-b border-border/50 hover:bg-bg-3 transition-colors"
                    >
                      <div
                        className="w-2 h-2 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                      <span className="text-[10px] font-bold text-txt-3 flex-1 text-left truncate">
                        {group.name}
                      </span>
                      <span className="text-[9px] text-txt-4 tabular-nums">
                        {group.stocks.length}
                      </span>
                      <span className="text-[9px] text-txt-4">{collapsed ? "▸" : "▾"}</span>
                    </button>
                    {!collapsed &&
                      group.stocks.map((stock) => (
                        <StockListItem
                          key={stock.code}
                          stock={stock}
                          groupColor={group.color}
                          isSelected={selectedCode === stock.code}
                          onSelect={() => setSelectedCode(stock.code)}
                          emaSignal={emaData?.[stock.code]}
                        />
                      ))}
                  </div>
                );
              })
            )}
          </div>

          {/* Keyboard hint */}
          <div className="px-3 py-2 border-t border-border flex-shrink-0">
            <div className="text-[9px] text-txt-4 text-center">↑↓ 鍵盤切換股票</div>
          </div>
        </div>

        {/* ── Right Panel: Analysis ── */}
        <div className="flex-1 overflow-hidden bg-bg-0">
          {selectedStockInfo ? (
            <StockAnalysisPanel
              stock={selectedStockInfo}
              groupName={selectedStockInfo.groupName}
              groupColor={selectedStockInfo.groupColor}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3">📊</div>
                <div className="text-txt-3 text-sm">點擊左側股票開始分析</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
