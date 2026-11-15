/*
 * Quiet Ads, the part that runs inside the page.
 *
 * Some players (YouTube) write video.volume again and again: when each
 * commercial is ready, when the show resumes, on every format switch. Turning
 * the volume down afterwards is always a moment late. So on those sites this
 * sits on the volume property itself: whatever the player asks for is
 * multiplied by a factor on the way in, 1 during the show and the commercial
 * level during a commercial. The player always reads back the number it asked
 * for, so its slider and saved volume never move, and it hears no volume event
 * for a change it cannot see.
 *
 * Nothing changes until quiet.js asks for it. The factor is never above 1,
 * and it returns to 1 by itself if quiet.js stops reporting.
 */
(() => {
  'use strict';

  if (window.__quietAdsPage) return;
  window.__quietAdsPage = true;

  const EXPIRE_MS = 5000;

  let native = null;
  let factor = 1;
  let expireTimer = 0;

  /** element -> { asked: what the page set, applied: what the element holds } */
  const state = new WeakMap();
  /** every element seen, so one that is off the page still gets put back */
  const seen = new Set();
  /** element -> { n, t }: volumechange events still to come from writes made here */
  const expected = new WeakMap();

  function remember(el, asked) {
    state.set(el, { asked, applied: native.get.call(el) });
    for (const ref of seen) if (ref.deref() === el) return;
    seen.add(new WeakRef(el));
  }

  function install() {
    if (native) return true;
    const found = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    if (!found || !found.get || !found.set || !found.configurable) return false;
    native = found;
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      configurable: true,
      enumerable: native.enumerable,
      get() {
        const actual = native.get.call(this);
        const known = state.get(this);
        // Hand the page its own number back, unless something else changed the element since.
        return known && known.applied === actual ? known.asked : actual;
      },
      set(value) {
        const asked = Number(value);
        if (!(asked >= 0 && asked <= 1)) {
          native.set.call(this, value); // let the browser raise its usual error
          return;
        }
        native.set.call(this, asked * factor);
        remember(this, asked);
      },
    });
    return true;
  }

  function apply(el) {
    const actual = native.get.call(el);
    const known = state.get(el);
    // No record, or changed behind this script: what the element holds is the page's value.
    const asked = known && known.applied === actual ? known.asked : actual;
    const next = asked * factor;
    if (next !== actual) {
      const o = expected.get(el) || { n: 0, t: 0 };
      o.n += 1;
      o.t = Date.now();
      expected.set(el, o);
    }
    native.set.call(el, next);
    remember(el, asked);
  }

  function setFactor(next) {
    next = Number(next);
    if (!native || !(next >= 0 && next <= 1) || next === factor) return;
    // Bring in elements the page never set a volume on before the factor moves.
    for (const el of document.querySelectorAll('video, audio')) if (!state.has(el)) remember(el, native.get.call(el));
    factor = next;
    for (const ref of seen) {
      const el = ref.deref();
      if (el) apply(el); else seen.delete(ref);
    }
  }

  document.addEventListener('quietads:factor', (event) => {
    setFactor(event.detail);
    clearTimeout(expireTimer);
    if (factor < 1) expireTimer = setTimeout(() => setFactor(1), EXPIRE_MS);
  });

  // The page's own number did not change, so the event has nothing to tell it.
  window.addEventListener('volumechange', (event) => {
    const o = expected.get(event.target);
    if (!o || o.n <= 0) return;
    if (Date.now() - o.t > 1000) { o.n = 0; return; }
    o.n -= 1;
    event.stopImmediatePropagation();
  }, true);

  // quiet.js asks whether this script is in the page before relying on it.
  document.addEventListener('quietads:ping', () => {
    if (install()) document.dispatchEvent(new CustomEvent('quietads:pong'));
  });
})();
