"use client";

import { useEffect, useMemo, useState } from "react";
import { PARTS, STOCK_LOADOUT, itemKey, owns, paintColour, type Category, type Loadout, type PartCategory } from "./shop";
import { GARAGE_NAMES } from "./showroom";
import type { Profile } from "./store";
import { VEHICLES, type VehicleId } from "./vehicles";
import type { SiteStyle } from "./world";

const TABS: { id: Category; label: string }[] = [
  { id: "vehicle", label: "Rigs" },
  { id: "paint", label: "Paint" },
  { id: "tyres", label: "Tyres" },
  { id: "lights", label: "Lights" },
  { id: "snorkel", label: "Snorkel" },
  { id: "winter", label: "Winter" },
];

export const fmtMiles = (m: number) => (m < 10 ? (Math.floor(m * 10) / 10).toFixed(1) : Math.floor(m).toString());

type Row = { key: string; id: string; name: string; blurb: string; price: number; swatch?: string; stats?: number[] };

// Rigs compared on a 0–1 scale against the whole range.
const span = (f: (v: (typeof VEHICLES)[number]) => number) => {
  const all = VEHICLES.map(f);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return (v: (typeof VEHICLES)[number]) => 0.15 + (0.85 * (f(v) - lo)) / (hi - lo || 1);
};
const STATS = [
  { label: "Speed", of: span((v) => v.maxSpeed + v.accel) },
  { label: "Climb", of: span((v) => v.grip) },
  { label: "Clear", of: span((v) => v.clearance + v.travel) },
  { label: "Wade", of: span((v) => v.wade) },
];

function rowsFor(category: Category, vehicle: VehicleId): Row[] {
  if (category === "vehicle") {
    return VEHICLES.map((v) => ({
      key: itemKey("vehicle", v.id), id: v.id, name: v.name, blurb: v.blurb, price: v.price, stats: STATS.map((s) => s.of(v)),
    }));
  }
  return (PARTS[category] as readonly { id: string; name: string; blurb: string; price: number }[]).map((p) => ({
    key: itemKey(category, p.id), id: p.id, name: p.name, blurb: p.blurb, price: p.price,
    swatch: category === "paint" ? paintColour(vehicle, { ...STOCK_LOADOUT, paint: p.id }) : undefined,
  }));
}

/**
 * The garage shop. Miles you've driven are what you spend; everything you've bought
 * stays yours and fits any rig. Picking a row tries it on the truck in the showroom.
 */
export function GarageMenu({
  style, profile, online, onPreview, onBuy, onFit, onLeave,
}: {
  style: SiteStyle;
  profile: Profile;
  online: boolean;
  onPreview: (vehicle: VehicleId, loadout: Loadout) => void;
  onBuy: (key: string) => Promise<string | null>;
  onFit: (vehicle: VehicleId, loadout: Loadout) => void;
  onLeave: () => void;
}) {
  const vehicle = profile.vehicle ?? "bluff";
  /** Each tab opens on what's fitted now. */
  const fittedRow = (c: Category) =>
    Math.max(0, rowsFor(c, vehicle).findIndex((r) => r.id === (c === "vehicle" ? vehicle : profile.loadout[c as PartCategory])));
  const [tab, setTab] = useState(0);
  const [row, setRow] = useState(() => fittedRow(TABS[0].id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const category = TABS[tab].id;
  const rows = useMemo(() => rowsFor(category, vehicle), [category, vehicle]);

  // What the selected row would look like fitted: shown on the truck, not yet bought.
  const trial = (r: Row | undefined): [VehicleId, Loadout] => {
    if (!r) return [vehicle, profile.loadout];
    if (category === "vehicle") return [r.id as VehicleId, profile.loadout];
    return [vehicle, { ...profile.loadout, [category as PartCategory]: r.id }];
  };
  const fitted = (r: Row) => (category === "vehicle" ? vehicle === r.id : profile.loadout[category as PartCategory] === r.id);

  useEffect(() => {
    const [v, l] = trial(rows[row]);
    onPreview(v, l);
    // Only when the selection moves; trying on is cheap but not free.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, row]);

  function switchTab(i: number) {
    setTab(i);
    setRow(fittedRow(TABS[i].id));
    setError(null);
  }

  async function choose(i: number) {
    const r = rows[i];
    if (!r || busy) return;
    setRow(i);
    setError(null);
    if (!owns(profile, r.key)) {
      if (profile.balance < r.price) return setError(`${fmtMiles(r.price - profile.balance)} more miles to go.`);
      setBusy(true);
      const err = await onBuy(r.key);
      setBusy(false);
      if (err) return setError(err);
    }
    const [v, l] = trial(r);
    onFit(v, l);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The E that opened the garage may still be held down; ignore its repeats.
      if (e.repeat) return;
      const k = e.key;
      if (k === "Escape" || k === "e" || k === "E") onLeave();
      else if (k === "ArrowLeft" || k === "a" || k === "A") switchTab((tab + TABS.length - 1) % TABS.length);
      else if (k === "ArrowRight" || k === "d" || k === "D") switchTab((tab + 1) % TABS.length);
      else if (k === "ArrowUp" || k === "w" || k === "W") setRow((r) => Math.max(0, r - 1));
      else if (k === "ArrowDown" || k === "s" || k === "S") setRow((r) => Math.min(rows.length - 1, r + 1));
      else if (k === "Enter" || k === " ") void choose(row);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="pointer-events-auto absolute inset-x-3 bottom-3 flex max-h-[60dvh] flex-col rounded-2xl border border-white/10 bg-[rgba(24,20,17,0.8)] p-4 text-[rgba(255,246,232,0.86)] shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-auto sm:right-5 sm:top-5 sm:max-h-[calc(100dvh-2.5rem)] sm:w-[380px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{GARAGE_NAMES[style]}</h2>
        <span className="text-sm font-medium text-[rgba(255,246,232,0.85)]">{fmtMiles(profile.balance)} mi</span>
      </div>
      <p className="mt-0.5 text-xs text-[rgba(255,246,232,0.5)]">
        Spend the miles you drive. {online ? "Saved to your account." : "Single player: gone when you leave."}
      </p>

      <div className="mt-3 grid grid-cols-6 gap-1 rounded-lg bg-black/25 p-1 text-[13px]" role="tablist">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={i === tab}
            onClick={() => switchTab(i)}
            className={`rounded-md px-1 py-1.5 transition-colors ${i === tab ? "bg-[rgba(255,246,232,0.14)] text-[rgba(255,246,232,0.95)]" : "text-[rgba(255,246,232,0.55)] hover:text-[rgba(255,246,232,0.8)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ul className="mt-3 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {rows.map((r, i) => {
          const have = owns(profile, r.key);
          const on = fitted(r);
          const short = !have && profile.balance < r.price;
          return (
            <li key={r.key}>
              <button
                onClick={() => void choose(i)}
                onMouseEnter={() => setRow(i)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] ${
                  i === row ? "border-[rgba(255,246,232,0.28)] bg-white/[0.06]" : "border-transparent"
                }`}
              >
                {r.swatch !== undefined ? (
                  <span className="h-7 w-7 shrink-0 rounded-full border border-white/25" style={{ backgroundColor: r.swatch }} />
                ) : null}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{r.name}</span>
                  <span className="block text-xs text-[rgba(255,246,232,0.5)]">{r.blurb}</span>
                  {r.stats && i === row && (
                    <span className="mt-1.5 grid grid-cols-4 gap-2">
                      {r.stats.map((s, k) => (
                        <span key={k} className="block">
                          <span className="block text-[10px] uppercase tracking-wide text-[rgba(255,246,232,0.4)]">{STATS[k].label}</span>
                          <span className="mt-0.5 block h-1 rounded-full bg-white/10">
                            <span className="block h-1 rounded-full bg-[rgba(255,246,232,0.6)]" style={{ width: `${s * 100}%` }} />
                          </span>
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 text-xs ${short ? "text-[rgba(255,246,232,0.35)]" : "text-[rgba(255,246,232,0.7)]"}`}>
                  {on ? (category === "vehicle" ? "Driving" : "Fitted") : have ? (category === "vehicle" ? "Drive" : "Fit") : `${fmtMiles(r.price)} mi`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-2 text-xs text-[rgba(255,210,170,0.9)]">{error}</p>}

      <div className="mt-3 flex items-center justify-between">
        <span className="hidden text-[11px] text-[rgba(255,246,232,0.4)] sm:block">← → tabs · ↑ ↓ choose · Enter buy or fit</span>
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
