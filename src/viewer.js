import { createTour } from './engine.js';
const P = window.__PROJECT__, root = document.getElementById('app');
try { const start = decodeURIComponent((location.hash || '').slice(1)); window.__tour = createTour(root, P, { start }); document.body.classList.add('ready'); }
catch (e) { root.innerHTML = '<p style="padding:24px;color:#b9b4aa;font:16px system-ui">Bu tarayıcıda 3D görünüm açılamadı. WebGL destekleyen güncel bir tarayıcıyla tekrar deneyin.</p>'; console.error(e); }
