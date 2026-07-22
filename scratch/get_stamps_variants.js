import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const targetId = "c7d398e2-ec81-401f-bbe7-2ab475aa4055";
  console.log(`Fetching variants for product ID '${targetId}'...`);
  
  const { data: variants, error } = await supabase
    .from("product_variants")
    .select("id, size, size_unit, color, fabric, selling_price, original_price, stock_main")
    .eq("product_id", targetId);

  if (error) {
    console.error("Error querying variants:", error);
    return;
  }

  console.log(`FOUND ${variants?.length ?? 0} variant(s):`, JSON.stringify(variants, null, 2));
}

test().catch(console.error);
