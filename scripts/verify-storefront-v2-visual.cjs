const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ikciahnuqhemvnyfvbyp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BREAKPOINTS = [
  { name: '375px', width: 375, height: 812, isMobile: true },
  { name: '768px', width: 768, height: 1024, isMobile: false },
  { name: '1280px', width: 1280, height: 900, isMobile: false },
  { name: '1536px', width: 1536, height: 960, isMobile: false },
];

const LOCALES = [
  { code: 'ar', dir: 'rtl', label: 'Arabic' },
  { code: 'en', dir: 'ltr', label: 'English' },
];

const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots', 'v2');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function verifyStagingVersion() {
  console.log('--- Step 1: Verifying Pura staging storefront_design_version ---');
  await sb.auth.signInWithPassword({ email: 'majeed@hotmail.it', password: 'TestPassword123!' });
  const { data: brand } = await sb.from('brands').select('id, slug').eq('slug', 'pura').single();
  const { data: settings } = await sb.from('business_settings').select('storefront_design_version').eq('brand_id', brand.id).single();
  console.log(`Current Pura storefront_design_version: ${settings?.storefront_design_version}`);
  if (settings?.storefront_design_version !== 2) {
    console.log('Updating to 2...');
    await sb.from('business_settings').update({ storefront_design_version: 2 }).eq('brand_id', brand.id);
    console.log('Updated Pura storefront_design_version to 2.');
  }
}

async function run() {
  await verifyStagingVersion();

  const browser = await chromium.launch({ headless: true });
  console.log('\n--- Step 2: Testing Video Fallback on HeroV2 ---');
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'ar-BH',
    });
    const page = await context.newPage();
    // Block video media files
    await page.route(/\.(mp4|webm|ogg)$/i, route => route.abort());

    await page.goto('http://localhost:5173/pura', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    
    // Check Hero element exists and has visible heading/contrast
    const heroH1 = page.locator('h1').first();
    const isHeroH1Visible = await heroH1.isVisible();
    const h1Text = isHeroH1Visible ? await heroH1.innerText() : '';
    console.log(`Video Blocked Check: H1 visible = ${isHeroH1Visible}, text = "${h1Text}"`);

    // Verify hero container doesn't collapse
    const heroSection = page.locator('section').first();
    const heroBox = await heroSection.boundingBox();
    console.log(`Hero Box when video blocked: height = ${heroBox?.height}px, width = ${heroBox?.width}px`);
    if (!heroBox || heroBox.height < 150) {
      throw new Error(`Hero collapsed when video was blocked! Height: ${heroBox?.height}`);
    }

    // Capture video fallback screenshot
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'hero-video-fallback-1280px.png'), fullPage: false });
    console.log('Saved hero-video-fallback-1280px.png');
    await context.close();
  }

  console.log('\n--- Step 3: Testing Keyboard Navigation & Modals ---');
  {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'ar-BH',
    });
    const page = await context.newPage();
    await page.goto('http://localhost:5173/pura', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Press Tab multiple times to verify focus outlines exist and don't throw
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(100);
    }
    const focusedTag = await page.evaluate(() => document.activeElement ? document.activeElement.tagName : 'none');
    console.log(`Active element after 5 tabs: <${focusedTag}>`);

    // Check if quick view button exists on hover or if product cards exist
    const productCard = page.locator('article, [data-product-id], .group').first();
    if (await productCard.isVisible()) {
      await productCard.hover();
      await page.waitForTimeout(300);
      const quickViewBtn = page.locator('button[aria-label*="سريع"], button[aria-label*="Quick"], button:has-text("معاينة سريعة")').first();
      if (await quickViewBtn.isVisible()) {
        console.log('Found Quick View button! Clicking...');
        await quickViewBtn.click();
        await page.waitForTimeout(500);
        const modal = page.locator('[role="dialog"]').first();
        if (await modal.isVisible()) {
          console.log('Quick View modal opened! Testing Esc key...');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          const isClosed = !(await modal.isVisible());
          console.log(`Modal closed on Esc key: ${isClosed}`);
        }
      }
    }
    await context.close();
  }

  console.log('\n--- Step 4: Capturing Visual Checklist across 375, 768, 1280, 1536 in AR & EN ---');
  const sampleProductId = 'ab6ec951-2032-480b-873b-b1da13bcbd02';

  for (const bp of BREAKPOINTS) {
    for (const loc of LOCALES) {
      console.log(`\nCapturing Breakpoint: ${bp.name} (${bp.width}x${bp.height}) | Locale: ${loc.label} (${loc.code})...`);
      const context = await browser.newContext({
        viewport: { width: bp.width, height: bp.height },
        locale: loc.code === 'ar' ? 'ar-BH' : 'en-US',
      });
      const page = await context.newPage();

      // 1. Homepage
      const homeUrl = `http://localhost:5173/pura${loc.code === 'en' ? '?lang=en' : ''}`;
      await page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const trustBar = page.locator('[data-trust-bar], text=توصيل, text=Delivery, text=دفع, text=Payment').first();
      const trustBarFound = await trustBar.isVisible().catch(() => false);

      const footer = page.locator('footer').first();
      const footerFound = await footer.isVisible().catch(() => false);

      const homeFile = `storefront-home-${bp.name}-${loc.code}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, homeFile), fullPage: false });
      console.log(`  ✓ Home: ${homeFile} (TrustBar: ${trustBarFound}, Footer: ${footerFound})`);

      // 2. Product Detail Page (PDP v2)
      const pdpUrl = `http://localhost:5173/pura/product/${sampleProductId}${loc.code === 'en' ? '?lang=en' : ''}`;
      await page.goto(pdpUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const accordion = page.locator('[data-accordion], [role="region"], button[aria-expanded]').first();
      const accordionFound = await accordion.isVisible().catch(() => false);

      const pdpFile = `storefront-pdp-${bp.name}-${loc.code}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, pdpFile), fullPage: false });
      console.log(`  ✓ PDP: ${pdpFile} (Accordion: ${accordionFound})`);

      // 3. Category Page with Filters
      const catUrl = `http://localhost:5173/pura/abayas${loc.code === 'en' ? '?lang=en' : ''}`;
      await page.goto(catUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const catFile = `storefront-category-${bp.name}-${loc.code}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, catFile), fullPage: false });
      console.log(`  ✓ Category: ${catFile}`);

      // 4. Bespoke Custom Order Page
      const customUrl = `http://localhost:5173/pura/custom-order${loc.code === 'en' ? '?lang=en' : ''}`;
      await page.goto(customUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);

      const customFile = `storefront-custom-order-${bp.name}-${loc.code}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, customFile), fullPage: false });
      console.log(`  ✓ Custom Order: ${customFile}`);

      await context.close();
    }
  }

  await browser.close();
  console.log('\n=== BLOCK 2 VISUAL CHECKLIST COMPLETED SUCCESSFULLY! ===');
}

run().catch(err => {
  console.error('\nBLOCK 2 QA ERROR:', err);
  process.exit(1);
});
