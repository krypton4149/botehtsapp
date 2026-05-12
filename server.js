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
  timeout: 25_000,
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const { isRestaurantOpen } = require('./lib/restaurant-hours');

// ─────────────────────────────────────────────
//  ✏️  RESTAURANT CONFIG — EDIT THIS SECTION
// ─────────────────────────────────────────────
const R = {
  name:          "Maa Jaanki Restaurant",
  tagline:       "Fresh Food, Fast Delivery",
  /** Shown in admin sidebar; replace with your own file under /public/ if you like. */
  logoUrl:       "/logo.svg",
  address:       "Shikohabad Rd, near Tiwariya Chauraha, Shikohabad, Uttar Pradesh 283135",
  timing:        "11:00 AM – 11:00 PM (All days)",
  currency:      "₹",
  delivery_time: "30–45 minutes",
  payment:       "Cash on Delivery / UPI on Delivery",
  min_order:     199,

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
//  SESSION & ORDER STORAGE
// ─────────────────────────────────────────────
const sessions = new Map();
let   orders   = [];
let   orderNum = 1000;

function session(id) {
  if (!sessions.has(id)) {
    sessions.set(id, { state:'idle', cart:[], name:'', phone:'', address:'' });
  }
  return sessions.get(id);
}

function resetSession(id) {
  sessions.set(id, { state:'idle', cart:[], name:'', phone:'', address:'' });
}

/** One-message checkout: multiline (name / phone / address), pipe-separated, or name + 10-digit phone + rest as address. */
function parseCheckoutDetails(text) {
  const trimmed = text.trim();
  const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 3) {
    return { name: lines[0], phone: lines[1], address: lines.slice(2).join(', ') };
  }
  const pipeParts = trimmed.split('|').map((p) => p.trim()).filter(Boolean);
  if (pipeParts.length >= 3) {
    return { name: pipeParts[0], phone: pipeParts[1], address: pipeParts.slice(2).join(' | ') };
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

function findItem(code) {
  for (const items of Object.values(R.menu)) {
    const f = items.find(i => i.id.toUpperCase() === code.toUpperCase());
    if (f) return f;
  }
  return null;
}

function closedOrderMsg() {
  return (
    `🕚 *${R.name}* is closed right now.\n\n` +
    `We take orders *11 AM – 11 PM* (India time).\n` +
    `Please message again after we open — we’d love to serve you! 🙏\n\n` +
    `_Type *TRACK* for a past order._`
  );
}

// ─────────────────────────────────────────────
//  MESSAGE BUILDERS
// ─────────────────────────────────────────────
function menuMsg() {
  let m = `━━━━━━━━━━━━━━━━━━━━━\n`;
  m += `🍽️ *${R.name}*\n`;
  m += `_${R.tagline}_\n`;
  m += `━━━━━━━━━━━━━━━━━━━━━\n`;
  m += `📍 ${R.address}\n`;
  m += `🕐 ${R.timing}\n\n`;

  for (const [cat, items] of Object.entries(R.menu)) {
    m += `*${cat}*\n`;
    items.forEach(i => {
      m += `  ${i.veg ? '🟢' : '🔴'} [*${i.id}*] ${i.name} — *${R.currency}${i.price}*\n`;
    });
    m += `\n`;
  }

  m += `🟢 Veg  🔴 Non-Veg\n`;
  m += `Min order: *${R.currency}${R.min_order}*\n\n`;
  m += `━━━━━━━━━━━━━━━━━━━━━\n`;
  m += `*📝 HOW TO ORDER:*\n`;
  m += `Type item codes: *P1 B2 D1*\n\n`;
  m += `*COMMANDS:*\n`;
  m += `• *CART* — View cart\n`;
  m += `• *ORDER* — Checkout\n`;
  m += `• *REMOVE* — Remove last item\n`;
  m += `• *CLEAR* — Empty cart\n`;
  m += `• *MENU* — Show menu\n`;
  m += `• *TRACK* — Track your order\n`;
  return m;
}

function cartMsg(cart) {
  if (!cart.length) return `🛒 Your cart is *empty!*\n\nType item codes like *P1 B2* to add items.\nType *MENU* to browse.`;

  const g = {};
  cart.forEach(i => { g[i.id] ? g[i.id].qty++ : (g[i.id] = {...i, qty:1}); });
  let total = 0;
  let m = `🛒 *Your Cart:*\n━━━━━━━━━━━━━━━━\n`;
  Object.values(g).forEach(i => {
    const sub = i.price * i.qty;
    total += sub;
    m += `• ${i.name}\n  ${i.qty} × ${R.currency}${i.price} = *${R.currency}${sub}*\n`;
  });
  m += `━━━━━━━━━━━━━━━━\n`;
  m += `*TOTAL: ${R.currency}${total}*\n\n`;
  if (total < R.min_order) m += `⚠️ Min order: ${R.currency}${R.min_order} (add ${R.currency}${R.min_order - total} more)\n\n`;
  m += `Type *ORDER* to checkout ✅\nType *CLEAR* to reset 🗑️`;
  return m;
}

function confirmMsg(order) {
  let m = `✅ *ORDER CONFIRMED!*\n`;
  m += `━━━━━━━━━━━━━━━━━━━━━\n`;
  m += `🔖 Order *#${order.num}*\n\n`;
  m += `👤 ${order.name}\n`;
  m += `📱 ${order.phone}\n`;
  m += `📍 ${order.address}\n\n`;
  m += `*Your Order:*\n`;
  order.items.forEach(i => m += `• ${i.name} ×${i.qty} = ${R.currency}${i.price*i.qty}\n`);
  m += `━━━━━━━━━━━━━━━━━━━━━\n`;
  m += `💰 *Total: ${R.currency}${order.total}*\n`;
  m += `💳 ${R.payment}\n`;
  m += `⏱️ Delivery: ${R.delivery_time}\n\n`;
  m += `🙏 Thank you for ordering from *${R.name}!*\n`;
  m += `We'll call you to confirm shortly.\n\n`;
  m += `Type *TRACK* to track your order\nType *MENU* to order again`;
  return m;
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

// Send interactive list message (Meta feature — shows a nice menu list!)
async function sendMenuList(to) {
  const sections = Object.entries(R.menu).slice(0,9).map(([title, items]) => ({
    title: title.replace(/[^\w\s]/g,'').trim().substring(0,24),
    rows: items.slice(0,9).map(i => ({
      id: i.id,
      title: i.name.substring(0,24),
      description: `${i.veg ? 'Veg' : 'Non-Veg'} · ${R.currency}${i.price}`
    }))
  }));

  try {
    await graphHttp.post(API_URL, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: { type:"text", text: `🍽️ ${R.name}` },
        body:   { text: `Welcome! Browse our menu below and tap to add items to your cart.\n\nOr type item codes directly (e.g. *P1 B2 D1*)` },
        footer: { text: `${R.timing} · Min order: ${R.currency}${R.min_order}` },
        action: {
          button: "📋 View Menu",
          sections
        }
      }
    }, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    // Fallback to text menu if interactive fails
    await sendMsg(to, menuMsg());
  }
}

// ─────────────────────────────────────────────
//  CORE MESSAGE HANDLER
// ─────────────────────────────────────────────
async function handleMsg(from, text) {
  const upper = text.trim().toUpperCase();
  const s = session(from);

  console.log(`📩 [${from}] "${text}" | state: ${s.state}`);

  // ── AWAITING NAME + PHONE + ADDRESS (one reply) ──
  if (s.state === 'awaiting_checkout_details') {
    if (!isRestaurantOpen()) {
      await sendMsg(from, closedOrderMsg());
      resetSession(from);
      return;
    }
    const parsed = parseCheckoutDetails(text);
    if (!parsed || parsed.address.length < 5) {
      await sendMsg(
        from,
        `⚠️ Please send *name*, *phone*, and *full address* in *one message*.\n\nExamples:\n• Three lines:\n  _Rahul_\n  _9876543210_\n  _12 MG Road, Delhi 110001_\n• Or one line: _Rahul 9876543210 12 MG Road, Delhi 110001_`
      );
      return;
    }
    s.name = parsed.name;
    s.phone = parsed.phone;
    s.address = parsed.address;

    const g = {};
    s.cart.forEach(i => { g[i.id] ? g[i.id].qty++ : (g[i.id] = {...i, qty:1}); });
    const items = Object.values(g);
    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    orderNum++;
    const order = {
      num: orderNum,
      name: s.name,
      phone: s.phone,
      whatsapp: from,
      address: s.address,
      items,
      total,
      status: 'Confirmed',
      time: new Date().toLocaleString('en-IN')
    };
    orders.push(order);
    console.log(`\n🎉 NEW ORDER #${order.num} — ${order.name} — ${R.currency}${order.total}`);

    resetSession(from);
    await sendMsg(from, confirmMsg(order));
    return;
  }

  // ── TRACK / HELP (always, even when closed) ──
  if (upper === 'TRACK' || upper === 'TRACK ORDER') {
    const myOrders = orders.filter(o => o.whatsapp === from);
    if (!myOrders.length) {
      await sendMsg(from, `📦 No orders found for your number.\n\nType *MENU* to place your first order!`);
      return;
    }
    const last = myOrders[myOrders.length - 1];
    await sendMsg(from, `📦 *Order #${last.num} Status*\n━━━━━━━━━━━━━━━━\n✅ Status: *${last.status}*\n🕐 Placed: ${last.time}\n💰 Total: ${R.currency}${last.total}\n📍 Delivery to: ${last.address}\n\n⏱️ Estimated: ${R.delivery_time}\n\nThank you for your patience! 🙏`);
    return;
  }

  if (upper === 'HELP' || upper === '?') {
    await sendMsg(from, `🤖 *${R.name} Bot Help*\n\n*Commands:*\n• *MENU* — View full menu\n• *P1 B2 D1* — Add items to cart\n• *CART* — View cart & total\n• *ORDER* — Place your order\n• *REMOVE* — Remove last item\n• *CLEAR* — Empty cart\n• *TRACK* — Track your order\n• *HELP* — Show this help\n\n📍 ${R.address}\n🕐 ${R.timing}`);
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
    await sendMsg(from, `Welcome to *${R.name}!*\n\nI'm your food ordering assistant. Here's what you can do:\n\n• See menu & order food 🍽️\n• Track your orders 📦\n• Get delivery info 📍\n\nType *MENU* to see our full menu!`);
    return;
  }

  // ── MENU ──
  if (upper === 'MENU' || upper === 'SHOW MENU') {
    await sendMenuList(from);
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
    await sendMsg(from, `🗑️ Cart cleared!\n\nType *MENU* to start fresh.`);
    return;
  }

  // ── REMOVE LAST ──
  if (upper === 'REMOVE' || upper === 'UNDO') {
    if (!s.cart.length) { await sendMsg(from, `Cart is already empty!`); return; }
    const removed = s.cart.pop();
    await sendMsg(from, `✅ Removed: *${removed.name}*\n\nType *CART* to see your cart.`);
    return;
  }

  // ── ORDER ──
  if (upper === 'ORDER' || upper === 'CHECKOUT' || upper === 'PLACE ORDER') {
    if (!s.cart.length) {
      await sendMsg(from, `🛒 Your cart is empty!\n\nType item codes like *P1 B2* to add food.\nType *MENU* to browse.`);
      return;
    }
    const total = s.cart.reduce((sum, i) => sum + i.price, 0);
    if (total < R.min_order) {
      await sendMsg(from, `⚠️ Minimum order is *${R.currency}${R.min_order}*\nYour cart total: *${R.currency}${total}*\n\nPlease add ${R.currency}${R.min_order - total} more.\nType *MENU* to add items.`);
      return;
    }
    s.state = 'awaiting_checkout_details';
    await sendMsg(
      from,
      `🎉 Let's place your order!\n\n${cartMsg(s.cart)}\n\n━━━━━━━━━━━━━━━━\nGive me your *name*, *number* and *address* — *order details*.`
    );
    return;
  }

  // ── PARSE ITEM CODES (e.g. "P1 B2 D1") ──
  const codes = upper.split(/[\s,،]+/).filter(c => c.length >= 1 && c.length <= 5);
  const added = [], unknown = [];

  codes.forEach(code => {
    const item = findItem(code);
    if (item) { s.cart.push(item); added.push(item); }
    else if (code.length >= 2 && !/^(I|A|THE|AND|OR|OF|IS|IN)$/.test(code)) unknown.push(code);
  });

  if (added.length > 0) {
    const total = s.cart.reduce((sum, i) => sum + i.price, 0);
    let reply = `✅ *Added to cart:*\n`;
    added.forEach(i => reply += `• ${i.name} — ${R.currency}${i.price}\n`);
    if (unknown.length) reply += `\n⚠️ Not found: ${unknown.join(', ')}\n`;
    reply += `\n🛒 *${s.cart.length} item(s)* | Total: *${R.currency}${total}*\n\n`;
    reply += `Type *CART* to review 📋\nType *ORDER* to checkout ✅\nType *MENU* to add more 🍽️`;
    await sendMsg(from, reply);
    return;
  }

  // ── DEFAULT ──
  await sendMsg(from, `👋 I didn't understand that.\n\nType *MENU* to see our menu\nType *HELP* for all commands\n\n— *${R.name}* 🍽️`);
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
      const itemId = msg.interactive.list_reply.id;
      const item   = findItem(itemId);
      if (item) {
        if (!isRestaurantOpen()) {
          await sendMsg(from, closedOrderMsg());
        } else {
          const s = session(from);
          s.cart.push(item);
          const total = s.cart.reduce((sum, i) => sum + i.price, 0);
          await sendMsg(from, `✅ *Added:* ${item.name} — ${R.currency}${item.price}\n\n🛒 *${s.cart.length} item(s)* | Total: *${R.currency}${total}*\n\nType *CART* to review\nType *ORDER* to checkout\nType *MENU* to add more`);
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
const { renderAdminPage } = require('./lib/admin-dashboard');

app.get('/', (req, res) => {
  res.send(renderAdminPage({ R, PHONE_NUMBER_ID, orders, page: 'overview' }));
});

app.get('/orders', (req, res) => {
  res.send(renderAdminPage({ R, PHONE_NUMBER_ID, orders, page: 'orders' }));
});

app.get('/menu', (req, res) => {
  res.send(renderAdminPage({ R, PHONE_NUMBER_ID, orders, page: 'menu' }));
});

app.get('/settings', (req, res) => {
  res.send(
    renderAdminPage({
      R,
      PHONE_NUMBER_ID,
      orders,
      page: 'settings',
      settingsMeta: {
        hasAccessToken: Boolean(ACCESS_TOKEN),
        verifyFromEnv: Boolean(process.env.VERIFY_TOKEN),
      },
    })
  );
});

app.get('/api/orders', (req, res) => res.json(orders.slice().reverse()));

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
});
