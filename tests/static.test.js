// tests/static.test.js - SMOKE GATE ONLY.
//
// This is the renamed v7 `tests/game.test.js`. It is deliberately kept small:
// everything it used to assert by substring is now asserted for real in
// tests/behavior.test.js, which loads the game and calls its functions.
// A presence check can only ever prove that a name exists somewhere in a
// 79 KB file - including in a comment. Treat green here as "nothing is
// obviously missing", never as "the feature works".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const html = readFileSync(new URL('../zombie-hero-match.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('smoke: fully offline - no external requests', () => {
  assert.equal(/https?:\/\//.test(html), false, 'external URL found');
  assert.equal(/<script[^>]+src=/.test(html), false, 'external script');
  assert.equal(/<link[^>]+href=/.test(html), false, 'external stylesheet');
  assert.equal(/@import/.test(html), false, 'CSS @import');
});

test('smoke: mobile viewport and touch handling present', () => {
  for (const needle of ['viewport', 'touch-action', 'touchstart', 'pointerdown']) {
    assert.ok(html.includes(needle), 'missing: ' + needle);
  }
});

test('smoke: every inline script block parses', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 1, 'script block found');
  const tmp = new URL('./.inline-check.js', import.meta.url).pathname;
  for (const b of blocks) {
    writeFileSync(tmp, b[1]);
    execFileSync('node', ['--check', tmp]);
  }
});

test('smoke: the named systems are all still present', () => {
  const required = [
    // core loop
    'findMatches', 'resolveBoard', 'doSwap', 'hasMove', 'shuffleGrid', 'gameOver', 'waveComplete', 'renderUpgrades',
    // hero / classes / abilities
    'heroLvl', 'heroXP', 'gainXP', 'onLevelUp', 'castAbility', 'renderAbilityBtn',
    'critburst', 'shockwave', 'chainnova', 'freezeall', 'volley', 'blessing', 'soulharvest',
    'arrowstorm', 'smite', 'deathwave', 'spawnProj', 'heroAtkAnim',
    // roster
    'soldier', 'mage', 'ranger', 'cleric', 'necro', 'spawnWeights', 'ZTYPES', 'HEROES',
    // persistence + meta
    'localStorage', 'zms_save', 'zhm_scores', 'zms_meta', 'lbRecord', 'checkAch', 'unlockAch', 'renderAch', 'ACH',
    // v5 combos + weather
    'comboBanner', 'comboReward', 'MULTINAMES', 'rollWeather', 'applyWeather', 'WEATHERS', '_stormBolt',
    // v6 2.5D weather + gore
    'wback', 'wfore', 'gorecv', 'weatherFrame', 'goreFrame',
    'RAIN_LAYERS', 'SNOW_LAYERS', 'FOG_LAYERS', 'spawnBlood', 'spawnGore', 'addSplat', 'drawChunk',
    'updGust', 'strikeBolt', 'drawBolt', 'skyFlash', 'snowCap', 'seedFx', 'sizeFx', 'redFlash', 'GORE_TYPES',
    // v7 modes
    'MODES', 'MUTATORS', 'CHALLENGES', 'rollMutators', 'rollChallenge', 'hasMut',
    'mulberry32', 'dailyDayStr', 'dailySeed', 'dailyCode', 'dailyComplete', 'DAILY_WAVES',
    'selectMode', 'pickClass', 'pendingMode', 'ensureAlly', 'allyAttack', 'castAllyAbility', 'castAbilityFor',
    'ab2Btn', 'hero2', 'supplyDrop', 'bossrush', 'swarm', 'survival', 'coop', 'daily',
    'challengesDone', 'dailiesDone', 'coopWaves', 'mutWaves', 'umuts', 'modeDesc', 'pickLabel',
    // v7.1
    'keyDayRng', 'dropRng', 'rollHorde', 'rollZombieSpec', 'spawnZombieFromSpec', 'writeRestartSave', 'syncFieldBox'
  ];
  for (const needle of required) assert.ok(html.includes(needle), 'missing: ' + needle);
});

test('smoke: the six game modes and their copy are declared', () => {
  for (const m of ['classic:{icon:', 'bossrush:{icon:', 'swarm:{icon:', 'survival:{icon:', 'coop:{icon:', 'daily:{name:']) {
    assert.ok(html.includes(m), 'mode missing: ' + m);
  }
});

test('smoke: mutator and challenge rosters are well-formed', () => {
  for (const m of ['swift:{icon:', 'thick:{icon:', 'elite:{icon:', 'goldrush:{icon:', 'glass:{icon:', 'stampede:{icon:']) {
    assert.ok(html.includes(m), 'mutator missing: ' + m);
  }
  for (const c of ["id:'killrace'", "id:'flawless'", "id:'bigmatch'", "id:'earner'"]) {
    assert.ok(html.includes(c), 'challenge missing: ' + c);
  }
});

test('smoke: weather set covers clear/rain/snow/fog/storm with gameplay flavour', () => {
  for (const w of ['clear:{icon:', 'rain:{icon:', 'snow:{icon:', 'fog:{icon:', 'storm:{icon:']) {
    assert.ok(html.includes(w), 'weather missing: ' + w);
  }
  for (const w of ["S.weather==='snow'", "S.weather==='rain'", "S.weather==='fog'", "S.weather==='storm'"]) {
    assert.ok(html.includes(w), 'weather has no gameplay hook: ' + w);
  }
});

test('smoke: the three RNG streams stay separate', () => {
  // juice must never be routed back through a seeded stream (see behavior.test.js D-1)
  assert.match(html, /let RSPN=Math\.random, RWAVE=Math\.random, RPLY=Math\.random, RFX=Math\.random/);
  assert.match(html, /function keyDayRng\(day,wave\)/);
  for (const s of ['const srand=', 'const srnd=', 'const wrand=', 'const wrnd=', 'const prand=', 'const prnd=', 'const fxrand=', 'const fxrnd=']) {
    assert.ok(html.includes(s), 'missing stream helper: ' + s);
  }
});

test('smoke: service worker cache is namespaced and bumped', () => {
  assert.match(sw, /keys\.filter\(k => k\.startsWith\(NS\) && k !== CACHE\)/);
  const v = sw.match(/CACHE = 'zhm-v(\d+)/);
  assert.ok(v, 'cache name found');
  assert.ok(Number(v[1]) >= 7, 'cache bumped for this release (zhm-v7+)');
});

test('smoke: the test suite is not only this file', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.notEqual(pkg.scripts.test, undefined);
  const behavior = readFileSync(new URL('./behavior.test.js', import.meta.url), 'utf8');
  assert.ok(behavior.length > 4000, 'the behavioural suite must exist and be substantial');
  assert.ok(!/html\.includes\(/.test(behavior), 'the behavioural suite must not fall back to substring checks');
});
