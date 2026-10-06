"use client";

import { useEffect, useRef, useState } from "react";
import { makeCar, noInput, step, type Input } from "./physics";
import { createView } from "./scene";
import { buildWorld, START } from "./world";

/** Physics runs at a fixed rate, independent of the display's refresh rate. */
const STEP = 1 / 120;

const COMPASS = ["N", "·", "NE", "·", "E", "·", "SE", "·", "S", "·", "SW", "·", "W", "·", "NW", "·"];
const COMPASS_ITEM = 28;
const COMPASS_VIEW = COMPASS_ITEM * 8;

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<Input>(noInput());
  const [showHint, setShowHint] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const world = buildWorld();
    const car = makeCar(world, START.x, START.z, START.heading);
    let view: ReturnType<typeof createView>;
    try {
      view = createView(canvas, world);
    } catch {
      return; // No WebGL. The fog-coloured backdrop is all there is to see.
    }

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let first = true;

    const resize = () => view.resize();
    window.addEventListener("resize", resize);

    const keyMap: Record<string, keyof Input> = {
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
      ArrowUp: "gas", w: "gas", W: "gas",
      ArrowDown: "brake", s: "brake", S: "brake",
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const control = keyMap[e.key];
      if (!control) return;
      e.preventDefault();
      inputRef.current[control] = down;
      if (down) setShowHint(false);
    };
    const onKeyDown = onKey(true);
    const onKeyUp = onKey(false);
    const onBlur = () => (inputRef.current = noInput());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      acc += dt;
      while (acc >= STEP) {
        step(car, inputRef.current, STEP, world);
        acc -= STEP;
      }
      view.render(car, dt);

      // Compass bearing: north is -z, east is +x.
      if (compassRef.current) {
        const bearing = (((Math.PI - car.heading) / (Math.PI * 2)) % 1 + 1) % 1;
        const at = (COMPASS.length * (1 + bearing) + 0.5) * COMPASS_ITEM;
        compassRef.current.style.transform = `translateX(${COMPASS_VIEW / 2 - at}px)`;
      }
      if (first) {
        first = false;
        setReady(true);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      view.dispose();
    };
  }, []);

  const hold = (control: keyof Input) => ({
    onPointerDown: () => {
      inputRef.current[control] = true;
      setShowHint(false);
    },
    onPointerUp: () => void (inputRef.current[control] = false),
    onPointerLeave: () => void (inputRef.current[control] = false),
  });

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#efb08c]">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full touch-none transition-opacity duration-[1500ms] ${ready ? "opacity-100" : "opacity-0"}`}
      />

      <h1 className="pointer-events-none absolute left-5 top-4 text-lg font-semibold tracking-tight text-[rgba(255,246,232,0.78)] drop-shadow-sm">
        gilbyy
      </h1>

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

      <p
        className={`pointer-events-none absolute inset-x-0 bottom-28 text-center sm:bottom-10 text-sm text-[rgba(255,246,232,0.78)] drop-shadow transition-opacity duration-700 ${
          showHint && ready ? "opacity-100" : "opacity-0"
        }`}
      >
        arrows or WASD to drive
      </p>

      {/* Touch controls; a keyboard is assumed at sm and up. */}
      <div className="absolute inset-x-0 bottom-0 flex justify-between p-5 sm:hidden">
        <div className="flex gap-3">
          <TouchButton label="◀" {...hold("left")} />
          <TouchButton label="▶" {...hold("right")} />
        </div>
        <div className="flex gap-3">
          <TouchButton label="▼" {...hold("brake")} />
          <TouchButton label="▲" {...hold("gas")} />
        </div>
      </div>
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
