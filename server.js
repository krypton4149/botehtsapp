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
const fs      = require('fs');

const app = express();
app.use(express.json());

// ─────────────────────────────────────────────
//  ✏️  RESTAURANT CONFIG — EDIT THIS SECTION
// ─────────────────────────────────────────────
const R = {
  name:          "My Restaurant",
  tagline:       "Fresh Food, Fast Delivery",
  address:       "123 MG Road, New Delhi - 110001",
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

function findItem(code) {
  for (const items of Object.values(R.menu)) {
    const f = items.find(i => i.id.toUpperCase() === code.toUpperCase());
    if (f) return f;
  }
  return null;
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
    await axios.post(API_URL, {
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
    await axios.post(API_URL, {
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

  // ── AWAITING NAME ──
  if (s.state === 'awaiting_name') {
    s.name = text.trim();
    s.state = 'awaiting_phone';
    await sendMsg(from, `Got it, *${s.name}!* 👍\n\nPlease share your *phone number* for delivery confirmation:`);
    return;
  }

  // ── AWAITING PHONE ──
  if (s.state === 'awaiting_phone') {
    s.phone = text.trim();
    s.state = 'awaiting_address';
    await sendMsg(from, `Perfect! 📱\n\nNow please send your *full delivery address*\n(Include area, landmark & pincode):`);
    return;
  }

  // ── AWAITING ADDRESS ──
  if (s.state === 'awaiting_address') {
    if (text.trim().length < 5) {
      await sendMsg(from, `⚠️ Please send a complete address with area and pincode.`);
      return;
    }
    s.address = text.trim();

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

  // ── GREETINGS ──
  const greet = ['HI','HELLO','HEY','NAMASTE','START','HAI','HELO','SALAM','NAMASKAR'];
  if (greet.includes(upper)) {
    await sendMsg(from, `Namaste! 🙏 Welcome to *${R.name}!*\n\nI'm your food ordering assistant. Here's what you can do:\n\n• See menu & order food 🍽️\n• Track your orders 📦\n• Get delivery info 📍\n\nType *MENU* to see our full menu!`);
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
    s.state = 'awaiting_name';
    await sendMsg(from, `🎉 Let's place your order!\n\n${cartMsg(s.cart)}\n\n━━━━━━━━━━━━━━━━\n*Step 1/3* — Please enter your *full name*:`);
    return;
  }

  // ── TRACK ORDER ──
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

  // ── HELP ──
  if (upper === 'HELP' || upper === '?') {
    await sendMsg(from, `🤖 *${R.name} Bot Help*\n\n*Commands:*\n• *HI* — Start\n• *MENU* — View full menu\n• *P1 B2 D1* — Add items to cart\n• *CART* — View cart & total\n• *ORDER* — Place your order\n• *REMOVE* — Remove last item\n• *CLEAR* — Empty cart\n• *TRACK* — Track your order\n• *HELP* — Show this help\n\n📍 ${R.address}\n🕐 ${R.timing}`);
    return;
  }

  // ── INTERACTIVE LIST REPLY (when customer taps a menu item) ──
  // Handled below in webhook section

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
  await sendMsg(from, `👋 I didn't understand that.\n\nType *HI* to start\nType *MENU* to see our menu\nType *HELP* for all commands\n\n— *${R.name}* 🍽️`);
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
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Always respond 200 to Meta immediately

  try {
    const entry   = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    if (!value?.messages) return;

    for (const msg of value.messages) {
      const from = msg.from;

      // Text message
      if (msg.type === 'text') {
        await handleMsg(from, msg.text.body);
      }

      // Interactive list reply (customer tapped a menu item)
      if (msg.type === 'interactive' && msg.interactive.type === 'list_reply') {
        const itemId = msg.interactive.list_reply.id;
        const item   = findItem(itemId);
        if (item) {
          const s = session(from);
          s.cart.push(item);
          const total = s.cart.reduce((sum, i) => sum + i.price, 0);
          await sendMsg(from, `✅ *Added:* ${item.name} — ${R.currency}${item.price}\n\n🛒 *${s.cart.length} item(s)* | Total: *${R.currency}${total}*\n\nType *CART* to review\nType *ORDER* to checkout\nType *MENU* to add more`);
        }
      }
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

// ─────────────────────────────────────────────
//  ADMIN DASHBOARD
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  const totalRev = orders.reduce((s, o) => s + o.total, 0);
  const today    = new Date().toLocaleDateString('en-IN');
  const todayOrd = orders.filter(o => o.time.includes(today));
  const todayRev = todayOrd.reduce((s, o) => s + o.total, 0);

  const rows = orders.slice().reverse().map(o => `
    <tr>
      <td><b>#${o.num}</b></td>
      <td>${o.name}</td>
      <td>${o.phone}</td>
      <td style="font-size:12px;max-width:160px">${o.address}</td>
      <td style="font-size:12px">${o.items.map(i=>`${i.name} ×${i.qty}`).join('<br>')}</td>
      <td><b>${R.currency}${o.total}</b></td>
      <td><span class="badge">${o.status}</span></td>
      <td style="font-size:11px;color:#8a7a60">${o.time}</td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8"><title>${R.name} — Orders</title>
  <meta http-equiv="refresh" content="20">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#0c0a06;color:#f0e8d8;padding:24px}
    h1{font-size:26px;color:#e8a030;margin-bottom:4px}
    .sub{color:#8a7a60;font-size:13px;margin-bottom:24px}
    .stats{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:28px}
    .stat{background:#1e1710;border:1px solid #2e2214;border-radius:14px;padding:18px 24px;min-width:150px}
    .stat-n{font-size:30px;font-weight:700;color:#e8a030}
    .stat-l{font-size:12px;color:#8a7a60;margin-top:4px}
    .setup-box{background:#1a120a;border:1px solid #3a2810;border-radius:14px;padding:20px;margin-bottom:28px;font-size:13px;line-height:2}
    .setup-box h2{color:#f5c060;font-size:16px;margin-bottom:12px}
    code{background:#0c0a06;padding:2px 8px;border-radius:5px;color:#f5c060;font-size:12px}
    a{color:#25d366}
    table{width:100%;border-collapse:collapse;font-size:13px;background:#161208;border-radius:12px;overflow:hidden}
    th{background:#1e1710;color:#e8a030;padding:12px;text-align:left}
    td{padding:10px 12px;border-bottom:1px solid #1a1208;vertical-align:top}
    tr:hover td{background:#1a1208}
    .badge{background:rgba(61,186,122,.15);color:#3dba7a;border:1px solid rgba(61,186,122,.3);padding:3px 10px;border-radius:100px;font-size:11px}
    .live{float:right;display:inline-flex;align-items:center;gap:6px;background:rgba(61,186,122,.15);border:1px solid rgba(61,186,122,.3);color:#3dba7a;padding:6px 14px;border-radius:100px;font-size:12px}
    .dot{width:8px;height:8px;border-radius:50%;background:#3dba7a;animation:p 1.5s infinite}
    @keyframes p{0%,100%{opacity:1}50%{opacity:.3}}
    .empty{text-align:center;padding:60px;color:#8a7a60;font-size:15px}
    .env-needed{background:#2a1008;border:1px solid #8a3010;border-radius:8px;padding:12px 16px;color:#f5a060;font-size:13px;margin-bottom:16px}
  </style></head><body>
  <h1>🍽️ ${R.name}</h1>
  <div class="sub">WhatsApp Business Bot · Admin Dashboard <span class="live"><span class="dot"></span>Live</span></div>

  ${!PHONE_NUMBER_ID ? `<div class="env-needed">⚠️ <b>Bot not configured yet.</b> Add your Meta API credentials to the <code>.env</code> file to activate WhatsApp. See setup instructions below.</div>` : ''}

  <div class="stats">
    <div class="stat"><div class="stat-n">${orders.length}</div><div class="stat-l">Total Orders</div></div>
    <div class="stat"><div class="stat-n">${R.currency}${totalRev.toLocaleString()}</div><div class="stat-l">Total Revenue</div></div>
    <div class="stat"><div class="stat-n">${todayOrd.length}</div><div class="stat-l">Today's Orders</div></div>
    <div class="stat"><div class="stat-n">${R.currency}${todayRev.toLocaleString()}</div><div class="stat-l">Today's Revenue</div></div>
  </div>

  <div class="setup-box">
    <h2>🔧 Meta API Setup Checklist</h2>
    1. Go to <a href="https://developers.facebook.com" target="_blank">developers.facebook.com</a> → Create App → Business type<br>
    2. Add <b>WhatsApp</b> product → Get your <code>Phone Number ID</code> and <code>Access Token</code><br>
    3. Paste them in your <code>.env</code> file<br>
    4. Deploy this bot to <a href="https://railway.app" target="_blank">Railway.app</a> (free) → get your public URL<br>
    5. In Meta dashboard → Webhooks → Set URL: <code>https://YOUR-URL/webhook</code> · Verify Token: <code>${VERIFY_TOKEN}</code><br>
    6. Subscribe to <b>messages</b> field → Done! Customers can now order via WhatsApp 🎉
  </div>

  ${orders.length === 0
    ? `<div class="empty">⏳ No orders yet — once customers message your WhatsApp Business number, orders appear here automatically.</div>`
    : `<table><thead><tr><th>Order</th><th>Name</th><th>Phone</th><th>Address</th><th>Items</th><th>Total</th><th>Status</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>`
  }
  </body></html>`);
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
  console.log(`║  Dashboard : http://localhost:${PORT}    `);
  console.log(`║  Webhook   : http://localhost:${PORT}/webhook`);
  console.log(`╚═══════════════════════════════════════╝\n`);
  if (!PHONE_NUMBER_ID) console.warn(`⚠️  Add META credentials to .env file!\n`);
});
