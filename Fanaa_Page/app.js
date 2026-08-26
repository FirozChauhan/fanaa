/* fanaa landing — all the interactivity in one script. Author: FIROZ KHAN CHAUHAN.
   Vanilla JS, no framework, no build step:
     - install tabs + copy button
     - "compatible" marquee chips
     - topbar scroll state
     - aurora starfield background (direct port of omp.sh's poster shader)
   Everything is plain DOM + canvas. Keep it dependency-free. */

/* install options — commands are aspirational until the CLI actually ships */
const INSTALLS = [
  { id: "curl", label: "curl", cmd: "curl -fsSL https://raw.githubusercontent.com/FirozChauhan/fanaa/main/install.sh | sh", hint: "macOS · Linux" },
  { id: "src", label: "src", cmd: "git clone https://github.com/FirozChauhan/fanaa", hint: "from source" },
];

const CHIPS = [
  "bash", "zsh", "fish", "powershell", "nu", "xonsh",
  "vim", "neovim", "nano",
  "kitty", "alacritty", "iterm2", "ghostty", "tmux",
  "linux", "macos",
];

/* ---------------------------------------------------------------- topbar scroll state */

const topbar = document.getElementById("topbar");

function onScroll() {
  if (!topbar) return;
  topbar.classList.toggle("scrolled", window.scrollY > 24);
}
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------------------------------------------------------------- install tabs */

const installEl = document.getElementById("install");

/* rebuild the whole tab group on switch — simpler than diffing, and the
   page is small enough that it doesn't matter. Focus returns to <body>;
   fine for a landing page. */
function renderTabs(selectedId) {
  const current = INSTALLS.find((t) => t.id === selectedId) ?? INSTALLS[0];

  const tabs = document.createElement("div");
  tabs.className = "tabs";

  for (const t of INSTALLS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab mono-fig";
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(t.id === current.id));
    btn.textContent = t.label;
    btn.addEventListener("click", () => renderTabs(t.id));
    tabs.appendChild(btn);
  }

  const hint = document.createElement("span");
  hint.className = "hint mono-fig";
  hint.textContent = current.hint;
  tabs.appendChild(hint);

  const box = document.createElement("div");
  box.className = "cmdbox";

  const prompt = document.createElement("span");
  prompt.className = "prompt terminal";
  prompt.setAttribute("aria-hidden", "true");
  prompt.textContent = "$";

  const cmd = document.createElement("code");
  cmd.className = "cmd terminal";
  cmd.textContent = current.cmd;

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy mono-fig";
  copy.setAttribute("aria-label", `Copy install command for ${current.label}`);

  /* swap the label for a "✓ copied" flash, then revert */

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "copy";

  const done = document.createElement("span");
  done.className = "done";
  done.setAttribute("aria-hidden", "true");
  done.textContent = "✓ copied";

  copy.append(label, done);
  copy.addEventListener("click", () => {
    copyToClipboard(current.cmd);
    copy.classList.add("copied");
    window.setTimeout(() => copy.classList.remove("copied"), 1400);
  });

  box.append(prompt, cmd, copy);
  installEl.replaceChildren(tabs, box);
}

renderTabs(INSTALLS[0].id);

/* ---------------------------------------------------------------- clipboard */

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

/* execCommand fallback so the copy button works from file:// too */
function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* no-op */
  }
  ta.remove();
}

/* ---------------------------------------------------------------- compatible marquee */

function renderChips(root) {
  for (const name of CHIPS) {
    const span = document.createElement("span");
    span.className = "chip";
    span.textContent = name;
    root.appendChild(span);
  }
}

document.querySelectorAll(".chips").forEach(renderChips);

/* ---------------------------------------------------------------- aurora starfield
 *
 * Exact port of omp.sh's poster background — CPU fallback path (yr).
 *   - vr(w,h)  → scene geometry (center, radius, thetaMin, thetaMax)
 *   - hr(hue)  → hue-rotated palette (41°)
 *   - gr / _r  → deterministic RNGs (same seeds)
 *   - field    → half-res dither with sky/violet/plum falloffs
 *   - particles→ silver specks in the visible arc [thetaMin, thetaMax]
 *   - grade    → 512²-tiled white & dark specks
 *   - grain    → per-pixel ±12 noise
 *
 * Canvas is viewport-sized (budget 2.2M pixels).  The wrapper is CSS-flipped
 * (scaleY(-1)) so the visible band sits at the bottom-right, matching the
 * live omp.sh page (which flips the GPU/CPU canvas identically).
 */

/* ---- palette ---- */
const HUE = 41;

/* ---- RNGs (exact reference seeds) ---- */
function gr(e) {
  let t = e >>> 0;
  t = Math.imul(t ^ (t >>> 16), 2146121005);
  t = Math.imul(t ^ (t >>> 15), 2221713035);
  return (t ^ (t >>> 16)) >>> 0;
}
function _r(e) { return (gr(e) >>> 8) / 16777216; }

/* ---- hr(hue) — hue rotation palette ---- */
function hr(e) {
  const t = e * Math.PI / 180, n = Math.cos(t), r = Math.sin(t);
  const i = [
    [0.213 + n * 0.787 - r * 0.213, 0.715 - n * 0.715 - r * 0.715, 0.072 - n * 0.072 + r * 0.928],
    [0.213 - n * 0.213 + r * 0.143, 0.715 + n * 0.285 + r * 0.14,  0.072 - n * 0.072 - r * 0.283],
    [0.213 - n * 0.213 - r * 0.787, 0.715 - n * 0.715 + r * 0.715, 0.072 + n * 0.928 + r * 0.072],
  ];
  const a = (row, col) => Math.min(255, Math.max(0, row[0] * col[0] + row[1] * col[1] + row[2] * col[2]));
  const o = (c) => [a(i[0], c), a(i[1], c), a(i[2], c)];
  return {
    sky:    o([56, 189, 248]),
    violet: o([192, 132, 252]),
    plum:   o([70, 15, 85]),
    silver: o([250, 250, 252]),
    black:  o([9, 9, 11]),
  };
}

/* ---- vr(w,h) — scene geometry (exact reference) ---- */
function vr(w, h) {
  const n = Math.min(2, Math.max(0.5, Math.sqrt(w * h / (1920 * 1080))));
  const r = -724 * n + (w - 1920 * n) * 0.4;
  const i = 2000 * n, a = 2500 * n;
  const o = r + Math.sqrt(a * a - i * i);
  const s = w - r;
  const c = a > s ? i - Math.sqrt(a * a - s * s) : Infinity;
  const l = Math.min(o, w * 0.405);
  const u = Math.min(c, h * 0.585);
  const d = w - l, f = u, p = Math.hypot(d, f), m = p * 0.062;
  const rad = p * p / (8 * m) + m * 0.5;
  const g = (l + w) * 0.5 - f / p * (rad - m);
  const _ = u * 0.5 + d / p * (rad - m);
  let v = Infinity, y = -Infinity;
  for (let n = 0; n <= 32; n++) {
    const r = n / 32;
    for (const [px, py] of [[w * r, 0], [w * r, h], [0, h * r], [w, h * r]]) {
      const a = Math.atan2(py - _, px - g);
      if (a < v) v = a;
      if (a > y) y = a;
    }
  }
  return { scale: n, centerX: g, centerY: _, radius: rad, thetaMin: v - 0.04, thetaMax: y + 0.04 };
}

/* ---- aurora starfield bootstrap ---- */
(() => {
  const wrap = document.getElementById("bg");
  if (!wrap) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FPS = 60;
  const TAU = Math.PI * 2;
  const BUDGET = 2200000; // 2.2M pixel budget (matches omp.sh's br)

  const PAL = hr(HUE);

  const field = document.createElement("canvas");
  field.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  wrap.append(field);
  const fx = field.getContext("2d");
  if (!fx) return;

  let W = 0, H = 0;
  let img = null, buf = null;
  let baseBuf = null;
  let grainBuf = null;
  let cells = [];
  let parts = [];
  let scene = null;

  function vignetteAt(x, y) {
    const n = Math.hypot(x - W / 2, y - H / 2) / (1600 * scene.scale);
    return Math.max(0.2, 1 - n * n * n);
  }

  function build() {
    /* canvas size: budget formula */
    const rect = wrap.getBoundingClientRect();
    const vw = Math.max(320, rect.width);
    const vh = Math.max(240, rect.height);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const budgetScale = Math.sqrt(BUDGET / (vw * vh));
    const o = Math.max(0.55, Math.min(dpr, budgetScale));
    W = Math.round(vw * o);
    H = Math.round(vh * o);

    field.width = W;
    field.height = H;

    scene = vr(W, H);

    const columns = Math.ceil(W * 0.5);
    const vignR = 1600 * scene.scale;
    const a = scene.scale;
    const f = 500 * a;  // particle depth range

    img = fx.createImageData(W, H);
    buf = img.data;
    baseBuf = new Uint8ClampedArray(W * H * 4);
    grainBuf = new Uint8ClampedArray(W * H);

    /* static base: black·vignette + per-pixel grain + grade specks */
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const shade = vignetteAt(x, y);
        const idx = y * W + x;
        const grain = (_r(idx ^ 0x9e3779b9) - 0.5) * 24;
        const o = idx * 4;
        /* grade — 512² tiled white/dark specks */
        const gv = _r((((y % 512) * 512 + (x % 512)) >>> 0) ^ 0xc2b2ae35);
        let speckOffset = 0;
        if (gv < 0.045) {
          const speckVal = gv < 0.023 ? 0 : 255;
          speckOffset = (speckVal - 0) * (10 / 255);
        }
        baseBuf[o] = Math.min(255, Math.max(0, PAL.black[0] * shade + grain + speckOffset));
        baseBuf[o + 1] = Math.min(255, Math.max(0, PAL.black[1] * shade + grain + speckOffset));
        baseBuf[o + 2] = Math.min(255, Math.max(0, PAL.black[2] * shade + grain + speckOffset));
        baseBuf[o + 3] = 255;
        grainBuf[idx] = Math.round((grain + 12) / 24 * 255);
      }
    }

    /* per 2×2 cell: rim falloffs (exact reference) */
    cells = [];
    const w2 = 14 * a, te = 120 * a, ne = 600 * a;
    const re = 10 * a, ie = 30 * a, ae = 5 * a;
    const d = TAU * 2.2 / (scene.thetaMax - scene.thetaMin);
    for (let y0 = 0; y0 < H; y0 += 2) {
      for (let x0 = 0; x0 < W; x0 += 2) {
        const dx = x0 - scene.centerX, dy = y0 - scene.centerY;
        const rim = Math.hypot(dx, dy) - scene.radius;
        if (rim < 0) continue;
        const shade = vignetteAt(x0 + 1, y0 + 1);
        const cellIdx = ((y0 >> 1) * columns + (x0 >> 1)) >>> 0;
        const theta = Math.atan2(dy, dx);
        cells.push({
          x: x0, y: y0, rim, shade, cellIdx, theta,
          w2, te, ne, re, ie, ae, d,
          sR: PAL.sky[0] * shade, sG: PAL.sky[1] * shade, sB: PAL.sky[2] * shade,
          vR: PAL.violet[0] * shade, vG: PAL.violet[1] * shade, vB: PAL.violet[2] * shade,
          pR: PAL.plum[0] * shade, pG: PAL.plum[1] * shade, pB: PAL.plum[2] * shade,
        });
      }
    }

    /* particles — reference wedge [thetaMin, thetaMax], radial [R−f, R] */
    const count = Math.min(30000, Math.round(0.1 * 0.25 * (scene.thetaMax - scene.thetaMin) * (scene.radius - f / 2) * f * 0.25));
    parts = [];
    for (let i = 0; i < count; i++) {
      const seed = gr(i ^ 0xa511e9b3) >>> 0;
      const theta = scene.thetaMin + (scene.thetaMax - scene.thetaMin) * _r(seed);
      const depth = f * (1 - Math.cbrt(_r(seed ^ 0x63d83595)));
      const maxDepth = Math.max(depth, 14 * a);
      const h2 = _r(seed ^ 0x32664899) * maxDepth;
      const radius = scene.radius - h2;
      const v2 = 0.004 + _r(seed ^ 0x66826526) * 0.011;
      const wp = _r(seed ^ 0x37476139) * TAU;
      parts.push({
        theta, depth, maxDepth, h2, radius, v2, wp,
        speed: (0.14 + _r(seed ^ 0x9e3779b9) * 0.22) * a,
        offset: _r(seed ^ 0x27d4eb2f) * maxDepth,
      });
    }
  }

  function render(frame) {
    if (!img || !scene) return;
    buf.set(baseBuf);

    const a = scene.scale;
    const phase = frame * (TAU * 2.2 / 720);

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.rim < 0) continue;
      const generation = Math.floor((frame + 89 - (c.cellIdx % 90)) / 90);
      const roll = _r((c.cellIdx ^ (Math.imul(generation, 0xc2b2ae35) | 0) ^ 0x20260712) >>> 0);
      let rR, rG, rB;
      let drew = false;
      if (c.rim < c.ae) {
        /* pure sky with glimmer (no dither) */
        const glimmer = 1 + 0.16 * Math.sin(c.theta * c.d - phase);
        rR = c.sR * glimmer; rG = c.sG * glimmer; rB = c.sB * glimmer;
        drew = true;
      } else {
        const ts = Math.exp(-c.rim / c.w2);
        const av = Math.exp(-c.rim / c.te) * Math.min(1, c.rim / c.re) * 0.85;
        const op = Math.exp(-c.rim / c.ne) * Math.min(1, c.rim / c.ie) * 0.7;
        const total = Math.min(1, ts + av + op);
        if (total <= 0.003) continue;
        if (roll < ts) {
          const glimmer = 1 + 0.16 * Math.sin(c.theta * c.d - phase);
          rR = c.sR * glimmer; rG = c.sG * glimmer; rB = c.sB * glimmer;
          drew = true;
        } else if (roll < ts + av) {
          rR = c.vR; rG = c.vG; rB = c.vB; drew = true;
        } else if (roll < total) {
          rR = c.pR; rG = c.pG; rB = c.pB; drew = true;
        }
      }
      if (drew) {
        const o = (c.y * W + c.x) * 4;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const q = o + (dy * W + dx) * 4;
            const gIdx = (c.y + dy) * W + (c.x + dx);
            const grain = grainBuf[gIdx] / 255 * 24 - 12;
            buf[q] = Math.max(0, rR + grain);
            buf[q + 1] = Math.max(0, rG + grain);
            buf[q + 2] = Math.max(0, rB + grain);
            buf[q + 3] = 255;
          }
        }
      }
    }

    /* particles: streaming silver specks, drawn into the same buffer */
    for (const p of parts) {
      /* streaming depth */
      let travel = frame * p.speed + p.offset;
      let depth = travel - Math.floor(travel / p.maxDepth) * p.maxDepth;
      if (depth < 0) depth += p.maxDepth;
      const radius = scene.radius - depth;
      const wobble = -(0.06 * a / p.v2) * Math.cos(frame * p.v2 + p.wp) / Math.max(radius, 1);
      const theta = p.theta + wobble;
      const X = scene.centerX + radius * Math.cos(theta);
      const Y = scene.centerY + radius * Math.sin(theta);
      if (X < -2 || X > W + 2 || Y < -2 || Y > H + 2) continue;
      const intensity = vignetteAt(X, Y);
      const fadeIn = Math.min(1, depth / 3);
      const fadeOut = (p.maxDepth - depth) / (p.maxDepth * 0.25);
      const alpha = Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut) * intensity));
      if (alpha <= 0.004) continue;
      /* lerp toward silver (reference: g[idx] += (silver·w3 − g[idx])·fade) */
      const o = (Math.round(Y) * W + Math.round(X)) * 4;
      if (o < 0 || o + 4 > buf.length) continue;
      const sil = PAL.silver, iv = intensity;
      buf[o]   += (sil[0] * iv - buf[o])   * alpha;
      buf[o+1] += (sil[1] * iv - buf[o+1]) * alpha;
      buf[o+2] += (sil[2] * iv - buf[o+2]) * alpha;
      const Xr = Math.round(X), Yr = Math.round(Y);
      if (Xr + 1 < W) {
        const o2 = o + 4;
        buf[o2]   += (sil[0] * iv - buf[o2])   * alpha;
        buf[o2+1] += (sil[1] * iv - buf[o2+1]) * alpha;
        buf[o2+2] += (sil[2] * iv - buf[o2+2]) * alpha;
      }
      if (Yr + 1 < H) {
        const o3 = o + W * 4;
        buf[o3]   += (sil[0] * iv - buf[o3])   * alpha;
        buf[o3+1] += (sil[1] * iv - buf[o3+1]) * alpha;
        buf[o3+2] += (sil[2] * iv - buf[o3+2]) * alpha;
        if (Xr + 1 < W) {
          const o4 = o3 + 4;
          buf[o4]   += (sil[0] * iv - buf[o4])   * alpha;
          buf[o4+1] += (sil[1] * iv - buf[o4+1]) * alpha;
          buf[o4+2] += (sil[2] * iv - buf[o4+2]) * alpha;
        }
      }
    }
    fx.putImageData(img, 0, 0);
  }

  let t0 = performance.now();
  let rafId = 0;

  function frame(now) {
    const t = (now - t0) / 1000;
    render(Math.max(0, Math.floor(t * FPS)));
    if (!reduced) rafId = requestAnimationFrame(frame);
  }

  function init() {
    build();
    render(0);
    if (!reduced) {
      t0 = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }

  init();

  /* resize handler (matches omp.sh's g() → resize) */
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(rafId);
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      init();
    }, 200);
  }, { passive: true });
})();
