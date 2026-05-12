-- Admin dashboard: mark when order is prepared and out for delivery
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS out_for_delivery boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.out_for_delivery IS 'Set from admin when food is prepared and sent out for delivery.';
