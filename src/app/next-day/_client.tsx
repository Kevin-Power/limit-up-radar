"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
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
  "AI伺服器／散熱": "#06b6d4",
  "半導體設備／檢測": "#a855f7",
  "IC設計": "#6366f1",
  "生技新藥": "#10b981",
  "塑化": "#3b82f6",
  "鋼鐵": "#64748b",
  "PCB／CCL銅箔基板": "#f97316",
  "光通訊": "#14b8a6",
  "電子代工": "#ec4899",
  "營建資產": "#ef4444",
  "低價投機／籌碼面": "#f59e0b",
  "電子零組件": "#8b5cf6",
  "綠能／鈣鈦礦太陽能": "#84cc16",
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
      makeStock("3017","奇鋐","AI伺服器／散熱","上",329,1.8, 361.9,+10.00, 361.9,+10.00, 361.9,+10.00, +10.00,"續漲停"),
      makeStock("4743","合一","生技新藥","上",328,2.1, 360.5,+9.91, 360.5,+9.91, 360.5,+9.91, +9.91,"續漲停"),
      makeStock("6515","穎崴","半導體設備／檢測","上",7930,0.9, 8715,+9.90, 8715,+9.90, 8715,+9.90, +9.90,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",178,1.2, 195.5,+9.83, 195.5,+9.83, 195.5,+9.83, +9.83,"續漲停"),
      makeStock("7795","長廣","電子零組件","櫃",435,0.8, 478,+9.89, 478,+9.89, 478,+9.89, +9.89,"續漲停"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",13.95,1.5, 15.3,+9.68, 15.3,+9.68, 15.3,+9.68, +9.68,"續漲停"),
      makeStock("2007","燁興","鋼鐵","上",8.63,2.5, 9.49,+9.97, 9.49,+9.97, 9.49,+9.97, +9.97,"續漲停"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",142,1.6, 156,+9.86, 154.8,+9.01, 156,+9.86, +9.58,"續漲停"),
      makeStock("1301","台塑","塑化","上",42.8,2.8, 47,+9.81, 46.5,+8.64, 45.2,+5.61, +9.42,"強漲"),
      makeStock("4977","眾達-KY","光通訊","上",285,1.3, 313,+9.82, 310.5,+8.95, 313,+9.82, +9.53,"續漲停"),
      makeStock("2458","義隆","IC設計","上",142,1.7, 156,+9.86, 153.8,+8.31, 156,+9.86, +9.34,"續漲停"),
      makeStock("2548","華固","營建資產","上",128,3.2, 140,+9.38, 139,+8.59, 136,+6.25, +9.07,"強漲"),
      makeStock("2401","凌陽","IC設計","上",38.5,2.0, 42.3,+9.87, 41.5,+7.79, 42.3,+9.87, +9.18,"強漲"),
      makeStock("1303","南亞","塑化","上",38.5,1.9, 42.2,+9.61, 41.8,+8.57, 41.5,+7.79, +9.24,"強漲"),
      makeStock("2014","中鴻","鋼鐵","櫃",19.6,3.5, 21.5,+9.69, 20.8,+6.12, 20.2,+3.06, +8.51,"銘碼漲"),
      makeStock("2376","技嘉","AI伺服器／散熱","上",378,2.8, 415,+9.79, 410,+8.47, 405,+7.14, +8.47,"強勢漲"),
      makeStock("3324","雙鴻","AI伺服器／散熱","上",1065,1.5, 1130,+6.10, 1045,-1.88, 980,-7.98, +3.37,"開高走低"),
      makeStock("2379","瑞昱","IC設計","上",485,1.8, 500,+3.09, 498,+2.68, 478,-1.44, +2.96,"開高走低"),
      makeStock("6669","緯穎","AI伺服器／散熱","櫃",3775,1.2, 4000,+5.96, 3630,-3.84, 3580,-5.17, +2.63,"開高走低"),
      makeStock("6446","藥華藥","生技新藥","上",485,0.9, 495,+2.06, 498,+2.68, 492,+1.44, +2.06,"銘碼漲"),
      makeStock("5274","信驊","IC設計","上",2890,0.8, 2950,+2.08, 2920,+1.04, 2860,-1.04, +1.04,"開高走低"),
      makeStock("6223","旺矽","半導體設備／檢測","上",3860,0.6, 3920,+1.55, 3790,-1.81, 3720,-3.63, +0.47,"開高走低"),
      makeStock("2330","台積電","半導體設備／檢測","上",1840,0.9, 1870,+1.63, 1825,-0.82, 1790,-2.72, +0.21,"開高走低"),
      makeStock("2454","聯發科","IC設計","上",1700,1.0, 1720,+1.18, 1680,-1.18, 1650,-2.94, -0.31,"開高走低"),
      makeStock("2317","鴻海","電子代工","上",178,0.8, 179,+0.56, 175,-1.69, 172,-3.37, -0.84,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-11",
    nextDate: "2026-03-12",
    totalLimitUp: 55,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",361.9,1.5, 398,+9.98, 398,+9.98, 398,+9.98, +9.98,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",195.5,1.0, 215,+9.97, 215,+9.97, 215,+9.97, +9.97,"續漲停"),
      makeStock("7795","長廣","電子零組件","櫃",478,0.9, 525,+9.83, 520,+8.79, 518,+8.37, +8.99,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",156,1.8, 171,+9.62, 168,+7.69, 165,+5.77, +7.69,"強勢漲"),
      makeStock("1301","台塑","塑化","上",47,2.2, 51,+8.51, 49.8,+5.96, 48.5,+3.19, +5.89,"強勢漲"),
      makeStock("4977","眾達-KY","光通訊","上",313,1.5, 340,+8.63, 335,+7.03, 330,+5.43, +7.03,"強勢漲"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",15.3,1.8, 16.5,+7.84, 16.2,+5.88, 15.8,+3.27, +5.66,"強勢漲"),
      makeStock("2007","燁興","鋼鐵","上",9.49,2.0, 10.2,+7.48, 9.9,+4.32, 9.5,+0.11, +3.97,"開高走低"),
      makeStock("4743","合一","生技新藥","上",360.5,2.5, 380,+5.41, 370,+2.64, 355,-1.53, +2.15,"開高走低"),
      makeStock("2548","華固","營建資產","上",140,2.8, 145,+3.57, 142,-1.43, 138,-1.43, -0.24,"開高走低"),
      makeStock("6515","穎崴","半導體設備／檢測","上",8715,1.2, 8750,+0.40, 8500,-2.47, 8400,-3.61, -1.89,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-12",
    nextDate: "2026-03-13",
    totalLimitUp: 42,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",398,1.8, 437.5,+9.92, 437.5,+9.92, 437.5,+9.92, +9.92,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",215,1.2, 236,+9.77, 233,+8.37, 230,+6.98, +8.37,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",525,1.0, 572,+8.95, 568,+8.19, 562,+7.05, +8.06,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",171,2.0, 185,+8.19, 182,+6.43, 178,+4.09, +6.24,"強勢漲"),
      makeStock("1301","台塑","塑化","上",51,1.8, 54,+5.88, 53,+3.92, 51.5,+0.98, +3.59,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",340,1.5, 355,+4.41, 348,+2.35, 342,+0.59, +2.45,"開高走低"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",16.5,1.5, 17.2,+4.24, 16.8,+1.82, 16.2,-1.82, +1.41,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",10.2,1.2, 10.0,-1.96, 9.8,-3.92, 9.6,-5.88, -3.92,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-13",
    nextDate: "2026-03-14",
    totalLimitUp: 38,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",437.5,2.0, 481,+9.94, 481,+9.94, 481,+9.94, +9.94,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",236,1.5, 259,+9.75, 255,+8.05, 252,+6.78, +8.19,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",572,1.2, 625,+9.27, 618,+8.04, 610,+6.64, +7.98,"強勢漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",185,1.5, 200,+8.11, 196,+5.95, 192,+3.78, +5.95,"強勢漲"),
      makeStock("1301","台塑","塑化","上",54,1.5, 57,+5.56, 55.5,+2.78, 54.2,+0.37, +2.90,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",355,1.0, 362,+1.97, 358,+0.85, 350,-1.41, +0.47,"開高走低"),
    ],
  },
  {
    limitDate: "2026-03-14",
    nextDate: "2026-03-16",
    totalLimitUp: 45,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",481,2.5, 529,+9.98, 529,+9.98, 529,+9.98, +9.98,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",259,1.8, 284,+9.65, 280,+8.11, 275,+6.18, +7.98,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",625,1.5, 680,+8.80, 675,+8.00, 668,+6.88, +7.89,"強勢漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",200,1.2, 218,+9.00, 215,+7.50, 210,+5.00, +7.17,"強勢漲"),
      makeStock("1301","台塑","塑化","上",57,1.2, 60,+5.26, 59,+3.51, 57.5,+0.88, +3.22,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",362,0.9, 370,+2.21, 365,+0.83, 358,-1.10, +0.65,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",10.0,0.8, 9.7,-3.00, 9.5,-5.00, 9.3,-7.00, -5.00,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-16",
    nextDate: "2026-03-17",
    totalLimitUp: 52,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",529,2.8, 581.5,+9.92, 581.5,+9.92, 581.5,+9.92, +9.92,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",284,2.0, 312,+9.86, 308,+8.45, 305,+7.39, +8.57,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",680,1.8, 745,+9.56, 740,+8.82, 735,+8.09, +8.82,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",218,1.5, 238,+9.17, 235,+7.80, 230,+5.50, +7.49,"強勢漲"),
      makeStock("1301","台塑","塑化","上",60,1.5, 64,+6.67, 63,+5.00, 62,+3.33, +5.00,"強勢漲"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",17.2,1.2, 18.5,+7.56, 18,+4.65, 17.5,+1.74, +4.65,"強勢漲"),
      makeStock("4977","眾達-KY","光通訊","上",370,1.0, 380,+2.70, 375,+1.35, 368,-0.54, +1.17,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",9.7,0.8, 9.4,-3.09, 9.2,-5.15, 9.0,-7.22, -5.15,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-17",
    nextDate: "2026-03-18",
    totalLimitUp: 58,
    stocks: [
      makeStock("3363","上詮","光通訊","櫃",312,2.0, 343,+9.94, 340,+8.97, 338,+8.33, +9.08,"續漲停"),
      makeStock("3017","奇鋐","AI伺服器／散熱","上",581.5,3.2, 639,+9.89, 635,+9.20, 628,+7.99, +8.69,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",745,2.5, 815,+9.40, 810,+8.72, 800,+7.38, +8.50,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",238,1.8, 258,+8.40, 255,+7.14, 250,+5.04, +6.86,"強勢漲"),
      makeStock("1301","台塑","塑化","上",64,1.8, 68,+6.25, 67,+4.69, 65.5,+2.34, +4.43,"強勢漲"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",18.5,1.5, 20,+8.11, 19.5,+5.41, 19,+2.70, +5.41,"強勢漲"),
      makeStock("4977","眾達-KY","光通訊","上",380,1.2, 395,+3.95, 390,+2.63, 385,+1.32, +2.63,"開高走低"),
      makeStock("4743","合一","生技新藥","上",380,2.0, 398,+4.74, 392,+3.16, 378,-0.53, +2.46,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",9.4,0.6, 9.2,-2.13, 9.0,-4.26, 8.8,-6.38, -4.26,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-18",
    nextDate: "2026-03-19",
    totalLimitUp: 61,
    stocks: [
      makeStock("3363","上詮","光通訊","櫃",343,2.5, 377,+9.91, 375,+9.33, 372,+8.45, +9.23,"續漲停"),
      makeStock("3017","奇鋐","AI伺服器／散熱","上",639,3.5, 702,+9.86, 702,+9.86, 702,+9.86, +9.86,"續漲停"),
      makeStock("7795","長廣","電子零組件","櫃",815,2.8, 896,+9.94, 890,+9.20, 885,+8.59, +9.11,"續漲停"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",258,1.8, 283,+9.69, 280,+8.53, 278,+7.75, +8.66,"強漲"),
      makeStock("1301","台塑","塑化","上",68,2.0, 74,+8.82, 73,+7.35, 72,+5.88, +7.35,"強勢漲"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",20,1.5, 21.5,+7.50, 21,+5.00, 20.5,+2.50, +5.00,"強勢漲"),
      makeStock("4743","合一","生技新藥","上",398,2.2, 420,+5.53, 415,+4.27, 408,+2.51, +4.10,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",395,1.2, 415,+5.06, 410,+3.80, 405,+2.53, +3.80,"強勢漲"),
    ],
  },
  {
    limitDate: "2026-03-19",
    nextDate: "2026-03-20",
    totalLimitUp: 64,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",329,1.8, 361.9,+10.00, 361.9,+10.00, 361.9,+10.00, +10.00,"續漲停"),
      makeStock("4743","合一","生技新藥","上",328,2.1, 360.5,+9.91, 360.5,+9.91, 360.5,+9.91, +9.91,"續漲停"),
      makeStock("6515","穎崴","半導體設備／檢測","上",7930,0.9, 8715,+9.90, 8715,+9.90, 8715,+9.90, +9.90,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",178,1.2, 195.5,+9.83, 195.5,+9.83, 195.5,+9.83, +9.83,"續漲停"),
      makeStock("7795","長廣","電子零組件","櫃",435,0.8, 478,+9.89, 478,+9.89, 478,+9.89, +9.89,"續漲停"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",13.95,1.5, 15.3,+9.68, 15.3,+9.68, 15.3,+9.68, +9.68,"續漲停"),
      makeStock("2007","燁興","鋼鐵","上",8.63,2.5, 9.49,+9.97, 9.49,+9.97, 9.49,+9.97, +9.97,"續漲停"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",142,1.6, 156,+9.86, 154.8,+9.01, 156,+9.86, +9.58,"續漲停"),
      makeStock("1301","台塑","塑化","上",42.8,2.8, 47,+9.81, 46.5,+8.64, 45.2,+5.61, +9.42,"強漲"),
      makeStock("4977","眾達-KY","光通訊","上",285,1.3, 313,+9.82, 310.5,+8.95, 313,+9.82, +9.53,"續漲停"),
      makeStock("2458","義隆","IC設計","上",142,1.7, 156,+9.86, 153.8,+8.31, 156,+9.86, +9.34,"續漲停"),
      makeStock("2548","華固","營建資產","上",128,3.2, 140,+9.38, 139,+8.59, 136,+6.25, +9.07,"強漲"),
      makeStock("2401","凌陽","IC設計","上",38.5,2.0, 42.3,+9.87, 41.5,+7.79, 42.3,+9.87, +9.18,"強漲"),
      makeStock("1303","南亞","塑化","上",38.5,1.9, 42.2,+9.61, 41.8,+8.57, 41.5,+7.79, +9.24,"強漲"),
      makeStock("2014","中鴻","鋼鐵","櫃",19.6,3.5, 21.5,+9.69, 20.8,+6.12, 20.2,+3.06, +8.51,"銘碼漲"),
      makeStock("2376","技嘉","AI伺服器／散熱","上",378,2.8, 415,+9.79, 410,+8.47, 405,+7.14, +8.47,"強勢漲"),
      makeStock("3324","雙鴻","AI伺服器／散熱","上",1065,1.5, 1130,+6.10, 1045,-1.88, 980,-7.98, +3.37,"開高走低"),
      makeStock("2379","瑞昱","IC設計","上",485,1.8, 500,+3.09, 498,+2.68, 478,-1.44, +2.96,"開高走低"),
      makeStock("6669","緯穎","AI伺服器／散熱","櫃",3775,1.2, 4000,+5.96, 3630,-3.84, 3580,-5.17, +2.63,"開高走低"),
      makeStock("6446","藥華藥","生技新藥","上",485,0.9, 495,+2.06, 498,+2.68, 492,+1.44, +2.06,"銘碼漲"),
      makeStock("5274","信驊","IC設計","上",2890,0.8, 2950,+2.08, 2920,+1.04, 2860,-1.04, +1.04,"開高走低"),
      makeStock("6223","旺矽","半導體設備／檢測","上",3860,0.6, 3920,+1.55, 3790,-1.81, 3720,-3.63, +0.47,"開高走低"),
      makeStock("2330","台積電","半導體設備／檢測","上",1840,0.9, 1870,+1.63, 1825,-0.82, 1790,-2.72, +0.21,"開高走低"),
      makeStock("2454","聯發科","IC設計","上",1700,1.0, 1720,+1.18, 1680,-1.18, 1650,-2.94, -0.31,"開高走低"),
      makeStock("2317","鴻海","電子代工","上",178,0.8, 179,+0.56, 175,-1.69, 172,-3.37, -0.84,"直接跌"),
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
        "AI伺服器／散熱": 3, "光通訊": 3, "電子零組件": 2,
        "PCB／CCL銅箔基板": 2, "塑化": 2, "低價投機／籌碼面": 0,
        "鋼鐵": 0, "半導體設備／檢測": 1, "IC設計": 0,
        "生技新藥": 1, "營建資產": 0, "電子代工": 0,
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
      <NavBar />

      <main className="flex-1 overflow-y-auto animate-fade-in">
        {/* ─── Hero Header ─── */}
        <div className="relative border-b border-border">
          <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.03] to-transparent pointer-events-none" />
          <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5 text-center">
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

        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5 space-y-5">
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
                    <tr key={s.code} className="border-b border-border/50 last:border-0 hover:bg-bg-3/30 transition-colors row-hover">
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
