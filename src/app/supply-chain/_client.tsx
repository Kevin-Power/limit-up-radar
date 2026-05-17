"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";

interface AnchorItem {
  code: string;
  name: string;
  role: string;
  theme: string;
}

interface RelatedStock {
  code: string;
  name: string;
  role: string;
  close?: number;
  changePct?: number;
  volume?: number;
  isLimitUp?: boolean;
  group?: string;
}

interface ChainData {
  code: string;
  name: string;
  role: string;
  theme: string;
  dataDate: string | null;
  upstream: RelatedStock[];
  downstream: RelatedStock[];
  peers: RelatedStock[];
  summary: {
    upstreamCount: number;
    downstreamCount: number;
    peersCount: number;
    upstreamLimitUps: number;
    downstreamLimitUps: number;
    peersLimitUps: number;
  };
}

interface AnchorList {
  total: number;
  anchors: AnchorItem[];
  byTheme: Record<string, AnchorItem[]>;
}

const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

function StockCard({ s }: { s: RelatedStock }) {
  const hasLive = s.changePct != null;
  const isUp = (s.changePct ?? 0) > 0;
  const isDown = (s.changePct ?? 0) < 0;
  return (
    <Link
      href={`/stock/${s.code}`}
      className={`block rounded-lg p-3 border transition-all hover:border-border-hover ${
        s.isLimitUp
          ? "bg-red/10 border-red/40"
          : "bg-bg-2 border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="font-mono text-xs font-bold text-txt-0">{s.code}</span>
            <span className="text-xs text-txt-1 truncate">{s.name}</span>
            {s.isLimitUp && (
              <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-red text-white">漲停</span>
            )}
          </div>
          <div className="text-[10px] text-txt-4 truncate">{s.role}</div>
        </div>
        {hasLive && (
          <div className="text-right flex-shrink-0">
            <div className="text-xs font-bold tabular-nums text-txt-0">{s.close}</div>
            <div className={`text-[10px] tabular-nums ${isUp ? "text-red" : isDown ? "text-green" : "text-txt-4"}`}>
              {isUp ? "+" : ""}{s.changePct}%
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

function ChainColumn({ title, color, stocks, emptyText }: {
  title: string;
  color: string;
  stocks: RelatedStock[];
  emptyText: string;
}) {
  const limitUpCount = stocks.filter((s) => s.isLimitUp).length;
  return (
    <div className="bg-bg-1 border border-border rounded-xl p-4 flex-1 min-w-[260px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold" style={{ color }}>{title}</h3>
        <div className="text-[10px] text-txt-4 tabular-nums">
          {stocks.length} 檔{limitUpCount > 0 && <span className="ml-1 text-red font-bold">· {limitUpCount} 漲停</span>}
        </div>
      </div>
      {stocks.length === 0 ? (
        <div className="text-xs text-txt-4 text-center py-6">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {stocks.map((s) => <StockCard key={s.code} s={s} />)}
        </div>
      )}
    </div>
  );
}

export default function SupplyChainClient() {
  const { data: anchorList } = useSWR<AnchorList>("/api/supply-chain", fetcher);
  const [selectedCode, setSelectedCode] = useState<string>("2330");
  const [search, setSearch] = useState("");

  const { data: chain, error: chainError, isLoading } = useSWR<ChainData>(
    `/api/supply-chain/${selectedCode}`,
    fetcher
  );

  const filteredAnchors = anchorList?.anchors.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.code.includes(q) || a.name.toLowerCase().includes(q) || a.theme.toLowerCase().includes(q);
  }) ?? [];

  return (
    <>
      <TopNav />
      <NavBar />
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-txt-0">
              供應鏈追蹤
              {chain && <span className="ml-2 text-sm font-normal text-txt-3">{chain.code} {chain.name}</span>}
            </h1>
            <p className="text-xs text-txt-4 mt-1">
              點選龍頭股 → 即時看上下游/同業表現，找出族群連動的買賣訊號
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/supply-chain/map"
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber/80 to-red/80 text-white text-xs font-bold hover:brightness-110 transition-all whitespace-nowrap"
              title="91 節點 Bloomberg SPLC 風格互動地圖"
            >
              🗺️ 完整供應鏈地圖
            </Link>
            {chain?.dataDate && (
              <div className="text-[11px] text-txt-4">資料: <span className="text-txt-2 font-mono">{chain.dataDate}</span></div>
            )}
          </div>
        </div>

        {/* Anchor selector */}
        <div className="bg-bg-1 border border-border rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
            <h2 className="text-sm font-bold text-txt-0">選擇龍頭股 ({anchorList?.total ?? "—"})</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋代號/名稱/主題"
              className="flex-1 sm:max-w-xs bg-bg-2 border border-border rounded-md px-3 py-1.5 text-xs text-txt-1 outline-none focus:border-border-hover placeholder:text-txt-4"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filteredAnchors.map((a) => {
              const isActive = a.code === selectedCode;
              return (
                <button
                  key={a.code}
                  onClick={() => setSelectedCode(a.code)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-red text-white"
                      : "bg-bg-2 border border-border text-txt-2 hover:border-border-hover hover:text-txt-0"
                  }`}
                  title={`${a.theme} · ${a.role}`}
                >
                  <span className="font-mono mr-1">{a.code}</span>{a.name}
                </button>
              );
            })}
            {filteredAnchors.length === 0 && (
              <span className="text-xs text-txt-4">無符合條件的龍頭股</span>
            )}
          </div>
        </div>

        {/* Loading state */}
        {isLoading && <div className="text-center py-12 text-txt-3">載入供應鏈資料...</div>}
        {chainError && <div className="text-center py-12 text-red">資料載入失敗，請稍後再試</div>}

        {/* Chain display */}
        {chain && (
          <>
            {/* Anchor info */}
            <div className="bg-gradient-to-br from-red/10 via-amber/5 to-red/10 border-2 border-red/30 rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-lg font-bold text-red">{chain.code}</span>
                    <span className="text-2xl font-extrabold text-txt-0">{chain.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber/20 text-amber">{chain.theme}</span>
                  </div>
                  <p className="text-sm text-txt-2">{chain.role}</p>
                </div>
                <Link
                  href={`/stock/${chain.code}`}
                  className="px-3 py-1.5 rounded-lg bg-red text-white text-xs font-semibold hover:brightness-110 transition-all whitespace-nowrap"
                >
                  個股詳情 →
                </Link>
              </div>

              {/* Quick summary */}
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border/50">
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums text-blue">
                    {chain.summary.upstreamCount}
                    {chain.summary.upstreamLimitUps > 0 && (
                      <span className="ml-1 text-sm text-red">/{chain.summary.upstreamLimitUps}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-txt-4">上游 {chain.summary.upstreamLimitUps > 0 && "(漲停數)"}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums text-amber">
                    {chain.summary.peersCount}
                    {chain.summary.peersLimitUps > 0 && (
                      <span className="ml-1 text-sm text-red">/{chain.summary.peersLimitUps}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-txt-4">同業 {chain.summary.peersLimitUps > 0 && "(漲停數)"}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold tabular-nums text-green">
                    {chain.summary.downstreamCount}
                    {chain.summary.downstreamLimitUps > 0 && (
                      <span className="ml-1 text-sm text-red">/{chain.summary.downstreamLimitUps}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-txt-4">下游 {chain.summary.downstreamLimitUps > 0 && "(漲停數)"}</div>
                </div>
              </div>
            </div>

            {/* 3 columns: upstream | anchor (showing peers) | downstream */}
            <div className="flex flex-col lg:flex-row gap-4">
              <ChainColumn
                title="🔵 上游 (供應商)"
                color="#3b82f6"
                stocks={chain.upstream}
                emptyText="未建立上游資料"
              />
              <ChainColumn
                title="🟡 同業 (競爭者)"
                color="#f59e0b"
                stocks={chain.peers}
                emptyText="未建立同業資料"
              />
              <ChainColumn
                title="🟢 下游 (客戶)"
                color="#22c55e"
                stocks={chain.downstream}
                emptyText="未建立下游資料"
              />
            </div>

            {/* Methodology note */}
            <div className="text-[10px] text-txt-4 text-center pt-2 leading-relaxed">
              供應鏈資料依公開年報、產業關係整理。今日表現拉自最新交易日 limit-up 資料 ({chain.dataDate})。
              <br />
              注：未在今日漲停清單的相關股無即時價格顯示。
            </div>
          </>
        )}
      </main>
    </>
  );
}
