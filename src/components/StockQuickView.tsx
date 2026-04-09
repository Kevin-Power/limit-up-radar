"use client";

import useSWR from "swr";
import Link from "next/link";
import { Stock } from "@/lib/types";
import { EmaResult, getSignalLabel, getSignalColor } from "@/lib/ema";
import { formatPrice, formatPct, formatNumber } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ChipData {
  foreign3d: number[];
  trust3d: number[];
  dealer3d: number[];
  isReal: boolean;
}

function MiniEmaChart({
  prices,
  ema11,
  ema24,
}: {
  prices: number[];
  ema11: number[];
  ema24: number[];
}) {
  const W = 260;
  const H = 72;
  const n = Math.min(prices.length, 60);
  const pData = prices.slice(-n);
  const e11 = ema11.slice(-n);
  const e24 = ema24.slice(-n);

  const allVals = [...pData, ...e11, ...e24].filter(Boolean);
  if (allVals.length < 2) return null;

  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  const x = (i: number) => ((i / (n - 1)) * W).toFixed(1);
  const y = (v: number) => (H - ((v - min) / range) * (H - 4) - 2).toFixed(1);

  const mkPath = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block"
    >
      <path d={mkPath(pData)} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
      <path d={mkPath(e11)} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.85" />
      <path d={mkPath(e24)} fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.85" />
    </svg>
  );
}

function ChipRow({ label, values }: { label: string; values: number[] }) {
  if (!values || values.length === 0) return null;
  // API returns newest-first; reverse to display oldest→newest (left→right)
  const ordered = [...values].reverse();
  const total = values.reduce((a, b) => a + b, 0);
  const maxAbs = Math.max(...values.map(Math.abs), 1);
  const allLabels = ["前日", "昨日", "今日"];
  const dateLabels = allLabels.slice(0, ordered.length);

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="text-[11px] text-txt-3 w-12 flex-shrink-0">{label}</div>
      <div className="flex gap-1 flex-1 items-end" style={{ height: 28 }}>
        {ordered.map((v, i) => {
          const barH = Math.max((Math.abs(v) / maxAbs) * 24, 3);
          return (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${barH}px`,
                backgroundColor:
                  v >= 0 ? "rgba(239,68,68,0.55)" : "rgba(34,197,94,0.55)",
              }}
              title={`${dateLabels[i]}: ${v > 0 ? "+" : ""}${formatNumber(v)}`}
            />
          );
        })}
      </div>
      <div
        className={`text-[11px] font-bold tabular-nums w-16 text-right flex-shrink-0 ${
          total > 0 ? "text-red" : total < 0 ? "text-green" : "text-txt-4"
        }`}
      >
        {total === 0 ? "—" : `${total > 0 ? "+" : ""}${formatNumber(total)}`}
      </div>
    </div>
  );
}

export default function StockQuickView({
  stock,
  emaResult,
  onClose,
}: {
  stock: Stock;
  emaResult?: EmaResult;
  onClose: () => void;
}) {
  const { data: chip } = useSWR<ChipData>(
    `/api/stock/${stock.code}/chip`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const signal = emaResult?.signal;
  const sc = signal ? getSignalColor(signal) : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-border flex-shrink-0">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-txt-4 tabular-nums">{stock.code}</span>
            <span className="text-sm font-bold text-txt-0">{stock.name}</span>
            {stock.industry && (
              <span className="text-[10px] text-txt-4 bg-bg-3 px-1.5 py-0.5 rounded">
                {stock.industry}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-bold text-red tabular-nums">
              {formatPrice(stock.close)}
            </span>
            <span className="text-[11px] font-semibold text-red bg-red-bg px-1.5 py-0.5 rounded tabular-nums">
              {formatPct(stock.change_pct)}
            </span>
            {stock.streak > 1 && (
              <span className="text-[10px] font-bold text-amber tabular-nums">
                {stock.streak}連板
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-txt-4 hover:text-txt-1 transition-colors text-xl leading-none p-1.5 rounded hover:bg-bg-3"
          aria-label="關閉"
        >
          ×
        </button>
      </div>

      {/* EMA chart */}
      {emaResult && (
        <div className="px-3.5 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-txt-4">
              走勢圖
            </span>
            <div className="flex gap-3 text-[10px] text-txt-4">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 bg-red rounded" /> EMA11
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 bg-green rounded" /> EMA24
              </span>
            </div>
          </div>
          <div className="rounded overflow-hidden bg-bg-2 px-1 py-1">
            <MiniEmaChart
              prices={emaResult.prices}
              ema11={emaResult.ema11Series}
              ema24={emaResult.ema24Series}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            {signal && sc ? (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${sc.bg} ${sc.text} ${sc.border}`}
              >
                {getSignalLabel(signal)}
              </span>
            ) : (
              <span />
            )}
            {emaResult.crossoverDay !== undefined && emaResult.crossoverDay >= 0 && emaResult.crossoverDay <= 60 && (
              <span className="text-[10px] text-txt-4">
                {emaResult.crossoverDay === 0
                  ? "今日交叉"
                  : `${emaResult.crossoverDay} 天前交叉`}
              </span>
            )}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] tabular-nums">
            <span className="text-txt-4">
              EMA11{" "}
              <span className="text-red font-semibold">
                {emaResult.ema11.toFixed(2)}
              </span>
            </span>
            <span className="text-txt-4">
              EMA24{" "}
              <span className="text-green font-semibold">
                {emaResult.ema24.toFixed(2)}
              </span>
            </span>
          </div>
        </div>
      )}

      {!emaResult && (
        <div className="px-3.5 py-3 border-b border-border text-xs text-txt-4 flex-shrink-0">
          EMA 資料不足（需 30 個交易日）
        </div>
      )}

      {/* Chip data */}
      <div className="px-3.5 py-3 border-b border-border flex-shrink-0">
        <div className="text-[10px] font-bold uppercase tracking-widest text-txt-4 mb-2">
          三大法人 (近3日)
        </div>
        {!chip ? (
          <div className="text-xs text-txt-4 py-2">載入中...</div>
        ) : chip.isReal ? (
          <>
            <ChipRow label="外資" values={chip.foreign3d} />
            <ChipRow label="投信" values={chip.trust3d} />
            <ChipRow label="自營商" values={chip.dealer3d} />
          </>
        ) : (
          <div className="text-xs text-txt-4 py-2">暫無籌碼資料</div>
        )}
      </div>

      {/* Stats */}
      <div className="px-3.5 py-3 border-b border-border flex-shrink-0">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] text-txt-4 mb-0.5">成交量</div>
            <div className="text-xs text-txt-1 tabular-nums font-semibold">
              {formatNumber(stock.volume)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-txt-4 mb-0.5">主力淨買</div>
            <div
              className={`text-xs font-semibold tabular-nums ${
                stock.major_net === 0
                  ? "text-txt-4"
                  : stock.major_net > 0
                  ? "text-red"
                  : "text-green"
              }`}
            >
              {stock.major_net === 0 ? "—" : `${stock.major_net > 0 ? "+" : ""}${formatNumber(stock.major_net)}`}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-txt-4 mb-0.5">連板</div>
            <div className="text-xs text-txt-1 tabular-nums font-semibold">
              {stock.streak > 0 ? `${stock.streak} 天` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Link to full detail */}
      <div className="px-3.5 py-3 flex-shrink-0">
        <Link
          href={`/stock/${stock.code}`}
          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-md bg-bg-2 hover:bg-bg-3 border border-border hover:border-border-hover text-xs font-semibold text-txt-1 transition-all"
        >
          查看完整分析
          <span className="text-txt-4">→</span>
        </Link>
      </div>
    </div>
  );
}
