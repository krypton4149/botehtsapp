-- Allow backend (same anon JWT as orders) to manage menu for seeds / scripts.
-- Publishable key in server .env is not exposed to browsers in this app.

DROP POLICY IF EXISTS "menu_categories_backend_insert" ON public.menu_categories;
CREATE POLICY "menu_categories_backend_insert"
  ON public.menu_categories FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "menu_categories_backend_update" ON public.menu_categories;
CREATE POLICY "menu_categories_backend_update"
  ON public.menu_categories FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "menu_categories_backend_delete" ON public.menu_categories;
CREATE POLICY "menu_categories_backend_delete"
  ON public.menu_categories FOR DELETE
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "menu_items_backend_insert" ON public.menu_items;
CREATE POLICY "menu_items_backend_insert"
  ON public.menu_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "menu_items_backend_update" ON public.menu_items;
CREATE POLICY "menu_items_backend_update"
  ON public.menu_items FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "menu_items_backend_delete" ON public.menu_items;
CREATE POLICY "menu_items_backend_delete"
  ON public.menu_items FOR DELETE
  TO anon, authenticated
  USING (true);
