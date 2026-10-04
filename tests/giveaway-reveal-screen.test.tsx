import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPlan,
  DEFAULT_REVEAL_CONFIG,
  type RevealWinner,
} from "../src/features/giveaways/lib/reveal";

// The winner reveal, played with a fake clock: the setup screen, the countdown,
// the shuffle, the winner, several winners, skipping, replay, sound and less motion.

const brandContext = {
  useBrand: () => ({
    id: "b1",
    slug: "pura",
    name_en: "Pura Line",
    name_ar: "بيورا لاين",
    logo_url: null,
  }),
};
vi.mock("../src/lib/brand-context", () => brandContext);
vi.mock("@/lib/brand-context", () => brandContext);

const { WinnerReveal } = await import("../src/features/giveaways/components/WinnerReveal");

const winners: RevealWinner[] = [
  { id: "w1", position: 1, username: "sara.k", comment: "@a @b done مشاركة" },
  { id: "w2", position: 2, username: "noor", comment: "" },
];
const pool = ["sara.k", "noor", ...Array.from({ length: 60 }, (_, i) => `entrant${i}`)];
const plan = buildPlan({ winners, pool, seed: "seed-1", config: DEFAULT_REVEAL_CONFIG });
const shuffleMs = (index: number) => plan.shuffles[index].delays.reduce((a, b) => a + b, 0);

const onClose = vi.fn();
function renderReveal(over: Partial<React.ComponentProps<typeof WinnerReveal>> = {}) {
  return render(
    <WinnerReveal
      open
      onClose={onClose}
      isAr={false}
      title="Eid giveaway"
      winners={winners}
      pool={pool}
      seed="seed-1"
      {...over}
    />,
  );
}

/**
 * Moves the fake clock forward in small steps. Each step of the reveal sets its
 * next timer only after React has rendered, so one big jump would run just one step.
 */
const pass = async (ms: number) => {
  for (let left = ms; left > 0; left -= 25) {
    await act(async () => {
      vi.advanceTimersByTime(Math.min(25, left));
    });
  }
};
const press = (key: string) => act(async () => void fireEvent.keyDown(window, { key }));
const start = (name = "Start") => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.clearAllMocks();
  localStorage.clear();
  // jsdom has no canvas; the confetti draws nothing here.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe("the setup screen", () => {
  it("is shown first, with the options, and nothing plays yet", () => {
    const { container } = renderReveal();
    expect(screen.getByRole("heading", { name: "Winner reveal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Full screen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Story \/ Reel 9:16/ })).toBeTruthy();
    expect(container.querySelector("[data-phase]")).toBeNull();
  });

  it("cannot start with no winners", () => {
    renderReveal({ winners: [] });
    expect(screen.getByRole("button", { name: "Start" })).toHaveProperty("disabled", true);
  });

  it("remembers the choices", () => {
    const first = renderReveal();
    fireEvent.click(screen.getByRole("button", { name: /Wide, full screen/ }));
    fireEvent.click(screen.getByRole("button", { name: "5" }));
    first.unmount();

    renderReveal();
    expect(
      screen.getByRole("button", { name: /Wide, full screen/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "5" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("closes with Esc and with the close button", async () => {
    renderReveal();
    await press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders nothing when closed", () => {
    const { container } = renderReveal({ open: false });
    expect(container.firstChild).toBeNull();
  });
});

describe("playing the reveal", () => {
  it("runs intro, countdown, shuffle, then shows the winner and what they wrote", async () => {
    const { container } = renderReveal();
    start();
    expect(screen.getByText("Giveaway draw")).toBeTruthy();
    expect(screen.getByText("Eid giveaway")).toBeTruthy();
    expect(screen.getByText("Pura Line")).toBeTruthy();
    expect(container.querySelector("[data-phase='intro']")).toBeTruthy();

    await pass(plan.introMs);
    expect(screen.getByText("Winner in")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    await pass(1000);
    expect(screen.getByText("2")).toBeTruthy();
    await pass(1000);
    expect(screen.getByText("1")).toBeTruthy();

    await pass(1000);
    expect(screen.getByText("Drawing winner 1 of 2")).toBeTruthy();
    expect(container.querySelector("[data-phase='shuffle']")).toBeTruthy();
    // A name from the draw is on screen, and it is not the winner until the end.
    const shown = container.querySelector("[data-phase='shuffle'] .ga-slot p")?.textContent ?? "";
    expect(shown).toMatch(/^@/);
    expect(shown).not.toBe("@sara.k");

    await pass(shuffleMs(0) + 500);
    expect(screen.getByText("Winner 1 of 2")).toBeTruthy();
    expect(screen.getByText("@sara.k")).toBeTruthy();
    expect(screen.getByText(/@a @b done مشاركة/)).toBeTruthy();
  });

  it("goes on to the next winner and ends with everyone listed", async () => {
    const { container } = renderReveal();
    start();
    await pass(plan.introMs + 3000 + shuffleMs(0) + 500);
    expect(screen.getByText("@sara.k")).toBeTruthy();

    await pass(plan.holdMs + 300);
    expect(screen.getByText("Next winner")).toBeTruthy();
    await pass(plan.betweenMs + 300);
    expect(screen.getByText("Drawing winner 2 of 2")).toBeTruthy();
    await pass(shuffleMs(1) + 500);
    expect(screen.getByText("Winner 2 of 2")).toBeTruthy();
    expect(screen.getByText("@noor")).toBeTruthy();

    await pass(plan.holdMs + 300);
    expect(container.querySelector("[data-phase='summary']")).toBeTruthy();
    expect(screen.getByText("Congratulations to")).toBeTruthy();
    expect(screen.getByText("@sara.k")).toBeTruthy();
    expect(screen.getByText("@noor")).toBeTruthy();
  });

  it("skips ahead with Space and starts over with R", async () => {
    const { container } = renderReveal();
    start();
    await press(" ");
    expect(container.querySelector("[data-phase='shuffle']")).toBeTruthy();
    await press(" ");
    expect(container.querySelector("[data-phase='reveal']")).toBeTruthy();
    await press("r");
    expect(container.querySelector("[data-phase='intro']")).toBeTruthy();
  });

  it("starts from the keyboard with Enter on the setup screen", async () => {
    const { container } = renderReveal();
    await press("Enter");
    expect(container.querySelector("[data-phase='intro']")).toBeTruthy();
  });

  it("plays again from the button", async () => {
    const { container } = renderReveal();
    start();
    await press(" ");
    await press(" ");
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(container.querySelector("[data-phase='intro']")).toBeTruthy();
  });

  it("draws a 9:16 frame for stories and a full frame for wide", () => {
    const story = renderReveal();
    start();
    expect(story.container.querySelector("[data-format='story']")).toBeTruthy();
    story.unmount();

    localStorage.setItem("giveaway-reveal-config", JSON.stringify({ format: "wide" }));
    const wide = renderReveal();
    start();
    expect(wide.container.querySelector("[data-format='wide']")).toBeTruthy();
  });

  it("uses the countdown the setup chose", async () => {
    localStorage.setItem("giveaway-reveal-config", JSON.stringify({ countdownFrom: 5 }));
    renderReveal();
    start();
    await pass(plan.introMs);
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("reads in Arabic with the Arabic brand name", async () => {
    renderReveal({ isAr: true });
    expect(screen.getByRole("heading", { name: "عرض إعلان الفائز" })).toBeTruthy();
    start("ابدأ");
    expect(screen.getByText("بيورا لاين")).toBeTruthy();
    expect(screen.getByText("سحب المسابقة")).toBeTruthy();
  });

  it("announces the winner to screen readers", async () => {
    const { container } = renderReveal();
    start();
    await pass(plan.introMs + 3000 + shuffleMs(0) + 500);
    expect(container.querySelector("[aria-live='polite']")?.textContent).toBe("Winner 1: @sara.k");
  });
});

describe("the store's logo and colours", () => {
  const LOGO = "https://media.test/pura-logo.svg";

  it("shows the logo by itself, without repeating the name", () => {
    renderReveal({ logoUrl: LOGO });
    start();
    const logo = screen.getByRole("img", { name: "Pura Line" });
    expect(logo.getAttribute("src")).toBe(LOGO);
    // The logo is not cropped into a circle: it keeps its own shape.
    expect(logo.className).toContain("object-contain");
    expect(logo.className).not.toContain("rounded-full");
    expect(screen.queryByText("Pura Line")).toBeNull();
  });

  it("shows the name when there is no logo", () => {
    renderReveal({ logoUrl: null });
    start();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Pura Line")).toBeTruthy();
  });

  it("falls back to the name when the logo fails to load", () => {
    renderReveal({ logoUrl: LOGO });
    start();
    fireEvent.error(screen.getByRole("img", { name: "Pura Line" }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Pura Line")).toBeTruthy();
  });

  it("uses the Arabic name as the logo's text in Arabic", () => {
    renderReveal({ logoUrl: LOGO, isAr: true });
    start("ابدأ");
    expect(screen.getByRole("img", { name: "بيورا لاين" })).toBeTruthy();
  });

  it("paints the stage in the store's colour with text that reads on it", () => {
    const { container } = renderReveal({ color: "#330a0a" });
    start();
    const stage = container.querySelector("[data-phase]") as HTMLElement;
    expect(stage.style.getPropertyValue("--primary")).toBe("#330a0a");
    expect(stage.style.getPropertyValue("--primary-foreground")).toBe("white");
  });

  it("switches to dark text on a light brand colour, and leaves the theme alone without one", () => {
    const light = renderReveal({ color: "#fde7c9" });
    start();
    expect(
      (light.container.querySelector("[data-phase]") as HTMLElement).style.getPropertyValue(
        "--primary-foreground",
      ),
    ).toBe("black");
    light.unmount();

    const plain = renderReveal({ color: null });
    start();
    expect(
      (plain.container.querySelector("[data-phase]") as HTMLElement).style.getPropertyValue(
        "--primary",
      ),
    ).toBe("");
  });
});

describe("less motion", () => {
  it("skips the shuffle and goes straight to the winner", async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    const { container } = renderReveal();
    start();
    await pass(2400 + 3000);
    expect(container.querySelector("[data-phase='shuffle']")?.textContent).toContain("@sara.k");
    await pass(700);
    expect(container.querySelector("[data-phase='reveal']")).toBeTruthy();
  });
});

describe("sound", () => {
  function fakeAudio() {
    const made = { oscillators: 0, contexts: 0, closed: 0 };
    class FakeContext {
      currentTime = 0;
      destination = {};
      constructor() {
        made.contexts += 1;
      }
      createOscillator() {
        made.oscillators += 1;
        return {
          type: "sine",
          frequency: { setValueAtTime() {} },
          connect: () => ({}),
          start() {},
          stop() {},
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect: () => ({}),
        };
      }
      async close() {
        made.closed += 1;
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
    return made;
  }

  it("beeps the countdown, ticks the shuffle and plays a fanfare, then closes the audio", async () => {
    const made = fakeAudio();
    renderReveal();
    start();
    expect(made.oscillators).toBe(0);
    await pass(plan.introMs);
    const afterFirstBeep = made.oscillators;
    expect(afterFirstBeep).toBeGreaterThan(0);
    await pass(3000);
    const beforeReveal = made.oscillators;
    await pass(shuffleMs(0) + 500);
    // The shuffle ticked, and the winner got the fanfare (several notes at once).
    expect(made.oscillators).toBeGreaterThan(beforeReveal + 8);
    await press("Escape");
    expect(made.closed).toBe(1);
  });

  it("stays silent when sound is off", async () => {
    localStorage.setItem("giveaway-reveal-config", JSON.stringify({ sound: false }));
    const made = fakeAudio();
    renderReveal();
    start();
    await pass(plan.introMs + 3000 + shuffleMs(0) + 500);
    expect(made.contexts).toBe(0);
    expect(made.oscillators).toBe(0);
  });
});
