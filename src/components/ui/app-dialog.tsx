"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { DialogOverlay } from "@/components/ui/dialog";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import {
  dialogFrameClass,
  isPhoneSheet,
  sheetOffset,
  swipeOutcome,
  type DialogKind,
  type DialogSize,
} from "@/lib/dialog-layout";
import { closeLabel, pageLanguage } from "@/lib/page-language";
import { useReturnFocus } from "@/lib/return-focus";
import { cn } from "@/lib/utils";

/**
 * The admin's pop-up: one frame for every dialog, so a screen says what goes in it and the frame
 * does the rest (the review of 2026-11-19; rules in `src/lib/dialog-layout.ts`).
 *
 *   <AppDialog open={open} onOpenChange={setOpen} kind="form" busy={saving} dirty={changed}>
 *     <AppDialogHeader title="Record payment" description="…" />
 *     <AppDialogBody>…fields…</AppDialogBody>
 *     <AppDialogFooter summary="Owed 72.000 BHD">
 *       <Button variant="outline">Cancel</Button>
 *       <Button>Record payment</Button>
 *     </AppDialogFooter>
 *   </AppDialog>
 *
 * - The header and the footer stay put; only the body scrolls.
 * - On a phone a `confirm` or a `form` is a sheet from the foot of the screen (pulled down, it
 *   closes), a `task` or `details` the whole screen; the sheet stands on the keyboard.
 * - On a touch screen nothing is focused as it opens, so the keyboard does not cover the form
 *   before the person chose a field. A keyboard user still lands on the first field.
 * - While `busy` it cannot be closed; when `dirty`, closing asks first.
 * - `onSubmit` makes the whole pop-up one form, so a button in the pinned footer submits it.
 */

type FrameContext = {
  kind: DialogKind;
  sheet: boolean;
  busy: boolean;
  requestClose: () => Promise<boolean>;
  dragHandlers: React.HTMLAttributes<HTMLDivElement>;
};

const Frame = React.createContext<FrameContext | null>(null);

function useFrame(part: string): FrameContext {
  const frame = React.useContext(Frame);
  if (!frame) throw new Error(`${part} must be inside an AppDialog`);
  return frame;
}

const FIELD =
  "input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable=true]";
const STOP = "button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])";

/** Where a keyboard user starts: the body's first field, else the footer's first button. */
function firstStop(frame: HTMLElement | null): HTMLElement | null {
  if (!frame) return null;
  const body = frame.querySelector("[data-app-dialog-body]");
  const footer = frame.querySelector("[data-app-dialog-footer]");
  return (
    body?.querySelector<HTMLElement>(FIELD) ?? footer?.querySelector<HTMLElement>(STOP) ?? null
  );
}

const coarsePointer = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches);

/** Asks before unsaved changes are thrown away, in the page's language. */
export async function confirmDiscard(): Promise<boolean> {
  const ar = pageLanguage() === "ar";
  return confirmDialog({
    title: ar ? "تجاهل التغييرات؟" : "Discard your changes?",
    description: ar
      ? "ما كتبته في هذه النافذة لم يُحفظ بعد."
      : "What you typed in this window has not been saved.",
    confirmLabel: ar ? "تجاهل" : "Discard",
    cancelLabel: ar ? "متابعة التعديل" : "Keep editing",
    destructive: true,
  });
}

export type AppDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind?: DialogKind;
  size?: DialogSize;
  /** Saving: the pop-up cannot be closed until it is done. */
  busy?: boolean;
  /** Something was typed and not saved: closing asks first. */
  dirty?: boolean;
  /** Makes the pop-up one form: a submit button in the footer sends it. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  dir?: "rtl" | "ltr";
  className?: string;
  children: React.ReactNode;
};

export function AppDialog({
  open,
  onOpenChange,
  kind = "form",
  size,
  busy = false,
  dirty = false,
  onSubmit,
  dir,
  className,
  children,
}: AppDialogProps) {
  const [frame, setFrame] = React.useState<HTMLDivElement | null>(null);
  const sheet = isPhoneSheet(kind);
  const keyboard = useKeyboardInset(open, frame);

  const requestClose = React.useCallback(async () => {
    if (busy) return false;
    if (dirty && !(await confirmDiscard())) return false;
    onOpenChange(false);
    return true;
  }, [busy, dirty, onOpenChange]);

  const focus = useReturnFocus((event: Event) => {
    event.preventDefault();
    // A touch screen: no field is chosen for the person, so no keyboard opens by itself.
    // A keyboard: the first field of the body (the close button comes first in the header),
    // else the footer's first button (a confirm's "Cancel"), else the frame.
    const first = coarsePointer() ? null : firstStop(frame);
    (first ?? frame)?.focus({ preventScroll: true });
  }, undefined);

  const dragHandlers = useSwipeToClose(sheet ? frame : null, requestClose);

  const context = React.useMemo<FrameContext>(
    () => ({ kind, sheet, busy, requestClose, dragHandlers }),
    [kind, sheet, busy, requestClose, dragHandlers],
  );

  const inner = onSubmit ? (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
      {children}
    </form>
  ) : (
    children
  );

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : void requestClose())}
    >
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={setFrame}
          dir={dir}
          role={kind === "confirm" ? "alertdialog" : "dialog"}
          data-kind={kind}
          // A pop-up renders outside the admin's shell: it takes the admin's type itself (its
          // title, an <h2>, fell to the storefront's heading face, a serif in English).
          className={cn("admin-typography", dialogFrameClass(kind, size), className)}
          style={{ "--app-dialog-kb": `${keyboard}px` } as React.CSSProperties}
          onEscapeKeyDown={(event) => busy && event.preventDefault()}
          onPointerDownOutside={(event) => (busy || kind === "confirm") && event.preventDefault()}
          {...focus}
        >
          <Frame.Provider value={context}>{inner}</Frame.Provider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * A phone's sheet follows a finger pulling its header down, and closes when let go far enough
 * or fast enough (through the same guard as the close button); otherwise it springs back.
 */
function useSwipeToClose(
  sheet: HTMLDivElement | null,
  requestClose: () => Promise<boolean>,
): React.HTMLAttributes<HTMLDivElement> {
  const start = React.useRef<{ y: number; t: number; id: number } | null>(null);
  const pulled = React.useRef(0);

  return React.useMemo(() => {
    if (!sheet) return {};
    const springBack = () => {
      sheet.style.transition = "transform var(--motion-quick) var(--motion-ease-smooth)";
      sheet.style.transform = "";
      window.setTimeout(() => (sheet.style.transition = ""), 300);
    };
    return {
      onPointerDown: (event) => {
        if (event.pointerType !== "touch") return;
        if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
        start.current = { y: event.clientY, t: event.timeStamp, id: event.pointerId };
        pulled.current = 0;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      },
      onPointerMove: (event) => {
        if (!start.current || start.current.id !== event.pointerId) return;
        pulled.current = sheetOffset(event.clientY - start.current.y);
        sheet.style.transition = "none";
        sheet.style.transform = `translateY(${pulled.current}px)`;
      },
      onPointerUp: (event) => {
        const began = start.current;
        start.current = null;
        if (!began || began.id !== event.pointerId) return;
        if (swipeOutcome(pulled.current, event.timeStamp - began.t) === "close") {
          void requestClose().then((closed) => !closed && springBack());
        } else springBack();
      },
      onPointerCancel: () => {
        start.current = null;
        springBack();
      },
    };
  }, [sheet, requestClose]);
}

export function AppDialogHeader({
  title,
  description,
  meta,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A line under the description: "Step 2 of 2", "4 products · 16 sizes". */
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const { sheet, busy, requestClose, dragHandlers } = useFrame("AppDialogHeader");
  return (
    <div
      className={cn(
        "shrink-0 border-b border-border-subtle px-4 pb-3 pt-3 sm:px-6 sm:pb-4 sm:pt-5",
        sheet && "max-sm:touch-none",
        className,
      )}
      {...dragHandlers}
    >
      {sheet && (
        <div aria-hidden className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-border sm:hidden" />
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="flex min-w-0 items-center gap-2 text-base font-semibold leading-snug text-foreground sm:text-lg">
            {icon && <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{icon}</span>}
            <span className="min-w-0 break-words">{title}</span>
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="mt-1 break-words text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          )}
          {meta && <div className="mt-2 text-xs text-muted-foreground">{meta}</div>}
        </div>
        <button
          type="button"
          onClick={() => void requestClose()}
          disabled={busy}
          aria-label={closeLabel()}
          className="-me-2 -mt-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors duration-(--motion-quick) hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-11"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** The only part that scrolls. A `toolbar` (a search, a choice) stays at its top. */
export function AppDialogBody({
  toolbar,
  className,
  children,
}: {
  toolbar?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  useFrame("AppDialogBody");
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-app-dialog-body="">
      {toolbar && (
        <div className="sticky top-0 z-10 border-b border-border-subtle bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
          {toolbar}
        </div>
      )}
      <div className={cn("space-y-4 px-4 py-4 sm:px-6 sm:py-5", className)}>{children}</div>
    </div>
  );
}

/**
 * The buttons, always in view: the main one last (at the reading end, and the widest on a
 * phone, under the thumb). `summary` says what the buttons will do ("30 pieces · 1,350.000"),
 * `error` why they cannot yet.
 */
export function AppDialogFooter({
  summary,
  error,
  className,
  children,
}: {
  summary?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  useFrame("AppDialogFooter");
  return (
    <div
      data-app-dialog-footer=""
      className={cn(
        "shrink-0 border-t border-border-subtle bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4",
        className,
      )}
    >
      {error && (
        <p role="alert" className="mb-2 break-words text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 break-words text-sm text-muted-foreground empty:hidden sm:empty:block">
          {summary}
        </div>
        <div className="flex min-w-0 gap-2 max-sm:*:min-h-11 max-sm:*:flex-1 max-sm:*:last:flex-[2] sm:shrink-0">
          {children}
        </div>
      </div>
    </div>
  );
}
