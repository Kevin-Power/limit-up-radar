// /api/supply-chain/[code]
//
// Returns the supply chain map for an anchor stock, enriched with today's
// market data (limit-up status, close, change%, group) so the UI can show
// "upstream/downstream/peer is hot today" at a glance.
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { listDailyFiles, loadDailyFile } from "@/lib/data-files";

interface Related {
  code: string;
  name: string;
  role: string;
  // enriched fields
  close?: number;
  changePct?: number;
  volume?: number;
  isLimitUp?: boolean;
  group?: string;
}

interface AnchorEntry {
  name: string;
  role: string;
  theme: string;
  upstream: Related[];
  downstream: Related[];
  peers: Related[];
  _skip?: boolean;
}

const ANCHORS_PATH = path.join(process.cwd(), "data", "supply-chain", "anchors.json");

function loadAnchors(): Record<string, AnchorEntry> {
  try {
    const raw = fs.readFileSync(ANCHORS_PATH, "utf-8");
    const data = JSON.parse(raw);
    return data.anchors ?? {};
  } catch {
    return {};
  }
}

function loadLatestDaily(): { date: string; stockMap: Map<string, { close: number; change_pct: number; volume: number; group: string; isLimitUp: boolean }> } | null {
  try {
    const files = listDailyFiles();
    if (!files.length) return null;
    const data = loadDailyFile<{ date: string; groups?: { name: string; stocks?: { code: string; close: number; change_pct: number; volume: number }[] }[] }>(files[0]);
    if (!data) return null;
    const map = new Map<string, { close: number; change_pct: number; volume: number; group: string; isLimitUp: boolean }>();
    for (const g of data.groups ?? []) {
      for (const s of g.stocks ?? []) {
        map.set(s.code, {
          close: s.close,
          change_pct: s.change_pct,
          volume: s.volume,
          group: g.name,
          isLimitUp: true,
        });
      }
    }
    return { date: data.date, stockMap: map };
  } catch {
    return null;
  }
}

function enrich(rel: Related, stockMap: Map<string, { close: number; change_pct: number; volume: number; group: string; isLimitUp: boolean }>): Related {
  const live = stockMap.get(rel.code);
  if (!live) return rel;
  return {
    ...rel,
    close: live.close,
    changePct: live.change_pct,
    volume: live.volume,
    isLimitUp: live.isLimitUp,
    group: live.group,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  if (!/^\d{4,6}[A-Z]?$/.test(code)) {
    return NextResponse.json({ error: "invalid code" }, { status: 400 });
  }

  const anchors = loadAnchors();
  const entry = anchors[code];

  if (!entry || entry._skip) {
    return NextResponse.json(
      {
        error: "anchor not found",
        availableAnchors: Object.entries(anchors)
          .filter(([, v]) => !v._skip)
          .map(([c, v]) => ({ code: c, name: v.name, theme: v.theme })),
      },
      { status: 404 }
    );
  }

  const daily = loadLatestDaily();
  const stockMap = daily?.stockMap ?? new Map();

  const result = {
    code,
    name: entry.name,
    role: entry.role,
    theme: entry.theme,
    dataDate: daily?.date ?? null,
    upstream: entry.upstream.map((r) => enrich(r, stockMap)),
    downstream: entry.downstream.map((r) => enrich(r, stockMap)),
    peers: entry.peers.map((r) => enrich(r, stockMap)),
    // Quick stats
    summary: {
      upstreamCount: entry.upstream.length,
      downstreamCount: entry.downstream.length,
      peersCount: entry.peers.length,
      upstreamLimitUps: entry.upstream.filter((r) => stockMap.has(r.code)).length,
      downstreamLimitUps: entry.downstream.filter((r) => stockMap.has(r.code)).length,
      peersLimitUps: entry.peers.filter((r) => stockMap.has(r.code)).length,
    },
  };

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
