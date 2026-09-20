const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const fs = require("fs");

const SCREENSHOT_DIR = path.join(__dirname, "..", "docs", "screenshots");

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const sb = createClient(
    "https://ikciahnuqhemvnyfvbyp.supabase.co",
    "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy",
  );
  const { data: authData, error } = await sb.auth.signInWithPassword({
    email: "majeed@hotmail.it",
    password: "TestPassword123!",
  });
  if (error) throw error;
  console.log("Authenticated as:", authData.user.email);

  const browser = await chromium.launch({ headless: true });

  const targets = [
    {
      name: "storefront-pura",
      urlFn: (lang) => `http://localhost:5173/pura?lang=${lang}`,
      isStorefront: true,
      openWizard: false,
    },
    {
      name: "admin-settings-pura",
      urlFn: () => `http://localhost:5173/admin/b/pura/settings`,
      isStorefront: false,
      openWizard: false,
    },
    {
      name: "admin-brand-wizard",
      urlFn: () => `http://localhost:5173/admin/brands`,
      isStorefront: false,
      openWizard: true,
    },
  ];

  const viewports = [
    { name: "375px", width: 375, height: 812 },
    { name: "1280px", width: 1280, height: 800 },
  ];

  const languages = ["ar", "en"];

  for (const target of targets) {
    for (const vp of viewports) {
      for (const lang of languages) {
        const filename = `${target.name}-${vp.name}-${lang}.png`;
        const filePath = path.join(SCREENSHOT_DIR, filename);
        console.log(`\nCapturing ${filename} ...`);

        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          locale: lang === "ar" ? "ar-BH" : "en-US",
        });
        const page = await context.newPage();

        // Seed auth and language in localStorage
        await page.addInitScript(
          ({ session, lang }) => {
            try {
              window.localStorage.setItem(
                "sb-ikciahnuqhemvnyfvbyp-auth-token",
                JSON.stringify(session),
              );
              window.localStorage.setItem("lang", lang);
            } catch (e) {
              console.error("Storage error:", e);
            }
          },
          { session: authData.session, lang },
        );

        const url = target.urlFn(lang);
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000);

        if (target.openWizard) {
          // Click "Launch Brand Wizard" button
          try {
            const wizardButton = page
              .locator(
                'button:has-text("معالج إطلاق متجر"), button:has-text("Launch Brand Wizard")',
              )
              .first();
            await wizardButton.waitFor({ state: "visible", timeout: 5000 });
            await wizardButton.click();
            await page.waitForTimeout(1500);
            console.log("Opened Brand Wizard Dialog");
          } catch (err) {
            console.warn("Could not click wizard button:", err.message);
          }
        }

        await page.screenshot({ path: filePath, fullPage: false });
        console.log(`Saved screenshot to ${filePath}`);
        await context.close();
      }
    }
  }

  await browser.close();
  console.log("\nAll 12 screenshots captured successfully!");
}

main().catch(console.error);
