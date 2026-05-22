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
      <div role="group" aria-label={props.label} className="inline-flex bg-bg-2 border border-border rounded-md p-0.5">
        {props.options.map((opt) => {
          const active = opt.value === props.value;
          return (
            <button
              key={String(opt.value)}
              onClick={() => props.onChange(opt.value)}
              aria-pressed={active}
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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
          aria-expanded={open}
          aria-haspopup="listbox"
          className="px-2.5 py-1 text-[11px] bg-bg-2 border border-border rounded text-txt-3 hover:text-txt-1 disabled:opacity-40"
        >
          {remaining.length === 0 ? "已全選" : "+ 選擇族群 ▾"}
        </button>
        {open && remaining.length > 0 && (
          <div role="listbox" className="absolute top-full left-0 mt-1 z-20 min-w-[180px] max-h-[300px] overflow-y-auto bg-bg-1 border border-border rounded-md shadow-lg py-1">
            {remaining.map((g) => (
              <button
                key={g}
                role="option"
                aria-selected={false}
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
