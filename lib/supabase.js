'use strict';

const { createClient } = require('@supabase/supabase-js');

/** One shared client per process — avoids new TCP + auth setup on every webhook. */
let cachedSupabase = null;

function createSupabaseClient() {
  if (cachedSupabase) return cachedSupabase;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (!url) console.warn('Supabase: missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL — orders will not load from DB.');
    else console.warn('Supabase: missing service role, anon, or publishable key — orders will not load from DB.');
    return null;
  }
  cachedSupabase = createClient(url, key);
  return cachedSupabase;
}

module.exports = { createSupabaseClient };
