import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FASHION_FIT_PROFILES,
  FIT_PROFILE_FIELDS,
  missingFitFields,
  withFieldRequired,
  type FitProfileDefinition,
} from "../src/addons/fit-passport/lib/fit-passport";
import { FASHION_CUSTOMIZER_PRESETS } from "../src/addons/fashion-core/presets";
import { FitProfilesEditor } from "../src/components/settings/FitProfilesEditor";

const storefront = {
  brand: { id: "b1", slug: "pura", name_ar: "بيورا", name_en: "Pura" },
  lang: "en",
  t: (_ar: string, en: string) => en,
  session: null,
  settings: {} as { fit_profiles?: FitProfileDefinition[] },
};
const storefrontModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useStorefront: () => storefront,
});
vi.mock("../src/lib/storefront-context", (io) => storefrontModule(io));
vi.mock("@/lib/storefront-context", (io) => storefrontModule(io));
const client = { supabase: { from: vi.fn(), rpc: vi.fn() } };
vi.mock("../src/integrations/supabase/client", () => client);
vi.mock("@/integrations/supabase/client", () => client);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQuery: () => ({ data: null, refetch: vi.fn() }),
}));

const { ProductFitPassportSection } =
  await import("../src/addons/fit-passport/components/storefront/ProductFitPassportSection");

const abaya = (profiles: readonly FitProfileDefinition[]) =>
  profiles.find((profile) => profile.key === "abaya")!;
const armpit = (profiles: readonly FitProfileDefinition[]) =>
  abaya(profiles).fields.find((field) => field.key === "armpit_height")!;

describe("the armpit height", () => {
  it("is optional in the built-in profile, its short list and the preset a product takes", () => {
    expect(armpit(FASHION_FIT_PROFILES).required).toBe(false);
    expect(FIT_PROFILE_FIELDS.abaya.find(([key]) => key === "armpit_height")?.[3]).toBe(false);
    const field = FASHION_CUSTOMIZER_PRESETS.passport_abaya.fields.find(
      (candidate) => candidate.key === "passport_abaya_armpit_height",
    );
    expect(field?.required).toBe(false);
  });

  it("is not asked for", () => {
    expect(missingFitFields(FASHION_FIT_PROFILES, "abaya", {})).toEqual([
      "length",
      "chest_width",
      "sleeve",
    ]);
  });
});

describe("withFieldRequired", () => {
  it("changes one measurement of one profile, and leaves the template alone", () => {
    const next = withFieldRequired(FASHION_FIT_PROFILES, "abaya", "armpit_height", true);
    expect(armpit(next).required).toBe(true);
    expect(armpit(FASHION_FIT_PROFILES).required).toBe(false);
    const dress = (profiles: readonly FitProfileDefinition[]) =>
      profiles.find((profile) => profile.key === "dress");
    expect(dress(next)).toBe(dress(FASHION_FIT_PROFILES));
    expect(missingFitFields(next, "abaya", {})).toContain("armpit_height");
  });
});

describe("the settings' measurements", () => {
  function Editor({ onChange }: { onChange: (next: FitProfileDefinition[]) => void }) {
    const [profiles, setProfiles] = useState(FASHION_FIT_PROFILES);
    return (
      <FitProfilesEditor
        profiles={profiles}
        isAr={false}
        onChange={(next) => {
          setProfiles(next);
          onChange(next);
        }}
      />
    );
  }

  it("shows each measurement's state, and a switch changes it", () => {
    const onChange = vi.fn();
    render(<Editor onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Armpit height required on Abaya" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(within(toggle.closest("li")!).getByText("Optional")).toBeTruthy();

    fireEvent.click(toggle);
    expect(within(toggle.closest("li")!).getByText("Required")).toBeTruthy();
    expect(armpit(onChange.mock.lastCall![0]).required).toBe(true);
  });
});

describe("the product page follows the store's choice", () => {
  // A guest's measurements wait for them on the device, from test to test too.
  beforeEach(() => localStorage.clear());

  function Form({ onApplied }: { onApplied: (applied: boolean, problem: string | null) => void }) {
    const [, setValues] = useState<Record<string, string>>({});
    return (
      <ProductFitPassportSection
        product={{ category: "abaya", name: "Yaqoot" }}
        customFields={[{ key: "passport_abaya_length" }]}
        sizeMode="custom"
        setCfValues={setValues}
        onApplied={onApplied}
      />
    );
  }
  const type = (name: string, value: string) =>
    fireEvent.change(screen.getByLabelText(new RegExp(name)), { target: { value } });

  it("takes an order with no armpit height", () => {
    storefront.settings = {};
    const onApplied = vi.fn();
    render(<Form onApplied={onApplied} />);
    type("Full length", "54");
    type("Chest width", "22");
    type("Sleeve length", "27");
    expect(onApplied).toHaveBeenLastCalledWith(true, null);
  });

  it("asks for it once the store makes it required", () => {
    storefront.settings = {
      fit_profiles: withFieldRequired(FASHION_FIT_PROFILES, "abaya", "armpit_height", true),
    };
    const onApplied = vi.fn();
    render(<Form onApplied={onApplied} />);
    type("Full length", "54");
    type("Chest width", "22");
    type("Sleeve length", "27");
    expect(onApplied).toHaveBeenLastCalledWith(false, expect.stringContaining("Armpit height"));
  });

  it("still needs something to make the piece from when everything is optional", () => {
    storefront.settings = {
      fit_profiles: FASHION_FIT_PROFILES.map((profile) => ({
        ...profile,
        fields: profile.fields.map((field) => ({ ...field, required: false })),
      })),
    };
    const onApplied = vi.fn();
    render(<Form onApplied={onApplied} />);
    expect(onApplied).toHaveBeenLastCalledWith(false, "Enter your measurements");
    type("Full length", "54");
    expect(onApplied).toHaveBeenLastCalledWith(true, null);
  });
});
