#!/usr/bin/env node
/**
 * Upserts menu_categories + menu_items from scripts/menu-seed-data.js (requires Supabase in .env).
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createSupabaseClient } = require('../lib/supabase');
const { MENU } = require('./menu-seed-data');

async function main() {
  const supabase = createSupabaseClient();
  if (!supabase) {
    console.error('Supabase not configured.');
    process.exit(1);
  }

  const { error: catErr } = await supabase.from('menu_categories').upsert(
    MENU.map((c) => ({ title: c.title, sort_order: c.sort })),
    { onConflict: 'title' }
  );
  if (catErr) {
    console.error('menu_categories:', catErr.message || catErr);
    if (String(catErr.message || '').includes('row-level security')) {
      console.error(
        '\nFix: run the full file supabase/seed.sql once in the Supabase SQL Editor (it adds write policies + menu rows),\n' +
          'or add SUPABASE_SERVICE_ROLE_KEY to .env and retry.'
      );
    }
    process.exit(1);
  }

  const { data: cats, error: selErr } = await supabase.from('menu_categories').select('id,title');
  if (selErr || !cats?.length) {
    console.error('menu_categories select:', selErr?.message || selErr);
    process.exit(1);
  }
  const titleToId = new Map(cats.map((r) => [r.title, r.id]));

  const rows = [];
  for (const c of MENU) {
    const categoryId = titleToId.get(c.title);
    if (!categoryId) {
      console.error('Missing category row:', c.title);
      process.exit(1);
    }
    c.items.forEach((it, idx) => {
      rows.push({
        id: it.id,
        category_id: categoryId,
        name: it.name,
        price: it.price,
        veg: true,
        sort_order: idx,
        active: true,
      });
    });
  }

  const { error: itemErr } = await supabase.from('menu_items').upsert(rows, { onConflict: 'id' });
  if (itemErr) {
    console.error('menu_items:', itemErr.message || itemErr);
    process.exit(1);
  }

  console.log(`Upserted ${MENU.length} categories and ${rows.length} menu items.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
