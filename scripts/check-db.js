import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ikciahnuqhemvnyfvbyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  console.log('Querying brands table schema...');
  const { data, error } = await supabase
    .from('brands')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error querying brands:', error);
  } else {
    console.log('Successfully queried brands! Columns found inside the row:', Object.keys(data[0] || {}));
  }
}

check();
