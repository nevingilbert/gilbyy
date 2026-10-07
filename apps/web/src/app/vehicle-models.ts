import * as THREE from "three";
import { Kit, lambert, tone } from "./garages";
import { PALETTE } from "./palette";
import type { Vehicle, VehicleId } from "./vehicles";

/**
 * The bodies of the eight rigs in vehicles.ts, built from boxes, cylinders and extrusions:
 * chunky, flat-shaded, a few strong colours (see docs/art-direction.md). Each reads as its
 * real counterpart without borrowing a badge or a trademarked grille.
 *
 * Body space: origin at the body centre (v.ride above the ground at rest), facing +z, so the
 * ground is at y = -v.ride. The right-hand side is -x, which is where the snorkel goes. The
 * wheels are the caller's: x = ±track/2, z = ±wheelbase/2, centre y = wheelRadius - ride. The
 * arches clear a stock tyre by 0.1 m, and tyres up to radius + 0.18 m and ~0.5 m wide once
 * the caller lifts the body to suit.
 *
 * Static parts are merged per material with Kit: a body is 10–16 draw calls, each extra 1–3.
 */
export type BodyParts = {
  /** The whole body except the wheels. Origin at the body centre; faces +z; the ground is at y = -vehicle.ride. */
  body: THREE.Group;
  /** Optional extras, already attached under `body` and hidden (visible = false); the caller toggles them. */
  extras: { snorkel: THREE.Object3D; fogLamps: THREE.Object3D; lightBar: THREE.Object3D; ditchLights: THREE.Object3D };
  /** Spotlight positions in body space: `low` between the headlights at their height, `high` at the light bar. */
  beams: { low: THREE.Vector3; high: THREE.Vector3 };
  /** Height of the highest point (roof, rack or bar) above the body centre, for a name tag. */
  top: number;
};

type Materials = { paint: THREE.Material; lamp: THREE.Material };
/** A point in a side profile: (z, y). */
type Pt = [number, number];
type V3 = [number, number, number];
/** A horizontal slice of a cabin at height y: half-width w, from z0 (back) to z1 (front). */
type Sec = { y: number; w: number; z0: number; z1: number };
type Arch = "round" | "square";

/** How far a skin (glass, seams) stands proud of the panel under it, so it never z-fights. */
const E = 0.012;

// --- Geometry. ---

/** A box with its corners moved: f maps each corner's signs to a point. Keep f increasing in each sign, or it renders inside out. */
function hexa(f: (sx: number, sy: number, sz: number) => V3) {
  const g = new THREE.BoxGeometry(2, 2, 2);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...f(Math.sign(p.getX(i)), Math.sign(p.getY(i)), Math.sign(p.getZ(i))));
  g.computeVertexNormals();
  return g;
}

/** The slice of the loft from a to b at height y. */
function cut(a: Sec, b: Sec, y: number): Sec {
  const t = (y - a.y) / (b.y - a.y);
  const mix = (p: number, q: number) => p + (q - p) * t;
  return { y, w: mix(a.w, b.w), z0: mix(a.z0, b.z0), z1: mix(a.z1, b.z1) };
}

/** A slice grown by dw at each side, dz0 at the back and dz1 at the front. */
const grow = (s: Sec, dw: number, dz0 = dw, dz1 = dz0): Sec => ({ y: s.y, w: s.w + dw, z0: s.z0 - dz0, z1: s.z1 + dz1 });

/** A box whose bottom face is slice a and top face slice b: a cabin with rake and tumblehome. */
const loft = (a: Sec, b: Sec) =>
  hexa((sx, sy, sz) => {
    const s = sy < 0 ? a : b;
    return [sx * s.w, s.y, sz < 0 ? s.z0 : s.z1];
  });

/** A side profile in (z, y), extruded across x from x0 to x1. */
function sideways(pts: Pt[], x0: number, x1: number) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(x1, 0, 0);
}

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const dist = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Lays a geometry built along `axis`, centred on the origin, between a and b. */
function span(g: THREE.BufferGeometry, axis: THREE.Vector3, a: V3, b: V3) {
  const pa = new THREE.Vector3(...a);
  const pb = new THREE.Vector3(...b);
  const d = pb.clone().sub(pa).normalize();
  if (d.dot(axis) < 0) d.negate();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axis, d));
  const m = pa.add(pb).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

/** A round tube from a to b, running `over` past each end so joints close up. */
const tube = (r: number, a: V3, b: V3, over = 0, segs = 8) => span(new THREE.CylinderGeometry(r, r, dist(a, b) + 2 * over, segs), Y, a, b);

/** A square rod from a to b: w across x (or along z, if it runs along x), h across the rest. */
const rod = (w: number, h: number, a: V3, b: V3, over = 0) => span(new THREE.BoxGeometry(w, h, dist(a, b) + 2 * over), Z, a, b);

// --- The kit every rig is built with. ---

class Rig {
  readonly k = new Kit();
  readonly body = new THREE.Group();
  readonly xk = { snorkel: new Kit(), fogLamps: new Kit(), lightBar: new Kit(), ditchLights: new Kit() };
  readonly paint: THREE.Material;
  readonly lamp: THREE.Material;
  readonly glass = lambert(PALETTE.carGlass);
  readonly trim = lambert(PALETTE.carTrim);
  readonly black = lambert(PALETTE.bumperBlack);
  readonly dark = lambert(PALETTE.doorDark);
  readonly chrome = lambert(PALETTE.chrome);
  readonly tail = lambert(PALETTE.tailLight);
  /** Half the overall length and width, and the roof height. */
  readonly F: number;
  readonly hw: number;
  readonly roof: number;
  /** Stock wheel centre height, and the axles' z (rear, front). */
  readonly wy: number;
  readonly axles: number[];
  /** Arch top and half the arch opening at the sill. A builder may raise T before cutting anything. */
  T: number;
  ah: number;
  /** Top of the flares over the front arch: the snorkel runs above it. */
  wing: number;
  top: number;
  readonly beams = { low: new THREE.Vector3(), high: new THREE.Vector3() };

  constructor(
    readonly v: Vehicle,
    m: Materials,
  ) {
    this.paint = m.paint;
    this.lamp = m.lamp;
    this.F = v.length / 2;
    this.hw = v.width / 2;
    this.roof = v.height - v.ride;
    this.wy = v.wheelRadius - v.ride;
    this.axles = [-v.wheelbase / 2, v.wheelbase / 2];
    this.T = this.wy + v.wheelRadius + 0.1;
    this.ah = v.wheelRadius + 0.2;
    this.wing = this.T;
    this.top = this.roof;
  }

  add(m: THREE.Material, g: THREE.BufferGeometry, k = this.k) {
    k.add(m, g, 0, 0, 0);
  }

  box(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, k = this.k) {
    k.box(m, w, h, d, x, y, z);
  }

  /** Runs fn for the left (+1) and right (-1) sides. */
  both(fn: (s: number) => void) {
    fn(1);
    fn(-1);
  }

  raise(y: number) {
    this.top = Math.max(this.top, y);
  }

  /** A box tapering in plan, for wraparound bumpers and noses: half-width w0 at z0, w1 at z1 (z0 < z1). */
  wedge(m: THREE.Material, w0: number, w1: number, y0: number, y1: number, z0: number, z1: number) {
    this.add(m, hexa((sx, sy, sz) => [sx * (sz < 0 ? w0 : w1), sy < 0 ? y0 : y1, sz < 0 ? z0 : z1]));
  }

  /** A wheel arch's opening at axle zc: from its back foot on the sill, over the top, to its front foot. */
  arch(zc: number, sill: number, style: Arch): Pt[] {
    const { T, ah: h } = this;
    const d = T - sill;
    if (style === "square") {
      const c = Math.min(0.14, d * 0.4), s = 0.07;
      return [[zc - h, sill], [zc - h + s, T - c], [zc - h + s + c, T], [zc + h - s - c, T], [zc + h - s, T - c], [zc + h, sill]];
    }
    const pts: Pt[] = [];
    const n = 8;
    if (d > h + 0.01) {
      // Taller than it is wide: straight legs under a semicircle.
      pts.push([zc - h, sill]);
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * (1 - i / n);
        pts.push([zc + h * Math.cos(a), T - h + h * Math.sin(a)]);
      }
      pts.push([zc + h, sill]);
    } else {
      // A flatter arc through both feet and the top.
      const R = (d * d + h * h) / (2 * d), yc = T - R, a0 = Math.asin((sill - yc) / R);
      for (let i = 0; i <= n; i++) {
        const a = Math.PI - a0 - (Math.PI - 2 * a0) * (i / n);
        pts.push([zc + R * Math.cos(a), yc + R * Math.sin(a)]);
      }
    }
    return pts;
  }

  /**
   * A side profile from its front-bottom corner, over the top, to its back-bottom corner (both on
   * the sill), extruded across x0..x1, with every arch that fits cut out of its underside and
   * lined in dark a hair inside the opening, so the paint never shows above the tyre.
   */
  slab(m: THREE.Material, outline: Pt[], x0: number, x1: number, style: Arch) {
    const [front, sill] = outline[0];
    const back = outline[outline.length - 1][0];
    const pts = [...outline];
    for (const zc of this.axles) {
      if (zc - this.ah <= back || zc + this.ah >= front) continue;
      pts.push(...this.arch(zc, sill, style));
      this.add(this.dark, sideways(this.band(zc, sill, style, -0.012, 0.05), x0 + 0.008, x1 - 0.008));
    }
    this.add(m, sideways(pts, x0, x1));
  }

  /** The band between the arch at axle zc pushed out by t0 and by t1 (negative: in toward the wheel), feet dropped below the sill. */
  band(zc: number, sill: number, style: Arch, t0: number, t1: number, drop = 0): Pt[] {
    const arch = this.arch(zc, sill, style);
    const n = arch.length - 1;
    const normal = (p: Pt, q: Pt): Pt => {
      const dz = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dz, dy);
      return [-dy / l, dz / l];
    };
    // Offset away from the wheel along the mitred normals of the neighbouring edges.
    const offset = (t: number) =>
      arch.map(([z, y], i): Pt => {
        if (i === 0) return [z - t, y];
        if (i === n) return [z + t, y];
        const a = normal(arch[i - 1], arch[i]), b = normal(arch[i], arch[i + 1]);
        const mz = a[0] + b[0], my = a[1] + b[1], l = Math.hypot(mz, my);
        const k = t / Math.max(0.5, (mz * a[0] + my * a[1]) / l);
        return [z + (mz / l) * k, y + (my / l) * k];
      });
    const inner = offset(t0), outer = offset(t1);
    const low = (p: Pt): Pt => [p[0], p[1] - drop];
    const back = [...outer].reverse();
    return drop > 0 ? [low(inner[0]), ...inner, low(inner[n]), low(outer[n]), ...back, low(outer[0])] : [...inner, ...back];
  }

  /** A band t wide round each arch, from x0 out to x1 on both sides, its feet dropped below the sill. */
  flares(m: THREE.Material, style: Arch, sill: number, t: number, x0: number, x1: number, drop = 0) {
    for (const zc of this.axles) {
      const band = this.band(zc, sill, style, 0, t, drop);
      this.both((s) => this.add(m, s > 0 ? sideways(band, x0, x1) : sideways(band, -x1, -x0)));
    }
    this.wing = Math.max(this.wing, this.T + t);
  }


  /** Dark wheel wells across the car between the tyres, so you never see through it. */
  liners(sill: number, inset = 0.38, axles = this.axles) {
    const x = this.v.track / 2 - inset;
    for (const zc of axles) this.box(this.dark, 2 * x, this.T - sill + 0.02, 2 * this.ah, 0, (this.T + sill) / 2, zc);
  }

  /** Side windows between heights y0 and y1, stopping pf short of the front and pr of the back (the A and D pillars). */
  sideGlass(a: Sec, b: Sec, y0: number, y1: number, pf: number, pr: number) {
    const g = (y: number) => grow(cut(a, b, y), E, -pr, -pf);
    this.add(this.glass, loft(g(y0), g(y1)));
  }

  /** The windscreen (end 1) or rear glass (end -1), inset from the cabin's sides. */
  endGlass(a: Sec, b: Sec, y0: number, y1: number, inset: number, end: number) {
    const g = (y: number): Sec => {
      const s = cut(a, b, y), mid = (s.z0 + s.z1) / 2;
      return { y, w: s.w - inset, z0: end > 0 ? mid : s.z0 - E, z1: end > 0 ? s.z1 + E : mid };
    };
    this.add(this.glass, loft(g(y0), g(y1)));
  }

  /** Glass all the way round, corners included, so the roof floats. */
  glassBand(a: Sec, b: Sec, y0: number, y1: number) {
    const g = (y: number) => grow(cut(a, b, y), E);
    this.add(this.glass, loft(g(y0), g(y1)));
  }

  /** A pillar over the side glass, both sides: `width` long, centred at zLo at the bottom and zHi at the top. */
  pillar(m: THREE.Material, a: Sec, b: Sec, y0: number, y1: number, width: number, zLo: number, zHi = zLo) {
    const lo = cut(a, b, y0), hi = cut(a, b, y1);
    this.both((s) =>
      this.add(
        m,
        hexa((sx, sy, sz) => {
          const sec = sy < 0 ? lo : hi;
          const outer = sec.w + 2 * E, inner = sec.w - 0.04;
          return [s > 0 ? (sx > 0 ? outer : inner) : sx > 0 ? -inner : -outer, sec.y, (sy < 0 ? zLo : zHi) + (sz * width) / 2];
        }),
      ),
    );
  }

  /** A panel gap along (z, y) points, on both flanks of a side at half-width x. */
  seam(x: number, pts: Pt[]) {
    for (let i = 1; i < pts.length; i++) {
      const [[z0, y0], [z1, y1]] = [pts[i - 1], pts[i]];
      this.both((s) => this.add(this.dark, rod(0.012, 0.016, [s * (x + 0.002), y0, z0], [s * (x + 0.002), y1, z1], 0.006)));
    }
  }

  /** Door mirrors on short arms out from the cabin side x. */
  mirrors(x: number, y: number, z: number, head: THREE.Material = this.black, size = 1) {
    this.both((s) => {
      const hx = s * (x + 0.1 + 0.1 * size);
      this.box(this.black, 0.14, 0.05, 0.07, s * (x + 0.05), y, z);
      this.box(head, 0.2 * size, 0.15 * size, 0.09, hx, y + 0.05, z);
      this.box(this.glass, 0.16 * size, 0.11 * size, 0.01, hx, y + 0.05, z - 0.046);
    });
  }

  /** A rectangular lamp in a bezel, on a face looking along +z (end 1) or -z (end -1). */
  lampBox(m: THREE.Material, w: number, h: number, x: number, y: number, z: number, end = 1, bezel: THREE.Material | null = this.black) {
    if (bezel) this.box(bezel, w + 0.04, h + 0.04, 0.03, x, y, z + end * 0.008);
    this.box(m, w, h, 0.03, x, y, z + end * 0.02);
  }

  /** Wipers parked along the bottom of the windscreen, centred at each x. */
  wipers(a: Sec, b: Sec, y: number, xs: number[], len: number) {
    const lo = cut(a, b, y), hi = cut(a, b, y + 0.05);
    for (const x of xs) this.add(this.black, rod(0.02, 0.02, [x - len / 2, y, lo.z1 + 0.025], [x + len / 2, y + 0.05, hi.z1 + 0.025]));
  }

  /** A spare hung on a rear face at z, standing off behind it. */
  spare(x: number, y: number, z: number, rad: number) {
    this.k.cyl(lambert(PALETTE.tyre), rad, 0.22, x, y, z - 0.14, Math.PI / 2, 0, 14);
    this.k.cyl(lambert(PALETTE.rim), rad * 0.55, 0.23, x, y, z - 0.14, Math.PI / 2, 0, 10);
    this.box(this.dark, 0.2, 0.2, 0.05, x, y, z - 0.02);
  }

  // --- The four extras. ---

  /** Up the right A-pillar: out of the wing above the front arch, up the pillar, to a ram head facing forward. */
  snorkel(a: Sec, b: Sec, side: number, belt: number, topY = b.y - 0.1) {
    const k = this.xk.snorkel, o = 0.075;
    const base = cut(a, b, belt + 0.05), top = cut(a, b, topY);
    const p0: V3 = [-(side + o), Math.min(this.wing + 0.07, belt - 0.06), base.z1 + 0.15];
    const p1: V3 = [-(base.w + o), base.y, base.z1 - 0.03];
    const p2: V3 = [-(top.w + o), top.y, top.z1 - 0.07];
    this.add(this.trim, tube(0.065, [-(side - 0.04), p0[1], p0[2]], p0, 0.03), k);
    this.add(this.trim, tube(0.06, p0, p1, 0.05), k);
    this.add(this.trim, tube(0.06, p1, p2, 0.05), k);
    this.add(this.trim, tube(0.075, lerp3(p1, p2, 0.45), lerp3(p1, p2, 0.52)), k);
    this.box(this.trim, 0.16, 0.16, 0.28, p2[0], p2[1] + 0.08, p2[2] + 0.05, k);
    this.box(this.dark, 0.12, 0.1, 0.02, p2[0], p2[1] + 0.08, p2[2] + 0.19, k);
    this.raise(p2[1] + 0.16);
  }

  /** A pair of round lamps set into the front bumper, their bezels starting at z. */
  fogLamps(dx: number, y: number, z: number, rad = 0.085) {
    const k = this.xk.fogLamps;
    this.both((s) => {
      k.cyl(this.black, rad + 0.025, 0.08, s * dx, y, z + 0.04, Math.PI / 2, 0, 12);
      k.cyl(this.lamp, rad, 0.02, s * dx, y, z + 0.085, Math.PI / 2, 0, 12);
    });
  }

  /** A bar `w` wide centred at (0, y, z), on two feet standing on `foot`. Sets the high beam. */
  lightBar(w: number, y: number, z: number, foot: number) {
    const k = this.xk.lightBar, housing = lambert(PALETTE.lightBar);
    k.box(housing, w, 0.14, 0.14, 0, y, z);
    k.box(this.lamp, w - 0.1, 0.08, 0.03, 0, y, z + 0.07);
    for (let i = 1; i < 6; i++) k.box(housing, 0.02, 0.09, 0.035, -w / 2 + 0.05 + ((w - 0.1) * i) / 6, y, z + 0.075);
    this.both((s) => k.box(housing, 0.05, y - foot, 0.1, s * (w / 2 - 0.12), (y + foot) / 2, z - 0.02));
    this.beams.high.set(0, y, z + 0.12);
    this.raise(y + 0.07);
  }

  /** Pods on stalks at the base of both A-pillars, standing on the bonnet at height `hood`. */
  ditchLights(a: Sec, b: Sec, belt: number, hood = belt) {
    const k = this.xk.ditchLights, base = cut(a, b, belt + 0.02);
    this.both((s) => {
      const x = s * (base.w - 0.07), z = base.z1 + 0.07;
      k.box(this.black, 0.04, 0.1, 0.04, x, hood + 0.05, z);
      k.box(this.black, 0.13, 0.12, 0.1, x, hood + 0.14, z);
      k.box(this.lamp, 0.1, 0.09, 0.02, x, hood + 0.14, z + 0.055);
    });
  }

  finish(): BodyParts {
    this.k.build(this.body);
    const hidden = (k: Kit) => {
      const g = k.build(new THREE.Group());
      g.visible = false;
      this.body.add(g);
      return g;
    };
    const { snorkel, fogLamps, lightBar, ditchLights } = this.xk;
    const extras = { snorkel: hidden(snorkel), fogLamps: hidden(fogLamps), lightBar: hidden(lightBar), ditchLights: hidden(ditchLights) };
    return { body: this.body, extras, beams: this.beams, top: this.top };
  }
}

type BedSpec = { front: number; back: number; top: number; floor: number; sill: number; side: number; style: Arch; inset?: number };

/** A pickup's open bed: thin walls with the rear arch cut, rail caps, headboard, corner posts, tailgate, floor, wheel tubs. */
function bed(r: Rig, { front, back, top, floor, sill, side, style, inset = 0.38 }: BedSpec) {
  const wall = 0.06, post = 0.12, len = front - back, mid = (front + back) / 2;
  const outline: Pt[] = [[front, sill], [front, top], [back, top], [back, sill]];
  r.slab(r.paint, outline, side - wall, side, style);
  r.slab(r.paint, outline, -side, -side + wall, style);
  r.both((s) => {
    r.box(r.paint, wall + 0.03, 0.03, len, s * (side - wall / 2 + 0.005), top + 0.015, mid);
    r.box(r.paint, post, top - sill - 0.04, 0.07, s * (side - post / 2), (top + sill + 0.04) / 2, back + 0.035);
  });
  r.box(r.paint, 2 * side, top - floor, 0.06, 0, (top + floor) / 2, front - 0.03);
  r.box(r.paint, 2 * (side - post), top - sill - 0.11, 0.05, 0, (top + sill + 0.11) / 2, back + 0.025);
  r.box(r.dark, 2 * (side - post) - 0.04, 0.014, 0.01, 0, top - 0.03, back - 0.002);
  r.box(r.black, 0.26, 0.05, 0.03, 0, top - 0.09, back - 0.01);
  r.box(r.dark, 2 * (side - wall), 0.03, len - 0.08, 0, floor, mid);
  // Wheel tubs over the rear arch, and the well between them.
  const zc = r.axles[0], x = r.v.track / 2 - inset, tubTop = r.T + 0.08;
  r.both((s) => r.box(r.dark, side - wall - x, tubTop - floor, 2 * (r.ah - 0.04), (s * (x + side - wall)) / 2, (tubTop + floor) / 2, zc));
  r.liners(sill, inset, [zc]);
  // The gap between cab and bed.
  r.box(r.dark, 2 * side - 0.1, top - sill - 0.08, 0.08, 0, (top + sill) / 2, front + 0.03);
}

// --- The eight rigs. ---

/** 1984–2001 Jeep Cherokee (XJ): small, boxy, slab-sided, black plastic everywhere it might get hit. */
function ridgeback(r: Rig) {
  const { F, roof } = r;
  const sill = -0.58, belt = 0, side = 0.86, cowl = 0.82, zf = F - 0.14, zr = -F + 0.12;
  r.slab(r.paint, [[zf, sill], [zf, -0.08], [zf - 0.05, -0.04], [cowl, belt], [zr, belt], [zr, sill]], -side, side, "round");
  r.liners(sill);
  r.flares(r.black, "round", sill, 0.07, side - 0.02, r.hw, 0.03);
  const a: Sec = { y: belt - 0.02, w: side - 0.02, z0: zr + 0.01, z1: cowl + 0.02 };
  const b: Sec = { y: roof, w: side - 0.12, z0: zr + 0.05, z1: 0.27 };
  r.add(r.paint, loft(a, b));
  r.sideGlass(a, b, belt + 0.07, roof - 0.1, 0.08, 0.1);
  r.endGlass(a, b, belt + 0.06, roof - 0.09, 0.08, 1);
  r.endGlass(a, b, belt + 0.12, roof - 0.12, 0.13, -1);
  r.pillar(r.black, a, b, belt + 0.05, roof - 0.08, 0.09, -0.18);
  r.pillar(r.black, a, b, belt + 0.05, roof - 0.08, 0.05, -0.98);
  r.wipers(a, b, belt + 0.08, [-0.3, 0.32], 0.48);
  // Thin roof rails.
  r.both((s) => {
    r.box(r.black, 0.04, 0.035, 2.0, s * 0.6, roof + 0.055, -0.85);
    for (const z of [0.12, -0.85, -1.82]) r.box(r.black, 0.06, 0.05, 0.12, s * 0.6, roof + 0.025, z);
  });
  r.raise(roof + 0.075);
  // Square lamps either side of a horizontal-bar grille; black wraparound bumpers.
  const ly = -0.19;
  r.both((s) => r.lampBox(r.lamp, 0.21, 0.18, s * 0.62, ly, zf));
  r.box(r.black, 0.84, 0.2, 0.03, 0, ly, zf + 0.01);
  for (const dy of [-0.055, 0, 0.055]) r.box(r.chrome, 0.78, 0.022, 0.02, 0, ly + dy, zf + 0.032);
  r.beams.low.set(0, ly, zf + 0.06);
  for (const z of [F - 0.08, -F + 0.08]) r.box(r.black, 2 * side + 0.04, 0.2, 0.16, 0, -0.43, z);
  r.both((s) => {
    for (const z of [zf - 0.04, zr + 0.06]) r.box(r.black, 0.05, 0.2, 0.14, s * (side + 0.005), -0.43, z);
    r.box(r.lamp, 0.16, 0.05, 0.02, s * 0.62, -0.38, F + 0.002);
  });
  // Tall tail lamps at the corners, tailgate seams and handle.
  r.both((s) => {
    r.lampBox(r.tail, 0.12, 0.34, s * 0.76, -0.17, zr, -1);
    r.box(r.dark, 0.014, 0.3, 0.01, s * 0.66, -0.17, zr - 0.004);
  });
  r.box(r.black, 0.22, 0.05, 0.03, 0, -0.07, zr - 0.012);
  // Black sills between the arches, door seams and handles, mirrors.
  const gap = r.axles[1] - r.ah;
  r.both((s) => r.box(r.black, 0.03, 0.1, 2 * gap - 0.04, s * (side + 0.005), sill + 0.05, 0));
  r.seam(side, [[cowl - 0.06, sill + 0.11], [cowl - 0.06, belt - 0.01]]);
  r.seam(side, [[-0.18, sill + 0.11], [-0.18, belt - 0.01]]);
  r.seam(side, [[-0.66, sill + 0.11], [-0.66, r.T + 0.06], [-0.98, belt - 0.01]]);
  r.both((s) => {
    for (const z of [-0.05, -0.55]) r.box(r.black, 0.02, 0.035, 0.12, s * (side + 0.01), -0.09, z);
  });
  r.mirrors(a.w - 0.01, belt + 0.1, cowl - 0.2);

  r.snorkel(a, b, side, belt);
  r.fogLamps(0.5, -0.43, F - 0.05);
  r.lightBar(1.3, roof + 0.12, b.z1 - 0.14, roof);
  r.ditchLights(a, b, belt);
}

/** 2007–2014 Toyota FJ Cruiser: round lamps, a short upright screen, a white lid, chunky arches, spare on the side-hinged back door. */
function bluff(r: Rig) {
  const { F, roof } = r;
  const sill = -0.6, belt = 0.1, side = 0.86, cowl = 0.86, zf = F - 0.16, zr = -F + 0.28, nose = zf - 0.16;
  r.slab(r.paint, [[nose, sill], [nose, 0.03], [cowl, belt], [zr, belt], [zr, sill]], -side, side, "round");
  // A nose that rounds off in plan and over the top.
  r.add(
    r.paint,
    hexa((sx, sy, sz) => {
      const front = sz > 0;
      const y = sy > 0 ? (front ? -0.04 : 0.025) : front ? sill + 0.1 : sill;
      return [sx * (front ? side - 0.14 : side), y, front ? zf : nose - 0.02];
    }),
  );
  r.liners(sill);
  r.flares(r.black, "round", sill, 0.12, side - 0.02, r.hw, 0.04);
  const a: Sec = { y: belt - 0.02, w: side - 0.03, z0: zr + 0.01, z1: cowl + 0.005 };
  const b: Sec = { y: roof - 0.11, w: side - 0.1, z0: zr + 0.01, z1: 0.74 };
  r.add(r.paint, loft(a, b));
  // The white lid, overhanging like a visor at the front.
  r.add(lambert(PALETTE.carRoof), loft(grow(b, 0.035, 0.035, 0.1), grow({ ...b, y: roof }, 0.02, 0.025, 0.08)));
  r.sideGlass(a, b, belt + 0.06, b.y - 0.05, 0.07, 0.08);
  r.endGlass(a, b, belt + 0.05, b.y - 0.04, 0.07, 1);
  r.endGlass(a, b, belt + 0.1, b.y - 0.07, 0.24, -1);
  r.pillar(r.paint, a, b, belt + 0.05, b.y - 0.03, 0.1, -0.17);
  r.pillar(r.paint, a, b, belt + 0.05, b.y - 0.03, 0.66, -1.06);
  r.wipers(a, b, belt + 0.07, [-0.5, 0, 0.5], 0.34);
  // Round lamps in chrome rings either side of a wide grille.
  const ly = -0.2;
  r.both((s) => {
    r.k.cyl(r.chrome, 0.15, 0.04, s * 0.54, ly, zf + 0.01, Math.PI / 2, 0, 14);
    r.k.cyl(r.lamp, 0.12, 0.04, s * 0.54, ly, zf + 0.03, Math.PI / 2, 0, 14);
  });
  r.box(r.black, 0.66, 0.2, 0.03, 0, ly, zf + 0.01);
  for (const dy of [-0.04, 0.04]) r.box(r.chrome, 0.62, 0.03, 0.02, 0, ly + dy, zf + 0.03);
  r.beams.low.set(0, ly, zf + 0.07);
  r.wedge(r.black, side + 0.01, side - 0.1, -0.58, -0.34, zf - 0.06, F);
  r.both((s) => r.box(r.lamp, 0.14, 0.05, 0.02, s * 0.62, -0.4, F + 0.004));
  // Tail lamps high on the corners, spare on the door, hinges on the right.
  const tl = cut(a, b, belt + 0.22);
  r.both((s) => r.lampBox(r.tail, 0.09, 0.32, s * (tl.w - 0.075), belt + 0.22, zr + 0.01, -1));
  r.spare(0.06, -0.22, zr, r.v.wheelRadius * 0.92);
  for (const y of [-0.38, belt - 0.04]) r.box(r.black, 0.08, 0.07, 0.03, -0.76, y, zr - 0.012);
  r.box(r.black, 0.04, 0.12, 0.03, 0.72, -0.1, zr - 0.012);
  r.wedge(r.black, side - 0.08, side + 0.01, -0.6, -0.38, zr - 0.18, zr + 0.04);
  // Black rockers, door seams, a handle, big mirrors.
  const gap = r.axles[1] - r.ah;
  r.both((s) => r.box(r.black, 0.03, 0.1, 2 * gap - 0.04, s * (side + 0.005), sill + 0.05, 0));
  for (const z of [0.7, -0.17, -0.7]) r.seam(side, [[z, sill + 0.11], [z, belt - 0.01]]);
  r.both((s) => r.box(r.black, 0.02, 0.035, 0.12, s * (side + 0.01), belt - 0.1, -0.05));
  r.mirrors(a.w, belt + 0.1, cowl - 0.2, r.black, 1.15);

  r.snorkel(a, b, side, belt);
  r.fogLamps(0.56, -0.46, F - 0.05);
  r.lightBar(1.4, roof + 0.1, b.z1 - 0.06, roof);
  r.ditchLights(a, b, belt);
}

/** 1980s Toyota Pickup/Hilux 4x4: small single cab, flat bonnet, chrome bumpers, a stake-sided bed with gear in it. */
function mule(r: Rig) {
  const { F, roof } = r;
  const sill = -0.55, belt = 0, side = 0.83, cowl = 0.6, cab = -0.6, zf = F - 0.12, back = -F + 0.06, bedTop = 0.04, floor = -0.3;
  r.slab(r.paint, [[zf, sill], [zf, -0.05], [zf - 0.03, -0.03], [cowl, belt - 0.01], [cab, belt], [cab, sill]], -side, side, "round");
  r.liners(sill, 0.38, [r.axles[1]]);
  const a: Sec = { y: belt - 0.02, w: side - 0.03, z0: cab + 0.01, z1: cowl + 0.01 };
  const b: Sec = { y: roof, w: side - 0.1, z0: cab + 0.04, z1: 0.24 };
  r.add(r.paint, loft(a, b));
  r.sideGlass(a, b, belt + 0.06, roof - 0.09, 0.07, 0.09);
  r.endGlass(a, b, belt + 0.06, roof - 0.08, 0.07, 1);
  r.endGlass(a, b, belt + 0.14, roof - 0.13, 0.26, -1);
  r.wipers(a, b, belt + 0.08, [-0.28, 0.3], 0.46);
  bed(r, { front: cab - 0.06, back, top: bedTop, floor, sill, side, style: "round" });
  r.flares(r.black, "round", sill, 0.05, side - 0.02, r.hw, 0.02);
  // Rectangular lamps in a chrome-framed grille; chrome bumper with a rubber strip.
  const ly = -0.17;
  r.box(r.chrome, 1.5, 0.25, 0.02, 0, ly, zf + 0.005);
  r.box(r.black, 1.44, 0.19, 0.02, 0, ly, zf + 0.015);
  for (const dy of [-0.045, 0.045]) r.box(r.trim, 0.8, 0.025, 0.02, 0, ly + dy, zf + 0.03);
  r.both((s) => {
    r.lampBox(r.lamp, 0.24, 0.13, s * 0.56, ly, zf + 0.012, 1, null);
    r.box(r.lamp, 0.14, 0.04, 0.02, s * 0.6, -0.32, zf + 0.01);
  });
  r.beams.low.set(0, ly, zf + 0.06);
  r.box(r.chrome, 2 * side + 0.06, 0.15, 0.14, 0, -0.42, F - 0.07);
  r.box(r.black, 2 * side + 0.07, 0.035, 0.145, 0, -0.42, F - 0.07);
  r.box(r.black, 1.3, 0.07, 0.05, 0, -0.53, zf - 0.02);
  // Door seams, a handle, chrome mirrors.
  r.seam(side, [[cowl + 0.06, sill + 0.06], [cowl + 0.06, belt - 0.01]]);
  r.seam(side, [[cab + 0.08, sill + 0.06], [cab + 0.08, belt - 0.01]]);
  r.both((s) => r.box(r.black, 0.02, 0.035, 0.12, s * (side + 0.01), -0.09, cab + 0.2));
  r.mirrors(a.w, belt + 0.1, cowl - 0.18, r.chrome);
  // Roll bar behind the cab.
  const bz = cab - 0.2, hoop = roof - 0.04;
  r.both((s) => {
    r.add(r.black, tube(0.04, [s * (side - 0.09), bedTop, bz], [s * (side - 0.1), hoop, bz], 0.03));
    r.add(r.black, tube(0.03, [s * (side - 0.1), hoop - 0.04, bz], [s * (side - 0.07), bedTop + 0.02, bz - 0.6], 0.02));
  });
  r.add(r.black, tube(0.04, [-(side - 0.1), hoop, bz], [side - 0.1, hoop, bz], 0.04));
  // Stakes and a plank along each side, a crate and a kit bag in the bed.
  const wood = lambert(PALETTE.timber), woodDark = lambert(tone(PALETTE.timber, 0.7));
  r.both((s) => {
    for (const z of [-1.05, -1.95]) r.box(wood, 0.05, 0.43, 0.06, s * (side - 0.03), bedTop + 0.165, z);
    r.box(wood, 0.04, 0.1, 1.1, s * (side - 0.03), bedTop + 0.3, -1.5);
  });
  r.k.box(wood, 0.42, 0.42, 0.42, 0.05, floor + 0.225, -1.8, 0, 0.25);
  r.k.box(woodDark, 0.44, 0.08, 0.44, 0.05, floor + 0.225, -1.8, 0, 0.25);
  r.k.box(lambert(PALETTE.luggage[1]), 0.5, 0.26, 0.36, 0, floor + 0.145, -1.02, 0, -0.15);
  // Tail lamps on the bed's corner posts, a chrome step bumper.
  r.both((s) => r.lampBox(r.tail, 0.08, 0.24, s * (side - 0.06), -0.2, back, -1));
  r.box(r.chrome, 2 * side + 0.04, 0.14, 0.16, 0, -0.44, -F + 0.08);

  r.snorkel(a, b, side, belt);
  r.fogLamps(0.42, -0.42, F - 0.05, 0.075);
  r.lightBar(1.2, roof + 0.1, b.z1 - 0.14, roof);
  r.ditchLights(a, b, belt);
}

/** Land Cruiser 70-series: today's red overlander, cream roof, roof rack and luggage, bull bar, spare on the barn doors. */
function overlander(r: Rig) {
  const { F, roof } = r;
  const sill = -0.62, belt = 0.07, side = 0.92, cowl = 0.8, zf = F - 0.18, zr = -F + 0.25, hood = 0.2;
  r.slab(r.paint, [[zf, sill], [zf, belt], [zr, belt], [zr, sill]], -side, side, "square");
  r.liners(sill);
  r.flares(r.trim, "square", sill, 0.1, side - 0.02, r.hw, 0.04);
  // The bonnet sits proud of the wings, as on today's truck.
  r.box(r.paint, 2 * (side - 0.04), hood - 0.05, zf - cowl + 0.08, 0, (hood + 0.05) / 2, (zf - 0.02 + cowl - 0.1) / 2);
  const a: Sec = { y: belt - 0.02, w: side - 0.03, z0: zr, z1: cowl };
  const b: Sec = { y: roof - 0.07, w: side - 0.05, z0: zr, z1: cowl - 0.05 };
  r.add(r.paint, loft(a, b));
  r.add(lambert(PALETTE.carRoof), loft(grow(b, 0.03), grow({ ...b, y: roof }, 0.03)));
  const g0 = hood + 0.06, g1 = roof - 0.15;
  r.sideGlass(a, b, g0, g1, 0.1, 0.12);
  r.endGlass(a, b, g0, g1, 0.11, 1);
  r.endGlass(a, b, g0, g1, 0.1, -1);
  r.pillar(r.paint, a, b, g0 - 0.01, g1 + 0.01, 0.1, -0.22);
  r.pillar(r.paint, a, b, g0 - 0.01, g1 + 0.01, 0.12, -1.1);
  r.wipers(a, b, g0 + 0.02, [-0.36, 0.34], 0.5);
  // Rectangular lamps, a slatted grille, a tube bull bar in front of both.
  const ly = -0.12;
  r.box(r.black, 0.84, 0.22, 0.03, 0, ly, zf + 0.01);
  for (const dy of [-0.06, 0, 0.06]) r.box(r.trim, 0.8, 0.03, 0.02, 0, ly + dy, zf + 0.03);
  r.both((s) => r.lampBox(r.lamp, 0.28, 0.18, s * 0.64, ly, zf));
  r.beams.low.set(0, ly, F + 0.02);
  const bb = F - 0.08, t = 0.035;
  r.both((s) => {
    r.add(r.trim, tube(t, [s * 0.36, -0.4, bb], [s * 0.36, 0.12, bb], t));
    r.add(r.trim, tube(t, [s * 0.36, 0.08, bb], [s * 0.84, -0.02, bb - 0.05], t));
    r.add(r.trim, tube(t, [s * 0.84, -0.02, bb - 0.05], [s * 0.86, -0.4, bb - 0.05], t));
  });
  r.add(r.trim, tube(t, [-0.36, 0.12, bb], [0.36, 0.12, bb], t));
  r.box(r.trim, 0.72, 0.16, 0.04, 0, -0.32, bb);
  for (const z of [F - 0.09, zr - 0.1]) r.box(r.trim, 2 * side + 0.06, 0.2, 0.18, 0, -0.5, z);
  // Roof rack with a rail round it, and the luggage from the trailers.
  const ry = roof + 0.1, rz = -0.55, rl = 2.3, rw = 1.7, rt = ry + 0.025;
  r.box(r.trim, rw, 0.05, rl, 0, ry, rz);
  r.both((s) => {
    r.box(r.trim, 0.05, 0.05, rl, (s * rw) / 2, ry + 0.05, rz);
    r.box(r.trim, rw, 0.05, 0.05, 0, ry + 0.05, rz + (s * rl) / 2);
    for (const z of [rz + rl / 2 - 0.1, rz, rz - rl / 2 + 0.1]) r.box(r.trim, 0.06, 0.12, 0.08, s * (rw / 2 - 0.02), roof + 0.04, z);
  });
  const bags: [number, number, number, number, number][] = [[0.8, 0.4, 0.9, -0.38, -0.05], [0.7, 0.34, 0.8, 0.4, -0.25], [1.4, 0.3, 0.55, 0, -1.25]];
  bags.forEach(([w, h, d, x, z], i) => {
    r.box(lambert(PALETTE.luggage[i]), w, h, d, x, rt + h / 2, z);
    r.box(r.dark, w + 0.02, h + 0.02, 0.05, x, rt + h / 2, z);
    r.raise(rt + h);
  });
  // Barn doors at the back, the spare on the bigger one, small tail lamps low on the corners.
  r.box(r.paint, 0.06, g1 - g0 + 0.02, 0.03, -0.28, (g0 + g1) / 2, zr - 0.012);
  r.box(r.dark, 0.014, belt + 0.4, 0.01, -0.28, (belt - 0.4) / 2, zr - 0.004);
  r.spare(0.2, 0.05, zr, r.v.wheelRadius * 0.9);
  r.both((s) => r.lampBox(r.tail, 0.12, 0.22, s * 0.8, -0.26, zr, -1));
  // Door seams, handles, mirrors.
  r.seam(side, [[cowl - 0.04, r.T + 0.1], [cowl - 0.04, belt - 0.01]]);
  r.seam(side, [[-0.22, sill + 0.06], [-0.22, belt - 0.01]]);
  r.seam(side, [[-0.62, sill + 0.06], [-0.62, belt - 0.01]]);
  r.both((s) => {
    for (const z of [-0.08, -0.48]) r.box(r.black, 0.02, 0.035, 0.12, s * (side + 0.01), belt - 0.1, z);
  });
  r.mirrors(a.w, hood + 0.06, cowl - 0.2);

  r.snorkel(a, b, side, belt, roof - 0.16);
  r.fogLamps(0.45, -0.5, F - 0.05, 0.1);
  r.lightBar(1.5, ry + 0.12, rz + rl / 2 + 0.06, ry);
  r.ditchLights(a, b, hood, hood);
}

/** Toyota Tundra: a full-size crew cab, tall bonnet, a wall of chrome grille, a long bed and a tow hitch. */
function prairie(r: Rig) {
  const { F, roof } = r;
  const sill = -0.7, belt = 0.12, side = 1.0, cowl = 1.2, cab = -1.02, zf = F - 0.2, back = -F + 0.1;
  r.slab(r.paint, [[zf, sill], [zf, 0.0], [zf - 0.1, 0.06], [cowl, belt - 0.01], [cab, belt], [cab, sill]], -side, side, "square");
  r.liners(sill, 0.38, [r.axles[1]]);
  r.add(r.paint, rod(0.9, 0.06, [0, 0.07, zf - 0.15], [0, belt - 0.005, cowl + 0.08]));
  const a: Sec = { y: belt - 0.02, w: side - 0.03, z0: cab + 0.01, z1: cowl + 0.01 };
  const b: Sec = { y: roof, w: side - 0.15, z0: cab + 0.06, z1: 0.6 };
  r.add(r.paint, loft(a, b));
  r.sideGlass(a, b, belt + 0.06, roof - 0.1, 0.08, 0.1);
  r.endGlass(a, b, belt + 0.06, roof - 0.09, 0.09, 1);
  r.endGlass(a, b, belt + 0.1, roof - 0.13, 0.2, -1);
  r.pillar(r.black, a, b, belt + 0.05, roof - 0.08, 0.1, 0.06);
  r.wipers(a, b, belt + 0.08, [-0.36, 0.36], 0.56);
  r.box(r.tail, 0.3, 0.05, 0.03, 0, roof - 0.04, b.z0 - 0.005);
  bed(r, { front: cab - 0.06, back, top: belt - 0.02, floor: -0.32, sill, side, style: "square" });
  r.flares(r.paint, "square", sill, 0.08, side - 0.02, r.hw);
  // A big chrome-framed grille with heavy bars, lamps beside it.
  const gy = -0.23;
  r.box(r.chrome, 1.16, 0.44, 0.03, 0, gy, zf + 0.01);
  r.box(r.black, 1.04, 0.34, 0.03, 0, gy, zf + 0.025);
  for (const dy of [-0.12, -0.04, 0.04, 0.12]) r.box(r.chrome, 1.0, 0.035, 0.02, 0, gy + dy, zf + 0.04);
  r.both((s) => r.lampBox(r.lamp, 0.3, 0.15, s * 0.8, -0.08, zf));
  r.beams.low.set(0, -0.08, zf + 0.06);
  r.wedge(r.chrome, side + 0.02, side - 0.08, -0.6, -0.42, zf - 0.08, F);
  r.wedge(r.black, side - 0.04, side - 0.16, -0.74, -0.6, zf - 0.06, F - 0.03);
  // Tall tail lamps on the bed posts, chrome step bumper, tow hitch.
  r.both((s) => r.lampBox(r.tail, 0.09, 0.4, s * (side - 0.06), -0.12, back, -1));
  r.box(r.chrome, 2 * side, 0.2, 0.18, 0, -0.6, -F + 0.14);
  r.box(r.black, 1.3, 0.025, 0.12, 0, -0.49, -F + 0.13);
  r.box(r.black, 0.09, 0.09, 0.22, 0, -0.66, -F + 0.11);
  r.box(r.chrome, 0.06, 0.035, 0.1, 0, -0.64, -F + 0.04);
  r.k.cyl(r.chrome, 0.045, 0.07, 0, -0.59, -F + 0.04, 0, 0, 8);
  // Door seams, chrome handles, towing mirrors.
  for (const z of [cowl - 0.04, 0.06, cab + 0.07]) r.seam(side, [[z, sill + 0.06], [z, belt - 0.01]]);
  r.both((s) => {
    for (const z of [0.2, -0.86]) r.box(r.chrome, 0.025, 0.04, 0.16, s * (side + 0.01), belt - 0.12, z);
  });
  r.mirrors(a.w, belt + 0.12, cowl - 0.2, r.black, 1.25);

  r.snorkel(a, b, side, belt);
  r.fogLamps(0.66, -0.67, F - 0.08, 0.06);
  r.lightBar(1.5, roof + 0.1, b.z1 - 0.14, roof);
  r.ditchLights(a, b, belt);
}

/** Range Rover: clamshell bonnet, a floating roof over blacked-out pillars, slim lamps, smooth sides, a little chrome. */
function highland(r: Rig) {
  const { F, roof } = r;
  const sill = -0.68, belt = 0.04, side = 0.99, cowl = 1.12, zf = F - 0.13, zr = -F + 0.11;
  r.slab(r.paint, [[zf, sill], [zf, -0.07], [zf - 0.1, 0.0], [cowl, belt], [zr + 0.04, belt], [zr, belt - 0.05], [zr, sill]], -side, side, "round");
  r.liners(sill);
  const a: Sec = { y: belt - 0.02, w: side - 0.05, z0: zr + 0.03, z1: cowl + 0.01 };
  const b: Sec = { y: roof - 0.07, w: side - 0.16, z0: zr + 0.2, z1: 0.42 };
  r.add(r.paint, loft(a, b));
  r.glassBand(a, b, belt + 0.04, b.y);
  r.pillar(r.black, a, b, belt + 0.03, b.y, 0.1, 0.0);
  r.pillar(r.black, a, b, belt + 0.03, b.y, 0.09, -1.02);
  r.add(r.paint, loft(grow({ ...b, y: b.y - 0.01 }, 0.03), grow({ ...b, y: roof }, 0.015)));
  r.box(r.black, 0.05, 0.05, 0.14, 0, roof + 0.02, b.z0 + 0.25);
  r.wipers(a, b, belt + 0.06, [-0.34, 0.34], 0.56);
  // The clamshell's shut lines: along the flanks, under its leading edge, across its back.
  r.seam(side, [[zf - 0.02, -0.08], [cowl + 0.02, belt - 0.03]]);
  r.box(r.dark, 2 * side - 0.06, 0.014, 0.01, 0, -0.085, zf + 0.004);
  r.box(r.dark, 2 * side - 0.12, 0.012, 0.016, 0, 0.034, cowl + 0.06);
  // Slim lamps that wrap round the corners, a horizontal-slat grille with a chrome edge.
  const ly = -0.13;
  r.box(r.chrome, 0.88, 0.17, 0.02, 0, ly, zf + 0.005);
  r.box(r.black, 0.84, 0.13, 0.02, 0, ly, zf + 0.012);
  for (const dy of [-0.035, 0, 0.035]) r.box(r.chrome, 0.8, 0.012, 0.012, 0, ly + dy, zf + 0.025);
  r.both((s) => {
    r.lampBox(r.lamp, 0.4, 0.075, s * 0.68, ly + 0.02, zf);
    r.box(r.lamp, 0.02, 0.075, 0.16, s * (side + 0.004), ly + 0.02, zf - 0.08);
  });
  r.beams.low.set(0, ly + 0.02, zf + 0.06);
  r.wedge(r.paint, side, side - 0.08, -0.64, -0.24, zf - 0.04, F);
  r.box(r.black, 1.2, 0.1, 0.02, 0, -0.5, F + 0.005);
  r.both((s) => r.box(r.black, 0.06, 0.2, 0.02, s * 0.8, -0.42, F + 0.005));
  // Gills on the front doors, a chrome strip low along the doors, flush handles.
  r.seam(side, [[0.84, sill + 0.08], [0.84, belt - 0.01]]);
  r.seam(side, [[0.0, sill + 0.08], [0.0, belt - 0.01]]);
  r.seam(side, [[-0.84, sill + 0.08], [-0.84, r.T + 0.08], [-1.02, belt - 0.01]]);
  r.both((s) => {
    r.box(r.black, 0.012, 0.08, 0.3, s * (side + 0.004), -0.16, 0.62);
    for (const dy of [-0.02, 0.02]) r.box(r.chrome, 0.016, 0.012, 0.28, s * (side + 0.008), -0.16 + dy, 0.62);
    r.box(r.chrome, 0.016, 0.025, 2 * (r.axles[1] - r.ah) - 0.1, s * (side + 0.006), sill + 0.1, 0);
    for (const z of [0.12, -0.72]) r.box(r.chrome, 0.016, 0.022, 0.15, s * (side + 0.006), belt - 0.07, z);
  });
  r.mirrors(a.w, belt + 0.1, cowl - 0.2, r.paint);
  // Slim upright tail lamps, a dark band across the tailgate, the split in it.
  r.both((s) => r.lampBox(r.tail, 0.07, 0.36, s * (side - 0.06), -0.2, zr, -1));
  r.box(r.black, 1.5, 0.11, 0.02, 0, -0.12, zr - 0.012);
  r.box(r.dark, 2 * side - 0.3, 0.014, 0.01, 0, -0.33, zr - 0.004);
  r.wedge(r.paint, side - 0.06, side, -0.62, -0.36, -F, zr + 0.04);
  r.box(r.black, 1.3, 0.07, 0.03, 0, -0.6, -F + 0.01);

  r.snorkel(a, b, side, belt);
  r.fogLamps(0.62, -0.5, F - 0.06, 0.06);
  r.lightBar(1.4, roof + 0.1, b.z1 - 0.16, roof);
  r.ditchLights(a, b, belt);
}

/** Land Cruiser 300: big and upright, a tall grille, squared haunches, roof rails and side steps. */
function summit(r: Rig) {
  const { F, roof } = r;
  const sill = -0.72, belt = 0.1, side = 0.96, cowl = 1.02, zf = F - 0.14, zr = -F + 0.1;
  r.slab(r.paint, [[zf, sill], [zf, 0.0], [zf - 0.08, 0.05], [cowl, belt], [zr, belt], [zr, sill]], -side, side, "square");
  r.liners(sill);
  r.flares(r.paint, "square", sill, 0.1, side - 0.02, r.hw, 0.02);
  r.add(r.paint, rod(0.8, 0.06, [0, 0.055, zf - 0.12], [0, belt, cowl + 0.08]));
  const a: Sec = { y: belt - 0.02, w: side - 0.03, z0: zr + 0.01, z1: cowl + 0.01 };
  const b: Sec = { y: roof, w: side - 0.13, z0: zr + 0.12, z1: 0.38 };
  r.add(r.paint, loft(a, b));
  r.sideGlass(a, b, belt + 0.06, roof - 0.1, 0.08, 0.32);
  r.endGlass(a, b, belt + 0.06, roof - 0.09, 0.08, 1);
  r.endGlass(a, b, belt + 0.1, roof - 0.12, 0.16, -1);
  r.pillar(r.black, a, b, belt + 0.05, roof - 0.08, 0.1, -0.02);
  r.pillar(r.black, a, b, belt + 0.05, roof - 0.08, 0.08, -1.06);
  r.wipers(a, b, belt + 0.08, [-0.34, 0.34], 0.54);
  r.both((s) => {
    r.box(r.chrome, 0.05, 0.04, 2.2, s * 0.7, roof + 0.07, -0.9);
    for (const z of [0.18, -0.9, -1.96]) r.box(r.black, 0.07, 0.07, 0.14, s * 0.7, roof + 0.035, z);
  });
  r.raise(roof + 0.09);
  // A tall grille of heavy chrome bars, slim lamps at its top corners.
  const gy = -0.21;
  r.box(r.chrome, 1.08, 0.44, 0.03, 0, gy, zf + 0.01);
  r.box(r.black, 0.98, 0.36, 0.03, 0, gy, zf + 0.025);
  for (const dy of [-0.12, -0.04, 0.04, 0.12]) r.box(r.chrome, 0.94, 0.04, 0.02, 0, gy + dy, zf + 0.04);
  r.both((s) => {
    r.lampBox(r.lamp, 0.3, 0.1, s * 0.76, -0.06, zf);
    r.box(r.black, 0.18, 0.16, 0.02, s * 0.76, -0.28, zf + 0.005);
  });
  r.beams.low.set(0, -0.06, zf + 0.06);
  r.wedge(r.paint, side, side - 0.08, -0.62, -0.4, zf - 0.04, F);
  r.wedge(r.black, side - 0.06, side - 0.16, -0.76, -0.62, zf - 0.04, F - 0.02);
  r.box(r.chrome, 0.7, 0.05, 0.12, 0, -0.76, F - 0.1);
  // Side steps between the arches.
  const run = 2 * (r.axles[1] - r.ah) - 0.08;
  r.both((s) => {
    r.box(r.black, 0.18, 0.05, run, s * 0.9, sill - 0.07, 0);
    r.box(r.chrome, 0.15, 0.012, run - 0.06, s * 0.9, sill - 0.04, 0);
    for (const z of [-0.4, 0.4]) r.box(r.black, 0.05, 0.08, 0.06, s * 0.86, sill - 0.03, z);
  });
  // Door seams, chrome handles, mirrors.
  r.seam(side, [[0.74, sill + 0.06], [0.74, belt - 0.01]]);
  r.seam(side, [[-0.02, sill + 0.06], [-0.02, belt - 0.01]]);
  r.seam(side, [[-0.74, sill + 0.06], [-0.74, r.T + 0.1], [-1.06, belt - 0.01]]);
  r.both((s) => {
    for (const z of [0.12, -0.86]) r.box(r.chrome, 0.025, 0.035, 0.15, s * (side + 0.01), belt - 0.1, z);
  });
  r.mirrors(a.w, belt + 0.11, cowl - 0.2, r.paint, 1.1);
  // Tail lamps wrapping the corners under the glass, a chrome garnish between them.
  r.both((s) => {
    r.lampBox(r.tail, 0.3, 0.1, s * 0.76, belt - 0.07, zr, -1);
    r.box(r.tail, 0.02, 0.1, 0.16, s * (side + 0.004), belt - 0.07, zr + 0.09);
    r.box(r.dark, 0.014, 0.36, 0.01, s * 0.62, -0.23, zr - 0.004);
  });
  r.box(r.chrome, 0.86, 0.045, 0.02, 0, belt - 0.07, zr - 0.012);
  r.wedge(r.paint, side - 0.06, side, -0.66, -0.42, -F, zr + 0.04);
  r.box(r.black, 1.3, 0.03, 0.08, 0, -0.42, -F + 0.05);

  r.snorkel(a, b, side, belt);
  r.fogLamps(0.64, -0.69, F - 0.06, 0.06);
  r.lightBar(1.4, roof + 0.14, b.z1 - 0.18, roof);
  r.ditchLights(a, b, belt);
}

/** Ford F-150 Raptor: very wide, big flares, a huge grille with three marker lamps, a high stance on long-travel shocks. */
function duneclaw(r: Rig) {
  const { F, roof } = r;
  r.T += 0.06;
  const sill = -0.66, belt = 0.08, side = 0.98, cowl = 1.2, cab = -1.02, zf = F - 0.2, back = -F + 0.08;
  r.slab(r.paint, [[zf, sill], [zf, 0.0], [zf - 0.1, 0.05], [cowl, belt - 0.01], [cab, belt], [cab, sill]], -side, side, "square");
  r.liners(sill, 0.42, [r.axles[1]]);
  r.add(r.paint, rod(0.9, 0.07, [0, 0.06, zf - 0.2], [0, belt - 0.005, cowl + 0.08]));
  r.both((s) => r.add(r.dark, rod(0.3, 0.02, [s * 0.58, 0.058, zf - 0.55], [s * 0.58, 0.062, zf - 0.3])));
  const a: Sec = { y: belt - 0.02, w: side - 0.04, z0: cab + 0.01, z1: cowl + 0.01 };
  const b: Sec = { y: roof, w: side - 0.17, z0: cab + 0.06, z1: 0.56 };
  r.add(r.paint, loft(a, b));
  r.sideGlass(a, b, belt + 0.06, roof - 0.1, 0.08, 0.1);
  r.endGlass(a, b, belt + 0.06, roof - 0.09, 0.09, 1);
  r.endGlass(a, b, belt + 0.1, roof - 0.13, 0.22, -1);
  r.pillar(r.black, a, b, belt + 0.05, roof - 0.08, 0.1, 0.1);
  r.wipers(a, b, belt + 0.08, [-0.38, 0.38], 0.58);
  bed(r, { front: cab - 0.06, back, top: belt - 0.02, floor: -0.32, sill, side, style: "square", inset: 0.42 });
  r.flares(r.black, "square", sill, 0.16, side - 0.03, r.hw, 0.05);
  // A huge grille with a bar across it and three marker lamps along its top.
  const gy = -0.18;
  r.box(r.trim, 1.46, 0.46, 0.03, 0, gy, zf + 0.008);
  r.box(r.black, 1.38, 0.38, 0.03, 0, gy, zf + 0.02);
  r.box(r.trim, 1.34, 0.09, 0.03, 0, gy - 0.04, zf + 0.035);
  for (const x of [-0.2, 0, 0.2]) r.box(r.lamp, 0.08, 0.04, 0.02, x, gy + 0.12, zf + 0.04);
  r.both((s) => {
    r.lampBox(r.lamp, 0.18, 0.1, s * 0.86, -0.07, zf);
    r.box(r.lamp, 0.025, 0.18, 0.02, s * 0.955, -0.08, zf + 0.03);
  });
  r.beams.low.set(0, -0.07, zf + 0.06);
  r.wedge(r.black, side + 0.03, side - 0.1, -0.72, -0.4, zf - 0.08, F);
  r.box(lambert(PALETTE.roofTin), 0.9, 0.05, 0.36, 0, -0.74, F - 0.2);
  // Long-travel coilovers inboard of each wheel, showing through the arch gap.
  const coil = lambert(PALETTE.hazardYellow);
  for (const zc of r.axles) {
    r.both((s) => {
      const z = zc - 0.12;
      const top: V3 = [s * (r.v.track / 2 - 0.42), r.T - 0.02, z], bottom: V3 = [s * (r.v.track / 2 - 0.3), r.wy + 0.06, z];
      r.add(r.chrome, tube(0.045, top, bottom));
      for (let i = 0; i < 5; i++) r.add(coil, tube(0.075, lerp3(top, bottom, 0.06 + i * 0.1), lerp3(top, bottom, 0.1 + i * 0.1)));
      r.add(r.chrome, tube(0.035, [top[0] - s * 0.1, top[1] - 0.02, z + 0.08], [top[0] - s * 0.1, top[1] - 0.24, z + 0.08]));
    });
  }
  // Tall tail lamps on the bed posts, a heavy black bumper and hitch.
  r.both((s) => r.lampBox(r.tail, 0.09, 0.42, s * (side - 0.06), -0.13, back, -1));
  r.wedge(r.black, side - 0.08, side + 0.02, -0.72, -0.44, -F, -F + 0.2);
  r.box(r.black, 0.09, 0.09, 0.2, 0, -0.76, -F + 0.1);
  // Door seams, handles, vents on the wings, big mirrors.
  for (const z of [cowl - 0.05, 0.1, cab + 0.07]) r.seam(side, [[z, sill + 0.08], [z, belt - 0.01]]);
  r.both((s) => {
    for (const z of [0.24, -0.8]) r.box(r.black, 0.025, 0.04, 0.16, s * (side + 0.01), belt - 0.12, z);
    r.box(r.dark, 0.012, 0.07, 0.28, s * (side + 0.004), belt - 0.04, 1.42);
  });
  r.mirrors(a.w, belt + 0.12, cowl - 0.2, r.black, 1.3);

  r.snorkel(a, b, side, belt);
  r.fogLamps(0.68, -0.58, F - 0.06, 0.07);
  r.lightBar(1.6, roof + 0.1, b.z1 - 0.14, roof);
  r.ditchLights(a, b, belt);
}

const BUILDERS: Record<VehicleId, (r: Rig) => void> = { ridgeback, bluff, mule, overlander, prairie, highland, summit, duneclaw };

/** One rig's body, painted with `materials.paint` (the caller recolours it) and lit with `materials.lamp`. */
export function buildVehicleBody(v: Vehicle, materials: { paint: THREE.Material; lamp: THREE.Material }): BodyParts {
  const r = new Rig(v, materials);
  BUILDERS[v.id](r);
  return r.finish();
}
