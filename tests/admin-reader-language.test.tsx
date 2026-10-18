import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { closeLabel, pageLanguage } from "../src/lib/page-language";
import { Dialog, DialogContent, DialogTitle } from "../src/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "../src/components/ui/sheet";
import { PrintableLabel } from "../src/components/barcode-label";
import { formatMoney } from "../src/lib/format";

// From a review of the admin in Arabic (2026-10-18): amounts written in English ("BHD 0.000")
// beside screens that write «0.000 د.ب.», every dialog's close button named "Close" (the sheet's
// "إغلاق / Close", both at once), and a shelf label in BHD whatever the store's currency.

afterEach(() => {
  document.documentElement.lang = "";
});

describe("the page's language for words a shared component writes", () => {
  it("reads <html lang>", () => {
    document.documentElement.lang = "ar";
    expect(pageLanguage()).toBe("ar");
    expect(closeLabel()).toBe("إغلاق");
    document.documentElement.lang = "en";
    expect(closeLabel()).toBe("Close");
    expect(closeLabel("ar")).toBe("إغلاق");
  });

  it("names a dialog's and a sheet's close button in it", () => {
    document.documentElement.lang = "ar";
    const dialog = render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>طلب</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeInTheDocument();
    dialog.unmount();

    render(
      <Sheet open>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>القائمة</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeInTheDocument();
    expect(screen.queryByText(/Close/)).not.toBeInTheDocument();
  });
});

describe("money on the admin", () => {
  it("is written in the reader's language when the language is passed", () => {
    expect(formatMoney(0, "BHD", "ar")).toContain("د.ب.");
    expect(formatMoney(0, "BHD", "ar")).not.toMatch(/[٠-٩]/);
    expect(formatMoney(0, "BHD", "en")).toMatch(/^BHD\s0\.000$/);
  });

  it("puts a label's price in the store's currency", () => {
    render(
      <PrintableLabel
        data={{ code: "123456", productName: "Abaya", price: 30, currency: "SAR" }}
      />,
    );
    expect(screen.getByText(/SAR/)).toBeInTheDocument();
    expect(screen.queryByText(/BHD/)).not.toBeInTheDocument();
  });
});
