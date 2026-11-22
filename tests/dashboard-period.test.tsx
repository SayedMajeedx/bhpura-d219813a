import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  periodBounds,
  periodSearch,
  periodWords,
  readPeriod,
} from "../src/features/dashboard/lib/dashboard-period";
import { campaignLabel, isAdCampaignId } from "../src/lib/funnel";
import { PeriodSwitch } from "../src/features/dashboard/components/PeriodSwitch";

// Stage 4 of the dashboard review (2026-11-16): the figures were for 30 days and nothing else,
// and a campaign from a Meta ad read "120250283409310510".

describe("the dashboard's period", () => {
  it("is 7, 30 or 90 days, 30 when the address says nothing or something else", () => {
    expect(readPeriod("7")).toBe(7);
    expect(readPeriod(90)).toBe(90);
    expect(readPeriod(undefined)).toBe(30);
    expect(readPeriod("45")).toBe(30);
    expect(periodSearch(30)).toEqual({});
    expect(periodSearch(7)).toEqual({ days: 7 });
  });

  it("covers whole days, the same length before it, and reads orders far enough back", () => {
    const now = new Date(2026, 10, 16, 15, 0);
    const week = periodBounds(7, now);
    expect(week.start).toEqual(new Date(2026, 10, 10));
    expect(week.previousEnd.getTime()).toBe(week.start.getTime() - 1);
    expect(week.end.getTime() - week.start.getTime()).toBe(
      week.previousEnd.getTime() - week.previousStart.getTime(),
    );
    // The stock pace looks at 45 days of sales, whatever the period.
    expect(new Date(week.ordersSince).getTime()).toBe(new Date(2026, 9, 2).getTime());
    const quarter = periodBounds(90, now);
    expect(new Date(quarter.ordersSince).getTime()).toBe(new Date(2026, 7, 4).getTime());
  });

  it("is the same all day, so a second visit reads nothing again", () => {
    // It ended at this moment, so each visit was a new period and every report was read afresh.
    const morning = periodBounds(30, new Date(2026, 10, 16, 9, 0));
    const evening = periodBounds(30, new Date(2026, 10, 16, 21, 30));
    expect(evening).toEqual(morning);
    expect(morning.end).toEqual(new Date(2026, 10, 16, 23, 59, 59, 999));
  });

  it("is said with the right Arabic count", () => {
    expect(periodWords(7, "ar")).toMatchObject({
      last: "آخر 7 أيام",
      before: "الـ 7 أيام السابقة",
    });
    expect(periodWords(30, "ar").last).toBe("آخر 30 يومًا");
    expect(periodWords(90, "en").last).toBe("the last 90 days");
  });

  it("changes in one tap, the chosen one marked", () => {
    const onChange = vi.fn();
    render(<PeriodSwitch days={30} onChange={onChange} isAr />);
    expect(screen.getByRole("radio", { name: "آخر 30 يومًا" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: "آخر 7 أيام" }));
    expect(onChange).toHaveBeenCalledWith(7);
  });
});

describe("a campaign's name", () => {
  it("reads an ad platform's number as its ad with the last digits", () => {
    expect(isAdCampaignId("120250283409310510")).toBe(true);
    expect(campaignLabel("120250283409310510", "ar")).toBe("إعلان ميتا · رقم ينتهي بـ 0510");
    expect(campaignLabel("120250283409310510", "en")).toBe("Meta ad · number ending 0510");
    expect(campaignLabel("98765432", "en")).toBe("Ad campaign · number ending 5432");
  });

  it("reads a word the store chose as words", () => {
    expect(isAdCampaignId("final-call")).toBe(false);
    expect(campaignLabel("final-call", "en")).toBe("final call");
    expect(campaignLabel("eid_2026", "ar")).toBe("eid 2026");
  });
});
