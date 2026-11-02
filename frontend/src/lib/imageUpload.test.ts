import { describe, expect, it } from "vitest";
import { fitWithin, MAX_UPLOAD_EDGE } from "./imageUpload";

describe("fitWithin", () => {
  it("leaves small images alone", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("scales the longest edge down and keeps the aspect ratio", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_UPLOAD_EDGE, height: 1440 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1440, height: MAX_UPLOAD_EDGE });
  });

  it("handles zero-sized input", () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0 });
  });
});
