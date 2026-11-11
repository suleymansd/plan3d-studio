// Otomatik donusum: Claude plan gorselini okur (oda dikdortgenleri, gecisler, pencereler, mobilya),
// bu dosya o yaklasik okumayi temiz, yurunebilir bir projeye cevirir (duvarlar odalardan turetilir).
import { FLOORS, COLORS, FURN } from './engine.js';

const SIDES = { top: 0, right: 90, bottom: 180, left: 270 };
const HUG = new Set(['sofa', 'bed', 'bunk', 'wardrobe', 'console', 'tvunit', 'counter', 'vanity', 'toilet', 'desk', 'fridge', 'rail', 'nightstand', 'bathtub', 'shower']);
const AUTO_TYPES = Object.keys(FURN).filter(k => k !== 'art');

export function buildPrompt(nPhotos) {
  return `You are reading an architectural floor plan so that software can rebuild it as a walkable 3D model. Reply with ONLY one JSON object, no prose.

IMAGE 1 is the floor plan. It has ruler margins and a faint grid drawn over it: x runs 0 (left edge of the plan) to 1000 (right edge), y runs 0 (top edge) to 1000 (bottom edge), with a labelled grid line every 100 units. Give every coordinate in these units, read off the rulers as precisely as you can.
${nPhotos ? `IMAGES 2-${nPhotos + 1} are photos or renders of rooms of this home. Use them only to choose floor materials, wall colour and furniture colours.` : 'There are no room photos; choose materials from what the plan shows.'}

JSON shape:
{
 "planWidthMeters": number,   // real-world width covered by x=0..1000. Use written dimensions if the plan has them; otherwise estimate from doors (about 0.9 m wide) and double beds (about 1.6-1.8 m wide).
 "wallColor": "#rrggbb",      // light interior wall paint colour
 "rooms": [ { "name": string, "floor": FLOOR, "rects": [[x1,y1,x2,y2], ...] } ],
 "openings": [ { "a": roomName, "b": roomName, "x": number, "y": number, "kind": "door" | "open" } ],
 "entry": { "room": roomName, "x": number, "y": number },
 "windows": [ { "room": roomName, "side": "top"|"right"|"bottom"|"left", "from": number, "to": number, "kind": "full"|"normal"|"small" } ],
 "furniture": [ { "t": TYPE, "room": roomName, "rect": [x1,y1,x2,y2], "back": "top"|"right"|"bottom"|"left", "c": COLOR or null } ]
}

Rules:
- rooms: every walkable space, including corridors, halls, dressing areas, balconies that are part of the home. "rects" is the clear floor area INSIDE the walls. Use one rectangle per room; use two or three only for L-shaped rooms. Rooms must not overlap. Rooms separated by a wall should leave that wall's thickness between their rectangles. Name rooms as labelled on the plan (keep the plan's language); if unlabelled, name them by function in Turkish.
- openings: one entry for every doorway or open passage between two rooms; x,y is the centre of the opening on the wall between them. Use "open" for a wide passage without a door. Every room must be reachable from the entry room through openings.
- entry: the home's main entrance door, on an outside wall.
- windows: only on outside walls. "side" is which wall of that room; "from"/"to" are x coordinates for top/bottom walls and y coordinates for left/right walls. "full" = floor-to-ceiling glazing, "normal" = ordinary window, "small" = high small window (bathrooms).
- furniture: every piece drawn on the plan that matches a TYPE; skip what does not match. "rect" is its footprint. "back" is the side that stands against the wall (headboard side for beds, the side away from the seat front for sofas and chairs, wall side for cabinets, counters, TV units, vanities, toilets).
- FLOOR is one of: ${Object.keys(FLOORS).join(', ')}.
- TYPE is one of: ${AUTO_TYPES.map(k => `${k} (${FURN[k].n})`).join(', ')}.
- COLOR is one of: ${Object.keys(COLORS).join(', ')}.`;
}

// plan gorselini cetvelli ve izgarali olarak hazirla (Claude koordinat okuyabilsin)
export function rulerCanvas(img, W, H) {
  const sc = Math.min(1, 1400 / Math.max(W, H)), w = Math.round(W * sc), h = Math.round(H * sc), m = 34, c = document.createElement('canvas'); c.width = w + m; c.height = h + m;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, m, m, w, h);
  x.font = 'bold 13px sans-serif'; x.textBaseline = 'middle';
  for (let i = 0; i <= 10; i++) {
    const px = m + w * i / 10, py = m + h * i / 10; x.strokeStyle = 'rgba(255,0,200,0.45)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, m); x.lineTo(px, m + h); x.moveTo(m, py); x.lineTo(m + w, py); x.stroke();
    x.fillStyle = '#c0007a'; x.textAlign = i === 0 ? 'left' : i === 10 ? 'right' : 'center'; x.fillText(String(i * 100), Math.min(c.width - 2, Math.max(m, px)), m / 2); x.textAlign = 'right'; x.fillText(String(i * 100), m - 3, Math.min(c.height - 8, Math.max(m + 7, py)));
  }
  return c;
}

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
function largestRects(g, gw, gh, minA) {
  const hts = new Int32Array(gw), out = [], st = [];
  for (let it = 0; it < 400; it++) {
    hts.fill(0); let best = [0, 0, 0, 0, 0];
    for (let y = 0; y < gh; y++) { for (let x = 0; x < gw; x++) hts[x] = g[y * gw + x] ? hts[x] + 1 : 0; st.length = 0; for (let x = 0; x <= gw; x++) { const cur = x < gw ? hts[x] : 0; let start = x; while (st.length && st[st.length - 1][1] >= cur) { const [sx, sh] = st.pop(), ar = sh * (x - sx); if (ar > best[0]) best = [ar, sx, y - sh + 1, x - sx, sh]; start = sx; } st.push([start, cur]); } }
    const [ar, x, y, w, h] = best; if (ar < minA) break; for (let j = y; j < y + h; j++) g.fill(0, j * gw + x, j * gw + x + w); out.push([x, y, w, h]);
  }
  return out;
}

export function buildFromAnalysis(A, size) {
  const [W, H] = size, notes = [], X = (v) => num(v) / 1000 * W, Y = (v) => num(v) / 1000 * H;
  const widthM = Math.min(80, Math.max(3, num(A?.planWidthMeters, 12))), S = W / widthM, t = 0.16 * S, tol = Math.max(0.3 * S, 0.012 * W);
  // 1) odalar
  let R = [];
  for (const rm of Array.isArray(A?.rooms) ? A.rooms : []) { const name = String(rm?.name || 'Oda').trim().slice(0, 40) || 'Oda', floor = FLOORS[rm?.floor] ? rm.floor : 'oak'; for (const q of Array.isArray(rm?.rects) ? rm.rects : []) { if (!Array.isArray(q) || q.length < 4) continue; const x1 = Math.min(X(q[0]), X(q[2])), x2 = Math.max(X(q[0]), X(q[2])), y1 = Math.min(Y(q[1]), Y(q[3])), y2 = Math.max(Y(q[1]), Y(q[3])); if (x2 - x1 > 0.5 * S && y2 - y1 > 0.5 * S) R.push({ name, floor, x1, y1, x2, y2 }); } }
  if (!R.length) throw new Error('Planda oda bulunamadı.');
  // 2) kenarlari hizala: yakin kenarlar ortak bir duvar cizgisine oturur
  for (const [lo, hi] of [['x1', 'x2'], ['y1', 'y2']]) {
    const es = []; R.forEach((r) => { es.push({ r, k: lo, v: r[lo] }); es.push({ r, k: hi, v: r[hi] }); }); es.sort((a, b) => a.v - b.v);
    let cl = [];
    const flush = () => { if (!cl.length) return; const c = cl.reduce((s, e) => s + e.v, 0) / cl.length, both = cl.some(e => e.k === lo) && cl.some(e => e.k === hi); for (const e of cl) e.r[e.k] = both ? (e.k === hi ? c - t / 2 : c + t / 2) : c; cl = []; };
    for (const e of es) { if (cl.length && e.v - cl[0].v > tol) flush(); cl.push(e); } flush();
  }
  R = R.filter(r => r.x2 - r.x1 > 0.4 * S && r.y2 - r.y1 > 0.4 * S);
  const ovl = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1);
  // ayni odanin parcalari birbirine degsin (arada duvar olusmasin)
  for (const a of R) for (const b of R) { if (a === b || a.name !== b.name) continue; if (ovl(a.y1, a.y2, b.y1, b.y2) > 0.2 * S && b.x1 - a.x2 > -t && b.x1 - a.x2 <= 2.2 * t) b.x1 = a.x2; if (ovl(a.x1, a.x2, b.x1, b.x2) > 0.2 * S && b.y1 - a.y2 > -t && b.y1 - a.y2 <= 2.2 * t) b.y1 = a.y2; }
  // farkli odalar ust uste binmesin
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (a.name === b.name) continue; const ox = ovl(a.x1, a.x2, b.x1, b.x2), oy = ovl(a.y1, a.y2, b.y1, b.y2); if (ox > 0 && oy > 0) { if (ox < oy) { const [l, r] = a.x1 < b.x1 ? [a, b] : [b, a], mid = (l.x2 + r.x1) / 2; l.x2 = mid - t / 2; r.x1 = mid + t / 2; } else { const [u, d] = a.y1 < b.y1 ? [a, b] : [b, a], mid = (u.y2 + d.y1) / 2; u.y2 = mid - t / 2; d.y1 = mid + t / 2; } } }
  R = R.filter(r => r.x2 - r.x1 > 0.4 * S && r.y2 - r.y1 > 0.4 * S);
  const named = (n) => R.filter(r => r.name === String(n || '').trim());
  // komsuluk: iki dikdortgen arasindaki ortak duvar parcasi
  function shared(a, b) {
    const gmax = 2.6 * t, oy = [Math.max(a.y1, b.y1), Math.min(a.y2, b.y2)], ox = [Math.max(a.x1, b.x1), Math.min(a.x2, b.x2)];
    if (oy[1] - oy[0] > 0.5 * S) { if (b.x1 - a.x2 >= -1 && b.x1 - a.x2 <= gmax) return { vert: true, g0: a.x2, g1: b.x1, s0: oy[0], s1: oy[1] }; if (a.x1 - b.x2 >= -1 && a.x1 - b.x2 <= gmax) return { vert: true, g0: b.x2, g1: a.x1, s0: oy[0], s1: oy[1] }; }
    if (ox[1] - ox[0] > 0.5 * S) { if (b.y1 - a.y2 >= -1 && b.y1 - a.y2 <= gmax) return { vert: false, g0: a.y2, g1: b.y1, s0: ox[0], s1: ox[1] }; if (a.y1 - b.y2 >= -1 && a.y1 - b.y2 <= gmax) return { vert: false, g0: b.y2, g1: a.y1, s0: ox[0], s1: ox[1] }; }
    return null;
  }
  const doors = [], links = [], furniture = [];
  const hitR = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
  const zone = (r, vert) => (vert ? [r[0] - 0.45 * S, r[1], r[2] + 0.9 * S, r[3]] : [r[0], r[1] - 0.45 * S, r[2], r[3] + 0.9 * S]);
  const blocked = (z) => furniture.some(f => FURN[f.t].solid !== false && hitR(f.r, z));
  function addDoor(sh, at, open, an, bn, avoid) {
    const L = sh.s1 - sh.s0; let mg = 0.08 * S; if (L - 2 * mg < 0.6 * S) mg = 0.02 * S;
    const w = open ? Math.max(0.6 * S, L - 2 * mg) : Math.min(0.9 * S, L - 2 * mg); if (w < 0.5 * S) return false;
    const lo = sh.s0 + mg + w / 2, hi = Math.max(lo, sh.s1 - mg - w / 2), g0 = sh.g0 - 1, gl = Math.max(2, sh.g1 - sh.g0 + 2), mk = (c) => (sh.vert ? [g0, c - w / 2, gl, w] : [c - w / 2, g0, w, gl]);
    let c = Math.min(hi, Math.max(lo, at ?? (lo + hi) / 2));
    if (avoid && blocked(zone(mk(c), sh.vert))) { search: for (let i = 0; i <= 24; i++) for (const sg of [1, -1]) { const cc = (lo + hi) / 2 + sg * i * (hi - lo) / 48; if (!blocked(zone(mk(cc), sh.vert))) { c = cc; break search; } } }
    doors.push({ r: mk(c), head: open ? 2.4 : 2.15, vert: sh.vert, open }); links.push([an, bn]); return true;
  }
  // 3) gecisler
  for (const o of Array.isArray(A?.openings) ? A.openings : []) {
    const as = named(o?.a), bs = named(o?.b); if (!as.length || !bs.length || as[0].name === bs[0].name) continue; const px = X(o.x), py = Y(o.y); let best = null, bd = 1e12;
    for (const a of as) for (const b of bs) { const sh = shared(a, b); if (!sh) continue; const along = sh.vert ? py : px, across = sh.vert ? px : py, d = Math.max(0, sh.s0 - along, along - sh.s1) + Math.abs(across - (sh.g0 + sh.g1) / 2); if (d < bd) { bd = d; best = sh; } }
    if (best) addDoor(best, best.vert ? py : px, o.kind === 'open', as[0].name, bs[0].name); else notes.push(`${o.a} – ${o.b} geçişi yerleştirilemedi (odalar komşu görünmüyor).`);
  }
  // 8) mobilya
  for (const f of (Array.isArray(A?.furniture) ? A.furniture : []).slice(0, 160)) {
    if (!FURN[f?.t] || f.t === 'art' || !Array.isArray(f.rect) || f.rect.length < 4) continue; let x1 = Math.min(X(f.rect[0]), X(f.rect[2])), x2 = Math.max(X(f.rect[0]), X(f.rect[2])), y1 = Math.min(Y(f.rect[1]), Y(f.rect[3])), y2 = Math.max(Y(f.rect[1]), Y(f.rect[3]));
    if (x2 - x1 < 0.12 * S || y2 - y1 < 0.12 * S) continue; const cxp = (x1 + x2) / 2, cyp = (y1 + y2) / 2; let room = R.find(r => cxp > r.x1 && cxp < r.x2 && cyp > r.y1 && cyp < r.y2); if (!room) { let bd = 1e12; for (const r of named(f.room).length ? named(f.room) : R) { const d = Math.hypot(Math.max(r.x1 - cxp, 0, cxp - r.x2), Math.max(r.y1 - cyp, 0, cyp - r.y2)); if (d < bd) { bd = d; room = r; } } if (bd > 0.8 * S) continue; }
    let w = Math.min(x2 - x1, room.x2 - room.x1), h = Math.min(y2 - y1, room.y2 - room.y1); x1 = Math.min(room.x2 - w, Math.max(room.x1, x1)); y1 = Math.min(room.y2 - h, Math.max(room.y1, y1));
    const back = SIDES[f.back] !== undefined ? f.back : 'top', sn = 0.4 * S; if (HUG.has(f.t)) { if (back === 'top' && y1 - room.y1 < sn) y1 = room.y1; if (back === 'bottom' && room.y2 - (y1 + h) < sn) y1 = room.y2 - h; if (back === 'left' && x1 - room.x1 < sn) x1 = room.x1; if (back === 'right' && room.x2 - (x1 + w) < sn) x1 = room.x2 - w; }
    furniture.push({ t: f.t, r: [x1, y1, w, h].map(v => Math.round(v * 10) / 10), rot: SIDES[back], ...(COLORS[f.c] ? { c: f.c } : {}) });
  }
  { const n0 = furniture.length; for (const d of doors) { if (d.open) continue; const z = zone(d.r, d.vert); for (let i = furniture.length - 1; i >= 0; i--) if (FURN[furniture[i].t].solid !== false && hitR(furniture[i].r, z)) furniture.splice(i, 1); } if (furniture.length < n0) notes.push(`${n0 - furniture.length} mobilya kapı önünde kaldığı için çıkarıldı.`); }
  // 4) erisilebilirlik: kopuk oda kalmasin
  const names = [...new Set(R.map(r => r.name))], entryRoom = named(A?.entry?.room)[0]?.name, start = entryRoom || R.reduce((a, b) => ((a.x2 - a.x1) * (a.y2 - a.y1) >= (b.x2 - b.x1) * (b.y2 - b.y1) ? a : b)).name;
  const reach = () => { const seen = new Set([start]); let ch = true; while (ch) { ch = false; for (const [a, b] of links) { if (seen.has(a) && !seen.has(b)) { seen.add(b); ch = true; } if (seen.has(b) && !seen.has(a)) { seen.add(a); ch = true; } } } return seen; };
  for (let guard = 0; guard < names.length; guard++) { const seen = reach(); if (seen.size === names.length) break; let best = null, bl = 0; for (const a of R) for (const b of R) { if (!seen.has(a.name) || seen.has(b.name)) continue; const sh = shared(a, b); if (sh && sh.s1 - sh.s0 > bl) { bl = sh.s1 - sh.s0; best = [sh, a.name, b.name]; } } if (!best || !addDoor(best[0], null, false, best[1], best[2], true)) break; notes.push(`${best[2]} için plandan okunamayan bir kapı eklendi (${best[1]} tarafına).`); }
  { const seen = reach(); for (const n of names) if (!seen.has(n)) notes.push(`${n} odasına geçiş bulunamadı; düzenleyicide kapı ekleyin.`); }
  // dis duvar mi? (kenarin hemen disinda baska oda yoksa)
  const inAny = (x, y) => R.some(r => x > r.x1 && x < r.x2 && y > r.y1 && y < r.y2);
  const sideRect = (r, side, a, b) => side === 'top' ? [a, r.y1 - t, b - a, t] : side === 'bottom' ? [a, r.y2, b - a, t] : side === 'left' ? [r.x1 - t, a, t, b - a] : [r.x2, a, t, b - a];
  const outside = (r, side, a, b) => { for (let i = 1; i <= 5; i++) { const p = a + (b - a) * i / 6, d = 2.2 * t; const [x, y] = side === 'top' ? [p, r.y1 - d] : side === 'bottom' ? [p, r.y2 + d] : side === 'left' ? [r.x1 - d, p] : [r.x2 + d, p]; if (inAny(x, y)) return false; } return true; };
  // 5) pencereler
  const windows = [];
  for (const w of Array.isArray(A?.windows) ? A.windows : []) {
    const side = SIDES[w?.side] !== undefined ? w.side : null, rs = named(w?.room); if (!side || !rs.length) continue; const horiz = side === 'top' || side === 'bottom', f = horiz ? X(Math.min(w.from, w.to)) : Y(Math.min(w.from, w.to)), g = horiz ? X(Math.max(w.from, w.to)) : Y(Math.max(w.from, w.to));
    let best = null, bo = 0; for (const r of rs) { const lo = horiz ? r.x1 : r.y1, hi = horiz ? r.x2 : r.y2, o = ovl(lo, hi, f, g); if (o > bo) { bo = o; best = r; } } if (!best) continue;
    const lo = (horiz ? best.x1 : best.y1) + 0.1 * S, hi = (horiz ? best.x2 : best.y2) - 0.1 * S, a = Math.max(lo, f), b = Math.min(hi, g); if (b - a < 0.4 * S || !outside(best, side, a, b)) continue;
    const kind = w.kind === 'small' || w.kind === 'normal' ? w.kind : 'full', wet = /banyo|wc|duş|dus|lavabo|bath|toilet/i.test(best.name);
    windows.push({ r: sideRect(best, side, a, b), ...(kind === 'full' ? { sill: 0.25, head: 2.5 } : kind === 'normal' ? { sill: 0.9, head: 2.3 } : { sill: 1.5, head: 2.3 }), ...(wet ? { frosted: true } : {}) });
  }
  // 6) daire girisi
  if (entryRoom) { const px = X(A.entry.x), py = Y(A.entry.y); let best = null, bd = 1e12; for (const r of named(entryRoom)) for (const side of ['top', 'right', 'bottom', 'left']) { const horiz = side === 'top' || side === 'bottom', lo = horiz ? r.x1 : r.y1, hi = horiz ? r.x2 : r.y2, w = Math.min(0.95 * S, hi - lo - 0.2 * S); if (w < 0.6 * S) continue; const c = Math.min(hi - 0.1 * S - w / 2, Math.max(lo + 0.1 * S + w / 2, horiz ? px : py)); if (!outside(r, side, c - w / 2, c + w / 2)) continue; const edge = side === 'top' ? r.y1 : side === 'bottom' ? r.y2 : side === 'left' ? r.x1 : r.x2, d = Math.abs((horiz ? py : px) - edge) + Math.abs((horiz ? px : py) - c); if (d < bd) { bd = d; best = { r: sideRect(r, side, c - w / 2, c + w / 2), head: 2.15, closed: true }; } } if (best && !windows.some(w => ovl(w.r[0], w.r[0] + w.r[2], best.r[0], best.r[0] + best.r[2]) > 0 && ovl(w.r[1], w.r[1] + w.r[3], best.r[1], best.r[1] + best.r[3]) > 0)) doors.push(best); }
  // 7) duvarlar: odalarin duvar kalinligi kadar genisletilmis hali eksi odalar, kapilar, pencereler
  const C = Math.max(1, Math.round(t / 4)), offX = Math.ceil((t + 2) / C), offY = offX, gw = Math.ceil(W / C) + 2 * offX, gh = Math.ceil(H / C) + 2 * offY, g = new Uint8Array(gw * gh);
  const paint = (x, y, w, h, v) => { const x0 = Math.max(0, Math.round(x / C) + offX), x1 = Math.min(gw, Math.round((x + w) / C) + offX), y0 = Math.max(0, Math.round(y / C) + offY), y1 = Math.min(gh, Math.round((y + h) / C) + offY); for (let j = y0; j < y1; j++) if (x1 > x0) g.fill(v, j * gw + x0, j * gw + x1); };
  for (const r of R) paint(r.x1 - t, r.y1 - t, r.x2 - r.x1 + 2 * t, r.y2 - r.y1 + 2 * t, 1);
  for (const r of R) paint(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1, 0);
  for (const d of [...doors, ...windows]) paint(d.r[0], d.r[1], d.r[2], d.r[3], 0);
  const walls = largestRects(g, gw, gh, 2).map(([x, y, w, h]) => [(x - offX) * C, (y - offY) * C, w * C, h * C]);
  { // yurunebilirlik denetimi (kaba izgara): her odaya baslangictan ulasilabiliyor mu?
    const c = Math.max(2, 0.1 * S), cw = Math.ceil(W / c) + 2, chh = Math.ceil(H / c) + 2, free = new Uint8Array(cw * chh), put = (r, v) => { const x0 = Math.max(0, Math.floor(r[0] / c)), x1 = Math.min(cw, Math.ceil((r[0] + r[2]) / c)), y0 = Math.max(0, Math.floor(r[1] / c)), y1 = Math.min(chh, Math.ceil((r[1] + r[3]) / c)); for (let j = y0; j < y1; j++) if (x1 > x0) free.fill(v, j * cw + x0, j * cw + x1); };
    for (const r of R) put([r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1], 1);
    for (const d of doors) if (!d.closed) put(d.vert ? [d.r[0] - 2 * c, d.r[1], d.r[2] + 4 * c, d.r[3]] : [d.r[0], d.r[1] - 2 * c, d.r[2], d.r[3] + 4 * c], 1);
    for (const f of furniture) if (FURN[f.t].solid !== false) put(f.r, 0);
    for (let k = 0; k < 2; k++) { const src = free.slice(); for (let j = 1; j < chh - 1; j++) for (let i = 1; i < cw - 1; i++) { const n = j * cw + i; if (src[n] && !(src[n - 1] && src[n + 1] && src[n - cw] && src[n + cw])) free[n] = 0; } }
    const seen = new Uint8Array(cw * chh), q = [], sr = R.filter(r => r.name === start); for (const r of sr) for (let y = r.y1; y < r.y2; y += c) for (let x = r.x1; x < r.x2; x += c) { const i = Math.floor(y / c) * cw + Math.floor(x / c); if (free[i] && !seen[i]) { seen[i] = 1; q.push(i); } if (q.length) break; }
    while (q.length) { const i = q.pop(); for (const n of [i - 1, i + 1, i - cw, i + cw]) if (n >= 0 && n < free.length && free[n] && !seen[n]) { seen[n] = 1; q.push(n); } }
    for (const n of names) { let ok = false; for (const r of R.filter(r => r.name === n)) for (let y = r.y1; y < r.y2 && !ok; y += c) for (let x = r.x1; x < r.x2; x += c) if (seen[Math.floor(y / c) * cw + Math.floor(x / c)]) { ok = true; break; } if (!ok) notes.push(`${n} bölümüne 3D'de ulaşılamıyor; düzenleyicide kapısını veya önündeki mobilyayı kontrol edin.`); }
  }
  const rd = (v) => Math.round(v * 10) / 10;
  return {
    project: { pxPerMeter: rd(S), wallHeight: 2.8, wallColor: /^#[0-9a-f]{6}$/i.test(A?.wallColor || '') ? A.wallColor : '#e6e0d6', start, walls, doors: doors.map(d => ({ r: d.r.map(rd), head: d.head, ...(d.closed ? { closed: true } : {}) })), windows: windows.map(w => ({ ...w, r: w.r.map(rd) })), rooms: R.map(r => ({ name: r.name, floor: r.floor, r: [r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1].map(rd) })), furniture },
    notes, stats: { rooms: names.length, doors: doors.length, windows: windows.length, furniture: furniture.length, widthM: rd(widthM) },
  };
}
