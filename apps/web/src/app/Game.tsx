"use client";

import { useEffect, useRef, useState } from "react";
import { noInput, step, MAX_SPEED, type Car, type Input } from "./physics";
import { PALETTE } from "./palette";
import { buildWorld, ROADS, START, WORLD } from "./world";

/** Paints the static town once, so each frame is just a blit plus the car. */
function paintWorld(): HTMLCanvasElement {
  const { ponds, buildings, trees } = buildWorld();
  const c = document.createElement("canvas");
  c.width = WORLD.w;
  c.height = WORLD.h;
  const g = c.getContext("2d")!;

  g.fillStyle = PALETTE.grass;
  g.fillRect(0, 0, WORLD.w, WORLD.h);

  // Grass mottling, deterministic and cheap — just breaks up the flat fill.
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 900; i++) {
    g.fillStyle = i % 2 ? PALETTE.grassPatchLight : PALETTE.grassPatchDark;
    const x = rand() * WORLD.w;
    const y = rand() * WORLD.h;
    g.beginPath();
    g.ellipse(x, y, 40 + rand() * 90, 25 + rand() * 60, rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }

  for (const p of ponds) {
    g.fillStyle = PALETTE.waterDeep;
    g.beginPath();
    g.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PALETTE.waterShallow;
    g.beginPath();
    g.ellipse(p.x, p.y - 6, p.rx * 0.82, p.ry * 0.78, 0, 0, Math.PI * 2);
    g.fill();
  }

  for (const r of ROADS) {
    g.strokeStyle = PALETTE.roadEdge;
    g.lineWidth = r.width;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(r.x1, r.y1);
    g.lineTo(r.x2, r.y2);
    g.stroke();

    g.strokeStyle = PALETTE.roadFill;
    g.lineWidth = r.width - 14;
    g.stroke();

    g.strokeStyle = PALETTE.roadCentre;
    g.lineWidth = 4;
    g.setLineDash([30, 34]);
    g.stroke();
    g.setLineDash([]);
  }

  for (const b of buildings) {
    g.fillStyle = PALETTE.shadow;
    g.beginPath();
    g.roundRect(b.x + 10, b.y + 12, b.w, b.h, 8);
    g.fill();

    g.fillStyle = b.color;
    g.beginPath();
    g.roundRect(b.x, b.y, b.w, b.h, 8);
    g.fill();

    g.fillStyle = PALETTE.houseRoofHighlight;
    g.beginPath();
    g.roundRect(b.x + 12, b.y + 12, b.w - 24, b.h - 24, 5);
    g.fill();
  }

  for (const t of trees) {
    g.fillStyle = PALETTE.shadow;
    g.beginPath();
    g.ellipse(t.x + 7, t.y + 9, t.r, t.r * 0.8, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = PALETTE.treeBody;
    g.beginPath();
    g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PALETTE.treeHighlight;
    g.beginPath();
    g.arc(t.x - t.r * 0.25, t.y - t.r * 0.28, t.r * 0.62, 0, Math.PI * 2);
    g.fill();
  }

  return c;
}

function drawCar(g: CanvasRenderingContext2D, car: Car) {
  g.save();
  g.translate(car.x, car.y);
  g.rotate(car.angle);

  g.fillStyle = PALETTE.carShadow;
  g.beginPath();
  g.ellipse(3, 6, 26, 15, 0, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = PALETTE.tyre;
  for (const [wx, wy] of [[-13, -15], [13, -15], [-13, 15], [13, 15]] as const) {
    g.beginPath();
    g.roundRect(wx - 7, wy - 4, 14, 8, 2);
    g.fill();
  }

  g.fillStyle = PALETTE.carBody;
  g.strokeStyle = PALETTE.carOutline;
  g.lineWidth = 2.5;
  g.beginPath();
  g.roundRect(-24, -14, 48, 28, 8);
  g.fill();
  g.stroke();

  g.fillStyle = PALETTE.carWindow;
  g.beginPath();
  g.roundRect(2, -10, 12, 20, 3);
  g.fill();
  g.fillStyle = PALETTE.carTrim;
  g.beginPath();
  g.roundRect(-13, -9, 7, 18, 3);
  g.fill();

  g.restore();
}

function drawHud(g: CanvasRenderingContext2D, car: Car, vw: number) {
  // Minimap.
  const mw = 150;
  const mh = mw * (WORLD.h / WORLD.w);
  const mx = vw - mw - 18;
  const my = 18;
  g.fillStyle = PALETTE.hudPanel;
  g.strokeStyle = PALETTE.hudBorder;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(mx, my, mw, mh, 8);
  g.fill();
  g.stroke();

  g.strokeStyle = PALETTE.hudLine;
  g.lineWidth = 2;
  for (const r of ROADS) {
    g.beginPath();
    g.moveTo(mx + (r.x1 / WORLD.w) * mw, my + (r.y1 / WORLD.h) * mh);
    g.lineTo(mx + (r.x2 / WORLD.w) * mw, my + (r.y2 / WORLD.h) * mh);
    g.stroke();
  }

  g.fillStyle = PALETTE.hudMarker;
  g.beginPath();
  g.arc(mx + (car.x / WORLD.w) * mw, my + (car.y / WORLD.h) * mh, 3.5, 0, Math.PI * 2);
  g.fill();

  // Speed, tucked under the minimap so it never fights the touch controls.
  const kph = Math.round((Math.abs(car.speed) / MAX_SPEED) * 120);
  const baseline = my + mh + 34;
  g.textAlign = "right";
  g.font = "600 13px ui-sans-serif, system-ui";
  g.fillStyle = PALETTE.hudDim;
  g.fillText("KM/H", vw - 18, baseline);
  const unitWidth = g.measureText("KM/H").width;
  g.font = "600 34px ui-sans-serif, system-ui";
  g.fillStyle = PALETTE.hudText;
  g.fillText(String(kph), vw - 22 - unitWidth, baseline);
}

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<Input>(noInput());
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const world = paintWorld();
    const car: Car = { x: START.x, y: START.y, angle: 0, speed: 0 };
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
      const control = keyMap[e.key];
      if (!control) return;
      e.preventDefault();
      inputRef.current[control] = down;
      if (down) setShowHint(false);
    };
    const onKeyDown = onKey(true);
    const onKeyUp = onKey(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      step(car, inputRef.current, dt);

      const vw = canvas.clientWidth;
      const vh = canvas.clientHeight;
      const camX = Math.max(0, Math.min(WORLD.w - vw, car.x - vw / 2));
      const camY = Math.max(0, Math.min(WORLD.h - vh, car.y - vh / 2));

      ctx.fillStyle = PALETTE.grass;
      ctx.fillRect(0, 0, vw, vh);
      ctx.drawImage(world, camX, camY, vw, vh, 0, 0, vw, vh);

      ctx.save();
      ctx.translate(-camX, -camY);
      drawCar(ctx, car);
      ctx.restore();

      const vignette = ctx.createRadialGradient(
        vw / 2, vh / 2, Math.min(vw, vh) * 0.34,
        vw / 2, vh / 2, Math.max(vw, vh) * 0.78
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(38,32,24,0.34)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, vw, vh);

      drawHud(ctx, car, vw);
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
    onPointerDown: () => {
      inputRef.current[control] = true;
      setShowHint(false);
    },
    onPointerUp: () => void (inputRef.current[control] = false),
    onPointerLeave: () => void (inputRef.current[control] = false),
  });

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#7a8b5c]">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />

      <h1 className="pointer-events-none absolute left-5 top-4 text-2xl font-semibold tracking-tight text-[#efe6d2]/80 drop-shadow">
        gilbyy
      </h1>

      <p
        className={`pointer-events-none absolute inset-x-0 bottom-28 text-center text-sm text-[#efe6d2]/70 drop-shadow transition-opacity duration-700 ${
          showHint ? "opacity-100" : "opacity-0"
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
      className="h-16 w-16 touch-none rounded-full border border-[#e2d5b8]/25 bg-[#2e2c24]/55 text-xl text-[#e0bd6e] backdrop-blur select-none"
    >
      {label}
    </button>
  );
}
