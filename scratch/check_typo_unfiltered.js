import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const targetId = "6d8a9cc5-ed96-461b-b57a-33d8479c04b8";
  console.log(`Checking if product '${targetId}' exists anywhere in the database...`);
  
  const { data, error } = await supabase
    .from("products")
    .select("id, name, brand_id, is_active")
    .eq("id", targetId)
    .maybeSingle();

  if (error) {
    console.error("Error querying products:", error);
    return;
  }

  if (data) {
    console.log("FOUND product with targetId:", data);
  } else {
    console.log("No product found with targetId.");
  }
}

test().catch(console.error);
