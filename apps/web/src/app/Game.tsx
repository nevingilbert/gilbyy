"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HUB, LEVELS, WORLD, type Level } from "./levels";
import { levelAt, noInput, step, type Car, type Input } from "./physics";

/** Deterministic scatter so the scenery doesn't reshuffle on every render. */
function scenery() {
  let seed = 1337;
  const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const trees: { x: number; y: number; r: number }[] = [];
  while (trees.length < 90) {
    const x = rand() * WORLD.w;
    const y = rand() * WORLD.h;
    const nearRoad = LEVELS.some((l) => distToSegment(x, y, HUB.x, HUB.y, l.x, l.y) < 90);
    if (!nearRoad) trees.push({ x, y, r: 12 + rand() * 14 });
  }
  return trees;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearby, setNearby] = useState<Level | null>(null);
  const nearbyRef = useRef<Level | null>(null);
  const inputRef = useRef<Input>(noInput());

  const enter = useCallback(() => {
    if (nearbyRef.current) window.location.href = nearbyRef.current.href;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const car: Car = { x: HUB.x, y: HUB.y + 150, angle: -Math.PI / 2, speed: 0 };
    const trees = scenery();
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const keyMap: Record<string, keyof Input> = {
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
      ArrowUp: "gas", w: "gas", W: "gas",
      ArrowDown: "brake", s: "brake", S: "brake",
    };
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (down && (e.key === "Enter" || e.key === " ")) {
        if (nearbyRef.current) {
          e.preventDefault();
          window.location.href = nearbyRef.current.href;
        }
        return;
      }
      const control = keyMap[e.key];
      if (!control) return;
      e.preventDefault();
      inputRef.current[control] = down;
    };
    const onKeyDown = onKey(true);
    const onKeyUp = onKey(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      step(car, inputRef.current, dt);
      const hit = levelAt(car);
      if (hit?.id !== nearbyRef.current?.id) {
        nearbyRef.current = hit;
        setNearby(hit);
      }

      // --- render ---
      const vw = canvas.clientWidth;
      const vh = canvas.clientHeight;
      const camX = Math.max(0, Math.min(WORLD.w - vw, car.x - vw / 2));
      const camY = Math.max(0, Math.min(WORLD.h - vh, car.y - vh / 2));

      ctx.fillStyle = "#14532d";
      ctx.fillRect(0, 0, vw, vh);
      ctx.save();
      ctx.translate(-camX, -camY);

      // Roads out from the hub.
      for (const level of LEVELS) {
        ctx.strokeStyle = "#57534e";
        ctx.lineWidth = 64;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(HUB.x, HUB.y);
        ctx.lineTo(level.x, level.y);
        ctx.stroke();

        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 4;
        ctx.setLineDash([22, 18]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const tree of trees) {
        ctx.fillStyle = "#166534";
        ctx.beginPath();
        ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hub.
      ctx.fillStyle = "#1e1b4b";
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(HUB.x, HUB.y, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = "34px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("🏠", HUB.x, HUB.y + 12);

      // Level buildings.
      for (const level of LEVELS) {
        const active = level.id === hit?.id;
        ctx.fillStyle = level.color;
        ctx.strokeStyle = active ? "#fde68a" : "#ffffff";
        ctx.lineWidth = active ? 7 : 4;
        ctx.beginPath();
        ctx.roundRect(level.x - 70, level.y - 60, 140, 120, 16);
        ctx.fill();
        ctx.stroke();

        ctx.font = "40px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(level.emoji, level.x, level.y + 4);
        ctx.font = "600 18px system-ui";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(level.label, level.x, level.y + 40);
      }

      // Car.
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = "#facc15";
      ctx.strokeStyle = "#1c1917";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-22, -13, 44, 26, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(2, -10, 11, 20);
      ctx.restore();

      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const hold = (control: keyof Input) => ({
    onPointerDown: () => void (inputRef.current[control] = true),
    onPointerUp: () => void (inputRef.current[control] = false),
    onPointerLeave: () => void (inputRef.current[control] = false),
  });

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-emerald-950">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />

      <div className="pointer-events-none absolute inset-x-0 top-0 p-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-amber-300 drop-shadow">gilbyy</h1>
        <p className="mt-1 text-xs text-emerald-300/80">
          drive with arrows or WASD — pull up to a building to enter
        </p>
      </div>

      {nearby && (
        <button
          onClick={enter}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-lg sm:bottom-10"
        >
          Enter {nearby.label} {nearby.emoji} — press Enter
        </button>
      )}

      {/* Touch controls; hidden once a keyboard is likely present. */}
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
      className="h-16 w-16 touch-none rounded-full border border-emerald-600/60 bg-emerald-900/70 text-xl text-amber-300 backdrop-blur select-none"
    >
      {label}
    </button>
  );
}
