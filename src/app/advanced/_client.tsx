"use client";

import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { ADVANCED_LESSONS, totalReadMinutes } from "@/lib/advanced-lessons";

const CHAPTER_COLORS = [
  "bg-red/15 text-red",
  "bg-blue/15 text-blue",
  "bg-amber/15 text-amber",
  "bg-green/15 text-green",
  "bg-accent/15 text-accent",
  "bg-red/15 text-red",
];

export default function AdvancedClient() {
  const count = ADVANCED_LESSONS.length;
  const minutes = totalReadMinutes();

  return (
    <>
      <TopNav />
      <NavBar />
      <main id="main" className="max-w-4xl mx-auto px-4 md:px-6 py-10">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-block px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold mb-4">
            進階模組
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-txt-0 tracking-tight">
            進階教室：選擇權精華
          </h1>
          <p className="mt-3 text-base text-txt-2 max-w-lg mx-auto">
            從零搞懂選擇權的核心觀念——權利金、Call/Put、Greeks、避險與風控，並理解台灣（台指選擇權與權證）的真實樣貌
          </p>
          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-txt-4">
            <span>{count} 堂課</span>
            <span className="w-1 h-1 rounded-full bg-txt-4" />
            <span>約 {minutes} 分鐘閱讀</span>
            <span className="w-1 h-1 rounded-full bg-txt-4" />
            <span>教育內容 · 非投資建議</span>
          </div>
        </div>

        {/* Chapter Cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {ADVANCED_LESSONS.map((lesson, i) => (
            <Link
              key={lesson.slug}
              href={`/advanced/${lesson.slug}`}
              className="group block bg-bg-1 border border-border rounded-xl p-5 hover:border-border-hover hover:bg-bg-2/50 transition-all"
            >
              <div className="flex items-start gap-4">
                {/* Chapter number */}
                <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold ${CHAPTER_COLORS[i % CHAPTER_COLORS.length]}`}>
                  {lesson.chapter}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold text-txt-0 group-hover:text-red transition-colors">
                    {lesson.title}
                  </h2>
                  <p className="mt-1 text-xs text-txt-3 leading-relaxed">
                    {lesson.subtitle}
                  </p>
                  <div className="mt-2 text-[10px] text-txt-4">
                    {lesson.sections.length} 節 · {lesson.readTime}
                  </div>
                </div>
                {/* Arrow */}
                <span className="text-txt-4 group-hover:text-red transition-colors mt-1">
                  &rarr;
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Risk disclaimer */}
        <div className="mt-10 bg-amber/5 border border-amber/20 rounded-xl p-4">
          <p className="text-xs text-txt-3 leading-relaxed">
            <span className="font-semibold text-amber">風險提醒：</span>
            選擇權與權證屬高槓桿、高風險工具，買方可能損失全部權利金、賣方風險甚至理論無上限。本模組為教育與觀念說明，非投資建議、不構成買賣推薦，亦不保證任何報酬。實際交易前請充分了解商品規則與自身風險承受度。
          </p>
        </div>

        {/* Bottom CTA */}
        {count > 0 && (
          <div className="mt-12 text-center">
            <p className="text-sm text-txt-3">
              準備好了嗎？從第一課開始建立選擇權的完整觀念
            </p>
            <Link
              href={`/advanced/${ADVANCED_LESSONS[0].slug}`}
              className="mt-4 inline-block rounded-xl bg-red px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110 transition"
            >
              開始第一課 &rarr;
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
