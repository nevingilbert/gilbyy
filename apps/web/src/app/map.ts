import { APRON, RUNWAY, fromField } from "./airport";
import { cellAt, cellCentre } from "./fog";
import { PALETTE } from "./palette";
import { placesOf } from "./places";
import { HALF, WORLD, sampleGrid, type Mission, type World } from "./world";

/**
 * The map: a parchment topo sheet of the world you're in, drawn once, under a grey fog
 * that clears wherever you've driven. The camp is marked from the start. Garages,
 * the café and the airstrip appear once the truck has been near them, and then stay for good,
 * fog or no fog: `onFound` is told when one is found and `setFound` puts back the ones
 * saved from earlier visits. The fog is remembered as the grid cells the truck has been
 * in (fog.ts): `onExplored` is told each new one and `setExplored` clears the saved ones
 * again. Mission starts show wherever the fog has cleared, which is how they are
 * remembered too.
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
  const ice = rgb(C.ice);
  const sand = rgb(C.sand);
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
      // The island's sheet is sand where it isn't trees.
      if (world.sea) c = mix(c, sand, 0.45);
      const depth = sampleGrid(world.water, x, z) - h;
      if (sampleGrid(world.ice, x, z) > 0.5) c = mix(c, ice, 0.85);
      else if (depth > 0) c = mix(water, deep, Math.min(1, depth / 12));
      else if (h > 190 || sampleGrid(world.snow, x, z) > 0.6) c = mix(c, snow, 0.7);
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
  if (t.xs.length) {
    g.strokeStyle = C.track;
    g.lineWidth = 1.5;
    g.setLineDash([3, 2]);
    g.beginPath();
    t.xs.forEach((x, i) => (i ? g.lineTo(toPx(x), toPx(t.zs[i])) : g.moveTo(toPx(x), toPx(t.zs[i]))));
    g.closePath();
    g.stroke();
    g.setLineDash([]);
  }

  // The airstrip: its runway and apron, on the sheet like anything else, so under the fog until you've been.
  const a = world.airport;
  const corner = (lx: number, lz: number) => {
    const p = fromField(a, lx, lz);
    return [toPx(p.x), toPx(p.z)] as const;
  };
  g.fillStyle = C.runway;
  for (const [x0, x1, z0, z1] of [[-RUNWAY.half, RUNWAY.half, 0, RUNWAY.length], [-APRON.half, APRON.half, -APRON.back, APRON.front]]) {
    g.beginPath();
    g.moveTo(...corner(x0, z0));
    for (const [lx, lz] of [[x1, z0], [x1, z1], [x0, z1]]) g.lineTo(...corner(lx, lz));
    g.closePath();
    g.fill();
  }

  // The camp's roads.
  g.strokeStyle = C.road;
  g.lineWidth = 1;
  for (const r of world.roads) {
    g.beginPath();
    r.xs.forEach((x, i) => (i ? g.lineTo(toPx(x), toPx(r.zs[i])) : g.moveTo(toPx(x), toPx(r.zs[i]))));
    g.stroke();
  }
  return canvas;
}

/**
 * A little house for the camp: home. It was a triangle, which read as a second truck
 * beside the truck's own arrow. Outlined in paper, with a roof that overhangs and a small
 * door, so it isn't mistaken for a garage's wide one either.
 */
function drawCamp(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = PALETTE.map.camp;
  g.strokeStyle = PALETTE.map.paper;
  g.lineWidth = Math.max(1, s * 0.22);
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(x, y - s * 1.05);
  g.lineTo(x + s * 1.15, y - s * 0.05);
  g.lineTo(x + s * 0.75, y - s * 0.05);
  g.lineTo(x + s * 0.75, y + s * 0.9);
  g.lineTo(x - s * 0.75, y + s * 0.9);
  g.lineTo(x - s * 0.75, y - s * 0.05);
  g.lineTo(x - s * 1.15, y - s * 0.05);
  g.closePath();
  g.stroke();
  g.fill();
  g.fillStyle = PALETTE.map.paper;
  g.fillRect(x - s * 0.2, y + s * 0.25, s * 0.4, s * 0.65);
}

/** A mug for the café. */
function drawCafe(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.fillStyle = PALETTE.map.garage;
  g.fillRect(x - s * 0.7, y - s * 0.6, s * 1.1, s * 1.3);
  g.strokeStyle = PALETTE.map.garage;
  g.lineWidth = Math.max(1, s * 0.25);
  g.beginPath();
  g.arc(x + s * 0.45, y + s * 0.05, s * 0.35, -Math.PI / 2, Math.PI / 2);
  g.stroke();
}

/** A pennant for a mission start. */
function drawFlag(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.strokeStyle = PALETTE.map.garage;
  g.lineWidth = Math.max(1, s * 0.2);
  g.beginPath();
  g.moveTo(x - s * 0.5, y + s);
  g.lineTo(x - s * 0.5, y - s);
  g.stroke();
  g.fillStyle = PALETTE.map.mission;
  g.beginPath();
  g.moveTo(x - s * 0.5, y - s);
  g.lineTo(x + s, y - s * 0.5);
  g.lineTo(x - s * 0.5, y);
  g.closePath();
  g.fill();
}

function drawDot(g: CanvasRenderingContext2D, x: number, y: number, s: number, colour: string) {
  g.fillStyle = colour;
  g.strokeStyle = PALETTE.map.garage;
  g.lineWidth = Math.max(1, s * 0.3);
  g.beginPath();
  g.arc(x, y, s, 0, Math.PI * 2);
  g.fill();
  g.stroke();
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

/** A little plane seen from above, nose the way the runway runs. */
function drawPlane(g: CanvasRenderingContext2D, x: number, y: number, heading: number, s: number) {
  g.save();
  g.translate(x, y);
  g.rotate(Math.PI - heading);
  g.fillStyle = PALETTE.map.garage;
  g.beginPath();
  g.moveTo(0, -s * 1.2);
  for (const [px, py] of [[0.22, -0.3], [1.1, 0.35], [1.1, 0.6], [0.22, 0.3], [0.18, 0.85], [0.5, 1.15], [-0.5, 1.15], [-0.18, 0.85], [-0.22, 0.3], [-1.1, 0.6], [-1.1, 0.35], [-0.22, -0.3]]) {
    g.lineTo(px * s, py * s);
  }
  g.closePath();
  g.fill();
  g.restore();
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
/** Other things on the map this frame: the train (if seen), other players, and where the guidance is pointing. */
export type Extras = { train?: Spot; players?: (Spot & { friend: boolean })[] };

export function createMap(world: World, onFound: (key: string) => void = () => {}, onExplored: (cell: number) => void = () => {}) {
  const base = paintBase(world);
  const fog = document.createElement("canvas");
  fog.width = fog.height = SIZE;
  const f = fog.getContext("2d", { willReadFrequently: true })!;
  f.fillStyle = PALETTE.map.fog;
  f.fillRect(0, 0, SIZE, SIZE);
  // This world's garages, its café if it has one, and its airstrip (ADR 0008, ADR 0016).
  const places = placesOf(world);
  const found = new Set<string>();
  const seenMissions = new Set<Mission>();
  const cells = new Set<number>();
  let lastX = Infinity;
  let lastZ = Infinity;

  function clear(x: number, z: number) {
    const r = SIGHT * PX;
    const grad = f.createRadialGradient(toPx(x), toPx(z), r * 0.45, toPx(x), toPx(z), r);
    grad.addColorStop(0, ERASE);
    grad.addColorStop(1, KEEP);
    f.globalCompositeOperation = "destination-out";
    f.fillStyle = grad;
    f.fillRect(toPx(x) - r, toPx(z) - r, r * 2, r * 2);
    f.globalCompositeOperation = "source-over";
  }

  /** Clears the fog around the truck. Cheap to call every frame. */
  function reveal(x: number, z: number) {
    if (Math.hypot(x - lastX, z - lastZ) < 12) return;
    lastX = x;
    lastZ = z;
    clear(x, z);
    const cell = cellAt(x, z);
    if (!cells.has(cell)) {
      cells.add(cell);
      onExplored(cell);
    }
    for (const p of places) {
      if (found.has(p.key) || Math.hypot(p.x - x, p.z - z) >= SIGHT * 0.8) continue;
      found.add(p.key);
      onFound(p.key);
    }
    for (const m of world.missions) if (Math.hypot(m.start.x - x, m.start.z - z) < SIGHT * 0.8) seenMissions.add(m);
  }

  const markers = (g: CanvasRenderingContext2D, place: (x: number, z: number) => [number, number], icon: number, extras: Extras) => {
    drawCamp(g, ...place(world.camp.x, world.camp.z), icon * 1.1);
    // Only what has been found, and only what is in this world: the valley's café isn't on the island's map.
    for (const p of places) {
      if (!found.has(p.key)) continue;
      if (p.kind === "cafe") drawCafe(g, ...place(p.x, p.z), icon * 0.9);
      else if (p.kind === "garage") drawGarage(g, ...place(p.x, p.z), icon);
      else drawPlane(g, ...place(p.x, p.z), world.airport.heading, icon * 1.15);
    }
    for (const m of seenMissions) drawFlag(g, ...place(m.start.x, m.start.z), icon);
    if (extras.train) drawDot(g, ...place(extras.train.x, extras.train.z), icon * 0.55, PALETTE.map.train);
    for (const p of extras.players ?? []) drawDot(g, ...place(p.x, p.z), icon * 0.5, p.friend ? PALETTE.map.friend : PALETTE.map.player);
  };

  /** Round, north-up, centred on the truck: `size` px across, showing `radius` metres. */
  function drawMini(g: CanvasRenderingContext2D, size: number, car: Spot, extras: Extras = {}) {
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
    markers(g, place, size * 0.035, extras);
    drawCar(g, size / 2, size / 2, car.heading, size * 0.05);
    g.restore();
    g.strokeStyle = PALETTE.map.rim;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    g.stroke();
  }

  /** The whole valley, fitted into a `size` px square. */
  function drawFull(g: CanvasRenderingContext2D, size: number, car: Spot, extras: Extras = {}) {
    // Crop to the valley itself, whose corners are all mountain, or to the island and a margin of sea.
    const span = world.mapSpan;
    const scale = size / span;
    const sx = toPx(-span / 2);
    const sw = span * PX;
    g.clearRect(0, 0, size, size);
    g.drawImage(base, sx, sx, sw, sw, 0, 0, size, size);
    g.drawImage(fog, sx, sx, sw, sw, 0, 0, size, size);
    const place = (x: number, z: number): [number, number] => [(x + span / 2) * scale, (z + span / 2) * scale];
    markers(g, place, size * 0.014, extras);
    const [cx, cy] = place(car.x, car.z);
    drawCar(g, cx, cy, car.heading, size * 0.018);
  }

  /** Whether a spot is still under fog, for hiding things you haven't found. */
  function explored(x: number, z: number) {
    return f.getImageData(Math.floor(toPx(x)), Math.floor(toPx(z)), 1, 1).data[3] < 128;
  }

  /**
   * The places already found. `fresh` starts over from these (a different player's
   * progress has loaded) and looks again at what's near the truck; otherwise they're
   * added to what the map has.
   */
  function setFound(keys: string[], fresh = false) {
    if (fresh) {
      found.clear();
      lastX = lastZ = Infinity;
    }
    for (const k of keys) found.add(k);
  }

  /**
   * The cells already explored. `fresh` puts the fog back first (a different player's
   * progress has loaded); otherwise they're cleared on top of what the map has.
   */
  function setExplored(saved: number[], fresh = false) {
    if (fresh) {
      // Cleared first: the fog is see-through, and a second coat over the first would hide the paper.
      f.clearRect(0, 0, SIZE, SIZE);
      f.fillStyle = PALETTE.map.fog;
      f.fillRect(0, 0, SIZE, SIZE);
      cells.clear();
      seenMissions.clear();
      lastX = lastZ = Infinity;
    }
    for (const cell of saved) {
      if (cells.has(cell)) continue;
      cells.add(cell);
      const c = cellCentre(cell);
      clear(c.x, c.z);
    }
    for (const m of world.missions) if (explored(m.start.x, m.start.z)) seenMissions.add(m);
  }

  return { reveal, drawMini, drawFull, explored, setFound, setExplored };
}

export type GameMap = ReturnType<typeof createMap>;
