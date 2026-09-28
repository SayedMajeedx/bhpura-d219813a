import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneData, StudioTemplate } from "../src/features/content-studio/engine/scene";
import { TemplateThumb } from "../src/features/content-studio/components/TemplateThumb";

// The template gallery's thumbnails: the studio's own post drawn small, on
// its finished frame, playing from the start while the card is hovered.

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({}) as unknown as CanvasRenderingContext2D,
  );
});
afterEach(() => vi.restoreAllMocks());

const template = (render: StudioTemplate["render"]): StudioTemplate => ({
  id: "t",
  name: { en: "T", ar: "ت" },
  goal: { en: "T", ar: "ت" },
  duration: 6,
  render,
});
const scene = (width: number, height: number) => ({ width, height }) as unknown as SceneData;

describe("TemplateThumb", () => {
  it("shows the finished frame at a 4:5 size while the card is at rest", async () => {
    const draw = vi.fn();
    render(<TemplateThumb template={template(draw)} scene={scene} playing={false} />);
    await waitFor(() => expect(draw).toHaveBeenCalled());
    const [, t, drawn] = draw.mock.calls[0];
    expect(t).toBe(5);
    expect(drawn).toEqual({ width: 240, height: 300 });
  });

  it("plays from the start while hovered", async () => {
    const draw = vi.fn();
    render(<TemplateThumb template={template(draw)} scene={scene} playing />);
    await waitFor(() => expect(draw.mock.calls.length).toBeGreaterThan(1));
    const times = draw.mock.calls.map((call) => call[1] as number);
    expect(times[0]).toBe(0);
    expect(times.every((t) => t >= 0 && t < 6)).toBe(true);
  });
});
