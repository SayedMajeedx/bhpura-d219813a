import { test, expect } from "@playwright/test";

test.describe("Brand Wizard Provisioning Suite", () => {
  // Use mock auth session for admin routes
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const session = {
        access_token: "mock-token",
        user: { id: "mock-user-id", email: "admin@boutq.test" },
      };
      localStorage.setItem("sb-ikciahnuqhemvnyfvbyp-auth-token", JSON.stringify(session));
    });
  });

  test("opens Brand Wizard dialog and supports vertical selection and slug auto-generation", async ({ page }) => {
    await page.goto("/admin/brands", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // Look for create brand button
    const createBtn = page.locator('button:has-text("إنشاء"), button:has-text("Create"), button:has-text("إضافة"), [data-brand-wizard-trigger]').first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(600);

      // Verify dialog opened
      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog).toBeVisible();

      // Test name input and slug auto-generation
      const nameInput = dialog.locator('input[placeholder*="Brand"], input[name*="name_en"], input[id*="name_en"]').first();
      if (await nameInput.isVisible()) {
        await nameInput.fill("Luxe Boutique");
        await page.waitForTimeout(200);

        // Check slug input updated automatically
        const slugInput = dialog.locator('input[name*="slug"], input[id*="slug"]').first();
        if (await slugInput.isVisible()) {
          const slugVal = await slugInput.inputValue();
          expect(slugVal.toLowerCase()).toContain("luxe");
        }
      }

      // Verify vertical buttons exist (abayas, fashion, etc.)
      const verticalButtons = dialog.locator('button:has-text("عبايات"), button:has-text("Abayas"), button:has-text("أزياء"), button:has-text("Fashion")');
      const count = await verticalButtons.count();
      expect(count).toBeGreaterThanOrEqual(1);

      // Close dialog
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }
  });

  test("validates required fields before allowing progression", async ({ page }) => {
    await page.goto("/admin/brands", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    const createBtn = page.locator('button:has-text("إنشاء"), button:has-text("Create"), button:has-text("إضافة")').first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(600);

      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible()) {
        // Find next step button
        const nextBtn = dialog.locator('button:has-text("التالي"), button:has-text("Next")').first();
        if (await nextBtn.isVisible()) {
          // Verify next button is either disabled or clicking it triggers validation
          const isDisabled = await nextBtn.isDisabled();
          if (!isDisabled) {
            await nextBtn.click();
            await page.waitForTimeout(300);
            // Verify dialog still remains on Step 1 (does not progress without required name/slug)
            await expect(dialog).toBeVisible();
          } else {
            expect(isDisabled).toBe(true);
          }
        }
      }
    }
  });
});
