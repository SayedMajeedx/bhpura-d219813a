import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampaignsScopeSwitcher } from "../src/components/campaigns/CampaignsScopeSwitcher";
import { CommunicationsScopeSwitcher } from "../src/components/communications/CommunicationsScopeSwitcher";
import { DiscountsScopeSwitcher } from "../src/components/discounts/DiscountsScopeSwitcher";
import { PagesScopeSwitcher } from "../src/components/pages/PagesScopeSwitcher";

describe("Phase 7C responsive growth and content workspaces", () => {
  test("campaign segments use an untruncated mobile scroll rail", () => {
    const { container } = render(
      <CampaignsScopeSwitcher
        lang="en"
        activeSegment="All"
        onSegmentChange={vi.fn()}
        counts={{ All: 20, VIP: 4, "Churn Risk": 3, "New Buyer": 5 }}
      />,
    );

    // Since 428519fa the segments live in a horizontal rail so labels are never
    // truncated on narrow screens: every label is rendered whole and reachable.
    const switcher = container.firstElementChild as HTMLElement;
    expect(switcher.className).toContain("overflow-x-auto");
    expect(switcher.className).toContain("scrollbar-none");
    expect(switcher.className).not.toContain("grid-cols-2");
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button.className).toContain("whitespace-nowrap");
      expect(button.querySelector(".truncate")).toBeNull();
    }
  });

  test("discount statuses remain fully reachable in a two-row mobile grid", () => {
    const { container } = render(
      <DiscountsScopeSwitcher
        lang="en"
        currentTab="all"
        onTabChange={vi.fn()}
        counts={{ all: 8, active: 4, scheduled: 2, expired: 2 }}
      />,
    );

    const switcher = container.firstElementChild as HTMLElement;
    expect(switcher.className).toContain("grid-cols-2");
    expect(screen.getByRole("button", { name: /Expired \/ Capped/ })).toBeDefined();
  });

  test("communications and pages expose both scopes without overflow", () => {
    const { container: communications } = render(
      <CommunicationsScopeSwitcher lang="en" activeScope="logs" onScopeChange={vi.fn()} />,
    );
    const { container: pages } = render(
      <PagesScopeSwitcher lang="en" activeScope="pages" onScopeChange={vi.fn()} pageCount={5} />,
    );

    // The admin's one tab bar: it scrolls sideways with whole labels rather than squeezing them.
    expect((communications.firstElementChild as HTMLElement).className).toContain(
      "overflow-x-auto",
    );
    expect((pages.firstElementChild as HTMLElement).className).toContain("grid-cols-2");
    expect(screen.getByRole("button", { name: /Emails sent/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Social Links & WhatsApp Widget/ })).toBeDefined();
  });
});
