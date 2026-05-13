/** Restaurant WhatsApp bot — Meta Cloud API. Configure via `.env`. */

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
const { menuCategoryEmoji } = require('./lib/menu-presentation');
const { MENU } = require('./scripts/menu-seed-data');

/** Same shape as DB menu: category title → rows { id, name, price, veg }. Source: scripts/menu-seed-data.js */
function buildEmbeddedMenuRecord() {
  const menu = {};
  for (const cat of MENU) {
    menu[cat.title] = cat.items.map((it) => ({
      id: it.id,
      name: it.name,
      price: Number(it.price),
      veg: true,
    }));
  }
  return menu;
}

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

  /** Bot menu: built from scripts/menu-seed-data.js; getBotMenuRecord prefers this when non-empty. */
  menu: buildEmbeddedMenuRecord(),
};

// ─────────────────────────────────────────────
//  META API CREDENTIALS (from .env file)
// ─────────────────────────────────────────────
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN    = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN    = process.env.VERIFY_TOKEN || "restaurant_bot_2024";
const GRAPH_BASE      = `https://graph.facebook.com/${process.env.GRAPH_API_VERSION || 'v25.0'}`;
const API_URL         = `${GRAPH_BASE}/${PHONE_NUMBER_ID}/messages`;

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
  const upper = normalizeUserText(text).toUpperCase();
  const rawParts = upper.split(/[\s,،]+/).filter(Boolean);
  const addedSlots = [];
  const unknown = [];
  const skipUnknown = /^(I|A|THE|AND|OR|OF|IS|IN|OK|NO|YES|HI|HEY|HELLO|MENU|SHOW)$/i;

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
  if (n.length > 36) n = `${n.slice(0, 34)}…`;
  return n;
}

/** Full text menu (one string). Items are one per line so we can split under WhatsApp’s 4096-char limit. */
function buildFullMenuText(menuRecord) {
  const brand = stripForWhatsAppMenuLine(R.chatBrand || R.name || 'Our restaurant');
  const subline = `_${stripForWhatsAppMenuLine(R.hoursShort)} · Min ${R.currency}${R.min_order} · ${stripForWhatsAppMenuLine(R.areaShort)}_`;
  const rule = '· · · · · · · · · · · · · ·';
  let m = `🍴 *${brand}*\n_Your menu · order with codes below_\n${subline}\n${rule}\n\n`;
  const entries = Object.entries(menuRecord).filter(([, items]) => items && items.length);
  if (!entries.length) {
    return `${m}_Menu is updating — please try again in a moment._`;
  }
  for (const [cat, items] of entries) {
    const icon = menuCategoryEmoji(cat);
    const catSafe = stripForWhatsAppMenuLine(cat);
    m += `${icon} *${catSafe}*\n`;
    for (const i of items) {
      const code = String(i.id).toUpperCase();
      const nm = stripForWhatsAppMenuLine(menuLineShortName(i.name));
      m += `   ▫️ *${code}* — ${nm} — *${R.currency}${i.price}*\n`;
    }
    m += '\n';
  }
  m += `${rule}\n`;
  m += '👉 *TL1 MO1 BD1* · *MO1x2* = two of the same item\n';
  m += `_${stripForWhatsAppMenuLine(R.tagline)}_`;
  return m;
}

/** WhatsApp Cloud API text body max is 4096; stay a little under for encoding edge cases. */
const WA_TEXT_BODY_MAX = 4096;
/** Larger chunks ⇒ fewer HTTP round-trips + fewer inter-bubble waits (big menus feel faster). */
const WA_MENU_CHUNK_SAFE = 4040;
/** Pause between menu bubbles — reduces Meta rate limits after many sends. */
const WA_MENU_INTER_BUBBLE_MS = 280;
/** Do not block the webhook forever if Supabase is slow or wedged. */
const MENU_LOAD_TIMEOUT_MS = 11_000;

/**
 * @param {string} text
 * @param {number} [maxLen]
 * @returns {string[]}
 */
function chunkWhatsAppBody(text, maxLen = WA_MENU_CHUNK_SAFE) {
  const t = String(text || '').trimEnd();
  if (!t.length) return [];
  if (t.length <= maxLen) return [t];
  const chunks = [];
  let rest = t;
  const cont = '✨ _Menu continues…_\n\n';
  let first = true;
  let guard = 0;
  while (rest.length && guard++ < 500) {
    const overhead = first ? 0 : cont.length;
    const budget = Math.max(256, maxLen - overhead);
    let take = Math.min(rest.length, budget);
    if (take < rest.length) {
      const cut = rest.lastIndexOf('\n', take);
      if (cut >= Math.floor(budget * 0.55)) take = cut + 1;
    }
    if (take < 1) take = Math.min(rest.length, budget);
    let piece = rest.slice(0, take).trim();
    rest = rest.slice(take).trimStart();
    if (!first) piece = cont + piece;
    if (piece.length) chunks.push(piece);
    else if (!rest.length) break;
    else rest = rest.slice(1);
    first = false;
  }
  return chunks.length ? chunks : [t.slice(0, maxLen)];
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
    return `📋 Cart empty — *TL1 MO1* · *MO1x2* · *MENU*${cartCommandBar()}`;
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

/** Load menu from DB; on slow/hung Supabase return fallback so replies are not blocked. */
async function fetchBotMenuOrFallback(fallbackMenu) {
  try {
    return await Promise.race([
      getBotMenuRecord(fallbackMenu).then((r) => r.menu),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('menu_load_timeout')), MENU_LOAD_TIMEOUT_MS)
      ),
    ]);
  } catch (e) {
    console.error('[bot menu]', e?.message || e);
    return fallbackMenu;
  }
}

// ─────────────────────────────────────────────
//  SEND MESSAGE via Meta Cloud API
// ─────────────────────────────────────────────
/** @returns {Promise<boolean>} true if Meta accepted the message */
async function sendMsg(to, text, opts = {}) {
  const body = String(text ?? '');
  if (!body.trim()) {
    console.warn('sendMsg: skipped empty body');
    return false;
  }
  const maxAttempts = opts.retries ?? 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await graphHttp.post(
        API_URL,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body },
        },
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const preview = body.length > 70 ? `${body.substring(0, 70)}…` : body;
      console.log(`📤 Sent to ${to}: ${preview}`);
      return true;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      const retryable =
        status === 429 ||
        status === 408 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504;
      console.error(`❌ Send failed (attempt ${attempt}/${maxAttempts})`, status || '', data || err.message);
      if (!retryable || attempt === maxAttempts) return false;
      const backoff = Math.min(10_000, 500 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return false;
}

// Text menu: may send several bubbles when the menu exceeds WhatsApp’s character limit.
async function sendMenuList(to, menuRecord) {
  try {
    const full = buildFullMenuText(menuRecord);
    const parts = chunkWhatsAppBody(full, WA_MENU_CHUNK_SAFE).filter((p) => p && p.length);
    if (!parts.length) {
      await sendMsg(to, '🍴 Menu is empty right now. Please try again soon.');
      return;
    }
    for (let p = 0; p < parts.length; p++) {
      let chunk = parts[p];
      if (chunk.length > WA_TEXT_BODY_MAX) {
        console.error(`Menu chunk ${p + 1} still too long (${chunk.length}), truncating`);
        chunk = `${chunk.slice(0, WA_TEXT_BODY_MAX - 40)}\n…`;
      }
      const ok = await sendMsg(to, chunk);
      if (!ok) {
        await sendMsg(
          to,
          `⚠️ WhatsApp slowed us down while sending the menu (part ${p + 1}/${parts.length}).\n\nPlease wait a few seconds and type *menu* again, or send item codes like *TL1 MO1*.`,
          { retries: 3 }
        );
        return;
      }
      if (p < parts.length - 1) await new Promise((r) => setTimeout(r, WA_MENU_INTER_BUBBLE_MS));
    }
  } catch (err) {
    console.error('sendMenuList:', err?.message || err);
    await sendMsg(
      to,
      `⚠️ Couldn't send the full menu right now. Please try *menu* again in a moment, or type *HELP*.`
    );
  }
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
//  INBOUND TEXT NORMALIZATION (WhatsApp / keyboards)
// ─────────────────────────────────────────────

/** NFKC + strip invisible chars / odd spaces so "menu" always matches MENU. */
function normalizeUserText(raw) {
  return String(raw || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .trim();
}

/** Uppercase command with quotes / trailing punctuation removed ("menu." → MENU). */
function commandKey(raw) {
  let s = normalizeUserText(raw).toUpperCase().replace(/\s+/g, ' ').trim();
  s = s.replace(/[`"'「」«»]+/g, '').trim();
  s = s.replace(/[.!?,…。！？]+$/u, '').trim();
  return s;
}

/** DB text can include * _ ~ ` — breaks WhatsApp bold/italic; strip for menu bubbles. */
function stripForWhatsAppMenuLine(s) {
  return String(s)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[*_~`]/g, '·');
}

// ─────────────────────────────────────────────
//  CORE MESSAGE HANDLER
// ─────────────────────────────────────────────
async function handleMsg(from, text) {
  const upper = commandKey(text);
  const s = session(from);
  /** Menu is only loaded when needed (MENU / item codes / checkout parsing) — saves 1–2 DB round-trips on HI, TRACK, CART, etc. */
  let menuPromise = null;
  const loadBotMenu = async () => {
    if (!menuPromise) menuPromise = fetchBotMenuOrFallback(R.menu);
    return menuPromise;
  };

  console.log(`📩 [${from}] "${text}" | state: ${s.state}`);

  // ── AWAITING NAME + ADDRESS (one reply); optional legacy phone in message ──
  if (s.state === 'awaiting_checkout_details') {
    if (upper === 'MENU' || upper === 'SHOW MENU') {
      await sendMenuList(from, await loadBotMenu());
      return;
    }
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
  const whenClosedAllow = new Set(['MENU', 'SHOW MENU', 'CART', 'CLEAR', 'CANCEL', 'REMOVE', 'UNDO']);
  if (!open && !whenClosedAllow.has(upper)) {
    await sendMsg(from, closedOrderMsg());
    return;
  }

  // ── GREETINGS ──
  const greet = ['HI','HELLO','HEY','NAMASTE','START','HAI','HELO','HII','HEYY','HIII','SALAM','NAMASKAR'];
  if (greet.includes(upper)) {
    await sendMsg(
      from,
      `👋 Welcome to *${R.chatBrand}*!\n\n` +
        `🕐 ${R.hoursShort} | Min order *${R.currency}${R.min_order}* | 📍 ${R.areaShort}\n\n` +
        `Reply *menu* or *MENU* to see our menu`
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
      await sendMsg(from, `🛒 Cart empty — *TL1 MO1* or *MO1x2*, or *MENU*.${cartCommandBar()}`);
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
      `⚠️ Not found: ${unknown.join(', ')}\n\nTry *MENU* or codes like *TL1 MO1 BD1*.${cartCommandBar()}`
    );
    return;
  }
  await sendMsg(from, `👋 I didn't understand that.\n\nType *MENU* for the menu · *HELP* for commands\n\n— *${R.chatBrand}*`);
}

async function processWebhookPayload(body) {
  const entries = body?.entry;
  if (!Array.isArray(entries) || !entries.length) {
    if (body && Object.keys(body).length) {
      console.log('📨 Webhook: no entry[] (status ping or non-message payload)');
    }
    return;
  }

  for (const entry of entries) {
    const changes = entry?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const field = String(change.field || '').toLowerCase();
      if (field && field !== 'messages') continue;

      const value = change?.value;
      if (!value) continue;

      if (Array.isArray(value.errors) && value.errors.length) {
        console.error('📨 Webhook value.errors:', JSON.stringify(value.errors).slice(0, 500));
      }

      const metaPid = value.metadata?.phone_number_id;
      if (metaPid && PHONE_NUMBER_ID && String(metaPid) !== String(PHONE_NUMBER_ID)) {
        console.warn(
          '⚠️ Webhook phone_number_id mismatch — fix PHONE_NUMBER_ID in .env. got=',
          metaPid,
          'expected=',
          PHONE_NUMBER_ID
        );
      }

      const messages = value.messages;
      if (!Array.isArray(messages) || !messages.length) continue;

      console.log(`📨 Webhook: ${messages.length} incoming message(s) · phone_number_id=${metaPid || '?'}`);

      for (const msg of messages) {
        const from =
          msg.from ||
          (Array.isArray(value.contacts) && value.contacts.find((c) => c.wa_id)?.wa_id) ||
          null;
        if (!from) {
          console.warn('📨 Webhook: message without msg.from or contacts[].wa_id — skipped', msg.type);
          continue;
        }

        const runHandle = async (textBody) => {
          try {
            await handleMsg(from, textBody);
          } catch (err) {
            console.error('handleMsg error:', err?.message || err);
            await sendMsg(
              from,
              '⚠️ Something went wrong on our side. Please try again, or type *HELP*.'
            );
          }
        };

        if (msg.type === 'text' && msg.text?.body != null) {
          await runHandle(String(msg.text.body));
        } else if (msg.type === 'unsupported') {
          await sendMsg(
            from,
            '⚠️ This message type is not supported on our bot yet. Please send plain *text* (e.g. *hi* or *menu*).'
          );
        } else if (msg.type === 'interactive' && msg.interactive?.type === 'list_reply') {
          const botMenu = await fetchBotMenuOrFallback(R.menu);
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
        } else if (msg.type === 'interactive' && msg.interactive?.type === 'button_reply') {
          const br = msg.interactive.button_reply;
          const t = br && (br.title || br.id);
          if (t) await runHandle(String(t));
        } else {
          console.log('📨 Webhook: skipped message type:', msg.type);
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

/** Quick check: token + PHONE_NUMBER_ID work with Meta Graph (open in browser on your host). */
app.get('/health/whatsapp', async (req, res) => {
  const out = {
    phoneNumberIdConfigured: Boolean(PHONE_NUMBER_ID),
    accessTokenConfigured: Boolean(ACCESS_TOKEN),
    verifyTokenConfigured: Boolean(VERIFY_TOKEN),
    graphOk: false,
    displayPhoneNumber: null,
    verifiedName: null,
    error: null,
    hints: [
      'Webhook URL must be public HTTPS and subscribed to the "messages" field.',
      'VERIFY_TOKEN in .env must match Meta → WhatsApp → Configuration → Webhook verify token.',
      'PHONE_NUMBER_ID must be the same number that shows in each webhook payload (metadata.phone_number_id).',
    ],
  };
  if (!out.phoneNumberIdConfigured || !out.accessTokenConfigured) {
    return res.status(200).json(out);
  }
  try {
    const r = await graphHttp.get(`${GRAPH_BASE}/${PHONE_NUMBER_ID}`, {
      params: { fields: 'display_phone_number,verified_name' },
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });
    out.graphOk = true;
    out.displayPhoneNumber = r.data?.display_phone_number ?? null;
    out.verifiedName = r.data?.verified_name ?? null;
    res.status(200).json(out);
  } catch (e) {
    out.error = e.response?.data || e.message || String(e);
    res.status(503).json(out);
  }
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
  console.log(`\n${R.name} — WhatsApp bot on port ${PORT}`);
  console.log(`  Dashboard: /  /orders  /menu  /settings`);
  console.log(`  Webhook:   POST /webhook   ·   Meta: GET /health/whatsapp`);
  if (!PHONE_NUMBER_ID) console.warn('  ⚠️  Set PHONE_NUMBER_ID and ACCESS_TOKEN in .env\n');
  setImmediate(() => {
    getBotMenuRecord(R.menu).catch(() => {});
  });
});
