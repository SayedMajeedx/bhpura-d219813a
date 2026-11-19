import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const confirm = vi.hoisted(() => ({ answer: true, asked: 0 }));
vi.mock("@/components/ui/confirm-dialog", () => ({
  confirmDialog: vi.fn(async () => {
    confirm.asked += 1;
    return confirm.answer;
  }),
}));
vi.mock("../src/components/ui/confirm-dialog", () => ({
  confirmDialog: vi.fn(async () => {
    confirm.asked += 1;
    return confirm.answer;
  }),
}));

import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "../src/components/ui/app-dialog";
import type { DialogKind } from "../src/lib/dialog-layout";

function Harness({
  kind = "form",
  busy = false,
  dirty = false,
  onSubmit,
}: {
  kind?: DialogKind;
  busy?: boolean;
  dirty?: boolean;
  onSubmit?: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <p data-testid="state">{open ? "open" : "closed"}</p>
      <AppDialog
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        busy={busy}
        dirty={dirty}
        onSubmit={
          onSubmit
            ? (event) => {
                event.preventDefault();
                onSubmit();
              }
            : undefined
        }
      >
        <AppDialogHeader title="Record payment" description="From the partner" meta="Step 1 of 2" />
        <AppDialogBody>
          <label htmlFor="amount">Amount</label>
          <input id="amount" />
        </AppDialogBody>
        <AppDialogFooter summary="They owe 72.000" error={busy ? undefined : "Choose a method"}>
          <button type="button">Cancel</button>
          <button type="submit">Record</button>
        </AppDialogFooter>
      </AppDialog>
    </>
  );
}

const coarse = (yes: boolean) =>
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: yes && query.includes("coarse"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      }) as MediaQueryList,
  );

beforeEach(() => {
  confirm.answer = true;
  confirm.asked = 0;
});
afterEach(() => vi.restoreAllMocks());

describe("the pop-up's frame", () => {
  it("names itself by its title and description, and says which step it is on", () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog", { name: "Record payment" });
    expect(dialog).toHaveAccessibleDescription("From the partner");
    expect(within(dialog).getByText("Step 1 of 2")).toBeInTheDocument();
  });

  it("scrolls only its body: the footer with the buttons is outside it", () => {
    render(<Harness />);
    const body = document.querySelector("[data-app-dialog-body]")!;
    const record = screen.getByRole("button", { name: "Record" });
    expect(body.contains(screen.getByLabelText("Amount"))).toBe(true);
    expect(body.contains(record)).toBe(false);
    expect(screen.getByText("They owe 72.000")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a method");
  });

  it("is a confirm the screen reader announces as one", () => {
    render(<Harness kind="confirm" />);
    expect(screen.getByRole("alertdialog", { name: "Record payment" })).toBeInTheDocument();
  });

  it("sends its form from the pinned footer", () => {
    const sent = vi.fn();
    render(<Harness onSubmit={sent} />);
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(sent).toHaveBeenCalledTimes(1);
  });
});

describe("opening it", () => {
  it("chooses no field on a touch screen, so no keyboard covers the form", async () => {
    coarse(true);
    render(<Harness />);
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    expect(screen.getByLabelText("Amount")).not.toHaveFocus();
  });

  it("puts a keyboard user in the first field", async () => {
    coarse(false);
    render(<Harness />);
    await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveFocus());
  });
});

describe("closing it", () => {
  it("closes from its close button, in the page's language", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
  });

  it("cannot be closed while it saves", async () => {
    render(<Harness busy />);
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("state")).toHaveTextContent("open");
  });

  it("asks before throwing away what was typed, and stays when told to keep editing", async () => {
    confirm.answer = false;
    render(<Harness dirty />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(confirm.asked).toBe(1));
    expect(screen.getByTestId("state")).toHaveTextContent("open");

    confirm.answer = true;
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
    expect(confirm.asked).toBe(2);
  });

  it("closes at once when nothing was typed", async () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("closed"));
    expect(confirm.asked).toBe(0);
  });
});
