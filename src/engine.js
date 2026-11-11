// Plan3D motoru: proje verisinden (duvar, kapi, pencere, oda, mobilya) gezilebilir sahne kurar.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const FLOORS = { marble: 'Gri mermer', whitemarble: 'Beyaz mermer', blackmarble: 'Siyah mermer', oak: 'Meşe parke', herringbone: 'Balıksırtı parke', darkoak: 'Koyu parke', concrete: 'Beton / mikroçimento' };
export const COLORS = { light: 'Açık kumaş', gray: 'Gri kumaş', dark: 'Koyu kumaş', tan: 'Taba deri', teal: 'Petrol', green: 'Yeşil', pink: 'Pembe', orange: 'Turuncu', white: 'Beyaz lake', cream: 'Krem', wood: 'Koyu ahşap', oak: 'Meşe', black: 'Mat siyah', steel: 'Çelik', marble: 'Gri mermer', whitemarble: 'Beyaz mermer', blackmarble: 'Siyah mermer', taupe: 'Vizon' };
const PAL = { light: 'fabricLight', gray: 'fabricGray', dark: 'fabricDark', tan: 'tan', teal: 'teal', green: 'green', pink: 'pink', orange: 'orange', white: 'white', cream: 'cream', wood: 'darkWood', oak: 'oak', black: 'blackMat', steel: 'steel', marble: 'marble', whitemarble: 'whiteMarble', blackmarble: 'black', taupe: 'rugTaupe' };

// ---------- prosedurel dokular (bir kez uretilir) ----------
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function noiseField(size, seed) {
  const r = rng(seed), g = new Float32Array((size + 1) * (size + 1)); for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => { x = ((x % size) + size) % size; y = ((y % size) + size) % size; const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), x1 = (x0 + 1) % size, y1 = (y0 + 1) % size; const a = g[y0 * (size + 1) + x0], b = g[y0 * (size + 1) + x1], c = g[y1 * (size + 1) + x0], d = g[y1 * (size + 1) + x1]; return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
}
function fbm(n, x, y) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { v += a * n(x * f, y * f); f *= 2; a *= 0.5; } return v; }
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function marbleCanvas({ base, cloud, vein, veins = 26, seed = 1, tiles = 0, size = 1024 }) {
  const c = mkCanvas(size, size), x = c.getContext('2d'), n = noiseField(16, seed), img = x.createImageData(size, size), d = img.data;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { let f = fbm(n, i / size * 16, j / size * 16); f = Math.min(1, Math.max(0, (f - 0.3) * 2.2)); const k = (j * size + i) * 4; d[k] = base[0] + (cloud[0] - base[0]) * f; d[k + 1] = base[1] + (cloud[1] - base[1]) * f; d[k + 2] = base[2] + (cloud[2] - base[2]) * f; d[k + 3] = 255; }
  x.putImageData(img, 0, 0); const r = rng(seed * 7 + 3); x.lineCap = 'round';
  for (let i = 0; i < veins; i++) {
    const px = r() * size, py = r() * size, ang = r() * Math.PI * 2; x.strokeStyle = `rgba(${vein[0]},${vein[1]},${vein[2]},${0.1 + r() * 0.38})`; x.lineWidth = 0.5 + r() * r() * 3.2;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) { const rr = rng(seed * 100 + i); let qx = px + ox, qy = py + oy, a = ang; x.beginPath(); x.moveTo(qx, qy); const steps = 30 + Math.floor(rr() * 50); for (let s = 0; s < steps; s++) { a += (rr() - 0.5) * 0.3 + (rr() < 0.06 ? (rr() - 0.5) * 1.6 : 0); qx += Math.cos(a) * 14; qy += Math.sin(a) * 14; x.lineTo(qx, qy); } x.stroke(); }
  }
  if (tiles) { x.strokeStyle = 'rgba(30,30,32,0.55)'; x.lineWidth = 2; for (let i = 0; i <= tiles; i++) { const p = i * size / tiles; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, size); x.moveTo(0, p); x.lineTo(size, p); x.stroke(); } }
  return c;
}
function plankCanvas({ tone, seed = 5, herring = false, size = 1024 }) {
  const c = mkCanvas(size, size), x = c.getContext('2d'), r = rng(seed);
  const plank = (px, py, w, h, key) => {
    const rr = rng(seed * 131 + key * 17 + 5), k = 0.84 + rr() * 0.3; x.save(); x.beginPath(); x.rect(px, py, w, h); x.clip();
    x.fillStyle = `rgb(${tone[0] * k | 0},${tone[1] * k | 0},${tone[2] * k | 0})`; x.fillRect(px, py, w, h); x.strokeStyle = 'rgba(60,40,20,0.10)'; x.lineWidth = 1;
    for (let g = 0; g < 14; g++) { const t = rr(); x.beginPath(); if (w > h) { x.moveTo(px, py + t * h); x.lineTo(px + w, py + t * h + rr() * 3 - 1.5); } else { x.moveTo(px + t * w, py); x.lineTo(px + t * w + rr() * 3 - 1.5, py + h); } x.stroke(); }
    x.strokeStyle = 'rgba(40,25,10,0.5)'; x.lineWidth = 2; x.strokeRect(px, py, w, h); x.restore();
  };
  if (!herring) { const rows = 14, ph = size / rows; let key = 0; for (let j = 0; j < rows; j++) { let px = -r() * 300; while (px < size) { const pw = 380 + r() * 300; plank(px, j * ph, pw, ph, key++); px += pw; } } }
  else { const Wd = size / 8 / Math.SQRT2, L = Wd * 4; x.save(); x.rotate(-Math.PI / 4); for (let k = -12; k < 26; k++) for (let j = -5; j < 6; j++) { const key = (((k % 8) + 8) % 8) * 4 + (((j % 2) + 2) % 2) * 2; plank(k * Wd + j * L, k * Wd - j * L, L, Wd, key); plank(k * Wd + L + j * L, k * Wd + Wd - L - j * L, Wd, L, key + 1); } x.restore(); }
  return c;
}
function fabricCanvas(col, seed = 9, amp = 14) { const size = 256, c = mkCanvas(size, size), x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data, r = rng(seed); for (let i = 0; i < size * size; i++) { const k = (r() - 0.5) * amp + ((i % 2) ^ ((i / size | 0) % 2) ? 3 : -3); d[i * 4] = col[0] + k; d[i * 4 + 1] = col[1] + k; d[i * 4 + 2] = col[2] + k; d[i * 4 + 3] = 255; } x.putImageData(img, 0, 0); return c; }
function curtainCanvas() { const c = mkCanvas(256, 8), x = c.getContext('2d'); for (let i = 0; i < 256; i++) { const k = 0.5 + 0.5 * Math.sin(i / 256 * Math.PI * 2 * 14); x.fillStyle = `rgba(255,255,255,${0.22 + 0.4 * k})`; x.fillRect(i, 0, 1, 8); } return c; }
function artCanvas(seed) { const sets = [['#e8e2d6', '#1f5a5c', '#b08d57', '#2b2c30'], ['#efe9df', '#d9a3a8', '#8a8c8f', '#c9a97c'], ['#ece6da', '#d9772e', '#47494d', '#a06a41']], cols = sets[seed % 3], c = mkCanvas(256, 180), x = c.getContext('2d'), r = rng(seed * 13 + 4); x.fillStyle = cols[0]; x.fillRect(0, 0, 256, 180); for (let i = 0; i < 9; i++) { const g = x.createRadialGradient(r() * 256, r() * 180, 4, r() * 256, r() * 180, 60 + r() * 120); g.addColorStop(0, cols[1 + (i % 3)]); g.addColorStop(1, 'rgba(0,0,0,0)'); x.globalAlpha = 0.55; x.fillStyle = g; x.fillRect(0, 0, 256, 180); } return c; }
const CAN = {};
const can = (k, f) => CAN[k] || (CAN[k] = f());
const CANVASES = {
  marble: () => marbleCanvas({ base: [92, 95, 101], cloud: [142, 145, 150], vein: [236, 236, 240], veins: 22, seed: 11, tiles: 2 }),
  marbleLight: () => marbleCanvas({ base: [176, 177, 180], cloud: [204, 204, 206], vein: [246, 246, 248], veins: 14, seed: 41 }),
  black: () => marbleCanvas({ base: [14, 15, 17], cloud: [30, 31, 34], vein: [235, 232, 225], veins: 10, seed: 23 }),
  white: () => marbleCanvas({ base: [240, 238, 234], cloud: [222, 220, 217], vein: [112, 112, 122], veins: 20, seed: 31 }),
  concrete: () => marbleCanvas({ base: [150, 149, 146], cloud: [172, 171, 168], vein: [120, 120, 118], veins: 4, seed: 51 }),
  oak: () => plankCanvas({ tone: [148, 124, 100], seed: 5 }), darkoak: () => plankCanvas({ tone: [92, 70, 52], seed: 6 }),
  herring: () => plankCanvas({ tone: [186, 158, 122], seed: 8, herring: true }),
  fabricLight: () => fabricCanvas([214, 206, 193], 3), fabricGray: () => fabricCanvas([120, 122, 126], 4),
  rugGray: () => fabricCanvas([150, 150, 152], 6, 40), rugTaupe: () => fabricCanvas([170, 152, 130], 7, 30), curtain: curtainCanvas,
};

const CSS = `
.p3d{position:absolute;inset:0;overflow:hidden;background:#16171a;color:#f4f1ea;font:500 14px/1.35 "Figtree",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-user-select:none;user-select:none;--p3-panel:rgba(22,23,26,.72);--p3-line:rgba(255,255,255,.14);--p3-accent:#ffc43c}
.p3d *{box-sizing:border-box}
.p3d canvas.p3-view{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab;outline:none}
.p3d canvas.p3-view:active{cursor:grabbing}
.p3d .p3-panel{background:var(--p3-panel);border:1px solid var(--p3-line);border-radius:12px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.p3d .p3-title{position:absolute;left:16px;top:16px;padding:10px 14px;max-width:calc(100% - 200px)}
.p3d .p3-title h1{font-size:15px;font-weight:600;margin:0;text-wrap:balance}
.p3d .p3-firm{color:#b9b4aa;font-size:12px}
.p3d .p3-where{color:var(--p3-accent);font-size:13px;min-height:18px}
.p3d .p3-side{position:absolute;right:16px;top:16px;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.p3d .p3-mini{width:176px;height:auto;display:block;border-radius:10px;border:1px solid var(--p3-line);cursor:pointer;background:#222}
.p3d button,.p3d a.p3-btn{font:inherit;color:#f4f1ea;background:var(--p3-panel);border:1px solid var(--p3-line);border-radius:999px;padding:8px 14px;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-block}
.p3d button:hover,.p3d a.p3-btn:hover{border-color:rgba(255,255,255,.4)}
.p3d button:focus-visible,.p3d a.p3-btn:focus-visible{outline:2px solid var(--p3-accent);outline-offset:2px}
.p3d .p3-rooms button[aria-pressed="true"],.p3d .p3-top[aria-pressed="true"],.p3d a.p3-btn{background:var(--p3-accent);color:#1b1c1e;border-color:var(--p3-accent)}
.p3d .p3-rooms{position:absolute;left:0;right:0;bottom:0;display:flex;gap:8px;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));overflow-x:auto;scrollbar-width:none;justify-content:safe center}
.p3d .p3-rooms::-webkit-scrollbar{display:none}
.p3d .p3-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:16px 18px;max-width:min(360px,calc(100% - 32px));transition:opacity .3s}
.p3d .p3-hint.gone{opacity:0;pointer-events:none}
.p3d .p3-hint p{margin:0 0 6px;color:#b9b4aa}.p3d .p3-hint p b{color:#f4f1ea;font-weight:600}
.p3d .p3-hint .touch{display:none}.p3d .p3-hint button{margin-top:8px}
@media (pointer:coarse){.p3d .p3-hint .desk{display:none}.p3d .p3-hint .touch{display:block}}
.p3d .p3-joy{position:absolute;left:20px;bottom:76px;width:112px;height:112px;border-radius:50%;background:var(--p3-panel);border:1px solid var(--p3-line);display:none;touch-action:none}
.p3d .p3-joy.show{display:block}
.p3d .p3-knob{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.85)}
.p3d .p3-fade{position:absolute;inset:0;background:#0d0e10;opacity:0;pointer-events:none;transition:opacity .2s}
.p3d .p3-fade.on{opacity:1}
@media (max-width:520px){.p3d .p3-mini{width:118px}.p3d .p3-title{padding:8px 12px}.p3d .p3-title h1{font-size:14px}.p3d .p3-side button,.p3d .p3-side a.p3-btn{padding:6px 10px;font-size:12px}}
@media (prefers-reduced-motion:reduce){.p3d .p3-fade,.p3d .p3-hint{transition:none}}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// mobilya katalogu: n = ad, w/d = varsayilan olcu (m), solid = carpisma, build = yerel koordinatta (arka = z 0) parcalar
export const FURN = {
  sofa: { n: 'Koltuk / kanepe', w: 2.2, d: 0.95, build({ W, D, b, M, main }) { const f = main || M.fabricLight; b(0, 0, W, D, 0.08, 0.2, f, 0.04); b(0.01, 0.2, W - 0.02, D - 0.21, 0.26, 0.18, f, 0.07); b(0, 0, W, 0.22, 0.3, 0.52, f, 0.07); if (W > 1.5) { b(0.12, 0.26, 0.36, 0.26, 0.44, 0.2, M.teal, 0.07); b(W - 0.48, 0.26, 0.36, 0.26, 0.44, 0.2, M.fabricGray, 0.07); } } },
  armchair: { n: 'Berjer', w: 0.75, d: 0.75, build({ W, D, b, M, main }) { const f = main || M.tan; b(0, 0, W, D, 0, 0.4, f, 0.1); b(0, 0, W, 0.2, 0.3, 0.45, f, 0.06); } },
  bed: { n: 'Çift kişilik yatak', w: 1.8, d: 2.1, build({ W, D, b, M, main }) { b(-0.08, 0, W + 0.16, 0.1, 0, 1.2, M.fabricLight, 0.03); b(0, 0.1, W, D - 0.1, 0, 0.3, M.fabricDark, 0.03); b(0.03, 0.12, W - 0.06, D - 0.15, 0.3, 0.2, M.white, 0.06); b(0.02, D * 0.4, W - 0.04, D * 0.6 - 0.02, 0.44, 0.09, main || M.fabricGray, 0.04); const pw = (W - 0.3) / 2; b(0.1, 0.18, pw, 0.4, 0.5, 0.12, M.white, 0.055); b(0.2 + pw, 0.18, pw, 0.4, 0.5, 0.12, M.white, 0.055); } },
  bunk: { n: 'Ranza / çocuk yatağı', w: 1.1, d: 1.9, build({ W, D, b, M, main }) { const f = main || M.pink; b(0, 0, W, D, 0, 0.3, M.white, 0.02); b(0.03, 0.03, W - 0.06, D - 0.06, 0.3, 0.14, f, 0.04); for (const [px, pz] of [[0, 0], [W - 0.07, 0], [0, D - 0.07], [W - 0.07, D - 0.07]]) b(px, pz, 0.07, 0.07, 0, 1.75, M.white); b(0, 0, W, D, 1.25, 0.1, M.white); b(0.03, 0.03, W - 0.06, D - 0.06, 1.35, 0.12, f, 0.04); b(W - 0.06, 0, 0.06, D, 1.47, 0.22, M.white); } },
  nightstand: { n: 'Komodin + abajur', w: 0.45, d: 0.42, build({ W, D, b, c, M, main, light }) { b(0, 0, W, D, 0, 0.5, main || M.darkWood); c(W / 2, D / 2, 0.045, 0.5, 0.28, M.brass); c(W / 2, D / 2, 0.14, 0.76, 0.2, M.shade, 0.1); light(W / 2, 0.9, D / 2, 0xffc98a, 1.2, 3); } },
  wardrobe: { n: 'Boy dolap', w: 2.4, d: 0.6, build({ W, D, b, M, main }) { const n = Math.max(1, Math.round(W / 0.6)), dw = W / n; for (let i = 0; i < n; i++) b(i * dw + 0.004, 0, dw - 0.008, D, 0, 2.4, main || M.white); } },
  console: { n: 'Alçak dolap / konsol', w: 1.6, d: 0.42, build({ W, D, b, M, main }) { b(0, 0, W, D, 0, 0.72, main || M.white, 0.02); } },
  tvunit: { n: 'TV ünitesi + panel', w: 2.6, d: 0.45, build({ W, D, b, M, main }) { b(0, 0, W, 0.04, 0, 2.55, main || M.marble); b(0, 0.04, W, D - 0.04, 0.15, 0.32, M.white, 0.02); const tw = Math.min(1.7, W * 0.6); b((W - tw) / 2, 0.045, tw, 0.04, 0.95, tw * 0.56, M.gloss); } },
  table: { n: 'Yemek masası', w: 1.6, d: 0.9, build({ W, D, b, M, main }) { b(0, 0, W, D, 0.72, 0.04, main || M.whiteMarble, 0.015); b(W * 0.3, D * 0.3, W * 0.4, D * 0.4, 0, 0.72, M.blackMat); } },
  chair: { n: 'Sandalye', w: 0.45, d: 0.45, build({ W, D, b, M, main }) { const f = main || M.teal; b(0, 0, W, D, 0.3, 0.16, f, 0.06); b(0, 0, W, 0.08, 0.44, 0.42, f, 0.03); for (const [px, pz] of [[0.05, 0.05], [W - 0.09, 0.05], [0.05, D - 0.09], [W - 0.09, D - 0.09]]) b(px, pz, 0.04, 0.04, 0, 0.3, M.blackMat); } },
  coffee: { n: 'Sehpa / puf (köşeli)', w: 0.8, d: 0.8, build({ W, D, b, M, main }) { b(0, 0, W, D, 0, 0.38, main || M.white, 0.03); } },
  coffeeround: { n: 'Sehpa (yuvarlak)', w: 0.8, d: 0.8, build({ W, D, c, M, main }) { c(W / 2, D / 2, Math.min(W, D) / 2, 0, 0.34, main || M.cream); } },
  island: { n: 'Mutfak adası', w: 2.2, d: 0.9, build({ W, D, b, M, main }) { b(0.06, 0.06, W - 0.12, D - 0.12, 0, 0.9, main || M.cream); b(0, 0, W, D, 0.9, 0.04, M.whiteMarble); } },
  counter: { n: 'Mutfak tezgahı + üst dolap', w: 3, d: 0.65, build({ W, D, b, c, M, main }) { b(0, 0.02, W, D - 0.02, 0, 0.9, main || M.white); b(0, 0, W, D + 0.02, 0.9, 0.04, M.whiteMarble); b(0, 0, W, 0.35, 1.5, 0.75, main || M.white); b(0, 0, W, 0.02, 0.94, 0.56, M.whiteMarble); b(0.02, 0.33, W - 0.04, 0.012, 1.485, 0.015, M.glow); if (W > 1.6) { b(0.12, 0.14, 0.42, 0.38, 0.94, 0.008, M.gloss); b(W * 0.45, 0.14, 0.45, 0.38, 0.935, 0.012, M.steel); c(W * 0.45 + 0.22, 0.1, 0.018, 0.94, 0.25, M.steel); } } },
  fridge: { n: 'Buzdolabı', w: 0.9, d: 0.65, build({ W, D, b, M, main }) { b(0, 0, W, D, 0, 2.1, main || M.steel); b(W / 2 - 0.005, D, 0.01, 0.01, 0.3, 1.6, M.blackMat); } },
  stool: { n: 'Bar taburesi', w: 0.35, d: 0.35, build({ W, D, c, M, main }) { const r = Math.min(W, D) / 2; c(W / 2, D / 2, 0.03, 0, 0.64, M.steel); c(W / 2, D / 2, r, 0.64, 0.07, main || M.green); c(W / 2, D / 2, r * 0.75, 0, 0.02, M.steel); } },
  desk: { n: 'Çalışma masası', w: 1.6, d: 0.6, build({ W, D, b, M, main }) { b(0, 0, W, D, 0.7, 0.05, main || M.white); b(0.02, 0.03, 0.05, D - 0.06, 0, 0.7, M.white); b(W - 0.07, 0.03, 0.05, D - 0.06, 0, 0.7, M.white); b(W / 2 - 0.3, 0.08, 0.6, 0.04, 0.86, 0.34, M.gloss); b(W / 2 - 0.05, 0.06, 0.1, 0.1, 0.75, 0.12, M.blackMat); } },
  toilet: { n: 'Klozet', w: 0.4, d: 0.6, build({ W, D, b, M }) { b(0, 0.14, W, D - 0.14, 0, 0.4, M.white, 0.08); b(0, 0, W, 0.16, 0, 0.82, M.white, 0.03); } },
  vanity: { n: 'Lavabo dolabı + ayna', w: 1.4, d: 0.5, build({ W, D, b, M, main }) { b(0.02, 0.02, W - 0.04, D - 0.04, 0.2, 0.62, main || M.blackMat); b(0, 0, W, D, 0.82, 0.04, M.whiteMarble); const n = W > 1.3 ? 2 : 1, bw = Math.min(0.5, W / n - 0.2); for (let i = 0; i < n; i++) b(W * (i + 0.5) / n - bw / 2, D * 0.25, bw, D * 0.55, 0.86, 0.06, M.white, 0.025); b(0.08, 0.02, W - 0.16, 0.015, 1.05, 0.95, M.mirror); b(0.02, 0.03, W - 0.04, 0.01, 2.05, 0.03, M.glow); } },
  bathtub: { n: 'Küvet', w: 0.8, d: 1.7, build({ W, D, b, M }) { b(0, 0, W, D, 0, 0.56, M.white, 0.1); } },
  shower: { n: 'Duş (cam bölmeli)', w: 0.9, d: 0.9, solid: false, build({ W, D, b, M }) { b(0, 0, W, D, 0.003, 0.03, M.whiteMarble); b(0, D - 0.03, W * 0.7, 0.03, 0, 2.1, M.showerGlass); } },
  rug: { n: 'Halı', w: 2.4, d: 1.6, solid: false, build({ W, D, b, M, main }) { b(0, 0, W, D, 0.003, 0.012, main || M.rugGray); } },
  ruground: { n: 'Halı (yuvarlak)', w: 1, d: 1, solid: false, build({ W, D, c, M, main }) { c(W / 2, D / 2, Math.min(W, D) / 2, 0.003, 0.012, main || M.pink); } },
  rail: { n: 'Askılık (giyinme)', w: 1.4, d: 0.45, build({ W, D, b, M }) { b(0, 0, W, D, 1.95, 0.04, M.white); b(0, 0, W, D, 0, 0.12, M.white); b(0.02, D / 2, W - 0.04, 0.02, 1.8, 0.025, M.steel); const cols = ['fabricLight', 'fabricDark', 'green', 'tan', 'white', 'fabricGray', 'teal', 'cream', 'pink'], n = Math.floor((W - 0.1) / 0.14); for (let i = 0; i < n; i++) b(0.06 + i * 0.14, 0.04, 0.08, D - 0.08, 0.85 + (i % 3) * 0.12, 0.95 - (i % 3) * 0.12, M[cols[i % cols.length]], 0.02); } },
  plant: { n: 'Saksı bitki', w: 0.45, d: 0.45, build({ W, D, c, M, g, THREE: T3 }) { const r = Math.min(W, D) / 2; c(W / 2, D / 2, r * 0.6, 0, 0.4, M.white, r * 0.75); const s = new T3.Mesh(new T3.SphereGeometry(r * 1.3, 12, 10), M.plant); s.position.set(0, 0.85, 0); s.scale.set(1, 1.5, 1); s.castShadow = true; g.add(s); } },
  floorlamp: { n: 'Lambader', w: 0.35, d: 0.35, build({ W, D, c, M, light }) { c(W / 2, D / 2, 0.14, 0, 0.02, M.blackMat); c(W / 2, D / 2, 0.012, 0, 1.45, M.blackMat); c(W / 2, D / 2, 0.17, 1.4, 0.26, M.shade, 0.12); light(W / 2, 1.5, D / 2, 0xffc98a, 2, 4); } },
  pendant: { n: 'Sarkıt lamba', w: 0.3, d: 0.3, solid: false, build({ W, D, c, M, WH }) { const r = Math.min(W, D) / 2; c(W / 2, D / 2, 0.008, WH - 1, 1, M.blackMat); c(W / 2, D / 2, r, WH - 1.18, 0.18, M.blackMat, 0.03); c(W / 2, D / 2, r * 0.8, WH - 1.185, 0.01, M.glow); } },
  art: { n: 'Duvar tablosu', w: 1.4, d: 0.04, solid: false, build({ W, D, b, M, artMat }) { b(-0.02, 0, W + 0.04, D, 1.13, 0.84, M.blackMat); b(0, -0.008, W, D + 0.016, 1.15, 0.8, artMat()); } },
};

export function createTour(root, P, opts = {}) {
  if (!document.getElementById('p3d-css')) { const st = document.createElement('style'); st.id = 'p3d-css'; st.textContent = CSS; document.head.appendChild(st); }
  const S = P.pxPerMeter || 66, [PW, PH] = P.size, WH = P.wallHeight || 2.8, m = (px) => px / S;
  const coarse = matchMedia('(pointer: coarse)').matches, ac = new AbortController(), sig = { signal: ac.signal };
  root.innerHTML = `<div class="p3d"><canvas class="p3-view" tabindex="0" aria-label="Gezilebilir 3D görünüm"></canvas>
<div class="p3-title p3-panel"><h1>${esc(P.name || '3D Gezinti')}</h1>${P.firm ? `<div class="p3-firm">${esc(P.firm)}</div>` : ''}<div class="p3-where"></div></div>
<div class="p3-side"><canvas class="p3-mini" title="Plana dokunarak o noktaya geç"></canvas><button class="p3-top" type="button" aria-pressed="false">Üstten bak</button><button class="p3-q" type="button">Kalite: Yüksek</button>${/^(https?:|mailto:|tel:)/.test(P.contact || '') ? `<a class="p3-btn" href="${esc(P.contact)}" target="_blank" rel="noopener">İletişime geç</a>` : ''}</div>
<div class="p3-hint p3-panel"><p class="desk"><b>Bak:</b> fareyle sürükle. <b>Yürü:</b> W A S D veya ok tuşları.</p><p class="touch"><b>Bak:</b> ekranı sürükle. <b>Yürü:</b> soldaki çubuğu kullan.</p><p><b>Git:</b> zemine veya plana dokun. Alttaki düğmeler odalara götürür.</p><button type="button">Başla</button></div>
<div class="p3-joy" aria-hidden="true"><div class="p3-knob"></div></div><nav class="p3-rooms" aria-label="Odalar"></nav><div class="p3-fade"></div></div>`;
  const $ = (s) => root.querySelector(s), canvas = $('.p3-view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(68, 1, 0.05, 400); camera.rotation.order = 'YXZ';
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.28;
  const tex = (k, rep = true, cv) => { const t = new THREE.CanvasTexture(cv || can(k, CANVASES[k])); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return t; };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    wall: std({ color: new THREE.Color(P.wallColor || '#e6e0d6'), roughness: 0.92 }), ceiling: std({ color: 0xf6f4f0, roughness: 0.95 }),
    marble: std({ map: tex('marble'), roughness: 0.22, envMapIntensity: 1.2 }), black: std({ map: tex('black'), roughness: 0.42, envMapIntensity: 0.12 }),
    whiteMarble: std({ map: tex('white'), roughness: 0.25 }), marbleWall: std({ map: tex('marbleLight'), roughness: 0.3 }), concrete: std({ map: tex('concrete'), roughness: 0.7 }),
    oak: std({ map: tex('oak'), roughness: 0.55 }), darkoak: std({ map: tex('darkoak'), roughness: 0.5 }), herring: std({ map: tex('herring'), roughness: 0.5 }),
    white: std({ color: 0xf3f2ee, roughness: 0.4 }), cream: std({ color: 0xe6dcc8, roughness: 0.5 }), darkWood: std({ color: 0x3a2a20, roughness: 0.55 }),
    blackMat: std({ color: 0x141416, roughness: 0.45 }), gloss: std({ color: 0x050506, roughness: 0.08, metalness: 0.2 }), steel: std({ color: 0xb9bcc0, roughness: 0.3, metalness: 0.9 }),
    brass: std({ color: 0xb08d57, roughness: 0.3, metalness: 1 }), frame: std({ color: 0x2a2c2f, roughness: 0.5, metalness: 0.4 }),
    fabricLight: std({ map: tex('fabricLight'), roughness: 0.95 }), fabricGray: std({ map: tex('fabricGray'), roughness: 0.95 }), fabricDark: std({ color: 0x47494d, roughness: 0.95 }),
    rugGray: std({ map: tex('rugGray'), roughness: 1 }), rugTaupe: std({ map: tex('rugTaupe'), roughness: 1 }),
    tan: std({ color: 0xa06a41, roughness: 0.6 }), teal: std({ color: 0x1f5a5c, roughness: 0.8 }), green: std({ color: 0x2f6b3a, roughness: 0.8 }), pink: std({ color: 0xe9aab4, roughness: 0.85 }),
    orange: std({ color: 0xd9772e, roughness: 0.9 }), plant: std({ color: 0x3c6b3f, roughness: 0.9 }),
    shade: std({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 1.6, roughness: 0.9 }), glow: new THREE.MeshBasicMaterial({ color: 0xfff3dd }),
    mirror: std({ color: 0xc9d3d8, roughness: 0.1, metalness: 0.55, envMapIntensity: 2.2, emissive: 0x39424a, emissiveIntensity: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xcfe3ea, roughness: 0.04, transparent: true, opacity: 0.14, depthWrite: false }),
    frosted: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.7, transparent: true, opacity: 0.7, depthWrite: false }),
    showerGlass: new THREE.MeshPhysicalMaterial({ color: 0xd8ecee, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }),
    curtain: new THREE.MeshBasicMaterial({ map: tex('curtain'), color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  };
  const floorSpec = { marble: [M.marble, 2.4], whitemarble: [M.whiteMarble, 2.4], blackmarble: [M.black, 2.2], oak: [M.oak, 2.2], darkoak: [M.darkoak, 2.2], herringbone: [M.herring, 1.8], concrete: [M.concrete, 3] };

  // carpisma izgarasi
  const G = 2, GW = Math.ceil(PW / G), GH = Math.ceil(PH / G), grid = new Uint8Array(GW * GH), inside = new Uint8Array(GW * GH);
  const fillRect = (arr, x, y, w, h) => { const x0 = Math.max(0, Math.floor(x / G)), x1 = Math.min(GW, Math.ceil((x + w) / G)), y0 = Math.max(0, Math.floor(y / G)), y1 = Math.min(GH, Math.ceil((y + h) / G)); for (let j = y0; j < y1; j++) if (x1 > x0) arr.fill(1, j * GW + x0, j * GW + x1); };
  const block = (x, y, w, h) => fillRect(grid, x, y, w, h);
  const rooms = (P.rooms || []).filter(r => r.r && r.r[2] > 2 && r.r[3] > 2), doors = P.doors || [], windows = P.windows || [], walls = P.walls || [];
  for (const r of rooms) fillRect(inside, ...r.r); for (const d of doors) fillRect(inside, ...d.r);
  const RAD = Math.max(6, S * 0.2);
  function freeAt(px, py) { for (let a = 0; a < 8; a++) { const i = Math.floor((px + Math.cos(a * Math.PI / 4) * RAD) / G), j = Math.floor((py + Math.sin(a * Math.PI / 4) * RAD) / G); if (i < 0 || j < 0 || i >= GW || j >= GH || grid[j * GW + i] || !inside[j * GW + i]) return false; } return true; }

  const world = new THREE.Group(); scene.add(world);
  function box(x, y, w, h, y0, ht, mat, o = {}) {
    if (w <= 0 || h <= 0 || ht <= 0) return; const W = m(w), D = m(h), rr = o.r ? Math.min(o.r, W / 2 - 0.001, D / 2 - 0.001, ht / 2 - 0.001) : 0;
    const me = new THREE.Mesh(rr > 0.004 ? new RoundedBoxGeometry(W, ht, D, 3, rr) : new THREE.BoxGeometry(W, ht, D), mat); me.position.set(m(x + w / 2), y0 + ht / 2, m(y + h / 2));
    me.castShadow = o.cast !== false; me.receiveShadow = o.receive !== false; world.add(me); if (o.solid) block(x, y, w, h); return me;
  }
  const floors = [];
  function floorRects(rects, mat, tm, lift) {
    const pos = [], uv = [], idx = []; rects.forEach(([x, y, w, h], i) => { const x0 = m(x), x1 = m(x + w), z0 = m(y), z1 = m(y + h); pos.push(x0, lift, z0, x1, lift, z0, x1, lift, z1, x0, lift, z1); uv.push(x0 / tm, z0 / tm, x1 / tm, z0 / tm, x1 / tm, z1 / tm, x0 / tm, z1 / tm); idx.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const me = new THREE.Mesh(g, mat); me.receiveShadow = true; world.add(me); floors.push(me);
  }
  const roomAt = (px, py) => rooms.find(r => px >= r.r[0] && px <= r.r[0] + r.r[2] && py >= r.r[1] && py <= r.r[1] + r.r[3]) || null;
  rooms.forEach((r, i) => { const [mat, tm] = floorSpec[r.floor] || floorSpec.marble; floorRects([r.r], mat, tm, 0.002 + i * 0.00002); });
  for (const d of doors) { const [x, y, w, h] = d.r, cxp = x + w / 2, cyp = y + h / 2; let best = null, bd = 1e9; for (const r of rooms) { const dx = Math.max(r.r[0] - cxp, 0, cxp - r.r[0] - r.r[2]), dy = Math.max(r.r[1] - cyp, 0, cyp - r.r[1] - r.r[3]), dd = Math.hypot(dx, dy); if (dd < bd) { bd = dd; best = r; } } const [mat, tm] = floorSpec[best?.floor] || floorSpec.marble; floorRects([d.r], mat, tm, 0.001); }
  box(0, 0, PW, PH, -0.301, 0.3, M.wall, { receive: false });
  for (const [x, y, w, h] of walls) box(x, y, w, h, 0, WH, M.wall, { solid: true });
  for (const d of doors) { const [x, y, w, h] = d.r, head = Math.min(d.head || 2.15, WH); box(x, y, w, h, head, WH - head, M.wall); if (d.closed) { const hz = w > h; hz ? box(x + 1, y + h * 0.25, w - 2, h * 0.5, 0, head, M.darkWood, { solid: false }) : box(x + w * 0.25, y + 1, w * 0.5, h - 2, 0, head, M.darkWood, { solid: false }); block(x, y, w, h); } }
  for (const win of windows) {
    const [x, y, w, h] = win.r, horiz = w > h, sill = win.sill ?? 0.25, head = Math.min(win.head ?? 2.5, WH), gh = head - sill, t = Math.min(3, horiz ? h : w); if (gh <= 0.05) continue;
    box(x, y, w, h, 0, sill, M.wall); box(x, y, w, h, head, WH - head, M.wall); block(x, y, w, h);
    const gm = win.frosted ? M.frosted : M.glass; horiz ? box(x, y + h / 2 - t / 2, w, t, sill, gh, gm, { cast: false, receive: false }) : box(x + w / 2 - t / 2, y, t, h, sill, gh, gm, { cast: false, receive: false });
    const len = horiz ? w : h, n = Math.max(1, Math.round(m(len) / 1.05)), fw = S * 0.06, fd = S * 0.09;
    for (let i = 0; i <= n; i++) { const p = (len - fw) * i / n; horiz ? box(x + p, y + h / 2 - fd / 2, fw, fd, sill, gh, M.frame) : box(x + w / 2 - fd / 2, y + p, fd, fw, sill, gh, M.frame); }
    for (const yy of [sill, head - 0.05]) horiz ? box(x, y + h / 2 - fd / 2, w, fd, yy, 0.05, M.frame) : box(x + w / 2 - fd / 2, y, fd, h, yy, 0.05, M.frame);
    if (!win.frosted && sill < 0.5) { const cxp = x + w / 2, cyp = y + h / 2, off = S * 0.14; let inward = 1; if (horiz) inward = roomAt(cxp, cyp + h) || !roomAt(cxp, cyp - h) && y < PH / 2 ? 1 : -1; else inward = roomAt(cxp + w, cyp) || !roomAt(cxp - w, cyp) && x < PW / 2 ? 1 : -1; const me = new THREE.Mesh(new THREE.PlaneGeometry(m(len), gh + 0.2), M.curtain); if (horiz) me.position.set(m(cxp), sill + gh / 2, m(cyp + inward * (h / 2 + off))); else { me.position.set(m(cxp + inward * (w / 2 + off)), sill + gh / 2, m(cyp)); me.rotation.y = Math.PI / 2; } world.add(me); }
  }
  const ceiling = box(0, 0, PW, PH, WH, 0.12, M.ceiling, { receive: false });

  // isik
  scene.add(new THREE.HemisphereLight(0xfdfbf7, 0xa59a8c, 0.3));
  const cx = m(PW / 2), cz = m(PH / 2), ext = Math.max(m(PW), m(PH)) * 0.75 + 1;
  const sun = new THREE.DirectionalLight(0xfff0d8, 5.2); sun.position.set(cx + ext * 1.45, ext * 1.06, cz + ext); sun.target.position.set(cx, 0, cz); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(coarse ? 2048 : 4096, coarse ? 2048 : 4096); Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: ext * 5 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  let nLights = 0; const maxLights = coarse ? 7 : 16;
  const addLight = (x, y, z, col, int, dist, parent = scene) => { if (nLights >= maxLights) return; nLights++; const p = new THREE.PointLight(col, int, dist, 1.8); p.position.set(x, y, z); parent.add(p); };
  const spots = []; for (const r of rooms) { const [x, y, w, h] = r.r, area = m(w) * m(h), n = area > 26 ? 3 : area > 13 ? 2 : 1; for (let i = 0; i < n; i++) spots.push(w >= h ? [x + w * (i + 0.5) / n, y + h / 2] : [x + w / 2, y + h * (i + 0.5) / n]); }
  spots.forEach(([x, y]) => { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 24), M.glow); d.position.set(m(x), WH - 0.006, m(y)); world.add(d); });
  const stepL = Math.max(1, Math.ceil(spots.length / (coarse ? 6 : 12))); spots.forEach(([x, y], i) => { if (i % stepL === 0) addLight(m(x), WH - 0.25, m(y), 0xffe2c0, (coarse ? 5.4 : 3.5) * Math.min(1.6, stepL), 7.5); });
  { // gok + uzak silüet
    const c = mkCanvas(8, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#5f93cc'); g.addColorStop(0.4, '#a3c6e4'); g.addColorStop(0.5, '#d3e2ee'); g.addColorStop(0.56, '#cfd6d9'); g.addColorStop(1, '#b9c0c4'); x.fillStyle = g; x.fillRect(0, 0, 8, 256);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.MeshBasicMaterial({ map: tex('sky', false, c), side: THREE.BackSide, toneMapped: false })); sky.position.set(cx, 0, cz); scene.add(sky);
    const r = rng(77), N = 160, inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), N), o = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < N; i++) { const a = r() * Math.PI * 2, d = 45 + ext + r() * 150, h = 45 + r() * 85, w = 10 + r() * 16; o.position.set(cx + Math.cos(a) * d, -75 + h / 2, cz + Math.sin(a) * d); o.scale.set(w, h, 8 + r() * 16); o.rotation.y = r() * 3; o.updateMatrix(); inst.setMatrixAt(i, o.matrix); const k = Math.min(1, d / 200); col.setRGB(0.62 + 0.2 * k + r() * 0.05, 0.67 + 0.18 * k + r() * 0.04, 0.72 + 0.16 * k); inst.setColorAt(i, col); }
    scene.add(inst);
  }
  // mobilya
  let artN = 0;
  for (const f of P.furniture || []) {
    const def = FURN[f.t]; if (!def || !f.r) continue; const [x, y, w, h] = f.r, rot = (((f.rot || 0) % 360) + 360) % 360, sw = rot % 180 !== 0, W = m(sw ? h : w), D = m(sw ? w : h);
    const g = new THREE.Group(); g.position.set(m(x + w / 2), 0, m(y + h / 2)); g.rotation.y = -rot * Math.PI / 180; world.add(g);
    const add = (geo, mat, px, py, pz) => { const me = new THREE.Mesh(geo, mat); me.position.set(px - W / 2, py, pz - D / 2); const tr = mat.transparent || mat === M.glow; me.castShadow = !tr; me.receiveShadow = !tr; g.add(me); return me; };
    const b = (x0, z0, ww, dd, y0, ht, mat, r = 0) => { if (ww <= 0.004 || dd <= 0.004 || ht <= 0.002) return; const rr = r ? Math.min(r, ww / 2 - 0.001, dd / 2 - 0.001, ht / 2 - 0.001) : 0; return add(rr > 0.004 ? new RoundedBoxGeometry(ww, ht, dd, 3, rr) : new THREE.BoxGeometry(ww, ht, dd), mat, x0 + ww / 2, y0 + ht / 2, z0 + dd / 2); };
    const c = (px, pz, r, y0, ht, mat, rTop) => add(new THREE.CylinderGeometry(rTop ?? r, r, ht, 28), mat, px, y0 + ht / 2, pz);
    const light = (lx, ly, lz, col, int, dist) => addLight(lx - W / 2, ly, lz - D / 2, col, int, dist, g);
    const artMat = () => std({ map: tex('art' + artN, false, artCanvas(artN++)), roughness: 0.9 });
    def.build({ W, D, b, c, M, main: f.c && PAL[f.c] ? M[PAL[f.c]] : null, g, light, WH, artMat, THREE });
    if (def.solid !== false) block(x, y, w, h);
  }

  // oyuncu
  const player = { x: PW / 2, y: PH / 2, yaw: 0, pitch: 0, target: null }, EYE = 1.6; let topView = false;
  function nearestFree(px, py) { if (freeAt(px, py)) return [px, py]; for (let r = 6; r < Math.max(PW, PH); r += 6) for (let a = 0; a < 16; a++) { const qx = px + Math.cos(a * Math.PI / 8) * r, qy = py + Math.sin(a * Math.PI / 8) * r; if (freeAt(qx, qy)) return [qx, qy]; } return null; }
  function place(px, py, deg, pitch = -0.06) { const f = nearestFree(px, py) || [px, py]; player.x = f[0]; player.y = f[1]; if (deg !== undefined && deg !== null) player.yaw = -deg * Math.PI / 180; player.pitch = pitch; player.target = null; }
  const names = [...new Set(rooms.map(r => r.name || 'Oda'))];
  function spawnOf(name) {
    const rs = rooms.filter(r => (r.name || 'Oda') === name); if (!rs.length) return null; const sp = rs.find(r => r.spawn); if (sp) return sp.spawn;
    const r = rs.reduce((a, b) => a.r[2] * a.r[3] >= b.r[2] * b.r[3] ? a : b), [x, y, w, h] = r.r, rcx = x + w / 2, rcy = y + h / 2; let best = null, bd = 1e9;
    for (const d of doors) { if (d.closed) continue; const dx = d.r[0] + d.r[2] / 2, dy = d.r[1] + d.r[3] / 2, ox = Math.max(x - dx, 0, dx - x - w), oy = Math.max(y - dy, 0, dy - y - h), dd = Math.hypot(ox, oy); if (dd < S * 0.6 && dd < bd) { bd = dd; best = [dx, dy]; } }
    if (!best) return [rcx, rcy, w >= h ? 90 : 180]; const vx = rcx - best[0], vy = rcy - best[1], l = Math.hypot(vx, vy) || 1, st = Math.min(l * 0.5, S * 0.9); return [best[0] + vx / l * st, best[1] + vy / l * st, Math.atan2(vx, -vy) * 180 / Math.PI];
  }
  const fade = $('.p3-fade'), chips = $('.p3-rooms'), whereEl = $('.p3-where'); let active = null;
  function setActive(name) { if (name === active) return; active = name; for (const bt of chips.children) bt.setAttribute('aria-pressed', bt.textContent === name ? 'true' : 'false'); whereEl.textContent = name || ''; }
  function goRoom(name, instant) { const s = spawnOf(name); if (!s) return; const go = () => { if (topView) setTop(false); place(s[0], s[1], s[2]); setActive(name); }; if (instant) return go(); fade.classList.add('on'); setTimeout(() => { go(); fade.classList.remove('on'); }, 220); }
  for (const n of names) { const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = n; bt.onclick = () => goRoom(n); chips.appendChild(bt); }
  // mini plan
  const mini = $('.p3-mini'); mini.width = 352; mini.height = Math.round(352 * PH / PW); const mctx = mini.getContext('2d'); let mimg = null; if (P.thumb) { mimg = new Image(); mimg.src = P.thumb; }
  function drawMini() {
    const w = mini.width, h = mini.height, k = w / PW; mctx.clearRect(0, 0, w, h);
    if (mimg && mimg.complete && mimg.naturalWidth) mctx.drawImage(mimg, 0, 0, w, h); else { mctx.fillStyle = '#2a2b2f'; mctx.fillRect(0, 0, w, h); mctx.fillStyle = '#c9c4ba'; for (const r of rooms) mctx.fillRect(r.r[0] * k, r.r[1] * k, r.r[2] * k, r.r[3] * k); mctx.fillStyle = '#c9c4ba'; for (const d of doors) mctx.fillRect(d.r[0] * k, d.r[1] * k, d.r[2] * k, d.r[3] * k); mctx.fillStyle = '#3b3c40'; for (const r of walls) mctx.fillRect(r[0] * k, r[1] * k, r[2] * k, r[3] * k); }
    mctx.save(); mctx.translate(player.x * k, player.y * k); mctx.rotate(-player.yaw); mctx.fillStyle = 'rgba(255,196,60,0.35)'; mctx.beginPath(); mctx.moveTo(0, 0); mctx.arc(0, 0, 54, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); mctx.closePath(); mctx.fill(); mctx.fillStyle = '#ffc43c'; mctx.strokeStyle = '#1b1c1e'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(0, 0, 8, 0, 7); mctx.fill(); mctx.stroke(); mctx.restore();
  }
  mini.addEventListener('click', (e) => { const bb = mini.getBoundingClientRect(), px = (e.clientX - bb.left) / bb.width * PW, py = (e.clientY - bb.top) / bb.height * PH; if (!roomAt(px, py)) return; fade.classList.add('on'); setTimeout(() => { if (topView) setTop(false); place(px, py); fade.classList.remove('on'); }, 200); });
  const hint = $('.p3-hint'), hideHint = () => hint.classList.add('gone'); hint.querySelector('button').onclick = hideHint; if (opts.noHint) hideHint();
  // kalite / ust gorunum
  let hq = !coarse, composer = null, locked = false;
  function buildComposer() { const sz = renderer.getDrawingBufferSize(new THREE.Vector2()), rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: 4 }); composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, camera)); const gt = new GTAOPass(scene, camera, sz.x, sz.y); gt.blendIntensity = 1; gt.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1.2, scale: 1.25, samples: 12 }); composer.addPass(gt); composer.addPass(new OutputPass()); }
  const qBtn = $('.p3-q'), tBtn = $('.p3-top');
  function setQ(v) { hq = v; qBtn.textContent = hq ? 'Kalite: Yüksek' : 'Kalite: Hızlı'; if (hq && !composer) { try { buildComposer(); resize(); } catch (e) { hq = false; composer = null; qBtn.textContent = 'Kalite: Hızlı'; } } }
  qBtn.onclick = () => setQ(!hq);
  function setTop(v) { topView = v; ceiling.visible = !v; marker.visible = false; tBtn.textContent = v ? 'İçeri dön' : 'Üstten bak'; tBtn.setAttribute('aria-pressed', v ? 'true' : 'false'); }
  tBtn.onclick = () => setTop(!topView);
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 82 : 68; camera.updateProjectionMatrix(); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); } }
  const ro = new ResizeObserver(resize); ro.observe(canvas);
  // girdi
  const keys = new Set(), typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
  addEventListener('keydown', (e) => { if (typing(e)) return; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); keys.add(e.key.toLowerCase()); hideHint(); }, sig);
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()), sig); addEventListener('blur', () => keys.clear(), sig);
  let drag = null; const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.14, 32), new THREE.MeshBasicMaterial({ color: 0xffc43c, transparent: true, opacity: 0.9, depthTest: false })); marker.rotation.x = -Math.PI / 2; marker.visible = false; marker.renderOrder = 5; scene.add(marker);
  canvas.addEventListener('pointerdown', (e) => { if (topView) return; canvas.setPointerCapture(e.pointerId); drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false }; });
  canvas.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true; if (drag.moved) { const k = 0.0042 * (camera.fov / 68); player.yaw += dx * k; player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch + dy * k)); hideHint(); } });
  canvas.addEventListener('pointerup', (e) => { if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null; if (!d.moved && performance.now() - d.t < 400) { const bb = canvas.getBoundingClientRect(); ndc.set((e.clientX - bb.left) / bb.width * 2 - 1, -((e.clientY - bb.top) / bb.height) * 2 + 1); ray.setFromCamera(ndc, camera); const hit = ray.intersectObjects(floors, false)[0]; if (hit) { const f = nearestFree(hit.point.x * S, hit.point.z * S); if (f) { player.target = { x: f[0], y: f[1], stuck: 0 }; marker.position.set(m(f[0]), 0.02, m(f[1])); marker.visible = true; hideHint(); } } } });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  const joy = $('.p3-joy'), knob = $('.p3-knob'), jv = { x: 0, y: 0, id: null }; if (coarse) joy.classList.add('show');
  const jmove = (e) => { if (e.pointerId !== jv.id) return; const bb = joy.getBoundingClientRect(), R = bb.width / 2; let dx = e.clientX - bb.left - R, dy = e.clientY - bb.top - R; const l = Math.hypot(dx, dy), mx = R * 0.7; if (l > mx) { dx *= mx / l; dy *= mx / l; } jv.x = dx / mx; jv.y = dy / mx; knob.style.transform = `translate(${dx}px,${dy}px)`; hideHint(); };
  joy.addEventListener('pointerdown', (e) => { joy.setPointerCapture(e.pointerId); jv.id = e.pointerId; jmove(e); e.stopPropagation(); }); joy.addEventListener('pointermove', jmove);
  const jend = (e) => { if (e.pointerId !== jv.id) return; jv.id = null; jv.x = jv.y = 0; knob.style.transform = ''; }; joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);
  // dongu
  const tryMove = (dx, dy) => { let mv = false; if (dx && freeAt(player.x + dx, player.y)) { player.x += dx; mv = true; } if (dy && freeAt(player.x, player.y + dy)) { player.y += dy; mv = true; } return mv; };
  let last = performance.now(), frames = 0, acc = 0, slow = 0, raf = 0, dead = false;
  function tick(now) {
    if (dead) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; let f = 0, s = 0, turn = 0;
    if (keys.has('w') || keys.has('arrowup')) f += 1; if (keys.has('s') || keys.has('arrowdown')) f -= 1; if (keys.has('d')) s += 1; if (keys.has('a')) s -= 1; if (keys.has('arrowleft') || keys.has('q')) turn += 1; if (keys.has('arrowright') || keys.has('e')) turn -= 1;
    f -= jv.y; s += jv.x; player.yaw += turn * 1.9 * dt; const speed = (keys.has('shift') ? 2.8 : 1.7) * S * dt, sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    if (f || s) { player.target = null; marker.visible = false; const l = Math.max(1, Math.hypot(f, s)); tryMove((-sin * f + cos * s) / l * speed, (-cos * f - sin * s) / l * speed); }
    else if (player.target) { const dx = player.target.x - player.x, dy = player.target.y - player.y, d = Math.hypot(dx, dy); if (d < S * 0.06) { player.target = null; marker.visible = false; } else { const st = Math.min(d, speed * 1.15); if (!tryMove(dx / d * st, dy / d * st)) { if ((player.target.stuck += dt) > 0.25) { player.target = null; marker.visible = false; } } else player.target.stuck = 0; } }
    if (topView) { const need = Math.max(m(PH) * 0.62, m(PW) * 0.62 / camera.aspect); camera.position.set(cx, need / Math.tan(camera.fov * Math.PI / 360), cz); camera.rotation.set(-Math.PI / 2, 0, 0); } else { camera.position.set(m(player.x), EYE, m(player.y)); camera.rotation.set(player.pitch, player.yaw, 0); }
    const r = roomAt(player.x, player.y); if (r) setActive(r.name || 'Oda');
    if (hq && composer) composer.render(); else renderer.render(scene, camera); drawMini();
    frames++; acc += dt; if (acc > 2) { const fps = frames / acc; frames = 0; acc = 0; if (hq && fps < 22 && ++slow >= 2 && !locked) setQ(false); }
    raf = requestAnimationFrame(tick);
  }
  resize(); setQ(hq); const startName = names.includes(opts.start) ? opts.start : names.includes(P.start) ? P.start : names[0]; if (startName) goRoom(startName, true); else place(PW / 2, PH / 2, 0);
  raf = requestAnimationFrame(tick);
  return {
    goRoom, setTop, place, free: freeAt, names, player, lock: (v) => { locked = v; },
    dispose() { dead = true; cancelAnimationFrame(raf); ac.abort(); ro.disconnect(); scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const k in M) { M[k].map?.dispose(); M[k].dispose(); } if (composer) composer.dispose?.(); renderer.dispose(); renderer.forceContextLoss?.(); root.innerHTML = ''; },
  };
}
