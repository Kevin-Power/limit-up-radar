import type { Metadata } from "next";
import { ADVANCED_LESSONS } from "@/lib/advanced-lessons";
import AdvancedLessonClient from "./_client";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return ADVANCED_LESSONS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lesson = ADVANCED_LESSONS.find((l) => l.slug === slug);
  if (!lesson) return { title: "找不到課程" };
  return {
    title: `選擇權第${lesson.chapter}課：${lesson.title}`,
    description: lesson.subtitle,
    alternates: { canonical: `/advanced/${slug}` },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <AdvancedLessonClient slug={slug} />;
}
