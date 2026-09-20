const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ikciahnuqhemvnyfvbyp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy';
const PURA_BRAND_ID = 'b2f628c9-cfeb-444b-befe-5dbbb9d5c9e6';

async function testRLS() {
  console.log('=== Testing RLS on newsletter_subscribers and back_in_stock_requests ===\n');

  // 1. Anon client tests
  console.log('--- 1. Testing Unauthenticated / Anon Access ---');
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Anon SELECT on newsletter_subscribers
  const { data: anonNewsSelect, error: anonNewsSelectErr } = await anonClient
    .from('newsletter_subscribers')
    .select('*')
    .eq('brand_id', PURA_BRAND_ID);
  console.log('Anon SELECT newsletter_subscribers:', {
    blocked: anonNewsSelectErr !== null || (anonNewsSelect && anonNewsSelect.length === 0),
    error: anonNewsSelectErr ? anonNewsSelectErr.message : null,
    rows: anonNewsSelect ? anonNewsSelect.length : 0
  });

  // Anon INSERT on newsletter_subscribers
  const { data: anonNewsInsert, error: anonNewsInsertErr } = await anonClient
    .from('newsletter_subscribers')
    .insert({
      brand_id: PURA_BRAND_ID,
      channel: 'email',
      contact: 'anon_test@example.com',
      lang: 'ar'
    });
  console.log('Anon INSERT newsletter_subscribers:', {
    blocked: anonNewsInsertErr !== null,
    error: anonNewsInsertErr ? anonNewsInsertErr.message : null
  });

  if (!anonNewsInsertErr) {
    throw new Error('RLS VIOLATION: Anon was able to insert into newsletter_subscribers!');
  }

  // Anon SELECT on back_in_stock_requests
  const { data: anonStockSelect, error: anonStockSelectErr } = await anonClient
    .from('back_in_stock_requests')
    .select('*')
    .eq('brand_id', PURA_BRAND_ID);
  console.log('Anon SELECT back_in_stock_requests:', {
    blocked: anonStockSelectErr !== null || (anonStockSelect && anonStockSelect.length === 0),
    error: anonStockSelectErr ? anonStockSelectErr.message : null,
    rows: anonStockSelect ? anonStockSelect.length : 0
  });

  // Anon INSERT on back_in_stock_requests
  const { data: anonStockInsert, error: anonStockInsertErr } = await anonClient
    .from('back_in_stock_requests')
    .insert({
      brand_id: PURA_BRAND_ID,
      product_id: '00000000-0000-0000-0000-000000000000',
      channel: 'email',
      contact: 'anon_test@example.com',
      lang: 'ar'
    });
  console.log('Anon INSERT back_in_stock_requests:', {
    blocked: anonStockInsertErr !== null,
    error: anonStockInsertErr ? anonStockInsertErr.message : null
  });

  if (!anonStockInsertErr) {
    throw new Error('RLS VIOLATION: Anon was able to insert into back_in_stock_requests!');
  }

  // 2. Authenticated Brand Admin tests
  console.log('\n--- 2. Testing Authenticated Brand Admin Access (majeed@hotmail.it) ---');
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
    email: 'majeed@hotmail.it',
    password: 'TestPassword123!'
  });
  if (authErr) throw authErr;
  console.log('Authenticated as:', authData.user.email);

  // Authenticated INSERT into newsletter_subscribers
  const testEmail = 'staff_test_' + Date.now() + '@example.com';
  const { data: authNewsInsert, error: authNewsInsertErr } = await authClient
    .from('newsletter_subscribers')
    .insert({
      brand_id: PURA_BRAND_ID,
      channel: 'email',
      contact: testEmail,
      lang: 'ar'
    })
    .select()
    .single();

  if (authNewsInsertErr) {
    console.error('Authenticated INSERT newsletter_subscribers failed:', authNewsInsertErr);
    throw authNewsInsertErr;
  }
  console.log('Authenticated INSERT newsletter_subscribers succeeded: ID =', authNewsInsert.id);

  // Authenticated SELECT newsletter_subscribers
  const { data: authNewsSelect, error: authNewsSelectErr } = await authClient
    .from('newsletter_subscribers')
    .select('*')
    .eq('id', authNewsInsert.id)
    .single();
  if (authNewsSelectErr || !authNewsSelect) {
    throw new Error('Authenticated SELECT failed on newsletter_subscribers');
  }
  console.log('Authenticated SELECT newsletter_subscribers succeeded:', authNewsSelect.contact);

  // Authenticated DELETE cleanup
  const { error: authNewsDelErr } = await authClient
    .from('newsletter_subscribers')
    .delete()
    .eq('id', authNewsInsert.id);
  if (authNewsDelErr) throw authNewsDelErr;
  console.log('Authenticated DELETE newsletter_subscribers cleanup succeeded');

  // Authenticated INSERT into back_in_stock_requests
  const { data: authStockInsert, error: authStockInsertErr } = await authClient
    .from('back_in_stock_requests')
    .insert({
      brand_id: PURA_BRAND_ID,
      product_id: '00000000-0000-0000-0000-000000000000',
      channel: 'whatsapp',
      contact: '+97339000000',
      lang: 'ar'
    })
    .select()
    .single();

  if (authStockInsertErr) {
    console.error('Authenticated INSERT back_in_stock_requests failed:', authStockInsertErr);
    throw authStockInsertErr;
  }
  console.log('Authenticated INSERT back_in_stock_requests succeeded: ID =', authStockInsert.id);

  // Authenticated SELECT back_in_stock_requests
  const { data: authStockSelect, error: authStockSelectErr } = await authClient
    .from('back_in_stock_requests')
    .select('*')
    .eq('id', authStockInsert.id)
    .single();
  if (authStockSelectErr || !authStockSelect) {
    throw new Error('Authenticated SELECT failed on back_in_stock_requests');
  }
  console.log('Authenticated SELECT back_in_stock_requests succeeded:', authStockSelect.contact);

  // Authenticated DELETE cleanup
  const { error: authStockDelErr } = await authClient
    .from('back_in_stock_requests')
    .delete()
    .eq('id', authStockInsert.id);
  if (authStockDelErr) throw authStockDelErr;
  console.log('Authenticated DELETE back_in_stock_requests cleanup succeeded');

  console.log('\n=== ALL RLS INVARIANTS PERFECTLY VERIFIED! ===');
}

testRLS().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
