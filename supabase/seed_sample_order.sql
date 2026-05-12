-- Sample order for testing Overview / Orders (run in Supabase SQL Editor)
-- Adjust whatsapp to match a real test number format from Meta (digits only, often with country code).

WITH o AS (
  INSERT INTO public.orders (customer_name, phone, whatsapp, address, total, status, currency)
  VALUES (
    'Test Customer',
    '9876543210',
    '919876543210',
    '123 Test Street, Test City 000000',
    447,
    'Confirmed',
    '₹'
  )
  RETURNING id
)
INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price, qty, veg)
SELECT o.id, 'P1', 'Margherita Pizza', 249, 1, true FROM o
UNION ALL
SELECT o.id, 'D1', 'Mango Lassi', 99, 2, true FROM o;
