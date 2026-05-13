#!/usr/bin/env node
/**
 * Deletes all rows from menu_categories (CASCADE removes menu_items).
 * Requires SUPABASE_SERVICE_ROLE_KEY (or equivalent) if RLS blocks deletes for anon keys.
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createSupabaseClient } = require('../lib/supabase');

const NIL = '00000000-0000-0000-0000-000000000000';

async function main() {
  const supabase = createSupabaseClient();
  if (!supabase) {
    console.error('Supabase not configured. Set SUPABASE_URL and a key in .env');
    process.exit(1);
  }

  const { error: itemErr } = await supabase.from('menu_items').delete().neq('id', '\x00');
  if (itemErr) {
    console.error('menu_items delete:', itemErr.message || itemErr);
    process.exit(1);
  }

  const { error: catErr } = await supabase.from('menu_categories').delete().neq('id', NIL);
  if (catErr) {
    console.error('menu_categories delete:', catErr.message || catErr);
    process.exit(1);
  }

  console.log('Cleared menu_items and menu_categories.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
