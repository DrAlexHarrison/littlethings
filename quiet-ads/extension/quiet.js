/*
 * Quiet Ads.
 *
 * While a commercial plays, the page's video and audio elements are set to a
 * fraction of their volume, a small indicator shows that level, and the mouse
 * wheel, Up/Down and W/S change it. When the show returns, the volume goes
 * back to exactly what it was and none of those keys do anything.
 *
 * Rules this file keeps:
 *   1. It never raises a volume above a value the page or the viewer set.
 *   2. It uses each element's own .volume, never mute and never Web Audio.
 *   3. The volumechange events its own writes cause are hidden from the page,
 *      so the site's slider and saved volume stay where they were.
 *   4. One copy per document. A newer copy takes over from an older one.
 *   5. It leaves nothing in the page for a site to find, except the indicator
 *      while a commercial plays.
 */
(() => {
  'use strict';

  const VERSION = '1.0.0';

  if (typeof QuietAdsSites !== 'object' || typeof createOverlay !== 'function') return;
  const SITE = QuietAdsSites.find(location.hostname);

  const STEP = 5;
  const END_HOLD_MS = 500;        // marker must be gone this long before restoring
  const MAX_AD_MS = SITE.maxMs || 15 * 60000; // a "commercial" longer than this is a wrong read
  const MAX_REBASES = 8;          // stop following volume changes that keep coming
  const CHECK_GAP_MS = 100;
  const POLL_MS = 500;
  const IDLE_MS = 10000;
  const FADE_MS = 1200;

  /* ----------------------------------------------------------- settings --- */

  const cfg = { level: 15, hintSeen: false, hintShows: 0 };

  let store = null;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) store = chrome.storage.local;
  } catch (_) { /* plain page JavaScript: defaults only */ }

  if (typeof window.__quietAdsCfg === 'object' && window.__quietAdsCfg) Object.assign(cfg, window.__quietAdsCfg);

  const clampLevel = (n) => Math.min(100, Math.max(0, Math.round(Number(n) / STEP) * STEP || 0));

  function applySettings(next) {
    const wasLevel = cfg.level;
    for (const key of Object.keys(cfg)) if (next[key] !== undefined) cfg[key] = next[key];
    cfg.level = clampLevel(cfg.level);
    if (adSince && wasLevel !== cfg.level) { relevel(); if (hudShown) hud.ui.set(cfg.level); }
  }

  if (store) {
    try {
      store.get(Object.keys(cfg), (stored) => {
        if (!chrome.runtime.lastError && stored) applySettings(stored);
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const next = {};
        for (const key of Object.keys(changes)) if (key in cfg) next[key] = changes[key].newValue;
        applySettings(next);
      });
    } catch (_) { store = null; }
  }

  function save(values) {
    if (!store) return;
    try { store.set(values); } catch (_) { /* extension was reloaded under this page */ }
  }

  /* ------------------------------------------------------------- volume --- */

  let running = true;
  let adSince = 0;       // when the current commercial break was first seen, 0 = none
  let adSignal = '';
  let adScope = null;    // elements to turn down, or null for every one in the page
  let lastSeen = 0;
  let capped = false;
  let rebases = 0;
  let quietedAudible = false;

  /** media element -> { base, ours, muted } while it is turned down */
  const ducked = new Map();
  /** media element -> { v, n, t }: restores whose volumechange event is still due */
  const pending = new WeakMap();
  /** elements waiting to be turned down once the page has seen its own change */
  const duckQueue = new Set();
  /** shadow roots already listening for volumechange */
  const watchedRoots = new WeakSet();

  const near = (a, b) => Math.abs(a - b) < 0.004;
  const factor = () => cfg.level / 100;

  /** base * level, two decimals, never above base and never silent unless the level is 0. */
  function target(base) {
    const f = factor();
    if (f <= 0 || base <= 0) return 0;
    return Math.min(base, Math.max(0.01, Math.floor(base * f * 100) / 100));
  }

  function media() {
    return adScope || Array.from(document.querySelectorAll('video, audio'));
  }

  /** Media events do not leave a shadow root, so listen inside it too. */
  function watchRoot(el) {
    const root = el.getRootNode();
    if (root === document || watchedRoots.has(root) || !root.addEventListener) return;
    watchedRoots.add(root);
    root.addEventListener('volumechange', onVolumeChange, true);
  }

  /** Put a volume back, and expect the one event that write causes. */
  function writeBack(el, value) {
    const p = pending.get(el) || { v: 0, n: 0, t: 0 };
    p.v = value;
    p.n += 1;
    p.t = Date.now();
    pending.set(el, p);
    try { el.volume = value; } catch (_) { p.n -= 1; }
  }

  /*
   * Where a site rewrites the volume itself at every ad (YouTube), page.js
   * scales those writes inside the page and this file only tells it when.
   * Everywhere else the elements are set directly below.
   */
  let scaling = false;

  function scalerPresent() {
    if (!SITE.scaler) return false;
    let answered = false;
    const onPong = () => { answered = true; };
    document.addEventListener('quietads:pong', onPong);
    document.dispatchEvent(new CustomEvent('quietads:ping'));
    document.removeEventListener('quietads:pong', onPong);
    return answered;
  }

  function sendFactor(value) {
    document.dispatchEvent(new CustomEvent('quietads:factor', { detail: value }));
  }

  function duckEl(el) {
    if (scaling) return;
    watchRoot(el);
    const current = el.volume;
    let entry = ducked.get(el);
    if (entry) {
      if (near(current, entry.ours)) return;
      if (!near(current, entry.base)) {
        // The page or the viewer chose a new volume during the commercial.
        if (rebases >= MAX_REBASES) return;
        rebases += 1;
        entry.base = current;
      }
    } else {
      entry = { base: current, ours: current, muted: el.muted };
      ducked.set(el, entry);
    }
    entry.ours = target(entry.base);
    entry.muted = el.muted;
    if (!el.muted && entry.base > 0) quietedAudible = true;
    if (!near(current, entry.ours)) {
      try { el.volume = entry.ours; } catch (_) { /* element is gone */ }
    }
  }

  function duckAll() {
    if (scaling || scalerPresent()) {
      if (!scaling && media().some((el) => !el.muted && el.volume > 0)) quietedAudible = true;
      scaling = true;
      sendFactor(factor()); // repeated on every check; the scaler lets go if these stop
      return;
    }
    for (const el of media()) duckEl(el);
  }

  /** The level changed mid-commercial: move every element we hold to it. */
  function relevel() {
    if (!adSince || capped) return;
    if (scaling) { sendFactor(factor()); return; }
    for (const [el, entry] of ducked) {
      if (!el.isConnected || !near(el.volume, entry.ours)) continue;
      entry.ours = target(entry.base);
      if (!near(el.volume, entry.ours)) {
        try { el.volume = entry.ours; } catch (_) { /* element is gone */ }
      }
    }
  }

  /** Turn an element down right after the page's own handlers have run. */
  function duckSoon(el) {
    if (duckQueue.has(el)) return;
    duckQueue.add(el);
    setTimeout(() => {
      duckQueue.delete(el);
      if (!running || !adSince || capped || !el.isConnected) return;
      if (adScope && !adScope.includes(el)) return;
      duckEl(el);
    }, 0);
  }

  function restoreAll() {
    if (scaling) {
      scaling = false;
      sendFactor(1);
    }
    for (const [el, entry] of ducked) {
      // Only undo our own value. Anything else was set by someone else.
      if (el.isConnected && near(el.volume, entry.ours) && !near(entry.ours, entry.base)) writeBack(el, entry.base);
    }
    ducked.clear();
  }

  function onVolumeChange(event) {
    const el = event.target;
    if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;

    const entry = ducked.get(el);
    if (entry) {
      const ours = near(el.volume, entry.ours) && !near(entry.ours, entry.base);
      if (ours && el.muted === entry.muted) {
        // Our own write. The page never hears about it.
        event.stopImmediatePropagation();
        return;
      }
      if (ours) {
        // Mute was switched during the commercial. Players save volume and
        // mute together, so show the page its real volume, then turn down again.
        entry.muted = el.muted;
        try { el.volume = entry.base; } catch (_) { /* element is gone */ }
      }
      entry.muted = el.muted;
      // Someone else's change: the page reads it first, then it is turned down.
      duckSoon(el);
      return;
    }

    const p = pending.get(el);
    if (p && p.n > 0) {
      if (Date.now() - p.t < 2000 && near(el.volume, p.v)) {
        p.n -= 1;
        event.stopImmediatePropagation();
        return;
      }
      p.n = 0;
    }
    if (running && adSince && !capped) duckSoon(el);
  }

  /* ---------------------------------------------------------- detection --- */

  let armed = false;
  let observer = null;
  let pollTimer = 0;
  let pokeTimer = 0;
  let lastCheck = 0;
  let lastPlaying = 0;
  let wrongReads = 0;

  function startAd(signal) {
    adSince = Date.now();
    adSignal = signal;
    capped = false;
    rebases = 0;
    quietedAudible = false;
    hinted = false;
    duckAll();
    if (quietedAudible) showHud();
  }

  function endAd() {
    restoreAll();
    hideHud();
    adSince = 0;
    adScope = null;
    capped = false;
  }

  function read() {
    if (wrongReads >= 2) return '';
    let found = '';
    try { found = SITE.detect(!!adSince) || ''; } catch (_) { found = ''; }
    if (found && typeof found === 'object') {
      adScope = found.media || null;
      return found.sig || 'ad';
    }
    if (found) adScope = null;
    return found;
  }

  function check() {
    if (!running) return;
    const now = Date.now();
    lastCheck = now;
    const signal = read();

    if (signal) {
      lastSeen = now;
      if (!adSince) startAd(signal);
      else if (!capped) {
        if (now - adSince > MAX_AD_MS) {
          capped = true;
          wrongReads += 1;
          restoreAll();
          hideHud();
        } else {
          duckAll();
          if (quietedAudible && !hudShown) showHud();
        }
      }
    } else if (adSince) {
      if (now - lastSeen >= END_HOLD_MS) endAd();
      else poke(END_HOLD_MS - (now - lastSeen));
    }
  }

  /** Ask for a check soon, at most one per CHECK_GAP_MS. */
  function poke(delay) {
    if (!running || pokeTimer) return;
    const wait = Math.max(delay || 0, CHECK_GAP_MS - (Date.now() - lastCheck));
    if (wait <= 0) { check(); return; }
    pokeTimer = setTimeout(() => { pokeTimer = 0; check(); }, wait);
  }

  function anyPlaying() {
    for (const el of document.querySelectorAll('video, audio')) {
      if (!el.paused && !el.ended && el.readyState > 1) return true;
    }
    return false;
  }

  function arm() {
    lastPlaying = Date.now();
    if (armed || !running) return;
    armed = true;
    observer = new MutationObserver(() => poke(0));
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'],
    });
    pollTimer = setInterval(() => {
      if (anyPlaying()) lastPlaying = Date.now();
      else if (!adSince && Date.now() - lastPlaying > IDLE_MS) { disarm(); return; }
      check();
    }, POLL_MS);
    check();
  }

  function disarm() {
    if (!armed) return;
    armed = false;
    if (observer) observer.disconnect();
    observer = null;
    clearInterval(pollTimer);
    clearTimeout(pokeTimer);
    pokeTimer = 0;
  }

  function onMediaEvent(event) {
    const el = event.target;
    if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;
    arm();
    // A second player element that starts during the commercial gets the same treatment.
    if (adSince && !capped && !adScope) duckEl(el);
    poke(0);
  }

  /* ---------------------------------------------------------- indicator --- */

  let hud = null;
  let hudShown = false;
  let hinted = false;
  let hudTimer = 0;

  function tooSmall() {
    return window.innerWidth < 240 || window.innerHeight < 135;
  }

  function mountHud() {
    const host = hud.host;
    if (hud.top) {
      // The top layer sits above a fullscreen player. Re-entering puts it back on top.
      if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
      try { if (host.matches(':popover-open')) host.hidePopover(); host.showPopover(); return; } catch (_) { hud.top = false; }
    }
    const parent = document.fullscreenElement && document.fullscreenElement.tagName !== 'VIDEO'
      ? document.fullscreenElement : (document.body || document.documentElement);
    if (host.parentNode !== parent) parent.appendChild(host);
  }

  function showHud() {
    if (tooSmall()) return;
    if (!hud) {
      const host = document.createElement('div');
      host.style.cssText = 'all:initial;display:block;position:fixed;inset:0;width:auto;height:auto;margin:0;' +
        'padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483647';
      const top = typeof host.showPopover === 'function';
      if (top) host.setAttribute('popover', 'manual');
      hud = { host, top, ui: createOverlay(host.attachShadow({ mode: 'closed' })) };
    }
    clearTimeout(hudTimer);
    mountHud();
    hud.ui.show({ level: cfg.level, hint: !cfg.hintSeen });
    if (!cfg.hintSeen && !hinted) {
      // The hint retires once the level has been changed, or after three breaks.
      hinted = true;
      cfg.hintShows += 1;
      if (cfg.hintShows >= 3) cfg.hintSeen = true;
      save({ hintShows: cfg.hintShows, hintSeen: cfg.hintSeen });
    }
    if (!hudShown) {
      hudShown = true;
      window.addEventListener('wheel', onWheel, { capture: true, passive: false });
      window.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('fullscreenchange', onFullscreenChange, true);
    }
  }

  function hideHud() {
    if (!hudShown) return;
    hudShown = false;
    window.removeEventListener('wheel', onWheel, { capture: true });
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('fullscreenchange', onFullscreenChange, true);
    hud.ui.hide();
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => {
      if (hudShown) return;
      try { if (hud.top && hud.host.matches(':popover-open')) hud.host.hidePopover(); } catch (_) { /* already closed */ }
      hud.host.remove();
    }, FADE_MS);
  }

  function onFullscreenChange() {
    if (hudShown) mountHud();
  }

  /* -------------------------------------------------- wheel and keyboard --- */

  function setLevel(next) {
    next = clampLevel(next);
    cfg.hintSeen = true;
    if (next === cfg.level) { if (hudShown) hud.ui.set(next); save({ hintSeen: true }); return; }
    cfg.level = next;
    relevel();
    if (hudShown) hud.ui.set(next);
    save({ level: next, hintSeen: true });
  }

  /** Is the pointer on the player? Elsewhere the wheel still scrolls the page. */
  function overPlayer(event) {
    if (document.fullscreenElement) return true;
    try { if (window.top !== window) return true; } catch (_) { return true; }
    for (const el of document.querySelectorAll('video')) {
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 112) continue;
      if (event.clientX >= r.left && event.clientX <= r.right &&
          event.clientY >= r.top && event.clientY <= r.bottom) return true;
    }
    return false;
  }

  let wheelSum = 0;
  let wheelAt = 0;

  function onWheel(event) {
    if (!hudShown || event.ctrlKey || event.metaKey || !event.deltaY || !overPlayer(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    // Rolling the wheel away from you is louder, whichever way the system scrolls pages.
    let delta = event.deltaY;
    if (event.webkitDirectionInvertedFromDevice) delta = -delta;

    const now = Date.now();
    const fresh = now - wheelAt > 200;
    wheelAt = now;

    // A mouse wheel clicks: one click, one step. A trackpad streams small moves: add them up.
    const notched = event.deltaMode !== 0 ||
      (event.wheelDeltaY && event.wheelDeltaY % 120 === 0 && Math.abs(event.wheelDeltaY) !== Math.abs(event.deltaY) * 3);
    let steps = 0;
    if (notched) {
      steps = delta < 0 ? 1 : -1;
    } else if (fresh) {
      wheelSum = 0;
      steps = delta < 0 ? 1 : -1;
    } else {
      wheelSum += delta;
      steps = -Math.trunc(wheelSum / 80);
      wheelSum -= Math.trunc(wheelSum / 80) * 80;
    }
    if (steps) setLevel(cfg.level + steps * STEP);
  }

  const KEY_STEPS = { ArrowUp: 1, ArrowDown: -1, w: 1, W: 1, s: -1, S: -1 };

  function typing(target) {
    if (!target || !target.tagName) return false;
    return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
  }

  function onKeyDown(event) {
    const step = KEY_STEPS[event.key];
    if (!hudShown || !step || event.ctrlKey || event.metaKey || event.altKey) return;
    if (typing(event.composedPath ? event.composedPath()[0] : event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setLevel(cfg.level + step * STEP);
  }

  /* --------------------------------------------------------------- boot --- */

  const HELLO = 'quietads:hello';
  const instance = VERSION + ':' + Math.random().toString(36).slice(2);

  function onHello(event) {
    if (event.detail !== instance) shutdown();
  }

  function onPageHide() {
    if (adSince) endAd();
  }

  const MEDIA_EVENTS = ['playing', 'play', 'loadedmetadata'];

  function shutdown() {
    if (!running) return;
    restoreAll();
    hideHud();
    if (hud) { clearTimeout(hudTimer); hud.ui.destroy(); hud.host.remove(); }
    running = false;
    adSince = 0;
    disarm();
    clearInterval(idleTimer);
    document.removeEventListener(HELLO, onHello);
    window.removeEventListener('volumechange', onVolumeChange, true);
    window.removeEventListener('pagehide', onPageHide, true);
    for (const name of MEDIA_EVENTS) window.removeEventListener(name, onMediaEvent, true);
  }

  // Tell any older copy in this document to hand over, then listen for newer ones.
  document.dispatchEvent(new CustomEvent(HELLO, { detail: instance }));
  document.addEventListener(HELLO, onHello);

  // Capture on window: media events do not bubble, but they do pass through here first.
  window.addEventListener('volumechange', onVolumeChange, true);
  window.addEventListener('pagehide', onPageHide, true);
  for (const name of MEDIA_EVENTS) window.addEventListener(name, onMediaEvent, true);

  // Covers a player that was already running when this script arrived.
  const idleTimer = setInterval(() => { if (!armed && anyPlaying()) arm(); }, 3000);
  if (anyPlaying()) arm();

  window.__quietAds = {
    version: VERSION,
    state: () => ({
      site: SITE.name, running, armed, ad: adSince ? Math.round((Date.now() - adSince) / 1000) : 0,
      signal: adSignal, capped, rebases, shown: hudShown, mounted: !!(hud && hud.host.isConnected),
      cfg: Object.assign({}, cfg),
      ducked: Array.from(ducked.values()),
      volumes: Array.from(document.querySelectorAll('video, audio')).map((el) => el.volume),
    }),
    setLevel,
    stop: shutdown,
  };
})();
