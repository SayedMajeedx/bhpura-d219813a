import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIZE,
  dialogFrameClass,
  isPhoneSheet,
  keyboardInset,
  sheetOffset,
  swipeOutcome,
} from "../src/lib/dialog-layout";

describe("the shape a pop-up takes", () => {
  it("is a sheet from a phone's foot for a confirm or a form, the whole screen for a task", () => {
    expect(isPhoneSheet("confirm")).toBe(true);
    expect(isPhoneSheet("form")).toBe(true);
    expect(isPhoneSheet("task")).toBe(false);
    expect(isPhoneSheet("details")).toBe(false);
    expect(dialogFrameClass("form")).toContain("max-sm:bottom-(--app-dialog-kb)");
    expect(dialogFrameClass("form")).toContain("max-sm:rounded-t-2xl");
    expect(dialogFrameClass("task")).toContain("max-sm:h-[calc(100dvh-var(--app-dialog-kb))]");
  });

  it("sits in the middle of a laptop, or along its reading end to read a record", () => {
    expect(dialogFrameClass("form")).toContain("sm:top-1/2");
    expect(dialogFrameClass("details")).toContain("sm:end-0");
    expect(dialogFrameClass("details")).not.toContain("sm:top-1/2");
    // The panel slides in from the end of the line: the right in English, the left in Arabic.
    expect(dialogFrameClass("details")).toContain("rtl:sm:data-[state=open]:slide-in-from-left");
  });

  it("has one of four widths, each kind its own by default", () => {
    expect(DEFAULT_SIZE).toEqual({ confirm: "sm", form: "md", task: "lg", details: "md" });
    expect(dialogFrameClass("confirm")).toContain("sm:max-w-sm");
    expect(dialogFrameClass("form")).toContain("sm:max-w-lg");
    expect(dialogFrameClass("task", "xl")).toContain("sm:max-w-5xl");
  });

  it("never scrolls as a whole: the body inside it does", () => {
    for (const kind of ["confirm", "form", "task", "details"] as const) {
      expect(dialogFrameClass(kind)).toContain("overflow-hidden");
      expect(dialogFrameClass(kind)).toContain("flex-col");
    }
  });
});

describe("pulling a sheet down", () => {
  it("closes it when pulled far enough, or flicked down fast", () => {
    expect(swipeOutcome(120, 600)).toBe("close");
    expect(swipeOutcome(40, 50)).toBe("close");
    expect(swipeOutcome(40, 400)).toBe("stay");
    // A flick too short to mean it, and a push up, leave it where it is.
    expect(swipeOutcome(10, 5)).toBe("stay");
    expect(swipeOutcome(-80, 50)).toBe("stay");
  });

  it("follows a pull down and never a push up", () => {
    expect(sheetOffset(30)).toBe(30);
    expect(sheetOffset(-30)).toBe(0);
  });
});

describe("the phone's keyboard", () => {
  it("is what the visual viewport lost at the foot of the screen", () => {
    expect(keyboardInset(844, 508, 0)).toBe(336);
    // Scrolled so the field shows: the part above the visual viewport is not keyboard.
    expect(keyboardInset(844, 508, 40)).toBe(296);
  });

  it("is not a toolbar folding away", () => {
    expect(keyboardInset(844, 790, 0)).toBe(0);
    expect(keyboardInset(844, 844, 0)).toBe(0);
  });
});
