const path = require('path');
const assert = require('assert');
const SCRIPT = path.join(__dirname, '..', 'extension', 'speedy-pages.user.js');
const pure = require(SCRIPT);
const pw = require(process.env.PW || 'playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};
const same = (name, got, want) => { let good = true; try { assert.deepStrictEqual(got, want); } catch (_) { good = false; } ok(name, good, got); };

const ROWS = '<div id="stuck" style="position:sticky;top:0;height:120px;background:#eee">header</div><div id="grid" style="display:grid;grid-template-columns:repeat(4,1fr);row-gap:30px">' +
  Array.from({ length: 20 }, (_, i) => `<div data-item-id="i${i}" class="order-card" data-component-type="s-search-result" style="height:500px"><div style="height:28px"></div><img alt="" style="display:block;width:187px;height:187px;background:#ccd"><p>Product ${i + 1}</p><span class="buy"><button data-automation-id="add-to-cart" aria-label="Add to cart - Product ${i + 1}">Add</button></span></div>`).join('') + '</div>';
const BOX = '<input id="box" type="search" data-automation-id="header-input-search" placeholder="Search"><select id="pick"><option>a</option><option>b</option></select>' +
  '<div role="dialog" aria-modal="true"><button id="indialog">Close</button></div><button id="plain">Add</button>' + ROWS;

const walmart = (pages, skeleton = 0) => `<!doctype html><html><head><meta charset="utf-8"><title>My Items</title></head><body>${BOX}<button id="cartbtn" data-automation-id="cart-button-header" style="position:absolute;right:8px;top:0" onclick="window.__cartOpened=(window.__cartOpened||0)+1">Cart</button><div id="app"></div>
<script>
  window.loads = (window.loads || 0) + 1; window.seen = [];
  const tally = (k) => sessionStorage.setItem(k, String(Number(sessionStorage.getItem(k) || 0) + 1)); tally('wm.loads');
  window.addEventListener('keydown', (e) => window.seen.push(e.key));
  window.cart = {}; window.presses = [];
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.buy button'); if (!b) return;
    const t = b.closest('[data-item-id]'); const id = t.getAttribute('data-item-id'); const name = t.querySelector('p').textContent;
    const draw = () => { const n = window.cart[id] || 0;
      t.querySelector('.buy').innerHTML = !n ? '<button data-automation-id="add-to-cart" aria-label="Add to cart - ' + name + '">Add</button>'
        : t.dataset.open ? '<span data-testid="quantity-stepper"><button data-testid="quantity-stepper-dec-button" aria-label="Decrease quantity ' + name + ', Current Quantity ' + n + '">-</button><span data-testid="quantity-label">' + (n >= 6 ? 'Max 6' : n) + '</span><button data-testid="quantity-stepper-inc-button"' + (n >= 6 ? ' disabled' : '') + ' aria-label="Increase quantity ' + name + ', Current Quantity ' + n + '">+</button></span>'
        : '<button data-testid="quantity-in-cart" aria-label="' + n + '  in cart, ' + name + '">' + n + '</button>'; };
    const label = b.getAttribute('aria-label') || '';
    window.presses.push(id + ':' + (b.matches('[data-testid="quantity-in-cart"]') ? 'open' : /^Decrease/.test(label) ? '-' : '+'));
    if (b.matches('[data-testid="quantity-in-cart"]')) { t.dataset.open = '1'; draw(); return; }
    const by = /^Decrease/.test(label) ? -1 : 1;
    const set = (n) => { window.cart[id] = Math.max(0, Math.min(6, n)); if (!window.cart[id]) { delete window.cart[id]; delete t.dataset.open; } draw(); };
    if (!window.cart[id]) setTimeout(() => { set(1); delete t.dataset.open; draw(); }, 300);
    else { set(window.cart[id] + by); if (window.slip) { window.slip = false; setTimeout(() => set((window.cart[id] || 0) - by), 500); } }
  });
  const PAGES = ${pages};
  function draw() {
    const cur = parseInt(new URL(location.href).searchParams.get('page') || '1', 10);
    const app = document.getElementById('app'); app.innerHTML = '';
    if ((location.pathname !== '/my-items' && location.pathname !== '/search') || PAGES < 2) return;
    const nav = document.createElement('nav'); nav.setAttribute('aria-label', 'pagination');
    const ul = document.createElement('ul'); nav.append(ul);
    const shown = new Set([1, PAGES, cur - 1, cur, cur + 1, 2, 3, 4].filter((n) => n >= 1 && n <= PAGES));
    let prev = 0;
    for (const n of [...shown].sort((a, b) => a - b)) {
      if (n - prev > 1) { const d = document.createElement('li'); d.textContent = '...'; ul.append(d); }
      const li = document.createElement('li'); const a = document.createElement('a');
      const to = new URL(location.href); to.searchParams.set('page', String(n)); a.href = to.pathname + to.search; a.textContent = String(n);
      a.addEventListener('click', (e) => { e.preventDefault(); window.clicks = (window.clicks || 0) + 1; tally('wm.clicks');
        const to = new URL(a.href).pathname + new URL(a.href).search; history.pushState({ url: to, as: to, options: {}, __N: true, key: 'k' + Date.now() }, '', to); load(); });
      li.append(a); ul.append(li); prev = n;
    }
    app.append(nav);
  }
  function load() {
    if (${skeleton}) document.getElementById('app').innerHTML = '<div class="skeleton">loading</div>';
    clearTimeout(window.drawing); window.drawing = setTimeout(draw, ${skeleton} || 60);
  }
  history.replaceState({ url: location.pathname + location.search, as: location.pathname + location.search, options: {}, __N: true, key: 'first' }, '');
  window.addEventListener('popstate', (e) => { if (e.state && e.state.__N) { window.pops = (window.pops || 0) + 1; tally('wm.pops'); load(); } });
  window.leave = () => { history.pushState({ url: '/cart', as: '/cart', options: {}, __N: true, key: 'cart' }, '', '/cart'); draw(); };
  setTimeout(draw, 150);
</script></body></html>`;

const amazon = (url, orders, late) => {
  const u = new URL(url); const cur = parseInt(u.searchParams.get('page') || '0', 10) + 1;
  const pages = Math.ceil(orders / 10); const tf = u.searchParams.get('timeFilter');
  const href = (n) => '/your-orders/orders?' + (u.searchParams.get('nocount') ? 'nocount=1&amp;' : '') + (tf ? 'timeFilter=' + tf + '&amp;' : '') + 'page=' + (n - 1) + '&amp;ref_=ppx_yo2ov_dt_b_pagination_' + cur + '_' + n;
  const start = Math.max(1, Math.min(cur - 2, pages - 4));
  let lis = cur > 1 ? `<li class="a-normal"><a href="${href(cur - 1)}">←Previous</a></li>` : '<li class="a-disabled">←Previous</li>';
  for (let n = start; n <= Math.min(pages, start + 4); n++) lis += `<li class="${n === cur ? 'a-selected' : 'a-normal'}"><a href="${href(n)}">${n}</a></li>`;
  lis += cur < pages ? `<li class="a-last"><a href="${href(cur + 1)}">Next→</a></li>` : '<li class="a-disabled a-last">Next→</li>';
  const bar = `<ul class="a-pagination">${lis}</ul>`;
  const count = u.searchParams.get('nocount') ? '' : `<label for="time-filter" class="a-form-label time-filter__label"><b>${orders.toLocaleString('en-US')} orders</b> placed in</label>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Your Orders</title></head><body>${BOX}${count}<div id="slot"></div>
<script>window.seen = []; window.addEventListener('keydown', (e) => window.seen.push(e.key));
setTimeout(() => { document.getElementById('slot').innerHTML = ${JSON.stringify(bar)}; }, ${late});</script></body></html>`;
};

const amazonSearch = (url, pages) => {
  const u = new URL(url); const cur = parseInt(u.searchParams.get('page') || '1', 10);
  const href = (n) => '/s?k=' + (u.searchParams.get('k') || '') + '&amp;page=' + n + '&amp;qid=1700000000&amp;ref=sr_pg_' + n;
  let items = cur > 1 ? `<a class="s-pagination-item s-pagination-previous s-pagination-button" href="${href(cur - 1)}">Previous</a>` : '<span class="s-pagination-item s-pagination-previous s-pagination-disabled">Previous</span>';
  for (const n of [...new Set([1, cur - 1, cur, cur + 1, cur + 2].filter((x) => x >= 1 && x < pages))]) items += n === cur ? `<span class="s-pagination-item s-pagination-selected">${n}</span>` : `<a class="s-pagination-item s-pagination-button" href="${href(n)}">${n}</a>`;
  items += cur === pages ? `<span class="s-pagination-item s-pagination-selected">${pages}</span>` : `<span class="s-pagination-item s-pagination-ellipsis">...</span><span class="s-pagination-item s-pagination-disabled">${pages}</span>`;
  items += cur < pages ? `<a class="s-pagination-item s-pagination-next s-pagination-button" href="${href(cur + 1)}">Next</a>` : '<span class="s-pagination-item s-pagination-next s-pagination-disabled">Next</span>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Amazon.com : coffee</title></head><body>${BOX}<div class="s-pagination-container"><span class="s-pagination-strip">${items}</span></div>
<script>window.seen = []; window.addEventListener('keydown', (e) => window.seen.push(e.key));</script></body></html>`;
};

const LOG = `const log = (x) => { const a = JSON.parse(sessionStorage.getItem('wm.log') || '[]'); a.push(x); sessionStorage.setItem('wm.log', JSON.stringify(a)); };
  window.seen = []; window.addEventListener('keydown', (e) => window.seen.push(e.key));`;
const walmartCart = (mode) => `<!doctype html><html><head><meta charset="utf-8"><title>Cart</title><style>
  body{margin:0;font:14px sans-serif} #slots{display:flex;gap:16px;padding:120px 24px 24px} #slots button{width:92px;height:81px}
  #go{position:absolute;right:24px;top:40px;width:331px;height:40px} li{list-style:none;height:270px;width:773px;position:relative;margin-bottom:12px;border-bottom:1px solid #ccc}
  li img{width:136px;height:136px;background:#ccd;display:block} li .acts{position:absolute;right:0;bottom:16px;display:flex;gap:24px;align-items:center} li .acts button{height:32px}
  [role=dialog]{position:fixed;left:340px;top:160px;width:560px;padding:24px;background:#fff;border:1px solid #333;z-index:9} [role=dialog] button{height:40px;min-width:120px} [role=dialog] label{display:block;height:48px}
  #veil{position:fixed;inset:0;background:rgba(0,0,0,.4)} #toast{position:fixed;left:40%;bottom:16px}</style></head><body>
<input id="box" type="search" data-automation-id="header-input-search" placeholder="Search">
<button id="go" data-automation-id="checkout">${mode === 'amend' ? "Add items to today's order" : 'Continue to checkout'}</button>
<div id="slots">${[['Express 27-57 min $19.95 is now $10.00'], ['Today 3 hours or less $14.95 is now $5.00'], ['Today 3pm to 5pm 3pm-5pm Free with'], ['Today 4pm to 6pm 4pm-6pm Free with']].map((t, i) => `<button data-automation-id="cart-slot-shortcut-slot-${i}">${t[0]}</button>`).join('')}</div>
<ul id="items" style="padding:0 24px;margin:0">${['Bread', 'Milk', 'Eggs'].map((n, i) => `<li data-n="${n}"><a href="/ip/seort/${1000 + i}"><img alt=""></a><span>${n}</span><div class="acts"><button aria-label="Remove ${n}">Remove</button><button aria-label="Save for later: ${n}">Save for later</button>
  <div data-testid="quantity-stepper"><button data-testid="quantity-stepper-dec-button" aria-label="Decrease quantity ${n}, Current Quantity 1">-</button><span data-testid="quantity-label">1</span><button data-testid="quantity-stepper-inc-button" aria-label="Increase quantity ${n}, Current Quantity 1">+</button></div></div></li>`).join('')}</ul>
<div style="height:1500px"></div>
<script>${LOG}
  let gone = null;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, input[type=radio]'); if (!b) return;
    const li = b.closest('li'); const label = b.getAttribute('aria-label') || ''; const text = b.textContent.trim();
    if (b.matches('[data-automation-id^="cart-slot-shortcut-slot-"]')) { log('slot:' + b.getAttribute('data-automation-id').slice(-1));
      const veil = document.createElement('div'); veil.id = 'veil'; document.body.append(veil);
      setTimeout(() => { veil.remove(); document.getElementById('slots').outerHTML = '<p id="chosen" style="padding:120px 24px 24px">Delivery from store today, ' + (/(\\d+pm-\\d+pm)/.exec(text) || ['', 'soon'])[1] + '</p>'; }, 1500); }
    else if (li && /^(In|De)crease/.test(label)) { const lab = li.querySelector('[data-testid="quantity-label"]'); const n = Math.max(0, parseInt(lab.textContent, 10) + (/^Increase/.test(label) ? 1 : -1)); lab.textContent = String(n);
      for (const x of li.querySelectorAll('[data-testid^="quantity-stepper-"]')) x.setAttribute('aria-label', x.getAttribute('aria-label').replace(/Current Quantity \\d+/, 'Current Quantity ' + n)); }
    else if (li && /^Remove /.test(label)) { log('remove:' + li.dataset.n); gone = { li, next: li.nextElementSibling }; setTimeout(() => { li.remove();
      const t = document.createElement('div'); t.id = 'toast'; t.innerHTML = 'Removed <button>Undo</button>'; document.body.append(t); setTimeout(() => t.remove(), 4000); }, 100); }
    else if (li && /^Save for later/.test(label)) { log('save:' + li.dataset.n); setTimeout(() => li.remove(), 100); }
    else if (text === 'Undo') { log('undo'); document.getElementById('items').insertBefore(gone.li, gone.next); b.closest('#toast').remove(); }
    else if (b.id === 'go') { log('go:' + text); if (text === 'Continue to checkout') setTimeout(() => { const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-labelledby', 'gif');
      d.innerHTML = '<div><button aria-label="Close dialog" type="button">x</button><h2 id="gif"><span> Get it faster! </span></h2></div><div data-testid="dual-nudge-express-slot"><label><input name="Slot List" type="radio"> Express 27-57 min $10.00</label></div><div data-testid="dual-nudge-evergreen-slot"><label><input name="Slot List" type="radio"> Today 3 hours or less $5.00</label></div><div><button type="button">Reserve</button> <button type="button">No thanks</button></div>';
      document.body.append(d); }, 200); }
    else if (b.closest('[role=dialog]')) { log(b.type === 'radio' ? 'radio:' + b.closest('[data-testid]').getAttribute('data-testid') : 'dialog:' + (text || label));
      if (text === 'No thanks') location.assign('/checkout/review-order?cartId=test'); }
  });
</script></body></html>`;
const walmartCheckout = () => `<!doctype html><html><head><meta charset="utf-8"><title>Checkout</title><style>
  body{margin:0;font:14px sans-serif} #back{position:absolute;left:16px;top:14px;height:40px} ul{display:flex;gap:16px;list-style:none;padding:300px 24px 0;margin:0} ul button{height:40px;width:180px}
  [data-automation-id="place-order-button"]{position:absolute;right:24px;top:104px;width:362px;height:48px}
  [role=dialog]{position:fixed;left:340px;top:160px;width:560px;padding:24px;background:#fff;border:1px solid #333;z-index:9} [role=dialog] button{height:40px;min-width:120px}</style></head><body>
<button id="back" aria-label="Checkout, Back">Back</button><h1 style="padding:60px 24px 0">Checkout</h1>
<div data-testid="deliver-instructions"><ul role="list" aria-label="Delivery instructions"><li><button type="button" aria-label="Leave at my door, unselected" data-testid="delivery-option-LEAVE_AT_DOOR">Leave at my door</button></li>
  <li><button type="button" aria-label="Require handoff, selected" data-testid="delivery-option-MEET_AT_DOOR">Require handoff</button></li></ul></div>
<div style="height:1200px"></div>
<script>${LOG}
  setTimeout(() => { const b = document.createElement('button'); b.setAttribute('data-automation-id', 'place-order-button'); b.setAttribute('data-testid', 'place-order-button'); b.textContent = 'Place order for $12.34'; document.body.append(b); }, 400);
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button'); if (!b) return; const text = b.textContent.trim();
    if (b.matches('[data-testid^="delivery-option-"]')) { log('door:' + b.getAttribute('data-testid').slice(16)); for (const x of document.querySelectorAll('[data-testid^="delivery-option-"]')) x.setAttribute('aria-label', x.textContent + (x === b ? ', selected' : ', unselected')); }
    else if (b.matches('[data-automation-id="place-order-button"]')) log('placed');
    else if (b.id === 'back') { log('back'); setTimeout(() => { if (document.querySelector('[role=dialog]')) return; const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.setAttribute('aria-labelledby', 'alm');
      d.innerHTML = '<div><button aria-label="Close dialog" type="button">x</button><h2 id="alm">You\\'re almost there!</h2></div><div><span>You\\u2019ll have to start over if you leave.</span></div><div><button type="button">Leave anyway</button> <button type="button">Keep checking out</button></div>'; document.body.append(d); }, 300); }
    else if (b.closest('[role=dialog]')) { log('dialog:' + (text || b.getAttribute('aria-label'))); if (text === 'Keep checking out' || !text) b.closest('[role=dialog]').remove(); }
  });
</script></body></html>`;

const AMZ_CSS = `.aok-hidden,.sc-hidden{display:none!important} .a-offscreen{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
  .a-button{position:relative;display:inline-flex;align-items:center;justify-content:center;height:32px;min-width:116px;padding:0 14px;background:#ffd814;color:#0f1111;border-radius:100px}
  .a-button-base{background:#fff;border:1px solid #888c8c} .a-button-oneclick{background:#ffa41c}
  .a-button-input{position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;opacity:.01;cursor:pointer}
  fieldset[data-a-component="stepper"]{border:2px solid #ffd814;border-radius:16px;padding:0 6px;height:32px;display:inline-flex;align-items:center;gap:8px;margin:0}
  fieldset[data-a-component="stepper"] button{width:26px;height:26px;cursor:pointer}
  fieldset [data-a-selector="spinner"] .a-spinner{display:none;width:16px;height:16px;background:#ccc;border-radius:50%}
  fieldset[data-a-value-status="loading"] [data-a-selector="spinner"] .a-spinner,fieldset .a-spinner.on{display:inline-block}`;
const AMZ_LOG = `const amzPush = (k, x) => { const a = JSON.parse(sessionStorage.getItem(k) || '[]'); a.push(x); sessionStorage.setItem(k, JSON.stringify(a)); };
  const log = (x) => amzPush('amz.log', x); const bad = (x) => amzPush('amz.never', x);
  window.seen = []; window.addEventListener('keydown', (e) => window.seen.push(e.key));
  document.addEventListener('submit', (e) => e.preventDefault());`;

const amazonSearchShop = (url, pages = 5) => {
  const u = new URL(url); const cur = parseInt(u.searchParams.get('page') || '1', 10);
  const href = (n) => '/s?k=' + (u.searchParams.get('k') || 'garlic') + '&amp;page=' + n + '&amp;qid=1700000001&amp;ref=sr_pg_' + n;
  let items = cur > 1 ? `<a class="s-pagination-item s-pagination-previous s-pagination-button" href="${href(cur - 1)}">Previous</a>` : '<span class="s-pagination-item s-pagination-previous s-pagination-disabled">Previous</span>';
  for (let n = 1; n <= pages; n++) items += n === cur ? `<span class="s-pagination-item s-pagination-selected">${n}</span>` : `<a class="s-pagination-item s-pagination-button" href="${href(n)}">${n}</a>`;
  const cards = [
    { idx: 0, asin: 'B0TEST0001', kind: 'add', name: 'Garlic Powder Twin A' },
    { idx: 1, asin: 'B0TEST0001', kind: 'add', name: 'Garlic Powder Twin B' },
    { idx: 2, asin: 'B0TEST0002', kind: 'opt', name: 'Spice Classics Options' },
    { idx: 3, asin: 'B0TEST0003', kind: 'kindle', name: 'A Kindle Book' },
    ...Array.from({ length: 8 }, (_, k) => ({ idx: k + 4, asin: 'B00ITEM00' + (k + 4), kind: 'add', name: 'Pantry Item ' + (k + 5) })),
  ];
  const cardHtml = (c) => {
    const cta = c.kind === 'opt'
      ? `<div class="puis-see-details-content"><span class="a-button a-button-base"><span class="a-button-inner"><a href="/sspa/click?asin=${c.asin}" class="a-button-text" data-bad="see-options">See options</a></span></span></div>`
      : c.kind === 'kindle'
      ? `<form method="post" action="/api/bifrost/acquisitions/v1/actions/buy"><span class="a-declarative" data-action="post-button-action"><span class="a-button a-button-oneclick"><span class="a-button-inner"><input type="submit" class="a-button-input" aria-label="Buy now with 1-Click ®" data-bad="1click-search"><span class="a-button-text">Buy now with 1-Click ®</span></span></span></span></form>`
      : `<div data-asin="${c.asin}" class="a-section atc-faceout-container" data-is-optimistic="true" data-max-order-quantity="5" data-steppervalue="0" data-is-request-in-progress="false"><form method="post" action="/cart/add-to-cart"><input type="hidden" name="maxOrderQuantity" value="5"><div class="ax-replace"><div class="ax-atc celwidget atc-btn-container"><span class="a-button a-button-primary puis-atcb-button"><span class="a-button-inner"><input name="submit.addToCart" aria-label="Add to cart" class="a-button-input" type="submit"><span class="a-button-text" aria-hidden="true">Add to cart</span></span></span></div><div class="qs-slot"></div><div class="aok-hidden ax-qs-failure"><span>Quantity not updated</span></div></div></form></div>`;
    return `<div role="listitem" data-asin="${c.asin}" data-index="${c.idx}" data-uuid="uuid-${c.idx}" id="uuid-${c.idx}" data-component-type="s-search-result" class="s-result-item" style="height:440px;padding:8px;border:1px solid #f5f5f5"><div style="height:20px"></div><img alt="${c.name}" style="display:block;width:160px;height:160px;background:#dde"><h2 style="font-size:14px">${c.name}</h2>${cta}</div>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>Amazon.com : garlic</title><style>
    body{margin:0;font:14px sans-serif} #nav-belt{position:sticky;top:0;height:60px;background:#085749;color:#fff;display:flex;align-items:center;gap:24px;padding:0 16px;z-index:20}
    #twotabsearchtextbox{width:320px;height:32px} #nav-cart{color:#fff;padding:6px 12px;text-decoration:none}
    .s-main-slot{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:12px 160px 24px 16px}
    .full-band{grid-column:1 / -1}
    #nav-flyout-ewc{position:fixed;right:0;top:0;width:130px;height:720px;background:#fafafa;border-left:1px solid #ddd;z-index:15}
    .a-popover-modal{position:fixed;left:440px;top:180px;width:400px;height:300px;background:#fff;border:1px solid #888;padding:24px;z-index:40}
    ${AMZ_CSS}</style></head><body>
  <header id="nav-belt"><input id="twotabsearchtextbox" name="field-keywords" type="text" placeholder="Search Amazon"><a id="nav-cart" href="/gp/cart/view.html?ref_=nav_cart" aria-label="0 items in cart"><span id="nav-cart-count">0</span> Cart</a></header>
  <div class="s-main-slot s-result-list s-search-results sg-row">
    <div class="s-result-item s-widget AdHolder full-band" style="height:110px;background:#eef">Sponsored brand banner</div>
    <div class="s-result-item s-flex-full full-band" style="height:32px;background:#f7f7f7">Results</div>
    ${cards.slice(0, 8).map(cardHtml).join('')}
    <div class="sg-col-20-of-24 s-result-item full-band" style="height:220px;background:#f6f3ea;padding:12px">Recently bought and rated <span class="a-button a-button-primary"><input type="submit" name="submit.addToCart" aria-label="Add to cart" class="a-button-input" data-bad="carousel-add"><span class="a-button-text">Add to cart</span></span></div>
    ${cards.slice(8).map(cardHtml).join('')}
  </div>
  <div class="s-pagination-container" style="padding:24px"><span class="s-pagination-strip">${items}</span></div>
  <div id="nav-flyout-ewc" role="dialog" aria-modal="false" class="aok-hidden"><div>Subtotal</div><div class="ewc-item" data-itemtype="active" data-itemid="ewc-1"><fieldset name="sc-quantity" data-a-component="stepper" data-steppervalue="1"><button data-a-selector="decrement" type="button">-</button><span data-a-selector="spinner"><span class="a-spinner"></span></span><button data-a-selector="increment" type="button">+</button></fieldset></div></div>
  <script>${AMZ_LOG}
    window.cart = {};
    function renderCard(card) {
      const idx = card.getAttribute('data-index'); const n = window.cart[idx] || 0;
      const box = card.querySelector('.atc-faceout-container'); const atc = card.querySelector('.ax-atc'); const slot = card.querySelector('.qs-slot');
      box.setAttribute('data-steppervalue', String(n));
      if (!n) { atc.classList.remove('aok-hidden'); slot.innerHTML = ''; return; }
      atc.classList.add('aok-hidden');
      const atMax = n >= 5; const atMin = n === 1;
      slot.innerHTML = '<fieldset name="ax-qs" data-a-component="stepper" data-a-value-status="normal" data-a-decrement-status="' + (atMin ? 'trash' : 'normal') + '" data-a-increment-status="' + (atMax ? 'disabled' : 'normal') + '" data-steppervalue="' + n + '" data-valuemin="1" data-valuemax="5">'
        + '<button type="button" data-action="a-stepper-decrement" data-a-selector="decrement" aria-label="' + (atMin ? 'This item has a minimum order quantity of 1' : 'Decrease quantity by one') + '"><span class="a-icon ' + (atMin ? 'a-icon-small-trash' : 'a-icon-small-remove') + '">-</span></button>'
        + '<span data-a-selector="spinner"><span class="a-spinner a-spinner-small"></span><span class="a-offscreen">Updating quantity</span></span>'
        + '<span data-a-selector="value">99 in cart</span><div class="a-offscreen a-stepper-live-region" aria-live="polite">99 in cart</div>'
        + '<button type="button" data-action="a-stepper-increment" data-a-selector="increment" aria-disabled="' + (atMax ? 'true' : 'false') + '" aria-label="' + (atMax ? 'This item has a maximum quantity of 5' : 'Increase quantity by one') + '">+</button></fieldset>';
    }
    function openMaxModal() {
      if (document.querySelector('[aria-label="Maximum Quantity Reached"]')) return;
      const m = document.createElement('div'); m.className = 'a-popover a-popover-modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Maximum Quantity Reached');
      m.innerHTML = '<h4>Maximum Quantity Reached</h4><p>This item has a maximum quantity of 5</p><button type="button" data-action="a-popover-close" aria-label="Close">Close</button>';
      document.body.append(m); log('max-opened'); m.querySelector('button').focus();
    }
    document.addEventListener('click', (e) => {
      const trap = e.target.closest && e.target.closest('[data-bad]');
      if (trap) { e.preventDefault(); bad(trap.getAttribute('data-bad')); return; }
      const close = e.target.closest && e.target.closest('button[data-action="a-popover-close"]');
      if (close) { log('max-closed'); close.closest('[role="dialog"]').remove(); return; }
      const navCart = e.target.closest && e.target.closest('#nav-cart');
      if (navCart) { e.preventDefault(); log('nav-cart'); location.assign('/gp/cart/view.html?ref_=nav_cart'); return; }
      const card = e.target.closest && e.target.closest('[data-component-type="s-search-result"]');
      if (!card) return;
      const idx = card.getAttribute('data-index'); const box = card.querySelector('.atc-faceout-container');
      const add = e.target.closest('input[name="submit.addToCart"]');
      const inc = e.target.closest('button[data-a-selector="increment"]');
      const dec = e.target.closest('button[data-a-selector="decrement"]');
      if (!add && !inc && !dec) return;
      e.preventDefault();
      if (inc && inc.getAttribute('aria-disabled') === 'true') { bad('disabled-inc'); return; }
      box.setAttribute('data-is-request-in-progress', 'true');
      if (add) {
        log('add:' + idx);
        setTimeout(() => {
          window.cart[idx] = 1; renderCard(card);
          document.getElementById('nav-flyout-ewc').classList.remove('aok-hidden');
          if (!document.getElementById('inline-expansion-slot')) {
            const ies = document.createElement('div'); ies.id = 'inline-expansion-slot'; ies.className = 'full-band'; ies.style.cssText = 'height:520px;background:#fff8e8;padding:16px';
            ies.innerHTML = '<h3>Products you might need</h3><span class="a-button a-button-primary"><input type="submit" name="submit.addToCart" aria-label="Add to cart" class="a-button-input" data-bad="inline-expansion-add"><span class="a-button-text">Add to cart</span></span>';
            const slot = document.querySelector('.s-main-slot'); slot.insertBefore(ies, slot.querySelectorAll('[data-component-type="s-search-result"]')[4]);
          }
        }, 50);
        setTimeout(() => { box.setAttribute('data-is-request-in-progress', 'false'); document.getElementById('nav-cart-count').textContent = '1'; }, 350);
        return;
      }
      const next = Math.max(0, Math.min(5, (window.cart[idx] || 0) + (inc ? 1 : -1)));
      log((inc ? '+:' : '-:') + idx + '->' + next);
      setTimeout(() => {
        window.cart[idx] = next; if (!next) delete window.cart[idx]; renderCard(card);
        if (inc && next === 5) setTimeout(openMaxModal, 21);
      }, 25);
      clearTimeout(card._save);
      const slip = window.amzSlip; window.amzSlip = false;
      card._save = setTimeout(() => {
        if (slip && next > 1) { window.cart[idx] = next - 1; renderCard(card); log('slip:' + idx); }
        box.setAttribute('data-is-request-in-progress', 'false');
        const sum = Object.values(window.cart).reduce((a, b) => a + b, 0);
        document.getElementById('nav-cart-count').textContent = String(sum);
      }, 340);
    });
  </script></body></html>`;
};

const amazonBuyAgain = () => `<!doctype html><html><head><meta charset="utf-8"><title>Buy Again</title><style>
  body{margin:0;font:14px sans-serif} #nav-belt{height:60px;background:#085749;display:flex;align-items:center;gap:20px;padding:0 16px}
  #grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:16px} ${AMZ_CSS}</style></head><body>
<header id="nav-belt"><input id="twotabsearchtextbox" name="field-keywords" type="text"><a id="nav-cart" href="/gp/cart/view.html" style="color:#fff">Cart</a></header>
<div id="ride-side-sheet" style="width:1px;height:1px"></div>
<div id="grid">
  ${['B0TEST0004', 'B0TEST0005'].map((asin, i) => `<div id="gridCell-${asin}" data-isskeleton="false" style="height:360px;border:1px solid #eee;padding:8px">
    <div id="gridElement-${asin}" tabindex="-1"><img alt="" style="width:140px;height:140px;background:#dde;display:block"><p>Item ${i + 1}</p>
      <div data-asin="${asin}" class="atc-faceout-container" data-is-request-in-progress="false"><form method="post" action="/cart/add-to-cart/ref=pd_bap"><div class="ax-replace">
        <div class="ax-atc atc-btn-container" id="Ax-AddToCartButton-Personalization"><span class="a-button a-button-primary"><span class="a-button-inner"><input type="submit" name="submit.addToCart" aria-label="Add to cart" class="a-button-input"><span class="a-button-text">Add to cart</span></span></span></div>
        <div class="qs-slot"></div></div></form></div>
      <button type="button" aria-label="Add to Favorite Reorders" data-bad="ba-favorite">Fav</button>
      <button type="button" data-event="NOT_INTERESTED" aria-label="Remove item" data-bad="ba-not-interested">Hide</button>
    </div>
    <div id="detail-${asin}" class="aok-hidden"><form><input type="submit" name="submit.addToCart" aria-label="Add to cart" class="a-button-input" data-bad="ba-hidden-add"></form></div>
  </div>`).join('')}
  <div id="gridCell-SKEL1" data-isskeleton="true" style="height:360px;background:#f5f5f5">Loading</div>
</div>
<script>${AMZ_LOG}
  window.ba = {};
  function drawBa(cell) {
    const asin = cell.id.slice(9); const n = window.ba[asin] || 0;
    const g = cell.querySelector('[id^="gridElement-"]'); const atc = g.querySelector('.ax-atc'); const slot = g.querySelector('.qs-slot');
    if (!n) { atc.classList.remove('aok-hidden'); slot.innerHTML = ''; return; }
    atc.classList.add('aok-hidden');
    slot.innerHTML = '<fieldset name="ax-qs" data-a-component="stepper" data-a-decrement-status="' + (n === 1 ? 'trash' : 'normal') + '" data-a-increment-status="' + (n >= 27 ? 'disabled' : 'normal') + '" data-steppervalue="' + n + '" data-valuemax="27">'
      + '<button type="button" data-a-selector="decrement" aria-label="' + (n === 1 ? 'This item has a minimum order quantity of 1' : 'Decrease quantity by one') + '">-</button>'
      + '<span data-a-selector="spinner"><span class="a-spinner a-spinner-small"></span></span><span data-a-selector="value">' + n + '</span>'
      + '<button type="button" data-a-selector="increment" aria-disabled="false">+</button></fieldset>';
  }
  document.addEventListener('click', (e) => {
    const trap = e.target.closest && e.target.closest('[data-bad]');
    if (trap) { e.preventDefault(); bad(trap.getAttribute('data-bad')); return; }
    const cell = e.target.closest && e.target.closest('[id^="gridCell-"]'); if (!cell) return;
    const asin = cell.id.slice(9);
    if (e.target.closest('input[name="submit.addToCart"]')) { e.preventDefault(); log('ba-add:' + asin); window.ba[asin] = 1; drawBa(cell); }
    else if (e.target.closest('[data-a-selector="increment"]')) { window.ba[asin] = (window.ba[asin] || 0) + 1; log('ba-+:' + asin + '->' + window.ba[asin]); drawBa(cell); }
    else if (e.target.closest('[data-a-selector="decrement"]')) { window.ba[asin] = Math.max(0, (window.ba[asin] || 0) - 1); if (!window.ba[asin]) delete window.ba[asin]; log('ba--:' + asin + '->' + (window.ba[asin] || 0)); drawBa(cell); }
  });
</script></body></html>`;

const amazonCart = () => `<!doctype html><html><head><meta charset="utf-8"><title>Amazon.com Shopping Cart</title><style>
  body{margin:0;font:14px sans-serif} #nav-belt{height:60px;background:#085749;display:flex;align-items:center;padding:0 16px}
  #sc-buy-box{position:absolute;right:24px;top:80px;width:280px;padding:16px;background:#fff;border:1px solid #ddd}
  .cart-row{height:210px;width:760px;padding:12px;border-bottom:1px solid #ddd;position:relative}
  .acts{display:flex;gap:16px;align-items:center;margin-top:12px}
  .act-btn{height:28px;padding:0 10px;cursor:pointer} ${AMZ_CSS}</style></head><body>
<header id="nav-belt"><input id="twotabsearchtextbox" name="field-keywords" type="text" placeholder="Search Amazon"></header>
<h1 style="font-size:12px">Your Amazon Cart is empty</h1>
<h2>All Carts</h2>
<div id="sc-buy-box"><span id="sc-subtotal-label-buybox">Subtotal (3 items):</span> <span id="sc-buy-box-ptc-button" class="a-button a-button-primary"><span class="a-button-inner"><input name="proceedToRetailCheckout" type="submit" value="Proceed to checkout" class="a-button-input"><span class="a-button-text">Proceed to checkout</span></span></span></div>
<div id="sc-active-cart" data-name="Active Items" style="padding:0 24px">
  ${[['item-1', 'B0TEST0001', 'Garlic'], ['item-2', 'B09CABLE02', 'Cable'], ['item-3', 'B08SOAP003', 'Soap']].map(([id, asin, n]) => `<div class="cart-row" data-itemtype="active" data-asin="${asin}" data-itemid="${id}" data-quantity="1">
    <img alt="${n}" style="width:96px;height:96px;background:#ccd;display:block"><strong>${n}</strong>
    <label><input type="checkbox" class="a-switch-input" name="sns-item-cart-desktop" aria-label="Subscribe &amp; Save - 5% off ${n}" data-bad="cart-sns"> Subscribe &amp; Save</label>
    <div class="acts">
      <fieldset name="sc-quantity" data-a-component="stepper" data-a-value-status="normal" data-a-decrement-status="trash" data-a-increment-status="normal" data-steppervalue="1" data-valuemax="999">
        <button type="button" data-a-selector="decrement" aria-label="Delete ${n}">-</button>
        <span data-a-selector="spinner"><span class="a-spinner a-spinner-small"></span><span class="a-offscreen">Updating quantity</span></span>
        <span data-a-selector="value"><span data-a-selector="inner-value">1</span></span>
        <button type="button" data-a-selector="increment" aria-label="Increase quantity by one, Quantity is 1, ${n}" aria-disabled="false">+</button>
      </fieldset>
      <span class="sc-hidden"><input type="number" name="quantityBox" value="1"><a data-action="update" href="#">Update</a></span>
      <input type="submit" class="act-btn" name="submit.delete-active.${id}" value="Delete" data-action="delete-active" aria-label="Delete ${n}">
      <input type="submit" class="act-btn" name="submit.save-for-later.${id}" value="Save for later" data-action="save-for-later">
    </div>
  </div>`).join('')}
</div>
<div data-name="Saved Items" style="padding:24px"><div data-itemtype="saved" data-itemid="saved-1" style="height:140px">Saved Kettle <input type="submit" name="submit.move-to-cart.s1" value="Move to cart" class="aok-hidden" data-bad="sfl-mtc-hidden"><input type="submit" name="submit.move-to-cart.s1" value="Move to cart" data-bad="sfl-mtc"></div></div>
<script>${AMZ_LOG}
  document.addEventListener('click', (e) => {
    const trap = e.target.closest && e.target.closest('[data-bad]');
    if (trap) { e.preventDefault(); bad(trap.getAttribute('data-bad')); return; }
    const ptc = e.target.closest && e.target.closest('input[name="proceedToRetailCheckout"]');
    if (ptc) { e.preventDefault(); log('ptc'); location.assign('/checkout/byg/ref=ox_sc_byg_proceed_ssdCarousel?experienceType=ssdCarousel'); return; }
    const row = e.target.closest && e.target.closest('div[data-itemtype="active"]'); if (!row) return;
    const id = row.getAttribute('data-itemid'); const fs = row.querySelector('fieldset[name="sc-quantity"]');
    const removeStub = (kind) => { log(kind + ':' + id); row.innerHTML = '<div class="sc-list-item-removed-msg"><div class="sc-list-item-removed-msg-delete" data-action="delete" tabindex="0"><a href="/dp/x">Item</a> removed.</div></div>'; };
    if (e.target.closest('input[name^="submit.delete-active."]')) { e.preventDefault(); removeStub('del'); return; }
    if (e.target.closest('input[name^="submit.save-for-later."]')) { e.preventDefault(); removeStub('sfl'); return; }
    const inc = e.target.closest('button[data-a-selector="increment"]');
    const dec = e.target.closest('button[data-a-selector="decrement"]');
    if (!inc && !dec) return;
    const next = Math.max(0, (parseInt(fs.getAttribute('data-steppervalue'), 10) || 1) + (inc ? 1 : -1));
    if (!next) { removeStub('trash'); return; }
    log('cart-qty:' + id + '->' + next);
    row.setAttribute('data-quantity', String(next));
    fs.setAttribute('data-steppervalue', String(next));
    fs.setAttribute('data-a-decrement-status', next === 1 ? 'trash' : 'normal');
    fs.setAttribute('data-a-value-status', 'loading');
    clearTimeout(row._sp);
    row._sp = setTimeout(() => { fs.setAttribute('data-a-value-status', 'normal'); fs.querySelector('[data-a-selector="inner-value"]').textContent = String(next); }, 280);
  });
</script></body></html>`;

const amazonByg = () => `<!doctype html><html><head><meta charset="utf-8"><title>Need anything else?</title><style>
  body{margin:0;font:14px sans-serif;padding:24px} #checkout-byg-ptc-button a{display:inline-flex;align-items:center;justify-content:center;width:100%;height:32px;text-decoration:none;color:#0f1111} ${AMZ_CSS}</style></head><body>
<h1>Need anything else?</h1>
<a class="byg-backtoCart-zoom-a11y" href="/cart/ref=sc_byc_btc_d">Back to Cart</a>
<span id="checkout-byg-ptc-button" class="a-button a-button-primary" style="position:absolute;right:40px;top:40px;width:210px"><span class="a-button-inner"><a href="/checkout/p/p-106-test/spc?pipelineType=Chewbacca">Continue to checkout</a></span></span>
<div class="lazy-load-spinner"></div>
<div style="margin-top:80px"><h3>Home &amp; pharmacy essentials</h3><span class="a-button a-button-primary"><input type="submit" name="submit.addToCart" aria-label="Add, Paper Towels" class="a-button-input" data-bad="byg-carousel-add"><span class="a-button-text">Add</span></span></div>
<script>${AMZ_LOG}
  document.addEventListener('click', (e) => {
    const trap = e.target.closest && e.target.closest('[data-bad]');
    if (trap) { e.preventDefault(); bad(trap.getAttribute('data-bad')); return; }
    const cont = e.target.closest && e.target.closest('#checkout-byg-ptc-button a');
    if (cont) log('byg-continue');
    const back = e.target.closest && e.target.closest('a.byg-backtoCart-zoom-a11y');
    if (back) log('byg-back');
  });
</script></body></html>`;

const amazonCheckout = () => `<!doctype html><html><head><meta charset="utf-8"><title>Secure checkout</title><style>
  body{margin:0;font:14px sans-serif;padding:24px}
  #submitOrderButtonId{position:absolute;right:32px;top:88px;width:407px;height:30px}
  #bottomSubmitOrderButtonId{position:absolute;left:32px;top:520px;width:199px;height:30px}
  .a-spinner-wrapper{position:fixed;inset:0;background:rgba(255,255,255,.8);z-index:30}
  #unknown-dialog{position:fixed;left:380px;top:160px;width:420px;height:220px;background:#fff;border:1px solid #333;padding:24px;z-index:50}
  ${AMZ_CSS}</style></head><body>
<h1>Secure checkout</h1>
<div id="co-spin" class="a-spinner-wrapper">Loading checkout</div>
<form id="spc-form" name="spc" method="post" action="/checkout/p/p-106-test/spc/place-order">
  <span id="review-order-continue-blocker-tooltip-trigger" style="display:inline-block;width:0;height:0;overflow:hidden"><input id="placeOrder" name="placeYourOrder1" type="submit" value="Place your order" class="a-button-input place-your-order-button" disabled style="width:0;height:0" data-bad="hidden-pyob-blocker-top"></span>
  <span id="animated-disabled-pyob-top" class="aok-hidden"><input id="placeOrder" name="placeYourOrder1" type="submit" value="Place your order" class="a-button-input place-your-order-button" data-bad="hidden-pyob-anim-top"></span>
  <span id="submitOrderButtonId" class="a-button a-button-primary continue-button"><span class="a-button-inner"><input id="placeOrder" name="placeYourOrder1" type="submit" value="Place your order" class="a-button-input place-your-order-button" aria-labelledby="submitOrderButtonId-announce"><span id="submitOrderButtonId-announce" class="a-button-text">Place your order</span></span></span>
  <div style="margin-top:160px">
    <div class="a-radio rcx-checkout-delivery-option-a-control-row-new"><label><input type="radio" name="miq://Ordering/1" value="rush" data-bad="co-rush"> Fastest Tomorrow 5 AM - 8 AM $2.99 More time slots available</label></div>
    <div class="a-radio rcx-checkout-delivery-option-a-control-row-new"><label><input type="radio" name="miq://Ordering/1" value="next-1dc" checked> One Day Tomorrow FREE</label></div>
    <label><input type="checkbox" id="sns-item-v2-checkbox-0" data-bad="co-sns"> Save 20% today with auto-deliveries</label>
  </div>
  <span id="bottom-review-order-continue-blocker-tooltip-trigger" style="display:inline-block;width:0;height:0;overflow:hidden"><input id="placeOrder" name="placeYourOrder1" type="submit" value="Place your order" class="a-button-input place-your-order-button" disabled style="width:0;height:0" data-bad="hidden-pyob-blocker-bottom"></span>
  <span id="animated-disabled-pyob-bottom" style="visibility:hidden;position:absolute;left:32px;top:460px;width:199px;height:30px"><input id="placeOrder" name="placeYourOrder1" type="submit" value="Place your order" class="a-button-input place-your-order-button" data-bad="hidden-pyob-anim-bottom"></span>
  <span id="bottomSubmitOrderButtonId" class="a-button a-button-primary"><span class="a-button-inner"><input id="placeOrder" name="placeYourOrder1" type="submit" value="Place your order" class="a-button-input place-your-order-button" aria-labelledby="bottomSubmitOrderButtonId-announce"><span id="bottomSubmitOrderButtonId-announce" class="a-button-text">Place your order</span></span></span>
</form>
<a href="/gp/cart/view.html?ref_=chk_spc_backToCart" style="position:absolute;left:32px;top:600px">Back to cart</a>
<script>${AMZ_LOG}
  setTimeout(() => { const s = document.getElementById('co-spin'); if (s) s.remove(); }, 450);
  window.openUnknownDialog = () => { const d = document.createElement('div'); d.id = 'unknown-dialog'; d.setAttribute('role', 'dialog'); d.innerHTML = '<h3>Verify billing address</h3><button type="button" data-bad="unknown-dialog-btn">Use this address</button>'; document.body.append(d); };
  window.closeUnknownDialog = () => { const d = document.getElementById('unknown-dialog'); if (d) d.remove(); };
  document.addEventListener('click', (e) => {
    const trap = e.target.closest && e.target.closest('[data-bad]');
    if (trap) { e.preventDefault(); bad(trap.getAttribute('data-bad')); return; }
    const pyo = e.target.closest && e.target.closest('input.place-your-order-button');
    if (pyo) { e.preventDefault(); log('placed:' + (pyo.closest('span[id]') || {}).id); return; }
    const back = e.target.closest && e.target.closest('a[href*="chk_spc_backToCart"]');
    if (back) { e.preventDefault(); log('co-back'); }
  });
</script></body></html>`;

const amazonDp = () => `<!doctype html><html><head><meta charset="utf-8"><title>Garlic Powder : Amazon.com</title><style>${AMZ_CSS}</style></head><body>
<a id="dp-crumb" href="#top">Grocery</a>
<div id="dp" class="grocery en_US"><div id="desktop_buybox">
  <span id="submit.add-to-cart" class="a-button a-button-primary"><span class="a-button-inner"><input id="add-to-cart-button" name="submit.add-to-cart" type="submit" value="Add to cart" class="a-button-input"></span></span>
  <div id="sns-atc-container" class="aok-hidden"><input id="add-to-cart-button" name="submit.add-to-cart" type="submit" value="Add subscription to cart" data-bad="dp-sns-add"></div>
  <span id="submit.buy-now" class="a-button a-button-oneclick"><span class="a-button-inner"><input id="buy-now-button" name="submit.buy-now" type="submit" title="Buy Now" value="" class="a-button-input" data-bad="dp-buy-now"></span></span>
  <span id="checkoutButtonId" class="a-button a-button-oneclick"><input id="one-click-button" name="submit.one-click-order.x" type="submit" class="a-button-input" data-bad="dp-1click"></span>
  <button id="buy-for-others-buy-button" type="button" data-bad="dp-gift">Buy as Gift</button>
  <a href="/buying-rules/ref=dp?action=dyn-create-br" class="a-button-text" data-bad="dp-autobuy">Add to Auto Buy</a>
</div></div>
<script>${AMZ_LOG}
  document.addEventListener('click', (e) => {
    const trap = e.target.closest && e.target.closest('[data-bad]');
    if (trap) { e.preventDefault(); bad(trap.getAttribute('data-bad')); return; }
    if (e.target.id === 'add-to-cart-button') { e.preventDefault(); log('dp-add'); }
  });
</script></body></html>`;

async function open(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const u = route.request().url();
    const path = new URL(u).pathname;
    const body = u.includes('walmart.com')
      ? (path === '/cart' ? walmartCart(opts.cart) : path.startsWith('/checkout') ? walmartCheckout() : walmart(opts.pages || 8, opts.skeleton || 0))
      : path === '/s' ? (opts.amz ? amazonSearchShop(u, opts.pages || 5) : amazonSearch(u, opts.pages || 7))
      : path.startsWith('/gp/buyagain') ? amazonBuyAgain()
      : (path === '/cart' || path.startsWith('/cart/ref=') || path.startsWith('/gp/cart/view.html')) ? amazonCart()
      : path.startsWith('/checkout/byg') ? amazonByg()
      : /^\/checkout\/p\/[^/]+\/spc/.test(path) ? amazonCheckout()
      : path.startsWith('/dp/') ? amazonDp()
      : amazon(u, opts.orders || 47, opts.late === undefined ? 150 : opts.late);
    if (opts.slow) setTimeout(() => route.fulfill({ contentType: 'text/html', body }).catch(() => {}), opts.slow);
    else route.fulfill({ contentType: 'text/html', body });
  });
  await page.addInitScript((noShop) => { window.__speedyPagesTest = { noShop }; }, !!opts.noShop);
  await page.addInitScript(() => { window.addEventListener('keydown', (e) => { try { sessionStorage.setItem('klog', (sessionStorage.getItem('klog') || '') + e.key + '@' + Date.now() % 100000 + '@' + location.search.slice(-6) + ' '); } catch (_) { } }, true); });
  await page.addInitScript({ path: SCRIPT });
  await page.goto(url);
  await sleep(opts.wait || 800);
  return page;
}
const ui = (page) => page.evaluate(() => {
  const root = window.__speedyPagesTest && window.__speedyPagesTest.root;
  if (!root) return null;
  const wrap = root.querySelector('.wrap'), bar = root.querySelector('.bar'), cast = root.querySelector('.cast');
  return {
    shown: !wrap.hidden && !bar.hidden && !!root.host.isConnected,
    barShown: !bar.hidden && !wrap.hidden,
    pages: [...root.querySelectorAll('.pages > *')].map((n) => n.textContent).join(' '),
    cur: Number((root.querySelector('.num[aria-current="page"]') || { getAttribute: () => 0 }).getAttribute('data-page')),
    width: Math.round(bar.getBoundingClientRect().width),
    prevOff: root.querySelector('.prev').disabled, nextOff: root.querySelector('.next').disabled,
    live: bar.getAttribute('data-live') === '1', bump: bar.getAttribute('data-bump') === '1', away: bar.getAttribute('data-away') === '1',
    keys: cast.getAttribute('data-on') === '1' ? [...root.querySelectorAll('.cast .key')].map((k) => k.textContent) : null,
    from: cast.getAttribute('data-from'),
    off: ['.prev', '.next'].map((q) => { const a = cast.getBoundingClientRect(), b = root.querySelector(q).getBoundingClientRect(); return Math.round(Math.abs(a.left + a.width / 2 - (b.left + b.width / 2))); }),
    pressed: ['.prev', '.next'].map((q) => root.querySelector(q).getAttribute('data-press') === '1'),
    stay: ['.prev', '.next'].map((q) => root.querySelector(q).getAttribute('data-stay') === '1'),
    words: root.querySelector('.bar').textContent.replace(/\s+/g, ' ').trim(),
    clock: root.querySelector('.clock').getAttribute('data-run') === '1',
  };
});
const where = (page) => page.evaluate(() => location.pathname + location.search);
const seen = (page) => page.evaluate(() => window.seen.slice());
const press = async (page, ...keys) => { for (const k of keys) await page.keyboard.press(k); };

(async () => {
  console.log('The parts with no page');
  same('3 on a list of 8 pages goes at once', pure.digitStep('3', 8), 'go');
  same('3 on a list of 40 pages waits for another digit', pure.digitStep('3', 40), 'wait');
  same('35 on a list of 40 pages goes at once', pure.digitStep('35', 40), 'go');
  same('4 on a list of 40 pages waits (40 is a page)', pure.digitStep('4', 40), 'wait');
  same('a last page nobody knows always waits', pure.digitStep('9', 0), 'wait');
  same('35 is page 35', pure.typedPage('35', 40), 35);
  same('99 on a list of 40 pages is page 40', pure.typedPage('99', 40), 40);
  same('99 with no known last page is page 99', pure.typedPage('99', 0), 99);
  same('0 is no page', pure.typedPage('0', 8), null);
  same('last page from "1 2 3 4 ... 8"', pure.lastFromTexts(['1', '2', '3', '4', '...', '8', '']), 8);
  same('words and mixed text are not page numbers', pure.lastFromTexts(['Next', '12 items', 'Page 3', ' 5 ']), 5);
  same('"47 orders placed in" is 5 pages', pure.pagesFromCount('47 orders placed in', 10), 5);
  same('"1,204 orders" is 121 pages', pure.pagesFromCount(' 1,204 orders placed in ', 10), 121);
  same('"40 orders" is 4 pages', pure.pagesFromCount('40 orders', 10), 4);
  same('no count is 0', pure.pagesFromCount('orders placed in', 10), 0);
  same('page 1 of 8 shows 1 2 3 4 5 … 8', pure.pageSlots(1, 8), [1, 2, 3, 4, 5, '…', 8]);
  same('page 5 of 8 shows 1 … 4 5 6 7 8', pure.pageSlots(5, 8), [1, '…', 4, 5, 6, 7, 8]);
  same('page 12 of 25 shows first, the neighbours and last', pure.pageSlots(12, 25), [1, '…', 11, 12, 13, '…', 25]);
  same('a short list shows every page', pure.pageSlots(2, 5), [1, 2, 3, 4, 5]);
  ok('one list always gets the same number of slots', new Set(Array.from({ length: 25 }, (_, i) => pure.pageSlots(i + 1, 25).length)).size === 1);
  ok('the page on screen, the first and the last are always among them', Array.from({ length: 121 }, (_, i) => pure.pageSlots(i + 1, 121)).every((sl, i) => sl.includes(i + 1) && sl[0] === 1 && sl[sl.length - 1] === 121));
  same('a last page nobody knows: the pages around yours, then …', pure.pageSlots(6, 0), [1, '…', 5, 6, 7, '…']);
  const rows4 = [{ top: 633, pic: 661, bottom: 1139 }, { top: 1164, pic: 1192, bottom: 1670 }, { top: 1774, pic: 1802, bottom: 2296 }];
  same('row stops: each row in full with 72 px of the next row\'s pictures below it', pure.rowStops(rows4, 1068, 201, 72), [196, 806, 1252]);
  same('in a window too short for that, the row\'s top goes just under what the site pins to the top', pure.rowStops(rows4, 600, 201, 72)[0], 424);
  const rows8 = [{ top: 633, pic: 661, bottom: 1119 }, { top: 1466, pic: 1494, bottom: 2040, head: 1387 }, { top: 2065, pic: 2093, bottom: 2639 }, { top: 2743, pic: 2771, bottom: 3313, head: 2664 }];
  const stops8 = pure.rowStops(rows8, 1068, 203, 72);
  same('a row under a heading bar: the bar goes to the top of what the window shows', [stops8[1], stops8[3]], [1387 - 203 - 8, 2664 - 203 - 8]);
  same('a row with something between it and the next: the row in full, 120 px of what is above it', stops8[0], 633 - 203 - 8 - 120);
  same('a row with no bar over it keeps the peek of the next row', stops8[2], 2771 + 72 - 1068);
  same('after the last row, one more stop shows the site\'s page bar', pure.withFoot([196, 806, 1252], 2600, 1068, 3000, 1400), [196, 806, 1252, 1556]);
  same('a page bar a short way past the last row: one stop shows both', pure.withFoot([196, 806, 1252], 2400, 1068, 3000, 1400), [196, 806, 1356]);
  same('unless the last row would lose its top', pure.withFoot([196, 806, 1252], 2400, 1068, 3000, 1300), [196, 806, 1252, 1356]);
  same('a page bar near the bottom of the page: the stop is the bottom', pure.withFoot([196, 806, 1252], 2400, 1068, 1500, 1300), [196, 806, 1252, 1500]);
  same('no page bar: the rows alone, none past the bottom of the page', pure.withFoot([196, 806, 1252], null, 1068, 1000, 1300), [196, 806, 1000]);
  same('a move longer than the window gets even stops in between', pure.fillGaps([196, 806, 3000], 1000), [196, 806, 1537, 2269, 3000]);
  same('a list that starts far down the page: a stop on the way to it', pure.fillGaps([1500], 1000), [750, 1500]);
  same('past the last stop the steps shrink, then stop being ours', [500, 275, 151, 83].map(pure.taper), [275, 151, 83, 0]);
  same('Down from the top is the first stop; Up from it is none', [pure.nextStop([196, 806, 1252], 0, 1), pure.nextStop([196, 806, 1252], 196, -1)], [196, null]);
  same('Walmart page 3', pure.urlFor('https://www.walmart.com/my-items?page=2&x=1', 'page', 3, 1), 'https://www.walmart.com/my-items?page=3&x=1');
  same('Walmart page 1 from a bare address', pure.urlFor('https://www.walmart.com/my-items', 'page', 1, 1), 'https://www.walmart.com/my-items?page=1');
  same('Amazon page 35 is page=34', pure.urlFor('https://www.amazon.com/your-orders/orders?timeFilter=year-2024', 'page', 35, 0), 'https://www.amazon.com/your-orders/orders?timeFilter=year-2024&page=34');
  same('Walmart address with no page is page 1', pure.pageOf('https://www.walmart.com/my-items', 'page', 1), 1);
  same('Amazon page=0 is page 1', pure.pageOf('https://www.amazon.com/your-orders/orders?page=0', 'page', 0), 1);
  same('Amazon page=4 is page 5', pure.pageOf('https://www.amazon.com/your-orders/orders?page=4', 'page', 0), 5);
  same('a junk page value is page 1', pure.pageOf('https://www.walmart.com/my-items?page=abc', 'page', 1), 1);
  const takes = (f) => pure.takesKeys(f);
  ok('nothing focused: keys are ours', !takes(null));
  ok('a text input takes keys', takes({ tagName: 'INPUT', type: 'text' }) && takes({ tagName: 'INPUT', type: null }) && takes({ tagName: 'INPUT', type: 'search' }));
  ok('a number, range or radio input takes keys', takes({ tagName: 'INPUT', type: 'number' }) && takes({ tagName: 'INPUT', type: 'range' }) && takes({ tagName: 'INPUT', type: 'radio' }));
  ok('a checkbox or a button does not', !takes({ tagName: 'INPUT', type: 'checkbox' }) && !takes({ tagName: 'BUTTON' }) && !takes({ tagName: 'A' }));
  ok('a textarea, a select and an editable region take keys', takes({ tagName: 'TEXTAREA' }) && takes({ tagName: 'SELECT' }) && takes({ tagName: 'DIV', isContentEditable: true }));
  ok('a button inside a dialog or a menu takes keys', takes({ tagName: 'BUTTON', roles: ['dialog'] }) && takes({ tagName: 'A', roles: ['menuitem', 'menu'] }));
  ok('a link in a plain region does not', !takes({ tagName: 'A', roles: ['navigation', 'main'] }));

  const kind = process.env.BROWSER || 'chromium';
  const launch = { headless: true };
  if (process.env.CHROME_EXE) launch.executablePath = process.env.CHROME_EXE;
  const browser = await pw[kind].launch(launch);
  try {
    console.log('Walmart My Items (pages change without a reload)');
    let page = await open(browser, 'https://www.walmart.com/my-items');
    let u = await ui(page);
    ok('the bar lists 1 2 3 4 5 … 8 with page 1 marked', u.shown && u.pages === '1 2 3 4 5 … 8' && u.cur === 1, u);
    ok('and says nothing else: no words, no legend', u.words.replace(/\s/g, '') === '←12345…8→', u.words);
    const width1 = u.width;
    ok('Previous is off on page 1, Next is on', u.prevOff && !u.nextOff, u);
    await press(page, 'ArrowRight'); await sleep(500);
    ok('Right: page 2', (await where(page)) === '/my-items?page=2', await where(page));
    ok('through the site\'s own link, with no reload', await page.evaluate(() => window.loads === 1 && window.clicks === 1));
    u = await ui(page);
    ok('the bar marks page 2', u.cur === 2 && u.pages === '1 2 3 4 5 … 8' && !u.prevOff, u);
    ok('the key display showed →', JSON.stringify(u.keys) === '["→"]', u.keys);
    ok('and rose out of the right arrow key', u.from === 'next' && u.off[1] <= 2 && u.off[0] > 100, u);
    await press(page, 'ArrowLeft'); await sleep(500);
    ok('Left: back to page 1', (await where(page)) === '/my-items?page=1', await where(page));
    u = await ui(page);
    ok('that key display rose out of the left arrow key', JSON.stringify(u.keys) === '["←"]' && u.from === 'prev' && u.off[0] <= 2, u);
    await sleep(900);
    await press(page, 'ArrowLeft'); await sleep(100);
    u = await ui(page);
    ok('Left on page 1: stays, and the bar shakes', (await where(page)) === '/my-items?page=1' && u.bump, u);
    ok('no key rises: the left arrow swells in place on the bar', u.keys === null && u.stay[0] && !u.stay[1], u);
    await press(page, 'ArrowRight', 'ArrowRight'); await sleep(600);
    ok('Right twice, quickly: page 3', (await where(page)) === '/my-items?page=3', await where(page));
    await press(page, '5'); await sleep(40);
    ok('5 on a list of 8 pages goes at once', (await where(page)) === '/my-items?page=5', await where(page));
    await sleep(500);
    await press(page, '9'); await sleep(500);
    ok('9 on a list of 8 pages: the last page', (await where(page)) === '/my-items?page=8', await where(page));
    u = await ui(page);
    ok('on the last page the bar lists 1 … 4 5 6 7 8, and Next is off', u.pages === '1 … 4 5 6 7 8' && u.cur === 8 && u.nextOff, u);
    ok('the bar is as wide on page 8 as on page 1', u.width === width1, [u.width, width1]);
    await press(page, 'ArrowRight'); await sleep(100);
    ok('Right on the last page: stays', (await where(page)) === '/my-items?page=8' && (await ui(page)).bump);
    await press(page, '0'); await sleep(500);
    ok('a bare 0 does nothing', (await where(page)) === '/my-items?page=8');
    await press(page, '2'); await sleep(500);
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight'); await sleep(500);
    ok('a held Right arrow moves one page', (await where(page)) === '/my-items?page=3', await where(page));
    same('the site never saw the keys Speedy Pages used', (await seen(page)).filter((k) => /^(Arrow(Left|Right)|[1-9])$/.test(k)), []);
    same('it saw the bare 0', (await seen(page)).filter((k) => k === '0'), ['0']);

    console.log('Keys that have somewhere else to go');
    await page.evaluate(() => { window.seen.length = 0; });
    await page.focus('#box'); await press(page, '4', '2', 'ArrowLeft'); await sleep(500);
    ok('in a text box, digits and arrows type', (await where(page)) === '/my-items?page=3' && await page.evaluate(() => document.getElementById('box').value === '42'), await where(page));
    await page.focus('#pick'); await press(page, 'ArrowRight', '5'); await sleep(500);
    ok('a menu keeps its keys', (await where(page)) === '/my-items?page=3');
    await page.focus('#indialog'); await press(page, 'ArrowRight', '5'); await sleep(500);
    ok('so does anything inside a dialog', (await where(page)) === '/my-items?page=3');
    await page.focus('#plain');
    await page.keyboard.press('Meta+ArrowRight'); await page.keyboard.press('Control+5'); await page.keyboard.press('Alt+ArrowLeft'); await page.keyboard.press('Shift+ArrowRight'); await sleep(500);
    ok('Cmd, Ctrl, Alt and Shift presses are left alone', (await where(page)).endsWith('/my-items?page=3'), await where(page));
    await press(page, 'f', 'ArrowUp', 'Enter', 'Escape', 'Backspace'); await sleep(100);
    ok('other keys reach the site', (await seen(page)).filter((k) => ['f', 'ArrowUp', 'Enter', 'Escape', 'Backspace'].includes(k)).length === 5, await seen(page));
    await press(page, 'ArrowRight'); await sleep(500);
    ok('with a plain button focused, Right still turns the page', (await where(page)) === '/my-items?page=4', await where(page));
    await page.evaluate(() => document.activeElement.blur());

    console.log('The bar');
    await page.evaluate(() => window.__speedyPagesTest.root.querySelector('.num[data-page="1"]').click()); await sleep(500);
    ok('a page number on the bar goes to that page', (await where(page)) === '/my-items?page=1', await where(page));
    await page.evaluate(() => window.__speedyPagesTest.root.querySelector('.num[data-page="4"]').click()); await sleep(500);
    ok('and another goes back', (await where(page)) === '/my-items?page=4', await where(page));
    await page.evaluate(() => window.__speedyPagesTest.root.querySelector('.next').click()); await sleep(500);
    ok('its Next button turns the page', (await where(page)) === '/my-items?page=5', await where(page));
    await page.evaluate(() => window.__speedyPagesTest.root.querySelector('.prev').click()); await sleep(500);
    ok('its Previous button turns it back', (await where(page)) === '/my-items?page=4', await where(page));
    ok('it stays while the site\'s page bar is off screen', !(await ui(page)).away);
    await page.evaluate(() => document.querySelector('nav[aria-label="pagination"]').scrollIntoView()); await sleep(400);
    ok('it steps aside while the site\'s page bar is on screen', (await ui(page)).away);
    await press(page, 'ArrowRight'); await sleep(500);
    ok('and the keys still work then', (await where(page)) === '/my-items?page=5', await where(page));
    await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400);
    ok('it comes back when the site\'s page bar scrolls away', !(await ui(page)).away);
    await page.evaluate(() => window.leave()); await sleep(600);
    ok('leaving My Items takes the bar away', !(await ui(page)).shown);
    await page.evaluate(() => { window.seen.length = 0; }); await press(page, 'ArrowRight', '3'); await sleep(500);
    ok('and gives the keys back to the site', (await where(page)) === '/cart' && (await seen(page)).length === 2, await seen(page));
    await page.context().close();

    page = await open(browser, 'https://www.walmart.com/my-items', { pages: 1 });
    ok('a list with one page gets no bar', !(await ui(page)).shown);
    await press(page, 'ArrowRight'); await sleep(300);
    ok('and no keys', (await where(page)) === '/my-items' && (await seen(page)).includes('ArrowRight'));
    await page.context().close();

    page = await open(browser, 'https://www.walmart.com/my-items?page=2', { pages: 40 });
    await press(page, '3', '5'); await sleep(40);
    ok('3 then 5 on a list of 40 pages: page 35', (await where(page)) === '/my-items?page=35', await where(page));
    await sleep(600);
    await press(page, '3'); await sleep(150);
    u = await ui(page);
    ok('3 alone: waits, shows the key and runs the clock', (await where(page)) === '/my-items?page=35' && JSON.stringify(u.keys) === '["3"]' && u.clock, u);
    ok('a typed number rises out of the page numbers, between the arrows', u.from === 'mid' && u.off[0] > 60 && u.off[1] > 60, u);
    await sleep(500);
    ok('then goes to page 3 after 0.4 s', (await where(page)) === '/my-items?page=3', await where(page));
    await sleep(300);
    await press(page, '1'); await sleep(550); await press(page, '2'); await sleep(550);
    ok('1, a pause, 2: page 1 and then page 2', (await where(page)) === '/my-items?page=2', await where(page));
    await sleep(300);
    await press(page, '1', '7', 'Enter'); await sleep(40);
    ok('Enter goes without the wait', (await where(page)) === '/my-items?page=17', await where(page));
    await sleep(900);
    await press(page, '2', 'Backspace', '3'); await sleep(150);
    ok('Backspace takes a digit back (2, Backspace, 3 shows 3)', JSON.stringify((await ui(page)).keys) === '["3"]', await ui(page));
    await sleep(450);
    ok('and goes to page 3', (await where(page)) === '/my-items?page=3', await where(page));
    await sleep(900);
    await press(page, '3', 'Escape'); await sleep(600);
    ok('Escape drops what was typed', (await where(page)) === '/my-items?page=3' && (await ui(page)).keys === null, await where(page));
    await press(page, '4', '5'); await sleep(40);
    ok('45 on a list of 40 pages: page 40', (await where(page)) === '/my-items?page=40', await where(page));
    await page.context().close();

    console.log('Tapping fast');
    const taps = async (pg, key, n, gap) => { for (let i = 0; i < n; i++) { await pg.keyboard.press(key); await sleep(gap); } };
    page = await open(browser, 'https://www.walmart.com/my-items', { pages: 40 });
    await taps(page, 'ArrowRight', 5, 50); await sleep(100);
    ok('five Rights 50 ms apart: the bar is on page 6 before the page has caught up', (await ui(page)).cur === 6, await ui(page));
    await sleep(900);
    ok('and page 6 is where it lands', (await where(page)) === '/my-items?page=6', await where(page));
    const changes = await page.evaluate(() => [Number(sessionStorage.getItem('wm.clicks') || 0), Number(sessionStorage.getItem('wm.pops') || 0), Number(sessionStorage.getItem('wm.loads')) - 1]);
    ok('the site was told at each tap, with no wait for the tapping to stop, and never by a page load', changes[0] + changes[1] >= 3 && changes[2] === 0, changes);
    await sleep(700);
    const t0 = await page.evaluate(() => { window.told = 0; const n = Number(sessionStorage.getItem('wm.clicks') || 0) + Number(sessionStorage.getItem('wm.pops') || 0); window.before = n; return n; });
    await press(page, 'ArrowRight'); await sleep(30);
    ok('a tap a moment after a burst reaches the site within 30 ms', await page.evaluate(() => Number(sessionStorage.getItem('wm.clicks') || 0) + Number(sessionStorage.getItem('wm.pops') || 0) > window.before), t0);
    await sleep(600); await press(page, 'ArrowLeft'); await sleep(500);
    await taps(page, 'ArrowLeft', 3, 60); await sleep(1000);
    ok('three Lefts 60 ms apart: page 3', (await where(page)) === '/my-items?page=3', await where(page));
    await page.context().close();

    console.log('Up and Down, a row at a time');
    page = await open(browser, 'https://www.walmart.com/my-items', { pages: 8, noShop: true });
    const at = () => page.evaluate(() => Math.round(window.scrollY));
    const geo = await page.evaluate(() => { const y = window.scrollY; const t = [...document.querySelectorAll('[data-item-id]')]; return [0, 4, 8, 12, 16].map((i) => Math.round(t[i].getBoundingClientRect().top + y)); });
    const stop = (i) => (i === 0 ? geo[1] + 28 + 72 - 720 : geo[i] - 196);
    await press(page, 'ArrowDown'); await sleep(120);
    u = await ui(page);
    ok('a small ↓ shows above the bar, in the middle', JSON.stringify(u.keys) === '["↓"]' && u.from === 'row', u);
    await sleep(650);
    ok('Down: the first row in full, with 72 px of the next row\'s pictures showing below', (await at()) === stop(0), [await at(), stop(0), geo]);
    await press(page, 'ArrowDown'); await sleep(750);
    ok('Down again: one row further', (await at()) === stop(1), [await at(), stop(1)]);
    await press(page, 'ArrowDown', 'ArrowDown'); await sleep(800);
    ok('two quick Downs: two rows further', (await at()) === stop(3), [await at(), stop(3)]);
    await press(page, 'ArrowUp'); await sleep(750);
    ok('Up: back one row', (await at()) === stop(2), [await at(), stop(2)]);
    ok('the page never saw those keys', !(await seen(page)).some((k) => k === 'ArrowDown' || k === 'ArrowUp'), await seen(page));
    await press(page, 'ArrowUp', 'ArrowUp'); await sleep(850);
    const firstStop = await page.evaluate(() => Math.max(0, Math.round(document.querySelector('[data-item-id]').getBoundingClientRect().bottom + window.scrollY + 24 - window.innerHeight)));
    ok('two Ups: the first row, at the top of the page', Math.abs((await at()) - firstStop) <= 1 && firstStop < 16, [await at(), firstStop]);
    await press(page, 'ArrowUp'); await sleep(200);
    ok('at the top, Up is the browser\'s key again', (await seen(page)).filter((k) => k === 'ArrowUp').length === 1, await seen(page));
    await page.focus('#box'); await press(page, 'ArrowDown'); await sleep(300);
    ok('in a text box, Down is left alone', (await at()) === 0 && (await seen(page)).includes('ArrowDown'), [await at(), await seen(page)]);
    await page.evaluate(() => document.activeElement.blur());
    const navAt = () => page.evaluate(() => { const n = document.querySelector('nav[aria-label="pagination"]').getBoundingClientRect(); return { y: Math.round(window.scrollY), navTop: Math.round(n.top), navBottom: Math.round(n.bottom), h: window.innerHeight }; });
    for (let i = 0; i < 5; i++) { await press(page, 'ArrowDown'); await sleep(560); }
    ok('five Downs: the last row', (await at()) === stop(4), [await at(), stop(4)]);
    await press(page, 'ArrowDown'); await sleep(750);
    let end = await navAt();
    ok('Down after the last row: the site\'s page numbers come into view', end.y > stop(4) && end.navTop >= 0 && end.navBottom <= end.h, [end, stop(4)]);
    await press(page, 'ArrowUp'); await sleep(750);
    ok('Up from there: back on the last row', (await at()) === stop(4), [await at(), stop(4)]);
    await press(page, 'ArrowUp'); await sleep(750);
    ok('and Up again: the row before it', (await at()) === stop(3), [await at(), stop(3)]);
    await page.evaluate(() => { const gap = document.createElement('div'); gap.style.height = '300px'; document.getElementById('app').before(gap);
      const f = document.createElement('div'); f.style.height = '3000px'; f.textContent = 'footer'; document.body.append(f); });
    await press(page, 'ArrowDown'); await sleep(750);
    ok('with more page below, Down still lands on the last row first', (await at()) === stop(4), [await at(), stop(4)]);
    await press(page, 'ArrowDown'); await sleep(750);
    end = await navAt();
    const foot = end.y;
    ok('then on the site\'s page numbers', foot > stop(4) + 160 && end.navBottom <= end.h && end.navBottom >= end.h - 30, [end, stop(4)]);
    const want = [];
    for (let v = pure.taper(Math.min(foot - stop(4), 720 * 0.6)); v; v = pure.taper(v)) want.push(v);
    const before = (await seen(page)).filter((k) => k === 'ArrowDown').length;
    const sizes = [];
    for (let i = 0, y = foot; i < want.length; i++) { await press(page, 'ArrowDown'); await sleep(600); const now = await at(); sizes.push(now - y); y = now; }
    ok('Down past the last stop: each step a little over half the one before', want.length >= 3 && sizes.every((v, i) => Math.abs(v - want[i]) <= 1), [sizes, want]);
    ok('those were ours, not the page\'s', (await seen(page)).filter((k) => k === 'ArrowDown').length === before, await seen(page));
    await press(page, 'ArrowDown'); await sleep(400);
    ok('then Down is the browser\'s key again', (await seen(page)).filter((k) => k === 'ArrowDown').length === before + 1, await seen(page));
    await press(page, 'ArrowUp'); await sleep(750);
    ok('Up from a little below the list: back on the last stop', (await at()) === foot, [await at(), foot]);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(100);
    const ups = (await seen(page)).filter((k) => k === 'ArrowUp').length;
    await press(page, 'ArrowUp'); await sleep(300);
    ok('Up from far below the list is the browser\'s key', (await seen(page)).filter((k) => k === 'ArrowUp').length === ups + 1, await seen(page));
    await page.context().close();

    page = await open(browser, 'https://www.walmart.com/my-items', { pages: 8, noShop: true });
    const bar = await page.evaluate(() => { const grid = document.getElementById('grid'); const tiles = [...grid.children];
      const head = document.createElement('div'); head.id = 'head'; head.textContent = 'Snacks (9)'; head.style.cssText = 'height:63px;margin-top:25px;background:#ddd';
      const second = grid.cloneNode(false); second.id = 'grid2'; second.style.marginTop = '16px'; tiles.slice(8).forEach((t) => second.append(t));
      grid.after(head, second);
      const y = window.scrollY, top = (n) => Math.round(n.getBoundingClientRect().top + y);
      return { head: top(head), rows: [0, 4, 8, 12, 16].map((i) => top(tiles[i])) }; });
    const trail = [];
    for (let i = 0; i < 4; i++) { await press(page, 'ArrowDown'); await sleep(620); trail.push(await page.evaluate(() => Math.round(window.scrollY))); }
    same('a row with no bar over it: the usual stop', trail[1], bar.rows[1] - 196);
    same('the row under the bar: the bar sits at the top, just under the site\'s header', trail[2], bar.head - 120 - 8);
    same('and the row after it: the usual stop again', trail[3], bar.rows[3] - 196);
    await press(page, 'ArrowUp'); await sleep(750);
    same('Up: back to the bar', await page.evaluate(() => Math.round(window.scrollY)), bar.head - 120 - 8);
    await page.context().close();

    page = await open(browser, 'https://www.walmart.com/my-items', { pages: 1, noShop: true });
    await press(page, 'ArrowDown'); await sleep(750);
    ok('a list with one page has no bar, and Up and Down still step its rows', !(await ui(page)).barShown && (await page.evaluate(() => Math.round(window.scrollY))) === stop(0), [await ui(page), stop(0)]);
    await page.context().close();

    page = await open(browser, 'https://www.walmart.com/my-items', { pages: 40, skeleton: 700 });
    await press(page, 'ArrowRight'); await sleep(250);
    ok('while the page loads the site takes its page numbers down', await page.evaluate(() => !document.querySelector('nav[aria-label="pagination"]')));
    u = await ui(page);
    ok('the bar stays, on page 2 of the same list', u.shown && u.cur === 2 && u.pages === '1 2 3 4 5 … 40', u);
    await press(page, 'ArrowRight'); await sleep(120); await press(page, 'ArrowRight'); await sleep(100);
    ok('and Right still counts while it loads: the bar is on page 4', (await ui(page)).cur === 4, await ui(page));
    await sleep(1600);
    ok('page 4 is where it lands', (await where(page)) === '/my-items?page=4' && (await ui(page)).cur === 4, [await where(page), await ui(page)]);
    ok('with no page load: the pages were opened in place though the site had no link up', await page.evaluate(() => window.loads === 1 && window.pops >= 1), await page.evaluate(() => [window.loads, window.pops]));
    await press(page, '1', '2'); await sleep(250); await press(page, 'ArrowRight'); await sleep(1700);
    ok('a typed 12, then Right while page 12 loads: page 13', (await where(page)) === '/my-items?page=13', await where(page));
    await page.context().close();

    page = await open(browser, 'https://www.walmart.com/my-items?page=5', { pages: 8, skeleton: 700 });
    await taps(page, 'ArrowRight', 9, 60); await sleep(150);
    ok('nine fast Rights from page 5 of 8: the bar stops on page 8', (await ui(page)).cur === 8 && (await ui(page)).nextOff, await ui(page));
    await sleep(1600);
    ok('and page 8 is where it lands, never a page past the last', (await where(page)) === '/my-items?page=8', await where(page));
    await taps(page, 'ArrowLeft', 3, 60); await sleep(1700);
    ok('three fast Lefts straight after: page 5', (await where(page)) === '/my-items?page=5', await where(page));
    ok('all of it in the one page, never a reload', await page.evaluate(() => window.loads === 1));
    await page.goBack(); await sleep(1200);
    ok('the browser\'s Back button still goes back a page', /page=[678]/.test(await where(page)) && (await ui(page)).cur === Number((await where(page)).split('page=')[1]), [await where(page), await ui(page)]);
    await page.context().close();

    page = await open(browser, 'https://www.amazon.com/your-orders/orders', { orders: 400, slow: 450, wait: 1500 });
    await taps(page, 'ArrowRight', 4, 55); await sleep(1700);
    ok('Amazon: four Rights 55 ms apart land on page 5 (page=4)', (await where(page)) === '/your-orders/orders?page=4', await where(page));
    await page.context().close();
    page = await open(browser, 'https://www.amazon.com/your-orders/orders?page=4', { orders: 400, late: 1600 });
    await sleep(1200);
    await press(page, 'ArrowRight'); await sleep(700); await press(page, 'ArrowRight'); await sleep(2600);
    ok('Right, then Right again before the page bar is back: page 7', (await where(page)) === '/your-orders/orders?page=6', await where(page));
    await page.context().close();

    console.log('The ring: from card to card, and the store\'s buttons by key');
    page = await open(browser, 'https://www.walmart.com/my-items', { pages: 8 });
    {
      const at = () => page.evaluate(() => Math.round(window.scrollY));
      const geo = await page.evaluate(() => { const y = window.scrollY; const t = [...document.querySelectorAll('[data-item-id]')]; return [0, 4, 8, 12, 16].map((i) => Math.round(t[i].getBoundingClientRect().top + y)); });
      const stop = (i) => (i === 0 ? geo[1] + 28 + 72 - 720 : geo[i] - 196);
      const ringOf = () => page.evaluate(() => { const root = window.__speedyPagesTest.root; const layer = root.querySelector('.layer'); if (layer.hidden) return null;
        const el = root.querySelector('.ring'); const r = el.getBoundingClientRect(); const badge = root.querySelector('.badge'); const hint = root.querySelector('.hint');
        const on = [...document.querySelectorAll('[data-item-id]')].findIndex((c) => { const b = c.getBoundingClientRect(); return Math.abs(b.left - 6 - r.left) < 3 && Math.abs(b.top - 6 - r.top) < 3 && Math.abs(b.width + 12 - r.width) < 3; });
        return { on, open: el.getAttribute('data-kind') === 'open', badge: badge.hidden ? null : badge.textContent, waiting: !badge.hidden && badge.getAttribute('data-waiting') === '1', hint: hint && !hint.hidden ? hint.textContent : null,
          dashed: getComputedStyle(root.querySelector('.band')).borderTopStyle }; });
      const cart = () => page.evaluate(() => JSON.stringify(window.cart));
      ok('no ring until a key asks for one', (await ringOf()) === null, await ringOf());
      await press(page, 'ArrowDown'); await sleep(700);
      let r = await ringOf();
      ok('Down: a dashed ring on the first card; the row shows in full already, so the page stays where it is', r && r.on === 0 && !r.open && r.dashed === 'dashed' && (await at()) === 0, [r, await at()]);
      ok('the hint beside Add shows the key that presses it', r && r.hint === '↵' && r.badge === null, r);
      ok('the page never saw that key', !(await seen(page)).includes('ArrowDown'), await seen(page));
      await press(page, 'ArrowRight'); await sleep(350);
      r = await ringOf();
      ok('Right: the next card in the row, and the page does not move or turn', r && r.on === 1 && (await at()) === 0 && (await ui(page)).cur === 1, [r, await at()]);
      await press(page, 'ArrowDown'); await sleep(700);
      r = await ringOf();
      ok('Down: the card under it, and the page follows to that row\'s stop', r && r.on === 5 && (await at()) === stop(1), [r, await at(), stop(1)]);
      await press(page, 'Enter'); await sleep(30);
      r = await ringOf();
      ok('Enter: the ring turns solid and the badge says 1 at once, marked as not yet the store\'s', r && r.open && r.dashed === 'solid' && r.badge === '1' && r.waiting, r);
      await sleep(400);
      r = await ringOf();
      ok('the store has it: one in the cart, the badge solid, the hint now Down and Up', (await cart()) === '{"i5":1}' && r.badge === '1' && !r.waiting && r.hint === '↓↑', [await cart(), r]);
      await press(page, 'ArrowUp', 'ArrowUp'); await sleep(30);
      r = await ringOf();
      ok('Up twice while open: the badge says 3 before the store does, and the ring stays put', r.on === 5 && r.badge === '3' && r.waiting, r);
      await sleep(900);
      r = await ringOf();
      ok('the store caught up, press by press: 3 in the cart', (await cart()) === '{"i5":3}' && !r.waiting, [await cart(), await page.evaluate(() => window.presses.join(' '))]);
      await press(page, 'ArrowDown'); await sleep(500);
      ok('Down while open: one fewer', (await cart()) === '{"i5":2}', await cart());
      await press(page, 'Enter'); await sleep(100);
      r = await ringOf();
      ok('Enter again: the count closes, nothing more is added, the ring is dashed', r.on === 5 && !r.open && r.dashed === 'dashed' && (await cart()) === '{"i5":2}' && r.hint === '-=', [r, await cart()]);
      await press(page, 'ArrowDown'); await sleep(700);
      r = await ringOf();
      ok('Down now moves the ring again', r.on === 9 && (await at()) === stop(2), [r, await at(), stop(2)]);
      await press(page, '='); await sleep(400);
      r = await ringOf();
      ok('= adds one with no Enter first, and the count stays closed', (await cart()) === '{"i5":2,"i9":1}' && !r.open && r.badge === '1', [await cart(), r]);
      await press(page, '='); await press(page, '='); await sleep(700);
      ok('= twice more: 3', JSON.parse(await cart()).i9 === 3, await cart());
      await press(page, '-'); await sleep(400);
      ok('- takes one off', JSON.parse(await cart()).i9 === 2, await cart());
      await press(page, 'Tab'); await sleep(350);
      r = await ringOf();
      ok('Tab: the next card', r.on === 10, r);
      await press(page, 'Shift+Tab'); await sleep(350);
      ok('Shift+Tab: back', (await ringOf()).on === 9, await ringOf());
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await sleep(900);
      r = await ringOf();
      ok('Undo: the item goes back to what it was before that run of presses (2 back to 0), however many taps it took', (await cart()) === '{"i5":2}' && r.on === 9, [await cart(), r]);
      await page.keyboard.press('Control+z'); await sleep(1200);
      r = await ringOf();
      ok('Undo again: the item before it goes back too, and the ring goes to it', (await cart()) === '{}' && r.on === 5 && (await at()) === stop(1), [await cart(), r, await at()]);
      await press(page, 'Enter'); await sleep(300);
      await press(page, '4'); await sleep(900);
      ok('a number while the count is open sets the count', (await cart()) === '{"i5":4}' && (await ui(page)).cur === 1, [await cart(), await ui(page)]);
      await press(page, '9'); await sleep(900);
      r = await ringOf();
      ok('a count the store will not take (it stops at 6): the badge ends on what the store has', (await cart()) === '{"i5":6}' && r.badge === '6' && !r.waiting, [await cart(), r]);
      await press(page, '2'); await sleep(900);
      await page.evaluate(() => { window.slip = true; });
      await press(page, 'ArrowUp'); await sleep(300);
      const shown = JSON.parse(await cart()).i5;
      await sleep(1500);
      ok('a press the store shows and then drops is pressed again', shown === 3 && JSON.parse(await cart()).i5 === 3 && (await page.evaluate(() => window.presses.filter((x) => x === 'i5:+').length)) >= 2, [shown, await cart(), await page.evaluate(() => window.presses.join(' '))]);
      await press(page, '6'); await sleep(900);
      await press(page, 'Escape'); await sleep(100);
      ok('Escape closes the count; the ring stays', (await ringOf()).on === 5 && !(await ringOf()).open, await ringOf());
      await press(page, '3'); await sleep(900);
      ok('a number with the count closed is a page number', (await ui(page)).cur === 3 && (await cart()) === '{"i5":6}', [await ui(page), await cart()]);
      await press(page, 'Escape'); await sleep(100);
      ok('Escape again: no ring', (await ringOf()) === null, await ringOf());
      await press(page, 'ArrowRight'); await sleep(700);
      ok('with no ring, Right turns the page again', (await ui(page)).cur === 4, await ui(page));
      await press(page, 's'); await sleep(100);
      ok('s puts the cursor in the store\'s search box', await page.evaluate(() => document.activeElement && document.activeElement.id === 'box'));
      await press(page, 'c', 'ArrowDown', '='); await sleep(300);
      ok('and keys typed there are the search box\'s', (await page.evaluate(() => document.getElementById('box').value)) === 'c=' && (await ringOf()) === null, await page.evaluate(() => document.getElementById('box').value));
      await page.evaluate(() => { const b = document.getElementById('box'); b.value = ''; b.blur(); for (const el of [b, document.getElementById('cartbtn')]) el.style.cssText = 'position:fixed;top:4px;z-index:9;left:' + (el === b ? 8 : 260) + 'px'; });
      await press(page, 'ArrowDown'); await sleep(400);
      const tops = () => page.evaluate(() => [...window.__speedyPagesTest.root.querySelectorAll('.hint')].filter((h) => !h.hidden && h.getClientRects().length && /^[sc]$/.test(h.textContent)).map((h) => h.textContent).sort().join(' '));
      ok('with the ring on, the search box shows s and the cart button shows c', (await tops()) === 'c s', await tops());
      await press(page, 'c'); await sleep(200);
      ok('c presses the store\'s own cart button', (await page.evaluate(() => window.__cartOpened)) === 1, await page.evaluate(() => window.__cartOpened));
      await press(page, 'Escape'); await sleep(200);
      ok('no ring, no keys shown', (await tops()) === '', await tops());
      await page.evaluate(() => document.activeElement.blur());
      await press(page, 'Tab'); await sleep(500);
      for (let i = 0; i < 19; i++) await press(page, 'Tab');
      await sleep(700);
      r = await ringOf();
      ok('Tab through to the last card', r.on === 19, r);
      await press(page, 'Tab'); await sleep(900);
      ok('Tab past the last card: the next page', (await ui(page)).cur === 5, await ui(page));
      await page.context().close();
    }

    console.log('A tall window, the ring and the page as one move, the Enter keycap, the mouse on the store\'s buttons');
    {
      const pg = await open(browser, 'https://www.walmart.com/my-items', { pages: 8 });
      await pg.setViewportSize({ width: 1280, height: 1500 }); await sleep(500);
      const at = () => pg.evaluate(() => Math.round(window.scrollY));
      const snap = () => pg.evaluate(() => { const r = window.__speedyPagesTest.root.querySelector('.ring').getBoundingClientRect(); const t = [...document.querySelectorAll('[data-item-id]')];
        const i = t.findIndex((c) => { const b = c.getBoundingClientRect(); return Math.abs(b.left - 6 - r.left) < 3 && Math.abs(b.top - 6 - r.top) < 3; });
        return { row: i < 0 ? -1 : Math.floor(i / 4), y: window.scrollY, ring: r.top + window.scrollY }; });
      await press(pg, 'ArrowDown'); await sleep(600);
      await press(pg, 'ArrowDown'); await sleep(600);
      let s = await snap();
      ok('two rows show in full: Down to the second moves the ring and leaves the page where it is', s.row === 1 && s.y === 0, s);
      await press(pg, 'ArrowUp'); await sleep(500);
      s = await snap();
      ok('Up to the row above, also in view: the page stays', s.row === 0 && s.y === 0, s);
      await press(pg, 'ArrowDown'); await sleep(500);
      await press(pg, 'ArrowDown'); await sleep(800);
      s = await snap();
      const y2 = s.y;
      const whole = await pg.evaluate(() => { const b = document.querySelectorAll('[data-item-id]')[8].getBoundingClientRect(); return b.top >= 120 && b.bottom <= window.innerHeight; });
      ok('Down to a row below the window: the page moves, and that row shows in full', s.row === 2 && y2 > 0 && whole, [s, whole]);
      await press(pg, 'ArrowUp'); await sleep(500);
      s = await snap();
      ok('Up again, to a row still in view: the page stays', s.row === 1 && Math.round(s.y) === Math.round(y2), [s, y2]);
      await press(pg, 'ArrowDown'); await sleep(500);
      const a = await snap();
      await press(pg, 'ArrowDown'); await sleep(130);
      const mid = await snap();
      await sleep(700);
      const b = await snap();
      const pageDone = (mid.y - a.y) / (b.y - a.y);
      const ringDone = (mid.ring - a.ring) / (b.ring - a.ring);
      ok('when the page has to move, the ring and the page travel together (one move, never ring first and page after)', b.row === 3 && b.y > a.y && pageDone > 0.05 && pageDone < 0.98 && Math.abs(pageDone - ringDone) < 0.2, [pageDone, ringDone, a, mid, b]);
      const key = await pg.evaluate(() => { const k = window.__speedyPagesTest.root.querySelector('.layer .hint:not([hidden]) .k'); const add = document.querySelectorAll('[data-item-id]')[12].querySelector('button[data-automation-id="add-to-cart"]');
        return k && add ? { word: k.getAttribute('data-word'), name: getComputedStyle(k, '::before').content, h: Math.round(k.getBoundingClientRect().height), button: Math.round(add.getBoundingClientRect().height), light: getComputedStyle(k).backgroundImage.includes('255, 255, 255') } : null; });
      ok('beside Add, Enter is a light keycap with its name on it, as tall as the button (within 24 to 40 px)', key && key.word === 'enter' && key.name.includes('enter') && key.light && key.h === Math.max(24, Math.min(40, key.button)), key);
      await press(pg, 'Enter'); await sleep(600);
      const card = pg.locator('[data-item-id]').nth(12);
      if (await card.locator('button[data-testid="quantity-in-cart"]').count()) { await card.locator('button[data-testid="quantity-in-cart"]').click(); await sleep(200); }
      await card.locator('button[aria-label^="Increase quantity"]').click(); await sleep(1600);
      const total = await pg.evaluate(() => Object.values(window.cart).reduce((x, y) => x + y, 0));
      ok('a click on the store\'s own plus stands: one from Enter, one from the mouse, and nothing presses it back', total === 2, [total, await pg.evaluate(() => JSON.stringify(window.presses))]);
      await pg.context().close();
    }

    console.log('The cart and checkout: delivery times, items, the pop-up, Place order');
    {
      const ringOf = (pg) => pg.evaluate(() => { const root = window.__speedyPagesTest.root; const layer = root.querySelector('.layer'); if (layer.hidden) return null;
        const el = root.querySelector('.ring'); const r = el.getBoundingClientRect(); const badge = root.querySelector('.badge'); const band = getComputedStyle(root.querySelector('.band'));
        const hit = [...document.querySelectorAll('button, li, [data-testid^="dual-nudge"]')].reverse().find((c) => { const b = c.getBoundingClientRect(); return b.width && Math.abs(b.left - 6 - r.left) < 3 && Math.abs(b.top - 6 - r.top) < 3 && Math.abs(b.width + 12 - r.width) < 3; });
        return { on: hit ? hit.dataset.n || hit.getAttribute('data-automation-id') || hit.getAttribute('data-testid') || hit.textContent.trim() : null, kind: el.getAttribute('data-kind'), border: band.borderTopStyle, outline: band.outlineStyle,
          badge: badge.hidden ? null : badge.textContent, hints: [...root.querySelectorAll('.hint')].filter((h) => !h.hidden).map((h) => h.textContent).sort().join(' ') }; });
      const logOf = (pg) => pg.evaluate(() => JSON.parse(sessionStorage.getItem('wm.log') || '[]').join(' '));
      const count = (pg, n) => pg.evaluate((name) => { const li = document.querySelector('li[data-n="' + name + '"]'); return li ? parseInt(li.querySelector('[data-testid="quantity-label"]').textContent, 10) : null; }, n);
      page = await open(browser, 'https://www.walmart.com/cart');
      let r = await ringOf(page);
      ok('the cart opens with a dashed ring on the first free delivery time', r && r.on === 'cart-slot-shortcut-slot-2' && r.kind === 'here' && r.border === 'dashed', r);
      ok('Continue to checkout shows its key, c', r && r.hints === 'c s', r);
      await press(page, 'ArrowRight'); await sleep(300);
      ok('Right: the next delivery time', (await ringOf(page)).on === 'cart-slot-shortcut-slot-3', await ringOf(page));
      await press(page, 'ArrowLeft', 'ArrowLeft'); await sleep(300);
      ok('Left twice: a paid one can be ringed too', (await ringOf(page)).on === 'cart-slot-shortcut-slot-1', await ringOf(page));
      await press(page, '='); await sleep(200);
      ok('= on a delivery time changes nothing', (await logOf(page)) === '', await logOf(page));
      await press(page, 'ArrowDown'); await sleep(700);
      r = await ringOf(page);
      ok('Down: the first item, with a key over each of its buttons', r.on === 'Bread' && r.hints === '- = L R c s', r);
      await press(page, '='); await sleep(300);
      ok('= adds one', (await count(page, 'Bread')) === 2 && (await ringOf(page)).badge === '2', [await count(page, 'Bread'), await ringOf(page)]);
      await press(page, 'Enter'); await sleep(300);
      r = await ringOf(page);
      ok('Enter: one more, and the count opens (solid ring, Down and Up over the buttons)', (await count(page, 'Bread')) === 3 && r.kind === 'open' && r.border === 'solid' && r.hints === 'L R c s ↑ ↓', [await count(page, 'Bread'), r]);
      await press(page, 'ArrowDown'); await sleep(300);
      ok('Down while open: one fewer', (await count(page, 'Bread')) === 2, await count(page, 'Bread'));
      await press(page, 'Escape', 'ArrowDown'); await sleep(700);
      ok('Escape closes the count and Down moves on', (await ringOf(page)).on === 'Milk' && (await count(page, 'Bread')) === 2, await ringOf(page));
      await press(page, 'l'); await sleep(500);
      r = await ringOf(page);
      ok('L saves the item for later; the ring takes the item that moved into its place', (await logOf(page)) === 'save:Milk' && r.on === 'Eggs', [await logOf(page), r]);
      await press(page, 'r'); await sleep(500);
      r = await ringOf(page);
      ok('R removes the item; the ring goes to the one left', (await logOf(page)) === 'save:Milk remove:Eggs' && r.on === 'Bread', [await logOf(page), r]);
      await page.keyboard.press('Control+z'); await sleep(400);
      ok('Undo presses the store\'s own Undo while it shows one', (await logOf(page)) === 'save:Milk remove:Eggs undo' && (await count(page, 'Eggs')) === 1, await logOf(page));
      await press(page, 'ArrowUp'); await sleep(700);
      r = await ringOf(page);
      ok('Up from the first item: back on the delivery times', r && /^cart-slot-shortcut-slot-/.test(r.on), r);
      for (let i = 0; i < 4; i++) await press(page, 'ArrowLeft');
      for (let i = 0; i < 3; i++) await press(page, 'ArrowRight');
      await sleep(300);
      r = await ringOf(page);
      ok('Left to the first delivery time and Right three times: the last one', r.on === 'cart-slot-shortcut-slot-3', r);
      await press(page, 'Enter'); await sleep(60);
      await press(page, 'Enter', 'ArrowDown', '='); await sleep(150);
      ok('Enter on a delivery time presses it once; while the store\'s dark tint is up, keys press nothing', (await logOf(page)).endsWith('undo slot:3') && (await count(page, 'Bread')) === 2, [await logOf(page), await count(page, 'Bread')]);
      ok('the ring on a delivery time is only ever dashed (the time is the store\'s to give), and it hides while the store works', r.kind === 'here' && r.border === 'dashed' && (await ringOf(page)) === null, [r, await ringOf(page)]);
      await sleep(2000);
      r = await ringOf(page);
      ok('the store took the time and the squares went: the ring moves to the first item', r && r.on === 'Bread', r);
      await press(page, 'c'); await sleep(900);
      r = await ringOf(page);
      ok('c presses Continue to checkout; the pop-up opens with the ring on the choice that costs nothing', (await logOf(page)).endsWith('go:Continue to checkout') && r && r.on === 'No thanks' && r.border === 'dashed', [await logOf(page), r]);
      await press(page, 'ArrowLeft'); await sleep(300);
      ok('Left: Reserve can be ringed', (await ringOf(page)).on === 'Reserve', await ringOf(page));
      await press(page, 'ArrowUp'); await sleep(300);
      r = await ringOf(page);
      ok('Up: a paid delivery choice', r && /^dual-nudge-/.test(r.on), r);
      await press(page, 'ArrowDown'); await sleep(300);
      await press(page, 'c'); await sleep(1700);
      ok('c in the pop-up takes the free choice, wherever the ring is, and checkout opens', (await logOf(page)).includes('dialog:No thanks') && !(await logOf(page)).includes('Reserve') && (await page.evaluate(() => location.pathname)) === '/checkout/review-order', [await logOf(page), await page.evaluate(() => location.pathname)]);
      r = await ringOf(page);
      ok('checkout: "Leave at my door" is chosen without a key', (await logOf(page)).includes('door:LEAVE_AT_DOOR') && (await page.evaluate(() => document.querySelector('[data-testid="delivery-option-LEAVE_AT_DOOR"]').getAttribute('aria-label'))) === 'Leave at my door, selected', await logOf(page));
      ok('Place order wears the double ring (solid inside, dashed outside) and shows Enter', r && r.on === 'place-order-button' && r.kind === 'spend' && r.border === 'solid' && r.outline === 'dashed' && r.hints === '↵', r);
      await sleep(1200);
      await press(page, 'Escape'); await sleep(100); await press(page, 'Escape'); await sleep(700);
      r = await ringOf(page);
      ok('Escape presses the store\'s Back once, however often it is pressed; its "are you sure" opens with the ring on staying', (await logOf(page)).split(' ').filter((x) => x === 'back').length === 1 && r && r.on === 'Keep checking out', [await logOf(page), r]);
      await press(page, 'Enter'); await sleep(700);
      r = await ringOf(page);
      ok('Enter keeps checking out, and the ring is back on Place order', (await logOf(page)).endsWith('dialog:Keep checking out') && r && r.on === 'place-order-button', [await logOf(page), r]);
      ok('nothing has been placed', !(await logOf(page)).includes('placed'), await logOf(page));
      await press(page, 'ArrowDown'); await sleep(400);
      ok('Down: the delivery choice', /^delivery-option-/.test((await ringOf(page)).on), await ringOf(page));
      await press(page, 'ArrowUp'); await sleep(200);
      await press(page, 'Enter'); await sleep(200);
      ok('Enter the moment the ring lands on Place order does nothing', !(await logOf(page)).includes('placed'), await logOf(page));
      await sleep(1100);
      await press(page, 'Enter'); await sleep(200);
      ok('Enter once it has sat there a second places the order', (await logOf(page)).endsWith('placed'), await logOf(page));
      await press(page, 'Enter'); await sleep(200);
      ok('a second Enter straight after places nothing more', (await logOf(page)).split(' ').filter((x) => x === 'placed').length === 1, await logOf(page));
      await page.context().close();

      page = await open(browser, 'https://www.walmart.com/cart', { cart: 'amend' });
      await press(page, 'c'); await sleep(300);
      ok('an order already placed: c never presses "Add items to today\'s order"', (await logOf(page)) === '' && (await seen(page)).includes('c'), [await logOf(page), await seen(page)]);
      await page.context().close();
    }

    console.log('Amazon Your Orders (every page is a page load)');
    page = await open(browser, 'https://www.amazon.com/your-orders/orders?timeFilter=year-2025&ref_=ppx_yo2ov_dt_b_filter_all_y2025');
    u = await ui(page);
    ok('the bar lists 1 2 3 4 5 from "47 orders"', u.shown && u.pages === '1 2 3 4 5' && u.cur === 1, u);
    await press(page, 'ArrowRight'); await sleep(900);
    ok('Right: page 2 is page=1, the filter stays and ref_ goes', (await where(page)) === '/your-orders/orders?timeFilter=year-2025&page=1', await where(page));
    ok('the bar marks page 2', (await ui(page)).cur === 2, await ui(page));
    await press(page, '5'); await sleep(900);
    ok('5: the last page', (await where(page)) === '/your-orders/orders?timeFilter=year-2025&page=4' && (await ui(page)).nextOff, await where(page));
    await page.evaluate(() => { for (let i = 0; i < 2; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })); }); await sleep(900);
    ok('Left twice, quickly: page 3', (await where(page)) === '/your-orders/orders?timeFilter=year-2025&page=2', [await where(page), await page.evaluate(() => [sessionStorage.getItem('speedyPages.asked'), (sessionStorage.getItem('klog') || '').split(' ').slice(-5).join(' '), Math.round(performance.timeOrigin) % 100000])]);
    await page.focus('#box'); await press(page, '1'); await sleep(600);
    ok('typing in the order search box types', (await where(page)).endsWith('page=2') && await page.evaluate(() => document.getElementById('box').value === '1'));
    await page.context().close();

    page = await open(browser, 'https://www.amazon.com/gp/css/order-history?ref_=nav_orders_first');
    ok('the older orders address (from the Returns & Orders link) gets the bar too', (await ui(page)).pages === '1 2 3 4 5', await ui(page));
    await press(page, 'ArrowRight'); await sleep(900);
    ok('and Right goes where its page links go: /your-orders/orders, page=1', (await where(page)) === '/your-orders/orders?page=1', await where(page));
    await page.context().close();

    page = await open(browser, 'https://www.amazon.com/your-orders/orders', { orders: 400 });
    ok('400 orders: 1 2 3 4 5 … 40', (await ui(page)).pages === '1 2 3 4 5 … 40', await ui(page));
    await press(page, '3', '5'); await sleep(900);
    ok('3 then 5: page 35 (page=34)', (await where(page)) === '/your-orders/orders?page=34', await where(page));
    ok('the bar lists 1 … 34 35 36 … 40', (await ui(page)).pages === '1 … 34 35 36 … 40' && (await ui(page)).cur === 35, await ui(page));
    await page.evaluate(() => window.__speedyPagesTest.root.querySelector('.num[data-page="40"]').click()); await sleep(900);
    ok('clicking 40 on the bar loads page 40 (page=39)', (await where(page)) === '/your-orders/orders?page=39', await where(page));
    await page.context().close();

    page = await open(browser, 'https://www.amazon.com/your-orders/orders', { orders: 400, late: 1500, wait: 1900 });
    await press(page, 'ArrowRight'); await sleep(500);
    u = await ui(page);
    ok('after a key, the bar is back before Amazon draws its page bar', (await where(page)) === '/your-orders/orders?page=1' && u.shown && u.cur === 2 && u.pages === '1 2 3 4 5 … 40' && await page.evaluate(() => !document.querySelector('ul.a-pagination')), u);
    await sleep(1500);
    u = await ui(page);
    ok('and lights up once the page has arrived', u.shown && u.cur === 2 && u.live, u);
    await page.context().close();

    page = await open(browser, 'https://www.amazon.com/your-orders/orders?nocount=1', { orders: 400 });
    ok('no order count to read: 1 2 …', (await ui(page)).pages === '1 2 …', await ui(page));
    await press(page, '3'); await sleep(150);
    ok('then every number waits 0.4 s', (await where(page)) === '/your-orders/orders?nocount=1');
    await press(page, '5'); await sleep(1000);
    ok('and 3 then 5 is still page 35', (await where(page)) === '/your-orders/orders?nocount=1&page=34', await where(page));
    await page.context().close();

    console.log('Search results');
    page = await open(browser, 'https://www.walmart.com/search?q=eggs');
    ok('Walmart search: the bar lists 1 2 3 4 5 … 8', (await ui(page)).pages === '1 2 3 4 5 … 8', await ui(page));
    await press(page, 'ArrowRight'); await sleep(500);
    ok('Right: page 2 of the search, with no reload', (await where(page)) === '/search?q=eggs&page=2' && await page.evaluate(() => window.loads === 1), await where(page));
    await page.focus('#box'); await press(page, '3'); await sleep(500);
    ok('typing in the search box types', (await where(page)) === '/search?q=eggs&page=2' && await page.evaluate(() => document.getElementById('box').value === '3'));
    await page.context().close();

    page = await open(browser, 'https://www.amazon.com/s?k=coffee&ref=nb_sb_noss');
    u = await ui(page);
    ok('Amazon search: the bar lists 1 2 3 4 5 6 7', u.shown && u.pages === '1 2 3 4 5 6 7' && u.cur === 1, u);
    await press(page, 'ArrowRight'); await sleep(900);
    ok('Right: Amazon\'s own link to page 2', (await where(page)) === '/s?k=coffee&page=2&qid=1700000000&ref=sr_pg_2', await where(page));
    await press(page, '6'); await sleep(900);
    ok('6: no link to page 6 on screen, so its address', (await where(page)) === '/s?k=coffee&page=6&qid=1700000000', await where(page));
    ok('the bar marks page 6', (await ui(page)).cur === 6, await ui(page));
    await press(page, 'ArrowRight', 'ArrowRight'); await sleep(900);
    ok('Right twice: the last page, and no further', (await where(page)).includes('page=7') && (await ui(page)).nextOff, await where(page));
    await page.context().close();

    page = await open(browser, 'https://www.amazon.com/gp/buy/thankyou/handlers/display.html');
    ok('other Amazon pages get no bar', !(await ui(page)).shown);
    await press(page, 'ArrowRight', '4'); await sleep(500);
    ok('and keep their keys', (await where(page)) === '/gp/buy/thankyou/handlers/display.html' && (await seen(page)).length === 2);
    await page.context().close();

    console.log('Amazon search shopping: counts, bursts, decoys, max dialog, side cart, 1-Click');
    {
      const amzRing = (pg) => pg.evaluate(() => {
        const root = window.__speedyPagesTest && window.__speedyPagesTest.root;
        if (!root) return null;
        const layer = root.querySelector('.layer');
        if (layer.hidden) return null;
        const el = root.querySelector('.ring');
        const r = el.getBoundingClientRect();
        const badge = root.querySelector('.badge');
        const band = getComputedStyle(root.querySelector('.band'));
        const candidates = [
          ...document.querySelectorAll('[data-component-type="s-search-result"], div[id^="gridCell-"], div[data-itemtype="active"][data-itemid], #checkout-byg-ptc-button a, input.place-your-order-button'),
        ];
        const hit = candidates.find((c) => {
          const b = c.getBoundingClientRect();
          return b.width && Math.abs(b.left - 6 - r.left) < 4 && Math.abs(b.top - 6 - r.top) < 4 && Math.abs(b.width + 12 - r.width) < 4;
        });
        const on = !hit ? null
          : hit.hasAttribute('data-index') ? 's:' + hit.getAttribute('data-index')
          : hit.id && hit.id.startsWith('gridCell-') ? hit.id
          : hit.getAttribute('data-itemid') ? hit.getAttribute('data-itemid')
          : hit.classList.contains('place-your-order-button') ? (hit.closest('span[id]') || {}).id
          : hit.textContent.trim();
        return {
          on,
          kind: el.getAttribute('data-kind'),
          border: band.borderTopStyle,
          outline: band.outlineStyle,
          tint: [layer.style.getPropertyValue('--tint'), layer.style.getPropertyValue('--tint-2')],
          badge: badge.hidden ? null : badge.textContent,
          waiting: !badge.hidden && badge.getAttribute('data-waiting') === '1',
          hints: [...root.querySelectorAll('.hint')].filter((h) => !h.hidden && h.getClientRects().length).map((h) => h.textContent).sort().join(' '),
        };
      });
      const amzLog = (pg) => pg.evaluate(() => JSON.parse(sessionStorage.getItem('amz.log') || '[]'));
      const amzNever = (pg) => pg.evaluate(() => JSON.parse(sessionStorage.getItem('amz.never') || '[]'));
      const amzCart = (pg) => pg.evaluate(() => JSON.stringify(window.cart));

      page = await open(browser, 'https://www.amazon.com/s?k=garlic', { amz: true });
      ok('Amazon search: no ring until Down or Tab', (await amzRing(page)) === null);
      await press(page, 'ArrowDown'); await sleep(650);
      let r = await amzRing(page);
      ok('Down: dashed ring in Amazon colours (#0f1111, #ffd814) on card 0, with Enter, s and c',
        r && r.on === 's:0' && r.kind === 'here' && r.border === 'dashed' && r.tint[0] === '#0f1111' && r.tint[1] === '#ffd814' && r.hints === 'c s ↵', r);
      await press(page, 'ArrowRight'); await sleep(350);
      r = await amzRing(page);
      ok('Right: moves cleanly to a second card sharing the same ASIN', r && r.on === 's:1', r);
      await press(page, 'Enter'); await sleep(130);
      r = await amzRing(page);
      ok('Enter: solid open ring, and badge stays dashed while data-is-request-in-progress is true',
        r && r.on === 's:1' && r.kind === 'open' && r.border === 'solid' && r.badge === '1' && r.waiting, r);
      await sleep(350);
      r = await amzRing(page);
      const ewcUp = await page.evaluate(() => !document.getElementById('nav-flyout-ewc').classList.contains('aok-hidden') && !!document.getElementById('inline-expansion-slot'));
      ok('once save-in-flight clears, the badge turns solid and #nav-flyout-ewc (role=dialog) does not silence keys',
        ewcUp && r && r.badge === '1' && !r.waiting && r.hints === 'c s ↓↑', [ewcUp, r]);

      await press(page, '9'); await sleep(950);
      r = await amzRing(page);
      const logs1 = await amzLog(page);
      const modalGone = await page.evaluate(() => !document.querySelector('[aria-label="Maximum Quantity Reached"]'));
      ok('typing 9 on a max-5 card reads data-steppervalue (never the stale text), stops at 5, and closes the Maximum Quantity Reached dialog',
        (await amzCart(page)) === '{"1":5}' && r && r.badge === '5' && !r.waiting && logs1.includes('max-opened') && logs1.includes('max-closed') && modalGone, [await amzCart(page), r, logs1, modalGone]);

      await press(page, '2'); await sleep(850);
      ok('typing 2 steps down to 2 despite stale live-region and value text', (await amzCart(page)) === '{"1":2}', await amzCart(page));
      await page.evaluate(() => { window.amzSlip = true; });
      await press(page, 'ArrowUp'); await sleep(1100);
      ok('a count rolled back when data-is-request-in-progress clears is pressed again',
        (await amzCart(page)) === '{"1":3}' && (await amzLog(page)).includes('slip:1'), [await amzCart(page), await amzLog(page)]);

      await press(page, 'Enter'); await sleep(150);
      await press(page, 'ArrowDown'); await sleep(700);
      r = await amzRing(page);
      ok('Down steps over the inserted "Products you might need" (#inline-expansion-slot) to row 2 in the same column', r && r.on === 's:5', r);
      await press(page, 'ArrowDown'); await sleep(700);
      r = await amzRing(page);
      ok('Down again steps over the sponsored carousel band between rows', r && r.on === 's:9', r);
      await press(page, 'ArrowUp', 'ArrowUp'); await sleep(750);
      await press(page, 'ArrowLeft'); await sleep(350);
      await press(page, '='); await sleep(550);
      ok('= adds card 0 to 1 with count closed', JSON.parse(await amzCart(page))['0'] === 1, await amzCart(page));
      await press(page, 'ArrowRight', 'ArrowLeft'); await sleep(350);
      await press(page, '-'); await sleep(550);
      const addBack = await page.evaluate(() => !document.querySelector('[data-index="0"] .ax-atc').classList.contains('aok-hidden'));
      ok('minus at 1 presses decrement (trash) by data-a-selector and brings Add to cart back',
        !JSON.parse(await amzCart(page))['0'] && addBack, [await amzCart(page), addBack]);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await sleep(650);
      ok('Ctrl+Z undoes the trash at 1 in one step', JSON.parse(await amzCart(page))['0'] === 1 && (await amzRing(page)).on === 's:0', await amzCart(page));

      await press(page, 'ArrowRight', 'ArrowRight'); await sleep(350);
      r = await amzRing(page);
      await press(page, 'Enter', '='); await sleep(250);
      ok('"See options" card shows no Add hint and Enter / = press nothing',
        r && r.on === 's:2' && r.hints === 'c s' && (await amzNever(page)).length === 0, [r, await amzNever(page)]);
      await press(page, 'ArrowRight'); await sleep(350);
      r = await amzRing(page);
      await press(page, 'Enter', '=', '-'); await sleep(250);
      ok('Kindle "Buy now with 1-Click" card shows no Add hint and never clicks 1-Click',
        r && r.on === 's:3' && r.hints === 'c s' && (await amzNever(page)).length === 0, [r, await amzNever(page)]);

      await page.evaluate(() => { const c = document.createElement('input'); c.id = 'captchacharacters'; document.body.append(c); });
      await sleep(60);
      await press(page, 'ArrowLeft', 'ArrowLeft', 'ArrowLeft'); await sleep(200);
      ok('when Amazon shows a captcha field, the ring hides, keys go quiet and pass to the page',
        (await amzRing(page)) === null && (await seen(page)).includes('ArrowLeft'), [await amzRing(page), await seen(page)]);
      await page.evaluate(() => document.getElementById('captchacharacters').remove());
      await sleep(60);

      await press(page, 's'); await sleep(100);
      ok('s focuses #twotabsearchtextbox', await page.evaluate(() => document.activeElement && document.activeElement.id === 'twotabsearchtextbox'));
      await page.evaluate(() => document.activeElement.blur());
      await press(page, 'c'); await sleep(600);
      ok('c on search clicks #nav-cart to open the cart', (await where(page)).startsWith('/gp/cart/view.html'), await where(page));
      same('never-press list stayed clean across Amazon search', await amzNever(page), []);
      await page.context().close();

      console.log('Amazon Buy Again');
      page = await open(browser, 'https://www.amazon.com/gp/buyagain');
      await press(page, 'ArrowDown'); await sleep(500);
      r = await amzRing(page);
      ok('Buy Again: Down rings the first #gridCell card', r && r.on === 'gridCell-B0TEST0004', r);
      await press(page, 'Tab', 'Tab'); await sleep(350);
      ok('skeleton #gridCell cards (data-isskeleton="true") are skipped', (await amzRing(page)).on === 'gridCell-B0TEST0005', await amzRing(page));
      await press(page, 'Shift+Tab'); await sleep(350);
      await press(page, 'Enter'); await sleep(250);
      await press(page, 'ArrowUp'); await sleep(250);
      await press(page, 'Escape'); await sleep(150);
      ok('Buy Again: Enter clicks visible #gridElement Add (never hidden #detail) and Up steps to 2',
        (await page.evaluate(() => JSON.stringify(window.ba))) === '{"B0TEST0004":2}' && (await amzNever(page)).length === 0, [await page.evaluate(() => window.ba), await amzNever(page)]);
      await press(page, 'r', 'l'); await sleep(200);
      ok('R and L on Buy Again never press NOT_INTERESTED "Remove item" or Favorite Reorders',
        (await amzNever(page)).length === 0, await amzNever(page));
      await press(page, '-', '-'); await sleep(450);
      ok('minus twice trashes Buy Again card back to 0', (await page.evaluate(() => JSON.stringify(window.ba))) === '{}', await page.evaluate(() => window.ba));
      await page.context().close();

      console.log('Amazon cart, "Need anything else?", checkout and item-page safety');
      page = await open(browser, 'https://www.amazon.com/gp/cart/view.html');
      ok('Amazon cart: no ring until Down or Tab', (await amzRing(page)) === null);
      await press(page, 'ArrowDown'); await sleep(550);
      r = await amzRing(page);
      ok('Down rings the first active item with -, =, L, R, c and s hints',
        r && r.on === 'item-1' && r.hints === '- = L R c s', r);
      await press(page, '='); await sleep(80);
      r = await amzRing(page);
      ok('while the cart stepper spinner is visible, the badge stays dashed (waiting)',
        r && r.badge === '2' && r.waiting, r);
      await sleep(320);
      r = await amzRing(page);
      ok('once the cart spinner hides, the badge turns solid at 2', r && r.badge === '2' && !r.waiting, r);
      await press(page, 'Enter'); await sleep(350);
      r = await amzRing(page);
      ok('Enter opens the cart item count (3, solid ring, arrows over stepper)', r && r.kind === 'open' && r.badge === '3' && r.hints === 'L R c s ↑ ↓', r);
      await press(page, 'ArrowDown', 'Escape'); await sleep(400);
      await press(page, 'ArrowDown'); await sleep(550);
      ok('Down moves to the second active item', (await amzRing(page)).on === 'item-2', await amzRing(page));
      await press(page, 'l'); await sleep(350);
      r = await amzRing(page);
      ok('L saves the item for later and the ring moves immediately past the removed stub to the third item',
        (await amzLog(page)).includes('sfl:item-2') && r && r.on === 'item-3', [await amzLog(page), r]);
      await press(page, 'r'); await sleep(350);
      r = await amzRing(page);
      ok('R deletes the item and the ring moves immediately to the remaining active item (never Saved Items)',
        (await amzLog(page)).includes('del:item-3') && r && r.on === 'item-1', [await amzLog(page), r]);

      await press(page, 'c'); await sleep(650);
      r = await amzRing(page);
      ok('c in the cart clicks Proceed to checkout, opening "Need anything else?" with a dashed ring on Continue to checkout',
        (await where(page)).startsWith('/checkout/byg/') && r && r.on === 'Continue to checkout' && r.kind === 'here' && r.border === 'dashed' && r.hints.includes('c'), [await where(page), r]);
      await press(page, '='); await sleep(150);
      await press(page, 'Escape'); await sleep(650);
      ok('Escape on "Need anything else?" clicks Back to Cart (/cart/ref=...)',
        (await where(page)) === '/cart/ref=sc_byc_btc_d' && (await amzLog(page)).includes('byg-back'), [await where(page), await amzLog(page)]);
      await press(page, 'c'); await sleep(650);
      await press(page, 'c'); await sleep(150);
      ok('c on "Need anything else?" continues to checkout; while checkout\'s .a-spinner-wrapper is up, ring hides and Enter presses nothing',
        (await where(page)).startsWith('/checkout/p/p-106-test/spc') && (await amzRing(page)) === null, [await where(page), await amzRing(page)]);
      await press(page, 'Enter'); await sleep(850);
      r = await amzRing(page);
      ok('once checkout settles, Place your order wears the double ring (skipping hidden/disabled #placeOrder copies before it) and nothing was placed early',
        r && r.on === 'submitOrderButtonId' && r.kind === 'spend' && r.border === 'solid' && r.outline === 'dashed' && r.hints === '↵' && !(await amzLog(page)).some((x) => x.startsWith('placed:')), [r, await amzLog(page)]);

      await page.evaluate(() => window.openUnknownDialog()); await sleep(200);
      await press(page, 'Enter'); await sleep(150);
      ok('an unknown dialog hides the ring and silences keys',
        (await amzRing(page)) === null && !(await amzLog(page)).some((x) => x.startsWith('placed:')), [await amzRing(page), await amzLog(page)]);
      await page.evaluate(() => window.closeUnknownDialog()); await sleep(250);

      await page.evaluate(() => document.getElementById('submitOrderButtonId').classList.add('aok-hidden'));
      await sleep(250);
      r = await amzRing(page);
      ok('when the top #placeOrder hides, the double ring moves only to the visible enabled bottom #placeOrder, never a hidden or visibility:hidden copy',
        r && r.on === 'bottomSubmitOrderButtonId' && r.kind === 'spend', r);
      await press(page, 'Enter'); await sleep(150);
      ok('Enter before the double ring has sat one second places nothing',
        !(await amzLog(page)).some((x) => x.startsWith('placed:')), await amzLog(page));
      await sleep(1100);
      await press(page, 'Enter'); await sleep(150);
      await press(page, 'Enter'); await sleep(150);
      ok('Enter after one second places the order once via the visible #placeOrder, and a second Enter straight after places nothing more',
        (await amzLog(page)).filter((x) => x.startsWith('placed:')).join(',') === 'placed:bottomSubmitOrderButtonId', await amzLog(page));
      await press(page, 'Escape', 'Escape'); await sleep(200);
      ok('Escape on checkout clicks Back to cart once',
        (await amzLog(page)).filter((x) => x === 'co-back').length === 1, await amzLog(page));
      same('never-press list stayed completely untouched across cart, byg and checkout', await amzNever(page), []);
      await page.context().close();

      page = await open(browser, 'https://www.amazon.com/dp/B0TEST0001');
      await press(page, 'ArrowDown', 'Tab', 'Enter', '=', '-', 'c'); await sleep(300);
      ok('the item page (/dp/) gets no bar and no ring, and never presses Buy Now, 1-Click, Auto Buy, or the hidden subscription #add-to-cart-button',
        !(await ui(page)).shown && (await amzRing(page)) === null && (await amzLog(page)).length === 0 && (await amzNever(page)).length === 0,
        [await ui(page), await amzRing(page), await amzLog(page), await amzNever(page)]);
      await page.context().close();
    }
  } finally { await browser.close(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
