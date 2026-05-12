-- Fix: "new row violates row-level security policy for table orders"
-- When the server uses the publishable/anon API key, Postgres role is `anon`, which had no policies on orders.
-- Run this in Supabase → SQL Editor after the initial restaurant migration.
--
-- Security: these keys must live only on your server (Vercel env, not in browser code).
-- Prefer SUPABASE_SERVICE_ROLE_KEY on the server (bypasses RLS); this file is for publishable-only setups.

DROP POLICY IF EXISTS "orders_backend_select" ON public.orders;
CREATE POLICY "orders_backend_select"
  ON public.orders FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "orders_backend_insert" ON public.orders;
CREATE POLICY "orders_backend_insert"
  ON public.orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "order_items_backend_select" ON public.order_items;
CREATE POLICY "order_items_backend_select"
  ON public.order_items FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "order_items_backend_insert" ON public.order_items;
CREATE POLICY "order_items_backend_insert"
  ON public.order_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Optional: allow status updates from a future admin API using the same key
DROP POLICY IF EXISTS "orders_backend_update" ON public.orders;
CREATE POLICY "orders_backend_update"
  ON public.orders FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY "orders_backend_insert" ON public.orders IS 'Allows WhatsApp bot (anon JWT) to place orders when using publishable key on server only';
