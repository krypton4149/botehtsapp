-- Restaurant WhatsApp bot — menu + orders
-- Run in Supabase: SQL Editor → New query → paste → Run
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS where needed

-- ─── Order number sequence (matches in-memory bot starting ~1001) ───
CREATE SEQUENCE IF NOT EXISTS orders_order_num_seq AS integer START WITH 1001 INCREMENT BY 1;

-- ─── Menu categories ───
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_categories_title_unique UNIQUE (title)
);

CREATE INDEX IF NOT EXISTS menu_categories_sort_idx ON public.menu_categories (sort_order);

-- ─── Menu items (id = WhatsApp code, e.g. P1) ───
CREATE TABLE IF NOT EXISTS public.menu_items (
  id text PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.menu_categories (id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10, 2) NOT NULL CHECK (price >= 0),
  veg boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS menu_items_category_sort_idx ON public.menu_items (category_id, sort_order);
CREATE INDEX IF NOT EXISTS menu_items_active_idx ON public.menu_items (active) WHERE active = true;

-- ─── Orders ───
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_num integer NOT NULL UNIQUE DEFAULT nextval('orders_order_num_seq'),
  customer_name text NOT NULL,
  phone text NOT NULL,
  whatsapp text NOT NULL,
  address text NOT NULL,
  total numeric(10, 2) NOT NULL CHECK (total >= 0),
  status text NOT NULL DEFAULT 'Confirmed',
  currency text NOT NULL DEFAULT '₹',
  placed_at timestamptz NOT NULL DEFAULT now()
);

ALTER SEQUENCE orders_order_num_seq OWNED BY public.orders.order_num;

CREATE INDEX IF NOT EXISTS orders_whatsapp_placed_idx ON public.orders (whatsapp, placed_at DESC);
CREATE INDEX IF NOT EXISTS orders_order_num_idx ON public.orders (order_num DESC);

-- ─── Order line items (price snapshot) ───
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  menu_item_id text REFERENCES public.menu_items (id) ON DELETE SET NULL,
  item_name text NOT NULL,
  unit_price numeric(10, 2) NOT NULL CHECK (unit_price >= 0),
  qty integer NOT NULL CHECK (qty > 0),
  veg boolean
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items (order_id);

-- ─── Align sequence with existing max(order_num) after restores ───
SELECT setval(
  'orders_order_num_seq',
  GREATEST(1000, COALESCE((SELECT MAX(order_num) FROM public.orders), 1000))
);

-- ─── Row Level Security ───
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Public read for active menu (anon + authenticated) — for future browser menu
DROP POLICY IF EXISTS "Public read menu_categories" ON public.menu_categories;
CREATE POLICY "Public read menu_categories"
  ON public.menu_categories FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read active menu_items" ON public.menu_items;
CREATE POLICY "Public read active menu_items"
  ON public.menu_items FOR SELECT
  TO anon, authenticated
  USING (active = true);

-- Orders / order_items: allow backend (anon JWT = publishable key) to read/write when key is server-only.
-- Prefer SUPABASE_SERVICE_ROLE_KEY in production (bypasses RLS).
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

DROP POLICY IF EXISTS "orders_backend_update" ON public.orders;
CREATE POLICY "orders_backend_update"
  ON public.orders FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.menu_categories IS 'Restaurant menu sections shown in WhatsApp / admin';
COMMENT ON TABLE public.menu_items IS 'Menu rows; id is the customer-facing item code';
COMMENT ON TABLE public.orders IS 'Placed orders from WhatsApp checkout';
COMMENT ON TABLE public.order_items IS 'Line items with price snapshot at order time';
