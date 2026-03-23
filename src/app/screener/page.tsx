"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { formatPct, formatPrice } from "@/lib/utils";

/* ================================================================
   TYPES
   ================================================================ */

type FilterMode = "value" | "growth" | "technical" | "momentum";

interface Stock {
  code: string;
  name: string;
  close: number;
  change: number;
  volume: number;
  pe: number;
  roe: number;
  revenueYoY: number;
  foreignNet: number;
  score: number;
}

/* ================================================================
   MOCK DATA
   ================================================================ */

const MODE_LABELS: Record<FilterMode, string> = {
  value: "價值型",
  growth: "成長型",
  technical: "技術面",
  momentum: "動能型",
};

const PRESETS = [
  "外資連買強勢股",
  "營收高成長",
  "技術面突破",
  "低估值好股",
];

const MOCK_STOCKS: Stock[] = [
  { code: "2330", name: "台積電",   close: 1840, change: 2.15,  volume: 32500, pe: 26.8, roe: 30.2, revenueYoY: 38.5, foreignNet: 15200, score: 94 },
  { code: "2454", name: "聯發科",   close: 1700, change: 1.85,  volume: 7800,  pe: 19.5, roe: 24.1, revenueYoY: 32.4, foreignNet: 5100,  score: 90 },
  { code: "2317", name: "鴻海",     close: 178,  change: 3.48,  volume: 48200, pe: 11.8, roe: 13.9, revenueYoY: 15.6, foreignNet: 7500,  score: 83 },
  { code: "6669", name: "緯穎",     close: 3775, change: 4.12,  volume: 1850,  pe: 24.3, roe: 28.7, revenueYoY: 45.2, foreignNet: 1200,  score: 93 },
  { code: "3017", name: "奇鋐",     close: 329,  change: 5.45,  volume: 12300, pe: 16.2, roe: 19.5, revenueYoY: 28.9, foreignNet: 3800,  score: 86 },
  { code: "3324", name: "雙鴻",     close: 1065, change: 3.90,  volume: 4200,  pe: 21.5, roe: 25.8, revenueYoY: 35.7, foreignNet: 1650,  score: 89 },
  { code: "6515", name: "穎崴",     close: 7930, change: 2.72,  volume: 680,   pe: 35.2, roe: 32.1, revenueYoY: 42.3, foreignNet: 420,   score: 88 },
  { code: "6223", name: "旺矽",     close: 3860, change: 1.84,  volume: 950,   pe: 28.6, roe: 27.4, revenueYoY: 22.8, foreignNet: 380,   score: 82 },
  { code: "5274", name: "信驊",     close: 2890, change: 2.31,  volume: 1100,  pe: 42.5, roe: 35.8, revenueYoY: 18.5, foreignNet: 650,   score: 80 },
  { code: "4743", name: "合一",     close: 328,  change: 6.15,  volume: 15800, pe: 48.3, roe: 12.5, revenueYoY: 72.6, foreignNet: -1200, score: 72 },
  { code: "6446", name: "藥華藥",   close: 485,  change: -1.82, volume: 9500,  pe: 52.8, roe: 9.8,  revenueYoY: 68.4, foreignNet: -950,  score: 58 },
  { code: "1301", name: "台塑",     close: 42.8, change: 0.94,  volume: 22100, pe: 15.2, roe: 6.8,  revenueYoY: -8.5, foreignNet: -4200, score: 45 },
  { code: "1303", name: "南亞",     close: 38.5, change: 0.52,  volume: 18600, pe: 18.7, roe: 5.2,  revenueYoY: -12.3,foreignNet: -3500, score: 42 },
  { code: "6274", name: "台燿",     close: 142,  change: 4.41,  volume: 8200,  pe: 12.8, roe: 17.5, revenueYoY: 22.1, foreignNet: 1100,  score: 79 },
  { code: "2376", name: "技嘉",     close: 378,  change: 3.28,  volume: 9800,  pe: 14.5, roe: 20.3, revenueYoY: 25.8, foreignNet: 2800,  score: 84 },
];

/* ================================================================
   SUB-COMPONENTS
   ================================================================ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-txt-0 tracking-tight mb-4 flex items-center gap-2">
      <span className="w-1 h-4 bg-red rounded-full inline-block" />
      {children}
    </h2>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-bg-1 border border-border rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-red" : score >= 60 ? "bg-amber" : "bg-blue";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-bg-3 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-txt-2 w-6 text-right">{score}</span>
    </div>
  );
}

/* ================================================================
   MAIN PAGE
   ================================================================ */

export default function ScreenerPage() {
  const [mode, setMode] = useState<FilterMode>("technical");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sortCol, setSortCol] = useState<keyof Stock>("score");
  const [sortAsc, setSortAsc] = useState(false);

  // Technical filters
  const [kMin, setKMin] = useState(0);
  const [kMax, setKMax] = useState(100);
  const [rsiMin, setRsiMin] = useState(0);
  const [rsiMax, setRsiMax] = useState(100);
  const [maBiasMin, setMaBiasMin] = useState("");
  const [maBiasMax, setMaBiasMax] = useState("");
  const [institution, setInstitution] = useState("all");
  const [revenueMin, setRevenueMin] = useState("");
  const [daytradingMax, setDaytradingMax] = useState("");

  // Value filters
  const [roeMin, setRoeMin] = useState("14.5");
  const [profitMin, setProfitMin] = useState("5");
  const [peMax, setPeMax] = useState("");

  // Growth filters
  const [growthYears, setGrowthYears] = useState("2");
  const [roeTrend, setRoeTrend] = useState("up");

  // Momentum filters
  const [gainMin, setGainMin] = useState("");
  const [volumeRatioMin, setVolumeRatioMin] = useState("");
  const [streakMin, setStreakMin] = useState("");

  const sorted = useMemo(() => {
    const arr = [...MOCK_STOCKS];
    arr.sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (typeof va === "number" && typeof vb === "number") {
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [sortCol, sortAsc]);

  function handleSort(col: keyof Stock) {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  }

  function resetFilters() {
    setKMin(0); setKMax(100);
    setRsiMin(0); setRsiMax(100);
    setMaBiasMin(""); setMaBiasMax("");
    setInstitution("all");
    setRevenueMin(""); setDaytradingMax("");
    setRoeMin("14.5"); setProfitMin("5"); setPeMax("");
    setGrowthYears("2"); setRoeTrend("up");
    setGainMin(""); setVolumeRatioMin(""); setStreakMin("");
  }

  const SortIcon = ({ col }: { col: keyof Stock }) => (
    <span className="text-[8px] text-txt-4 ml-0.5">
      {sortCol === col ? (sortAsc ? "▲" : "▼") : "▽"}
    </span>
  );

  const columns: { key: keyof Stock; label: string; align?: string }[] = [
    { key: "code",       label: "代號" },
    { key: "name",       label: "名稱" },
    { key: "close",      label: "收盤價",        align: "right" },
    { key: "change",     label: "漲跌幅",        align: "right" },
    { key: "volume",     label: "成交量(張)",     align: "right" },
    { key: "pe",         label: "本益比",        align: "right" },
    { key: "roe",        label: "ROE%",          align: "right" },
    { key: "revenueYoY", label: "月營收YoY%",    align: "right" },
    { key: "foreignNet", label: "外資淨買(張)",   align: "right" },
    { key: "score",      label: "評分" },
  ];

  return (
    <div className="min-h-screen bg-bg-0 text-txt-1">
      <TopNav currentDate="2026-03-20" />
      <NavBar />

      <main className="max-w-7xl mx-auto px-4 pt-20 pb-16 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-0 tracking-tight">進階選股</h1>
          <p className="text-xs text-txt-3 mt-1">多條件篩選漲停股</p>
        </div>

        {/* Filter Panel */}
        <Card>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="w-full flex items-center justify-between text-sm font-semibold text-txt-0 mb-3"
          >
            <span>篩選條件</span>
            <span className="text-txt-4 text-xs">{filtersOpen ? "收起 ▲" : "展開 ▼"}</span>
          </button>

          {filtersOpen && (
            <div className="space-y-4">
              {/* Mode Tabs */}
              <div className="flex gap-1 bg-bg-2 rounded-lg p-1">
                {(Object.keys(MODE_LABELS) as FilterMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                      mode === m
                        ? "bg-red text-white"
                        : "text-txt-3 hover:text-txt-1"
                    }`}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>

              {/* Technical Filters */}
              {mode === "technical" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="text-txt-3 block mb-1">KD 範圍 (K值)</label>
                    <div className="flex items-center gap-2">
                      <input type="number" value={kMin} onChange={(e) => setKMin(Number(e.target.value))}
                        className="w-20 bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="0" />
                      <span className="text-txt-4">-</span>
                      <input type="number" value={kMax} onChange={(e) => setKMax(Number(e.target.value))}
                        className="w-20 bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="100" />
                    </div>
                  </div>
                  <div>
                    <label className="text-txt-3 block mb-1">RSI 範圍</label>
                    <div className="flex items-center gap-2">
                      <input type="number" value={rsiMin} onChange={(e) => setRsiMin(Number(e.target.value))}
                        className="w-20 bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="0" />
                      <span className="text-txt-4">-</span>
                      <input type="number" value={rsiMax} onChange={(e) => setRsiMax(Number(e.target.value))}
                        className="w-20 bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="100" />
                    </div>
                  </div>
                  <div>
                    <label className="text-txt-3 block mb-1">均線偏離 (MA20 %)</label>
                    <div className="flex items-center gap-2">
                      <input type="number" value={maBiasMin} onChange={(e) => setMaBiasMin(e.target.value)}
                        className="w-20 bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="min" />
                      <span className="text-txt-4">-</span>
                      <input type="number" value={maBiasMax} onChange={(e) => setMaBiasMax(e.target.value)}
                        className="w-20 bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="max" />
                    </div>
                  </div>
                  <div>
                    <label className="text-txt-3 block mb-1">法人動向</label>
                    <select value={institution} onChange={(e) => setInstitution(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1">
                      <option value="all">全部</option>
                      <option value="foreign_buy">外資買超</option>
                      <option value="trust_buy">投信買超</option>
                      <option value="foreign_sell">外資賣超</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-txt-3 block mb-1">月營收年增率 (min %)</label>
                    <input type="number" value={revenueMin} onChange={(e) => setRevenueMin(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="e.g. 20" />
                  </div>
                  <div>
                    <label className="text-txt-3 block mb-1">當沖比 (max %)</label>
                    <input type="number" value={daytradingMax} onChange={(e) => setDaytradingMax(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="e.g. 50" />
                  </div>
                </div>
              )}

              {/* Value Filters */}
              {mode === "value" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="text-txt-3 block mb-1">ROE min (%)</label>
                    <input type="number" value={roeMin} onChange={(e) => setRoeMin(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="14.5" />
                  </div>
                  <div>
                    <label className="text-txt-3 block mb-1">淨利 min (億)</label>
                    <input type="number" value={profitMin} onChange={(e) => setProfitMin(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="5" />
                  </div>
                  <div>
                    <label className="text-txt-3 block mb-1">本益比 max</label>
                    <input type="number" value={peMax} onChange={(e) => setPeMax(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="e.g. 20" />
                  </div>
                </div>
              )}

              {/* Growth Filters */}
              {mode === "growth" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-txt-3 block mb-1">營收連續成長</label>
                    <select value={growthYears} onChange={(e) => setGrowthYears(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1">
                      <option value="2">2 年</option>
                      <option value="3">3 年</option>
                      <option value="5">5 年</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-txt-3 block mb-1">ROE 趨勢</label>
                    <select value={roeTrend} onChange={(e) => setRoeTrend(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1">
                      <option value="up">向上</option>
                      <option value="flat">持平</option>
                      <option value="any">不限</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Momentum Filters */}
              {mode === "momentum" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="text-txt-3 block mb-1">漲幅 min (%)</label>
                    <input type="number" value={gainMin} onChange={(e) => setGainMin(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="e.g. 5" />
                  </div>
                  <div>
                    <label className="text-txt-3 block mb-1">量比 min</label>
                    <input type="number" value={volumeRatioMin} onChange={(e) => setVolumeRatioMin(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="e.g. 2" />
                  </div>
                  <div>
                    <label className="text-txt-3 block mb-1">連板天數 min</label>
                    <input type="number" value={streakMin} onChange={(e) => setStreakMin(e.target.value)}
                      className="w-full bg-bg-2 border border-border rounded px-2 py-1 text-txt-1" placeholder="e.g. 2" />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
                <button className="px-4 py-1.5 bg-red text-white text-xs font-medium rounded-md hover:bg-red/90 transition-colors">
                  篩選
                </button>
                <button onClick={resetFilters}
                  className="px-4 py-1.5 bg-bg-2 text-txt-2 text-xs font-medium rounded-md hover:bg-bg-3 transition-colors">
                  重置
                </button>
                <div className="h-4 w-px bg-border" />
                {PRESETS.map((p) => (
                  <button key={p}
                    className="px-3 py-1 bg-bg-2 text-txt-3 text-[10px] rounded-full hover:text-txt-1 hover:bg-bg-3 transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-txt-3">
            共 <span className="text-txt-0 font-semibold">{sorted.length}</span> 檔符合條件
          </p>
          <button
            disabled
            className="px-3 py-1 bg-bg-2 text-txt-4 text-[10px] rounded-md cursor-not-allowed flex items-center gap-1"
          >
            CSV 匯出 <span className="text-[8px]">(即將推出)</span>
          </button>
        </div>

        {/* Results Table */}
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-3 py-3 font-medium text-txt-3 cursor-pointer hover:text-txt-1 whitespace-nowrap select-none ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.label}
                    <SortIcon col={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.code} className="border-b border-border/50 hover:bg-bg-2/50 transition-colors">
                  <td className="px-3 py-2.5">
                    <Link href={`/stock/${s.code}`} className="text-accent hover:underline font-mono">
                      {s.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-txt-1 font-medium">{s.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-txt-1">{formatPrice(s.close)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono ${s.change >= 0 ? "text-red" : "text-green"}`}>
                    {formatPct(s.change)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-txt-2">
                    {s.volume.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-txt-2">{s.pe.toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-txt-2">{s.roe.toFixed(1)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono ${s.revenueYoY >= 0 ? "text-red" : "text-green"}`}>
                    {s.revenueYoY >= 0 ? "+" : ""}{s.revenueYoY.toFixed(1)}%
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono ${s.foreignNet >= 0 ? "text-red" : "text-green"}`}>
                    {s.foreignNet >= 0 ? "+" : ""}{s.foreignNet.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <ScoreBar score={s.score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}
