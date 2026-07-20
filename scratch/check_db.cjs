const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ikciahnuqhemvnyfvbyp.supabase.co';
const supabaseKey = 'sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Fetching brands from Supabase...");
  const { data, error } = await supabase
    .from('brands')
    .select('*');

  if (error) {
    console.error("Error fetching brands:", error);
    return;
  }

  console.log(`Successfully fetched ${data.length} brands:`);
  for (const b of data) {
    console.log(`- Brand: ${b.name_en} (${b.slug})`);
    console.log(`  ID: ${b.id}`);
    console.log(`  subscription_expires_at: ${b.subscription_expires_at} (type: ${typeof b.subscription_expires_at})`);
    console.log(`  subscription_status: ${b.subscription_status}`);
    console.log(`  subscription_tier: ${b.subscription_tier}`);
    console.log(`  is_active: ${b.is_active} (type: ${typeof b.is_active})`);
    console.log(`  payment_receipt_url: ${b.payment_receipt_url}`);
    
    // Check if new column support_access_enabled is returned
    console.log(`  support_access_enabled: ${b.support_access_enabled} (type: ${typeof b.support_access_enabled})`);
    console.log("-----------------------------------------");
  }
}

main().catch(console.error);
