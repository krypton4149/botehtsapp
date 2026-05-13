-- Remove all menu data (Supabase SQL Editor). Preserves orders; order_items.menu_item_id becomes NULL.
DELETE FROM public.menu_items;
DELETE FROM public.menu_categories;
