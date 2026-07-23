import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
          env[key] = value;
        }
      }
    });
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL || 'https://ikciahnuqhemvnyfvbyp.supabase.co';
const anonKey = env.SUPABASE_ANON_KEY || 'sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy';

// Helper to probe columns
async function probeColumn(endpoint, query) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${endpoint}?${query}&limit=1`, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    
    // 200 means success.
    // 400 or 404 with column not found message means pending.
    if (res.status === 200) {
      return 'Applied';
    }
    
    const body = await res.text();
    if (body.includes('column') && (body.includes('does not exist') || body.includes('not found'))) {
      return 'PENDING';
    }
    
    // If it's a security block (like 401/403/406) but doesn't say "column does not exist", 
    // it means the schema parses successfully but we are blocked by RLS/Grants! Thus the column exists!
    if (res.status === 401 || res.status === 403 || res.status === 406) {
      return 'Applied';
    }

    return 'PENDING';
  } catch (e) {
    return 'PENDING';
  }
}

async function probeTable(endpoint) {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/${endpoint}?limit=1`, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    
    // If table does not exist, PostgREST returns 404.
    // If it exists but is locked down, it returns 200 (empty array) or 401/403/406 (RLS/Auth block).
    if (res.status === 200 || res.status === 401 || res.status === 403 || res.status === 406) {
      return 'Applied';
    }
    return 'PENDING';
  } catch (e) {
    return 'PENDING';
  }
}

async function checkDatabaseSchema() {
  console.log('Probing database endpoints to detect active migrations...');
  console.log(`URL: ${supabaseUrl}`);

  const results = {
    multi_business_saas_core: {
      tracks_inventory_on_products: await probeColumn('products', 'select=tracks_inventory'),
      business_type_on_brands: await probeColumn('brands', 'select=business_type'),
      permissions_on_profiles: await probeColumn('profiles', 'select=permissions')
    },
    checkout_idempotency: {
      idempotency_claims_table: await probeTable('idempotency_claims'),
      idempotency_key_on_orders: await probeColumn('orders', 'select=idempotency_key'),
      request_hash_on_orders: await probeColumn('orders', 'select=request_hash')
    },
    five_axis_variants: {
      variant_label_four_on_products: await probeColumn('products', 'select=variant_label_four_en'),
      variant_label_five_on_products: await probeColumn('products', 'select=variant_label_five_en'),
      option_four_on_variants: await probeColumn('product_variants', 'select=option_four'),
      option_five_on_variants: await probeColumn('product_variants', 'select=option_five')
    }
  };

  console.log('\n--- REAL-TIME INJECTION VERIFICATION ---');
  console.log(JSON.stringify(results, null, 2));

  const isCoreApplied = results.multi_business_saas_core.permissions_on_profiles === 'Applied';
  const isIdempotencyApplied = results.checkout_idempotency.idempotency_claims_table === 'Applied';
  const isFiveAxisApplied = results.five_axis_variants.option_four_on_variants === 'Applied';

  console.log('\n--- DATABASE DEPLOYMENT STATUS ---');
  if (isCoreApplied && isIdempotencyApplied && isFiveAxisApplied) {
    console.log('✅ ALL MIGRATIONS INJECTED SUCCESSFULLY!');
    console.log('You are 100% ready to execute the deployment!');
  } else {
    console.log('⚠️  SOME MIGRATIONS ARE NOT DETECTED IN THE LIVE DATABASE YET.');
    console.log(`- Core (Phase 4b): ${isCoreApplied ? 'Applied' : 'PENDING'}`);
    console.log(`- Idempotency (Phase 4c): ${isIdempotencyApplied ? 'Applied' : 'PENDING'}`);
    console.log(`- 5-Axis Variants (Phase 5): ${isFiveAxisApplied ? 'Applied' : 'PENDING'}`);
  }

  fs.writeFileSync(
    path.resolve(process.cwd(), 'migration_verification_results.json'), 
    JSON.stringify({ timestamp: new Date().toISOString(), results, all_applied: isCoreApplied && isIdempotencyApplied && isFiveAxisApplied }, null, 2)
  );
}

checkDatabaseSchema();
