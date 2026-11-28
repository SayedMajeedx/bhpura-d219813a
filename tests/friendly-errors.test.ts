import { afterEach, describe, expect, it } from "vitest";
import { errorText, friendlyError } from "../src/lib/friendly-error";
import { getFriendlyErrorMessage } from "../src/lib/utils";
import { productDeleteError } from "../src/features/inventory/lib/product-delete";
import { variantDeleteError } from "../src/features/inventory/lib/variant-delete";
import { rawErrorToasts } from "./helpers/raw-error-toasts";

// What went wrong reads in the merchant's language: a refusal named, a person's sentence kept,
// else the screen's own words. Before, an Arabic page showed "duplicate key value violates unique
// constraint" or "PRODUCT_HAS_STOCK" as they came (the ease-of-use review of 2026-11-28).

const pg = (code: string, message: string) => ({ code, message, details: null, hint: null });

describe("friendlyError", () => {
  it("names the database's common refusals in the reader's language", () => {
    expect(
      friendlyError(pg("23505", 'duplicate key value violates unique constraint "x"'), {
        lang: "ar",
      }),
    ).toBe("يوجد سجل بالاسم أو الرمز نفسه.");
    expect(friendlyError(pg("23503", "violates foreign key constraint"), { lang: "en" })).toMatch(
      /used elsewhere/,
    );
    expect(
      friendlyError(pg("42501", "permission denied for table orders"), { lang: "en" }),
    ).toMatch(/permission/);
    expect(
      friendlyError(new Error("new row violates row-level security policy"), { lang: "ar" }),
    ).toMatch(/صلاحية/);
    expect(friendlyError(new Error("PRODUCT_HAS_STOCK"), { lang: "en" })).toMatch(
      /still has pieces/,
    );
    expect(friendlyError(new Error("ORDER_NOT_FOUND: 123"), { lang: "en" })).toMatch(
      /could not be found/,
    );
    expect(friendlyError(new TypeError("Failed to fetch"), { lang: "ar" })).toMatch(/الإنترنت/);
    expect(friendlyError(pg("PGRST301", "JWT expired"), { lang: "en" })).toMatch(/Sign in again/);
    expect(
      friendlyError(pg("57014", "canceling statement due to statement timeout"), { lang: "en" }),
    ).toMatch(/too long/);
  });

  it("says the screen's own words, never the system's, for anything it does not know", () => {
    expect(
      friendlyError(new Error("SOME_NEW_CODE"), { lang: "en", fallback: "Could not save." }),
    ).toBe("Could not save.");
    expect(friendlyError(new Error('relation "x" does not exist'), { lang: "ar" })).toBe(
      "حدث خطأ، حاول مرة أخرى.",
    );
    expect(friendlyError(null, { lang: "en", fallback: "Failed" })).toBe("Failed");
  });

  it("keeps a sentence a person wrote when it is in the reader's language", () => {
    expect(friendlyError(new Error("هذا الرمز مستخدم"), { lang: "ar" })).toBe("هذا الرمز مستخدم");
    expect(friendlyError(new Error("Email already registered"), { lang: "en" })).toBe(
      "Email already registered",
    );
    // In the other language, the screen's own words read better; with none, the sentence stays.
    expect(
      friendlyError(new Error("Email already registered"), { lang: "ar", fallback: "تعذر الحفظ" }),
    ).toBe("تعذر الحفظ");
    expect(friendlyError(new Error("Email already registered"), { lang: "ar" })).toBe(
      "Email already registered",
    );
    expect(friendlyError(new Error("Try later | حاول لاحقاً"), { lang: "ar" })).toBe("حاول لاحقاً");
  });

  it("keeps the raw text for a screen that reads its own codes", () => {
    expect(errorText(pg("P0001", "CODE_TAKEN:v1"))).toBe("CODE_TAKEN:v1");
    expect(errorText("plain")).toBe("plain");
    expect(errorText(undefined)).toBe("");
    expect(productDeleteError(new Error("PRODUCT_HAS_HISTORY"), false)).toMatch(/history|sales/i);
    expect(variantDeleteError(new Error('column "x" does not exist'), false)).toBe(
      "Something went wrong. Try again.",
    );
  });
});

describe("getFriendlyErrorMessage", () => {
  afterEach(() => {
    document.documentElement.lang = "";
  });

  it("reads the page's language and takes the screen's fallback", () => {
    document.documentElement.lang = "ar";
    expect(getFriendlyErrorMessage(new Error("OWNER_EMAIL_NOT_VERIFIED"))).toMatch(/أكّد بريدك/);
    expect(getFriendlyErrorMessage(new Error("XYZ_FAILED"), "تعذر الحذف")).toBe("تعذر الحذف");
  });
});

describe("the guard's reading", () => {
  it("finds an error's raw text in a toast, and leaves one a screen reads first", () => {
    const source = [
      "toast.error(err.message || 'Failed');",
      "toast.error(getFriendlyErrorMessage(err, 'Failed'));",
      "toast.error(bookingErrorMessage(error.message, isAr));",
      "toast.error(formProblem.message);",
      "toast.warning('x', { description: uploadError?.message });",
    ].join("\n");
    expect(rawErrorToasts(source)).toEqual([1, 5]);
  });
});
