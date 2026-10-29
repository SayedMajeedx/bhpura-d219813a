import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { numberRuns, morphParts } from "../src/lib/motion/text-diff";
import { pillBox, ACTIVE_TAB_SELECTORS } from "../src/lib/motion/pill";
import { productPhotoName, nameTappedPhoto } from "../src/lib/motion/view-transition";
import { AnimatedNumber } from "../src/components/motion/AnimatedNumber";
import { CountBadge } from "../src/components/motion/CountBadge";
import { LikeHeart } from "../src/components/motion/LikeHeart";
import { SuccessCheck } from "../src/components/motion/SuccessCheck";
import { TabsPill } from "../src/components/motion/TabsPill";
import { useDisclosure } from "../src/components/motion/use-disclosure";
import { useLeavingRows } from "../src/components/motion/use-leaving-rows";

const digitsOf = (runs: ReturnType<typeof numberRuns>) =>
  runs.flatMap((run) => (run.kind === "digits" ? run.digits : []));

describe("number pop-in: what moves", () => {
  it("keeps the digits the old and new value share still and pops the rest", () => {
    const digits = digitsOf(numberRuns("1,299", "1,305"));
    expect(digits.map((d) => d.char).join("")).toBe("1,305");
    expect(digits.filter((d) => d.same).map((d) => d.char)).toEqual(["1", ","]);
    expect(digits.at(-1)?.stagger).toBe(2);
    expect(digits.at(-2)?.stagger).toBe(1);
  });

  it("moves nothing on the first render", () => {
    expect(digitsOf(numberRuns(null, "12")).some((d) => d.same)).toBe(false);
  });

  it("splits only the digits: a currency in Arabic stays one piece of text", () => {
    const runs = numberRuns("23.000 د.ب", "24.500 د.ب");
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ kind: "digits" });
    expect(runs[1]).toEqual({ kind: "text", text: " د.ب" });
    expect(
      digitsOf(runs)
        .map((d) => d.char)
        .join(""),
    ).toBe("24.500");
  });

  it("splits a value with words before its number too", () => {
    const runs = numberRuns(null, "BHD 1,250.000");
    expect(runs[0]).toEqual({ kind: "text", text: "BHD " });
    expect(
      digitsOf(runs)
        .map((d) => d.char)
        .join(""),
    ).toBe("1,250.000");
  });
});

describe("text morph: what changes", () => {
  it("keeps the letters an English label shares", () => {
    expect(morphParts("Copy link", "Copied")).toEqual({
      head: "Cop",
      from: "y link",
      to: "ied",
      tail: "",
    });
  });

  it("changes Arabic by whole words, never cutting a letter from its word", () => {
    const parts = morphParts("نسخ الرابط", "تم النسخ");
    expect(parts.head).toBe("");
    expect(parts.from).toBe("نسخ الرابط");
    expect(parts.to).toBe("تم النسخ");
    expect(morphParts("أضف للسلة", "أُضيفت إلى السلة").tail).toBe("");
  });

  it("keeps a whole Arabic word both labels share", () => {
    expect(morphParts("نسخ الرابط", "تم نسخ الرابط")).toMatchObject({
      from: "",
      to: "تم ",
      tail: "نسخ الرابط",
    });
  });
});

describe("tabs sliding: where the pill sits", () => {
  const bar = (scrollLeft = 0) => ({
    rect: { left: 100, top: 50, width: 300, height: 40 },
    scrollLeft,
    scrollTop: 0,
    clientLeft: 1,
    clientTop: 1,
  });

  it("is the tab's box in the bar's own coordinates", () => {
    expect(pillBox(bar(), { left: 161, top: 55, width: 80, height: 30 })).toEqual({
      x: 60,
      y: 4,
      width: 80,
      height: 30,
    });
  });

  it("lands on the tab in a bar scrolled sideways, either way", () => {
    // A left-to-right bar scrolled 40px: the tab moved left on screen by 40.
    expect(pillBox(bar(40), { left: 121, top: 55, width: 80, height: 30 }).x).toBe(60);
    // A right-to-left bar scrolled back 40px (scrollLeft counts down from 0).
    expect(pillBox(bar(-40), { left: 201, top: 55, width: 80, height: 30 }).x).toBe(60);
  });

  it("asks the bar's own mark before the router's", () => {
    expect(ACTIVE_TAB_SELECTORS[0]).toContain('[data-active="true"]');
    expect(ACTIVE_TAB_SELECTORS.at(-1)).toContain('[aria-current="page"]');
  });

  it("follows the active tab, marked by aria-pressed, and wears its look", async () => {
    // Each tab its own fill when chosen, so the pill's colour says which tab it sits on.
    const fills = ["rgb(10, 20, 30)", "rgb(200, 100, 50)"];
    function Bar({ active }: { active: number }) {
      return (
        <div className="t-tabs" data-testid="bar">
          <TabsPill />
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              className="t-tab"
              aria-pressed={active === i}
              style={{ backgroundColor: active === i ? fills[i] : undefined }}
            >
              {i}
            </button>
          ))}
        </div>
      );
    }
    const { container, rerender } = render(<Bar active={0} />);
    const pill = container.querySelector<HTMLElement>(".t-tabs-pill")!;
    expect(pill.dataset.ready).toBe("true");
    expect(pill.style.backgroundColor).toBe(fills[0]);
    expect(pill.getAttribute("aria-hidden")).toBe("true");
    // The switchers and the product page's chips mark their choice with aria-pressed: the pill
    // once never heard it change, and stayed on the first tab.
    rerender(<Bar active={1} />);
    await act(async () => {});
    expect(pill.style.backgroundColor).toBe(fills[1]);
  });

  it("moves to a new set of tabs, as the workspace tabs are replaced", async () => {
    // Each workspace has its own tabs: moving to another one replaces them all.
    function Bar({ set }: { set: "home" | "orders" }) {
      const tabs = set === "home" ? ["home", "reports"] : ["orders", "returns"];
      return (
        <div className="t-tabs">
          <TabsPill />
          {tabs.map((id, i) => (
            <a
              key={id}
              href={`#${id}`}
              className="t-tab"
              data-active={i === 0 ? "true" : "false"}
              style={{
                backgroundColor:
                  i === 0 ? (set === "home" ? "rgb(1, 1, 1)" : "rgb(2, 2, 2)") : undefined,
              }}
            >
              {id}
            </a>
          ))}
        </div>
      );
    }
    const { container, rerender } = render(<Bar set="home" />);
    const pill = container.querySelector<HTMLElement>(".t-tabs-pill")!;
    expect(pill.style.backgroundColor).toBe("rgb(1, 1, 1)");
    rerender(<Bar set="orders" />);
    await act(async () => {});
    expect(pill.style.backgroundColor).toBe("rgb(2, 2, 2)");
  });

  it("finds its first tab when the first choice is made", async () => {
    function Chips({ active }: { active: number | null }) {
      return (
        <div className="t-tabs">
          <TabsPill />
          <button type="button" className="t-tab" aria-pressed={active === 0}>
            S
          </button>
        </div>
      );
    }
    const { container, rerender } = render(<Chips active={null} />);
    const pill = container.querySelector<HTMLElement>(".t-tabs-pill")!;
    expect(pill.dataset.ready).toBe("false");
    rerender(<Chips active={0} />);
    await act(async () => {});
    expect(pill.dataset.ready).toBe("true");
  });

  it("hides the pill while nothing is chosen", () => {
    const { container } = render(
      <div className="t-tabs">
        <TabsPill />
        <button type="button" className="t-tab" aria-pressed={false}>
          S
        </button>
      </div>,
    );
    expect(container.querySelector<HTMLElement>(".t-tabs-pill")!.dataset.ready).toBe("false");
  });
});

describe("the product photo's morph", () => {
  it("names the photo after its product, safely", () => {
    expect(productPhotoName("a1b2-c3:d4")).toBe("product-img-a1b2-c3_d4");
  });

  it("names a tapped card's photo for a moment only", () => {
    vi.useFakeTimers();
    const card = document.createElement("a");
    card.innerHTML = '<img alt="" src="/photo.jpg" />';
    nameTappedPhoto(card, "p1");
    const photo = card.querySelector("img")!;
    expect(photo.style.viewTransitionName).toBe("product-img-p1");
    vi.advanceTimersByTime(1300);
    expect(photo.style.viewTransitionName).toBe("");
    vi.useRealTimers();
  });
});

describe("animated values", () => {
  it("is plain text at rest and pops its digits, read once, when it changes", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<AnimatedNumber value="1,299" />);
    expect(container.textContent).toBe("1,299");
    expect(container.querySelector(".t-digit-group")).toBeNull();
    rerender(<AnimatedNumber value="1,305" />);
    expect(screen.getByText("1,305")).toHaveClass("sr-only");
    const group = container.querySelector(".t-digit-group.is-animating");
    expect(group?.getAttribute("dir")).toBe("ltr");
    // The digits are drawn from their attribute: the page's text holds the value once.
    expect(container.textContent).toBe("1,305");
    expect([...group!.children].map((d) => d.getAttribute("data-char")).join("")).toBe("1,305");
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(container.querySelector(".t-digit-group")).toBeNull();
    expect(container.textContent).toBe("1,305");
    vi.useRealTimers();
  });

  it("opens a badge with its first item and keeps it closed, and quiet, at zero", () => {
    const { container, rerender } = render(<CountBadge count={0} placement="absolute" />);
    const badge = container.querySelector(".t-badge")!;
    expect(badge.getAttribute("data-open")).toBe("false");
    expect(badge.getAttribute("aria-hidden")).toBe("true");
    // A closed badge holds no number (a page's search for a price once found its "1").
    expect(badge.textContent).toBe("");
    rerender(<CountBadge count={2} placement="absolute" />);
    expect(badge.getAttribute("data-open")).toBe("true");
    expect(container.querySelector(".t-badge-dot")).toHaveClass("is-bumping");
    expect(badge.textContent).toBe("2");
  });

  it("lets a badge's last number go once it has popped away", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<CountBadge count={3} placement="absolute" />);
    rerender(<CountBadge count={0} placement="absolute" />);
    const badge = container.querySelector(".t-badge")!;
    expect(badge.textContent).toBe("3");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(badge.textContent).toBe("");
    vi.useRealTimers();
  });

  it("pops a heart when it is filled, not when it is drawn filled", () => {
    const { container, rerender } = render(<LikeHeart liked />);
    expect(container.querySelector(".is-popping")).toBeNull();
    rerender(<LikeHeart liked={false} />);
    rerender(<LikeHeart liked />);
    expect(container.querySelector(".t-like-icon")).toHaveClass("is-popping");
    expect(container.querySelector(".t-like")?.getAttribute("data-liked")).toBe("true");
  });

  it("plays the success check once it mounts", () => {
    const { container } = render(<SuccessCheck />);
    expect(container.querySelector(".t-success-check")?.getAttribute("data-state")).toBe("in");
  });
});

describe("folds and leaving rows", () => {
  function Fold({ open }: { open: boolean }) {
    const fold = useDisclosure(open);
    return fold.mounted ? <div data-testid="body" data-open={String(fold.shown)} /> : null;
  }

  it("mounts a fold's body at once and grows it on the next frames", async () => {
    const { rerender } = render(<Fold open={false} />);
    expect(screen.queryByTestId("body")).toBeNull();
    rerender(<Fold open />);
    expect(screen.getByTestId("body").dataset.open).toBe("false");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.getByTestId("body").dataset.open).toBe("true");
  });

  it("folds a body away before unmounting it", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Fold open />);
    rerender(<Fold open={false} />);
    expect(screen.getByTestId("body").dataset.open).toBe("false");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByTestId("body")).toBeNull();
    vi.useRealTimers();
  });

  it("removes a row only once it has folded away", () => {
    vi.useFakeTimers();
    const remove = vi.fn();
    function Row() {
      const { isLeaving, leave } = useLeavingRows();
      return (
        <button
          type="button"
          data-leaving={String(isLeaving("a"))}
          onClick={() => leave("a", remove)}
        >
          x
        </button>
      );
    }
    render(<Row />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").dataset.leaving).toBe("true");
    expect(remove).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(remove).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
