// ==UserScript==
// @name         Speedy Pages
// @namespace    https://github.com/DrAlexHarrison/littlethings
// @version      1.0.0
// @description  Shop Walmart and Amazon from the keyboard: move a ring from item to item, add, set counts, check out, and turn pages.
// @match        https://www.walmart.com/*
// @match        https://www.amazon.com/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/DrAlexHarrison/littlethings/main/speedy-pages/extension/speedy-pages.user.js
// @updateURL    https://raw.githubusercontent.com/DrAlexHarrison/littlethings/main/speedy-pages/extension/speedy-pages.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '1.0.0';

  const TYPE_MS = 400;
  const PENDING_MS = 8000;
  const MIN_GAP_MS = 50;
  const PEEK_PX = 72;
  const ROW_MS = 340;
  const ROW_REPEAT_MS = 220;
  const RING_REPEAT_MS = 90;
  const GLIDE_MAX_MS = 900;
  const RING_MS = 130;
  const COUNT_WAIT_MS = 1500;
  const MAX_COUNT = 99;
  const ADD_WAIT_MS = 6000;
  const PRESS_GAP_MS = 120;
  const PICK_HOLD_MS = 1000;
  const SETTLE_MS = 4500;
  const SPEND_WAIT_MS = 1000;

  function digitStep(typed, last) {
    if (!last) return 'wait';
    return Number(typed) * 10 > last ? 'go' : 'wait';
  }

  function typedPage(typed, last) {
    const n = parseInt(typed, 10);
    if (!n) return null;
    return last ? Math.min(n, last) : n;
  }

  function lastFromTexts(texts) {
    let max = 0;
    for (const t of texts) {
      const s = String(t).trim();
      const n = parseInt(s, 10);
      if (n > max && String(n) === s) max = n;
    }
    return max;
  }

  function pagesFromCount(text, per) {
    const m = /([\d,.]+)/.exec(String(text || ''));
    const n = m ? parseInt(m[1].replace(/[,.]/g, ''), 10) : 0;
    return n > 0 && per > 0 ? Math.ceil(n / per) : 0;
  }

  function pageSlots(cur, last) {
    const run = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
    if (!last) return cur <= 4 ? [...run(1, cur + 1), '…'] : [1, '…', cur - 1, cur, cur + 1, '…'];
    if (last <= 7) return run(1, last);
    if (cur <= 4) return [...run(1, 5), '…', last];
    if (cur >= last - 3) return [1, '…', ...run(last - 4, last)];
    return [1, '…', cur - 1, cur, cur + 1, '…', last];
  }

  function rowStops(rows, viewH, pinned, peek) {
    return rows.map((r, i) => {
      const next = rows[i + 1];
      if (r.head != null) return Math.max(0, Math.round(r.head - pinned - 8));
      const cap = r.top - pinned - 8;
      const low = next ? next.pic + peek - viewH : r.bottom + 24 - viewH;
      if (low <= cap) return Math.max(0, Math.round(low));
      return Math.max(0, Math.round(Math.min(cap, Math.max(r.bottom + 24 - viewH, cap - 120))));
    });
  }
  function withFoot(stops, barBottom, viewH, max, room) {
    const out = stops.map((v) => Math.min(v, max));
    if (barBottom == null || !out.length) return out;
    let foot = Math.min(max, Math.round(barBottom + 24 - viewH));
    if (max - foot < 160) foot = max;
    const last = out[out.length - 1];
    if (foot <= last + 8) return out;
    if (foot - last < 160 && foot <= room) out[out.length - 1] = foot;
    else out.push(foot);
    return out;
  }
  function fillGaps(stops, limit) {
    const out = [];
    let prev = 0;
    for (const v of [...new Set(stops)].sort((x, y) => x - y)) {
      const n = Math.ceil((v - prev) / limit);
      for (let i = 1; i < n; i++) out.push(Math.round(prev + ((v - prev) * i) / n));
      out.push(v);
      prev = v;
    }
    return out;
  }
  function taper(prev) {
    const next = Math.round(prev * 0.55);
    return next < 60 ? 0 : next;
  }
  function nextStop(stops, at, dir) {
    const sorted = [...new Set(stops)].sort((a, b) => a - b);
    if (dir > 0) { const s = sorted.find((v) => v > at + 8); return s === undefined ? null : s; }
    const below = sorted.filter((v) => v < at - 8);
    return below.length ? below[below.length - 1] : null;
  }

  function urlFor(href, key, page, first) {
    const u = new URL(href);
    u.searchParams.set(key, String(page - 1 + first));
    return u.toString();
  }

  function pageOf(href, key, first) {
    const v = parseInt(new URL(href).searchParams.get(key) || String(first), 10);
    return Number.isFinite(v) ? Math.max(1, v - first + 1) : 1;
  }

  const ROLES_WITH_KEYS = /^(textbox|searchbox|combobox|listbox|option|menu|menubar|menuitem|menuitemcheckbox|menuitemradio|slider|spinbutton|tablist|tab|radiogroup|radio|grid|gridcell|tree|treeitem|dialog|alertdialog|application)$/;

  function takesKeys(f) {
    if (!f) return false;
    if (f.isContentEditable) return true;
    const tag = String(f.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'IFRAME' || tag === 'EMBED' || tag === 'OBJECT' || tag === 'VIDEO' || tag === 'AUDIO') return true;
    if (tag === 'INPUT') return !/^(button|submit|reset|checkbox|image|hidden|file|color)$/i.test(f.type || 'text');
    return (f.roles || []).some((r) => ROLES_WITH_KEYS.test(r));
  }

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { digitStep, typedPage, lastFromTexts, pagesFromCount, pageSlots, rowStops, withFoot, fillGaps, taper, nextStop, urlFor, pageOf, takesKeys, TYPE_MS, VERSION };
    return;
  }
  if (window.top !== window) return;
  if (window.__speedyPages) return;
  window.__speedyPages = VERSION;

  const host = (name) => new RegExp('(^|\\.)' + name.replace('.', '\\.') + '$').test(location.hostname);
  const visible = (n) => !!n && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';

  const walmart = {
    tint: ['#0053e2', '#ffc220'],
    count(el) {
      const label = el.querySelector('[data-testid="quantity-label"]');
      const more = el.querySelector('button[aria-label^="Increase quantity" i]');
      const m = (label && /(\d+)/.exec(label.textContent)) || (more && /Current Quantity (\d+)/i.exec(more.getAttribute('aria-label') || ''));
      if (m) return parseInt(m[1], 10);
      const pill = el.querySelector('button[data-testid="quantity-in-cart"]');
      return pill ? parseInt(pill.textContent, 10) || 0 : 0;
    },
    press(el, dir) {
      const add = el.querySelector('button[data-automation-id="add-to-cart"]');
      if (add) {
        if (dir < 0) return null;
        add.click();
        return 'add';
      }
      const b = el.querySelector(dir > 0 ? 'button[aria-label^="Increase quantity" i]' : 'button[aria-label^="Decrease quantity" i]');
      if (b) {
        if (b.disabled) return dir > 0 ? 'max' : null;
        b.click();
        return 'step';
      }
      const pill = el.querySelector('button[data-testid="quantity-in-cart"]');
      if (pill) {
        pill.click();
        return 'open';
      }
      return null;
    },
    main(el) {
      return el.querySelector('button[data-automation-id="add-to-cart"], button[data-testid="quantity-in-cart"], [data-testid="quantity-stepper"]')
        || (el.querySelector('button[aria-label^="Increase quantity" i]') || {}).parentElement || null;
    },
    blocked: () => !!document.querySelector('#px-captcha') || location.pathname === '/blocked',
    search: () => document.querySelector('input[data-automation-id="header-input-search"], header input[type="search"]'),
    mark(key) {
      const box = walmart.search();
      return box && document.activeElement !== box ? { el: box, keys: [key], top: true } : null;
    },
    modal() {
      for (const d of document.querySelectorAll('div[role="dialog"]')) {
        if (d.getAttribute('aria-labelledby') === 'ato-fab-heading' || !d.getClientRects().length) continue;
        if (walmart.choice(d)) return d;
      }
      return null;
    },
    quiet() {
      for (const d of document.querySelectorAll('div[role="dialog"]')) {
        if (d.getAttribute('aria-labelledby') === 'ato-fab-heading') continue;
        const r = d.getBoundingClientRect();
        if (r.width >= 300 && r.height >= 150 && !walmart.choice(d)) return true;
      }
      for (let n = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2); n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        const st = getComputedStyle(n);
        if (st.position !== 'fixed') continue;
        const r = n.getBoundingClientRect();
        if (r.width < window.innerWidth * 0.9 || r.height < window.innerHeight * 0.9) continue;
        const m = /rgba\(0, 0, 0, (0?\.\d+)\)/.exec(st.backgroundColor);
        if (m && parseFloat(m[1]) >= 0.2) return true;
      }
      return false;
    },
    choice(box) {
      const buttons = [...box.querySelectorAll('button')].filter((b) => b.getClientRects().length);
      const by = (re) => buttons.find((b) => re.test(b.textContent.trim()));
      return by(/^no,? thanks$/i) || by(/^keep checking out$/i) || by(/^continue to checkout$/i) || by(/^continue$/i) || by(/^(skip|not now)$/i) || null;
    },
  };

  const amazon = {
    tint: ['#0f1111', '#ffd814'],
    shown(n) {
      if (!visible(n) || n.closest('.aok-hidden, .sc-hidden, [hidden]')) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    },
    scope: (el) => (el.id && el.id.startsWith('gridCell-') ? el.querySelector('[id^="gridElement-"]') || el : el),
    forbidden(el) {
      if (!el) return true;
      if (el.closest('.a-button-oneclick, #inline-expansion-slot, [id*="sns" i], [id*="subscri" i]')) return true;
      const name = el.getAttribute('name') || '';
      const val = el.getAttribute('value') || '';
      const aria = el.getAttribute('aria-label') || '';
      const href = el.getAttribute('href') || '';
      if (/^(submit\.(buy-now|one-click)|placeYourOrder)/i.test(name) || name === 'sns-item-cart-desktop') return true;
      if (el.classList.contains('place-your-order-button')) return true;
      if (el.id === 'buy-now-button' || el.id === 'one-click-button' || el.id === 'buy-for-others-buy-button' || /^sns-item-/i.test(el.id || '')) return true;
      if (/subscription/i.test(val) || /^(buy now|subscribe\b)/i.test(aria) || /1-click/i.test(aria)) return true;
      if (href.includes('/buying-rules/') || el.getAttribute('data-event') === 'NOT_INTERESTED') return true;
      if (el.type === 'radio' && el.value === 'rush') return true;
      return false;
    },
    stepper(el) {
      const box = amazon.scope(el);
      for (const fs of box.querySelectorAll('fieldset[data-a-component="stepper"], fieldset[name="ax-qs"], fieldset[name="sc-quantity"]')) {
        if (amazon.shown(fs)) return fs;
      }
      return null;
    },
    addButton(el) {
      const box = amazon.scope(el);
      for (const b of box.querySelectorAll('.ax-atc:not(.aok-hidden) input[name="submit.addToCart"], input[name="submit.addToCart"]')) {
        if (!b.disabled && amazon.shown(b) && !amazon.forbidden(b)) return b;
      }
      return null;
    },
    count(el) {
      const box = amazon.scope(el);
      const atc = box.querySelector('.ax-atc');
      if (atc && amazon.shown(atc)) return 0;
      const fs = amazon.stepper(box);
      return fs ? parseInt(fs.getAttribute('data-steppervalue'), 10) || 0 : 0;
    },
    saving(el) {
      const box = amazon.scope(el);
      if (box.querySelector('.atc-faceout-container[data-is-request-in-progress="true"]')) return true;
      const fs = amazon.stepper(box);
      if (!fs) return false;
      if (fs.getAttribute('data-a-value-status') === 'loading') return true;
      const sp = fs.querySelector('[data-a-selector="spinner"] .a-spinner');
      return !!sp && amazon.shown(sp);
    },
    failed(el) {
      const err = amazon.scope(el).querySelector('.ax-qs-failure, .puis-atcb-error-container');
      return !!err && amazon.shown(err);
    },
    closeMaxModal() {
      for (const d of document.querySelectorAll('[role="dialog"][aria-label="Maximum Quantity Reached"]')) {
        if (!amazon.shown(d)) {
          delete d.dataset.spClosed;
          continue;
        }
        if (!d.dataset.spClosed) {
          const b = d.querySelector('button[data-action="a-popover-close"][aria-label="Close"], button[data-action="a-popover-close"]');
          if (b && !amazon.forbidden(b)) {
            d.dataset.spClosed = '1';
            b.click();
          }
        }
        if (d.contains(document.activeElement)) document.activeElement.blur();
      }
    },
    press(el, dir) {
      amazon.closeMaxModal();
      const add = amazon.addButton(el);
      if (add) {
        if (dir < 0) return null;
        add.click();
        return 'add';
      }
      const fs = amazon.stepper(el);
      if (!fs) return null;
      if (dir > 0) {
        const inc = fs.querySelector('button[data-a-selector="increment"]');
        if (!inc || !amazon.shown(inc) || amazon.forbidden(inc)) return null;
        const max = parseInt(fs.getAttribute('data-valuemax'), 10);
        const cur = parseInt(fs.getAttribute('data-steppervalue'), 10) || 0;
        if (inc.disabled || inc.getAttribute('aria-disabled') === 'true' || fs.getAttribute('data-a-increment-status') === 'disabled' || (max > 0 && cur >= max)) return 'max';
        inc.click();
        setTimeout(amazon.closeMaxModal, 40);
        setTimeout(amazon.closeMaxModal, 150);
        return 'step';
      }
      const dec = fs.querySelector('button[data-a-selector="decrement"]');
      if (!dec || !amazon.shown(dec) || dec.disabled || dec.getAttribute('aria-disabled') === 'true' || amazon.forbidden(dec)) return null;
      dec.click();
      return 'step';
    },
    main(el) {
      const add = amazon.addButton(el);
      if (add) return add.closest('.a-button') || add;
      return amazon.stepper(el);
    },
    orderButtons() {
      return [...document.querySelectorAll('input[name^="placeYourOrder"], input.place-your-order-button')].filter((b) =>
        !b.disabled
        && b.getAttribute('aria-disabled') !== 'true'
        && !b.closest('.a-button-oneclick, [id*="sns" i], [id*="subscri" i], [id*="blocker" i], [id*="disabled" i]')
        && amazon.shown(b)
      ).slice(0, 1);
    },
    blocked: () => /^\/(errors\/|ap\/(signin|mfa|cvf))|validatecaptcha/i.test(location.pathname + location.search)
      || !!document.querySelector('form[action*="validateCaptcha" i], input#captchacharacters'),
    search() {
      const b = document.querySelector('input#twotabsearchtextbox, input[name="field-keywords"]');
      return amazon.shown(b) ? b : null;
    },
    cart() {
      const a = document.querySelector('a#nav-cart, header a[href^="/gp/cart/view.html"]');
      return amazon.shown(a) ? a : null;
    },
    mark(key) {
      const box = amazon.search();
      return box && document.activeElement !== box ? { el: box, keys: [key], top: true } : null;
    },
    modal: () => null,
    choice: () => null,
    quiet() {
      amazon.closeMaxModal();
      for (const d of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
        if (d.id === 'nav-flyout-ewc' || d.closest('#nav-flyout-ewc') || !amazon.shown(d)) continue;
        if (d.getAttribute('aria-label') === 'Maximum Quantity Reached' && d.dataset.spClosed === '1') continue;
        const r = d.getBoundingClientRect();
        if (r.width >= 300 && r.height >= 150) return true;
      }
      if (/^\/checkout\/p\/[^/]+\/spc(\/|$)/.test(location.pathname)) {
        for (const s of document.querySelectorAll('.a-spinner-wrapper')) if (amazon.shown(s)) return true;
      }
      return false;
    },
  };

  const LISTS = [
    {
      name: 'Walmart',
      tiles: '[data-item-id]',
      test: () => host('walmart.com') && /^\/(my-items|search|browse|shop)(\/|$)/.test(location.pathname),
      shop: {
        tint: walmart.tint,
        count: walmart.count,
        press: walmart.press,
        main: walmart.main,
        blocked: walmart.blocked,
        search: walmart.search,
        key: (el) => el.getAttribute('data-dca-id') || el.getAttribute('data-item-id'),
        cart: () => document.querySelector('button[data-automation-id="cart-button-header"], header a[href="/cart"], a[link-identifier="Cart"], header a[href^="/cart"]'),
        marks() {
          return [walmart.mark('s'), { el: this.cart(), keys: ['c'], top: true }].filter((m) => m && m.el);
        },
      },
      bar: () => document.querySelector('nav[aria-label="pagination"]'),
      current: () => pageOf(location.href, 'page', 1),
      last() {
        const bar = this.bar();
        return bar ? lastFromTexts([...bar.querySelectorAll('*')].filter((n) => !n.childElementCount).map((n) => n.textContent)) : 0;
      },
      url: (n) => urlFor(location.href, 'page', n, 1),
      link(n) {
        const bar = this.bar();
        if (!bar) return null;
        for (const a of bar.querySelectorAll('a[href]')) {
          const u = new URL(a.href, location.href);
          if (u.pathname === location.pathname && pageOf(u.href, 'page', 1) === n) return a;
        }
        return null;
      },
      turn(n) {
        const state = history.state;
        if (!state || state.__N !== true) return false;
        const u = new URL(this.url(n));
        const to = u.pathname + u.search;
        history.pushState({ url: to, as: to, options: {}, __N: true, key: Math.random().toString(36).slice(2, 10) }, '', to);
        history.pushState({ speedyPages: true }, '', to);
        history.back();
        return true;
      },
      marked() {
        const bar = this.bar();
        const cur = bar && bar.querySelector('[aria-current="page"]');
        return cur ? parseInt(cur.textContent.trim(), 10) || 0 : 0;
      },
    },
    {
      name: 'Walmart cart',
      scene: true,
      tiles: 'button[data-automation-id^="cart-slot-shortcut-slot-"], li:has([data-testid="quantity-stepper"]):has(button[aria-label^="Remove "])',
      test: () => host('walmart.com') && location.pathname === '/cart',
      bar: () => null,
      current: () => 1,
      last: () => 1,
      url: () => location.href,
      link: () => null,
      shop: {
        tint: walmart.tint,
        count: walmart.count,
        press: walmart.press,
        blocked: walmart.blocked,
        search: walmart.search,
        modal: walmart.modal,
        choice: walmart.choice,
        quiet: walmart.quiet,
        key(el) {
          if (el.tagName === 'BUTTON') return el.getAttribute('data-automation-id');
          const a = el.querySelector('a[href*="/ip/"]');
          const m = a && /\/ip\/(?:[^/]+\/)?(\d+)/.exec(a.getAttribute('href'));
          return m ? m[1] : (el.querySelector('button[aria-label^="Remove "]') || el).getAttribute('aria-label');
        },
        kind: (el) => (el.tagName === 'BUTTON' ? 'pick' : 'item'),
        main: (el) => el.querySelector('[data-testid="quantity-stepper"]'),
        parts: (el) => ({
          less: el.querySelector('[data-testid="quantity-stepper-dec-button"]'),
          more: el.querySelector('[data-testid="quantity-stepper-inc-button"]'),
          keys: { r: el.querySelector('button[aria-label^="Remove "]'), l: el.querySelector('button[aria-label^="Save for later"]') },
        }),
        start: () => [...document.querySelectorAll('button[data-automation-id^="cart-slot-shortcut-slot-"]')].find((b) => /\bfree\b/i.test(b.textContent) && b.getClientRects().length) || null,
        go: () => [...document.querySelectorAll('button')].find((b) => /^continue to checkout$/i.test(b.textContent.trim()) && b.getClientRects().length) || null,
        undo: () => [...document.querySelectorAll('button')].find((b) => /^undo$/i.test(b.textContent.trim()) && b.getClientRects().length) || null,
        marks() {
          const go = this.go();
          return [go && { el: go, keys: ['c'] }, walmart.mark('s')].filter(Boolean);
        },
      },
    },
    {
      name: 'Walmart checkout',
      scene: true,
      tiles: 'button[data-automation-id="place-order-button"], button[data-testid^="delivery-option-"]',
      min: 24,
      test: () => host('walmart.com') && /^\/checkout(\/|$)/.test(location.pathname),
      bar: () => null,
      current: () => 1,
      last: () => 1,
      url: () => location.href,
      link: () => null,
      shop: {
        tint: walmart.tint,
        count: () => 0,
        press: () => null,
        main: () => null,
        blocked: walmart.blocked,
        search: walmart.search,
        modal: walmart.modal,
        choice: walmart.choice,
        quiet: walmart.quiet,
        key: (el) => el.getAttribute('data-testid') || el.getAttribute('data-automation-id'),
        kind: (el) => (el.getAttribute('data-automation-id') === 'place-order-button' ? 'spend' : 'pick'),
        start: () => [...document.querySelectorAll('button[data-automation-id="place-order-button"]')].find((b) => b.getClientRects().length) || null,
        go: () => null,
        back: () => document.querySelector('button[aria-label="Checkout, Back"]'),
        arrive() {
          if (this.left === location.href) return;
          const b = document.querySelector('button[data-testid="delivery-option-LEAVE_AT_DOOR"]');
          if (!b) return;
          this.left = location.href;
          if (/,\s*unselected$/i.test(b.getAttribute('aria-label') || '')) b.click();
        },
      },
    },
    {
      name: 'Amazon Your Orders',
      tiles: '.order-card',
      test: () => host('amazon.com') && /^\/(your-orders\/orders|gp\/css\/order-history|gp\/your-account\/order-history)/.test(location.pathname),
      bar: () => document.querySelector('ul.a-pagination'),
      current() {
        const sel = document.querySelector('ul.a-pagination li.a-selected');
        const n = sel && parseInt(sel.textContent.trim(), 10);
        return n || pageOf(location.href, 'page', 0);
      },
      last() {
        const bar = this.bar();
        if (!bar) return 0;
        const count = document.querySelector('.time-filter__label, label[for="time-filter"], .num-orders');
        const fromCount = pagesFromCount(count && count.textContent, 10);
        if (fromCount) return fromCount;
        return bar.querySelector('li.a-last a') ? 0 : lastFromTexts([...bar.querySelectorAll('li')].map((n) => n.textContent));
      },
      url(n) {
        const a = document.querySelector('ul.a-pagination li.a-normal a[href], ul.a-pagination li.a-selected a[href]');
        const u = new URL(urlFor(a ? new URL(a.getAttribute('href'), location.href).href : location.href, 'page', n, 0));
        u.searchParams.delete('ref_');
        return u.toString();
      },
      link: () => null,
    },
    {
      name: 'Amazon search',
      tiles: '[data-component-type="s-search-result"]',
      test: () => host('amazon.com') && location.pathname === '/s',
      shop: {
        tint: amazon.tint,
        count: amazon.count,
        saving: amazon.saving,
        failed: amazon.failed,
        press: amazon.press,
        main: amazon.main,
        blocked: amazon.blocked,
        quiet: amazon.quiet,
        arrive: amazon.closeMaxModal,
        search: amazon.search,
        cart: amazon.cart,
        key: (el) => el.getAttribute('data-uuid') || (el.hasAttribute('data-index') ? 'i:' + el.getAttribute('data-index') : el.getAttribute('data-item-id') || el.dataset.spKey || (el.dataset.spKey = 's:' + Math.random().toString(36).slice(2, 9))),
        marks() {
          return [amazon.mark('s'), { el: this.cart(), keys: ['c'], top: true }].filter((m) => m && m.el);
        },
      },
      bar: () => document.querySelector('.s-pagination-strip'),
      current() {
        const sel = document.querySelector('.s-pagination-strip .s-pagination-selected');
        const n = sel && parseInt(sel.textContent.trim(), 10);
        return n || pageOf(location.href, 'page', 1);
      },
      last() {
        const bar = this.bar();
        return bar ? lastFromTexts([...bar.querySelectorAll('.s-pagination-item')].map((n) => n.textContent)) : 0;
      },
      url(n) {
        const u = new URL(urlFor(location.href, 'page', n, 1));
        u.searchParams.delete('ref');
        return u.toString();
      },
      link(n) {
        const bar = this.bar();
        if (!bar) return null;
        for (const a of bar.querySelectorAll('a.s-pagination-item')) if (a.textContent.trim() === String(n)) return a;
        return null;
      },
    },
    {
      name: 'Amazon Buy Again',
      tiles: 'div[id^="gridCell-"]:not([data-isskeleton="true"])',
      test: () => host('amazon.com') && /^\/gp\/buyagain(\/|$)/.test(location.pathname),
      bar: () => null,
      current: () => 1,
      last: () => 1,
      url: () => location.href,
      link: () => null,
      shop: {
        tint: amazon.tint,
        count: amazon.count,
        saving: amazon.saving,
        failed: amazon.failed,
        press: amazon.press,
        main: amazon.main,
        blocked: amazon.blocked,
        quiet: amazon.quiet,
        arrive: amazon.closeMaxModal,
        search: amazon.search,
        cart: amazon.cart,
        key: (el) => el.id,
        marks() {
          return [amazon.mark('s'), { el: this.cart(), keys: ['c'], top: true }].filter((m) => m && m.el);
        },
      },
    },
    {
      name: 'Amazon cart',
      scene: true,
      tiles: '[data-name="Active Items"] div[data-itemtype="active"][data-itemid]:not(.ewc-item):has(fieldset[data-a-component="stepper"], fieldset[name="sc-quantity"], input[name^="submit.delete-active."]), #sc-active-cart div[data-itemtype="active"][data-itemid]:not(.ewc-item):has(fieldset[data-a-component="stepper"], fieldset[name="sc-quantity"], input[name^="submit.delete-active."])',
      test: () => host('amazon.com') && /^\/(cart(\/ref=[^/]*)?|gp\/cart\/view\.html(\/ref=[^/]*)?)\/?$/.test(location.pathname),
      bar: () => null,
      current: () => 1,
      last: () => 1,
      url: () => location.href,
      link: () => null,
      shop: {
        tint: amazon.tint,
        count: amazon.count,
        saving: amazon.saving,
        failed: amazon.failed,
        press: amazon.press,
        blocked: amazon.blocked,
        quiet: amazon.quiet,
        arrive: amazon.closeMaxModal,
        search: amazon.search,
        key: (el) => el.getAttribute('data-itemid') || el.getAttribute('data-asin'),
        main: (el) => amazon.stepper(el),
        parts(el) {
          const fs = amazon.stepper(el);
          const del = el.querySelector('input[name^="submit.delete-active."]');
          const sfl = el.querySelector('input[name^="submit.save-for-later."]');
          return {
            less: fs && fs.querySelector('button[data-a-selector="decrement"]'),
            more: fs && fs.querySelector('button[data-a-selector="increment"]'),
            keys: {
              r: amazon.shown(del) && !amazon.forbidden(del) ? del : null,
              l: amazon.shown(sfl) && !amazon.forbidden(sfl) ? sfl : null,
            },
          };
        },
        go() {
          const b = document.querySelector('#sc-buy-box-ptc-button input[name="proceedToRetailCheckout"]');
          return amazon.shown(b) && !b.disabled && !amazon.forbidden(b) ? b : null;
        },
        marks() {
          const go = this.go();
          return [go && { el: go.closest('.a-button') || go, keys: ['c'] }, amazon.mark('s')].filter(Boolean);
        },
      },
    },
    {
      name: 'Amazon before checkout',
      scene: true,
      min: 24,
      tiles: () => {
        const a = document.querySelector('#checkout-byg-ptc-button a[href*="/checkout/"], #checkout-byg-ptc-button a');
        return amazon.shown(a) && !amazon.forbidden(a) ? [a] : [];
      },
      test: () => host('amazon.com') && /^\/checkout\/byg(\/|$)/.test(location.pathname),
      bar: () => null,
      current: () => 1,
      last: () => 1,
      url: () => location.href,
      link: () => null,
      shop: {
        tint: amazon.tint,
        count: () => 0,
        press: () => null,
        main: () => null,
        blocked: amazon.blocked,
        quiet: amazon.quiet,
        arrive: amazon.closeMaxModal,
        search: amazon.search,
        key: () => 'continue-to-checkout',
        kind: () => 'pick',
        start() {
          const a = document.querySelector('#checkout-byg-ptc-button a[href*="/checkout/"], #checkout-byg-ptc-button a');
          return amazon.shown(a) && !amazon.forbidden(a) ? a : null;
        },
        go() {
          return this.start();
        },
        back() {
          const a = document.querySelector('a.byg-backtoCart-zoom-a11y[href^="/cart"], a[href*="/cart/ref=sc_byc_btc"]');
          return amazon.shown(a) && !amazon.forbidden(a) ? a : null;
        },
        marks() {
          const go = this.go();
          return [go && { el: go.closest('.a-button') || go, keys: ['c'] }, amazon.mark('s')].filter(Boolean);
        },
      },
    },
    {
      name: 'Amazon checkout',
      scene: true,
      min: 24,
      tiles: () => amazon.orderButtons(),
      test: () => host('amazon.com') && /^\/checkout\/p\/[^/]+\/spc(\/|$)/.test(location.pathname),
      bar: () => null,
      current: () => 1,
      last: () => 1,
      url: () => location.href,
      link: () => null,
      shop: {
        tint: amazon.tint,
        count: () => 0,
        press: () => null,
        main: () => null,
        blocked: amazon.blocked,
        quiet: amazon.quiet,
        arrive: amazon.closeMaxModal,
        search: amazon.search,
        key: (el) => {
          const span = el.closest('span[id]');
          return span ? span.id : 'place-your-order';
        },
        kind: () => 'spend',
        start: () => amazon.orderButtons()[0] || null,
        go: () => null,
        back() {
          const a = document.querySelector('a[href*="chk_spc_backToCart"]');
          return amazon.shown(a) && !amazon.forbidden(a) ? a : null;
        },
      },
    },
  ];

  let list = null;
  let place = null;
  let typed = '';
  let typeTimer = 0;
  let pending = null;
  let pendingAt = 0;
  let known = null;
  let traveledAt = 0;
  let travelTimer = 0;
  let stepping = 0;
  let turnedAt = 0;

  function focused() {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    if (!a || a === document.body || a === document.documentElement) return null;
    const roles = [];
    for (let n = a; n && n.nodeType === 1; n = n.parentElement) {
      const r = n.getAttribute('role');
      if (r) roles.push(r);
      if (n.getAttribute('aria-modal') === 'true') roles.push('dialog');
    }
    return { tagName: a.tagName, type: a.getAttribute('type'), isContentEditable: a.isContentEditable, roles };
  }

  function from() {
    if (pending != null && Date.now() - pendingAt < PENDING_MS) return pending;
    return list.current();
  }

  function lastOf() {
    const now = list.last();
    if (now) return now;
    if (known && known.name === list.name) return known.last;
    const a = asked();
    return a ? a.last : 0;
  }

  function go(n, side) {
    const last = lastOf();
    if (n < 1 || (last && n > last) || n === from()) {
      ui.bump(side);
      return false;
    }
    pending = n;
    pendingAt = Date.now();
    try {
      sessionStorage.setItem('speedyPages.asked', JSON.stringify({ page: n, last, t: Date.now() }));
    } catch (_) { }
    ui.live();
    clearTimeout(travelTimer);
    const wait = MIN_GAP_MS - (Date.now() - traveledAt);
    if (wait > 0 && list.turn) travelTimer = setTimeout(travel, wait);
    else travel();
    return true;
  }

  function travel() {
    if (!list || pending == null || pending === list.current()) return;
    if (stepping && Date.now() - stepping < 1000) return;
    traveledAt = Date.now();
    const a = list.link(pending);
    if (a) {
      a.click();
    } else if (list.turn && list.turn(pending)) {
      stepping = turnedAt = traveledAt;
    } else {
      location.assign(list.url(pending));
    }
  }

  function onPop() {
    if (!stepping) return;
    stepping = 0;
    if (list && pending != null && pending !== list.current()) setTimeout(travel, 0);
  }

  function clearTyped() {
    clearTimeout(typeTimer);
    typed = '';
  }

  function commitTyped() {
    const n = typedPage(typed, list ? lastOf() : 0);
    clearTyped();
    if (n && list) go(n);
    else ui.keys(null);
  }

  function rowsNow() {
    const y = window.scrollY;
    const rows = [];
    const box = modalNow();
    const min = box ? 16 : place.min || 40;
    rows.fixed = !!box;
    for (const t of tilesNow()) {
      if (!visible(t)) continue;
      const r = t.getBoundingClientRect();
      if (r.height < min || r.width < min) continue;
      const top = r.top + y;
      const img = t.querySelector('img');
      const ir = img && img.getBoundingClientRect();
      const pic = ir && ir.height > 20 ? ir.top + y : top;
      let row = rows.find((q) => Math.abs(q.top - top) < 16);
      if (!row) rows.push(row = { top, pic, bottom: r.bottom + y, first: t, head: null, tiles: [] });
      row.pic = Math.min(row.pic, pic);
      row.bottom = Math.max(row.bottom, r.bottom + y);
      row.tiles.push({ el: t, left: r.left });
    }
    rows.sort((a, b) => a.top - b.top);
    for (const row of rows) row.tiles = row.tiles.sort((a, b) => a.left - b.left).map((c) => c.el);
    rows.forEach((row, i) => { row.head = headOver(row.first, row.top, i ? rows[i - 1].bottom - 4 : row.top - 200); });
    return rows;
  }

  function headOver(tile, rowTop, floor) {
    const y = window.scrollY;
    for (let a = tile, i = 0; a && a !== document.body && a !== document.documentElement && i < 12; a = a.parentElement, i++) {
      if (a.getBoundingClientRect().top + y < rowTop - 4) return null;
      let p = a.previousElementSibling;
      for (let k = 0; p && k < 3 && !p.getBoundingClientRect().height; k++) p = p.previousElementSibling;
      if (!p) continue;
      const r = p.getBoundingClientRect();
      if (r.height < 16 || r.height > 160 || r.width < 40) continue;
      const pos = getComputedStyle(p).position;
      if (pos === 'sticky' || pos === 'fixed') continue;
      const top = r.top + y;
      if (r.bottom + y <= rowTop + 4 && top >= floor && rowTop - top <= 200) return top;
    }
    return null;
  }

  function pinnedNow() {
    const limit = window.innerHeight * 0.4;
    let bottom = 0;
    for (const x of [window.innerWidth * 0.25, window.innerWidth * 0.5, window.innerWidth * 0.75]) {
      for (let y = 2, tries = 0; y < limit && tries < 8; tries++) {
        let stuck = null;
        for (let n = document.elementFromPoint(x, y); n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
          const pos = getComputedStyle(n).position;
          if (pos === 'fixed' || pos === 'sticky') stuck = n;
        }
        if (!stuck || stuck === hostFor()) break;
        const edge = stuck.getBoundingClientRect().bottom;
        if (edge > limit) break;
        bottom = Math.max(bottom, edge);
        y = edge + 2;
      }
    }
    return Math.round(bottom);
  }
  const hostFor = () => document.querySelector('[data-speedy-pages]');

  const jump = (y) => window.scrollTo({ left: window.scrollX, top: y, behavior: 'instant' });
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  let glide = null;
  function glideTo(to, ms = ROW_MS, done) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    to = Math.max(0, Math.min(to, max));
    if (glide) cancelAnimationFrame(glide.raf);
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      jump(to);
      glide = null;
      if (done) done();
      return;
    }
    const dist = Math.abs(to - window.scrollY);
    const far = !glide && dist > window.innerHeight * 0.9;
    if (far) ms = Math.min(GLIDE_MAX_MS, Math.round(ms + (dist - window.innerHeight * 0.9) * 0.25));
    const g = glide = { to, from: window.scrollY, t0: performance.now(), ms, ease: far ? easeInOut : easeOut, raf: 0 };
    const step = (now) => {
      const p = Math.min(1, (now - g.t0) / ms);
      jump(g.from + (g.to - g.from) * g.ease(p));
      if (p < 1 && glide === g) g.raf = requestAnimationFrame(step);
      else if (glide === g) { glide = null; if (done) done(); }
    };
    g.raf = requestAnimationFrame(step);
  }

  function stopsNow(rows, pinned) {
    const viewH = window.innerHeight;
    const max = Math.max(0, document.documentElement.scrollHeight - viewH);
    const bar = place.bar && place.bar();
    const edge = bar && bar.getBoundingClientRect();
    const last = rows[rows.length - 1];
    return fillGaps(withFoot(rowStops(rows, viewH, pinned, PEEK_PX),
      edge && edge.height ? edge.bottom + window.scrollY : null, viewH, max, (last.head != null ? last.head : last.top) - pinned - 8),
    Math.max(200, (viewH - pinned) * 1.1));
  }

  function settle(used, origin, dir, target) {
    if (glide || !place || !place.tiles) return;
    const pinned = pinnedNow();
    if (pinned <= used + 4) return;
    const rows = rowsNow();
    if (rows.length < 2) return;
    let best = null;
    for (const v of stopsNow(rows, pinned)) if (best == null || Math.abs(v - target) < Math.abs(best - target)) best = v;
    if (best == null || best >= target - 2 || target - best > 200) return;
    if (dir > 0 && best - origin <= 8) return;
    if (moved && Math.abs(moved.at - target) < 8) moved.at = best;
    glideTo(best, 140);
  }

  let rowAt = 0;
  let moved = null;
  function rowStep(dir, repeat) {
    const now = Date.now();
    if (repeat && now - rowAt < ROW_REPEAT_MS) return true;
    const rows = rowsNow();
    if (rows.length < 2) return false;
    const at = glide ? glide.to : window.scrollY;
    const viewH = window.innerHeight;
    const pinned = pinnedNow();
    const max = Math.max(0, document.documentElement.scrollHeight - viewH);
    const stops = stopsNow(rows, pinned);
    if (dir < 0 && at > stops[stops.length - 1] + viewH) { moved = null; return false; }
    let to = nextStop(stops, at, dir);
    let ms = ROW_MS;
    const onStop = to != null;
    if (to == null && dir < 0 && at > 8) to = 0;
    if (to == null && dir > 0 && at < max - 1 && moved && Math.abs(moved.at - at) < 8) {
      const size = taper(Math.min(moved.size, viewH * 0.6));
      if (size) { to = Math.min(max, at + size); ms = Math.max(140, Math.round(ROW_MS * Math.min(1, size / 300))); }
    }
    if (to == null) { moved = null; return false; }
    rowAt = now;
    to = Math.max(0, Math.min(to, max));
    moved = { size: Math.abs(to - at), at: to };
    glideTo(to, ms, onStop ? () => settle(pinned, at, dir, to) : undefined);
    return true;
  }

  let ring = null;
  const want = new Map();
  const pumps = new Map();
  const undone = [];
  let run = null;
  let ringAt = 0;

  const shop = () => (place && place.shop && !(window.__speedyPagesTest && window.__speedyPagesTest.noShop) ? place.shop : null);
  let modalSeen = { at: -1000, box: null };
  function modalNow() {
    const now = performance.now();
    if (now - modalSeen.at > 60 || (modalSeen.box && !modalSeen.box.isConnected)) {
      const sh = shop();
      modalSeen = { at: now, box: sh && sh.modal ? sh.modal() : null };
    }
    return modalSeen.box;
  }
  let quietSeen = { at: -1000, v: false };
  function quietNow(fresh) {
    const now = performance.now();
    if (fresh || now - quietSeen.at > 150) {
      const sh = shop();
      quietSeen = { at: now, v: !!(sh && !modalNow() && sh.quiet && sh.quiet()) };
    }
    return quietSeen.v;
  }
  function tilesNow() {
    const box = modalNow();
    if (!box) return typeof place.tiles === 'function' ? place.tiles() : [...document.querySelectorAll(place.tiles)];
    const out = [];
    for (const n of box.querySelectorAll('button, input[type="radio"]')) {
      if (n.tagName === 'BUTTON') {
        if (!/^(close|back)\b/i.test(n.getAttribute('aria-label') || '')) out.push(n);
      } else {
        const row = n.closest('[data-testid]');
        const el = row && row !== box && box.contains(row) ? row : n.closest('label') || n;
        if (!out.includes(el)) out.push(el);
      }
    }
    return out;
  }
  const keyOf = (el) => (modalNow() ? 'choice:' + (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) : place.shop.key(el));
  const kindOf = (el) => (modalNow() ? 'pick' : place.shop.kind ? place.shop.kind(el) : 'item');
  function cardByKey(key) {
    for (const t of tilesNow()) if (keyOf(t) === key) return t;
    return null;
  }
  function pressTile(el) {
    const b = el.tagName === 'BUTTON' || el.tagName === 'A' ? el : el.querySelector('input[type="radio"], input, button') || el;
    if (visible(b) && !b.disabled) b.click();
  }
  function setPos() {
    rowsNow().some((r, i) => {
      const c = r.tiles.indexOf(ring.el);
      if (c >= 0) ring.pos = { ri: i, ci: c };
      return c >= 0;
    });
  }
  const countOf = (key, el) => (want.has(key) ? want.get(key) : el ? place.shop.count(el) : 0);

  function pump(key) {
    if (pumps.has(key)) return;
    const st = { seen: null, at: 0, wait: COUNT_WAIT_MS, stalls: 0, opens: 0, held: 0 };
    pumps.set(key, st);
    const stop = (gaveUp) => {
      pumps.delete(key);
      want.delete(key);
      if (gaveUp) ui.ringBump();
    };
    const tick = () => {
      const el = shop() ? cardByKey(key) : null;
      const target = want.get(key);
      if (!el || target == null) return stop(false);
      if ((place.shop.blocked && place.shop.blocked()) || (place.shop.failed && place.shop.failed(el))) return stop(true);
      if (quietNow()) return void setTimeout(tick, 200);
      const cur = place.shop.count(el);
      const saving = !!(place.shop.saving && place.shop.saving(el));
      const now = Date.now();
      if (cur === target) {
        st.seen = null;
        st.stalls = 0;
        if (saving && now - st.at < ADD_WAIT_MS) {
          st.held = 0;
          return void setTimeout(tick, 100);
        }
        if (!st.held) st.held = now;
        if (now - Math.max(st.at, st.held) > SETTLE_MS) return stop(false);
        return void setTimeout(tick, 150);
      }
      st.held = 0;
      if (st.seen === cur) {
        const wait = saving ? Math.max(st.wait, ADD_WAIT_MS) : st.wait;
        if (now - st.at < wait) return void setTimeout(tick, 50);
        if (++st.stalls >= 2) return stop(true);
      } else st.stalls = 0;
      if (now - st.at < PRESS_GAP_MS) return void setTimeout(tick, PRESS_GAP_MS - (now - st.at));
      const did = place.shop.press(el, cur < target ? 1 : -1);
      if (did === 'open') {
        if (++st.opens > 8) return stop(true);
        return void setTimeout(tick, 120);
      }
      if (!did || did === 'max') return stop(true);
      st.seen = cur;
      st.at = now;
      for (const ms of [80, 300]) setTimeout(() => unfocus(key), ms);
      st.wait = did === 'add' ? ADD_WAIT_MS : COUNT_WAIT_MS;
      setTimeout(tick, 50);
    };
    tick();
  }

  function unfocus(key) {
    const el = shop() ? cardByKey(key) : null;
    const a = document.activeElement;
    if (el && a && a !== document.body && el.contains(a) && (a.tagName === 'BUTTON' || a.tagName === 'INPUT' && /^(submit|button)$/.test(a.type))) a.blur();
  }

  function setCount(key, n, undoing) {
    const el = cardByKey(key);
    if (!el) return false;
    const cur = countOf(key, el);
    n = Math.max(0, Math.min(MAX_COUNT, n));
    if (n === cur) {
      ui.ringBump();
      return false;
    }
    if (!undoing) {
      if (!run || run.key !== key) undone.push(run = { key, from: cur, to: n });
      run.to = n;
      if (run.to === run.from) {
        undone.splice(undone.indexOf(run), 1);
        run = null;
      }
    }
    want.set(key, n);
    pump(key);
    return true;
  }

  function ringOn(el) {
    const key = keyOf(el);
    if (!ring) ring = { key, el, open: false, x: null, turning: null, since: Date.now(), pos: null, back: null };
    if (ring.key !== key) {
      run = null;
      ring.open = false;
      ring.digits = '';
      ring.since = Date.now();
    }
    ring.key = key;
    ring.el = el;
    ui.ring(true);
  }
  function ringOff() {
    ring = null;
    run = null;
    ui.ring(false);
  }

  function follow(rows, i) {
    if (rows.fixed) return;
    const viewH = window.innerHeight;
    const pinned = pinnedNow();
    const max = Math.max(0, document.documentElement.scrollHeight - viewH);
    const at = glide ? glide.to : window.scrollY;
    const r = rows[i];
    const fits = (y) => r.top - y >= pinned + 4 && r.bottom - y <= viewH - 4;
    if (fits(at)) return;
    const clamp = (v) => Math.max(0, Math.min(max, v));
    const stops = rowStops(rows, viewH, pinned, PEEK_PX).map(clamp);
    let to = stops[i];
    let best = Infinity;
    for (const v of stops) {
      if (fits(v) && Math.abs(v - at) < best) {
        best = Math.abs(v - at);
        to = v;
      }
    }
    const least = clamp(r.top - at < pinned + 4 ? r.top - pinned - 8 : r.bottom + 24 - viewH);
    if (fits(least) && Math.abs(least - at) + 200 < Math.abs(to - at)) to = least;
    if (Math.abs(to - at) < 8) return;
    moved = { size: Math.abs(to - at), at: to };
    glideTo(to, ROW_MS, rows.length > 1 ? () => settle(pinned, at, to > at ? 1 : -1, to) : undefined);
  }

  function ringStart() {
    const rows = rowsNow();
    if (!rows.length) return false;
    const top = window.scrollY + pinnedNow();
    const bottom = window.scrollY + window.innerHeight;
    let i = rows.findIndex((r) => Math.min(r.bottom, bottom) - Math.max(r.top, top) >= (r.bottom - r.top) * 0.6);
    if (i < 0) i = rows.findIndex((r) => r.bottom > top && r.top < bottom);
    if (i < 0) i = 0;
    ringOn(rows[i].tiles[0]);
    ring.pos = { ri: i, ci: 0 };
    follow(rows, i);
    return true;
  }

  const midX = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };

  function moveRing(dir, repeat) {
    const now = Date.now();
    if (repeat && now - ringAt < RING_REPEAT_MS) return true;
    const rows = rowsNow();
    if (!ring.el.isConnected) ring.el = cardByKey(ring.key) || ring.el;
    let ri = -1;
    let ci = -1;
    rows.some((r, i) => {
      ci = r.tiles.indexOf(ring.el);
      if (ci >= 0) ri = i;
      return ci >= 0;
    });
    if (ri < 0) return ringStart();
    let to = null;
    let row = ri;
    let x = null;
    if (dir === 'right' || dir === 'next') {
      if (ci + 1 < rows[ri].tiles.length) to = rows[ri].tiles[ci + 1];
      else if (ri + 1 < rows.length) to = rows[row = ri + 1].tiles[0];
      else return ringTurn(1);
    } else if (dir === 'left' || dir === 'prev') {
      if (ci > 0) to = rows[ri].tiles[ci - 1];
      else if (ri > 0) to = rows[row = ri - 1].tiles[rows[ri - 1].tiles.length - 1];
      else return ringTurn(-1);
    } else {
      row = ri + (dir === 'down' ? 1 : -1);
      if (row >= 0 && row < rows.length) {
        x = ring.x == null ? midX(ring.el) : ring.x;
        to = rows[row].tiles.reduce((a, b) => (Math.abs(midX(b) - x) < Math.abs(midX(a) - x) ? b : a));
      } else if (rows.fixed) {
        to = null;
      } else if (dir === 'down' && rows.length > 1) {
        const stops = stopsNow(rows, pinnedNow());
        const at = glide ? glide.to : window.scrollY;
        if (stops[stops.length - 1] > at + 8) {
          glideTo(stops[stops.length - 1]);
          return true;
        }
      } else if (dir === 'up' && (glide ? glide.to : window.scrollY) > 8) {
        glideTo(0);
        return true;
      }
    }
    if (!to) {
      ui.ringBump(dir);
      return true;
    }
    ringAt = now;
    ringOn(to);
    ring.x = x;
    ring.pos = { ri: row, ci: rows[row].tiles.indexOf(to) };
    if (row !== ri) follow(rows, row);
    return true;
  }

  function ringTurn(dir) {
    if (!list || !go(from() + dir, dir > 0 ? 'next' : 'prev')) {
      ui.ringBump(dir > 0 ? 'right' : 'left');
      return true;
    }
    ui.keys([dir > 0 ? '→' : '←'], false, dir > 0 ? 'next' : 'prev');
    ring.turning = dir > 0 ? 'first' : 'last';
    try { sessionStorage.setItem('speedyPages.ring', JSON.stringify({ which: ring.turning, page: from(), path: location.pathname, t: Date.now() })); } catch (_) { }
    return true;
  }

  function change(by) {
    return setCount(ring.key, countOf(ring.key, cardByKey(ring.key)) + by) || true;
  }

  function undoLast() {
    const u = undone[undone.length - 1];
    if (!u) return false;
    const el = cardByKey(u.key);
    if (!el) {
      ui.ringBump();
      return true;
    }
    undone.pop();
    if (run === u) run = null;
    setCount(u.key, u.from, true);
    const rows = rowsNow();
    const row = rows.findIndex((r) => r.tiles.includes(el));
    ringOn(el);
    ring.x = null;
    if (row >= 0) follow(rows, row);
    return true;
  }

  function toSearch() {
    const box = place.shop.search && place.shop.search();
    if (!box) return false;
    box.focus();
    if (box.select) box.select();
    return true;
  }
  function toCart() {
    const a = place.shop.cart && place.shop.cart();
    if (a) a.click();
    else location.assign('/cart');
    return true;
  }
  function toGo(box) {
    const sh = place.shop;
    const b = box ? sh.choice && sh.choice(box) : sh.go ? sh.go() : null;
    if (b) {
      b.click();
      return true;
    }
    if (box || sh.go) return false;
    return toCart();
  }

  let backAt = 0;
  let pickAt = 0;
  function ringKey(e) {
    const k = e.key;
    const sh = place.shop;
    if (sh.blocked && sh.blocked()) return false;
    if (typed && (k === 'Enter' || k === 'Escape' || k === 'Backspace')) return false;
    const box = modalNow();
    if (quietNow(true)) return false;
    if (!e.shiftKey && !e.repeat && !box && (k === 's' || k === '/')) return toSearch();
    if (!e.shiftKey && !e.repeat && k === 'c') return toGo(box);
    if (!ring) {
      if ((k === 'ArrowDown' || k === 'Tab') && !e.shiftKey) return ringStart();
      return false;
    }
    const el = cardByKey(ring.key);
    const kind = el ? kindOf(el) : 'item';
    const arrow = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
    if (ring.open) {
      if (k === 'ArrowUp' || k === 'ArrowDown') return e.repeat || change(k === 'ArrowUp' ? 1 : -1);
      if (/^[0-9]$/.test(k)) {
        const now = Date.now();
        ring.digits = (ring.digitsAt && now - ring.digitsAt < TYPE_MS ? ring.digits || '' : '') + k;
        ring.digitsAt = now;
        return setCount(ring.key, parseInt(ring.digits, 10)) || true;
      }
      if (k === 'Enter' || k === 'Escape') {
        ring.open = false;
        return true;
      }
    }
    if (k === '=' || k === '+' || k === '-' || k === '_') {
      if (e.repeat) return true;
      if (kind !== 'item') {
        ui.ringBump();
        return true;
      }
      return change(k === '=' || k === '+' ? 1 : -1);
    }
    if (arrow && !e.shiftKey) {
      ring.open = false;
      return moveRing(arrow, e.repeat);
    }
    if (k === 'Tab') {
      ring.open = false;
      return moveRing(e.shiftKey ? 'prev' : 'next', e.repeat);
    }
    if (k === 'Enter') {
      if (e.repeat || !el) return true;
      if (kind === 'item') {
        if (!sh.main(el)) ui.ringBump();
        else {
          change(1);
          ring.open = true;
          ring.digits = '';
        }
        return true;
      }
      if (kind === 'spend' && Date.now() - ring.since < SPEND_WAIT_MS) {
        ui.ringBump();
        return true;
      }
      if (Date.now() - pickAt < PICK_HOLD_MS) return true;
      pickAt = Date.now();
      pressTile(el);
      return true;
    }
    if (k === 'Escape') {
      if (box) return false;
      const out = sh.back && sh.back();
      if (out) {
        if (Date.now() - backAt > 1500) {
          backAt = Date.now();
          out.click();
        }
        return true;
      }
      ringOff();
      return true;
    }
    if (!e.shiftKey && !e.repeat && el && kind === 'item' && sh.parts && /^[a-z]$/i.test(k)) {
      const b = (sh.parts(el).keys || {})[k.toLowerCase()];
      if (b) {
        b.click();
        return true;
      }
    }
    return false;
  }

  let autoDone = '';
  function autoRing() {
    const sh = place.shop;
    if ((sh.blocked && sh.blocked()) || quietNow()) return;
    const box = modalNow();
    const to = box ? (sh.choice && sh.choice(box)) || tilesNow()[0] || null : sh.start ? sh.start() : null;
    if (!to) {
      if (!box && autoDone.includes('|choice:')) autoDone = '';
      return;
    }
    const sig = location.pathname + '|' + keyOf(to);
    if (sig === autoDone) return;
    autoDone = sig;
    if (ring && !box && cardByKey(ring.key)) return;
    const back = ring ? (ring.key.startsWith('choice:') ? ring.back : ring.key) : null;
    ringOn(to);
    ring.back = back;
    ring.x = null;
    setPos();
  }

  let pinnedSeen = { at: 0, v: 0 };
  const stuckSeen = new WeakMap();
  function stuck(el) {
    const now = Date.now();
    const s = stuckSeen.get(el);
    if (s && now - s.at < 2000) return s.v;
    let v = false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky') { v = true; break; }
    }
    stuckSeen.set(el, { at: now, v });
    return v;
  }
  function ringInfo() {
    if (!ring || !shop()) return null;
    const sh = place.shop;
    const box = modalNow();
    if ((sh.blocked && sh.blocked()) || quietNow()) return { gone: true };
    if (!ring.el.isConnected || (box ? !box.contains(ring.el) : !tilesNow().includes(ring.el))) {
      const into = box && !box.contains(ring.el) && ring.el.isConnected ? (sh.choice && sh.choice(box)) || tilesNow()[0] : null;
      const el = into || cardByKey(ring.key) || (ring.back && cardByKey(ring.back));
      if (el) {
        const back = into ? ring.key : null;
        ringOn(el);
        if (back) ring.back = back;
        ring.lostAt = 0;
        setPos();
      } else {
        const rows = rowsNow();
        if (!ring.lostAt) ring.lostAt = Date.now();
        const turned = ring.turning || pending != null;
        if (!rows.length || (!place.scene && !turned && Date.now() - ring.lostAt < 2500)) return { gone: true };
        let row;
        let col;
        if (turned) {
          row = ring.turning === 'last' ? rows.length - 1 : 0;
          col = ring.turning === 'last' ? rows[row].tiles.length - 1 : 0;
        } else {
          row = Math.min(ring.pos ? ring.pos.ri : 0, rows.length - 1);
          col = Math.min(ring.pos ? ring.pos.ci : 0, rows[row].tiles.length - 1);
        }
        ring.turning = null;
        ring.lostAt = 0;
        ringOn(rows[row].tiles[col]);
        ring.x = null;
        ring.pos = { ri: row, ci: col };
        if (turned) follow(rows, row);
      }
    }
    const now = Date.now();
    if (now - pinnedSeen.at > 400) pinnedSeen = { at: now, v: pinnedNow() };
    const el = ring.el;
    const kind = kindOf(el);
    const count = kind === 'item' ? countOf(ring.key, el) : 0;
    const hints = [];
    if (kind === 'item') {
      const parts = sh.parts ? sh.parts(el) : null;
      if (parts && (parts.less || parts.more || Object.values(parts.keys || {}).some(Boolean))) {
        if (parts.less) hints.push({ el: parts.less, keys: [ring.open ? '↓' : '-'] });
        if (parts.more) hints.push({ el: parts.more, keys: [ring.open ? '↑' : '='] });
        for (const [key, b] of Object.entries(parts.keys || {})) if (b) hints.push({ el: b, keys: [key.toUpperCase()] });
      } else {
        const main = sh.main(el);
        if (main) hints.push({ el: main, keys: ring.open ? ['↓', '↑'] : count > 0 ? ['-', '='] : ['↵'], within: el });
      }
    } else if (kind === 'spend') hints.push({ el, keys: ['↵'] });
    if (sh.marks && !box) for (const m of sh.marks()) hints.push(m);
    return {
      rect: el.getBoundingClientRect(),
      key: ring.key,
      style: kind === 'spend' ? 'spend' : ring.open ? 'open' : 'here',
      count,
      waiting: kind === 'item' && ((want.has(ring.key) && sh.count(el) !== want.get(ring.key)) || !!(sh.saving && sh.saving(el))),
      tint: sh.tint,
      pinned: box ? 0 : pinnedSeen.v,
      hints: hints.map((h) => ({ keys: h.keys, rect: h.el.getBoundingClientRect(), within: h.within ? h.within.getBoundingClientRect() : null, top: !!h.top, stuck: !!h.top && stuck(h.el) })).filter((h) => h.rect.width > 0),
    };
  }

  function onKey(e) {
    const mine = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if (!list && document.readyState === 'loading') check();
    if (shop() && ((place.shop.blocked && place.shop.blocked()) || quietNow(true))) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && shop() && !takesKeys(focused()) && !quietNow()) {
      const site = place.shop.undo && place.shop.undo();
      if (site) {
        site.click();
        mine();
      } else if (undoLast()) mine();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (shop() && !takesKeys(focused()) && ringKey(e)) return void mine();
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && place && place.tiles) {
      if (takesKeys(focused())) return;
      if (rowStep(e.key === 'ArrowDown' ? 1 : -1, e.repeat)) {
        if (!e.repeat) ui.keys([e.key === 'ArrowDown' ? '↓' : '↑'], false, 'row');
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }
    if (!list) return;
    if (takesKeys(focused())) return;
    const k = e.key;
    let used = true;
    if (/^[0-9]$/.test(k)) {
      if (!typed && k === '0') used = false;
      else {
        typed += k;
        clearTimeout(typeTimer);
        if (digitStep(typed, lastOf()) === 'go') {
          ui.keys(typed.split(''), false, 'mid');
          commitTyped();
        } else {
          ui.keys(typed.split(''), true, 'mid');
          typeTimer = setTimeout(commitTyped, TYPE_MS);
        }
      }
    } else if ((k === 'ArrowRight' || k === 'ArrowLeft') && !e.shiftKey) {
      if (!e.repeat) {
        clearTyped();
        const side = k === 'ArrowRight' ? 'next' : 'prev';
        if (go(from() + (side === 'next' ? 1 : -1), side)) ui.keys([side === 'next' ? '→' : '←'], false, side);
      }
    } else if (typed && k === 'Enter') {
      commitTyped();
    } else if (typed && k === 'Backspace') {
      typed = typed.slice(0, -1);
      clearTimeout(typeTimer);
      ui.keys(typed ? typed.split('') : null, !!typed, 'mid');
      if (typed) typeTimer = setTimeout(commitTyped, TYPE_MS);
    } else if (typed && k === 'Escape') {
      clearTyped();
      ui.keys(null);
    } else used = false;
    if (used) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  const ui = (() => {
    const hostEl = document.createElement('div');
    hostEl.setAttribute('data-speedy-pages', '');
    const root = hostEl.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
:host{all:initial}
.wrap,.wrap *{box-sizing:border-box}
.wrap{
  --sp-1:4px;--sp-2:8px;--sp-3:12px;--sp-4:16px;
  --bg-surface:rgba(12,13,16,.66);--bg-surface-strong:rgba(12,13,16,.88);
  --border-inner:rgba(255,255,255,.16);--border-outer:rgba(0,0,0,.72);--divider:rgba(255,255,255,.10);--key-fill:rgba(255,255,255,.16);
  --text-primary:#f4f4f5;--accent-active:#5eead4;--accent-border:rgba(94,234,212,.38);
  --radius:12px;--radius-key:6px;--key-w:32px;--ease:cubic-bezier(.22,1,.36,1);
  position:fixed;left:50%;bottom:max(var(--sp-4),env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;
  max-width:calc(100vw - var(--sp-4));
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;font-variant-numeric:tabular-nums;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;color:var(--text-primary);
  pointer-events:none;user-select:none;-webkit-user-select:none}
.wrap[hidden],.bar[hidden]{display:none}
.surface{background:var(--bg-surface);border:1px solid var(--border-inner);box-shadow:0 0 0 1px var(--border-outer);
  border-radius:var(--radius);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}

.bar{display:flex;align-items:center;height:44px;padding:0 var(--sp-1);pointer-events:auto;
  transition:background-color 240ms ease,border-color 240ms ease,opacity 240ms ease}
.bar:hover,.bar:focus-within,.bar[data-live="1"]{background:var(--bg-surface-strong)}
.bar[data-live="1"]{border-color:var(--accent-border)}
.bar[data-bump="1"]{animation:bump 240ms var(--ease)}
.bar[data-away="1"]{opacity:0;pointer-events:none}
@keyframes bump{30%{transform:translateX(-4px)}70%{transform:translateX(4px)}}
.pages{display:flex;align-items:center}
button{all:unset;box-sizing:border-box;flex:none;height:44px;padding:0 2px;display:flex;align-items:center;justify-content:center;cursor:pointer}
.cap{display:flex;align-items:center;justify-content:center;min-width:var(--key-w);height:32px;padding:0 var(--sp-1);
  border:1px solid transparent;border-radius:var(--radius-key);font-size:14px;font-weight:500;line-height:1;white-space:nowrap;color:var(--text-primary);
  transition:background-color 120ms ease,border-color 120ms ease,color 120ms ease,transform 80ms ease}
.arrow .cap{min-width:32px;border-color:var(--border-inner);border-bottom-width:2px;font-size:16px}
button:hover .cap{background:var(--divider);border-color:var(--border-inner)}
button:focus-visible .cap{outline:2px solid var(--accent-active);outline-offset:1px}
.arrow[data-press="1"] .cap{transform:translateY(1px);color:var(--accent-active);border-color:var(--accent-border)}
.arrow[data-stay="1"] .cap{animation:stay 280ms var(--ease)}
@keyframes stay{0%{transform:scale(1)}35%{transform:scale(1.28);opacity:1;background:var(--key-fill);border-color:var(--text-primary)}100%{transform:scale(1)}}
button:disabled{cursor:default}
button:disabled .cap{opacity:.35;background:none;border-color:var(--border-inner)}
.num[aria-current="page"] .cap{background:var(--key-fill);border-color:var(--border-inner);font-weight:700}
.bar[data-live="1"] .num[aria-current="page"] .cap{color:var(--accent-active);border-color:var(--accent-border)}
.gap{flex:none;min-width:calc(var(--key-w) + var(--sp-1));text-align:center;font-size:14px;line-height:1;opacity:.6}

.cast{position:absolute;left:50%;bottom:calc(100% + var(--sp-2));overflow:hidden;display:flex;align-items:center;padding:var(--sp-1);
  background:rgba(0,0,0,.3);transform-origin:50% 100%;--cast-opacity:1;
  visibility:hidden;opacity:0;transform:translate(-50%,-4px);
  transition:opacity 400ms var(--ease),transform 400ms var(--ease),visibility 0s linear 400ms}
.cast[data-on="1"]{visibility:visible;opacity:var(--cast-opacity);transform:translate(-50%,0);transition:none}
.cast[data-rise="1"]{animation:rise 240ms var(--ease)}
@keyframes rise{from{opacity:.25;transform:translate(-50%,calc(100% + var(--sp-2))) scale(.7)}to{opacity:var(--cast-opacity);transform:translate(-50%,0) scale(1)}}
.keys{display:flex;align-items:center;gap:var(--sp-1)}
.key{display:flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 var(--sp-2);
  border:1px solid var(--border-inner);border-bottom-width:2px;border-radius:var(--radius-key);
  font-size:16px;font-weight:600;line-height:1;white-space:nowrap;color:#fff;border-color:rgba(255,255,255,.55)}
.cast[data-dim="1"] .key{opacity:.6}
.cast[data-from="row"]{--cast-opacity:.85}
.cast[data-from="row"] .key{min-width:24px;height:24px;padding:0 var(--sp-1);border-bottom-width:1px;font-size:14px;font-weight:500}
.cast[data-from="row"][data-rise="1"]{animation:lift 160ms var(--ease)}
@keyframes lift{from{opacity:0;transform:translate(-50%,6px)}to{opacity:var(--cast-opacity);transform:translate(-50%,0)}}
.clock{position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--accent-active);transform-origin:left center;transform:scaleX(0)}
.clock[data-run="1"]{animation:clock ${TYPE_MS}ms linear forwards}
@keyframes clock{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@media (prefers-reduced-motion:reduce){
  .cast,.cast[data-on="1"]{transition:opacity 120ms linear,visibility 0s}
  .cast[data-rise="1"],.bar[data-bump="1"],.arrow[data-stay="1"] .cap{animation:none}
  .clock[data-run="1"]{animation:none;transform:scaleX(0)}
  .cap{transition:none}
}
.layer,.layer *,.tops,.tops *{box-sizing:border-box}
.layer,.tops{z-index:2147482990;pointer-events:none;user-select:none;-webkit-user-select:none;
  --tint:#0053e2;--tint-2:#ffc220;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.layer{position:absolute;left:0;top:0;width:0;height:0;overflow:visible}
.tops{position:fixed;left:0;right:0;top:0;bottom:0;overflow:hidden}
.layer[hidden],.layer [hidden],.tops[hidden],.tops [hidden]{display:none}
.ring{position:absolute;left:0;top:0;will-change:transform}
.band{position:absolute;left:0;top:0;right:0;bottom:0;border:3px dashed var(--tint);border-radius:12px;box-shadow:0 0 0 2px rgba(255,255,255,.92)}
.ring[data-kind="open"] .band{border:4px solid var(--tint);box-shadow:0 0 0 4px var(--tint-2),0 0 0 6px rgba(255,255,255,.92)}
.ring[data-kind="spend"] .band{border:2px solid var(--tint);outline:2px dashed var(--tint);outline-offset:2px;box-shadow:0 0 0 6px rgba(255,255,255,.92)}
.band[data-pop="1"]{animation:pop 200ms cubic-bezier(.22,1,.36,1)}
@keyframes pop{from{transform:scale(1.04)}to{transform:scale(1)}}
.band[data-bump="x"]{animation:bumpx 200ms cubic-bezier(.22,1,.36,1)}
.band[data-bump="y"]{animation:bumpy 200ms cubic-bezier(.22,1,.36,1)}
@keyframes bumpx{30%{transform:translateX(-6px)}70%{transform:translateX(6px)}}
@keyframes bumpy{30%{transform:translateY(-6px)}70%{transform:translateY(6px)}}
.badge{position:absolute;right:-12px;top:-12px;min-width:32px;height:32px;padding:0 8px;display:flex;align-items:center;justify-content:center;
  border-radius:16px;border:2px solid #fff;background:var(--tint);color:#fff;font-size:16px;font-weight:700;line-height:1}
.badge[data-waiting="1"]{background:#fff;color:var(--tint);border:2px dashed var(--tint)}
.hint{position:absolute;left:0;top:0;display:flex;align-items:center;gap:4px;height:var(--h,24px);opacity:.96}
.hint .k{display:flex;align-items:center;justify-content:center;min-width:var(--h,24px);height:100%;padding:0 calc(var(--h,24px)*.28);
  border:1px solid rgba(0,0,0,.22);border-radius:calc(var(--h,24px)*.28);background:linear-gradient(#fff,#f1f3f6);
  box-shadow:0 calc(var(--h,24px)*.1) 0 var(--tint-2),0 calc(var(--h,24px)*.1 + 3px) 8px rgba(0,0,0,.16);
  color:var(--tint);font-size:calc(var(--h,24px)*.44);font-weight:700;line-height:1;white-space:nowrap}
.hint .k[data-word]::before{content:attr(data-word);margin-right:.4em;font-size:.92em;letter-spacing:.01em}
@media (prefers-reduced-motion:reduce){.band[data-pop="1"],.band[data-bump]{animation:none}}
@media print{.wrap,.layer{display:none}}
</style>
<div class="layer" hidden aria-hidden="true">
  <div class="ring"><div class="band"></div><span class="badge" hidden></span></div>
  <div class="hints"></div>
</div>
<div class="tops" hidden aria-hidden="true"></div>
<div class="wrap" hidden>
  <div class="cast surface" aria-hidden="true"><span class="keys"></span><span class="clock"></span></div>
  <div class="bar surface" role="navigation" aria-label="Pages">
    <button class="arrow prev" type="button" aria-label="Previous page"><span class="cap">←</span></button>
    <span class="pages"></span>
    <button class="arrow next" type="button" aria-label="Next page"><span class="cap">→</span></button>
  </div>
</div>`;
    const $ = (s) => root.querySelector(s);
    const wrap = $('.wrap');
    const cast = $('.cast');
    const keysEl = $('.keys');
    const clock = $('.clock');
    const bar = $('.bar');
    const pagesEl = $('.pages');
    const prev = $('.prev');
    const next = $('.next');
    let castTimer = 0;
    let liveTimer = 0;
    let pressTimer = 0;
    let shown = '';
    prev.addEventListener('click', () => list && go(from() - 1, 'prev'));
    next.addEventListener('click', () => list && go(from() + 1, 'next'));
    pagesEl.addEventListener('click', (e) => {
      const b = e.target.closest ? e.target.closest('button.num') : null;
      if (b && list) go(Number(b.getAttribute('data-page')));
    });
    bar.addEventListener('animationend', (e) => {
      if (e.target === bar) bar.removeAttribute('data-bump');
      else if (e.animationName === 'stay') e.target.parentElement.removeAttribute('data-stay');
    });
    cast.addEventListener('animationend', (e) => { if (e.target === cast) cast.removeAttribute('data-rise'); });
    if (window.__speedyPagesTest) window.__speedyPagesTest.root = root;

    function mount() {
      if (!hostEl.isConnected && document.documentElement) document.documentElement.append(hostEl);
    }

    let watched = null;
    const watcher = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
        const e = entries[entries.length - 1];
        if (e.target !== watched) return;
        if (e.isIntersecting) bar.setAttribute('data-away', '1');
        else bar.removeAttribute('data-away');
      }, { threshold: 0.5 })
      : null;
    function watch(el) {
      if (!watcher || el === watched) return;
      if (watched) watcher.unobserve(watched);
      watched = el;
      bar.removeAttribute('data-away');
      if (el) watcher.observe(el);
    }

    function render(page, last) {
      if (page == null) {
        bar.hidden = true;
        wrap.hidden = !place;
        shown = '';
        watch(null);
        return;
      }
      bar.hidden = false;
      const sig = page + '/' + last;
      if (sig !== shown) {
        shown = sig;
        const digits = String(last || page + 1).length;
        wrap.style.setProperty('--key-w', (digits <= 2 ? 32 : 16 + 8 * digits) + 'px');
        pagesEl.replaceChildren(...pageSlots(page, last).map((slot) => {
          if (slot === '…') {
            const gap = document.createElement('span');
            gap.className = 'gap';
            gap.setAttribute('aria-hidden', 'true');
            gap.textContent = '…';
            return gap;
          }
          const b = document.createElement('button');
          b.className = 'num';
          b.type = 'button';
          b.setAttribute('data-page', String(slot));
          b.setAttribute('aria-label', 'Page ' + slot);
          if (slot === page) b.setAttribute('aria-current', 'page');
          const cap = document.createElement('span');
          cap.className = 'cap';
          cap.textContent = String(slot);
          b.append(cap);
          return b;
        }));
        prev.disabled = page <= 1;
        next.disabled = !!last && page >= last;
      }
      wrap.hidden = false;
      mount();
    }

    const layer = $('.layer');
    const ringEl = $('.ring');
    const band = $('.band');
    const badge = $('.badge');
    const hintsEl = $('.hints');
    const topsEl = $('.tops');
    const cap = (key) => {
      const el = document.createElement('span');
      el.className = 'k';
      el.textContent = key;
      if (key === '↵') el.setAttribute('data-word', 'enter');
      return el;
    };
    function chips(list) {
      while (topsEl.children.length < list.length) {
        const chip = document.createElement('div');
        chip.className = 'hint';
        topsEl.append(chip);
      }
      [...topsEl.children].forEach((chip, i) => {
        const h = list[i];
        const on = !!h && h.rect.bottom > 0 && h.rect.top < window.innerHeight;
        chip.hidden = !on;
        if (!on) return;
        const sig = h.keys.join(' ');
        if (chip.getAttribute('data-sig') !== sig) {
          chip.setAttribute('data-sig', sig);
          chip.replaceChildren(...h.keys.map(cap));
        }
        chip.style.setProperty('--h', '22px');
        const hx = h.rect.width > 200 ? h.rect.left + 12 : h.rect.left + (h.rect.width - chip.offsetWidth) / 2;
        chip.style.transform = 'translate(' + Math.round(hx) + 'px,' + Math.round(h.rect.bottom - 10) + 'px)';
      });
    }
    let painting = false;
    let drawn = null;
    let tween = null;
    band.addEventListener('animationend', () => { band.removeAttribute('data-pop'); band.removeAttribute('data-bump'); });
    function paint(now) {
      const info = painting ? ringInfo() : null;
      if (!info) {
        painting = false;
        layer.hidden = true;
        topsEl.hidden = true;
        drawn = null;
        return;
      }
      requestAnimationFrame(paint);
      if (info.gone) {
        layer.hidden = true;
        topsEl.hidden = true;
        drawn = null;
        return;
      }
      const sx = window.scrollX;
      const sy = window.scrollY;
      const aim = { x: info.rect.left + sx - 6, y: info.rect.top + sy - 6, w: info.rect.width + 12, h: info.rect.height + 12 };
      if (!drawn || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        drawn = aim;
        tween = null;
      } else {
        if (!tween || tween.key !== info.key) {
          const g = glide;
          tween = { key: info.key, from: { x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h }, to: aim, t0: g ? g.t0 : now, ms: g ? g.ms : RING_MS, ease: g ? g.ease : easeOut };
        } else tween.to = aim;
        const p = Math.min(1, Math.max(0, (now - tween.t0) / tween.ms));
        const e = tween.ease(p);
        for (const f of ['x', 'y', 'w', 'h']) drawn[f] = tween.from[f] + (tween.to[f] - tween.from[f]) * e;
      }
      for (const box of [layer, topsEl]) {
        box.style.setProperty('--tint', info.tint[0]);
        box.style.setProperty('--tint-2', info.tint[1]);
      }
      ringEl.style.transform = 'translate(' + drawn.x.toFixed(1) + 'px,' + drawn.y.toFixed(1) + 'px)';
      const under = Math.max(0, sy + info.pinned - drawn.y);
      ringEl.style.clipPath = under > 0 ? 'inset(' + under.toFixed(0) + 'px -48px -48px -48px)' : '';
      ringEl.style.width = drawn.w.toFixed(1) + 'px';
      ringEl.style.height = drawn.h.toFixed(1) + 'px';
      if (ringEl.getAttribute('data-kind') !== info.style) {
        ringEl.setAttribute('data-kind', info.style);
        if (info.style === 'open') band.setAttribute('data-pop', '1');
      }
      const showCount = info.count > 0 || info.style === 'open' || info.waiting;
      badge.hidden = !showCount;
      if (showCount) {
        if (badge.textContent !== String(info.count)) badge.textContent = String(info.count);
        badge.setAttribute('data-waiting', info.waiting ? '1' : '0');
      }
      const low = info.hints.filter((h) => !h.stuck);
      chips(info.hints.filter((h) => h.stuck));
      while (hintsEl.children.length < low.length) {
        const chip = document.createElement('div');
        chip.className = 'hint';
        hintsEl.append(chip);
      }
      [...hintsEl.children].forEach((chip, i) => {
        const h = low[i];
        chip.hidden = !h;
        if (!h) return;
        const sig = h.keys.join(' ');
        if (chip.getAttribute('data-sig') !== sig) {
          chip.setAttribute('data-sig', sig);
          chip.replaceChildren(...h.keys.map(cap));
        }
        const H = h.top ? 22 : h.within ? Math.max(24, Math.min(40, Math.round(h.rect.height))) : h.keys.includes('↵') ? 28 : 22;
        chip.style.setProperty('--h', H + 'px');
        const w = chip.offsetWidth;
        let hx;
        let hy;
        if (h.top) {
          hx = h.rect.width > 200 ? h.rect.left + 12 : h.rect.left + (h.rect.width - w) / 2;
          hy = h.rect.bottom - 10;
        } else if (h.within && h.rect.right + 8 + w <= h.within.right - 4) {
          hx = h.rect.right + 8;
          hy = h.rect.top + (h.rect.height - H) / 2;
        } else {
          hx = h.within ? h.rect.left : h.rect.width > 200 ? h.rect.right - w : h.rect.left + (h.rect.width - w) / 2;
          hy = h.rect.top - H - 6;
        }
        if (!h.top && hy < info.pinned - 2) chip.hidden = true;
        chip.style.transform = 'translate(' + Math.round(hx + sx) + 'px,' + Math.round(hy + sy) + 'px)';
      });
      layer.hidden = false;
      topsEl.hidden = false;
    }

    return {
      render,
      watch,
      ring(on) {
        mount();
        if (on && !painting) {
          painting = true;
          requestAnimationFrame(paint);
        }
      },
      ringBump(dir) {
        band.removeAttribute('data-bump');
        void band.offsetWidth;
        band.setAttribute('data-bump', dir === 'up' || dir === 'down' ? 'y' : 'x');
      },
      keys(keys, counting, from) {
        mount();
        wrap.hidden = false;
        clearTimeout(castTimer);
        clock.removeAttribute('data-run');
        if (!keys) {
          cast.removeAttribute('data-on');
          return;
        }
        keysEl.replaceChildren(...keys.map((k) => {
          const s = document.createElement('span');
          s.className = 'key';
          s.textContent = k;
          return s;
        }));
        const source = from === 'prev' ? prev : from === 'next' ? next : pagesEl;
        const box = source.getBoundingClientRect();
        const frame = wrap.getBoundingClientRect();
        cast.style.left = box.width && frame.width && from !== 'row' ? Math.round(box.left + box.width / 2 - frame.left) + 'px' : '50%';
        cast.setAttribute('data-from', from || 'mid');
        cast.removeAttribute('data-dim');
        if (cast.getAttribute('data-on') !== '1' || from !== 'mid') {
          cast.removeAttribute('data-rise');
          void cast.offsetWidth;
          cast.setAttribute('data-rise', '1');
        }
        cast.setAttribute('data-on', '1');
        if (from === 'prev' || from === 'next') {
          clearTimeout(pressTimer);
          prev.removeAttribute('data-press');
          next.removeAttribute('data-press');
          source.setAttribute('data-press', '1');
          pressTimer = setTimeout(() => source.removeAttribute('data-press'), 200);
        }
        if (counting) {
          void clock.offsetWidth;
          clock.setAttribute('data-run', '1');
        }
        castTimer = setTimeout(() => cast.removeAttribute('data-on'), from === 'row' ? 400 : (counting ? TYPE_MS : 0) + 600);
      },
      live() {
        if (list) render(from(), lastOf());
        bar.setAttribute('data-live', '1');
        clearTimeout(liveTimer);
        liveTimer = setTimeout(() => bar.removeAttribute('data-live'), 1600);
      },
      bump(side) {
        bar.removeAttribute('data-bump');
        void bar.offsetWidth;
        bar.setAttribute('data-bump', '1');
        if (side !== 'prev' && side !== 'next') {
          cast.setAttribute('data-dim', '1');
          return;
        }
        clearTimeout(castTimer);
        cast.removeAttribute('data-on');
        const key = side === 'prev' ? prev : next;
        key.removeAttribute('data-stay');
        void key.offsetWidth;
        key.setAttribute('data-stay', '1');
      },
    };
  })();

  function asked() {
    try {
      const a = JSON.parse(sessionStorage.getItem('speedyPages.asked') || 'null');
      return a && Date.now() - a.t < 15000 ? a : null;
    } catch (_) { return null; }
  }

  let ringBackDone = false;
  function ringBack() {
    if (ringBackDone) return;
    let note = null;
    try { note = JSON.parse(sessionStorage.getItem('speedyPages.ring') || 'null'); } catch (_) { }
    const drop = () => { ringBackDone = true; try { sessionStorage.removeItem('speedyPages.ring'); } catch (_) { } };
    if (!note || ring || Date.now() - note.t > 15000 || note.path !== location.pathname || place.current() !== note.page) return drop();
    const rows = rowsNow();
    if (!rows.length) return;
    drop();
    const row = note.which === 'last' ? rows.length - 1 : 0;
    const col = note.which === 'last' ? rows[row].tiles.length - 1 : 0;
    ringOn(rows[row].tiles[col]);
    ring.pos = { ri: row, ci: col };
    follow(rows, row);
  }

  let lastSig = '';
  function check() {
    const found = LISTS.find((l) => l.test()) || null;
    place = found;
    if (ring && !shop()) ringOff();
    if (shop()) {
      if (found.shop.arrive) found.shop.arrive();
      autoRing();
      ringBack();
    }
    const bar = found && found.bar();
    const ready = visible(bar) && (found.last() === 0 || found.last() >= 2);
    const note = found ? asked() : null;

    if (pending != null && (Date.now() - pendingAt >= PENDING_MS || (ready && found.current() === pending))) pending = null;

    if (ready) {
      list = found;
      if (turnedAt && found.marked) {
        const shown = found.marked();
        if (shown && shown === found.current()) turnedAt = 0;
        else if (shown && Date.now() - turnedAt > 3000 && pending == null) {
          turnedAt = 0;
          location.reload();
          return;
        }
      }
      known = { name: found.name, last: found.last() };
      ui.watch(bar);
      const sig = list.name + '|' + from() + '|' + list.last();
      if (sig !== lastSig) {
        lastSig = sig;
        ui.render(from(), list.last());
      }
      if (note && pending == null && note.page === list.current()) {
        try { sessionStorage.removeItem('speedyPages.asked'); } catch (_) { }
        ui.live();
      }
    } else if (note) {
      list = found;
      lastSig = '';
      ui.watch(null);
      ui.render(from(), lastOf());
    } else {
      list = null;
      lastSig = '';
      if (!found) known = null;
      ui.render(null);
    }
    if (!list && typed) {
      clearTyped();
      ui.keys(null);
    }
  }

  const letGo = () => {
    if (!glide) return;
    cancelAnimationFrame(glide.raf);
    glide = null;
  };
  for (const type of ['wheel', 'touchstart', 'pointerdown']) window.addEventListener(type, (e) => { if (e.isTrusted) letGo(); }, { capture: true, passive: true });
  window.addEventListener('keydown', (e) => { if (e.isTrusted && /^(PageUp|PageDown|Home|End| )$/.test(e.key)) letGo(); }, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('click', (e) => {
    if (!e.isTrusted || !want.size || !shop() || !(e.target instanceof Element)) return;
    for (const t of tilesNow()) {
      if (!t.contains(e.target)) continue;
      const key = keyOf(t);
      want.delete(key);
      if (run && run.key === key) run = null;
    }
  }, true);
  window.addEventListener('popstate', onPop);
  window.addEventListener('pageshow', check);
  setInterval(check, 400);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check, { once: true });
  else check();
})();
