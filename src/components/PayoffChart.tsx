"use client";

import type { PayoffType } from "@/lib/lessons";

// 選擇權四種基本部位的損益圖（曲棍球桿）。
// 純 SVG、用主題 CSS 變數，紅＝獲利、綠＝虧損（台股慣例）。
// x 軸為標的價格、y 軸為到期損益；中線為履約價，水平虛線為損益兩平。

const META: Record<PayoffType, { name: string; en: string; desc: string }> = {
  "long-call": { name: "買進買權", en: "Long Call", desc: "看漲。最大損失＝權利金（封頂），標的漲愈多賺愈多。" },
  "long-put": { name: "買進賣權", en: "Long Put", desc: "看跌。最大損失＝權利金（封頂），標的跌愈深賺愈多。" },
  "short-call": { name: "賣出買權", en: "Short Call", desc: "看不漲。獲利上限＝權利金，裸賣理論虧損無上限。" },
  "short-put": { name: "賣出賣權", en: "Short Put", desc: "看不跌。獲利上限＝權利金，最大虧損約履約價×乘數−權利金。" },
};

const W = 260;
const H = 172;
const xL = 34;
const xS = 138; // 履約價
const xR = 246;
const y0 = 82; // 零損益
const yT = 26; // 上緣（最大獲利顯示）
const yB = 138; // 下緣（最大虧損顯示）
const p = 22; // 權利金對應的像素高度

const VERTS: Record<PayoffType, number[][]> = {
  "long-call": [[xL, y0 + p], [xS, y0 + p], [xR, yT]],
  "long-put": [[xL, yT], [xS, y0 + p], [xR, y0 + p]],
  "short-call": [[xL, y0 - p], [xS, y0 - p], [xR, yB]],
  "short-put": [[xL, yB], [xS, y0 - p], [xR, y0 - p]],
};

// 在跨越零損益線的線段插入交點，方便切出「獲利／虧損」兩塊面積。
function withCrossings(verts: number[][]): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < verts.length; i++) {
    pts.push(verts[i]);
    if (i < verts.length - 1) {
      const [x1, y1] = verts[i];
      const [x2, y2] = verts[i + 1];
      if ((y1 - y0) * (y2 - y0) < 0) {
        const t = (y0 - y1) / (y2 - y1);
        pts.push([x1 + t * (x2 - x1), y0]);
      }
    }
  }
  return pts;
}

// 取出某一側（獲利 y<=y0 或虧損 y>=y0）連續點構成的填色多邊形。
function regionPaths(pts: number[][], side: "profit" | "loss"): string[] {
  const inSide = (y: number) => (side === "profit" ? y <= y0 + 0.01 : y >= y0 - 0.01);
  const runs: number[][][] = [];
  let run: number[][] = [];
  for (const pt of pts) {
    if (inSide(pt[1])) {
      run.push(pt);
    } else {
      if (run.length >= 2) runs.push(run);
      run = [];
    }
  }
  if (run.length >= 2) runs.push(run);
  return runs.map(
    (r) =>
      `M${r[0][0]},${y0} ` +
      r.map((pt) => `L${pt[0]},${pt[1]}`).join(" ") +
      ` L${r[r.length - 1][0]},${y0} Z`
  );
}

export default function PayoffChart({ type }: { type: PayoffType }) {
  const verts = VERTS[type];
  const meta = META[type];
  const pts = withCrossings(verts);
  const line = verts.map((v, i) => `${i ? "L" : "M"}${v[0]},${v[1]}`).join(" ");
  const profit = regionPaths(pts, "profit");
  const loss = regionPaths(pts, "loss");
  const be = pts.find((pt) => Math.abs(pt[1] - y0) < 0.01 && pt[0] !== xS);

  return (
    <figure className="bg-bg-1 border border-border rounded-xl p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${meta.name}（${meta.en}）到期損益圖：${meta.desc}`}
      >
        {/* 獲利（紅）／虧損（綠）區域 — 台股慣例 */}
        {profit.map((d, i) => (
          <path key={`p${i}`} d={d} fill="var(--red)" opacity="0.16" />
        ))}
        {loss.map((d, i) => (
          <path key={`l${i}`} d={d} fill="var(--green)" opacity="0.16" />
        ))}
        {/* 履約價垂直線 */}
        <line x1={xS} y1="18" x2={xS} y2="146" stroke="var(--text-4)" strokeWidth="1" strokeDasharray="2 4" opacity="0.7" />
        {/* 零損益水平軸 */}
        <line x1="26" y1={y0} x2="250" y2={y0} stroke="var(--border-hover)" strokeWidth="1" strokeDasharray="3 3" />
        {/* 損益曲線 */}
        <path d={line} fill="none" stroke="var(--text-0)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {/* 損益兩平點 */}
        {be && <circle cx={be[0]} cy={be[1]} r="3" fill="var(--bg-1)" stroke="var(--text-0)" strokeWidth="1.5" />}
        {/* 標籤 */}
        <text x="28" y="22" fontSize="9" fill="var(--red)" fontWeight="600">＋獲利</text>
        <text x="28" y={H - 8} fontSize="9" fill="var(--green)" fontWeight="600">−虧損</text>
        <text x={xS} y="160" fontSize="8.5" fill="var(--text-4)" textAnchor="middle">履約價</text>
        <text x={W - 6} y={y0 - 5} fontSize="8.5" fill="var(--text-4)" textAnchor="end">標的價格 →</text>
      </svg>
      <figcaption className="mt-2 px-1">
        <div className="text-xs font-bold text-txt-0">
          {meta.name} <span className="text-txt-4 font-normal">{meta.en}</span>
        </div>
        <div className="text-[11px] text-txt-3 leading-snug mt-0.5">{meta.desc}</div>
      </figcaption>
    </figure>
  );
}
