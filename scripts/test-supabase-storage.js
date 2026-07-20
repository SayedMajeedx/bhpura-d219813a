import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ikciahnuqhemvnyfvbyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mZLaZzhuKAqvgwpsZmRslQ_YahrHqxy';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  console.log('Testing Supabase Storage...');
  try {
    const { data: buckets, error: err1 } = await supabase.storage.listBuckets();
    if (err1) {
      console.error('Error listing buckets:', err1);
    } else {
      console.log('Available buckets:', buckets);
    }
  } catch (err) {
    console.error('Catch error:', err);
  }
}

test();
