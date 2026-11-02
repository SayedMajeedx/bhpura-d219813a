import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SizeChoicesField } from "../src/components/inventory/SizeChoicesField";
import { FirstSizePiecesPicker } from "../src/features/inventory/components/FirstSizePiecesPicker";

// A new product's sizes before its first save, and the question asked when a product sold with
// no options gets its sizes while it holds pieces.

describe("choosing a new product's sizes", () => {
  it("ticks the store's usual sizes, adds a typed one and asks each size's pieces", () => {
    const onSizes = vi.fn();
    const onStock = vi.fn();
    render(
      <SizeChoicesField
        legend="Size"
        offered={["52", "54"]}
        sizes={["54"]}
        onSizes={onSizes}
        stock={{ "54": "2" }}
        onStock={onStock}
        stockLabel="Quantity"
        hint="Type the pieces you have beside each size."
        isAr={false}
      />,
    );
    expect(screen.getByRole("button", { name: "54" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "52" }));
    expect(onSizes).toHaveBeenLastCalledWith(["54", "52"]);

    fireEvent.change(screen.getByRole("textbox", { name: "Another size" }), {
      target: { value: "56" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onSizes).toHaveBeenLastCalledWith(["54", "56"]);

    const pieces = screen.getByRole("spinbutton", { name: "Quantity: 54" });
    expect(pieces).toHaveValue(2);
    fireEvent.change(pieces, { target: { value: "4" } });
    expect(onStock).toHaveBeenCalledWith("54", "4");
  });

  it("asks no pieces while no size is chosen", () => {
    render(
      <SizeChoicesField
        legend="المقاس"
        offered={[]}
        sizes={[]}
        onSizes={vi.fn()}
        stock={{}}
        onStock={vi.fn()}
        hint="بلا اختيار: يُباع المنتج بدون خيارات."
        isAr
      />,
    );
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByText("بلا اختيار: يُباع المنتج بدون خيارات.")).toBeInTheDocument();
  });
});

describe("which size a product's pieces are", () => {
  it("offers each new size, the chosen one marked, and says the pieces stay", () => {
    const onChoose = vi.fn();
    render(
      <FirstSizePiecesPicker
        pieces={3}
        options={["52", "54"]}
        chosen={0}
        onChoose={onChoose}
        isAr={false}
      />,
    );
    expect(screen.getByRole("radio", { name: "52" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "54" }));
    expect(onChoose).toHaveBeenCalledWith(1);
    expect(screen.getByText(/keeps these pieces and their history/)).toBeInTheDocument();
  });
});
