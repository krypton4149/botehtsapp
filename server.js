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

  const badgeClass = (status = '') => {
    const s = String(status).toLowerCase();
    if (s.includes('cancel')) return 'badge badge--danger';
    if (s.includes('pending')) return 'badge badge--warn';
    if (s.includes('prepar')) return 'badge badge--info';
    return 'badge badge--ok';
  };

  const initials = (name = '') =>
    String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase())
      .join('') || 'U';

  const rows = orders.slice().reverse().map(o => `
    <tr>
      <td><b>#${o.num}</b></td>
      <td>
        <div class="nameCell">
          <div class="avatar">${initials(o.name)}</div>
          <div class="nameText">${o.name}</div>
        </div>
      </td>
      <td>${o.phone}</td>
      <td class="truncate" title="${o.address}">${o.address}</td>
      <td class="itemsCell">${o.items.map(i=>`${i.name}<span class="muted"> ×${i.qty}</span>`).join('<br>')}</td>
      <td><b>${R.currency}${o.total}</b></td>
      <td><span class="${badgeClass(o.status)}"><span class="bDot"></span>${o.status}</span></td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8"><title>${R.name} — Orders</title>
  <meta http-equiv="refresh" content="20">
  <style>
    :root{
      --bg:#0b0c12;
      --bg2:#0f1018;
      --panel:#12131b;
      --panel2:#141622;
      --card:#161827;
      --stroke:rgba(255,255,255,.08);
      --stroke2:rgba(255,255,255,.12);
      --text:rgba(255,255,255,.92);
      --muted:rgba(255,255,255,.58);
      --muted2:rgba(255,255,255,.40);
      --accent:#ff8a1f;
      --accent2:#ffb25a;
      --ok:#35d07f;
      --shadow:0 18px 50px rgba(0,0,0,.55);
      --shadow2:0 10px 24px rgba(0,0,0,.50);
      --r:16px;
      --sidebar:260px;
    }
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{height:100%}
    body{
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
      color:var(--text);
      background:
        radial-gradient(1200px 700px at 20% 0%, rgba(255,138,31,.14), transparent 60%),
        radial-gradient(1100px 650px at 85% 15%, rgba(120,130,255,.10), transparent 62%),
        linear-gradient(180deg, var(--bg), var(--bg2));
      overflow-x:hidden;
    }
    .app{display:flex;min-height:100vh}
    .sidebar{
      width:var(--sidebar);
      padding:22px 18px;
      background:linear-gradient(180deg, rgba(18,19,27,.92), rgba(14,15,22,.92));
      border-right:1px solid rgba(255,255,255,.06);
      position:sticky;top:0;height:100vh;
      backdrop-filter: blur(12px);
    }
    .brand{
      display:flex;align-items:center;gap:12px;
      padding:10px 10px 18px;
    }
    .mark{
      width:38px;height:38px;border-radius:12px;
      background:linear-gradient(135deg, rgba(255,138,31,.95), rgba(255,186,90,.72));
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 14px 30px rgba(255,138,31,.18);
      color:#1a120a;font-weight:900;
    }
    .brand h1{font-size:20px;line-height:1.05}
    .brand small{display:block;color:var(--muted2);letter-spacing:.14em;font-size:10px;margin-top:5px}

    .nav{margin-top:8px;display:flex;flex-direction:column;gap:6px}
    .nav a{
      text-decoration:none;color:var(--muted);
      padding:11px 12px;border-radius:12px;
      display:flex;align-items:center;gap:12px;
      border:1px solid transparent;
    }
    .nav a .ico{width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;opacity:.9}
    .nav a.active{
      color:rgba(255,201,148,.95);
      background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
      border-color:rgba(255,255,255,.08);
      box-shadow:var(--shadow2);
    }
    .nav a:hover{background:rgba(255,255,255,.04);color:rgba(255,255,255,.80)}

    .sidebarFoot{margin-top:auto;padding:18px 10px 6px;color:var(--muted2);font-size:12px;display:flex;flex-direction:column;gap:10px}
    .helpRow{display:flex;align-items:center;gap:10px}
    .helpDot{width:18px;height:18px;border-radius:999px;border:1px solid rgba(255,255,255,.10);display:flex;align-items:center;justify-content:center}
    .cta{
      margin-top:14px;
      width:100%;
      border:0;
      background:linear-gradient(135deg, rgba(255,138,31,1), rgba(255,186,90,.95));
      color:#1a120a;
      font-weight:800;
      padding:14px 14px;
      border-radius:12px;
      box-shadow:0 18px 40px rgba(255,138,31,.16);
      cursor:pointer;
    }

    .main{flex:1; padding:18px 26px 38px;}
    .topbar{
      display:flex;align-items:center;justify-content:space-between;gap:18px;
      padding:8px 2px 18px;
    }
    .search{
      flex:0 0 320px;
      background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.08);
      border-radius:12px;
      display:flex;align-items:center;gap:10px;
      padding:10px 12px;
      box-shadow:var(--shadow2);
    }
    .search input{
      width:100%;
      border:0;outline:0;
      background:transparent;
      color:rgba(255,255,255,.88);
      font-size:13px;
    }
    .search input::placeholder{color:rgba(255,255,255,.34)}
    .tabs{display:flex;align-items:center;gap:18px;color:var(--muted);font-size:13px}
    .tabs .tab{position:relative;padding:10px 6px}
    .tabs .tab.active{color:rgba(255,186,90,.92)}
    .tabs .tab.active:after{
      content:"";position:absolute;left:8px;right:8px;bottom:4px;height:2px;border-radius:999px;
      background:linear-gradient(90deg, rgba(255,138,31,1), rgba(255,186,90,.9));
    }
    .right{display:flex;align-items:center;gap:12px}
    .statusPill{
      display:inline-flex;align-items:center;gap:8px;
      padding:9px 12px;border-radius:999px;
      background:rgba(53,208,127,.10);
      border:1px solid rgba(53,208,127,.22);
      color:rgba(170,255,215,.92);
      font-size:12px;
      box-shadow:var(--shadow2);
    }
    .liveDot{width:8px;height:8px;border-radius:999px;background:var(--ok);box-shadow:0 0 0 6px rgba(53,208,127,.10)}
    .iconBtn{
      width:36px;height:36px;border-radius:12px;
      background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.08);
      display:flex;align-items:center;justify-content:center;
      color:rgba(255,255,255,.78);
      box-shadow:var(--shadow2);
    }
    .profile{
      width:36px;height:36px;border-radius:999px;
      background:linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.04));
      border:1px solid rgba(255,255,255,.10);
      display:flex;align-items:center;justify-content:center;
      font-weight:800;color:rgba(255,255,255,.75);
      box-shadow:var(--shadow2);
    }

    .cards{display:grid;grid-template-columns:repeat(4, minmax(0,1fr));gap:18px;margin-top:6px}
    .card{
      background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.03));
      border:1px solid rgba(255,255,255,.08);
      border-radius:18px;
      box-shadow:var(--shadow);
    }
    .kpi{padding:18px 18px 16px;min-height:118px;display:flex;flex-direction:column;gap:10px}
    .kpiTop{display:flex;align-items:center;justify-content:space-between}
    .kpiIco{
      width:40px;height:40px;border-radius:14px;
      display:flex;align-items:center;justify-content:center;
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.04);
      color:rgba(255,255,255,.82);
    }
    .kpiChip{
      font-size:11px;color:rgba(170,255,215,.90);
      padding:6px 10px;border-radius:999px;
      background:rgba(53,208,127,.10);
      border:1px solid rgba(53,208,127,.18);
    }
    .kpiLabel{color:rgba(255,255,255,.68);font-size:12px}
    .kpiValue{font-size:36px;letter-spacing:.2px;font-weight:850;margin-top:-4px}

    .section{margin-top:26px}
    .sectionHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
    .sectionTitle{font-size:20px;font-weight:750}
    .sectionHint{color:var(--muted2);font-size:12px;margin-top:3px}
    .history{
      color:rgba(255,186,90,.88);
      font-size:13px;
      text-decoration:none;
      display:inline-flex;align-items:center;gap:8px;
    }
    .history:hover{color:rgba(255,220,170,.95)}

    .tableCard{padding:14px;border-radius:18px}
    table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
    thead th{
      text-transform:uppercase;
      letter-spacing:.12em;
      font-size:11px;
      color:rgba(255,255,255,.55);
      text-align:left;
      padding:12px 12px;
      border-bottom:1px solid rgba(255,255,255,.06);
      background:transparent;
      white-space:nowrap;
    }
    tbody td{
      padding:16px 12px;
      border-bottom:1px solid rgba(255,255,255,.06);
      color:rgba(255,255,255,.82);
      vertical-align:middle;
    }
    tbody tr:last-child td{border-bottom:0}
    .nameCell{display:flex;align-items:center;gap:12px}
    .avatar{
      width:34px;height:34px;border-radius:999px;
      background:rgba(255,255,255,.06);
      border:1px solid rgba(255,255,255,.10);
      display:flex;align-items:center;justify-content:center;
      font-weight:850;font-size:12px;color:rgba(255,255,255,.70);
    }
    .nameText{font-weight:650}
    .truncate{max-width:210px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.70);font-size:12px}
    .itemsCell{color:rgba(255,255,255,.72);font-size:12px;line-height:1.55}
    .muted{color:rgba(255,255,255,.40)}

    .badge{
      display:inline-flex;align-items:center;gap:8px;
      padding:8px 12px;border-radius:999px;
      font-size:12px;font-weight:650;
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.04);
      color:rgba(255,255,255,.78);
      white-space:nowrap;
    }
    .bDot{width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.55)}
    .badge--ok{border-color:rgba(53,208,127,.22);background:rgba(53,208,127,.10);color:rgba(170,255,215,.92)}
    .badge--ok .bDot{background:rgba(53,208,127,1)}
    .badge--warn{border-color:rgba(255,204,77,.24);background:rgba(255,204,77,.10);color:rgba(255,230,160,.92)}
    .badge--warn .bDot{background:rgba(255,204,77,1)}
    .badge--info{border-color:rgba(120,130,255,.24);background:rgba(120,130,255,.10);color:rgba(210,215,255,.92)}
    .badge--info .bDot{background:rgba(120,130,255,1)}
    .badge--danger{border-color:rgba(255,90,122,.26);background:rgba(255,90,122,.10);color:rgba(255,210,220,.92)}
    .badge--danger .bDot{background:rgba(255,90,122,1)}

    .empty{
      padding:24px 14px;
      color:var(--muted);
      text-align:center;
    }

    .widgets{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;margin-top:18px}
    .imgWidget{
      position:relative;
      overflow:hidden;
      border-radius:18px;
      min-height:170px;
      background:
        linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.55)),
        radial-gradient(800px 420px at 30% 30%, rgba(255,138,31,.18), transparent 60%),
        linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    }
    .imgWidget:before{
      content:"";
      position:absolute;inset:0;
      background:
        url("https://images.unsplash.com/photo-1529692236671-f1de01f0b8a5?auto=format&fit=crop&w=1400&q=60");
      background-size:cover;background-position:center;
      opacity:.25;
      filter:saturate(.9) contrast(1.08);
    }
    .imgWidget .wBody{
      position:relative;
      padding:22px;
      display:flex;
      flex-direction:column;
      justify-content:flex-end;
      min-height:170px;
    }
    .wTitle{font-size:18px;font-weight:800}
    .wSub{margin-top:6px;color:rgba(255,255,255,.62);font-size:12px;max-width:440px;line-height:1.5}

    .chartWidget{padding:18px 18px 16px}
    .chartHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
    .chartHead h3{font-size:16px}
    .bars{display:flex;gap:10px;align-items:flex-end;height:110px;padding:10px 6px 0;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
    .bar{flex:1;border-radius:10px;background:rgba(255,255,255,.16)}
    .bar:nth-child(1){height:55%}
    .bar:nth-child(2){height:72%}
    .bar:nth-child(3){height:44%}
    .bar:nth-child(4){height:88%}
    .bar:nth-child(5){height:62%}
    .bar:nth-child(6){height:70%}

    .alert{
      margin-top:14px;
      border-radius:14px;
      padding:12px 14px;
      background:rgba(255,90,122,.10);
      border:1px solid rgba(255,90,122,.20);
      color:rgba(255,225,230,.92);
      font-size:13px;
    }
    code{background:rgba(0,0,0,.30);padding:2px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.10);color:rgba(255,225,190,.95);font-size:12px}
    a{color:rgba(255,186,90,.92)}

    @media (max-width: 1100px){
      .cards{grid-template-columns:repeat(2, minmax(0,1fr));}
      .widgets{grid-template-columns:1fr;}
      .search{flex-basis:280px}
    }
    @media (max-width: 820px){
      .sidebar{display:none}
      .main{padding:16px 16px 32px}
      .search{display:none}
      .tabs{display:none}
      .cards{grid-template-columns:1fr}
      .truncate{max-width:140px}
    }
  </style></head><body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="mark">🍴</div>
        <div>
          <h1>${R.name}</h1>
          <small>ADMIN DASHBOARD</small>
        </div>
      </div>

      <nav class="nav" aria-label="Sidebar">
        <a class="active" href="#"><span class="ico">▦</span> Overview</a>
        <a href="#"><span class="ico">🧾</span> Orders</a>
        <a href="#"><span class="ico">📖</span> Menu</a>
        <a href="#"><span class="ico">📈</span> Analytics</a>
        <a href="#"><span class="ico">⚙️</span> Settings</a>
      </nav>

      <button class="cta" type="button">＋ Add New Order</button>

      <div class="sidebarFoot">
        <div class="helpRow"><span class="helpDot">?</span> Help Center</div>
      </div>
    </aside>

    <main class="main">
      <div class="topbar">
        <div class="search">
          <span style="opacity:.7">🔎</span>
          <input placeholder="Search dashboard..." />
        </div>

        <div class="tabs" aria-label="Top tabs">
          <div class="tab active">Dashboard</div>
        </div>

        <div class="right">
          <div class="statusPill"><span class="liveDot"></span> Live Status</div>
          <div class="iconBtn" title="Notifications">🔔</div>
          <div class="profile" title="Profile">👤</div>
        </div>
      </div>

      ${!PHONE_NUMBER_ID ? `<div class="alert"><b>Bot not configured yet.</b> Add your Meta API credentials in <code>.env</code> (see <code>.env.example</code>) to activate WhatsApp webhooks.</div>` : ''}

      <section class="cards" aria-label="KPIs">
        <div class="card kpi">
          <div class="kpiTop">
            <div class="kpiIco">🧾</div>
            <div class="kpiChip">↗ +12%</div>
          </div>
          <div class="kpiLabel">Total Orders</div>
          <div class="kpiValue">${orders.length}</div>
        </div>
        <div class="card kpi">
          <div class="kpiTop">
            <div class="kpiIco">💸</div>
            <div class="kpiChip">↗ +8%</div>
          </div>
          <div class="kpiLabel">Total Revenue</div>
          <div class="kpiValue">${R.currency}${totalRev.toLocaleString()}</div>
        </div>
        <div class="card kpi">
          <div class="kpiTop">
            <div class="kpiIco">📦</div>
            <div class="kpiChip">↗ +5%</div>
          </div>
          <div class="kpiLabel">Today's Orders</div>
          <div class="kpiValue">${todayOrd.length}</div>
        </div>
        <div class="card kpi">
          <div class="kpiTop">
            <div class="kpiIco">⚡</div>
            <div class="kpiChip">↗ +9%</div>
          </div>
          <div class="kpiLabel">Today's Revenue</div>
          <div class="kpiValue">${R.currency}${todayRev.toLocaleString()}</div>
        </div>
      </section>

      <section class="section" aria-label="Orders">
        <div class="sectionHead">
          <div>
            <div class="sectionTitle">Orders</div>
            <div class="sectionHint">${orders.length ? `Showing latest ${orders.length} order(s)` : 'Waiting for first order…'}</div>
          </div>
          <a class="history" href="#"><span>View All History</span> <span aria-hidden="true">→</span></a>
        </div>

        <div class="card tableCard">
          ${orders.length === 0
            ? `<div class="empty">⏳ No orders yet — once customers message your WhatsApp Business number, orders appear here automatically.</div>`
            : `<table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`
          }
        </div>
      </section>

      <section class="widgets" aria-label="Widgets">
        <div class="card imgWidget">
          <div class="wBody">
            <div class="wTitle">System Performance</div>
            <div class="wSub">AI-driven kitchen optimization and staff management tools active.</div>
          </div>
        </div>
        <div class="card chartWidget">
          <div class="chartHead">
            <h3>Revenue Growth</h3>
            <div style="color:rgba(255,255,255,.42);font-size:12px">Last 6 days</div>
          </div>
          <div class="bars" aria-hidden="true">
            <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
          </div>
        </div>
      </section>
    </main>
  </div>
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
