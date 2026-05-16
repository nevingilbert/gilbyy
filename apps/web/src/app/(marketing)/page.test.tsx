import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import LoginPage from "./page";

vi.mock("@/app/actions/auth", () => ({
  sendMagicLink: vi.fn(),
}));

describe("LoginPage", () => {
  it("renders the magic-link form", () => {
    render(<LoginPage />);
    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send magic link/i })
    ).toBeInTheDocument();
  });
});
