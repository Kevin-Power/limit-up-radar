"use client";

import { useState, useCallback, useMemo, type MouseEvent } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

export interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface KLineProps {
  data?: CandleData[];
  height?: number;
  showMA?: boolean;
  showVolume?: boolean;
  showMACD?: boolean;
  showKD?: boolean;
  title?: string;
}

interface HoverState {
  x: number;
  y: number;
  index: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Technical Indicator Helpers
   ═══════════════════════════════════════════════════════════════════════ */

function calcMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      result.push(sum / period);
    }
  }
  return result;
}

function calcEMA(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function calcMACD(closes: number[]): {
  macd: number[];
  signal: number[];
  histogram: number[];
} {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calcEMA(macdLine, 9);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

function calcKD(data: CandleData[]): { k: number[]; d: number[] } {
  const period = 9;
  const kArr: number[] = [];
  const dArr: number[] = [];
  let prevK = 50;
  let prevD = 50;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      kArr.push(50);
      dArr.push(50);
      continue;
    }
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (data[j].high > highest) highest = data[j].high;
      if (data[j].low < lowest) lowest = data[j].low;
    }
    const rsv = highest === lowest ? 50 : ((data[i].close - lowest) / (highest - lowest)) * 100;
    const k = (2 / 3) * prevK + (1 / 3) * rsv;
    const d = (2 / 3) * prevD + (1 / 3) * k;
    kArr.push(k);
    dArr.push(d);
    prevK = k;
    prevD = d;
  }
  return { k: kArr, d: dArr };
}

/* ═══════════════════════════════════════════════════════════════════════
   Formatting helpers
   ═══════════════════════════════════════════════════════════════════════ */

function fmtPrice(n: number): string {
  return n.toFixed(2);
}

function fmtVol(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

function fmtDate(d: string): string {
  return d.slice(5); // MM-DD
}

/* ═══════════════════════════════════════════════════════════════════════
   SVG helper: polyline from points
   ═══════════════════════════════════════════════════════════════════════ */

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

/* ═══════════════════════════════════════════════════════════════════════
   Colors
   ═══════════════════════════════════════════════════════════════════════ */

const C = {
  up: "#EF4444",
  down: "#22C55E",
  ma5: "#FACC15",
  ma10: "#3B82F6",
  ma20: "#F97316",
  ma60: "#A855F7",
  macdLine: "#FFFFFF",
  signalLine: "#FACC15",
  kLine: "#FACC15",
  dLine: "#22D3EE",
  grid: "rgba(255,255,255,0.06)",
  gridText: "rgba(255,255,255,0.35)",
  crosshair: "rgba(255,255,255,0.3)",
  bg: "#0D1117",
  separator: "rgba(255,255,255,0.08)",
  tooltipBg: "rgba(13,17,23,0.92)",
  tooltipBorder: "rgba(255,255,255,0.12)",
} as const;

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

export default function KLineChart({
  data: dataProp,
  height = 500,
  showMA = true,
  showVolume = true,
  showMACD = true,
  showKD = true,
}: KLineProps) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [period, setPeriod] = useState<"日K" | "週K" | "月K">("日K");

  const data = dataProp;

  /* ── Empty state ── */
  if (!data || data.length === 0) {
    return (
      <div
        className="rounded-lg overflow-hidden select-none"
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{ height, color: "var(--text-3)", fontFamily: "monospace" }}
        >
          載入K線資料中...
        </div>
      </div>
    );
  }

  /* ── Layout constants ── */
  const W = 900;
  const padL = 0;
  const padR = 60; // right axis labels
  const padT = 6;
  const chartW = W - padL - padR;

  // Dynamically compute section heights
  const sections = useMemo(() => {
    const active: string[] = ["main"];
    if (showVolume) active.push("vol");
    if (showMACD) active.push("macd");
    if (showKD) active.push("kd");

    // ratios
    const ratios: Record<string, number> = { main: 0.6, vol: 0.15, macd: 0.125, kd: 0.125 };
    const totalRatio = active.reduce((s, k) => s + ratios[k], 0);
    const usable = height - padT - 20; // 20px bottom for x-axis labels

    const result: Record<string, { y: number; h: number }> = {};
    let y = padT;
    for (const k of active) {
      const h = Math.round((ratios[k] / totalRatio) * usable);
      result[k] = { y, h };
      y += h;
    }
    return result;
  }, [height, showVolume, showMACD, showKD]);

  const totalH = height;
  const n = data.length;
  const candleW = Math.max(2, Math.floor(chartW / n) - 1);
  const gap = 1;
  const step = candleW + gap;

  /* ── Derived data ── */
  const closes = useMemo(() => data.map((d) => d.close), [data]);

  const maLines = useMemo(() => {
    if (!showMA) return {};
    const result: Record<string, (number | null)[]> = {
      ma5: calcMA(closes, 5),
      ma10: calcMA(closes, 10),
      ma20: calcMA(closes, 20),
    };
    if (closes.length >= 60) result.ma60 = calcMA(closes, 60);
    return result;
  }, [closes, showMA]);

  const macd = useMemo(() => (showMACD ? calcMACD(closes) : null), [closes, showMACD]);
  const kd = useMemo(() => (showKD ? calcKD(data) : null), [data, showKD]);

  /* ── Price scale (main chart) ── */
  const priceMin = useMemo(() => Math.min(...data.map((d) => d.low)), [data]);
  const priceMax = useMemo(() => Math.max(...data.map((d) => d.high)), [data]);
  const pricePad = (priceMax - priceMin) * 0.06 || 1;
  const pLow = priceMin - pricePad;
  const pHigh = priceMax + pricePad;

  const mainArea = sections.main;
  const scaleY = useCallback(
    (v: number) => mainArea.y + mainArea.h - ((v - pLow) / (pHigh - pLow)) * mainArea.h,
    [mainArea, pLow, pHigh],
  );
  const candleX = useCallback((i: number) => padL + i * step, [step]);

  /* ── Volume scale ── */
  const volMax = useMemo(() => Math.max(...data.map((d) => d.volume)), [data]);

  /* ── MACD scale ── */
  const macdRange = useMemo(() => {
    if (!macd) return { min: 0, max: 0 };
    const all = [...macd.macd, ...macd.signal, ...macd.histogram];
    const mn = Math.min(...all);
    const mx = Math.max(...all);
    const pad = (mx - mn) * 0.1 || 1;
    return { min: mn - pad, max: mx + pad };
  }, [macd]);

  /* ── KD scale (0-100, but give some pad) ── */
  const kdRange = { min: -5, max: 105 };

  /* ── Mouse handling ── */
  const handleMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const sY = totalH / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * sY;
      const idx = Math.round((mx - padL) / step);
      if (idx >= 0 && idx < n) {
        setHover({ x: mx, y: my, index: idx });
      }
    },
    [n, step, totalH],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  /* ── Grid lines (price) ── */
  const gridLines = useMemo(() => {
    const count = 5;
    const lines: { y: number; label: string }[] = [];
    for (let i = 0; i <= count; i++) {
      const v = pLow + ((pHigh - pLow) * i) / count;
      lines.push({ y: scaleY(v), label: fmtPrice(v) });
    }
    return lines;
  }, [pLow, pHigh, scaleY]);

  /* ── X-axis labels ── */
  const xLabels = useMemo(() => {
    const interval = n <= 30 ? 5 : 10;
    const labels: { x: number; label: string }[] = [];
    for (let i = 0; i < n; i += interval) {
      labels.push({ x: candleX(i) + candleW / 2, label: fmtDate(data[i].date) });
    }
    return labels;
  }, [n, data, candleX, candleW]);

  /* ── Hovered candle data ── */
  const hd = hover ? data[hover.index] : null;
  const prevClose = hover && hover.index > 0 ? data[hover.index - 1].close : null;

  /* ── Generic sub-chart Y scaler factory ── */
  const makeScaler =
    (area: { y: number; h: number }, low: number, high: number) =>
    (v: number) =>
      area.y + area.h - ((v - low) / (high - low)) * area.h;

  /* ════════════════════════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════════════════════════ */

  return (
    <div
      className="rounded-lg overflow-hidden select-none"
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
      }}
    >
      {/* ── Header bar ── */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span
          className="text-sm font-medium"
          style={{ color: "var(--text-1)", fontFamily: "monospace" }}
        >
          K Line Chart
        </span>
        <div className="flex gap-1">
          {(["日K", "週K", "月K"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="px-2.5 py-0.5 rounded text-xs font-medium transition-colors"
              style={{
                background: period === p ? "var(--accent)" : "transparent",
                color: period === p ? "#fff" : "var(--text-3)",
                border: period === p ? "none" : "1px solid var(--border)",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── MA legend ── */}
      {showMA && (
        <div className="flex gap-3 px-4 py-1 text-[10px]" style={{ fontFamily: "monospace" }}>
          {([
            ["MA5", C.ma5],
            ["MA10", C.ma10],
            ["MA20", C.ma20],
            ...(maLines.ma60 ? [["MA60", C.ma60]] : []),
          ] as [string, string][]).map(([label, color]) => (
            <span key={label} style={{ color }}>
              {label}
              {hover
                ? `: ${fmtPrice(
                    (maLines[label.toLowerCase() as keyof typeof maLines] ?? [])[hover.index] ?? 0,
                  )}`
                : ""}
            </span>
          ))}
        </div>
      )}

      {/* ── SVG ── */}
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        width="100%"
        style={{ display: "block", background: C.bg, cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* ──── Main chart grid ──── */}
        {gridLines.map((gl, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={gl.y}
              y2={gl.y}
              stroke={C.grid}
              strokeDasharray="3,3"
            />
            <text
              x={W - padR + 4}
              y={gl.y + 3}
              fill={C.gridText}
              fontSize="9"
              fontFamily="monospace"
            >
              {gl.label}
            </text>
          </g>
        ))}

        {/* ──── Candlesticks ──── */}
        {data.map((d, i) => {
          const x = candleX(i);
          const isUp = d.close >= d.open;
          const color = isUp ? C.up : C.down;
          const bodyTop = scaleY(Math.max(d.open, d.close));
          const bodyBot = scaleY(Math.min(d.open, d.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          const wickX = x + candleW / 2;
          return (
            <g key={i}>
              {/* wick */}
              <line
                x1={wickX}
                x2={wickX}
                y1={scaleY(d.high)}
                y2={scaleY(d.low)}
                stroke={color}
                strokeWidth={1}
              />
              {/* body */}
              <rect x={x} y={bodyTop} width={candleW} height={bodyH} fill={color} rx={0.5} />
            </g>
          );
        })}

        {/* ──── MA lines ──── */}
        {showMA &&
          ([
            ["ma5", C.ma5],
            ["ma10", C.ma10],
            ["ma20", C.ma20],
            ["ma60", C.ma60],
          ] as [string, string][]).map(([key, color]) => {
            const arr = maLines[key as keyof typeof maLines];
            if (!arr) return null;
            const pts = arr
              .map((v, i) =>
                v !== null ? { x: candleX(i) + candleW / 2, y: scaleY(v) } : null,
              )
              .filter(Boolean) as { x: number; y: number }[];
            return (
              <path
                key={key}
                d={pointsToPath(pts)}
                fill="none"
                stroke={color}
                strokeWidth={1}
                opacity={0.85}
              />
            );
          })}

        {/* ──── Volume bars ──── */}
        {showVolume && sections.vol && (
          <>
            {/* separator */}
            <line
              x1={padL}
              x2={W - padR}
              y1={sections.vol.y}
              y2={sections.vol.y}
              stroke={C.separator}
            />
            <text
              x={W - padR + 4}
              y={sections.vol.y + 10}
              fill={C.gridText}
              fontSize="8"
              fontFamily="monospace"
            >
              VOL
            </text>
            {data.map((d, i) => {
              const x = candleX(i);
              const isUp = d.close >= d.open;
              const barH = (d.volume / volMax) * (sections.vol!.h - 4);
              return (
                <rect
                  key={i}
                  x={x}
                  y={sections.vol!.y + sections.vol!.h - barH}
                  width={candleW}
                  height={barH}
                  fill={isUp ? C.up : C.down}
                  opacity={0.6}
                />
              );
            })}
          </>
        )}

        {/* ──── MACD sub-chart ──── */}
        {showMACD && macd && sections.macd && (() => {
          const area = sections.macd;
          const sy = makeScaler(area, macdRange.min, macdRange.max);
          const zeroY = sy(0);
          const macdPts = macd.macd.map((v, i) => ({
            x: candleX(i) + candleW / 2,
            y: sy(v),
          }));
          const sigPts = macd.signal.map((v, i) => ({
            x: candleX(i) + candleW / 2,
            y: sy(v),
          }));
          return (
            <>
              <line
                x1={padL}
                x2={W - padR}
                y1={area.y}
                y2={area.y}
                stroke={C.separator}
              />
              {/* zero line */}
              <line
                x1={padL}
                x2={W - padR}
                y1={zeroY}
                y2={zeroY}
                stroke="rgba(255,255,255,0.12)"
                strokeDasharray="3,3"
              />
              {/* histogram */}
              {macd.histogram.map((v, i) => {
                const x = candleX(i);
                const barTop = v >= 0 ? sy(v) : zeroY;
                const barBot = v >= 0 ? zeroY : sy(v);
                return (
                  <rect
                    key={i}
                    x={x}
                    y={barTop}
                    width={candleW}
                    height={Math.max(0.5, barBot - barTop)}
                    fill={v >= 0 ? C.up : C.down}
                    opacity={0.55}
                  />
                );
              })}
              {/* MACD line */}
              <path
                d={pointsToPath(macdPts)}
                fill="none"
                stroke={C.macdLine}
                strokeWidth={1}
                opacity={0.8}
              />
              {/* Signal line */}
              <path
                d={pointsToPath(sigPts)}
                fill="none"
                stroke={C.signalLine}
                strokeWidth={1}
                opacity={0.8}
              />
              <text
                x={W - padR + 4}
                y={area.y + 10}
                fill={C.gridText}
                fontSize="8"
                fontFamily="monospace"
              >
                MACD
              </text>
            </>
          );
        })()}

        {/* ──── KD sub-chart ──── */}
        {showKD && kd && sections.kd && (() => {
          const area = sections.kd;
          const sy = makeScaler(area, kdRange.min, kdRange.max);
          const kPts = kd.k.map((v, i) => ({
            x: candleX(i) + candleW / 2,
            y: sy(v),
          }));
          const dPts = kd.d.map((v, i) => ({
            x: candleX(i) + candleW / 2,
            y: sy(v),
          }));
          const y80 = sy(80);
          const y20 = sy(20);
          return (
            <>
              <line
                x1={padL}
                x2={W - padR}
                y1={area.y}
                y2={area.y}
                stroke={C.separator}
              />
              {/* Subtle fill between 20-80 */}
              <rect
                x={padL}
                y={y80}
                width={chartW}
                height={y20 - y80}
                fill="rgba(255,255,255,0.02)"
              />
              {/* Overbought 80 */}
              <line
                x1={padL}
                x2={W - padR}
                y1={y80}
                y2={y80}
                stroke={C.up}
                strokeDasharray="3,3"
                opacity={0.4}
              />
              {/* Oversold 20 */}
              <line
                x1={padL}
                x2={W - padR}
                y1={y20}
                y2={y20}
                stroke={C.down}
                strokeDasharray="3,3"
                opacity={0.4}
              />
              {/* K line */}
              <path
                d={pointsToPath(kPts)}
                fill="none"
                stroke={C.kLine}
                strokeWidth={1}
                opacity={0.85}
              />
              {/* D line */}
              <path
                d={pointsToPath(dPts)}
                fill="none"
                stroke={C.dLine}
                strokeWidth={1}
                opacity={0.85}
              />
              <text
                x={W - padR + 4}
                y={area.y + 10}
                fill={C.gridText}
                fontSize="8"
                fontFamily="monospace"
              >
                KD
              </text>
              <text
                x={W - padR + 4}
                y={y80 + 3}
                fill={C.gridText}
                fontSize="7"
                fontFamily="monospace"
              >
                80
              </text>
              <text
                x={W - padR + 4}
                y={y20 + 3}
                fill={C.gridText}
                fontSize="7"
                fontFamily="monospace"
              >
                20
              </text>
            </>
          );
        })()}

        {/* ──── X-axis date labels ──── */}
        {xLabels.map((xl, i) => (
          <text
            key={i}
            x={xl.x}
            y={totalH - 4}
            textAnchor="middle"
            fill={C.gridText}
            fontSize="8"
            fontFamily="monospace"
          >
            {xl.label}
          </text>
        ))}

        {/* ──── Crosshair + tooltip ──── */}
        {hover && hd && (
          <>
            {/* Vertical line */}
            <line
              x1={candleX(hover.index) + candleW / 2}
              x2={candleX(hover.index) + candleW / 2}
              y1={padT}
              y2={totalH - 16}
              stroke={C.crosshair}
              strokeDasharray="3,2"
              strokeWidth={0.5}
            />
            {/* Horizontal line */}
            <line
              x1={padL}
              x2={W - padR}
              y1={hover.y}
              y2={hover.y}
              stroke={C.crosshair}
              strokeDasharray="3,2"
              strokeWidth={0.5}
            />

            {/* Tooltip */}
            {(() => {
              const change = prevClose
                ? (((hd.close - prevClose) / prevClose) * 100).toFixed(2)
                : "—";
              const changeSign = prevClose && hd.close >= prevClose ? "+" : "";
              const tipW = 145;
              const tipH = 110;
              let tx = candleX(hover.index) + candleW + 8;
              let ty = hover.y - tipH / 2;
              // Bounds check
              if (tx + tipW > W - padR) tx = candleX(hover.index) - tipW - 8;
              if (ty < padT) ty = padT;
              if (ty + tipH > totalH - 16) ty = totalH - 16 - tipH;
              const lines = [
                { label: "Date", value: hd.date },
                { label: "Open", value: fmtPrice(hd.open) },
                { label: "High", value: fmtPrice(hd.high) },
                { label: "Low", value: fmtPrice(hd.low) },
                { label: "Close", value: fmtPrice(hd.close) },
                { label: "Vol", value: fmtVol(hd.volume) },
                { label: "Chg%", value: `${changeSign}${change}%` },
              ];
              return (
                <g>
                  <rect
                    x={tx}
                    y={ty}
                    width={tipW}
                    height={tipH}
                    rx={4}
                    fill={C.tooltipBg}
                    stroke={C.tooltipBorder}
                    strokeWidth={1}
                  />
                  {lines.map((l, i) => (
                    <g key={l.label}>
                      <text
                        x={tx + 8}
                        y={ty + 14 + i * 14}
                        fill="rgba(255,255,255,0.5)"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {l.label}
                      </text>
                      <text
                        x={tx + tipW - 8}
                        y={ty + 14 + i * 14}
                        fill={
                          l.label === "Chg%" && prevClose
                            ? hd.close >= prevClose
                              ? C.up
                              : C.down
                            : "#fff"
                        }
                        fontSize="9"
                        fontFamily="monospace"
                        textAnchor="end"
                      >
                        {l.value}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })()}
          </>
        )}
      </svg>
    </div>
  );
}
