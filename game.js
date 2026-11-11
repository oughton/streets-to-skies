'use strict';
// From Streets to Skies — a single-player arrow-key game.
// Busk for £8 → bake bread to £80 → fix cars to £1,000 → fly 5 flights.

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const W = 960, H = 540;
const SAVE_KEY = 'streets-to-skies-save';

// ---------------------------------------------------------------- helpers
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = n => '£' + (n < 100
  ? n.toFixed(2)
  : Math.floor(n).toLocaleString('en-GB'));

function rrPath(p, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}
function rr(x, y, w, h, r) { ctx.beginPath(); rrPath(ctx, x, y, w, h, r); }
function circle(x, y, r, color) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (color) { ctx.fillStyle = color; ctx.fill(); }
}
function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function text(s, x, y, size = 20, color = '#fff', align = 'center', weight = 'bold') {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}
function outlined(s, x, y, size, color = '#fff', align = 'center') {
  ctx.font = `bold ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round';
  ctx.strokeText(s, x, y); ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function wrapLines(s, maxW, size, weight = 'normal') {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const words = s.split(' '), out = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { out.push(cur); cur = w; } else cur = test;
  }
  if (cur) out.push(cur);
  return out;
}
function mixColor(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const r = Math.round(lerp(a >> 16, b >> 16, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)),
    bl = Math.round(lerp(a & 255, b & 255, t));
  return `rgb(${r},${g},${bl})`;
}

// ---------------------------------------------------------------- input
const down = {}, hit = {};
const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'];
const ARROWS = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
const GLYPH = { ArrowLeft: '←', ArrowUp: '↑', ArrowRight: '→', ArrowDown: '↓' };
addEventListener('keydown', e => {
  if (GAME_KEYS.includes(e.key)) e.preventDefault();
  Sound.init();
  if (!down[e.key]) hit[e.key] = true;
  down[e.key] = true;
  if (e.key === 'm' || e.key === 'M') Sound.muted = !Sound.muted;
});
addEventListener('keyup', e => { down[e.key] = false; });
addEventListener('blur', () => { for (const k in down) down[k] = false; });
const anyArrowHit = () => ARROWS.find(k => hit[k]);
const confirmHit = () => hit.ArrowRight || hit.Enter || hit[' '];

// ---------------------------------------------------------------- sound
const Sound = {
  ac: null, muted: false,
  init() {
    if (!this.ac) {
      try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
    } else if (this.ac.state === 'suspended') this.ac.resume();
  },
  tone(f, d = 0.12, type = 'square', vol = 0.06, delay = 0) {
    if (!this.ac || this.muted) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.ac.destination); o.start(t); o.stop(t + d + 0.02);
  },
  note(k) { this.tone({ ArrowLeft: 262, ArrowUp: 330, ArrowRight: 392, ArrowDown: 440 }[k] || 300, 0.25, 'triangle', 0.1); },
  coin() { this.tone(988, 0.08, 'square', 0.05); this.tone(1319, 0.2, 'square', 0.05, 0.08); },
  bad() { this.tone(140, 0.25, 'sawtooth', 0.06); },
  good() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.08, i * 0.08)); },
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.09, i * 0.14)); },
  boom() { this.tone(80, 0.6, 'sawtooth', 0.12); this.tone(55, 0.8, 'square', 0.08, 0.05); },
};

// ---------------------------------------------------------------- game state
const G = { money: 0, flights: 0, stage: 'busk' };
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* ignore */ } }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.money === 'number' && JOBS[s.stage]) return s;
  } catch (e) { /* ignore */ }
  return null;
}
function resetGame() { G.money = 0; G.flights = 0; G.stage = 'busk'; save(); }

const floaters = [];
function floatText(txt, x, y, color = '#ffd166', size = 26) { floaters.push({ txt, x, y, color, size, t: 0 }); }
function earn(n, x, y) {
  G.money = Math.round((G.money + n) * 100) / 100;
  save();
  if (x !== undefined) floatText('+' + fmt(n), x, y);
}

const JOBS = {
  busk: { name: 'Busker', goal: 8, next: 'bakery' },
  bakery: { name: 'Baker', goal: 80, next: 'garage' },
  garage: { name: 'Mechanic', goal: 1000, next: 'airport' },
  airport: { name: 'Pilot', flights: 5 },
};

const INTROS = {
  busk: {
    title: 'Down on your luck',
    lines: [
      'You have no home, no job and no money. All you have is a battered old guitar and a hat.',
      'Busk for the people walking by. Collect £8 to clean yourself up and get a job.',
      { t: 'Play the arrows shown in each person\'s speech bubble before they walk away. A mistake restarts their tune.', c: '#ffd166' },
    ],
  },
  bakery: {
    title: 'Hired: The Bread Shop!',
    lines: [
      'With £8 you buy a clean shirt and a bus fare, and the local bakery takes you on.',
      'Bake and sell bread until you have £80.',
      { t: '← → walk between stations. ↑ use a station. ↓ bin what you are holding.', c: '#ffd166' },
      { t: 'Flour → Knead (tap ← → ← →) → Oven (take it out in the golden zone) → Counter.', c: '#ffd166' },
    ],
  },
  garage: {
    title: 'Hired: Mechanic!',
    lines: [
      'Your hard work pays off. A garage across town needs a mechanic.',
      'Change tyres and paint cars until you have £1,000. Faster work earns bigger tips.',
      { t: 'Tyres: press the arrow on each wheel nut, then ↑ to swap the tyre.', c: '#ffd166' },
      { t: 'Paint: steer the spray gun with the arrow keys and cover the whole car.', c: '#ffd166' },
    ],
  },
  airport: {
    title: 'Hired: Airline Pilot!',
    lines: [
      'With £1,000 you pay for flight school. Now an airline wants you in the cockpit.',
      'Complete 5 successful flights to win the game.',
      { t: 'Hold → to speed up the runway, then hold ↑ to take off. ↑ ↓ climb and descend, ← → change speed.', c: '#ffd166' },
      { t: 'Dodge birds and storms. Land gently on the destination runway.', c: '#ffd166' },
    ],
  },
};

// ---------------------------------------------------------------- scenes
let scene = null;
function setScene(s) { scene = s; }
const SCENES = {
  busk: () => BuskScene(),
  bakery: () => BakeryScene(),
  garage: () => GarageScene(),
  airport: () => FlightScene(),
};
function goStage(stage) {
  G.stage = stage; save();
  const info = INTROS[stage];
  setScene(CardScene(info.title, info.lines, () => setScene(SCENES[stage]()), { bg: BG[stage] }));
}

function CardScene(title, lines, onNext, opts = {}) {
  let t = 0;
  return {
    update(dt) {
      t += dt;
      if (t > 0.5 && confirmHit()) { Sound.tone(660, 0.1, 'triangle', 0.08); onNext(); }
    },
    draw() {
      (opts.bg || BG.busk)(t);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
      const pw = 720, px = (W - pw) / 2;
      const body = [];
      for (const l of lines) {
        const s = typeof l === 'string' ? l : l.t, c = typeof l === 'string' ? '#eee' : l.c;
        for (const ln of wrapLines(s, pw - 70, 21)) body.push({ ln, c });
        body.push(null);
      }
      const ph = 130 + body.length * 26, py = (H - ph) / 2;
      rr(px, py, pw, ph, 18); ctx.fillStyle = 'rgba(25,30,45,0.95)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = opts.border || '#ffd166'; ctx.stroke();
      text(title, W / 2, py + 42, 34, opts.border || '#ffd166');
      let y = py + 88;
      for (const b of body) {
        if (b) text(b.ln, px + 35, y, 21, b.c, 'left', 'normal');
        y += b ? 26 : 10;
      }
      if (t > 0.5) {
        const a = 0.6 + 0.4 * Math.sin(t * 5);
        text('Press → to continue', W / 2, py + ph - 26, 19, `rgba(255,255,255,${a})`);
      }
    },
  };
}

function TitleScene() {
  const saved = load();
  const opts = saved && (saved.money > 0 || saved.stage !== 'busk') ? ['Continue', 'New Game'] : ['New Game'];
  let sel = 0, t = 0;
  return {
    update(dt) {
      t += dt;
      if (hit.ArrowUp) { sel = (sel + opts.length - 1) % opts.length; Sound.tone(500, 0.06); }
      if (hit.ArrowDown) { sel = (sel + 1) % opts.length; Sound.tone(500, 0.06); }
      if (confirmHit()) {
        Sound.good();
        if (opts[sel] === 'Continue') { Object.assign(G, saved); goStage(G.stage); }
        else { resetGame(); goStage('busk'); }
      }
    },
    draw() {
      BG.title(t);
      outlined('From Streets to Skies', W / 2, 120, 64, '#ffd166');
      outlined('Busker → Baker → Mechanic → Pilot', W / 2, 180, 24, '#fff');
      opts.forEach((o, i) => {
        const y = 290 + i * 60, s = i === sel;
        rr(W / 2 - 140, y - 24, 280, 48, 12);
        ctx.fillStyle = s ? '#ffd166' : 'rgba(0,0,0,0.5)'; ctx.fill();
        text((s ? '▶ ' : '') + o, W / 2, y, 26, s ? '#222' : '#fff');
      });
      if (saved && opts[0] === 'Continue') text(`Saved: ${JOBS[saved.stage].name}, ${fmt(saved.money)}`, W / 2, 290 + opts.length * 60, 16, '#ddd', 'center', 'normal');
      outlined('↑ ↓ choose   ·   → start   ·   M mute', W / 2, 500, 18, '#ddd');
    },
  };
}

function WinScene() {
  let t = 0;
  const sparks = [];
  return {
    update(dt) {
      t += dt;
      if (Math.random() < dt * 2.5) {
        const x = rand(150, 810), y = rand(80, 260), c = pick(['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#fff']);
        for (let i = 0; i < 40; i++) { const a = rand(0, 6.28), s = rand(60, 220); sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.4, c }); }
        Sound.tone(rand(600, 1200), 0.2, 'triangle', 0.04);
      }
      for (const p of sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt; p.life -= dt; }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      if (t > 2 && confirmHit()) { resetGame(); setScene(TitleScene()); }
    },
    draw() {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#2a1a4a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (const p of sparks) { ctx.globalAlpha = clamp(p.life, 0, 1); circle(p.x, p.y, 3, p.c); }
      ctx.globalAlpha = 1;
      drawPlane(W / 2, 360 + Math.sin(t * 2) * 8, -0.05, '#fff', 1.6);
      outlined('You did it!', W / 2, 110, 64, '#ffd166');
      outlined('From sleeping rough to flying the skies.', W / 2, 175, 26, '#fff');
      outlined(`Captain's savings: ${fmt(G.money)}   ·   Flights: ${G.flights}/5`, W / 2, 470, 22, '#ddd');
      if (t > 2) outlined('Press → to play again', W / 2, 510, 20, `rgba(255,255,255,${0.6 + 0.4 * Math.sin(t * 5)})`);
    },
  };
}

// ---------------------------------------------------------------- HUD
function drawHUD() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, 44);
  text(fmt(G.money), 18, 23, 26, '#ffd166', 'left');
  text(JOBS[G.stage].name, W / 2, 23, 22, '#fff');
  const job = JOBS[G.stage];
  let frac, label;
  if (job.goal) { frac = clamp(G.money / job.goal, 0, 1); label = `Goal ${fmt(job.goal)}`; }
  else { frac = G.flights / job.flights; label = `Flights ${G.flights}/${job.flights}`; }
  rr(700, 12, 240, 22, 11); ctx.fillStyle = '#333'; ctx.fill();
  if (frac > 0) { rr(700, 12, Math.max(22, 240 * frac), 22, 11); ctx.fillStyle = '#06d6a0'; ctx.fill(); }
  text(label, 820, 23, 14, '#fff');
}
function drawMsg(msg, alpha = 1) {
  if (!msg || alpha <= 0) return;
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.font = 'bold 20px system-ui, sans-serif';
  const w = ctx.measureText(msg).width + 40;
  rr(W / 2 - w / 2, 112, w, 36, 18); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
  text(msg, W / 2, 130, 20, '#fff');
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- people
const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a5694f'];
const CLOTH = ['#e63946', '#457b9d', '#2a9d8f', '#f4a261', '#9b5de5', '#ef476f', '#118ab2', '#06d6a0', '#3d405b', '#f15bb5', '#264653'];
const HAIR = ['#2b1d0e', '#4a2c17', '#d4a017', '#111', '#7a3b12', '#999'];
function randomLook() {
  return {
    skin: pick(SKIN), shirt: pick(CLOTH), pants: pick(['#2b2d42', '#3d5a80', '#5c4033', '#222', '#6c757d']),
    hair: pick(HAIR), hat: pick(['none', 'none', 'none', 'cap', 'beanie', 'long']), bag: Math.random() < 0.3,
    scale: rand(0.92, 1.08),
  };
}
function drawPerson(x, y, o, opts = {}) {
  const s = (o.scale || 1) * (opts.scale || 1), dir = opts.facing || 1;
  const sw = opts.walking ? Math.sin((opts.walkT || 0) * 9) * 0.6 : 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(s * dir, s);
  ctx.lineCap = 'round';
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 4, 0, 0, 6.28); ctx.fill();
  // legs
  ctx.strokeStyle = o.pants; ctx.lineWidth = 9;
  line(0, -36, Math.sin(sw) * 16, -2); line(0, -36, -Math.sin(sw) * 16, -2);
  // back arm
  ctx.strokeStyle = o.shirt; ctx.lineWidth = 7;
  line(0, -66, -Math.sin(sw) * 14 - 2, -40);
  // body
  rr(-12, -74, 24, 42, 8); ctx.fillStyle = o.shirt; ctx.fill();
  if (opts.apron) { rr(-9, -64, 18, 34, 4); ctx.fillStyle = '#fff'; ctx.fill(); }
  if (opts.overalls) { rr(-12, -58, 24, 26, 4); ctx.fillStyle = '#1d4e89'; ctx.fill(); }
  if (o.bag) { rr(-20, -60, 10, 16, 3); ctx.fillStyle = '#6b4226'; ctx.fill(); }
  // front arm
  ctx.strokeStyle = o.shirt; ctx.lineWidth = 7;
  if (opts.holding) line(0, -66, 16, -54);
  else line(0, -66, Math.sin(sw) * 14 + 2, -40);
  // head
  circle(0, -86, 12, o.skin);
  circle(5, -88, 1.8, '#222');
  // hair / hat
  const hat = opts.hat || o.hat;
  ctx.fillStyle = o.hair;
  if (hat === 'long') { ctx.beginPath(); ctx.arc(0, -88, 13, Math.PI, 0); ctx.fill(); ctx.fillRect(-13, -88, 7, 18); }
  else if (hat !== 'chef' && hat !== 'pilot') { ctx.beginPath(); ctx.arc(0, -89, 12.5, Math.PI, 0); ctx.fill(); }
  if (hat === 'cap') { ctx.fillStyle = o.shirt; ctx.beginPath(); ctx.arc(0, -90, 13, Math.PI, 0); ctx.fill(); ctx.fillRect(4, -92, 14, 4); }
  if (hat === 'beanie') { ctx.fillStyle = '#c1121f'; ctx.beginPath(); ctx.arc(0, -90, 13.5, Math.PI, 0); ctx.fill(); circle(0, -104, 4, '#fff'); }
  if (hat === 'chef') { ctx.fillStyle = '#fff'; ctx.fillRect(-11, -104, 22, 12); circle(-7, -106, 8, '#fff'); circle(7, -106, 8, '#fff'); circle(0, -110, 9, '#fff'); }
  if (hat === 'pilot') { ctx.fillStyle = '#1b263b'; rr(-14, -104, 28, 10, 3); ctx.fill(); ctx.fillRect(2, -96, 16, 3); circle(0, -99, 3, '#ffd166'); }
  ctx.restore();
}

// ---------------------------------------------------------------- backgrounds
const BG = {
  title(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#ff9a5a'); g.addColorStop(0.6, '#5b3a8a'); g.addColorStop(1, '#1b1b3a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    circle(760, 380, 70, 'rgba(255,220,120,0.85)');
    ctx.fillStyle = '#1a1530';
    for (let i = 0; i < 16; i++) { const h = 90 + ((i * 53) % 140); ctx.fillRect(i * 62, 440 - h, 56, h + 100); }
    drawPlane(((t * 90) % (W + 300)) - 150, 240 - Math.sin(t) * 10, -0.08, '#fff', 0.8);
  },
  busk(t = 0) { drawStreet(t); },
  bakery() { drawBakeryRoom(); },
  garage() { drawGarageRoom(); },
  airport() { drawSky(0); },
};

function drawStreet() {
  const g = ctx.createLinearGradient(0, 0, 0, 360); g.addColorStop(0, '#f4a261'); g.addColorStop(1, '#e76f51');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 360);
  // far buildings
  ctx.fillStyle = '#7a4b5e';
  for (let i = 0; i < 12; i++) { const h = 150 + ((i * 71) % 120); ctx.fillRect(i * 85 - 10, 360 - h, 80, h); }
  // near buildings
  const cols = ['#5a3d55', '#6d4c63', '#4e3a4f'];
  for (let i = 0; i < 6; i++) {
    const x = i * 170 - 20, h = 230 + ((i * 37) % 60);
    ctx.fillStyle = cols[i % 3]; ctx.fillRect(x, 360 - h, 165, h);
    ctx.fillStyle = 'rgba(255,220,130,0.75)';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
      if (((i * 7 + r * 3 + c) % 5) !== 0) ctx.fillRect(x + 16 + c * 38, 360 - h + 20 + r * 48, 20, 28);
  }
  // shop front behind busker
  ctx.fillStyle = '#2b2d42'; ctx.fillRect(360, 240, 260, 120);
  ctx.fillStyle = '#8ecae6'; ctx.fillRect(375, 255, 230, 90);
  ctx.fillStyle = '#d62828'; ctx.fillRect(350, 225, 280, 22);
  text('CLOSED', 490, 236, 14, '#fff');
  // pavement
  ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 360, W, 140);
  ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 80) line(x, 360, x - 30, 500);
  line(0, 430, W, 430);
  ctx.fillStyle = '#666'; ctx.fillRect(0, 500, W, 8);
  ctx.fillStyle = '#333'; ctx.fillRect(0, 508, W, 32);
  ctx.fillStyle = '#ddd'; for (let x = 20; x < W; x += 120) ctx.fillRect(x, 522, 60, 4);
  // lamp post
  ctx.fillStyle = '#222'; ctx.fillRect(150, 200, 8, 260); ctx.fillRect(150, 200, 40, 6);
  circle(188, 214, 10, '#ffe8a3');
}

function drawBakeryRoom() {
  ctx.fillStyle = '#f6e3c5'; ctx.fillRect(0, 0, W, 450);
  ctx.fillStyle = '#e9cfa6'; for (let x = 0; x < W; x += 40) ctx.fillRect(x, 0, 20, 450);
  ctx.fillStyle = '#c9a27e'; ctx.fillRect(0, 300, W, 8);
  // shelf with loaves
  ctx.fillStyle = '#8b5e3c'; ctx.fillRect(40, 140, 260, 10); ctx.fillRect(40, 200, 260, 10);
  for (let i = 0; i < 6; i++) { drawLoaf(70 + i * 42, 130, '#d8953a', 0.8); drawLoaf(70 + i * 42, 190, '#c88a3a', 0.8); }
  // sign
  rr(360, 60, 240, 60, 10); ctx.fillStyle = '#8b5e3c'; ctx.fill();
  text('Daily Bread Co.', 480, 90, 26, '#fff3d6');
  // window
  ctx.fillStyle = '#8ecae6'; ctx.fillRect(660, 70, 250, 160);
  ctx.strokeStyle = '#8b5e3c'; ctx.lineWidth = 8; ctx.strokeRect(660, 70, 250, 160); line(785, 70, 785, 230);
  // floor
  ctx.fillStyle = '#b5835a'; ctx.fillRect(0, 450, W, 90);
  ctx.fillStyle = '#a0704b';
  for (let x = 0; x < W; x += 60) for (let y = 450; y < H; y += 30) if (((x / 60) + (y - 450) / 30) % 2 === 0) ctx.fillRect(x, y, 60, 30);
}

function drawGarageRoom() {
  ctx.fillStyle = '#5c6b73'; ctx.fillRect(0, 0, W, 420);
  ctx.fillStyle = '#53616a'; for (let y = 0; y < 420; y += 30) ctx.fillRect(0, y, W, 2);
  // pegboard
  ctx.fillStyle = '#a68a64'; ctx.fillRect(40, 70, 230, 130);
  ctx.strokeStyle = '#333'; ctx.lineWidth = 6;
  line(70, 90, 70, 170); line(110, 90, 130, 170); line(170, 90, 170, 150); circle(170, 160, 10); ctx.stroke();
  line(220, 95, 240, 175);
  // sign
  rr(330, 60, 300, 56, 8); ctx.fillStyle = '#e63946'; ctx.fill();
  text("Spanner & Sons Garage", 480, 88, 24, '#fff');
  // tyres stack
  for (let i = 0; i < 3; i++) { ctx.fillStyle = '#222'; rr(840, 330 - i * 32, 90, 30, 8); ctx.fill(); }
  // floor
  ctx.fillStyle = '#8d99ae'; ctx.fillRect(0, 420, W, 120);
  ctx.fillStyle = '#ffd166'; for (let x = 0; x < W; x += 80) ctx.fillRect(x, 425, 40, 6);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(300, 490, 60, 12, 0, 0, 6.28); ctx.fill();
}

// ================================================================ STAGE 1: BUSKING
function drawBusker(x, y, strum, t) {
  ctx.lineCap = 'round';
  // cardboard + sleeping bag
  ctx.fillStyle = '#b08850'; ctx.fillRect(x - 80, y - 4, 150, 10);
  ctx.fillStyle = '#3a5a40'; rr(x - 78, y - 18, 60, 16, 8); ctx.fill();
  // legs
  ctx.strokeStyle = '#4a4e69'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(x - 8, y - 12); ctx.lineTo(x + 30, y - 12); ctx.lineTo(x + 42, y - 2); ctx.stroke();
  circle(x + 46, y - 2, 6, '#3b2a20');
  // body (coat)
  rr(x - 20, y - 66, 30, 58, 10); ctx.fillStyle = '#6b5b45'; ctx.fill();
  // head
  circle(x - 4, y - 80, 13, '#e0ac69');
  ctx.fillStyle = '#5a4632'; ctx.beginPath(); ctx.arc(x - 4, y - 74, 11, 0.1, Math.PI - 0.1); ctx.fill(); // beard
  circle(x + 2, y - 83, 1.8, '#222');
  ctx.fillStyle = '#3d5a80'; ctx.beginPath(); ctx.arc(x - 4, y - 84, 14, Math.PI, 0); ctx.fill(); // beanie
  ctx.fillRect(x - 18, y - 86, 28, 5);
  // guitar
  ctx.save(); ctx.translate(x + 16, y - 30); ctx.rotate(-0.5);
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-60, -4, 60, 8);
  ctx.fillStyle = '#c47f2c'; ctx.beginPath(); ctx.ellipse(8, 0, 20, 16, 0, 0, 6.28); ctx.fill();
  circle(4, 0, 5, '#3b2412');
  ctx.restore();
  // strumming arm
  ctx.strokeStyle = '#6b5b45'; ctx.lineWidth = 8;
  line(x - 4, y - 56, x + 20, y - 30 + Math.sin(t * 40) * strum * 25);
  ctx.strokeStyle = '#6b5b45'; line(x - 10, y - 56, x - 30, y - 50);
}

function BuskScene() {
  const FEET = 482, BX = 470, BY = 400, HAT = { x: 560, y: 402 };
  const S = { peds: [], coins: [], notes: [], spawnT: 0.6, strum: 0, t: 0, served: 0, doneT: -1, msg: '', msgT: 0 };

  function spawn() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const len = clamp(3 + randi(0, 1) + Math.floor(S.served / 4), 3, 6);
    const seq = Array.from({ length: len }, () => pick(ARROWS));
    S.peds.push({
      x: dir > 0 ? -40 : W + 40, dir, speed: Math.min(115, rand(55, 80) + S.served * 3),
      seq, idx: 0, served: false, pause: 0, walkT: rand(0, 5), flash: 0, look: randomLook(),
    });
  }
  const inRange = p => p.x > 110 && p.x < 850;
  function target() {
    let best = null, bestV = -1;
    for (const p of S.peds) {
      if (p.served || !inRange(p)) continue;
      const v = p.dir > 0 ? p.x : W - p.x;
      if (v > bestV) { bestV = v; best = p; }
    }
    return best;
  }

  S.update = dt => {
    S.t += dt; S.strum = Math.max(0, S.strum - dt); S.msgT -= dt;
    S.spawnT -= dt;
    const live = S.peds.filter(p => !p.served).length;
    if (S.spawnT <= 0 && live < 3 && S.doneT < 0) { spawn(); S.spawnT = rand(1.4, 3); }

    for (const p of S.peds) {
      p.flash = Math.max(0, p.flash - dt);
      if (p.pause > 0) { p.pause -= dt; continue; }
      p.x += p.dir * p.speed * dt; p.walkT += dt;
    }
    S.peds = S.peds.filter(p => p.x > -80 && p.x < W + 80);

    const k = anyArrowHit();
    if (k && S.doneT < 0) {
      Sound.note(k); S.strum = 0.25;
      S.notes.push({ x: BX + 20, y: BY - 60, t: 0, g: pick(['♪', '♫']) });
      const p = target();
      if (p) {
        if (k === p.seq[p.idx]) {
          p.idx++;
          if (p.idx >= p.seq.length) {
            p.served = true; p.pause = 0.9; S.served++;
            const val = pick([0.5, 1, 1, 1, 1, 2, 2]) + (p.seq.length >= 5 ? 0.5 : 0);
            S.coins.push({ sx: p.x, sy: FEET - 60, t: 0, val });
            floatText(pick(['Lovely!', 'Nice tune!', 'Brilliant!', 'Here you go!', 'Cheers!']), p.x, FEET - 140, '#fff', 20);
          }
        } else {
          p.idx = 0; p.flash = 0.35; Sound.bad();
        }
      } else if (S.t > 1) { S.msg = 'Wait for someone to walk by…'; S.msgT = 1.2; }
    }

    for (const c of S.coins) {
      c.t += dt / 0.7;
      if (c.t >= 1 && !c.done) { c.done = true; earn(c.val, HAT.x, HAT.y - 30); Sound.coin(); }
    }
    S.coins = S.coins.filter(c => !c.done);
    for (const n of S.notes) n.t += dt;
    S.notes = S.notes.filter(n => n.t < 1.2);

    if (S.doneT < 0 && G.money >= JOBS.busk.goal && S.coins.length === 0) { S.doneT = 2; Sound.fanfare(); }
    if (S.doneT >= 0) { S.doneT -= dt; if (S.doneT < 0) goStage('bakery'); }
  };

  S.draw = () => {
    drawStreet();
    drawBusker(BX, BY, S.strum, S.t);
    // hat with coins
    ctx.fillStyle = '#3b2a20'; ctx.beginPath(); ctx.ellipse(HAT.x, HAT.y, 30, 10, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#4e3a2c'; ctx.beginPath(); ctx.ellipse(HAT.x, HAT.y - 2, 20, 7, 0, 0, 6.28); ctx.fill();
    const n = Math.min(14, Math.floor(G.money * 1.5));
    for (let i = 0; i < n; i++) circle(HAT.x - 14 + (i * 7) % 28, HAT.y - 3 - Math.floor(i / 4) * 2, 3.5, i % 3 ? '#e9c46a' : '#c0c0c0');
    // music notes
    for (const nt of S.notes) {
      ctx.globalAlpha = 1 - nt.t / 1.2;
      text(nt.g, nt.x + nt.t * 30, nt.y - nt.t * 60, 24, '#fff');
    }
    ctx.globalAlpha = 1;
    // pedestrians
    const tgt = target();
    for (const p of [...S.peds].sort((a, b) => a.dir - b.dir)) {
      drawPerson(p.x, FEET, p.look, { walking: p.pause <= 0, walkT: p.walkT, facing: p.dir });
    }
    // speech bubbles
    for (const p of S.peds) {
      if (p.served || !inRange(p)) continue;
      const isT = p === tgt;
      const bw = p.seq.length * 34 + 18, bx = clamp(p.x - bw / 2, 6, W - bw - 6), by = FEET - 170;
      ctx.globalAlpha = isT ? 1 : 0.45;
      rr(bx, by, bw, 46, 12);
      ctx.fillStyle = p.flash > 0 ? '#ffb3b3' : '#fff'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(p.x - 8, by + 46); ctx.lineTo(p.x, by + 60); ctx.lineTo(p.x + 8, by + 46); ctx.fill();
      if (isT) { ctx.lineWidth = 3; ctx.strokeStyle = '#ffd166'; rr(bx, by, bw, 46, 12); ctx.stroke(); }
      p.seq.forEach((k, i) => {
        const done = i < p.idx, cur = i === p.idx && isT;
        const yy = by + 24 + (cur ? Math.sin(S.t * 10) * 3 : 0);
        text(GLYPH[k], bx + 26 + i * 34, yy, 28, done ? '#2a9d8f' : cur ? '#e76f51' : '#333');
      });
      ctx.globalAlpha = 1;
    }
    // coins in flight
    for (const c of S.coins) {
      const x = lerp(c.sx, HAT.x, c.t), y = lerp(c.sy, HAT.y, c.t) - Math.sin(c.t * Math.PI) * 90;
      circle(x, y, 7, '#e9c46a'); ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.stroke();
    }
    drawHUD();
    drawMsg(S.msg, S.msgT);
    if (S.doneT >= 0) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 44, W, H); outlined('£8 collected!', W / 2, 220, 56, '#ffd166'); }
    else if (S.t < 6) outlined('Play the arrows in the highlighted bubble!', W / 2, 190, 24, '#fff');
  };
  return S;
}

// ================================================================ STAGE 2: BAKERY
const KNEAD_N = 12, BAKE_GOLD = 4.5, BAKE_BURNT = 7, BAKE_MAX = 9;
function loafColor(t) {
  if (t < BAKE_GOLD) return mixColor('#f3e3c3', '#e2b46d', t / BAKE_GOLD);
  if (t < BAKE_BURNT) return mixColor('#d8953a', '#b8702a', (t - BAKE_GOLD) / (BAKE_BURNT - BAKE_GOLD));
  return mixColor('#7a4a1a', '#2a1a0e', clamp((t - BAKE_BURNT) / 2, 0, 1));
}
function drawLoaf(x, y, color, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 20, 11, 0, 0, 6.28); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) line(i * 8 - 3, -6, i * 8 + 3, 4);
  ctx.restore();
}

function BakeryScene() {
  const FLOOR = 470;
  const ST = [{ id: 'flour', x: 120, name: 'Flour' }, { id: 'knead', x: 320, name: 'Knead' },
    { id: 'oven', x: 520, name: 'Oven' }, { id: 'counter', x: 720, name: 'Counter' }];
  const S = {
    p: { x: 220, facing: 1, walkT: 0, moving: false, hold: null }, knead: null, oven: { loaf: false, t: 0 },
    cust: [], leaving: [], custT: 0.3, msg: '', msgT: 0, doneT: -1, t: 0, smoke: [],
  };
  const near = () => ST.find(s => Math.abs(s.x - S.p.x) < 60);
  const say = m => { S.msg = m; S.msgT = 2.2; };
  const quality = t => t < BAKE_GOLD ? 'doughy' : t < BAKE_BURNT ? 'golden' : 'burnt';

  function interact() {
    const s = near(), h = S.p.hold;
    if (!s) return say('Walk to a station first (← →)');
    if (s.id === 'flour') {
      if (h) return say('Your hands are full!');
      S.p.hold = 'dough'; Sound.tone(440, 0.08, 'triangle'); say('Got some dough. Knead it at the table.');
    } else if (s.id === 'knead') {
      if (h === 'dough') { S.knead = { n: 0, last: null }; say('Knead! Tap ← → ← → …'); }
      else if (!h) say('Grab some flour first.');
      else say('That doesn\'t need kneading.');
    } else if (s.id === 'oven') {
      if (S.oven.loaf) {
        if (h) return say('Free your hands to take the bread out.');
        const q = quality(S.oven.t);
        S.oven.loaf = false;
        if (q === 'burnt') { Sound.bad(); say('Burnt to a crisp! Into the bin it goes.'); }
        else { S.p.hold = { q, c: loafColor(S.oven.t) }; q === 'golden' ? Sound.good() : Sound.tone(300, 0.15); say(q === 'golden' ? 'Perfectly golden! Sell it at the counter.' : 'A bit doughy… it\'ll sell cheap.'); }
      } else if (h === 'shaped') {
        S.oven.loaf = true; S.oven.t = 0; S.p.hold = null; Sound.tone(350, 0.1, 'triangle');
        say('Baking… take it out when the bar is in the green zone.');
      } else say('Bring kneaded dough to bake.');
    } else if (s.id === 'counter') {
      if (!h || !h.q) return say('Bring a baked loaf to sell.');
      const c = S.cust[0];
      if (!c || Math.abs(c.x - c.tx) > 6) return say('No customer at the counter yet.');
      const price = h.q === 'golden' ? 10 + randi(0, 2) : 4;
      earn(price, 760, 330); Sound.coin();
      floatText(h.q === 'golden' ? pick(['Smells amazing!', 'Perfect!', 'Delicious!']) : 'Hmm, bit soft…', c.x, 330, '#fff', 18);
      S.p.hold = null;
      S.leaving.push(S.cust.shift());
    }
  }

  S.update = dt => {
    S.t += dt; S.msgT -= dt;
    if (S.oven.loaf) {
      S.oven.t += dt;
      if (S.oven.t > BAKE_BURNT && Math.random() < dt * 10) S.smoke.push({ x: 520 + rand(-20, 20), y: 300, t: 0 });
    }
    for (const s of S.smoke) { s.t += dt; s.y -= 40 * dt; }
    S.smoke = S.smoke.filter(s => s.t < 2);

    S.custT -= dt;
    if (S.custT <= 0 && S.cust.length < 3) { S.cust.push({ x: W + 40, tx: 0, look: randomLook(), walkT: 0 }); S.custT = rand(2.5, 5); }
    S.cust.forEach((c, i) => {
      c.tx = 810 + i * 55;
      const d = c.tx - c.x;
      c.moving = Math.abs(d) > 1;
      if (c.moving) { c.x += Math.sign(d) * Math.min(Math.abs(d), 120 * dt); c.walkT += dt; }
    });
    for (const c of S.leaving) { c.x += 140 * dt; c.walkT += dt; }
    S.leaving = S.leaving.filter(c => c.x < W + 60);

    S.p.moving = false;
    if (S.doneT < 0) {
      if (S.knead) {
        const k = anyArrowHit();
        if ((k === 'ArrowLeft' || k === 'ArrowRight') && k !== S.knead.last) {
          S.knead.n++; S.knead.last = k; Sound.tone(180 + S.knead.n * 25, 0.06, 'triangle');
        }
        if (hit.ArrowDown) { S.knead = null; say('Stopped kneading.'); }
        else if (S.knead.n >= KNEAD_N) { S.knead = null; S.p.hold = 'shaped'; Sound.good(); say('Dough shaped! Take it to the oven.'); }
      } else {
        let dx = 0;
        if (down.ArrowLeft) dx -= 1;
        if (down.ArrowRight) dx += 1;
        if (dx) { S.p.x = clamp(S.p.x + dx * 300 * dt, 60, 740); S.p.facing = dx; S.p.walkT += dt; S.p.moving = true; }
        if (hit.ArrowUp) interact();
        if (hit.ArrowDown && S.p.hold) { S.p.hold = null; Sound.tone(200, 0.1); say('Binned it.'); }
      }
    }
    if (S.doneT < 0 && G.money >= JOBS.bakery.goal) { S.doneT = 2; Sound.fanfare(); }
    if (S.doneT >= 0) { S.doneT -= dt; if (S.doneT < 0) goStage('garage'); }
  };

  function drawHeld(x, y, h) {
    if (h === 'dough') { circle(x, y, 11, '#f3e3c3'); ctx.strokeStyle = '#d9c7a0'; ctx.lineWidth = 2; ctx.stroke(); }
    else if (h === 'shaped') drawLoaf(x, y, '#f3e3c3', 0.9);
    else if (h && h.q) drawLoaf(x, y, h.c, 0.9);
  }

  S.draw = () => {
    drawBakeryRoom();
    // stations
    // flour sacks
    ctx.fillStyle = '#e8dcc4'; rr(80, 380, 50, 70, 12); ctx.fill(); rr(115, 390, 45, 60, 12); ctx.fill();
    text('FLOUR', 120, 420, 12, '#8b5e3c');
    // knead table
    ctx.fillStyle = '#a0704b'; ctx.fillRect(250, 395, 140, 14); ctx.fillRect(260, 409, 10, 50); ctx.fillRect(370, 409, 10, 50);
    if (S.knead) {
      const sq = Math.sin(S.knead.n * 1.6) * 6;
      ctx.fillStyle = '#f3e3c3'; ctx.beginPath(); ctx.ellipse(320, 384, 22 + sq, 12 - sq / 3, 0, 0, 6.28); ctx.fill();
    }
    // oven
    ctx.fillStyle = '#9c4a2e'; rr(450, 300, 140, 160, 14); ctx.fill();
    ctx.strokeStyle = '#7a3820'; ctx.lineWidth = 2;
    for (let y = 320; y < 460; y += 20) line(450, y, 590, y);
    ctx.fillStyle = '#2b1a12'; ctx.beginPath(); ctx.arc(520, 400, 45, Math.PI, 0); ctx.lineTo(565, 430); ctx.lineTo(475, 430); ctx.fill();
    ctx.fillStyle = `rgba(255,${120 + Math.sin(S.t * 8) * 30},40,0.7)`; ctx.fillRect(482, 418, 76, 10);
    if (S.oven.loaf) drawLoaf(520, 405, loafColor(S.oven.t), 1.1);
    // oven gauge
    if (S.oven.loaf) {
      const gx = 455, gy = 270, gw = 130;
      ctx.fillStyle = '#eee'; ctx.fillRect(gx, gy, gw, 14);
      ctx.fillStyle = '#06d6a0'; ctx.fillRect(gx + gw * BAKE_GOLD / BAKE_MAX, gy, gw * (BAKE_BURNT - BAKE_GOLD) / BAKE_MAX, 14);
      ctx.fillStyle = '#ef476f'; ctx.fillRect(gx + gw * BAKE_BURNT / BAKE_MAX, gy, gw * (BAKE_MAX - BAKE_BURNT) / BAKE_MAX, 14);
      const mx = gx + gw * clamp(S.oven.t, 0, BAKE_MAX) / BAKE_MAX;
      ctx.fillStyle = '#222'; ctx.fillRect(mx - 2, gy - 4, 4, 22);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.strokeRect(gx, gy, gw, 14);
    }
    for (const s of S.smoke) { ctx.globalAlpha = 0.5 * (1 - s.t / 2); circle(s.x, s.y, 10 + s.t * 12, '#555'); }
    ctx.globalAlpha = 1;
    // customers (behind counter)
    for (const c of S.cust) drawPerson(c.x, FLOOR - 10, c.look, { walking: c.moving, walkT: c.walkT, facing: -1 });
    for (const c of S.leaving) drawPerson(c.x, FLOOR - 10, c.look, { walking: true, walkT: c.walkT, facing: 1 });
    // counter
    ctx.fillStyle = '#6f4e37'; ctx.fillRect(680, 380, 110, 80);
    ctx.fillStyle = '#8b5e3c'; ctx.fillRect(672, 372, 126, 12);
    ctx.fillStyle = '#444'; rr(740, 345, 40, 28, 4); ctx.fill(); ctx.fillStyle = '#7fff7f'; ctx.fillRect(746, 350, 28, 8);
    // labels
    for (const s of ST) {
      const n = near() === s && !S.knead;
      text(s.name, s.x, 490, 16, n ? '#ffd166' : '#fff3d6');
    }
    // player
    const P = S.p;
    drawPerson(P.x, FLOOR, { skin: '#e0ac69', shirt: '#fff', pants: '#555', hair: '#5a4632', scale: 1.05 },
      { walking: P.moving, walkT: P.walkT, facing: P.facing, hat: 'chef', apron: true, holding: !!P.hold });
    if (P.hold) drawHeld(P.x + 20 * P.facing, FLOOR - 60, P.hold);
    // prompt
    const s = near();
    if (s && !S.knead && S.doneT < 0) {
      let hint = null;
      if (s.id === 'flour' && !P.hold) hint = '↑ take dough';
      if (s.id === 'knead' && P.hold === 'dough') hint = '↑ knead';
      if (s.id === 'oven' && S.oven.loaf && !P.hold) hint = '↑ take out';
      if (s.id === 'oven' && !S.oven.loaf && P.hold === 'shaped') hint = '↑ bake';
      if (s.id === 'counter' && P.hold && P.hold.q) hint = '↑ sell';
      if (hint) outlined(hint, P.x, FLOOR - 140, 20, '#ffd166');
    }
    if (S.knead) {
      rr(220, 200, 200, 70, 12); ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fill();
      const want = S.knead.last === 'ArrowLeft' ? '→' : S.knead.last === 'ArrowRight' ? '←' : '← or →';
      text(`Knead!  ${want}`, 320, 222, 22, '#ffd166');
      ctx.fillStyle = '#444'; ctx.fillRect(240, 244, 160, 12);
      ctx.fillStyle = '#06d6a0'; ctx.fillRect(240, 244, 160 * S.knead.n / KNEAD_N, 12);
    }
    drawHUD();
    drawMsg(S.msg, S.msgT);
    if (S.doneT >= 0) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 44, W, H); outlined('£80 made!', W / 2, 220, 56, '#ffd166'); }
  };
  return S;
}

// ================================================================ STAGE 3: GARAGE
// Car shape in local coords: 600 x 220 box, facing right.
const CAR = (() => {
  const body = new Path2D();
  rrPath(body, 0, 85, 600, 92, 34);
  body.moveTo(150, 15); body.lineTo(410, 15); body.lineTo(495, 92); body.lineTo(70, 92); body.closePath();
  const win = new Path2D();
  win.moveTo(162, 28); win.lineTo(275, 28); win.lineTo(275, 84); win.lineTo(98, 84); win.closePath();
  win.moveTo(290, 28); win.lineTo(400, 28); win.lineTo(462, 84); win.lineTo(290, 84); win.closePath();
  const wheels = [{ x: 135, y: 177 }, { x: 465, y: 177 }];
  const cells = [], CS = 20;
  for (let y = 0; y < 200; y += CS) for (let x = 0; x < 600; x += CS) {
    const cx = x + CS / 2, cy = y + CS / 2;
    if (!ctx.isPointInPath(body, cx, cy) || ctx.isPointInPath(win, cx, cy)) continue;
    if (wheels.some(w => Math.hypot(cx - w.x, cy - w.y) < 44)) continue;
    cells.push({ x, y, cx, cy });
  }
  return { body, win, wheels, cells, CS };
})();

function drawWheel(x, y, r = 42) {
  circle(x, y, r, '#1a1a1a'); circle(x, y, r * 0.6, '#adb5bd'); circle(x, y, r * 0.2, '#6c757d');
}
function drawCar(x, y, color, opts = {}) {
  ctx.save(); ctx.translate(x, y); if (opts.scale) ctx.scale(opts.scale, opts.scale);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(300, 220, 300, 14, 0, 0, 6.28); ctx.fill();
  ctx.fillStyle = color; ctx.fill(CAR.body);
  if (opts.rust) {
    ctx.save(); ctx.clip(CAR.body);
    ctx.fillStyle = '#8b5a2b';
    for (const [rx, ry, rs] of [[60, 140, 22], [250, 120, 16], [520, 150, 26], [380, 60, 14], [180, 160, 14]]) circle(rx, ry, rs, '#8b5a2b');
    ctx.restore();
  }
  if (opts.paint) {
    ctx.save(); ctx.clip(CAR.body);
    ctx.fillStyle = opts.paint.color;
    for (const i of opts.paint.done) { const c = CAR.cells[i]; ctx.fillRect(c.x - 1, c.y - 1, CAR.CS + 2, CAR.CS + 2); }
    ctx.restore();
  }
  ctx.fillStyle = '#bde0fe'; ctx.fill(CAR.win);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.stroke(CAR.body); ctx.stroke(CAR.win);
  line(285, 30, 285, 170);
  ctx.fillStyle = '#ffe066'; rr(580, 100, 18, 16, 4); ctx.fill();
  ctx.fillStyle = '#e63946'; rr(2, 100, 12, 16, 4); ctx.fill();
  for (const [i, w] of CAR.wheels.entries()) {
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(w.x, w.y, 50, Math.PI, 0); ctx.fill();
    if (!(opts.missingWheel === i)) drawWheel(w.x, w.y + (opts.lift ? -8 : 0));
  }
  ctx.restore();
}

function GarageScene() {
  const CX = 180, CY = 200;
  const COLORS = ['#e63946', '#1d3557', '#2a9d8f', '#f4a261', '#9b5de5', '#06d6a0', '#ffbe0b', '#ff006e', '#3a86ff'];
  const S = { phase: 'arrive', carX: -700, job: null, jobs: 0, t: 0, msg: '', msgT: 0, paidT: 0, pay: 0, doneT: -1, spray: [] };

  function newJob() {
    const type = S.jobs === 0 ? 'tyres' : S.jobs === 1 ? 'paint' : pick(['tyres', 'paint']);
    S.jobs++;
    const color = pick(COLORS);
    if (type === 'tyres') {
      S.job = { type, color, wheel: 0, stage: 'out', seq: newSeq(), idx: 0, time: 0, swapT: 0, spin: 0 };
    } else {
      let target = pick(COLORS); while (target === color) target = pick(COLORS);
      S.job = { type, color: '#7d7461', target, done: new Set(), cx: 40, cy: 120, time: 0, limit: 30 };
    }
    S.phase = 'arrive'; S.carX = -700;
  }
  const newSeq = () => Array.from({ length: 4 }, () => pick(ARROWS));
  function finish() {
    const j = S.job;
    let pay;
    if (j.type === 'tyres') pay = 100 + clamp(Math.round(75 - 2.5 * j.time), 0, 50);
    else {
      const cov = j.done.size / CAR.cells.length;
      if (cov >= 0.97) for (let i = 0; i < CAR.cells.length; i++) j.done.add(i);
      pay = Math.round(130 * Math.min(1, cov / 0.97)) + (cov >= 0.97 ? clamp(Math.round(80 - 3 * j.time), 0, 50) : 0);
    }
    S.pay = pay; S.phase = 'paid'; S.paidT = 2;
    earn(pay, CX + 300, CY - 30); Sound.coin(); Sound.good();
  }
  newJob();

  S.update = dt => {
    S.t += dt; S.msgT -= dt;
    const j = S.job;
    if (S.phase === 'arrive') {
      S.carX = Math.min(CX, S.carX + 700 * dt);
      if (S.carX >= CX) { S.phase = 'work'; S.msg = j.type === 'tyres' ? 'Tyre change — press the arrow on each nut!' : 'Paint job — cover every bit of the body!'; S.msgT = 2.5; }
    } else if (S.phase === 'work' && S.doneT < 0) {
      j.time += dt;
      if (j.type === 'tyres') {
        j.spin = Math.max(0, j.spin - dt);
        if (j.stage === 'swapping') {
          j.swapT += dt;
          if (j.swapT > 0.6) { j.stage = 'in'; j.seq = newSeq(); j.idx = 0; }
        } else if (j.stage === 'swap') {
          if (hit.ArrowUp) { j.stage = 'swapping'; j.swapT = 0; Sound.tone(250, 0.2, 'triangle'); }
          else if (anyArrowHit()) { Sound.bad(); }
        } else {
          const k = anyArrowHit();
          if (k) {
            if (k === j.seq[j.idx]) {
              j.idx++; j.spin = 0.2; Sound.tone(j.stage === 'out' ? 700 : 900, 0.07, 'square', 0.05);
              if (j.idx >= 4) {
                if (j.stage === 'out') j.stage = 'swap';
                else { j.wheel++; if (j.wheel >= 4) finish(); else { j.stage = 'out'; j.seq = newSeq(); j.idx = 0; } }
              }
            } else { j.time += 1; Sound.bad(); floatText('+1s', 800, 140, '#ef476f', 20); }
          }
        }
      } else {
        let dx = 0, dy = 0;
        if (down.ArrowLeft) dx--; if (down.ArrowRight) dx++; if (down.ArrowUp) dy--; if (down.ArrowDown) dy++;
        j.cx = clamp(j.cx + dx * 340 * dt, 0, 600); j.cy = clamp(j.cy + dy * 340 * dt, 10, 180);
        CAR.cells.forEach((c, i) => { if (Math.hypot(c.cx - j.cx, c.cy - j.cy) < 38) j.done.add(i); });
        if (Math.random() < 0.9) S.spray.push({ x: j.cx + rand(-30, 30), y: j.cy + rand(-30, 30), t: 0 });
        if (j.done.size / CAR.cells.length >= 0.97 || j.time >= j.limit) finish();
      }
    } else if (S.phase === 'paid') {
      S.paidT -= dt;
      if (S.paidT <= 0) {
        if (G.money >= JOBS.garage.goal) { S.doneT = 2.2; Sound.fanfare(); S.phase = 'leave'; }
        else S.phase = 'leave';
      }
    } else if (S.phase === 'leave') {
      S.carX += 800 * dt;
      if (S.carX > W + 50 && S.doneT < 0) newJob();
    }
    for (const p of S.spray) p.t += dt;
    S.spray = S.spray.filter(p => p.t < 0.3);
    if (S.doneT >= 0) { S.doneT -= dt; if (S.doneT < 0) goStage('airport'); }
  };

  S.draw = () => {
    drawGarageRoom();
    const j = S.job;
    // jack / lift
    if (j.type === 'tyres' && S.phase === 'work') { ctx.fillStyle = '#e63946'; ctx.fillRect(CX + 280, CY + 180, 40, 40); }
    const paintColor = j.color;
    const mw = j.type === 'tyres' && S.phase === 'work' && j.stage === 'swapping' ? (j.wheel % 2) : undefined;
    drawCar(S.carX, CY - (j.type === 'tyres' && S.phase === 'work' ? 10 : 0), paintColor, {
      rust: j.type === 'paint' && S.phase !== 'paid' && S.phase !== 'leave',
      paint: j.type === 'paint' ? { color: j.target, done: j.done } : null,
      missingWheel: mw,
    });

    if (j.type === 'paint' && S.phase === 'work') {
      // spray particles + nozzle
      ctx.fillStyle = j.target;
      for (const p of S.spray) { ctx.globalAlpha = 0.6 * (1 - p.t / 0.3); circle(CX + p.x, CY + p.y, 3, j.target); }
      ctx.globalAlpha = 0.25; circle(CX + j.cx, CY + j.cy, 38, j.target); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; circle(CX + j.cx, CY + j.cy, 38); ctx.stroke();
      // spray gun
      ctx.save(); ctx.translate(CX + j.cx + 30, CY + j.cy - 40);
      ctx.fillStyle = '#555'; ctx.fillRect(0, 0, 34, 14); ctx.fillRect(20, 14, 10, 22);
      ctx.fillStyle = j.target; ctx.fillRect(6, -18, 16, 18);
      ctx.restore();
      const cov = j.done.size / CAR.cells.length;
      rr(330, 450, 300, 24, 12); ctx.fillStyle = '#333'; ctx.fill();
      rr(330, 450, Math.max(24, 300 * Math.min(1, cov / 0.97)), 24, 12); ctx.fillStyle = j.target; ctx.fill();
      text(`Coverage ${Math.floor(Math.min(1, cov / 0.97) * 100)}%`, 480, 462, 15, '#fff');
      outlined(`Time left: ${Math.max(0, j.limit - j.time).toFixed(1)}s`, 480, 500, 20, j.limit - j.time < 8 ? '#ef476f' : '#fff');
    }

    if (j.type === 'tyres' && S.phase === 'work') {
      // close-up panel
      const px = 790, py = 270;
      rr(px - 140, py - 160, 280, 330, 18); ctx.fillStyle = 'rgba(20,24,36,0.9)'; ctx.fill();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.stroke();
      text(`Wheel ${j.wheel + 1} of 4`, px, py - 135, 20, '#ffd166');
      if (j.stage === 'swapping') {
        const off = j.swapT < 0.3 ? j.swapT / 0.3 * 200 : (0.6 - j.swapT) / 0.3 * 200;
        ctx.save(); ctx.beginPath(); ctx.rect(px - 138, py - 120, 276, 250); ctx.clip();
        drawWheel(px + off, py, 95); ctx.restore();
      } else {
        ctx.save(); ctx.translate(px, py); ctx.rotate(j.spin * (j.stage === 'out' ? -3 : 3));
        drawWheel(0, 0, 95); ctx.restore();
        const pos = [[0, -40], [40, 0], [0, 40], [-40, 0]];
        pos.forEach(([nx, ny], i) => {
          const present = j.stage === 'out' ? i >= j.idx : (j.stage === 'in' ? i < j.idx : false);
          const cur = (j.stage === 'out' || j.stage === 'in') && i === j.idx;
          if (present) { circle(px + nx, py + ny, 13, '#ced4da'); ctx.strokeStyle = '#495057'; ctx.lineWidth = 3; ctx.stroke(); }
          else if (!cur) circle(px + nx, py + ny, 6, '#333');
          if (cur) {
            circle(px + nx, py + ny, 20 + Math.sin(S.t * 10) * 2, '#ffd166');
            text(GLYPH[j.seq[i]], px + nx, py + ny + 1, 28, '#222');
          }
        });
      }
      const label = j.stage === 'out' ? 'Undo the nuts' : j.stage === 'in' ? 'Tighten the nuts' : j.stage === 'swap' ? '↑ Swap the tyre!' : 'Swapping…';
      text(label, px, py + 125, 20, j.stage === 'swap' ? '#ffd166' : '#fff');
      outlined(`Time: ${j.time.toFixed(1)}s`, 480, 500, 20);
    }

    if (S.phase === 'paid') {
      ctx.save(); ctx.translate(480, 180); ctx.rotate(-0.12);
      rr(-150, -50, 300, 100, 14); ctx.fillStyle = 'rgba(6,214,160,0.95)'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
      text('PAID', 0, -16, 32, '#fff'); text(fmt(S.pay), 0, 22, 34, '#fff');
      ctx.restore();
    }
    drawHUD();
    drawMsg(S.msg, S.msgT);
    if (S.doneT >= 0) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 44, W, H); outlined('£1,000 earned!', W / 2, 220, 56, '#ffd166'); }
  };
  return S;
}

// ================================================================ STAGE 4: PILOT
function drawPlane(x, y, angle, color = '#fff', s = 1, opts = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(s, s);
  // tail
  ctx.fillStyle = '#d62828';
  ctx.beginPath(); ctx.moveTo(-52, -4); ctx.lineTo(-62, -34); ctx.lineTo(-44, -34); ctx.lineTo(-30, -4); ctx.fill();
  // fuselage
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(-58, -6); ctx.lineTo(40, -10); ctx.quadraticCurveTo(62, -8, 64, 2); ctx.quadraticCurveTo(60, 10, 40, 10); ctx.lineTo(-50, 8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#1d3557'; ctx.fillRect(-40, 0, 80, 3);
  ctx.fillStyle = '#457b9d'; for (let i = -36; i < 36; i += 9) ctx.fillRect(i, -5, 5, 4);
  ctx.fillStyle = '#1b263b'; ctx.beginPath(); ctx.moveTo(46, -7); ctx.lineTo(56, -5); ctx.lineTo(56, -1); ctx.lineTo(46, -2); ctx.fill();
  // wing
  ctx.fillStyle = '#adb5bd';
  ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(18, 2); ctx.lineTo(-14, 24); ctx.lineTo(-24, 24); ctx.fill();
  ctx.fillStyle = '#6c757d'; rr(-2, 8, 18, 8, 4); ctx.fill();
  // gear
  if (opts.gear) {
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; line(30, 9, 30, 16); line(-14, 8, -14, 16);
    circle(30, 17, 3.5, '#222'); circle(-14, 17, 3.5, '#222');
  }
  ctx.restore();
}

function drawSky(camX, dark = 0) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mixColor('#4ea8de', '#1b2a4a', dark)); g.addColorStop(1, mixColor('#caf0f8', '#4a5a7a', dark));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  circle(560, 95, 40, 'rgba(255,236,150,0.9)');
  // decorative clouds
  for (let i = 0; i < 7; i++) {
    const x = ((i * 260 - camX * 0.3) % (W + 300) + W + 300) % (W + 300) - 150, y = 70 + (i * 47) % 150;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    circle(x, y, 26); ctx.fill(); circle(x + 28, y - 10, 32); ctx.fill(); circle(x + 60, y, 24); ctx.fill();
  }
  // hills
  ctx.fillStyle = '#74a57f';
  ctx.beginPath(); ctx.moveTo(0, 480);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 430 - Math.sin((x + camX * 0.15) * 0.006) * 40 - Math.sin((x + camX * 0.15) * 0.017) * 15);
  ctx.lineTo(W, 480); ctx.fill();
}

function FlightScene() {
  const n = G.flights, GROUND = 470, PX = 220;
  const START_RW = 1700, dest = 7000 + n * 1200, RW = 1300;
  const S = {
    phase: 'takeoff', x: 80, alt: 0, vy: 0, speed: 0, airborne: false, hits: 0, inv: 0, t: 0, endT: 0,
    msg: 'Hold → to speed up', msgT: 3, parts: [], obs: [], shake: 0, result: null,
  };
  let ox = 2300;
  while (ox < dest - 1500) {
    const storm = Math.random() < 0.3 + n * 0.06;
    S.obs.push({ type: storm ? 'storm' : 'birds', x: ox, alt: rand(80, 370), ph: rand(0, 6), hit: false });
    ox += rand(400, 650) - n * 35;
  }
  const say = (m, d = 2.2) => { S.msg = m; S.msgT = d; };

  function end(kind, reason) {
    if (S.phase === 'end') return;
    S.phase = 'end'; S.result = { kind, reason }; S.endT = kind === 'crash' ? 2 : 1.4;
    if (kind === 'crash') {
      Sound.boom(); S.shake = 0.6;
      for (let i = 0; i < 60; i++) { const a = rand(0, 6.28), s = rand(40, 260); S.parts.push({ x: S.x, alt: S.alt, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.6, 1.6), c: pick(['#ff9f1c', '#e63946', '#ffd166', '#555']) }); }
    } else if (kind === 'fail') Sound.bad();
  }

  S.update = dt => {
    S.t += dt; S.msgT -= dt; S.inv = Math.max(0, S.inv - dt); S.shake = Math.max(0, S.shake - dt);
    const U = down.ArrowUp, D = down.ArrowDown, L = down.ArrowLeft, R = down.ArrowRight;
    if (S.phase === 'takeoff' || S.phase === 'fly') {
      if (!S.airborne) {
        if (R) S.speed += 95 * dt; else S.speed -= 20 * dt;
        if (L) S.speed -= 200 * dt;
        S.speed = clamp(S.speed, 0, 380);
        if (U && S.speed >= 230) S.vy += 320 * dt;
        else S.vy -= 300 * dt;
        if (U && S.speed < 230 && S.msgT < 0.5) say('Not fast enough yet — keep holding →', 1);
        if (S.speed >= 230 && S.alt === 0 && S.msgT < 0.5) say('Fast enough! Hold ↑ to take off', 1);
        S.vy = clamp(S.vy, -200, 200);
        S.alt = Math.max(0, S.alt + S.vy * dt);
        if (S.alt === 0) S.vy = Math.max(0, S.vy);
        if (S.alt > 45) { S.airborne = true; S.phase = 'fly'; say('Airborne! Dodge the birds and storms.'); }
        if (S.x > START_RW - 40 && S.alt < 5) { S.speed = 0; end('crash', 'You ran out of runway! Hold → to build speed sooner, then ↑ to lift off.'); }
      } else {
        if (R) S.speed += 90 * dt;
        if (L) S.speed -= 90 * dt;
        S.speed = clamp(S.speed, 200, 420);
        if (U) S.vy += 320 * dt;
        if (D) S.vy -= 320 * dt;
        if (!U && !D) S.vy *= 1 - Math.min(1, 2 * dt);
        S.vy = clamp(S.vy, -240, 240);
        S.alt += S.vy * dt;
        if (S.alt > 390) { S.alt = 390; S.vy = Math.min(0, S.vy); }
        if (S.alt <= 0) {
          S.alt = 0;
          const onRw = S.x >= dest + 20 && S.x <= dest + RW - 300;
          if (!onRw) end('crash', S.x < dest ? 'You hit the ground before the runway!' : 'You touched down too far along the runway and ran off the end.');
          else if (S.vy < -120) end('crash', 'Hard landing! You came down too fast. Ease off ↓ and tap ↑ just before touchdown.');
          else { S.phase = 'rollout'; S.vy = 0; Sound.good(); say('Touchdown! Hold ← to brake.'); }
        }
        if (S.phase === 'fly' && S.x > dest + RW) end('fail', 'You flew past the runway without landing. Missed approach!');
        if (S.phase === 'fly' && S.x > dest - 2600 && S.x < dest && !S.approachSaid) { S.approachSaid = true; say('Runway ahead! Descend gently and land.', 3); }
      }
      S.x += S.speed * dt;
      // obstacles
      for (const o of S.obs) {
        if (o.type === 'birds') { o.x -= 50 * dt; o.ph += dt * 3; }
        if (S.inv > 0 || o.hit || !S.airborne) continue;
        const dx = o.x - S.x, dy = (o.alt + (o.type === 'birds' ? Math.sin(o.ph) * 20 : 0)) - S.alt;
        const hitIt = o.type === 'birds' ? Math.hypot(dx, dy) < 38 : (dx / 100) ** 2 + (dy / 52) ** 2 < 1;
        if (hitIt) {
          o.hit = true; S.hits++; S.inv = 1.2; S.shake = 0.4; Sound.bad();
          floatText(o.type === 'birds' ? 'Bird strike!' : 'Turbulence!', PX, GROUND - S.alt - 50, '#ef476f', 22);
          if (S.hits >= 3) end('crash', 'Too much damage — the plane couldn\'t stay in the air. Avoid birds and storm clouds!');
        }
      }
    } else if (S.phase === 'rollout') {
      S.speed = Math.max(0, S.speed - (L ? 320 : 160) * dt);
      S.x += S.speed * dt;
      if (S.speed <= 0) {
        S.phase = 'end'; S.result = { kind: 'win' }; S.endT = 1.6;
        G.flights++; earn(500, PX, GROUND - 80); Sound.fanfare();
      }
    } else if (S.phase === 'end') {
      S.endT -= dt;
      if (S.endT <= 0) {
        const r = S.result;
        if (r.kind === 'win') {
          if (G.flights >= JOBS.airport.flights) setScene(CardScene('Flight 5 complete!', ['Smooth landing, Captain. That was your fifth successful flight.'], () => setScene(WinScene()), { bg: () => drawSky(0), border: '#06d6a0' }));
          else setScene(CardScene(`Flight ${G.flights} complete!`, [
            'Smooth landing! The passengers are clapping.', `You earned £500. ${JOBS.airport.flights - G.flights} more successful flight${JOBS.airport.flights - G.flights === 1 ? '' : 's'} to go.`,
            { t: 'The next route is longer and busier.', c: '#ffd166' }], () => setScene(FlightScene()), { bg: () => drawSky(0), border: '#06d6a0' }));
        } else {
          setScene(CardScene('Flight failed', [r.reason, { t: 'No harm done, it was the simulator! Try this flight again.', c: '#ffd166' }],
            () => setScene(FlightScene()), { bg: () => drawSky(0, 0.4), border: '#ef476f' }));
        }
        return;
      }
    }
    for (const p of S.parts) { p.x += p.vx * dt; p.alt += p.vy * dt; p.vy -= 200 * dt; p.life -= dt; }
    S.parts = S.parts.filter(p => p.life > 0);
  };

  function drawRunway(sx, len, label) {
    if (sx > W || sx + len < 0) return;
    ctx.fillStyle = '#444'; ctx.fillRect(sx, GROUND - 2, len, 20);
    ctx.fillStyle = '#fff';
    for (let x = sx + 60; x < sx + len - 60; x += 70) ctx.fillRect(x, GROUND + 7, 36, 3);
    for (let i = 0; i < 4; i++) { ctx.fillRect(sx + 8, GROUND + 1 + i * 4, 30, 2); ctx.fillRect(sx + len - 38, GROUND + 1 + i * 4, 30, 2); }
    // lights
    for (let x = sx; x <= sx + len; x += 50) circle(x, GROUND - 3, 2.5, x === sx || x + 50 > sx + len ? '#06d6a0' : '#ffd166');
    if (label) text(label, sx + len / 2, GROUND + 32, 15, '#fff');
  }
  function drawTower(sx) {
    if (sx < -60 || sx > W + 60) return;
    ctx.fillStyle = '#ced4da'; ctx.fillRect(sx - 10, GROUND - 120, 20, 120);
    ctx.fillStyle = '#495057'; rr(sx - 26, GROUND - 150, 52, 32, 6); ctx.fill();
    ctx.fillStyle = '#90e0ef'; ctx.fillRect(sx - 22, GROUND - 144, 44, 14);
    ctx.fillStyle = '#adb5bd'; ctx.fillRect(sx + 40, GROUND - 50, 160, 50);
    ctx.fillStyle = '#90e0ef'; for (let i = 0; i < 6; i++) ctx.fillRect(sx + 50 + i * 25, GROUND - 40, 16, 14);
  }

  S.draw = () => {
    ctx.save();
    if (S.shake > 0) ctx.translate(rand(-6, 6) * S.shake * 2, rand(-6, 6) * S.shake * 2);
    const cam = S.x - PX;
    drawSky(cam);
    // ground
    ctx.fillStyle = '#5a9a5a'; ctx.fillRect(-20, GROUND, W + 40, H - GROUND + 20);
    ctx.fillStyle = '#4c8a4c';
    for (let x = -((cam) % 60) - 60; x < W + 60; x += 60) ctx.fillRect(x, GROUND + 30, 30, 6);
    drawTower(-200 - cam);
    drawRunway(0 - cam, START_RW, 'DEPARTURES');
    drawTower(dest + RW + 150 - cam);
    drawRunway(dest - cam, RW, 'ARRIVALS — LAND HERE');
    // touchdown zone marker
    if (dest - cam < W && dest + RW - 300 - cam > 0) {
      ctx.fillStyle = 'rgba(6,214,160,0.35)'; ctx.fillRect(dest + 20 - cam, GROUND - 6, RW - 320, 6);
    }
    // obstacles
    for (const o of S.obs) {
      const sx = o.x - cam;
      if (sx < -150 || sx > W + 150) continue;
      if (o.type === 'birds') {
        const sy = GROUND - o.alt - Math.sin(o.ph) * 20;
        ctx.strokeStyle = o.hit ? '#999' : '#222'; ctx.lineWidth = 3;
        for (const [bx, by] of [[0, 0], [-22, 12], [18, 14]]) {
          const f = Math.sin(o.ph * 4 + bx) * 6;
          ctx.beginPath(); ctx.moveTo(sx + bx - 10, sy + by - f); ctx.lineTo(sx + bx, sy + by); ctx.lineTo(sx + bx + 10, sy + by - f); ctx.stroke();
        }
      } else {
        const sy = GROUND - o.alt;
        ctx.fillStyle = o.hit ? 'rgba(80,80,100,0.5)' : '#4a4e69';
        circle(sx - 50, sy + 10, 38); ctx.fill(); circle(sx, sy - 12, 52); ctx.fill(); circle(sx + 52, sy + 8, 40); ctx.fill();
        ctx.fillRect(sx - 80, sy + 10, 160, 38);
        if (Math.sin(S.t * 7 + o.ph) > 0.85) {
          ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(sx, sy + 40); ctx.lineTo(sx - 10, sy + 70); ctx.lineTo(sx + 6, sy + 70); ctx.lineTo(sx - 6, sy + 100); ctx.stroke();
        }
      }
    }
    // plane
    const crashed = S.result && S.result.kind === 'crash';
    if (!crashed) {
      const ang = S.airborne && S.phase !== 'rollout' ? -Math.atan2(S.vy, Math.max(S.speed, 1)) * 0.8 : (S.vy > 0 ? -0.12 : 0);
      if (!(S.inv > 0 && Math.floor(S.t * 12) % 2)) drawPlane(PX, GROUND - S.alt - 20, ang, '#fff', 1, { gear: S.alt < 120 });
    }
    for (const p of S.parts) { ctx.globalAlpha = clamp(p.life, 0, 1); circle(p.x - cam, GROUND - p.alt - 20, 5, p.c); }
    ctx.globalAlpha = 1;
    ctx.restore();

    // flight instruments
    drawHUD();
    rr(700, 54, 250, 118, 10); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    text(`Flight ${n + 1} of 5`, 712, 72, 17, '#ffd166', 'left');
    text(`Speed: ${Math.round(S.speed * 0.45)} kts`, 712, 96, 16, S.phase === 'takeoff' && S.speed >= 230 ? '#06d6a0' : '#fff', 'left', 'normal');
    text(`Altitude: ${Math.round(S.alt * 25).toLocaleString('en-GB')} ft`, 712, 118, 16, '#fff', 'left', 'normal');
    const vs = Math.round(S.vy * 10), safe = S.vy >= -120;
    text(`Vertical speed: ${vs > 0 ? '+' : ''}${vs} ft/min`, 712, 140, 16, S.airborne && !safe ? '#ef476f' : '#fff', 'left', 'normal');
    text('Damage: ' + '■'.repeat(S.hits) + '□'.repeat(3 - S.hits), 712, 160, 15, S.hits ? '#ef476f' : '#aaa', 'left', 'normal');
    // route progress
    const prog = clamp(S.x / (dest + RW / 2), 0, 1);
    rr(300, 522, 360, 10, 5); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    rr(300, 522, 360 * prog, 10, 5); ctx.fillStyle = '#ffd166'; if (prog > 0.03) ctx.fill();
    text('✈', 300 + 360 * prog, 516, 18, '#fff');
    // landing guide
    if (S.phase === 'fly' && S.x > dest - 2600 && S.x < dest + RW) {
      const dist = dest - S.x;
      outlined(dist > 0 ? `Runway in ${Math.round(dist / 10)} m` : 'Over the runway — touch down gently!', W / 2, 190, 22, '#fff');
      outlined(safe ? 'Descent rate: safe' : 'Descent too fast!', W / 2, 220, 20, safe ? '#06d6a0' : '#ef476f');
      if (dest - S.x > W - PX) { // off-screen arrow
        outlined('➜ runway', W - 70, GROUND - 20, 20, '#ffd166');
      }
    }
    drawMsg(S.msg, S.msgT);
    if (S.phase === 'end' && S.result.kind === 'win') outlined('Perfect landing!', W / 2, 230, 50, '#06d6a0');
  };
  return S;
}

// ---------------------------------------------------------------- main loop
function updateFloaters(dt) {
  for (const f of floaters) { f.t += dt; f.y -= 40 * dt; }
  for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t > 1.3) floaters.splice(i, 1);
}
function drawFloaters() {
  for (const f of floaters) { ctx.globalAlpha = clamp(1.3 - f.t, 0, 1); outlined(f.txt, f.x, f.y, f.size, f.color); }
  ctx.globalAlpha = 1;
}

// Debug: ?stage=bakery jumps straight into a stage (for testing).
const params = new URLSearchParams(location.search);
if (params.get('stage') && SCENES[params.get('stage')]) {
  const st = params.get('stage');
  G.stage = st; G.money = { busk: 0, bakery: 8, garage: 80, airport: 1000 }[st];
  setScene(SCENES[st]());
} else setScene(TitleScene());

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  scene.update(dt);
  updateFloaters(dt);
  scene.draw();
  drawFloaters();
  for (const k in hit) delete hit[k];
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
cv.focus();
