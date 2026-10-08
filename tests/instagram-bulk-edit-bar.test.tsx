import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BulkEditBar } from "../src/features/instagram-import/components/BulkEditBar";
import { DraftImageStrip } from "../src/features/instagram-import/components/DraftImageStrip";
import type { MergeableDraft } from "../src/features/instagram-import";

// Editing the ticked posts together, and the picture strip's order controls.

const setup = (isAr = false) => {
  const handlers = {
    onCategory: vi.fn(),
    onSizes: vi.fn(),
    onPrice: vi.fn(),
    onRemove: vi.fn(),
  };
  render(<BulkEditBar isAr={isAr} count={3} {...handlers} />);
  const apply = (label: string) =>
    within(screen.getByLabelText(label).parentElement as HTMLElement).getByRole("button", {
      name: isAr ? "تطبيق" : "Apply",
    });
  return { ...handlers, apply };
};

describe("BulkEditBar", () => {
  it("applies a category, sizes and a price to the selection, then empties the field", () => {
    const { onCategory, onSizes, onPrice, apply } = setup();
    expect(screen.getByText("3 selected: edit them together")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Category for all selected"), {
      target: { value: "  عبايات " },
    });
    fireEvent.click(apply("Category for all selected"));
    expect(onCategory).toHaveBeenCalledWith("عبايات");
    expect(screen.getByLabelText("Category for all selected")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Sizes for all selected"), {
      target: { value: "52, 54 56،58" },
    });
    fireEvent.click(apply("Sizes for all selected"));
    expect(onSizes).toHaveBeenCalledWith(["52", "54", "56", "58"]);

    fireEvent.change(screen.getByLabelText("Price for all selected"), {
      target: { value: "27.5" },
    });
    fireEvent.click(apply("Price for all selected"));
    expect(onPrice).toHaveBeenCalledWith(27.5);
  });

  it("does not apply an empty field or a price that is not above zero", () => {
    const { onCategory, onSizes, onPrice, apply } = setup();
    for (const label of [
      "Category for all selected",
      "Sizes for all selected",
      "Price for all selected",
    ]) {
      expect(apply(label)).toBeDisabled();
    }
    for (const bad of ["0", "-5", "abc", "  "]) {
      fireEvent.change(screen.getByLabelText("Price for all selected"), { target: { value: bad } });
      expect(apply("Price for all selected")).toBeDisabled();
    }
    expect(onCategory).not.toHaveBeenCalled();
    expect(onSizes).not.toHaveBeenCalled();
    expect(onPrice).not.toHaveBeenCalled();
  });

  it("removes the selection, and speaks Arabic", () => {
    const { onRemove } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Remove selected" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("is in Arabic when asked", () => {
    setup(true);
    expect(screen.getByText("3 محدد: عدّلها معاً")).toBeInTheDocument();
    expect(screen.getByLabelText("السعر لكل المحدد")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إزالة المحدد" })).toBeInTheDocument();
  });
});

const picture = (n: number, over: Partial<MergeableDraft["images"][number]> = {}) => ({
  url: `${n}.jpg`,
  r2Url: `r2/${n}.jpg`,
  isCover: false,
  selected: true,
  status: "success" as const,
  ...over,
});
const draft = (images: MergeableDraft["images"]): MergeableDraft => ({
  id: "a",
  url: "https://instagram.com/p/a/",
  isSoldOut: false,
  postType: "carousel",
  images,
  coverImageUrl: "r2/1.jpg",
  imageUploadStatus: "all_success",
  title: "x",
  price: 1,
  description: "",
  sizes: [],
  colors: [],
  category: null,
  fieldConfidence: { name: 1, price: 1, description: 0, sizes: 0 },
  fieldSources: { name: "ai", price: "ai", description: "ai", sizes: "ai", category: "ai" },
  issues: [],
});

describe("DraftImageStrip", () => {
  it("moves a picture earlier or later, but not past the ends", () => {
    const onMove = vi.fn();
    render(
      <DraftImageStrip
        draft={draft([picture(1, { isCover: true }), picture(2), picture(3)])}
        isAr={false}
        onToggle={vi.fn()}
        onCover={vi.fn()}
        onSelectAll={vi.fn()}
        onMove={onMove}
      />,
    );
    const earlier = screen.getAllByLabelText("Move photo earlier");
    const later = screen.getAllByLabelText("Move photo later");
    expect(earlier[0]).toBeDisabled();
    expect(later[2]).toBeDisabled();
    fireEvent.click(earlier[1]);
    expect(onMove).toHaveBeenLastCalledWith(1, 0);
    fireEvent.click(later[1]);
    expect(onMove).toHaveBeenLastCalledWith(1, 2);
  });

  it("still ticks, sets the cover and ticks all", () => {
    const onToggle = vi.fn();
    const onCover = vi.fn();
    const onSelectAll = vi.fn();
    render(
      <DraftImageStrip
        draft={draft([picture(1, { isCover: true }), picture(2, { selected: false })])}
        isAr={false}
        onToggle={onToggle}
        onCover={onCover}
        onSelectAll={onSelectAll}
        onMove={vi.fn()}
      />,
    );
    expect(screen.getByText("1 of 2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select All" }));
    expect(onSelectAll).toHaveBeenCalledWith(true);
    // An unticked picture's thumbnail ticks it; a ticked one's sets the cover.
    fireEvent.click(screen.getByTitle("Click to include photo"));
    expect(onToggle).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByTitle("Main Cover Photo"));
    expect(onCover).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByTitle("Exclude this photo"));
    expect(onToggle).toHaveBeenLastCalledWith(0);
  });
});
