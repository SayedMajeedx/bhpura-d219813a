import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SmartGrouping } from "../src/features/instagram-import/components/SmartGrouping";
import type { MergeableDraft } from "../src/features/instagram-import";

// "Suggest groups": the merchant sees each proposed group with its pictures and ticks what to merge;
// only the sure groups start ticked.

const BASE = Date.UTC(2026, 9, 3, 10, 0, 0);
const at = (minutes: number) => new Date(BASE + minutes * 60_000).toISOString();

function draft(id: string, over: Partial<MergeableDraft> = {}): MergeableDraft {
  return {
    id,
    url: `https://instagram.com/p/${id}/`,
    isSoldOut: false,
    postType: "image",
    images: [
      { url: `${id}.jpg`, r2Url: `r2/${id}.jpg`, isCover: true, selected: true, status: "success" },
    ],
    coverImageUrl: `r2/${id}.jpg`,
    imageUploadStatus: "all_success",
    title: "",
    price: null,
    description: "",
    sizes: [],
    colors: [],
    category: null,
    fieldConfidence: { name: 0, price: 0, description: 0, sizes: 0 },
    fieldSources: { name: "ai", price: "ai", description: "ai", sizes: "ai", category: "ai" },
    issues: [],
    postedAt: at(0),
    caption: "",
    ...over,
  };
}
const lead = (id: string, minutes: number, title: string, price: number) =>
  draft(id, {
    postedAt: at(minutes),
    caption: `${title} السعر ${price} د.ب`,
    title,
    price,
    fieldConfidence: { name: 0.9, price: 0.9, description: 0, sizes: 0 },
  });
const photo = (id: string, minutes: number) => draft(id, { postedAt: at(minutes), caption: "" });

const sure = [
  lead("a1", 0, "عباية مرجان", 28),
  photo("a2", 2),
  photo("a3", 4),
  lead("b1", 300, "عباية سحاب", 30),
  photo("b2", 302),
];
// Two photo-only posts a few minutes apart: only time to go on, so "check".
const unsure = [photo("x1", 900), photo("x2", 906)];

const open = (drafts: MergeableDraft[], onApply = vi.fn()) => {
  render(<SmartGrouping isAr={false} drafts={drafts} onApply={onApply} />);
  fireEvent.click(screen.getByRole("button", { name: "Suggest groups" }));
  return { onApply, dialog: screen.getByRole("dialog") };
};

describe("SmartGrouping", () => {
  it("lists the groups with the name, price and why, and merges the sure ones by default", () => {
    const { onApply, dialog } = open([...sure, ...unsure]);
    expect(within(dialog).getByText(/Found 3 groups \(2 sure\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/عباية مرجان · 28/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/3 posts · Posted together, alike captions/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/2 posts · Posted close together/)).toBeInTheDocument();
    expect(within(dialog).getAllByText("Sure")).toHaveLength(2);
    expect(within(dialog).getByText("Check")).toBeInTheDocument();

    // Only the sure ones are ticked.
    expect(within(dialog).getByRole("button", { name: "Merge selected (2)" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Merge selected (2)" }));
    expect(onApply).toHaveBeenCalledWith([
      ["a1", "a2", "a3"],
      ["b1", "b2"],
    ]);
  });

  it("lets the merchant tick one that needs a look and untick one that is sure", () => {
    const { onApply, dialog } = open([...sure, ...unsure]);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Merge group 3" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Merge group 1" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Merge selected (2)" }));
    expect(onApply).toHaveBeenCalledWith([
      ["b1", "b2"],
      ["x1", "x2"],
    ]);
  });

  it("says so when nothing looks like one product, and cannot merge nothing", () => {
    const apart = [lead("a", 0, "عباية مرجان", 28), lead("b", 600, "عباية سحاب", 30)];
    const { onApply, dialog } = open(apart);
    expect(within(dialog).getByText(/No posts look like one product/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Merge selected (0)" })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("closes without merging on Cancel", () => {
    const { onApply } = open(sure);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("speaks Arabic", () => {
    render(<SmartGrouping isAr drafts={sure} onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "اقتراح ذكي" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/وجدت 2 مجموعة \(2 منها مؤكدة\)/)).toBeInTheDocument();
    expect(within(dialog).getAllByText("مؤكدة")).toHaveLength(2);
  });
});
