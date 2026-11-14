/*
 * Quiet Ads: the volume indicator.
 *
 * createOverlay(root) draws inside the shadow root it is given and returns
 * { show({ level, hint }), set(level), hide(), destroy() }. It never takes clicks.
 */
function createOverlay(root) {
  "use strict";

  const NS_SVG = "http://www.w3.org/2000/svg";
  const TOTAL_STEPS = 20;

  function clampLevel(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 15;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(NS_SVG, tag);
    if (attrs) {
      const keys = Object.keys(attrs);
      for (let i = 0; i < keys.length; i += 1) {
        node.setAttribute(keys[i], String(attrs[keys[i]]));
      }
    }
    return node;
  }

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    .qa-stage, .qa-stage * {
      box-sizing: border-box;
      pointer-events: none !important;
      user-select: none;
      -webkit-user-select: none;
    }

    .qa-stage {
      --sp-1: 4px;
      --sp-2: 8px;
      --sp-3: 12px;
      --sp-4: 16px;
      --sp-6: 24px;
      --sp-8: 32px;

      --bg-surface: rgba(12, 13, 16, 0.90);
      --border-inner: rgba(255, 255, 255, 0.16);
      --border-outer: rgba(0, 0, 0, 0.72);
      --divider: rgba(255, 255, 255, 0.10);

      --text-primary: #f4f4f5;
      --text-secondary: #b4b4be;
      --tick-empty: rgba(255, 255, 255, 0.18);
      --tick-steady: #d4d4d8;
      --accent-active: #5eead4;

      --radius: 12px;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;

      position: absolute;
      inset: 0;
      container-type: size;
      overflow: hidden;
      font-family: var(--font-sans);
      font-variant-numeric: tabular-nums;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .qa-anchor {
      position: absolute;
      top: var(--sp-6);
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      justify-content: center;
      max-width: calc(100% - var(--sp-4));
    }

    .qa-pill {
      display: flex;
      flex-direction: column;
      padding: var(--sp-3) var(--sp-4);
      border-radius: var(--radius);
      background: var(--bg-surface);
      border: 1px solid var(--border-inner);
      box-shadow: 0 0 0 1px var(--border-outer);
      color: var(--text-primary);
      opacity: 0;
      visibility: hidden;
      transform: translateY(-8px);
      transition:
        opacity 900ms cubic-bezier(0.22, 1, 0.36, 1),
        transform 900ms cubic-bezier(0.22, 1, 0.36, 1),
        border-color 240ms ease;
      will-change: opacity, transform;
    }

    .qa-pill[data-mounted="1"] {
      visibility: visible;
    }

    .qa-pill[data-visible="1"] {
      opacity: 1;
      transform: translateY(0);
    }

    .qa-pill[data-changing="1"] {
      border-color: rgba(94, 234, 212, 0.38);
    }

    .qa-main {
      display: flex;
      align-items: center;
      gap: var(--sp-3);
    }

    .qa-icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      color: var(--text-secondary);
      transition: color 180ms ease;
    }

    .qa-pill[data-changing="1"] .qa-icon-wrap {
      color: var(--accent-active);
    }

    .qa-pill[data-muted="1"] .qa-icon-wrap {
      color: var(--text-primary);
    }

    .qa-speaker {
      width: 20px;
      height: 20px;
      display: block;
      overflow: visible;
    }

    .qa-wave,
    .qa-mute-x {
      transition: opacity 140ms ease;
    }

    .qa-mid {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
      min-width: 0;
    }

    .qa-label-slot {
      display: inline-grid;
      align-items: center;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.2;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .qa-label-slot > span {
      grid-area: 1 / 1;
    }

    .qa-label-sizer {
      visibility: hidden;
    }

    .qa-meter {
      width: 128px;
      height: 8px;
      display: block;
      overflow: visible;
    }

    .qa-pct-slot {
      display: inline-grid;
      align-items: center;
      justify-items: end;
      flex-shrink: 0;
      font-size: 24px;
      font-weight: 600;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      white-space: nowrap;
    }

    .qa-pct-slot > span {
      grid-area: 1 / 1;
    }

    .qa-pct-sizer {
      visibility: hidden;
    }

    .qa-pct {
      display: inline-block;
      text-align: right;
      will-change: transform;
    }

    .qa-hint {
      display: none;
      margin-top: var(--sp-2);
      padding-top: var(--sp-2);
      border-top: 1px solid var(--divider);
      font-size: 12px;
      font-weight: 500;
      line-height: 1.2;
      color: var(--text-secondary);
      white-space: nowrap;
      text-align: center;
    }

    .qa-hint-short {
      display: none;
    }

    .qa-pill[data-hint="1"] .qa-hint {
      display: block;
    }

    .qa-sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    @container (max-width: 480px) {
      .qa-anchor {
        top: var(--sp-8);
      }
      .qa-pill {
        padding: var(--sp-2);
      }
      .qa-main {
        display: grid;
        grid-template-columns: 16px 1fr;
        grid-template-rows: auto auto;
        column-gap: var(--sp-2);
        row-gap: var(--sp-1);
        align-items: center;
      }
      .qa-icon-wrap {
        grid-column: 1;
        grid-row: 1;
        width: 16px;
        height: 16px;
      }
      .qa-speaker {
        width: 16px;
        height: 16px;
      }
      .qa-mid {
        display: contents;
      }
      .qa-label-slot {
        display: none;
      }
      .qa-pct-slot {
        grid-column: 2;
        grid-row: 1;
        font-size: 18px;
      }
      .qa-meter {
        grid-column: 1 / -1;
        grid-row: 2;
        width: 100%;
        height: 8px;
      }
      .qa-hint {
        margin-top: var(--sp-1);
        padding-top: var(--sp-1);
        font-size: 12px;
      }
      .qa-hint-full {
        display: none;
      }
      .qa-hint-short {
        display: inline;
      }
    }

    @container (max-height: 280px) {
      .qa-anchor {
        top: var(--sp-8);
      }
      .qa-pill {
        padding: var(--sp-2);
      }
      .qa-main {
        display: grid;
        grid-template-columns: 16px 1fr;
        grid-template-rows: auto auto;
        column-gap: var(--sp-2);
        row-gap: var(--sp-1);
        align-items: center;
      }
      .qa-icon-wrap {
        grid-column: 1;
        grid-row: 1;
        width: 16px;
        height: 16px;
      }
      .qa-speaker {
        width: 16px;
        height: 16px;
      }
      .qa-mid {
        display: contents;
      }
      .qa-label-slot {
        display: none;
      }
      .qa-pct-slot {
        grid-column: 2;
        grid-row: 1;
        font-size: 18px;
      }
      .qa-meter {
        grid-column: 1 / -1;
        grid-row: 2;
        width: 100%;
        height: 8px;
      }
      .qa-hint {
        margin-top: var(--sp-1);
        padding-top: var(--sp-1);
        font-size: 12px;
      }
      .qa-hint-full {
        display: none;
      }
      .qa-hint-short {
        display: inline;
      }
    }

    @container (min-width: 1800px) {
      .qa-anchor {
        top: var(--sp-8);
      }
      .qa-pill {
        padding: var(--sp-4) var(--sp-6);
      }
      .qa-main {
        gap: var(--sp-4);
      }
      .qa-icon-wrap {
        width: 32px;
        height: 32px;
      }
      .qa-speaker {
        width: 24px;
        height: 24px;
      }
      .qa-label-slot {
        font-size: 16px;
      }
      .qa-meter {
        width: 160px;
        height: 12px;
      }
      .qa-pct-slot {
        font-size: 32px;
      }
      .qa-hint {
        margin-top: var(--sp-3);
        padding-top: var(--sp-3);
        font-size: 14px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .qa-pill {
        transform: none;
        transition:
          opacity 140ms linear,
          border-color 120ms linear;
      }
      .qa-pill[data-visible="1"] {
        transform: none;
      }
      .qa-wave,
      .qa-mute-x,
      .qa-icon-wrap {
        transition: none;
      }
    }
  `;

  const stageEl = el("div", "qa-stage");
  const anchorEl = el("div", "qa-anchor");
  const pillEl = el("div", "qa-pill");
  const mainEl = el("div", "qa-main");

  // Speaker SVG icon (cone + 3 progressive arcs + mute cross)
  const iconWrapEl = el("div", "qa-icon-wrap");
  const speakerSvg = svgEl("svg", {
    class: "qa-speaker",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.85",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true"
  });
  const conePath = svgEl("path", {
    d: "M11 5L6.5 9H3.5C2.95 9 2.5 9.45 2.5 10V14C2.5 14.55 2.95 15 3.5 15H6.5L11 19V5Z",
    fill: "currentColor",
    "fill-opacity": "0.18"
  });
  const wave1 = svgEl("path", {
    class: "qa-wave",
    d: "M14.5 9.5C15.8 10.8 15.8 13.2 14.5 14.5"
  });
  const wave2 = svgEl("path", {
    class: "qa-wave",
    d: "M17.2 7C19.9 9.7 19.9 14.3 17.2 17"
  });
  const wave3 = svgEl("path", {
    class: "qa-wave",
    d: "M19.8 4.5C23.9 8.6 23.9 15.4 19.8 19.5"
  });
  const muteX = svgEl("path", {
    class: "qa-mute-x",
    d: "M15.5 9.5L20.5 14.5M20.5 9.5L15.5 14.5"
  });
  speakerSvg.appendChild(conePath);
  speakerSvg.appendChild(wave1);
  speakerSvg.appendChild(wave2);
  speakerSvg.appendChild(wave3);
  speakerSvg.appendChild(muteX);
  iconWrapEl.appendChild(speakerSvg);

  // Middle stack: verbal status + 20-step horizontal tick meter
  const midEl = el("div", "qa-mid");
  const labelSlotEl = el("div", "qa-label-slot");
  const labelSizerEl = el("span", "qa-label-sizer", "Full volume");
  const labelTextEl = el("span", "qa-label-text", "Ad volume");
  labelSlotEl.appendChild(labelSizerEl);
  labelSlotEl.appendChild(labelTextEl);

  const meterSvg = svgEl("svg", {
    class: "qa-meter",
    viewBox: "0 0 118 10",
    preserveAspectRatio: "xMinYMid meet",
    "aria-hidden": "true"
  });
  const tickNodes = [];
  for (let i = 0; i < TOTAL_STEPS; i += 1) {
    const isQuarter = (i + 1) % 5 === 0;
    const baseH = isQuarter ? 6.5 : 5;
    const baseY = (10 - baseH) / 2;
    const rect = svgEl("rect", {
      x: i * 6,
      y: baseY,
      width: 3,
      height: baseH,
      rx: 1.5,
      fill: "var(--tick-empty)"
    });
    meterSvg.appendChild(rect);
    tickNodes.push({ node: rect, stepLevel: (i + 1) * 5, baseH: baseH });
  }

  midEl.appendChild(labelSlotEl);
  midEl.appendChild(meterSvg);

  // Right percentage hero readout (1-cell grid keeps width constant across 0%, 15%, 100%)
  const pctSlotEl = el("div", "qa-pct-slot");
  const pctSizerEl = el("span", "qa-pct-sizer", "100%");
  const pctEl = el("span", "qa-pct", "15%");
  pctSlotEl.appendChild(pctSizerEl);
  pctSlotEl.appendChild(pctEl);

  mainEl.appendChild(iconWrapEl);
  mainEl.appendChild(midEl);
  mainEl.appendChild(pctSlotEl);

  // Hint footer (shown only when hint: true)
  const hintEl = el("div", "qa-hint");
  const hintFullEl = el("span", "qa-hint-full", "Adjust: scroll · \u2191\u2193 · W/S");
  const hintShortEl = el("span", "qa-hint-short", "Wheel · \u2191\u2193 · W/S");
  hintEl.appendChild(hintFullEl);
  hintEl.appendChild(hintShortEl);

  // Accessible live region (polite, concise)
  const srEl = el("div", "qa-sr");
  srEl.setAttribute("role", "status");
  srEl.setAttribute("aria-live", "polite");
  srEl.setAttribute("aria-atomic", "true");

  pillEl.appendChild(mainEl);
  pillEl.appendChild(hintEl);
  pillEl.appendChild(srEl);
  anchorEl.appendChild(pillEl);
  stageEl.appendChild(anchorEl);

  root.appendChild(styleEl);
  root.appendChild(stageEl);

  const reducedMotionQuery =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;

  function prefersReducedMotion() {
    return Boolean(reducedMotionQuery && reducedMotionQuery.matches);
  }

  let destroyed = false;
  let phase = "hidden"; // "hidden" | "visible" | "leaving"
  let targetLevel = 15;
  let visualLevel = 15;
  let hintOn = false;
  let isChanging = false;

  let impulseY = 0;
  let impulseVel = 0;
  let rafId = 0;
  let lastFrameTs = 0;
  let changingTimer = 0;
  let leaveTimer = 0;
  let srTimer = 0;

  function labelForLevel(lvl) {
    if (lvl === 0) return "Ad muted";
    if (lvl === 100) return "Full volume";
    return "Ad volume";
  }

  function updateStaticReadout(lvl) {
    pctEl.textContent = lvl + "%";
    labelTextEl.textContent = labelForLevel(lvl);
    pillEl.setAttribute("data-muted", lvl === 0 ? "1" : "0");

    muteX.style.opacity = lvl === 0 ? "1" : "0";
    wave1.style.opacity = lvl >= 5 ? "1" : "0";
    wave2.style.opacity = lvl >= 40 ? "1" : "0";
    wave3.style.opacity = lvl >= 75 ? "1" : "0";
  }

  function scheduleSrUpdate(lvl) {
    clearTimeout(srTimer);
    srTimer = setTimeout(function () {
      if (destroyed || phase !== "visible") return;
      srEl.textContent = labelForLevel(lvl) + " " + lvl + "%";
    }, 180);
  }

  function renderMeter(vLevel, active) {
    const activeColor = active ? "var(--accent-active)" : "var(--tick-steady)";
    for (let i = 0; i < TOTAL_STEPS; i += 1) {
      const item = tickNodes[i];
      const prevStep = i * 5;
      const fillFrac = Math.max(0, Math.min(1, (vLevel - prevStep) / 5));

      let h = item.baseH;
      if (active && vLevel > 0) {
        const dist = Math.abs(vLevel - item.stepLevel);
        if (dist < 6) {
          const lift = (1 - dist / 6) * 3.0;
          h = Math.min(10, item.baseH + lift);
        }
      }
      const y = (10 - h) / 2;
      item.node.setAttribute("y", y.toFixed(2));
      item.node.setAttribute("height", h.toFixed(2));

      if (fillFrac <= 0.02) {
        item.node.setAttribute("fill", "var(--tick-empty)");
        item.node.removeAttribute("fill-opacity");
      } else if (fillFrac >= 0.98) {
        item.node.setAttribute("fill", activeColor);
        item.node.removeAttribute("fill-opacity");
      } else {
        item.node.setAttribute("fill", activeColor);
        item.node.setAttribute("fill-opacity", (0.25 + 0.75 * fillFrac).toFixed(2));
      }
    }
  }

  function stopRaf() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    lastFrameTs = 0;
  }

  function tickAnimation(ts) {
    if (destroyed) return;
    if (!lastFrameTs) lastFrameTs = ts;
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastFrameTs) / 1000));
    lastFrameTs = ts;

    // Critically damped chase for meter level
    const rate = 22;
    const blend = 1 - Math.exp(-rate * dt);
    visualLevel += (targetLevel - visualLevel) * blend;

    // Overdamped spring for vertical digit impulse
    const stiffness = 260;
    const damping = 28;
    const accel = -stiffness * impulseY - damping * impulseVel;
    impulseVel += accel * dt;
    impulseY += impulseVel * dt;

    const levelDone = Math.abs(targetLevel - visualLevel) < 0.06;
    const impulseDone = Math.abs(impulseY) < 0.05 && Math.abs(impulseVel) < 0.4;

    if (levelDone) visualLevel = targetLevel;
    if (impulseDone) {
      impulseY = 0;
      impulseVel = 0;
    }

    pctEl.style.transform = impulseY === 0 ? "" : "translateY(" + impulseY.toFixed(2) + "px)";
    renderMeter(visualLevel, isChanging);

    if (levelDone && impulseDone) {
      stopRaf();
    } else {
      rafId = requestAnimationFrame(tickAnimation);
    }
  }

  function ensureRaf() {
    if (!rafId && !destroyed) {
      lastFrameTs = 0;
      rafId = requestAnimationFrame(tickAnimation);
    }
  }

  function triggerChangingWindow() {
    isChanging = true;
    pillEl.setAttribute("data-changing", "1");
    clearTimeout(changingTimer);
    changingTimer = setTimeout(function () {
      if (destroyed) return;
      isChanging = false;
      pillEl.setAttribute("data-changing", "0");
      renderMeter(visualLevel, false);
    }, 850);
  }

  function applyStepMotion(prevLevel, nextLevel) {
    updateStaticReadout(nextLevel);
    triggerChangingWindow();
    scheduleSrUpdate(nextLevel);

    if (prefersReducedMotion()) {
      stopRaf();
      visualLevel = nextLevel;
      impulseY = 0;
      impulseVel = 0;
      pctEl.style.transform = "";
      renderMeter(visualLevel, true);
      return;
    }

    const delta = nextLevel - prevLevel;
    if (delta > 0) {
      // Going up: upward kick (negative Y)
      impulseY = Math.max(-6, Math.min(-2.5, impulseY - 3.2));
      impulseVel = -18;
    } else if (delta < 0) {
      // Going down: downward kick (positive Y)
      impulseY = Math.min(6, Math.max(2.5, impulseY + 3.2));
      impulseVel = 18;
    } else {
      // Already at 0 or 100 boundary: subtle tactile stop
      const edgeDir = nextLevel === 0 ? 1.4 : nextLevel === 100 ? -1.4 : 0;
      impulseY = edgeDir;
      impulseVel = 0;
    }

    ensureRaf();
  }

  function show(opts) {
    if (destroyed) return;
    const safeOpts = opts && typeof opts === "object" ? opts : {};
    const nextLevel = clampLevel(safeOpts.level !== undefined ? safeOpts.level : targetLevel);
    hintOn = Boolean(safeOpts.hint);

    clearTimeout(leaveTimer);
    leaveTimer = 0;

    pillEl.setAttribute("data-hint", hintOn ? "1" : "0");

    if (phase === "hidden") {
      targetLevel = nextLevel;
      visualLevel = nextLevel;
      impulseY = 0;
      impulseVel = 0;
      pctEl.style.transform = "";
      isChanging = false;
      pillEl.setAttribute("data-changing", "0");
      updateStaticReadout(targetLevel);
      renderMeter(visualLevel, false);

      pillEl.setAttribute("data-mounted", "1");
      // Flush style so initial fade-in transition always runs cleanly
      void pillEl.offsetWidth;
      phase = "visible";
      pillEl.setAttribute("data-visible", "1");
      srEl.textContent = labelForLevel(targetLevel) + " " + targetLevel + "%";
    } else if (phase === "leaving") {
      const prev = targetLevel;
      targetLevel = nextLevel;
      phase = "visible";
      pillEl.setAttribute("data-mounted", "1");
      pillEl.setAttribute("data-visible", "1");
      if (prev !== nextLevel) {
        applyStepMotion(prev, nextLevel);
      } else {
        updateStaticReadout(targetLevel);
        renderMeter(visualLevel, isChanging);
        srEl.textContent = labelForLevel(targetLevel) + " " + targetLevel + "%";
      }
    } else {
      // Already visible
      const prev = targetLevel;
      targetLevel = nextLevel;
      if (prev !== nextLevel) {
        applyStepMotion(prev, nextLevel);
      } else {
        updateStaticReadout(targetLevel);
      }
    }
  }

  function set(level) {
    if (destroyed) return;
    const prev = targetLevel;
    targetLevel = clampLevel(level);

    if (phase === "hidden") {
      visualLevel = targetLevel;
      updateStaticReadout(targetLevel);
      renderMeter(visualLevel, false);
      return;
    }

    applyStepMotion(prev, targetLevel);
  }

  function hide() {
    if (destroyed || phase === "hidden" || phase === "leaving") return;
    phase = "leaving";
    clearTimeout(changingTimer);
    isChanging = false;
    pillEl.setAttribute("data-changing", "0");
    pillEl.setAttribute("data-visible", "0");

    const fadeMs = prefersReducedMotion() ? 160 : 920;
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(function () {
      if (destroyed || phase !== "leaving") return;
      phase = "hidden";
      stopRaf();
      visualLevel = targetLevel;
      impulseY = 0;
      impulseVel = 0;
      pctEl.style.transform = "";
      pillEl.setAttribute("data-mounted", "0");
      srEl.textContent = "";
    }, fadeMs);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopRaf();
    clearTimeout(changingTimer);
    clearTimeout(leaveTimer);
    clearTimeout(srTimer);
    if (styleEl.parentNode === root) root.removeChild(styleEl);
    if (stageEl.parentNode === root) root.removeChild(stageEl);
  }

  return { show: show, set: set, hide: hide, destroy: destroy };
}
