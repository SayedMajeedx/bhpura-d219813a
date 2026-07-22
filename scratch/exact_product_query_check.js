import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const targetId = "c7d398e2-ec81-401f-bbe7-2ab475aa4055";
  const brandId = "b2f628c9-cfeb-444b-befe-5dbbb9d5c9e6";
  
  console.log(`Executing exact product page query for product ID '${targetId}' ...`);
  
  const { data, error } = await supabase
    .from("products")
    .select("id, category, name, name_ar, name_en, description, description_ar, description_en, image_url, media, custom_fields, base_price, original_price, product_variants(id, size, size_unit, color, fabric, selling_price, original_price, stock_main, image_url)")
    .eq("id", targetId)
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Query Error:", error);
    return;
  }

  console.log("Query Result:", JSON.stringify(data, null, 2));
}

test().catch(console.error);
