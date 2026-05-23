# Phase A — 智慧深化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI narrative + per-stock comments + 7-day industry flow heatmap to `/focus`, plus LINE post integration. AI content is produced by Claude Code sessions (not external LLM API).

**Architecture:** Static JSON files (`data/narrative/YYYY-MM-DD.json`) generated manually via `/narrative` slash command, served via dedicated API routes with staleness detection. Heatmap aggregates existing `major_net` field from the last 7 `data/daily/` files inside the existing `/api/focus` response — no new data fetch.

**Tech Stack:** Next.js 16 App Router, React client components, SWR (already in use), TailwindCSS, Python for LINE post update only.

**Spec:** `docs/superpowers/specs/2026-05-24-phase-a-intelligence-design.md`

**Note:** This project has no test framework. Verification is `npm run dev` + manual curl + click-through. Where a function is pure, it should be exported so it's unit-testable when a framework is added.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `data/narrative/.gitkeep` | Create | Ensure directory tracked in git |
| `data/narrative/2026-05-23-sample.json` | Create | Sample data for dev/local rendering |
| `src/app/api/narrative/[date]/route.ts` | Create | Serve a specific date's narrative |
| `src/app/api/narrative/latest/route.ts` | Create | Serve latest narrative + staleness flag |
| `src/app/api/focus/route.ts` | Modify | Add `industryFlow` field to response |
| `src/app/focus/_narrative.tsx` | Create | `Narrative` type, `NarrativeCard` component |
| `src/app/focus/_heatmap.tsx` | Create | `IndustryFlowHeatmap` component |
| `src/app/focus/_client.tsx` | Modify | Fetch narrative, render NarrativeCard + per-stock comments + Heatmap |
| `scripts/generate_line_post.py` | Modify | Prepend narrative summary to LINE post txt |
| `.claude/commands/narrative.md` | Create | Self-describing slash command for narrative generation |
| `.gitignore` | Modify | Ensure `data/narrative/` is tracked (not ignored) |

---

## Task 1: Set up narrative data directory + sample fixture

**Files:**
- Create: `data/narrative/.gitkeep` (empty file)
- Create: `data/narrative/2026-05-23-sample.json`
- Modify: `.gitignore` (verify not ignoring `data/narrative/`)

- [ ] **Step 1: Create directory marker**

Run from `C:/Users/pc/漲停族群分類`:
```bash
mkdir -p data/narrative
type nul > data/narrative/.gitkeep
```

(On Linux/mac: `touch data/narrative/.gitkeep`)

- [ ] **Step 2: Check .gitignore does not exclude narrative dir**

Run:
```bash
cd "C:/Users/pc/漲停族群分類" && grep -n "narrative" .gitignore || echo "OK not ignored"
```

Expected: `OK not ignored`. If you see a line ignoring narrative, remove it.

- [ ] **Step 3: Create sample narrative fixture**

Create `C:/Users/pc/漲停族群分類/data/narrative/2026-05-23-sample.json` (sample — will be overwritten by real generation later; useful for dev rendering with no real data):

```json
{
  "schema_version": 1,
  "date": "2026-05-23",
  "source_daily_date": "2026-05-20",
  "generated_at": "2026-05-23T17:30:00+08:00",
  "generated_by": "claude-code-session",
  "provider": "anthropic-claude",
  "summary": "今日加權收 40,020 點 +0.20%，外資賣超 466 億，投信加碼 102 億。電子權值整理，光通訊與生技續強，市場資金往中小型輪動。整體成交量略縮，操作上仍以順勢為主。",
  "leading_groups": ["電子/半導體", "光通訊/矽光子", "生技/醫療器材"],
  "tomorrow_watch": "聚焦 4916 事欣科（光通訊龍頭、營收 YoY +50%）、3090 日電貿（半導體連 3 日強勢）、6209 今國光（光通訊延續）。族群延續性以 IC 設計觀察是否擴散。",
  "risk": "今日 8 檔出現空吞警示，其中 2330 為權值股需特別留意。明日若 TAIEX 跌破 39,800 短線進入修正格局。",
  "stocks": {
    "4916": "光通訊龍頭，營收 YoY +50.2%、主力連 2 日買超 586 張、族群延續 2 天，技術面突破收極強。建議 90.35 追價、87.2 承接、停損 83.61。",
    "3090": "半導體連 3 天強勢族群龍頭，營收 YoY +28.1%、主力買超 109 張。族群完整度高，順勢操作為主。",
    "6209": "光通訊延伸標的，營收 YoY +66.9%、主力買超 285 張、連板 3 天。短線追價注意風控。"
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/pc/漲停族群分類" && git add data/narrative/ && git commit -m "feat(narrative): set up data/narrative/ dir with sample fixture"
```

---

## Task 2: API routes — `/api/narrative/[date]` and `/api/narrative/latest`

**Files:**
- Create: `src/app/api/narrative/[date]/route.ts`
- Create: `src/app/api/narrative/latest/route.ts`

- [ ] **Step 1: Create `[date]` route**

Create `C:/Users/pc/漲停族群分類/src/app/api/narrative/[date]/route.ts`:

```ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NARRATIVE_DIR = path.join(process.cwd(), "data", "narrative");

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ date: string }> }
) {
  const { date } = await ctx.params;

  // Basic validation: only YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "invalid date format" }, { status: 400 });
  }

  const file = path.join(NARRATIVE_DIR, `${date}.json`);
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: "narrative not found" }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(file, "utf-8");
    return NextResponse.json(JSON.parse(raw), {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch (e) {
    console.error("narrative read failed:", e);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `/latest` route with staleness flag**

Create `C:/Users/pc/漲停族群分類/src/app/api/narrative/latest/route.ts`:

```ts
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NARRATIVE_DIR = path.join(process.cwd(), "data", "narrative");
const DAILY_DIR = path.join(process.cwd(), "data", "daily");

function latestDateInDir(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return files[0].replace(/\.json$/, "");
}

export async function GET() {
  const narrativeDate = latestDateInDir(NARRATIVE_DIR);
  if (!narrativeDate) {
    return NextResponse.json({ error: "no narrative available" }, { status: 404 });
  }

  const file = path.join(NARRATIVE_DIR, `${narrativeDate}.json`);
  let narrative: Record<string, unknown>;
  try {
    narrative = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    console.error("narrative/latest read failed:", e);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }

  const latestDaily = latestDateInDir(DAILY_DIR);
  const sourceDailyDate = String(narrative.source_daily_date ?? narrative.date ?? "");
  const stale = latestDaily !== null && sourceDailyDate !== "" && sourceDailyDate < latestDaily;

  return NextResponse.json(
    {
      ...narrative,
      stale,
      latest_daily_date: latestDaily,
    },
    {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    }
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd "C:/Users/pc/漲停族群分類" && npx tsc --noEmit 2>&1 | grep -E "narrative" || echo "OK no narrative errors"
```

Expected: `OK no narrative errors`.

- [ ] **Step 4: Manual curl verification**

Start dev server (skip if already running):
```bash
cd "C:/Users/pc/漲停族群分類" && npm run dev
```

The sample fixture filename has `-sample` suffix so `/latest` will not find it. Rename to a proper date for the test:
```bash
cd "C:/Users/pc/漲停族群分類" && cp data/narrative/2026-05-23-sample.json data/narrative/2026-05-23.json
```

Then in another terminal:
```bash
curl -s http://localhost:3000/api/narrative/2026-05-23 | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log({date:j.date,hasStocks:Object.keys(j.stocks||{}).length});});"
```
Expected: `{ date: '2026-05-23', hasStocks: 3 }`

```bash
curl -s http://localhost:3000/api/narrative/latest | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log({date:j.date,stale:j.stale,latest_daily:j.latest_daily_date});});"
```
Expected: `{ date: '2026-05-23', stale: true, latest_daily: '2026-05-20' }` — wait, sample source_daily_date is `2026-05-20` and latest daily file is `2026-05-20`, so `stale: false`. Actually verify what's in `data/daily/`: latest should be `2026-05-20`. So `sourceDailyDate='2026-05-20'` `latestDaily='2026-05-20'` → `stale: false`. Confirm.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/narrative/1999-12-31
```
Expected: `404`

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/narrative/bad-date
```
Expected: `400`

Remove the temp file before commit (we want the `-sample` only):
```bash
cd "C:/Users/pc/漲停族群分類" && rm data/narrative/2026-05-23.json
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/pc/漲停族群分類" && git add src/app/api/narrative/ && git commit -m "feat(api/narrative): add [date] and latest routes with staleness flag"
```

---

## Task 3: NarrativeCard component (renders summary / leading_groups / tomorrow_watch / risk + stale warning)

**Files:**
- Create: `src/app/focus/_narrative.tsx`

- [ ] **Step 1: Create the component file**

Create `C:/Users/pc/漲停族群分類/src/app/focus/_narrative.tsx`:

```tsx
"use client";

export interface Narrative {
  schema_version: number;
  date: string;
  source_daily_date: string;
  generated_at: string;
  generated_by: string;
  provider: string;
  summary: string;
  leading_groups: string[];
  tomorrow_watch: string;
  risk: string;
  stocks: Record<string, string>;
  stale?: boolean;
  latest_daily_date?: string;
}

export function NarrativeCard({ narrative }: { narrative: Narrative }) {
  return (
    <div className="bg-gradient-to-br from-blue/5 via-bg-1 to-amber/5 border-2 border-blue/30 rounded-xl p-5 space-y-3">
      {/* Stale banner */}
      {narrative.stale && (
        <div className="bg-amber/15 border border-amber/40 rounded px-3 py-2 text-[11px] text-amber">
          ⚠️ 此分析基於 {narrative.source_daily_date}，但最新交易日為 {narrative.latest_daily_date}。建議重新產出（執行 <code className="font-mono">/narrative</code>）。
        </div>
      )}

      {/* Title row */}
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 bg-blue text-white text-[10px] font-bold rounded">🤖 AI 盤後分析</span>
        <span className="text-[10px] text-txt-4">{narrative.date} · {narrative.provider}</span>
      </div>

      {/* Summary */}
      <p className="text-sm text-txt-1 leading-relaxed">{narrative.summary}</p>

      {/* Leading groups */}
      {narrative.leading_groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-txt-4">主流族群：</span>
          {narrative.leading_groups.map((g) => (
            <span key={g} className="px-2 py-0.5 bg-red/15 text-red text-[11px] font-semibold rounded">
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Tomorrow watch */}
      <div className="bg-bg-2/50 border-l-2 border-blue/50 rounded px-3 py-2">
        <div className="text-[10px] text-blue font-bold mb-1">🎯 明日關注</div>
        <p className="text-[12px] text-txt-2 leading-relaxed">{narrative.tomorrow_watch}</p>
      </div>

      {/* Risk */}
      <div className="bg-bg-2/50 border-l-2 border-amber/50 rounded px-3 py-2">
        <div className="text-[10px] text-amber font-bold mb-1">⚠️ 風險提醒</div>
        <p className="text-[12px] text-txt-2 leading-relaxed">{narrative.risk}</p>
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-txt-4 text-center pt-1">
        AI 分析僅供參考，不構成投資建議；過去績效不代表未來結果。
      </p>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "C:/Users/pc/漲停族群分類" && npx tsc --noEmit 2>&1 | grep "_narrative" || echo "OK"
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/pc/漲停族群分類" && git add src/app/focus/_narrative.tsx && git commit -m "feat(focus): add NarrativeCard component

- Renders summary / leading_groups / tomorrow_watch / risk
- Stale banner appears when source_daily_date < latest_daily_date
- Hidden entirely when narrative is null"
```

---

## Task 4: Wire NarrativeCard + per-stock AI comments into `_client.tsx`

**Files:**
- Modify: `src/app/focus/_client.tsx`

- [ ] **Step 1: Add Narrative import + SWR fetch**

In `src/app/focus/_client.tsx`, find the existing imports block (top of file). Add this line right after the `./_filter-bar` import block:

```tsx
import { NarrativeCard, type Narrative } from "./_narrative";
```

Then find the line:
```tsx
  const { data, isLoading } = useSWR<FocusData>("/api/focus", fetcher);
```

Add immediately after:
```tsx
  const { data: narrative } = useSWR<Narrative>("/api/narrative/latest", fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
```

- [ ] **Step 2: Render NarrativeCard above 真實回測**

Find this block (the "REAL Backtest" section starts with the comment `{/* REAL Backtest ...`). Add the NarrativeCard rendering BEFORE that comment. Search for the exact line:

```tsx
            {/* REAL Backtest — fetched from TWSE next-day OHLC */}
```

Insert immediately above it:

```tsx
            {/* AI Narrative — produced by Claude Code session */}
            {narrative && (
              <NarrativeCard narrative={narrative} />
            )}

```

(One blank line between the new block and the `{/* REAL Backtest ... */}` comment.)

- [ ] **Step 3: Render per-stock AI comments**

Find the topPicks `Link` block — look for the tags rendering inside each pick card. The block looks like:

```tsx
                          {/* Tags */}
                          <div className="flex flex-wrap gap-1 mb-2">
                            {s.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-bg-3 text-txt-3"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
```

Add this block IMMEDIATELY AFTER the closing `</div>` of the Tags block:

```tsx
                          {/* AI per-stock comment */}
                          {narrative?.stocks?.[s.code] && (
                            <div className="mb-2 px-2 py-1.5 bg-amber/5 border-l-2 border-amber/40 rounded-r italic text-[11px] text-txt-2 leading-relaxed">
                              💬 {narrative.stocks[s.code]}
                            </div>
                          )}
```

- [ ] **Step 4: TypeScript + build check**

```bash
cd "C:/Users/pc/漲停族群分類" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

```bash
cd "C:/Users/pc/漲停族群分類" && npm run build 2>&1 | tail -20
```
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/pc/漲停族群分類" && git add src/app/focus/_client.tsx && git commit -m "feat(focus): wire NarrativeCard + per-stock AI comments

- Fetch /api/narrative/latest via SWR (revalidateOnFocus off)
- NarrativeCard renders above REAL Backtest section
- Per-stock AI comment renders below tags inside each top pick card
- Both gracefully hide when narrative absent"
```

---

## Task 5: Extend `/api/focus` with `industryFlow` field

**Files:**
- Modify: `src/app/api/focus/route.ts`

- [ ] **Step 1: Add industryFlow computation before the return**

Open `C:/Users/pc/漲停族群分類/src/app/api/focus/route.ts`. Find the final `return NextResponse.json({` (around line 365). Immediately above it, INSERT this block:

```ts
  // === Industry flow heatmap (last up to 7 days × industries × major_net sum) ===
  const flowFiles = files.slice(0, Math.min(7, files.length));
  const flowDays: { date: string; perIndustry: Map<string, number | null> }[] = [];
  for (const f of flowFiles) {
    const d = loadDaily(f);
    if (!d) continue;
    const perIndustry = new Map<string, number | null>();
    for (const g of d.groups) {
      let sum = 0;
      let hasData = false;
      for (const s of g.stocks) {
        const mn = (s as { major_net?: number }).major_net;
        if (typeof mn === "number" && !Number.isNaN(mn)) {
          sum += mn;
          hasData = true;
        }
      }
      perIndustry.set(g.name, hasData ? sum : 0);
    }
    flowDays.push({ date: d.date, perIndustry });
  }
  // Reverse so oldest is leftmost
  flowDays.reverse();
  // Union of all industries appearing in any of the days
  const industriesSet = new Set<string>();
  for (const day of flowDays) {
    for (const ind of day.perIndustry.keys()) industriesSet.add(ind);
  }
  const industries = Array.from(industriesSet);
  const matrix: (number | null)[][] = industries.map((ind) =>
    flowDays.map((day) => (day.perIndustry.has(ind) ? day.perIndustry.get(ind)! : null))
  );
  const industryFlow = {
    dates: flowDays.map((d) => d.date.slice(5)), // MM-DD
    industries,
    matrix,
  };
```

- [ ] **Step 2: Include `industryFlow` in the JSON response**

Find the existing `return NextResponse.json({` (now just below the new block). Add `industryFlow,` inside the object literal, right after the line `bearishEngulfing: ...`:

```ts
    bearishEngulfing: (today as DailyData & { bearish_engulfing?: unknown[] }).bearish_engulfing ?? [],
    industryFlow,
```

- [ ] **Step 3: TypeScript check**

```bash
cd "C:/Users/pc/漲停族群分類" && npx tsc --noEmit 2>&1 | grep "api/focus" || echo "OK"
```
Expected: `OK`.

- [ ] **Step 4: Curl verification**

(Assume dev server is running.)
```bash
curl -s http://localhost:3000/api/focus | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log({dates:j.industryFlow?.dates?.length,industries:j.industryFlow?.industries?.length,matrixRows:j.industryFlow?.matrix?.length,sampleRow:j.industryFlow?.matrix?.[0]?.slice(0,3)});});"
```
Expected (numbers will vary): `{ dates: 7, industries: <N>, matrixRows: <N>, sampleRow: [<num>, <num>, <num>] }`. Confirm dates and matrixRows match industries length.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/pc/漲停族群分類" && git add src/app/api/focus/route.ts && git commit -m "feat(api/focus): add industryFlow (industry × 7-day major_net matrix)

- Uses last up to 7 daily files (graceful partial)
- null = industry absent that day; 0 = present but flat
- Reversed so oldest date is leftmost in matrix"
```

---

## Task 6: IndustryFlowHeatmap component + wire into client

**Files:**
- Create: `src/app/focus/_heatmap.tsx`
- Modify: `src/app/focus/_client.tsx`

- [ ] **Step 1: Create the Heatmap component**

Create `C:/Users/pc/漲停族群分類/src/app/focus/_heatmap.tsx`:

```tsx
"use client";

export interface IndustryFlow {
  dates: string[];
  industries: string[];
  matrix: (number | null)[][];
}

/** Pure helper: pick a Tailwind bg class given a value and max abs in the matrix */
export function cellClass(value: number | null, maxAbs: number): string {
  if (value === null) return "bg-bg-3/40";
  if (maxAbs === 0) return "bg-bg-2";
  const ratio = Math.min(1, Math.abs(value) / maxAbs);
  // Quantize to 5 buckets so Tailwind can JIT them
  const bucket = ratio < 0.2 ? 1 : ratio < 0.4 ? 2 : ratio < 0.6 ? 3 : ratio < 0.8 ? 4 : 5;
  if (value > 0) {
    const map = ["", "bg-red/10", "bg-red/25", "bg-red/45", "bg-red/65", "bg-red/85"];
    return `${map[bucket]} text-txt-0`;
  }
  if (value < 0) {
    const map = ["", "bg-green/10", "bg-green/25", "bg-green/45", "bg-green/65", "bg-green/85"];
    return `${map[bucket]} text-txt-0`;
  }
  return "bg-bg-2";
}

export function IndustryFlowHeatmap({ flow }: { flow: IndustryFlow }) {
  if (flow.dates.length === 0 || flow.industries.length === 0) return null;

  // Compute max absolute value across matrix for color scaling
  let maxAbs = 0;
  for (const row of flow.matrix) {
    for (const v of row) {
      if (v !== null) maxAbs = Math.max(maxAbs, Math.abs(v));
    }
  }

  // Sort industries by recent sum desc (most recent date) so important ones first
  const lastIdx = flow.dates.length - 1;
  const order = flow.industries
    .map((ind, i) => ({ ind, score: flow.matrix[i][lastIdx] ?? 0, i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15); // cap at 15 rows

  return (
    <div className="bg-bg-1 border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-txt-0">
          主力資金 {flow.dates.length} 日流向
          <span className="ml-2 text-[10px] font-normal text-txt-4">紅買綠賣，深淺對應金額</span>
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-txt-4">
              <th className="text-left px-2 py-1.5 sticky left-0 bg-bg-1">產業</th>
              {flow.dates.map((d) => (
                <th key={d} className="text-right px-2 py-1.5 tabular-nums">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map(({ ind, i }) => (
              <tr key={ind} className="border-t border-border/30">
                <td className="px-2 py-1.5 text-txt-2 sticky left-0 bg-bg-1">{ind}</td>
                {flow.matrix[i].map((v, di) => (
                  <td
                    key={di}
                    className={`text-right px-2 py-1.5 tabular-nums ${cellClass(v, maxAbs)}`}
                    title={
                      v === null
                        ? `${flow.dates[di]} ${ind}：當日無資料`
                        : `${flow.dates[di]} ${ind}：主力 ${v > 0 ? "+" : ""}${(v / 1000).toFixed(0)} 張`
                    }
                  >
                    {v === null ? "-" : `${v > 0 ? "+" : ""}${(v / 1000).toFixed(0)}`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-txt-4 mt-2">
        單位：千股（張）。null 格表示該產業當日未出現於漲停族群。
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `_client.tsx`**

In `src/app/focus/_client.tsx`:

(a) Add the import (right after the `./_narrative` import you added in Task 4):

```tsx
import { IndustryFlowHeatmap, type IndustryFlow } from "./_heatmap";
```

(b) Add `industryFlow?: IndustryFlow;` field at the end of the `FocusData` interface:

Find the interface block (around line 69-87 originally). The closing `}` of `FocusData`. Add this line above the closing `}`:

```tsx
  industryFlow?: IndustryFlow;
```

(c) Render the heatmap between "Trending Groups" and "Top Picks". Find:

```tsx
            {/* Top Picks */}
            <div className="bg-bg-1 border border-border rounded-xl p-5">
```

Insert IMMEDIATELY above this `{/* Top Picks */}` line:

```tsx
            {/* Industry flow heatmap */}
            {data.industryFlow && data.industryFlow.dates.length > 0 && (
              <IndustryFlowHeatmap flow={data.industryFlow} />
            )}

```

- [ ] **Step 3: TypeScript + build check**

```bash
cd "C:/Users/pc/漲停族群分類" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

```bash
cd "C:/Users/pc/漲停族群分類" && npm run build 2>&1 | tail -15
```
Expected: build succeeds.

- [ ] **Step 4: Mentally trace `cellClass` against these cases**

| value | maxAbs | expected bg class |
|-------|--------|-------------------|
| `null` | 1000 | `bg-bg-3/40` |
| `0` | 1000 | `bg-bg-2` |
| `100` | 1000 | `bg-red/10 text-txt-0` (ratio 0.1, bucket 1) |
| `500` | 1000 | `bg-red/45 text-txt-0` (ratio 0.5, bucket 3) |
| `-900` | 1000 | `bg-green/65 text-txt-0` (ratio 0.9, bucket 5) — actually 0.9 → bucket 5 because `< 0.8` is false, so 0.9 → ratio not < 0.8 → bucket 5 → `bg-green/85`. Correction: 0.9 → bucket 5, class `bg-green/85`. |
| any | `0` (empty matrix) | `bg-bg-2` (early return) |

If logic doesn't match, fix `cellClass` before committing.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/pc/漲停族群分類" && git add src/app/focus/_heatmap.tsx src/app/focus/_client.tsx && git commit -m "feat(focus): add IndustryFlowHeatmap

- Pure cellClass helper for color quantization (5 buckets)
- Sticky left column (產業 names)
- Sorted by latest-day net buy descending, capped at 15 rows
- Renders between Trending Groups and Top Picks"
```

---

## Task 7: Integrate narrative into LINE post

**Files:**
- Modify: `scripts/generate_line_post.py`

- [ ] **Step 1: Read the existing script to find the txt assembly point**

Read `C:/Users/pc/漲停族群分類/scripts/generate_line_post.py`. Find where it builds the txt output (look for `f.write(` or string concatenation that ends up in the `.txt` file).

- [ ] **Step 2: Add narrative loading helper at top of script**

After the existing imports in `scripts/generate_line_post.py`, add:

```python
import json
from pathlib import Path

NARRATIVE_DIR = Path(__file__).resolve().parent.parent / "data" / "narrative"

def load_narrative_for(date_str: str):
    """Return narrative dict for given YYYY-MM-DD, or None if missing/invalid."""
    f = NARRATIVE_DIR / f"{date_str}.json"
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return None
```

(If those imports already exist, dedupe — don't double-import.)

- [ ] **Step 3: Prepend narrative summary to the txt body**

Find where the txt body is composed (likely a multi-line f-string or string concat that begins with date/title). At the START of that body — but AFTER any title/header lines — insert:

```python
narrative = load_narrative_for(date_str)  # date_str must be the YYYY-MM-DD the post is for
if narrative:
    narrative_block = (
        "\n📊 AI 盤後分析\n"
        f"{narrative.get('summary', '').strip()}\n\n"
        "🎯 明日關注\n"
        f"{narrative.get('tomorrow_watch', '').strip()}\n\n"
        "⚠️ 風險提醒\n"
        f"{narrative.get('risk', '').strip()}\n\n"
        "──────────────\n"
    )
else:
    narrative_block = ""
```

Then include `narrative_block` in the txt body assembly (concatenate it before the existing stock list / observation list content).

**Identify the EXACT existing variable** holding the body text and prepend `narrative_block` to it. If body is `body = "..."`, change to `body = narrative_block + "..."`.

If `date_str` isn't already a variable in the function scope, derive it from whatever `date` variable the script uses (look for `.strftime("%Y-%m-%d")` or similar). Add `date_str = ...` right before the narrative loading line.

- [ ] **Step 4: Verify the script still runs**

```bash
cd "C:/Users/pc/漲停族群分類" && python scripts/generate_line_post.py 2>&1 | tail -10
```

Expected: produces `line_post/<date>_觀察名單.txt`. Open it (read first 40 lines) — narrative block should appear at top IF a matching narrative file exists.

Test BOTH cases:
- Without narrative file → script should still complete; txt has no narrative block (original format).
- With narrative file → narrative block at top, separator `──────────────`, then original content.

To test "with":
```bash
cp data/narrative/2026-05-23-sample.json data/narrative/2026-05-20.json && python scripts/generate_line_post.py && head -20 line_post/*.txt && rm data/narrative/2026-05-20.json
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/pc/漲停族群分類" && git add scripts/generate_line_post.py && git commit -m "feat(line-post): prepend AI narrative to daily txt output

- Loads data/narrative/<date>.json if exists
- Prepends summary + tomorrow_watch + risk block
- Falls back to original format if narrative missing"
```

---

## Task 8: `/narrative` slash command

**Files:**
- Create: `.claude/commands/narrative.md`

- [ ] **Step 1: Create the command file**

Create `C:/Users/pc/漲停族群分類/.claude/commands/narrative.md`:

```markdown
---
description: 產出今日盤後 AI Narrative，寫入 data/narrative/{date}.json，重生 LINE 貼文並 push
---

執行步驟（請逐步完成、不要省略）：

## 1. 確認最新交易日
```bash
ls data/daily/*.json | sort | tail -1
```
取最新檔的 date 部分作為 `{date}`。

## 2. 讀取今日資料
- 讀 `data/daily/{date}.json` — market_summary、所有 groups、bearish_engulfing
- 從 `/api/focus`（如 dev server 在跑）或自行掃 daily JSON 算分，取得 topPicks 前 10–15 名

## 3. 撰寫 narrative

依 `docs/superpowers/specs/2026-05-24-phase-a-intelligence-design.md` 第 3.1 節 schema 撰寫：

- `schema_version: 1`
- `date`: 今日
- `source_daily_date`: 最新 daily 的日期
- `generated_at`: 當下 ISO timestamp
- `generated_by: "claude-code-session"`
- `provider: "anthropic-claude"`
- `summary`: 100–150 字，含 TAIEX 數據、外資/投信、主流族群判讀
- `leading_groups`: 3–4 個今日強勢族群
- `tomorrow_watch`: 60–100 字，3–5 檔具體標的 + 族群延續性判斷
- `risk`: 40–80 字，空吞警示 + 技術關鍵價位
- `stocks`: 至少前 10 名 topPicks，每檔 60–100 字（含客觀數據 + 操作節奏）

## 4. 寫檔
寫入 `data/narrative/{date}.json`，UTF-8 縮排 2。

## 5. 重生 LINE 貼文
```bash
python scripts/generate_line_post.py
```

## 6. Commit + push
```bash
git add data/narrative/ line_post/
git commit -m "feat(narrative): 產生 {date} AI 盤後分析"
git push
```

## 撰寫守則
- 繁體中文、語氣中性有觀點、不過度推薦
- 主流族群以「延續性」+「強度」綜合判斷
- 風險點優先強調空吞警示與技術破位
- per-stock 簡評以「客觀數據（營收/主力/連板/族群延續）+ 操作建議（追價/承接/停損價位）」結構
- **嚴禁**：預測股價、保證獲利、暗示明牌
- 結尾不需要免責聲明（前端已加）
```

- [ ] **Step 2: Verify the slash command is recognised**

The `.claude/commands/` directory is the Claude Code convention. After creating the file, the next Claude Code session in this project should see `/narrative` available.

(No runtime check; this is metadata for future sessions.)

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/pc/漲停族群分類" && git add .claude/commands/narrative.md && git commit -m "feat: add /narrative slash command for daily AI narrative generation"
```

---

## Task 9: End-to-end verification + deploy

**Files:** none (verification only)

- [ ] **Step 1: Final local build**

```bash
cd "C:/Users/pc/漲停族群分類" && npm run build 2>&1 | tail -20
```
Expected: passes.

- [ ] **Step 2: Local browser smoke test (sample data)**

Copy the sample so /focus has real data to render:
```bash
cd "C:/Users/pc/漲停族群分類" && cp data/narrative/2026-05-23-sample.json data/narrative/2026-05-23.json
```

Start dev (skip if running):
```bash
npm run dev
```

Open http://localhost:3000/focus and verify:
- 🤖 AI 盤後分析 card appears above 真實回測 section
- summary / leading_groups / tomorrow_watch / risk all render
- If `source_daily_date` (2026-05-20) === latest daily (2026-05-20) → no stale banner. Confirm.
- "主力資金 N 日流向" heatmap renders with industry rows and date columns; cells have red/green tint; "-" appears for null cells; tooltip on hover shows value.
- topPicks `4916`, `3090`, `6209` show "💬 …" italic AI comments below tags.
- Other picks (without comment) render normally without an empty AI block.

Remove temp file (we don't commit it):
```bash
cd "C:/Users/pc/漲停族群分類" && rm data/narrative/2026-05-23.json
```

- [ ] **Step 3: Push to remote**

```bash
cd "C:/Users/pc/漲停族群分類" && git log --oneline -10 && git status
```
Expected: clean working tree, recent commits show Tasks 1–8.

```bash
git push origin master
```

- [ ] **Step 4: Wait for Vercel deploy + verify live**

After ~90s, verify the live API:

```bash
# auth + probe /api/focus for industryFlow
curl -s -c /tmp/c.txt -X POST "https://limit-up-radar.vercel.app/api/auth/login" -H "Content-Type: application/json" -d '{"password":"jA6-UrARO2PPvKLb"}' -o /dev/null -w "login %{http_code}\n"
curl -s -b /tmp/c.txt "https://limit-up-radar.vercel.app/api/focus" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log({hasFlow:!!j.industryFlow,dates:j.industryFlow?.dates?.length,industries:j.industryFlow?.industries?.length});});"
```
Expected: `{ hasFlow: true, dates: <1-7>, industries: <N> }`.

```bash
curl -s -b /tmp/c.txt -o /dev/null -w "narrative latest %{http_code}\n" "https://limit-up-radar.vercel.app/api/narrative/latest"
```
Expected: `404` (no real narrative committed yet — sample has `-sample` suffix so it's excluded). This is correct; first real `/narrative` run will create one.

- [ ] **Step 5: Manual /focus prod check**

Open https://limit-up-radar.vercel.app/focus in browser:
- AI Narrative card: ABSENT (because no real narrative file yet — confirms graceful hide)
- Heatmap: PRESENT with industry × date matrix
- Top picks: render normally, no AI comments yet
- FilterBar still works (from previous phase)
- No console errors

This proves "fallback to no narrative" works. Once the user runs `/narrative` for the first time, AI content will appear automatically.

- [ ] **Step 6: Final status**

Plan complete. To populate AI content the user runs `/narrative` (Task 8 command) at any time after the day's classification — typically once per evening.

---

## Self-Review Checklist

- [x] Spec 3.1 (schema) → Task 1 sample + Task 3 type matches schema
- [x] Spec 3.2 (slash command) → Task 8
- [x] Spec 3.3 (API routes) → Task 2 (both routes, with staleness logic)
- [x] Spec 3.4 (frontend integration) → Task 3 (component) + Task 4 (wire)
- [x] Spec 3.5 (heatmap) → Task 5 (API extension) + Task 6 (component + wire)
- [x] Spec 3.6 (LINE post) → Task 7
- [x] Spec 3.7 (fallback matrix) → covered by component conditionals + API 404 + null-vs-0 in heatmap
- [x] No "TBD"/"TODO" placeholders
- [x] Type names consistent: `Narrative` (`_narrative.tsx`), `IndustryFlow` (`_heatmap.tsx`), `FocusData.industryFlow` reference matches `IndustryFlow` shape from `_heatmap.tsx`
- [x] All curl commands have expected outputs
- [x] Every code block is complete (not a fragment)
