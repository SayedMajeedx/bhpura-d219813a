import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "../src/lib/theme-context";

// The admin marks the page while it is mounted (html.admin-ui), so its 13px body text and its
// figures reach the dialogs and sheets it opens, which render outside the workspace; a
// storefront never carries the mark.

describe("the admin's mark on the page", () => {
  it("is on while the admin is mounted and gone when it leaves", () => {
    const view = render(
      <ThemeProvider>
        <p>admin</p>
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("admin-ui")).toBe(true);
    view.unmount();
    expect(document.documentElement.classList.contains("admin-ui")).toBe(false);
  });
});
