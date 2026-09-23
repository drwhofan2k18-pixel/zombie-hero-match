// tests/harness.mjs - headless DOM stub + game loader for zombie-hero-match
//
// The game is a single <script> inside an HTML file. To test its logic for real
// (not with substring greps) we need a DOM. Instead of pulling in jsdom (which
// would break the repo's zero-dependency story), this is a ~150 line stub that
// implements exactly the DOM surface the game touches.
//
// Usage:
//   import { loadGame } from './harness.mjs';
//   const g = await loadGame(new URL('../zombie-hero-match.html', import.meta.url));
//   g.__ZT.newGame('soldier', 'classic');
//   await g.step(10);        // run 10 animation frames at 16ms
//   g.dump();

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// A Math whose .random() is a deterministic LCG by default (so runs are
// reproducible) and can be frozen/replaced to isolate cosmetic code paths.
function makeMath(seed = 0x5eed1234) {
  const m = Object.create(Math);
  let a = seed >>> 0;
  const lcg = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let override = null;
  m.random = () => (override ? override() : lcg());
  m.__setRandom = fn => { override = fn; };
  return m;
}

// A Date whose "now" is pinned, so dailySeed() is reproducible in tests.
function makeDate(fixedMs) {
  function D(...a) { return a.length ? new Date(...a) : new Date(fixedMs); }
  D.now = () => fixedMs;
  D.parse = Date.parse;
  D.UTC = Date.UTC;
  D.prototype = Date.prototype;
  return D;
}

// ---------------------------------------------------------------- element
class El {
  constructor(tag, doc) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.doc = doc;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.listeners = {};
    this._cls = new Set();
    this._text = '';
    this._html = '';
    this._id = '';
    this._qsa = new Map(); // lazily materialised stub children for querySelector(sel)
    this.style = new Proxy(
      {},
      { set: (t, k, v) => ((t[k] = v), true), get: (t, k) => t[k] }
    );
    // layout numbers the game reads; tests can override via g.setFieldSize()
    this._cw = 390; this._ch = 200; this._geomReads = 0;
    this.offsetWidth = 1;
    this.offsetHeight = 1;
  }
  get clientWidth() { this._geomReads++; return this._cw; }
  set clientWidth(v) { this._cw = v; }
  get clientHeight() { this._geomReads++; return this._ch; }
  set clientHeight(v) { this._ch = v; }
  get id() { return this._id; }
  set id(v) { this._id = v; if (v && this.doc) this.doc._byId.set(v, this); }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() {
    const s = this._cls;
    return {
      add: (...c) => c.forEach(x => s.add(x)),
      remove: (...c) => c.forEach(x => s.delete(x)),
      contains: c => s.has(c),
      toggle: (c, force) => {
        const want = force === undefined ? !s.has(c) : !!force;
        if (want) s.add(c); else s.delete(c);
        return want;
      }
    };
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v);
    if (v === '') { this.children = []; this._qsa.clear(); }
    // surface any inline handler-free markup as inert text; the game never
    // queries nodes it created via innerHTML except '.zhp i' (see querySelector)
  }
  appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.children.push(c); return c; }
  append(c) { return this.appendChild(c); }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  // Materialise a stub descendant on demand so `el.querySelector('.zhp i').style.width=…` works.
  querySelector(sel) {
    if (!this._qsa.has(sel)) this._qsa.set(sel, new El('span', this.doc));
    return this._qsa.get(sel);
  }
  querySelectorAll(sel) {
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    if (!cls) return [];
    const out = [];
    const walk = n => {
      for (const c of n.children) {
        if (c._cls.has(cls)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  closest() { return null; }
  setAttribute(k, v) { if (k === 'id') this.id = v; else this.dataset[k] = v; }
  getAttribute(k) { return k === 'id' ? this.id : (this.dataset[k] ?? null); }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this._cw, height: this._ch, right: this._cw, bottom: this._ch }; }
  getContext() {
    if (this._ctx) return this._ctx;
    const gradient = { addColorStop() {} };
    const noop = () => {};
    this._ctx = new Proxy({}, {
      get: (t, k) => {
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient;
        if (k in t) return t[k];
        return noop;
      },
      set: (t, k, v) => ((t[k] = v), true)
    });
    return this._ctx;
  }
  animate() { return { onfinish: null, cancel() {}, finish() {} }; }
  focus() {}
}

// ---------------------------------------------------------------- document
class Doc {
  constructor() {
    this._byId = new Map();
    this._all = [];
    this.defaultView = null;
  }
  createElement(tag) { const e = new El(tag, this); this._all.push(e); return e; }
  getElementById(id) { return this._byId.get(id) || null; }
  // '#grid .tile' / '#field .zombie' -> delegate to the id'd element
  querySelectorAll(sel) {
    const m = /^#([\w-]+)\s+\.([\w-]+)$/.exec(String(sel).trim());
    if (m) {
      const host = this._byId.get(m[1]);
      return host ? host.querySelectorAll('.' + m[2]) : [];
    }
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this._all.filter(e => e._cls.has(cls));
    }
    return [];
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  addEventListener() {}
  get body() { return this._byId.get('body') || (this._byId.set('body', new El('body', this)), this._byId.get('body')); }
}

// ---------------------------------------------------------------- storage
function storageStub() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    _raw: m
  };
}

// ---------------------------------------------------------------- loader
export async function loadGame(htmlPath, opts = {}) {
  const html = readFileSync(htmlPath, 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!blocks.length) throw new Error('no inline <script> block found');

  const doc = new Doc();
  // pre-register every element the static HTML declares
  for (const m of html.matchAll(/<(\w+)[^>]*\sid="([\w-]+)"/g)) {
    const e = new El(m[1], doc);
    e.id = m[2];
    doc._all.push(e);
  }
  // <button class="modebtn" data-mode="…"> etc. that the code binds via querySelectorAll
  for (const m of html.matchAll(/<button[^>]*class="([^"]*)"[^>]*data-mode="([\w-]+)"/g)) {
    const e = new El('button', doc);
    e.className = m[1];
    e.dataset.mode = m[2];
    doc._all.push(e);
  }

  const frames = [];
  const timers = [];
  let now = opts.startMs ?? 0;
  const M = makeMath();

  const win = {
    innerWidth: opts.width ?? 390,
    innerHeight: opts.height ?? 844,
    devicePixelRatio: 2,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame: fn => (frames.push(fn), frames.length),
    cancelAnimationFrame() {},
    setTimeout: (fn, ms) => { const t = { fn, at: now + (ms || 0) }; timers.push(t); return t; },
    clearTimeout: h => { if (h) h.at = Infinity; },
    setInterval: () => ({}),
    clearInterval() {},
    localStorage: opts.localStorage || storageStub(),
    performance: { now: () => now },
    AudioContext: undefined,
    webkitAudioContext: undefined,
    console
  };
  win.window = win;
  win.document = doc;
  win.globalThis = win;
  doc.defaultView = win;

  // Pull in the Node timers/URL bits the script might touch.
  const ctx = vm.createContext(Object.assign(win, {
    console,
    Math: M, JSON, Date: makeDate(opts.fixedDateMs ?? Date.UTC(2026, 8, 23)),
    Object, Array, String, Number, Boolean, Set, Map, Promise,
    Error, RegExp, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent
  }));

  // Append an epilogue that exposes the game's module-scope internals. The game
  // already exports window.__ZT but it omits findMatches/dealDamage/applySave etc.
  const epilogue = `\n;window.__MORE={findMatches,wouldMatch,hasMove,buildGrid,resolveBoard,dealDamage,attack,killZombie,applySave,saveGame,loadSave,gameOver,waveComplete,dailyComplete,startWave,spawnZombie,rollWeather,rollMutators,rollChallenge,comboReward,shuffleGrid,newTile,heroDef,gainXP,checkAch,META,ZTYPES,HEROES,MUTATORS,CHALLENGES,MODES,UPS,ACH,COLORS,GRE,wst,MULTINAMES,dailySeed,dailyDayStr,dailyCode,mulberry32,healBarricade,supplyDrop,freshState,loop,layout,sizeFx,weatherFrame,goreFrame,ensureAlly,allyAttack,castAbilityFor,perkInfo,renderUpgrades,lbRecord,lbLoad,lbHtml,updateZombieEl,zPos,heroPos,allyPos,spawnWeights,xpNeed,classDmgMult,activeAbility,allyAbility,hasPassive};`;

  for (const [i, src] of blocks.entries()) {
    if (i > 0 && !opts.loadServiceWorkerBlock) continue; // 2nd block is the SW registration
    vm.runInContext(src + (i === 0 ? epilogue : ''), ctx, { filename: 'game:inline-' + i + '.js' });
  }

  const api = {
    doc, win, ctx, frames, timers,
    get now() { return now; },
    get S() { return win.__ZT.S; },
    get META() { return win.__ZT.META; },
    __ZT: win.__ZT,
    M: win.__MORE,
    el: id => doc.getElementById(id),
    setVisualRandom(fn) { M.__setRandom(fn); },
    // advance the game clock and flush due timers only (no rendering)
    tick(ms = 16) {
      now += ms;
      let guard = 0;
      for (;;) {
        const due = timers.filter(t => t.at <= now).sort((a, b) => a.at - b.at);
        if (!due.length || guard++ > 500) break;
        for (const t of due) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); t.fn(); }
      }
    },
    // advance + flush timers + run one requestAnimationFrame batch
    frame(ms = 16) {
      api.tick(ms);
      const f = frames.splice(0, frames.length);
      for (const fn of f) fn(now);
    },
    async step(n = 1, ms = 16) { for (let i = 0; i < n; i++) { api.frame(ms); await Promise.resolve(); } },
    // Drive a promise the GAME started (doSwap/resolveBoard await setTimeout,
    // which only fires when we advance the virtual clock) to completion.
    async run(p, ms = 8000) {
      let settled = false;
      const guarded = Promise.resolve(p).then(v => (settled = true, v), e => { settled = true; throw e; });
      guarded.catch(() => {});
      let left = ms;
      while (!settled && left > 0) {
        api.tick(16); left -= 16;
        await new Promise(r => setImmediate(r));
      }
      return guarded;
    },
    async wait(ms) { let left = ms; while (left > 0) { api.tick(Math.min(10, left)); left -= 10; await new Promise(r => setImmediate(r)); } },
    setFieldSize(w, h) {
      const f = doc.getElementById('field');
      if (f) { f._cw = w; f._ch = h; f._geomReads = 0; }
    },
    geomReads() { const f = doc.getElementById('field'); return f ? f._geomReads : 0; },
    storage: win.localStorage
  };
  return api;
}
