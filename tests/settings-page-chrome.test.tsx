import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// On a phone the settings' tabs started about 1,050px down (found 2026-10-15): a heading card of
// 560px and a launch checklist open until every step was done. Every "advanced" fold read the
// same words and switched the whole page to advanced. The settings now open on their tabs.

const settingsForm = vi.hoisted(() => ({
  form: { brand: { slug: "pura", name_en: "Pura" }, bs: {} },
  isDirty: false,
  dirtyCount: 0,
  isSaving: false,
  save: vi.fn(async () => undefined),
  reset: vi.fn(),
}));
const formModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  useBrandSettingsFormContext: () => settingsForm,
});
vi.mock("../src/features/settings/use-brand-settings-form", (io) => formModule(io));
vi.mock("@/features/settings/use-brand-settings-form", (io) => formModule(io));
const addons = { useAddons: () => ({ addons: [] }) };
const addonsModule = async (importOriginal: () => Promise<object>) => ({
  ...(await importOriginal()),
  ...addons,
});
vi.mock("../src/components/addons/AddonsProvider", (io) => addonsModule(io));
vi.mock("@/components/addons/AddonsProvider", (io) => addonsModule(io));

const { readinessFolded, readinessFoldKey } =
  await import("../src/features/settings/lib/readiness-fold");
const { AdvancedOnly } = await import("../src/features/settings/FieldVisibility");
const { SettingsHeader } = await import("../src/features/settings/SettingsHeader");
const { GroupNavigator, SettingsNavContext } =
  await import("../src/features/settings/GroupNavigator");
const { TrustBadgesEditor } = await import("../src/components/settings/TrustBadgesEditor");
const { setStoredSettingsLevel } = await import("../src/features/settings/settings-level");
const { I18nProvider } = await import("../src/lib/i18n");

const show = (node: React.ReactNode) => render(<I18nProvider>{node}</I18nProvider>);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("lang", "en");
  setStoredSettingsLevel("basic");
});

describe("the launch checklist above the settings", () => {
  it("is open for a new store and one line once half its steps are done", () => {
    expect(readinessFolded({ completed: 3, total: 7, choice: null })).toBe(false);
    expect(readinessFolded({ completed: 4, total: 7, choice: null })).toBe(true);
    expect(readinessFolded({ completed: 7, total: 7, choice: null })).toBe(true);
  });

  it("keeps the merchant's own choice, under a key the old rule never wrote", () => {
    expect(readinessFolded({ completed: 6, total: 7, choice: false })).toBe(false);
    expect(readinessFolded({ completed: 0, total: 7, choice: true })).toBe(true);
    expect(readinessFoldKey("b1")).toBe("store-readiness-folded-v2-b1");
  });
});

describe("an advanced fold", () => {
  const twoFolds = () =>
    show(
      <>
        <AdvancedOnly reason="Section banners & backgrounds">
          <p>Banner fields</p>
        </AdvancedOnly>
        <AdvancedOnly reason="Custom section titles">
          <p>Title fields</p>
        </AdvancedOnly>
      </>,
    );

  it("says what it holds", () => {
    twoFolds();
    expect(screen.getByText("Section banners & backgrounds")).toBeInTheDocument();
    expect(screen.getByText("Custom section titles")).toBeInTheDocument();
    expect(screen.queryByText("Banner fields")).toBeNull();
  });

  it("opens on its own, leaving the page and the other folds as they were", () => {
    twoFolds();
    const [first] = screen.getAllByRole("button", { name: "Show" });
    fireEvent.click(first);
    expect(screen.getByText("Banner fields")).toBeInTheDocument();
    expect(screen.queryByText("Title fields")).toBeNull();
    expect(localStorage.getItem("boutq_settings_level")).toBe("basic");
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText("Banner fields")).toBeNull();
  });

  it("is open on the advanced level", () => {
    setStoredSettingsLevel("advanced");
    twoFolds();
    expect(screen.getByText("Banner fields")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show" })).toBeNull();
  });
});

describe("the settings heading", () => {
  it("is one row: the title, the advanced switch and the store's preview", () => {
    show(<SettingsHeader activeTab="identity" onTabChange={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Store preview" })).toHaveAttribute("target", "_blank");
    fireEvent.click(screen.getByRole("switch", { name: "Show advanced settings" }));
    expect(localStorage.getItem("boutq_settings_level")).toBe("advanced");
    expect(screen.getByRole("textbox", { name: "Search settings" })).toBeInTheDocument();
  });
});

describe("the settings' groups", () => {
  it("write the open group into the address without a navigation", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    function Page() {
      const [activeGroup, setActiveGroup] = React.useState<string | null>(null);
      return (
        <SettingsNavContext.Provider value={{ activeGroup, setActiveGroup }}>
          <GroupNavigator
            tab="storefront"
            groups={[
              { id: "mode", render: () => <p>Mode</p> },
              { id: "seo", render: () => <p>Search engines</p> },
            ]}
          />
        </SettingsNavContext.Provider>
      );
    }
    show(<Page />);
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(screen.getByText("Search engines")).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("group")).toBe("seo");
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });
});

describe("the trust badges editor", () => {
  it("opens for a store that never saved its badges", () => {
    const onChange = vi.fn();
    show(<TrustBadgesEditor value={null} onChange={onChange} isAr={false} />);
    expect(screen.getAllByRole("switch").length).toBeGreaterThan(0);
  });
});
