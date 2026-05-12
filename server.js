/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║     RESTAURANT WHATSAPP BUSINESS BOT — META CLOUD API   ║
 * ║     Official Meta API · No QR · Runs 24/7 in Cloud      ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * SETUP: Fill in your credentials in the .env file
 * DEPLOY: Works on Railway, Render, Heroku, or any Node host
 */

require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const https   = require('https');
const path    = require('path');

/** Reused TLS connections to graph.facebook.com — much faster than one cold handshake per reply. */
const graphHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60_000,
  maxSockets: 64,
});
const graphHttp = axios.create({
  httpsAgent: graphHttpsAgent,
  timeout: 12_000,
  headers: { Connection: 'keep-alive' },
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const { isRestaurantOpen } = require('./lib/restaurant-hours');
const {
  fetchOrdersForDashboard,
  insertOrderFromCheckout,
  fetchOrdersByWhatsapp,
  setOrderOutForDelivery,
} = require('./lib/supabase-orders');
const { renderAdminPage } = require('./lib/admin-dashboard');
const { fetchMenuGroupedByCategory, getBotMenuRecord } = require('./lib/supabase-menu');

// ─────────────────────────────────────────────
//  ✏️  RESTAURANT CONFIG — EDIT THIS SECTION
// ─────────────────────────────────────────────
const R = {
  name:          "Maa Jaanki Restaurant",
  /** Customer-facing name in WhatsApp messages */
  chatBrand:     "MaaJaanki Restaurant",
  /** One-line hours + area for welcome (edit to match your hours) */
  hoursShort:    "11 AM – 11 PM",
  areaShort:     "Shikohabad",
  tagline:       "Fresh Food, Fast Delivery",
  /** Shown in admin sidebar; replace with your own file under /public/ if you like. */
  logoUrl:       "/logo.svg",
  address:       "Shikohabad Rd, near Tiwariya Chauraha, Shikohabad, Uttar Pradesh 283135",
  timing:        "11:00 AM – 11:00 PM (All days)",
  currency:      "₹",
  delivery_time: "30–45 minutes",
  payment:       "Cash on Delivery / UPI on Delivery",
  min_order:     199,

  /** Fallback when Supabase has no menu rows; bot uses DB when available (see getBotMenuRecord). */
  menu: {
    "🍕 Pizza": [
      { id:"P1",  name:"Margherita Pizza",      price:249, veg:true  },
      { id:"P2",  name:"Pepperoni Pizza",        price:349, veg:false },
      { id:"P3",  name:"Paneer Tikka Pizza",     price:319, veg:true  },
      { id:"P4",  name:"BBQ Chicken Pizza",      price:379, veg:false },
    ],
    "🍔 Burgers": [
      { id:"B1",  name:"Classic Veg Burger",     price:149, veg:true  },
      { id:"B2",  name:"Crispy Chicken Burger",  price:199, veg:false },
      { id:"B3",  name:"Double Smash Burger",    price:279, veg:false },
      { id:"B4",  name:"Paneer Zinger Burger",   price:219, veg:true  },
    ],
    "🍛 Indian": [
      { id:"I1",  name:"Butter Chicken + Naan",  price:320, veg:false },
      { id:"I2",  name:"Paneer Butter Masala",   price:280, veg:true  },
      { id:"I3",  name:"Chicken Biryani",        price:299, veg:false },
      { id:"I4",  name:"Veg Biryani",            price:229, veg:true  },
      { id:"I5",  name:"Dal Makhani + Rice",     price:199, veg:true  },
    ],
    "🍝 Pasta": [
      { id:"PA1", name:"Arrabiata Pasta",        price:199, veg:true  },
      { id:"PA2", name:"Chicken Alfredo",        price:269, veg:false },
    ],
    "🍟 Sides": [
      { id:"S1",  name:"Loaded Fries",           price:129, veg:true  },
      { id:"S2",  name:"Chicken Wings (6 pcs)",  price:249, veg:false },
      { id:"S3",  name:"Garlic Bread",           price:89,  veg:true  },
    ],
    "🥤 Drinks": [
      { id:"D1",  name:"Mango Lassi",            price:99,  veg:true  },
      { id:"D2",  name:"Cold Coffee",            price:119, veg:true  },
      { id:"D3",  name:"Fresh Lime Soda",        price:79,  veg:true  },
    ],
    "🍮 Desserts": [
      { id:"DS1", name:"Gulab Jamun (2 pcs)",    price:89,  veg:true  },
      { id:"DS2", name:"Chocolate Brownie",      price:129, veg:true  },
    ],
  }
};

// ─────────────────────────────────────────────
//  META API CREDENTIALS (from .env file)
// ─────────────────────────────────────────────
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN    = process.env.VERIFY_TOKEN || "restaurant_bot_2024";
const API_URL         = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`;

// ─────────────────────────────────────────────
//  SESSION STORAGE (orders live in Supabase — see lib/supabase-orders.js)
// ─────────────────────────────────────────────
const sessions = new Map();

function session(id) {
  if (!sessions.has(id)) {
    sessions.set(id, { state:'idle', cart:[], name:'', phone:'', address:'' });
  }
  return sessions.get(id);
}

function resetSession(id) {
  sessions.set(id, { state:'idle', cart:[], name:'', phone:'', address:'' });
}

/** Last 10 digits from WhatsApp sender id (DB phone is NOT NULL when customer omits phone). */
function phoneDigitsFromWhatsApp(waFrom) {
  const d = String(waFrom || '').replace(/\D/g, '');
  if (!d.length) return '';
  return d.length >= 10 ? d.slice(-10) : d;
}

/**
 * One-message checkout: name + address (| or two lines, or "Name, full address…").
 * Legacy: name + phone + address; or inline 10-digit phone + address.
 * @param {string} text
 * @param {object} [menuRecord] when set, avoids treating "B1, …" as a name+address line
 */
function parseCheckoutDetails(text, menuRecord) {
  const trimmed = text.trim();
  const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 3) {
    return { name: lines[0], phone: lines[1], address: lines.slice(2).join(', ') };
  }
  if (lines.length === 2) {
    return { name: lines[0], phone: '', address: lines[1] };
  }
  const pipeParts = trimmed.split('|').map((p) => p.trim()).filter(Boolean);
  if (pipeParts.length >= 3) {
    return { name: pipeParts[0], phone: pipeParts[1], address: pipeParts.slice(2).join(' | ') };
  }
  if (pipeParts.length === 2) {
    return { name: pipeParts[0], phone: '', address: pipeParts[1] };
  }
  // Single line: "Sushil Yadav, Lord Krishna Centre, Shikohabad" (very common on phones)
  const firstComma = trimmed.indexOf(',');
  if (firstComma > 0 && !trimmed.includes('|') && lines.length === 1) {
    const maybeName = trimmed.slice(0, firstComma).trim();
    const maybeAddr = trimmed.slice(firstComma + 1).trim();
    if (maybeName.length >= 1 && maybeAddr.length >= 5) {
      const firstWord = maybeName.split(/\s+/)[0].trim().toUpperCase();
      const firstLooksLikeMenuCode =
        menuRecord && firstWord && findItemInMenu(menuRecord, firstWord) && maybeName.split(/\s+/).length === 1;
      if (!firstLooksLikeMenuCode) {
        return { name: maybeName, phone: '', address: maybeAddr };
      }
    }
  }
  const phoneMatch = trimmed.match(/(?:\+91[\s-]?)?([6-9]\d{9})\b/);
  if (phoneMatch) {
    const phone = phoneMatch[1];
    const full = phoneMatch[0];
    const idx = trimmed.indexOf(full);
    const before = trimmed.slice(0, idx).trim().replace(/[,;]+$/u, '');
    const after = trimmed.slice(idx + full.length).trim().replace(/^[,;\s]+/u, '');
    const name = before || 'Customer';
    if (after.length >= 5) {
      return { name, phone, address: after };
    }
  }
  return null;
}

function findItemInMenu(menuRecord, code) {
  const u = String(code).trim().toUpperCase();
  for (const items of Object.values(menuRecord)) {
    const f = items.find((i) => String(i.id).toUpperCase() === u);
    if (f) return f;
  }
  return null;
}

/** e.g. B1, B1x2, 2xB1 → { code, qty } */
function parseOneOrderToken(part) {
  const t = String(part).trim().toUpperCase().replace(/\s+/g, '');
  if (!t || t.length > 12) return null;
  let m = t.match(/^(\d{1,2})[X*]([A-Z][A-Z0-9]{0,4})$/);
  if (m) {
    const qty = Math.min(99, Math.max(1, parseInt(m[1], 10)));
    return { code: m[2], qty };
  }
  m = t.match(/^([A-Z][A-Z0-9]{0,4})[X*](\d{1,2})$/);
  if (m) {
    const qty = Math.min(99, Math.max(1, parseInt(m[2], 10)));
    return { code: m[1], qty };
  }
  m = t.match(/^([A-Z][A-Z0-9]{0,4})$/);
  if (m) return { code: m[1], qty: 1 };
  return null;
}

function parseOrderLineTokens(text, menuRecord) {
  const upper = String(text).trim().toUpperCase();
  const rawParts = upper.split(/[\s,،]+/).filter(Boolean);
  const addedSlots = [];
  const unknown = [];
  const skipUnknown = /^(I|A|THE|AND|OR|OF|IS|IN|OK|NO|YES|HI|HEY|HELLO)$/i;

  for (const part of rawParts) {
    const parsed = parseOneOrderToken(part);
    if (!parsed) {
      if (part.length >= 2 && !skipUnknown.test(part)) unknown.push(part);
      continue;
    }
    const item = findItemInMenu(menuRecord, parsed.code);
    if (item) {
      addedSlots.push({ item, qty: parsed.qty });
    } else if (parsed.code.length >= 2 && !/^(I|A|THE|AND|OR|OF|IS|IN)$/.test(parsed.code)) {
      unknown.push(part);
    }
  }
  return { addedSlots, unknown };
}

function closedOrderMsg() {
  return (
    `🕚 *${R.chatBrand}* is closed right now.\n\n` +
    `We take orders *11 AM – 11 PM* (India time).\n` +
    `Please message again after we open — we’d love to serve you! 🙏\n\n` +
    `_Type *TRACK* for a past order._`
  );
}

// ─────────────────────────────────────────────
//  MESSAGE BUILDERS
// ─────────────────────────────────────────────

function menuLineShortName(name) {
  let n = String(name).trim();
  n = n.replace(/\s+Pizza$/i, '').replace(/\s+Burger$/i, '').replace(/\s+Pasta$/i, '');
  if (n.length > 28) n = `${n.slice(0, 26)}…`;
  return n;
}

/** Compact text menu (MENU command). */
function compactMenuMsg(menuRecord) {
  let m = '🍽️ *MaaJaanki Menu*\n\n';
  const entries = Object.entries(menuRecord).filter(([, items]) => items && items.length);
  if (!entries.length) {
    return `${m}_Menu is updating — please try again in a moment._`;
  }
  for (const [cat, items] of entries) {
    m += `*${cat}*\n`;
    const parts = items.map(
      (i) =>
        `${String(i.id).toUpperCase()} ${menuLineShortName(i.name)} ${R.currency}${i.price} ${i.veg ? '🟢' : '🔴'}`
    );
    m += `${parts.join(' | ')}\n\n`;
  }
  m += '🟢 Veg   🔴 Non-veg\n\n';
  m += '👉 *B1 I4 D1* · *B1x2* = two of the same item';
  return m;
}

/** Bottom bar on cart-related replies (WhatsApp). */
function cartCommandBar() {
  return '\n\n_*ORDER* · *CART* · *MENU*_';
}

function cartBodyFromCart(cart) {
  const g = {};
  cart.forEach((i) => {
    g[i.id] ? g[i.id].qty++ : (g[i.id] = { ...i, qty: 1 });
  });
  const lines = [];
  let total = 0;
  Object.values(g).forEach((i) => {
    const sub = i.price * i.qty;
    total += sub;
    lines.push(`• ${i.name} × ${i.qty} = ${R.currency}${sub}`);
  });
  return { lines, total };
}

function cartMsg(cart) {
  if (!cart.length) {
    return `📋 Cart empty — *B1 I4* · *B1x2* · *MENU*${cartCommandBar()}`;
  }
  const { lines, total } = cartBodyFromCart(cart);
  let m = '📋 *Your cart:*\n';
  m += `${lines.join('\n')}\n`;
  m += `*Total:* ${R.currency}${total}`;
  if (total < R.min_order) {
    m += `\n\n⚠️ Min *${R.currency}${R.min_order}* — add *${R.currency}${R.min_order - total}* more.`;
  }
  m += cartCommandBar();
  return m;
}

/** After ORDER: show cart + ask for details (pipe or lines). */
function checkoutAskMsg(cart) {
  const { lines, total } = cartBodyFromCart(cart);
  return (
    '📋 *Your cart:*\n' +
    `${lines.join('\n')}\n` +
    `*Total:* ${R.currency}${total}\n\n` +
    'Send *name* and *full delivery address* in one message:\n' +
    '*Name* | *Address* · or *Name, full address*' +
    cartCommandBar()
  );
}

function formatAddedToCartReply(addedSlots, unknown, cart) {
  const lines = addedSlots.map(({ item, qty }) =>
    qty > 1
      ? `✅ ${item.name} ×${qty} — ${R.currency}${item.price * qty}`
      : `✅ ${item.name} — ${R.currency}${item.price}`
  );
  const total = cart.reduce((sum, i) => sum + i.price, 0);
  let m = '🛒 *Added!*\n\n';
  m += `${lines.join('\n')}\n\n`;
  m += `*Total:* ${R.currency}${total} (${cart.length} items)`;
  m += cartCommandBar();
  if (unknown.length) {
    m = `⚠️ Not found: ${unknown.join(', ')}\n\n${m}`;
  }
  return m;
}

function deliveryShort() {
  return String(R.delivery_time).replace(/\s*minutes?/i, ' min').trim();
}

function paymentShort() {
  const p = String(R.payment);
  if (/cash on delivery/i.test(p) && /upi/i.test(p)) return 'COD / UPI on delivery';
  return p;
}

function confirmMsg(order) {
  const names = order.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(' · ');
  return (
    `✅ *Order #${order.num}*\n` +
    `💰 *${R.currency}${order.total}* · ${paymentShort()}\n` +
    `⏱️ *${deliveryShort()}*\n\n` +
    `👤 ${order.name}\n` +
    `📍 ${order.address}\n\n` +
    `🛍️ ${names}\n\n` +
    `🙏 Thanks! We'll call to confirm.\n\n` +
    `*TRACK* — order status` +
    cartCommandBar()
  );
}

// ─────────────────────────────────────────────
//  SEND MESSAGE via Meta Cloud API
// ─────────────────────────────────────────────
async function sendMsg(to, text) {
  try {
    await graphHttp.post(API_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text }
    }, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    console.log(`📤 Sent to ${to}: ${text.substring(0,60)}...`);
  } catch (err) {
    console.error(`❌ Send failed:`, err.response?.data || err.message);
  }
}

// Text menu only (compact format for WhatsApp).
async function sendMenuList(to, menuRecord) {
  await sendMsg(to, compactMenuMsg(menuRecord));
}

/** Build order lines from session cart, save, confirm, clear session. */
async function completeCheckoutFromParsed(from, s, parsed) {
  const typedPhone = String(parsed.phone || '').trim().replace(/\D/g, '').slice(-10);
  s.name = parsed.name;
  s.phone = typedPhone || phoneDigitsFromWhatsApp(from) || '—';
  s.address = parsed.address;

  const g = {};
  s.cart.forEach((i) => {
    g[i.id] ? g[i.id].qty++ : (g[i.id] = { ...i, qty: 1 });
  });
  const items = Object.values(g);
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  const saved = await insertOrderFromCheckout({
    name: s.name,
    phone: s.phone,
    whatsapp: from,
    address: s.address,
    items,
    total,
    currency: R.currency,
    status: 'Confirmed',
  });

  if (!saved.ok) {
    console.error('Order save failed:', saved.message);
    await sendMsg(
      from,
      `⚠️ We couldn’t save your order right now (${saved.message}).\n\nPlease try again in a moment or call us at the restaurant. 🙏`
    );
    return;
  }

  const order = saved.order;
  console.log(`\n🎉 NEW ORDER #${order.num} — ${order.name} — ${R.currency}${order.total}`);

  resetSession(from);
  await sendMsg(from, confirmMsg(order));
}

// ─────────────────────────────────────────────
//  CORE MESSAGE HANDLER
// ─────────────────────────────────────────────
async function handleMsg(from, text) {
  const upper = text.trim().toUpperCase();
  const s = session(from);
  /** Menu is only loaded when needed (MENU / item codes / checkout parsing) — saves 1–2 DB round-trips on HI, TRACK, CART, etc. */
  let menuPromise = null;
  const loadBotMenu = async () => {
    if (!menuPromise) menuPromise = getBotMenuRecord(R.menu).then((r) => r.menu);
    return menuPromise;
  };

  console.log(`📩 [${from}] "${text}" | state: ${s.state}`);

  // ── AWAITING NAME + ADDRESS (one reply); optional legacy phone in message ──
  if (s.state === 'awaiting_checkout_details') {
    if (!isRestaurantOpen()) {
      await sendMsg(from, closedOrderMsg());
      resetSession(from);
      return;
    }
    const botMenu = await loadBotMenu();
    const parsed = parseCheckoutDetails(text, botMenu);
    if (!parsed || parsed.address.length < 5) {
      await sendMsg(
        from,
        `⚠️ Send *name* and *full address* in one message:\n` +
          `*Name* | *Address*\n` +
          `or *Name, full address* (comma is fine)` +
          cartCommandBar()
      );
      return;
    }
    await completeCheckoutFromParsed(from, s, parsed);
    return;
  }

  // ── TRACK / HELP (always, even when closed) ──
  if (upper === 'TRACK' || upper === 'TRACK ORDER') {
    const myOrders = await fetchOrdersByWhatsapp(from);
    if (!myOrders.length) {
      await sendMsg(from, `📦 No orders found for your number.\n\nType *MENU* to place your first order!`);
      return;
    }
    const last = myOrders[myOrders.length - 1];
    await sendMsg(from, `📦 *Order #${last.num} Status*\n━━━━━━━━━━━━━━━━\n✅ Status: *${last.status}*\n🕐 Placed: ${last.time}\n💰 Total: ${R.currency}${last.total}\n📍 Delivery to: ${last.address}\n\n⏱️ Estimated: ${R.delivery_time}\n\nThank you for your patience! 🙏`);
    return;
  }

  if (upper === 'HELP' || upper === '?') {
    await sendMsg(
      from,
      `*MENU* — View menu   *CART* — View cart\n` +
        `*ORDER* — Checkout   *TRACK* — Order status\n` +
        `*REMOVE* — Remove last item   *CLEAR* — Empty cart\n` +
        `*HELP* — Show this list\n\n` +
        `📍 ${R.address}\n🕐 ${R.timing}`
    );
    return;
  }

  const open = isRestaurantOpen();
  const whenClosedAllow = new Set(['CART', 'CLEAR', 'CANCEL', 'REMOVE', 'UNDO']);
  if (!open && !whenClosedAllow.has(upper)) {
    await sendMsg(from, closedOrderMsg());
    return;
  }

  // ── GREETINGS ──
  const greet = ['HI','HELLO','HEY','NAMASTE','START','HAI','HELO','SALAM','NAMASKAR'];
  if (greet.includes(upper)) {
    await sendMsg(
      from,
      `👋 Welcome to *${R.chatBrand}*!\n\n` +
        `🕐 ${R.hoursShort} | Min order *${R.currency}${R.min_order}* | 📍 ${R.areaShort}\n\n` +
        `Reply *MENU* to see our menu`
    );
    return;
  }

  // ── MENU ──
  if (upper === 'MENU' || upper === 'SHOW MENU') {
    await sendMenuList(from, await loadBotMenu());
    return;
  }

  // ── CART ──
  if (upper === 'CART') {
    await sendMsg(from, cartMsg(s.cart));
    return;
  }

  // ── CLEAR ──
  if (upper === 'CLEAR' || upper === 'CANCEL') {
    s.cart = [];
    await sendMsg(from, `🗑️ Cart cleared.${cartCommandBar()}`);
    return;
  }

  // ── REMOVE LAST ──
  if (upper === 'REMOVE' || upper === 'UNDO') {
    if (!s.cart.length) {
      await sendMsg(from, `Cart is empty.${cartCommandBar()}`);
      return;
    }
    const removed = s.cart.pop();
    await sendMsg(from, `✅ Removed *${removed.name}*${cartCommandBar()}`);
    return;
  }

  // ── ORDER ──
  if (upper === 'ORDER' || upper === 'CHECKOUT' || upper === 'PLACE ORDER') {
    if (!s.cart.length) {
      await sendMsg(from, `🛒 Cart empty — *B1 I4* or *B1x2*, or *MENU*.${cartCommandBar()}`);
      return;
    }
    const total = s.cart.reduce((sum, i) => sum + i.price, 0);
    if (total < R.min_order) {
      await sendMsg(
        from,
        `⚠️ Min *${R.currency}${R.min_order}* — cart *${R.currency}${total}* (add *${R.currency}${R.min_order - total}*).${cartCommandBar()}`
      );
      return;
    }
    s.state = 'awaiting_checkout_details';
    await sendMsg(from, checkoutAskMsg(s.cart));
    return;
  }

  // ── PARSE ITEM CODES (e.g. B1 I4 D1, B1x2, 2xB1) ──
  const botMenu = await loadBotMenu();
  const { addedSlots, unknown } = parseOrderLineTokens(text, botMenu);
  for (const { item, qty } of addedSlots) {
    for (let q = 0; q < qty; q++) s.cart.push({ ...item });
  }

  if (addedSlots.length > 0) {
    await sendMsg(from, formatAddedToCartReply(addedSlots, unknown, s.cart));
    return;
  }
  // Comma-separated name + address was split into "unknown" tokens — still complete checkout if cart is ready
  if (unknown.length > 0 && s.cart.length > 0 && open) {
    const cartTotal = s.cart.reduce((sum, i) => sum + i.price, 0);
    if (cartTotal >= R.min_order) {
      const rescue = parseCheckoutDetails(text, botMenu);
      if (rescue && rescue.address.length >= 5) {
        await completeCheckoutFromParsed(from, s, rescue);
        return;
      }
    }
  }
  if (unknown.length > 0) {
    await sendMsg(
      from,
      `⚠️ Not found: ${unknown.join(', ')}\n\nTry *MENU* or codes like *B1 I4 D1*.${cartCommandBar()}`
    );
    return;
  }
  await sendMsg(from, `👋 I didn't understand that.\n\nType *MENU* for the menu · *HELP* for commands\n\n— *${R.chatBrand}*`);
}

async function processWebhookPayload(body) {
  const entry   = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value   = changes?.value;

  if (!value?.messages) return;

  for (const msg of value.messages) {
    const from = msg.from;

    if (msg.type === 'text') {
      await handleMsg(from, msg.text.body);
    }

    if (msg.type === 'interactive' && msg.interactive.type === 'list_reply') {
      const botMenu = (await getBotMenuRecord(R.menu)).menu;
      const itemId = msg.interactive.list_reply.id;
      const item = findItemInMenu(botMenu, itemId);
      if (item) {
        if (!isRestaurantOpen()) {
          await sendMsg(from, closedOrderMsg());
        } else {
          const s = session(from);
          s.cart.push(item);
          await sendMsg(from, formatAddedToCartReply([{ item, qty: 1 }], [], s.cart));
        }
      }
    }
  }
}

// ─────────────────────────────────────────────
//  WEBHOOK ENDPOINTS
// ─────────────────────────────────────────────

// Verification (Meta calls this when you set up webhook)
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified by Meta!');
    res.status(200).send(challenge);
  } else {
    console.error('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// Receive messages
app.post('/webhook', (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  setImmediate(() => {
    processWebhookPayload(body).catch((err) => console.error('Webhook error:', err.message));
  });
});

// ─────────────────────────────────────────────
//  ADMIN DASHBOARD
// ─────────────────────────────────────────────

async function renderWithOrders(page, extra = {}) {
  const orders = await fetchOrdersForDashboard();
  return renderAdminPage({ R, PHONE_NUMBER_ID, orders, page, ...extra });
}

app.get('/', async (req, res) => {
  try {
    res.send(await renderWithOrders('overview'));
  } catch (err) {
    console.error('GET /', err);
    res.status(500).send('Server error');
  }
});

app.get('/orders', async (req, res) => {
  try {
    res.send(await renderWithOrders('orders'));
  } catch (err) {
    console.error('GET /orders', err);
    res.status(500).send('Server error');
  }
});

app.get('/menu', async (req, res) => {
  try {
    const menuDb = await fetchMenuGroupedByCategory();
    res.send(await renderWithOrders('menu', { menuDb }));
  } catch (err) {
    console.error('Menu page error:', err);
    try {
      const menuDb = { ok: false, error: 'exception', message: err.message || String(err) };
      res.status(500).send(await renderWithOrders('menu', { menuDb }));
    } catch (e2) {
      res.status(500).send('Server error');
    }
  }
});

app.get('/settings', async (req, res) => {
  try {
    res.send(
      await renderWithOrders('settings', {
        settingsMeta: {
          hasAccessToken: Boolean(ACCESS_TOKEN),
          verifyFromEnv: Boolean(process.env.VERIFY_TOKEN),
        },
      })
    );
  } catch (err) {
    console.error('GET /settings', err);
    res.status(500).send('Server error');
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const orders = await fetchOrdersForDashboard();
    res.json(orders);
  } catch (err) {
    console.error('GET /api/orders', err);
    res.status(500).json({ error: 'Failed to load orders' });
  }
});

/** Mark order prepared & out for delivery (admin dashboard toggle). */
app.patch('/api/orders/:orderNum/dispatch', async (req, res) => {
  try {
    const orderNum = parseInt(req.params.orderNum, 10);
    if (!Number.isFinite(orderNum) || orderNum < 1) {
      res.status(400).json({ error: 'Invalid order number' });
      return;
    }
    const raw = req.body?.out ?? req.body?.out_for_delivery;
    if (typeof raw !== 'boolean') {
      res.status(400).json({ error: 'JSON body must include out: true|false' });
      return;
    }
    const result = await setOrderOutForDelivery(orderNum, raw);
    if (!result.ok) {
      res.status(result.code || 500).json({ error: result.message || 'Update failed' });
      return;
    }
    res.json({ ok: true, order_num: orderNum, out_for_delivery: raw });
  } catch (err) {
    console.error('PATCH /api/orders/:orderNum/dispatch', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════╗`);
  console.log(`║   ${R.name} — WhatsApp Bot       `);
  console.log(`╠═══════════════════════════════════════╣`);
  console.log(`║  Dashboard : http://localhost:${PORT}  ( /orders  /menu  /settings )`);
  console.log(`║  Webhook   : http://localhost:${PORT}/webhook`);
  console.log(`╚═══════════════════════════════════════╝\n`);
  if (!PHONE_NUMBER_ID) console.warn(`⚠️  Add META credentials to .env file!\n`);
  setImmediate(() => {
    getBotMenuRecord(R.menu).catch(() => {});
  });
});
