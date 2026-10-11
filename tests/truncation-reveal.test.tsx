import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCutShort, revealPosition } from "../src/lib/truncation";
import { TruncationReveal } from "../src/components/ui/truncation-reveal";

// Text that is cut short can always be read in full: the rule that says a text is cut, where the
// full text is placed, and the component that shows it on a rest of the mouse, a tap or a long
// press, without touching the elements that cut their text.

const LONG = "Soft transparency, timeless elegance abaya with hand embroidery";

/**
 * jsdom lays nothing out and knows no `text-overflow`: give an element the box a browser would,
 * and mark it so the page's computed style says "one line, ended with an ellipsis".
 */
function cutLine(element: HTMLElement, { fits = false } = {}) {
  element.dataset.cut = "line";
  Object.defineProperty(element, "scrollWidth", { value: fits ? 100 : 400, configurable: true });
  Object.defineProperty(element, "clientWidth", { value: 100, configurable: true });
  Object.defineProperty(element, "innerText", { value: element.textContent, configurable: true });
}

const realComputedStyle = window.getComputedStyle.bind(window);
beforeEach(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = realComputedStyle(element, pseudo);
    if (!(element instanceof HTMLElement) || element.dataset.cut !== "line") return style;
    return new Proxy(style, {
      get(target, property) {
        if (property === "textOverflow") return "ellipsis";
        if (property === "overflowX") return "hidden";
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
});
afterEach(() => vi.restoreAllMocks());

function page(children: React.ReactNode) {
  return render(
    <>
      {children}
      <TruncationReveal />
    </>,
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const bubble = () => screen.queryByRole("tooltip");

describe("when a text is cut short", () => {
  const box = { scrollWidth: 400, clientWidth: 100, scrollHeight: 20, clientHeight: 20 };
  const oneLine = { textOverflow: "ellipsis", overflowX: "hidden", lineClamp: "none" };

  it("a line ended with an ellipsis that holds more than it shows", () => {
    expect(isCutShort(box, oneLine)).toBe(true);
  });

  it("not a line that could be cut but fits", () => {
    expect(isCutShort({ ...box, scrollWidth: 100 }, oneLine)).toBe(false);
    expect(isCutShort({ ...box, scrollWidth: 101 }, oneLine)).toBe(false);
  });

  it("not text that simply overflows with no ellipsis", () => {
    expect(isCutShort(box, { ...oneLine, textOverflow: "clip" })).toBe(false);
    expect(isCutShort(box, { ...oneLine, overflowX: "visible" })).toBe(false);
  });

  it("a block clamped to two lines with a third line of text", () => {
    const clamp = { textOverflow: "clip", overflowX: "hidden", lineClamp: "2" };
    expect(isCutShort({ ...box, scrollWidth: 100, scrollHeight: 75 }, clamp)).toBe(true);
    expect(isCutShort({ ...box, scrollWidth: 100, scrollHeight: 20 }, clamp)).toBe(false);
  });
});

describe("where the full text is placed", () => {
  const screenSize = { width: 390, height: 844 };
  const bubbleSize = { width: 200, height: 40 };

  it("above the text, centred on it", () => {
    const anchor = { left: 100, right: 200, top: 300, bottom: 320 };
    expect(revealPosition(anchor, bubbleSize, screenSize)).toEqual({ left: 50, top: 254 });
  });

  it("below when there is no room above", () => {
    const anchor = { left: 100, right: 200, top: 20, bottom: 40 };
    expect(revealPosition(anchor, bubbleSize, screenSize).top).toBe(46);
  });

  it("never off either side of the screen", () => {
    expect(
      revealPosition({ left: 0, right: 40, top: 300, bottom: 320 }, bubbleSize, screenSize).left,
    ).toBe(8);
    expect(
      revealPosition({ left: 360, right: 390, top: 300, bottom: 320 }, bubbleSize, screenSize).left,
    ).toBe(182);
  });
});

describe("TruncationReveal", () => {
  it("shows the full text when the mouse rests on a cut line, and hides it when it leaves", () => {
    page(<p data-testid="name">{LONG}</p>);
    const name = screen.getByTestId("name");
    cutLine(name);

    fireEvent.pointerOver(name, { pointerType: "mouse" });
    expect(bubble()).toBeNull();
    wait(400);
    expect(bubble()?.textContent).toBe(LONG);

    fireEvent.pointerOut(name, { pointerType: "mouse" });
    expect(bubble()).toBeNull();
  });

  it("stays quiet over text that fits", () => {
    page(<p data-testid="name">{LONG}</p>);
    const name = screen.getByTestId("name");
    cutLine(name, { fits: true });
    fireEvent.pointerOver(name, { pointerType: "mouse" });
    wait(1000);
    expect(bubble()).toBeNull();
  });

  it("finds the cut line from what is inside it", () => {
    page(
      <p data-testid="name">
        <span data-testid="inner">{LONG}</span>
      </p>,
    );
    cutLine(screen.getByTestId("name"));
    fireEvent.pointerOver(screen.getByTestId("inner"), { pointerType: "mouse" });
    wait(400);
    expect(bubble()?.textContent).toBe(LONG);
  });

  it("shows it on a tap of plain text, then lets it go by itself", () => {
    page(<p data-testid="name">{LONG}</p>);
    const name = screen.getByTestId("name");
    cutLine(name);

    fireEvent.pointerDown(name, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerUp(name, { pointerType: "touch", clientX: 10, clientY: 10 });
    expect(bubble()?.textContent).toBe(LONG);
    wait(4100);
    expect(bubble()).toBeNull();
  });

  it("inside a link, a tap follows the link and only a long press shows the text", () => {
    const followed = vi.fn((event: React.MouseEvent) => event.preventDefault());
    page(
      <a href="/product" onClick={followed}>
        <span data-testid="name">{LONG}</span>
      </a>,
    );
    const name = screen.getByTestId("name");
    cutLine(name);

    // A tap: nothing shown, the link is followed.
    fireEvent.pointerDown(name, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerUp(name, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.click(name);
    expect(bubble()).toBeNull();
    expect(followed).toHaveBeenCalledTimes(1);

    // A long press: the text is shown, and that press does not follow the link.
    fireEvent.pointerDown(name, { pointerType: "touch", clientX: 10, clientY: 10 });
    wait(550);
    expect(bubble()?.textContent).toBe(LONG);
    fireEvent.pointerUp(name, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.click(name);
    expect(followed).toHaveBeenCalledTimes(1);
  });

  it("a finger that moves is scrolling, not asking", () => {
    page(
      <a href="/product">
        <span data-testid="name">{LONG}</span>
      </a>,
    );
    const name = screen.getByTestId("name");
    cutLine(name);
    fireEvent.pointerDown(name, { pointerType: "touch", clientX: 10, clientY: 10 });
    fireEvent.pointerMove(name, { pointerType: "touch", clientX: 10, clientY: 60 });
    wait(600);
    expect(bubble()).toBeNull();
  });

  it("closes on Escape and can be switched off for an element", () => {
    page(
      <>
        <p data-testid="name">{LONG}</p>
        <div data-no-reveal>
          <p data-testid="quiet">{LONG}</p>
        </div>
      </>,
    );
    const name = screen.getByTestId("name");
    cutLine(name);
    cutLine(screen.getByTestId("quiet"));

    fireEvent.pointerOver(name, { pointerType: "mouse" });
    wait(400);
    expect(bubble()).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(bubble()).toBeNull();

    fireEvent.pointerOver(screen.getByTestId("quiet"), { pointerType: "mouse" });
    wait(400);
    expect(bubble()).toBeNull();
  });
});
