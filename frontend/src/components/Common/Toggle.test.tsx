import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Toggle from "./Toggle";

describe("Toggle", () => {
  it("exposes switch semantics and reports the new value", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} aria-label="Enable lock" />);
    const toggle = screen.getByRole("switch", { name: "Enable lock" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("is marked so the global touch min-height rule skips it", () => {
    render(<Toggle checked onChange={() => {}} aria-label="On" />);
    expect(screen.getByRole("switch").hasAttribute("data-toggle")).toBe(true);
  });

  it("does not fire when disabled", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} disabled aria-label="Off" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
