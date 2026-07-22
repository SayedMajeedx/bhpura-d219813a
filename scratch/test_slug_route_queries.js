import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ikciahnuqhemvnyfvbyp.supabase.co";
const supabaseKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const slug = "pura";
  console.log(`Running exact loader queries for slug: '${slug}'...`);

  // Query 1: Base Brand
  console.log("\n1. Querying base brand...");
  const { data: baseBrand, error: brandErr } = await supabase
    .from("brands")
    .select("id, slug, name_en, name_ar, logo_url, is_active, hero_media, primary_color, about_ar, about_en")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (brandErr) {
    console.error("Base brand query error:", brandErr);
    return;
  }
  console.log("Base brand result:", baseBrand);
  if (!baseBrand) {
    console.log("No brand returned!");
    return;
  }

  // Query 2: SEO, settings, benefit, tracking
  console.log("\n2. Running Promise.all queries...");
  try {
    const [rSeo, rSettings, rBenefit, rTracking] = await Promise.all([
      supabase
        .from("brands")
        .select("meta_title, meta_description")
        .eq("id", baseBrand.id)
        .maybeSingle(),
      supabase.from("brand_public_settings").select("*").eq("brand_id", baseBrand.id).maybeSingle(),
      supabase.rpc("get_public_benefit_settings", { p_brand_id: baseBrand.id }),
      supabase.from("brand_tracking_settings").select("google_analytics_enabled, google_analytics_id, meta_pixel_enabled, meta_pixel_id, consent_required").eq("brand_id", baseBrand.id).maybeSingle(),
    ]);

    console.log("SEO Brand error:", rSeo.error);
    console.log("Settings error:", rSettings.error);
    console.log("Benefit error:", rBenefit.error);
    console.log("Tracking error:", rTracking.error);

    console.log("\nSEO Brand data:", rSeo.data);
    console.log("Settings data exists:", !!rSettings.data);
    console.log("Benefit data:", rBenefit.data);
    console.log("Tracking data:", rTracking.data);
  } catch (err) {
    console.error("Promise.all crashed with exception:", err);
  }
}

run().catch(console.error);
