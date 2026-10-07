"use client";

import { useEffect, useState } from "react";
import { GARAGE_NAMES } from "./showroom";
import { CATALOGUE, TIER_MILES, tierAt, type Category, type Loadout, type Paint } from "./upgrades";
import type { SiteStyle } from "./world";

const TABS: { id: Category; label: string }[] = [
  { id: "paint", label: "Paint" },
  { id: "tyres", label: "Tyres" },
  { id: "lights", label: "Lights" },
  { id: "snorkel", label: "Snorkel" },
];

const miles = (m: number) => (m < 10 ? m.toFixed(1) : Math.round(m).toString());

/** The garage: pick parts for the truck. Locked parts show how far you still have to drive. */
export function GarageMenu({
  style, driven, loadout, onFit, onLeave,
}: {
  style: SiteStyle;
  driven: number;
  loadout: Loadout;
  onFit: (category: Category, id: string) => void;
  onLeave: () => void;
}) {
  const [tab, setTab] = useState(0);
  const [row, setRow] = useState(0);
  const category = TABS[tab].id;
  const items = CATALOGUE[category];
  const tier = tierAt(driven);
  const next = TIER_MILES.find((m) => m > driven);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The E that opened the garage may still be held down; ignore its repeats.
      if (e.repeat) return;
      const k = e.key;
      if (k === "Escape" || k === "e" || k === "E") onLeave();
      else if (k === "ArrowLeft" || k === "a" || k === "A") {
        setTab((t) => (t + TABS.length - 1) % TABS.length);
        setRow(0);
      } else if (k === "ArrowRight" || k === "d" || k === "D") {
        setTab((t) => (t + 1) % TABS.length);
        setRow(0);
      } else if (k === "ArrowUp" || k === "w" || k === "W") setRow((r) => Math.max(0, r - 1));
      else if (k === "ArrowDown" || k === "s" || k === "S") setRow((r) => Math.min(items.length - 1, r + 1));
      else if (k === "Enter" || k === " ") {
        const item = items[row];
        if (item && item.tier <= tier) onFit(category, item.id);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, row, tier, category, onFit, onLeave]);

  return (
    <div className="pointer-events-auto absolute inset-x-3 bottom-3 flex max-h-[58dvh] flex-col rounded-2xl border border-white/10 bg-[rgba(24,20,17,0.78)] p-4 text-[rgba(255,246,232,0.86)] shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-5 sm:max-h-[calc(100dvh-2.5rem)] sm:w-[360px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{GARAGE_NAMES[style]}</h2>
        <span className="text-xs text-[rgba(255,246,232,0.5)]">{miles(driven)} mi</span>
      </div>
      <p className="mt-0.5 text-xs text-[rgba(255,246,232,0.5)]">
        {next === undefined ? "Everything's unlocked." : `Next parts unlock at ${next} mi driven.`}
      </p>

      <div className="mt-3 flex gap-1 rounded-lg bg-black/25 p-1 text-sm" role="tablist">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={i === tab}
            onClick={() => {
              setTab(i);
              setRow(0);
            }}
            className={`flex-1 rounded-md px-2 py-1.5 transition-colors ${i === tab ? "bg-[rgba(255,246,232,0.14)] text-[rgba(255,246,232,0.95)]" : "text-[rgba(255,246,232,0.55)] hover:text-[rgba(255,246,232,0.8)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ul className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {items.map((item, i) => {
          const fitted = loadout[category] === item.id;
          const locked = item.tier > tier;
          const colour = category === "paint" ? (item as Paint).color : undefined;
          return (
            <li key={item.id}>
              <button
                disabled={locked}
                onClick={() => {
                  setRow(i);
                  onFit(category, item.id);
                }}
                onMouseEnter={() => setRow(i)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  i === row ? "border-[rgba(255,246,232,0.28)] bg-white/[0.06]" : "border-transparent"
                } ${locked ? "cursor-default opacity-45" : "hover:bg-white/[0.06]"}`}
              >
                {colour ? (
                  <span className="h-7 w-7 shrink-0 rounded-full border border-white/25" style={{ backgroundColor: colour }} />
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] text-[rgba(255,246,232,0.6)]">
                    {item.tier === 0 ? "—" : `T${item.tier}`}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="block truncate text-xs text-[rgba(255,246,232,0.5)]">{item.blurb}</span>
                </span>
                <span className="shrink-0 text-xs text-[rgba(255,246,232,0.6)]">
                  {fitted ? "Fitted" : locked ? `${TIER_MILES[item.tier]} mi` : "Fit"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between">
        <span className="hidden text-[11px] text-[rgba(255,246,232,0.4)] sm:block">← → tabs · ↑ ↓ choose · Enter fit</span>
        <button
          onClick={onLeave}
          className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-[rgba(255,246,232,0.85)] hover:bg-white/10"
        >
          Drive out <span className="text-[rgba(255,246,232,0.45)]">· Esc</span>
        </button>
      </div>
    </div>
  );
}
