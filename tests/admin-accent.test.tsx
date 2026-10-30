import React from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { adminAccent } from "../src/lib/admin-accent";

// The admin is Boutq's ink; the open store's own colour comes in on its main buttons, links and
// focus rings, only when it reads (WCAG 4.5:1) in the theme the admin is in.

vi.mock("../src/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { ThemeProvider } = await import("../src/lib/theme-context");
const { useAdminAccent } = await import("../src/hooks/use-admin-accent");
const { businessSettingsKeys } = await import("../src/lib/data/business-settings/keys");

describe("the store's colour in the admin", () => {
  it("is used on white when it carries white words, and left for the ink when it is pale", () => {
    expect(adminAccent("#3f121a", "light")).toEqual({ primary: "#3f121a", foreground: "#ffffff" });
    expect(adminAccent("#f5d0d5", "light")).toBeNull();
    expect(adminAccent("#e0a96d", "light")).toBeNull(); // a mid gold: neither reads
    expect(adminAccent("not a colour", "light")).toBeNull();
    expect(adminAccent(null, "light")).toBeNull();
  });

  it("in the dark admin, is used when it reads on the dark surface, with dark words on it", () => {
    expect(adminAccent("#f5d0d5", "dark")).toEqual({ primary: "#f5d0d5", foreground: "#16171d" });
    expect(adminAccent("#3f121a", "dark")).toBeNull();
  });

  function Admin({ brandId, enabled = true }: { brandId: string; enabled?: boolean }) {
    useAdminAccent(brandId, enabled);
    return null;
  }
  const mount = (color: string, enabled = true) => {
    const client = new QueryClient();
    client.setQueryData(businessSettingsKeys.detail("b1"), { storefront_accent_color: color });
    return render(
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <Admin brandId="b1" enabled={enabled} />
        </ThemeProvider>
      </QueryClientProvider>,
    );
  };
  const rootPrimary = () => document.documentElement.style.getPropertyValue("--primary");

  it("puts it on the page's root, so dialogs wear it, and takes it off when the admin leaves", () => {
    const view = mount("#3f121a");
    expect(rootPrimary()).toBe("#3f121a");
    expect(document.documentElement.style.getPropertyValue("--ring")).toBe("#3f121a");
    view.unmount();
    expect(rootPrimary()).toBe("");
  });

  it("keeps the ink for a pale colour and on the platform's own pages", () => {
    const pale = mount("#f5d0d5");
    expect(rootPrimary()).toBe("");
    pale.unmount();
    const platform = mount("#3f121a", false);
    expect(rootPrimary()).toBe("");
    platform.unmount();
  });
});
