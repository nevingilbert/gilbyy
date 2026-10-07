import { PALETTE } from "./palette";
import { HALF, WORLD, sampleGrid, type Site, type World } from "./world";

/**
 * The map: a parchment topo sheet of the valley, drawn once, under a grey fog that
 * clears wherever you've driven. The fog lives only in memory, so every visit starts
 * unexplored. Garages appear on it once you've seen them.
 */
const SIZE = 512;
const PX = SIZE / WORLD.size;
/** How far around the truck the fog clears, in metres. */
const SIGHT = 170;

type RGB = [number, number, number];
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const toPx = (v: number) => (v + HALF) * PX;
/** Erase masks for clearing the fog, not colours: only their alpha matters. */
const ERASE = "rgba(0,0,0,1)";
const KEEP = "rgba(0,0,0,0)";

function paintBase(world: World) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(SIZE, SIZE);
  const C = PALETTE.map;
  const paper = rgb(C.paper);
  const shade = rgb(C.paperShade);
  const forest = rgb(C.forest);
  const rock = rgb(C.rock);
  const snow = rgb(C.snow);
  const water = rgb(C.water);
  const deep = rgb(C.waterDeep);
  const step = 1 / PX;
  const heights = new Float32Array(SIZE * SIZE);
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      heights[py * SIZE + px] = world.height(px * step - HALF, py * step - HALF);
    }
  }
  const at = (px: number, py: number) => heights[Math.min(SIZE - 1, Math.max(0, py)) * SIZE + Math.min(SIZE - 1, Math.max(0, px))];

  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const x = px * step - HALF;
      const z = py * step - HALF;
      const h = at(px, py);
      const dx = (at(px + 1, py) - at(px - 1, py)) / (2 * step);
      const dz = (at(px, py + 1) - at(px, py - 1)) / (2 * step);
      // Hillshade lit from the north-west, the way paper maps are.
      const lit = Math.max(0, Math.min(1, 0.62 + (dx + dz) * -0.35 - Math.hypot(dx, dz) * 0.15));
      let c = mix(shade, paper, lit);
      const depth = sampleGrid(world.water, x, z) - h;
      if (depth > 0) c = mix(water, deep, Math.min(1, depth / 12));
      else if (h > 190) c = mix(c, snow, 0.7);
      else if (Math.hypot(dx, dz) > 0.75) c = mix(c, rock, 0.6);
      else if (sampleGrid(world.forest, x, z) > 0.6) c = mix(c, forest, 0.55);
      const k = (py * SIZE + px) * 4;
      img.data[k] = c[0];
      img.data[k + 1] = c[1];
      img.data[k + 2] = c[2];
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // Contours every 25 m.
  g.fillStyle = C.contour;
  for (let py = 0; py < SIZE - 1; py++) {
    for (let px = 0; px < SIZE - 1; px++) {
      const band = Math.floor(at(px, py) / 25);
      if (band !== Math.floor(at(px + 1, py) / 25) || band !== Math.floor(at(px, py + 1) / 25)) g.fillRect(px, py, 1, 1);
    }
  }

  // The railway, as a dashed line.
  const t = world.track;
  g.strokeStyle = C.track;
  g.lineWidth = 1.5;
  g.setLineDash([3, 2]);
  g.beginPath();
  t.xs.forEach((x, i) => (i ? g.lineTo(toPx(x), toPx(t.zs[i])) : g.moveTo(toPx(x), toPx(t.zs[i]))));
  g.closePath();
  g.stroke();
  g.setLineDash([]);
  return canvas;
}

function drawGarage(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = PALETTE.map.garage;
  g.beginPath();
  g.moveTo(x - s, y + s * 0.8);
  g.lineTo(x - s, y - s * 0.1);
  g.lineTo(x, y - s);
  g.lineTo(x + s, y - s * 0.1);
  g.lineTo(x + s, y + s * 0.8);
  g.closePath();
  g.fill();
  g.fillStyle = PALETTE.map.paper;
  g.fillRect(x - s * 0.45, y + s * 0.05, s * 0.9, s * 0.75);
}

function drawCar(g: CanvasRenderingContext2D, x: number, y: number, heading: number, s: number) {
  g.save();
  g.translate(x, y);
  // Map up is north (−z); heading 0 faces +z, which is down the map.
  g.rotate(Math.PI - heading);
  g.fillStyle = PALETTE.map.car;
  g.strokeStyle = PALETTE.map.paper;
  g.lineWidth = Math.max(1, s * 0.25);
  g.beginPath();
  g.moveTo(0, -s);
  g.lineTo(s * 0.7, s * 0.8);
  g.lineTo(0, s * 0.4);
  g.lineTo(-s * 0.7, s * 0.8);
  g.closePath();
  g.stroke();
  g.fill();
  g.restore();
}

export type Spot = { x: number; z: number; heading: number };

export function createMap(world: World) {
  const base = paintBase(world);
  const fog = document.createElement("canvas");
  fog.width = fog.height = SIZE;
  const f = fog.getContext("2d", { willReadFrequently: true })!;
  f.fillStyle = PALETTE.map.fog;
  f.fillRect(0, 0, SIZE, SIZE);
  const seen = new Set<Site>();
  let lastX = Infinity;
  let lastZ = Infinity;

  /** Clears the fog around the truck. Cheap to call every frame. */
  function reveal(x: number, z: number) {
    if (Math.hypot(x - lastX, z - lastZ) < 12) return;
    lastX = x;
    lastZ = z;
    const r = SIGHT * PX;
    const grad = f.createRadialGradient(toPx(x), toPx(z), r * 0.45, toPx(x), toPx(z), r);
    grad.addColorStop(0, ERASE);
    grad.addColorStop(1, KEEP);
    f.globalCompositeOperation = "destination-out";
    f.fillStyle = grad;
    f.fillRect(toPx(x) - r, toPx(z) - r, r * 2, r * 2);
    f.globalCompositeOperation = "source-over";
    for (const s of world.sites) if (Math.hypot(s.x - x, s.z - z) < SIGHT * 0.8) seen.add(s);
  }

  const markers = (g: CanvasRenderingContext2D, place: (x: number, z: number) => [number, number], icon: number) => {
    for (const s of seen) {
      const [px, py] = place(s.x, s.z);
      drawGarage(g, px, py, icon);
    }
  };

  /** Round, north-up, centred on the truck: `size` px across, showing `radius` metres. */
  function drawMini(g: CanvasRenderingContext2D, size: number, car: Spot, train?: Spot) {
    const radius = 480;
    const scale = size / (radius * 2);
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    g.clip();
    const sx = toPx(car.x - radius);
    const sy = toPx(car.z - radius);
    const sw = radius * 2 * PX;
    g.fillStyle = PALETTE.map.fog;
    g.fillRect(0, 0, size, size);
    g.drawImage(base, sx, sy, sw, sw, 0, 0, size, size);
    g.drawImage(fog, sx, sy, sw, sw, 0, 0, size, size);
    const place = (x: number, z: number): [number, number] => [(x - car.x + radius) * scale, (z - car.z + radius) * scale];
    markers(g, place, size * 0.035);
    if (train) {
      const [tx, ty] = place(train.x, train.z);
      g.fillStyle = PALETTE.map.train;
      g.beginPath();
      g.arc(tx, ty, size * 0.022, 0, Math.PI * 2);
      g.fill();
    }
    drawCar(g, size / 2, size / 2, car.heading, size * 0.05);
    g.restore();
    g.strokeStyle = PALETTE.map.rim;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    g.stroke();
  }

  /** The whole valley, fitted into a `size` px square. */
  function drawFull(g: CanvasRenderingContext2D, size: number, car: Spot, train?: Spot) {
    // Crop to the valley itself; the square's corners are all mountain.
    const span = WORLD.limit * 2.1;
    const scale = size / span;
    const sx = toPx(-span / 2);
    const sw = span * PX;
    g.clearRect(0, 0, size, size);
    g.drawImage(base, sx, sx, sw, sw, 0, 0, size, size);
    g.drawImage(fog, sx, sx, sw, sw, 0, 0, size, size);
    const place = (x: number, z: number): [number, number] => [(x + span / 2) * scale, (z + span / 2) * scale];
    markers(g, place, size * 0.014);
    if (train) {
      const [tx, ty] = place(train.x, train.z);
      g.fillStyle = PALETTE.map.train;
      g.beginPath();
      g.arc(tx, ty, size * 0.008, 0, Math.PI * 2);
      g.fill();
    }
    const [cx, cy] = place(car.x, car.z);
    drawCar(g, cx, cy, car.heading, size * 0.018);
  }

  /** Whether a spot is still under fog, for hiding things you haven't found. */
  function explored(x: number, z: number) {
    return f.getImageData(Math.floor(toPx(x)), Math.floor(toPx(z)), 1, 1).data[3] < 128;
  }

  return { reveal, drawMini, drawFull, explored, discovered: () => seen.size };
}

export type GameMap = ReturnType<typeof createMap>;
