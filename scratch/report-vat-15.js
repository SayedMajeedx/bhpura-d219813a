import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching brand public settings to check default tax rates...');
  const { data, error } = await supabase
    .from('brand_public_settings')
    .select('*');

  if (error) {
    console.error('Failed to query brand_public_settings:', error);
  } else {
    console.log(`Successfully fetched ${data?.length || 0} active brands.`);
    console.log('Brand Details:');
    data?.forEach(b => {
      console.log(`- Brand ID: ${b.brand_id}, Name: ${b.business_name}`);
    });
  }

  console.log('\nQuerying business_settings for default_tax_rate from public rows...');
  const { data: bs, error: bsError } = await supabase
    .from('business_settings')
    .select('brand_id, business_name, default_tax_rate, updated_at');

  if (bsError) {
    console.error('Failed to query business_settings directly:', bsError.message);
  } else {
    console.log(`Direct business_settings results: ${bs?.length || 0} rows.`);
    bs?.forEach(row => {
      console.log(`- Brand ID: ${row.brand_id}, Name: ${row.business_name}, Tax Rate: ${row.default_tax_rate}, Updated At: ${row.updated_at}`);
    });
  }
}

run();
