'use strict';

/**
 * Adds public.orders.out_for_delivery when missing (PostgREST "schema cache" errors).
 * Requires a direct Postgres URI (port 5432) — not the Supabase REST URL.
 * Set SUPABASE_DB_URL or DATABASE_URL in server env (see .env.example).
 */
async function ensureOrdersOutForDeliveryColumn() {
  const conn =
    process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!conn) return false;

  let pg;
  try {
    pg = require('pg');
  } catch {
    return false;
  }

  const c = new pg.Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await c.connect();
    await c.query(
      'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS out_for_delivery boolean NOT NULL DEFAULT false'
    );
    return true;
  } catch (e) {
    console.error('ensureOrdersOutForDeliveryColumn:', e.message || e);
    return false;
  } finally {
    try {
      await c.end();
    } catch (_) {
      /* ignore */
    }
  }
}

function isMissingOutForDeliveryColumnError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  return (
    /out_for_delivery/i.test(msg) ||
    /schema cache/i.test(msg) ||
    code === '42703' ||
    code === 'PGRST204'
  );
}

module.exports = { ensureOrdersOutForDeliveryColumn, isMissingOutForDeliveryColumnError };
