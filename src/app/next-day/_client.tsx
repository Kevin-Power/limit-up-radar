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
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1815,1.8, 1997,+10.00, 1997,+10.00, 1997,+10.00, +10.00,"續漲停"),
      makeStock("4743","合一","生技新藥","上",280,2.1, 308,+10.00, 308,+10.00, 308,+10.00, +10.00,"續漲停"),
      makeStock("6515","穎崴","半導體設備／檢測","上",7170,0.9, 7887,+10.00, 7887,+10.00, 7887,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",85,1.2, 93.5,+10.00, 93.5,+10.00, 93.5,+10.00, +10.00,"續漲停"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",13.8,1.5, 15.2,+10.00, 15.2,+10.00, 15.2,+10.00, +10.00,"續漲停"),
      makeStock("2007","燁興","鋼鐵","上",8.63,2.5, 9.49,+10.00, 9.49,+10.00, 9.49,+10.00, +10.00,"續漲停"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",95,1.6, 104.5,+10.00, 103.5,+8.95, 104.5,+10.00, +9.65,"續漲停"),
      makeStock("1301","台塑","塑化","上",44.75,2.8, 48.6,+8.65, 48.0,+7.31, 47.0,+4.81, +6.92,"強漲"),
      makeStock("4977","眾達-KY","光通訊","上",185,1.3, 203.5,+10.00, 201.5,+8.89, 203.5,+10.00, +9.63,"續漲停"),
      makeStock("2458","義隆","IC設計","上",131,1.7, 144.1,+10.00, 141.7,+8.15, 144.1,+10.00, +9.38,"續漲停"),
      makeStock("2548","華固","營建資產","上",117.5,3.2, 128.2,+9.09, 126.0,+7.27, 122.8,+4.55, +6.97,"強漲"),
      makeStock("2401","凌陽","IC設計","上",20.5,2.0, 22.5,+9.76, 22.1,+7.93, 22.5,+9.76, +9.15,"強漲"),
      makeStock("1303","南亞","塑化","上",73.8,1.9, 80.4,+8.89, 79.5,+7.78, 78.7,+6.67, +7.78,"強漲"),
      makeStock("2014","中鴻","鋼鐵","櫃",18.15,3.5, 19.7,+8.80, 19.2,+6.00, 18.7,+3.20, +6.00,"銘碼漲"),
      makeStock("2376","技嘉","AI伺服器／散熱","上",232.5,2.8, 252.8,+8.75, 250.0,+7.50, 247.0,+6.25, +7.50,"強勢漲"),
      makeStock("3324","雙鴻","AI伺服器／散熱","上",1065,1.5, 1120,+5.16, 1040,-2.35, 985,-7.51, +1.80,"開高走低"),
      makeStock("2379","瑞昱","IC設計","上",469.5,1.8, 482.8,+2.83, 476.6,+1.51, 462.4,-1.51, +0.94,"開高走低"),
      makeStock("6669","緯穎","AI伺服器／散熱","櫃",3645,1.2, 3850,+5.63, 3554,-2.50, 3508,-3.75, +0.46,"開高走低"),
      makeStock("6446","藥華藥","生技新藥","上",614,0.9, 627.6,+2.22, 620.8,+1.11, 607.2,-1.11, +0.74,"銘碼漲"),
      makeStock("5274","信驊","IC設計","上",3600,0.8, 3680,+2.22, 3640,+1.11, 3560,-1.11, +0.74,"開高走低"),
      makeStock("6223","旺矽","半導體設備／檢測","上",650,0.6, 662,+1.85, 642,-1.23, 630,-3.08, -0.82,"開高走低"),
      makeStock("2330","台積電","半導體設備／檢測","上",1810,0.9, 1839.5,+1.63, 1794.3,-0.87, 1770.7,-2.17, -0.47,"開高走低"),
      makeStock("2454","聯發科","IC設計","上",1625,1.0, 1645.6,+1.27, 1609.6,-0.95, 1592.0,-2.03, -0.57,"開高走低"),
      makeStock("2317","鴻海","電子代工","上",196,0.8, 197.9,+0.98, 193.1,-1.46, 189.3,-3.41, -1.30,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-11",
    nextDate: "2026-03-12",
    totalLimitUp: 55,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1997,1.5, 1997,+10.00, 1997,+10.00, 1997,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",93.5,1.0, 93.5,+10.00, 93.5,+10.00, 93.5,+10.00, +10.00,"續漲停"),
      makeStock("7795","長廣","電子零組件","櫃",367,0.9, 398,+8.33, 391,+6.67, 388,+5.83, +6.94,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",104.5,1.8, 113,+8.13, 111,+6.22, 109,+4.31, +6.22,"強勢漲"),
      makeStock("1301","台塑","塑化","上",48.6,2.2, 52.0,+7.08, 50.8,+4.42, 49.7,+2.30, +4.60,"強勢漲"),
      makeStock("4977","眾達-KY","光通訊","上",203.5,1.5, 220,+8.08, 215.8,+6.06, 211.7,+4.04, +6.06,"強勢漲"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",15.2,1.8, 16.3,+7.44, 15.9,+4.96, 15.6,+2.48, +4.96,"強勢漲"),
      makeStock("2007","燁興","鋼鐵","上",9.49,2.0, 9.95,+4.81, 9.64,+1.60, 9.29,-2.14, +1.42,"開高走低"),
      makeStock("4743","合一","生技新藥","上",308,2.5, 320,+3.90, 312,+1.30, 300,-2.60, +0.87,"開高走低"),
      makeStock("2548","華固","營建資產","上",128.2,2.8, 131.4,+2.50, 126.1,-1.67, 122.8,-4.17, -1.11,"開高走低"),
      makeStock("6515","穎崴","半導體設備／檢測","上",7887,1.2, 7924,+0.47, 7722,-2.10, 7630,-3.26, -1.63,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-12",
    nextDate: "2026-03-13",
    totalLimitUp: 42,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1997,1.8, 1997,+10.00, 1997,+10.00, 1997,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",93.5,1.2, 100,+6.95, 98,+4.81, 96,+2.67, +4.81,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",398,1.0, 428,+7.69, 422,+6.15, 416,+4.62, +6.15,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",113,2.0, 120,+6.19, 118,+4.42, 115,+1.77, +4.13,"強勢漲"),
      makeStock("1301","台塑","塑化","上",52.0,1.8, 54.2,+4.13, 52.9,+1.65, 51.1,-1.65, +1.38,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",220,1.5, 228.2,+3.74, 224.1,+1.87, 218.0,-0.93, +1.56,"開高走低"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",16.3,1.5, 16.8,+3.08, 16.4,+0.77, 15.8,-3.08, +0.26,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",9.95,1.2, 9.65,-3.06, 9.44,-5.10, 9.24,-7.14, -5.10,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-13",
    nextDate: "2026-03-14",
    totalLimitUp: 38,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1997,2.0, 1997,+10.00, 1997,+10.00, 1997,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",100,1.5, 108,+8.00, 106,+6.00, 104,+4.00, +6.00,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",428,1.2, 465,+8.57, 459,+7.14, 452,+5.71, +7.14,"強勢漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",120,1.5, 128,+6.67, 126,+5.00, 123,+2.50, +4.72,"強勢漲"),
      makeStock("1301","台塑","塑化","上",54.2,1.5, 55.9,+3.17, 54.6,+0.79, 53.3,-1.59, +0.79,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",228,1.0, 232.1,+1.80, 226.0,-0.90, 221.8,-2.70, -0.60,"開高走低"),
    ],
  },
  {
    limitDate: "2026-03-14",
    nextDate: "2026-03-16",
    totalLimitUp: 45,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1997,2.5, 1997,+10.00, 1997,+10.00, 1997,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",108,1.8, 118,+9.26, 116,+7.41, 114,+5.56, +7.41,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",465,1.5, 505,+8.55, 499,+7.24, 489,+5.26, +7.02,"強勢漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",128,1.2, 138,+7.81, 136,+6.25, 133,+3.91, +5.99,"強勢漲"),
      makeStock("1301","台塑","塑化","上",55.9,1.2, 57.6,+3.08, 56.3,+0.77, 55.0,-1.54, +0.77,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",232,0.9, 236.1,+1.77, 231.0,-0.44, 225.8,-2.65, -0.44,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",9.65,0.8, 9.35,-3.16, 9.14,-5.26, 8.94,-7.37, -5.26,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-16",
    nextDate: "2026-03-17",
    totalLimitUp: 52,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1997,2.8, 1997,+10.00, 1997,+10.00, 1997,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",118,2.0, 128,+8.47, 126,+6.78, 124,+5.08, +6.78,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",505,1.8, 545,+7.88, 539,+6.67, 530,+4.85, +6.47,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",138,1.5, 148,+7.25, 146,+5.80, 143,+3.62, +5.56,"強勢漲"),
      makeStock("1301","台塑","塑化","上",57.6,1.5, 60.2,+4.48, 59.3,+2.99, 58.0,+0.75, +2.74,"開高走低"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",16.3,1.2, 17.3,+6.15, 16.9,+3.85, 16.6,+1.54, +3.85,"強勢漲"),
      makeStock("4977","眾達-KY","光通訊","上",236,1.0, 241.1,+2.17, 238.1,+0.87, 233.9,-0.87, +0.72,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",9.35,0.8, 9.05,-3.26, 8.84,-5.43, 8.64,-7.61, -5.43,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-17",
    nextDate: "2026-03-18",
    totalLimitUp: 58,
    stocks: [
      makeStock("3363","上詮","光通訊","櫃",128,2.0, 140,+9.38, 138,+7.81, 136,+6.25, +7.81,"續漲停"),
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1997,3.2, 1970,+8.57, 1954,+6.43, 1925,+4.76, +6.59,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",545,2.5, 588,+7.87, 582,+6.74, 569,+4.49, +6.37,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",148,1.8, 158,+6.76, 156,+5.41, 153,+3.38, +5.18,"強勢漲"),
      makeStock("1301","台塑","塑化","上",60.2,1.8, 62.8,+4.29, 61.9,+2.86, 60.6,+0.71, +2.62,"開高走低"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",17.3,1.5, 18.3,+5.80, 18.1,+4.35, 17.6,+1.45, +3.87,"強勢漲"),
      makeStock("4977","眾達-KY","光通訊","上",241,1.2, 248.2,+2.98, 244.1,+1.28, 239.0,-0.85, +1.13,"開高走低"),
      makeStock("4743","合一","生技新藥","上",320,2.0, 332,+3.75, 325,+1.56, 315,-1.56, +1.25,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",9.05,0.6, 8.74,-3.37, 8.64,-4.49, 8.44,-6.74, -4.87,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-18",
    nextDate: "2026-03-19",
    totalLimitUp: 61,
    stocks: [
      makeStock("3363","上詮","光通訊","櫃",140,2.5, 152,+8.57, 150,+7.14, 148,+5.71, +7.14,"強漲"),
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1970,3.5, 1970,+10.00, 1970,+10.00, 1970,+10.00, +10.00,"續漲停"),
      makeStock("7795","長廣","電子零組件","櫃",588,2.8, 643,+9.38, 637,+8.33, 628,+6.77, +8.16,"續漲停"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",158,1.8, 170,+7.59, 168,+6.33, 165,+4.43, +6.12,"強漲"),
      makeStock("1301","台塑","塑化","上",62.8,2.0, 66.2,+5.48, 65.4,+4.11, 64.1,+2.05, +3.88,"強勢漲"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",18.3,1.5, 19.6,+6.85, 19.2,+4.79, 18.8,+2.74, +4.79,"強勢漲"),
      makeStock("4743","合一","生技新藥","上",332,2.2, 345,+3.92, 340,+2.41, 330,-0.60, +1.91,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",248,1.2, 256.2,+3.31, 254.2,+2.48, 251.1,+1.24, +2.34,"強勢漲"),
    ],
  },
  {
    limitDate: "2026-03-19",
    nextDate: "2026-03-20",
    totalLimitUp: 64,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1970,2.0, 1970,+10.00, 1970,+10.00, 1970,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",152,1.8, 165,+8.55, 162,+6.58, 160,+5.26, +6.80,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",643,1.5, 698,+8.57, 689,+7.14, 680,+5.71, +7.14,"強勢漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",170,1.2, 182,+7.06, 180,+5.88, 178,+4.71, +5.88,"強勢漲"),
      makeStock("4743","合一","生技新藥","上",345,2.5, 365,+5.80, 358,+3.77, 348,+0.87, +3.48,"開高走低"),
      makeStock("1301","台塑","塑化","上",66.2,1.5, 68.8,+3.90, 67.1,+1.30, 65.3,-1.30, +1.30,"開高走低"),
      makeStock("2376","技嘉","AI伺服器／散熱","上",252.8,2.8, 264.4,+4.60, 260.4,+2.99, 255.7,+1.15, +2.91,"強勢漲"),
      makeStock("2458","義隆","IC設計","上",144.1,1.7, 150.4,+4.38, 147.5,+2.36, 143.6,-0.34, +2.13,"開高走低"),
      makeStock("6446","藥華藥","生技新藥","上",614,0.9, 625.0,+1.78, 616.7,+0.44, 605.8,-1.33, +0.30,"開高走低"),
      makeStock("1303","南亞","塑化","上",80.4,1.2, 82.0,+2.04, 79.6,-1.02, 77.9,-3.06, -0.68,"直接跌"),
      makeStock("2317","鴻海","電子代工","上",197.9,0.8, 198.8,+0.48, 195.0,-1.45, 191.2,-3.38, -1.45,"直接跌"),
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
              stroke="var(--border)" strokeDasharray={v === 0 ? "none" : "4,3"} strokeWidth={v === 0 ? 1.5 : 0.8} />
            <text x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fill="var(--text-4)" fontSize="11" fontFamily="Inter, system-ui">
              {v.toFixed(v === 0 ? 0 : 1)}%
            </text>
          </g>
        ))}
        {yMin <= 0 && yMax >= 0 && (
          <line x1={PAD.left} x2={W - PAD.right} y1={toY(0)} y2={toY(0)}
            stroke="var(--border-hover)" strokeWidth={1} strokeDasharray="6,4" />
        )}
        {labels.map((label, i) => (
          <text key={i} x={toX(i)} y={H - 8} textAnchor="middle" fill="var(--text-4)" fontSize="11" fontFamily="Inter, system-ui">
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
