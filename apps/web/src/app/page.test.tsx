import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import HomePage from "./page";

vi.mock("./Game", () => ({ Game: () => <div data-testid="game" /> }));

describe("HomePage", () => {
  it("links each level out to its own app", () => {
    render(<HomePage />);
    // Levels are separate deployments, so these must be absolute URLs, never
    // in-app paths — see docs/decisions/0003-levels-as-standalone-apps.md.
    for (const label of ["Bets", "Meals", "Karts"]) {
      const link = screen.getByRole("link", { name: new RegExp(label) });
      expect(link).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
    }
  });
});
