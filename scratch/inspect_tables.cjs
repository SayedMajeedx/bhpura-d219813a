const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ikciahnuqhemvnyfvbyp.supabase.co';
const supabaseKey = 'sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Fetching profiles and role for the user...");
  // Let's query profiles to see if the table exists and if we can read it
  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('*')
    .limit(5);

  if (pError) {
    console.error("Error fetching profiles:", pError);
  } else {
    console.log(`Successfully fetched ${profiles.length} profiles:`);
    for (const p of profiles) {
      console.log(`- Profile: ${p.email || p.id}, Role: ${p.role}, Status: ${p.status}`);
    }
  }

  console.log("\nChecking table definitions via RPC or RPC lists...");
  // Let's check system settings
  const { data: settings, error: sError } = await supabase
    .from('system_settings')
    .select('*')
    .limit(5);

  if (sError) {
    console.error("Error fetching system_settings:", sError);
  } else {
    console.log(`Successfully fetched ${settings.length} settings rows:`, settings);
  }
}

main().catch(console.error);
