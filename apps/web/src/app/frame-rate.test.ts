import { describe, expect, it } from "vitest";
import { FrameMeter, frameLines } from "./Panels";

/** A meter fed frames `gaps` ms apart, the first at 1 s; and when the last one was. */
const fed = (gaps: number[]) => {
  const meter = new FrameMeter();
  let at = 1000;
  meter.tick(at);
  for (const gap of gaps) meter.tick((at += gap));
  return { meter, at };
};
const steady = (n: number, gap: number) => Array<number>(n).fill(gap);

describe("the frame-rate readout's meter", () => {
  it("has nothing to tell before two frames", () => {
    const meter = new FrameMeter();
    expect(meter.read(0)).toBeNull();
    meter.tick(5);
    expect(meter.read(5)).toBeNull();
  });

  it("tells frames a second from the gaps between them", () => {
    const { meter, at } = fed(steady(240, 1000 / 60));
    const r = meter.read(at)!;
    expect(r.frames).toBe(240);
    expect(r.fps).toBeCloseTo(60, 6);
    expect(r.p95).toBeCloseTo(1000 / 60, 6);
    expect(r.max).toBeCloseTo(1000 / 60, 6);
  });

  it("looks back five seconds and no further", () => {
    const { meter, at } = fed([...steady(300, 50), ...steady(250, 20)]);
    const r = meter.read(at)!;
    expect(r.frames).toBe(250);
    expect(r.fps).toBe(50);
    expect(r.max).toBe(20);
    // Three seconds on with no frames, the last two seconds' are all that's left.
    expect(meter.read(at + 3000)!.frames).toBe(100);
  });

  it("puts the slowest frames at the 95th and 99th percentiles by how many there are", () => {
    // Two slow frames in 200 are the slowest 1%: 99% of them were as quick as the rest.
    const two = fed([...steady(198, 10), 50, 50]);
    expect(two.meter.read(two.at)!.p99).toBe(10);
    // A third is more than 1%, so the 99th percentile is a slow one; the 95th isn't yet.
    const three = fed([...steady(197, 10), 50, 50, 50]);
    const r = three.meter.read(three.at)!;
    expect(r.p99).toBe(50);
    expect(r.p95).toBe(10);
    expect(r.max).toBe(50);
    // Ten slow frames in 200 are 5%; eleven are more.
    const ten = fed([...steady(190, 10), ...steady(10, 50)]);
    const eleven = fed([...steady(189, 10), ...steady(11, 50)]);
    expect(ten.meter.read(ten.at)!.p95).toBe(10);
    expect(eleven.meter.read(eleven.at)!.p95).toBe(50);
  });

  it("doesn't count the time a hidden tab drew nothing as one slow frame", () => {
    const { meter, at } = fed(steady(120, 20));
    meter.pause();
    meter.tick(at + 60_000);
    meter.tick(at + 60_020);
    const r = meter.read(at + 60_020)!;
    expect(r.frames).toBe(1);
    expect(r.max).toBe(20);
  });

  it("keeps the slowest of all however quick the rest", () => {
    const { meter, at } = fed([...steady(100, 8), 400, ...steady(100, 8)]);
    expect(meter.read(at)!.max).toBe(400);
  });

  it("is written out in a few short lines", () => {
    const { meter, at } = fed(steady(300, 1000 / 60));
    const lines = frameLines({ ...meter.read(at)!, ratio: 1.75, screen: 3, width: 1313, height: 2844, calls: 214, triangles: 1_290_000 });
    expect(lines).toEqual([
      "60 fps over 5 s",
      "frames: 95% ≤ 16.7 · 99% ≤ 16.7 · max 16.7 ms",
      "drawn at 1.75× · screen 3× · 1313×2844 px",
      "214 draw calls · 1.29M triangles",
    ]);
  });
});
