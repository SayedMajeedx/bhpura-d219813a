import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerticalChoice } from "../src/components/verticals/VerticalChoice";
import { pickerVerticals } from "../src/lib/verticals/registry";

// The vertical cards in brand creation and onboarding used the shared Button,
// which never wraps (`whitespace-nowrap`): long Arabic names such as
// "مأكولات وحلويات ومشروبات" and "ضمن مأكولات وحلويات ومشروبات" ran out of
// their cards. jsdom has no layout, so this checks what makes them wrap.

const coffee = pickerVerticals().find((vertical) => vertical.id === "coffee")!;

describe("a vertical card", () => {
  it("shows the name, its parent and the summary, all free to wrap", () => {
    render(
      <VerticalChoice vertical={coffee} selected={false} onSelect={() => {}} lang="ar" detailed />,
    );
    const card = screen.getByRole("button", { name: /محاصيل وقهوة مختصة/ });
    expect(card.className).toContain("whitespace-normal");
    expect(card.className).not.toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
    expect(card.className).toContain("min-w-0");

    const parent = screen.getByText(/ضمن مأكولات وحلويات ومشروبات/);
    const summary = screen.getByText(coffee.summary.ar);
    for (const line of [screen.getByText(coffee.label.ar), parent, summary]) {
      expect(line.className).toContain("break-words");
      expect(line.className).not.toContain("truncate");
    }
  });

  it("keeps the compact onboarding card to an icon and the name", () => {
    render(<VerticalChoice vertical={coffee} selected={false} onSelect={() => {}} lang="en" />);
    expect(screen.getByRole("button").textContent).toBe(coffee.label.en);
    expect(screen.getByRole("button").className).toContain("whitespace-normal");
  });

  it("says whether it is chosen and reports a click", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <VerticalChoice vertical={coffee} selected={false} onSelect={onSelect} lang="en" />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    rerender(<VerticalChoice vertical={coffee} selected onSelect={onSelect} lang="en" />);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });
});
