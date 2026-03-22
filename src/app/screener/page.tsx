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
  { code: "2330", name: "台積電",   close: 985,  change: 3.25,  volume: 38420, pe: 28.5, roe: 29.1, revenueYoY: 35.2, foreignNet: 12500, score: 92 },
  { code: "2454", name: "聯發科",   close: 1380, change: 2.18,  volume: 8730,  pe: 18.2, roe: 22.8, revenueYoY: 28.7, foreignNet: 4300,  score: 88 },
  { code: "2317", name: "鴻海",     close: 178,  change: 4.71,  volume: 52300, pe: 12.1, roe: 14.5, revenueYoY: 18.3, foreignNet: 8200,  score: 85 },
  { code: "3661", name: "世芯-KY", close: 2850, change: 5.56,  volume: 3210,  pe: 42.3, roe: 35.2, revenueYoY: 62.1, foreignNet: 1850,  score: 95 },
  { code: "2382", name: "廣達",     close: 325,  change: 3.83,  volume: 18900, pe: 15.8, roe: 18.7, revenueYoY: 22.5, foreignNet: 5600,  score: 82 },
  { code: "6669", name: "緯穎",     close: 1920, change: 2.95,  volume: 2150,  pe: 22.7, roe: 26.3, revenueYoY: 41.8, foreignNet: 980,   score: 90 },
  { code: "3037", name: "欣興",     close: 245,  change: -1.21, volume: 14500, pe: 10.5, roe: 20.1, revenueYoY: 8.5,  foreignNet: -3200, score: 58 },
  { code: "2603", name: "長榮",     close: 198,  change: 1.54,  volume: 28700, pe: 6.8,  roe: 32.5, revenueYoY: -5.2, foreignNet: -1500, score: 65 },
  { code: "2308", name: "台達電",   close: 410,  change: 2.50,  volume: 9800,  pe: 25.3, roe: 19.8, revenueYoY: 15.7, foreignNet: 3800,  score: 80 },
  { code: "3443", name: "創意",     close: 1650, change: 4.43,  volume: 4500,  pe: 38.1, roe: 28.9, revenueYoY: 55.3, foreignNet: 2100,  score: 91 },
  { code: "2345", name: "智邦",     close: 580,  change: 1.75,  volume: 6200,  pe: 20.4, roe: 17.3, revenueYoY: 12.8, foreignNet: 1200,  score: 72 },
  { code: "6446", name: "藥華藥",   close: 320,  change: -2.44, volume: 11200, pe: 55.2, roe: 8.5,  revenueYoY: 85.3, foreignNet: -800,  score: 55 },
  { code: "2881", name: "富邦金",   close: 88.5, change: 0.57,  volume: 25300, pe: 9.2,  roe: 12.1, revenueYoY: 6.3,  foreignNet: 4100,  score: 68 },
  { code: "3008", name: "大立光",   close: 2380, change: 1.92,  volume: 1850,  pe: 24.8, roe: 15.6, revenueYoY: -3.1, foreignNet: 520,   score: 62 },
  { code: "6274", name: "台燿",     close: 142,  change: 6.77,  volume: 7800,  pe: 11.3, roe: 16.2, revenueYoY: 25.4, foreignNet: 950,   score: 78 },
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
