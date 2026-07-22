import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const targetId = "c7d398e2-ec81-401f-bbe7-2ab475aa4055";
  console.log(`Fetching details for product ID '${targetId}'...`);
  
  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, brand_id, is_active, brands(id, slug)")
    .eq("id", targetId)
    .maybeSingle();

  if (error) {
    console.error("Error querying product:", error);
    return;
  }

  if (product) {
    console.log("FOUND product details:", JSON.stringify(product, null, 2));
  } else {
    console.log("No product found with ID:", targetId);
  }
}

test().catch(console.error);
