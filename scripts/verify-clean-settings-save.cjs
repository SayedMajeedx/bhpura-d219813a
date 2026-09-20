const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const SUPABASE_URL = 'https://ikciahnuqhemvnyfvbyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy';

async function main() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Authenticate to get session
  const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
    email: 'majeed@hotmail.it',
    password: 'TestPassword123!'
  });
  if (authErr) throw authErr;

  const puraBrandId = 'b2f628c9-cfeb-444b-befe-5dbbb9d5c9e6';

  // 1. Snapshot business_settings before save
  const { data: beforeRow, error: beforeErr } = await sb
    .from('business_settings')
    .select('*')
    .eq('brand_id', puraBrandId)
    .single();
  if (beforeErr) throw beforeErr;

  const originalBusinessName = beforeRow.business_name || 'بيورا لاين';
  const testBusinessName = originalBusinessName + ' - Test';

  console.log('=== Step 1: Baseline business_settings Snapshot ===');
  console.log('Brand ID:', puraBrandId);
  console.log('Original business_name:', originalBusinessName);
  console.log('Original updated_at:', beforeRow.updated_at);
  console.log('Total columns in table:', Object.keys(beforeRow).length);

  // 2. Launch browser with storageState
  const browser = await chromium.launch({ headless: true });
  const storageStatePath = path.join(__dirname, '..', 'storageState.json');
  const context = await browser.newContext({
    storageState: storageStatePath,
    viewport: { width: 1280, height: 800 },
    locale: 'ar-BH',
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to /admin/b/pura/settings ...');
  await page.goto('http://localhost:5173/admin/b/pura/settings', { waitUntil: 'domcontentloaded' });
  
  // Wait for input#business_name
  const businessNameInput = page.locator('input#business_name');
  await businessNameInput.waitFor({ state: 'visible', timeout: 15000 });

  console.log('Editing business_name to:', testBusinessName);
  await businessNameInput.fill(testBusinessName);
  await page.waitForTimeout(1000);

  // Check if save button is visible and print its text
  const saveBtn = page.locator('button:has-text("حفظ"), button:has-text("Save")').last();
  console.log('Save button visible:', await saveBtn.isVisible(), 'text:', await saveBtn.innerText());
  console.log('Clicking Save button...');
  await saveBtn.click();

  // Wait a bit and inspect any toasts or messages
  await page.waitForTimeout(3000);
  const toasts = await page.locator('[data-sonner-toast]').allInnerTexts();
  console.log('Toasts present:', toasts);


  // 3. Query DB after test edit
  const { data: afterRow, error: afterErr } = await sb
    .from('business_settings')
    .select('*')
    .eq('brand_id', puraBrandId)
    .single();
  if (afterErr) throw afterErr;

  console.log('\n=== Step 2: Verifying Clean Save Invariants ===');
  console.log('Old updated_at:', beforeRow.updated_at);
  console.log('New updated_at:', afterRow.updated_at);

  const changedKeys = [];
  for (const key of Object.keys(beforeRow)) {
    const valBefore = JSON.stringify(beforeRow[key]);
    const valAfter = JSON.stringify(afterRow[key]);
    if (valBefore !== valAfter) {
      changedKeys.push({ key, before: beforeRow[key], after: afterRow[key] });
    }
  }

  console.log(`Number of columns changed: ${changedKeys.length}`);
  for (const ch of changedKeys) {
    console.log(` - ${ch.key}: ${JSON.stringify(ch.before)} -> ${JSON.stringify(ch.after)}`);
  }

  // Assert only business_name and updated_at changed
  const allowedChangedKeys = ['business_name', 'updated_at'];
  const unexpectedChanges = changedKeys.filter(c => !allowedChangedKeys.includes(c.key));

  if (unexpectedChanges.length > 0) {
    console.error('FAIL: Unrelated fields were dirtied during save!', unexpectedChanges);
    throw new Error('Unrelated fields dirtied!');
  } else {
    console.log('SUCCESS: Only business_name and updated_at were touched! Zero unrelated fields dirtied.');
  }

  // 4. Revert back to original value
  console.log('\n=== Step 3: Reverting business_name back to pristine baseline ===');
  await businessNameInput.fill(originalBusinessName);
  await page.waitForTimeout(500);
  await saveBtn.click();
  await page.waitForSelector('text=تم حفظ الإعدادات بنجاح, text=Settings saved', { timeout: 10000 });
  console.log('Reverted and saved!');

  const { data: restoredRow, error: restoreErr } = await sb
    .from('business_settings')
    .select('*')
    .eq('brand_id', puraBrandId)
    .single();
  if (restoreErr) throw restoreErr;

  console.log('Restored business_name in DB:', restoredRow.business_name);
  if (restoredRow.business_name !== originalBusinessName) {
    throw new Error('Failed to restore original business_name!');
  }
  console.log('SUCCESS: Database pristine baseline fully confirmed!');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
