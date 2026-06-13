"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";

interface PublicStats {
  date: string | null;
  taiex: number | null;
  taiexChg: number | null;
  limitUp: number | null;
  groupCount: number | null;
  backtest: { winRate: number; avgReturn: number; samples: number; days: number } | null;
  revenueStocks: number | null;
  totalTradingDays: number;
}

function useLiveStats() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  useEffect(() => {
    fetch("/api/public/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);
  return stats;
}

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
    desc: "用真實隔日 OHLC 統計漲停股翌日行為，理解市場規律而非報明牌。",
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

/* ------------------------------------------------------------------ */
/*  Live Stats Card (real data from /api/public/stats)                */
/* ------------------------------------------------------------------ */
function LiveStatsCard({ stats }: { stats: PublicStats | null }) {
  return (
    <div className="relative mx-auto mt-12 w-full max-w-3xl lg:mt-0 lg:max-w-none">
      <div className="absolute -inset-4 rounded-2xl bg-gradient-to-br from-red/15 via-amber/10 to-red/15 blur-2xl" />
      <div className="relative overflow-hidden rounded-xl border border-red/30 bg-bg-1 p-5 shadow-2xl sm:p-7">
        {/* Top label */}
        <div className="flex items-center justify-between mb-4">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-red/10 text-red text-[10px] font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-red animate-pulse" />
            REAL DATA · 真實統計
          </span>
          <span className="text-[10px] text-txt-4 tabular-nums">
            {stats?.date ?? "載入中..."}
          </span>
        </div>

        {/* Hero stat: backtest open win rate (gross) */}
        <div className="mb-5 text-center">
          <div className="text-[12px] text-txt-3 mb-1">回測開盤勝率（毛・未含成本）</div>
          <div className="text-7xl font-extrabold tabular-nums text-red leading-none">
            {stats?.backtest?.winRate ?? "—"}<span className="text-3xl">%</span>
          </div>
          <div className="mt-2 text-[10px] text-txt-4">
            {stats?.backtest
              ? `${stats.backtest.samples} 樣本 · ${stats.backtest.days} 天 · 偏多頭區間 · 統計供研究`
              : "載入中..."}
          </div>
        </div>

        {/* 4 mini stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-4">
          {[
            { label: "TAIEX", val: stats?.taiex ? Math.round(stats.taiex).toLocaleString() : "—",
              sub: stats?.taiexChg != null ? `${stats.taiexChg > 0 ? "+" : ""}${stats.taiexChg.toFixed(2)}%` : "",
              color: stats?.taiexChg && stats.taiexChg > 0 ? "text-red" : "text-green" },
            { label: "今日漲停", val: stats?.limitUp ?? "—", sub: `${stats?.groupCount ?? "—"} 族群`, color: "text-red" },
            { label: "平均報酬（毛）", val: stats?.backtest ? `${stats.backtest.avgReturn >= 0 ? "+" : ""}${stats.backtest.avgReturn}%` : "—", sub: "單日開盤", color: "text-amber" },
            { label: "資料涵蓋", val: stats?.totalTradingDays ?? "—", sub: "個交易日", color: "text-blue" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-bg-2 p-2 sm:p-3 text-center">
              <div className={`text-base sm:text-lg font-bold tabular-nums ${s.color}`}>{s.val}</div>
              <div className="text-[9px] sm:text-[10px] text-txt-3 mt-0.5">{s.label}</div>
              {s.sub && <div className="text-[8px] sm:text-[9px] text-txt-4">{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Bottom row: revenue + signal */}
        <div className="flex items-center justify-between text-[10px] text-txt-4 pt-3 border-t border-border">
          <span>📊 月營收追蹤 {stats?.revenueStocks?.toLocaleString() ?? "—"} 檔</span>
          <span className="text-red">→ 登入看完整分析</span>
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
  const stats = useLiveStats();

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
              公開、可稽核的漲停族群資料庫 — 族群分類、隔日行為統計、判讀筆記，研究與學習用
            </p>
            <p className="mt-2 text-xs text-txt-4">
              個人研究紀錄分享 · 非投顧 · 未收費 · 不構成投資建議
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
            <LiveStatsCard stats={stats} />
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

      {/* ────────────────────────── LIVE STATS BAR ─────────────────────── */}
      <section className="reveal border-y border-border bg-bg-1 py-16 sm:py-20">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-4 sm:grid-cols-4 sm:px-6">
          <div className="text-center">
            <div className="text-4xl font-extrabold tabular-nums text-red sm:text-5xl">
              {stats?.backtest?.winRate ?? "—"}<span className="text-2xl">%</span>
            </div>
            <div className="mt-2 text-sm text-txt-3">回測勝率（毛）</div>
            <div className="text-[10px] text-txt-4 mt-0.5">真實 OHLC · 未含成本</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-extrabold tabular-nums text-amber sm:text-5xl">
              {stats?.backtest?.avgReturn != null
                ? `${stats.backtest.avgReturn >= 0 ? "+" : ""}${stats.backtest.avgReturn}%`
                : "—"}
            </div>
            <div className="mt-2 text-sm text-txt-3">平均開盤報酬（毛）</div>
            <div className="text-[10px] text-txt-4 mt-0.5">{stats?.backtest?.samples ?? "—"} 樣本 · 偏多頭區間</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-extrabold tabular-nums text-blue sm:text-5xl">
              {stats?.totalTradingDays ?? "—"}
            </div>
            <div className="mt-2 text-sm text-txt-3">交易日資料</div>
            <div className="text-[10px] text-txt-4 mt-0.5">每日 17:00 更新</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-extrabold tabular-nums text-green sm:text-5xl">
              {stats?.revenueStocks?.toLocaleString() ?? "—"}
            </div>
            <div className="mt-2 text-sm text-txt-3">月營收追蹤</div>
            <div className="text-[10px] text-txt-4 mt-0.5">永豐金 Sinopac</div>
          </div>
        </div>
        <p className="mt-8 px-4 text-center text-[11px] leading-relaxed text-txt-4">
          回測統計僅供研究與學習：未含交易成本與滑價、樣本屬偏多頭區間，平均值可能被少數大漲樣本拉高。
          過去表現不代表未來，不構成投資建議。
        </p>
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
