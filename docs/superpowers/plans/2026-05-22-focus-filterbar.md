# Focus FilterBar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky FilterBar to `/focus` page so users can filter both "精選追蹤標的" and "全部漲停股評分" by score / heavyweight / bearish-engulfing / industry-group. Filter state persists in URL query params.

**Architecture:** Pure client-side filtering on the data already returned by `/api/focus`. One small API patch adds an `isBearish` boolean to each stock. A new `_filter-bar.tsx` component owns the UI and exports a pure `passesFilter()` function. `_client.tsx` reads URL params, manages state, and applies the filter to both lists before render.

**Tech Stack:** Next.js 16 App Router, React client component, SWR (already used), `useSearchParams` + `useRouter().replace()` for URL sync, TailwindCSS for styling.

**Spec:** `docs/superpowers/specs/2026-05-22-focus-filterbar-design.md`

**Note:** This project has no test framework configured. Verification is done by running `npm run dev` and clicking through manually. The `passesFilter` function is designed as pure so it can be unit-tested later if a test framework is added.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/api/focus/route.ts` | Modify | Add `isBearish` boolean to each stock in `focusStocks` |
| `src/app/focus/_filter-bar.tsx` | Create | `FilterState` type, `passesFilter()` pure function, `<FilterBar>` UI component, URL ↔ state helpers |
| `src/app/focus/_client.tsx` | Modify | Read URL params, manage filter state, apply `passesFilter` to `topPicks` and `focusStocks` before render, render `<FilterBar>` |

---

## Task 1: API — add `isBearish` flag to focus stocks

**Files:**
- Modify: `src/app/api/focus/route.ts` (around line 169-239 — the `FocusStock` interface and the stock-building loop)

- [ ] **Step 1: Add `isBearish` to the `FocusStock` interface**

In `src/app/api/focus/route.ts`, find the local `interface FocusStock` block (around line 170-190) and add the new field at the end:

```ts
  interface FocusStock {
    code: string;
    name: string;
    close: number;
    changePct: number;
    volume: number;
    majorNet: number;
    streak: number;
    group: string;
    groupColor: string;
    score: number;
    tags: string[];
    revYoY: number | null;
    revMonth: number | null;
    groupDays: number;
    entryAggressive: number;
    entryPullback: number;
    stopLoss: number;
    target1: number;
    target2: number;
    isBearish: boolean;       // NEW
  }
```

- [ ] **Step 2: Build a Set of today's bearish codes**

Right before the `for (const g of today.groups)` loop that starts around line 194, insert:

```ts
  // Today's bearish-engulfing codes (for UI filter flag)
  const todayBearishCodes = new Set<string>(
    ((today as DailyData & { bearish_engulfing?: { code: string }[] }).bearish_engulfing ?? [])
      .map((b) => b.code)
      .filter((c): c is string => typeof c === "string")
  );
```

- [ ] **Step 3: Populate `isBearish` when pushing each stock**

Inside the inner `for (const s of g.stocks)` loop, in the `focusStocks.push({ ... })` call, add at the end of the object literal:

```ts
        target2,
        isBearish: todayBearishCodes.has(s.code),    // NEW
      });
```

- [ ] **Step 4: Manual verification**

Run:
```bash
cd "C:/Users/pc/漲停族群分類" && npm run dev
```

Then in another terminal:
```bash
curl -s http://localhost:3000/api/focus | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const j=JSON.parse(d);
  const total=j.focusStocks.length;
  const withFlag=j.focusStocks.filter(s=>typeof s.isBearish==='boolean').length;
  const trueCount=j.focusStocks.filter(s=>s.isBearish).length;
  console.log({total,withFlag,trueCount});
});"
```

Expected: `withFlag === total` (every stock has the flag); `trueCount` matches `j.bearishEngulfing.length` for any overlapping codes (often 0 because today's limit-up stocks are unlikely to also be today's bearish stocks — that's expected).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/focus/route.ts
git commit -m "feat(api/focus): add isBearish flag to each stock for UI filter"
```

---

## Task 2: Create FilterBar component & passesFilter function

**Files:**
- Create: `src/app/focus/_filter-bar.tsx`

- [ ] **Step 1: Create the file with types and pure filter function**

Create `src/app/focus/_filter-bar.tsx` with this exact content:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";

// === Types ===
export type ScoreMin = 0 | 60 | 80;
export type TriState = "all" | "only" | "exclude";        // for 權值
export type BearishState = "all" | "hide" | "only";       // for 空吞

export interface FilterState {
  scoreMin: ScoreMin;
  heavy: TriState;
  bearish: BearishState;
  groups: string[];           // empty = no group filter
}

export const DEFAULT_FILTER: FilterState = {
  scoreMin: 0,
  heavy: "all",
  bearish: "all",
  groups: [],
};

// Shape of a stock that passesFilter needs (subset of FocusStock)
export interface FilterableStock {
  score: number;
  group: string;
  tags: string[];
  isBearish?: boolean;
}

// === Pure filter function ===
export function passesFilter(s: FilterableStock, f: FilterState): boolean {
  if (f.scoreMin > 0 && s.score < f.scoreMin) return false;

  const isHeavy = s.tags.includes("權值");
  if (f.heavy === "only" && !isHeavy) return false;
  if (f.heavy === "exclude" && isHeavy) return false;

  const bearish = s.isBearish ?? false;
  if (f.bearish === "hide" && bearish) return false;
  if (f.bearish === "only" && !bearish) return false;

  if (f.groups.length > 0 && !f.groups.includes(s.group)) return false;

  return true;
}

// === URL ↔ State serialization ===
export function filterToParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.scoreMin > 0) p.set("score", String(f.scoreMin));
  if (f.heavy !== "all") p.set("heavy", f.heavy);
  if (f.bearish !== "all") p.set("bearish", f.bearish);
  if (f.groups.length > 0) p.set("groups", f.groups.join(","));
  return p;
}

export function paramsToFilter(p: URLSearchParams): FilterState {
  const scoreRaw = Number(p.get("score") ?? 0);
  const scoreMin: ScoreMin = scoreRaw === 80 ? 80 : scoreRaw === 60 ? 60 : 0;

  const heavyRaw = p.get("heavy");
  const heavy: TriState =
    heavyRaw === "only" || heavyRaw === "exclude" ? heavyRaw : "all";

  const bearishRaw = p.get("bearish");
  const bearish: BearishState =
    bearishRaw === "hide" || bearishRaw === "only" ? bearishRaw : "all";

  const groupsRaw = p.get("groups");
  const groups = groupsRaw ? groupsRaw.split(",").filter(Boolean) : [];

  return { scoreMin, heavy, bearish, groups };
}

export function isDefaultFilter(f: FilterState): boolean {
  return (
    f.scoreMin === 0 &&
    f.heavy === "all" &&
    f.bearish === "all" &&
    f.groups.length === 0
  );
}

// === UI helpers ===
function Segment<T extends string | number>(props: {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-txt-4 w-10">{props.label}</span>
      <div className="inline-flex bg-bg-2 border border-border rounded-md p-0.5">
        {props.options.map((opt) => {
          const active = opt.value === props.value;
          return (
            <button
              key={String(opt.value)}
              onClick={() => props.onChange(opt.value)}
              className={
                "px-2.5 py-1 text-[11px] rounded transition-colors " +
                (active
                  ? "bg-red text-white font-semibold"
                  : "text-txt-3 hover:text-txt-1")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GroupPicker(props: {
  selected: string[];
  available: string[];
  onChange: (g: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const remaining = props.available.filter((g) => !props.selected.includes(g));

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-txt-4 w-10">族群</span>
      {props.selected.map((g) => (
        <span
          key={g}
          className="inline-flex items-center gap-1 px-2 py-1 bg-blue/15 text-blue text-[11px] rounded"
        >
          {g}
          <button
            onClick={() => props.onChange(props.selected.filter((x) => x !== g))}
            className="hover:text-red"
            aria-label={`移除 ${g}`}
          >
            ×
          </button>
        </span>
      ))}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={remaining.length === 0}
          className="px-2.5 py-1 text-[11px] bg-bg-2 border border-border rounded text-txt-3 hover:text-txt-1 disabled:opacity-40"
        >
          {remaining.length === 0 ? "已全選" : "+ 選擇族群 ▾"}
        </button>
        {open && remaining.length > 0 && (
          <div className="absolute top-full left-0 mt-1 z-20 min-w-[180px] max-h-[300px] overflow-y-auto bg-bg-1 border border-border rounded-md shadow-lg py-1">
            {remaining.map((g) => (
              <button
                key={g}
                onClick={() => {
                  props.onChange([...props.selected, g]);
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-1.5 text-[11px] text-txt-2 hover:bg-bg-2 hover:text-txt-0"
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// === Main component ===
export function FilterBar(props: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  availableGroups: string[];
  visibleCount: number;
  totalCount: number;
}) {
  const { state, onChange, availableGroups, visibleCount, totalCount } = props;
  const dirty = !isDefaultFilter(state);
  const empty = dirty && visibleCount === 0;

  return (
    <div className="bg-bg-2/50 border border-border rounded-lg p-3 space-y-2 sticky top-[56px] z-10 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segment
          label="評分"
          value={state.scoreMin}
          options={[
            { label: "全部", value: 0 },
            { label: "80+", value: 80 },
            { label: "60+", value: 60 },
          ]}
          onChange={(v) => onChange({ ...state, scoreMin: v as ScoreMin })}
        />
        <Segment
          label="權值"
          value={state.heavy}
          options={[
            { label: "全部", value: "all" },
            { label: "只看權值", value: "only" },
            { label: "排除權值", value: "exclude" },
          ]}
          onChange={(v) => onChange({ ...state, heavy: v as TriState })}
        />
        <Segment
          label="空吞"
          value={state.bearish}
          options={[
            { label: "全部", value: "all" },
            { label: "隱藏空吞", value: "hide" },
            { label: "只看空吞", value: "only" },
          ]}
          onChange={(v) => onChange({ ...state, bearish: v as BearishState })}
        />
        <GroupPicker
          selected={state.groups}
          available={availableGroups}
          onChange={(g) => onChange({ ...state, groups: g })}
        />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className={empty ? "text-red" : "text-txt-3"}>
          顯示 <strong className="text-txt-1">{visibleCount}</strong>/{totalCount} 檔
          {empty && "（無符合條件）"}
        </span>
        {dirty && (
          <button
            onClick={() => onChange(DEFAULT_FILTER)}
            className="px-2 py-0.5 text-[11px] text-txt-3 hover:text-red border border-border rounded"
          >
            清除全部
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Sanity-check the file compiles**

Run:
```bash
cd "C:/Users/pc/漲停族群分類" && npx tsc --noEmit 2>&1 | grep "_filter-bar" || echo "OK no errors in _filter-bar"
```

Expected: `OK no errors in _filter-bar`

- [ ] **Step 3: Manually trace `passesFilter` against 6 cases**

In your head (or paste into Node REPL by importing — but ts-node not configured, so trace mentally), verify:

| Stock | Filter | Expected |
|-------|--------|----------|
| `{score:75, tags:[], group:"半導體", isBearish:false}` | default | `true` |
| same | `{scoreMin:80, ...}` | `false` (score 75 < 80) |
| `{score:90, tags:["權值"], group:"半導體", isBearish:false}` | `{heavy:"exclude", ...}` | `false` |
| `{score:90, tags:[], group:"半導體", isBearish:false}` | `{heavy:"only", ...}` | `false` |
| `{score:90, tags:[], group:"半導體", isBearish:true}` | `{bearish:"hide", ...}` | `false` |
| `{score:90, tags:[], group:"生技", isBearish:false}` | `{groups:["半導體","生技"], ...}` | `true` |

If any line doesn't match the function logic, fix the function before commit.

- [ ] **Step 4: Commit**

```bash
git add src/app/focus/_filter-bar.tsx
git commit -m "feat(focus): add FilterBar component with pure passesFilter function

- FilterState type with 4 dimensions: scoreMin / heavy / bearish / groups
- passesFilter: AND across dimensions, OR within groups
- URL <-> state serialization helpers
- Segmented controls + multi-select group dropdown UI"
```

---

## Task 3: Wire FilterBar into `_client.tsx`

**Files:**
- Modify: `src/app/focus/_client.tsx`

- [ ] **Step 1: Add imports and new interface field**

At the top of `src/app/focus/_client.tsx`, change the imports block from:

```tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
```

to:

```tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";
import {
  FilterBar,
  passesFilter,
  paramsToFilter,
  filterToParams,
  DEFAULT_FILTER,
  type FilterState,
} from "./_filter-bar";
```

Then in the `FocusStock` interface (line 9-29), add `isBearish` at the end before the closing `}`:

```tsx
interface FocusStock {
  // ...existing fields up to target2
  target2?: number;
  isBearish?: boolean;       // NEW
}
```

- [ ] **Step 2: Inside `FocusClient`, add filter state derived from URL**

Find this line (around line 152):

```tsx
export default function FocusClient() {
  const { data, isLoading } = useSWR<FocusData>("/api/focus", fetcher);
```

Add immediately after the SWR call:

```tsx
  // === Filter state synced with URL query params ===
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filter, setFilter] = useState<FilterState>(() =>
    paramsToFilter(new URLSearchParams(searchParams?.toString() ?? ""))
  );

  // Push filter changes back to URL (replace, no history entry)
  useEffect(() => {
    const next = filterToParams(filter).toString();
    const current = searchParams?.toString() ?? "";
    if (next !== current) {
      router.replace(next ? `/focus?${next}` : "/focus", { scroll: false });
    }
  }, [filter, router, searchParams]);

  // Derive available groups from today's stocks (unique, sorted by appearance order)
  const availableGroups = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const s of data.focusStocks) {
      if (!seen.has(s.group)) {
        seen.add(s.group);
        ordered.push(s.group);
      }
    }
    return ordered;
  }, [data]);

  // Apply filter to both lists
  const filteredTopPicks = useMemo(
    () => (data?.topPicks ?? []).filter((s) => passesFilter(s, filter)),
    [data?.topPicks, filter]
  );
  const filteredFocusStocks = useMemo(
    () => (data?.focusStocks ?? []).filter((s) => passesFilter(s, filter)),
    [data?.focusStocks, filter]
  );
```

- [ ] **Step 3: Render the FilterBar above the top-picks card**

Find the "Top Picks" section header (around line 383-390):

```tsx
            {/* Top Picks */}
            <div className="bg-bg-1 border border-border rounded-xl p-5">
              <h2 className="text-sm font-bold text-txt-0 mb-1">
                精選追蹤標的
                <span className="ml-2 text-[10px] font-normal text-txt-4">綜合評分 ≥ 50</span>
              </h2>
              <p className="text-[10px] text-txt-4 mb-4">
                評分依據：趨勢族群(30) + 營收成長(25-35) + 法人買超(20) + 連板(15) + 龍頭(10)
              </p>
```

Replace it with (adds FilterBar after the `<p>` description, before the list):

```tsx
            {/* Top Picks */}
            <div className="bg-bg-1 border border-border rounded-xl p-5">
              <h2 className="text-sm font-bold text-txt-0 mb-1">
                精選追蹤標的
                <span className="ml-2 text-[10px] font-normal text-txt-4">綜合評分 ≥ 50</span>
              </h2>
              <p className="text-[10px] text-txt-4 mb-4">
                評分依據：趨勢族群(30) + 營收成長(25-35) + 法人買超(20) + 連板(15) + 龍頭(10)
              </p>

              <div className="mb-4">
                <FilterBar
                  state={filter}
                  onChange={setFilter}
                  availableGroups={availableGroups}
                  visibleCount={filteredTopPicks.length + filteredFocusStocks.length}
                  totalCount={data.topPicks.length + data.focusStocks.length}
                />
              </div>
```

- [ ] **Step 4: Replace top-picks render to use `filteredTopPicks`**

In the same Top Picks block, find:

```tsx
              {data.topPicks.length === 0 ? (
                <div className="text-center py-8 text-txt-3 text-sm">今日無符合條件標的</div>
              ) : (
                <div className="space-y-3">
                  {data.topPicks.map((s) => (
```

Replace with:

```tsx
              {filteredTopPicks.length === 0 ? (
                <div className="text-center py-8 text-txt-3 text-sm">
                  {data.topPicks.length === 0
                    ? "今日無符合條件標的"
                    : "目前篩選條件下無符合標的"}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTopPicks.map((s) => (
```

- [ ] **Step 5: Replace full-list render to use `filteredFocusStocks`**

Find the "Full List" section header (around line 500-506):

```tsx
            {/* Full List */}
            <div className="bg-bg-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="text-sm font-bold text-txt-0">
                  全部漲停股評分
                  <span className="ml-2 text-[10px] font-normal text-txt-4">{data.focusStocks.length} 檔</span>
                </h2>
              </div>
```

Replace with:

```tsx
            {/* Full List */}
            <div className="bg-bg-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="text-sm font-bold text-txt-0">
                  全部漲停股評分
                  <span className="ml-2 text-[10px] font-normal text-txt-4">
                    {filteredFocusStocks.length}/{data.focusStocks.length} 檔
                  </span>
                </h2>
              </div>
```

Then find the table body:

```tsx
                  <tbody>
                    {data.focusStocks.map((s) => (
```

Replace with:

```tsx
                  <tbody>
                    {filteredFocusStocks.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-txt-3 text-sm">
                          目前篩選條件下無符合標的
                        </td>
                      </tr>
                    )}
                    {filteredFocusStocks.map((s) => (
```

- [ ] **Step 6: TypeScript check**

Run:
```bash
cd "C:/Users/pc/漲停族群分類" && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If errors appear in `_client.tsx` or `_filter-bar.tsx`, fix them before proceeding.

- [ ] **Step 7: Build check (catches Next.js-specific issues)**

Run:
```bash
cd "C:/Users/pc/漲停族群分類" && npm run build 2>&1 | tail -30
```

Expected: build completes, "✓ Generating static pages" message. If `/focus` shows a Suspense boundary warning about `useSearchParams`, that's expected for App Router — but if it errors, wrap the component in `<Suspense>` (see Task 4 if needed).

- [ ] **Step 8: Commit**

```bash
git add src/app/focus/_client.tsx
git commit -m "feat(focus): wire FilterBar to both lists with URL persistence

- FilterBar renders above '精選追蹤標的'
- Both lists (top picks + full table) use filteredXxx via passesFilter
- URL query params are source of truth; setFilter -> router.replace
- Empty-state messages differentiate '今日無漲停' vs '篩選後無'"
```

---

## Task 4: Fix Suspense boundary if Next.js build complains

**Files:**
- Modify: `src/app/focus/page.tsx` (only if Step 7 of Task 3 errored)

- [ ] **Step 1: Check if needed**

If Task 3 Step 7 (`npm run build`) succeeded without `useSearchParams` Suspense errors, **skip this entire task and go to Task 5**.

Only proceed if build output contains something like:
```
useSearchParams() should be wrapped in a suspense boundary at page "/focus"
```

- [ ] **Step 2: Read current page.tsx**

Read `src/app/focus/page.tsx` to see its current shape.

- [ ] **Step 3: Wrap `<FocusClient />` in Suspense**

Modify `src/app/focus/page.tsx` to wrap the client component:

```tsx
import { Suspense } from "react";
import FocusClient from "./_client";

export default function FocusPage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-txt-3">載入中...</div>}>
      <FocusClient />
    </Suspense>
  );
}
```

(Adjust to keep any existing metadata exports or wrapper logic.)

- [ ] **Step 4: Rebuild**

```bash
cd "C:/Users/pc/漲停族群分類" && npm run build 2>&1 | tail -20
```

Expected: build passes, no Suspense warning.

- [ ] **Step 5: Commit**

```bash
git add src/app/focus/page.tsx
git commit -m "fix(focus): wrap FocusClient in Suspense for useSearchParams"
```

---

## Task 5: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

```bash
cd "C:/Users/pc/漲停族群分類" && npm run dev
```

Wait for "Ready" message. Server runs on http://localhost:3000.

- [ ] **Step 2: Open `/focus` and verify default state**

In a browser, open http://localhost:3000/focus

Verify:
- FilterBar appears between "評分依據" line and the top picks list
- All 4 dimensions show "全部" as selected
- "顯示 X/Y 檔" — both numbers equal (no filtering applied)
- No "清除全部" button visible (only appears when dirty)
- Both lists render exactly as before

- [ ] **Step 3: Test 評分 80+ filter**

Click `[80+]` under 評分.

Verify:
- URL changes to `/focus?score=80`
- Top picks list shrinks (only score ≥ 80 visible)
- Full list shrinks (only score ≥ 80 visible)
- "顯示 X/Y" — X is smaller than Y
- "清除全部" button appears

- [ ] **Step 4: Test 權值「只看權值」filter**

Click `[80+]` then `[只看權值]`.

Verify:
- URL = `/focus?score=80&heavy=only`
- Lists shrink further (only stocks with "權值" tag remain)
- If no stock matches, both empty-state messages show

- [ ] **Step 5: Test 族群 multi-select**

Click "清除全部". Click `[+ 選擇族群]` dropdown, pick first group. Open dropdown again, pick second group.

Verify:
- 2 chips appear with `×` buttons
- URL = `/focus?groups=<group1>,<group2>` (URL-encoded)
- Lists only show stocks from those 2 groups
- Click `×` on one chip → URL updates, list re-filters

- [ ] **Step 6: Test URL reload persistence**

With multiple filters active, copy the URL, open in a new tab.

Verify:
- FilterBar opens with the exact same filter state
- Lists render with the same filtered content

- [ ] **Step 7: Test 清除全部**

Click "清除全部".

Verify:
- All controls return to "全部"
- URL becomes just `/focus` (no query params)
- Lists return to full size

- [ ] **Step 8: Test 空吞 filter (may be no-op if no overlap)**

Click `[只看空吞]` under 空吞.

Verify:
- URL = `/focus?bearish=only`
- If no limit-up stock today is also a bearish-engulfing stock (common case): both lists show empty-state. This is correct behavior — just note it.
- Click `[隱藏空吞]`: lists return to ~full size

- [ ] **Step 9: Mobile responsive check**

In browser devtools, switch to iPhone 12 viewport.

Verify:
- FilterBar wraps to multiple rows (flex-wrap working)
- All controls remain tappable
- Group chips wrap properly
- Sticky behavior works on scroll

- [ ] **Step 10: Final commit + push**

Verify clean state and push:

```bash
cd "C:/Users/pc/漲停族群分類" && git status
```

Expected: "nothing to commit, working tree clean"

```bash
git log --oneline -5
```

Expected: see the 3-4 commits from Tasks 1-4.

```bash
git push origin master
```

After Vercel auto-deploys (~2 min), verify live at https://limit-up-radar.vercel.app/focus with same checks (Steps 2-8).

---

## Self-Review Checklist (for plan author)

- [x] Spec section 3.1 (UI) → Task 2 (FilterBar component) + Task 3 step 3 (insertion point)
- [x] Spec section 3.2 (logic) → Task 2 `passesFilter`
- [x] Spec section 3.3 (URL sync) → Task 2 (helpers) + Task 3 step 2 (useEffect)
- [x] Spec section 3.4 (data layer) → Task 1
- [x] Spec section 3.5 (component split) → Tasks 2 + 3
- [x] Spec section 3.6 (empty states) → Task 3 steps 4 + 5
- [x] No placeholders / TBDs
- [x] Type consistency: `FilterState`, `passesFilter`, `paramsToFilter`, `filterToParams`, `DEFAULT_FILTER` used identically across Tasks 2 and 3
- [x] `FocusStock.isBearish` is optional (`?:`) in client interface, matching API where flag may be missing on older data
