import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const brandSlug = 'pura';
  console.log(`Executing get_storefront_best_sellers RPC for brand slug: '${brandSlug}'...`);

  const { data, error } = await supabase.rpc("get_storefront_best_sellers", {
    p_brand_slug: brandSlug,
    p_limit: 10
  });

  if (error) {
    console.error("RPC failed with error:", error);
    return;
  }

  console.log("RPC Succeeded! Returned rows:", data);
}

run().catch(console.error);
