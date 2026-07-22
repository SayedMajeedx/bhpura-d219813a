import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const targetId = "c7d398e2-ec81-401f-bbe7-2ab475aa4055"; // Stamps
  console.log(`Attempting to update product ${targetId} base_price to 0...`);
  
  // Note: we might not have UPDATE permission using the publishable key unless we bypass RLS or use standard auth,
  // but let's see if the database allows it or throws a CHECK constraint error.
  const { data, error } = await supabase
    .from("products")
    .update({ base_price: 0 })
    .eq("id", targetId)
    .select();

  if (error) {
    console.log("UPDATE FAILED. Error details:", JSON.stringify(error, null, 2));
  } else {
    console.log("UPDATE SUCCEEDED! Result:", JSON.stringify(data, null, 2));
  }
}

test().catch(console.error);
