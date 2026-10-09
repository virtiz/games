/* Emberveil RTS — input, HUD overlay (2D canvas), audio. World is rendered by EmberRender (Three.js). */
(function () {
  'use strict';
  const Sim = window.EmberveilSim;
  const worldCanvas = document.getElementById('world');
  const ui = document.getElementById('ui');
  const ctx = ui.getContext('2d');
  const mobile = window.matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  let R3 = null;
  try { R3 = window.EmberRender.createRenderer(worldCanvas, Sim, { mobile }); }
  catch (e) { console.warn('WebGL unavailable', e); }

  let W = 1280, H = 720, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    ui.width = Math.floor(W * dpr); ui.height = Math.floor(H * dpr);
    ui.style.width = W + 'px'; ui.style.height = H + 'px';
    worldCanvas.style.width = W + 'px'; worldCanvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (R3) R3.resize(W, H, window.devicePixelRatio || 1);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ------------------------------ Audio ------------------------------ */
  let audioCtx = null, muted = false, musicNodes = null, musicStarted = false, master = null, sfxBus = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      audioCtx = new AC();
      master = audioCtx.createGain(); master.gain.value = 0.9; master.connect(audioCtx.destination);
      sfxBus = audioCtx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function noiseBuf(ac, dur) {
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b;
  }
  let nb = null;
  function tone(freq, dur, type, gain, slide) {
    const ac = ensureAudio(); if (!ac || muted) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), ac.currentTime + dur);
    g.gain.setValueAtTime(gain || 0.04, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur);
    o.connect(g); g.connect(sfxBus); o.start(); o.stop(ac.currentTime + dur + 0.02);
  }
  function noise(dur, gain, f0, f1, q) {
    const ac = ensureAudio(); if (!ac || muted) return;
    nb = nb || noiseBuf(ac, 1.5);
    const s = ac.createBufferSource(); s.buffer = nb;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, ac.currentTime); f.frequency.exponentialRampToValueAtTime(f1, ac.currentTime + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(gain, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(); s.stop(ac.currentTime + dur + 0.02);
  }
  function sfx(name) {
    if (muted) return;
    if (name === 'select') tone(520, 0.06, 'sine', 0.035, 1.3);
    else if (name === 'move') { tone(260, 0.09, 'triangle', 0.03, 0.8); }
    else if (name === 'shoot') { noise(0.09, 0.05, 2600, 600, 1.2); tone(140, 0.06, 'square', 0.015, 0.5); }
    else if (name === 'explode') { noise(0.7, 0.16, 700, 60, 0.6); tone(70, 0.5, 'sine', 0.12, 0.4); }
    else if (name === 'capture') { tone(440, 0.18, 'sine', 0.04, 1.5); setTimeout(() => tone(660, 0.25, 'sine', 0.035, 1.2), 110); }
    else if (name === 'melee') { noise(0.14, 0.09, 4000, 900, 2); tone(110, 0.1, 'square', 0.03, 0.6); }
    else if (name === 'ui') tone(880, 0.04, 'sine', 0.02);
    else if (name === 'ability') { noise(0.6, 0.1, 300, 3000, 0.7); tone(180, 0.6, 'sawtooth', 0.04, 2); }
    else if (name === 'alert') { tone(330, 0.16, 'square', 0.03, 0.9); setTimeout(() => tone(250, 0.22, 'square', 0.03, 0.9), 170); }
    else if (name === 'ready') { tone(600, 0.08, 'sine', 0.03, 1.2); setTimeout(() => tone(800, 0.1, 'sine', 0.03, 1.1), 80); }
    else if (name === 'snipe') { noise(0.25, 0.08, 5000, 400, 3); }
    else if (name === 'flame') { noise(0.3, 0.05, 900, 300, 0.5); }
  }
  function startMusic() {
    if (musicStarted || muted) return;
    const ac = ensureAudio(); if (!ac) return;
    musicStarted = true;
    const mg = ac.createGain(); mg.gain.value = 0.05; mg.connect(master);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(mg);
    const drones = [55, 55.4, 82.4].map((f) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = ac.createGain(); g.gain.value = 0.22; o.connect(g); g.connect(lp); o.start(); return o; });
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07; const lg = ac.createGain(); lg.gain.value = 350; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const scale = [110, 130.81, 146.83, 164.81, 196, 220, 261.63];
    let step = 0;
    const iv = setInterval(() => {
      if (muted || !audioCtx) return;
      const t = ac.currentTime;
      if (step % 4 === 0 || step % 8 === 6) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g); g.connect(mg); o.start(t); o.stop(t + 0.4); }
      if (step % 8 === 0) {
        const n = scale[Math.floor(Math.random() * 5)];
        for (const det of [0, 3, 7]) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = n * Math.pow(2, det / 12); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.6); g.gain.exponentialRampToValueAtTime(0.001, t + 2.6); o.connect(g); g.connect(lp); o.start(t); o.stop(t + 2.7); }
      }
      step++;
    }, 340);
    musicNodes = { mg, iv, drones };
  }
  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.9;
    if (!muted) startMusic();
    toast(muted ? 'Sound muted' : 'Sound on');
  }
  /* ------------------------------ State ------------------------------ */
  let mode = 'menu';
  let state = null;
  let attract = null;
  let selected = new Set();
  let prodBuilding = null;
  const cam = { x: 1200, y: 900, zoom: 1.0, yaw: 0 };
  let boxSel = null, buildMode = null, buildMenu = false, attackMove = false, paused = false, menuOpen = false;
  let targeting = null; // { squadIds, aid }
  let playerFaction = 'vigilant', difficulty = 'normal', mapId = 'basin', speed = 1, tutorialMode = false;
  const keys = {};
  const groups = {};
  let buttons = [];
  let msg = '', msgT = 0;
  let lastSeq = 0;
  const mouse = { x: -1, y: -1, inside: false };
  const seenFx = new WeakSet();
  let shotT = 0, menuT = 0;
  const menuFocus = { x: 1200, y: 900 };
  let alerts = [], pings = [], lastAlert = null;
  let tipPinned = null, tipT = 0;
  let rdrag = null;
  let tut = null;

  function toast(m) { msg = m; msgT = 2.6; }
  const s2w = (sx, sy) => (R3 ? R3.screenToWorld(sx, sy) : { x: sx, y: sy });
  const w2s = (x, y, h) => (R3 ? R3.project(x, y, h || 0) : { x, y, vis: true });
  const PF = () => playerFaction;
  const isMine = (o) => o && o.playerId === playerFaction;
  const canSee = (o) => !state || !state.fogEnabled || o.playerId == null || o.playerId === playerFaction || Sim.isVisibleTo(state, playerFaction, o);

  function newAttract() {
    attract = Sim.createGame({ seed: 1000 + Math.floor(Math.random() * 9000), playerFaction: 'vigilant', difficulty: 'hard', headless: true, map: Math.random() < 0.5 ? 'basin' : 'causeway', fog: false });
    attract.players.vigilant.isAI = true;
    attract.players.vigilant.aiState.aggression = 0.9;
    for (let i = 0; i < Sim.TICK_RATE * 70; i++) Sim.step(attract, Sim.DT);
    if (R3) R3.reset(attract);
  }

  function startGame(tutorial) {
    tutorialMode = !!tutorial;
    state = Sim.createGame({ seed: (Date.now() % 100000) ^ 0xabc, playerFaction, difficulty: tutorialMode ? 'easy' : difficulty, map: tutorialMode ? 'basin' : mapId, tutorial: tutorialMode });
    selected = new Set(); prodBuilding = null; buildMode = null; buildMenu = false; attackMove = false; targeting = null; paused = false; menuOpen = false;
    alerts = []; pings = []; lastAlert = null; lastSeq = state.eventSeq || 0;
    const sp = state.map.hqSpawns[playerFaction];
    cam.x = sp.x + (playerFaction === 'vigilant' ? 160 : -160); cam.y = sp.y; cam.zoom = 1.15; cam.yaw = 0;
    mode = 'playing'; attract = null;
    if (R3) R3.reset(state);
    tut = tutorialMode ? { step: 0, t: 0, flash: 0, base: null } : null;
    toast(tutorialMode ? 'Tutorial: follow the objectives on the left' : Sim.FACTIONS[playerFaction].name + ': seize the Relays and break the enemy');
    ensureAudio(); startMusic();
  }
  function quitToMenu() { mode = 'menu'; state = null; menuOpen = false; paused = false; tut = null; newAttract(); }

  /* ------------------------------ Input ------------------------------ */
  ui.addEventListener('contextmenu', (e) => e.preventDefault());
  let midDrag = null;
  ui.addEventListener('mousedown', (e) => {
    ensureAudio(); startMusic();
    const sx = e.offsetX, sy = e.offsetY;
    if (mode !== 'playing' || menuOpen) { if (e.button === 0) hitButton(sx, sy); return; }
    if (e.button === 1) { midDrag = { x: sx, y: sy }; e.preventDefault(); return; }
    if (e.button === 0) {
      if (hitButton(sx, sy)) return;
      if (hitMinimap(sx, sy)) {
        if (targeting) { const w = minimapToWorld(sx, sy); fireTargeted(w.x, w.y); return; }
        jumpMinimap(sx, sy); boxSel = { minimap: true }; return;
      }
      if (targeting) { const w = s2w(sx, sy); fireTargeted(w.x, w.y); return; }
      boxSel = { x0: sx, y0: sy, x1: sx, y1: sy, add: e.shiftKey };
    } else if (e.button === 2) {
      if (targeting) { targeting = null; toast('Cancelled'); return; }
      if (buildMode) { buildMode = null; toast('Cancelled'); return; }
      if (hitMinimap(sx, sy)) { const w = minimapToWorld(sx, sy); command(w.x, w.y); return; }
      rdrag = { x0: sx, y0: sy, x1: sx, y1: sy };
    }
  });
  window.addEventListener('mousemove', (e) => {
    const r = ui.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.inside = true;
    if (midDrag && R3) {
      const a = s2w(midDrag.x, midDrag.y), b = s2w(mouse.x, mouse.y);
      cam.x -= b.x - a.x; cam.y -= b.y - a.y; midDrag = { x: mouse.x, y: mouse.y };
    }
    if (rdrag) { rdrag.x1 = mouse.x; rdrag.y1 = mouse.y; }
    if (boxSel && boxSel.minimap) { if (hitMinimap(mouse.x, mouse.y)) jumpMinimap(mouse.x, mouse.y); return; }
    if (boxSel) { boxSel.x1 = mouse.x; boxSel.y1 = mouse.y; }
  });
  document.addEventListener('mouseleave', () => { mouse.inside = false; });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 1) { midDrag = null; return; }
    if (e.button === 2 && rdrag && mode === 'playing') {
      const d = rdrag; rdrag = null;
      const w0 = s2w(d.x0, d.y0);
      if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 24) {
        const w1 = s2w(d.x1, d.y1);
        command(w0.x, w0.y, null, null, Math.atan2(w1.y - w0.y, w1.x - w0.x));
      } else command(w0.x, w0.y, d.x0, d.y0);
      return;
    }
    if (e.button !== 0 || !boxSel || mode !== 'playing') { boxSel = null; return; }
    const b = boxSel; boxSel = null;
    if (b.minimap) return;
    if (Math.abs(b.x1 - b.x0) < 6 && Math.abs(b.y1 - b.y0) < 6) leftClick(b.x0, b.y0, b.add);
    else selectBox(b, b.add);
  });
  ui.addEventListener('dblclick', (e) => {
    if (mode !== 'playing' || menuOpen) return;
    const hit = pickSquad(e.offsetX, e.offsetY);
    if (!hit) return;
    for (const s of state.squads) if (s.playerId === playerFaction && s.unitType === hit.unitType && !s.inside) { const p = w2s(s.x, s.y, 0.6); if (p.x > 0 && p.x < W && p.y > 0 && p.y < H) selected.add(s.id); }
  });
  ui.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (mode !== 'playing') return;
    cam.zoom = Sim.clamp(cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.4, 2.0);
  }, { passive: false });

  // touch
  let pinch = null, touchMoved = false, touchHold = null;
  ui.addEventListener('touchstart', (e) => {
    e.preventDefault(); ensureAudio(); startMusic();
    const r = ui.getBoundingClientRect();
    if (mode !== 'playing' || menuOpen) return;
    if (e.touches.length === 1) {
      const t = e.touches[0]; const sx = t.clientX - r.left, sy = t.clientY - r.top;
      touchMoved = false;
      if (hitButton(sx, sy)) { boxSel = null; return; }
      if (hitMinimap(sx, sy)) {
        if (targeting) { const w = minimapToWorld(sx, sy); fireTargeted(w.x, w.y); boxSel = null; return; }
        jumpMinimap(sx, sy); boxSel = { minimap: true }; return;
      }
      boxSel = { x0: sx, y0: sy, x1: sx, y1: sy, touch: true, t0: performance.now() };
    } else if (e.touches.length === 2) {
      boxSel = null;
      const a = e.touches[0], b = e.touches[1];
      pinch = { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top, d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
    }
  }, { passive: false });
  ui.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const r = ui.getBoundingClientRect();
    if (mode !== 'playing' || menuOpen) return;
    if (e.touches.length === 2 && pinch) {
      const a = e.touches[0], b = e.touches[1];
      const mx = (a.clientX + b.clientX) / 2 - r.left, my = (a.clientY + b.clientY) / 2 - r.top;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const w0 = s2w(pinch.x, pinch.y), w1 = s2w(mx, my);
      cam.x -= w1.x - w0.x; cam.y -= w1.y - w0.y;
      cam.zoom = Sim.clamp(cam.zoom * (d / pinch.d), 0.4, 2.0);
      pinch = { x: mx, y: my, d };
      return;
    }
    if (boxSel && boxSel.minimap) { const t = e.touches[0]; jumpMinimap(t.clientX - r.left, t.clientY - r.top); return; }
    if (boxSel && e.touches.length === 1) {
      const t = e.touches[0]; const nx = t.clientX - r.left, ny = t.clientY - r.top;
      if (Math.abs(nx - boxSel.x0) > 12 || Math.abs(ny - boxSel.y0) > 12) touchMoved = true;
      // one finger drag pans the camera (box select is via the Select-all button on touch)
      if (touchMoved) { const a = s2w(boxSel.x1, boxSel.y1), b = s2w(nx, ny); cam.x -= b.x - a.x; cam.y -= b.y - a.y; }
      boxSel.x1 = nx; boxSel.y1 = ny;
    }
  }, { passive: false });
  ui.addEventListener('touchend', (e) => {
    e.preventDefault();
    const r = ui.getBoundingClientRect();
    if (mode !== 'playing' || menuOpen) {
      const t = e.changedTouches[0]; if (t) hitButton(t.clientX - r.left, t.clientY - r.top);
      return;
    }
    if (e.touches.length < 2) pinch = null;
    if (!boxSel || boxSel.minimap) { boxSel = null; return; }
    const b = boxSel; boxSel = null;
    if (touchMoved) return;
    const w = s2w(b.x0, b.y0);
    if (targeting) { fireTargeted(w.x, w.y); return; }
    if (buildMode) { leftClick(b.x0, b.y0, false); return; }
    const own = pickSquad(b.x0, b.y0);
    const ownB = !own && selected.size && pickBuilding(w, 'mine');
    if (selected.size && !own && !ownB) command(w.x, w.y, b.x0, b.y0);
    else if (selected.size && own && Sim.UNIT_DEFS[own.unitType].capacity && !selected.has(own.id)) command(w.x, w.y, b.x0, b.y0);
    else leftClick(b.x0, b.y0, false);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (mode === 'menu') { if (k === 'enter') startGame(false); if (k === 'm') toggleMute(); return; }
    if (mode !== 'playing') return;
    if (k === 'escape') {
      if (targeting || buildMode || attackMove || buildMenu) { targeting = null; buildMode = null; attackMove = false; buildMenu = false; }
      else menuOpen = !menuOpen;
      return;
    }
    if (menuOpen) return;
    if (k === 'm') toggleMute();
    if (k === 'p') { paused = !paused; toast(paused ? 'Paused' : 'Resumed'); }
    if (k === ' ') { e.preventDefault(); if (lastAlert) { cam.x = lastAlert.x; cam.y = lastAlert.y; } }
    if (e.key >= '0' && e.key <= '9') {
      if (e.ctrlKey || e.metaKey) { groups[e.key] = [...selected]; toast('Group ' + e.key + ' set'); e.preventDefault(); }
      else if (groups[e.key]) {
        const ids = groups[e.key].filter((id) => Sim.findSquad(state, id));
        if (ids.length && selected.size === ids.length && ids.every((i) => selected.has(i))) { const s = Sim.findSquad(state, ids[0]); cam.x = s.x; cam.y = s.y; }
        selected = new Set(ids); prodBuilding = null; sfx('select');
      }
    }
    if (k === 'a') { attackMove = true; toast('Attack-move: choose a destination'); }
    if (k === 'r') doRetreat();
    if (k === 'f') doReinforce();
    if (k === 'u') doUpgrade();
    if (k === 't') doTier();
    if (k === 's') doStop();
    if (k === 'z') doStance();
    if (k === 'l') doUnload();
    if (k === 'b') setBuild('barracks');
    if (k === 'g') setBuild('generator');
    if (k === 'n') setBuild('bastion');
    if (k === 'k') setBuild('armory');
    if (k === 'v') setBuild('vehicleBay');
    if (k === 'x') setBuild('refinery');
    if (k === ',') selectIdleWorker();
    if (k === '.') selectIdleBuilder();
    if (k === 'h') selectHero();
    if (k === 'q' || k === 'e') useSlot(k === 'q' ? 0 : 1);
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  /* ------------------------------ Commands ------------------------------ */
  const BNAME = { refinery: 'Aether Siphon', barracks: 'Muster Hall', generator: 'Flux Dynamo', bastion: 'Relay Bastion', armory: 'War Forge', vehicleBay: 'Siege Cradle', hq: 'Command Nexus', bunker: 'Ruined Redoubt' };
  const selSquads = () => [...selected].map((id) => Sim.findSquad(state, id)).filter(Boolean);
  function setBuild(t) {
    const p = state.players[playerFaction];
    const d = Sim.BUILDING_DEFS[t];
    if (d.requiresTier && p.tier < d.requiresTier) { toast(BNAME[t] + ' requires Tier ' + d.requiresTier); return; }
    if (!state.squads.some((s) => isMine(s) && Sim.UNIT_DEFS[s.unitType].isBuilder)) { toast('You need builders - train them at the Command Nexus'); return; }
    buildMode = t; buildMenu = false;
    toast('Place ' + BNAME[t] + ' (' + d.costAether + ' Aether' + (d.costFlux ? ', ' + d.costFlux + ' Flux' : '') + ')' + (t === 'bastion' ? ' on an owned Relay' : t === 'refinery' ? ' next to a crystal field' : ''));
  }
  function doRetreat() { if (!selected.size) return; Sim.issueRetreat(state, [...selected]); toast('Fall back to the nearest structure!'); sfx('move'); }
  function doStop() { if (!selected.size) return; Sim.issueStop(state, [...selected]); sfx('ui'); }
  function doReinforce() { let ok = 0, why = ''; for (const id of selected) { const r = Sim.reinforceSquad(state, id); if (r.ok) ok++; else why = r.reason; } toast(ok ? 'Reinforcing (' + ok + ')' : 'Reinforce: ' + (why || 'select a squad')); if (ok) sfx('ui'); }
  function doUpgrade() { let ok = 0, why = ''; for (const id of selected) { const r = Sim.upgradeSquad(state, id); if (r.ok) ok++; else why = r.reason; } toast(ok ? 'Squad leader attached' : 'Leader: ' + (why || 'select a squad')); if (ok) sfx('capture'); }
  function doTier() { const p = state.players[playerFaction]; const r = Sim.researchTier(state, playerFaction, p.tier + 1); toast(r.ok ? 'Researching Tier ' + (p.tier + 1) + ' at the Command Nexus' : 'Tier up: ' + (r.reason === 'order' ? 'maxed' : r.reason)); if (r.ok) sfx('ui'); }
  const STANCES = ['aggressive', 'holdGround', 'holdFire'];
  const STANCE_NAME = { aggressive: 'Aggressive', holdGround: 'Hold Ground', holdFire: 'Hold Fire' };
  function doStance() {
    const sq = selSquads(); if (!sq.length) return;
    const next = STANCES[(STANCES.indexOf(sq[0].stance) + 1) % 3];
    Sim.setStance(state, sq.map((s) => s.id), next); toast('Stance: ' + STANCE_NAME[next]); sfx('ui');
  }
  function doUnload() {
    let n = 0; for (const s of selSquads()) if (Sim.UNIT_DEFS[s.unitType].capacity && s.cargo.length) { Sim.unloadTransport(state, s.id); n++; }
    toast(n ? 'Disembark!' : 'Select a loaded transport');
  }
  function selectHero() {
    const h = state.squads.find((s) => isMine(s) && Sim.UNIT_DEFS[s.unitType].isHero);
    if (h) { selected = new Set([h.id]); prodBuilding = null; cam.x = h.x; cam.y = h.y; }
    else toast('Your commander returns in ' + Math.ceil(Sim.heroRespawnIn(state, playerFaction)) + 's');
  }
  function selectIdleBuilder() {
    const bs = state.squads.filter((s) => isMine(s) && Sim.UNIT_DEFS[s.unitType].isBuilder);
    const idle = bs.find((s) => s.order === 'idle') || bs[0];
    if (idle) { selected = new Set([idle.id]); prodBuilding = null; cam.x = idle.x; cam.y = idle.y; } else toast('No builders');
  }
  function selectIdleWorker() {
    const ws = state.squads.filter((s) => isMine(s) && Sim.UNIT_DEFS[s.unitType].isWorker && !s.inside);
    const idle = ws.find((s) => s.order === 'idle') || ws[0];
    if (idle) { selected = new Set([idle.id]); prodBuilding = null; cam.x = idle.x; cam.y = idle.y; if (idle.order !== 'idle') toast('No idle workers'); } else toast('No workers - train them at the Command Nexus');
  }
  function pickNode(w) {
    let best = null, bd = 34;
    for (const n of state.nodes) { if (fogHidesNode(n)) continue; const d = Sim.dist(n.x, n.y, w.x, w.y); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function fogHidesNode(n) { return state.fogEnabled && R3 && R3.isExplored && !R3.isExplored(n.x, n.y); }
  function abilityName(aid) { return Sim.ABILITIES[aid].name; }
  function useSlot(i) {
    const sq = selSquads();
    for (const s of sq) { const d = Sim.UNIT_DEFS[s.unitType]; if (d.abilities[i]) { triggerAbility(sq.filter((q) => Sim.UNIT_DEFS[q.unitType].abilities[i] === d.abilities[i]).map((q) => q.id), d.abilities[i]); return; } }
  }
  function triggerAbility(ids, aid) {
    const a = Sim.ABILITIES[aid];
    const ready = ids.filter((id) => { const s = Sim.findSquad(state, id); return s && !Sim.abilityReady(state, s, aid); });
    if (!ready.length) { const s = Sim.findSquad(state, ids[0]); toast(a.name + ': ' + (s ? Sim.abilityReady(state, s, aid) : 'unavailable')); return; }
    if (a.target === 'point') { targeting = { squadIds: ready, aid }; toast(a.name + ': choose a target' + (mobile ? '' : ' (right-click cancels)')); return; }
    const r = Sim.useAbility(state, ready[0], aid);
    if (r.ok) { toast(a.name + '!'); sfx('ability'); } else toast(a.name + ': ' + r.reason);
  }
  function fireTargeted(x, y) {
    const t = targeting; targeting = null;
    const a = Sim.ABILITIES[t.aid];
    // closest ready squad in range fires
    let best = null, bd = 1e9;
    for (const id of t.squadIds) { const s = Sim.findSquad(state, id); if (!s || Sim.abilityReady(state, s, t.aid)) continue; const d = Sim.dist(s.x, s.y, x, y); if (d < bd) { bd = d; best = s; } }
    if (!best) { toast(a.name + ': not ready'); return; }
    if (a.range && bd > a.range) { toast(a.name + ': out of range (' + a.range + ')'); targeting = t; return; }
    const r = Sim.useAbility(state, best.id, t.aid, x, y);
    if (r.ok) { toast(a.name + '!'); sfx('ability'); marker(x, y, '#ffb040'); } else toast(a.name + ': ' + r.reason);
  }

  function pickSquad(sx, sy, enemy) {
    let best = null, bd = mobile ? 34 : 26;
    for (const s of state.squads) {
      if (enemy ? s.playerId === playerFaction : s.playerId !== playerFaction) continue;
      if (s.inside) continue;
      if (enemy && !canSee(s)) continue;
      const d0 = (R3 && R3.squadDisplay(s.id)) || s;
      const def = Sim.UNIT_DEFS[s.unitType];
      const p = w2s(d0.x, d0.y, def.isVehicle ? 1.5 : 0.6);
      const r = def.isSuper ? 3 : def.isVehicle ? 1.6 : 1;
      const d = Math.hypot(p.x - sx, p.y - sy) / r;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  function pickBuilding(w, which) {
    let best = null, bd = 1e9;
    for (const b of state.buildings) {
      if (which === 'mine' && b.playerId !== playerFaction) continue;
      if (which === 'enemy' && (!b.playerId || b.playerId === playerFaction || (R3 && !R3.buildingShown(b.id)))) continue;
      const d = Sim.dist(b.x, b.y, w.x, w.y);
      if (d < Sim.BUILDING_DEFS[b.type].size * 0.75 && d < bd) { best = b; bd = d; }
    }
    return best;
  }
  function placeCheck(t, w) { return Sim.placementCheck(state, playerFaction, t, w.x, w.y); }
  function leftClick(sx, sy, add) {
    const w = s2w(sx, sy);
    if (buildMode) {
      const builders = selSquads().filter((s) => Sim.UNIT_DEFS[s.unitType].isBuilder).map((s) => s.id);
      const r = Sim.placeBuilding(state, playerFaction, buildMode, w.x, w.y, builders);
      if (r.ok) { toast(BNAME[buildMode] + ': builders are on their way'); sfx('ui'); if (!keys['shift']) buildMode = null; }
      else toast('Cannot build: ' + r.reason);
      return;
    }
    if (attackMove && selected.size) { command(w.x, w.y, sx, sy); return; }
    const s = pickSquad(sx, sy);
    if (s) { if (!add) selected.clear(); selected.add(s.id); prodBuilding = null; buildMenu = false; sfx('select'); return; }
    const b = pickBuilding(w, 'any');
    if (b && (isMine(b) || !b.playerId || (R3 && R3.buildingShown(b.id)))) { selected.clear(); prodBuilding = b.id; buildMenu = false; sfx('select'); return; }
    if (!add) { selected.clear(); prodBuilding = null; }
  }
  let markers = [];
  function marker(x, y, c) { markers.push({ x, y, t: 0.6, c }); }
  function command(wx, wy, sx, sy, face) {
    if (!selected.size) {
      const pb = prodBuilding && Sim.findBuilding(state, prodBuilding);
      if (pb && isMine(pb) && pb.type !== 'generator' && pb.type !== 'bastion') { pb.rally = { x: wx, y: wy }; marker(wx, wy, '#80d0ff'); toast('Rally point set'); }
      return;
    }
    const ids = [...selected];
    const sq = selSquads();
    if (attackMove) { Sim.issueMove(state, ids, wx, wy, true, face); attackMove = false; toast('Attack-move'); sfx('move'); marker(wx, wy, '#ff6040'); return; }
    if (face == null) {
      const e = sx != null ? pickSquad(sx, sy, true) : null;
      if (e) { Sim.issueAttack(state, ids, e.id); sfx('move'); marker(e.x, e.y, '#ff4030'); return; }
      const own = sx != null ? pickSquad(sx, sy) : null;
      if (own && Sim.UNIT_DEFS[own.unitType].capacity && !selected.has(own.id)) {
        const r = Sim.issueLoad(state, ids, own.id); toast(r.ok ? 'Embarking' : 'Cannot embark'); sfx('move'); return;
      }
      const node = pickNode({ x: wx, y: wy });
      const wk = sq.filter((s) => Sim.UNIT_DEFS[s.unitType].isWorker);
      if (node && wk.length) {
        Sim.issueGather(state, playerFaction, wk.map((s) => s.id), node.id);
        toast(node.kind === 'salvage' ? 'Salvaging the wreck' : 'Harvesting Aether'); sfx('move'); marker(node.x, node.y, node.kind === 'salvage' ? '#ffb060' : '#7fe6ff');
        if (tut) tut.gathered = true;
        const rest = ids.filter((id) => !wk.some((s) => s.id === id)); if (rest.length) Sim.issueMove(state, rest, wx, wy, false);
        return;
      }
      const b = pickBuilding({ x: wx, y: wy }, 'any');
      if (b && b.type === 'bunker') {
        const occ = b.occupant && Sim.findSquad(state, b.occupant);
        if (occ && !isMine(occ)) { Sim.issueAttack(state, ids, b.id); marker(b.x, b.y, '#ff4030'); sfx('move'); return; }
        const inf = sq.filter((s) => !Sim.UNIT_DEFS[s.unitType].isVehicle && !Sim.UNIT_DEFS[s.unitType].civil);
        if (!occ && inf.length) {
          const r = Sim.issueGarrison(state, [inf[0].id], b.id);
          if (r.ok) { toast(Sim.UNIT_DEFS[inf[0].unitType].name + ' garrisons the Redoubt'); marker(b.x, b.y, '#80ff90'); sfx('move'); }
          const rest = ids.filter((id) => id !== inf[0].id); if (rest.length) Sim.issueMove(state, rest, wx, wy, false);
          return;
        }
      }
      if (b && b.playerId && !isMine(b) && R3 && R3.buildingShown(b.id)) { Sim.issueAttack(state, ids, b.id); sfx('move'); marker(b.x, b.y, '#ff4030'); return; }
      if (b && isMine(b) && (!b.complete || b.hp < b.maxHp)) {
        const bs = sq.filter((s) => Sim.UNIT_DEFS[s.unitType].isBuilder);
        if (bs.length) { for (const s of bs) Sim.assignBuild(state, s, b); toast(b.complete ? 'Repairing' : 'Constructing'); sfx('move'); return; }
      }
      const relay = state.map.relays.find((r) => Sim.dist(r.x, r.y, wx, wy) < 60);
      if (relay && relay.owner !== playerFaction) { Sim.issueCapture(state, ids, relay.id); toast(relay.relic ? 'Seize the Starheart Shard' : 'Capture the Relay'); sfx('move'); marker(wx, wy, '#80ff90'); return; }
    }
    Sim.issueMove(state, ids, wx, wy, false, face);
    sfx('move'); marker(wx, wy, '#80ff90');
  }
  function selectBox(b, add) {
    if (!add) selected.clear();
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    for (const s of state.squads) {
      if (s.playerId !== playerFaction || s.inside) continue;
      const d0 = (R3 && R3.squadDisplay(s.id)) || s;
      const p = w2s(d0.x, d0.y, 0.5);
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) selected.add(s.id);
    }
    const arr = selSquads();
    if (arr.some((s) => !Sim.UNIT_DEFS[s.unitType].civil) && arr.some((s) => Sim.UNIT_DEFS[s.unitType].civil)) for (const s of arr) if (Sim.UNIT_DEFS[s.unitType].civil) selected.delete(s.id);
    if (selected.size) { prodBuilding = null; sfx('select'); }
  }
  function selectArmy() {
    selected = new Set(state.squads.filter((s) => isMine(s) && !s.inside && !Sim.UNIT_DEFS[s.unitType].civil).map((s) => s.id));
    prodBuilding = null; toast(selected.size + ' squads selected');
  }

  /* ------------------------------ Layout ------------------------------ */
  function layout() {
    const narrow = W < 760;
    const short = H < 520;
    const top = narrow ? 50 : 46;
    const mm = narrow ? { w: 116, h: 87 } : { w: 232, h: 174 };
    if (state && state.map.width / state.map.height > 1.45) mm.h = Math.round(mm.w * state.map.height / state.map.width);
    mm.x = 10; mm.y = H - mm.h - 10;
    const bw = narrow ? 56 : 70, bh = narrow ? 44 : 54, gap = 5, cols = 4;
    const card = { w: cols * bw + (cols - 1) * gap + 16, h: 3 * bh + 2 * gap + 16 };
    card.x = W - card.w - 10; card.y = H - card.h - 10;
    return { narrow, short, top, mm, bw, bh, gap, cols, card };
  }
  let L = layout();
  function hitMinimap(sx, sy) { const m = L.mm; return mode === 'playing' && sx >= m.x && sx <= m.x + m.w && sy >= m.y && sy <= m.y + m.h; }
  function minimapToWorld(sx, sy) { const m = L.mm; return { x: (sx - m.x) / m.w * state.map.width, y: (sy - m.y) / m.h * state.map.height }; }
  function jumpMinimap(sx, sy) { const w = minimapToWorld(sx, sy); cam.x = w.x; cam.y = w.y; }
  function hitButton(sx, sy) {
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
        if (mobile && b.tip) { tipPinned = b; tipT = 2.6; }
        if (b.enabled !== false) { b.fn(); sfx('ui'); } else toast(b.why || 'Unavailable');
        return true;
      }
    }
    return false;
  }
  /* ------------------------------ Drawing helpers ------------------------------ */
  const FONT = '"Oxanium", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  const HEAD = '"Cinzel", Georgia, "Times New Roman", serif';
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function panel(x, y, w, h, accent) {
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(28,24,26,0.92)'); g.addColorStop(1, 'rgba(10,9,12,0.94)');
    rr(x, y, w, h, 6); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(150,120,80,0.75)'; ctx.stroke();
    rr(x + 3, y + 3, w - 6, h - 6, 4); ctx.lineWidth = 1; ctx.strokeStyle = accent || 'rgba(255,220,160,0.08)'; ctx.stroke();
    ctx.fillStyle = 'rgba(214,174,96,0.9)';
    for (const [cx, cy] of [[x + 5, y + 5], [x + w - 5, y + 5], [x + 5, y + h - 5], [x + w - 5, y + h - 5]]) { ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, 6.28); ctx.fill(); }
    ctx.restore();
  }
  function hovered(b) { return mouse.inside && !mobile && mouse.x >= b.x && mouse.x <= b.x + b.w && mouse.y >= b.y && mouse.y <= b.y + b.h; }
  function button(b, label, opts = {}) {
    buttons.push(b);
    const hov = hovered(b), en = b.enabled !== false, act = opts.active;
    ctx.save();
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    if (act) { g.addColorStop(0, 'rgba(120,90,40,0.95)'); g.addColorStop(1, 'rgba(60,40,18,0.95)'); }
    else if (hov && en) { g.addColorStop(0, 'rgba(70,62,58,0.95)'); g.addColorStop(1, 'rgba(34,28,28,0.95)'); }
    else { g.addColorStop(0, 'rgba(48,42,42,0.95)'); g.addColorStop(1, 'rgba(20,17,18,0.95)'); }
    rr(b.x, b.y, b.w, b.h, 5); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = act ? '#f0c060' : hov && en ? 'rgba(240,200,120,0.9)' : 'rgba(140,110,70,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.globalAlpha = en ? 1 : 0.38;
    if (opts.icon) opts.icon(b.x + b.w / 2, b.y + b.h * (label ? 0.4 : 0.5), Math.min(b.w, b.h) * 0.26);
    if (label) { ctx.fillStyle = '#efe4cf'; ctx.font = `600 ${L.narrow ? 9 : 10}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(label, b.x + b.w / 2, b.y + b.h - (L.narrow ? 6 : 8)); }
    if (opts.hot && !L.narrow) { ctx.fillStyle = 'rgba(240,200,120,0.85)'; ctx.font = `bold 9px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(opts.hot, b.x + 4, b.y + 11); }
    if (opts.sub) { ctx.fillStyle = '#c9b48a'; ctx.font = `9px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(opts.sub, b.x + b.w - 4, b.y + 11); }
    if (opts.cd > 0) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; rr(b.x, b.y, b.w, b.h * Math.min(1, opts.cd), 5); ctx.fill(); }
    ctx.restore();
  }
  function bar(x, y, w, h, f, c, bg) { ctx.fillStyle = bg || 'rgba(0,0,0,0.65)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); ctx.fillStyle = c; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h); }
  /* ------------------------------ Icons ------------------------------ */
  const IC = {
    crystal(x, y, s, c = '#b49cff') { ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.6, 0); ctx.closePath(); const g = ctx.createLinearGradient(-s, -s, s, s); g.addColorStop(0, '#fff'); g.addColorStop(0.4, c); g.addColorStop(1, '#3a2a6a'); ctx.fillStyle = g; ctx.shadowColor = c; ctx.shadowBlur = 8; ctx.fill(); ctx.restore(); },
    bolt(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.moveTo(s * 0.2, -s); ctx.lineTo(-s * 0.5, s * 0.1); ctx.lineTo(0, s * 0.1); ctx.lineTo(-s * 0.2, s); ctx.lineTo(s * 0.5, -s * 0.15); ctx.lineTo(0, -s * 0.15); ctx.closePath(); ctx.fillStyle = '#ffd24a'; ctx.shadowColor = '#ffb000'; ctx.shadowBlur = 8; ctx.fill(); ctx.restore(); },
    retreat(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#ffb070'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(s, -s * 0.2); ctx.lineTo(-s * 0.6, -s * 0.2); ctx.moveTo(-s * 0.1, -s * 0.8); ctx.lineTo(-s * 0.7, -s * 0.2); ctx.lineTo(-s * 0.1, s * 0.4); ctx.stroke(); ctx.restore(); },
    plus(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#7fe0a0'; ctx.fillRect(-s * 0.2, -s * 0.8, s * 0.4, s * 1.6); ctx.fillRect(-s * 0.8, -s * 0.2, s * 1.6, s * 0.4); ctx.restore(); },
    star(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.45 : s; const a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fillStyle = '#ffd860'; ctx.fill(); ctx.restore(); },
    sword(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.rotate(-0.8); ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-s * 0.1, -s, s * 0.2, s * 1.4); ctx.fillStyle = '#d8ae58'; ctx.fillRect(-s * 0.45, s * 0.35, s * 0.9, s * 0.16); ctx.fillRect(-s * 0.08, s * 0.5, s * 0.16, s * 0.4); ctx.restore(); },
    hall(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#b8a890'; ctx.beginPath(); ctx.moveTo(-s, s * 0.7); ctx.lineTo(-s, -s * 0.1); ctx.lineTo(0, -s * 0.8); ctx.lineTo(s, -s * 0.1); ctx.lineTo(s, s * 0.7); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffcf70'; ctx.fillRect(-s * 0.25, s * 0.1, s * 0.5, s * 0.6); ctx.restore(); },
    dynamo(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#6fe0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -s * 0.2, s * 0.8, s * 0.3, 0, 0, 6.28); ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, s * 0.3, s * 0.6, s * 0.25, 0, 0, 6.28); ctx.stroke(); ctx.fillStyle = '#bff4ff'; ctx.beginPath(); ctx.arc(0, -s * 0.75, s * 0.25, 0, 6.28); ctx.fill(); ctx.restore(); },
    tower(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#a89880'; ctx.fillRect(-s * 0.6, -s * 0.2, s * 1.2, s); ctx.fillRect(-s * 0.75, -s * 0.45, s * 0.35, s * 0.3); ctx.fillRect(s * 0.4, -s * 0.45, s * 0.35, s * 0.3); ctx.fillStyle = '#555'; ctx.fillRect(-s * 0.08, -s, s * 0.16, s * 0.8); ctx.restore(); },
    anvil(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.moveTo(-s, -s * 0.3); ctx.lineTo(s, -s * 0.3); ctx.lineTo(s * 0.5, s * 0.1); ctx.lineTo(s * 0.3, s * 0.7); ctx.lineTo(-s * 0.3, s * 0.7); ctx.lineTo(-s * 0.3, s * 0.1); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff9040'; ctx.fillRect(-s * 0.6, -s * 0.55, s * 1.0, s * 0.2); ctx.restore(); },
    walker(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#a8b0c0'; ctx.fillRect(-s * 0.6, -s * 0.8, s * 1.2, s * 0.7); ctx.fillStyle = '#6fe0ff'; ctx.fillRect(-s * 0.35, -s * 0.6, s * 0.7, s * 0.12); ctx.strokeStyle = '#a8b0c0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-s * 0.35, -s * 0.1); ctx.lineTo(-s * 0.6, s * 0.4); ctx.lineTo(-s * 0.4, s * 0.9); ctx.moveTo(s * 0.35, -s * 0.1); ctx.lineTo(s * 0.6, s * 0.4); ctx.lineTo(s * 0.4, s * 0.9); ctx.stroke(); ctx.restore(); },
    up(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#ffd860'; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.3 - i * s * 0.6); ctx.lineTo(0, -s * 0.4 - i * s * 0.6); ctx.lineTo(s * 0.7, s * 0.3 - i * s * 0.6); ctx.lineTo(s * 0.7, s * 0.6 - i * s * 0.6); ctx.lineTo(0, -s * 0.1 - i * s * 0.6); ctx.lineTo(-s * 0.7, s * 0.6 - i * s * 0.6); ctx.fill(); } ctx.restore(); },
    stop(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#e06a50'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.lineTo(Math.cos(a) * s * 0.85, Math.sin(a) * s * 0.85); } ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-s * 0.45, -s * 0.12, s * 0.9, s * 0.24); ctx.restore(); },
    stance(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#8fb0d8'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, -s * 0.6); ctx.lineTo(s * 0.7, s * 0.3); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, s * 0.3); ctx.lineTo(-s * 0.8, -s * 0.6); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#2a3040'; ctx.fillRect(-s * 0.08, -s * 0.6, s * 0.16, s * 1.2); ctx.fillRect(-s * 0.45, -s * 0.15, s * 0.9, s * 0.16); ctx.restore(); },
    menu(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#e8dcc0'; for (let i = -1; i <= 1; i++) ctx.fillRect(-s * 0.75, i * s * 0.5 - s * 0.1, s * 1.5, s * 0.2); ctx.restore(); },
    flask(x, y, s) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#c0a0ff'; ctx.beginPath(); ctx.moveTo(-s * 0.2, -s); ctx.lineTo(s * 0.2, -s); ctx.lineTo(s * 0.2, -s * 0.3); ctx.lineTo(s * 0.75, s * 0.8); ctx.lineTo(-s * 0.75, s * 0.8); ctx.lineTo(-s * 0.2, -s * 0.3); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#7fffd0'; ctx.fillRect(-s * 0.5, s * 0.3, s, s * 0.4); ctx.restore(); },
    gun(x, y, s, c = '#d8d0c0') { ctx.save(); ctx.translate(x, y); ctx.fillStyle = c; ctx.fillRect(-s * 0.9, -s * 0.25, s * 1.8, s * 0.3); ctx.fillRect(-s * 0.9, -s * 0.25, s * 0.45, s * 0.75); ctx.fillRect(-s * 0.1, 0, s * 0.25, s * 0.5); ctx.fillRect(s * 0.6, -s * 0.4, s * 0.15, s * 0.15); ctx.restore(); },
    speaker(x, y, s, on) { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.moveTo(-s, -s * 0.35); ctx.lineTo(-s * 0.4, -s * 0.35); ctx.lineTo(s * 0.2, -s); ctx.lineTo(s * 0.2, s); ctx.lineTo(-s * 0.4, s * 0.35); ctx.lineTo(-s, s * 0.35); ctx.fill(); ctx.strokeStyle = on ? '#e8dcc0' : '#ff6050'; ctx.lineWidth = 2; ctx.beginPath(); if (on) { ctx.arc(s * 0.3, 0, s * 0.6, -0.8, 0.8); } else { ctx.moveTo(s * 0.4, -s * 0.5); ctx.lineTo(s, s * 0.5); ctx.moveTo(s, -s * 0.5); ctx.lineTo(s * 0.4, s * 0.5); } ctx.stroke(); ctx.restore(); },
  };
  IC.crystalBtn = (x, y, sz) => IC.crystal(x, y, sz * 0.8, '#7fe6ff');
  IC.bolt2 = (x, y, sz) => IC.bolt(x, y, sz);
  function emblem(fid, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    if (fid === 'vigilant') {
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, -s * 0.6); ctx.lineTo(s * 0.7, s * 0.3); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, s * 0.3); ctx.lineTo(-s * 0.8, -s * 0.6); ctx.closePath();
      const g = ctx.createLinearGradient(0, -s, 0, s); g.addColorStop(0, '#4f7fd0'); g.addColorStop(1, '#1d3264'); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = s * 0.09; ctx.strokeStyle = '#e0b860'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -s * 0.05, s * 0.42, s * 0.24, 0, 0, 6.28); ctx.fillStyle = '#0c1630'; ctx.fill(); ctx.strokeStyle = '#e0b860'; ctx.lineWidth = s * 0.05; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 0.05, s * 0.13, 0, 6.28); ctx.fillStyle = '#9ff0ff'; ctx.shadowColor = '#5fd8ff'; ctx.shadowBlur = s * 0.5; ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#e0b860'; ctx.fillRect(-s * 0.04, s * 0.25, s * 0.08, s * 0.5); ctx.fillRect(-s * 0.25, s * 0.38, s * 0.5, s * 0.07);
    } else {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 1.75 + 0.6; const r = i % 2 ? s * 0.78 : s; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      for (let i = 24; i >= 0; i--) { const a = i / 24 * Math.PI * 1.75 + 0.6; ctx.lineTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55); }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -s, 0, s); g.addColorStop(0, '#d0623a'); g.addColorStop(1, '#5a1a10'); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = s * 0.05; ctx.stroke();
      ctx.strokeStyle = '#ff8a3a'; ctx.shadowColor = '#ff6a1a'; ctx.shadowBlur = s * 0.4; ctx.lineWidth = s * 0.1; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.25 + i * s * 0.18, -s * 0.35); ctx.lineTo(s * 0.15 + i * s * 0.18, s * 0.35); ctx.stroke(); }
    }
    ctx.restore();
  }
  function unitIcon(type, x, y, s) {
    const pimg = R3 && R3.portrait ? R3.portrait(type) : null;
    if (pimg) { const z = s * 3.4; ctx.drawImage(pimg, x - z / 2, y - z / 2, z, z); return; }
    const d = Sim.UNIT_DEFS[type]; const f = d.faction; const c = Sim.FACTIONS[f].color;
    ctx.save(); ctx.translate(x, y);
    if (d.isVehicle) { ctx.restore(); IC.walker(x, y, s); return; }
    const k = d.isHero ? 1.15 : 1;
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(-s * 0.55 * k, -s * 0.05, s * 0.32 * k, s * 0.22 * k, 0, 0, 6.28); ctx.ellipse(s * 0.55 * k, -s * 0.05, s * 0.32 * k, s * 0.22 * k, 0, 0, 6.28); ctx.fill();
    ctx.fillRect(-s * 0.45 * k, -s * 0.05, s * 0.9 * k, s * 0.8);
    ctx.beginPath(); ctx.arc(0, -s * 0.45, s * 0.3 * k, 0, 6.28); ctx.fill();
    ctx.fillStyle = f === 'vigilant' ? '#9ff0ff' : '#ffb060'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
    if (f === 'vigilant') ctx.fillRect(-s * 0.2, -s * 0.5, s * 0.4, s * 0.08); else { ctx.fillRect(-s * 0.16, -s * 0.5, s * 0.1, s * 0.07); ctx.fillRect(s * 0.06, -s * 0.5, s * 0.1, s * 0.07); }
    ctx.shadowBlur = 0;
    if (f === 'riven') { ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.moveTo(-s * 0.25, -s * 0.7); ctx.lineTo(-s * 0.45, -s * 1.05); ctx.lineTo(-s * 0.12, -s * 0.72); ctx.moveTo(s * 0.25, -s * 0.7); ctx.lineTo(s * 0.45, -s * 1.05); ctx.lineTo(s * 0.12, -s * 0.72); ctx.fill(); }
    if (d.isHero) { ctx.fillStyle = '#ffd860'; ctx.fillRect(-s * 0.04, -s * 1.0, s * 0.08, s * 0.3); }
    if (d.isBuilder) { ctx.strokeStyle = '#ffd060'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s * 0.7, s * 0.5, s * 0.22, 0, 6.28); ctx.stroke(); }
    ctx.restore();
  }
  function abilityIcon(ab, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    if (ab === 'ordnance') { ctx.strokeStyle = '#9ff0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, 6.28); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke(); }
    else if (ab === 'rally') { ctx.restore(); IC.star(x, y, s); return; }
    else if (ab === 'rampage') { ctx.strokeStyle = '#ff8a3a'; ctx.lineWidth = 3; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.5 + i * s * 0.4, -s * 0.8); ctx.lineTo(s * 0.2 + i * s * 0.4, s * 0.8); ctx.stroke(); } }
    else if (ab === 'frag' || ab === 'firebomb') { ctx.fillStyle = ab === 'frag' ? '#a8b090' : '#ff7a2a'; ctx.beginPath(); ctx.arc(0, s * 0.15, s * 0.6, 0, 6.28); ctx.fill(); ctx.fillStyle = '#ddd'; ctx.fillRect(-s * 0.15, -s * 0.75, s * 0.3, s * 0.35); ctx.strokeStyle = '#ffd060'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s * 0.1, -s * 0.75); ctx.quadraticCurveTo(s * 0.6, -s * 1.1, s * 0.8, -s * 0.7); ctx.stroke(); }
    else if (ab === 'brace') { ctx.fillStyle = '#9fc0e0'; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, -s * 0.5); ctx.lineTo(s * 0.6, s * 0.5); ctx.lineTo(0, s); ctx.lineTo(-s * 0.6, s * 0.5); ctx.lineTo(-s * 0.8, -s * 0.5); ctx.closePath(); ctx.fill(); }
    else if (ab === 'leap') { ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-s, s * 0.7); ctx.quadraticCurveTo(0, -s * 1.4, s, s * 0.7); ctx.stroke(); ctx.fillStyle = '#7fe0ff'; ctx.beginPath(); ctx.moveTo(s, s * 0.7); ctx.lineTo(s * 0.55, s * 0.35); ctx.lineTo(s * 1.05, s * 0.2); ctx.fill(); }
    else if (ab === 'charge') { ctx.fillStyle = '#ff9a50'; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.8 + i * s * 0.7, -s * 0.7); ctx.lineTo(-s * 0.1 + i * s * 0.7, 0); ctx.lineTo(-s * 0.8 + i * s * 0.7, s * 0.7); ctx.lineTo(-s * 0.5 + i * s * 0.7, 0); ctx.closePath(); ctx.fill(); } }
    else { ctx.strokeStyle = '#ffb060'; ctx.lineWidth = 2; for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(-s * 0.6, 0, s * 0.35 * i, -0.7, 0.7); ctx.stroke(); } }
    ctx.restore();
  }
  const WCOL = { small: '#d8d0c0', heavy: '#ffd27a', flame: '#ff8a3a', lance: '#7fe0ff', suppress: '#e0e070', sniper: '#c0a0ff', melee: '#ffb0a0', powerMelee: '#ff7060', explosive: '#ffa040', cannon: '#ffa040', turret: '#ccc' };
  const VS = { small: 'infantry', heavy: 'heavy infantry', flame: 'infantry in cover, garrisons', lance: 'vehicles, heroes', suppress: 'pinning infantry', sniper: 'infantry, weapon teams', melee: 'infantry', powerMelee: 'vehicles, heavy infantry', explosive: 'clusters, garrisons', cannon: 'everything' };
  function costStr(a, f, extra) { return [a ? a + ' Aether' : '', f ? f + ' Flux' : '', extra || ''].filter(Boolean).join(' · '); }
  function unitTip(t) {
    const d = Sim.UNIT_DEFS[t], w = Sim.WEAPONS[d.teamWeapon || d.weapon];
    return { title: d.name, cost: costStr(d.costAether, d.costFlux, (d.pop ? d.pop + ' pop' : d.vpop ? d.vpop + ' vehicle pop' : '') + ' · ' + d.buildTime + 's'),
      lines: [d.desc, 'Weapon: ' + w.name + ' (' + w.type + ')', d.models + ' × ' + d.hp + ' hp · ' + d.armor + ' armour'], good: d.good, bad: d.bad };
  }
  function researchTip(rid) { const r = Sim.RESEARCH[rid]; return { title: r.name[playerFaction], cost: costStr(r.aether, r.flux, r.time + 's'), lines: [r.desc, 'Requires Tier ' + r.tier] }; }
  function abilityTip(aid) { const a = Sim.ABILITIES[aid]; return { title: a.name, cost: 'Cooldown ' + a.cd + 's' + (a.range ? ' · range ' + a.range : ''), lines: [a.desc, a.target === 'point' ? 'Targeted: click the ground' : 'Instant'] }; }
  function weaponTip(wid, opt) { const w = Sim.WEAPONS[wid]; return { title: w.name, cost: costStr(opt.aether, opt.flux, 'max ' + opt.max), lines: ['Replaces one trooper\'s weapon.', w.damage + ' dmg / ' + w.cooldown + 's · range ' + w.range + (w.splash ? ' · splash' : '') + (w.ignoresCover ? ' · ignores cover' : '')], good: VS[w.type], bad: w.type === 'lance' ? 'hordes of infantry' : w.type === 'flame' ? 'vehicles, range' : '' }; }
  function buildingTip(t) { const d = Sim.BUILDING_DEFS[t]; const info = { barracks: 'Trains infantry, weapon teams and snipers. Researches grenades & morale.', generator: 'Produces ' + (d.generatesFlux || 2) + ' Flux per second.', bastion: 'Fortifies an owned Relay: turret, detection, +35% Aether.', armory: 'Tier 2 elite infantry and Tempered Plate research.', vehicleBay: 'Builds transports, walkers and the relic super-unit.' }[t];
    return { title: BNAME[t], cost: costStr(d.costAether, d.costFlux, d.buildTime + 's'), lines: [info || '', d.requiresTier ? 'Requires Tier ' + d.requiresTier : '', 'Builders must construct it.'] }; }

  function shortWeapon(wid) { const n = Sim.WEAPONS[wid].name.split(' '); return n[n.length - 1]; }

  function drawWorldOverlay() {
    for (const r of state.map.relays) {
      const p = w2s(r.x, r.y, r.relic ? 8 : r.critical ? 6.2 : 5.4);
      if (p.x < -40 || p.x > W + 40 || p.y < 0 || p.y > H) continue;
      if (r.relic) { ctx.fillStyle = 'rgba(220,200,255,0.95)'; ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('✦ STARHEART SHARD', p.x, p.y - 4); }
      else if (r.critical) { ctx.fillStyle = 'rgba(255,214,110,0.95)'; ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('★ CRITICAL', p.x, p.y - 4); }
      if (r.captureAmount > 0 && r.captureAmount < 1) bar(p.x - 22, p.y + 2, 44, 4, r.captureAmount, r.owner ? Sim.FACTIONS[r.owner].accent : '#ffe08a');
    }
    for (const s of state.squads) {
      if (s.inside || (R3 && !R3.squadShown(s.id))) continue;
      const def = Sim.UNIT_DEFS[s.unitType];
      const d0 = (R3 && R3.squadDisplay(s.id)) || s;
      const h = def.isSuper ? 9 : def.isVehicle ? 4.2 : def.isHero ? 2.6 : 1.9;
      const p = w2s(d0.x, d0.y, h);
      if (p.x < -40 || p.x > W + 40 || p.y < -20 || p.y > H + 20) continue;
      const mine = s.playerId === playerFaction;
      const sel = selected.has(s.id);
      const dmg = s.hp < s.maxHp - 1 || s.morale < s.maxMorale - 1 || s.suppression > 5;
      if (!sel && !dmg && !def.isHero && !s.stealthed && !(s.setup > 0 && s.setup < 1)) continue;
      const w = def.isSuper ? 70 : def.isVehicle ? 50 : def.isHero ? 44 : 36;
      bar(p.x - w / 2, p.y, w, 4, s.hp / Math.max(1, s.maxHp), mine ? '#6fe08a' : '#ff5a48');
      if (!def.isVehicle) bar(p.x - w / 2, p.y + 6, w, 2.5, s.morale / s.maxMorale, s.broken ? '#ff4040' : '#6aa8ff');
      if (s.suppression > 1 && !def.isVehicle) bar(p.x - w / 2, p.y + 10, w, 2, s.suppression / 100, s.pinned ? '#ff7a30' : '#e0c050');
      if (def.models > 1) for (let i = 0; i < s.maxModels; i++) { ctx.fillStyle = i < s.modelCount ? 'rgba(240,230,210,0.9)' : i < s.modelCount + s.reinforcePending ? 'rgba(120,220,140,0.9)' : 'rgba(90,80,70,0.8)'; ctx.fillRect(p.x - w / 2 + i * 5, p.y - 5, 3.5, 3); }
      if (s.leaderAttached) IC.star(p.x + w / 2 + 6, p.y + 2, 4.5);
      let tag = null, tc = '#fff';
      if (s.broken) { tag = 'BROKEN'; tc = '#ff6050'; }
      else if (s.pinned) { tag = 'PINNED'; tc = '#ff8a40'; }
      else if (s.suppression >= 45) { tag = 'SUPPRESSED'; tc = '#ffc050'; }
      else if (s.setup > 0 && s.setup < 1) { tag = 'SETTING UP ' + Math.floor(s.setup * 100) + '%'; tc = '#e0e070'; }
      else if (s.stealthed && mine) { tag = '◌ HIDDEN'; tc = '#b0a0ff'; }
      else if (s.stance === 'holdFire' && mine && sel) { tag = 'HOLD FIRE'; tc = '#a0c0ff'; }
      ctx.textAlign = 'center';
      if (def.isHero) { ctx.font = `bold 10px ${HEAD}`; ctx.fillStyle = mine ? '#ffe7a8' : '#ffb0a0'; ctx.fillText(def.name, p.x, p.y - 8); }
      if (tag) { ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = tc; ctx.fillText(tag, p.x, p.y - (def.isHero ? 20 : 9)); }
      if (def.capacity && s.cargo.length) { ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = '#ffe7a8'; ctx.fillText('▣ ' + s.cargo.length + '/' + def.capacity, p.x, p.y + 22); }
      if (sel && mine && !def.isVehicle) {
        const cov = Sim.coverAt(state.map, s.x, s.y);
        if (cov) { ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = cov === 'heavy' ? '#7fe08a' : cov === 'light' ? '#e0d070' : '#ff6a50'; ctx.fillText(cov === 'heavy' ? '▲ HEAVY COVER' : cov === 'light' ? '△ LIGHT COVER' : '▼ EXPOSED', p.x, p.y + 22); }
      }
    }
    for (const b of state.buildings) {
      if (R3 && !R3.buildingShown(b.id)) continue;
      const def = Sim.BUILDING_DEFS[b.type];
      const p = w2s(b.x, b.y, b.type === 'hq' ? 9.8 : b.type === 'bunker' ? 3.6 : 4.4);
      if (p.x < -60 || p.x > W + 60 || p.y < -20 || p.y > H) continue;
      const w = Math.max(40, def.size * 0.9);
      ctx.textAlign = 'center';
      if (b.type === 'bunker') {
        const occ = b.occupant && Sim.findSquad(state, b.occupant);
        if (occ || prodBuilding === b.id || b.hp < b.maxHp - 1) bar(p.x - w / 2, p.y, w, 4, b.hp / b.maxHp, '#c8b898');
        if (occ && (isMine(occ) || canSee(occ) || !state.fogEnabled)) { ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = Sim.FACTIONS[occ.playerId].accent; ctx.fillText('⛫ ' + Sim.UNIT_DEFS[occ.unitType].name, p.x, p.y - 4); }
        continue;
      }
      const showHp = b.hp < b.maxHp - 1 || prodBuilding === b.id;
      if (!showHp && b.complete && !(b.queue && b.queue.length && isMine(b))) continue;
      if (!b.complete) { bar(p.x - w / 2, p.y, w, 5, b.buildProgress, '#ffd060'); if (isMine(b)) { ctx.font = `9px ${FONT}`; ctx.fillStyle = '#ffe7a8'; ctx.fillText('Building ' + Math.floor(b.buildProgress * 100) + '%', p.x, p.y - 4); } continue; }
      bar(p.x - w / 2, p.y, w, 5, b.hp / b.maxHp, isMine(b) ? '#6fe08a' : '#ff5a48');
      if (b.queue && b.queue.length && isMine(b)) {
        const j = b.queue[0];
        bar(p.x - w / 2, p.y + 7, w, 3, 1 - j.remaining / j.total, '#ffd060');
        ctx.fillStyle = '#efe4cf'; ctx.font = `9px ${FONT}`; ctx.fillText(jobName(j) + (b.queue.length > 1 ? ' +' + (b.queue.length - 1) : ''), p.x, p.y - 4);
      }
      if (prodBuilding === b.id && b.rally && isMine(b)) {
        const q = w2s(b.rally.x, b.rally.y, 0); ctx.strokeStyle = 'rgba(128,208,255,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(p.x, p.y + 20); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#80d0ff'; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 6.28); ctx.fill();
      }
    }
    for (const m of markers) {
      const p = w2s(m.x, m.y, 0); const k = m.t / 0.6;
      ctx.strokeStyle = m.c; ctx.globalAlpha = k; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 18 * (1.4 - k), 8 * (1.4 - k), 0, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (targeting && (mouse.inside || mobile)) {
      const a = Sim.ABILITIES[targeting.aid];
      const wpt = s2w(mouse.x, mouse.y);
      if (!mobile) groundCircle(wpt.x, wpt.y, a.radius || 40, 'rgba(255,170,60,0.95)');
      for (const id of targeting.squadIds) { const s = Sim.findSquad(state, id); if (s && a.range) groundCircle(s.x, s.y, a.range, 'rgba(255,230,160,0.35)'); }
    }
    if (rdrag && Math.hypot(rdrag.x1 - rdrag.x0, rdrag.y1 - rdrag.y0) > 24) {
      ctx.strokeStyle = '#80ff90'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(rdrag.x0, rdrag.y0); ctx.lineTo(rdrag.x1, rdrag.y1); ctx.stroke();
      const a = Math.atan2(rdrag.y1 - rdrag.y0, rdrag.x1 - rdrag.x0);
      ctx.beginPath(); ctx.moveTo(rdrag.x1, rdrag.y1); ctx.lineTo(rdrag.x1 - Math.cos(a - 0.5) * 14, rdrag.y1 - Math.sin(a - 0.5) * 14); ctx.moveTo(rdrag.x1, rdrag.y1); ctx.lineTo(rdrag.x1 - Math.cos(a + 0.5) * 14, rdrag.y1 - Math.sin(a + 0.5) * 14); ctx.stroke();
    }
  }
  function groundCircle(x, y, r, c) {
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const a = i / 40 * 6.283; const p = w2s(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.1); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
    ctx.stroke();
  }
  function jobName(j) {
    if (j.kind === 'unit') return Sim.UNIT_DEFS[j.unitType].name;
    if (j.kind === 'research') return Sim.RESEARCH[j.id].name[playerFaction];
    return 'Tier ' + j.tier;
  }

  function drawTopBar() {
    const p = state.players[playerFaction], en = state.players[state.aiFaction];
    const n = L.narrow;
    const g = ctx.createLinearGradient(0, 0, 0, L.top);
    g.addColorStop(0, 'rgba(14,11,12,0.94)'); g.addColorStop(1, 'rgba(26,20,20,0.86)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, L.top);
    ctx.fillStyle = 'rgba(190,150,90,0.8)'; ctx.fillRect(0, L.top - 1.5, W, 1.5);
    let x = 10; const y = n ? 14 : L.top / 2 + 1;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    IC.crystal(x + 7, y, 8); x += 18;
    ctx.font = `bold ${n ? 13 : 15}px ${FONT}`; ctx.fillStyle = '#efe4ff'; ctx.fillText(Math.floor(p.aether), x, y);
    x += ctx.measureText(Math.floor(p.aether)).width + 3;
    ctx.font = `${n ? 9 : 11}px ${FONT}`; ctx.fillStyle = '#a99ad0'; ctx.fillText('+' + aetherRate(playerFaction).toFixed(1), x, y); x += n ? 30 : 44;
    IC.bolt(x + 6, y, 8); x += 16;
    ctx.font = `bold ${n ? 13 : 15}px ${FONT}`; ctx.fillStyle = '#ffefb0'; ctx.fillText(Math.floor(p.flux), x, y);
    x += ctx.measureText(Math.floor(p.flux)).width + 3;
    ctx.font = `${n ? 9 : 11}px ${FONT}`; ctx.fillStyle = '#c9b070'; ctx.fillText('+' + fluxRate(playerFaction).toFixed(1), x, y); x += n ? 28 : 42;
    const pop = Sim.popUsed(state, playerFaction);
    ctx.font = `bold ${n ? 10 : 12}px ${FONT}`;
    ctx.fillStyle = pop.squad >= p.squadCap ? '#ff7060' : '#d8ccb0'; ctx.fillText('⚑' + pop.squad + '/' + p.squadCap, x, y); x += n ? 40 : 52;
    ctx.fillStyle = pop.vehicle >= p.vehicleCap ? '#ff7060' : '#d8ccb0'; ctx.fillText('⚙' + pop.vehicle + '/' + p.vehicleCap, x, y); x += n ? 32 : 44;
    { const up = Sim.upkeepMult(state, playerFaction), wk = Sim.workerCount(state, playerFaction);
      ctx.fillStyle = '#9fdcf0'; ctx.fillText('⛏' + wk, x, y); x += n ? 26 : 34;
      if (up < 0.999) { ctx.fillStyle = up < 0.75 ? '#ff8a60' : '#e8c070'; ctx.fillText((n ? '' : 'Upkeep ') + '-' + Math.round((1 - up) * 100) + '%', x, y); x += n ? 34 : 86; } }
    if (!n) { ctx.fillStyle = '#c9b48a'; ctx.font = `bold 11px ${FONT}`; ctx.fillText('TIER', x, y); x += 34; }
    const hq = Sim.findBuilding(state, p.hqId);
    const tj = hq && hq.queue.find((j) => j.kind === 'tier');
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath();
      ctx.fillStyle = i <= p.tier ? '#ffd060' : tj && tj.tier === i ? `rgba(255,208,96,${0.3 + 0.3 * Math.sin(performance.now() / 200)})` : 'rgba(90,80,70,0.9)'; ctx.fill(); x += 14;
    }
    const tw = n ? W - 24 : Math.min(300, W * 0.24);
    const tx = n ? 12 : Math.max(x + 24, W / 2 - tw / 2 + 60), ty = n ? 38 : y;
    const own = Math.max(0, p.tickets) / 500, enemy = Math.max(0, en.tickets) / 500;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(tx, ty - 6, tw, 12);
    ctx.fillStyle = Sim.FACTIONS[playerFaction].color; ctx.fillRect(tx, ty - 6, tw / 2 * own, 12);
    ctx.fillStyle = Sim.FACTIONS[state.aiFaction].color; ctx.fillRect(tx + tw - tw / 2 * enemy, ty - 6, tw / 2 * enemy, 12);
    ctx.fillStyle = '#efe4cf'; ctx.fillRect(tx + tw / 2 - 1, ty - 8, 2, 16);
    ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(Math.ceil(p.tickets) + '   CONTROL   ' + Math.ceil(en.tickets), tx + tw / 2, ty + 1);
    const rs = Sim.heroRespawnIn(state, playerFaction);
    if (rs > 0 && !n) { ctx.textAlign = 'left'; ctx.fillStyle = '#ff9a80'; ctx.font = `bold 11px ${FONT}`; ctx.fillText('☠ Commander returns in ' + Math.ceil(rs) + 's', tx + tw + 16, y); }
    else if (rs > 0) { ctx.textAlign = 'right'; ctx.fillStyle = '#ff9a80'; ctx.font = `bold 10px ${FONT}`; ctx.fillText('☠ ' + Math.ceil(rs) + 's', W - 84, y); }
    const sb = { x: W - (n ? 38 : 44), y: n ? 2 : 7, w: n ? 32 : 36, h: n ? 26 : 32, fn: toggleMute };
    button(sb, '', { icon: (cx, cy, s) => IC.speaker(cx, cy, s * 1.1, !muted) });
    const mb = { x: sb.x - sb.w - 6, y: sb.y, w: sb.w, h: sb.h, fn: () => { menuOpen = true; } };
    button(mb, '', { icon: (cx, cy, s) => IC.menu(cx, cy, s) });
    ctx.textBaseline = 'alphabetic';
  }

  function drawMinimap() {
    const m = L.mm, map = state.map;
    panel(m.x - 4, m.y - 4, m.w + 8, m.h + 8);
    const g = ctx.createLinearGradient(m.x, m.y, m.x + m.w, m.y + m.h); g.addColorStop(0, '#3a302a'); g.addColorStop(1, '#2a2220');
    ctx.fillStyle = g; ctx.fillRect(m.x, m.y, m.w, m.h);
    const sx = m.w / map.width, sy = m.h / map.height;
    for (const c of map.cover) { ctx.fillStyle = c.type === 'heavy' ? 'rgba(120,140,110,0.5)' : c.type === 'light' ? 'rgba(120,120,70,0.35)' : 'rgba(255,90,20,0.45)'; ctx.beginPath(); ctx.arc(m.x + c.x * sx, m.y + c.y * sy, c.r * sx, 0, 6.28); ctx.fill(); }
    for (const o of map.obstacles) {
      if (o.kind === 'wall') continue;
      ctx.fillStyle = o.kind === 'chasm' ? '#120604' : '#77706a'; ctx.beginPath(); ctx.arc(m.x + o.x * sx, m.y + o.y * sy, Math.max(1.2, o.r * sx), 0, 6.28); ctx.fill();
      if (o.kind === 'chasm') { ctx.fillStyle = 'rgba(255,90,20,0.6)'; ctx.beginPath(); ctx.arc(m.x + o.x * sx, m.y + o.y * sy, Math.max(0.6, o.r * sx * 0.5), 0, 6.28); ctx.fill(); }
    }
    const fog = R3 && R3.getFog && R3.getFog();
    if (fog) {
      const cw = fog.cell * sx, ch = fog.cell * sy;
      for (let r = 0; r < fog.rows; r++) for (let c = 0; c < fog.cols; c++) {
        const v = fog.data[r * fog.cols + c]; if (v === 2) continue;
        ctx.fillStyle = v === 1 ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.8)';
        ctx.fillRect(m.x + c * cw, m.y + r * ch, cw + 0.6, ch + 0.6);
      }
    }
    for (const r of map.relays) { ctx.save(); ctx.translate(m.x + r.x * sx, m.y + r.y * sy); ctx.rotate(Math.PI / 4); ctx.fillStyle = r.owner ? Sim.FACTIONS[r.owner].accent : r.relic ? '#e8d8ff' : '#d8d0ff'; const z = r.relic ? 5 : r.critical ? 4.5 : 3.2; ctx.fillRect(-z, -z, z * 2, z * 2); ctx.strokeStyle = r.relic ? '#fff' : '#000'; ctx.strokeRect(-z, -z, z * 2, z * 2); ctx.restore(); }
    for (const b of state.buildings) {
      if (R3 && !R3.buildingShown(b.id)) continue;
      ctx.fillStyle = b.playerId ? Sim.FACTIONS[b.playerId].color : '#a09080';
      const z = b.type === 'hq' ? 4 : 2.5; ctx.fillRect(m.x + b.x * sx - z, m.y + b.y * sy - z, z * 2, z * 2);
    }
    for (const s of state.squads) {
      if (s.inside || (s.playerId !== playerFaction && !canSee(s))) continue;
      ctx.fillStyle = selected.has(s.id) ? '#fff' : Sim.FACTIONS[s.playerId].accent;
      const z = Sim.UNIT_DEFS[s.unitType].isVehicle ? 2.2 : 1.5;
      ctx.fillRect(m.x + s.x * sx - z, m.y + s.y * sy - z, z * 2, z * 2);
    }
    for (const pg of pings) {
      const k = pg.t / pg.life;
      ctx.strokeStyle = pg.c; ctx.globalAlpha = Math.max(0, 1 - k * 0.8); ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) { const r2 = ((k * 4 + i * 0.5) % 1) * 16 + 3; ctx.beginPath(); ctx.arc(m.x + pg.x * sx, m.y + pg.y * sy, r2, 0, 6.28); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (R3) {
      const c = [s2w(0, L.top), s2w(W, L.top), s2w(W, H), s2w(0, H)];
      ctx.save(); ctx.beginPath(); ctx.rect(m.x, m.y, m.w, m.h); ctx.clip();
      ctx.strokeStyle = 'rgba(255,230,160,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
      c.forEach((q, i) => { const X = m.x + q.x * sx, Y = m.y + q.y * sy; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.closePath(); ctx.stroke(); ctx.restore();
    }
  }

  function tierCmd(p, tierBusy) {
    const tierNext = Sim.TECH[p.tier + 1];
    return { l: tierNext ? 'Tier ' + (p.tier + 1) : 'Max Tier', hot: 'T', ic: IC.up, fn: doTier,
      en: !!tierNext && !tierBusy && p.aether >= tierNext.costAether && p.flux >= tierNext.costFlux,
      why: tierBusy ? 'Already researching' : tierNext ? 'Need ' + costStr(tierNext.costAether, tierNext.costFlux) : 'All tiers unlocked', sub: tierNext ? String(tierNext.costAether) : '',
      tip: tierNext && { title: 'Tier ' + (p.tier + 1) + ': ' + tierNext.name, cost: costStr(tierNext.costAether, tierNext.costFlux, tierNext.time + 's'), lines: [p.tier === 1 ? 'Unlocks the War Forge, Siege Cradle, elite infantry and more research.' : 'Unlocks walkers, super-units (with the Shard) and ultimate commander wargear.'] } };
  }
  function drawCommandCard() {
    const c = L.card, p = state.players[playerFaction];
    panel(c.x, c.y, c.w, c.h);
    const sq = selSquads();
    const has = sq.length > 0;
    const builders = sq.filter((s) => Sim.UNIT_DEFS[s.unitType].isBuilder);
    const canUp = sq.some((s) => { const d = Sim.UNIT_DEFS[s.unitType]; return !s.leaderAttached && !d.isHero && !d.isVehicle && !d.civil; });
    const bt = (t) => {
      const d = Sim.BUILDING_DEFS[t]; const tierOk = !d.requiresTier || p.tier >= d.requiresTier;
      return { en: tierOk && p.aether >= d.costAether && p.flux >= (d.costFlux || 0), why: !tierOk ? 'Requires Tier ' + d.requiresTier : 'Need ' + costStr(d.costAether, d.costFlux), sub: String(d.costAether), tip: buildingTip(t), active: buildMode === t };
    };
    const hq = Sim.findBuilding(state, p.hqId);
    const tierBusy = hq && hq.queue.some((j) => j.kind === 'tier');
    let cmds;
    if (buildMenu || (builders.length && builders.length === sq.length)) {
      cmds = [
        { l: 'Hall', hot: 'B', ic: IC.hall, fn: () => setBuild('barracks'), ...bt('barracks') },
        { l: 'Dynamo', hot: 'G', ic: IC.dynamo, fn: () => setBuild('generator'), ...bt('generator') },
        { l: 'Bastion', hot: 'N', ic: IC.tower, fn: () => setBuild('bastion'), ...bt('bastion') },
        { l: 'Forge', hot: 'K', ic: IC.anvil, fn: () => setBuild('armory'), ...bt('armory') },
        { l: 'Cradle', hot: 'V', ic: IC.walker, fn: () => setBuild('vehicleBay'), ...bt('vehicleBay') },
        { l: 'Retreat', hot: 'R', ic: IC.retreat, fn: doRetreat, en: has, why: 'Select squads first' },
        { l: 'Siphon', hot: 'X', ic: IC.crystalBtn, fn: () => setBuild('refinery'), ...bt('refinery') },
        { l: 'Reinforce', hot: 'F', ic: IC.plus, fn: doReinforce, en: has, why: 'Select squads first' },
        { l: buildMenu ? 'Back' : 'Army', hot: buildMenu ? 'Esc' : '', ic: buildMenu ? IC.retreat : IC.sword, fn: () => { if (buildMenu) buildMenu = false; else selectArmy(); } },
        { l: 'Idle Wkr', hot: ',', ic: IC.crystalBtn, fn: selectIdleWorker },
        tierCmd(p, tierBusy),
        { l: 'Menu', hot: 'Esc', ic: IC.menu, fn: () => { menuOpen = true; } },
      ];
    } else if (sq.length && sq.every((s) => Sim.UNIT_DEFS[s.unitType].isWorker)) {
      const gatherKind = (kind) => () => { let n = 0; for (const s of sq) if (Sim.autoGather(state, s, { kind, any: true })) n++; toast(n ? (kind === 'salvage' ? 'Salvaging wrecks' : 'Harvesting Aether') : 'Nothing to ' + (kind === 'salvage' ? 'salvage' : 'harvest') + ' near a drop-off'); if (n) { sfx('move'); if (tut) tut.gathered = true; } };
      cmds = [
        { l: 'Harvest', hot: '', ic: IC.crystalBtn, fn: gatherKind('aether'), tip: { title: 'Harvest Aether', lines: ['Mine the best crystal node near a drop-off.', 'Or right-click crystals / wrecks directly.'] } },
        { l: 'Salvage', hot: '', ic: IC.bolt2, fn: gatherKind('salvage'), tip: { title: 'Salvage', lines: ['Strip vehicle wrecks for Flux.'] } },
        { l: 'Retreat', hot: 'R', ic: IC.retreat, fn: doRetreat },
        { l: 'Stop', hot: 'S', ic: IC.stop, fn: doStop },
        { l: 'Idle Wkr', hot: ',', ic: IC.crystalBtn, fn: selectIdleWorker },
        { l: 'Idle Bldr', hot: '.', ic: IC.hall, fn: selectIdleBuilder },
        { l: 'Build', hot: '', ic: IC.hall, fn: () => { buildMenu = true; } },
        { l: 'Army', hot: '', ic: IC.sword, fn: selectArmy },
        { l: 'Hero', hot: 'H', ic: (x, y, s2) => emblem(playerFaction, x, y, s2), fn: selectHero },
        tierCmd(p, tierBusy),
        { l: 'Menu', hot: 'Esc', ic: IC.menu, fn: () => { menuOpen = true; } },
      ];
    } else {
      const st = has ? sq[0].stance : 'aggressive';
      const tr = sq.find((s) => Sim.UNIT_DEFS[s.unitType].capacity);
      const rIn = Sim.heroRespawnIn(state, playerFaction);
      cmds = [
        { l: 'Retreat', hot: 'R', ic: IC.retreat, fn: doRetreat, en: has, why: 'Select squads first', tip: { title: 'Retreat', lines: ['Fall back to the nearest Command Nexus or Muster Hall.', 'Retreating squads take 40% less damage and cannot be pinned.'] } },
        { l: 'Reinforce', hot: 'F', ic: IC.plus, fn: doReinforce, en: has, why: 'Select squads first', tip: { title: 'Reinforce', lines: ['Add a trooper. Only near your structures,', 'or out of combat inside your territory.'] } },
        { l: 'Leader', hot: 'U', ic: IC.star, fn: doUpgrade, en: canUp && p.aether >= Sim.UPGRADE_COST.aether && p.flux >= Sim.UPGRADE_COST.flux, why: canUp ? 'Need ' + costStr(Sim.UPGRADE_COST.aether, Sim.UPGRADE_COST.flux) : 'Select a squad without a leader', sub: String(Sim.UPGRADE_COST.aether), tip: { title: 'Squad Leader', cost: costStr(Sim.UPGRADE_COST.aether, Sim.UPGRADE_COST.flux), lines: ['Adds a tougher veteran with better morale.'] } },
        { l: 'Attack', hot: 'A', ic: IC.sword, fn: () => { attackMove = true; toast('Attack-move: choose a destination'); }, en: has, why: 'Select squads first', active: attackMove, tip: { title: 'Attack-move', lines: ['Advance and engage anything met on the way.'] } },
        { l: 'Stop', hot: 'S', ic: IC.stop, fn: doStop, en: has, why: 'Select squads first' },
        { l: STANCE_NAME[st], hot: 'Z', ic: IC.stance, fn: doStance, en: has, why: 'Select squads first', active: has && st !== 'aggressive', tip: { title: 'Stance: ' + STANCE_NAME[st], lines: ['Aggressive: chase targets.', 'Hold Ground: fire but never leave position.', 'Hold Fire: stay hidden; do not shoot.'] } },
        tr ? { l: 'Unload', hot: 'L', ic: IC.retreat, fn: doUnload, en: tr.cargo.length > 0, why: 'Transport is empty' } : { l: 'Build', hot: '', ic: IC.hall, fn: () => { buildMenu = true; }, tip: { title: 'Construction', lines: ['Open the build menu. Builders must construct every structure.'] } },
        { l: 'Hero', hot: 'H', ic: (x, y, s) => emblem(playerFaction, x, y, s), fn: selectHero, sub: rIn > 0 ? Math.ceil(rIn) + 's' : '' },
        { l: 'Army', hot: '', ic: IC.sword, fn: selectArmy, tip: { title: 'Select army', lines: ['Select every combat squad (handy on touch screens).'] } },
        { l: 'Idle Bldr', hot: '.', ic: IC.hall, fn: selectIdleBuilder },
        tierCmd(p, tierBusy),
        { l: 'Menu', hot: 'Esc', ic: IC.menu, fn: () => { menuOpen = true; } },
      ];
    }
    cmds.forEach((cm, i) => {
      const col = i % L.cols, row = Math.floor(i / L.cols);
      const b = { x: c.x + 8 + col * (L.bw + L.gap), y: c.y + 8 + row * (L.bh + L.gap), w: L.bw, h: L.bh, fn: cm.fn, enabled: cm.en !== false, why: cm.why, tip: cm.tip };
      button(b, cm.l, { icon: cm.ic, hot: cm.hot, sub: cm.sub, active: cm.active });
    });
  }

  function panelRect() {
    const leftX = L.mm.x + L.mm.w + 14, rightX = L.card.x - 10;
    if (L.narrow) { const h = 112; return { x: 8, w: W - 16, h, y: L.card.y - h - 8 }; }
    const w = Math.min(640, rightX - leftX); const h = 150;
    return { x: leftX, w, h, y: H - h - 10 };
  }
  function layoutButtons(items, x0, y0, xmax, ymax, size, N) {
    const perRow = Math.max(1, Math.floor((xmax - x0) / (size.w + 5)));
    items.forEach((it, i) => {
      const col = i % perRow, row = Math.floor(i / perRow);
      const b = { x: x0 + col * (size.w + 5), y: y0 + row * (size.h + 4), w: size.w, h: size.h, enabled: it.en !== false, why: it.why, fn: it.fn, tip: it.tip };
      if (b.y + b.h > ymax) return;
      button(b, it.label, { sub: it.sub, hot: it.hot, icon: N ? null : it.icon, cd: it.cd, active: it.active });
    });
  }
  function drawBuildingPanel(prod, x, y, w, h, N, size) {
    const p = state.players[playerFaction];
    const def = Sim.BUILDING_DEFS[prod.type];
    ctx.font = `bold ${N ? 12 : 15}px ${HEAD}`; ctx.fillStyle = '#ffe7a8'; ctx.textAlign = 'left';
    ctx.fillText(BNAME[prod.type] || def.name, x + 10, y + (N ? 15 : 20));
    ctx.font = `${N ? 9 : 10}px ${FONT}`; ctx.fillStyle = '#a89878';
    ctx.fillText('HP ' + Math.ceil(prod.hp) + '/' + prod.maxHp + (prod.rally ? ' · rally set' : isMine(prod) && !N ? ' · right-click ground to set rally' : ''), x + (N ? 150 : 200), y + (N ? 15 : 20));
    if (!isMine(prod)) {
      const occ = prod.occupant && Sim.findSquad(state, prod.occupant);
      ctx.fillStyle = '#c9b48a'; ctx.font = `${N ? 10 : 11}px ${FONT}`;
      const t = prod.type === 'bunker' ? (occ ? 'Held by ' + Sim.UNIT_DEFS[occ.unitType].name + '. Flamers and grenades clear it out.' : 'Empty ruin. Right-click it with infantry to garrison: heavy protection, longer range.') : 'Enemy structure';
      ctx.fillText(t, x + 10, y + 40);
      return;
    }
    if (!prod.complete) { ctx.font = `11px ${FONT}`; ctx.fillStyle = '#c9b48a'; ctx.fillText('Under construction… ' + Math.floor(prod.buildProgress * 100) + '% (builders must stay nearby)', x + 10, y + 40); return; }
    const qy = y + (N ? 20 : 28), qs = N ? 22 : 30;
    for (let i = 0; i < 5; i++) {
      const j = prod.queue[i];
      const b = { x: x + 10 + i * (qs + 4), y: qy, w: qs, h: qs, enabled: !!j, fn: () => { Sim.cancelQueue(state, prod.id, i); toast('Cancelled - refunded'); }, why: 'Empty queue slot', tip: j && { title: jobName(j), lines: [i === 0 ? Math.ceil(j.remaining) + 's remaining' : 'Queued', 'Click to cancel (full refund)'] } };
      buttons.push(b);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(b.x, b.y, qs, qs, 4); ctx.fill(); ctx.strokeStyle = 'rgba(150,120,80,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      if (j) {
        if (j.kind === 'unit') unitIcon(j.unitType, b.x + qs / 2, b.y + qs / 2 + 2, qs * 0.28);
        else if (j.kind === 'tier') IC.up(b.x + qs / 2, b.y + qs / 2, qs * 0.3); else IC.flask(b.x + qs / 2, b.y + qs / 2, qs * 0.3);
        if (i === 0) { ctx.fillStyle = 'rgba(255,208,96,0.9)'; ctx.fillRect(b.x + 2, b.y + qs - 4, (qs - 4) * (1 - j.remaining / j.total), 3); }
        if (hovered(b)) { ctx.fillStyle = 'rgba(255,60,40,0.45)'; rr(b.x, b.y, qs, qs, 4); ctx.fill(); }
      }
    }
    const units = Object.keys(Sim.UNIT_DEFS).filter((u) => { const d = Sim.UNIT_DEFS[u]; return d.faction === playerFaction && !d.isHero && d.producer === prod.type; }).sort((a, b) => Sim.UNIT_DEFS[a].tier - Sim.UNIT_DEFS[b].tier);
    const res = Object.keys(Sim.RESEARCH).filter((r) => Sim.RESEARCH[r].building === prod.type);
    const items = [];
    for (const u of units) {
      const d = Sim.UNIT_DEFS[u]; const why = Sim.unitAvailability(state, playerFaction, u);
      items.push({ label: d.name.split(' ').slice(-1)[0], sub: d.costAether + (d.costFlux ? '/' + d.costFlux : ''), en: !why && prod.queue.length < 5, why: why === 'resources' ? 'Need ' + costStr(d.costAether, d.costFlux) : why || 'Queue full', icon: (cx, cy, s) => unitIcon(u, cx, cy + 2, s), tip: unitTip(u), fn: () => { const r = Sim.queueUnit(state, prod.id, u); toast(r.ok ? 'Training ' + d.name : 'Cannot train: ' + r.reason); } });
    }
    for (const rid of res) {
      const r = Sim.RESEARCH[rid]; const why = Sim.researchAvailability(state, playerFaction, rid, prod);
      const done = p.research.has(rid);
      items.push({ label: r.name[playerFaction].split(' ').slice(-1)[0], sub: done ? '✓' : String(r.aether), en: !why, why: why === 'resources' ? 'Need ' + costStr(r.aether, r.flux) : why, icon: (cx, cy, s) => IC.flask(cx, cy, s), tip: researchTip(rid), fn: () => { const q = Sim.queueResearch(state, prod.id, rid); toast(q.ok ? 'Researching ' + r.name[playerFaction] : 'Research: ' + q.reason); }, active: done });
    }
    if (prod.type === 'hq') { const tc = tierCmd(p, prod.queue.some((j) => j.kind === 'tier')); if (Sim.TECH[p.tier + 1]) items.push({ label: tc.l, sub: tc.sub, en: tc.en, why: tc.why, icon: (cx, cy, s) => IC.up(cx, cy, s), fn: tc.fn, tip: tc.tip }); }
    if (!items.length) { ctx.font = `11px ${FONT}`; ctx.fillStyle = '#c9b48a'; ctx.fillText(def.generatesFlux ? 'Generating ' + def.generatesFlux + ' Flux/s' : def.turret ? 'Defensive emplacement · detects hidden units' : '', x + 10, qy + qs + 20); return; }
    layoutButtons(items, x + 10, qy + qs + 6, x + w - 6, y + h - 2, size, N);
  }
  function drawSquadPanel(s, x, y, w, h, N, size) {
    const p = state.players[playerFaction], d = Sim.UNIT_DEFS[s.unitType];
    ctx.textAlign = 'left'; ctx.font = `bold ${N ? 12 : 15}px ${HEAD}`; ctx.fillStyle = '#ffe7a8';
    ctx.fillText(d.name + (s.leaderAttached ? ' ★' : ''), x + 10, y + (N ? 15 : 20));
    const pim = R3 && R3.portrait ? R3.portrait(s.unitType) : null;
    if (pim) { const ps = N ? 44 : 64, px = x + w - ps - 8, py = y + 6; ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(px, py, ps, ps, 5); ctx.fill(); ctx.save(); rr(px, py, ps, ps, 5); ctx.clip(); ctx.drawImage(pim, px, py, ps, ps); ctx.restore(); ctx.strokeStyle = 'rgba(200,150,70,0.8)'; ctx.lineWidth = 1.2; rr(px, py, ps, ps, 5); ctx.stroke(); }
    const bwid = N ? 110 : 160;
    bar(x + 10, y + (N ? 21 : 28), bwid, 5, s.hp / s.maxHp, '#6fe08a');
    if (!d.isVehicle) { bar(x + 10, y + (N ? 29 : 37), bwid, 3, s.morale / s.maxMorale, s.broken ? '#ff4040' : '#6aa8ff'); bar(x + 10, y + (N ? 35 : 44), bwid, 2, s.suppression / 100, s.pinned ? '#ff7a30' : '#e0c050'); }
    const chips = [STANCE_NAME[s.stance]];
    if (s.broken) chips.push('BROKEN'); else if (s.pinned) chips.push('PINNED'); else if (s.suppression >= 45) chips.push('SUPPRESSED');
    if (s.stealthed) chips.push('HIDDEN');
    if (s.inside) chips.push(Sim.findBuilding(state, s.inside) ? 'IN REDOUBT' : 'EMBARKED');
    const cov = Sim.coverAt(state.map, s.x, s.y); if (cov && !d.isVehicle) chips.push(cov + ' cover');
    if (d.capacity) chips.push('carrying ' + s.cargo.length + '/' + d.capacity);
    if (s.reinforcePending) chips.push('+' + s.reinforcePending + ' arriving');
    const rwhy = !d.isVehicle && !d.isHero && s.modelCount < s.maxModels ? Sim.reinforceCheck(state, s) : null;
    if (rwhy && rwhy !== 'full') chips.push('reinforce: ' + rwhy);
    ctx.font = `${N ? 9 : 10}px ${FONT}`; ctx.fillStyle = '#c9b48a';
    const cx0 = x + (N ? 130 : bwid + 20);
    let chipText = chips.join(' · ');
    while (chipText.length > 4 && ctx.measureText(chipText).width > x + w - cx0 - 8) chipText = chipText.slice(0, -2);
    ctx.fillText(chipText, cx0, y + (N ? 15 : 20));
    const mx0 = cx0, my0 = y + (N ? 21 : 27);
    const mw = N ? 34 : 54, mh = N ? 17 : 22;
    s.models.filter((m) => m.alive).forEach((m, i) => {
      const cx = mx0 + i * (mw + 3);
      if (cx + mw > x + w - 4) return;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(cx, my0, mw, mh, 3); ctx.fill();
      const wt = Sim.WEAPONS[m.weapon];
      ctx.fillStyle = WCOL[wt.type] || '#ddd'; ctx.font = `bold ${N ? 7.5 : 9}px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText((m.leader ? '★' : '') + shortWeapon(m.weapon), cx + mw / 2, my0 + (N ? 9 : 12));
      bar(cx + 3, my0 + mh - 4, mw - 6, 2, m.hp / m.maxHp, '#6fe08a');
    });
    ctx.textAlign = 'left';
    const acts = [];
    d.abilities.forEach((aid, i) => {
      const a = Sim.ABILITIES[aid]; const why = Sim.abilityReady(state, s, aid);
      acts.push({ label: a.name.split(' ').slice(-1)[0], hot: i === 0 ? 'Q' : 'E', en: !why, why: a.name + ': ' + why, cd: (s.abilityCd[aid] || 0) / a.cd, icon: (cx, cy, sz) => abilityIcon(aid, cx, cy, sz), tip: abilityTip(aid), fn: () => triggerAbility([s.id], aid), active: targeting && targeting.aid === aid });
    });
    for (const opt of d.wargear) {
      const wn = Sim.WEAPONS[opt.id];
      const count = s.models.filter((m) => m.alive && m.weapon === opt.id).length;
      const en = p.tier >= opt.tier && count < opt.max && p.aether >= opt.aether && p.flux >= opt.flux && !s.inside;
      acts.push({ label: shortWeapon(opt.id) + ' ' + count + '/' + opt.max, sub: String(opt.aether), en, why: p.tier < opt.tier ? 'Requires Tier ' + opt.tier : count >= opt.max ? 'Maximum fitted' : 'Need ' + costStr(opt.aether, opt.flux), icon: (cx, cy, sz) => IC.gun(cx, cy, sz, WCOL[wn.type]), tip: weaponTip(opt.id, opt), fn: () => { const r = Sim.addWargear(state, s.id, opt.id); toast(r.ok ? wn.name + ' issued' : 'Wargear: ' + r.reason); if (r.ok) sfx('capture'); } });
    }
    if (d.isHero) {
      for (const slot of ['weapon', 'ultimate']) {
        const g = Sim.HERO_GEAR[playerFaction][slot]; const has = p.heroGear[slot];
        acts.push({ label: g.name.split(' ')[0], sub: has ? '✓' : String(g.aether), en: !has && p.tier >= g.tier && p.aether >= g.aether && p.flux >= g.flux && (slot === 'weapon' || p.heroGear.weapon), why: has ? 'Equipped' : p.tier < g.tier ? 'Requires Tier ' + g.tier : slot === 'ultimate' && !p.heroGear.weapon ? 'Needs ' + Sim.HERO_GEAR[playerFaction].weapon.name + ' first' : 'Need ' + costStr(g.aether, g.flux), active: has, icon: (cx, cy, sz) => (slot === 'weapon' ? IC.sword(cx, cy, sz) : IC.star(cx, cy, sz)), tip: { title: g.name, cost: costStr(g.aether, g.flux), lines: [g.desc, 'Requires Tier ' + g.tier + (slot === 'ultimate' ? ' · ultimate wargear' : '')] }, fn: () => { const r = Sim.buyHeroGear(state, s.id, slot); toast(r.ok ? g.name + ' equipped!' : r.reason); if (r.ok) sfx('ability'); } });
      }
    }
    if (d.capacity) acts.push({ label: 'Unload', hot: 'L', en: s.cargo.length > 0, why: 'Empty', icon: IC.retreat, fn: doUnload, tip: { title: 'Unload', lines: ['Disembark all passengers. Right-click the transport with infantry to embark.'] } });
    if (s.inside && Sim.findBuilding(state, s.inside)) acts.push({ label: 'Exit', icon: IC.retreat, fn: () => { Sim.issueMove(state, [s.id], s.x + (playerFaction === 'vigilant' ? -60 : 60), s.y, false); }, tip: { title: 'Leave Redoubt', lines: ['Exit the building.'] } });
    const ay = y + (N ? 42 : 56);
    if (acts.length) layoutButtons(acts, x + 10, ay, x + w - 6, y + h - 2, size, N);
    else if (!N) { ctx.font = `11px ${FONT}`; ctx.fillStyle = '#8f8270'; ctx.fillText(d.desc, x + 10, y + 80); ctx.fillText('Strong vs ' + d.good + ' · Weak vs ' + d.bad, x + 10, y + 98); }
  }
  function drawSelectionPanel() {
    const { x, y, w, h } = panelRect();
    if (!L.narrow && w < 260) return;
    const prod = prodBuilding ? Sim.findBuilding(state, prodBuilding) : null;
    const sq = selSquads();
    if (!prod && !sq.length) return;
    panel(x, y, w, h);
    ctx.textBaseline = 'alphabetic';
    const N = L.narrow;
    const size = N ? { w: 52, h: 40 } : { w: 74, h: 58 };
    if (prod) return drawBuildingPanel(prod, x, y, w, h, N, size);
    if (sq.length === 1) return drawSquadPanel(sq[0], x, y, w, h, N, size);
    ctx.textAlign = 'left'; ctx.font = `bold ${N ? 12 : 14}px ${HEAD}`; ctx.fillStyle = '#ffe7a8'; ctx.fillText(sq.length + ' squads selected', x + 10, y + (N ? 15 : 20));
    const cw = N ? 40 : 58, hh = N ? 40 : 78;
    const perRow = Math.max(1, Math.floor((w - 16) / (cw + 4)));
    sq.slice(0, perRow * (N ? 2 : 1)).forEach((s, i) => {
      const cx = x + 10 + (i % perRow) * (cw + 4), cy = y + (N ? 22 : 30) + Math.floor(i / perRow) * 44;
      const b = { x: cx, y: cy, w: cw, h: hh, fn: () => { selected = new Set([s.id]); }, tip: { title: Sim.UNIT_DEFS[s.unitType].name, lines: [s.modelCount + '/' + s.maxModels + ' · ' + STANCE_NAME[s.stance] + (s.broken ? ' · BROKEN' : '')] } };
      buttons.push(b);
      ctx.fillStyle = hovered(b) ? 'rgba(80,70,50,0.6)' : 'rgba(0,0,0,0.45)'; rr(cx, cy, cw, hh, 4); ctx.fill();
      unitIcon(s.unitType, cx + cw / 2, cy + hh * 0.42, cw * 0.28);
      bar(cx + 4, cy + hh - 8, cw - 8, 3, s.hp / s.maxHp, s.broken ? '#ff4040' : '#6fe08a');
      if (s.suppression > 1) bar(cx + 4, cy + hh - 4, cw - 8, 2, s.suppression / 100, '#e0c050');
    });
  }

  function drawTooltip() {
    let b = null;
    if (!mobile) for (let i = buttons.length - 1; i >= 0; i--) if (buttons[i].tip && hovered(buttons[i])) { b = buttons[i]; break; }
    if (!b && tipPinned && tipT > 0) b = tipPinned;
    if (!b || !b.tip) return;
    const t = b.tip;
    const lines = (t.lines || []).filter(Boolean);
    const extra = [];
    if (t.good) extra.push(['Strong vs: ' + t.good, '#8fe0a0']);
    if (t.bad) extra.push(['Weak vs: ' + t.bad, '#ff9a80']);
    if (b.enabled === false && b.why) extra.push(['✖ ' + b.why, '#ff7060']);
    ctx.font = `12px ${FONT}`;
    const widths = [t.title, t.cost || ''].map((s) => ctx.measureText(s).width + 30).concat(lines.concat(extra.map((e) => e[0])).map((s) => ctx.measureText(s).width + 24));
    const tw = Math.min(W - 16, Math.max(180, ...widths));
    const th = 26 + (t.cost ? 16 : 0) + (lines.length + extra.length) * 16 + 6;
    const tx = Math.min(W - tw - 8, Math.max(8, b.x + b.w / 2 - tw / 2));
    let ty = b.y - th - 8;
    if (ty < L.top + 4) ty = b.y + b.h + 8;
    panel(tx, ty, tw, th);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `bold 13px ${HEAD}`; ctx.fillStyle = '#ffe7a8'; ctx.fillText(t.title, tx + 10, ty + 18);
    let yy = ty + 18;
    if (t.cost) { yy += 16; ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = '#d0b8ff'; ctx.fillText(t.cost, tx + 10, yy); }
    ctx.font = `11px ${FONT}`;
    for (const l of lines) { yy += 16; ctx.fillStyle = '#d8ccb4'; ctx.fillText(l, tx + 10, yy); }
    for (const [l, c] of extra) { yy += 16; ctx.fillStyle = c; ctx.fillText(l, tx + 10, yy); }
  }

  function drawToast() {
    if (msgT <= 0) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, msgT * 2);
    ctx.font = `bold ${L.narrow ? 12 : 14}px ${FONT}`;
    const tw = Math.min(W - 20, ctx.measureText(msg).width + 36), y = L.top + 10 + (tut ? (L.narrow ? 70 : 118) : 0);
    panel(W / 2 - tw / 2, y, tw, 30);
    ctx.fillStyle = '#ffe7a8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(msg, W / 2, y + 15);
    ctx.restore();
  }

  /* ------------------------------ Alerts ------------------------------ */
  function alert(text, x, y, color, ping) {
    alerts.unshift({ text, x, y, t: 0, color: color || '#ffe7a8' });
    if (alerts.length > 6) alerts.length = 6;
    if (x != null) { lastAlert = { x, y }; if (ping) pings.push({ x, y, t: 0, life: 4, c: color || '#ff6040' }); }
  }
  function processEvents() {
    for (const ev of state.events) {
      if (!ev.seq || ev.seq <= lastSeq) continue;
      lastSeq = Math.max(lastSeq, ev.seq);
      const mine = ev.playerId === playerFaction;
      switch (ev.type) {
        case 'underAttack': if (mine) { alert('Your forces are under attack!', ev.x, ev.y, '#ff6a50', true); sfx('alert'); } break;
        case 'capture':
          if (mine) { alert(ev.relic ? 'Starheart Shard seized! Super-unit unlocked.' : 'Relay secured', ev.x, ev.y, '#8fe0a0', false); sfx('capture'); }
          else alert(ev.relic ? 'The enemy holds the Starheart Shard!' : 'Enemy captured a Relay', ev.x, ev.y, '#ff9a60', true);
          break;
        case 'lost': if (mine) { alert(ev.relic ? 'We lost the Starheart Shard!' : 'A Relay has been lost!', ev.x, ev.y, '#ff6a50', true); sfx('alert'); } break;
        case 'heroDown': if (mine) { alert('Your commander has fallen! Returns in ' + Sim.HERO_RESPAWN + 's', ev.x, ev.y, '#ff5040', true); sfx('alert'); } else alert('Enemy commander slain!', ev.x, ev.y, '#8fe0a0', false); break;
        case 'heroUp': if (mine) { alert('Commander redeployed at the Nexus', ev.x, ev.y, '#8fe0a0', false); sfx('ready'); } break;
        case 'unitReady': if (mine) { alert(Sim.UNIT_DEFS[ev.unitType].name + ' ready', ev.x, ev.y, '#d8ccb4', false); sfx('ready'); } break;
        case 'research': if (mine) { alert('Research complete: ' + Sim.RESEARCH[ev.id].name[playerFaction], null, null, '#c0a0ff'); sfx('ready'); } break;
        case 'tier': if (mine) { alert('Tier ' + ev.tier + ' unlocked!', null, null, '#ffd060'); sfx('capture'); } else alert('The enemy has reached Tier ' + ev.tier, null, null, '#ff9a60'); break;
        case 'built': if (mine) { alert(BNAME[ev.buildingType] + ' complete', ev.x, ev.y, '#d8ccb4', false); sfx('ready'); } break;
        case 'buildingLost': if (mine) { alert(BNAME[ev.buildingType] + ' destroyed!', ev.x, ev.y, '#ff5040', true); sfx('alert'); } break;
        case 'depleted': if (ev.fieldId && !state.nodes.some((n) => n.fieldId === ev.fieldId) && ev.playerId === playerFaction) alert('A crystal field is exhausted - expand to a new field', ev.x, ev.y, '#7fe6ff', false); break;
        case 'wreck': break;
        case 'deposit': if (mine && R3 && R3.depositFx) R3.depositFx(ev); break;
        case 'squadLost': if (mine) alert(Sim.UNIT_DEFS[ev.unitType].name + ' wiped out', ev.x, ev.y, '#ff8070', true); break;
        case 'broken': if (mine) alert('A squad is broken and falling back!', ev.x, ev.y, '#ffb050', false); break;
        case 'ability': if (mine) { if (tut) tut.usedAbility = true; } else if (ev.id === 'ordnance' || ev.id === 'howl') alert('Enemy ' + Sim.ABILITIES[ev.id].name + '!', ev.x, ev.y, '#ff7050', true); break;
      }
      if (tut && mine && ev.type === 'unitReady' && !Sim.UNIT_DEFS[ev.unitType].civil) tut.trained = true;
    }
  }
  function drawAlerts() {
    const x0 = 10; let y0 = L.top + 8 + (tut ? (L.narrow ? 70 : 118) : 0);
    if (msgT > 0 && (L.narrow || tut)) y0 += 36;
    const maxN = L.narrow ? 2 : 5;
    alerts.slice(0, maxN).forEach((a, i) => {
      if (a.t > 9) return;
      const alpha = Math.min(1, (9 - a.t) / 1.5);
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.font = `bold ${L.narrow ? 10 : 12}px ${FONT}`;
      const tw = Math.min(W - 20, ctx.measureText(a.text).width + 26), th = L.narrow ? 18 : 22;
      const b = { x: x0, y: y0 + i * (th + 4), w: tw, h: th, fn: () => { if (a.x != null) { cam.x = a.x; cam.y = a.y; } } };
      buttons.push(b);
      ctx.fillStyle = 'rgba(14,10,10,0.78)'; rr(b.x, b.y, tw, th, 4); ctx.fill();
      ctx.fillStyle = a.color; ctx.fillRect(b.x, b.y, 3, th);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText((a.x != null ? '◎ ' : '') + a.text, b.x + 9, b.y + th / 2 + 1);
      ctx.restore();
    });
    ctx.textBaseline = 'alphabetic';
  }

  /* ------------------------------ Tutorial ------------------------------ */
  const TUT = [
    { t: 'Select a combat squad (click it, or the Army button)', done: () => selSquads().some((s) => !Sim.UNIT_DEFS[s.unitType].civil) },
    { t: 'Capture a Relay: right-click it with a squad', done: () => state.map.relays.some((r) => r.owner === playerFaction) },
    { t: 'Harvest: select a worker (,) and right-click blue crystals', done: () => tut.gathered || state.players[playerFaction].stats.gathered >= 40 },
    { t: 'Train a worker at the Command Nexus, then build an Aether Siphon (X) by a field', done: () => state.buildings.some((b) => isMine(b) && b.type === 'refinery') },
    { t: 'Select builders (.) and build a Flux Dynamo (G)', done: () => state.buildings.filter((b) => isMine(b) && b.type === 'generator').length >= 2 },
    { t: 'Train a squad: click the Muster Hall, pick a unit', done: () => tut.trained },
    { t: 'Move a squad into heavy cover (green ▲ marker)', done: () => state.squads.some((s) => isMine(s) && !Sim.UNIT_DEFS[s.unitType].isVehicle && Sim.coverAt(state.map, s.x, s.y) === 'heavy') },
    { t: 'Garrison a Ruined Redoubt: right-click it with infantry', done: () => state.buildings.some((b) => b.type === 'bunker' && b.occupant && isMine(Sim.findSquad(state, b.occupant))) },
    { t: 'Use your commander\'s ability (H, then Q)', done: () => tut.usedAbility },
    { t: 'Research Tier 2 at the Command Nexus (T)', done: () => state.players[playerFaction].tier >= 2 || (Sim.findBuilding(state, state.players[playerFaction].hqId) || { queue: [] }).queue.some((j) => j.kind === 'tier') },
    { t: 'Hold 3 Relays to drain the enemy\'s tickets', done: () => state.map.relays.filter((r) => r.owner === playerFaction).length >= 3 },
  ];
  function updateTutorial(dt) {
    if (!tut) return;
    tut.flash = Math.max(0, tut.flash - dt);
    while (tut.step < TUT.length && TUT[tut.step].done()) { tut.step++; tut.flash = 1.2; sfx('capture'); if (tut.step >= TUT.length) toast('Tutorial complete! Now break the enemy.'); }
  }
  function drawTutorial() {
    if (!tut) return;
    const N = L.narrow;
    const x = 10, y = L.top + 8, w = N ? Math.min(W - 20, 300) : 380, h = N ? 62 : 110;
    panel(x, y, w, h, tut.flash > 0 ? '#ffd060' : null);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `bold ${N ? 11 : 13}px ${HEAD}`; ctx.fillStyle = '#ffe7a8';
    ctx.fillText('TUTORIAL  ' + Math.min(tut.step + 1, TUT.length) + ' / ' + TUT.length, x + 10, y + (N ? 16 : 20));
    if (tut.step >= TUT.length) { ctx.fillStyle = '#7fe08a'; ctx.font = `bold ${N ? 10 : 12}px ${FONT}`; ctx.fillText('All done - drain their tickets or destroy their Nexus!', x + 10, y + (N ? 36 : 46)); return; }
    const from = N ? tut.step : Math.max(0, tut.step - 1);
    const n = N ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const k = from + i; if (k >= TUT.length) break;
      const done = k < tut.step;
      ctx.font = `${k === tut.step ? 'bold ' : ''}${N ? 10 : 12}px ${FONT}`;
      ctx.fillStyle = done ? '#7fe08a' : k === tut.step ? '#fff' : '#8f8270';
      ctx.fillText((done ? '✔ ' : k === tut.step ? '▶ ' : '· ') + TUT[k].t, x + 10, y + (N ? 33 : 42) + i * (N ? 15 : 19));
    }
  }

  /* ------------------------------ Pause / settings ------------------------------ */
  function drawPauseMenu() {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
    const N = L.narrow;
    const gfx = R3 && R3.v5;
    const w = Math.min(W - 24, 440), h = Math.min(H - 24, (N ? 420 : 470) + (gfx ? (N ? 82 : 98) : 0));
    const x = W / 2 - w / 2, y = Math.max(12, H / 2 - h / 2);
    panel(x, y, w, h, '#c09040');
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `bold ${N ? 22 : 28}px ${HEAD}`; ctx.fillStyle = '#ffe7a8'; ctx.fillText('PAUSED', W / 2, y + (N ? 32 : 40));
    const bw = w - 60, bh = N ? 34 : 40, gap = N ? 7 : 9;
    let by = y + (N ? 48 : 60);
    const row = (label, fn, active) => { const b = { x: x + 30, y: by, w: bw, h: bh, fn }; button(b, '', { active }); ctx.fillStyle = '#efe4cf'; ctx.font = `bold ${N ? 13 : 15}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(label, W / 2, by + bh / 2 + 5); by += bh + gap; };
    row('Resume', () => { menuOpen = false; });
    row('Sound: ' + (muted ? 'Off' : 'On'), toggleMute);
    row('Fog of war: ' + (state.fogEnabled ? 'On' : 'Off (map revealed)'), () => { state.fogEnabled = !state.fogEnabled; Sim.updateVision(state, true); });
    row('Game speed: ' + speed + '×', () => { speed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : speed === 2 ? 0.5 : 1; });
    if (gfx) {
      const q = R3.getQuality();
      row('Graphics: ' + q[0].toUpperCase() + q.slice(1), () => { R3.setQuality(q === 'low' ? 'medium' : q === 'medium' ? 'high' : 'low'); });
      row('Depth of field: ' + (R3.getDOF() ? 'On' : 'Off'), () => { R3.setDOF(!R3.getDOF()); });
    }
    row('Restart battle', () => { startGame(tutorialMode); });
    row('Quit to main menu', quitToMenu);
    ctx.font = `${N ? 9 : 11}px ${FONT}`; ctx.fillStyle = '#b8a888'; ctx.textAlign = 'center';
    const help = N ? ['Tap select · tap ground to order · drag to pan', 'Pinch zoom · Army selects all · tap the minimap to jump']
      : ['Right-drag sets facing · A attack-move · S stop · Z stance · R retreat · F reinforce', 'Q/E abilities · U leader · T tier · B/G/N/K/V build · . idle builder', 'Space: jump to last alert · P pause · Ctrl+1-9 groups · H hero'];
    help.forEach((l, i) => ctx.fillText(l, W / 2, by + 12 + i * (N ? 13 : 16)));
  }

  function drawHUD() {
    buttons = [];
    L = layout();
    drawWorldOverlay();
    if (boxSel && !boxSel.minimap && !boxSel.touch && (Math.abs(boxSel.x1 - boxSel.x0) > 4 || Math.abs(boxSel.y1 - boxSel.y0) > 4)) {
      const x = Math.min(boxSel.x0, boxSel.x1), y = Math.min(boxSel.y0, boxSel.y1), w = Math.abs(boxSel.x1 - boxSel.x0), h = Math.abs(boxSel.y1 - boxSel.y0);
      ctx.fillStyle = 'rgba(255,220,130,0.1)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(255,220,130,0.9)'; ctx.lineWidth = 1.2; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    }
    drawTopBar();
    drawMinimap();
    drawCommandCard();
    drawSelectionPanel();
    drawTutorial();
    drawAlerts();
    drawToast();
    drawTooltip();
    if (paused && mode === 'playing' && !menuOpen) {
      ctx.font = `bold 34px ${HEAD}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe7a8'; ctx.fillText('PAUSED (P)', W / 2, H * 0.4);
    }
    if (menuOpen) { buttons = []; drawPauseMenu(); }
  }

  function aetherRate(pid) { return Sim.incomeOf(state, pid).aether + Sim.depositRate(state, pid).aether; }
  function fluxRate(pid) { return Sim.incomeOf(state, pid).flux + Sim.depositRate(state, pid).flux; }

  /* ------------------------------ Menu / skirmish setup / victory ------------------------------ */
  const mapCache = {};
  function mapPreview(id, x, y, w, h) {
    const m = mapCache[id] || (mapCache[id] = Sim.createMap(7, id));
    const sx = w / m.width, sy = h / m.height;
    ctx.fillStyle = '#2e2622'; ctx.fillRect(x, y, w, h);
    for (const c of m.cover) { ctx.fillStyle = c.type === 'heavy' ? 'rgba(120,140,110,0.6)' : c.type === 'light' ? 'rgba(120,120,70,0.4)' : 'rgba(255,90,20,0.5)'; ctx.beginPath(); ctx.arc(x + c.x * sx, y + c.y * sy, c.r * sx, 0, 6.28); ctx.fill(); }
    for (const o of m.obstacles) { if (o.kind === 'wall') continue; ctx.fillStyle = o.kind === 'chasm' ? '#ff5a1a' : '#8a8078'; ctx.beginPath(); ctx.arc(x + o.x * sx, y + o.y * sy, Math.max(1, o.r * sx), 0, 6.28); ctx.fill(); }
    for (const r of m.relays) { ctx.fillStyle = r.relic ? '#fff' : r.critical ? '#ffd060' : '#d8d0ff'; ctx.fillRect(x + r.x * sx - 2, y + r.y * sy - 2, 4, 4); }
    ctx.fillStyle = Sim.FACTIONS.vigilant.color; ctx.fillRect(x + m.hqSpawns.vigilant.x * sx - 3, y + m.hqSpawns.vigilant.y * sy - 3, 6, 6);
    ctx.fillStyle = Sim.FACTIONS.riven.color; ctx.fillRect(x + m.hqSpawns.riven.x * sx - 3, y + m.hqSpawns.riven.y * sy - 3, 6, 6);
  }
  function drawMenu(dt) {
    buttons = [];
    L = layout();
    menuT += dt;
    const n = W < 760, short = H < 560;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(8,4,4,0.7)'); g.addColorStop(0.3, 'rgba(8,4,4,0.15)'); g.addColorStop(0.6, 'rgba(8,4,4,0.3)'); g.addColorStop(1, 'rgba(8,4,4,0.88)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const ty = n ? Math.max(48, H * 0.09) : short ? 60 : H * 0.12;
    ctx.font = `bold ${n ? 40 : short ? 50 : 68}px ${HEAD}`;
    ctx.shadowColor = 'rgba(255,110,30,0.9)'; ctx.shadowBlur = 30;
    const tg = ctx.createLinearGradient(0, ty - 60, 0, ty); tg.addColorStop(0, '#fff3d0'); tg.addColorStop(0.6, '#f0b860'); tg.addColorStop(1, '#a0582a');
    ctx.fillStyle = tg; ctx.fillText('EMBERVEIL', W / 2, ty);
    ctx.shadowBlur = 0;
    ctx.font = `italic ${n ? 11 : 16}px ${HEAD}`; ctx.fillStyle = '#e8cfa8';
    ctx.fillText(n ? 'The dead stars bleed Aether. Hold the Relays.' : 'The dead stars bleed Aether. Hold the Relays, or be ground to ash.', W / 2, ty + (n ? 18 : 26));
    ctx.restore();
    const cards = [
      { id: 'vigilant', title: 'The Vigilant Order', desc: ['Armoured zealots of the Lantern Creed.', 'Firelines, weapon teams, snipers,', 'Seraph jump troops and Aegis Walkers.'] },
      { id: 'riven', title: 'The Riven Horde', desc: ['Scrap-forged reavers of the ash.', 'Fast, cheap and savage in melee;', 'Leapers, Brutes and the Behemoth.'] },
    ];
    const cw = n ? Math.min(W - 24, 350) : 360, ch = n ? 70 : short ? 100 : 130;
    const cy0 = n ? ty + 28 : ty + 42;
    cards.forEach((c, i) => {
      const x = n ? W / 2 - cw / 2 : W / 2 - cw - 12 + i * (cw + 24);
      const y = n ? cy0 + i * (ch + 8) : cy0;
      buttons.push({ x, y, w: cw, h: ch, fn: () => { playerFaction = c.id; } });
      const sel = playerFaction === c.id;
      panel(x, y, cw, ch, sel ? Sim.FACTIONS[c.id].accent : null);
      if (sel) { ctx.save(); ctx.shadowColor = Sim.FACTIONS[c.id].color; ctx.shadowBlur = 24; ctx.strokeStyle = Sim.FACTIONS[c.id].accent; ctx.lineWidth = 2.5; rr(x, y, cw, ch, 6); ctx.stroke(); ctx.restore(); }
      const es = n ? 22 : short ? 30 : 38;
      emblem(c.id, x + es + 14, y + ch / 2, es * (sel ? 1 : 0.9));
      const tx = x + es * 2 + 26;
      ctx.textAlign = 'left';
      ctx.font = `bold ${n ? 14 : 19}px ${HEAD}`; ctx.fillStyle = sel ? '#ffe7a8' : '#cdbb9c';
      ctx.fillText(c.title, tx, y + (n ? 22 : 32));
      ctx.font = `${n ? 9.5 : 12}px ${FONT}`; ctx.fillStyle = '#b8a888';
      c.desc.forEach((l, j) => { if ((n || short) && j === 2) return; ctx.fillText(l, tx, y + (n ? 38 : 54) + j * (n ? 13 : 19)); });
      if (sel && !n) { ctx.font = `bold 10px ${FONT}`; ctx.fillStyle = Sim.FACTIONS[c.id].accent; ctx.fillText('◆ SELECTED', tx, y + ch - 10); }
    });
    const my = n ? cy0 + 2 * (ch + 8) + 2 : cy0 + ch + 12;
    const maps = [['basin', 'Cinder Basin', '7 relays · ridges · Shard'], ['causeway', 'Shattered Causeway', 'lava rift · 3 bridges']];
    const mw = n ? Math.min((W - 30) / 2, 175) : 250, mh = n ? 48 : short ? 54 : 70;
    maps.forEach(([id, name, sub], i) => {
      const x = W / 2 - mw - 5 + i * (mw + 10);
      buttons.push({ x, y: my, w: mw, h: mh, fn: () => { mapId = id; } });
      const sel = mapId === id;
      panel(x, my, mw, mh, sel ? '#ffd060' : null);
      const ph = mh - 10, pw = Math.round(ph * 1.33);
      mapPreview(id, x + 5, my + 5, pw, ph);
      ctx.textAlign = 'left'; ctx.font = `bold ${n ? 10.5 : 14}px ${HEAD}`; ctx.fillStyle = sel ? '#ffe7a8' : '#cdbb9c';
      ctx.fillText(n ? name.split(' ').slice(-1)[0] : name, x + pw + 12, my + (n ? 20 : 26));
      ctx.font = `${n ? 8.5 : 11}px ${FONT}`; ctx.fillStyle = '#a89878'; ctx.fillText(n ? sub.split(' · ')[0] : sub, x + pw + 12, my + (n ? 34 : 44));
      if (sel) { ctx.strokeStyle = '#ffd060'; ctx.lineWidth = 2; rr(x, my, mw, mh, 6); ctx.stroke(); }
    });
    const dy = my + mh + (n ? 8 : 10);
    const dw = n ? 96 : 120, dgap = 8;
    ['easy', 'normal', 'hard'].forEach((d, i) => {
      const b = { x: W / 2 - (3 * dw + 2 * dgap) / 2 + i * (dw + dgap), y: dy, w: dw, h: n ? 32 : 36, fn: () => { difficulty = d; } };
      button(b, '', { active: difficulty === d });
      ctx.fillStyle = difficulty === d ? '#fff' : '#cdbb9c'; ctx.font = `bold ${n ? 12 : 14}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(d.toUpperCase() + ' AI', b.x + dw / 2, b.y + b.h / 2 + 5);
    });
    const bw = n ? 200 : 240, bh = n ? 46 : 52;
    const by = dy + (n ? 42 : 46);
    const db = { x: W / 2 - bw / 2, y: by, w: bw, h: bh, fn: () => startGame(false) };
    buttons.push(db);
    ctx.save();
    const pulse = 0.6 + Math.sin(menuT * 3) * 0.4;
    ctx.shadowColor = `rgba(255,120,40,${0.5 + pulse * 0.4})`; ctx.shadowBlur = 20 + pulse * 14;
    const dg = ctx.createLinearGradient(0, by, 0, by + bh); dg.addColorStop(0, '#d8742a'); dg.addColorStop(1, '#6a2a10');
    rr(db.x, db.y, bw, bh, 8); ctx.fillStyle = dg; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffd890'; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `bold ${n ? 20 : 24}px ${HEAD}`; ctx.fillStyle = '#fff6e0'; ctx.textAlign = 'center'; ctx.fillText('DEPLOY', W / 2, by + bh / 2 + 8);
    ctx.restore();
    const tb = n ? { x: W / 2 - 80, y: by + bh + 8, w: 160, h: 32, fn: () => startGame(true) } : { x: db.x + bw + 16, y: by + 8, w: 150, h: bh - 16, fn: () => startGame(true) };
    button(tb, '');
    ctx.fillStyle = '#efe4cf'; ctx.font = `bold ${n ? 12 : 14}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('▶ TUTORIAL', tb.x + tb.w / 2, tb.y + tb.h / 2 + 5);
    ctx.textAlign = 'center'; ctx.font = `${n ? 9.5 : 12}px ${FONT}`; ctx.fillStyle = 'rgba(232,214,180,0.85)';
    const help = n ? ['Tap select · tap ground to order · drag pan · pinch zoom']
      : ['Left-click / drag select · Right-click move, attack, capture, garrison, embark · Right-drag to face · Wheel zoom',
        'R Retreat · F Reinforce · A Attack-move · Z Stance · Q/E Abilities · T Tier · B/G/N/K/V Build · Esc Menu · Space last alert'];
    const helpTop = H - (n ? 14 : 36);
    if (helpTop > tb.y + tb.h + 10) help.forEach((l, i) => ctx.fillText(l, W / 2, helpTop + i * 18));
    button({ x: W - 46, y: 10, w: 36, h: 32, fn: toggleMute }, '', { icon: (cx, cy, s) => IC.speaker(cx, cy, s * 1.1, !muted) });
  }

  function drawVictory() {
    buttons = [];
    ctx.fillStyle = 'rgba(6,3,3,0.6)'; ctx.fillRect(0, 0, W, H);
    const won = state.winner === playerFaction;
    const p = state.players[playerFaction], e = state.players[state.aiFaction];
    ctx.save(); ctx.textAlign = 'center';
    ctx.font = `bold ${W < 760 ? 46 : 80}px ${HEAD}`;
    ctx.shadowColor = won ? 'rgba(255,200,80,0.9)' : 'rgba(255,40,20,0.9)'; ctx.shadowBlur = 36;
    ctx.fillStyle = won ? '#ffe7a8' : '#ff8a70'; ctx.fillText(won ? 'VICTORY' : 'DEFEAT', W / 2, H * 0.32);
    ctx.shadowBlur = 0; ctx.font = `italic ${W < 760 ? 13 : 18}px ${HEAD}`; ctx.fillStyle = '#e8cfa8';
    ctx.fillText(state.winReason === 'annihilation' ? (won ? 'The enemy Command Nexus lies in ruin.' : 'Your Command Nexus has fallen.') : (won ? 'The Relays sing your name. Enemy resolve is spent.' : 'The enemy holds the Relays. Your resolve is spent.'), W / 2, H * 0.4);
    ctx.font = `${W < 760 ? 11 : 13}px ${FONT}`; ctx.fillStyle = '#c8b898';
    const lines = ['Battle length ' + Math.floor(state.time / 60) + 'm ' + Math.floor(state.time % 60) + 's', 'Enemy models slain: ' + p.stats.killed + '  ·  Models lost: ' + p.stats.lost, 'Tier ' + p.tier + '  ·  Research ' + p.research.size + '  ·  Relays held ' + state.map.relays.filter((r) => r.owner === playerFaction).length];
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.46 + i * 20));
    ctx.restore();
    const b = { x: W / 2 - 110, y: H * 0.62, w: 220, h: 50, fn: quitToMenu };
    button(b, '');
    ctx.font = `bold 18px ${HEAD}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('Return to Menu', W / 2, b.y + 31);
  }

  /* ------------------------------ Main loop ------------------------------ */
  let last = performance.now(), acc = 0;
  const seenProj = new WeakSet();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let simState = null;
    const view = { camX: cam.x, camY: cam.y, zoom: cam.zoom, yaw: 0, selected, selectedBuilding: prodBuilding, pid: playerFaction, noFog: false };
    if (mode === 'menu') {
      if (!attract) newAttract();
      acc += dt; let n = 0; while (acc >= Sim.DT && n < 8) { Sim.step(attract, Sim.DT); acc -= Sim.DT; n++; }
      if (n >= 8) acc = 0;
      if (attract.winner) newAttract();
      simState = attract;
      let fx = 0, fy = 0, fn = 0;
      for (const s of attract.squads) { if (Sim.UNIT_DEFS[s.unitType].civil || s.inside) continue; const w = s.attackCd > 0 ? 3 : 1; fx += s.x * w; fy += s.y * w; fn += w; }
      if (fn) { menuFocus.x += (fx / fn - menuFocus.x) * Math.min(1, dt * 0.4); menuFocus.y += (fy / fn - menuFocus.y) * Math.min(1, dt * 0.4); }
      view.camX = menuFocus.x + Math.sin(menuT * 0.07) * 60; view.camY = menuFocus.y + 120;
      view.zoom = 1.25; view.yaw = Math.sin(menuT * 0.035) * 0.5; view.pitch = 0.26; view.selected = null;
      view.pid = 'vigilant'; view.noFog = true;
    } else if (state) {
      simState = state;
      view.noFog = !state.fogEnabled;
      const pan = (34 / cam.zoom) * 22 * dt;
      if (!menuOpen) {
        if (keys['arrowup']) cam.y -= pan;
        if (keys['arrowdown']) cam.y += pan;
        if (keys['arrowleft']) cam.x -= pan;
        if (keys['arrowright']) cam.x += pan;
        if (mouse.inside && !mobile && !boxSel && !midDrag && !rdrag && document.hasFocus() && mode === 'playing') {
          const m = 6;
          if (mouse.x <= m) cam.x -= pan; else if (mouse.x >= W - m) cam.x += pan;
          if (mouse.y <= m) cam.y -= pan; else if (mouse.y >= H - m) cam.y += pan;
        }
      }
      cam.x = Sim.clamp(cam.x, 0, state.map.width); cam.y = Sim.clamp(cam.y, 0, state.map.height);
      if (mode === 'playing' && !paused && !menuOpen) {
        acc += dt * speed; let n = 0;
        while (acc >= Sim.DT && n < 8) { Sim.step(state, Sim.DT); acc -= Sim.DT; n++; }
        if (n >= 8) acc = 0;
        processEvents();
        updateTutorial(dt);
        const vx = cam.x, vy = cam.y, rad = 900 / cam.zoom;
        const near = (x, y) => Math.abs(x - vx) < rad && Math.abs(y - vy) < rad && (!state.fogEnabled || !R3 || R3.fogAt(x, y) > 1.5);
        let boom = 0, mel = 0, fl = 0, sn = 0;
        for (const e of state.effects) {
          if (seenFx.has(e)) continue; seenFx.add(e);
          if (!near(e.x, e.y)) continue;
          if (e.type === 'explosion' || e.type === 'strike' || e.type === 'fireblast') boom++; else if (e.type === 'melee') mel++; else if (e.type === 'flame') fl++; else if (e.type === 'snipe') sn++;
        }
        if (boom) sfx('explode'); if (mel && Math.random() < 0.5) sfx('melee'); if (fl && Math.random() < 0.3) sfx('flame'); if (sn) sfx('snipe');
        shotT -= dt;
        let newShots = 0; for (const p of state.projectiles) if (!seenProj.has(p)) { seenProj.add(p); if (near(p.x, p.y)) newShots++; }
        if (newShots && shotT <= 0) { sfx('shoot'); shotT = 0.07; }
        if (state.winner) { mode = 'victory'; sfx(state.winner === playerFaction ? 'capture' : 'alert'); }
      }
      if (!paused && !menuOpen) {
        msgT = Math.max(0, msgT - dt);
        for (const a of alerts) a.t += dt;
        for (const p of pings) p.t += dt;
        pings = pings.filter((p) => p.t < p.life);
        for (const m of markers) m.t -= dt; markers = markers.filter((m) => m.t > 0);
      }
      tipT = Math.max(0, tipT - dt); if (tipT <= 0) tipPinned = null;
      if (buildMode && (mouse.inside || mobile)) {
        const w = mobile ? s2w(W / 2, H * 0.45) : s2w(mouse.x, mouse.y);
        const pc = placeCheck(buildMode, w);
        view.ghost = { type: buildMode, x: w.x, y: w.y, ok: pc.ok };
      }
    }
    if (R3) R3.frame(simState, dt, view);
    ctx.clearRect(0, 0, W, H);
    if (mode === 'menu') drawMenu(dt);
    else if (mode === 'playing' && state) drawHUD();
    else if (mode === 'victory') { drawHUD(); buttons = []; drawVictory(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // test/debug hooks (used by the smoke + screenshot scripts and unit tests)
  window.__rtsDebug = {
    get state() { return state || attract; },
    get mode() { return mode; },
    get R3() { return R3; },
    get ui() { return { selected: [...selected], prodBuilding, buildMode, paused, menuOpen, speed, tut: tut && tut.step, alerts: alerts.map((a) => a.text), mapId }; },
    start(f, d, m, tutorial) { playerFaction = f || 'vigilant'; difficulty = d || 'normal'; mapId = m || 'basin'; startGame(!!tutorial); },
    cam(x, y, z) { cam.x = x; cam.y = y; if (z) cam.zoom = z; },
    select(ids) { selected = new Set(ids); prodBuilding = null; },
    selectBuilding(id) { selected = new Set(); prodBuilding = id; },
    menu(open) { menuOpen = open == null ? !menuOpen : !!open; },
    fog(on) { if (state) { state.fogEnabled = !!on; Sim.updateVision(state, true); } },
    battle(cx, cy) {
      if (!state) startGame(false);
      const st = state; const pf = playerFaction, ef = st.aiFaction;
      cx = cx || st.map.width / 2; cy = cy || st.map.height / 2;
      for (const pid of [pf, ef]) { const p = st.players[pid]; p.tier = 3; p.aether += 3000; p.flux += 3000; }
      const conv = (pid, a) => (pid === 'vigilant' ? a : { vig_scout: 'riv_pack', vig_heavy: 'riv_brute', vig_tank: 'riv_beast', vig_commander: 'riv_warlord', vig_mg: 'riv_mg', vig_sniper: 'riv_sniper', vig_jump: 'riv_jump', vig_super: 'riv_super', vig_transport: 'riv_transport' }[a]);
      const gear = { vig_scout: 'v_pyre', vig_heavy: 'v_lance', vig_jump: 'v_hammer', riv_pack: 'r_cinder', riv_brute: 'r_claw', riv_jump: 'r_claw' };
      const ids = [];
      const spawn = (pid, list, sgn) => { for (const [t, dx, dy] of list) { const tt = conv(pid, t); const s = Sim.spawnSquad(st, pid, tt, cx + dx * sgn, cy + dy); if (!s) continue; if (gear[tt]) Sim.addWargear(st, s.id, gear[tt]); if (pid === pf) ids.push(s.id); } };
      const list = [['vig_scout', -150, -60], ['vig_mg', -170, 60], ['vig_heavy', -190, 0], ['vig_jump', -130, 110], ['vig_sniper', -240, -20], ['vig_tank', -240, -110], ['vig_commander', -120, 0]];
      spawn(pf, list, 1); spawn(ef, list, -1);
      for (const s of st.squads) if (Math.abs(s.x - cx) < 300 && Math.abs(s.y - cy) < 250 && !Sim.UNIT_DEFS[s.unitType].civil) Sim.issueMove(st, [s.id], cx, cy, true);
      Sim.updateVision(st, true);
      selected = new Set(ids.slice(0, 3)); prodBuilding = null;
      cam.x = cx; cam.y = cy; cam.zoom = 1.3;
      return ids;
    },
  };
})();
