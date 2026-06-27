"use client";
import { useEffect, useState } from "react";

// 警示嚴重度 — 與 scripts/run_kill_switch.py SEVERITY_* 常數對應
// 若 Python 端改動（新增等級/改字串），必須同步更新這裡
const WARNING_SEVERITY = {
  WARN: "warn" as const,
  CRITICAL: "critical" as const,
};
// 舊版相容用：若資料源還是字串（pre-2026-06-27），用 emoji 前綴推斷嚴重度
const LEGACY_CRITICAL_PREFIX = "⛔";

type Severity = "warn" | "critical";
type WarningItem = string | { severity: Severity; message: string };

interface KillData {
  updatedAt: string;
  window: number;
  timeline: Array<{
    date: string;
    ret: number;
    rollingEv10: number | null;
    rollingEv20: number | null;
    marketYesterdayChg: number | null;
    marketStatus: "green" | "amber" | "red";
  }>;
  latest: {
    rollingEv10: number | null;
    rollingEv20: number | null;
    streakLosses: number;
    marketStatus: "green" | "amber" | "red";
    marketYesterdayChg: number | null;
  };
  warnings: WarningItem[];
}

const STATUS_COLOR: Record<"green" | "amber" | "red", string> = {
  green: "bg-green/20 text-green border-green/30",
  amber: "bg-amber/20 text-amber border-amber/30",
  red: "bg-red/20 text-red border-red/30",
};

type ErrState = null | "not_available" | "fetch_failed";

function warningSeverity(w: WarningItem): Severity {
  if (typeof w === "object" && w && "severity" in w) return w.severity;
  // 字串 fallback：依 emoji 前綴判定
  return (w as string).startsWith(LEGACY_CRITICAL_PREFIX)
    ? WARNING_SEVERITY.CRITICAL
    : WARNING_SEVERITY.WARN;
}

function warningMessage(w: WarningItem): string {
  return typeof w === "string" ? w : w.message;
}

export default function StrategyMonitorClient() {
  const [data, setData] = useState<KillData | null>(null);
  const [err, setErr] = useState<ErrState>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/kill-switch")
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) {
          setErr("not_available");
          return;
        }
        if (!r.ok) {
          setErr("fetch_failed");
          return;
        }
        try {
          const json = await r.json();
          if (!cancelled) setData(json);
        } catch {
          if (!cancelled) setErr("fetch_failed");
        }
      })
      .catch(() => {
        // 網路錯誤（CORS / offline / DNS）
        if (!cancelled) setErr("fetch_failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (err === "not_available")
    return (
      <p className="text-xs text-txt-3">
        kill_switch.json 尚未產生，請先跑 scripts/run_kill_switch.py
      </p>
    );
  if (err === "fetch_failed")
    return (
      <p className="text-xs text-red">
        讀取失敗，請稍後重試或檢查 /api/kill-switch 的伺服器日誌
      </p>
    );
  if (!data) return <p className="text-xs text-txt-3">載入中...</p>;

  const { latest, warnings, timeline } = data;
  const overall: "green" | "amber" | "red" = warnings.some(
    (w) => warningSeverity(w) === WARNING_SEVERITY.CRITICAL,
  )
    ? "red"
    : warnings.length > 0
    ? "amber"
    : "green";

  return (
    <>
      {/* 總燈號 */}
      <div className={`border rounded-xl p-4 mb-6 ${STATUS_COLOR[overall]}`}>
        <div className="text-sm font-bold mb-2">
          整體狀態：
          {overall === "green"
            ? "綠燈 — 正常"
            : overall === "amber"
            ? "黃燈 — 注意"
            : "紅燈 — 高警戒"}
        </div>
        {warnings.length === 0 && <p className="text-xs">無警示</p>}
        <ul className="text-xs space-y-1">
          {warnings.map((w, i) => (
            <li key={i}>{warningMessage(w)}</li>
          ))}
        </ul>
      </div>

      {/* KPI 卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Kpi
          label="rolling EV (10 筆)"
          value={latest.rollingEv10 == null ? "—" : `${latest.rollingEv10.toFixed(2)}%`}
        />
        <Kpi
          label="rolling EV (20 筆)"
          value={latest.rollingEv20 == null ? "—" : `${latest.rollingEv20.toFixed(2)}%`}
        />
        <Kpi label="連敗筆數" value={`${latest.streakLosses}`} />
        <Kpi
          label="大盤前一日"
          value={
            latest.marketYesterdayChg == null
              ? "—"
              : `${latest.marketYesterdayChg.toFixed(2)}%`
          }
        />
      </div>

      {/* Rolling EV 折線 */}
      <Section title={`Rolling ${data.window}-trade EV 時間軸`}>
        <Sparkline
          points={timeline
            .map((t) => t.rollingEv10)
            .filter((v): v is number => v != null)}
          threshold={-0.5}
          dangerThreshold={-1.0}
        />
      </Section>

      {/* 時間軸表（最近 30 筆） */}
      <Section title="最近 30 筆 trade 明細">
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-bg-2">
              <tr className="border-b border-border text-txt-3">
                <th className="py-2 px-2 text-left">日期</th>
                <th className="py-2 px-2 text-right">淨報酬</th>
                <th className="py-2 px-2 text-right">rolling10</th>
                <th className="py-2 px-2 text-right">大盤前日</th>
                <th className="py-2 px-2 text-center">市場燈</th>
              </tr>
            </thead>
            <tbody>
              {[...timeline].slice(-30).reverse().map((t) => (
                <tr key={t.date} className="border-b border-border/50">
                  <td className="py-2 px-2 tabular-nums">{t.date}</td>
                  <td
                    className={`py-2 px-2 text-right tabular-nums ${
                      t.ret >= 0 ? "text-green" : "text-red"
                    }`}
                  >
                    {t.ret.toFixed(2)}%
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {t.rollingEv10 == null ? "—" : `${t.rollingEv10.toFixed(2)}%`}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {t.marketYesterdayChg == null
                      ? "—"
                      : `${t.marketYesterdayChg.toFixed(2)}%`}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        t.marketStatus === "green"
                          ? "bg-green"
                          : t.marketStatus === "amber"
                          ? "bg-amber"
                          : "bg-red"
                      }`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <p className="text-[10px] text-txt-4">
        資料來源：data/kill_switch.json（由 scripts/run_kill_switch.py 每日生成）。
        threshold 依 2026-06 診斷實證設定，不自動切策略。
      </p>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-1 border border-border rounded-lg p-3">
      <p className="text-[10px] text-txt-4 mb-1">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-bg-1 border border-border rounded-xl p-4 mb-6">
      <h3 className="text-xs font-semibold text-txt-2 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Sparkline({
  points,
  threshold,
  dangerThreshold,
}: {
  points: number[];
  threshold: number;
  dangerThreshold: number;
}) {
  if (points.length === 0) return <p className="text-xs text-txt-4">無資料</p>;
  const w = 800;
  const h = 120;
  const pad = 20;
  const min = Math.min(...points, dangerThreshold - 0.5);
  const maxRaw = Math.max(...points, 1);
  // 保險：若所有點同值且恰等於 threshold，max-min 可能為 0 → 除零變 NaN/Infinity
  const max = maxRaw === min ? min + 1 : maxRaw;
  const range = max - min; // 此時必 > 0
  const x = (i: number) => pad + (i / Math.max(points.length - 1, 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - 2 * pad);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.2} />
      <line
        x1={pad}
        x2={w - pad}
        y1={y(threshold)}
        y2={y(threshold)}
        stroke="orange"
        strokeDasharray="4 4"
        strokeOpacity={0.5}
      />
      <line
        x1={pad}
        x2={w - pad}
        y1={y(dangerThreshold)}
        y2={y(dangerThreshold)}
        stroke="red"
        strokeDasharray="4 4"
        strokeOpacity={0.5}
      />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}
