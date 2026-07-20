import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ikciahnuqhemvnyfvbyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  console.log('Querying brand info for pura...');
  const { data: brands, error: err1 } = await supabase
    .from('brands')
    .select('id, slug, name_en, logo_url')
    .eq('slug', 'pura');

  if (err1) {
    console.error('Error:', err1);
    return;
  }
  const brand = brands[0];
  console.log('Brand in brands table:', brand);

  if (brand) {
    console.log('Querying brand_public_settings for brand ID:', brand.id);
    const { data: settings, error: err2 } = await supabase
      .from('brand_public_settings')
      .select('logo_url, benefit_qr_url, favicon_url')
      .eq('brand_id', brand.id)
      .maybeSingle();

    if (err2) {
      console.error('Error settings:', err2);
    } else {
      console.log('Public settings:', settings);
    }
  }
}

check();
