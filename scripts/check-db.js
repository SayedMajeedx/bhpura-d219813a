import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ikciahnuqhemvnyfvbyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  console.log('Querying brand_public_settings view schema...');
  const { data, error } = await supabase
    .from('brand_public_settings')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error querying brand_public_settings:', error);
  } else {
    console.log('Successfully queried brand_public_settings! Columns found inside the row:', Object.keys(data[0] || {}));
  }
}

check();
