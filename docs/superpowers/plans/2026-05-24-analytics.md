# Vercel Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add Vercel Web Analytics + Speed Insights site-wide, plus custom `stock_view` events on `/focus` stock clicks.

**Architecture:** `@vercel/analytics` + `@vercel/speed-insights` components in `layout.tsx` for page views. A `TrackedStockLink` client component wraps `next/link` and fires `track('stock_view', ...)` on click, used in both `/focus` lists.

**Tech Stack:** Next.js 16 App Router, Vercel Analytics SDK.

**Spec:** `docs/superpowers/specs/2026-05-24-analytics-design.md`

**Note:** No test framework. `track()` only sends in production; locally verify build only. Post-deploy verify via DevTools Network beacons.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add `@vercel/analytics`, `@vercel/speed-insights` deps |
| `src/app/layout.tsx` | Modify | Render `<Analytics />` + `<SpeedInsights />` in body |
| `src/app/focus/_tracked-link.tsx` | Create | `TrackedStockLink` client wrapper firing stock_view |
| `src/app/focus/_client.tsx` | Modify | Replace stock `<Link>` with `<TrackedStockLink>` in both lists |

---

## Task 1: Install packages + wire layout

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Install packages**

```bash
cd "C:/Users/pc/漲停族群分類" && npm install @vercel/analytics @vercel/speed-insights
```
Expected: both added to dependencies, no peer warnings that block.

- [ ] **Step 2: Add imports + components to layout**

In `src/app/layout.tsx`, add these imports after the existing top imports (after line 2 `import "@/styles/globals.css";`):

```tsx
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
```

Then find:
```tsx
      <body className="font-sans antialiased">{children}</body>
```

Replace with:
```tsx
      <body className="font-sans antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
```

- [ ] **Step 3: Build check**

```bash
cd "C:/Users/pc/漲停族群分類" && npm run build 2>&1 | tail -15
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/pc/漲停族群分類" && git add package.json package-lock.json src/app/layout.tsx && git commit -m "feat(analytics): add Vercel Analytics + Speed Insights site-wide"
```

---

## Task 2: TrackedStockLink component + wire into /focus

**Files:**
- Create: `src/app/focus/_tracked-link.tsx`
- Modify: `src/app/focus/_client.tsx`

- [ ] **Step 1: Create the component**

Create `C:/Users/pc/漲停族群分類/src/app/focus/_tracked-link.tsx`:

```tsx
"use client";

import Link from "next/link";
import { track } from "@vercel/analytics";

export function TrackedStockLink(props: {
  code: string;
  name: string;
  source: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/stock/${props.code}`}
      className={props.className}
      onClick={() =>
        track("stock_view", { code: props.code, name: props.name, source: props.source })
      }
    >
      {props.children}
    </Link>
  );
}
```

- [ ] **Step 2: Import in _client.tsx**

In `src/app/focus/_client.tsx`, add after the `./_heatmap` import line:

```tsx
import { TrackedStockLink } from "./_tracked-link";
```

- [ ] **Step 3: Replace topPicks Link**

Find the topPicks card link (the outer `<Link>` wrapping each pick). It looks like:

```tsx
                    <Link
                      key={s.code}
                      href={`/stock/${s.code}`}
                      className="block bg-bg-2/50 border border-border/50 rounded-lg p-4 hover:border-border-hover hover:bg-bg-2 transition-all"
                    >
```

and its matching closing `</Link>`. Replace the opening tag with:

```tsx
                    <TrackedStockLink
                      key={s.code}
                      code={s.code}
                      name={s.name}
                      source="top_pick"
                      className="block bg-bg-2/50 border border-border/50 rounded-lg p-4 hover:border-border-hover hover:bg-bg-2 transition-all"
                    >
```

And change its matching closing `</Link>` (the one that closes this pick card — it's right before the `))}` of the topPicks `.map`) to `</TrackedStockLink>`.

**To identify the correct closing tag:** it is the `</Link>` immediately before `                  ))}` that ends the `filteredTopPicks.map((s) => (` block. Be careful not to change other `</Link>` tags.

- [ ] **Step 4: Replace full-list Link**

Find the full-list table row link:

```tsx
                        <td className="px-3 py-1.5">
                          <Link href={`/stock/${s.code}`} className="hover:underline">
                            <span className="font-mono text-txt-2">{s.code}</span>
                            <span className="ml-1.5 text-txt-1">{s.name}</span>
                          </Link>
                        </td>
```

Replace with:

```tsx
                        <td className="px-3 py-1.5">
                          <TrackedStockLink code={s.code} name={s.name} source="full_list" className="hover:underline">
                            <span className="font-mono text-txt-2">{s.code}</span>
                            <span className="ml-1.5 text-txt-1">{s.name}</span>
                          </TrackedStockLink>
                        </td>
```

- [ ] **Step 5: TypeScript + build check**

```bash
cd "C:/Users/pc/漲停族群分類" && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors. (If there are unbalanced-tag errors, the closing `</Link>`→`</TrackedStockLink>` swap in Step 3 was wrong — fix it.)

```bash
cd "C:/Users/pc/漲停族群分類" && npm run build 2>&1 | tail -15
```
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/pc/漲停族群分類" && git add src/app/focus/_tracked-link.tsx src/app/focus/_client.tsx && git commit -m "feat(focus): track stock_view custom events on click

- TrackedStockLink wraps next/link + fires Vercel Analytics event
- Applied to top picks (source=top_pick) and full list (source=full_list)"
```

---

## Task 3: Deploy + verify beacons

**Files:** none

- [ ] **Step 1: Push**

```bash
cd "C:/Users/pc/漲停族群分類" && git push origin master 2>&1 | tail -3
```
(If push rejected: `git pull --rebase origin master` then push again.)

- [ ] **Step 2: Wait for deploy + verify analytics endpoint live**

Poll until the deployed page serves the insights script:
```bash
until curl -s "https://limit-up-radar.vercel.app/_vercel/insights/script.js" -o /dev/null -w "%{http_code}" | grep -q 200; do sleep 15; done; echo "insights script live"
```
Expected: `insights script live` (the `/_vercel/insights/script.js` route is injected by Vercel when Analytics is enabled on the deployment).

- [ ] **Step 3: Confirm focus page still 200**

```bash
curl -s -o /dev/null -w "focus %{http_code}\n" "https://limit-up-radar.vercel.app/focus"
```
Expected: `focus 200`.

- [ ] **Step 4: Note for user**

Page-view + event data appears in Vercel Dashboard → project → Analytics tab after ~24h of real traffic. The `stock_view` events show under Custom Events with `code` / `name` / `source` breakdowns. Speed Insights appears under the Speed Insights tab.

---

## Self-Review Checklist

- [x] Spec 3.1 (install) → Task 1 Step 1
- [x] Spec 3.2 (PV tracking) → Task 1 Steps 2-3
- [x] Spec 3.3 (stock click) → Task 2
- [x] Spec 3.4 (group tracking explicitly OUT of scope) → not implemented, correct
- [x] Spec 3.5 (verification) → Task 3
- [x] No placeholders
- [x] Type consistency: `TrackedStockLink` props (code/name/source/className/children) identical in component def and both call sites
- [x] Closing-tag swap risk called out explicitly in Task 2 Step 3
