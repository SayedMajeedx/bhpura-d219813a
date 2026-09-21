import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppVideo, preferPosterOnly } from "../src/components/common/AppVideo";

const POSTER = "https://media.boutq.store/brands/x/hero/poster.webp";
const VIDEO = "https://media.boutq.store/brands/x/hero/clip.mp4";

function setConnection(value: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, "connection", { value, configurable: true });
}

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matches : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

describe("preferPosterOnly", () => {
  beforeEach(() => {
    setConnection(undefined);
    setReducedMotion(false);
  });

  it("is false on a normal connection with motion allowed", () => {
    expect(preferPosterOnly()).toBe(false);
  });

  it("is true on data-saver, slow connections, or reduced motion", () => {
    setConnection({ saveData: true });
    expect(preferPosterOnly()).toBe(true);
    setConnection({ effectiveType: "3g" });
    expect(preferPosterOnly()).toBe(true);
    setConnection({ effectiveType: "4g" });
    expect(preferPosterOnly()).toBe(false);
    setReducedMotion(true);
    expect(preferPosterOnly()).toBe(true);
  });
});

describe("AppVideo hero deferral", () => {
  let readyState: DocumentReadyState;
  const originalPlay = HTMLMediaElement.prototype.play;
  const originalLoad = HTMLMediaElement.prototype.load;

  beforeEach(() => {
    setConnection(undefined);
    setReducedMotion(false);
    readyState = "loading";
    Object.defineProperty(document, "readyState", { configurable: true, get: () => readyState });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.load = vi.fn();
    vi.useFakeTimers();
    // jsdom has no requestIdleCallback; the component falls back to setTimeout.
    delete (window as any).requestIdleCallback;
  });

  afterEach(() => {
    vi.useRealTimers();
    HTMLMediaElement.prototype.play = originalPlay;
    HTMLMediaElement.prototype.load = originalLoad;
  });

  it("paints only the poster before the load event, then mounts the video after load + idle", () => {
    const { container } = render(<AppVideo variant="hero" src={VIDEO} poster={POSTER} active />);

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("fetchpriority")).toBe("high");
    expect(container.querySelector("video")).toBeNull();

    act(() => {
      readyState = "complete";
      window.dispatchEvent(new Event("load"));
    });
    expect(container.querySelector("video")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video!.getAttribute("preload")).toBe("metadata");
    expect(video!.hasAttribute("autoplay")).toBe(true);
  });

  it("never mounts the hero video on data-saver connections", () => {
    setConnection({ saveData: true });
    const { container } = render(<AppVideo variant="hero" src={VIDEO} poster={POSTER} active />);
    act(() => {
      readyState = "complete";
      window.dispatchEvent(new Event("load"));
      vi.advanceTimersByTime(5000);
    });
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("mounts immediately when there is no poster to paint instead", () => {
    const { container } = render(<AppVideo variant="hero" src={VIDEO} active />);
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("does not defer non-hero videos", () => {
    const { container } = render(<AppVideo variant="content" src={VIDEO} poster={POSTER} />);
    expect(container.querySelector("video")).not.toBeNull();
  });
});
