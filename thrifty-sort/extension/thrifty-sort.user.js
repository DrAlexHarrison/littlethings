// ==UserScript==
// @name         Thrifty Sort
// @namespace    https://github.com/DrAlexHarrison/littlethings
// @version      1.8.1
// @description  Sorts Walmart and Amazon search results by price per ounce, per fluid ounce or per count, cheapest first, and adds those sorts to each site's Sort menu.
// @match        https://www.walmart.com/*
// @match        https://www.amazon.com/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/DrAlexHarrison/littlethings/main/thrifty-sort/extension/thrifty-sort.user.js
// @updateURL    https://raw.githubusercontent.com/DrAlexHarrison/littlethings/main/thrifty-sort/extension/thrifty-sort.user.js
// ==/UserScript==

(() => {
  'use strict';

  const CACHE_MINUTES = 20;
  const PAUSE_MINUTES = 30;
  const MIN_PRICED = 3;
  const MIN_DERIVED = 8;
  const MIN_SHARE = 0.5;
  const OUTLIER_PERCENTILE = 0.1;
  const OUTLIER_DIVISOR = 4;
  const DISPUTE_FACTOR = 1.5;

  const num = (s) => parseFloat(String(s).replace(/[$,\s]/g, ''));

  const UNITS = {};
  const addUnits = (measure, unit, factor, names) => names.split(' ').forEach((n) => { UNITS[n] = [measure, unit, factor]; });
  addUnits('weight', 'oz', 1, 'oz ounce ounces');
  addUnits('weight', 'lb', 16, 'lb lbs pound pounds');
  addUnits('weight', 'g', 1 / 28.3495, 'g gram grams');
  addUnits('weight', 'kg', 35.274, 'kg kilogram kilograms');
  addUnits('volume', 'fl oz', 1, 'floz fluidounce fluidounces');
  addUnits('volume', 'gal', 128, 'gal gallon gallons');
  addUnits('volume', 'qt', 32, 'qt quart quarts');
  addUnits('volume', 'pt', 16, 'pt pint pints');
  addUnits('volume', 'L', 33.814, 'l liter liters litre litres');
  addUnits('volume', 'ml', 1 / 29.5735, 'ml milliliter milliliters millilitre millilitres');
  addUnits('count', 'ea', 1, 'ea each ct count cnt pc pcs piece pieces item items unit units wipe wipes pad pads tablet tablets capsule capsules softgel softgels gummy gummies roll rolls bag bags pod pods bar bars can cans bottle bottles stick sticks packet packets pouch pouches diaper diapers tampon tampons liner liners egg eggs');
  const OTHER_NAMES = { sqft: 'sq ft', squarefoot: 'sq ft', squarefeet: 'sq ft', cuft: 'cu ft', foot: 'ft', feet: 'ft', yard: 'yd', yards: 'yd', inch: 'in', inches: 'in' };
  const BASE_UNIT = { weight: 'oz', volume: 'fl oz', count: 'ea' };
  const UNIT_FACTOR = { oz: 1, lb: 16, g: 1 / 28.3495, kg: 35.274, 'fl oz': 1, gal: 128, qt: 32, pt: 16, L: 33.814, ml: 1 / 29.5735 };

  function unitInfo(raw) {
    const u = raw.toLowerCase().replace(/[.\s]/g, '');
    if (UNITS[u]) return { measure: UNITS[u][0], unit: UNITS[u][1], factor: UNITS[u][2] };
    const name = OTHER_NAMES[u] || (u.length > 3 && u.endsWith('s') ? u.slice(0, -1) : u);
    return { measure: name, unit: name, factor: 1 };
  }

  const UNIT_RE = /(?:\$\s*([\d,]*\.?\d+)|([\d,]*\.?\d+)\s*¢)\s*\/\s*(\d+(?:\.\d+)?\s+)?(fl\.?\s?oz|fluid\s+ounces?|sq(?:uare)?\.?\s?(?:ft|feet|foot)|cu\.?\s?ft|[a-z]+)/i;
  function parseUnitPrice(text) {
    const m = UNIT_RE.exec(text || '');
    if (!m) return null;
    const cents = m[1] != null ? num(m[1]) * 100 : num(m[2]);
    const qty = m[3] ? parseFloat(m[3]) : 1;
    const u = unitInfo(m[4]);
    if (!(cents > 0) || !(qty > 0)) return null;
    const printed = m[1] != null ? m[1] : m[2];
    const decimals = printed.includes('.') ? printed.length - printed.indexOf('.') - 1 : 0;
    const halfStep = ((m[1] != null ? 100 : 1) * Math.pow(10, -decimals)) / 2;
    const per = qty * u.factor;
    return { measure: u.measure, unit: qty === 1 ? u.unit : BASE_UNIT[u.measure] || u.unit, value: cents / per, tol: halfStep / per };
  }

  const DEC = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
  const INT = '(\\d{1,3}(?:,\\d{3})+|\\d+)';
  const SIZE_RE = new RegExp(DEC + '\\s*-?\\s*(fl\\.?\\s?oz|fluid\\s+ounces?|ounces?|oz|pounds?|lbs?|kilograms?|kg|grams?|g|gallons?|gal|quarts?|qt|pints?|pt|liters?|litres?|milliliters?|ml|l)\\b', 'ig');
  const NUTRIENT_AFTER = /^\s*(?:of\s+)?(?:protein|fiber|fibre|carbs?|sugars?|fat|bcaas?|eaas?|creatine|collagen|caffeine|isolate|whey|plant|vegan|pea|net\b|added|per\b|a\s+serving|serving)/i;
  const COUNT_NOUN = 'count|ct|cnt|pieces?|pcs?|pc|tampons?|pads?|liners?|wipes?|diapers?|eggs?|bars?|pods?|k-?cups?|capsules?|tablets?|softgels?|gummies|caplets?|lozenges?|tea\\s?bags?|sticks?|packets?|pouches?|cans?|bottles?|towels?|cloths?|razors?|cartridges?|blades?|pairs?|rolls?';
  const ROLL_WORDS = '(?:(?:double|mega|family|big|giant|jumbo|super|huge|triple|regular|large|xl|ultra|plus|strong|select-a-size)\\s+){0,2}';
  const COUNT_RE = new RegExp('(?<![\\d.,])' + INT + '\\s*-?\\s*' + ROLL_WORDS + '(' + COUNT_NOUN + ')\\b', 'ig');
  const COMPARISON_BEFORE = /(?:=|equals?|equal\s+to|equivalent\s+to|like|compared\s+to|vs\.?)\s*$/i;
  const DOZEN_RE = /(?:(\d+)|(half)|a|one)?\s*-?\s*\bdozen\b/ig;
  const PACK_RES = [/(?:pack|case|set|box|bundle|lot)\s+of\s+(\d+)/i, /(?<![\d.,])(\d+)\s*-?\s*(?:packs?|pk)\b/i, /(?<![\d.,])(\d+)\s*x\s*(?=\d)/i];

  function titleFacts(name) {
    const text = String(name || '');
    const sizes = [];
    let m;
    SIZE_RE.lastIndex = 0;
    while ((m = SIZE_RE.exec(text))) {
      const after = text.slice(SIZE_RE.lastIndex, SIZE_RE.lastIndex + 24);
      const u = unitInfo(m[2]);
      if ((u.unit === 'g' || u.unit === 'ml') && NUTRIENT_AFTER.test(after)) continue;
      const amount = num(m[1]) * u.factor;
      if (!(amount > 0)) continue;
      sizes.push({ measure: u.measure, bare: u.unit === 'oz', amount, total: /^\s*\)?\s*(?:total|in\s+total)/i.test(after), perUnit: /^\s*(?:each|ea\b|per\b)/i.test(after) });
    }

    let pack = null;
    let packAt = -1;
    for (const re of PACK_RES) {
      const pm = re.exec(text);
      if (pm) {
        pack = parseInt(pm[1], 10);
        packAt = pm.index + pm[0].indexOf(pm[1]);
        break;
      }
    }
    if (pack == null && /\b(?:twin|double)\s+pack\b/i.test(text)) pack = 2;
    if (pack != null && !(pack >= 1 && pack <= 200)) pack = null;

    const counts = [];
    COUNT_RE.lastIndex = 0;
    while ((m = COUNT_RE.exec(text))) {
      if (COMPARISON_BEFORE.test(text.slice(Math.max(0, m.index - 16), m.index))) continue;
      if (/^\s*(?:per|each)\b/i.test(text.slice(COUNT_RE.lastIndex, COUNT_RE.lastIndex + 8))) continue;
      counts.push({ n: num(m[1]), at: m.index });
    }
    DOZEN_RE.lastIndex = 0;
    while ((m = DOZEN_RE.exec(text))) counts.push({ n: m[2] ? 6 : (m[1] ? parseInt(m[1], 10) : 1) * 12, at: m.index });

    let count = null;
    const distinct = [...new Set(counts.map((c) => c.n))];
    if (distinct.length === 1) {
      const c = counts[0];
      const sameToken = counts.some((x) => x.at === packAt);
      count = c.n * (pack && !sameToken ? pack : 1);
    } else if (!distinct.length && pack) {
      count = pack;
    }
    if (count != null && !(count >= 1 && count <= 100000)) count = null;
    return { sizes, count, pack, packOnly: count != null && !distinct.length };
  }

  function titleSize(facts, measure, bareOz) {
    const list = facts.sizes.filter((s) => (s.bare ? bareOz : s.measure) === measure);
    if (!list.length) return null;
    const total = list.find((s) => s.total);
    if (total) return total.amount;
    const base = list[0];
    if (list.some((s) => Math.abs(s.amount - base.amount) / base.amount > 0.04)) return null;
    if (base.perUnit) {
      const times = facts.count || facts.pack;
      return times ? base.amount * times : null;
    }
    return base.amount * (facts.pack || 1);
  }

  function fmtPrice(cents, unit) {
    if (cents >= 100) return '$' + (cents / 100).toFixed(2) + '/' + unit;
    return (cents >= 1 ? cents.toFixed(1) : cents.toFixed(2)) + ' ¢/' + unit;
  }

  const CASH_AMOUNT_RE = /^(?:get\s+)?\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\s+(walmart\s+cash|claimed)$/i;
  const CASH_NEED_RE = /^(?:manufacturer\s+offer)?\s*(?:\|\s*)?(?:(?:must\s+)?buy\s+(\d{1,2}))?$/i;

  function readCash(lines) {
    let amount = null;
    let need = null;
    let claimed = false;
    for (const raw of lines || []) {
      const line = String(raw).replace(/\s+/g, ' ').trim();
      if (!line) continue;
      const a = CASH_AMOUNT_RE.exec(line);
      if (a && amount == null && /^get\s/i.test(line) === /walmart/i.test(a[2])) {
        amount = Math.round(num(a[1]) * 100);
        claimed = /claimed/i.test(a[2]);
        continue;
      }
      const n = CASH_NEED_RE.exec(line);
      if (n && need == null) {
        need = n[1] ? parseInt(n[1], 10) : 1;
        continue;
      }
      return null;
    }
    if (!(amount > 0) || need === 0) return null;
    return { amount, need: need || 1, claimed };
  }

  function cashFromData(rw) {
    if (!rw || typeof rw !== 'object' || rw.rewardMultiplierStr) return null;
    if (rw.state !== 'UNCLIPPED' && rw.state !== 'CLIPPED') return null;
    const amount = Math.round(Number(rw.rewardAmt) * 100);
    let need = Number(rw.minQuantity) || 1;
    if (rw.restriction) {
      const m = CASH_NEED_RE.exec(String(rw.restriction).replace(/\s+/g, ' ').trim());
      if (!m) return null;
      if (m[1]) need = Math.max(need, parseInt(m[1], 10));
    }
    if (!(amount > 0) || !(need >= 1 && need <= 99) || need !== Math.floor(need)) return null;
    return { amount, need, claimed: rw.state === 'CLIPPED' };
  }

  const priceAfterCash = (price, cash) => (cash && price > 0 ? Math.max(0, price - cash.amount / 100 / cash.need) : price);

  function cashNote(shown, cash, est) {
    const tail = ' after Walmart Cash' + (cash.need > 1 ? ' if you buy ' + cash.need : '');
    return /^0\.00 /.test(shown) ? 'Free' + tail : (est ? '≈ ' : '') + shown + tail;
  }

  function analyze(rows) {
    const priced = {};
    const unitTally = {};
    for (const r of rows) {
      if (!r.unit || r.oos) continue;
      const m = r.unit.measure;
      priced[m] = (priced[m] || 0) + 1;
      unitTally[m] = unitTally[m] || {};
      unitTally[m][r.unit.unit] = (unitTally[m][r.unit.unit] || 0) + 1;
    }
    const byCount = (tally) => Object.keys(tally).sort((a, b) => tally[b] - tally[a]);
    const auto = byCount(priced)[0] || null;
    const bareOz = auto === 'volume' ? 'volume' : 'weight';
    const measures = [...new Set([...Object.keys(priced), 'weight', 'volume', 'count'])];
    const valued = {};
    for (const r of rows) {
      r.vals = {};
      r.paid = priceAfterCash(r.price, r.cash);
      const keep = r.cash && r.price > 0 ? r.paid / r.price : 1;
      const facts = r.price > 0 ? titleFacts(r.name) : null;
      for (const m of measures) {
        let v = null;
        let est = false;
        let disputed = false;
        const size = !facts ? null : m === 'count' ? facts.count : m === 'weight' || m === 'volume' ? titleSize(facts, m, bareOz) : null;
        if (r.unit && r.unit.measure === m) {
          v = r.unit.value;
          if (size && !(m === 'count' && facts.packOnly)) {
            const mine = (r.price * 100) / size;
            const tol = r.unit.tol || 0;
            if (mine < (v - tol) / DISPUTE_FACTOR || mine > (v + tol) * DISPUTE_FACTOR) {
              disputed = true;
              if (mine > v) {
                v = mine;
                est = true;
              }
            }
          }
        } else if (size) {
          v = (r.price * 100) / size;
          est = true;
        }
        if (v != null) {
          r.vals[m] = { v: v * keep, shelf: v, est, disputed, cash: keep !== 1 };
          if (!r.oos && !(est && m === 'count' && facts.packOnly)) valued[m] = (valued[m] || 0) + 1;
        }
      }
    }
    const live = rows.filter((r) => !r.oos).length;
    const options = measures
      .filter((m) => (priced[m] || 0) >= MIN_PRICED || ((valued[m] || 0) >= MIN_PRICED && ((valued[m] || 0) >= MIN_DERIVED || (valued[m] || 0) >= live * MIN_SHARE)))
      .sort((a, b) => (priced[b] || 0) - (priced[a] || 0) || (valued[b] || 0) - (valued[a] || 0));
    const disp = {};
    for (const m of measures) disp[m] = (unitTally[m] && byCount(unitTally[m])[0]) || BASE_UNIT[m] || m;
    return { auto, options, disp, valued, pricedTotal: Object.values(priced).reduce((a, b) => a + b, 0) };
  }

  const STOP_WORDS = new Set('the and for with from that this your into over of in to by on at or as is it an be we us my no up pack packs count ct pcs pc set size oz ounce ounces lb lbs fl per each total pk'.split(' '));
  const plainWords = (text) => String(text || '').toLowerCase().replace(/\b([a-z])\.([a-z])\b\.?/g, '$1$2').replace(/[^a-z]+/g, ' ').split(' ').filter(Boolean);
  function titleWords(name) {
    const out = new Set();
    for (let w of plainWords(name)) {
      if (w.length < 2 || STOP_WORDS.has(w)) continue;
      if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
      out.add(w);
    }
    return out;
  }
  const RELATED_TOP_WORDS = 5;
  const RELATED_SHARE = 0.4;
  const NEXT_WORD_SHARE = 0.15;
  const HEAD_WORD_SHARE = 0.6;

  function wordUse(title, word) {
    const text = ' ' + String(title || '').toLowerCase().replace(/[^a-z0-9,(]+/g, ' ') + ' ';
    const stem = word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
    const plural = new RegExp('\\b(?:' + stem + 's|' + stem + 'es)\\b', 'g');
    const bare = new RegExp('\\b' + stem + '(?= *[,(]| *$| +\\d)');
    let named = bare.test(text);
    let m;
    while (!named && (m = plural.exec(text))) named = !/\b(?:for|holds?|fits?|stores?|carries|like|disposal of|alternative to|use with)(?: [a-z0-9,(]+){0,2} $/.test(text.slice(0, m.index));
    if (named) return 1;
    return new RegExp('\\b' + stem + '(?:s|es)?\\b').test(text) ? 0.6 : 0;
  }
  const askedWords = (query) => plainWords(query).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  function namedAs(title, query) {
    const asked = askedWords(query);
    if (!asked.length) return 1;
    return asked.reduce((sum, w) => sum + (wordUse(title, w) || 0.5), 0) / asked.length;
  }

  function nextWords(name, stem) {
    const words = plainWords(name);
    const out = [];
    words.forEach((w, i) => {
      if ((w === stem || w === stem + 's' || w === stem + 'es') && words[i + 1] && !STOP_WORDS.has(words[i + 1])) out.push([...titleWords(words[i + 1])][0] || words[i + 1]);
    });
    return out;
  }

  function relate(rows, query) {
    const first = Math.min(...rows.map((r) => r.page || 1));
    const ref = rows.filter((r) => (r.page || 1) === first);
    for (const r of rows) r.related = true;
    if (ref.length < 8) return null;
    const df = {};
    for (const r of ref) for (const w of titleWords(r.name)) df[w] = (df[w] || 0) + 1;
    const stemOf = (w) => [...titleWords(w)][0] || w;
    let head = null;
    for (const w of askedWords(query)) if (!head || (df[stemOf(w)] || 0) >= (df[stemOf(head)] || 0)) head = w;
    if (head && (df[stemOf(head)] || 0) / ref.length < HEAD_WORD_SHARE) head = null;
    const asked = new Set(askedWords(query).map(stemOf));
    const score = (r) => {
      const words = [...titleWords(r.name)].filter((w) => !asked.has(w));
      const best = words.map((w) => (df[w] || 0) / ref.length).sort((a, b) => b - a).slice(0, RELATED_TOP_WORDS);
      const base = best.reduce((a, b) => a + b, 0) / Math.min(RELATED_TOP_WORDS, Math.max(3, words.length));
      return base * namedAs(r.name, query);
    };
    const refScores = ref.map(score).sort((a, b) => a - b);
    const threshold = refScores[Math.floor(refScores.length / 2)] * RELATED_SHARE;
    for (const r of rows) {
      r.rel = score(r);
      if ((r.page || 1) === first) continue;
      const use = head ? wordUse(r.name, head) : 0.6;
      const follows = head && use === 0.6 ? nextWords(r.name, stemOf(head)) : [];
      r.related = use === 1 || follows.some((w) => (df[w] || 0) / ref.length >= NEXT_WORD_SHARE) || (use > 0 && r.rel >= threshold);
    }
    return { threshold, head };
  }

  const UNIT_DRIVEN_SHARE = 0.5;
  const REPLENISH_SHARE = 0.25;
  const UNIT_DRIVEN_MAX_EACH = 100;
  function unitDriven(rows, an) {
    const live = rows.filter((r) => !r.oos);
    const m = an.auto;
    const basis = { on: false, share: 0, replenish: 0, each: null };
    if (!m || live.length < MIN_PRICED) return basis;
    const priced = live.filter((r) => r.unit && r.unit.measure === m);
    basis.share = priced.length / live.length;
    basis.replenish = live.filter((r) => r.replenish).length / live.length;
    if (m === 'count' && priced.length) {
      const each = priced.map((r) => r.unit.value).sort((x, y) => x - y);
      basis.each = each[Math.floor(each.length / 2)];
    }
    if (priced.length < MIN_PRICED || basis.share < UNIT_DRIVEN_SHARE) return basis;
    basis.on = basis.replenish >= REPLENISH_SHARE || (basis.each != null && basis.each <= UNIT_DRIVEN_MAX_EACH);
    return basis;
  }

  const measureName = (m, disp) => 'Price per ' + (m === 'weight' || m === 'volume' ? m + ' (' + disp[m] + ')' : m);
  const shownPrice = (v, m, disp) => fmtPrice(v * (UNIT_FACTOR[disp[m]] || 1), disp[m]);

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { parseUnitPrice, titleFacts, titleSize, analyze, unitDriven, relate, namedAs, wordUse, titleWords, fmtPrice, measureName, shownPrice, readCash, cashFromData, priceAfterCash, cashNote };
    return;
  }

  if (window.__wupsTeardown) window.__wupsTeardown();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  function textLines(node) {
    const byParent = new Map();
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) byParent.set(n.parentNode, (byParent.get(n.parentNode) || '') + n.nodeValue);
    return [...byParent.values()];
  }
  const store = (area, key, value) => {
    try {
      if (value === undefined) return JSON.parse(area.getItem(key));
      if (value === null) area.removeItem(key);
      else area.setItem(key, JSON.stringify(value));
    } catch (e) { }
    return null;
  };
  function setIfChanged(node, attr, value) {
    if (!node) return;
    if (value == null) {
      if (node.hasAttribute(attr)) node.removeAttribute(attr);
    } else if (node.getAttribute(attr) !== value) node.setAttribute(attr, value);
  }
  const setOrder = (node, order) => {
    const v = order == null ? '' : String(order);
    if (node.style.order !== v) node.style.order = v;
  };

  const cacheDb = {
    open() {
      return new Promise((resolve, reject) => {
        const r = indexedDB.open('wups', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('cache');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    },
    async get(key) {
      try {
        const db = await this.open();
        return await new Promise((resolve) => {
          const q = db.transaction('cache').objectStore('cache').get(key);
          q.onsuccess = () => resolve(q.result || null);
          q.onerror = () => resolve(null);
        });
      } catch (e) { return null; }
    },
    async put(key, value) {
      try {
        const db = await this.open();
        const os = db.transaction('cache', 'readwrite').objectStore('cache');
        os.clear();
        os.put(value, key);
      } catch (e) { }
    },
  };

  function walmart() {
    const SORT_BUTTON = 'button[aria-label^="Sort by"]';
    const SORT_INPUT = 'fieldset[role="radiogroup"] input[name="sort-by"]';
    const here = () => new URL(location.href);

    function findStack() {
      const marked = document.querySelector('[data-testid="item-stack"]');
      if (marked) return marked;
      const tally = new Map();
      for (const t of document.querySelectorAll('[data-item-id]')) {
        const holder = t.parentElement && t.parentElement.parentElement && t.parentElement.parentElement.parentElement;
        if (holder) tally.set(holder, (tally.get(holder) || 0) + 1);
      }
      let best = null;
      for (const [node, n] of tally) if (n >= 8 && (!best || n > tally.get(best))) best = node;
      return best;
    }

    function compact(it, page, pos) {
      const lines = (((it.priceInfo || {}).priceDetails || {}).priceLines) || [];
      const val = (type, key) => {
        const line = lines.find((l) => l.lineType === type);
        const v = line && (line.values || []).find((x) => x.key === key);
        return v ? v.value : '';
      };
      const low = val('OPTIONS', 'LOW_PRICE');
      const high = val('OPTIONS', 'HIGH_PRICE');
      const flag = (((it.badges || {}).flags) || []).map((f) => f.text).filter(Boolean)[0] || '';
      const badges = [];
      for (const g of ((it.badges || {}).groupsV2) || []) {
        for (const m of g.members || []) {
          const t = (m.content || []).filter((c) => c.type === 'TEXT' && c.value).map((c) => c.value).join(' ').replace(/\s+/g, ' ').trim();
          if (t && t !== flag && !/^save with$/i.test(t) && !badges.includes(t)) badges.push(t);
        }
      }
      return {
        id: it.id || it.usItemId,
        name: it.name || '',
        url: it.canonicalUrl || '/ip/' + it.usItemId,
        img: String(it.image || (it.imageInfo || {}).thumbnailUrl || '').replace(/odnHeight=\d+/, 'odnHeight=392').replace(/odnWidth=\d+/, 'odnWidth=392'),
        price: num(val('CURRENT_PRICE', 'PRICE') || val('DISCOUNTED_PRICE', 'PRICE')) || Number(it.price) || 0,
        was: val('COMPARISON', 'WAS_PRICE'),
        up: val('UNIT_PRICE', 'UNIT_PRICE'),
        opt: low ? 'Options from $' + low + (high ? ' – $' + high : '') : '',
        rating: it.averageRating || 0,
        reviews: it.numberOfReviews || 0,
        flag,
        badges: badges.slice(0, 3),
        oos: !!it.isOutOfStock || ((it.availabilityStatusV2 || {}).value || 'IN_STOCK') !== 'IN_STOCK',
        cash: cashFromData(it.rewards),
        page,
        pos,
      };
    }

    function findSearchResult(nd) {
      try {
        const init = nd.props.pageProps.initialData;
        if (init.searchResult && Array.isArray(init.searchResult.itemStacks)) return init.searchResult;
        for (const k of Object.keys(init)) {
          const v = init[k];
          if (v && typeof v === 'object' && Array.isArray(v.itemStacks)) return v;
        }
      } catch (e) { }
      return null;
    }

    return {
      name: 'Walmart',
      autoPages: 2,
      concurrency: 2,
      gapMs: [250, 600],
      paginationSel: 'nav[aria-label="pagination"]',

      listing: () => /^\/(search|browse|shop)(\/|$)/.test(location.pathname),
      stack: findStack,
      currentPage: () => parseInt(here().searchParams.get('page') || '1', 10) || 1,
      searchKey() {
        const u = here();
        u.searchParams.delete('page');
        return 'walmart:' + u.pathname + '?' + u.searchParams.toString();
      },
      choiceKey: () => location.pathname + '|' + (here().searchParams.get('q') || ''),
      query: () => here().searchParams.get('q') || '',
      pageUrl(page) {
        const u = here();
        if (page > 1) u.searchParams.set('page', String(page));
        else u.searchParams.delete('page');
        return u.toString();
      },
      domMaxPage() {
        let max = 1;
        for (const a of document.querySelectorAll('nav[aria-label="pagination"] a, nav[aria-label="pagination"] li')) {
          const t = a.textContent.trim();
          const n = parseInt(t, 10);
          if (n > max && String(n) === t) max = n;
        }
        return max;
      },

      readNatives(stack) {
        const out = [];
        let seq = 0;
        for (const node of stack.children) {
          if (/\bwups-(tile|status|divider|more)\b/.test(node.className)) continue;
          const rec = { el: node, seq: seq++, kind: 'other' };
          const tiles = node.querySelectorAll('[data-item-id]');
          if (tiles.length === 1) {
            const t = tiles[0];
            const a11y = t.querySelector('[data-testid="unified-global-product-price-a11y-text"]');
            const offer = t.querySelector('[data-testid^="qa-id-walmartReward-"]');
            const text = a11y ? a11y.textContent : offer ? t.textContent.replace(offer.textContent, ' ') : t.textContent;
            const pm = /\$\s*([\d,]+(?:\.\d+)?)/.exec(text);
            const title = t.querySelector('[data-automation-id="product-title"]') || t.querySelector('h3') || t.querySelector('img[alt]');
            rec.kind = /Sponsored(?![a-z])/.test(node.textContent) ? 'sponsored' : 'product';
            rec.id = t.getAttribute('data-item-id');
            rec.name = title ? title.textContent || title.getAttribute('alt') || '' : '';
            rec.price = pm ? num(pm[1]) : 0;
            rec.unit = parseUnitPrice(text);
            rec.ownPrice = !!(a11y && pm) && !/options\s+from\s*$/i.test(text.slice(0, pm.index));
            rec.cash = offer && rec.ownPrice ? readCash(textLines(offer)) : null;
            rec.noteEl = t.querySelector('[data-testid="ugpp-main-price"]') || t.querySelector('[data-testid="ugpp-reduced-price"]');
            rec.oos = /out of stock/i.test(t.textContent);
            rec.replenish = /Subscribe|EBT eligible/.test(t.textContent);
          }
          out.push(rec);
        }
        return out;
      },

      parsePage(html, page) {
        const at = html.indexOf('<script id="__NEXT_DATA__"');
        if (at < 0) throw new Error('no page data');
        const from = html.indexOf('>', at) + 1;
        const sr = findSearchResult(JSON.parse(html.slice(from, html.indexOf('</script>', from))));
        if (!sr) throw new Error('no results in page data');
        const stack = sr.itemStacks[0] || { items: [] };
        const items = (stack.items || [])
          .filter((it) => it && it.__typename === 'Product' && !it.isSponsoredFlag)
          .map((it, i) => compact(it, page, i));
        return { items, maxPage: (sr.paginationV2 && sr.paginationV2.maxPage) || 1 };
      },

      buildTile(item, products) {
        const tally = {};
        let wrapClass = products[0].el.className;
        for (const n of products) {
          tally[n.el.className] = (tally[n.el.className] || 0) + 1;
          if (tally[n.el.className] > tally[wrapClass]) wrapClass = n.el.className;
        }
        const first = products[0].el.firstElementChild;
        const wrap = el('div', wrapClass.replace(/\bwups-\S+/g, '').trim() + ' wups-tile');
        const inner = el('div', first ? first.className : '');
        const card = el('div', 'wups-card');

        const cover = el('a', 'wups-cover');
        cover.href = item.url;
        cover.setAttribute('aria-label', item.name);

        const imgBox = el('div', 'wups-img');
        const img = el('img');
        img.loading = 'lazy';
        img.alt = '';
        img.src = item.img;
        imgBox.append(img);

        const view = el('a', 'wups-view', 'View');
        view.href = item.url;

        const price = el('div', 'wups-price' + (item.was ? ' wups-now' : ''));
        if (item.price > 0) {
          const [dollars, cents] = item.price.toFixed(2).split('.');
          price.append(el('span', 'wups-small', '$'), el('span', 'wups-big', Number(dollars).toLocaleString('en-US')), el('span', 'wups-small', cents));
          if (item.was) price.append(el('span', 'wups-was', '$' + item.was));
        } else {
          price.append(el('span', 'wups-sub', item.opt || 'See options'));
        }
        const unit = el('span', 'wups-unit', item.up);
        price.append(unit);

        card.append(cover, el('div', 'wups-flag', item.flag), imgBox, view, price);
        if (item.opt && item.price > 0) card.append(el('div', 'wups-sub', item.opt));
        card.append(el('div', 'wups-title', item.name));
        if (item.rating) card.append(el('div', 'wups-sub', '★ ' + item.rating + (item.reviews ? ' (' + Number(item.reviews).toLocaleString('en-US') + ')' : '')));
        for (const b of item.badges || []) card.append(el('div', 'wups-sub', b));
        if (item.cash) {
          const dollars = '$' + (item.cash.amount / 100).toFixed(2);
          const need = item.cash.need > 1 ? ', buy ' + item.cash.need : '';
          card.append(el('div', 'wups-sub wups-cash', (item.cash.claimed ? dollars + ' Walmart Cash claimed' : 'Get ' + dollars + ' Walmart Cash') + need));
        }

        inner.append(card);
        wrap.append(inner);
        wrap._noteEl = unit;
        return wrap;
      },

      syncMenu(options, activeKey) {
        const active = options.find((o) => o.key === activeKey);
        const btn = document.querySelector(SORT_BUTTON);
        if (btn) {
          if (active && !btn.classList.contains('wups-btn-on')) btn.style.setProperty('--wups-fs', getComputedStyle(btn).fontSize);
          btn.classList.toggle('wups-btn-on', !!active);
          setIfChanged(btn, 'data-wups-label', active ? active.label : null);
        }
        const input = document.querySelector(SORT_INPUT);
        if (!input) return;
        const fs = input.closest('fieldset');
        fs.classList.toggle('wups-sel', !!active);
        const sig = options.map((o) => o.key + '=' + o.label).join('|');
        const have = [...fs.querySelectorAll('.wups-opt')].map((n) => n.getAttribute('data-wups-key') + '=' + n.textContent.trim()).join('|');
        if (have !== sig) {
          for (const n of fs.querySelectorAll('.wups-opt')) n.remove();
          const row = fs.querySelector('input[name="sort-by"]').closest('fieldset > div');
          const before = fs.firstElementChild;
          if (row) {
            for (const o of options) {
              const opt = row.cloneNode(true);
              opt.classList.add('wups-opt');
              opt.setAttribute('data-wups-key', o.key);
              for (const i of opt.querySelectorAll('input')) i.remove();
              const lab = opt.querySelector('label');
              if (!lab) continue;
              lab.removeAttribute('for');
              lab.tabIndex = 0;
              for (const n of [...lab.childNodes]) if (n.nodeType === 3) n.remove();
              lab.append(el('span', '', o.label));
              fs.insertBefore(opt, before);
            }
          }
        }
        for (const n of fs.querySelectorAll('.wups-opt')) n.classList.toggle('wups-cur', n.getAttribute('data-wups-key') === activeKey);
      },
      menuPick(e) {
        const fs = e.target.closest('fieldset[role="radiogroup"]');
        if (!fs || !fs.querySelector('input[name="sort-by"]')) return null;
        const ours = e.target.closest('.wups-opt');
        if (ours) return { key: ours.getAttribute('data-wups-key') };
        return e.target.closest('label, input') ? 'site' : null;
      },
      menuChange: (e) => e.target.matches(SORT_INPUT),
      hasSortMenu: () => !!document.querySelector(SORT_BUTTON),
      closeMenu() {
        const btn = document.querySelector(SORT_BUTTON + '[aria-expanded="true"]');
        if (btn) btn.click();
      },

      css: `
.wups-status,.wups-divider,.wups-more{flex:0 0 100%;padding:4px 16px 12px;font-size:14px;line-height:1.5;color:#2e2f32}
.wups-status button,.wups-more button{color:#2e2f32;border-color:#2e2f32}
.wups-status button.wups-cur{background:#2e2f32;color:#fff}
.wups-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;width:100%;color:#46474a;font-size:14px;line-height:1.3}
.wups-cover{position:absolute;inset:0;z-index:1}
.wups-flag{height:2rem;margin-bottom:.25rem;display:flex;align-items:center;font-size:12px;font-weight:700;color:#2e2f32}
.wups-img{position:relative;width:100%;aspect-ratio:1/1;margin-bottom:.5rem}
.wups-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.wups-view{position:relative;z-index:2;display:inline-flex;align-items:center;height:2rem;margin:.5rem 0;padding:0 1rem;border-radius:999px;background:#0053e2;color:#fff !important;font-weight:700;text-decoration:none}
.wups-price{display:flex;flex-wrap:wrap;align-items:flex-start;color:#000;font-weight:700}
.wups-price.wups-now{color:#2a8703}
.wups-small{font-size:.875rem;margin-top:.25rem}
.wups-big{font-size:1.5rem;line-height:1.2}
.wups-was{align-self:flex-end;margin-left:.375rem;font-size:.75rem;font-weight:400;color:#515357;text-decoration:line-through}
.wups-unit{align-self:flex-end;margin-left:.25rem;font-size:.75rem;font-weight:400;color:#515357}
.wups-sub{font-size:.75rem;color:#515357;margin-top:.125rem}
.wups-cash{color:#001e60;font-weight:700}
.wups-title{margin-top:.25rem;font-size:1rem;color:#2e2f32;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
[data-wups-note]::after{content:attr(data-wups-note);align-self:flex-end;margin-left:.25rem;font-size:.75rem;font-weight:400;color:#515357}
button.wups-btn-on{font-size:0 !important}
button.wups-btn-on::before{content:attr(data-wups-label);font-size:var(--wups-fs,14px)}
.wups-opt i.ld-Check{opacity:0 !important}
fieldset.wups-sel > div:not(.wups-opt) i.ld-Check{opacity:0 !important}
fieldset.wups-sel > .wups-opt.wups-cur i.ld-Check{opacity:1 !important}
`,
    };
  }

  function amazon() {
    const RESULT = '[data-component-type="s-search-result"]';
    const SPONSORED = '.puis-sponsored-label-text, .s-sponsored-label-text, .puis-sponsored-label-info-icon';
    const SORT_LINK = 'a[id^="s-result-sort-select_"]';
    const VOLATILE = ['page', 'qid', 'ref', 'xpid', 'crid', 'sprefix', 'ds', 'dib', 'dib_tag', 'sr'];
    const here = () => new URL(location.href);
    const sortPopover = () => [...document.querySelectorAll('.a-popover')].find((p) => p.querySelector(SORT_LINK));

    function readTile(node) {
      const h2 = node.querySelector('h2');
      const priceEl = node.querySelector('.a-price:not(.a-text-price) .a-offscreen');
      let up = '';
      let unitEl = null;
      for (const p of node.querySelectorAll('.a-price.a-text-price')) {
        const par = p.parentElement;
        const m = /^\(.*\/\s*([^)]+)\)$/.exec(par.textContent.replace(/\s+/g, ' ').trim());
        const amount = p.querySelector('.a-offscreen');
        if (m && amount) {
          up = amount.textContent.trim() + '/' + m[1].trim();
          unitEl = par;
          break;
        }
      }
      if (!up) {
        const m = /\(\s*(\$[\d.,]+)[^)/]*\/\s*([^)]+)\)/.exec(node.textContent);
        if (m) up = m[1] + '/' + m[2].trim();
      }
      return {
        id: node.getAttribute('data-asin'),
        name: h2 ? h2.textContent.trim() : '',
        price: priceEl ? num(priceEl.textContent) || 0 : 0,
        up,
        noteEl: unitEl || (priceEl ? priceEl.closest('.a-price').parentElement : null),
        sponsored: !!node.querySelector(SPONSORED) || node.classList.contains('AdHolder'),
        oos: /Currently unavailable|Temporarily out of stock/i.test(node.textContent),
        replenish: /Subscribe & Save|when you subscribe|EBT eligible/i.test(node.textContent),
      };
    }

    function maxPageIn(doc) {
      let max = 1;
      for (const a of doc.querySelectorAll('.s-pagination-strip .s-pagination-item')) {
        const t = a.textContent.trim();
        const n = parseInt(t, 10);
        if (n > max && String(n) === t) max = n;
      }
      return max;
    }

    return {
      name: 'Amazon',
      autoPages: 2,
      concurrency: 1,
      gapMs: [600, 1200],
      paginationSel: '.s-pagination-container',

      listing: () => true,
      stack: () => document.querySelector('.s-main-slot') || (document.querySelector(RESULT) || {}).parentElement || null,
      currentPage: () => parseInt(here().searchParams.get('page') || '1', 10) || 1,
      searchKey() {
        const u = here();
        for (const k of VOLATILE) u.searchParams.delete(k);
        u.searchParams.sort();
        return 'amazon:' + u.pathname + '?' + u.searchParams.toString();
      },
      choiceKey: () => location.pathname + '|' + (here().searchParams.get('k') || '') + '|' + (here().searchParams.get('i') || ''),
      query: () => here().searchParams.get('k') || '',
      pageUrl(page) {
        const u = here();
        if (page > 1) u.searchParams.set('page', String(page));
        else u.searchParams.delete('page');
        return u.toString();
      },
      domMaxPage: () => maxPageIn(document),

      readNatives(stack) {
        const out = [];
        let seq = 0;
        for (const node of stack.children) {
          if (/\bwups-(tile|status|divider|more)\b/.test(node.className)) continue;
          const rec = { el: node, seq: seq++, kind: 'other' };
          if (node.matches(RESULT) && node.getAttribute('data-asin')) {
            const t = readTile(node);
            rec.kind = t.sponsored ? 'sponsored' : 'product';
            rec.id = t.id;
            rec.name = t.name;
            rec.price = t.price;
            rec.unit = parseUnitPrice(t.up);
            rec.noteEl = t.noteEl;
            rec.oos = t.oos;
            rec.replenish = t.replenish;
          } else if (node.querySelector(SPONSORED) || node.classList.contains('AdHolder')) {
            rec.kind = 'sponsored';
          }
          out.push(rec);
        }
        return out;
      },

      parsePage(html, page) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc.querySelector(RESULT) && !doc.querySelector('.s-main-slot')) throw new Error('no results on the page');
        const items = [];
        doc.querySelectorAll(RESULT).forEach((node, i) => {
          const t = readTile(node);
          if (!t.id || t.sponsored) return;
          node.removeAttribute('id');
          items.push({ id: t.id, name: t.name, price: t.price, up: t.up, oos: t.oos, html: node.outerHTML, page, pos: i });
        });
        return { items, maxPage: maxPageIn(doc) };
      },

      buildTile(item) {
        const t = document.createElement('template');
        t.innerHTML = item.html;
        const node = t.content.firstElementChild;
        node.classList.add('wups-tile');
        node._noteEl = readTile(node).noteEl;
        return node;
      },

      syncMenu(options, activeKey) {
        const active = options.find((o) => o.key === activeKey);
        const select = document.querySelector('#s-result-sort-select');
        const box = select && select.closest('.a-dropdown-container');
        const prompt = box && box.querySelector('.a-dropdown-prompt');
        if (prompt) {
          if (active && !prompt.classList.contains('wups-btn-on')) prompt.style.setProperty('--wups-fs', getComputedStyle(prompt).fontSize);
          prompt.classList.toggle('wups-btn-on', !!active);
          setIfChanged(prompt, 'data-wups-label', active ? active.label : null);
        }
        const pop = sortPopover();
        if (!pop) return;
        pop.classList.toggle('wups-sel', !!active);
        const sig = options.map((o) => o.key + '=' + o.label).join('|');
        const have = [...pop.querySelectorAll('.wups-opt')].map((n) => n.getAttribute('data-wups-key') + '=' + n.textContent.trim()).join('|');
        if (have !== sig) {
          for (const n of pop.querySelectorAll('.wups-opt')) n.remove();
          const first = pop.querySelector(SORT_LINK).closest('li');
          for (const o of options) {
            const opt = el('li', 'a-dropdown-item wups-opt');
            opt.setAttribute('role', 'presentation');
            opt.setAttribute('data-wups-key', o.key);
            const a = el('a', 'a-dropdown-link', o.label);
            a.href = 'javascript:void(0)';
            a.tabIndex = 0;
            a.setAttribute('role', 'option');
            opt.append(a);
            first.parentElement.insertBefore(opt, first);
          }
        }
        for (const n of pop.querySelectorAll('.wups-opt')) n.firstElementChild.classList.toggle('a-active', n.getAttribute('data-wups-key') === activeKey);
      },
      menuPick(e) {
        const pop = e.target.closest('.a-popover');
        if (!pop || !pop.querySelector(SORT_LINK)) return null;
        const ours = e.target.closest('.wups-opt');
        if (ours) return { key: ours.getAttribute('data-wups-key') };
        return e.target.closest('a.a-dropdown-link') ? 'site' : null;
      },
      menuChange: (e) => e.target.id === 's-result-sort-select',
      hasSortMenu: () => !!document.querySelector('#s-result-sort-select'),
      closeMenu() {
        const pop = sortPopover();
        if (!pop || getComputedStyle(pop).display === 'none') return;
        const target = document.activeElement && pop.contains(document.activeElement) ? document.activeElement : pop;
        for (const type of ['keydown', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
        if (getComputedStyle(pop).display !== 'none') {
          pop.style.display = 'none';
          pop.setAttribute('aria-hidden', 'true');
        }
      },

      css: `
.wups-status,.wups-divider,.wups-more{grid-column:1 / -1;padding:2px 8px 10px;font-size:14px;line-height:1.5;color:#0f1111}
.wups-status button,.wups-more button{color:#0f1111;border-color:#888c8c}
.wups-status button.wups-cur{background:#0f1111;color:#fff;border-color:#0f1111}
[data-wups-note]::after{content:" " attr(data-wups-note);font-size:12px;font-weight:400;color:#565959}
.a-dropdown-prompt.wups-btn-on{font-size:0 !important}
.a-dropdown-prompt.wups-btn-on::after{content:attr(data-wups-label);font-size:var(--wups-fs,12px)}
.a-popover.wups-sel li:not(.wups-opt) a.a-active{background-color:transparent !important;border-color:transparent !important;box-shadow:none !important;color:#0f1111 !important}
.a-popover.wups-sel li:not(.wups-opt) a.a-active::before,.a-popover.wups-sel li:not(.wups-opt) a.a-active::after{display:none !important}
`,
    };
  }

  const host = location.hostname;
  const site = /(^|\.)walmart\.com$/.test(host) ? walmart() : /(^|\.)amazon\.com$/.test(host) ? amazon() : null;
  if (!site) return;

  function getChoice() {
    const c = store(sessionStorage, 'wups.choice');
    return c && c.key === site.choiceKey() ? c.pick : null;
  }
  const setChoice = (pick) => store(sessionStorage, 'wups.choice', { key: site.choiceKey(), pick });
  function wanted() {
    const pick = getChoice();
    if (pick) return pick !== 'site';
    return store(localStorage, 'wups.default') !== 'off';
  }

  let state = null;
  function resetFor(key) {
    if (state) for (const node of state.tileEls.values()) node.remove();
    const fresh = { key, pages: {}, maxPage: 1, merged: false, loading: null, blocked: false, loadAll: false, pumping: false, eligible: false, autoOn: null, born: Date.now(), active: false, measure: null, an: null, offered: [], counts: null, unreadable: false, tileEls: new Map() };
    state = fresh;
    const paused = store(sessionStorage, 'wups.paused');
    if (paused && Date.now() - paused < PAUSE_MINUTES * 60000) fresh.blocked = true;
    fresh.cacheLoaded = cacheDb.get(key).then((cache) => {
      if (cache && Date.now() - cache.t < CACHE_MINUTES * 60000) {
        fresh.pages = cache.pages || {};
        fresh.maxPage = Math.max(fresh.maxPage, cache.maxPage || 1);
      }
    });
  }

  async function fetchPage(page) {
    const r = await fetch(site.pageUrl(page), { credentials: 'same-origin', headers: { Accept: 'text/html' } });
    if (!r.ok || /\/blocked|validateCaptcha/.test(r.url)) throw new Error('status ' + r.status);
    return site.parsePage(await r.text(), page);
  }

  function plan() {
    const cur = site.currentPage();
    const max = Math.max(state.maxPage, site.domMaxPage());
    const others = [];
    for (let p = 1; p <= max; p++) if (p !== cur) others.push(p);
    const have = others.filter((p) => state.pages[p]);
    const missing = others.filter((p) => !state.pages[p]);
    const budget = state.loadAll ? Infinity : Math.max(0, site.autoPages - have.length);
    return { cur, max, others, have, missing, todo: state.blocked ? [] : missing.slice(0, budget) };
  }

  async function pump() {
    const mine = state;
    if (mine.pumping) return;
    mine.pumping = true;
    await mine.cacheLoaded;
    while (state === mine && !mine.blocked) {
      const todo = plan().todo;
      if (!todo.length) break;
      if (!Object.keys(mine.pages).length) mine.merged = false;
      mine.loading = { total: todo.length, done: 0 };
      refresh();
      const queue = todo.slice();
      const worker = async () => {
        while (queue.length && state === mine && !mine.blocked) {
          const p = queue.shift();
          try {
            const got = await fetchPage(p);
            if (state !== mine) return;
            mine.pages[p] = got.items;
            mine.maxPage = Math.max(mine.maxPage, got.maxPage);
            cacheDb.put(mine.key, { t: Date.now(), maxPage: mine.maxPage, pages: mine.pages });
          } catch (e) {
            mine.blocked = true;
            store(sessionStorage, 'wups.paused', Date.now());
          }
          mine.loading.done++;
          renderStatus();
          if (queue.length) await sleep(site.gapMs[0] + Math.random() * (site.gapMs[1] - site.gapMs[0]));
        }
      };
      await Promise.all(Array.from({ length: site.concurrency }, worker));
    }
    mine.pumping = false;
    if (state !== mine) return;
    mine.loading = null;
    mine.merged = true;
    refresh();
  }

  const offered = () => (state && state.an ? state.offered.filter((m) => state.an.valued[m]) : []);
  const menuOptions = () => offered().map((m) => ({ key: m, label: measureName(m, state.an.disp) + ': Low to High' }));

  function standDown() {
    const html = document.documentElement;
    if (!state && !html.classList.contains('wups-merged') && !document.querySelector('.wups-stack,.wups-opt,.wups-btn-on')) return;
    if (state) for (const node of state.tileEls.values()) node.remove();
    state = null;
    for (const n of document.querySelectorAll('.wups-tile,.wups-status,.wups-divider,.wups-more')) n.remove();
    for (const n of document.querySelectorAll('.wups-stack > *')) n.style.order = '';
    for (const a of ['data-wups-note', 'data-wups-info']) for (const n of document.querySelectorAll('[' + a + ']')) n.removeAttribute(a);
    for (const n of document.querySelectorAll('.wups-stack,.wups-on,.wups-oos,.wups-hide')) n.classList.remove('wups-stack', 'wups-on', 'wups-oos', 'wups-hide');
    html.classList.remove('wups-merged');
    site.syncMenu([], null);
  }

  function refresh() {
    if (!site.listing()) return standDown();
    const stack = site.stack();
    if (!stack) return site.syncMenu([], null);
    if (!stack.classList.contains('wups-stack')) stack.classList.add('wups-stack');

    const key = site.searchKey();
    if (!state || state.key !== key) resetFor(key);

    const natives = site.readNatives(stack);
    const products = natives.filter((n) => n.kind === 'product');
    state.unreadable = products.length >= 8 && products.every((n) => !n.price);

    const rows = [];
    const firstSeen = new Set();
    const thisPage = site.currentPage();
    const cashById = new Map();
    for (const n of products) if (n.cash && !cashById.has(n.id)) cashById.set(n.id, n.cash);
    for (const p of Object.keys(state.pages)) for (const it of state.pages[p]) if (it.cash && !cashById.has(it.id)) cashById.set(it.id, it.cash);
    for (const n of products) {
      if (firstSeen.has(n.id)) {
        n.kind = 'duplicate';
        continue;
      }
      firstSeen.add(n.id);
      rows.push({ native: n, name: n.name, price: n.price, unit: n.unit, oos: !!n.oos, replenish: !!n.replenish, cash: n.ownPrice ? cashById.get(n.id) || null : null, page: thisPage, seq: n.seq });
    }
    let importedCount = 0;
    const wasActive = state.active;
    if (state.merged && state.active) {
      const seen = new Set();
      for (const p of Object.keys(state.pages).map(Number).sort((a, b) => a - b)) {
        for (const it of state.pages[p]) {
          if (firstSeen.has(it.id) || seen.has(it.id)) continue;
          seen.add(it.id);
          rows.push({ item: it, name: it.name, price: it.price, unit: parseUnitPrice(it.up), oos: !!it.oos, cash: it.cash || null, page: it.page, seq: 1000 + importedCount++ });
        }
      }
    }

    const an = analyze(rows);
    state.an = an;
    for (const m of an.options) if (!state.offered.includes(m)) state.offered.push(m);
    const pick = getChoice();
    const picked = !!pick && pick !== 'site';
    if (state.autoOn == null && (products.length >= 8 || (products.length && Date.now() - state.born > 2500))) {
      state.basis = unitDriven(rows.filter((r) => r.native), an);
      state.autoOn = state.basis.on;
    }
    if (state.autoOn == null) setTimeout(schedule, 2600);
    if (state.autoOn || picked) state.eligible = true;
    const measure = picked && offered().includes(pick) ? pick : an.auto || offered()[0] || null;
    state.active = (picked || (state.autoOn === true && wanted())) && products.length > 0 && !!measure;
    state.measure = state.active ? measure : null;
    if (state.active && !wasActive && state.merged && Object.keys(state.pages).length) return refresh();

    stack.classList.toggle('wups-on', state.active);
    if (!state.active) {
      for (const n of natives) {
        setOrder(n.el, null);
        n.el.classList.toggle('wups-oos', false);
        n.el.classList.toggle('wups-hide', false);
        setIfChanged(n.noteEl, 'data-wups-note', null);
      }
      document.documentElement.classList.toggle('wups-merged', false);
      state.counts = null;
      renderStatus();
      return site.syncMenu(menuOptions(), null);
    }

    if (!state.pumping && (!state.merged || plan().todo.length)) pump();

    const disp = an.disp;
    const live = [];
    for (const r of rows) {
      const val = r.vals[measure];
      r.val = val || null;
      r.note = !val ? null : val.cash ? cashNote(shownPrice(val.v, measure, disp), r.cash, val.est) : val.est ? '≈ ' + shownPrice(val.v, measure, disp) : r.unit.unit !== disp[measure] ? '= ' + shownPrice(val.v, measure, disp) : null;
      if (r.oos) continue;
      live.push(r);
    }
    relate(rows, site.query());
    const vs = live.filter((r) => r.val && r.related).map((r) => r.val.shelf).sort((a, b) => a - b);
    const floor = vs.length >= 10 ? vs[Math.floor(vs.length * OUTLIER_PERCENTILE)] / OUTLIER_DIVISOR : 0;
    const rank = (r) => (!r.val ? 2 : !r.related || r.val.shelf < floor ? 1 : 0);
    live.sort((a, b) => rank(a) - rank(b) || (a.val && b.val ? a.val.v - b.val.v : 0) || a.paid - b.paid || a.seq - b.seq);
    const main = live.filter((r) => rank(r) === 0).length;
    live.forEach((r, i) => { r.order = i < main ? i + 1 : i + 3; });

    const keep = new Set();
    const frag = document.createDocumentFragment();
    live.forEach((r) => {
      if (r.native) {
        setOrder(r.native.el, r.order);
        r.native.el.classList.toggle('wups-oos', !!r.oos);
        r.native.el.classList.toggle('wups-hide', false);
        setIfChanged(r.native.noteEl, 'data-wups-note', r.note);
        return;
      }
      let node = state.tileEls.get(r.item.id);
      if (!node) {
        node = site.buildTile(r.item, products);
        state.tileEls.set(r.item.id, node);
      }
      keep.add(r.item.id);
      setOrder(node, r.order);
      setIfChanged(node._noteEl, 'data-wups-note', r.note);
      if (node.parentNode !== stack) frag.append(node);
    });
    if (frag.childNodes.length) stack.append(frag);
    let divider = stack.querySelector(':scope > .wups-divider');
    if (main > 0 && main < live.length) {
      if (!divider) {
        divider = el('div', 'wups-divider', 'Other results');
        stack.append(divider);
      }
      setOrder(divider, main + 2);
    } else if (divider) divider.remove();
    state.mainCount = main;
    for (const [id, node] of state.tileEls) {
      if (!keep.has(id)) {
        node.remove();
        state.tileEls.delete(id);
      }
    }
    for (const r of rows) if (r.oos && r.native) r.native.el.classList.toggle('wups-oos', true);
    const firstTile = natives.find((n) => n.kind !== 'other');
    for (const n of natives) {
      if (n.kind === 'product') continue;
      const hide = n.kind === 'sponsored' || n.kind === 'duplicate';
      n.el.classList.toggle('wups-hide', hide);
      setOrder(n.el, firstTile && n.kind === 'other' && n.seq < firstTile.seq ? null : 100000 + n.seq);
    }

    document.documentElement.classList.toggle('wups-merged', state.merged && importedCount > 0);
    state.counts = { shown: main || live.length, listed: live.length, cash: live.filter((r) => r.val && r.val.cash).length };
    renderStatus();
    site.syncMenu(menuOptions(), measure);
  }

  function renderStatus() {
    const stack = site.stack();
    if (!stack || !state) return;
    const an = state.an;
    const p = plan();
    setIfChanged(stack, 'data-wups-info', JSON.stringify({ active: state.active, auto: state.autoOn, basis: state.basis || null, measure: state.measure, offered: offered(), shown: state.counts ? state.counts.shown : 0, listed: state.counts ? state.counts.listed : 0, cash: state.counts ? state.counts.cash : 0, pagesMerged: state.merged ? 1 + p.have.length : 1, pagesTotal: p.max, loading: !!state.loading, blocked: state.blocked, unreadable: state.unreadable }));

    const choose = (pick) => () => {
      setChoice(pick);
      refresh();
    };
    const buttons = [];
    let text = '';
    if (!site.hasSortMenu() && an && offered().length) {
      for (const m of offered()) buttons.push({ label: measureName(m, an.disp), cur: state.active && m === state.measure, run: choose(m) });
      buttons.push({ label: site.name + "'s order", cur: !state.active, run: choose('site') });
    } else if (state.unreadable) {
      text = "Thrifty Sort could not read this page's prices.";
    }
    let box = stack.querySelector(':scope > .wups-status');
    if (!text && !buttons.length) {
      if (box) box.remove();
    } else {
      if (!box) {
        box = el('div', 'wups-status');
        box.append(el('span'), el('span', 'wups-actions'));
        const firstTile = site.readNatives(stack).find((n) => n.kind !== 'other');
        stack.insertBefore(box, firstTile ? firstTile.el : null);
      }
      if (box.firstChild.textContent !== text) box.firstChild.textContent = text;
      const sig = buttons.map((x) => x.label + (x.cur ? '*' : '')).join('|');
      if (box.getAttribute('data-wups-sig') !== sig) {
        box.lastChild.textContent = '';
        for (const x of buttons) {
          const btn = el('button', x.cur ? 'wups-cur' : '', x.label);
          btn.type = 'button';
          box.lastChild.append(btn);
        }
        box.setAttribute('data-wups-sig', sig);
      }
      [...box.lastChild.children].forEach((btn, i) => { btn.onclick = buttons[i].run; });
    }

    let more = stack.querySelector(':scope > .wups-more');
    if (state.active && !state.loading && p.missing.length) {
      if (!more) {
        more = el('div', 'wups-more');
        const btn = el('button', '', 'More results');
        btn.type = 'button';
        btn.onclick = () => {
          store(sessionStorage, 'wups.paused', null);
          state.blocked = false;
          state.loadAll = true;
          pump();
        };
        more.append(btn);
        stack.append(more);
      }
      setOrder(more, (state.mainCount || 0) + 1);
    } else if (more) more.remove();
  }

  function onMenuClick(e) {
    if (!e.target || !e.target.closest) return;
    const pick = site.menuPick(e);
    if (!pick) return;
    if (pick === 'site') {
      setChoice('site');
      setTimeout(() => site.closeMenu(), 400);
    } else {
      e.preventDefault();
      e.stopPropagation();
      setChoice(pick.key);
      site.closeMenu();
    }
    refresh();
  }
  function onMenuKey(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.closest && e.target.closest('.wups-opt')) onMenuClick(e);
  }
  function onMenuChange(e) {
    if (e.target && e.target.matches && site.menuChange(e)) {
      setChoice('site');
      refresh();
    }
  }

  const style = el('style');
  style.id = 'wups-style';
  style.textContent = `
.wups-stack:not(.wups-on) > .wups-tile{display:none !important}
.wups-stack.wups-on > .wups-oos,.wups-stack.wups-on > .wups-hide{display:none !important}
.wups-status{order:0;box-sizing:border-box}
.wups-divider{box-sizing:border-box;margin-top:16px;padding-top:16px !important;border-top:1px solid #d5d9d9;font-weight:700}
.wups-stack:not(.wups-on) > .wups-divider{display:none !important}
.wups-status button,.wups-more button{margin:0 8px 0 0;padding:5px 14px;border:1px solid;border-radius:999px;background:#fff;font:inherit;cursor:pointer}
.wups-more{text-align:center;padding-top:16px !important}
.wups-stack:not(.wups-on) > .wups-more{display:none !important}
html.wups-merged ${site.paginationSel}{display:none !important}
${site.css}`;
  document.head.append(style);

  const QUIET_MS = 150;
  const MAX_WAIT_MS = 1000;
  const SLOW_MS = 3000;
  let slowTimer = 0;
  let timer = 0;
  let waitingSince = 0;
  const runNow = () => {
    clearTimeout(timer);
    waitingSince = 0;
    refresh();
  };
  const schedule = () => {
    const now = Date.now();
    if (!waitingSince) waitingSince = now;
    clearTimeout(timer);
    if (now - waitingSince >= MAX_WAIT_MS) runNow();
    else timer = setTimeout(runNow, QUIET_MS);
  };
  const ours = (n) => n.nodeType === 1 && /\bwups-(tile|status|opt|divider|more)\b/.test(n.className);
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (t && t.closest('.wups-tile,.wups-status,.wups-opt,.wups-divider,.wups-more')) continue;
      const nodes = [...r.addedNodes, ...r.removedNodes];
      if (nodes.length && nodes.every(ours)) continue;
      if (nodes.length && nodes.every((n) => n.nodeType !== 1 && /^[\s\d:.,]*$/.test(n.data || ''))) {
        if (!slowTimer) slowTimer = setTimeout(() => { slowTimer = 0; schedule(); }, SLOW_MS);
        continue;
      }
      schedule();
      return;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  let lastHref = location.href;
  const hrefWatch = setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      schedule();
    }
  }, 400);

  document.addEventListener('click', onMenuClick, true);
  document.addEventListener('keydown', onMenuKey, true);
  document.addEventListener('change', onMenuChange, true);

  window.__wupsTeardown = () => {
    observer.disconnect();
    clearInterval(hrefWatch);
    clearTimeout(timer);
    clearTimeout(slowTimer);
    document.removeEventListener('click', onMenuClick, true);
    document.removeEventListener('keydown', onMenuKey, true);
    document.removeEventListener('change', onMenuChange, true);
    for (const n of document.querySelectorAll('.wups-tile,.wups-status,.wups-opt,.wups-divider,.wups-more,#wups-style')) n.remove();
    for (const n of document.querySelectorAll('.wups-stack > *')) n.style.order = '';
    for (const a of ['data-wups-note', 'data-wups-label', 'data-wups-sig', 'data-wups-info']) for (const n of document.querySelectorAll('[' + a + ']')) n.removeAttribute(a);
    for (const n of document.querySelectorAll('.wups-stack,.wups-on,.wups-btn-on,.wups-sel,.wups-oos,.wups-hide')) n.classList.remove('wups-stack', 'wups-on', 'wups-btn-on', 'wups-sel', 'wups-oos', 'wups-hide');
    document.documentElement.classList.remove('wups-merged');
    state = null;
    window.__wupsTeardown = null;
  };

  refresh();
})();
