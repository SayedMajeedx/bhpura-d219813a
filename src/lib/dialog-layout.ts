/**
 * How the admin's pop-ups are laid out: one rule for every `AppDialog`
 * (`src/components/ui/app-dialog.tsx`), so a pop-up says what it is and the frame follows.
 *
 * Four shapes (the review of 2026-11-19 found 169 pop-ups in 15 widths, 146 of them a box
 * floating in the middle of a phone with their buttons scrolled out of sight):
 *
 * - `confirm`: "are you sure?", a small box; a sheet from the foot of a phone.
 * - `form`: add or change something; a sheet from the foot of a phone that grows to its height.
 * - `task`: a list to work through (pieces to move, sizes to send); the whole screen on a phone.
 * - `details`: one record to read; a panel from the reading end on a laptop, the whole screen
 *   on a phone.
 *
 * On every shape the header and the footer stay put and only the body scrolls.
 */

export type DialogKind = "confirm" | "form" | "task" | "details";
export type DialogSize = "sm" | "md" | "lg" | "xl";

/** 24, 32, 48 and 64rem: the four widths a pop-up may have. */
const WIDTH: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
};

export const DEFAULT_SIZE: Record<DialogKind, DialogSize> = {
  confirm: "sm",
  form: "md",
  task: "lg",
  details: "md",
};

/** Whether the shape is a sheet from the foot of a phone (else the whole screen). */
export function isPhoneSheet(kind: DialogKind): boolean {
  return kind === "confirm" || kind === "form";
}

const BASE =
  "fixed z-50 flex flex-col gap-0 overflow-hidden border border-border bg-background p-0 shadow-xl outline-none ease-(--motion-ease-smooth) data-[state=open]:duration-250 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

/** A box in the middle of a laptop's screen. */
const CENTRED =
  "sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:data-[state=closed]:zoom-out-[0.97] sm:data-[state=open]:zoom-in-[0.97]";

/** A panel along the reading end of a laptop's screen (the left in Arabic). */
const SIDE =
  "sm:inset-y-0 sm:end-0 sm:h-dvh sm:w-full sm:rounded-none sm:border-y-0 sm:border-e-0 ltr:sm:data-[state=open]:slide-in-from-right ltr:sm:data-[state=closed]:slide-out-to-right rtl:sm:data-[state=open]:slide-in-from-left rtl:sm:data-[state=closed]:slide-out-to-left";

/**
 * A sheet from the foot of a phone: it stands on the keyboard when one is open
 * (`--app-dialog-kb`, from `useKeyboardInset`) and never reaches the top of the screen.
 */
const PHONE_SHEET =
  "max-sm:inset-x-0 max-sm:bottom-(--app-dialog-kb) max-sm:w-full max-sm:max-h-[calc(94dvh-var(--app-dialog-kb))] max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom";

/** The whole screen of a phone, less the keyboard. */
const PHONE_FULL =
  "max-sm:inset-x-0 max-sm:top-0 max-sm:h-[calc(100dvh-var(--app-dialog-kb))] max-sm:w-full max-sm:rounded-none max-sm:border-0 max-sm:data-[state=open]:slide-in-from-bottom-10 max-sm:data-[state=closed]:slide-out-to-bottom-10";

/** The pop-up's own box: where it sits and how wide it is, on a phone and from `sm` up. */
export function dialogFrameClass(kind: DialogKind, size: DialogSize = DEFAULT_SIZE[kind]): string {
  const laptop = kind === "details" ? SIDE : CENTRED;
  const phone = isPhoneSheet(kind) ? PHONE_SHEET : PHONE_FULL;
  return [BASE, laptop, WIDTH[size], phone].join(" ");
}

/** How far a sheet is pulled down before letting go closes it, and how fast a flick must be. */
export const SWIPE_CLOSE_DISTANCE = 96;
export const SWIPE_CLOSE_SPEED = 0.6; // px per ms

/**
 * What letting go of a sheet does: it closes when pulled far enough or flicked down fast
 * enough, else it springs back. A pull upward never moves it.
 */
export function swipeOutcome(pulled: number, ms: number): "close" | "stay" {
  if (pulled <= 0) return "stay";
  if (pulled >= SWIPE_CLOSE_DISTANCE) return "close";
  return ms > 0 && pulled / ms >= SWIPE_CLOSE_SPEED && pulled >= 24 ? "close" : "stay";
}

/** How far a sheet follows the finger: all of a pull down, none of a push up. */
export function sheetOffset(pulled: number): number {
  return Math.max(0, pulled);
}

/**
 * How much of the screen's foot the keyboard covers. The layout viewport keeps its height when
 * a phone's keyboard opens; the visual viewport shrinks. Less than 80px is a toolbar folding
 * away as the page scrolls, not a keyboard.
 */
export function keyboardInset(
  windowHeight: number,
  visualHeight: number,
  visualOffsetTop: number,
): number {
  const covered = Math.round(windowHeight - visualHeight - visualOffsetTop);
  return covered >= 80 ? covered : 0;
}
