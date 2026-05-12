'use strict';

const { createSupabaseClient } = require('./supabase');

/** In-memory orders when Supabase env is missing (local dev). */
let memoryOrders = [];
let memoryOrderNum = 1000;

function mapLineRows(orderItems) {
  return (orderItems || []).map((oi) => ({
    id: oi.menu_item_id || '',
    name: oi.item_name,
    price: Number(oi.unit_price),
    qty: oi.qty,
    veg: oi.veg != null ? Boolean(oi.veg) : true,
  }));
}

function mapDbOrder(row, orderItems) {
  return {
    id: row.id,
    num: row.order_num,
    name: row.customer_name,
    phone: row.phone,
    whatsapp: row.whatsapp,
    address: row.address,
    items: mapLineRows(orderItems),
    total: Number(row.total),
    status: row.status,
    time: new Date(row.placed_at).toLocaleString('en-IN'),
    outForDelivery: Boolean(row.out_for_delivery),
  };
}

async function attachOrderItems(supabase, orders) {
  if (!orders?.length) return [];
  const ids = orders.map((o) => o.id);
  const { data: lines, error } = await supabase
    .from('order_items')
    .select('order_id, menu_item_id, item_name, unit_price, qty, veg')
    .in('order_id', ids);
  if (error) {
    console.error('attachOrderItems:', error.message || error);
    return orders.map((o) => mapDbOrder(o, []));
  }
  const byOrder = new Map();
  for (const l of lines || []) {
    if (!byOrder.has(l.order_id)) byOrder.set(l.order_id, []);
    byOrder.get(l.order_id).push(l);
  }
  return orders.map((o) => mapDbOrder(o, byOrder.get(o.id) || []));
}

/**
 * Orders newest first, for dashboard / API.
 * @returns {Promise<object[]>}
 */
async function fetchOrdersForDashboard() {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return memoryOrders.slice().reverse();
  }

  const { data: ords, error } = await supabase
    .from('orders')
    .select(
      'id, order_num, customer_name, phone, whatsapp, address, total, status, currency, placed_at, out_for_delivery'
    )
    .order('placed_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('fetchOrdersForDashboard:', error.message || error);
    return [];
  }

  return attachOrderItems(supabase, ords || []);
}

/**
 * @param {string} whatsapp
 * @returns {Promise<object[]>} oldest → newest
 */
async function fetchOrdersByWhatsapp(whatsapp) {
  const supabase = createSupabaseClient();
  if (!supabase) {
    return memoryOrders.filter((o) => o.whatsapp === whatsapp);
  }

  const { data: ords, error } = await supabase
    .from('orders')
    .select(
      'id, order_num, customer_name, phone, whatsapp, address, total, status, currency, placed_at, out_for_delivery'
    )
    .eq('whatsapp', whatsapp)
    .order('placed_at', { ascending: true });

  if (error) {
    console.error('fetchOrdersByWhatsapp:', error.message || error);
    return [];
  }

  return attachOrderItems(supabase, ords || []);
}

/**
 * @param {{
 *   name: string,
 *   phone: string,
 *   whatsapp: string,
 *   address: string,
 *   items: Array<{ id: string, name: string, price: number, qty: number, veg?: boolean }>,
 *   total: number,
 *   currency?: string,
 *   status?: string
 * }} payload
 * @returns {Promise<{ ok: true, order: object } | { ok: false, message: string }>}
 */
async function insertOrderFromCheckout(payload) {
  const {
    name,
    phone,
    whatsapp,
    address,
    items,
    total,
    currency = '₹',
    status = 'Confirmed',
  } = payload;

  const supabase = createSupabaseClient();
  if (!supabase) {
    memoryOrderNum += 1;
    const order = {
      id: `local-${memoryOrderNum}`,
      num: memoryOrderNum,
      name,
      phone,
      whatsapp,
      address,
      items,
      total,
      status,
      time: new Date().toLocaleString('en-IN'),
      outForDelivery: false,
    };
    memoryOrders.push(order);
    return { ok: true, order };
  }

  const { data: ord, error: oErr } = await supabase
    .from('orders')
    .insert({
      customer_name: name,
      phone,
      whatsapp,
      address,
      total,
      status,
      currency,
    })
    .select(
      'id, order_num, customer_name, phone, whatsapp, address, total, status, currency, placed_at, out_for_delivery'
    )
    .single();

  if (oErr || !ord) {
    const msg = oErr?.message || String(oErr) || 'insert order failed';
    console.error('insertOrderFromCheckout (orders):', msg);
    return { ok: false, message: msg };
  }

  const lineRows = items.map((i) => ({
    order_id: ord.id,
    menu_item_id: i.id || null,
    item_name: i.name,
    unit_price: i.price,
    qty: i.qty,
    veg: i.veg != null ? Boolean(i.veg) : true,
  }));

  const { error: iErr } = await supabase.from('order_items').insert(lineRows);

  if (iErr) {
    console.error('insertOrderFromCheckout (order_items):', iErr.message || iErr);
    await supabase.from('orders').delete().eq('id', ord.id);
    return { ok: false, message: iErr.message || String(iErr) };
  }

  const order = {
    id: ord.id,
    num: ord.order_num,
    name: ord.customer_name,
    phone: ord.phone,
    whatsapp: ord.whatsapp,
    address: ord.address,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      qty: i.qty,
      veg: i.veg != null ? Boolean(i.veg) : true,
    })),
    total: Number(ord.total),
    status: ord.status,
    time: new Date(ord.placed_at).toLocaleString('en-IN'),
    outForDelivery: Boolean(ord.out_for_delivery),
  };
  return { ok: true, order };
}

/**
 * @param {number} orderNum
 * @param {boolean} outForDelivery
 * @returns {Promise<{ ok: true } | { ok: false, message: string, code?: number }>}
 */
async function setOrderOutForDelivery(orderNum, outForDelivery) {
  const supabase = createSupabaseClient();
  if (!supabase) {
    const o = memoryOrders.find((x) => x.num === orderNum);
    if (!o) return { ok: false, message: 'Order not found', code: 404 };
    o.outForDelivery = Boolean(outForDelivery);
    return { ok: true };
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ out_for_delivery: Boolean(outForDelivery) })
    .eq('order_num', orderNum)
    .select('order_num')
    .maybeSingle();

  if (error) {
    console.error('setOrderOutForDelivery:', error.message || error);
    return { ok: false, message: error.message || 'update failed', code: 500 };
  }
  if (!data) return { ok: false, message: 'Order not found', code: 404 };
  return { ok: true };
}

module.exports = {
  fetchOrdersForDashboard,
  fetchOrdersByWhatsapp,
  insertOrderFromCheckout,
  setOrderOutForDelivery,
};
