"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import Skeleton from "@/components/Skeleton";
import StarButton from "@/components/StarButton";
import { useWatchlist, todayISO } from "@/lib/useWatchlist";
import { EmaResult, getSignalLabel, getSignalColor } from "@/lib/ema";
import { formatPrice, formatPct } from "@/lib/utils";
import { signColor } from "@/lib/format";
import {
  Candle,
  findEntryClose,
  computeReturnPct,
  daysSince,
} from "@/lib/watchlistReturn";

// ─── API response shapes (subset we consume) ───────────────────
interface DailyStock {
  code: string;
  name: string;
  close: number;
  change_pct: number;
  volume: number;
  major_net: number;
  streak: number;
  market?: string;
}
interface DailyGroup {
  name: string;
  color: string;
  stocks: DailyStock[];
}
interface DailyLatest {
  date: string;
  groups: DailyGroup[];
}
interface FocusPick {
  code: string;
  name: string;
  score: number;
}
interface FocusData {
  topPicks?: FocusPick[];
  focusStocks?: FocusPick[];
}

// ─── EMA signal badge ──────────────────────────────────────────
function EmaBadge({ ema }: { ema?: EmaResult }) {
  if (!ema) return <span className="text-txt-4 text-[11px]">—</span>;
  const sc = getSignalColor(ema.signal);
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${sc.bg} ${sc.text} ${sc.border}`}>
      {getSignalLabel(ema.signal)}
    </span>
  );
}

export default function WatchlistClient() {
  const { entries, isWatched, toggle, count } = useWatchlist();

  const codes = useMemo(() => entries.map((e) => e.code), [entries]);
  const codesKey = useMemo(() => [...codes].sort().join(","), [codes]);

  // Current price / change from latest daily snapshot
  const {
    data: daily,
    error: dailyErr,
    isLoading: dailyLoading,
  } = useSWR<DailyLatest>("/api/daily/latest", fetcher, { revalidateOnFocus: false });

  // EMA signals (batched). Only fetch when we have codes.
  const { data: emaMap } = useSWR<Record<string, EmaResult>>(
    codes.length ? `/api/ema/batch?codes=${codesKey}` : null,
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  // Today's focus picks → for "是否在今日精選" flag
  const { data: focus } = useSWR<FocusData>("/api/focus", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  // Per-code history for entry price (P&L journal). One SWR key per code so a
  // single failing fetch only blanks that row, never the whole page.
  const histResults = useSWRHistories(codes);

  // Build a quick lookup of latest daily stock by code.
  const dailyByCode = useMemo(() => {
    const m = new Map<string, DailyStock & { groupColor: string }>();
    for (const g of daily?.groups ?? []) {
      for (const s of g.stocks) {
        if (!m.has(s.code)) m.set(s.code, { ...s, groupColor: g.color });
      }
    }
    return m;
  }, [daily]);

  const focusCodes = useMemo(() => {
    const set = new Set<string>();
    for (const p of focus?.topPicks ?? []) set.add(p.code);
    for (const p of focus?.focusStocks ?? []) set.add(p.code);
    return set;
  }, [focus]);

  const today = todayISO();

  // Build per-row view model.
  const rows = useMemo(() => {
    return entries.map((e) => {
      const d = dailyByCode.get(e.code);
      const ema = emaMap?.[e.code];
      const hist = histResults[e.code];
      const entryClose = hist?.data
        ? findEntryClose(hist.data as Candle[], e.addedAt)
        : null;
      const returnPct = computeReturnPct(d?.close, entryClose);
      return {
        code: e.code,
        addedAt: e.addedAt,
        name: d?.name ?? e.code,
        close: d?.close ?? null,
        changePct: d?.change_pct ?? null,
        groupColor: d?.groupColor ?? "#888",
        ema,
        inFocus: focusCodes.has(e.code),
        entryClose,
        returnPct,
        days: daysSince(e.addedAt, today),
        histLoading: hist ? hist.isLoading : false,
      };
    });
  }, [entries, dailyByCode, emaMap, histResults, focusCodes, today]);

  // Hit-rate card: among rows with a computable return, how many are positive.
  const hitStats = useMemo(() => {
    const withReturn = rows.filter((r) => r.returnPct != null);
    const positive = withReturn.filter((r) => (r.returnPct as number) > 0).length;
    const rate = withReturn.length ? (positive / withReturn.length) * 100 : null;
    return { total: count, evaluated: withReturn.length, positive, rate };
  }, [rows, count]);

  return (
    <>
      <TopNav />
      <NavBar />
      <main id="main" className="max-w-[1100px] mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-0">
            自選股
            {daily?.date && <span className="ml-2 text-sm font-normal text-txt-3">{daily.date}</span>}
          </h1>
          <p className="text-xs text-txt-4 mt-1">
            自選清單與損益日誌：現價、今日漲跌、EMA 訊號、是否在今日精選、以及自加入收盤價起算的報酬（研究紀錄，非建議）。
          </p>
        </div>

        {/* Loading */}
        {dailyLoading && count > 0 && <Skeleton />}

        {/* Error (current-price source failed) */}
        {dailyErr && (
          <div className="bg-bg-1 border border-border rounded-xl p-6 text-center">
            <p className="text-sm text-txt-1">無法載入即時報價</p>
            <p className="text-xs text-txt-4 mt-1">
              現價資料暫時無法取得，請稍後重試。EMA 與損益仍會在資料恢復後顯示。
            </p>
          </div>
        )}

        {/* Empty state */}
        {!dailyLoading && count === 0 && (
          <div className="bg-bg-1 border border-border rounded-xl p-10 text-center">
            <div className="text-4xl mb-3">⭐</div>
            <p className="text-sm font-semibold text-txt-1 mb-1">還沒有自選股</p>
            <p className="text-xs text-txt-4 mb-5">
              到精選頁點個股旁的星號 ⭐ 即可加入，這裡會自動記錄加入日並計算損益。
            </p>
            <Link
              href="/focus"
              className="inline-block px-4 py-2 bg-red/15 border border-red/30 rounded-lg text-xs font-semibold text-red hover:bg-red/25 transition-colors"
            >
              去精選頁加星 →
            </Link>
          </div>
        )}

        {/* Content */}
        {count > 0 && !dailyLoading && (
          <>
            {/* Hit-rate card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-bg-1 border border-border rounded-lg px-4 py-3 text-center">
                <div className="text-lg font-bold tabular-nums text-txt-0">{hitStats.total}</div>
                <div className="text-[10px] text-txt-4">自選檔數</div>
              </div>
              <div className="bg-bg-1 border border-border rounded-lg px-4 py-3 text-center">
                <div className="text-lg font-bold tabular-nums text-red">{hitStats.positive}</div>
                <div className="text-[10px] text-txt-4">自加入為正報酬</div>
              </div>
              <div className="bg-bg-1 border border-border rounded-lg px-4 py-3 text-center">
                <div className="text-lg font-bold tabular-nums text-txt-0">{hitStats.evaluated}</div>
                <div className="text-[10px] text-txt-4">可計算報酬</div>
              </div>
              <div className="bg-bg-1 border border-border rounded-lg px-4 py-3 text-center">
                <div className="text-lg font-bold tabular-nums text-amber">
                  {hitStats.rate != null ? `${hitStats.rate.toFixed(0)}%` : "—"}
                </div>
                <div className="text-[10px] text-txt-4">勝率</div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-bg-1 border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-bg-2 text-txt-3 border-b border-border">
                      <th className="w-8 px-2 py-2"></th>
                      <th className="text-left px-2 py-2">股票</th>
                      <th className="text-right px-2 py-2">現價</th>
                      <th className="text-right px-2 py-2">今日漲跌</th>
                      <th className="text-center px-2 py-2">EMA</th>
                      <th className="text-center px-2 py-2">今日精選</th>
                      <th className="text-right px-2 py-2">自加入報酬</th>
                      <th className="text-right px-2 py-2">加入天數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.code} className="border-b border-border/50 hover:bg-bg-2/50 transition-colors">
                        {/* Star (remove) */}
                        <td className="px-2 py-2 text-center">
                          <StarButton code={r.code} isWatched={isWatched(r.code)} onToggle={toggle} />
                        </td>
                        {/* Code + name */}
                        <td className="px-2 py-2">
                          <Link href={`/stock/${r.code}`} className="hover:underline">
                            <span className="font-mono font-semibold text-txt-1">{r.code}</span>
                            <span className="ml-1.5 text-txt-2">{r.name}</span>
                          </Link>
                        </td>
                        {/* Current price */}
                        <td className="text-right px-2 py-2 tabular-nums text-txt-1">
                          {r.close != null ? formatPrice(r.close) : <span className="text-txt-4">—</span>}
                        </td>
                        {/* Today change % — 台股漲紅跌綠 */}
                        <td className="text-right px-2 py-2 tabular-nums">
                          {r.changePct != null ? (
                            <span className={signColor(r.changePct)}>
                              {formatPct(r.changePct)}
                            </span>
                          ) : (
                            <span className="text-txt-4">—</span>
                          )}
                        </td>
                        {/* EMA */}
                        <td className="text-center px-2 py-2">
                          <EmaBadge ema={r.ema} />
                        </td>
                        {/* In today's focus */}
                        <td className="text-center px-2 py-2">
                          {r.inFocus ? (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber/15 text-amber border border-amber/30">
                              精選
                            </span>
                          ) : (
                            <span className="text-txt-4 text-[11px]">—</span>
                          )}
                        </td>
                        {/* Return since added */}
                        <td className="text-right px-2 py-2 tabular-nums">
                          {r.returnPct != null ? (
                            <span className={signColor(r.returnPct)}>
                              {formatPct(r.returnPct)}
                            </span>
                          ) : r.histLoading ? (
                            <span className="text-txt-4">…</span>
                          ) : (
                            <span className="text-txt-4" title="加入日不明或歷史資料不足">—</span>
                          )}
                        </td>
                        {/* Days held */}
                        <td className="text-right px-2 py-2 tabular-nums text-txt-2">
                          {r.days != null ? `${r.days} 天` : <span className="text-txt-4">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[10px] text-txt-4 text-center">
              「自加入報酬」以加入日（或其後最早交易日）收盤價為進場基準，對比最新收盤價計算，僅供個人紀錄參考，非建議。加入日不明（早期自選股）以「—」表示。
            </p>
          </>
        )}
      </main>
    </>
  );
}

// ─── Per-code history hook ─────────────────────────────────────
// SWR rules forbid calling hooks in a loop with variable length, so we cap at a
// fixed number of slots and bind each slot to a code. Watchlists are small.
const MAX_TRACKED = 60;

interface HistResult {
  data: Candle[] | undefined;
  isLoading: boolean;
}

function useSWRHistories(codes: string[]): Record<string, HistResult> {
  const slots: HistResult[] = [];
  for (let i = 0; i < MAX_TRACKED; i++) {
    const code = codes[i];
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const res = useSWR<Candle[]>(
      code ? `/api/stock/${code}/history` : null,
      fetcher,
      { revalidateOnFocus: false, shouldRetryOnError: false }
    );
    slots.push({ data: res.data, isLoading: res.isLoading });
  }
  const out: Record<string, HistResult> = {};
  codes.slice(0, MAX_TRACKED).forEach((code, i) => {
    out[code] = slots[i];
  });
  return out;
}
