import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("1. Querying brand 'pura'...");
  const { data: brand, error: bErr } = await supabase
    .from("brands")
    .select("*")
    .eq("slug", "pura")
    .maybeSingle();

  if (bErr) {
    console.error("Error fetching brand:", bErr);
    return;
  }
  if (!brand) {
    console.error("Brand 'pura' not found.");
    return;
  }
  console.log("Brand found:", brand.id, brand.name);

  const productId = "6d8a9ec5-ed96-461b-b57a-33d8479e04b8";
  console.log(`\n2. Querying product ${productId} for brand ${brand.name}...`);

  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, category, name, name_ar, name_en, description, description_ar, description_en, image_url, media, custom_fields, base_price, product_variants(id, size, size_unit, color, fabric, selling_price, original_price, stock_main, image_url)")
    .eq("id", productId)
    .eq("brand_id", brand.id)
    .eq("is_active", true)
    .maybeSingle();

  if (pErr) {
    console.error("Error fetching product details:", pErr);
  } else {
    console.log("Product detail fetched successfully:", product ? "Found" : "Not Found");
    if (product) {
      console.log(JSON.stringify(product, null, 2));
    }
  }
}

run().catch(console.error);
