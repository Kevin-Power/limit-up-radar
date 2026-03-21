"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import TopNav from "@/components/TopNav";
import { formatPct, formatPrice } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

type StockLabel = "續漲停" | "強漲" | "強勢漲" | "銘碼漲" | "開高走低" | "直接跌";
type Market = "上" | "櫃";

interface NextDayStock {
  code: string;
  name: string;
  group: string;
  groupColor: string;
  market: Market;
  limitPrice: number;    // 漲停價
  volumeRatio: number;   // 量比
  nextOpen: number;      // 隔日開盤價
  nextOpenPct: number;   // 隔日開盤報酬%
  nextAvg: number;       // 隔日均價
  nextAvgPct: number;    // 隔日均價報酬%
  nextClose: number;     // 隔日收盤價
  nextClosePct: number;  // 隔日收盤報酬%
  weightedReturn: number; // 加權報酬%
  label: StockLabel;
}

interface DayData {
  limitDate: string;
  nextDate: string;
  totalLimitUp: number;
  stocks: NextDayStock[];
}

interface GroupPerf {
  name: string;
  color: string;
  count: number;
  positiveCount: number;
  positiveRate: number;
  openAvg: number;
  avgAvg: number;
  closeAvg: number;
  streak: number; // 連續天數
}

/* ═══════════════════════════════════════════════════════════════
   Label Config
   ═══════════════════════════════════════════════════════════════ */

const LABEL_CONFIG: Record<StockLabel, { bg: string; text: string; border: string }> = {
  "續漲停": { bg: "bg-red/20", text: "text-red", border: "border-red/30" },
  "強漲":   { bg: "bg-[rgba(249,115,22,0.15)]", text: "text-[#f97316]", border: "border-[#f97316]/30" },
  "強勢漲": { bg: "bg-green/15", text: "text-green", border: "border-green/30" },
  "銘碼漲": { bg: "bg-amber/15", text: "text-amber", border: "border-amber/30" },
  "開高走低": { bg: "bg-[rgba(234,179,8,0.12)]", text: "text-[#eab308]", border: "border-[#eab308]/25" },
  "直接跌": { bg: "bg-blue/12", text: "text-blue", border: "border-blue/25" },
};

const GROUP_COLORS: Record<string, string> = {
  "塑化／油價地緣政治": "#3b82f6",
  "化纖／化學族群連動": "#22c55e",
  "綠能／鈣鈦礦太陽能": "#f59e0b",
  "AI軟體／邊緣運算": "#6366f1",
  "AI PC／機器人周邊": "#64748b",
  "AI儲存／NAS": "#8b5cf6",
  "低價投機／籌碼面": "#ec4899",
  "AI伺服器／零組件": "#06b6d4",
  "生技疫苗": "#10b981",
  "天然氣／瓦斯": "#f59e0b",
  "半導體檢測／IC設計": "#a855f7",
  "記憶體": "#6366f1",
  "汽車零組件": "#ef4444",
  "矽光子／光通訊": "#14b8a6",
  "PCB／CCL銅箔基板": "#f97316",
  "化纖／化學族群連動B": "#84cc16",
  "LED／車用感測": "#eab308",
  "AI軟體／邊緣運算B": "#818cf8",
};

/* ═══════════════════════════════════════════════════════════════
   Mock Data — realistic next-day performance
   ═══════════════════════════════════════════════════════════════ */

function makeStock(
  code: string, name: string, group: string, market: Market,
  limitPrice: number, volumeRatio: number,
  nextOpen: number, nextOpenPct: number,
  nextAvg: number, nextAvgPct: number,
  nextClose: number, nextClosePct: number,
  weightedReturn: number, label: StockLabel
): NextDayStock {
  return {
    code, name, group, market, limitPrice, volumeRatio,
    nextOpen, nextOpenPct, nextAvg, nextAvgPct,
    nextClose, nextClosePct, weightedReturn, label,
    groupColor: GROUP_COLORS[group] || "#64748b",
  };
}

const MOCK_DATA: DayData[] = [
  {
    limitDate: "2026-03-10",
    nextDate: "2026-03-11",
    totalLimitUp: 48,
    stocks: [
      makeStock("4905","台聯電","低價投機／籌碼面","上",81.2,0.8, 89.3,+9.98, 89.3,+9.98, 89.3,+9.98, +9.98,"續漲停"),
      makeStock("6547","高端疫苗","生技疫苗","上",45.1,1.7, 49.6,+9.98, 49.6,+9.98, 49.6,+9.98, +9.98,"續漲停"),
      makeStock("6584","南俊國際","AI伺服器／零組件","上",456.5,0.4, 502,+9.97, 501.86,+9.94, 502,+9.97, +9.96,"續漲停"),
      makeStock("3587","閎康","半導體檢測／IC設計","上",209,0.6, 229.5,+9.81, 229.5,+9.81, 229.5,+9.81, +9.81,"續漲停"),
      makeStock("3135","凌航","記憶體","櫃",143,0.3, 157,+9.79, 157,+9.79, 157,+9.79, +9.79,"續漲停"),
      makeStock("3049","精金","低價投機／籌碼面","櫃",16.4,1.1, 18,+9.76, 18,+9.74, 18,+9.76, +9.75,"續漲停"),
      makeStock("2349","錸德","綠能／鈣鈦礦太陽能","櫃",14.4,2.1, 15.8,+9.72, 15.8,+9.72, 15.8,+9.72, +9.72,"續漲停"),
      makeStock("6672","驊輝電子-KY","PCB／CCL銅箔基板","櫃",112,2.3, 123,+9.82, 122.22,+9.12, 123,+9.82, +9.59,"續漲停"),
      makeStock("1309","台達化","塑化／油價地緣政治","上",17.15,2.8, 18.85,+9.91, 18.62,+8.56, 18.1,+5.54, +9.46,"強漲"),
      makeStock("6588","東典光電","矽光子／光通訊","上",99.8,1.0, 109.5,+9.72, 108.7,+8.92, 109.5,+9.72, +9.45,"續漲停"),
      makeStock("2399","映泰","AI軟體／邊緣運算","櫃",33.85,1.3, 37.2,+9.90, 36.67,+8.34, 37.2,+9.90, +9.38,"續漲停"),
      makeStock("8059","凱碩","低價投機／籌碼面","上",19.9,3.1, 21.8,+9.55, 21.62,+8.61, 21.2,+6.53, +9.24,"強漲"),
      makeStock("4919","新唐","AI伺服器／零組件","上",99.4,1.8, 109,+9.66, 107.48,+8.13, 109,+9.66, +9.15,"強漲"),
      makeStock("1305","華夏","塑化／油價地緣政治","上",15.45,1.8, 16.9,+9.39, 16.78,+8.64, 16.8,+8.74, +9.14,"強漲"),
      makeStock("3057","喬鼎","AI儲存／NAS","櫃",18.3,3.8, 20.1,+9.84, 19.53,+6.72, 19,+3.83, +8.80,"銘碼漲"),
      makeStock("6907","強特力-KY","汽車零組件","櫃",159.5,2.9, 175,+9.72, 172,+7.84, 170,+6.58, +8.71,"強勢漲"),
      makeStock("3693","營邦","AI伺服器／零組件","上",583,1.5, 618,+6.00, 571.17,-2.03, 535,-8.23, +3.33,"開高走低"),
      makeStock("7547","碩網","AI軟體／邊緣運算","上",69.3,1.8, 71.7,+3.46, 71,+2.45, 68.3,-1.44, +3.12,"開高走低"),
      makeStock("4967","十銓","記憶體","櫃",271,1.1, 287.5,+6.09, 261.21,-3.61, 261.5,-3.51, +2.85,"開高走低"),
      makeStock("6276","安鈦克","低價投機／籌碼面","櫃",35.35,5.6, 35.35,+0.00, 38.2,+8.06, 37.6,+6.36, +2.69,"強勢漲"),
      makeStock("6542","陸中","低價投機／籌碼面","櫃",52,3.1, 52.7,+1.35, 54.58,+4.96, 54.6,+5.00, +2.55,"強勢漲"),
      makeStock("1711","永光","化纖／化學族群連動","櫃",43.25,0.4, 44.45,+2.77, 43.9,+1.51, 41.8,-3.35, +2.35,"開高走低"),
      makeStock("6217","中探針","半導體檢測／IC設計","上",183.5,0.7, 185,+0.82, 193.24,+5.31, 190,+3.54, +2.31,"銘碼漲"),
      makeStock("6226","光鼎","LED／車用感測","櫃",14.65,0.6, 14.9,+1.71, 15.12,+3.21, 14.85,+1.37, +2.21,"銘碼漲"),
      makeStock("3066","李洲","低價投機／籌碼面","上",24,0.4, 24.95,+3.96, 23.64,-1.52, 22.6,-5.83, +2.13,"開高走低"),
      makeStock("6426","統新","矽光子／光通訊","上",174,2.9, 176.5,+1.44, 177.37,+1.93, 169,-2.87, +1.60,"開高走低"),
      makeStock("3508","位速","綠能／鈣鈦礦太陽能","上",52.3,1.3, 54,+3.25, 50.91,-2.66, 47.9,-8.41, +1.28,"開高走低"),
      makeStock("3591","艾笛森","LED／車用感測","櫃",22,1.1, 22.5,+2.27, 21.78,-0.96, 21.3,-3.18, +1.19,"開高走低"),
      makeStock("2368","金像電","AI伺服器／零組件","櫃",1005,2.0, 1030,+2.49, 986.3,-1.86, 988,-1.69, +1.04,"開高走低"),
      makeStock("9931","欣高","天然氣／瓦斯","上",41.8,1.3, 42.3,+1.20, 41.91,+0.27, 39.2,-6.22, +0.89,"開高走低"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",584,0.9, 598,+2.40, 562.85,-3.62, 554,-5.14, +0.39,"開高走低"),
      makeStock("1725","元祖","化纖／化學族群連動B","上",35.45,1.0, 35.65,+0.56, 35.07,-1.07, 33.1,-6.63, +0.02,"開高走低"),
      makeStock("3715","定穎投控","AI伺服器／零組件","上",190.5,0.9, 193,+1.31, 182.61,-4.14, 178.5,-6.30, -0.51,"開高走低"),
      makeStock("4569","六方科-KY","低價投機／籌碼面","櫃",151,1.5, 150,-0.66, 150.24,-0.50, 152,+0.66, -0.61,"銘碼漲"),
      makeStock("6290","良維","AI伺服器／零組件","上",241,1.2, 243.5,+1.04, 229.85,-4.63, 224,-7.05, -0.85,"開高走低"),
      makeStock("7711","永擎","AI伺服器／零組件","櫃",269.5,0.6, 269,-0.19, 263.29,-2.30, 262.5,-2.60, -0.89,"直接跌"),
      makeStock("7718","友誠","汽車零組件","上",55,0.8, 55.5,+0.91, 52.17,-5.15, 49.6,-9.82, -1.11,"開高走低"),
      makeStock("9929","秋雨","低價投機／籌碼面","櫃",13.65,1.1, 13.05,-4.40, 14.37,+5.30, 15,+9.89, -1.16,"銘碼漲"),
      makeStock("4973","廣穎","記憶體","上",98.2,0.3, 98.2,+0.00, 90.02,-8.33, 88.4,-9.98, -2.78,"直接跌"),
      makeStock("3260","威剛","記憶體","上",525,0.9, 516,-1.71, 468.42,-10.78, 457.5,-12.86, -4.74,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-11",
    nextDate: "2026-03-12",
    totalLimitUp: 55,
    stocks: [
      makeStock("4905","台聯電","低價投機／籌碼面","上",89.3,1.2, 98.2,+9.97, 98.2,+9.97, 98.2,+9.97, +9.97,"續漲停"),
      makeStock("3587","閎康","半導體檢測／IC設計","上",229.5,0.8, 252,+9.80, 252,+9.80, 252,+9.80, +9.80,"續漲停"),
      makeStock("3135","凌航","記憶體","櫃",157,0.5, 172.5,+9.87, 170,+8.28, 168,+7.01, +8.39,"強漲"),
      makeStock("6672","驊輝電子-KY","PCB／CCL銅箔基板","櫃",123,1.8, 135,+9.76, 132,+7.32, 130,+5.69, +7.59,"強勢漲"),
      makeStock("1309","台達化","塑化／油價地緣政治","上",18.85,2.2, 20.5,+8.75, 19.8,+5.04, 19.2,+1.86, +5.22,"強勢漲"),
      makeStock("6588","東典光電","矽光子／光通訊","上",109.5,1.5, 118,+7.76, 115,+5.02, 112,+2.28, +5.02,"強勢漲"),
      makeStock("3049","精金","低價投機／籌碼面","櫃",18,1.5, 19.5,+8.33, 18.8,+4.44, 18.2,+1.11, +4.63,"強勢漲"),
      makeStock("2349","錸德","綠能／鈣鈦礦太陽能","櫃",15.8,1.8, 17,+7.59, 16.5,+4.43, 15.5,-1.90, +3.37,"開高走低"),
      makeStock("6547","高端疫苗","生技疫苗","上",49.6,2.5, 52,+4.84, 50.5,+1.81, 48.8,-1.61, +1.68,"開高走低"),
      makeStock("8059","凱碩","低價投機／籌碼面","上",21.8,2.8, 22.5,+3.21, 21.5,-1.38, 20.8,-4.59, -0.25,"開高走低"),
      makeStock("4919","新唐","AI伺服器／零組件","上",109,1.2, 108,-0.92, 106,-2.75, 105,-3.67, -2.45,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-12",
    nextDate: "2026-03-13",
    totalLimitUp: 42,
    stocks: [
      makeStock("4905","台聯電","低價投機／籌碼面","上",98.2,1.5, 107.9,+9.88, 107.9,+9.88, 107.9,+9.88, +9.88,"續漲停"),
      makeStock("3587","閎康","半導體檢測／IC設計","上",252,1.0, 277,+9.92, 275,+9.13, 272,+7.94, +8.99,"強漲"),
      makeStock("3135","凌航","記憶體","櫃",172.5,0.7, 188,+8.99, 185,+7.25, 180,+4.35, +6.86,"強勢漲"),
      makeStock("6672","驊輝電子-KY","PCB／CCL銅箔基板","櫃",135,2.0, 145,+7.41, 142,+5.19, 140,+3.70, +5.43,"強勢漲"),
      makeStock("1309","台達化","塑化／油價地緣政治","上",20.5,1.8, 21.5,+4.88, 21,+2.44, 20.2,-1.46, +1.95,"開高走低"),
      makeStock("6588","東典光電","矽光子／光通訊","上",118,1.2, 120,+1.69, 118.5,+0.42, 116,-1.69, +0.14,"開高走低"),
      makeStock("2349","錸德","綠能／鈣鈦礦太陽能","櫃",17,1.5, 17.2,+1.18, 16.8,-1.18, 16.2,-4.71, -1.24,"開高走低"),
      makeStock("3049","精金","低價投機／籌碼面","櫃",19.5,1.2, 19.2,-1.54, 18.5,-5.13, 18.0,-7.69, -4.79,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-13",
    nextDate: "2026-03-14",
    totalLimitUp: 38,
    stocks: [
      makeStock("4905","台聯電","低價投機／籌碼面","上",107.9,2.0, 118.5,+9.82, 118.5,+9.82, 118.5,+9.82, +9.82,"續漲停"),
      makeStock("3587","閎康","半導體檢測／IC設計","上",277,1.2, 304.5,+9.93, 300,+8.30, 298,+7.58, +8.60,"強漲"),
      makeStock("6672","驊輝電子-KY","PCB／CCL銅箔基板","櫃",145,1.5, 158,+8.97, 155,+6.90, 152,+4.83, +6.90,"強勢漲"),
      makeStock("3135","凌航","記憶體","櫃",188,0.9, 200,+6.38, 196,+4.26, 192,+2.13, +4.26,"強勢漲"),
      makeStock("1309","台達化","塑化／油價地緣政治","上",21.5,1.5, 22.5,+4.65, 22,+2.33, 21.2,-1.40, +1.86,"開高走低"),
      makeStock("6588","東典光電","矽光子／光通訊","上",120,1.0, 122,+1.67, 120,+0.00, 118,-1.67, +0.00,"開高走低"),
    ],
  },
  {
    limitDate: "2026-03-14",
    nextDate: "2026-03-16",
    totalLimitUp: 45,
    stocks: [
      makeStock("4905","台聯電","低價投機／籌碼面","上",118.5,2.5, 130,+9.70, 130,+9.70, 130,+9.70, +9.70,"續漲停"),
      makeStock("3587","閎康","半導體檢測／IC設計","上",304.5,1.5, 334.5,+9.85, 330,+8.37, 325,+6.73, +8.32,"強漲"),
      makeStock("6672","驊輝電子-KY","PCB／CCL銅箔基板","櫃",158,1.8, 170,+7.59, 168,+6.33, 165,+4.43, +6.12,"強勢漲"),
      makeStock("3135","凌航","記憶體","櫃",200,1.0, 215,+7.50, 210,+5.00, 208,+4.00, +5.50,"強勢漲"),
      makeStock("1309","台達化","塑化／油價地緣政治","上",22.5,1.2, 24,+6.67, 23.5,+4.44, 22.8,+1.33, +4.15,"強勢漲"),
      makeStock("6588","東典光電","矽光子／光通訊","上",122,0.8, 125,+2.46, 123,+0.82, 120,-1.64, +0.55,"開高走低"),
      makeStock("3049","精金","低價投機／籌碼面","櫃",19.2,0.9, 18.5,-3.65, 18.0,-6.25, 17.5,-8.85, -6.25,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-16",
    nextDate: "2026-03-17",
    totalLimitUp: 52,
    stocks: [
      makeStock("4905","台聯電","低價投機／籌碼面","上",130,2.8, 143,+10.00, 143,+10.00, 143,+10.00, +10.00,"續漲停"),
      makeStock("3587","閎康","半導體檢測／IC設計","上",334.5,1.8, 367.5,+9.87, 365,+9.12, 360,+7.62, +8.87,"強漲"),
      makeStock("6672","驊輝電子-KY","PCB／CCL銅箔基板","櫃",170,2.0, 185,+8.82, 182,+7.06, 178,+4.71, +6.86,"強勢漲"),
      makeStock("3135","凌航","記憶體","櫃",215,1.2, 230,+6.98, 228,+6.05, 225,+4.65, +5.89,"強勢漲"),
      makeStock("1309","台達化","塑化／油價地緣政治","上",24,1.5, 25.5,+6.25, 25,+4.17, 24.5,+2.08, +4.17,"強勢漲"),
      makeStock("2349","錸德","綠能／鈣鈦礦太陽能","櫃",17.2,1.0, 18.5,+7.56, 18,+4.65, 17.5,+1.74, +4.65,"強勢漲"),
      makeStock("6588","東典光電","矽光子／光通訊","上",125,0.9, 128,+2.40, 126,+0.80, 124,-0.80, +0.80,"開高走低"),
      makeStock("3049","精金","低價投機／籌碼面","櫃",18.5,0.7, 18.0,-2.70, 17.5,-5.41, 17.0,-8.11, -5.41,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-17",
    nextDate: "2026-03-18",
    totalLimitUp: 58,
    stocks: [
      makeStock("3587","閎康","半導體檢測／IC設計","上",367.5,2.0, 404,+9.93, 400,+8.84, 398,+8.30, +9.02,"續漲停"),
      makeStock("4905","台聯電","低價投機／籌碼面","上",143,3.2, 157,+9.79, 155,+8.39, 150,+4.90, +7.69,"強漲"),
      makeStock("6672","驊輝電子-KY","PCB／CCL銅箔基板","櫃",185,2.5, 200,+8.11, 198,+7.03, 195,+5.41, +6.85,"強勢漲"),
      makeStock("3135","凌航","記憶體","櫃",230,1.5, 248,+7.83, 245,+6.52, 240,+4.35, +6.23,"強勢漲"),
      makeStock("1309","台達化","塑化／油價地緣政治","上",25.5,1.8, 27,+5.88, 26.5,+3.92, 26,+1.96, +3.92,"強勢漲"),
      makeStock("2349","錸德","綠能／鈣鈦礦太陽能","櫃",18.5,1.2, 20,+8.11, 19.5,+5.41, 19,+2.70, +5.41,"強勢漲"),
      makeStock("6588","東典光電","矽光子／光通訊","上",128,1.0, 132,+3.13, 130,+1.56, 128,+0.00, +1.56,"開高走低"),
      makeStock("6547","高端疫苗","生技疫苗","上",52,2.0, 55,+5.77, 54,+3.85, 52,+0.00, +3.21,"開高走低"),
      makeStock("3049","精金","低價投機／籌碼面","櫃",18.0,0.5, 17.5,-2.78, 17.0,-5.56, 16.8,-6.67, -4.99,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-18",
    nextDate: "2026-03-19",
    totalLimitUp: 61,
    stocks: [
      makeStock("3587","閎康","半導體檢測／IC設計","上",404,2.5, 444,+9.90, 440,+8.91, 438,+8.42, +9.08,"續漲停"),
      makeStock("4905","台聯電","低價投機／籌碼面","上",157,3.5, 172.5,+9.87, 172.5,+9.87, 172.5,+9.87, +9.87,"續漲停"),
      makeStock("6672","驊輝電子-KY","PCB／CCL銅箔基板","櫃",200,2.8, 220,+10.00, 218,+9.00, 215,+7.50, +8.83,"續漲停"),
      makeStock("3135","凌航","記憶體","櫃",248,1.8, 270,+8.87, 268,+8.06, 265,+6.85, +7.93,"強漲"),
      makeStock("1309","台達化","塑化／油價地緣政治","上",27,2.0, 29,+7.41, 28.5,+5.56, 28,+3.70, +5.56,"強勢漲"),
      makeStock("2349","錸德","綠能／鈣鈦礦太陽能","櫃",20,1.5, 21.5,+7.50, 21,+5.00, 20.5,+2.50, +5.00,"強勢漲"),
      makeStock("6547","高端疫苗","生技疫苗","上",55,2.2, 58,+5.45, 57,+3.64, 55.5,+0.91, +3.33,"開高走低"),
      makeStock("6588","東典光電","矽光子／光通訊","上",132,1.2, 138,+4.55, 136,+3.03, 134,+1.52, +3.03,"強勢漲"),
    ],
  },
  {
    limitDate: "2026-03-19",
    nextDate: "2026-03-20",
    totalLimitUp: 64,
    stocks: [
      makeStock("4905","台聯電","低價投機／籌碼面","上",81.2,0.8, 89.3,+9.98, 89.3,+9.98, 89.3,+9.98, +9.98,"續漲停"),
      makeStock("6547","高端疫苗","生技疫苗","上",45.1,1.7, 49.6,+9.98, 49.6,+9.98, 49.6,+9.98, +9.98,"續漲停"),
      makeStock("6584","南俊國際","AI伺服器／零組件","上",456.5,0.4, 502,+9.97, 501.86,+9.94, 502,+9.97, +9.96,"續漲停"),
      makeStock("3587","閎康","半導體檢測／IC設計","上",209,0.6, 229.5,+9.81, 229.5,+9.81, 229.5,+9.81, +9.81,"續漲停"),
      makeStock("3135","凌航","記憶體","櫃",143,0.3, 157,+9.79, 157,+9.79, 157,+9.79, +9.79,"續漲停"),
      makeStock("3049","精金","低價投機／籌碼面","櫃",16.4,1.1, 18,+9.76, 18,+9.74, 18,+9.76, +9.75,"續漲停"),
      makeStock("2349","錸德","綠能／鈣鈦礦太陽能","櫃",14.4,2.1, 15.8,+9.72, 15.8,+9.72, 15.8,+9.72, +9.72,"續漲停"),
      makeStock("6672","驊輝電子-KY","PCB／CCL銅箔基板","櫃",112,2.3, 123,+9.82, 122.22,+9.12, 123,+9.82, +9.59,"續漲停"),
      makeStock("1309","台達化","塑化／油價地緣政治","上",17.15,2.8, 18.85,+9.91, 18.62,+8.56, 18.1,+5.54, +9.46,"強漲"),
      makeStock("6588","東典光電","矽光子／光通訊","上",99.8,1.0, 109.5,+9.72, 108.7,+8.92, 109.5,+9.72, +9.45,"續漲停"),
      makeStock("2399","映泰","AI軟體／邊緣運算","櫃",33.85,1.3, 37.2,+9.90, 36.67,+8.34, 37.2,+9.90, +9.38,"續漲停"),
      makeStock("8059","凱碩","低價投機／籌碼面","上",19.9,3.1, 21.8,+9.55, 21.62,+8.61, 21.2,+6.53, +9.24,"強漲"),
      makeStock("4919","新唐","AI伺服器／零組件","上",99.4,1.8, 109,+9.66, 107.48,+8.13, 109,+9.66, +9.15,"強漲"),
      makeStock("1305","華夏","塑化／油價地緣政治","上",15.45,1.8, 16.9,+9.39, 16.78,+8.64, 16.8,+8.74, +9.14,"強漲"),
      makeStock("3057","喬鼎","AI儲存／NAS","櫃",18.3,3.8, 20.1,+9.84, 19.53,+6.72, 19,+3.83, +8.80,"銘碼漲"),
      makeStock("6907","強特力-KY","汽車零組件","櫃",159.5,2.9, 175,+9.72, 172,+7.84, 170,+6.58, +8.71,"強勢漲"),
      makeStock("3693","營邦","AI伺服器／零組件","上",583,1.5, 618,+6.00, 571.17,-2.03, 535,-8.23, +3.33,"開高走低"),
      makeStock("7547","碩網","AI軟體／邊緣運算","上",69.3,1.8, 71.7,+3.46, 71,+2.45, 68.3,-1.44, +3.12,"開高走低"),
      makeStock("4967","十銓","記憶體","櫃",271,1.1, 287.5,+6.09, 261.21,-3.61, 261.5,-3.51, +2.85,"開高走低"),
      makeStock("6276","安鈦克","低價投機／籌碼面","櫃",35.35,5.6, 35.35,+0.00, 38.2,+8.06, 37.6,+6.36, +2.69,"強勢漲"),
      makeStock("6542","陸中","低價投機／籌碼面","櫃",52,3.1, 52.7,+1.35, 54.58,+4.96, 54.6,+5.00, +2.55,"強勢漲"),
      makeStock("1711","永光","化纖／化學族群連動","櫃",43.25,0.4, 44.45,+2.77, 43.9,+1.51, 41.8,-3.35, +2.35,"開高走低"),
      makeStock("6217","中探針","半導體檢測／IC設計","上",183.5,0.7, 185,+0.82, 193.24,+5.31, 190,+3.54, +2.31,"銘碼漲"),
      makeStock("6226","光鼎","LED／車用感測","櫃",14.65,0.6, 14.9,+1.71, 15.12,+3.21, 14.85,+1.37, +2.21,"銘碼漲"),
      makeStock("3066","李洲","低價投機／籌碼面","上",24,0.4, 24.95,+3.96, 23.64,-1.52, 22.6,-5.83, +2.13,"開高走低"),
      makeStock("6426","統新","矽光子／光通訊","上",174,2.9, 176.5,+1.44, 177.37,+1.93, 169,-2.87, +1.60,"開高走低"),
      makeStock("3508","位速","綠能／鈣鈦礦太陽能","上",52.3,1.3, 54,+3.25, 50.91,-2.66, 47.9,-8.41, +1.28,"開高走低"),
      makeStock("3591","艾笛森","LED／車用感測","櫃",22,1.1, 22.5,+2.27, 21.78,-0.96, 21.3,-3.18, +1.19,"開高走低"),
      makeStock("2368","金像電","AI伺服器／零組件","櫃",1005,2.0, 1030,+2.49, 986.3,-1.86, 988,-1.69, +1.04,"開高走低"),
      makeStock("9931","欣高","天然氣／瓦斯","上",41.8,1.3, 42.3,+1.20, 41.91,+0.27, 39.2,-6.22, +0.89,"開高走低"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",584,0.9, 598,+2.40, 562.85,-3.62, 554,-5.14, +0.39,"開高走低"),
      makeStock("1725","元祖","化纖／化學族群連動B","上",35.45,1.0, 35.65,+0.56, 35.07,-1.07, 33.1,-6.63, +0.02,"開高走低"),
      makeStock("3715","定穎投控","AI伺服器／零組件","上",190.5,0.9, 193,+1.31, 182.61,-4.14, 178.5,-6.30, -0.51,"開高走低"),
      makeStock("4569","六方科-KY","低價投機／籌碼面","櫃",151,1.5, 150,-0.66, 150.24,-0.50, 152,+0.66, -0.61,"銘碼漲"),
      makeStock("6290","良維","AI伺服器／零組件","上",241,1.2, 243.5,+1.04, 229.85,-4.63, 224,-7.05, -0.85,"開高走低"),
      makeStock("7711","永擎","AI伺服器／零組件","櫃",269.5,0.6, 269,-0.19, 263.29,-2.30, 262.5,-2.60, -0.89,"直接跌"),
      makeStock("7718","友誠","汽車零組件","上",55,0.8, 55.5,+0.91, 52.17,-5.15, 49.6,-9.82, -1.11,"開高走低"),
      makeStock("9929","秋雨","低價投機／籌碼面","櫃",13.65,1.1, 13.05,-4.40, 14.37,+5.30, 15,+9.89, -1.16,"銘碼漲"),
      makeStock("4973","廣穎","記憶體","上",98.2,0.3, 98.2,+0.00, 90.02,-8.33, 88.4,-9.98, -2.78,"直接跌"),
      makeStock("3260","威剛","記憶體","上",525,0.9, 516,-1.71, 468.42,-10.78, 457.5,-12.86, -4.74,"直接跌"),
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function pctPositive(arr: number[]): number {
  if (!arr.length) return 0;
  return (arr.filter((v) => v > 0).length / arr.length) * 100;
}

function computeDayStats(day: DayData) {
  const s = day.stocks;
  const openAvg = avg(s.map((x) => x.nextOpenPct));
  const avgAvg = avg(s.map((x) => x.nextAvgPct));
  const closeAvg = avg(s.map((x) => x.nextClosePct));
  const openPositive = pctPositive(s.map((x) => x.nextOpenPct));
  const avgPositive = pctPositive(s.map((x) => x.nextAvgPct));
  const closePositive = pctPositive(s.map((x) => x.nextClosePct));
  const continuedCount = s.filter((x) => x.label === "續漲停").length;
  return { openAvg, avgAvg, closeAvg, openPositive, avgPositive, closePositive, continuedCount, totalCount: s.length };
}

function computeGroupPerfs(day: DayData): GroupPerf[] {
  const groupMap = new Map<string, NextDayStock[]>();
  for (const s of day.stocks) {
    if (!groupMap.has(s.group)) groupMap.set(s.group, []);
    groupMap.get(s.group)!.push(s);
  }
  return Array.from(groupMap.entries())
    .map(([name, stocks]) => {
      const closeArr = stocks.map((s) => s.nextClosePct);
      const positiveCount = closeArr.filter((v) => v > 0).length;
      // mock streak
      const streakMap: Record<string, number> = {
        "塑化／油價地緣政治": 2, "半導體檢測／IC設計": 3, "低價投機／籌碼面": 0,
        "記憶體": 0, "PCB／CCL銅箔基板": 2, "AI伺服器／零組件": 0,
      };
      return {
        name,
        color: stocks[0]?.groupColor || "#64748b",
        count: stocks.length,
        positiveCount,
        positiveRate: (positiveCount / stocks.length) * 100,
        openAvg: avg(stocks.map((s) => s.nextOpenPct)),
        avgAvg: avg(stocks.map((s) => s.nextAvgPct)),
        closeAvg: avg(closeArr),
        streak: streakMap[name] ?? 0,
      };
    })
    .sort((a, b) => b.positiveRate - a.positiveRate || b.closeAvg - a.closeAvg);
}

const ALL_LABELS: StockLabel[] = ["續漲停", "強漲", "強勢漲", "銘碼漲", "開高走低", "直接跌"];

/* ═══════════════════════════════════════════════════════════════
   SVG Line Chart
   ═══════════════════════════════════════════════════════════════ */

interface ChartLine { values: number[]; color: string; label: string }

function LineChart({ lines, labels, title, height = 200 }: {
  lines: ChartLine[]; labels: string[]; title: string; height?: number;
}) {
  const W = 900, H = height;
  const PAD = { top: 40, right: 90, bottom: 35, left: 55 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const allVals = lines.flatMap((l) => l.values);
  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals);
  const range = dataMax - dataMin || 1;
  const yMin = dataMin - range * 0.15;
  const yMax = dataMax + range * 0.15;
  const xStep = labels.length > 1 ? chartW / (labels.length - 1) : chartW;
  const toX = (i: number) => PAD.left + i * xStep;
  const toY = (v: number) => PAD.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount }, (_, i) => yMin + ((yMax - yMin) * i) / (tickCount - 1));

  return (
    <div className="bg-bg-2 border border-border rounded-lg p-4 overflow-hidden">
      <h3 className="text-sm font-semibold text-txt-1 mb-3 tracking-tight">{title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={toY(v)} y2={toY(v)}
              stroke="rgba(255,255,255,0.05)" strokeDasharray={v === 0 ? "none" : "4,3"} strokeWidth={v === 0 ? 1.5 : 0.8} />
            <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fill="#475569" fontSize="11" fontFamily="Inter, system-ui">
              {v.toFixed(v === 0 ? 0 : 1)}%
            </text>
          </g>
        ))}
        {yMin <= 0 && yMax >= 0 && (
          <line x1={PAD.left} x2={W - PAD.right} y1={toY(0)} y2={toY(0)}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="6,4" />
        )}
        {labels.map((label, i) => (
          <text key={i} x={toX(i)} y={H - 8} textAnchor="middle" fill="#475569" fontSize="11" fontFamily="Inter, system-ui">
            {label}
          </text>
        ))}
        {lines.map((line, li) => {
          const pts = line.values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
          const area = [
            `${toX(0)},${toY(line.values[0])}`,
            ...line.values.map((v, i) => `${toX(i)},${toY(v)}`),
            `${toX(line.values.length - 1)},${toY(yMin)}`,
            `${toX(0)},${toY(yMin)}`,
          ].join(" ");
          const gId = `g${li}${title.replace(/[^a-z]/gi, "")}`;
          return (
            <g key={li}>
              <defs>
                <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={line.color} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={line.color} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={area} fill={`url(#${gId})`} />
              <polyline points={pts} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {line.values.map((v, i) => (
                <circle key={i} cx={toX(i)} cy={toY(v)} r="4" fill={line.color} stroke="var(--bg-2)" strokeWidth="2" />
              ))}
              <text x={W - PAD.right + 8} y={toY(line.values[line.values.length - 1]) + 4}
                fill={line.color} fontSize="11" fontWeight="600" fontFamily="Inter, system-ui">
                ○ {line.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   KPI Card
   ═══════════════════════════════════════════════════════════════ */

function KpiCard({ label, value, subLabel, subValue, accent }: {
  label: string; value: string; subLabel: string; subValue: string; accent: string;
}) {
  return (
    <div className="relative overflow-hidden bg-bg-2 border border-border rounded-lg px-5 py-4 hover:border-border-hover transition-all">
      <div className="absolute top-0 left-0 right-0 h-[2px] opacity-40" style={{ backgroundColor: accent }} />
      <div className="text-[11px] text-txt-3 font-medium tracking-wide mb-2">{label}</div>
      <div className="text-2xl font-bold tabular-nums tracking-tight leading-none mb-1.5" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[10px] text-txt-4">
        {subLabel} <span style={{ color: accent }}>{subValue}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Label Badge
   ═══════════════════════════════════════════════════════════════ */

function LabelBadge({ label }: { label: StockLabel }) {
  const c = LABEL_CONFIG[label];
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded ${c.bg} ${c.text} border ${c.border}`}>
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Market Badge
   ═══════════════════════════════════════════════════════════════ */

function MarketBadge({ market }: { market: Market }) {
  return market === "上" ? (
    <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded bg-green/15 text-green border border-green/20">
      上
    </span>
  ) : (
    <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded bg-blue/15 text-blue border border-blue/20">
      櫃
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Price + Pct Cell
   ═══════════════════════════════════════════════════════════════ */

function PriceCell({ price, pct }: { price: number; pct: number }) {
  const color = pct > 0 ? "text-green" : pct < 0 ? "text-red" : "text-txt-3";
  return (
    <div className="flex items-baseline justify-end gap-1.5">
      <span className="text-txt-2 tabular-nums">{formatPrice(price)}</span>
      <span className={`text-[10px] font-semibold tabular-nums ${color}`}>{formatPct(pct)}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Volume Ratio
   ═══════════════════════════════════════════════════════════════ */

function VolumeRatio({ ratio }: { ratio: number }) {
  const color = ratio >= 3 ? "text-red font-bold" : ratio >= 2 ? "text-amber font-semibold" : "text-txt-3";
  return <span className={`tabular-nums text-[11px] ${color}`}>{ratio.toFixed(1)}x</span>;
}

/* ═══════════════════════════════════════════════════════════════
   Streak Badge
   ═══════════════════════════════════════════════════════════════ */

function StreakBadge({ days }: { days: number }) {
  if (!days) return <span className="text-txt-4 text-[11px]">—</span>;
  const color = days >= 3 ? "bg-red/20 text-red border-red/30" : "bg-amber/15 text-amber border-amber/25";
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded border ${color}`}>
      {days}天
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════════ */

export default function NextDayPage() {
  const [dateIndex, setDateIndex] = useState(MOCK_DATA.length - 1);
  const [activeFilter, setActiveFilter] = useState<StockLabel | "all">("all");
  const [sortKey, setSortKey] = useState("weightedReturn");
  const [sortAsc, setSortAsc] = useState(false);

  const day = MOCK_DATA[dateIndex];
  const stats = computeDayStats(day);
  const groupPerfs = useMemo(() => computeGroupPerfs(day), [day]);

  // Filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = { all: day.stocks.length };
    ALL_LABELS.forEach((l) => { counts[l] = day.stocks.filter((s) => s.label === l).length; });
    return counts;
  }, [day.stocks]);

  // Filtered + sorted stocks
  const displayStocks = useMemo(() => {
    let list = activeFilter === "all" ? [...day.stocks] : day.stocks.filter((s) => s.label === activeFilter);
    list.sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case "nextOpenPct": va = a.nextOpenPct; vb = b.nextOpenPct; break;
        case "nextAvgPct": va = a.nextAvgPct; vb = b.nextAvgPct; break;
        case "nextClosePct": va = a.nextClosePct; vb = b.nextClosePct; break;
        case "weightedReturn": va = a.weightedReturn; vb = b.weightedReturn; break;
        case "volumeRatio": va = a.volumeRatio; vb = b.volumeRatio; break;
        case "code": va = a.code; vb = b.code; break;
        default: va = a.weightedReturn; vb = b.weightedReturn;
      }
      if (typeof va === "number" && typeof vb === "number") return sortAsc ? va - vb : vb - va;
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return list;
  }, [day.stocks, activeFilter, sortKey, sortAsc]);

  function handleSort(key: string) {
    if (key === sortKey) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  // History chart data
  const histLabels = MOCK_DATA.map((d) => d.nextDate.slice(5).replace("-", "/"));
  const histAvg: ChartLine[] = [
    { values: MOCK_DATA.map((d) => computeDayStats(d).openAvg), color: "#3b82f6", label: "開盤" },
    { values: MOCK_DATA.map((d) => computeDayStats(d).avgAvg), color: "#f59e0b", label: "均價" },
    { values: MOCK_DATA.map((d) => computeDayStats(d).closeAvg), color: "#ef4444", label: "收盤" },
  ];
  const histRate: ChartLine[] = [
    { values: MOCK_DATA.map((d) => computeDayStats(d).openPositive), color: "#3b82f6", label: "開盤" },
    { values: MOCK_DATA.map((d) => computeDayStats(d).avgPositive), color: "#f59e0b", label: "均價" },
    { values: MOCK_DATA.map((d) => computeDayStats(d).closePositive), color: "#ef4444", label: "收盤" },
  ];

  const SortIcon = ({ k }: { k: string }) =>
    sortKey === k ? <span className="ml-0.5 text-accent">{sortAsc ? "▲" : "▼"}</span> : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav currentDate={day.nextDate} />

      <main className="flex-1 overflow-y-auto">
        {/* ─── Hero Header ─── */}
        <div className="relative border-b border-border">
          <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.03] to-transparent pointer-events-none" />
          <div className="max-w-[1400px] mx-auto px-6 py-5 text-center">
            <h1 className="text-lg font-bold text-txt-0 tracking-tight flex items-center justify-center gap-2">
              <span className="text-xl">📊</span> 漲停隔日表現
            </h1>
            <p className="text-[11px] text-txt-4 mt-1">
              漲停日 {day.limitDate.replace(/-/g, "/")} → 隔日 {day.nextDate.replace(/-/g, "/")}
            </p>
            <div className="flex items-center justify-center gap-3 mt-3">
              <button onClick={() => setDateIndex((i) => Math.max(0, i - 1))} disabled={dateIndex === 0}
                className="w-8 h-8 rounded-lg bg-bg-3 border border-border flex items-center justify-center text-txt-3 hover:text-txt-0 hover:bg-bg-4 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                ◀
              </button>
              <div className="px-5 py-1.5 bg-bg-3 border border-border rounded-lg">
                <span className="text-base font-bold text-accent tabular-nums tracking-wider">
                  {day.nextDate.replace(/-/g, "/")}
                </span>
              </div>
              <button onClick={() => setDateIndex((i) => Math.min(MOCK_DATA.length - 1, i + 1))} disabled={dateIndex === MOCK_DATA.length - 1}
                className="w-8 h-8 rounded-lg bg-bg-3 border border-border flex items-center justify-center text-txt-3 hover:text-txt-0 hover:bg-bg-4 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                ▶
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-6 py-5 space-y-5">
          {/* ─── KPI Cards ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="開盤均報酬" value={formatPct(stats.openAvg)}
              subLabel="正報酬率" subValue={`${stats.openPositive.toFixed(1)}%`}
              accent="#22c55e" />
            <KpiCard label="均價均報酬" value={formatPct(stats.avgAvg)}
              subLabel="正報酬率" subValue={`${stats.avgPositive.toFixed(1)}%`}
              accent="#3b82f6" />
            <KpiCard label="收盤均報酬" value={formatPct(stats.closeAvg)}
              subLabel="正報酬率" subValue={`${stats.closePositive.toFixed(1)}%`}
              accent="#f59e0b" />
            <KpiCard label="續漲停" value={`${stats.continuedCount} 檔`}
              subLabel="" subValue={`${day.totalLimitUp} 檔漲停`}
              accent="#ef4444" />
          </div>

          {/* ─── 歷史趨勢 ─── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">📈</span>
              <h2 className="text-sm font-semibold text-txt-0">歷史趨勢</h2>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LineChart lines={histAvg} labels={histLabels} title="均報酬 %" />
              <LineChart lines={histRate} labels={histLabels} title="正報酬率 %" />
            </div>
          </div>

          {/* ─── 族群正報酬率 ─── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">🏷️</span>
              <h2 className="text-sm font-semibold text-txt-0">族群正報酬率</h2>
            </div>
            <div className="bg-bg-2 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs min-w-[700px]">
                <thead>
                  <tr className="border-b border-border bg-bg-3/50">
                    <th className="text-left px-4 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">族群</th>
                    <th className="text-center px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">連續</th>
                    <th className="text-center px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">
                      正報酬率 <span className="text-txt-4 cursor-help" title="收盤正報酬的比例">ⓘ</span>
                    </th>
                    <th className="text-right px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">開盤</th>
                    <th className="text-right px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">均價</th>
                    <th className="text-right px-3 py-3 text-[10px] font-medium text-txt-4 tracking-wide uppercase">收盤</th>
                  </tr>
                </thead>
                <tbody>
                  {groupPerfs.map((g) => (
                    <tr key={g.name} className="border-b border-border/50 last:border-0 hover:bg-bg-3/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
                          <span className="font-medium text-txt-1 text-[12px]">{g.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <StreakBadge days={g.streak} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-bold tabular-nums ${g.positiveRate >= 80 ? "text-green" : g.positiveRate >= 50 ? "text-amber" : "text-red"}`}>
                              {g.positiveRate.toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-txt-4">{g.positiveCount}/{g.count}</span>
                          </div>
                          <div className="h-[3px] w-16 bg-bg-4 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${g.positiveRate >= 80 ? "bg-green" : g.positiveRate >= 50 ? "bg-amber" : "bg-red"}`}
                              style={{ width: `${g.positiveRate}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${g.openAvg > 0 ? "text-green" : "text-red"}`}>
                        {formatPct(g.openAvg)}
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${g.avgAvg > 0 ? "text-green" : "text-red"}`}>
                        {formatPct(g.avgAvg)}
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${g.closeAvg > 0 ? "text-green" : "text-red"}`}>
                        {formatPct(g.closeAvg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── 個股明細 ─── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">📋</span>
              <h2 className="text-sm font-semibold text-txt-0">個股明細（{day.stocks.length} 檔）</h2>
            </div>
            <p className="text-[10px] text-txt-4 mb-3">
              標籤根據隔日買賣開盤與收盤價格分類，僅描述已發生之走勢。
            </p>

            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => setActiveFilter("all")}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium border transition-all ${
                  activeFilter === "all"
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "bg-bg-3 text-txt-3 border-border hover:text-txt-1 hover:border-border-hover"
                }`}>
                全部 {filterCounts.all}
              </button>
              {ALL_LABELS.map((label) => {
                const cnt = filterCounts[label] || 0;
                if (cnt === 0) return null;
                const lc = LABEL_CONFIG[label];
                const isActive = activeFilter === label;
                return (
                  <button key={label} onClick={() => setActiveFilter(isActive ? "all" : label)}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-medium border transition-all ${
                      isActive
                        ? `${lc.bg} ${lc.text} ${lc.border}`
                        : "bg-bg-3 text-txt-3 border-border hover:text-txt-1 hover:border-border-hover"
                    }`}>
                    {label} {cnt}
                  </button>
                );
              })}
            </div>

            {/* Stock Table */}
            <div className="bg-bg-2 border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs min-w-[1100px]">
                <thead>
                  <tr className="border-b border-border bg-bg-3/50">
                    <th className="text-center px-2 py-2.5 text-[10px] font-medium text-txt-4 w-10">所</th>
                    <th onClick={() => handleSort("code")}
                      className="text-left px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2 w-16">
                      代號<SortIcon k="code" />
                    </th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">名稱</th>
                    <th className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">漲停價</th>
                    <th onClick={() => handleSort("volumeRatio")}
                      className="text-center px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2">
                      量比<SortIcon k="volumeRatio" />
                    </th>
                    <th onClick={() => handleSort("nextOpenPct")}
                      className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2">
                      隔日開<SortIcon k="nextOpenPct" />
                    </th>
                    <th onClick={() => handleSort("nextAvgPct")}
                      className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2">
                      隔日均價<SortIcon k="nextAvgPct" />
                    </th>
                    <th onClick={() => handleSort("nextClosePct")}
                      className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2">
                      隔日收<SortIcon k="nextClosePct" />
                    </th>
                    <th onClick={() => handleSort("weightedReturn")}
                      className="text-right px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase cursor-pointer hover:text-txt-2">
                      加權<SortIcon k="weightedReturn" />
                    </th>
                    <th className="text-center px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">標籤</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-medium text-txt-4 tracking-wide uppercase">族群</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStocks.map((s) => (
                    <tr key={s.code} className="border-b border-border/50 last:border-0 hover:bg-bg-3/30 transition-colors">
                      <td className="px-2 py-2.5 text-center"><MarketBadge market={s.market} /></td>
                      <td className="px-3 py-2.5 font-mono text-txt-3 text-[11px]">
                        <Link href={`/stock/${s.code}`} className="hover:text-txt-0 hover:underline underline-offset-2 transition-colors">
                          {s.code}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-txt-1">
                        <Link href={`/stock/${s.code}`} className="hover:text-txt-0 transition-colors">{s.name}</Link>
                      </td>
                      <td className="px-3 py-2.5 text-right text-txt-2 tabular-nums">{formatPrice(s.limitPrice)}</td>
                      <td className="px-3 py-2.5 text-center"><VolumeRatio ratio={s.volumeRatio} /></td>
                      <td className="px-3 py-2.5 text-right"><PriceCell price={s.nextOpen} pct={s.nextOpenPct} /></td>
                      <td className="px-3 py-2.5 text-right"><PriceCell price={s.nextAvg} pct={s.nextAvgPct} /></td>
                      <td className="px-3 py-2.5 text-right"><PriceCell price={s.nextClose} pct={s.nextClosePct} /></td>
                      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${s.weightedReturn > 0 ? "text-green" : s.weightedReturn < 0 ? "text-red" : "text-txt-3"}`}>
                        {formatPct(s.weightedReturn)}
                      </td>
                      <td className="px-3 py-2.5 text-center"><LabelBadge label={s.label} /></td>
                      <td className="px-3 py-2.5 text-left">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: s.groupColor }} />
                          <span className="text-[11px] text-txt-3 truncate max-w-[140px]">{s.group}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-4 text-[10px] text-txt-4 border-t border-border/50 space-y-1">
            <p>資料來源：臺灣證券交易所／證券櫃檯買賣中心</p>
            <p className="text-amber/80">本站資訊僅供參考，不構成任何投資建議。投資人應獨立判斷，審慎評估並自負盈虧。</p>
          </div>
        </div>
      </main>
    </div>
  );
}
