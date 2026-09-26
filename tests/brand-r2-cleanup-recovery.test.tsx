import React from "react";
import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const cleanup = vi.hoisted(() => ({
  deleteBrand: vi.fn(async (_id: string, _hard: boolean) => undefined),
  purgeBrandPublicMedia: vi.fn(async (_id: string) => undefined),
  purgeBrandPrivateReceipts: vi.fn(async (_args: unknown) => undefined),
}));
vi.mock("sonner", () => ({ toast }));
const superAdmin = async (importOriginal: () => Promise<object>) => {
  const actual = (await importOriginal()) as { superAdminQueries: object };
  return {
    ...actual,
    superAdminQueries: {
      ...actual.superAdminQueries,
      brandUsage: () => ({ queryKey: ["usage"], queryFn: async () => null }),
    },
    deleteBrand: cleanup.deleteBrand,
  };
};
vi.mock("../src/lib/data/super-admin", (io) => superAdmin(io));
vi.mock("@/lib/data/super-admin", (io) => superAdmin(io));
const r2 = { purgeBrandPublicMedia: cleanup.purgeBrandPublicMedia };
vi.mock("../src/lib/r2-upload", () => r2);
vi.mock("@/lib/r2-upload", () => r2);
const receipts = { purgeBrandPrivateReceipts: cleanup.purgeBrandPrivateReceipts };
vi.mock("../src/lib/benefit-receipt.functions", () => receipts);
vi.mock("@/lib/benefit-receipt.functions", () => receipts);

const { DeleteBrandDialog } = await import("../src/components/super-admin/DeleteBrandDialog");
const { Dialog } = await import("../src/components/ui/dialog");
const { I18nProvider } = await import("../src/lib/i18n");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  localStorage.setItem("lang", "en");
});

/** Opens the dialog, ticks permanent deletion, types the slug and confirms. */
const hardDelete = () => {
  const onDone = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <Dialog open>
          <DeleteBrandDialog
            brand={{ id: "b1", slug: "qoffee", name_en: "Qoffee" }}
            onDone={onDone}
          />
        </Dialog>
      </I18nProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByPlaceholderText("qoffee"), { target: { value: "qoffee" } });
  fireEvent.click(screen.getByRole("button", { name: "Permanently delete everything" }));
  return onDone;
};

describe("brand R2 cleanup recovery", () => {
  it("purges the database, then both media stores", async () => {
    const onDone = hardDelete();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(cleanup.deleteBrand).toHaveBeenCalledWith("b1", true);
    expect(cleanup.purgeBrandPublicMedia).toHaveBeenCalledWith("b1");
    expect(cleanup.purgeBrandPrivateReceipts).toHaveBeenCalledWith({ data: { brandId: "b1" } });
  });

  it("continues media cleanup when the database purge already completed", async () => {
    cleanup.deleteBrand.mockRejectedValueOnce(new Error("BRAND_NOT_FOUND"));
    const onDone = hardDelete();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(cleanup.purgeBrandPublicMedia).toHaveBeenCalledTimes(1);
    expect(cleanup.purgeBrandPrivateReceipts).toHaveBeenCalledTimes(1);
  });

  it("reports public and private cleanup independently, then retries only the cleanup", async () => {
    cleanup.purgeBrandPrivateReceipts.mockRejectedValueOnce(new Error("R2 down"));
    const onDone = hardDelete();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Brand data was deleted, but private R2 cleanup failed. Click retry.",
        { duration: 10000 },
      ),
    );
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry media cleanup" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(cleanup.deleteBrand).toHaveBeenCalledTimes(1);
    expect(cleanup.purgeBrandPrivateReceipts).toHaveBeenCalledTimes(2);
  });

  it("makes a repeated hard database purge succeed when the brand is already absent", () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20260810210500_make_brand_purge_retryable.sql"),
      "utf8",
    );

    expect(migration).toMatch(
      /IF v_slug IS NULL THEN[\s\S]*?IF p_hard THEN[\s\S]*?'already_absent', true/,
    );
    expect(migration).toContain("RAISE EXCEPTION 'BRAND_NOT_FOUND'");
  });
});
