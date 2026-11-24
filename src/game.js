/* Blame Others — a driving game about being right. Uses global THREE (r128). */
(() => {
  'use strict';
  const T = THREE;
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mod = (a, n) => ((a % n) + n) % n;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- tuning ----------
  const LANES = 4, LANE_W = 3.6, ROAD_HALF = (LANES * LANE_W) / 2;
  const laneX = (i) => (i - (LANES - 1) / 2) * LANE_W;
  const GOAL = 10;            // blames needed to become the traffic
  const GROW = 0.3;           // scale gained per blame
  const CRUISE = 30, CHASE = 38, FLEE = 29;
  const CHASE_TIME = 20, BLAME_TIME = 1.4, LUNG_TIME = 2.6;
  const N_CARS = 26, LOOP = 480;

  const COL = {
    sky: 0xffc7dd, grass: 0x7fe0b0, road: 0x5b4b8a, line: 0xfff6e0, edge: 0xffd23f,
    red: 0xff4b3e, flesh: 0xff9aa2, fleshDark: 0xe8707c, ink: 0x2b1b4a,
    cars: [0xffd23f, 0x2ec4b6, 0xff9f1c, 0x4cc9f0, 0xb388eb, 0xfff6e0, 0x80ed99, 0xf78fb3],
    candy: [0xff6b9d, 0xffd23f, 0x4cc9f0, 0xb388eb, 0xff9f1c, 0x2ec4b6],
  };

  const OFFENCES = ['CUT YOU OFF!', 'BRAKE-CHECKED YOU!'];
  const PETTY = [
    'DROVE THE SPEED LIMIT!', 'USED A BLINKER. SHOW-OFF!', 'LOOKED AT YOU FUNNY!', 'HAD A NICER COLOUR!',
    'WAS IN YOUR LANE (ALL OF THEM)!', 'EXISTED NEAR YOU!', 'WAS ALSO ON THE ROAD!', 'BREATHED YOUR AIR!',
    'MERGED POLITELY!', 'LEFT A SAFE GAP!',
  ];
  const YELLS = [
    'LEARN TO DRIVE!', 'WHO GAVE YOU A LICENCE?!', 'I HAD RIGHT OF WAY!', 'IT’S CALLED A BLINKER!',
    'I’VE NEVER HAD AN ACCIDENT!', 'UNBELIEVABLE!', 'ARE YOU BLIND?!', 'I’M AN EXCELLENT DRIVER!',
    'YOUR FAULT!', 'AAAAAAGH!', 'MOVE!!', 'THIS IS ON YOU!',
  ];
  const SORRY = ['sorry!!', 'my bad…', 'eep!', 'ok ok ok', 'I have kids!', 'please stop'];
  const SMUG = ['I’M A GREAT DRIVER.', 'JUSTICE.', 'SOMEONE HAD TO SAY IT.', 'FLAWLESS, AS ALWAYS.', 'THEY’LL THANK ME LATER.'];

  // ---------- renderer / scene ----------
  const canvas = $('c'), root = $('game');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new T.Scene();
  scene.background = new T.Color(COL.sky);
  scene.fog = new T.Fog(COL.sky, 110, 400);
  const cam = new T.PerspectiveCamera(60, 1, 0.5, 520);
  const faceCam = new T.PerspectiveCamera(32, 2.3, 0.5, 300);
  scene.add(new T.HemisphereLight(0xffffff, 0xff9ac1, 0.85));
  const sun = new T.DirectionalLight(0xfff1c9, 0.65);
  sun.position.set(-30, 60, 20);
  scene.add(sun);

  let W = 1, H = 1;
  function resize() {
    W = root.clientWidth || 1; H = root.clientHeight || 1;
    renderer.setSize(W, H, false);
    cam.aspect = W / H; cam.fov = W < H ? 78 : 60; cam.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // ---------- geometry helpers ----------
  const lam = (color, extra) => new T.MeshLambertMaterial(Object.assign({ color }, extra));
  function rbox(w, h, d, r, b = 0.08) {
    const sw = w - 2 * b, sd = d - 2 * b, rr = Math.min(r, sw / 2 - 0.01, sd / 2 - 0.01);
    const x = -sw / 2, y = -sd / 2, s = new T.Shape();
    s.moveTo(x + rr, y); s.lineTo(x + sw - rr, y); s.quadraticCurveTo(x + sw, y, x + sw, y + rr);
    s.lineTo(x + sw, y + sd - rr); s.quadraticCurveTo(x + sw, y + sd, x + sw - rr, y + sd);
    s.lineTo(x + rr, y + sd); s.quadraticCurveTo(x, y + sd, x, y + sd - rr);
    s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
    const g = new T.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 5 });
    g.rotateX(-Math.PI / 2); g.center();
    return g;
  }
  const GEO = {
    body: rbox(1.9, 0.72, 4.2, 0.55), glass: rbox(1.62, 0.62, 2.1, 0.5), roof: rbox(1.58, 0.14, 1.85, 0.5),
    wheel: new T.CylinderGeometry(0.42, 0.42, 0.34, 14).rotateZ(Math.PI / 2),
    ball: new T.SphereGeometry(1, 16, 12), disc: new T.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
    box: new T.BoxGeometry(1, 1, 1), cone: new T.ConeGeometry(1, 1, 10), cyl: new T.CylinderGeometry(1, 1, 1, 10),
  };
  const MAT = {
    glass: new T.MeshLambertMaterial({ color: 0xcdf3ff, transparent: true, opacity: 0.32, depthWrite: false }),
    tyre: lam(COL.ink), white: lam(0xffffff), black: lam(0x1a1030), tail: lam(0xff2244), lamp: lam(0xfff2a8),
    shadow: new T.MeshBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.22, depthWrite: false }),
    flesh: lam(COL.flesh), mouth: lam(0x7a0f2a), marker: new T.MeshBasicMaterial({ color: 0xff3d57 }),
  };
  const mesh = (g, m, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) => {
    const o = new T.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); return o;
  };

  function makeEyes(r) {
    const g = new T.Group(), pupils = [];
    for (const sx of [-1, 1]) {
      const e = new T.Group(); e.position.x = sx * r * 1.15;
      e.add(mesh(GEO.ball, MAT.white, 0, 0, 0, r));
      const p = mesh(GEO.ball, MAT.black, 0, 0, -r * 0.72, r * 0.45); e.add(p); pupils.push(p);
      g.add(e);
    }
    g.userData.pupils = pupils;
    return g;
  }

  // Cars face -z. Everyone is a creature filling its car; you see the eyes through the glass.
  function makeCar(color) {
    const g = new T.Group(), paint = lam(color);
    g.add(mesh(GEO.disc, MAT.shadow, 0, 0.03, 0, 1.5, 1, 2.5));
    g.add(mesh(GEO.body, paint, 0, 0.68, 0));
    g.add(mesh(GEO.roof, paint, 0, 1.68, 0.25));
    for (const x of [-0.95, 0.95]) for (const z of [-1.3, 1.3]) g.add(mesh(GEO.wheel, MAT.tyre, x, 0.42, z));
    for (const x of [-0.62, 0.62]) {
      g.add(mesh(GEO.ball, MAT.lamp, x, 0.72, -2.05, 0.17));
      g.add(mesh(GEO.box, MAT.tail, x, 0.78, 2.08, 0.42, 0.16, 0.08));
    }
    const eyes = makeEyes(0.27); eyes.position.set(0, 1.3, 0.25); g.add(eyes);
    g.add(mesh(GEO.glass, MAT.glass, 0, 1.3, 0.25));
    return { g, paint, eyes };
  }

  // ---------- world ----------
  scene.add(mesh(new T.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), lam(COL.grass), 0, -0.05, -150));
  scene.add(mesh(new T.PlaneGeometry(ROAD_HALF * 2 + 2.4, 900).rotateX(-Math.PI / 2), lam(COL.road), 0, 0, -150));
  for (const sx of [-1, 1]) scene.add(mesh(new T.PlaneGeometry(0.5, 900).rotateX(-Math.PI / 2), lam(COL.edge), sx * (ROAD_HALF + 0.6), 0.01, -150));
  const dashes = new T.Group();
  {
    const dg = new T.PlaneGeometry(0.28, 4).rotateX(-Math.PI / 2), dm = lam(COL.line);
    for (let l = 1; l < LANES; l++) for (let z = -396; z <= 60; z += 12) dashes.add(mesh(dg, dm, laneX(l) - LANE_W / 2, 0.012, z));
    scene.add(dashes);
  }

  function billboard(text) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#fff6e0'; x.fillRect(0, 0, 512, 256);
    x.strokeStyle = '#2b1b4a'; x.lineWidth = 18; x.strokeRect(9, 9, 494, 238);
    x.fillStyle = '#2b1b4a'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const lines = text.split('\n');
    x.font = '900 ' + (lines.length > 2 ? 50 : 62) + 'px "Arial Black", Impact, sans-serif';
    lines.forEach((l, i) => x.fillText(l, 256, 128 + (i - (lines.length - 1) / 2) * (lines.length > 2 ? 60 : 74)));
    const g = new T.Group();
    g.add(mesh(new T.PlaneGeometry(9, 4.5), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c) }), 0, 6.5, 0));
    g.add(mesh(GEO.box, lam(COL.ink), 0, 6.5, -0.12, 9.4, 4.9, 0.2));
    for (const px of [-3, 3]) g.add(mesh(GEO.cyl, lam(COL.ink), px, 2.2, -0.15, 0.18, 4.4, 0.18));
    return g;
  }
  const SIGNS = ['YOU ARE\nDOING GREAT', 'OTHER DRIVERS\nNEXT 900 KM', 'HONK IF\nYOU’RE RIGHT', 'IT WAS\nTHEIR FAULT', 'MERGE LIKE\nYOU MEAN IT', 'KEEP CALM\n(THEY WON’T)'];

  const scenery = [];
  function addScenery(g, d, x, par = 1) { g.position.x = x; scene.add(g); scenery.push({ g, d, par }); }
  for (let i = 0; i < 64; i++) {
    const side = i % 2 ? 1 : -1, d = (i / 64) * LOOP + rand(-3, 3), x = side * (ROAD_HALF + rand(5, 42));
    const g = new T.Group(), c = pick(COL.candy), k = Math.random();
    if (k < 0.45) { // lollipop tree
      const h = rand(2.5, 5);
      g.add(mesh(GEO.cyl, lam(0xfff6e0), 0, h / 2, 0, 0.22, h, 0.22)); g.add(mesh(GEO.ball, lam(c), 0, h + 1.2, 0, rand(1.4, 2.2)));
    } else if (k < 0.7) { // cone tree
      const h = rand(4, 7);
      g.add(mesh(GEO.cyl, lam(0xb5651d), 0, 0.6, 0, 0.3, 1.2, 0.3)); g.add(mesh(GEO.cone, lam(0x2ec4b6), 0, 1.2 + h / 2, 0, 1.7, h, 1.7));
    } else { // toy house
      const w = rand(3.5, 6), h = rand(3, 5);
      g.add(mesh(GEO.box, lam(c), 0, h / 2, 0, w, h, w)); g.add(mesh(new T.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), lam(COL.ink), 0, h + 1.1, 0, w * 0.85, 2.2, w * 0.85));
      g.add(mesh(GEO.box, lam(0xfff6e0), -side * (w / 2 + 0.02), h * 0.45, 0, 0.1, 1.2, 1.2));
    }
    addScenery(g, d, x);
  }
  SIGNS.forEach((t, i) => { const side = i % 2 ? 1 : -1, g = billboard(t); g.rotation.y = -side * 0.35; addScenery(g, (i + 0.5) * (LOOP / SIGNS.length), side * (ROAD_HALF + 8)); });
  for (let i = 0; i < 10; i++) { // hills
    const side = i % 2 ? 1 : -1, r = rand(22, 46);
    addScenery(mesh(GEO.ball, lam(pick([0x9be8c4, 0xb8f0a0, 0xffe08a, 0xffb3d1])), 0, -r * 0.45, 0, r), (i / 10) * LOOP, side * (ROAD_HALF + 60 + rand(0, 60)));
  }
  for (let i = 0; i < 12; i++) { // clouds
    const g = new T.Group(), m = lam(0xffffff, { emissive: 0x554455 });
    for (let j = 0; j < 4; j++) g.add(mesh(GEO.ball, m, j * 4 - 6, rand(-1, 1), rand(-2, 2), rand(3, 5), rand(2, 3), rand(3, 4)));
    g.position.y = rand(32, 60);
    addScenery(g, (i / 12) * LOOP, rand(-130, 130), 0.25);
  }

  // ---------- player ----------
  const P = { g: new T.Group(), x: 0, vx: 0, d: 0, v: 0, scale: 1, shown: 1 };
  const pm = makeCar(COL.red);
  P.model = pm.g; P.paint = pm.paint; P.g.add(pm.g); scene.add(P.g);
  pm.g.remove(pm.eyes);
  P.eyes = makeEyes(0.34); P.eyes.position.set(0, 1.34, -0.42); pm.g.add(P.eyes);
  P.brows = [-1, 1].map((sx) => { const b = mesh(GEO.box, MAT.black, sx * 0.4, 1.72, -0.72, 0.52, 0.12, 0.14); pm.g.add(b); return b; });
  // the grille is a mouth
  P.mouth = new T.Group(); P.mouth.position.set(0, 0.62, -2.08);
  P.mouth.add(mesh(GEO.ball, MAT.mouth, 0, 0, 0, 0.55, 0.3, 0.12));
  P.mouth.add(mesh(GEO.box, MAT.white, 0, 0.2, -0.06, 0.6, 0.12, 0.08));
  pm.g.add(P.mouth);
  // flesh that pushes out of the car as you grow: [x, y, z, radius, stage]
  P.blobs = [
    [-0.9, 1.3, 0.3, 0.42, 1], [0.9, 1.3, 0.3, 0.42, 1], [0, 1.82, 0.4, 0.6, 2], [0, 1.05, -1.5, 0.62, 3],
    [-1.0, 0.75, -1.3, 0.5, 4], [1.0, 0.75, -1.3, 0.5, 4], [0, 1.15, 1.6, 0.7, 5], [-0.95, 0.85, 1.2, 0.55, 6],
    [0.95, 0.85, 1.2, 0.55, 6], [0, 2.1, -0.2, 0.75, 7], [-0.8, 1.6, -0.6, 0.55, 8], [0.8, 1.6, 0.9, 0.6, 8], [0, 1.4, 0.2, 1.25, 9],
  ].map(([x, y, z, r, st]) => { const m = mesh(GEO.ball, MAT.flesh, x, y, z, 0.001); m.userData = { r, st, ph: rand(0, 6) }; pm.g.add(m); return m; });
  // the fist that comes out of the window when you scream
  P.arm = new T.Group(); P.arm.position.set(-0.85, 1.3, 0.2);
  P.arm.add(mesh(GEO.cyl, MAT.flesh, -0.45, 0.2, 0, 0.14, 1, 0.14).rotateZ(1.1));
  P.arm.add(mesh(GEO.ball, MAT.flesh, -0.95, 0.5, 0, 0.26));
  P.arm.scale.setScalar(0.001); pm.g.add(P.arm);
  const paintFrom = new T.Color(COL.red), paintTo = new T.Color(COL.flesh);

  // ---------- traffic ----------
  const cars = [];
  for (let i = 0; i < N_CARS; i++) {
    const c = makeCar(pick(COL.cars));
    c.color0 = c.paint.color.clone(); scene.add(c.g); cars.push(c);
  }
  const marker = mesh(GEO.cone, MAT.marker, 0, 0, 0, 0.6, 1.3, 0.6); marker.rotation.x = Math.PI; marker.visible = false; scene.add(marker);

  function laneFree(lane, d, margin, self) {
    const x = laneX(lane);
    for (const o of cars) if (o !== self && o.state !== 'flung' && Math.abs(o.x - x) < 2.2 && Math.abs(o.d - d) < margin) return false;
    return !(self && Math.abs(P.x - x) < 0.95 * P.scale + 1.2 && Math.abs(P.d - d) < margin + 2 * P.scale);
  }
  function respawn(c, d) {
    for (let tries = 0; tries < 12; tries++) {
      const lane = (Math.random() * LANES) | 0, dd = d === undefined ? P.d + rand(130, 260) : d + rand(-10, 10);
      if (!laneFree(lane, dd, 14, c)) continue;
      c.lane = lane; c.x = laneX(lane); c.d = dd; break;
    }
    c.baseV = rand(15, 23) - c.lane * 1.2; c.v = c.baseV; c.state = 'normal'; c.y = 0; c.t = 0; c.brake = 0;
    c.laneT = rand(2, 9); c.paint.color.copy(c.color0); c.g.rotation.set(0, 0, 0); c.eyes.rotation.y = 0; c.g.scale.setScalar(1);
  }

  // ---------- particles ----------
  const parts = [];
  for (let i = 0; i < 70; i++) { const m = mesh(GEO.ball, lam(0xffffff), 0, -50, 0, 0.2); m.visible = false; scene.add(m); parts.push({ m, life: 0, vx: 0, vy: 0, vz: 0, g: 0 }); }
  let partI = 0;
  function puff(x, y, z, vx, vy, vz, color, size, life, grav = 0) {
    const p = parts[partI = (partI + 1) % parts.length];
    p.m.material.color.setHex(color); p.m.position.set(x, y, z); p.m.scale.setScalar(size); p.m.visible = true;
    p.vx = vx; p.vy = vy; p.vz = vz; p.life = p.max = life; p.g = grav; p.size = size;
  }

  // ---------- audio ----------
  const A = { ctx: null, muted: false };
  function audioInit() {
    if (A.ctx) { A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = A.ctx = new AC();
    A.master = c.createGain(); A.master.gain.value = A.muted ? 0 : 0.8; A.master.connect(c.destination);
    A.eng = c.createOscillator(); A.eng.type = 'sawtooth'; A.eng.frequency.value = 50;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    A.engGain = c.createGain(); A.engGain.gain.value = 0; A.eng.connect(lp); lp.connect(A.engGain); A.engGain.connect(A.master); A.eng.start();
    A.scr = c.createOscillator(); A.scr.type = 'sawtooth'; A.scr.frequency.value = 340;
    const lfo = c.createOscillator(); lfo.frequency.value = 9; const lg = c.createGain(); lg.gain.value = 28; lfo.connect(lg); lg.connect(A.scr.frequency); lfo.start();
    A.scrGain = c.createGain(); A.scrGain.gain.value = 0;
    for (const f of [820, 1250, 2700]) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; A.scr.connect(bp); bp.connect(A.scrGain); }
    A.scrGain.connect(A.master); A.scr.start();
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    if (!A.ctx) return;
    const c = A.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    horn: () => { tone('square', 440, 440, 0.28, 0.07); tone('square', 554, 554, 0.28, 0.07); },
    bump: () => tone('triangle', 140, 45, 0.18, 0.3),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.16, 0.16, i * 0.07)),
    lose: () => tone('sawtooth', 300, 60, 0.6, 0.14),
    boom: () => { tone('sawtooth', 220, 30, 1.1, 0.3); tone('square', 90, 25, 1.2, 0.25); },
  };
  $('mute').addEventListener('click', () => {
    A.muted = !A.muted; $('mute').textContent = A.muted ? '🔇' : '🔊';
    if (A.master) A.master.gain.value = A.muted ? 0 : 0.8;
  });

  // ---------- input ----------
  const key = { l: false, r: false, brake: false, scream: false };
  const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowDown: 'brake', KeyS: 'brake', Space: 'scream' };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') $('mute').click();
    if ((e.code === 'Enter' || e.code === 'Space') && G.mode !== 'play' && G.mode !== 'ending' && G.lock <= 0) { start(); e.preventDefault(); return; }
    const k = KEYS[e.code]; if (k) { key[k] = true; e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) key[k] = false; });
  addEventListener('blur', () => { for (const k in key) key[k] = false; });
  for (const [id, k] of [['bL', 'l'], ['bR', 'r'], ['bScream', 'scream']]) {
    const b = $(id), set = (v) => (e) => { e.preventDefault(); key[k] = v; b.classList.toggle('down', v); };
    b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); set(true)(e); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, set(false));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  $('start').addEventListener('click', () => start());
  $('again').addEventListener('click', () => start());

  // ---------- game state ----------
  const G = { mode: 'title', t: 0, lock: 0 };
  function reset() {
    Object.assign(G, { rage: 20, lungs: 1, blames: 0, bumps: 0, escaped: 0, culprit: null, cool: 3.5, bumpCool: 0, yellT: 0, shake: 0, screaming: false, winded: false, endT: 0, bannerT: 0, startD: P.d });
    Object.assign(P, { x: laneX(1), vx: 0, v: 24, scale: 1, shown: 1 });
    P.g.visible = true;
    cars.forEach((c, i) => respawn(c, P.d + 30 + i * 9));
    marker.visible = false; $('tag').hidden = true; $('yells').textContent = '';
  }
  function start() {
    audioInit(); reset(); G.mode = 'play';
    $('title').hidden = true; $('over').hidden = true;
    $('hud').hidden = false; $('mirror').hidden = false; $('touch').hidden = false;
    banner('You’re a great driver. Stay calm.', 2.5);
  }
  function banner(text, secs = 2.2) { const b = $('banner'); b.textContent = text; b.classList.add('on'); G.bannerT = secs; }

  const v3 = new T.Vector3();
  function toScreen(x, y, z) { v3.set(x, y, z).project(cam); return v3.z < 1 ? [(v3.x * 0.5 + 0.5) * W, (-v3.y * 0.5 + 0.5) * H] : null; }
  function yell(text, x, y, z, them) {
    const s = toScreen(x, y, z); if (!s) return;
    const el = document.createElement('div'); el.className = 'yell' + (them ? ' them' : ''); el.textContent = text;
    el.style.transform = `translate(${clamp(s[0] + rand(-50, 30), 8, W - 190)}px, ${clamp(s[1] + rand(-30, 10), 60, H - 60)}px) rotate(${rand(-7, 7)}deg)`;
    el.addEventListener('animationend', () => el.remove());
    $('yells').appendChild(el);
  }
  const worldZ = (d) => -(d - P.d);

  function accuse(c, why) {
    G.culprit = c; c.state = 'culprit'; c.why = why; c.t = 0; c.blame = 0; c.fleeDelay = 0.7; c.weave = 0;
    c.eyes.rotation.y = Math.PI; // looks back at you, nervously
    G.rage += 12; G.shake = 0.5; sfx.horn();
    banner('THAT CAR ' + why);
    $('tagWhy').textContent = why; marker.visible = true;
  }
  function offend() {
    const stage = G.blames, pl = 2.1 * P.scale;
    const near = cars.filter((c) => c.state === 'normal' && c.d - P.d > pl + 4 && c.d - P.d < 48 + stage * 2);
    if (!near.length) return;
    const petty = Math.random() < 0.12 + stage * 0.09;
    if (petty) return accuse(pick(near), PETTY[Math.min(PETTY.length - 1, (Math.random() * (3 + stage)) | 0)]);
    const mine = clamp(Math.round(P.x / LANE_W + (LANES - 1) / 2), 0, LANES - 1);
    const ahead = near.filter((c) => Math.abs(c.x - P.x) < 1.6 && c.d - P.d < 28);
    if (ahead.length && Math.random() < 0.5) { const c = ahead[0]; c.brake = 0.9; return accuse(c, OFFENCES[1]); }
    const side = near.filter((c) => Math.abs(c.lane - mine) === 1 && c.d - P.d < 26);
    if (side.length) { const c = pick(side); c.lane = mine; return accuse(c, OFFENCES[0]); }
    accuse(pick(near), PETTY[0]);
  }
  function release(c, blamed) {
    G.culprit = null; marker.visible = false; $('tag').hidden = true;
    G.cool = Math.max(1, 3.2 - G.blames * 0.25);
    if (blamed) {
      c.state = 'blamed'; c.lane = c.x < 0 ? -1 : LANES; c.paint.color.lerp(new T.Color(0xffffff), 0.55);
      G.blames++; G.rage = Math.max(0, G.rage - (28 - G.blames * 1.5)); /* blaming helps less each time */ P.scale = 1 + G.blames * GROW; sfx.win();
      banner(pick(SMUG), 1.8);
      yell(pick(SORRY), c.x, 2.5, worldZ(c.d), true);
      for (let i = 0; i < 14; i++) puff(P.x + rand(-1, 1) * P.scale, rand(1, 2.5) * P.scale, rand(-1, 1) * P.scale, rand(-5, 5), rand(3, 9), rand(-5, 5), pick([COL.flesh, 0xffd23f, 0xffffff]), rand(0.15, 0.4), 0.9, 14);
      if (G.blames >= GOAL) { G.mode = 'ending'; G.endT = 0; banner('NOBODY LEFT TO BLAME…', 4); }
    } else {
      c.state = 'normal'; c.eyes.rotation.y = 0; c.baseV = FLEE + 4;
      G.rage += 18; G.escaped++; G.shake = 0.8; sfx.lose(); banner('THEY GOT AWAY WITH IT!!');
    }
  }

  function bump(c, big) {
    G.shake = Math.max(G.shake, 0.4);
    if (G.bumpCool > 0) return;
    G.bumps++; G.bumpCool = 0.8; G.rage += c === G.culprit ? 1 : big ? 2.5 : 4; sfx.bump();
    yell(pick(['WATCH IT!', 'HEY!!', 'MY CAR!', 'EXCUSE ME?!']), P.x, 2.6 * P.scale, 0);
    if (!G.culprit && !big && c.state === 'normal' && G.mode === 'play') accuse(c, 'BUMPED INTO YOU!');
  }

  // ---------- update ----------
  function updateTraffic(dt, playing) {
    const pw = 0.95 * P.shown, pl = 2.1 * P.shown;
    for (const c of cars) {
      c.t += dt;
      if (c.state === 'flung') {
        c.x += c.fvx * dt; c.y += c.fvy * dt; c.fvy -= 26 * dt; c.d += c.v * dt;
        c.g.rotation.x += c.spin * dt; c.g.rotation.z += c.spin * 0.7 * dt;
        if (c.t > 2.6) respawn(c);
        continue;
      }
      // who is in front of me?
      let gap = 99, lead = null;
      for (const o of cars) { const dd = o.d - c.d; if (o !== c && o.state !== 'flung' && dd > 0 && dd < gap && Math.abs(o.x - c.x) < 2.0) { gap = dd; lead = o.v; } }
      { const dd = P.d - c.d - pl; if (dd > 0 && dd < gap && Math.abs(P.x - c.x) < pw + 1.0) { gap = dd; lead = P.v; } }
      let want = c.baseV, tx = laneX(c.lane);
      if (c.state === 'culprit') {
        want = FLEE + G.blames * 0.5 + (c.blame > 0 ? 3 : 0); // panics when yelled at
        if (c.fleeDelay > 0) { c.fleeDelay -= dt; want = c.brake > 0 ? 8 : c.baseV; }
        c.weave -= dt;
        const tail = P.d < c.d && c.d - P.d < 14 + pl && Math.abs(P.x - c.x) < pw + 1.4;
        if (c.weave <= 0 && c.fleeDelay <= 0 && (gap < 20 || tail)) {
          const opts = [c.lane - 1, c.lane + 1].filter((l) => l >= 0 && l < LANES && laneFree(l, c.d + 4, 11, c));
          if (opts.length) { c.lane = pick(opts); c.weave = 1.1; }
        }
      } else if (c.state === 'blamed') {
        want = 7; tx = Math.sign(c.x || 1) * (ROAD_HALF + 3);
      } else {
        if (c.brake > 0) want = 8;
        c.laneT -= dt;
        if (c.laneT <= 0) { c.laneT = rand(4, 11); const l = c.lane + (Math.random() < 0.5 ? -1 : 1); if (l >= 0 && l < LANES && laneFree(l, c.d, 13, c)) c.lane = l; }
        if (!playing && Math.abs(c.d - P.d) < 14 && Math.abs(c.x - P.x) < 2.6) c.lane = c.lane >= 2 ? 3 : 0;
      }
      c.brake -= dt;
      if (lead !== null && gap < 16 && c.state !== 'blamed') want = Math.min(want, lead - (gap < 7.5 ? 5 : 0));
      c.v += clamp(want - c.v, -22 * dt, 9 * dt); c.v = Math.max(c.v, 2);
      c.d += c.v * dt;
      const px = c.x; c.x += clamp(tx - c.x, -5.5 * dt, 5.5 * dt);
      c.g.rotation.y = -(c.x - px) / dt * 0.035;

      // collide with the player
      if (playing) {
        const dx = c.x - P.x, dd = c.d - P.d, ox = pw + 0.95 - Math.abs(dx), od = pl + 2.1 - Math.abs(dd);
        if (ox > 0 && od > 0) {
          const big = P.shown >= 2.2 || G.mode === 'ending';
          if (big && c.state !== 'culprit') {
            c.state = 'flung'; c.t = 0; c.fvx = (dx >= 0 ? 1 : -1) * rand(9, 16); c.fvy = rand(9, 14); c.spin = rand(-8, 8); c.v = P.v + rand(2, 10);
            bump(c, true);
          } else if (ox < od * 0.6) {
            c.x += Math.sign(dx || 1) * ox; P.vx -= Math.sign(dx || 1) * 3; bump(c, false);
          } else if (dd > 0) { // I ran into them (their fault)
            P.d = c.d - (pl + 2.1); P.v = Math.min(P.v, c.v - 1); c.v += 2; bump(c, false);
          } else { c.d = P.d - (pl + 2.1); c.v = Math.min(c.v, P.v - 1); bump(c, false); }
        }
      }
      const rel = c.d - P.d;
      if (c.state !== 'culprit') { if (rel < -70) respawn(c); else if (rel > 290) respawn(c, P.d - 62); }
    }
  }

  function update(dt) {
    const ending = G.mode === 'ending';
    // steer
    const steer = (key.r ? 1 : 0) - (key.l ? 1 : 0);
    P.vx = lerp(P.vx, steer * (11 + P.scale), 1 - Math.exp(-dt * 9));
    P.x += P.vx * dt;
    const lim = Math.max(0, ROAD_HALF + 1.3 - 0.95 * P.shown);
    if (Math.abs(P.x) > lim) { P.x = clamp(P.x, -lim, lim); P.vx = 0; }
    if (ending) P.x = lerp(P.x, 0, dt * 2);

    // throttle: cruise on your own, floor it when someone needs telling
    const c = G.culprit;
    let want = CRUISE;
    if (c) {
      const dd = c.d - P.d;
      want = dd < 9 + 3 * P.scale ? clamp(c.v + dd * 1.6, c.v - 7, CHASE + G.blames * 0.6) : CHASE + G.blames * 0.6;
    }
    if (key.brake) want = 9;
    if (ending) want = 34;
    P.v += clamp(want - P.v, -30 * dt, 11 * dt);
    P.d += P.v * dt;
    P.shown = lerp(P.shown, P.scale, 1 - Math.exp(-dt * 3));

    // scream
    if (G.lungs <= 0) G.winded = true;
    if (G.winded && G.lungs > 0.35) G.winded = false;
    G.screaming = key.scream && !G.winded && !ending;
    G.lungs = clamp(G.lungs + (G.screaming ? -dt / LUNG_TIME : dt / 2.2), 0, 1);
    const range = 7 + 3.2 * P.scale;
    let inRange = false;
    if (c) {
      const dx = c.x - P.x, dd = c.d - P.d;
      inRange = Math.hypot(dx, dd) < range;
      G.rage += 1.6 * dt;
      if (G.screaming && inRange) {
        c.blame += dt / BLAME_TIME; c.g.rotation.z = Math.sin(G.t * 40) * 0.08;
      } else c.blame = Math.max(0, c.blame - dt * 0.25);
      if (c.blame >= 1) release(c, true);
      else if (c.t > CHASE_TIME || dd > 170 || dd < -60) release(c, false);
    } else if (!ending) {
      G.cool -= dt; if (G.cool <= 0) { offend(); if (!G.culprit) G.cool = 0.5; }
    }
    if (G.screaming) {
      G.yellT -= dt; G.shake = Math.max(G.shake, 0.25);
      if (G.yellT <= 0) { G.yellT = 0.3; yell(pick(YELLS), P.x, 2.4 * P.shown, -1); }
      puff(P.x + rand(-0.4, 0.4), 0.7 * P.shown, -2.3 * P.shown, rand(-3, 3), rand(1, 4), -rand(8, 16), 0xffffff, rand(0.08, 0.2) * P.shown, 0.4);
      // screaming near innocent cars startles them
      for (const o of cars) if (o.state === 'normal' && o.laneT > 0.3 && Math.hypot(o.x - P.x, o.d - P.d) < range * 0.8) o.laneT = Math.min(o.laneT, rand(0.2, 1.2));
    }
    G.bumpCool -= dt;
    if (!ending) G.rage += 0.8 * dt; // traffic exists, which is already annoying
    G.rage = clamp(G.rage, 0, 100);

    updateTraffic(dt, true);

    if (ending) {
      G.endT += dt; P.scale = 1 + GOAL * GROW + G.endT * 1.6; G.rage = Math.max(0, G.rage - 30 * dt);
      if (G.endT > 4.2) finish(true);
    } else if (G.rage >= 100) explode();

    // HUD
    $('rage').style.width = G.rage + '%';
    $('lungs').style.width = G.lungs * 100 + '%';
    $('lungs').style.opacity = G.winded ? 0.4 : 1;
    $('count').textContent = `BLAMED ${G.blames}/${GOAL}`;
    if (G.culprit) {
      const k = G.culprit, s = toScreen(k.x, 4.6, worldZ(k.d)), tag = $('tag');
      tag.hidden = !s;
      if (s) {
        tag.style.transform = `translate(${clamp(s[0], 70, W - 70)}px, ${Math.max(s[1], 70)}px) translate(-50%, -100%)`;
        $('tagBlame').style.width = k.blame * 100 + '%';
        $('tagTime').style.width = (1 - k.t / CHASE_TIME) * 100 + '%';
        $('tagHint').textContent = inRange ? (G.screaming ? '' : G.winded ? 'CATCH YOUR BREATH' : 'SCREAM!') : 'GET CLOSER';
      }
      marker.position.set(k.x, 3.4 + Math.sin(G.t * 8) * 0.3, worldZ(k.d)); marker.rotation.y = G.t * 3;
    }
  }

  function explode() {
    G.mode = 'dead'; P.g.visible = false; sfx.boom(); G.shake = 2;
    for (let i = 0; i < 60; i++) puff(P.x, 1.5 * P.shown, 0, rand(-14, 14), rand(4, 20), rand(-14, 14), pick([COL.flesh, COL.fleshDark, COL.red, 0xffffff]), rand(0.2, 0.7) * P.shown, 2.2, 22);
    if (G.culprit) { G.culprit.state = 'normal'; G.culprit = null; }
    marker.visible = false; $('tag').hidden = true;
    setTimeout(() => finish(false), 1500);
  }
  function finish(won) {
    G.mode = 'over'; G.lock = 0.8; key.scream = false;
    $('hud').hidden = true; $('mirror').hidden = true; $('touch').hidden = true; $('banner').classList.remove('on');
    $('overTitle').textContent = won ? 'YOU ARE THE TRAFFIC NOW' : 'YOU BLEW A GASKET';
    const rows = [['Drivers blamed', G.blames], ['Got away with it', G.escaped], ['Cars that hit you', G.bumps], ['Distance', ((P.d - G.startD) / 1000).toFixed(1) + ' km'], ['Your fault', '0%']];
    $('report').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    $('verdict').textContent = won
      ? 'You fill every lane. There is no one left to blame. (Their fault.)'
      : 'Official cause of accident: everyone else.';
    $('over').hidden = false;
    if (A.scrGain) A.scrGain.gain.value = 0;
  }

  // ---------- per-frame visuals ----------
  function animatePlayer(dt) {
    const s = P.shown, stage = (s - 1) / GROW, rage = G.mode === 'title' ? 0.25 : (G.rage || 0) / 100, scr = G.screaming ? 1 : 0;
    P.g.position.set(P.x, 0, 0);
    P.g.scale.setScalar(s);
    P.model.rotation.y = -P.vx * 0.025; P.model.rotation.z = -P.vx * 0.012;
    P.model.position.y = Math.abs(Math.sin(G.t * 30)) * 0.03 * (0.4 + rage + scr);
    P.paint.color.copy(paintFrom).lerp(paintTo, clamp(stage / 7, 0, 1)).lerp(new T.Color(0xff1f3d), rage * 0.35);
    const eg = 1 + Math.min(stage, 12) * 0.11 + scr * 0.15;
    P.eyes.scale.setScalar(eg + Math.sin(G.t * 23) * 0.03 * rage);
    P.eyes.position.y = 1.34 + (eg - 1) * 0.22;
    const look = G.culprit ? clamp((G.culprit.x - P.x) / 12, -0.5, 0.5) : Math.sin(G.t * 0.7) * 0.25;
    for (const p of P.eyes.userData.pupils) { p.position.x = look * 0.12; p.scale.setScalar(0.34 * (0.5 - rage * 0.18 - scr * 0.1)); }
    P.brows.forEach((b, i) => { const sx = i ? 1 : -1; b.rotation.z = sx * (0.15 + rage * 0.55 + scr * 0.2); b.position.y = 1.72 + (eg - 1) * 0.55 - rage * 0.05; b.position.x = sx * 0.4 * (1 + (eg - 1) * 0.5); b.scale.x = 0.52 * eg; });
    const open = lerp(P.mouth.scale.y, scr ? 2.3 + Math.sin(G.t * 34) * 0.5 : 0.45 + rage * 0.4, 0.3);
    P.mouth.scale.set(1 + Math.min(stage, 10) * 0.07 + scr * 0.25, open, 1);
    P.arm.scale.setScalar(lerp(P.arm.scale.x, scr ? 1 : 0.001, 0.25)); P.arm.rotation.z = Math.sin(G.t * 28) * 0.35; P.arm.rotation.y = Math.sin(G.t * 19) * 0.3;
    for (const b of P.blobs) { const u = b.userData, k = clamp(stage - u.st + 1, 0, 1); b.scale.setScalar(Math.max(0.001, u.r * k * (1 + Math.sin(G.t * 5 + u.ph) * 0.06 + scr * 0.08))); }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - (frame.last || now)) / 1000); frame.last = now;
    G.t += dt; G.lock -= dt;
    if (G.mode === 'play' || G.mode === 'ending') update(dt);
    else { // title / aftermath: the world keeps rolling
      if (G.mode === 'title') { P.v = 22; P.vx = Math.sin(G.t * 0.8) * 1.2; P.x = clamp(P.x + P.vx * dt, -3, 3); }
      else P.v = Math.max(0, P.v - 20 * dt);
      P.d += P.v * dt; updateTraffic(dt, false);
    }
    if (G.bannerT > 0 && (G.bannerT -= dt) <= 0) $('banner').classList.remove('on');

    animatePlayer(dt);
    for (const c of cars) { c.g.position.set(c.x, c.y, worldZ(c.d)); c.g.visible = c.d - P.d > -80; }
    dashes.position.z = P.d % 12;
    for (const s of scenery) s.g.position.z = -(mod(s.d - P.d * s.par + 60, LOOP) - 60);
    for (const p of parts) if (p.life > 0) {
      p.life -= dt; p.vy -= p.g * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(p.size * Math.max(0.01, p.life / p.max)); if (p.life <= 0) p.m.visible = false;
    }

    // cameras
    const s = P.shown, k = Math.pow(s, 0.85);
    G.shake = Math.max(0, (G.shake || 0) - dt * 2);
    const sh = calm ? 0 : G.shake * 0.25 + (G.rage || 0) / 100 * 0.04, jx = rand(-sh, sh), jy = rand(-sh, sh);
    if (G.mode === 'title') {
      const a = Math.sin(G.t * 0.25) * 0.5;
      cam.position.set(P.x + Math.sin(a) * 9 + 2.5, 2.6, -8.5 * Math.cos(a)); cam.lookAt(P.x, 1.3, 0);
    } else {
      const tall = W < H ? 1.25 : 1;
      cam.position.set(P.x * 0.65 + jx, (3.6 * k + 1.2) * tall + jy, (8.5 * k + 2.5) * tall);
      cam.lookAt(P.x * 0.85, 1.2 * s, -14 - 4 * s);
    }
    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
    renderer.render(scene, cam);
    if (!$('mirror').hidden) {
      const r = $('mirror').getBoundingClientRect(), g = root.getBoundingClientRect(), b = 5;
      const vx = r.left - g.left + b, vy = H - (r.bottom - g.top) + b, vw = r.width - 2 * b, vh = r.height - 2 * b;
      faceCam.aspect = vw / vh; faceCam.updateProjectionMatrix();
      faceCam.position.set(P.x + jx * 2, 1.5 * s, -9 * s - 1); faceCam.lookAt(P.x, 1.25 * s, 0);
      renderer.setScissorTest(true); renderer.setScissor(vx, vy, vw, vh); renderer.setViewport(vx, vy, vw, vh);
      marker.visible = false; renderer.render(scene, faceCam); marker.visible = !!G.culprit;
    }

    if (A.ctx) {
      const live = G.mode === 'play' || G.mode === 'ending', tnow = A.ctx.currentTime;
      A.engGain.gain.setTargetAtTime(live ? 0.05 : 0, tnow, 0.1);
      A.eng.frequency.setTargetAtTime(38 + P.v * 1.7, tnow, 0.1);
      A.scrGain.gain.setTargetAtTime(live && G.screaming ? 0.5 : 0, tnow, 0.03);
      A.scr.frequency.setTargetAtTime(330 + (G.rage || 0) * 2.2 - P.shown * 22, tnow, 0.05);
    }
    requestAnimationFrame(frame);
  }

  resize();
  reset(); G.mode = 'title'; P.x = 0;
  cars.forEach((c, i) => respawn(c, P.d + (i - 6) * 11));
  window.__blame = { G, P, cars, key }; // for poking at the game from the console
  requestAnimationFrame(frame);
})();
