console.log('Environment keys:', Object.keys(process.env).sort());
console.log('SUPABASE_SERVICE_ROLE_KEY is present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('SUPABASE_URL:', process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
