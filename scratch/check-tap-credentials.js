import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
          env[key] = value;
        }
      }
    });
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL || 'https://ikciahnuqhemvnyfvbyp.supabase.co';
// Since we don't have the service role key directly in .env (only SUPABASE_ANON_KEY), 
// let's use the REST API with the anon key or check if we can query integration_credentials.
// Wait, integration_credentials has RLS which allows SELECT for authenticated users.
// We can use a direct fetch to list Tap integrations if they exist, but maybe we need service role.
// Wait, is there a service role key in process.env when we run within the terminal or is it only available in the cloud?
// Let's print the environment variables first to check if we can run query.
console.log('Available env keys:', Object.keys(env));
