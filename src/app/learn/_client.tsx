"use client";

import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { LESSONS } from "@/lib/lessons";

const CHAPTER_COLORS = [
  "bg-red/15 text-red",
  "bg-blue/15 text-blue",
  "bg-amber/15 text-amber",
  "bg-green/15 text-green",
  "bg-accent/15 text-accent",
  "bg-red/15 text-red",
];

export default function LearnClient() {
  return (
    <>
      <TopNav />
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-10">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-block px-3 py-1 rounded-full bg-red/10 text-red text-xs font-semibold mb-4">
            免費課程
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-txt-0 tracking-tight">
            漲停族群操作法
          </h1>
          <p className="mt-3 text-base text-txt-2 max-w-lg mx-auto">
            從零開始學會用族群分析抓住漲停股機會，6 堂課帶你建立完整的交易系統
          </p>
          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-txt-4">
            <span>6 堂課</span>
            <span className="w-1 h-1 rounded-full bg-txt-4" />
            <span>約 38 分鐘閱讀</span>
            <span className="w-1 h-1 rounded-full bg-txt-4" />
            <span>完全免費</span>
          </div>
        </div>

        {/* Chapter Cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {LESSONS.map((lesson, i) => (
            <Link
              key={lesson.slug}
              href={`/learn/${lesson.slug}`}
              className="group block bg-bg-1 border border-border rounded-xl p-5 hover:border-border-hover hover:bg-bg-2/50 transition-all"
            >
              <div className="flex items-start gap-4">
                {/* Chapter number */}
                <div className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold ${CHAPTER_COLORS[i]}`}>
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

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="text-sm text-txt-3">
            準備好了嗎？從第一課開始你的交易學習之旅
          </p>
          <Link
            href={`/learn/${LESSONS[0].slug}`}
            className="mt-4 inline-block rounded-xl bg-red px-6 py-2.5 text-sm font-semibold text-white hover:brightness-110 transition"
          >
            開始第一課 &rarr;
          </Link>
        </div>
      </main>
    </>
  );
}
