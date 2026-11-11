// Plan3D Studyo: plan gorselinin ustunde duvar/kapi/pencere/oda/mobilya isaretlenir, 3D onizlenir, musteri dosyasi uretilir.
import { createTour, FLOORS, COLORS, FURN } from './engine.js';
import { buildPrompt, rulerCanvas, buildFromAnalysis } from './auto.js';
import demo from '../demo/demo.json';
import viewerJs from '../build/viewer.bundle.txt';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const blank = () => ({ name: 'Yeni proje', firm: '', contact: '', pxPerMeter: 60, size: [900, 700], wallHeight: 2.8, wallColor: '#e6e0d6', walls: [], windows: [], doors: [], rooms: [], furniture: [] });
let P = blank(), pid = null, dirty = false, tool = 'select', furnType = 'sofa', sel = null, tour = null;
let img = null, imgData = null, view = { k: 1, ox: 0, oy: 0 }, drawing = null, dragOp = null, scaleLine = null, tol = 14, hist = [], showImg = true;
const KIND = { wall: 'Duvar', door: 'Kapı / geçiş', window: 'Pencere', room: 'Oda', furn: 'Mobilya' };
const listOf = (k) => ({ wall: P.walls, door: P.doors, window: P.windows, room: P.rooms, furn: P.furniture }[k]);
const rectOf = (k, i) => (k === 'wall' ? P.walls[i] : listOf(k)[i]?.r);

// ---------- saklama ----------
let db = null, assets = null, downloads = null, sample = null, capsReady = false;
(async () => { try { if (window.claude?.use) { [db, assets, downloads, sample] = await Promise.all([claude.use('db'), claude.use('assets'), claude.use('downloads'), claude.use('sample')]); } } catch (e) { } capsReady = true; status(db ? 'Projeler bu sayfada saklanır.' : 'Projeler yalnızca bu tarayıcıda saklanır.'); })();
const LS = 'plan3d-projects';
const lsAll = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } };
const store = {
  async list() { if (db) { const q = await db.collection('projects').get(); return q.docs.map(d => ({ id: d.id, ...d.data() })).map(d => ({ id: d.id, name: d.name, updated: d.updated })); } return Object.entries(lsAll()).map(([id, d]) => ({ id, name: d.name, updated: d.updated })); },
  async get(id) { if (db) { const s = await db.doc('projects/' + id).get(); return s.exists ? s.data() : null; } return lsAll()[id] || null; },
  async put(id, doc) { if (db) return db.doc('projects/' + id).set(doc); const a = lsAll(); a[id] = doc; localStorage.setItem(LS, JSON.stringify(a)); },
  async del(id) { if (db) return db.doc('projects/' + id).delete(); const a = lsAll(); delete a[id]; localStorage.setItem(LS, JSON.stringify(a)); },
};
let statusT = 0;
function status(msg, bad) { const el = $('status'); el.textContent = msg; el.classList.toggle('bad', !!bad); clearTimeout(statusT); }
function mark() { dirty = true; $('bSave').classList.add('hot'); }

// ---------- gorsel ----------
function setImage(canvasOrImg, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true }).drawImage(canvasOrImg, 0, 0, w, h); img = c; imgData = null; draw(); }
function loadImgSrc(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
async function onFile(file) {
  if (!file) return; let bmp; try { bmp = await createImageBitmap(file); } catch (e) { return status('Bu dosya okunamadı. PNG veya JPG bir plan görseli seçin.', true); }
  const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
  const had = P.walls.length + P.rooms.length + P.furniture.length, old = P.size; push(); P.size = [w, h];
  if (had && (old[0] !== w || old[1] !== h)) { const kx = w / old[0], ky = h / old[1], sc2 = (r) => { r[0] *= kx; r[1] *= ky; r[2] *= kx; r[3] *= ky; }; P.walls.forEach(sc2); for (const k of ['door', 'window', 'room', 'furn']) listOf(k).forEach(o => sc2(o.r)); P.pxPerMeter *= kx; }
  setImage(bmp, w, h);
  const t = document.createElement('canvas'), ts = Math.min(1, 520 / w); t.width = Math.round(w * ts); t.height = Math.round(h * ts); t.getContext('2d').drawImage(img, 0, 0, t.width, t.height); P.thumb = t.toDataURL('image/jpeg', 0.6); P.imageId = null;
  if (assets) { try { const blob = await new Promise(r => img.toBlob(r, 'image/jpeg', 0.85)); const a = await assets.upload(blob); P.imageId = a.id; } catch (e) { status('Plan görseli yüklenemedi; küçük kopyası projeyle saklanacak.', true); } }
  fit(); mark(); props(); status('Plan yüklendi. Önce ölçeği ayarlayın, sonra duvarları işaretleyin.');
}
async function restoreImage() {
  img = null; imgData = null; const tries = []; if (P.imageId) tries.push('/_blob/' + P.imageId); if (P.thumb) tries.push(P.thumb);
  for (const src of tries) { try { const im = await loadImgSrc(src); setImage(im, P.size[0], P.size[1]); return; } catch (e) { } } draw();
}
function pixels() { if (!img) return null; if (!imgData) imgData = img.getContext('2d').getImageData(0, 0, img.width, img.height); return imgData; }

// ---------- duvar bulma (renk + en buyuk dikdortgenler) ----------
function detectWalls(px, py) {
  const d = pixels(); if (!d) return status('Önce bir plan görseli yükleyin.', true); px = Math.round(px); py = Math.round(py); if (px < 0 || py < 0 || px >= d.width || py >= d.height) return;
  const W = d.width, H = d.height, a = d.data, i0 = (py * W + px) * 4, r0 = a[i0], g0 = a[i0 + 1], b0 = a[i0 + 2], C = Math.max(2, Math.round(Math.max(W, H) / 400)), gw = Math.floor(W / C), gh = Math.floor(H / C), g = new Uint8Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { let n = 0; for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const k = ((j * C + y) * W + i * C + x) * 4; if (Math.abs(a[k] - r0) <= tol && Math.abs(a[k + 1] - g0) <= tol && Math.abs(a[k + 2] - b0) <= tol) n++; } if (n * 2 >= C * C) g[j * gw + i] = 1; }
  const hts = new Int32Array(gw), out = [], minA = Math.max(10, Math.round(0.05 * P.pxPerMeter * P.pxPerMeter / (C * C)));
  for (let it = 0; it < 220; it++) {
    hts.fill(0); let best = [0, 0, 0, 0, 0]; const st = [];
    for (let y = 0; y < gh; y++) { for (let x = 0; x < gw; x++) hts[x] = g[y * gw + x] ? hts[x] + 1 : 0; st.length = 0; for (let x = 0; x <= gw; x++) { const cur = x < gw ? hts[x] : 0; let start = x; while (st.length && st[st.length - 1][1] >= cur) { const [sx, sh] = st.pop(), ar = sh * (x - sx); if (ar > best[0]) best = [ar, sx, y - sh + 1, x - sx, sh]; start = sx; } st.push([start, cur]); } }
    const [ar, x, y, w, h] = best; if (ar < minA) break; for (let j = y; j < y + h; j++) g.fill(0, j * gw + x, j * gw + x + w); if (Math.max(w, h) * C >= P.pxPerMeter * 0.25) out.push([x * C, y * C, w * C, h * C]);
  }
  if (!out.length) return status('Bu renkte duvar bulunamadı. Toleransı artırıp tekrar deneyin.', true);
  push(); P.walls.push(...out); mark(); draw(); status(out.length + ' duvar parçası eklendi. Yanlış olanları seçip silebilir, Ctrl+Z ile geri alabilirsiniz.');
}

// ---------- gecmis ----------
function snap() { return JSON.stringify({ ...P, thumb: undefined }); }
function push() { hist.push(snap()); if (hist.length > 60) hist.shift(); }
function undo() { const s = hist.pop(); if (!s) return; const th = P.thumb; P = JSON.parse(s); P.thumb = th; sel = null; mark(); props(); draw(); }

// ---------- cizim ----------
const ed = $('ed'), ctx = ed.getContext('2d');
function fit() { const w = ed.clientWidth, h = ed.clientHeight; if (!w) return; const k = Math.min((w - 40) / P.size[0], (h - 40) / P.size[1]); view = { k, ox: (w - P.size[0] * k) / 2, oy: (h - P.size[1] * k) / 2 }; draw(); }
const toPlan = (e) => { const b = ed.getBoundingClientRect(); return [(e.clientX - b.left - view.ox) / view.k, (e.clientY - b.top - view.oy) / view.k]; };
function draw() {
  const dpr = devicePixelRatio || 1, w = ed.clientWidth, h = ed.clientHeight; if (!w) return; if (ed.width !== Math.round(w * dpr)) { ed.width = Math.round(w * dpr); ed.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#101113'; ctx.fillRect(0, 0, w, h); ctx.translate(view.ox, view.oy); ctx.scale(view.k, view.k); const px = 1 / view.k;
  ctx.fillStyle = '#1d1e22'; ctx.fillRect(0, 0, P.size[0], P.size[1]); if (img && showImg) { ctx.globalAlpha = 0.9; ctx.drawImage(img, 0, 0, P.size[0], P.size[1]); ctx.globalAlpha = 1; }
  const R = (r) => [r[0], r[1], r[2], r[3]];
  P.rooms.forEach((o) => { ctx.fillStyle = 'rgba(96,165,250,.16)'; ctx.fillRect(...R(o.r)); ctx.strokeStyle = 'rgba(96,165,250,.9)'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([6 * px, 4 * px]); ctx.strokeRect(...R(o.r)); ctx.setLineDash([]); ctx.fillStyle = '#dbeafe'; ctx.font = `600 ${12 * px}px Figtree,system-ui,sans-serif`; ctx.fillText(o.name || 'Oda', o.r[0] + 5 * px, o.r[1] + 15 * px); });
  ctx.fillStyle = 'rgba(239,68,68,.6)'; P.walls.forEach((r) => ctx.fillRect(...R(r)));
  ctx.fillStyle = 'rgba(34,197,94,.75)'; P.doors.forEach((o) => { ctx.fillRect(...R(o.r)); if (o.closed) { ctx.strokeStyle = '#052e16'; ctx.lineWidth = 2 * px; ctx.strokeRect(...R(o.r)); } });
  ctx.fillStyle = 'rgba(34,211,238,.85)'; P.windows.forEach((o) => ctx.fillRect(...R(o.r)));
  P.furniture.forEach((o) => { const [x, y, w2, h2] = o.r, rot = (((o.rot || 0) % 360) + 360) % 360; ctx.fillStyle = 'rgba(250,204,21,.18)'; ctx.fillRect(x, y, w2, h2); ctx.strokeStyle = 'rgba(250,204,21,.95)'; ctx.lineWidth = 1.2 * px; ctx.strokeRect(x, y, w2, h2); ctx.lineWidth = 3.5 * px; ctx.beginPath(); if (rot === 0) { ctx.moveTo(x, y); ctx.lineTo(x + w2, y); } else if (rot === 90) { ctx.moveTo(x + w2, y); ctx.lineTo(x + w2, y + h2); } else if (rot === 180) { ctx.moveTo(x, y + h2); ctx.lineTo(x + w2, y + h2); } else { ctx.moveTo(x, y); ctx.lineTo(x, y + h2); } ctx.stroke(); if (w2 * view.k > 46) { ctx.fillStyle = '#fef9c3'; ctx.font = `${10 * px}px Figtree,system-ui,sans-serif`; ctx.fillText((FURN[o.t]?.n || o.t).split(' ')[0], x + 3 * px, y + h2 / 2 + 3 * px); } });
  if (sel) { const r = rectOf(sel.k, sel.i); if (r) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * px; ctx.strokeRect(...R(r)); ctx.fillStyle = '#fff'; for (const [hx, hy] of corners(r)) ctx.fillRect(hx - 4 * px, hy - 4 * px, 8 * px, 8 * px); } }
  if (drawing) { const r = norm(drawing); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * px; ctx.setLineDash([4 * px, 3 * px]); ctx.strokeRect(...r); ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.font = `${11 * px}px Figtree,system-ui,sans-serif`; ctx.fillText(`${(r[2] / P.pxPerMeter).toFixed(2)} × ${(r[3] / P.pxPerMeter).toFixed(2)} m`, r[0], r[1] - 5 * px); }
  if (scaleLine) { ctx.strokeStyle = '#f0abfc'; ctx.lineWidth = 2.5 * px; ctx.beginPath(); ctx.moveTo(scaleLine.x1, scaleLine.y1); ctx.lineTo(scaleLine.x2, scaleLine.y2); ctx.stroke(); }
  $('empty').style.display = !img && !P.walls.length && !P.rooms.length ? 'flex' : 'none';
}
const corners = (r) => [[r[0], r[1]], [r[0] + r[2], r[1]], [r[0], r[1] + r[3]], [r[0] + r[2], r[1] + r[3]]];
const norm = (d) => [Math.min(d.x1, d.x2), Math.min(d.y1, d.y2), Math.abs(d.x2 - d.x1), Math.abs(d.y2 - d.y1)];
const inR = (r, x, y, pad = 0) => x >= r[0] - pad && x <= r[0] + r[2] + pad && y >= r[1] - pad && y <= r[1] + r[3] + pad;
function hit(x, y) {
  const pad = 3 / view.k, F = P.furniture; let bi = -1, ba = 1e12;
  for (let i = F.length - 1; i >= 0; i--) if (!/^rug/.test(F[i].t) && inR(F[i].r, x, y, pad)) { const a = F[i].r[2] * F[i].r[3]; if (a < ba) { ba = a; bi = i; } } if (bi >= 0) return { k: 'furn', i: bi };
  for (let i = P.doors.length - 1; i >= 0; i--) if (inR(P.doors[i].r, x, y, pad)) return { k: 'door', i };
  for (let i = P.windows.length - 1; i >= 0; i--) if (inR(P.windows[i].r, x, y, pad)) return { k: 'window', i };
  for (let i = P.walls.length - 1; i >= 0; i--) if (inR(P.walls[i], x, y, pad)) return { k: 'wall', i };
  for (let i = F.length - 1; i >= 0; i--) if (inR(F[i].r, x, y)) return { k: 'furn', i };
  for (let i = P.rooms.length - 1; i >= 0; i--) if (inR(P.rooms[i].r, x, y)) return { k: 'room', i };
  return null;
}
ed.addEventListener('pointerdown', (e) => {
  ed.setPointerCapture(e.pointerId); const [x, y] = toPlan(e);
  if (e.button === 1 || e.button === 2 || e.shiftKey && tool === 'select' && !hit(x, y)) { dragOp = { t: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy }; return; }
  if (tool === 'pick') return detectWalls(x, y);
  if (tool === 'scale') { scaleLine = { x1: x, y1: y, x2: x, y2: y }; dragOp = { t: 'scale' }; return; }
  if (tool !== 'select') { drawing = { x1: x, y1: y, x2: x, y2: y }; return; }
  if (sel) { const r = rectOf(sel.k, sel.i), hr = 7 / view.k, ci = r ? corners(r).findIndex(([hx, hy]) => Math.abs(hx - x) < hr && Math.abs(hy - y) < hr) : -1; if (ci >= 0) { push(); dragOp = { t: 'resize', ci, r0: [...r] }; return; } }
  sel = hit(x, y); if (sel) { push(); dragOp = { t: 'move', x, y, r0: [...rectOf(sel.k, sel.i)], moved: false }; } else dragOp = { t: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy };
  props(); draw();
});
ed.addEventListener('pointermove', (e) => {
  const [x, y] = toPlan(e);
  if (drawing) { drawing.x2 = x; drawing.y2 = y; return draw(); }
  if (!dragOp) return;
  if (dragOp.t === 'pan') { view.ox = dragOp.ox + e.clientX - dragOp.sx; view.oy = dragOp.oy + e.clientY - dragOp.sy; return draw(); }
  if (dragOp.t === 'scale') { scaleLine.x2 = x; scaleLine.y2 = y; return draw(); }
  const r = rectOf(sel.k, sel.i); if (!r) return;
  if (dragOp.t === 'move') { r[0] = Math.round(dragOp.r0[0] + x - dragOp.x); r[1] = Math.round(dragOp.r0[1] + y - dragOp.y); dragOp.moved = true; }
  if (dragOp.t === 'resize') { const [x0, y0, w0, h0] = dragOp.r0, fx = dragOp.ci % 2 ? x0 : x0 + w0, fy = dragOp.ci < 2 ? y0 + h0 : y0, nx = Math.round(x), ny = Math.round(y); r[0] = Math.min(fx, nx); r[1] = Math.min(fy, ny); r[2] = Math.max(2, Math.abs(nx - fx)); r[3] = Math.max(2, Math.abs(ny - fy)); dragOp.moved = true; }
  draw();
});
ed.addEventListener('pointerup', (e) => {
  if (drawing) {
    let r = norm(drawing).map(Math.round); const d0 = drawing; drawing = null;
    if (tool === 'furn' && (r[2] < 5 || r[3] < 5)) { const def = FURN[furnType], w = def.w * P.pxPerMeter, h = def.d * P.pxPerMeter; r = [Math.round(d0.x1 - w / 2), Math.round(d0.y1 - h / 2), Math.round(w), Math.round(h)]; }
    if (r[2] >= 3 && r[3] >= 3) { push(); if (tool === 'wall') { P.walls.push(r); sel = { k: 'wall', i: P.walls.length - 1 }; } else if (tool === 'door') { P.doors.push({ r, head: 2.15 }); sel = { k: 'door', i: P.doors.length - 1 }; } else if (tool === 'window') { P.windows.push({ r, sill: 0.25, head: 2.5 }); sel = { k: 'window', i: P.windows.length - 1 }; } else if (tool === 'room') { P.rooms.push({ name: 'Oda ' + (P.rooms.length + 1), floor: 'oak', r }); sel = { k: 'room', i: P.rooms.length - 1 }; } else if (tool === 'furn') { P.furniture.push({ t: furnType, r, rot: 0 }); sel = { k: 'furn', i: P.furniture.length - 1 }; } mark(); props(); }
    return draw();
  }
  if (dragOp) { if ((dragOp.t === 'move' || dragOp.t === 'resize')) { if (dragOp.moved) mark(); else hist.pop(); props(); } if (dragOp.t === 'scale') props(); dragOp = null; }
});
ed.addEventListener('wheel', (e) => { e.preventDefault(); const b = ed.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top, f = Math.exp(-e.deltaY * 0.0015), k = Math.min(12, Math.max(0.1, view.k * f)); view.ox = mx - (mx - view.ox) * (k / view.k); view.oy = my - (my - view.oy) * (k / view.k); view.k = k; draw(); }, { passive: false });
ed.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (tour || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(); }
  if (!sel) return; const r = rectOf(sel.k, sel.i); if (!r) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return removeSel(); }
  if (e.key.toLowerCase() === 'r' && sel.k === 'furn') { push(); rotate(P.furniture[sel.i]); mark(); props(); return draw(); }
  const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (mv) { e.preventDefault(); push(); r[0] += mv[0]; r[1] += mv[1]; mark(); draw(); }
});
function rotate(o) { o.rot = ((o.rot || 0) + 90) % 360; const r = o.r, cx = r[0] + r[2] / 2, cy = r[1] + r[3] / 2; [r[2], r[3]] = [r[3], r[2]]; r[0] = Math.round(cx - r[2] / 2); r[1] = Math.round(cy - r[3] / 2); }
function removeSel() { if (!sel) return; push(); listOf(sel.k).splice(sel.i, 1); sel = null; mark(); props(); draw(); }
new ResizeObserver(() => { if (!tour) draw(); }).observe(ed);

// ---------- ozellik paneli ----------
const opt = (map, cur, empty) => (empty ? `<option value="">${empty}</option>` : '') + Object.entries(map).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(typeof v === 'string' ? v : v.n)}</option>`).join('');
const num = (id, label, v, step = 0.05) => `<label for="${id}">${label}</label><input id="${id}" type="number" step="${step}" value="${v}">`;
function props() {
  const el = $('props'); let h = '';
  if (tool === 'scale') { const len = scaleLine ? Math.hypot(scaleLine.x2 - scaleLine.x1, scaleLine.y2 - scaleLine.y1) : 0; h += `<h2>Ölçek</h2><p class="muted">Planda uzunluğunu bildiğiniz bir yerin (kapı, duvar, yatak) bir ucundan öbür ucuna çizgi çekin.</p>` + (len > 4 ? `${num('scM', 'Bu çizgi kaç metre?', (len / P.pxPerMeter).toFixed(2), 0.01)}<button id="scOk" class="primary" type="button">Ölçeği uygula</button>` : ''); }
  else if (tool === 'pick') h += `<h2>Duvarları bul</h2><p class="muted">Plan üzerinde bir duvara tıklayın; aynı renkteki bölgeler duvar olarak eklenir.</p><label for="tol">Renk toleransı: <span id="tolV">${tol}</span></label><input id="tol" type="range" min="4" max="48" value="${tol}"><button id="clrW" type="button">Tüm duvarları sil</button>`;
  else if (sel && rectOf(sel.k, sel.i)) {
    const o = sel.k === 'wall' ? null : listOf(sel.k)[sel.i], r = rectOf(sel.k, sel.i), S = P.pxPerMeter;
    h += `<h2>${KIND[sel.k]}</h2>`;
    if (sel.k === 'room') h += `<label for="rName">Oda adı</label><input id="rName" type="text" value="${esc(o.name)}"><label for="rFloor">Zemin</label><select id="rFloor">${opt(FLOORS, o.floor)}</select><p class="muted">Aynı adı taşıyan dikdörtgenler tek oda sayılır (L biçimli odalar için).</p>`;
    if (sel.k === 'window') h += num('wSill', 'Denizlik yüksekliği (m)', o.sill ?? 0.25) + num('wHead', 'Üst kot (m)', o.head ?? 2.5) + `<label class="chk"><input id="wFr" type="checkbox"${o.frosted ? ' checked' : ''}> Buzlu cam</label>`;
    if (sel.k === 'door') h += num('dHead', 'Kapı yüksekliği (m)', o.head ?? 2.15) + `<label class="chk"><input id="dCl" type="checkbox"${o.closed ? ' checked' : ''}> Kapalı kapı (geçilmez, örn. daire girişi)</label>`;
    if (sel.k === 'furn') h += `<label for="fT">Tür</label><select id="fT">${opt(FURN, o.t)}</select><label for="fC">Renk / malzeme</label><select id="fC">${opt(COLORS, o.c || '', 'Varsayılan')}</select><button id="fRot" type="button">90° döndür (R)</button><p class="muted">Kalın sarı kenar mobilyanın arkasıdır; duvara o kenar gelmeli.</p>`;
    h += `<div class="dims">${(r[2] / S).toFixed(2)} × ${(r[3] / S).toFixed(2)} m</div><button id="del" class="danger" type="button">Sil (Delete)</button>`;
  } else h += `<h2>Proje</h2><label for="pFirm">Firma adı (turda görünür)</label><input id="pFirm" type="text" value="${esc(P.firm)}"><label for="pCont">İletişim linki (https, mailto veya tel)</label><input id="pCont" type="text" placeholder="https://wa.me/90..." value="${esc(P.contact)}">${num('pS', 'Ölçek (piksel / metre)', +P.pxPerMeter.toFixed(1), 0.5)}${num('pH', 'Tavan yüksekliği (m)', P.wallHeight)}<label for="pW">Duvar rengi</label><input id="pW" type="color" value="${esc(P.wallColor)}"><label for="pSt">Tur başlangıç odası</label><select id="pSt">${[...new Set(P.rooms.map(r => r.name))].map(n => `<option${n === P.start ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select><label class="chk"><input id="pImg" type="checkbox"${showImg ? ' checked' : ''}> Plan görselini göster</label><div class="dims">${P.walls.length} duvar · ${P.doors.length} kapı · ${P.windows.length} pencere · ${P.rooms.length} oda · ${P.furniture.length} mobilya</div>`;
  el.innerHTML = h;
  const on = (id, ev, fn) => { const x = $(id); if (x) x.addEventListener(ev, fn); }, ch = (id, fn) => on(id, 'change', (e) => { push(); fn(e.target); mark(); draw(); });
  on('scOk', 'click', () => { const mt = parseFloat($('scM').value), len = Math.hypot(scaleLine.x2 - scaleLine.x1, scaleLine.y2 - scaleLine.y1); if (!(mt > 0)) return status('Geçerli bir uzunluk girin.', true); push(); P.pxPerMeter = len / mt; scaleLine = null; mark(); setTool('select'); status('Ölçek ayarlandı: 1 m = ' + P.pxPerMeter.toFixed(1) + ' piksel.'); });
  on('tol', 'input', (e) => { tol = +e.target.value; $('tolV').textContent = tol; }); on('clrW', 'click', () => { push(); P.walls = []; mark(); draw(); });
  on('del', 'click', removeSel); on('fRot', 'click', () => { push(); rotate(P.furniture[sel.i]); mark(); props(); draw(); });
  const o = sel && sel.k !== 'wall' ? listOf(sel.k)[sel.i] : null;
  ch('rName', (t) => { o.name = t.value.trim() || 'Oda'; }); ch('rFloor', (t) => { o.floor = t.value; }); ch('wSill', (t) => { o.sill = Math.max(0, +t.value || 0); }); ch('wHead', (t) => { o.head = +t.value || 2.5; }); ch('wFr', (t) => { o.frosted = t.checked; });
  ch('dHead', (t) => { o.head = +t.value || 2.15; }); ch('dCl', (t) => { o.closed = t.checked; }); ch('fT', (t) => { o.t = t.value; }); ch('fC', (t) => { if (t.value) o.c = t.value; else delete o.c; });
  ch('pFirm', (t) => { P.firm = t.value.trim(); }); ch('pCont', (t) => { P.contact = t.value.trim(); }); ch('pS', (t) => { P.pxPerMeter = Math.max(5, +t.value || 60); }); ch('pH', (t) => { P.wallHeight = Math.min(5, Math.max(2.2, +t.value || 2.8)); }); ch('pW', (t) => { P.wallColor = t.value; }); ch('pSt', (t) => { P.start = t.value; });
  on('pImg', 'change', (e) => { showImg = e.target.checked; draw(); });
}

// ---------- araclar ----------
function setTool(t) { tool = t; if (t !== 'scale') scaleLine = null; if (t !== 'select') sel = null; for (const b of document.querySelectorAll('#tools [data-tool]')) b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false'); ed.style.cursor = t === 'select' ? 'default' : 'crosshair'; props(); draw(); }
for (const b of document.querySelectorAll('#tools [data-tool]')) b.onclick = () => setTool(b.dataset.tool);
$('furnType').innerHTML = opt(FURN, furnType); $('furnType').onchange = (e) => { furnType = e.target.value; setTool('furn'); };
$('zFit').onclick = fit; $('bUndo').onclick = undo;
$('file').onchange = (e) => { onFile(e.target.files[0]); e.target.value = ''; };
$('pname').onchange = (e) => { P.name = e.target.value.trim() || 'Adsız proje'; mark(); };

// ---------- proje islemleri ----------
function loadProject(data, id) { if (tour) togglePreview(); P = { ...blank(), ...JSON.parse(JSON.stringify(data)) }; pid = id; hist = []; sel = null; dirty = false; $('bSave').classList.remove('hot'); $('pname').value = P.name; setTool('select'); restoreImage().then(fit); fit(); }
async function save() {
  if (!pid) pid = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try { await store.put(pid, { name: P.name, updated: new Date().toISOString(), json: JSON.stringify(P) }); dirty = false; $('bSave').classList.remove('hot'); status('Kaydedildi: ' + P.name); } catch (e) { status('Kaydedilemedi: ' + (e?.message || e?.code || 'bilinmeyen hata'), true); }
}
$('bSave').onclick = save;
async function openList() {
  const m = $('modal'), body = $('mbody'); m.classList.add('on'); body.innerHTML = '<p class="muted">Yükleniyor…</p>'; let rows = [];
  try { rows = await Promise.race([store.list(), new Promise((_, rj) => setTimeout(() => rj(new Error('zaman aşımı')), 10000))]); } catch (e) { body.innerHTML = '<p class="muted">Projelere şu an ulaşılamıyor. Biraz sonra tekrar deneyin.</p>'; return; }
  rows.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  body.innerHTML = (rows.length ? rows.map(r => `<div class="row"><button type="button" class="open" data-id="${esc(r.id)}"><b>${esc(r.name || 'Adsız')}</b><span>${esc((r.updated || '').slice(0, 16).replace('T', ' '))}</span></button><button type="button" class="danger rm" data-id="${esc(r.id)}">Sil</button></div>`).join('') : '<p class="muted">Henüz kayıtlı proje yok.</p>');
  body.querySelectorAll('.open').forEach(b => b.onclick = async () => { const d = await store.get(b.dataset.id); if (!d) return status('Proje bulunamadı.', true); m.classList.remove('on'); loadProject(JSON.parse(d.json), b.dataset.id); status('Açıldı: ' + d.name); });
  body.querySelectorAll('.rm').forEach(b => b.onclick = async () => { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Emin misiniz?'; return; } await store.del(b.dataset.id); if (pid === b.dataset.id) pid = null; openList(); });
}
$('bProjects').onclick = openList; $('mClose').onclick = () => $('modal').classList.remove('on');
$('bNew').onclick = () => { $('modal').classList.remove('on'); loadProject(blank(), null); status('Yeni proje. Plan görselini yükleyerek başlayın.'); };
$('bDemo').onclick = () => { $('modal').classList.remove('on'); loadProject(demo, null); status('Örnek proje açıldı. Kaydederseniz kendi kopyanız olur.'); };
$('eDemo').onclick = $('bDemo').onclick;
$('bAuto').onclick = () => { loadProject(blank(), null); status('Plan ve oda görsellerini seçip dönüştürün.'); };

// ---------- otomatik donusum ----------
let autoCtl = null;
const busy = (msg) => { $('busy').classList.toggle('on', !!msg); if (msg) $('busyMsg').textContent = msg; };
function applyAnalysis(A) {
  const res = buildFromAnalysis(A, P.size); push(); Object.assign(P, res.project); sel = null; mark(); props(); draw();
  const s = res.stats; status(`${s.rooms} oda, ${s.doors} kapı, ${s.windows} pencere, ${s.furniture} mobilya kuruldu (plan genişliği ≈ ${s.widthM} m).` + (res.notes.length ? ' Not: ' + res.notes.join(' ') : ''), false); return res;
}
const AUTO_ERR = { not_granted: 'Claude kullanımı için izin verilmedi; otomatik dönüştürme bu oturumda kapalı.', sampling_disabled: 'Bu hesapta Claude çağrısı kullanılamıyor.', rate_limited: 'Kullanım sınırına takıldı. Biraz bekleyip tekrar deneyin.', session_expired: 'Oturum süresi dolmuş; yeniden giriş yapıp tekrar deneyin.', image_rejected: 'Görsellerden biri kabul edilmedi. PNG veya JPG, daha küçük bir dosya deneyin.', images_unavailable: 'Bu görünümde Claude’a görsel gönderilemiyor.', refused: 'Claude bu görseli işlemeyi reddetti.', invalid_json: 'Plan okunamadı (yanıt çözümlenemedi). Tekrar deneyin.', cancelled: 'Dönüştürme durduruldu.', empty_completion: 'Claude yanıt üretmedi. Tekrar deneyin.' };
async function runAuto() {
  const planFile = $('aPlan').files[0], photos = [...$('aPhotos').files]; if (!planFile) return status('Önce kat planı görselini seçin.', true);
  if (!capsReady) return status('Sayfa hâlâ hazırlanıyor, birkaç saniye sonra tekrar deneyin.', true);
  if (!sample) return status('Otomatik dönüştürme bu görünümde kullanılamıyor. Sayfayı claude.ai içinde açın.', true);
  busy('Plan yükleniyor…'); loadProject(blank(), null); P.name = planFile.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Yeni proje'; $('pname').value = P.name;
  try {
    await onFile(planFile); if (!img) { busy(''); return; }
    const lim = await sample.limits().catch(() => null); if (!lim?.images) { busy(''); return status(AUTO_ERR.images_unavailable, true); }
    const use = photos.slice(0, Math.max(0, Math.min(6, (lim.images.maxCount || 1) - 1)));
    const planBlob = await new Promise(r => rulerCanvas(img, P.size[0], P.size[1]).toBlob(r, 'image/jpeg', 0.9));
    busy(`Claude planı okuyor${use.length ? ' ve ' + use.length + ' oda görseline bakıyor' : ''}… Bu bir iki dakika sürebilir.`); autoCtl = new AbortController();
    const A = await sample.json(buildPrompt(use.length), { images: [planBlob, ...use], modelTier: 'complex', signal: autoCtl.signal, onText: ({ text }) => { $('busyMsg').textContent = 'Plan çözümleniyor… ' + text.length + ' karakter yazıldı.'; } });
    busy('3D sahne kuruluyor…'); applyAnalysis(A); await save(); busy(''); if (!tour) togglePreview();
  } catch (e) { busy(''); status(AUTO_ERR[e?.code] || ('Dönüştürülemedi: ' + (e?.message || e?.code || 'bilinmeyen hata')), true); }
  finally { autoCtl = null; }
}
$('aGo').onclick = runAuto; $('busyStop').onclick = () => autoCtl?.abort();
$('aPlan').onchange = () => { $('aPlanN').textContent = $('aPlan').files[0]?.name || 'Seçilmedi'; };
$('aPhotos').onchange = () => { const n = $('aPhotos').files.length; $('aPhotosN').textContent = n ? n + ' görsel seçildi' : 'Seçilmedi'; };

// ---------- 3D onizleme ----------
function togglePreview() {
  const host = $('tour'), b = $('bPreview');
  if (tour) { tour.dispose(); tour = null; window.__tour = null; host.style.display = 'none'; document.body.classList.remove('preview'); b.textContent = '3D önizleme'; b.setAttribute('aria-pressed', 'false'); draw(); return; }
  if (!P.rooms.length) return status('3D için en az bir oda çizin: Oda aracıyla odanın üstüne dikdörtgen çekin.', true);
  host.style.display = 'block'; document.body.classList.add('preview');
  try { tour = createTour(host, P, { noHint: true }); window.__tour = tour; b.textContent = 'Plana dön'; b.setAttribute('aria-pressed', 'true'); } catch (e) { host.style.display = 'none'; document.body.classList.remove('preview'); status('3D görünüm açılamadı: ' + (e?.message || e), true); }
}
$('bPreview').onclick = togglePreview;

// ---------- musteri dosyasi ----------
function tourHtml() {
  const data = JSON.stringify({ ...P, imageId: undefined }).replace(/</g, '\\u003c').replace(new RegExp('[\\u2028\\u2029]', 'g'), '');
  return `<!DOCTYPE html>\n<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(P.name)}</title><link rel="icon" href="data:,"><link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&display=swap" rel="stylesheet"><style>html,body{height:100%;margin:0;background:#16171a}#app{position:fixed;inset:0}</style></head><body><div id="app"></div><script>window.__PROJECT__=${data}</` + `script><script type="module">${viewerJs.replace(/<\/script/gi, '<\\/script')}</` + `script></body></html>`;
}
$('bExport').onclick = async () => {
  if (!P.rooms.length) return status('Önce en az bir oda çizin.', true); if (!downloads) return status(capsReady ? 'Bu görünümde dosya indirme kullanılamıyor. Projeyi kaydedin; turu Claude’dan yayınlamasını isteyebilirsiniz.' : 'Sayfa hâlâ hazırlanıyor, birkaç saniye sonra tekrar deneyin.', true);
  const fn = (P.name || 'tur').toLowerCase().replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tur';
  try { await downloads.save({ filename: fn + '-3d-tur.html', data: new Blob([tourHtml()], { type: 'text/html' }) }); status('Müşteri dosyası indirildi. Herhangi bir web sunucusuna yükleyip linkini paylaşabilirsiniz.'); } catch (e) { status(e?.code === 'declined' ? 'İndirme iptal edildi.' : 'İndirilemedi: ' + (e?.code || e?.message || 'hata'), e?.code !== 'declined'); }
};
addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
window.__studio = { get P() { return P; }, applyAnalysis, buildPrompt, loadProject, togglePreview, tourHtml, setTool, demo, detectWalls, get tour() { return tour; } };
setTool('select'); fit(); props(); document.body.classList.add('ready');
