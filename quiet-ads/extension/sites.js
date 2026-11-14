/*
 * Quiet Ads: how each site marks a commercial.
 *
 * detect(active) returns '' while the show plays, a short label while a
 * commercial plays, or { sig, media } to turn down only those elements.
 * `active` is true once a commercial is under way.
 *
 * If a site stops getting quieter, its marker changed. Fix it here.
 */
var QuietAdsSites = (() => {
  'use strict';

  function shown(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.opacity !== '0';
  }

  function firstShown(selectors) {
    for (const sel of selectors) {
      let found;
      try { found = document.querySelectorAll(sel); } catch (_) { continue; }
      for (const el of found) if (shown(el)) return sel;
    }
    return '';
  }

  /** querySelectorAll that also looks inside open shadow roots. */
  function deepAll(selector, root = document, out = [], budget = { n: 6000 }) {
    try { out.push(...root.querySelectorAll(selector)); } catch (_) { return out; }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let el = walker.nextNode(); el && budget.n-- > 0; el = walker.nextNode()) {
      if (el.shadowRoot) deepAll(selector, el.shadowRoot, out, budget);
    }
    return out;
  }

  /** deepAll, at most once every `ms`, reusing what it found while that is still in the page. */
  const deepCache = new Map();
  function deepSome(selector, ms = 2000) {
    let hit = deepCache.get(selector);
    if (!hit) deepCache.set(selector, hit = { els: [], at: 0 });
    hit.els = hit.els.filter((el) => el.isConnected);
    if (!hit.els.length && Date.now() - hit.at > ms) {
      hit.at = Date.now();
      hit.els = deepAll(selector);
    }
    return hit.els;
  }

  const playing = (v) => !v.paused && !v.ended && v.readyState > 2;

  function big(el) {
    if (el.tagName !== 'VIDEO') return true;
    const r = el.getBoundingClientRect();
    return r.width >= 200 && r.height >= 112;
  }

  /* ------------------------------------------------------ shared players --- */

  // Paramount's player skin: Paramount+, CBS, Pluto TV.
  function paramountSkin() {
    const left = document.querySelector('.ad-info-manager-circular-loader-copy');
    if (left && parseInt(left.textContent, 10) > 0 && left.getClientRects().length) return 'countdown';
    const box = document.querySelector('.ad-info-manager');
    return box && box.classList.contains('show') && !box.classList.contains('remove') ? 'ad-info' : '';
  }

  // Disney's web player: Disney+ and ESPN. Its badges live in open shadow roots.
  function disneyPlayer(active) {
    for (const badge of deepSome('ad-badge-overlay')) {
      const box = badge.shadowRoot && badge.shadowRoot.querySelector(
        '.ad-badge-overlay--container, [data-qa~="ad-badge-overlay.container"]');
      if (box && shown(box)) return 'ad-badge';
    }
    for (const promo of deepSome('promo-overlay')) {
      const box = promo.shadowRoot && promo.shadowRoot.querySelector('.promo-overlay__container');
      if (box && shown(box)) return 'promo';
    }
    if (firstShown(['.overlay_interstitials__badge'])) return 'interstitial-badge';
    // The badge hides while a settings menu is open. The progress bar still knows.
    if (active && deepSome('.progress-bar__ad-playing', 1000).length) return 'ad-progress';
    return '';
  }

  // Warner Bros. Discovery's player: Max and discovery+.
  function wbdPlayer() {
    if (document.querySelector('[data-testid="player-ux-ad-timer"], [data-testid="player-ux-ad-label"]')) return 'ad-label';
    return document.querySelector('[class*="AdOverlayContainer-"]') ? 'ad-overlay' : '';
  }

  // NBCUniversal's player: Peacock and NBC.
  const NBCU_AD = '[data-testid="countdown"], .ad-countdown__remaining-time';
  const NBCU_NOT_AD = '[data-testid="autobinge-card"], [data-test-id="autobinge-card"], .playback-binge__card';
  function nbcuPlayer() {
    // The "next episode" card has a countdown of its own.
    for (const el of document.querySelectorAll(NBCU_AD)) {
      if (!el.closest(NBCU_NOT_AD) && shown(el)) return 'countdown';
    }
    return document.querySelector('[class*="adBreakActive"]') ? 'ad-break' : '';
  }

  /* -------------------------------------------------------------- sites --- */

  const SITES = [
    {
      name: 'YouTube',
      host: /(^|\.)youtube(-nocookie)?\.com$/,
      scaler: true, // YouTube rewrites the volume at every ad; page.js scales those writes
      detect() {
        return document.querySelector('.html5-video-player.ad-showing, .html5-video-player.ad-interrupting')
          ? 'player-class' : '';
      },
    },
    { name: 'Peacock', host: /(^|\.)peacocktv\.com$/, detect: nbcuPlayer },
    { name: 'NBC', host: /(^|\.)nbc\.com$/, detect: nbcuPlayer },
    {
      name: 'Prime Video',
      host: /(^|\.)(primevideo\.com|amazon\.(com|ca|co\.uk|de|fr|it|es|in|co\.jp|com\.au|com\.mx|com\.br))$/,
      detect() {
        // The page holds other timers (previews), so only the full-size player counts.
        const timers = document.querySelectorAll(
          '.dv-player-fullscreen .atvwebplayersdk-ad-timer-remaining-time, ' +
          '.dv-player-fullscreen [class*="atvwebplayersdk-ad-timer"]'
        );
        for (const el of timers) {
          if (/\d{1,2}:\d{2}/.test(el.textContent || '') && shown(el)) return 'ad-timer';
        }
        return firstShown(['.dv-player-fullscreen [aria-label^="Ad playing"]']) && 'ad-label';
      },
    },
    { name: 'Paramount+', host: /(^|\.)(paramountplus|cbs)\.com$/, detect: paramountSkin },
    { name: 'Pluto TV', host: /(^|\.)pluto\.tv$/, detect: paramountSkin },
    {
      name: 'Netflix',
      host: /(^|\.)netflix\.com$/,
      detect() {
        if (!location.pathname.startsWith('/watch')) return '';
        const box = document.querySelector('[data-uia="ads-info-container"]');
        if (!box) return '';
        const time = box.querySelector('[data-uia="ads-info-time"]');
        if (time && /\d/.test(time.textContent || '')) return 'ads-info';
        return shown(box) ? 'ads-info' : '';
      },
    },
    { name: 'Disney+', host: /(^|\.)disneyplus\.com$/, detect: disneyPlayer },
    { name: 'ESPN', host: /(^|\.)espn\.com$/, detect: disneyPlayer },
    {
      name: 'Hulu',
      host: /(^|\.)hulu\.com$/,
      detect() {
        const timer = document.querySelector('.AdUnitView__adBar__timer');
        if (timer && /\d{0,2}:\d{2}/.test(timer.textContent || '') && shown(timer)) return 'ad-timer';
        return firstShown(['.AdUnitView__adBarContainer', '.AdUnitView__adBar']) && 'ad-bar';
      },
    },
    {
      name: 'Max',
      host: /(^|\.)(hbomax|max)\.com$/,
      detect() {
        return location.pathname.includes('/video/watch') ? wbdPlayer() : '';
      },
    },
    { name: 'discovery+', host: /(^|\.)discoveryplus\.com$/, detect: wbdPlayer },
    {
      name: 'Twitch',
      host: /(^|\.)twitch\.tv$/,
      maxMs: 5 * 60000, // breaks run 3 minutes at most; the banner sometimes sticks
      detect() {
        return firstShown([
          '[data-a-target="video-ad-label"]',
          '[data-a-target="video-ad-countdown"]',
        ]) && 'ad-label';
      },
    },
    {
      name: 'Tubi',
      host: /(^|\.)tubitv\.com$/,
      detect(active) {
        // The ad slot can hold a preloaded, paused commercial before the break.
        for (const v of document.querySelectorAll('[data-id="adComponent"] video')) {
          if (active ? !v.ended : playing(v)) return 'ad-video';
        }
        return firstShown(['.C4jzN.QuenX']) && 'ad-message';
      },
    },
    {
      name: 'The Roku Channel',
      host: /(^|\.)roku\.com$/,
      detect() {
        // The counter exists, empty, up to 10 seconds before a break.
        for (const el of document.querySelectorAll('.rokuAdCounter')) {
          if (/^Ad \d+ of \d+$/.test((el.textContent || '').trim())) return 'ad-counter';
        }
        return '';
      },
    },
    {
      name: 'Plex',
      host: /(^|\.)plex\.tv$/,
      detect() {
        if (document.querySelector('[data-testid="adCountdown"]')) return 'ad-countdown';
        if (document.querySelector(
          '[class*="Player-adPlayerDisplayIndexContainer-"] [class*="CircularProgressBar-"]')) return 'ad-ring';
        return document.querySelector('[class*="AdInfoBar-message-"]') ? 'ad-info-bar' : '';
      },
    },
    {
      name: 'Fandango at Home',
      host: /(^|\.)(athome\.fandango|vudu)\.com$/,
      detect() {
        // The marker is in the top page; each commercial plays in a child frame.
        let doc = document;
        try { doc = window.top.document; } catch (_) { /* another origin: keep this document */ }
        return doc.querySelector('[class*="playback__AVOD--"]') ? 'ad-indicator' : '';
      },
    },
    {
      name: 'Dailymotion',
      host: /(^|\.)dailymotion\.com$/,
      detect() {
        if (document.querySelector('main[data-ad-is-running]')) return 'ad-break';
        return firstShown(['.dm-sdk-ad-pod-tag', '.controls_ad .ad_label']) && 'ad-label';
      },
    },
  ];

  /* ------------------------------------------- sites with no entry above --- */

  /*
   * Most other video sites run one of a few shared players. Each check below
   * reads a flag that player sets itself during a commercial break, and turns
   * down only the media inside that player.
   */
  const KIT_ROOTS = [
    ['.jwplayer.jw-flag-ads', 'jwplayer'],
    ['.video-js.vjs-ad-playing', 'videojs'],
    ['.theo-ad-playing', 'theoplayer'],
    ['.playkit-player.playkit-ad-break', 'kaltura'],
  ];

  function scoped(sig, media, active) {
    const live = media.filter((el) => big(el) && (active || (playing(el) && !el.muted)));
    return live.length ? { sig, media } : null;
  }

  function sharedPlayers(active) {
    for (const [selector, sig] of KIT_ROOTS) {
      for (const root of document.querySelectorAll(selector)) {
        const hit = scoped(sig, deepAll('video, audio', root), active);
        if (hit) return hit;
      }
    }

    if (document.querySelector('theoplayer-default-ui, theoplayer-ui')) {
      for (const ui of deepSome('theoplayer-ui[playing-ad]', 1000)) {
        if (!ui.hasAttribute('playing-ad')) continue;
        const top = ui.getRootNode().host || ui;
        const hit = scoped('theoplayer-ui', deepAll('video, audio', top), active);
        if (hit) return hit;
      }
    }

    for (const ui of document.querySelectorAll('.bmpui-ui-uicontainer.bmpui-ui-ads:not(.bmpui-hidden)')) {
      const root = ui.closest('.bitmovinplayer-container') || ui.parentElement;
      const hit = root && scoped('bitmovin', deepAll('video, audio', root), active);
      if (hit) return hit;
    }

    // Google's ad kit plays each commercial in an element of its own.
    const adVideos = Array.from(document.querySelectorAll('video[title="Advertisement"], .amp-ads:not([hidden]) video'));
    for (const el of document.querySelectorAll('lima-video')) {
      const inner = el.shadowRoot && el.shadowRoot.querySelector('video');
      if (inner) adVideos.push(inner);
    }
    const liveAds = adVideos.filter((v) => big(v) &&
      (active ? !v.ended && v.readyState > 0 && shown(v) : playing(v) && !v.muted));
    if (liveAds.length) return { sig: 'ad-video', media: liveAds };

    // Google's stitched streams show this frame for the length of the break.
    for (const frame of document.querySelectorAll('iframe[src*="imasdk.googleapis.com/js/core/dai_iframe"]')) {
      if (!shown(frame)) continue;
      let videos = [];
      for (let up = frame.parentElement, i = 0; up && i < 6 && !videos.length; up = up.parentElement, i++) {
        videos = Array.from(up.querySelectorAll('video'));
      }
      const hit = scoped('dai', videos, active);
      if (hit) return hit;
    }

    return null;
  }

  const OTHER = { name: 'Other', shared: true, maxMs: 8 * 60000, detect: (active) => sharedPlayers(active) || '' };

  function find(hostname) {
    const site = SITES.find((entry) => entry.host.test(hostname));
    if (!site) return OTHER;
    return Object.assign({}, site, {
      detect: (active) => site.detect(active) || sharedPlayers(active) || '',
    });
  }

  return { find, names: SITES.map((site) => site.name) };
})();
