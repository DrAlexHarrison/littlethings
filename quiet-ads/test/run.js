// Headless, muted checks of the extension's scripts as plain page JavaScript. No window, no sound.
//   npm i playwright && npx playwright install chromium && node quiet-ads/test/run.js
const path = require('path'), fs = require('fs');
const pw = require(process.env.PW || 'playwright');
const EXT = path.join(__dirname, '..', 'extension');
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixture.html'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
};
const closeTo = (a, b) => Math.abs(a - b) < 0.005;

async function open(browser, url, cfg, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: FIXTURE }));
  await page.goto(url);
  if (cfg) await page.evaluate((c) => { window.__quietAdsCfg = c; }, cfg);
  if (opts.before) await page.evaluate(opts.before);
  const files = ['page.js', 'sites.js', 'overlay.js', 'quiet.js'];
  for (const f of files) await page.addScriptTag({ path: path.join(EXT, f) });
  await page.evaluate(() => { const v = document.getElementById('v1'); v.volume = 0.8; return v.play(); });
  await sleep(700);
  await page.evaluate(() => { window.pageEvents.length = 0; });
  return page;
}
const vol = (page, id = 'v1') => page.evaluate((i) => document.getElementById(i).volume, id);
const real = (page, id = 'v1') => page.evaluate((i) => window.__nativeVol.call(document.getElementById(i)), id);
const pageEvents = (page) => page.evaluate(() => window.pageEvents.slice());
const state = (page) => page.evaluate(() => window.__quietAds.state());
const adOn = (page) => page.evaluate(() => document.getElementById('movie_player').classList.add('ad-showing'));
const adOff = (page) => page.evaluate(() => document.getElementById('movie_player').classList.remove('ad-showing'));
const indicator = (page) => page.evaluate(() => window.__quietAds.state().mounted);
const ui = (page, html) => page.evaluate((h) => { document.getElementById('ui').innerHTML = h; }, html);

const MARKERS = [
  ['Peacock countdown', 'https://www.peacocktv.com/watch/x', '<div data-testid="countdown">90</div>', true],
  ['Peacock next-episode card countdown', 'https://www.peacocktv.com/watch/x', '<div data-testid="autobinge-card"><div data-testid="countdown">5</div></div>', false],
  ['NBC ad break class', 'https://www.nbc.com/x', '<div class="player adBreakActive-x1">.</div>', true],
  ['Prime Video ad timer', 'https://www.primevideo.com/detail/x', '<div class="dv-player-fullscreen"><span class="atvwebplayersdk-ad-timer-remaining-time">Ad 0:24</span></div>', true],
  ['Prime Video preview timer outside the player', 'https://www.amazon.com/gp/video/x', '<span class="atvwebplayersdk-ad-timer-remaining-time">0:24</span>', false],
  ['Paramount+ countdown ring', 'https://www.paramountplus.com/shows/x', '<div class="ad-info-manager show"><span class="ad-info-manager-circular-loader-copy">27</span></div>', true],
  ['Paramount+ ring at 0, box removed', 'https://www.paramountplus.com/shows/x', '<div class="ad-info-manager remove"><span class="ad-info-manager-circular-loader-copy">0</span></div>', false],
  ['Pluto TV ad box', 'https://pluto.tv/on-demand/x', '<div class="ad-info-manager show">.</div>', true],
  ['Netflix ads info', 'https://www.netflix.com/watch/1', '<div data-uia="ads-info-container"><span data-uia="ads-info-text">Ad</span><span data-uia="ads-info-time">0:15</span></div>', true],
  ['Netflix pause ad', 'https://www.netflix.com/watch/1', '<div data-uia="pause-ad">x</div><div data-uia="ad-markers">x</div>', false],
  ['Netflix ads info off the watch page', 'https://www.netflix.com/browse', '<div data-uia="ads-info-container"><span data-uia="ads-info-time">0:15</span></div>', false],
  ['Hulu ad bar timer', 'https://www.hulu.com/watch/x', '<div class="AdUnitView__adBarContainer"><div class="AdUnitView__adBar"><span class="AdUnitView__adBar__timer">0:42</span></div></div>', true],
  ['Hulu pause ad', 'https://www.hulu.com/watch/x', '<div class="PauseAdCreative-wrap">x</div><div class="ad-root">x</div>', false],
  ['Max ad timer under a minute', 'https://www.hbomax.com/video/watch/a/b', '<div data-testid="player-ux-ad-timer">1 of 3 :25</div>', true],
  ['Max advisories at the start of a title', 'https://www.hbomax.com/video/watch/a/b', '<div data-testid="player-ux-advisories">TV-MA</div>', false],
  ['discovery+ ad label', 'https://www.discoveryplus.com/video/x', '<div data-testid="player-ux-ad-label">Ad</div>', true],
  ['Twitch ad label', 'https://www.twitch.tv/somebody', '<span data-a-target="video-ad-label">somebody will be back shortly</span>', true],
  ['Twitch display ad beside the stream', 'https://www.twitch.tv/somebody', '<div class="stream-display-ad__wrapper">x</div>', false],
  ['Roku ad counter', 'https://app.roku.com/watch/x', '<div class="rokuAdCounter">Ad 1 of 3</div>', true],
  ['Roku empty counter before the break', 'https://app.roku.com/watch/x', '<div class="rokuAdCounter"></div>', false],
  ['Plex ad countdown', 'https://watch.plex.tv/movie/x', '<div data-testid="adCountdown">12</div>', true],
  ['Plex app ad ring', 'https://app.plex.tv/desktop', '<div class="Player-adPlayerDisplayIndexContainer-a1"><div class="CircularProgressBar-b2">.</div></div>', true],
  ['Fandango ad indicator', 'https://athome.fandango.com/content/x', '<span class="playback__currentTime--O8Fl5 playback__AVOD--lXUWb">Ad 1 of 3</span>', true],
  ['Dailymotion ad break', 'https://geo.dailymotion.com/player/x.html', '<main data-ad-is-running>.</main>', true],
  ['Dailymotion overlay ad over the show', 'https://geo.dailymotion.com/player/x.html', '<div class="video_view" data-with-overlay-ad>.</div>', false],
  ['Tubi ad message', 'https://tubitv.com/movies/x', '<div class="C4jzN QuenX"><div class="uN6BM">AD</div></div>', true],
];

(async () => {
  const kind = process.env.BROWSER || 'chromium'; // or firefox
  const launch = kind === 'firefox'
    ? { headless: true, firefoxUserPrefs: { 'media.volume_scale': '0.0', 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } }
    : { headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] };
  if (process.env.CHROME_EXE) launch.executablePath = process.env.CHROME_EXE;
  const browser = await pw[kind].launch(launch);
  try {
    console.log('Turn down and restore (plain elements)');
    let page = await open(browser, 'https://www.peacocktv.com/watch/x');
    ok('nothing shown before a commercial', !(await indicator(page)));
    await ui(page, '<div data-testid="countdown">90</div>'); await sleep(300);
    ok('15% by default (0.8 -> 0.12)', closeTo(await vol(page), 0.12), await vol(page));
    ok('site heard no volume event', (await pageEvents(page)).length === 0, await pageEvents(page));
    ok('indicator on screen', await indicator(page));
    await ui(page, ''); await sleep(200);
    ok('still down 200 ms after the marker left', closeTo(await vol(page), 0.12), await vol(page));
    await sleep(700);
    ok('restored to exactly 0.8', (await vol(page)) === 0.8, await vol(page));
    ok('site still heard no volume event', (await pageEvents(page)).length === 0, await pageEvents(page));
    await sleep(1400);
    ok('indicator gone after the fade', !(await indicator(page)));

    console.log('Wheel and keys');
    await page.mouse.move(60, 60);
    await page.keyboard.press('ArrowDown'); await page.mouse.wheel(0, 100); await sleep(150);
    ok('during the show they change nothing', (await vol(page)) === 0.8 && (await state(page)).cfg.level === 15, await state(page));
    await ui(page, '<div data-testid="countdown">90</div>'); await sleep(300);
    await page.keyboard.press('ArrowUp'); await sleep(120);
    ok('Up: 15 -> 20 (0.16)', (await state(page)).cfg.level === 20 && closeTo(await vol(page), 0.16), [await vol(page), (await state(page)).cfg.level]);
    await page.keyboard.press('s'); await page.keyboard.press('s'); await sleep(120);
    ok('S twice: 20 -> 10 (0.08)', (await state(page)).cfg.level === 10 && closeTo(await vol(page), 0.08), await vol(page));
    await page.keyboard.press('w'); await sleep(120);
    ok('W: 10 -> 15', (await state(page)).cfg.level === 15, (await state(page)).cfg.level);
    await page.mouse.wheel(0, -100); await sleep(150);
    ok('wheel up one notch: 15 -> 20', (await state(page)).cfg.level === 20, (await state(page)).cfg.level);
    await page.mouse.wheel(0, 100); await sleep(250); await page.mouse.wheel(0, 100); await sleep(150);
    ok('wheel down two notches: 20 -> 10', (await state(page)).cfg.level === 10, (await state(page)).cfg.level);
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown'); await sleep(120);
    ok('floor at 0, silent', (await state(page)).cfg.level === 0 && (await vol(page)) === 0, [await vol(page), (await state(page)).cfg.level]);
    for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowUp'); await sleep(150);
    ok('ceiling at 100, never above the show volume', (await state(page)).cfg.level === 100 && (await vol(page)) === 0.8, [await vol(page), (await state(page)).cfg.level]);
    ok('site heard nothing but its own value', (await pageEvents(page)).every((v) => v === 0.8), await pageEvents(page));
    await page.evaluate(() => window.__quietAds.setLevel(15)); await sleep(100);
    await page.evaluate(() => { window.pageScrolls = 0; window.addEventListener('wheel', () => { window.pageScrolls++; }); window.pageKeys = 0; window.addEventListener('keydown', () => { window.pageKeys++; }); });
    await page.mouse.wheel(0, 100); await page.keyboard.press('ArrowUp'); await sleep(120);
    ok('the page never sees those keys or the wheel during a commercial', await page.evaluate(() => window.pageScrolls === 0 && window.pageKeys === 0));
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('f'); await sleep(80);
    ok('other keys pass through', await page.evaluate(() => window.pageKeys === 2));
    await page.evaluate(() => { const i = document.createElement('input'); i.id = 'box'; document.body.appendChild(i); i.focus(); });
    const before = (await state(page)).cfg.level;
    await page.keyboard.press('w'); await sleep(80);
    ok('typing W in a text box types', (await state(page)).cfg.level === before && await page.evaluate(() => document.getElementById('box').value === 'w'));
    await page.evaluate(() => document.getElementById('box').remove());
    await page.mouse.move(900, 600); await page.mouse.wheel(0, 100); await sleep(120);
    ok('wheel away from the player scrolls the page as usual', (await state(page)).cfg.level === before && await page.evaluate(() => window.pageScrolls === 1), await page.evaluate(() => window.pageScrolls));
    await ui(page, ''); await sleep(900);
    ok('show returns at exactly 0.8', (await vol(page)) === 0.8, await vol(page));
    await page.context().close();

    console.log('The site re-sets volume during the commercial');
    page = await open(browser, 'https://www.peacocktv.com/watch/x', { level: 20 });
    await ui(page, '<div data-testid="countdown">90</div>'); await sleep(300);
    await page.evaluate(() => { window.pageEvents.length = 0; document.getElementById('v1').volume = 0.5; }); await sleep(250);
    ok('follows the new volume (0.5 -> 0.10)', closeTo(await vol(page), 0.10), await vol(page));
    ok('site heard only its own value', JSON.stringify(await pageEvents(page)) === '[0.5]', await pageEvents(page));
    await page.evaluate(() => { window.pageEvents.length = 0; document.getElementById('v1').muted = true; }); await sleep(200);
    ok('on mute the site reads its real volume', (await pageEvents(page)).length >= 1 && (await pageEvents(page)).every((v) => v === 0.5), await pageEvents(page));
    await page.evaluate(() => { document.getElementById('v1').muted = false; }); await sleep(200);
    ok('mute and unmute leave it down', closeTo(await vol(page), 0.10), await vol(page));
    await ui(page, ''); await sleep(900);
    ok('restored to the site value 0.5', (await vol(page)) === 0.5, await vol(page));
    await page.evaluate(() => { const v = document.createElement('video'); v.id = 'v2'; v.src = window.SRC; v.loop = true; v.volume = 0.6; document.body.appendChild(v); });
    await ui(page, '<div data-testid="countdown">30</div>'); await sleep(300);
    await page.evaluate(() => document.getElementById('v2').play()); await sleep(400);
    ok('a second element that starts mid-commercial is turned down', closeTo(await vol(page, 'v2'), 0.12), await vol(page, 'v2'));
    for (const f of ['sites.js', 'overlay.js', 'quiet.js']) await page.addScriptTag({ path: path.join(EXT, f) });
    await sleep(500);
    ok('a newer copy takes over: one turn-down, not two', closeTo(await vol(page), 0.10), await vol(page));
    ok('one indicator, not two', await page.evaluate(() => document.querySelectorAll('[popover]').length === 1));
    await ui(page, ''); await sleep(900);
    ok('both restored', (await vol(page)) === 0.5 && (await vol(page, 'v2')) === 0.6, [await vol(page), await vol(page, 'v2')]);
    await page.context().close();

    console.log('YouTube (volume scaled inside the page)');
    page = await open(browser, 'https://www.youtube.com/watch?v=x');
    await adOn(page); await sleep(300);
    ok('really playing at 0.12', closeTo(await real(page), 0.12), await real(page));
    ok('player reads back its own 0.8', (await vol(page)) === 0.8, await vol(page));
    let r = await page.evaluate(() => { const v = document.getElementById('v1'); v.volume = 0.6; return [window.__nativeVol.call(v), v.volume]; });
    ok('player re-sets volume mid-commercial: scaled in the same instant (0.09)', closeTo(r[0], 0.09) && r[1] === 0.6, r);
    await page.keyboard.press('ArrowUp'); await sleep(150);
    ok('Up during the commercial: 20% of 0.6', closeTo(await real(page), 0.12) && (await vol(page)) === 0.6, [await real(page), await vol(page)]);
    await page.evaluate(() => window.__quietAds.setLevel(15));
    await adOff(page); await sleep(900);
    ok('show returns at what the player asked for (0.6)', (await real(page)) === 0.6, await real(page));
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('quietads:factor', { detail: 0.2 }))); await sleep(300);
    ok('a factor with no commercial behind it takes hold...', closeTo(await real(page), 0.12), await real(page));
    await sleep(5400);
    ok('...and lets go by itself after 5 s', (await real(page)) === 0.6, await real(page));
    r = await page.evaluate(() => { try { document.getElementById('v1').volume = 2; return 'no error'; } catch (e) { return e.name; } });
    ok('an invalid volume still raises the browser error', r === 'IndexSizeError', r);
    await page.context().close();

    console.log('Site markers');
    for (const [name, url, html, expect] of MARKERS) {
      page = await open(browser, url);
      await ui(page, html); await sleep(350);
      const during = await vol(page);
      ok(name + ': ' + (expect ? 'turned down' : 'left alone'), expect ? closeTo(during, 0.12) : during === 0.8, during);
      await ui(page, ''); await sleep(900);
      ok(name + ': back to 0.8', (await vol(page)) === 0.8, await vol(page));
      await page.context().close();
    }

    console.log('Disney+ and ESPN (badge inside a shadow root)');
    for (const url of ['https://www.disneyplus.com/play/x', 'https://www.espn.com/watch/player/x']) {
      page = await open(browser, url);
      await page.evaluate(() => {
        const host = document.createElement('ad-badge-overlay');
        host.attachShadow({ mode: 'open' });
        const wrap = document.createElement('div'); wrap.id = 'wrap'; wrap.attachShadow({ mode: 'open' }).appendChild(host);
        document.body.appendChild(wrap);
        window.badge = (on) => { host.shadowRoot.innerHTML = on ? '<div class="ad-badge-overlay--container"><div class="ad-badge-overlay--badge">Ad</div><div class="ad-badge-overlay__content--time-display">0:30</div></div>' : ''; };
      });
      await sleep(2200);
      ok(url.split('/')[2] + ': empty badge element leaves the show alone', (await vol(page)) === 0.8, await vol(page));
      await page.evaluate(() => window.badge(true)); await sleep(2700);
      ok(url.split('/')[2] + ': badge shown, turned down', closeTo(await vol(page), 0.12), await vol(page));
      await page.evaluate(() => window.badge(false)); await sleep(1300);
      ok(url.split('/')[2] + ': back to 0.8', (await vol(page)) === 0.8, await vol(page));
      await page.context().close();
    }

    console.log('Tubi (commercial plays in its own element)');
    page = await open(browser, 'https://tubitv.com/movies/x');
    await page.evaluate(() => { document.getElementById('ui').innerHTML = '<div data-id="adComponent"><video id="ad" loop></video></div>'; const a = document.getElementById('ad'); a.src = window.SRC; a.volume = 0.8; });
    await sleep(700);
    ok('preloaded, paused commercial: show left alone', (await vol(page)) === 0.8, await vol(page));
    await page.evaluate(() => document.getElementById('ad').play()); await sleep(500);
    ok('commercial playing: turned down', closeTo(await vol(page, 'ad'), 0.12), await vol(page, 'ad'));
    await page.evaluate(() => document.getElementById('ad').remove()); await sleep(900);
    ok('show back at 0.8', (await vol(page)) === 0.8, await vol(page));
    await page.context().close();

    console.log('Sites with no entry (shared players)');
    page = await open(browser, 'https://www.example.com/video');
    ok('no trace in the page before anything plays an ad', await page.evaluate(() => !document.querySelector('[popover]') && document.documentElement.attributes.length === 0));
    await page.evaluate(() => {
      const jw = document.createElement('div'); jw.id = 'jw'; jw.className = 'jwplayer';
      const v = document.createElement('video'); v.id = 'jwv'; v.src = window.SRC; v.loop = true; v.volume = 0.7; jw.appendChild(v); document.body.appendChild(jw);
      return v.play();
    });
    await sleep(500);
    await page.evaluate(() => document.getElementById('jw').classList.add('jw-flag-ads')); await sleep(400);
    ok('JW Player in a commercial: its video is turned down', closeTo(await vol(page, 'jwv'), 0.10), await vol(page, 'jwv'));
    ok('another video on the same page is left alone', (await vol(page)) === 0.8, await vol(page));
    await page.evaluate(() => document.getElementById('jwv').pause()); await sleep(900);
    ok('pausing the commercial keeps it down', closeTo(await vol(page, 'jwv'), 0.10), await vol(page, 'jwv'));
    await page.evaluate(() => document.getElementById('jw').classList.remove('jw-flag-ads')); await sleep(900);
    ok('restored to 0.7', (await vol(page, 'jwv')) === 0.7, await vol(page, 'jwv'));
    await page.evaluate(() => { const v = document.getElementById('jwv'); v.muted = true; v.play(); document.getElementById('jw').classList.add('jw-flag-ads'); }); await sleep(500);
    ok('a muted ad player (sidebar ad) is not a commercial break', (await state(page)).ad === 0 && (await vol(page, 'jwv')) === 0.7, await state(page));
    await page.evaluate(() => document.getElementById('jw').remove());
    await page.evaluate(() => {
      const box = document.createElement('div'); box.id = 'ima';
      const v = document.createElement('video'); v.id = 'imav'; v.title = 'Advertisement'; v.src = window.SRC; v.loop = true; v.volume = 0.9; box.appendChild(v); document.body.appendChild(box);
    });
    await sleep(700);
    ok('Google ad element waiting, paused: nothing happens', (await vol(page, 'imav')) === 0.9 && (await vol(page)) === 0.8);
    await page.evaluate(() => document.getElementById('imav').play()); await sleep(500);
    ok('Google ad element playing: only it is turned down', closeTo(await vol(page, 'imav'), 0.13) && (await vol(page)) === 0.8, [await vol(page, 'imav'), await vol(page)]);
    await page.evaluate(() => { document.getElementById('ima').style.display = 'none'; }); await sleep(900);
    ok('ad container hidden: restored to 0.9', (await vol(page, 'imav')) === 0.9, await vol(page, 'imav'));
    await page.evaluate(() => { document.getElementById('ui').innerHTML = '<div class="ad-playing ad-showing" data-ad-playing>Ad 1 of 2 · Advertisement</div>'; }); await sleep(500);
    ok('ad-looking words and class names on an unknown site do nothing', (await vol(page)) === 0.8, await vol(page));
    await page.context().close();
  } finally { await browser.close(); }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
