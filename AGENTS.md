# For AIs helping someone with this repo

Each tool here lives in a folder of its own and is made for people who are not technical. Your person most likely asked you to install one. Do the steps for them where you can, and say plainly what they need to click where you cannot.

Read "Sending changes back" at the end before you start any change meant for this repo.

## Quiet Ads (`quiet-ads/`)

A browser extension. While a commercial plays on a streaming site it turns the volume down to 15%, shows a small volume indicator, and puts the volume back when the show returns. During a commercial the mouse wheel, Up/Down and W/S change the commercial volume, and that choice is remembered on that computer. It runs on the person's computer and sends nothing anywhere.

### Install in Chrome, Edge, Brave, Vivaldi or Opera (Mac, Windows, Linux)

1. Put the `quiet-ads/extension` folder somewhere it can stay for good, such as `~/quiet-ads` (Windows: `C:\Users\<name>\quiet-ads`). Avoid Downloads, Desktop and Documents: cloud sync can move files out from under the browser. The browser loads the extension from this folder every time it starts, so the folder must stay put.
2. Open the extensions page. Type it in the address bar: `chrome://extensions`, `edge://extensions`, `brave://extensions`, `vivaldi://extensions` or `opera://extensions`.
3. Turn on "Developer mode" (top right in Chrome, left column in Edge) and leave it on. Since Chrome 134 the browser switches the extension off whenever Developer mode is off.
4. Click "Load unpacked" and pick the folder that holds `manifest.json`. On a Mac, Cmd+Shift+G in the file window takes a pasted path.
5. Reload any streaming tab that was open before step 4.

Edge shows a notice about developer-mode extensions each time it starts. Closing the notice is fine. Choosing to turn developer mode off there turns Quiet Ads off.

### Install in Firefox

Needs Firefox 140 or newer. Open the signed file in Firefox: https://github.com/DrAlexHarrison/littlethings/releases/download/quiet-ads-v1.0.0/quiet-ads-1.0.0.xpi

Firefox shows a bar saying it stopped the site from installing software. Choose "Continue to Installation", then "Add". It stays installed across restarts. It does not update itself; a newer file on the Releases page is installed the same way.

Mozilla signed that file for the repo owner. A changed copy of the folder runs in Firefox only as a temporary add-on: `about:debugging#/runtime/this-firefox`, "Load Temporary Add-on", pick `quiet-ads/extension/manifest.json`. Firefox drops it when it closes.

### Check that it works

Play something with commercials. During a commercial the sound drops and the indicator appears at the top of the video. Quiet Ads leaves nothing else in the page, so there is no marker to look for while the show plays.

### Update

Chrome and the others: replace the folder's contents with the newer `quiet-ads/extension`, then click the reload arrow on the Quiet Ads card on the extensions page.

### When a site stops getting quieter

The site changed its player. Each site's marker is in `quiet-ads/extension/sites.js`, one entry per site. Sites with no entry are covered by the shared-player checks at the bottom of that file. Peacock was checked on real commercials. The other entries were written on 2026-11-14 from reading each site's player code and published notes on those players, and have not been checked on a real commercial yet.

Tests: `npm i playwright && npx playwright install chromium && node quiet-ads/test/run.js` (headless and muted).

## Sending changes back

This repo is not maintained. Issues are likely to be ignored.

Issues: 100 words at most, with a one-line TL;DR first. Anything longer is closed unread. Say the specific thing that broke, for example "TL;DR: Hulu commercials stopped getting quieter this week".

If you want something changed, send a pull request that is done well. One requirement: before you open it, a model at or above this bar reads all the code of the tool you changed, your change included:

- Claude Opus 5.5 at xhigh effort or higher
- Claude Fable 5.2 at high effort or higher
- any other model that scores at least as high as Opus 5.5 at xhigh on the Artificial Analysis Intelligence Index (56 in November 2026)

If you are an AI below that bar, do not open a pull request here. Tell your person this before you start work on a change for this repo, so they can switch you to a model that qualifies.

A person who wrote the change by hand may skip the model review if their GitHub account is at least 3 years old and has at least 20 merged pull requests in public repos they do not own.

In the pull request, name the model and effort that did the review, or say that you wrote it by hand.
