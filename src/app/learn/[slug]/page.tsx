import type { Metadata } from "next";
import { LESSONS } from "@/lib/lessons";
import LessonClient from "./_client";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return LESSONS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lesson = LESSONS.find((l) => l.slug === slug);
  if (!lesson) return { title: "找不到課程" };
  return {
    title: `第${lesson.chapter}課：${lesson.title}`,
    description: lesson.subtitle,
    alternates: { canonical: `/learn/${slug}` },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <LessonClient slug={slug} />;
}
