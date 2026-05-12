'use strict';

const { createSupabaseClient } = require('./supabase');

/**
 * Load menu from Supabase grouped by category title (same shape as R.menu).
 * @returns {Promise<
 *   | { ok: true; menu: Record<string, Array<{ id: string; name: string; price: number; veg: boolean }>>; empty?: boolean }
 *   | { ok: false; error: string; message: string }
 * >}
 */
async function fetchMenuGroupedByCategory() {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      error: 'missing_env',
      message:
        'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your environment.',
    };
  }

  const [catRes, itemRes] = await Promise.all([
    supabase.from('menu_categories').select('id,title,sort_order').order('sort_order', { ascending: true }),
    supabase
      .from('menu_items')
      .select('id,name,price,veg,sort_order,category_id')
      .eq('active', true)
      .order('sort_order', { ascending: true }),
  ]);

  const { data: cats, error: catErr } = catRes;
  if (catErr) {
    return { ok: false, error: 'query', message: catErr.message || String(catErr) };
  }

  const { data: rows, error: itemErr } = itemRes;
  if (itemErr) {
    return { ok: false, error: 'query', message: itemErr.message || String(itemErr) };
  }

  const catIdToTitle = new Map((cats || []).map((c) => [c.id, c.title]));
  const grouped = {};
  for (const c of cats || []) {
    grouped[c.title] = [];
  }
  for (const row of rows || []) {
    const title = catIdToTitle.get(row.category_id);
    if (!title) continue;
    if (!grouped[title]) grouped[title] = [];
    grouped[title].push({
      id: row.id,
      name: row.name,
      price: Number(row.price),
      veg: Boolean(row.veg),
    });
  }

  const menu = {};
  for (const c of cats || []) {
    const items = grouped[c.title] || [];
    if (items.length) menu[c.title] = items;
  }

  const itemCount = (rows || []).length;
  if (!itemCount) {
    return {
      ok: true,
      menu: {},
      empty: true,
    };
  }

  return { ok: true, menu };
}

/** Menu changes rarely; longer TTL = fewer Supabase round-trips per webhook. */
const BOT_MENU_CACHE_TTL_MS = 300_000;
let botMenuCache = { menu: null, expiresAt: 0, source: 'none' };

/**
 * Menu for the WhatsApp bot: loads from Supabase with a short TTL cache.
 * Falls back to `fallbackMenu` (e.g. R.menu) if Supabase is missing, errors, or has no rows.
 * @param {Record<string, Array<{ id: string; name: string; price: number; veg: boolean }>>} fallbackMenu
 * @returns {Promise<{ menu: Record<string, any[]>, source: 'db' | 'fallback' }>}
 */
async function getBotMenuRecord(fallbackMenu) {
  if (botMenuCache.menu && Date.now() < botMenuCache.expiresAt) {
    return { menu: botMenuCache.menu, source: botMenuCache.source };
  }

  const result = await fetchMenuGroupedByCategory();
  let menu;
  let source;
  if (result.ok && result.menu && Object.keys(result.menu).length > 0) {
    menu = result.menu;
    source = 'db';
  } else {
    menu = fallbackMenu;
    source = 'fallback';
  }

  botMenuCache = {
    menu,
    expiresAt: Date.now() + BOT_MENU_CACHE_TTL_MS,
    source,
  };
  return { menu, source };
}

/** Call after you change menu rows in Supabase so the bot picks them up immediately. */
function invalidateBotMenuCache() {
  botMenuCache.expiresAt = 0;
  botMenuCache.menu = null;
}

module.exports = {
  fetchMenuGroupedByCategory,
  getBotMenuRecord,
  invalidateBotMenuCache,
};
