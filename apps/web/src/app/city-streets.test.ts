import { afterEach, describe, expect, it, vi } from "vitest";
import { canOpenCity, cityData, loadCityData } from "./city-streets";

// The city's data comes on its own, after the page (ADR 0022), and can fail to come: the
// network drops, a deploy moves it, or the browser can't unpack it. None of that may stick.
describe("loading San Francisco's data", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is refused at once by a browser that can't unpack it, and the refusal isn't kept", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    expect(canOpenCity()).toBe(false);
    await expect(loadCityData()).rejects.toThrow(/can't unpack/);
    expect(cityData()).toBeNull();
    vi.unstubAllGlobals();
    expect(canOpenCity()).toBe(true);
  });

  it("is tried afresh after a load that failed, not answered with the old failure", async () => {
    vi.stubGlobal(
      "DecompressionStream",
      class {
        constructor() {
          throw new Error("the unpacking broke");
        }
      },
    );
    await expect(loadCityData()).rejects.toThrow("the unpacking broke");
    expect(cityData()).toBeNull();
    vi.unstubAllGlobals();
    const data = await loadCityData();
    expect(data.streets.length).toBeGreaterThan(1000);
    expect(cityData()).toBe(data);
    // And once it's in, it's kept.
    expect(await loadCityData()).toBe(data);
  });
});
