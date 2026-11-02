import { describe, expect, it } from "vitest";
import { avatarStyle, readableTextColor, relativeLuminance } from "./colors";

describe("readableTextColor", () => {
  it("uses dark text on the pastel member colors", () => {
    for (const pastel of ["#FFD4D4", "#C8E6F5", "#C8F5E8", "#FFF4D4", "#E8D8F5"]) {
      expect(readableTextColor(pastel)).toBe("#2B3A4A");
    }
  });

  it("uses white text on dark or saturated colors", () => {
    expect(readableTextColor("#1E3A8A")).toBe("#FFFFFF");
    expect(readableTextColor("#000")).toBe("#FFFFFF");
  });

  it("falls back to white for colors it can't parse", () => {
    expect(relativeLuminance("rgb(1,2,3)")).toBeNull();
    expect(readableTextColor("not-a-color")).toBe("#FFFFFF");
  });

  it("returns a complete avatar style", () => {
    expect(avatarStyle("#FFD4D4")).toEqual({ backgroundColor: "#FFD4D4", color: "#2B3A4A" });
  });
});
