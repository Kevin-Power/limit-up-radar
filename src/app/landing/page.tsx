"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";

/* ------------------------------------------------------------------ */
/*  Intersection Observer hook for scroll-based fade-in               */
/* ------------------------------------------------------------------ */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const targets = el.querySelectorAll<HTMLElement>(".reveal");
    targets.forEach((t) => {
      t.style.opacity = "0";
      t.style.transform = "translateY(24px)";
      t.style.transition = "opacity 0.6s ease, transform 0.6s ease";
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const target = e.target as HTMLElement;
            target.style.opacity = "1";
            target.style.transform = "translateY(0)";
            io.unobserve(target);
          }
        });
      },
      { threshold: 0.12 }
    );

    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return ref;
}

/* ------------------------------------------------------------------ */
/*  Login Form Component                                              */
/* ------------------------------------------------------------------ */
function LoginForm({ className = "" }: { className?: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "登入失敗");
      }
    } catch {
      setError("網路錯誤，請重試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`flex items-center gap-2 ${className}`}>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="輸入密碼"
        className="rounded-lg border border-border bg-bg-2 px-4 py-2.5 text-sm text-txt-0 outline-none focus:border-red placeholder:text-txt-4 w-48"
        autoComplete="current-password"
      />
      <button
        type="submit"
        disabled={loading || !password}
        className="rounded-lg bg-red px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {loading ? "登入中..." : "登入"}
      </button>
      {error && <span className="text-xs text-red">{error}</span>}
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Data                                                              */
/* ------------------------------------------------------------------ */
const FEATURES = [
  {
    color: "bg-red/20 text-red",
    title: "AI 族群分類",
    desc: "透過 AI 自動將當日漲停股依產業、題材歸類，快速掌握市場主流。",
  },
  {
    color: "bg-green/20 text-green",
    title: "隔日表現",
    desc: "追蹤漲停股隔日開盤與收盤表現，驗證追漲策略的實際勝率。",
  },
  {
    color: "bg-blue/20 text-blue",
    title: "快樂小馬 EMA",
    desc: "整合均線策略訊號，標示 EMA 多空排列與黃金交叉時機。",
  },
  {
    color: "bg-amber/20 text-amber",
    title: "策略回測",
    desc: "內建四套回測策略，模擬不同進出場條件下的歷史報酬與風險。",
  },
  {
    color: "bg-accent/20 text-accent",
    title: "國際市場",
    desc: "即時追蹤 14 大國際指數，盤前判斷開盤方向與資金流向。",
  },
  {
    color: "bg-red/20 text-red",
    title: "處置預測",
    desc: "根據歷史數據與規則，預測個股被處置的機率與時間點。",
  },
];

const STEPS = [
  { num: "01", title: "盤前看國際", desc: "判斷開盤方向" },
  { num: "02", title: "盤中追漲停", desc: "即時族群分類" },
  { num: "03", title: "盤後做功課", desc: "驗證策略表現" },
];

const STATS = [
  { value: "15+", label: "功能模組" },
  { value: "1,934", label: "營收追蹤" },
  { value: "6", label: "免費課程" },
  { value: "每日", label: "自動更新" },
];

/* ------------------------------------------------------------------ */
/*  Mini Dashboard Preview (Hero decoration)                          */
/* ------------------------------------------------------------------ */
function DashboardPreview() {
  return (
    <div className="relative mx-auto mt-12 w-full max-w-3xl lg:mt-0 lg:max-w-none">
      {/* Glow behind */}
      <div className="absolute -inset-4 rounded-2xl bg-gradient-to-br from-red/10 via-accent/10 to-blue/10 blur-2xl" />

      <div className="relative overflow-hidden rounded-xl border border-border bg-bg-1 p-4 shadow-2xl sm:p-6">
        {/* Top bar */}
        <div className="mb-4 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red" />
          <span className="h-3 w-3 rounded-full bg-amber" />
          <span className="h-3 w-3 rounded-full bg-green" />
          <span className="ml-3 text-xs text-txt-3">limit-up-radar.vercel.app</span>
        </div>

        {/* Stats row */}
        <div className="mb-4 grid grid-cols-4 gap-3">
          {[
            { label: "漲停", val: "54", color: "text-red" },
            { label: "跌停", val: "3", color: "text-green" },
            { label: "族群", val: "12", color: "text-blue" },
            { label: "勝率", val: "67%", color: "text-amber" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-bg-2 p-2 text-center sm:p-3">
              <div className={`text-lg font-bold tabular-nums ${s.color} sm:text-xl`}>{s.val}</div>
              <div className="text-[10px] text-txt-3 sm:text-xs">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Fake chart */}
        <div className="mb-4 h-24 rounded-lg bg-bg-2 p-3 sm:h-32">
          <svg viewBox="0 0 400 100" className="h-full w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--red)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--red)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,80 Q50,75 80,60 T160,45 T240,30 T320,38 T400,20"
              fill="none"
              stroke="var(--red)"
              strokeWidth="2"
            />
            <path
              d="M0,80 Q50,75 80,60 T160,45 T240,30 T320,38 T400,20 L400,100 L0,100 Z"
              fill="url(#chartGrad)"
            />
          </svg>
        </div>

        {/* Fake group bars */}
        <div className="flex items-end gap-2">
          {[70, 55, 45, 38, 30, 22, 18, 12].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-red/60 to-red/20"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */
export default function LandingPage() {
  const wrapperRef = useScrollReveal();

  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div ref={wrapperRef} className="min-h-screen bg-bg-0 text-txt-1 scroll-smooth">
      {/* ────────────────────────────── NAV ────────────────────────────── */}
      <nav className="glass fixed top-0 z-50 w-full border-b border-border bg-bg-0/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <span className="text-lg font-bold text-txt-0">
            <span className="text-red">//</span> 股文觀指 大師專區
          </span>
          <LoginForm />
        </div>
      </nav>

      {/* ────────────────────────────── HERO ───────────────────────────── */}
      <section className="relative flex min-h-screen items-center overflow-hidden pt-14">
        {/* Background grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(var(--text-3) 1px, transparent 1px), linear-gradient(90deg, var(--text-3) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Radial glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red/5 blur-3xl" />

        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
          {/* Left text */}
          <div className="flex flex-col justify-center animate-fade-in-up">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-txt-0 sm:text-5xl lg:text-6xl">
              台股漲停族群
              <br />
              <span className="gradient-text">一眼掌握</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-txt-2 sm:text-lg">
              AI 驅動的漲停股分類、隔日表現追蹤、策略回測平台
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <LoginForm />
            </div>
            <div className="mt-4">
              <button
                onClick={scrollToFeatures}
                className="text-sm text-txt-3 transition hover:text-txt-1 underline underline-offset-4"
              >
                了解更多 ↓
              </button>
            </div>
          </div>

          {/* Right dashboard */}
          <div className="animate-fade-in-up" style={{ animationDelay: "0.15s" }}>
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* ─────────────────────── FEATURES GRID ─────────────────────────── */}
      <section id="features" className="py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="reveal text-center text-3xl font-bold text-txt-0 sm:text-4xl">
            核心功能
          </h2>
          <p className="reveal mt-3 text-center text-txt-3">
            從盤前到盤後，提供完整的漲停股研究工具鏈
          </p>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="reveal card-hover rounded-xl border border-border bg-bg-1 p-6"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                {/* Icon circle */}
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-full ${f.color}`}>
                  <span className="text-lg font-bold">{f.title.charAt(0)}</span>
                </div>
                <h3 className="text-lg font-semibold text-txt-0">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-txt-2">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────── HOW IT WORKS ─────────────────────────── */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="reveal text-center text-3xl font-bold text-txt-0 sm:text-4xl">
            使用流程
          </h2>
          <p className="reveal mt-3 text-center text-txt-3">
            三步驟建立你的盤中決策系統
          </p>

          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.num} className="reveal relative flex flex-col items-center text-center">
                {/* Connector line (not on last) */}
                {i < STEPS.length - 1 && (
                  <div className="absolute right-0 top-8 hidden h-px w-full translate-x-1/2 bg-gradient-to-r from-border to-transparent sm:block" />
                )}
                {/* Number badge */}
                <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-2 border border-border text-2xl font-bold text-red">
                  {s.num}
                </div>
                <h3 className="mt-5 text-lg font-semibold text-txt-0">{s.title}</h3>
                <p className="mt-2 text-sm text-txt-2">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ────────────────────────── STATS BAR ──────────────────────────── */}
      <section className="reveal border-y border-border bg-bg-1 py-16 sm:py-20">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 sm:grid-cols-4 sm:px-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-4xl font-extrabold tabular-nums text-txt-0 sm:text-5xl">
                {s.value}
              </div>
              <div className="mt-2 text-sm text-txt-3">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────────────── CTA BOTTOM ──────────────────────────── */}
      <section className="reveal py-24 sm:py-32">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold text-txt-0 sm:text-4xl">
            準備好了嗎？
          </h2>
          <p className="mt-4 text-txt-2">
            輸入密碼立即開始使用
          </p>
          <div className="mt-8 flex justify-center">
            <LoginForm />
          </div>
          <p className="mt-6 font-mono text-sm text-txt-4">
            limit-up-radar.vercel.app
          </p>
        </div>
      </section>

      {/* ──────────────────────────── FOOTER ───────────────────────────── */}
      <Footer />
    </div>
  );
}
