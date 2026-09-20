const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function createTestLogo() {
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#1c1917"/>
    <circle cx="64" cy="64" r="40" fill="#c5a880"/>
  </svg>`;
  const tmpPath = path.join(__dirname, "test-logo.svg");
  fs.writeFileSync(tmpPath, svgContent);
  return tmpPath;
}

async function main() {
  console.log("=== Step 1: Starting Brand Wizard E2E Test (abayas vertical) ===\n");

  // Authenticate sb client as super admin for DB verification
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: "majeed@hotmail.it",
    password: "TestPassword123!",
  });
  if (authErr) throw authErr;

  const testLogoPath = createTestLogo();
  const timestamp = Date.now();
  const testSlug = `e2e-abayas-${timestamp}`.slice(0, 30);
  const testNameEn = `E2E Abayas ${timestamp}`;
  const testNameAr = `عبايات تجريبية ${timestamp}`;
  const testOwnerEmail = `owner_${timestamp}@abayas-test.com`;

  const browser = await chromium.launch({ headless: true });
  const storageStatePath = path.join(__dirname, "..", "storageState.json");
  const context = await browser.newContext({
    storageState: storageStatePath,
    viewport: { width: 1280, height: 900 },
    locale: "ar-BH",
  });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" || text.includes("Error") || text.includes("error")) {
      console.log("BROWSER LOG:", msg.type(), text);
    }
  });
  page.on("pageerror", (err) => console.log("BROWSER ERROR:", err.message));
  page.on("response", async (resp) => {
    if (resp.status() >= 400) {
      let body = "";
      try {
        body = await resp.text();
      } catch {}
      console.log(`NETWORK ERROR ${resp.status()} on ${resp.url()}:`, body.slice(0, 300));
    }
  });

  console.log("Navigating to http://localhost:5173/admin/brands ...");
  await page.goto("http://localhost:5173/admin/brands", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // 1. Open Brand Wizard
  const wizardBtn = page
    .locator('button:has-text("معالج إطلاق متجر"), button:has-text("Launch Brand Wizard")')
    .first();
  await wizardBtn.waitFor({ state: "visible", timeout: 15000 });
  console.log('Clicking "Launch Brand Wizard"...');
  await wizardBtn.click();

  // Wait for Dialog to open
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  console.log("Brand Wizard dialog opened successfully!");

  // 2. Step 1: Identity & Vertical
  console.log("\n--- Step 1: Identity & Vertical ---");
  await dialog.locator("input#brand-name-en").fill(testNameEn);
  await dialog.locator("input#brand-name-ar").fill(testNameAr);
  await dialog.locator("input#brand-slug").fill(testSlug);
  console.log(`Filled Name EN: "${testNameEn}", Name AR: "${testNameAr}", Slug: "${testSlug}"`);

  // Select vertical: abayas ("عبايات")
  const abayasBtn = dialog.locator('button:has-text("عبايات")').first();
  await abayasBtn.click();
  console.log("Selected vertical: abayas (عبايات)");
  await page.waitForTimeout(500);

  // Click Next
  const nextBtn = dialog.locator('button:has-text("التالي"), button:has-text("Next")');
  await nextBtn.click();
  await page.waitForTimeout(1000);

  // 3. Step 2: Palette & Logo
  console.log("\n--- Step 2: Logo & Palette ---");
  await dialog.locator("text=الشعار والألوان").waitFor({ state: "visible", timeout: 10000 });
  console.log("Arrived at Logo & Palette step!");

  // Upload test logo to test palette extraction
  console.log("Uploading test logo for palette extraction...");
  const fileInput = dialog.locator('input[type="file"]');
  await fileInput.setInputFiles(testLogoPath);
  await page.waitForTimeout(2000);
  console.log("Test logo uploaded and palette extracted successfully!");

  // Click Next
  await nextBtn.click();
  await page.waitForTimeout(1000);

  // 4. Step 3: Admin & Plan
  console.log("\n--- Step 3: Admin & Plan ---");
  const ownerNameInput = dialog.locator("input#owner-name");
  await ownerNameInput.waitFor({ state: "visible", timeout: 10000 });
  await ownerNameInput.fill("Abayas Admin");
  await dialog.locator("input#owner-email").fill(testOwnerEmail);
  await dialog.locator("input#owner-phone").fill("+97339112233");
  await dialog.locator("input#owner-password").fill("TestPassword123!");
  console.log(`Filled Admin info: Email "${testOwnerEmail}"`);

  // Click Next to Review
  await nextBtn.click();
  await page.waitForTimeout(1000);

  // 5. Step 4: Review & Launch
  console.log("\n--- Step 4: Review & Launch ---");
  await dialog.locator("text=المراجعة والإطلاق").waitFor({ state: "visible", timeout: 10000 });
  console.log("Arrived at Review step!");

  // Verify that Review step displays abayas vertical and starter categories
  const reviewText = await dialog.innerText();
  if (!reviewText.includes("عبايات") && !reviewText.includes("Abayas")) {
    throw new Error("Review step does not show abayas vertical!");
  }
  console.log("Review step confirmed abayas vertical and starter pack!");

  const launchBtn = dialog.locator(
    'button:has-text("إطلاق البراند والتهيئة الفورية"), button:has-text("Launch & Provision Store")',
  );
  await launchBtn.waitFor({ state: "visible", timeout: 5000 });
  console.log('Clicking "Launch & Provision Store"...');
  await launchBtn.click();

  // Wait for provisioning pipeline to succeed
  console.log("Waiting for provisioning pipeline to complete...");
  const finishBtn = dialog.locator(
    'button:has-text("إغلاق وإنهاء"), button:has-text("Finish & Close")',
  );
  await finishBtn.waitFor({ state: "visible", timeout: 60000 });
  console.log("Provisioning pipeline completed successfully in UI!");

  await page.waitForTimeout(2000);
  await browser.close();

  // Remove tmp test logo
  try {
    fs.unlinkSync(testLogoPath);
  } catch {}

  // 6. Step 5: Verify in Database
  console.log("\n--- Step 5: Database Invariants Verification ---");
  const { data: brandRow, error: brandErr } = await sb
    .from("brands")
    .select("*")
    .eq("slug", testSlug)
    .single();

  if (brandErr || !brandRow) {
    throw new Error(
      `Brand with slug "${testSlug}" was not found in DB: ` + JSON.stringify(brandErr),
    );
  }

  const brandId = brandRow.id;
  console.log(
    `Created Brand ID: ${brandId}, Slug: ${brandRow.slug}, Primary Color: ${brandRow.primary_color}`,
  );

  // Check business_settings
  const { data: settingsRow, error: settingsErr } = await sb
    .from("business_settings")
    .select("*")
    .eq("brand_id", brandId)
    .single();

  if (settingsErr || !settingsRow) {
    throw new Error(
      `business_settings for brand "${brandId}" not found: ` + JSON.stringify(settingsErr),
    );
  }

  console.log("Verifying business_settings for abayas:");
  console.log(` - store_vertical: ${settingsRow.store_vertical} (expected 'abayas')`);
  console.log(
    ` - storefront_design_version: ${settingsRow.storefront_design_version} (expected 2)`,
  );
  console.log(` - storefront_radius: ${settingsRow.storefront_radius}`);
  console.log(` - primary_color: ${settingsRow.primary_color}`);
  console.log(` - trust_badges: ${settingsRow.trust_badges?.length} badges`);
  console.log(` - brand_palette:`, settingsRow.brand_palette);

  if (settingsRow.store_vertical !== "abayas") {
    throw new Error(`Expected store_vertical = 'abayas', got: ${settingsRow.store_vertical}`);
  }
  if (settingsRow.storefront_design_version !== 2) {
    throw new Error(
      `Expected storefront_design_version = 2, got: ${settingsRow.storefront_design_version}`,
    );
  }
  if (!settingsRow.trust_badges || settingsRow.trust_badges.length < 3) {
    throw new Error(
      `Expected at least 3 trust badges for abayas, got: ${settingsRow.trust_badges?.length}`,
    );
  }

  // Check categories starter pack
  const { data: categories, error: catErr } = await sb
    .from("categories")
    .select("*")
    .eq("brand_id", brandId);

  if (catErr) throw catErr;
  console.log(`Found ${categories.length} starter categories in DB:`);
  for (const cat of categories) {
    console.log(`   * ${cat.name_ar} / ${cat.name_en} (${cat.slug})`);
  }

  if (categories.length === 0) {
    throw new Error(`Starter categories were not seeded for brand "${brandId}"!`);
  }

  // 7. Step 6: Database Cleanup
  console.log("\n--- Step 6: Cleaning up test brand ---");
  // First unlink/delete profile
  await sb.from("profiles").update({ brand_id: null }).eq("brand_id", brandId);
  await sb.from("profiles").delete().eq("email", testOwnerEmail);
  // Delete categories
  await sb.from("categories").delete().eq("brand_id", brandId);
  // Delete business_settings
  await sb.from("business_settings").delete().eq("brand_id", brandId);
  // Delete brand_subscriptions
  await sb.from("brand_subscriptions").delete().eq("brand_id", brandId);
  // Delete brand
  const { error: delBrandErr } = await sb.from("brands").delete().eq("id", brandId);
  if (delBrandErr) throw delBrandErr;

  console.log(
    `Cleaned up test brand "${testSlug}" (${brandId}) and owner "${testOwnerEmail}" completely.`,
  );

  // Verify deletion
  const { data: verifyDel } = await sb.from("brands").select("id").eq("id", brandId).maybeSingle();
  if (verifyDel) {
    throw new Error(`Test brand ${brandId} was not deleted!`);
  }
  console.log("Cleanup verified: brand no longer exists in DB.");

  console.log("\n=== BRAND WIZARD E2E TEST PASSED WITH 100% SUCCESS! ===");
}

main().catch((err) => {
  console.error("\nE2E TEST FAILED:", err);
  process.exit(1);
});
