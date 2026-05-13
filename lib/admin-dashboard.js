'use strict';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeClass(status = '') {
  const x = String(status).toLowerCase();
  if (x.includes('cancel')) return 'badge badge--danger';
  if (x.includes('pending')) return 'badge badge--warn';
  if (x.includes('prepar')) return 'badge badge--info';
  return 'badge badge--ok';
}

function initials(name = '') {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || 'U'
  );
}

function buildOrderRows(orders, R) {
  return orders.slice().map((o) => {
      const itemsHtml = o.items
        .map((i) => `${escapeHtml(i.name)}<span class="muted"> ×${i.qty}</span>`)
        .join('<br>');
      const done = Boolean(o.outForDelivery);
      return `<tr>
      <td><b>#${o.num}</b></td>
      <td>
        <div class="nameCell">
          <div class="avatar">${initials(o.name)}</div>
          <div class="nameText">${escapeHtml(o.name)}</div>
        </div>
      </td>
      <td class="mono">${escapeHtml(o.phone)}</td>
      <td class="truncate" title="${escapeHtml(o.address)}">${escapeHtml(o.address)}</td>
      <td class="itemsCell">${itemsHtml}</td>
      <td><b>${R.currency}${o.total}</b></td>
      <td><span class="${badgeClass(o.status)}"><span class="bDot"></span>${escapeHtml(o.status)}</span></td>
      <td class="dispatchCell">
        <label class="dispatchToggle ${done ? 'dispatchToggle--done' : 'dispatchToggle--pending'}" title="Tick when food is packed and out for delivery">
          <input type="checkbox" class="dispatchInp" data-order-num="${Number(o.num)}" ${done ? 'checked' : ''} aria-label="Order #${Number(o.num)} out for delivery" />
          <span class="dispatchSwitch" aria-hidden="true"><span class="dispatchKnob"></span></span>
          <span class="dispatchText">${done ? 'Done' : 'Pending'}</span>
        </label>
      </td>
    </tr>`;
    })
    .join('');
}

function dashboardStyles() {
  return `<style>
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
      display:flex;flex-direction:column;
    }
    .brand{
      display:flex;align-items:center;gap:12px;
      padding:10px 10px 18px;
    }
    .mark{
      width:38px;height:38px;border-radius:12px;
      flex-shrink:0;
      overflow:hidden;
      box-shadow:0 14px 30px rgba(255,138,31,.18);
      border:1px solid rgba(255,255,255,.12);
      background:#12131b;
    }
    .markImg{width:100%;height:100%;display:block;object-fit:cover}
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
    .tabs .tab{position:relative;padding:10px 6px;text-decoration:none;color:inherit;display:inline-block}
    .tabs .tab:not(.active){color:var(--muted)}
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
    .topLogo{
      width:28px;height:28px;border-radius:8px;
      object-fit:cover;
      border:1px solid rgba(255,255,255,.10);
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

    .tableCard{padding:14px;border-radius:18px;overflow-x:auto}
    table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;min-width:880px}
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
    .page--orders .truncate{max-width:min(380px,32vw)}
    .itemsCell{color:rgba(255,255,255,.72);font-size:12px;line-height:1.55}
    .muted{color:rgba(255,255,255,.40)}
    .mono{font-size:12px;color:rgba(255,255,255,.62);white-space:nowrap}

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

    .dispatchCell{padding:10px 8px;vertical-align:middle;white-space:nowrap}
    .dispatchToggle{
      position:relative;
      display:inline-flex;align-items:center;gap:10px;cursor:pointer;
      user-select:none;padding:6px 10px 6px 8px;border-radius:12px;
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.03);
      transition:background .15s,border-color .15s,box-shadow .15s;
    }
    .dispatchToggle:hover{background:rgba(255,255,255,.06)}
    .dispatchToggle--pending{
      border-color:rgba(255,90,122,.45);
      box-shadow:0 0 0 1px rgba(255,90,122,.12) inset;
    }
    .dispatchToggle--done{
      border-color:rgba(53,208,127,.40);
      box-shadow:0 0 0 1px rgba(53,208,127,.10) inset;
    }
    .dispatchToggle input.dispatchInp{
      position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
      clip:rect(0,0,0,0);white-space:nowrap;border:0;
    }
    .dispatchSwitch{
      width:42px;height:24px;border-radius:999px;flex-shrink:0;
      background:rgba(255,90,122,.35);
      border:1px solid rgba(255,90,122,.55);
      position:relative;transition:background .2s,border-color .2s;
    }
    .dispatchToggle--done .dispatchSwitch{
      background:rgba(53,208,127,.28);
      border-color:rgba(53,208,127,.55);
    }
    .dispatchKnob{
      position:absolute;top:2px;left:3px;width:18px;height:18px;border-radius:999px;
      background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35);
      transition:transform .2s ease;
    }
    .dispatchToggle--done .dispatchKnob{transform:translateX(18px)}
    .dispatchText{
      font-size:12px;font-weight:750;letter-spacing:.02em;min-width:54px;
    }
    .dispatchToggle--pending .dispatchText{color:#ff9eb0}
    .dispatchToggle--done .dispatchText{color:#9cf0c0}
    .dispatchToggle input.dispatchInp:focus-visible + .dispatchSwitch{
      outline:2px solid rgba(255,138,31,.55);outline-offset:2px;
    }

    .empty{
      padding:24px 14px;
      color:var(--muted);
      text-align:center;
    }

    .menuNote{
      margin-top:14px;padding:14px 16px;border-radius:16px;
      background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
      font-size:13px;color:var(--muted);line-height:1.55;
    }
    .menuNote--warn{
      border-color:rgba(255,138,31,.28);
      background:rgba(255,138,31,.08);
      color:rgba(255,220,190,.92);
    }
    .menuCat{margin-top:22px}
    .menuCat:first-of-type{margin-top:8px}
    .menuCatTitle{font-size:14px;font-weight:750;color:rgba(255,255,255,.88);margin-bottom:12px;padding-left:2px}
    .menuGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
    .menuItem{
      padding:16px;border-radius:16px;
      background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.03));
      border:1px solid rgba(255,255,255,.08);
    }
    .menuItemTop{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
    .menuItemId{font-size:11px;font-weight:800;letter-spacing:.08em;color:rgba(255,186,90,.92)}
    .pill{font-size:10px;font-weight:750;padding:4px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.12)}
    .pill--veg{border-color:rgba(53,208,127,.35);background:rgba(53,208,127,.10);color:rgba(170,255,215,.95)}
    .pill--nv{border-color:rgba(255,90,122,.3);background:rgba(255,90,122,.08);color:rgba(255,210,220,.92)}
    .menuItemName{font-size:15px;font-weight:700;line-height:1.35;margin-top:4px}
    .menuItemPrice{margin-top:12px;font-size:14px;color:rgba(255,255,255,.78)}

    .settingsPage .setLayout{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:6px}
    @media (max-width: 900px){
      .settingsPage .setLayout{grid-template-columns:1fr}
    }
    .setHero{padding:22px 22px 20px}
    .setHeroTop{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:4px}
    .setEyebrow{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,186,90,.88)}
    .setHeroTitle{font-size:22px;font-weight:780;margin-top:6px;line-height:1.2;color:rgba(255,255,255,.94)}
    .setPill{display:inline-flex;padding:7px 14px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid;white-space:nowrap}
    .setPill--ok{background:rgba(53,208,127,.12);border-color:rgba(53,208,127,.28);color:rgba(180,255,220,.95)}
    .setPill--bad{background:rgba(255,90,122,.1);border-color:rgba(255,90,122,.24);color:rgba(255,220,225,.95)}
    .setLead{margin-top:12px;font-size:14px;color:var(--muted);line-height:1.55;max-width:540px}
    .setKpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:20px}
    @media (max-width: 700px){
      .setKpis{grid-template-columns:1fr}
    }
    .setKpi{padding:14px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}
    .setKpiLab{display:block;font-size:11px;color:var(--muted2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
    .setKpiVal{font-size:14px;color:rgba(255,255,255,.88);word-break:break-word}
    .setMono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:rgba(255,255,255,.72)}
    .setMuted{font-size:13px;color:var(--muted)}
    .setProfileCard{padding:22px 22px 20px}
    .setProfileName{font-size:20px;font-weight:780;margin-top:6px;line-height:1.2}
    .setProfileAddr{margin-top:10px;font-size:14px;color:var(--muted);line-height:1.55}
    .setChipRow{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
    .setChip{padding:8px 12px;border-radius:999px;font-size:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);color:rgba(255,255,255,.78)}
    .setPay{margin-top:14px;font-size:13px;color:rgba(255,255,255,.82);line-height:1.45}
    .setFootnote{margin-top:18px;font-size:12px;color:var(--muted2);line-height:1.5}
    .statusOk{color:rgba(170,255,215,.95)}
    .statusBad{color:rgba(255,180,190,.95)}
    .statusWarn{color:rgba(255,220,160,.95)}

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
  </style>`;
}

function renderSidebar(R, activePage) {
  const nav = (key, href, icon, label) =>
    `<a class="${activePage === key ? 'active' : ''}" href="${href}"><span class="ico">${icon}</span> ${label}</a>`;
  return `<aside class="sidebar">
      <div class="brand">
        <div class="mark" aria-hidden="true"><img class="markImg" src="${escapeHtml(R.logoUrl || '/logo.svg')}" alt="" width="38" height="38" decoding="async" /></div>
        <div>
          <h1>${escapeHtml(R.name)}</h1>
          <small>ADMIN DASHBOARD</small>
        </div>
      </div>

      <nav class="nav" aria-label="Sidebar">
        ${nav('overview', '/', '▦', 'Overview')}
        ${nav('orders', '/orders', '🧾', 'Orders')}
        ${nav('menu', '/menu', '📖', 'Menu')}
        ${nav('settings', '/settings', '⚙️', 'Settings')}
      </nav>

      <div class="sidebarFoot">
        <div class="helpRow"><span class="helpDot">?</span> Help Center</div>
      </div>
    </aside>`;
}

function renderTopbar(activeTab, R) {
  const logo = escapeHtml(R.logoUrl || '/logo.svg');
  const tab = (id, href, label) =>
    `<a class="tab ${activeTab === id ? 'active' : ''}" href="${href}">${label}</a>`;
  return `<div class="topbar">
        <div class="search">
          <span style="opacity:.7">🔎</span>
          <input type="search" placeholder="Filter table rows…" autocomplete="off" />
        </div>

        <div class="tabs" aria-label="Top tabs">
          ${tab('dashboard', '/', 'Dashboard')}
          ${tab('orders', '/orders', 'Orders')}
          ${tab('menu', '/menu', 'Menu')}
          ${tab('settings', '/settings', 'Settings')}
        </div>

        <div class="right">
          <img class="topLogo" src="${logo}" alt="" width="28" height="28" decoding="async" />
          <div class="statusPill"><span class="liveDot"></span> Live Status</div>
        </div>
      </div>`;
}

function kpiSection(orders, R, totalRev, todayOrd, todayRev) {
  return `<section class="cards" aria-label="KPIs">
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
          <div class="kpiValue">${R.currency}${totalRev.toLocaleString('en-IN')}</div>
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
          <div class="kpiValue">${R.currency}${todayRev.toLocaleString('en-IN')}</div>
        </div>
      </section>`;
}

function ordersTableHtml(orders, R) {
  if (orders.length === 0) {
    return `<div class="empty">⏳ No orders yet — once customers message your WhatsApp Business number, orders appear here automatically.</div>`;
  }
  const rows = buildOrderRows(orders, R);
  return `<table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th title="Prepared & sent for delivery">Delivery</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`;
}

function ordersSection(orders, R, { fullPage }) {
  const hint = fullPage
    ? `Complete order log (${orders.length} total).`
    : orders.length
      ? `Showing latest ${orders.length} order(s).`
      : 'Waiting for first order…';
  const historyLink = fullPage
    ? `<a class="history" href="/"><span>Back to Overview</span> <span aria-hidden="true">←</span></a>`
    : `<a class="history" href="/orders"><span>View All History</span> <span aria-hidden="true">→</span></a>`;
  const title = fullPage ? 'Order history' : 'Orders';

  return `<section class="section" aria-label="Orders">
        <div class="sectionHead">
          <div>
            <div class="sectionTitle">${title}</div>
            <div class="sectionHint">${hint}</div>
          </div>
          ${historyLink}
        </div>

        <div class="card tableCard">
          ${ordersTableHtml(orders, R)}
        </div>
      </section>`;
}

function menuBlocksHtml(R, menuRecord) {
  return Object.entries(menuRecord)
    .map(([cat, items]) => {
      const cards = items
        .map(
          (i) => `<div class="menuItem">
          <div class="menuItemTop">
            <span class="menuItemId">${escapeHtml(i.id)}</span>
          </div>
          <div class="menuItemName">${escapeHtml(i.name)}</div>
          <div class="menuItemPrice">${R.currency}${i.price}</div>
        </div>`
        )
        .join('');
      return `<section class="menuCat" aria-label="${escapeHtml(cat)}">
        <div class="menuCatTitle">${escapeHtml(cat)}</div>
        <div class="menuGrid">${cards}</div>
      </section>`;
    })
    .join('');
}

/**
 * @param {object} R restaurant config (currency, legacy R.menu)
 * @param {object} [menuDb] result of `fetchMenuGroupedByCategory()`; omit to fall back to `R.menu`
 */
function menuSection(R, menuDb) {
  let noteHtml;
  let blocks;

  if (menuDb == null) {
    noteHtml = `<div class="menuNote">
          Menu items are defined in <code>server.js</code> under <code>R.menu</code>. Edit there and redeploy the bot to change dishes or prices.
        </div>`;
    blocks = menuBlocksHtml(R, R.menu);
  } else if (!menuDb.ok) {
    noteHtml = `<div class="menuNote menuNote--warn">${escapeHtml(menuDb.message)}</div>`;
    blocks = `<div class="empty">Fix the connection above, then refresh this page.</div>`;
  } else if (menuDb.empty || !Object.keys(menuDb.menu).length) {
    noteHtml = `<div class="menuNote menuNote--warn">Supabase is connected but there are no active menu rows. Add data in <code>menu_categories</code> / <code>menu_items</code> or run <code>supabase/seed.sql</code> in the SQL Editor.</div>`;
    blocks = '';
  } else {
    noteHtml = '';
    blocks = menuBlocksHtml(R, menuDb.menu);
  }

  return `<section class="section" aria-label="Menu">
        <div class="sectionHead">
          <div>
            <div class="sectionTitle">Menu</div>
            <div class="sectionHint">What customers see in WhatsApp (codes & prices)</div>
          </div>
          <a class="history" href="/"><span>Overview</span> <span aria-hidden="true">→</span></a>
        </div>
        ${noteHtml}
        ${blocks}
      </section>`;
}

function settingsSection(R, meta) {
  const phoneOk = Boolean(meta.phoneNumberId);
  const allOk = phoneOk && meta.hasAccessToken;
  const pill = allOk
    ? '<span class="setPill setPill--ok">Live</span>'
    : '<span class="setPill setPill--bad">Needs attention</span>';

  let heroTitle;
  let lead;
  if (allOk) {
    heroTitle = 'Orders are flowing in';
    lead =
      'Your WhatsApp link is active. New orders from customers show up on your dashboard as they come in.';
  } else if (phoneOk && !meta.hasAccessToken) {
    heroTitle = 'Almost there';
    lead =
      'Your business number is on file, but messaging still needs to be turned on before customers can order.';
  } else {
    heroTitle = 'Connect WhatsApp ordering';
    lead =
      'Link your WhatsApp Business account so customers can browse the menu and place orders from their phone.';
  }

  const idDisplay = phoneOk
    ? `<span class="setMono">${escapeHtml(meta.phoneNumberId)}</span>`
    : '<span class="statusBad">Not linked</span>';

  const msgStatus = meta.hasAccessToken
    ? '<span class="statusOk">Ready</span>'
    : '<span class="statusBad">Not ready</span>';

  const verifyLabel = meta.verifyFromEnv ? 'Custom' : 'Standard';

  const payLine = R.payment
    ? `<p class="setPay">${escapeHtml(R.payment)}</p>`
    : '';

  return `<section class="section settingsPage" aria-label="Settings">
        <div class="sectionHead">
          <div>
            <div class="sectionTitle">Settings</div>
            <div class="sectionHint">Your restaurant and how customers reach you</div>
          </div>
          <a class="history" href="/"><span>Overview</span> <span aria-hidden="true">→</span></a>
        </div>

        <div class="setLayout">
          <div class="card setHero">
            <div class="setHeroTop">
              <div>
                <div class="setEyebrow">Online ordering</div>
                <h2 class="setHeroTitle">${heroTitle}</h2>
              </div>
              ${pill}
            </div>
            <p class="setLead">${lead}</p>
            <div class="setKpis">
              <div class="setKpi">
                <span class="setKpiLab">Business number</span>
                <span class="setKpiVal">${idDisplay}</span>
              </div>
              <div class="setKpi">
                <span class="setKpiLab">Messaging</span>
                <span class="setKpiVal">${msgStatus}</span>
              </div>
              <div class="setKpi">
                <span class="setKpiLab">Verification</span>
                <span class="setKpiVal"><span class="setMuted">${verifyLabel}</span></span>
              </div>
            </div>
          </div>

          <div class="card setProfileCard">
            <div class="setEyebrow">Business profile</div>
            <h2 class="setProfileName">${escapeHtml(R.name)}</h2>
            <p class="setProfileAddr">${escapeHtml(R.address)}</p>
            <div class="setChipRow">
              <span class="setChip">🕐 ${escapeHtml(R.timing)}</span>
              <span class="setChip">Minimum ${escapeHtml(R.currency)}${escapeHtml(String(R.min_order))}</span>
              <span class="setChip">⏱ ${escapeHtml(R.delivery_time)}</span>
            </div>
            ${payLine}
            <p class="setFootnote">This is what guests see when they chat with your restaurant on WhatsApp.</p>
          </div>
        </div>
      </section>`;
}

const dashFilterScript = `<script>
(function(){
  var inp=document.querySelector(".search input");
  if(!inp)return;
  inp.addEventListener("input",function(){
    var q=(inp.value||"").toLowerCase().trim();
    var rows=document.querySelectorAll("tbody tr");
    if(!rows.length)return;
    rows.forEach(function(tr){
      tr.style.display=!q||tr.innerText.toLowerCase().indexOf(q)!==-1?"":"none";
    });
  });
})();
</script>`;

const dispatchScript = `<script>
(function(){
  document.body.addEventListener('change', function(ev){
    var t = ev.target;
    if(!t || !t.classList || !t.classList.contains('dispatchInp')) return;
    var num = parseInt(t.getAttribute('data-order-num'), 10);
    var checked = t.checked;
    var label = t.closest('.dispatchToggle');
    var textEl = label && label.querySelector('.dispatchText');
    t.disabled = true;
    fetch('/api/orders/' + num + '/dispatch', {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ out: checked })
    }).then(function(r){
      t.disabled = false;
      if(!r.ok){
        t.checked = !checked;
        return r.json().then(function(j){ alert(j.error || 'Update failed'); }).catch(function(){ alert('Update failed'); });
      }
      if(label){
        label.classList.remove('dispatchToggle--pending','dispatchToggle--done');
        label.classList.add(checked ? 'dispatchToggle--done' : 'dispatchToggle--pending');
        if(textEl) textEl.textContent = checked ? 'Done' : 'Pending';
      }
    }).catch(function(){
      t.disabled = false;
      t.checked = !checked;
      alert('Network error');
    });
  });
})();
</script>`;

/**
 * @param {{ R: object, PHONE_NUMBER_ID?: string, orders: object[], page: 'overview'|'orders'|'menu'|'settings', settingsMeta?: { hasAccessToken?: boolean, verifyFromEnv?: boolean }, menuDb?: object }} opts
 * `menuDb` is the resolved value from `fetchMenuGroupedByCategory()` when `page === 'menu'`.
 */
function renderAdminPage(opts) {
  const { R, PHONE_NUMBER_ID, orders, page, settingsMeta = {}, menuDb } = opts;
  const totalRev = orders.reduce((s, o) => s + o.total, 0);
  const today = new Date().toLocaleDateString('en-IN');
  const todayOrd = orders.filter((o) => o.time.includes(today));
  const todayRev = todayOrd.reduce((s, o) => s + o.total, 0);

  const titles = {
    overview: `${R.name} — Overview`,
    orders: `${R.name} — Orders`,
    menu: `${R.name} — Menu`,
    settings: `${R.name} — Settings`,
  };
  const metaRefresh =
    page === 'overview' || page === 'orders'
      ? '<meta http-equiv="refresh" content="20">'
      : '';

  const alert = !PHONE_NUMBER_ID
    ? page === 'settings'
      ? `<div class="alert"><b>Ordering isn’t live yet.</b> Finish connecting WhatsApp so customers can place orders here.</div>`
      : `<div class="alert"><b>Ordering isn’t live yet.</b> Finish your WhatsApp Business connection to receive orders in this dashboard.</div>`
    : '';

  const bodyClass =
    page === 'orders'
      ? 'page--orders'
      : page === 'menu'
        ? 'page--menu'
        : page === 'settings'
          ? 'page--settings'
          : 'page--overview';

  let mainInner = '';
  if (page === 'overview') {
    mainInner =
      alert +
      kpiSection(orders, R, totalRev, todayOrd, todayRev) +
      ordersSection(orders, R, { fullPage: false });
  } else if (page === 'orders') {
    mainInner =
      alert + kpiSection(orders, R, totalRev, todayOrd, todayRev) + ordersSection(orders, R, { fullPage: true });
  } else if (page === 'menu') {
    mainInner = alert + kpiSection(orders, R, totalRev, todayOrd, todayRev) + menuSection(R, menuDb);
  } else if (page === 'settings') {
    mainInner =
      alert +
      settingsSection(R, {
        phoneNumberId: PHONE_NUMBER_ID || '',
        hasAccessToken: Boolean(settingsMeta.hasAccessToken),
        verifyFromEnv: Boolean(settingsMeta.verifyFromEnv),
      });
  }

  const topTab =
    page === 'overview'
      ? 'dashboard'
      : page === 'orders'
        ? 'orders'
        : page === 'menu'
          ? 'menu'
          : 'settings';

  return `<!DOCTYPE html><html lang="en"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(titles[page])}</title>
  ${metaRefresh}
  ${dashboardStyles()}
  </head><body class="${bodyClass}">
  <div class="app">
    ${renderSidebar(
      R,
      page === 'menu' ? 'menu' : page === 'orders' ? 'orders' : page === 'settings' ? 'settings' : 'overview'
    )}
    <main class="main">
      ${renderTopbar(topTab, R)}
      ${mainInner}
    </main>
  </div>
  ${dashFilterScript}${dispatchScript}
  </body></html>`;
}

module.exports = { renderAdminPage };
