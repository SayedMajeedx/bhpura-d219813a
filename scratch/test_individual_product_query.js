import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const brandId = 'b2f628c9-cfeb-444b-befe-5dbbb9d5c9e6';
  const productId = 'c2267ed2-65db-48cd-9710-c02c60dba0c9';
  console.log(`Querying product ${productId} from products...`);

  const { data, error } = await supabase
    .from("products")
    .select("id, category, name, name_ar, name_en, description, description_ar, description_en, image_url, media, custom_fields, base_price, product_variants(id, size, size_unit, color, fabric, selling_price, original_price, stock_main, image_url)")
    .eq("id", productId)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Query failed with error:", error);
    return;
  }

  console.log("Query result:", JSON.stringify(data, null, 2));
}

run().catch(console.error);
