"use client";

import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import { getLessonBySlug, getAdjacentLessons, LESSONS } from "@/lib/lessons";

export default function LessonClient({ slug }: { slug: string }) {
  const lesson = getLessonBySlug(slug);
  const { prev, next } = getAdjacentLessons(slug);

  if (!lesson) {
    return (
      <>
        <TopNav />
        <NavBar />
        <main className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-xl font-bold text-txt-0">找不到這堂課</h1>
          <Link href="/learn" className="mt-4 inline-block text-sm text-red hover:underline">
            &larr; 返回課程總覽
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav />
      <NavBar />
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 lg:flex lg:gap-8">
        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-txt-4 mb-6">
            <Link href="/learn" className="hover:text-txt-2 transition-colors">交易教室</Link>
            <span>/</span>
            <span className="text-txt-2">第 {lesson.chapter} 課</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="text-xs font-semibold text-red mb-2">
              第 {lesson.chapter} 課 · {lesson.readTime}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-txt-0 tracking-tight">
              {lesson.title}
            </h1>
            <p className="mt-2 text-sm text-txt-3">{lesson.subtitle}</p>
          </div>

          {/* Sections */}
          <div className="space-y-8">
            {lesson.sections.map((sec, i) => (
              <section key={i} id={`section-${i}`}>
                <h2 className="text-lg font-bold text-txt-0 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-bg-3 text-[10px] font-bold text-txt-3 flex items-center justify-center">
                    {i + 1}
                  </span>
                  {sec.heading}
                </h2>

                {sec.paragraphs.map((p, j) => (
                  <p key={j} className="text-sm leading-relaxed text-txt-2 mb-3">
                    {p}
                  </p>
                ))}

                {sec.highlight && (
                  <div className="bg-red/5 border-l-4 border-red rounded-r-lg p-4 my-4">
                    <p className="text-sm font-medium text-txt-1">{sec.highlight}</p>
                  </div>
                )}

                {sec.link && (
                  <Link
                    href={sec.link.href}
                    className="inline-flex items-center gap-1.5 mt-1 mb-2 px-3 py-1.5 bg-bg-2 border border-border rounded-lg text-xs font-medium text-txt-2 hover:text-red hover:border-red/30 transition-colors"
                  >
                    {sec.link.text}
                  </Link>
                )}
              </section>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-12 pt-6 border-t border-border">
            {prev ? (
              <Link href={`/learn/${prev.slug}`} className="group flex flex-col">
                <span className="text-[10px] text-txt-4 mb-1">&larr; 上一課</span>
                <span className="text-sm font-semibold text-txt-2 group-hover:text-red transition-colors">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <div />
            )}
            {next ? (
              <Link href={`/learn/${next.slug}`} className="group flex flex-col text-right">
                <span className="text-[10px] text-txt-4 mb-1">下一課 &rarr;</span>
                <span className="text-sm font-semibold text-txt-2 group-hover:text-red transition-colors">
                  {next.title}
                </span>
              </Link>
            ) : (
              <Link href="/learn" className="group flex flex-col text-right">
                <span className="text-[10px] text-txt-4 mb-1">完成！</span>
                <span className="text-sm font-semibold text-txt-2 group-hover:text-red transition-colors">
                  返回課程總覽
                </span>
              </Link>
            )}
          </div>
        </main>

        {/* Sidebar — table of contents */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-24">
            <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-widest mb-3">
              本課目錄
            </div>
            <nav className="space-y-1">
              {lesson.sections.map((sec, i) => (
                <a
                  key={i}
                  href={`#section-${i}`}
                  className="block text-xs text-txt-3 hover:text-txt-1 transition-colors py-1 pl-3 border-l border-border hover:border-red"
                >
                  {sec.heading}
                </a>
              ))}
            </nav>

            <div className="mt-6 pt-4 border-t border-border">
              <div className="text-[10px] font-semibold text-txt-4 uppercase tracking-widest mb-2">
                全部章節
              </div>
              <nav className="space-y-1">
                {LESSONS.map((l) => (
                  <Link
                    key={l.slug}
                    href={`/learn/${l.slug}`}
                    className={`block text-xs py-1 pl-3 border-l transition-colors ${
                      l.slug === slug
                        ? "text-red border-red font-semibold"
                        : "text-txt-4 border-border hover:text-txt-2 hover:border-txt-3"
                    }`}
                  >
                    {l.chapter}. {l.title}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
