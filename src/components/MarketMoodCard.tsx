"use client";

// 市場過熱燈 + 買進日氣氛（誠實勝率脈絡）。
// 過熱燈（今日 ≥75 分檔數）＝已驗證 edge（LOO 三月皆正、≤15 檔 EV 較佳）；
// 氣氛燈（今日大盤 breadth）＝純資訊、無驗證；部位級距＝紀律建議、未經組合回測。
// 全部為今日收盤可得（非 look-ahead）。不採用以「隔日大盤」切分的勝率數字。

export interface MarketMood {
  picksN75: number;
  overheatLevel: "normal" | "caution" | "hot";
  moodLevel: "bullish" | "neutral" | "bearish";
  taiexChg: number;
  advance: number;
  decline: number;
  foreignNet: number;
  trustNet: number;
  limitUp: number;
  limitDown: number;
}

export default function MarketMoodCard({ mood }: { mood: MarketMood }) {
  const oh = mood.overheatLevel;
  const ohStyle =
    oh === "hot" ? "border-red/30 bg-red/5" : oh === "caution" ? "border-amber/30 bg-amber/5" : "border-green/30 bg-green/5";
  const ohText = oh === "hot" ? "text-red" : oh === "caution" ? "text-amber" : "text-green";
  const ohLabel = oh === "hot" ? "市場過熱" : oh === "caution" ? "訊號偏多" : "常態";
  const ohMsg =
    oh === "hot"
      ? `今日 ≥75 分標的 ${mood.picksN75} 檔（>25），訊號氾濫、市場過熱，歷史 OOS 顯示此區間隔日期望值明顯較差，宜減碼或空手。`
      : oh === "caution"
      ? `今日 ≥75 分標的 ${mood.picksN75} 檔（16–25），訊號偏多，留意過熱風險。`
      : `今日 ≥75 分標的 ${mood.picksN75} 檔（≤15），為 OOS（逐月留一三月皆正）上隔日期望值較佳的常態區間。`;
  const posText = oh === "hot" ? "建議空手或極小量" : oh === "caution" ? "建議半量" : "標準部位";
  const moodLabel = mood.moodLevel === "bullish" ? "偏強" : mood.moodLevel === "bearish" ? "偏弱" : "中性";
  const moodColor = mood.moodLevel === "bullish" ? "text-red" : mood.moodLevel === "bearish" ? "text-green" : "text-amber";

  return (
    <div className={`border rounded-xl p-4 ${ohStyle}`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${ohText}`}>市場過熱燈：{ohLabel}</span>
          <span className="text-[10px] text-txt-4">≥75 分 {mood.picksN75} 檔 · 部位紀律：{posText}</span>
        </div>
        <div className="text-[11px] text-txt-3">
          今日大盤氣氛 <span className={`font-semibold ${moodColor}`}>{moodLabel}</span>
          <span className="text-txt-4"> · 漲 {mood.advance}/跌 {mood.decline} · 漲停 {mood.limitUp}/跌停 {mood.limitDown}</span>
        </div>
      </div>
      <p className="text-[11px] text-txt-3 leading-relaxed">{ohMsg}</p>
      <p className="text-[10px] text-txt-4 mt-1.5 leading-relaxed">
        過熱燈＝今日 ≥75 分標的檔數（買進日即可得，非未來函數，逐月留一驗證）；氣氛燈與部位級距為紀律／資訊參考，未經組合回測、不反推明日勝率。本平台不採用以「隔日大盤」切分的勝率數字（那是 look-ahead 後見之明）。歷史統計非投資建議、不保證未來。
      </p>
    </div>
  );
}
