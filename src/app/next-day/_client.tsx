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
    limitDate: "2026-03-16",
    nextDate: "2026-03-17",
    totalLimitUp: 48,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1768,1.8, 1945,+10.00, 1945,+10.00, 1945,+10.00, +10.00,"續漲停"),
      makeStock("4743","合一","生技新藥","上",53.3,2.1, 58.6,+10.00, 58.6,+10.00, 58.6,+10.00, +10.00,"續漲停"),
      makeStock("6515","穎崴","半導體設備／檢測","上",7445,0.9, 8190,+10.00, 8190,+10.00, 8190,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",667,1.2, 734,+10.00, 734,+10.00, 734,+10.00, +10.00,"續漲停"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",11.86,1.5, 13.05,+10.00, 13.05,+10.00, 13.05,+10.00, +10.00,"續漲停"),
      makeStock("2007","燁興","鋼鐵","上",7.71,2.5, 8.48,+10.00, 8.48,+10.00, 8.48,+10.00, +10.00,"續漲停"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",504,1.6, 554,+10.00, 549,+8.95, 554,+10.00, +9.65,"續漲停"),
      makeStock("1301","台塑","塑化","上",45.05,2.8, 48.9,+8.55, 48.3,+7.22, 47.2,+4.77, +6.85,"強漲"),
      makeStock("4977","眾達-KY","光通訊","上",165,1.3, 181.5,+10.00, 179.8,+8.97, 181.5,+10.00, +9.66,"續漲停"),
      makeStock("2458","義隆","IC設計","上",116.4,1.7, 128.0,+10.00, 125.8,+8.08, 128.0,+10.00, +9.36,"續漲停"),
      makeStock("2548","華固","營建資產","上",119.5,3.2, 130.2,+8.95, 127.9,+7.03, 124.8,+4.44, +6.81,"強漲"),
      makeStock("2401","凌陽","IC設計","上",20.45,2.0, 22.5,+10.02, 22.1,+8.07, 22.5,+10.02, +9.37,"強漲"),
      makeStock("1303","南亞","塑化","上",72.3,1.9, 78.8,+8.99, 77.9,+7.75, 77.1,+6.64, +7.79,"強漲"),
      makeStock("2014","中鴻","鋼鐵","櫃",18.45,3.5, 20.0,+8.40, 19.5,+5.69, 19.0,+2.98, +5.69,"銘碼漲"),
      makeStock("2376","技嘉","AI伺服器／散熱","上",235,2.8, 255.5,+8.72, 252.6,+7.49, 249.4,+6.13, +7.45,"強勢漲"),
      makeStock("3324","雙鴻","AI伺服器／散熱","上",1065,1.5, 1120,+5.16, 1040,-2.35, 985,-7.51, +1.80,"開高走低"),
      makeStock("2379","瑞昱","IC設計","上",480.5,1.8, 494.2,+2.85, 487.8,+1.52, 473.2,-1.52, +0.95,"開高走低"),
      makeStock("6669","緯穎","AI伺服器／散熱","櫃",3725,1.2, 3935,+5.64, 3632,-2.50, 3585,-3.76, +0.46,"開高走低"),
      makeStock("6446","藥華藥","生技新藥","上",620,0.9, 633.7,+2.21, 626.9,+1.11, 613.1,-1.11, +0.74,"銘碼漲"),
      makeStock("5274","信驊","IC設計","上",11750,0.8, 12010,+2.21, 11880,+1.11, 11620,-1.11, +0.74,"開高走低"),
      makeStock("6223","旺矽","半導體設備／檢測","上",3860,0.6, 3931,+1.84, 3813,-1.22, 3741,-3.08, -0.82,"開高走低"),
      makeStock("2330","台積電","半導體設備／檢測","上",1810,0.9, 1839.5,+1.63, 1794.3,-0.87, 1770.7,-2.17, -0.47,"開高走低"),
      makeStock("2454","聯發科","IC設計","上",1620,1.0, 1640.6,+1.27, 1604.6,-0.95, 1587.1,-2.03, -0.57,"開高走低"),
      makeStock("2317","鴻海","電子代工","上",195,0.8, 196.9,+0.97, 192.2,-1.44, 188.4,-3.38, -1.28,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-17",
    nextDate: "2026-03-18",
    totalLimitUp: 55,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1630,1.5, 1630,+10.00, 1630,+10.00, 1630,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",482,1.0, 482,+10.00, 482,+10.00, 482,+10.00, +10.00,"續漲停"),
      makeStock("7795","長廣","電子零組件","櫃",295,0.9, 320,+8.47, 315,+6.78, 312,+5.76, +7.00,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",385,1.8, 416,+8.05, 409,+6.23, 402,+4.42, +6.23,"強勢漲"),
      makeStock("1301","台塑","塑化","上",40.8,2.2, 43.7,+7.11, 42.6,+4.41, 41.7,+2.21, +4.58,"強勢漲"),
      makeStock("4977","眾達-KY","光通訊","上",143,1.5, 154.4,+7.97, 151.7,+6.08, 148.8,+4.06, +6.04,"強勢漲"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",10.5,1.8, 11.3,+7.62, 11.0,+4.76, 10.8,+2.86, +5.08,"強勢漲"),
      makeStock("2007","燁興","鋼鐵","上",9.49,2.0, 9.95,+4.85, 9.64,+1.58, 9.29,-2.11, +1.44,"開高走低"),
      makeStock("4743","合一","生技新藥","上",57.2,2.5, 59.4,+3.85, 58.0,+1.40, 55.7,-2.62, +0.88,"開高走低"),
      makeStock("2548","華固","營建資產","上",119.5,2.8, 122.5,+2.51, 117.5,-1.67, 114.5,-4.18, -1.11,"開高走低"),
      makeStock("6515","穎崴","半導體設備／檢測","上",8190,1.2, 8229,+0.48, 8018,-2.10, 7923,-3.26, -1.63,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-18",
    nextDate: "2026-03-19",
    totalLimitUp: 42,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1670,1.8, 1670,+10.00, 1670,+10.00, 1670,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",515,1.2, 551,+6.99, 540,+4.85, 529,+2.72, +4.85,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",312,1.0, 336,+7.69, 331,+6.09, 326,+4.49, +6.09,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",405,2.0, 430,+6.17, 423,+4.44, 412,+1.73, +4.11,"強勢漲"),
      makeStock("1301","台塑","塑化","上",41.5,1.8, 43.2,+4.10, 42.2,+1.69, 40.8,-1.69, +1.37,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",150,1.5, 155.6,+3.73, 152.8,+1.87, 148.6,-0.93, +1.56,"開高走低"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",11.1,1.5, 11.4,+2.70, 11.2,+0.90, 10.8,-2.70, +0.30,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",9.95,1.2, 9.65,-3.02, 9.44,-5.13, 9.24,-7.14, -5.10,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-19",
    nextDate: "2026-03-20",
    totalLimitUp: 38,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1710,2.0, 1710,+10.00, 1710,+10.00, 1710,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",548,1.5, 592,+8.03, 581,+6.02, 570,+4.01, +6.02,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",328,1.2, 356,+8.54, 351,+7.01, 347,+5.79, +7.11,"強勢漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",425,1.5, 453,+6.59, 446,+4.94, 436,+2.59, +4.71,"強勢漲"),
      makeStock("1301","台塑","塑化","上",42.1,1.5, 43.4,+3.09, 42.4,+0.71, 41.4,-1.66, +0.71,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",155,1.0, 157.8,+1.81, 153.6,-0.90, 150.8,-2.71, -0.60,"開高走低"),
    ],
  },
  {
    limitDate: "2026-03-20",
    nextDate: "2026-03-22",
    totalLimitUp: 45,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1750,2.5, 1750,+10.00, 1750,+10.00, 1750,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",582,1.8, 635,+9.11, 625,+7.39, 614,+5.50, +7.33,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",345,1.5, 374,+8.41, 370,+7.25, 363,+5.22, +6.96,"強勢漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",448,1.2, 483,+7.81, 476,+6.25, 465,+3.79, +5.95,"強勢漲"),
      makeStock("1301","台塑","塑化","上",42.6,1.2, 43.9,+3.05, 42.9,+0.70, 41.9,-1.64, +0.70,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",159,0.9, 161.8,+1.76, 158.3,-0.44, 154.8,-2.64, -0.44,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",9.65,0.8, 9.35,-3.11, 9.14,-5.28, 8.94,-7.36, -5.25,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-22",
    nextDate: "2026-03-23",
    totalLimitUp: 52,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1795,2.8, 1795,+10.00, 1795,+10.00, 1795,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",618,2.0, 670,+8.41, 660,+6.80, 649,+5.02, +6.74,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",362,1.8, 390,+7.73, 386,+6.63, 380,+4.97, +6.44,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",472,1.5, 506,+7.20, 499,+5.72, 489,+3.60, +5.51,"強勢漲"),
      makeStock("1301","台塑","塑化","上",43.0,1.5, 44.9,+4.42, 44.3,+3.02, 43.3,+0.70, +2.71,"開高走低"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",11.4,1.2, 12.1,+6.14, 11.8,+3.51, 11.6,+1.75, +3.80,"強勢漲"),
      makeStock("4977","眾達-KY","光通訊","上",163,1.0, 166.5,+2.15, 164.4,+0.86, 161.6,-0.86, +0.72,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",9.35,0.8, 9.05,-3.21, 8.84,-5.45, 8.64,-7.59, -5.42,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-23",
    nextDate: "2026-03-24",
    totalLimitUp: 58,
    stocks: [
      makeStock("3363","上詮","光通訊","櫃",660,2.0, 720,+9.09, 711,+7.73, 701,+6.21, +7.68,"續漲停"),
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1845,3.2, 1810,+8.57, 1798,+6.43, 1772,+4.76, +6.59,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",372,2.5, 401,+7.80, 397,+6.72, 389,+4.57, +6.36,"強漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",498,1.8, 532,+6.83, 525,+5.42, 515,+3.41, +5.22,"強勢漲"),
      makeStock("1301","台塑","塑化","上",43.5,1.8, 45.4,+4.37, 44.7,+2.76, 43.8,+0.69, +2.61,"開高走低"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",11.8,1.5, 12.5,+5.93, 12.3,+4.24, 12.0,+1.69, +3.95,"強勢漲"),
      makeStock("4977","眾達-KY","光通訊","上",168,1.2, 173.0,+2.98, 170.2,+1.31, 166.6,-0.83, +1.15,"開高走低"),
      makeStock("4743","合一","生技新藥","上",55.8,2.0, 57.9,+3.76, 56.7,+1.61, 55.0,-1.43, +1.31,"開高走低"),
      makeStock("2007","燁興","鋼鐵","上",9.05,0.6, 8.74,-3.43, 8.64,-4.53, 8.44,-6.74, -4.90,"直接跌"),
    ],
  },
  {
    limitDate: "2026-03-24",
    nextDate: "2026-03-25",
    totalLimitUp: 61,
    stocks: [
      makeStock("3363","上詮","光通訊","櫃",698,2.5, 756,+8.31, 748,+7.16, 738,+5.73, +7.07,"強漲"),
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1880,3.5, 1880,+10.00, 1880,+10.00, 1880,+10.00, +10.00,"續漲停"),
      makeStock("7795","長廣","電子零組件","櫃",388,2.8, 420,+8.25, 416,+7.22, 410,+5.67, +7.05,"續漲停"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",528,1.8, 568,+7.58, 561,+6.25, 551,+4.36, +6.06,"強漲"),
      makeStock("1301","台塑","塑化","上",44.2,2.0, 46.6,+5.43, 45.9,+3.85, 45.1,+2.04, +3.77,"強勢漲"),
      makeStock("1471","首利","低價投機／籌碼面","櫃",12.5,1.5, 13.4,+7.20, 13.1,+4.80, 12.8,+2.40, +4.80,"強勢漲"),
      makeStock("4743","合一","生技新藥","上",54.5,2.2, 56.6,+3.85, 55.8,+2.39, 54.2,-0.55, +1.90,"開高走低"),
      makeStock("4977","眾達-KY","光通訊","上",173,1.2, 178.7,+3.30, 177.3,+2.49, 175.1,+1.21, +2.33,"強勢漲"),
    ],
  },
  {
    limitDate: "2026-03-25",
    nextDate: "2026-03-26",
    totalLimitUp: 64,
    stocks: [
      makeStock("3017","奇鋐","AI伺服器／散熱","上",1945,2.0, 1945,+10.00, 1945,+10.00, 1945,+10.00, +10.00,"續漲停"),
      makeStock("3363","上詮","光通訊","櫃",734,1.8, 795,+8.31, 782,+6.54, 770,+4.90, +6.58,"強漲"),
      makeStock("7795","長廣","電子零組件","櫃",403,1.5, 435,+7.94, 429,+6.45, 422,+4.71, +6.37,"強勢漲"),
      makeStock("6274","台燿","PCB／CCL銅箔基板","上",554,1.2, 593,+7.04, 587,+5.96, 580,+4.69, +5.90,"強勢漲"),
      makeStock("4743","合一","生技新藥","上",52,2.5, 55,+5.77, 54,+3.85, 52.5,+0.96, +3.53,"開高走低"),
      makeStock("1301","台塑","塑化","上",45.05,1.5, 46.8,+3.88, 45.7,+1.44, 44.6,-1.00, +1.44,"開高走低"),
      makeStock("2376","技嘉","AI伺服器／散熱","上",235,2.8, 246.0,+4.68, 242.3,+3.11, 238.5,+1.49, +3.09,"強勢漲"),
      makeStock("2458","義隆","IC設計","上",128,1.7, 133.6,+4.38, 131.0,+2.34, 127.0,-0.78, +1.98,"開高走低"),
      makeStock("6446","藥華藥","生技新藥","上",620,0.9, 631.0,+1.77, 623.5,+0.56, 613.8,-1.00, +0.44,"開高走低"),
      makeStock("1303","南亞","塑化","上",72.3,1.2, 73.7,+1.94, 71.6,-0.97, 70.1,-3.04, -0.69,"直接跌"),
      makeStock("2317","鴻海","電子代工","上",195,0.8, 196.0,+0.51, 193.0,-1.03, 189.5,-2.82, -1.11,"直接跌"),
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
