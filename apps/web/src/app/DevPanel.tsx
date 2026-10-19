"use client";

import { useEffect, useState } from "react";
import type { DevSpot } from "./dev";
import { frameLines, type FrameStats } from "./Panels";
import { METRES_PER_MILE, PARTS, type Loadout, type PartCategory } from "./shop";
import type { WorldId } from "./terrain";
import { VEHICLES, type VehicleId } from "./vehicles";
import { WORLDS } from "./worlds";

/**
 * The dev panel: for building and testing the game without signing in. Development
 * builds only (`pnpm dev`), never on gilbyy.com, and only in single player, where nothing
 * is saved: it can put you in any world and anywhere in it, fit any rig, set the clock
 * and the tide, show what the truck runs into, and let it get hung up on a rock as it
 * would signed in. It tells the frame rate too, as `?fps` does on any build, signed in or
 * not. The backtick key opens and closes it. See docs/dev-panel.md.
 */

/** What the panel shows about the truck and the ground under it, a few times a second. */
export type DevInfo = {
  world: WorldId;
  x: number;
  z: number;
  heading: number;
  /** The ground under the truck, and the water over that ground (0 on dry land). */
  ground: number;
  depth: number;
  /** How deep the rig fitted now can wade. */
  wade: number;
  paved: boolean;
  slip: number;
  /** Metres a second, and the rig's top speed on what's under it. */
  speed: number;
  /** How far the nearest thing it could run into is from the truck's middle, past that thing's edge, and what it is. */
  nearest: { gap: number; what: string } | null;
  stuck: boolean;
  hour: number;
  tide: "live" | "low" | "high";
  /** The frame rate, as `?fps` shows it; null until there are frames to tell of. */
  frames: FrameStats | null;
};

/** Something "Check this world" found wrong, and where, to jump to. */
export type DevFinding = { what: string; x: number; z: number; heading: number };

/** What the panel can ask the game to do. Each resolves to why not, or null once it's done. */
export type DevControls = {
  /** Why the panel can't be used just now (signed in), or null. */
  blocked(): string | null;
  info(): DevInfo;
  /** The places to jump to in the world the truck is in. */
  spots(): { world: WorldId; list: DevSpot[] };
  go(world: WorldId): Promise<string | null>;
  jump(spot: { x: number; z: number; heading: number }): string | null;
  fit(v: VehicleId, l: Loadout): Promise<string | null>;
  hour(h: number): void;
  tide(t: DevInfo["tide"]): void;
  miles(n: number): void;
  clearFog(): void;
  findAll(): void;
  colliders(on: boolean): void;
  stuck(on: boolean): void;
  /**
   * Sweeps the world the truck is in, as built, every model's colliders in: every place
   * the game puts a truck down has room for every rig, and a bot can drive every course
   * (dev.ts). Tells `progress` how far through the courses it is.
   */
  check(progress: (done: number, of: number) => void): Promise<DevFinding[] | string>;
};

const ORDER: PartCategory[] = ["paint", "tyres", "lights", "snorkel", "winter", "winch"];
const box = "pointer-events-auto rounded-xl border border-white/10 bg-[rgba(24,20,17,0.86)] p-3 text-[12px] leading-snug text-[rgba(255,246,232,0.88)] shadow-2xl backdrop-blur-md";
const button = "rounded-full border border-white/20 px-2.5 py-1 text-[11px] text-[rgba(255,246,232,0.9)] transition-colors hover:bg-white/10 disabled:opacity-40";
const select = "w-full rounded-md border border-white/15 bg-black/40 px-1.5 py-1 text-[11px] text-[rgba(255,246,232,0.95)] outline-none focus:border-white/35";
const label = "text-[10px] uppercase tracking-[0.14em] text-[rgba(255,246,232,0.5)]";

const MPH = 3600 / METRES_PER_MILE;
const clock = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;

/** Keeps the arrows for driving: a select or a slider left focused would take them. */
const letGo = (e: { currentTarget: HTMLElement }) => e.currentTarget.blur();

export function DevPanel({ dev, vehicle, loadout, onClose }: { dev: DevControls; vehicle: VehicleId | null; loadout: Loadout; onClose: () => void }) {
  const [info, setInfo] = useState<DevInfo>(() => dev.info());
  const [spots, setSpots] = useState(() => dev.spots());
  const [said, setSaid] = useState<string | null>(null);
  const [colliders, setColliders] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The sweep: how far through it is while it runs, and what it found. */
  const [checking, setChecking] = useState<string | null>(null);
  const [findings, setFindings] = useState<{ world: WorldId; list: DevFinding[] } | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => {
      const now = dev.info();
      setInfo(now);
      // A world's places, again whenever the truck is in another one, by the panel or a trip.
      setSpots((s) => (s.world === now.world ? s : dev.spots()));
    }, 250);
    return () => window.clearInterval(t);
  }, [dev]);
  // Put away with the panel: nobody should forget the drums are up, or that rocks catch.
  useEffect(() => () => {
    dev.colliders(false);
    dev.stuck(false);
  }, [dev]);

  const blocked = dev.blocked();
  const tell = (err: string | null) => setSaid(err);
  const rig = vehicle ?? "bluff";

  return (
    <div className="pointer-events-none absolute left-3 top-12 z-20 w-[min(19rem,calc(100vw-1.5rem))]" data-dev-panel>
      <div className={`${box} max-h-[calc(100dvh-4.5rem)] overflow-y-auto`}>
        <div className="flex items-center justify-between">
          <b className="font-semibold">Dev panel</b>
          <button className="text-[11px] text-[rgba(255,246,232,0.55)] hover:text-[rgba(255,246,232,0.9)]" onClick={onClose}>
            ` to close
          </button>
        </div>

        {/* Only reading, so signed in too. A dev build's frame rate isn't a production build's: gilbyy.com/?fps is the one to trust. */}
        {info.frames && (
          <p className="mt-2 font-mono text-[11px] tabular-nums text-[rgba(255,246,232,0.78)]">
            {frameLines(info.frames).map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </p>
        )}

        {blocked ? (
          <p className="mt-2 text-[rgba(255,246,232,0.7)]">{blocked}</p>
        ) : (
          <>
            <p className="mt-2 font-mono text-[11px] tabular-nums text-[rgba(255,246,232,0.78)]">
              {WORLDS[info.world].name} · x {info.x.toFixed(0)} z {info.z.toFixed(0)} · {((((info.heading * 180) / Math.PI) % 360 + 360) % 360).toFixed(0)}°
              <br />
              ground {info.ground.toFixed(1)} m · {info.depth > 0 ? `water ${info.depth.toFixed(2)} of ${info.wade.toFixed(2)} m` : "dry"}
              {info.paved ? " · paved" : ""}
              {info.slip > 0 ? ` · slip ${info.slip.toFixed(2)}` : ""}
              <br />
              {(Math.abs(info.speed) * MPH).toFixed(0)} mph · {clock(info.hour)}
              {info.nearest ? ` · ${info.nearest.what} ${info.nearest.gap.toFixed(1)} m` : ""}
              {info.stuck ? " · STUCK" : ""}
            </p>

            <p className={`${label} mt-3`}>World</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(Object.keys(WORLDS) as WorldId[]).map((w) => (
                <button
                  key={w}
                  disabled={busy || w === info.world}
                  className={`${button} ${w === info.world ? "bg-white/15" : ""}`}
                  onClick={(e) => {
                    letGo(e);
                    setBusy(true);
                    void dev.go(w).then((err) => {
                      setBusy(false);
                      tell(err);
                    });
                  }}
                >
                  {WORLDS[w].name}
                </button>
              ))}
            </div>

            <p className={`${label} mt-3`}>Go to · or shift-click the open map</p>
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-white/10">
              {spots.list.map((s, i) => (
                <li key={`${s.name}-${i}`}>
                  <button
                    className="w-full px-2 py-1 text-left text-[11px] hover:bg-white/10"
                    onClick={(e) => {
                      letGo(e);
                      tell(dev.jump(s));
                    }}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>

            <p className={`${label} mt-3`}>Rig · everything is yours</p>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <select
                className={`${select} col-span-2`}
                value={rig}
                onChange={(e) => {
                  letGo(e);
                  void dev.fit(e.target.value as VehicleId, loadout).then(tell);
                }}
              >
                {VEHICLES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.only ? ` (${WORLDS[v.only].name} only)` : ""}
                  </option>
                ))}
              </select>
              {ORDER.map((cat) => (
                <select
                  key={cat}
                  aria-label={cat}
                  className={select}
                  value={loadout[cat]}
                  onChange={(e) => {
                    letGo(e);
                    void dev.fit(rig, { ...loadout, [cat]: e.target.value }).then(tell);
                  }}
                >
                  {(PARTS[cat] as readonly { id: string; name: string }[]).map((u) => (
                    <option key={u.id} value={u.id}>
                      {cat}: {u.name}
                    </option>
                  ))}
                </select>
              ))}
            </div>

            <p className={`${label} mt-3`}>Time {clock(info.hour)}</p>
            <input
              type="range"
              min={0}
              max={23.75}
              step={0.25}
              value={info.hour}
              onChange={(e) => dev.hour(Number(e.target.value))}
              onPointerUp={letGo}
              className="mt-1 w-full accent-[rgba(255,246,232,0.8)]"
            />
            {info.world === "island" && (
              <>
                <p className={`${label} mt-2`}>Tide</p>
                <div className="mt-1 flex gap-1">
                  {(["live", "low", "high"] as const).map((t) => (
                    <button
                      key={t}
                      className={`${button} ${info.tide === t ? "bg-white/15" : ""}`}
                      onClick={(e) => {
                        letGo(e);
                        dev.tide(t);
                      }}
                    >
                      {t === "live" ? "comes and goes" : `held ${t}`}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="mt-3 flex flex-wrap gap-1">
              {[
                { name: "+1,000 mi", act: () => dev.miles(1000) },
                { name: "Clear the fog", act: () => dev.clearFog() },
                { name: "Find every place", act: () => dev.findAll() },
              ].map((b) => (
                <button
                  key={b.name}
                  className={button}
                  onClick={(e) => {
                    letGo(e);
                    b.act();
                  }}
                >
                  {b.name}
                </button>
              ))}
            </div>

            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={colliders}
                onChange={(e) => {
                  letGo(e);
                  setColliders(e.target.checked);
                  dev.colliders(e.target.checked);
                }}
              />
              Show what the truck runs into
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={stuck}
                onChange={(e) => {
                  letGo(e);
                  setStuck(e.target.checked);
                  dev.stuck(e.target.checked);
                }}
              />
              Rocks can catch the truck, as signed in
            </label>

            <button
              className={`${button} mt-3`}
              onClick={() => {
                const q = new URLSearchParams({ net: "local", world: info.world, rig: "bluff", miles: "1000" });
                window.open(`${window.location.pathname}?${q}`, "_blank");
                if (new URLSearchParams(window.location.search).get("net") !== "local") window.location.search = `?${q}`;
              }}
            >
              Two drivers, in two tabs ↗
            </button>
            <p className="mt-1 text-[10px] text-[rgba(255,246,232,0.5)]">
              For friends, chat, convoys, races, the winch and BBB: both tabs play as drivers in this browser, with no account.
            </p>

            <div className="mt-3 border-t border-white/10 pt-3">
              <button
                disabled={checking !== null}
                className={button}
                onClick={(e) => {
                  letGo(e);
                  const world = info.world;
                  setFindings(null);
                  setChecking("Checking where trucks are put down…");
                  void dev.check((done, of) => setChecking(`The bot is driving course ${Math.min(done + 1, of)} of ${of}…`)).then((list) => {
                    setChecking(null);
                    if (typeof list === "string") tell(list);
                    else setFindings({ world, list });
                  });
                }}
              >
                Check this world
              </button>
              <p className="mt-1 text-[10px] text-[rgba(255,246,232,0.5)]">
                Every place a truck is put down has room for every rig, and a bot drives every course start to finish.
              </p>
              {checking && <p className="mt-1 text-[rgba(255,246,232,0.7)]">{checking}</p>}
              {findings && findings.world === info.world && (
                findings.list.length === 0 ? (
                  <p className="mt-1 text-[rgba(168,222,150,0.95)]">Checked {WORLDS[findings.world].name}: nothing wrong.</p>
                ) : (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-white/10">
                    {findings.list.map((f, i) => (
                      <li key={i}>
                        <button
                          className="w-full px-2 py-1 text-left text-[11px] text-[rgba(255,211,107,0.95)] hover:bg-white/10"
                          onClick={(e) => {
                            letGo(e);
                            tell(dev.jump(f));
                          }}
                        >
                          {f.what}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>

            {said && <p className="mt-2 text-[rgba(255,211,107,0.95)]">{said}</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** The way into the panel on a screen with no keyboard. */
export function DevChip({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="absolute left-[5.25rem] top-[1.15rem] z-20 rounded-full border border-white/20 bg-black/25 px-2 py-0.5 text-[10px] text-[rgba(255,246,232,0.6)] backdrop-blur">
      dev
    </button>
  );
}
