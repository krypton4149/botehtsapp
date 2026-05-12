-- Seed menu to match server.js defaults (idempotent inserts)
-- Run AFTER migrations/20250512120000_restaurant_menu_and_orders.sql

INSERT INTO public.menu_categories (title, sort_order) VALUES
  ('🍕 Pizza', 0),
  ('🍔 Burgers', 1),
  ('🍛 Indian', 2),
  ('🍝 Pasta', 3),
  ('🍟 Sides', 4),
  ('🥤 Drinks', 5),
  ('🍮 Desserts', 6)
ON CONFLICT (title) DO UPDATE SET sort_order = EXCLUDED.sort_order;

INSERT INTO public.menu_items (id, category_id, name, price, veg, sort_order)
SELECT v.id, mc.id, v.name, v.price, v.veg, v.sort_order
FROM (VALUES
  -- Pizza
  ('P1',  '🍕 Pizza', 'Margherita Pizza',      249::numeric, true,  0),
  ('P2',  '🍕 Pizza', 'Pepperoni Pizza',       349::numeric, false, 1),
  ('P3',  '🍕 Pizza', 'Paneer Tikka Pizza',    319::numeric, true,  2),
  ('P4',  '🍕 Pizza', 'BBQ Chicken Pizza',     379::numeric, false, 3),
  -- Burgers
  ('B1',  '🍔 Burgers', 'Classic Veg Burger',     149::numeric, true,  0),
  ('B2',  '🍔 Burgers', 'Crispy Chicken Burger',  199::numeric, false, 1),
  ('B3',  '🍔 Burgers', 'Double Smash Burger',    279::numeric, false, 2),
  ('B4',  '🍔 Burgers', 'Paneer Zinger Burger',   219::numeric, true,  3),
  -- Indian
  ('I1',  '🍛 Indian', 'Butter Chicken + Naan', 320::numeric, false, 0),
  ('I2',  '🍛 Indian', 'Paneer Butter Masala',  280::numeric, true,  1),
  ('I3',  '🍛 Indian', 'Chicken Biryani',       299::numeric, false, 2),
  ('I4',  '🍛 Indian', 'Veg Biryani',           229::numeric, true,  3),
  ('I5',  '🍛 Indian', 'Dal Makhani + Rice',    199::numeric, true,  4),
  -- Pasta
  ('PA1', '🍝 Pasta', 'Arrabiata Pasta',       199::numeric, true,  0),
  ('PA2', '🍝 Pasta', 'Chicken Alfredo',       269::numeric, false, 1),
  -- Sides
  ('S1',  '🍟 Sides', 'Loaded Fries',          129::numeric, true,  0),
  ('S2',  '🍟 Sides', 'Chicken Wings (6 pcs)', 249::numeric, false, 1),
  ('S3',  '🍟 Sides', 'Garlic Bread',           89::numeric, true,  2),
  -- Drinks
  ('D1',  '🥤 Drinks', 'Mango Lassi',          99::numeric, true, 0),
  ('D2',  '🥤 Drinks', 'Cold Coffee',         119::numeric, true, 1),
  ('D3',  '🥤 Drinks', 'Fresh Lime Soda',      79::numeric, true, 2),
  -- Desserts
  ('DS1', '🍮 Desserts', 'Gulab Jamun (2 pcs)',    89::numeric, true, 0),
  ('DS2', '🍮 Desserts', 'Chocolate Brownie',     129::numeric, true, 1)
) AS v(id, cat_title, name, price, veg, sort_order)
JOIN public.menu_categories mc ON mc.title = v.cat_title
ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  veg = EXCLUDED.veg,
  sort_order = EXCLUDED.sort_order;
