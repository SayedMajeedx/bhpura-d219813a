import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const brandId = 'b2f628c9-cfeb-444b-befe-5dbbb9d5c9e6';
  console.log("Querying product recommendations from products...");

  const { data, error } = await supabase
    .from("products")
    .select("id, name, name_ar, name_en, category, image_url, media, product_variants(id, selling_price, original_price, stock_main)")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Query failed with error:", error);
    return;
  }

  console.log(`Query succeeded. Found ${data.length} products.`);
  if (data.length > 0) {
    console.log("First product sample:", JSON.stringify(data[0], null, 2));
    
    // Check if product_variants is present and is an array on all products
    let missingVariantsCount = 0;
    data.forEach((p, idx) => {
      if (!p.product_variants) {
        missingVariantsCount++;
        console.log(`Product at index ${idx} (id: ${p.id}) is missing product_variants!`);
      } else if (!Array.isArray(p.product_variants)) {
        console.log(`Product at index ${idx} product_variants is not an array:`, typeof p.product_variants);
      }
    });
    console.log(`Total products missing variants: ${missingVariantsCount}`);
  }
}

run().catch(console.error);
