import React, { useState } from "react";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The review screen's merging: tick posts and merge them, merge every N in a row, split back.

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { DraftMergeControls, MergeToolbar, useDraftMerge } =
  await import("../src/features/instagram-import");
import type { MergeableDraft } from "../src/features/instagram-import";

const draft = (id: string, over: Partial<MergeableDraft> = {}): MergeableDraft => ({
  id,
  url: `https://instagram.com/p/${id}/`,
  isSoldOut: false,
  postType: "image",
  images: [
    { url: `${id}.jpg`, r2Url: `r2/${id}.jpg`, isCover: true, selected: true, status: "success" },
  ],
  coverImageUrl: `r2/${id}.jpg`,
  imageUploadStatus: "all_success",
  title: id,
  price: 10,
  description: "",
  sizes: [],
  colors: [],
  category: null,
  fieldConfidence: { name: 1, price: 1, description: 0, sizes: 0 },
  fieldSources: { name: "ai", price: "ai", description: "ai", sizes: "ai", category: "ai" },
  issues: [],
  ...over,
});

function useReview(initial: MergeableDraft[], isAr = false) {
  const [drafts, setDrafts] = useState<MergeableDraft[]>(initial);
  return { drafts, ...useDraftMerge(drafts, setDrafts, isAr) };
}
const six = () => ["a", "b", "c", "d", "e", "f"].map((id) => draft(id));

beforeEach(() => vi.clearAllMocks());

describe("useDraftMerge", () => {
  it("merges the ticked posts, and forgets the ticks", () => {
    const { result } = renderHook(() => useReview(six()));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("c"));
    expect([...result.current.selected]).toEqual(["a", "c"]);
    act(() => result.current.mergeSelected());
    expect(result.current.drafts.map((d) => d.id)).toEqual(["a", "b", "d", "e", "f"]);
    expect(result.current.drafts[0].mergedFrom?.map((d) => d.id)).toEqual(["a", "c"]);
    expect(result.current.selected.size).toBe(0);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("does nothing for fewer than two ticked posts, and unticks on a second click", () => {
    const { result } = renderHook(() => useReview(six()));
    act(() => result.current.toggle("a"));
    act(() => result.current.mergeSelected());
    expect(result.current.drafts).toHaveLength(6);
    act(() => result.current.toggle("a"));
    expect(result.current.selected.size).toBe(0);
  });

  it("merges every N posts in a row, and says how many products that made", () => {
    const { result } = renderHook(() => useReview(six()));
    act(() => result.current.groupBy(3));
    expect(result.current.drafts.map((d) => d.mergedFrom?.length)).toEqual([3, 3]);
    expect(toast.success).toHaveBeenCalledWith("6 posts became 2 products.");
  });

  it("speaks Arabic when asked to", () => {
    const { result } = renderHook(() => useReview(six(), true));
    act(() => result.current.groupBy(2));
    expect(toast.success).toHaveBeenCalledWith("صارت 6 منشورات 3 منتجاً.");
  });

  it("splits a merged product back into its posts", () => {
    const { result } = renderHook(() => useReview(six()));
    act(() => result.current.groupBy(3));
    act(() => result.current.split("a"));
    expect(result.current.drafts.map((d) => d.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("drops a tick whose post was merged away", () => {
    const { result } = renderHook(() => useReview(six()));
    act(() => result.current.toggle("b"));
    act(() => result.current.groupBy(3));
    // b is inside the product led by a (or b): the tick only counts if that id still exists.
    expect(
      [...result.current.selected].every((id) => result.current.drafts.some((d) => d.id === id)),
    ).toBe(true);
  });
});

describe("MergeToolbar and the card controls", () => {
  it("groups by the number typed, merges the ticked posts, and clears", () => {
    const onGroup = vi.fn();
    const onMerge = vi.fn();
    const onClear = vi.fn();
    const { rerender } = render(
      <MergeToolbar
        drafts={[]}
        onApplyGroups={() => undefined}
        isAr={false}
        selectedCount={0}
        onGroup={onGroup}
        onMerge={onMerge}
        onClear={onClear}
      />,
    );
    expect(screen.getByRole("button", { name: /Merge selected \(0\)/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(onGroup).toHaveBeenLastCalledWith(3);
    fireEvent.change(screen.getByLabelText("Posts per product"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(onGroup).toHaveBeenLastCalledWith(4);
    // The number stays within 2 to 10.
    fireEvent.change(screen.getByLabelText("Posts per product"), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    expect(onGroup).toHaveBeenLastCalledWith(10);

    rerender(
      <MergeToolbar
        drafts={[]}
        onApplyGroups={() => undefined}
        isAr={false}
        selectedCount={2}
        onGroup={onGroup}
        onMerge={onMerge}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Merge selected \(2\)/ }));
    expect(onMerge).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("shows a tick on every card, and a split button only on a merged product", () => {
    const onToggle = vi.fn();
    const onSplit = vi.fn();
    const { rerender } = render(
      <DraftMergeControls
        isAr={false}
        selected={false}
        mergedCount={0}
        onToggle={onToggle}
        onSplit={onSplit}
      />,
    );
    fireEvent.click(screen.getByLabelText("Select to merge"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Split/ })).toBeNull();

    rerender(
      <DraftMergeControls
        isAr={false}
        selected
        mergedCount={3}
        onToggle={onToggle}
        onSplit={onSplit}
      />,
    );
    expect(screen.getByLabelText("Select to merge")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Merged from 3 posts/ }));
    expect(onSplit).toHaveBeenCalledTimes(1);
  });
});
