import { describe, expect, it } from "vitest";
import { calculateTargetDimensions } from "../src/lib/video-optimizer";

describe("calculateTargetDimensions", () => {
  it("scales 1080p landscape down to 720p with even dimensions", () => {
    const { width, height } = calculateTargetDimensions(1920, 1080, 1280);
    expect(width).toBe(1280);
    expect(height).toBe(720);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });

  it("scales 1080p portrait down to 720x1280 with even dimensions", () => {
    const { width, height } = calculateTargetDimensions(1080, 1920, 1280);
    expect(width).toBe(720);
    expect(height).toBe(1280);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });

  it("scales 4K down to max 1280 maintaining aspect ratio", () => {
    const { width, height } = calculateTargetDimensions(3840, 2160, 1280);
    expect(width).toBe(1280);
    expect(height).toBe(720);
  });

  it("leaves smaller resolutions unscaled while ensuring even dimensions", () => {
    const { width, height } = calculateTargetDimensions(640, 480, 1280);
    expect(width).toBe(640);
    expect(height).toBe(480);
  });

  it("converts odd dimensions to even numbers for codec compliance", () => {
    const { width, height } = calculateTargetDimensions(641, 481, 1280);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
    expect(width).toBe(640);
    expect(height).toBe(480);
  });

  it("handles empty or degenerate source dimensions safely", () => {
    const { width, height } = calculateTargetDimensions(0, 0, 1280);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });
});
