"use client";

import { useEffect, useRef, useState } from "react";
import { secondsUntil } from "./daylight";
import { GarageMenu } from "./GarageMenu";
import { createMap } from "./map";
import { makeCar, noInput, step, RIDE, type Input } from "./physics";
import { createView, type Garage } from "./scene";
import { GARAGE_NAMES } from "./showroom";
import { trainObstacles } from "./track";
import {
  METRES_PER_MILE, loadProgress, saveProgress, specFor, tierAt, type Category, type Loadout,
} from "./upgrades";
import { buildWorld, START, type Ground, type Obstacle, type SiteStyle } from "./world";

/** Physics runs at a fixed rate, independent of the display's refresh rate. */
const STEP = 1 / 120;
const ENTER_TIME = 2.3;
const LEAVE_TIME = 2.4;

const COMPASS = ["N", "·", "NE", "·", "E", "·", "SE", "·", "S", "·", "SW", "·", "W", "·", "NW", "·"];
const COMPASS_ITEM = 28;
const COMPASS_VIEW = COMPASS_ITEM * 8;

type Mode = "drive" | "entering" | "garage" | "leaving" | "map";
type Actions = { enter(): void; leave(): void; toggleMap(): void; fit(category: Category, id: string): void };
const noop = () => {};

const smooth = (lo: number, hi: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
const turnToward = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
const fmtMiles = (m: number) => (m < 10 ? m.toFixed(1) : Math.round(m).toString());

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const fullRef = useRef<HTMLCanvasElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<Input>(noInput());
  const modeRef = useRef<Mode>("drive");
  /** Things the UI asks the game loop to do; the loop owns all the state. */
  const actions = useRef<Actions>({ enter: noop, leave: noop, toggleMap: noop, fit: noop });
  const turnRef = useRef(0);

  const [mode, setMode] = useState<Mode>("drive");
  const [ready, setReady] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [near, setNear] = useState<SiteStyle | null>(null);
  const [miles, setMiles] = useState(0);
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [garageStyle, setGarageStyle] = useState<SiteStyle>("workshop");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const world = buildWorld();
    const progress = loadProgress();
    let spec = specFor(progress.loadout);
    const car = makeCar(world, START.x, START.z, START.heading);
    let view: ReturnType<typeof createView>;
    try {
      view = createView(canvas, world, progress.loadout);
    } catch {
      return; // No WebGL. The fog-coloured backdrop is all there is to see.
    }
    const map = createMap(world);

    // For checking things by screenshot: ?hour=22 starts the clock there, ?garage=2 parks
    // you at a garage's door. Not linked from anywhere.
    const params = new URLSearchParams(window.location.search);
    const startHour = Number(params.get("hour"));
    const startGarage = view.garages[Number(params.get("garage"))];

    // The physics sees the train as moving obstacles on top of the static world.
    let trainNear: Obstacle[] = [];
    const ground: Ground = {
      height: world.height,
      waterAt: world.waterAt,
      limit: world.limit,
      obstaclesNear: (x, z) => {
        const still = world.obstaclesNear(x, z);
        const moving = trainNear.filter((o) => Math.abs(o.x - x) < 24 && Math.abs(o.z - z) < 24);
        return moving.length ? [...still, ...moving] : still;
      },
    };

    const setModeBoth = (m: Mode) => {
      modeRef.current = m;
      setMode(m);
    };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let time = params.has("hour") && Number.isFinite(startHour) ? secondsUntil(startHour) : 0;
    let first = true;
    let lastDistance = 0;
    let lastSave = 0;
    let shownMiles = -1;
    let nearIndex = -1;
    let cut = { garage: -1, t: 0, from: { x: 0, z: 0, heading: 0 } };
    let toastTimer = 0;

    const say = (msg: string) => {
      setToast(msg);
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(null), 5000);
    };

    const sizeCanvas = (c: HTMLCanvasElement | null) => {
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
    };
    const resize = () => {
      view.resize();
      sizeCanvas(miniRef.current);
      sizeCanvas(fullRef.current);
    };
    resize();
    window.addEventListener("resize", resize);

    actions.current.enter = () => {
      if (modeRef.current !== "drive" || nearIndex < 0) return;
      inputRef.current = noInput();
      cut = { garage: nearIndex, t: 0, from: { x: car.x, z: car.z, heading: car.heading } };
      setNear(null);
      setModeBoth("entering");
    };
    actions.current.leave = () => {
      if (modeRef.current !== "garage") return;
      cut.t = 0;
      view.snapCamera();
      saveProgress(progress);
      setModeBoth("leaving");
    };
    actions.current.toggleMap = () => {
      if (modeRef.current === "drive") {
        inputRef.current = noInput();
        setModeBoth("map");
        requestAnimationFrame(() => sizeCanvas(fullRef.current));
      } else if (modeRef.current === "map") setModeBoth("drive");
    };
    actions.current.fit = (category, id) => {
      progress.loadout = { ...progress.loadout, [category]: id };
      spec = specFor(progress.loadout);
      view.setLoadout(progress.loadout);
      setLoadout(progress.loadout);
      saveProgress(progress);
    };

    const keyMap: Record<string, keyof Input> = {
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
      ArrowUp: "gas", w: "gas", W: "gas",
      ArrowDown: "brake", s: "brake", S: "brake",
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const m = modeRef.current;
      if (m === "garage") return; // The menu has its own keys.
      if ((e.key === "m" || e.key === "M") && !e.repeat) {
        actions.current.toggleMap();
        e.preventDefault();
        return;
      }
      if (m === "map" && e.key === "Escape") {
        actions.current.toggleMap();
        return;
      }
      if ((e.key === "e" || e.key === "E" || e.key === "Enter") && !e.repeat && m === "drive") {
        actions.current.enter();
        e.preventDefault();
        return;
      }
      const control = keyMap[e.key];
      if (!control) return;
      e.preventDefault();
      if (m !== "drive") return;
      inputRef.current[control] = true;
      setShowHint(false);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const control = keyMap[e.key];
      if (control) inputRef.current[control] = false;
    };
    const onBlur = () => (inputRef.current = noInput());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    const placeOnGround = (x: number, z: number, heading: number, sink: number) => {
      car.x = x;
      car.z = z;
      car.heading = heading;
      car.y = world.height(x, z) + RIDE + spec.lift - sink;
      car.vy = 0;
      car.pitch = car.roll = car.pitchV = car.rollV = 0;
      car.steer = 0;
      car.grounded = true;
      car.groundY = world.height(x, z);
    };

    if (params.has("garage") && startGarage) {
      placeOnGround(startGarage.approach.x, startGarage.approach.z, startGarage.heading + Math.PI, 0);
    }

    /** The truck drives itself into the garage while the door opens, then the screen fades. */
    const animateEnter = (g: Garage, dt: number) => {
      cut.t += dt;
      const t = cut.t;
      view.setDoor(cut.garage, smooth(0, 1, t));
      const u = smooth(0.45, 2.0, t);
      const { from } = cut;
      const bx = (1 - u) ** 2 * from.x + 2 * u * (1 - u) * g.approach.x + u * u * g.inside.x;
      const bz = (1 - u) ** 2 * from.z + 2 * u * (1 - u) * g.approach.z + u * u * g.inside.z;
      const px = car.x;
      const pz = car.z;
      const sink = g.sink * smooth(0.55, 1, u);
      placeOnGround(bx, bz, turnToward(from.heading, g.heading + Math.PI, Math.min(1, u * 1.8)), sink);
      if (g.sink) car.pitch = -0.25 * smooth(0.5, 0.7, u) * (1 - smooth(0.92, 1, u));
      car.speed = Math.hypot(car.x - px, car.z - pz) / Math.max(dt, 1e-3);
      if (fadeRef.current) fadeRef.current.style.opacity = String(smooth(1.4, ENTER_TIME, t));
      if (t >= ENTER_TIME) {
        view.openShowroom(g.style, progress.loadout);
        setGarageStyle(g.style);
        setModeBoth("garage");
      }
    };

    /** And back out again: fade in, roll out of the door (or up the ramp), the door shuts. */
    const animateLeave = (g: Garage, dt: number) => {
      cut.t += dt;
      const t = cut.t;
      const u = smooth(0.2, 1.7, t);
      view.setDoor(cut.garage, 1 - smooth(1.7, 2.4, t));
      const px = car.x;
      const pz = car.z;
      placeOnGround(g.inside.x + (g.approach.x - g.inside.x) * u, g.inside.z + (g.approach.z - g.inside.z) * u, g.heading, g.sink * (1 - smooth(0, 0.5, u)));
      if (g.sink) car.pitch = 0.22 * smooth(0, 0.15, u) * (1 - smooth(0.4, 0.6, u));
      car.speed = Math.hypot(car.x - px, car.z - pz) / Math.max(dt, 1e-3);
      if (fadeRef.current) fadeRef.current.style.opacity = String(1 - smooth(0, 0.7, t));
      if (t >= LEAVE_TIME) {
        car.speed = 2.5;
        lastDistance = car.distance;
        setModeBoth("drive");
      }
    };

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const m = modeRef.current;
      const garage = view.garages[cut.garage];

      if (m === "garage") {
        view.renderShowroom(dt, turnRef.current);
        turnRef.current = 0;
      } else if (m === "map") {
        const full = fullRef.current;
        const g = full?.getContext("2d");
        if (full && g) {
          const lead = view.trainCars()[0];
          const train = lead && map.explored(lead.x, lead.z) ? { x: lead.x, z: lead.z, heading: lead.yaw } : undefined;
          map.drawFull(g, full.width, car, train);
        }
      } else {
        time += dt;
        if (m === "drive") {
          trainNear = trainObstacles(view.trainCars());
          acc += dt;
          while (acc >= STEP) {
            step(car, inputRef.current, STEP, ground, spec);
            acc -= STEP;
          }
          // Odometer, unlocks and saving.
          const before = progress.miles;
          progress.miles += (car.distance - lastDistance) / METRES_PER_MILE;
          lastDistance = car.distance;
          if (tierAt(progress.miles) > tierAt(before)) say("New parts unlocked. Find a garage.");
          if (Math.floor(progress.miles * 10) !== shownMiles) {
            shownMiles = Math.floor(progress.miles * 10);
            setMiles(progress.miles);
          }
          if (time - lastSave > 5) {
            lastSave = time;
            saveProgress(progress);
          }

          // Close enough, and slow enough, to pull into a garage?
          let found = -1;
          view.garages.forEach((g, i) => {
            if (Math.hypot(car.x - g.approach.x, car.z - g.approach.z) < 7 && Math.abs(car.speed) < 5) found = i;
          });
          if (found !== nearIndex) {
            nearIndex = found;
            setNear(found >= 0 ? view.garages[found].style : null);
          }
        } else if (m === "entering" && garage) animateEnter(garage, dt);
        else if (m === "leaving" && garage) animateLeave(garage, dt);

        map.reveal(car.x, car.z);
        view.render(car, dt, time, spec);

        const mini = miniRef.current;
        const g = mini?.getContext("2d");
        if (mini && g) {
          const lead = view.trainCars()[0];
          const train = lead && map.explored(lead.x, lead.z) ? { x: lead.x, z: lead.z, heading: lead.yaw } : undefined;
          map.drawMini(g, mini.width, car, train);
        }
      }

      // Compass bearing: north is −z, east is +x.
      if (compassRef.current) {
        const bearing = (((Math.PI - car.heading) / (Math.PI * 2)) % 1 + 1) % 1;
        const at = (COMPASS.length * (1 + bearing) + 0.5) * COMPASS_ITEM;
        compassRef.current.style.transform = `translateX(${COMPASS_VIEW / 2 - at}px)`;
      }
      if (first) {
        // Saved progress only exists in the browser, so it reaches React after the first frame.
        first = false;
        setReady(true);
        setLoadout(progress.loadout);
        setMiles(progress.miles);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onUnload = () => saveProgress(progress);
    window.addEventListener("pagehide", onUnload);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(toastTimer);
      saveProgress(progress);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", onUnload);
      view.dispose();
    };
  }, []);

  const hold = (control: keyof Input) => ({
    onPointerDown: () => {
      if (modeRef.current !== "drive") return;
      inputRef.current[control] = true;
      setShowHint(false);
    },
    onPointerUp: () => void (inputRef.current[control] = false),
    onPointerLeave: () => void (inputRef.current[control] = false),
  });

  // In the garage, dragging across the picture turns the camera round the truck.
  const drag = useRef<number | null>(null);
  const showroomDrag = {
    onPointerDown: (e: React.PointerEvent) => void (drag.current = e.clientX),
    onPointerMove: (e: React.PointerEvent) => {
      if (drag.current === null || modeRef.current !== "garage") return;
      turnRef.current -= (e.clientX - drag.current) * 0.004;
      drag.current = e.clientX;
    },
    onPointerUp: () => void (drag.current = null),
    onPointerLeave: () => void (drag.current = null),
  };

  const driving = mode === "drive" || mode === "entering" || mode === "leaving";

  return (
    <div className="relative h-[100dvh] w-full select-none overflow-hidden bg-[#efb08c]">
      <canvas
        ref={canvasRef}
        {...showroomDrag}
        className={`block h-full w-full touch-none transition-opacity duration-[1500ms] ${ready ? "opacity-100" : "opacity-0"}`}
      />
      <div ref={fadeRef} className="pointer-events-none absolute inset-0 bg-black opacity-0" />

      <h1 className="pointer-events-none absolute left-5 top-4 text-lg font-semibold tracking-tight text-[rgba(255,246,232,0.78)] drop-shadow-sm">
        gilbyy
      </h1>

      {driving && (
        <>
          {/* Compass strip: three laps of the points, slid so the heading sits in the middle. */}
          <div
            className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_30%,#000_70%,transparent)]"
            style={{ width: COMPASS_VIEW }}
          >
            <div ref={compassRef} className="flex will-change-transform">
              {[...COMPASS, ...COMPASS, ...COMPASS].map((p, i) => (
                <span
                  key={i}
                  className="shrink-0 text-center text-[11px] font-semibold tracking-wider text-[rgba(255,246,232,0.78)] drop-shadow-sm"
                  style={{ width: COMPASS_ITEM }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          {/* Minimap and odometer: top-right on phones (clear of the thumbs), bottom-left otherwise. */}
          <div className="pointer-events-none absolute right-4 top-12 flex flex-col items-center gap-1 sm:bottom-5 sm:left-5 sm:right-auto sm:top-auto">
            <canvas ref={miniRef} className="h-[104px] w-[104px] rounded-full drop-shadow-md sm:h-[150px] sm:w-[150px]" />
            <span className="text-[11px] font-semibold tracking-wide text-[rgba(255,246,232,0.7)] drop-shadow-sm">
              {fmtMiles(miles)} mi
            </span>
          </div>
        </>
      )}

      {toast && driving && (
        <p className="pointer-events-none absolute inset-x-0 top-11 text-center text-sm text-[rgba(255,246,232,0.85)] drop-shadow">
          {toast}
        </p>
      )}

      <p
        className={`pointer-events-none absolute inset-x-0 bottom-28 text-center text-sm text-[rgba(255,246,232,0.78)] drop-shadow transition-opacity duration-700 sm:bottom-10 ${
          showHint && ready && mode === "drive" && !near ? "opacity-100" : "opacity-0"
        }`}
      >
        arrows or WASD to drive · M for the map
      </p>

      {near && mode === "drive" && (
        <div className="absolute inset-x-0 bottom-28 flex justify-center sm:bottom-10">
          <button
            onClick={() => actions.current.enter()}
            className="rounded-full border border-white/25 bg-black/30 px-4 py-2 text-sm text-[rgba(255,246,232,0.9)] backdrop-blur"
          >
            <span className="mr-2 hidden rounded border border-white/30 px-1.5 text-xs sm:inline">E</span>
            Enter {GARAGE_NAMES[near].replace(/^The /, "the ")}
          </button>
        </div>
      )}

      {mode === "map" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm" onClick={() => actions.current.toggleMap()}>
          <canvas ref={fullRef} className="aspect-square w-[min(88vw,82dvh)] rounded-2xl shadow-2xl" />
          <p className="absolute bottom-4 text-xs text-[rgba(255,246,232,0.6)]">M or Esc to close</p>
        </div>
      )}

      {mode === "garage" && loadout && (
        <GarageMenu
          style={garageStyle}
          driven={miles}
          loadout={loadout}
          onFit={(c, id) => actions.current.fit(c, id)}
          onLeave={() => actions.current.leave()}
        />
      )}

      {/* Touch controls; a keyboard is assumed at sm and up. */}
      {mode === "drive" && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 sm:hidden">
          <div className="flex gap-3">
            <TouchButton label="◀" {...hold("left")} />
            <TouchButton label="▶" {...hold("right")} />
          </div>
          <button
            onClick={() => actions.current.toggleMap()}
            className="mb-1 h-11 w-11 rounded-full border border-white/25 bg-black/20 text-xs text-white/75 backdrop-blur"
          >
            map
          </button>
          <div className="flex gap-3">
            <TouchButton label="▼" {...hold("brake")} />
            <TouchButton label="▲" {...hold("gas")} />
          </div>
        </div>
      )}
    </div>
  );
}

function TouchButton({ label, ...handlers }: { label: string } & React.ComponentProps<"button">) {
  return (
    <button
      {...handlers}
      aria-hidden
      tabIndex={-1}
      className="h-16 w-16 touch-none rounded-full border border-white/25 bg-black/20 text-xl text-white/75 backdrop-blur select-none"
    >
      {label}
    </button>
  );
}
