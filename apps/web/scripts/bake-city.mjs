// Bakes San Francisco's ground and streets into apps/web/src/app/city-data.ts (ADR 0022).
//
//   node apps/web/scripts/bake-city.mjs <dem.tif> <roads.shp> <roads.dbf> <water.shp> <water.dbf> <out.ts>
//
// The inputs are public-domain US government data, downloaded once by hand:
// - tl_2024_06075_roads.zip and tl_2024_06075_areawater.zip, the Census Bureau's TIGER/Line
//   files for San Francisco County (www2.census.gov/geo/tiger/TIGER2024/),
// - a 640×640 float32 GeoTIFF from the USGS 3D Elevation Program's exportImage over
//   lon −122.5210…−122.3506, lat 37.7032…37.8384 (elevation.nationalmap.gov,
//   3DEPElevation/ImageServer, bboxSR 4326, pixelType F32, compression None).
//
// The city is drawn at 1:2.5 across (CITY_FRAME.scale): the whole of it fits on the game's
// 6 km square. Heights are kept as real metres; city.ts decides how tall to draw them.
// Node built-ins only.
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const [demPath, roadsShp, roadsDbf, waterShp, waterDbf, outPath] = process.argv.slice(2);
if (!outPath) throw new Error("usage: bake-city.mjs <dem.tif> <roads.shp> <roads.dbf> <water.shp> <water.dbf> <out.ts>");

/** Where the middle of the map is, how much smaller the city is drawn, and metres per degree there. */
const FRAME = { lon0: -122.43575, lat0: 37.77075, scale: 2.5, metresPerLon: 88117, metresPerLat: 110992 };
/** The game's grid (terrain.ts WORLD): 6 km square, a vertex every 10 m. */
const SIZE = 6000;
const SEGMENTS = 600;
const ROW = SEGMENTS + 1;
const CELL = SIZE / SEGMENTS;
const HALF = SIZE / 2;

const gx = (lon) => ((lon - FRAME.lon0) * FRAME.metresPerLon) / FRAME.scale;
const gz = (lat) => (-(lat - FRAME.lat0) * FRAME.metresPerLat) / FRAME.scale;
const lonOf = (x) => FRAME.lon0 + (x * FRAME.scale) / FRAME.metresPerLon;
const latOf = (z) => FRAME.lat0 - (z * FRAME.scale) / FRAME.metresPerLat;

// ——— Readers ———

/** A single-band float32 TIFF, uncompressed, in strips or tiles. */
function readTiff(path) {
  const buf = readFileSync(path);
  if (buf.toString("latin1", 0, 2) !== "II") throw new Error("expected a little-endian TIFF");
  const ifd = buf.readUInt32LE(4);
  const tags = {};
  const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8 };
  for (let i = 0; i < buf.readUInt16LE(ifd); i++) {
    const e = ifd + 2 + i * 12;
    const type = buf.readUInt16LE(e + 2);
    const count = buf.readUInt32LE(e + 4);
    const size = SIZES[type] ?? 1;
    const at = size * count <= 4 ? e + 8 : buf.readUInt32LE(e + 8);
    const read = { 1: (o) => buf[o], 2: (o) => buf[o], 3: (o) => buf.readUInt16LE(o), 4: (o) => buf.readUInt32LE(o), 11: (o) => buf.readFloatLE(o), 12: (o) => buf.readDoubleLE(o) }[type];
    tags[buf.readUInt16LE(e)] = read ? Array.from({ length: count }, (_, k) => read(at + k * size)) : [];
  }
  const width = tags[256][0];
  const height = tags[257][0];
  if ((tags[259]?.[0] ?? 1) !== 1 || tags[258][0] !== 32 || tags[339]?.[0] !== 3) throw new Error("expected uncompressed float32 samples");
  const data = new Float32Array(width * height);
  if (tags[273]) {
    const rows = tags[278]?.[0] ?? height;
    tags[273].forEach((off, s) => {
      for (let r = 0; r < rows && s * rows + r < height; r++) {
        for (let x = 0; x < width; x++) data[(s * rows + r) * width + x] = buf.readFloatLE(off + (r * width + x) * 4);
      }
    });
  } else {
    const [tw] = tags[322];
    const [th] = tags[323];
    const across = Math.ceil(width / tw);
    tags[324].forEach((off, t) => {
      const [x0, y0] = [(t % across) * tw, Math.floor(t / across) * th];
      for (let r = 0; r < th; r++) {
        for (let c = 0; c < tw; c++) if (x0 + c < width && y0 + r < height) data[(y0 + r) * width + x0 + c] = buf.readFloatLE(off + (r * tw + c) * 4);
      }
    });
  }
  // ModelTiepoint: raster (0, 0) is the north-west corner, at this longitude and latitude; ModelPixelScale: degrees a pixel.
  const [, , , lonWest, latNorth] = tags[33922];
  return { width, height, data, lonWest, latNorth, step: tags[33550][0] };
}

/** An ESRI shapefile's polylines and polygons, each a list of parts of [lon, lat]. */
function readShp(path) {
  const buf = readFileSync(path);
  const out = [];
  for (let o = 100; o < buf.length; ) {
    const r = o + 8;
    const type = buf.readInt32LE(r);
    const parts = [];
    if (type === 3 || type === 5) {
      const nParts = buf.readInt32LE(r + 36);
      const nPoints = buf.readInt32LE(r + 40);
      const starts = Array.from({ length: nParts }, (_, p) => buf.readInt32LE(r + 44 + p * 4));
      const pts = r + 44 + nParts * 4;
      for (let p = 0; p < nParts; p++) {
        const part = [];
        for (let k = starts[p]; k < (p + 1 < nParts ? starts[p + 1] : nPoints); k++) part.push([buf.readDoubleLE(pts + k * 16), buf.readDoubleLE(pts + k * 16 + 8)]);
        parts.push(part);
      }
    }
    out.push(parts);
    o = r + buf.readUInt32BE(o + 4) * 2;
  }
  return out;
}

/** A dBASE III table, as rows of trimmed strings. */
function readDbf(path) {
  const buf = readFileSync(path);
  const fields = [];
  for (let o = 32; buf[o] !== 0x0d; o += 32) fields.push({ name: buf.toString("latin1", o, o + 11).replace(/\0.*$/, ""), len: buf[o + 16] });
  const header = buf.readUInt16LE(8);
  const size = buf.readUInt16LE(10);
  return Array.from({ length: buf.readUInt32LE(4) }, (_, i) => {
    let o = header + i * size + 1;
    const row = {};
    for (const f of fields) {
      row[f.name] = buf.toString("utf8", o, o + f.len).trim();
      o += f.len;
    }
    return row;
  });
}

// ——— Ground ———

const dem = readTiff(demPath);
/** Real elevation in metres at a longitude and latitude, bilinear between the DEM's pixel centres. */
const elevation = (lon, lat) => {
  const fx = (lon - dem.lonWest) / dem.step - 0.5;
  const fy = (dem.latNorth - lat) / dem.step - 0.5;
  const i = Math.max(0, Math.min(dem.width - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(dem.height - 2, Math.floor(fy)));
  const u = Math.max(0, Math.min(1, fx - i));
  const v = Math.max(0, Math.min(1, fy - j));
  const d = dem.data;
  const w = dem.width;
  return (d[j * w + i] * (1 - u) + d[j * w + i + 1] * u) * (1 - v) + (d[(j + 1) * w + i] * (1 - u) + d[(j + 1) * w + i + 1] * u) * v;
};

/** Fills polygons into a grid of vertices, even-odd along each row of the grid. */
function fill(polygons, mark, grid) {
  for (const parts of polygons) {
    const edges = [];
    for (const part of parts) {
      for (let a = 0; a + 1 < part.length; a++) {
        edges.push([(gx(part[a][0]) + HALF) / CELL, (gz(part[a][1]) + HALF) / CELL, (gx(part[a + 1][0]) + HALF) / CELL, (gz(part[a + 1][1]) + HALF) / CELL]);
      }
    }
    for (let j = 0; j < ROW; j++) {
      const xs = [];
      for (const [x0, y0, x1, y1] of edges) if ((y0 <= j) !== (y1 <= j)) xs.push(x0 + ((j - y0) / (y1 - y0)) * (x1 - x0));
      xs.sort((a, b) => a - b);
      for (let m = 0; m + 1 < xs.length; m += 2) {
        for (let i = Math.max(0, Math.ceil(xs[m])); i <= Math.min(SEGMENTS, Math.floor(xs[m + 1])); i++) grid[j * ROW + i] = mark;
      }
    }
  }
}

const heights = new Int16Array(ROW * ROW);
const water = new Uint8Array(ROW * ROW);
const waterShapes = readShp(waterShp);
const waterRows = readDbf(waterDbf);
// The bay and the ocean first, then lakes and ponds over them, and the reservoirs: most of
// the city's are roofed over, so they're kept apart to be built on rather than filled.
fill(waterShapes.filter((_, k) => ["H2051", "H2053"].includes(waterRows[k].MTFCC)), 1, water);
fill(waterShapes.filter((_, k) => waterRows[k].MTFCC === "H2030"), 2, water);
fill(waterShapes.filter((_, k) => waterRows[k].MTFCC === "H2040"), 3, water);
/** Outside San Francisco County the Census files say nothing, so the sea is wherever the DEM is at sea level. */
const outsideCounty = (lon, lat) => (lat > 37.814 && lon < -122.43) || lat < 37.7081 || lon > -122.3555;
for (let j = 0; j < ROW; j++) {
  for (let i = 0; i < ROW; i++) {
    const lon = lonOf(-HALF + i * CELL);
    const lat = latOf(-HALF + j * CELL);
    const e = elevation(lon, lat);
    const k = j * ROW + i;
    heights[k] = Math.round(Math.max(-3200, Math.min(3200, e * 4)));
    if (outsideCounty(lon, lat) && e <= 0.3) water[k] = 1;
  }
}

// ——— Streets ———

/**
 * How wide each street is drawn, by class: 0 an alley or a service road, 1 an ordinary
 * street, 2 a busy one, 3 a boulevard, 4 a bridge's deck. Widths themselves are city.ts's.
 */
const BOULEVARDS = new Set([
  "Market St", "The Embarcadero", "Van Ness Ave", "Geary Blvd", "Great Hwy", "19th Ave", "Park Presidio Blvd", "Sunset Blvd",
  "Octavia Blvd", "Cesar Chavez St", "Marina Blvd", "King St", "Bayshore Blvd", "Alemany Blvd", "Portola Dr", "Lincoln Way",
  "Junipero Serra Blvd", "Brotherhood Way", "Skyline Blvd", "John Muir Dr", "Doyle Dr", "Sloat Blvd", "Fulton St",
]);
const BUSY = new Set([
  "Mission St", "Folsom St", "Howard St", "Harrison St", "Bryant St", "Brannan St", "Townsend St", "3rd St", "4th St", "5th St",
  "6th St", "7th St", "8th St", "9th St", "10th St", "11th St", "16th St", "24th St", "Valencia St", "Guerrero St", "Dolores St",
  "Potrero Ave", "Divisadero St", "Fillmore St", "Masonic Ave", "Stanyan St", "Oak St", "Fell St", "Hayes St", "Haight St",
  "Turk Blvd", "Golden Gate Ave", "McAllister St", "California St", "Pine St", "Bush St", "Sutter St", "Post St", "Geary St",
  "O'Farrell St", "Ellis St", "Eddy St", "Franklin St", "Gough St", "Polk St", "Larkin St", "Columbus Ave", "Broadway",
  "Bay St", "Chestnut St", "Irving St", "Judah St", "Noriega St", "Taraval St", "Ocean Ave", "Monterey Blvd", "Geneva Ave",
  "Mission Bay Blvd N", "Mission Bay Blvd S", "Clement St", "Balboa St", "Anza St", "7th Ave", "9th Ave", "Arguello Blvd",
  "Castro St", "Church St", "17th St", "18th St", "Clarendon Ave", "Kezar Dr", "John F Kennedy Dr", "Martin Luther King Jr Dr",
  "Lincoln Blvd", "Presidio Blvd", "Washington Blvd", "Point Lobos Ave", "El Camino Del Mar", "Laguna Honda Blvd",
  "Woodside Ave", "O'Shaughnessy Blvd", "Bosworth St", "Silver Ave", "Evans Ave", "Jerrold Ave", "Innes Ave", "Gilman Ave",
  "Paul Ave", "Mansell St", "Persia Ave", "Treasure Island Rd", "Mason St", "Powell St", "Stockton St", "Kearny St",
  "Montgomery St", "Sansome St", "Battery St", "Front St", "Davis St", "Drumm St", "Beach St", "Jefferson St", "North Point St",
  "Lombard St", "Pacific Ave", "Jackson St", "Washington St", "Clay St", "Sacramento St", "Steiner St", "Webster St",
  "Buchanan St", "Laguna St", "Hyde St", "Leavenworth St", "Jones St", "Taylor St", "Grant Ave", "Embarcadero North St",
]);
const ALLEYS = new Set(["S1500", "S1640", "S1730", "S1740"]);
/** Many alleys are listed as ordinary streets; their names say what they are. Stairs and paths aren't driven. */
const ALLEY_NAMES = /\s(Aly|Ct|Pl|Ln|Ter|Row|Plz|Mall)$/;
const FOOTWAY_NAMES = /\s(Stairway|Steps|Stps|Path|Pathway|Trl|Walk)$/;
/** The freeways and their ramps are mostly up on concrete; of them only these, at the bridges and through the Presidio. */
const keepFreeway = (name, lon, lat) =>
  name === "Golden Gate Brg" || name === "Bay Brg" ||
  ((name === "US Hwy 101" || name === "State Rte 1") && lat > 37.7995 && lon < -122.4475) ||
  (name === "I- 80" && lon > -122.3655);
const classOf = (mtfcc, name) =>
  mtfcc === "S1100" ? (name === "Golden Gate Brg" || name === "Bay Brg" || name === "I- 80" ? 4 : 3)
  : mtfcc === "S1200" ? 3
  : ALLEYS.has(mtfcc) || ALLEY_NAMES.test(name) ? 0
  : BOULEVARDS.has(name) ? 3
  : BUSY.has(name) ? 2
  : 1;

const roadShapes = readShp(roadsShp);
const roadRows = readDbf(roadsDbf);
const names = [""];
const nameIndex = new Map([["", 0]]);
const nameOf = (n) => nameIndex.get(n) ?? (nameIndex.set(n, names.length), names.push(n), names.length - 1);
/** Every segment already laid, by its rounded ends, so a road listed under several route numbers is laid once. */
const laid = new Set();
const segKey = (a, b) => {
  const r = (p) => `${Math.round(gx(p[0]) * 2)},${Math.round(gz(p[1]) * 2)}`;
  const [p, q] = [r(a), r(b)];
  return p < q ? `${p}|${q}` : `${q}|${p}`;
};
/** Douglas–Peucker, to within `tol` metres, on points in game coordinates. Points `pinned` picks are kept whatever. */
function simplify(pts, tol, pinned) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  for (let k = 1; k + 1 < pts.length; k++) if (pinned(k)) keep[k] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a];
    const [bx, bz] = pts[b];
    const len = Math.hypot(bx - ax, bz - az) || 1e-9;
    let worst = -1;
    let far = 0;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((bx - ax) * (az - pts[k][1]) - (ax - pts[k][0]) * (bz - az)) / len;
      if (d > far) {
        far = d;
        worst = k;
      }
    }
    if (far > tol) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

const runs = [];
// A road listed under several names is laid under its street name, not a route number:
// Van Ness Ave, not US Hwy 101 Bus; the Golden Gate Brg, not State Rte 1.
const routeNumber = (name) => /^(US Hwy|State Rte|State Hwy|I- |Hwy )/.test(name) ? 1 : 0;
const order = roadRows.map((r, k) => ({ r, k, rank: (r.MTFCC === "S1100" ? 0 : r.MTFCC === "S1200" ? 1 : r.MTFCC === "S1400" ? 2 : 3) * 2 + routeNumber(r.FULLNAME) }));
order.sort((a, b) => a.rank - b.rank || a.k - b.k);
const DROP = new Set(["S1630", "S1710", "S1720", "S1750", "S1780", "S1820", "S1830"]);
for (const { r, k } of order) {
  if (DROP.has(r.MTFCC) || FOOTWAY_NAMES.test(r.FULLNAME)) continue;
  for (const part of roadShapes[k]) {
    let run = [];
    const flush = () => {
      if (run.length > 1) runs.push({ name: nameOf(r.FULLNAME), cls: classOf(r.MTFCC, r.FULLNAME), run });
      run = [];
    };
    for (let a = 0; a + 1 < part.length; a++) {
      const p = part[a];
      const q = part[a + 1];
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const key = segKey(p, q);
      const ok = (r.MTFCC !== "S1100" || keepFreeway(r.FULLNAME, mid[0], mid[1])) && !laid.has(key)
        && Math.abs(gx(mid[0])) < HALF && Math.abs(gz(mid[1])) < HALF;
      if (!ok) {
        flush();
        continue;
      }
      laid.add(key);
      if (!run.length) run.push(p);
      run.push(q);
    }
    flush();
  }
}
// Where streets meet they share a point exactly. Those points are kept through the
// simplifying, or a straight street would lose its corners and no longer meet the streets
// that cross it.
const uses = new Map();
const vertexKey = (p) => `${p[0]},${p[1]}`;
for (const { run } of runs) for (const p of run) uses.set(vertexKey(p), (uses.get(vertexKey(p)) ?? 0) + 1);
const lines = runs.map(({ name, cls, run }) => ({
  name, cls,
  pts: simplify(run.map(([lon, lat]) => [gx(lon), gz(lat)]), 0.5, (k) => uses.get(vertexKey(run[k])) > 1),
}));

// ——— Out ———

const pointCount = lines.reduce((n, l) => n + l.pts.length, 0);
const nameBytes = Buffer.from(names.join("\n"), "utf8");
const streets = Buffer.alloc(8 + nameBytes.length + 4 + lines.length * 6 + pointCount * 4);
let o = 0;
streets.writeUInt32LE(names.length, o); o += 4;
streets.writeUInt32LE(nameBytes.length, o); o += 4;
nameBytes.copy(streets, o); o += nameBytes.length;
streets.writeUInt32LE(lines.length, o); o += 4;
for (const l of lines) {
  streets.writeUInt16LE(l.name, o);
  streets.writeUInt8(l.cls, o + 2);
  streets.writeUInt8(0, o + 3);
  streets.writeUInt16LE(l.pts.length, o + 4);
  o += 6;
  for (const [x, z] of l.pts) {
    streets.writeInt16LE(Math.round(x * 4), o);
    streets.writeInt16LE(Math.round(z * 4), o + 2);
    o += 4;
  }
}
// Heights as differences along each row, which deflate much smaller than the heights themselves.
const deltas = new Int16Array(ROW * ROW);
for (let j = 0; j < ROW; j++) for (let i = 0; i < ROW; i++) deltas[j * ROW + i] = heights[j * ROW + i] - (i ? heights[j * ROW + i - 1] : 0);
const pack = (bytes) => deflateSync(bytes, { level: 9 }).toString("base64");
const chunked = (s) => `[\n${s.match(/.{1,120}/g).map((line) => `  "${line}",`).join("\n")}\n].join("")`;
const out = `// Generated by apps/web/scripts/bake-city.mjs. Do not edit by hand; see that script for how to remake it.
//
// San Francisco from public-domain US government data: the U.S. Census Bureau's TIGER/Line
// 2024 roads and area water for San Francisco County (06075), and the USGS 3D Elevation
// Program's bare-earth elevation. Each string is deflated binary in base64 (city.ts reads them).

/** Where the middle of the map is, and how much smaller than life the city is drawn across. */
export const CITY_FRAME = ${JSON.stringify(FRAME)} as const;

/** Real elevation in quarter metres at each of the 601×601 grid vertices, north row first, each row as differences from the last vertex. */
export const HEIGHTS =
${chunked(pack(Buffer.from(deltas.buffer)))};

/** At each grid vertex: 0 land, 1 the bay or the ocean, 2 a lake or a pond, 3 a reservoir. */
export const WATER =
${chunked(pack(Buffer.from(water.buffer)))};

/** ${names.length} street names, then ${lines.length} streets: each a name, a class, and its points in quarter metres of game space. */
export const STREETS =
${chunked(pack(streets))};
`;
writeFileSync(outPath, out);
console.log(`${lines.length} streets, ${pointCount} points, ${names.length} names; ${(out.length / 1024).toFixed(0)} KB written`);
