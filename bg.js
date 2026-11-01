// Topographic contour background: Perlin noise + marching squares.
// Performance notes:
//  - the canvas covers the viewport only (fixed), not the whole document
//  - device pixel ratio is capped and the cell count is capped on very wide screens (4K)
//  - all thin lines and all thick lines are drawn in one path each (2 strokes per frame)
//  - animation runs at <= 30fps, only while the top section is visible and the tab is active
//  - phones/tablets and prefers-reduced-motion get a single static frame
//  - cell size adapts if a frame takes too long on slower machines
import { noise } from "./node_modules/@chriscourses/perlin-noise/index.js";

const SHOW_FPS = false;
const THRESHOLD_STEP = 4;          // noise range 0-100, one contour every 4 units
const THICK_EVERY = 3;             // every 3rd contour is drawn thicker
const Z_SPEED = 0.0002;            // drift per 60fps frame (same feel as before)
const FRAME_MS = 1000 / 30;        // animation frame cap
const MAX_DPR = 1.5;
const MAX_COLS = 170;              // keeps 4K screens from computing 4x the cells
const RES_MIN = 12;
const RES_MAX = 32;
const RES_STEP = 2;
const BUDGET_SLOW_MS = 14;         // average draw time above this: coarser grid
const BUDGET_FAST_MS = 6;          // below this: finer grid (down to the base size)
const NOISE_SCALE = 0.02 / 12;     // per CSS pixel, so contour size doesn't depend on cell size
const MOUSE_RADIUS_PX = 144;

const canvas = document.getElementById("res-canvas");
const ctx = canvas?.getContext("2d");

if (canvas && ctx) start();

function start() {
  const root = document.documentElement;
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isMobile =
    /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent) ||
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  let width = 0, height = 0, res = RES_MIN, baseRes = RES_MIN;
  let cols = 0, rows = 0, unit = 1;
  let values = new Float32Array(0);
  let boost = new Float32Array(0);
  let gradient = null;
  let zOffset = Math.random() * 1000;
  let noiseMin = 100, noiseMax = 0;

  let heroVisible = !!document.querySelector("[data-bg-hero]");
  let rafId = 0, lastFrame = 0;
  let drawTimes = [], cooldown = 0;
  let mouse = null;
  let lastWidth = -1;

  /* ----- sizing ----- */
  function resize() {
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    unit = (parseFloat(getComputedStyle(root).fontSize) || 16) / 16;
    baseRes = Math.max(RES_MIN, Math.ceil(width / MAX_COLS));
    res = Math.max(res, baseRes);
    buildGrid();

    gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#edd500");
    gradient.addColorStop(0.5, "#ff006f");
    gradient.addColorStop(1, "#1723cc");
  }

  function buildGrid() {
    cols = Math.ceil(width / res) + 1;
    rows = Math.ceil(height / res) + 1;
    values = new Float32Array(cols * rows);
    boost = new Float32Array(cols * rows);
  }

  /* ----- noise field ----- */
  function generate() {
    noiseMin = 100;
    noiseMax = 0;
    const s = (NOISE_SCALE * res) / unit;
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const i = row + x;
        const v = noise(x * s, y * s, zOffset + boost[i]) * 100;
        values[i] = v;
        if (v < noiseMin) noiseMin = v;
        if (v > noiseMax) noiseMax = v;
        if (boost[i] > 0) boost[i] *= 0.99;
      }
    }
  }

  function applyMouse() {
    if (!mouse) return;
    const cx = Math.floor(mouse.x / res);
    const cy = Math.floor(mouse.y / res);
    const r = Math.max(2, Math.round(MOUSE_RADIUS_PX / res));
    const r2 = r * r;
    for (let j = -r; j <= r; j++) {
      const y = cy + j;
      if (y < 0 || y >= rows) continue;
      for (let i = -r; i <= r; i++) {
        const x = cx + i;
        if (x < 0 || x >= cols) continue;
        const d2 = i * i + j * j;
        if (d2 <= r2) boost[y * cols + x] += 0.0055 * (1 - d2 / r2);
      }
    }
  }

  /* ----- marching squares ----- */
  function lerp(a, b, t) {
    return a === b ? 0 : (t - a) / (b - a);
  }

  function contour(t) {
    for (let y = 0; y < rows - 1; y++) {
      const r0 = y * cols, r1 = r0 + cols;
      const py = y * res;
      for (let x = 0; x < cols - 1; x++) {
        const nw = values[r0 + x], ne = values[r0 + x + 1];
        const se = values[r1 + x + 1], sw = values[r1 + x];
        const type = (nw > t ? 8 : 0) | (ne > t ? 4 : 0) | (se > t ? 2 : 0) | (sw > t ? 1 : 0);
        if (type === 0 || type === 15) continue;

        const px = x * res;
        // Edge points: a = top, b = right, c = bottom, d = left
        switch (type) {
          case 1: case 14:
            seg(px, py + res * lerp(nw, sw, t), px + res * lerp(sw, se, t), py + res); break;
          case 2: case 13:
            seg(px + res, py + res * lerp(ne, se, t), px + res * lerp(sw, se, t), py + res); break;
          case 3: case 12:
            seg(px, py + res * lerp(nw, sw, t), px + res, py + res * lerp(ne, se, t)); break;
          case 4: case 11:
            seg(px + res * lerp(nw, ne, t), py, px + res, py + res * lerp(ne, se, t)); break;
          case 5:
            seg(px, py + res * lerp(nw, sw, t), px + res * lerp(nw, ne, t), py);
            seg(px + res * lerp(sw, se, t), py + res, px + res, py + res * lerp(ne, se, t)); break;
          case 6: case 9:
            seg(px + res * lerp(sw, se, t), py + res, px + res * lerp(nw, ne, t), py); break;
          case 7: case 8:
            seg(px, py + res * lerp(nw, sw, t), px + res * lerp(nw, ne, t), py); break;
          case 10:
            seg(px + res * lerp(nw, ne, t), py, px + res, py + res * lerp(ne, se, t));
            seg(px + res * lerp(sw, se, t), py + res, px, py + res * lerp(nw, sw, t)); break;
        }
      }
    }
  }

  function seg(x1, y1, x2, y2) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }

  function draw() {
    generate();
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = gradient;

    const lo = Math.floor(noiseMin / THRESHOLD_STEP) * THRESHOLD_STEP;
    const hi = Math.ceil(noiseMax / THRESHOLD_STEP) * THRESHOLD_STEP;
    const thickStep = THRESHOLD_STEP * THICK_EVERY;

    ctx.beginPath();
    for (let t = lo; t < hi; t += THRESHOLD_STEP) if (t % thickStep !== 0) contour(t);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    for (let t = lo; t < hi; t += THRESHOLD_STEP) if (t % thickStep === 0) contour(t);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* ----- adaptive quality ----- */
  function track(ms) {
    drawTimes.push(ms);
    if (drawTimes.length < 30) return;
    const avg = drawTimes.reduce((a, b) => a + b, 0) / drawTimes.length;
    drawTimes = [];
    if (SHOW_FPS) console.log(`contour draw ${avg.toFixed(1)}ms @ res ${res}`);
    if (cooldown > 0) { cooldown--; return; }
    let next = res;
    if (avg > BUDGET_SLOW_MS && res < RES_MAX) next = Math.min(res + RES_STEP, RES_MAX);
    else if (avg < BUDGET_FAST_MS && res > baseRes) next = Math.max(res - RES_STEP, baseRes);
    if (next !== res) {
      res = next;
      cooldown = 3;
      buildGrid();
    }
  }

  /* ----- loop control ----- */
  const shouldAnimate = () => !isMobile && !reducedQuery.matches && heroVisible && !document.hidden;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const elapsed = now - lastFrame;
    if (elapsed < FRAME_MS) return;
    lastFrame = now;
    zOffset += Z_SPEED * Math.min(elapsed, 100) / (1000 / 60);
    applyMouse();
    const t0 = performance.now();
    draw();
    track(performance.now() - t0);
  }

  function update() {
    if (shouldAnimate()) {
      if (!rafId) {
        lastFrame = 0;
        rafId = requestAnimationFrame(frame);
      }
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  /* ----- events ----- */
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Phones resize the viewport height when the address bar hides; ignore that.
      if (isMobile && window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      resize();
      draw();
    }, 150);
  });

  if (!isMobile) {
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") mouse = { x: e.clientX, y: e.clientY };
    }, { passive: true });
    document.addEventListener("pointerleave", () => { mouse = null; });
  }

  document.addEventListener("visibilitychange", update);
  reducedQuery.addEventListener("change", update);

  const hero = document.querySelector("[data-bg-hero]");
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      root.classList.toggle("bg-dim", !heroVisible);
      update();
    }, { rootMargin: "-35% 0px 0px 0px" }).observe(hero);
  } else {
    heroVisible = false;
    root.classList.add("bg-dim");
  }

  /* ----- first frame ----- */
  lastWidth = window.innerWidth;
  resize();
  draw();
  requestAnimationFrame(() => root.classList.add("bg-ready"));
  update();
}
