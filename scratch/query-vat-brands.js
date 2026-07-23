const url = "https://ikciahnuqhemvnyfvbyp.supabase.co/rest/v1/business_settings?default_tax_rate=eq.15&select=brand_id,default_tax_rate,updated_at,created_at";
const apiKey = "sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy";

fetch(url, {
  headers: {
    "apikey": apiKey,
    "Authorization": `Bearer ${apiKey}`
  }
})
.then(res => res.json())
.then(data => {
  console.log("DIAGNOSTIC_QUERY_RESULTS:");
  console.log(JSON.stringify(data, null, 2));
})
.catch(err => {
  console.error("Error executing diagnostic query:", err);
});
