import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../src/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "../src/components/ui/dialog";
import { returnFocus } from "../src/lib/return-focus";

// Closing a drawer or a dialog goes back to what opened it, in place. Radix gave the cart drawer's
// trigger (in the store's header, off screen on a scroll down) its focus back with a plain focus(),
// which scrolled Pura's page from 700px to 160px and pinned the header (2026-11-01).

afterEach(() => vi.restoreAllMocks());

/** Radix gives focus back on a zero-delay timer once the content has gone. */
const closed = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

function CartPage() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger>Shopping cart</SheetTrigger>
          <SheetContent>
            <SheetTitle>Your cart</SheetTitle>
          </SheetContent>
        </Sheet>
      </header>
      {/* "Add to cart" opens the drawer itself, as openCartDrawer does. */}
      <button type="button" onClick={() => setOpen(true)}>
        Add 54 to bag
      </button>
    </>
  );
}

describe("closing a drawer", () => {
  it("returns to the button that added to the bag, never to the header's trigger, and does not scroll", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    render(<CartPage />);
    const add = screen.getByRole("button", { name: "Add 54 to bag" });
    act(() => add.focus());
    fireEvent.click(add);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    focus.mockClear();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await closed();

    expect(document.activeElement).toBe(add);
    const header = screen.getByRole("button", { name: "Shopping cart" });
    expect(focus.mock.contexts).not.toContain(header);
    // Every focus given back is given in place.
    for (const [options] of focus.mock.calls) expect(options).toEqual({ preventScroll: true });
  });

  it("returns to its own trigger when that opened it", async () => {
    render(<CartPage />);
    const trigger = screen.getByRole("button", { name: "Shopping cart" });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    await closed();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("when what opened it is gone", () => {
  it("leaves Radix its own way: the drawer's trigger", async () => {
    function Page() {
      const [open, setOpen] = useState(false);
      const [gone, setGone] = useState(false);
      return (
        <>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger>Shopping cart</SheetTrigger>
            <SheetContent>
              <SheetTitle>Your cart</SheetTitle>
            </SheetContent>
          </Sheet>
          {!gone && (
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                setGone(true);
              }}
            >
              From a menu
            </button>
          )}
        </>
      );
    }
    render(<Page />);
    const item = screen.getByRole("button", { name: "From a menu" });
    act(() => item.focus());
    fireEvent.click(item);
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    await closed();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Shopping cart" }));
  });
});

describe("closing a dialog", () => {
  it("goes back to what had focus, and keeps a page's own close handler", async () => {
    const onCloseAutoFocus = vi.fn();
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Quick view
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
              <DialogTitle>Abaya</DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Quick view" });
    act(() => opener.focus());
    fireEvent.click(opener);
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    await closed();
    expect(onCloseAutoFocus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });
});

describe("returnFocus", () => {
  it("leaves alone what is gone, and the page itself", () => {
    const gone = document.createElement("button");
    expect(returnFocus(gone)).toBe(false);
    expect(returnFocus(document.body)).toBe(false);
    expect(returnFocus(null)).toBe(false);
    const here = document.body.appendChild(document.createElement("button"));
    expect(returnFocus(here)).toBe(true);
    expect(document.activeElement).toBe(here);
    here.remove();
  });
});
