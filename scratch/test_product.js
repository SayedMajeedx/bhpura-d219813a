import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Searching products list...");

  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, category, name, name_ar, name_en, description, description_ar, description_en, image_url, media, custom_fields");

  if (pErr) {
    console.error("Error fetching products:", pErr);
  } else {
    console.log(`Successfully fetched ${products.length} products to search...`);
    products.forEach((row) => {
      const str = JSON.stringify(row);
      if (str.includes("6d8a9cc5")) {
        console.log("FOUND TYPO in products record!");
        console.log("Product ID:", row.id);
        console.log("Product Name:", row.name);
      }
    });
  }
}

test().catch(console.error);
