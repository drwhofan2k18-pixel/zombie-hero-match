// tests/behavior.test.js - the real gate.
//
// tests/static.test.js is a smoke gate: it greps the source for identifiers and
// would happily pass on a build where the feature exists only in a comment.
// This file instead loads the game into a headless DOM (tests/harness.mjs) and
// exercises the actual functions through window.__ZT / window.__MORE.
//
// Findings prefixed D-n map to docs/qa/v7.1-assessment.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadGame } from './harness.mjs';

const GAME = new URL('../zombie-hero-match.html', import.meta.url);
const SW = new URL('../sw.js', import.meta.url);
const INDEX = new URL('../index.html', import.meta.url);

// ---------------------------------------------------------------- helpers
function clearHorde(g) { g.S.zombies.forEach(z => z.el && z.el.remove()); g.S.zombies = []; }
function addZ(g, over = {}) {
  const spec = Object.assign(
    { type: 'regular', lane: 0, x: 0.9, hp: 30, maxHp: 30, spd: 1, armor: 0, gold: 5, dps: 4, size: 36, gap: 1, stampede: false },
    over
  );
  // v7 has no spec-level spawn API (finding D-9); fall back and then force the
  // spec's stats so the fixture means the same thing on both builds.
  if (g.__ZT.spawnZombieFromSpec) return g.__ZT.spawnZombieFromSpec(spec);
  const z = g.__ZT.spawnZombie(spec.type) || g.S.zombies[g.S.zombies.length - 1];
  Object.assign(z, spec);
  return z;
}
const shape = g => JSON.stringify(g.S.horde.map(h => [h.type, h.lane, h.maxHp, +h.spd.toFixed(5), h.dps]));
const alive = g => JSON.stringify(g.S.zombies.filter(z => z.alive).map(z => [z.type, z.lane, z.maxHp]));
// Objects born inside the vm harness have the vm realm's prototypes, which
// assert.deepStrictEqual rejects. Rehydrate through JSON before comparing.
const host = v => JSON.parse(JSON.stringify(v));

// ================================================================ match-3 core
test('match-3: findMatches finds 3/4/5 runs on both axes and ignores 2-runs', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('mage', 'classic');
  await g.step(2);
  const set = (r, c, col) => { g.S.grid[r][c].color = col; };
  // diagonal-stripes base board: no two neighbours share a colour
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) set(r, c, (r + c * 2) % 5);
  set(0, 0, 3); set(0, 1, 0); set(0, 2, 0); set(0, 3, 0);   // horizontal 3 at row 0, c1..c3
  set(2, 5, 1); set(3, 5, 1); set(4, 5, 1);                  // vertical 4 at col 5, r1..r4
  set(6, 0, 4); set(6, 1, 4);                                // only 2 -> not a match
  const m = g.M.findMatches();
  const sizes = host(m.map(x => x.cells.length)).sort((a, b) => a - b);
  assert.deepEqual(sizes, [3, 4], 'expected exactly a 3-run and a 4-run, got ' + JSON.stringify(host(m)));
});

test('match-3: wouldMatch/hasMove only accept swaps that actually resolve', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('mage', 'classic');
  await g.step(2);
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) g.S.grid[r][c].color = (r + c * 2) % 5;
  g.S.grid[3][3].color = 0; g.S.grid[3][4].color = 0; g.S.grid[3][6].color = 0;
  g.S.grid[3][5].color = 4;
  assert.equal(g.M.wouldMatch(3, 5, 3, 6) || g.M.wouldMatch(3, 5, 3, 4), true, 'the gap-filling swap must match');
  assert.equal(g.M.wouldMatch(0, 0, 0, 1), false, 'a random swap must not');
});

test('match-3: an invalid swap snaps back and releases the input lock', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('mage', 'classic');
  await g.step(2);
  const inv = g.__ZT.findInvalidSwap();
  assert.ok(inv, 'a board always contains some invalid swap');
  const before = g.__ZT.gridSnapshot();
  await g.run(g.__ZT.doSwap(inv[0], inv[1]));
  assert.deepEqual(g.__ZT.gridSnapshot(), before, 'board must revert');
  assert.equal(g.S.busy, false, 'input lock must be released');
});

test('match-3: resolveBoard never leaves a board with a live match or no move', async () => {
  for (let i = 0; i < 25; i++) {
    const g = await loadGame(GAME);
    g.__ZT.newGame('mage', 'classic');
    await g.step(2);
    clearHorde(g);
    const mv = g.__ZT.findSwap();
    if (!mv) continue;
    await g.run(g.__ZT.doSwap(mv[0], mv[1]));
    assert.equal(g.M.findMatches().length, 0, 'board must settle');
    assert.equal(g.M.hasMove(), true, 'a settled board must always offer a move');
    assert.equal(g.S.busy, false);
  }
});

test('match-3: every freshly dealt board has a move and no opening match', async () => {
  for (let i = 0; i < 150; i++) {
    const g = await loadGame(GAME);
    g.__ZT.newGame('mage', 'classic');
    await g.step(1);
    assert.equal(g.M.findMatches().length, 0, 'dealt a board with a pre-made match');
    assert.equal(g.M.hasMove(), true, 'dealt a board with no legal move');
  }
});

// ================================================================ combat math
test('combat: match size, chain and armour produce the documented damage', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('mage', 'classic');          // mage = 1.0x class multiplier
  await g.step(2);
  g.S.heroLvl = 1;                            // no passives
  g.S.up = { dmg: 0, vit: 0, greed: 0, perk: 0 };
  clearHorde(g);

  const hit = (size, color, chain, zOver) => {
    clearHorde(g);
    const z = addZ(g, Object.assign({ lane: 0, x: 0.9, hp: 99999, maxHp: 99999, armor: 0 }, zOver));
    const cells = Array.from({ length: size }, (_, k) => ({ r: 0, c: k }));
    g.M.attack([{ color, cells }], chain, 1);
    return 99999 - z.hp;
  };

  assert.equal(hit(3, 2, 1), 24, '3-match base is 3 * 8 = 24');
  assert.equal(hit(4, 2, 1), 48, '4-match is 4*8 then 1.5x');
  assert.equal(hit(5, 2, 1), 80, '5-match is 5*8 then 2x');
  assert.equal(hit(3, 2, 2), 36, 'each cascade step adds +50%');
  assert.equal(hit(3, 0, 1, { armor: 0.35 }), 25, 'fire 24*1.6=38.4, then 35% armour -> 25');
  assert.equal(hit(3, 4, 1, { type: 'brute', armor: 0.2 }), 36, 'arcane ignores armour and is 1.5x vs brutes');
});

test('combat: damage upgrades and class multipliers apply', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'classic');       // soldier = 1.3x
  await g.step(2);
  g.S.heroLvl = 1;
  g.S.up = { dmg: 5, vit: 0, greed: 0, perk: 0 };   // +100% match damage
  clearHorde(g);
  const z = addZ(g, { lane: 0, x: 0.9, hp: 99999, maxHp: 99999 });
  g.M.attack([{ color: 2, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] }], 1, 1);
  assert.equal(99999 - z.hp, 62, '24 * 2.0 (upgrades) * 1.3 (soldier) = 62.4 -> 62');
});

test('D-6 combat: a multi-colour match spreads across targets instead of piling on one', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('mage', 'classic');
  await g.step(2);
  g.S.heroLvl = 1;
  g.S.up = { dmg: 0, vit: 0, greed: 0, perk: 0 };
  clearHorde(g);
  const zs = [0, 1, 2].map(i => addZ(g, { lane: i, x: 0.95 - i * 0.1, hp: 99999, maxHp: 99999 }));
  const groups = [
    { color: 2, cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }] },
    { color: 2, cells: [{ r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }] },
    { color: 2, cells: [{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 2, c: 2 }] }
  ];
  g.M.attack(groups, 1, 1);
  const hits = zs.map(z => 99999 - z.hp);
  assert.equal(hits.filter(h => h > 0).length, 3, 'three colour groups must touch three bodies, got ' + hits.join(','));
});

// ================================================================ D-1 determinism
test('D-1 juice never draws from the seeded gameplay streams', async () => {
  const g = await loadGame(GAME);
  g.__ZT.selectMode('daily');
  g.__ZT.pickClass('soldier');
  await g.step(2);
  let hordeDraws = 0, waveDraws = 0;
  g.__ZT.setRng({ horde: () => (hordeDraws++, 0.5), wave: () => (waveDraws++, 0.5) });
  for (let i = 0; i < 40; i++) {
    g.__ZT.spawnBlood(20, 20, 30);
    g.__ZT.spawnGore(20, 20, 6);
    g.__ZT.addSplat(20, 20, 10);
    g.__ZT.weatherFrame(0.016);
    g.__ZT.goreFrame(0.016);
    await g.step(1, 16);
  }
  assert.equal(hordeDraws, 0, 'gore/weather consumed the seeded horde stream');
  assert.equal(waveDraws, 0, 'gore/weather consumed the seeded wave stream');
});

test('D-1 the same Daily seed produces an identical horde on every device', async () => {
  const a = await loadGame(GAME);
  const b = await loadGame(GAME);
  for (const g of [a, b]) { g.__ZT.selectMode('daily'); g.__ZT.pickClass('soldier'); }
  a.__ZT.startWave(7);
  b.__ZT.startWave(7);
  // device B gets slammed with purely cosmetic particles first
  for (let i = 0; i < 5; i++) { b.__ZT.spawnBlood(10, 10, 40); b.__ZT.spawnGore(10, 10, 8); }
  assert.deepEqual(JSON.parse(shape(b)), JSON.parse(shape(a)), 'daily horde must be seed-stable');
  assert.equal(JSON.stringify(b.S.muts), JSON.stringify(a.S.muts), 'daily mutators must be seed-stable');
  assert.equal(b.S.chal && b.S.chal.id, a.S.chal && a.S.chal.id, 'daily challenge must be seed-stable');
  assert.equal(b.S.weather, a.S.weather, 'daily weather must be seed-stable');
});

test('D-1 daily horde does not depend on frame rate', async () => {
  const a = await loadGame(GAME);
  const b = await loadGame(GAME);
  for (const g of [a, b]) { g.__ZT.selectMode('daily'); g.__ZT.pickClass('soldier'); await g.step(2); }
  await a.step(200, 16);        // 60fps-ish
  await b.step(100, 32);        // 30fps-ish, same wall time
  assert.equal(shape(a), shape(b), 'pre-rolled horde must not drift with frame pacing');
  const n = Math.min(a.S.hordeAt, b.S.hordeAt);
  assert.deepEqual(alive(b).slice(0, 200), alive(a).slice(0, 200), 'spawned order must match');
  assert.ok(n > 0, 'the horde must actually be walking');
});

test('D-1b a Daily saved and continued mid-campaign replays the same later waves', async () => {
  const g = await loadGame(GAME);
  g.__ZT.selectMode('daily');
  g.__ZT.pickClass('soldier');
  await g.step(2);
  g.__ZT.startWave(5);
  const expect = shape(g), expectMuts = JSON.stringify(g.S.muts), expectChal = g.S.chal && g.S.chal.id;
  g.__ZT.saveGame();
  const d = g.__ZT.loadSave();
  g.M.applySave(d);
  g.__ZT.startWave(5, true, true);          // restore path: keep weather AND wave rolls
  assert.equal(JSON.stringify(g.S.muts), expectMuts, 'a restore must not re-roll mutators');
  assert.equal(g.S.chal && g.S.chal.id, expectChal, 'a restore must not re-roll the challenge');
  assert.equal(shape(g), expect, 'a restore must replay the identical horde');
});

// ================================================================ D-2 / D-3 save integrity
test('D-2 a 0-HP save restores to 0, not to a free full heal', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'classic');
  await g.step(2);
  const d = { classId: 'soldier', wave: 7, gold: 300, maxHp: 175, hp: 0, up: { dmg: 2, vit: 3, greed: 1, perk: 1 }, heroLvl: 6, heroXP: 20, score: 4000, kills: 55 };
  g.M.applySave(d);
  assert.equal(g.S.hp, 0, 'hp:0 must not become maxHp');
  g.M.applySave({ ...d, hp: -20 });
  assert.equal(g.S.hp, 0, 'negative hp must clamp to 0');
  g.M.applySave({ ...d, hp: 40 });
  assert.equal(g.S.hp, 40);
});

test('D-3 dying in Classic leaves no resumable dead run', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('mage', 'classic');
  await g.step(2);
  g.__ZT.startWave(7);
  await g.step(2);
  g.S.gold = 420; g.S.score = 9100; g.S.heroLvl = 8;
  g.S.hp = 0;
  g.M.gameOver();
  const saved = JSON.parse(g.storage.getItem('zms_save'));
  assert.equal(saved.wave, 1, 'death must not leave the dead run resumable');
  assert.equal(saved.gold, 420, 'the documented carry-over is real');
  assert.equal(saved.heroLvl, 8);
  assert.equal(saved.hp, saved.maxHp, 'the carry-over starts at wave 1 at full wall HP');
  assert.equal(g.el('ovUpgrade').style.display, 'none', 'the wave-clear panel must not sit under the death panel');
});

test('D-3 Survival and Daily death wipe the save entirely', async () => {
  for (const mode of ['survival', 'daily']) {
    const g = await loadGame(GAME);
    g.__ZT.selectMode(mode);
    g.__ZT.pickClass('ranger');
    await g.step(2);
    g.S.hp = 0;
    if (mode === 'daily') g.M.dailyComplete(); else g.M.gameOver();
    assert.equal(g.storage.getItem('zms_save'), null, mode + ' death must wipe the save');
  }
});

test('save round-trips every field Continue actually restores', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('necro', 'coop', 'cleric');
  await g.step(2);
  Object.assign(g.S, { wave: 6, gold: 210, score: 3300, kills: 41, maxHp: 150, hp: 77, heroLvl: 5, heroXP: 33, abCD: 6.5, weather: 'storm' });
  g.S.up = { dmg: 3, vit: 1, greed: 2, perk: 4 };
  g.S.muts = ['swift', 'glass'];
  g.S.chal = { id: 'killrace', icon: '', name: 'Kill Race', desc: '', prog: 7 };
  g.__ZT.saveGame();
  const d = g.__ZT.loadSave();
  g.M.applySave(d);
  for (const k of ['classId', 'class2Id', 'mode', 'day', 'wave', 'gold', 'score', 'kills', 'maxHp', 'hp', 'heroLvl', 'heroXP', 'abCD', 'weather']) {
    assert.ok(k in d, 'save is missing ' + k);
  }
  assert.equal(g.S.abCD, 6.5, 'ability cooldown must survive a reload');
  assert.equal(g.S.hp, 77);
  assert.deepEqual(host(g.S.up), { dmg: 3, vit: 1, greed: 2, perk: 4 });
  assert.deepEqual(host(g.S.muts), ['swift', 'glass']);
  assert.equal(g.S.chal.prog, 7, 'challenge progress must survive a reload');
  assert.equal(g.S.class2Id, 'cleric');
});

// ================================================================ D-4 / D-5 copy honesty
test('D-4 Boss Rush spawns only bosses, and they scale faster than campaign bosses', async () => {
  const g = await loadGame(GAME);
  g.__ZT.selectMode('bossrush');
  g.__ZT.pickClass('soldier');
  await g.step(2);
  g.__ZT.startWave(3);
  await g.step(400, 16);
  const kinds = [...new Set(g.S.zombies.map(z => z.type))];
  assert.deepEqual(kinds, ['boss'], 'Boss Rush must not spawn filler, got ' + kinds.join(','));

  g.S.muts = [];                                  // mutators are rolled per wave and would skew the comparison
  const rush = g.__ZT.rollZombieSpec('boss');
  const campaign = await loadGame(GAME);
  campaign.__ZT.newGame('soldier', 'classic');
  await campaign.step(2);
  campaign.__ZT.startWave(3);
  campaign.S.muts = [];
  const plain = campaign.__ZT.rollZombieSpec('boss');
  assert.ok(rush.maxHp > plain.maxHp, `boss-rush boss (${rush.maxHp}) must out-scale a campaign boss (${plain.maxHp})`);
});

test('D-5 achievement copy matches the condition it describes', async () => {
  const g = await loadGame(GAME);
  const src = readFileSync(GAME, 'utf8');
  const mutwin = g.M.ACH.find(a => a.id === 'mutwin');
  assert.match(src, /if\(S\.muts&&S\.muts\.length>=2\)\{META\.stats\.mutWaves/);
  assert.match(mutwin.desc, /2 or more/i, 'the copy must say what the code counts');
  // and no achievement may be silently unreachable
  g.__ZT.newGame('soldier', 'classic');
  await g.step(2);
  for (const a of g.M.ACH) assert.equal(typeof a.cond, 'function', a.id + ' has no condition');
  const ids = g.M.ACH.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate achievement ids');
  assert.ok(ids.length >= 20, 'expected 20+ achievements, found ' + ids.length);
});

// ================================================================ D-7 service worker
test('D-7 the service worker only deletes its own caches', async () => {
  const sw = readFileSync(SW, 'utf8');
  const m = sw.match(/keys\.filter\(([^)]*)\)/);
  assert.ok(m, 'activate() cache cleanup present');
  assert.match(m[1], /startsWith\(\s*(NS|['"]zhm-)/, 'cleanup must be namespaced to zhm-*, got: ' + m[1]);
  assert.ok(!/filter\(k => k !== CACHE\)/.test(sw), 'must not wipe other apps on this origin');
  const v = sw.match(/CACHE = 'zhm-v(\d+)(?:-(\d+))?'/);
  assert.ok(v, 'cache version found');
  assert.ok(Number(v[1]) >= 7, 'cache bumped for this release');
});

// ================================================================ D-8 performance
test('D-8 field geometry is snapshotted, not re-read per zombie per frame', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'classic');
  await g.step(2);
  clearHorde(g);
  for (let i = 0; i < 20; i++) addZ(g, { lane: i % 5, x: 1 - i * 0.02 });
  g.setFieldSize(390, 200);
  const before = g.geomReads();
  await g.step(3, 16);
  const reads = g.geomReads() - before;
  assert.ok(reads <= 2, `20 zombies x 3 frames cost ${reads} geometry reads; must be O(1) per frame, not O(zombies)`);
});

// ================================================================ modes & waves
test('waves: sizing follows the documented formula in every mode', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'classic');
  await g.step(2);
  const size = (mode, n) => {
    g.S.mode = mode;
    g.__ZT.startWave(n);
    return g.S.spawnQueue;
  };
  assert.equal(size('classic', 1), 6, '4 + 2n');
  assert.equal(size('classic', 5), 16, '4 + 2n + 2 on every 5th');
  assert.equal(size('classic', 10), 12, 'boss waves field half the horde');
  assert.equal(size('swarm', 1), 11, 'swarm adds 80%');
  assert.equal(size('coop', 1), 8, 'co-op adds 30%');
});

test('waves: spawn weights never field brutes before wave 5', async () => {
  const g = await loadGame(GAME);
  assert.equal(g.M.spawnWeights(1).brute, 0);
  assert.equal(g.M.spawnWeights(4).brute, 0);
  assert.ok(g.M.spawnWeights(5).brute > 0);
  assert.ok(g.M.spawnWeights(20).brute > g.M.spawnWeights(5).brute);
});

test('D-4b Survival never repairs the wall, and never claims it did', async () => {
  const g = await loadGame(GAME);
  g.__ZT.selectMode('survival');
  g.__ZT.pickClass('cleric');
  await g.step(2);
  g.S.hp = 40; g.S.maxHp = 100;
  g.M.healBarricade(25);
  assert.equal(g.S.hp, 40, 'Survival must refuse every heal');

  g.S.dropSpec = { lane: 0, patch: true };      // the drop WANTS to patch
  g.M.supplyDrop();
  const drop = g.el('field').children.find(e => e.className === 'drop');
  assert.ok(drop, 'a drop should still arrive');
  drop.listeners.touchend[0]({ preventDefault() {} });
  assert.equal(g.S.hp, 40, 'Survival must refuse the drop patch too');
  assert.ok(g.S.gold > 0, 'and must pay gold instead of promising a repair');
});

test('waves: clearing a wave pays the documented bonus and can complete a challenge', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'classic');
  await g.step(2);
  g.__ZT.startWave(3);
  await g.step(2);
  g.S.gold = 0; g.S.score = 0;
  g.S.chal = { id: 'bigmatch', icon: '', name: 'Big Match', desc: '', prog: 0 };
  g.S._bigMatch = true;
  g.M.waveComplete();
  assert.equal(g.S.gold, 10 + 3 * 5 + (40 + 3 * 2), 'wave bonus + challenge reward');
  assert.equal(g.S.score, 3 * 250, '250 pts per wave cleared');
});

// ================================================================ meta
test('meta: achievements unlock and persist across a meta reload', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'classic');
  await g.step(2);
  clearHorde(g);
  const z = addZ(g, { hp: 1, maxHp: 1 });
  g.M.killZombie(z);
  assert.ok(g.META.ach.firstkill, 'First Blood must unlock on the first kill');
  assert.ok(g.META.stats.totalKills >= 1);
  const saved = JSON.parse(g.storage.getItem('zms_meta'));
  assert.ok(saved.ach.firstkill, 'unlock must be persisted');
});

test('build artefact: index.html is generated from the game file', async () => {
  const a = readFileSync(GAME, 'utf8');
  const b = readFileSync(INDEX, 'utf8');
  assert.equal(b, a, 'index.html is stale - run `npm run build`');
});

// ================================================================ audit 2026-09-23 fixes
// M-1: a pending supply drop must survive save/load instead of being silently
// deleted by a mid-wave reload.
test('M-1 a pending supply drop (timer + pre-rolled contents) survives save/applySave', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'classic');
  await g.step(2);
  g.S.dropT = 12.5;
  g.S.dropSpec = { lane: 3, patch: true };
  g.__ZT.saveGame();
  const d = g.__ZT.loadSave();
  assert.equal(d.dropT, 12.5, 'drop timer must be persisted');
  assert.deepEqual(host(d.dropSpec), { lane: 3, patch: true }, 'drop contents must be persisted');
  g.M.applySave(d);
  assert.equal(g.S.dropT, 12.5, 'restored run keeps the drop timer');
  assert.deepEqual(host(g.S.dropSpec), { lane: 3, patch: true }, 'restored run keeps the drop contents');
  // a save from before this fix (no drop fields) restores to no pending drop
  delete d.dropT; delete d.dropSpec;
  g.M.applySave(d);
  assert.equal(g.S.dropT, 0);
  assert.equal(g.S.dropSpec, null);
  // junk in the save must not poison the state
  g.M.applySave({ ...d, dropT: 'banana', dropSpec: { lane: 'x' } });
  assert.equal(g.S.dropT, 0);
  assert.equal(g.S.dropSpec, null);
});

// M-2: wave codes must give every zombie type its own letter, so codes from two
// devices can actually be compared.
test('M-2 dailyWaveCode letters are unique per zombie type (regular vs runner)', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'daily');
  await g.step(2);
  clearHorde(g);
  addZ(g, { type: 'regular', lane: 0 });
  addZ(g, { type: 'runner', lane: 1 });
  addZ(g, { type: 'armored', lane: 2 });
  addZ(g, { type: 'brute', lane: 3 });
  addZ(g, { type: 'boss', lane: 4 });
  const code = g.__ZT.dailyWaveCode(3);
  const letters = code.replace(/^W3-/, '');
  const seen = new Set();
  for (let i = 0; i < letters.length; i += 2) {
    const t = letters[i];
    assert.ok(!seen.has(t), `letter ${t} must map to exactly one type`);
    seen.add(t);
  }
  assert.equal(seen.size, 5, 'all five types must appear with distinct letters: ' + code);
  assert.ok(/^[A-Za-z0-9]+$/.test(letters), 'code stays compare-friendly');
});

// L-1: an unknown mutator id in the save must be dropped, not crash updateHud.
test('L-1 applySave whitelists saved mutators against MUTATORS', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'classic');
  await g.step(2);
  g.M.applySave({ classId: 'soldier', wave: 4, muts: ['goldrush', 'did-i-leave-the-stove-on'] });
  assert.deepEqual(host(g.S.muts), ['goldrush'], 'unknown keys must be filtered out');
  assert.doesNotThrow(() => g.M.updateHud ? g.M.updateHud() : null);
});

// L-2: rolling 2 mutators must actually deliver 2 (draw without replacement).
test('L-2 rollMutators delivers exactly as many mutators as it rolls', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'classic');
  await g.step(2);
  g.__ZT.startWave(12);
  let forced2 = 0, tries = 200;
  for (let i = 0; i < tries; i++) {
    // drive wrand directly: first draw <.35 picks count=2, second draw picks keys
    let calls = 0;
    g.__ZT.setRng({ wave: () => (calls++ === 0 ? 0.1 : 0.5) });
    g.M.rollMutators(12);
    if (g.S.muts.length === 2) { forced2++; assert.notEqual(g.S.muts[0], g.S.muts[1], 'mutators must not duplicate'); }
    else assert.equal(g.S.muts.length, 1, 'count=2 must yield 1 or 2, never 0');
    g.__ZT.setRng({ wave: Math.random });
  }
  assert.ok(forced2 > 0, 'the count=2 path must be exercised');
});

// L-3: even a pathological shuffle must leave a board with a valid move and no
// pre-made matches (the fallback re-deal path).
test('L-3 shuffleGrid never leaves an unplayable board', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('mage', 'classic');
  await g.step(2);
  for (let i = 0; i < 25; i++) {
    g.M.shuffleGrid();
    assert.equal(g.M.findMatches().length, 0, 'no free matches after shuffle');
    assert.ok(g.M.hasMove(), 'a move must exist after shuffle');
  }
});

// L-4: starting a new run must not silently destroy a resumable save.
test('L-4 pickClass keeps the old save when the player declines the new run', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('soldier', 'classic');
  await g.step(2);
  g.__ZT.saveGame();
  const before = host(JSON.parse(g.storage.getItem('zms_save')));
  g.__ZT.setConfirm(() => false);            // decline
  g.__ZT.selectMode('daily');
  g.__ZT.pickClass('mage');
  const after = host(JSON.parse(g.storage.getItem('zms_save')));
  assert.deepEqual(after, before, 'declining must leave the save untouched');
  g.__ZT.setConfirm(() => true);             // accept
  g.__ZT.pickClass('mage');
  const replaced = host(JSON.parse(g.storage.getItem('zms_save')));
  assert.equal(replaced.classId, 'mage', 'accepting starts the fresh run');
  assert.notDeepEqual(replaced, before);
  g.__ZT.setConfirm(null);
});

// L-5: a Daily continued on a later day must not claim to be "today" - a fresh
// boot with a stale-seed save must label the button with that seed.
test('L-5 continue button names a stale daily seed explicitly', async () => {
  const g = await loadGame(GAME);
  g.__ZT.newGame('cleric', 'daily');
  await g.step(2);
  g.__ZT.saveGame();
  const d = host(JSON.parse(g.storage.getItem('zms_save')));
  const stub = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); }, removeItem(k) { delete this.s[k]; } };
  stub.setItem('zms_save', JSON.stringify({ ...d, day: '19991231' }));   // yesterday's seed
  const g2 = await loadGame(GAME, { localStorage: stub, fixedDateMs: Date.UTC(2026, 8, 24) }); // today is the 24th
  const label = g2.el('btnContinue').textContent;
  assert.ok(label.includes('DAILY 19991231'), 'label must name the stale seed, got: ' + label);
  // a same-day daily keeps the plain label (no seed suffix)
  const stub2 = { s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); }, removeItem(k) { delete this.s[k]; } };
  stub2.setItem('zms_save', JSON.stringify(d));
  const g3 = await loadGame(GAME, { localStorage: stub2 });
  assert.ok(!g3.el('btnContinue').textContent.includes('DAILY'), 'fresh daily must not be flagged stale');
});
