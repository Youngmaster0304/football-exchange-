const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey && 
    !supabaseUrl.includes('your-project-id') && 
    !supabaseKey.includes('your-anon-public-key')) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('[Supabase] Connected to database.');
} else {
  console.warn('[Supabase] Missing or default SUPABASE_URL / SUPABASE_ANON_KEY. Using in-memory fallback.');
}

module.exports = supabase;
