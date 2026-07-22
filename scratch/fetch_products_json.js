import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const brandId = 'b2f628c9-cfeb-444b-befe-5dbbb9d5c9e6';
  console.log("Searching for product named 'أختام' or similar for Pura brand...");

  const { data, error } = await supabase
    .from("products")
    .select("id, name, name_ar, name_en, custom_fields, product_variants(id, size, size_unit, color, fabric, selling_price, original_price, stock_main, image_url)")
    .eq("brand_id", brandId);

  if (error) {
    console.error("Query failed with error:", error);
    return;
  }

  console.log("All products for Pura brand:");
  console.log(JSON.stringify(data, null, 2));
}

run().catch(console.error);
