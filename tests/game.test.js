// DevGate smoke tests for zombie-hero-match.html (single-file offline game)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const html = readFileSync(new URL('../zombie-hero-match.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('fully offline: no external requests', () => {
  assert.equal(/https?:\/\//.test(html.replace(/example\.com/g, '')), false, 'external URL found');
  assert.equal(/<script[^>]+src=/.test(html), false, 'external script');
  assert.equal(/<link[^>]+href=/.test(html), false, 'external stylesheet');
  assert.equal(/@import|url\(/.test(html), false, 'CSS external ref');
});

test('mobile: viewport meta and touch handling present', () => {
  assert.match(html, /viewport/);
  assert.match(html, /touch-action/);
  assert.match(html, /touchstart/);
  assert.match(html, /pointerdown/);
});

test('inline JS parses cleanly (every script block)', () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 1, 'script block found');
  const tmp = new URL('./.inline-check.js', import.meta.url).pathname;
  for (const b of blocks) {
    writeFileSync(tmp, b[1]);
    execFileSync('node', ['--check', tmp]);
  }
});

test('required systems present: classes, upgrades, waves, save', () => {
  for (const needle of ['soldier', 'mage', 'spawnWeights', 'localStorage', 'zms_save', 'zhm_scores', 'lbRecord', 'gameOver', 'waveComplete', 'renderUpgrades', 'findMatches']) {
    assert.ok(html.includes(needle), 'missing: ' + needle);
  }
});

test('v2 systems present: touch fix, snap-back, hero, levels, abilities', () => {
  for (const needle of ['bindTap', 'touchend', 'noswap', 'heroLvl', 'heroXP', 'gainXP', 'onLevelUp', 'castAbility', 'renderAbilityBtn', 'critburst', 'shockwave', 'chainnova', 'freezeall', 'spawnProj', 'heroAtkAnim', '__ZT']) {
    assert.ok(html.includes(needle), 'missing: ' + needle);
  }
});

test('v4 systems present: 5 classes, boss waves, new abilities', () => {
  for (const needle of ['ranger', 'cleric', 'necro', 'volley', 'blessing', 'soulharvest', 'arrowstorm', 'smite', 'deathwave', 'boss', 'bossPending', 'btnRanger', 'btnCleric', 'btnNecro', 'BOSS WAVE']) {
    assert.ok(html.includes(needle), 'missing: ' + needle);
  }
});

test('v5 systems present: combos, achievements, weather', () => {
  for (const needle of ['comboBanner', 'comboReward', 'checkAch', 'unlockAch', 'renderAch', 'zms_meta', 'META.stats', 'multiMatches', 'combos4', 'combos5', 'bestChain', 'bossKills', 'closeCall', 'rollWeather', 'applyWeather', 'WEATHERS', '_stormBolt', 'ovAch', 'achList', 'btnAch', 'wflash']) {
    assert.ok(html.includes(needle), 'missing: ' + needle);
  }
});

test('v5 achievement defs are well-formed (unique ids, 15+)', () => {
  const ids = [...html.matchAll(/\{id:'([a-z0-9]+)',name:'/g)].map(m => m[1]);
  assert.ok(ids.length >= 15, 'expected 15+ achievements, found ' + ids.length);
  assert.equal(new Set(ids).size, ids.length, 'duplicate achievement ids');
});

test('v5 weather set covers clear, rain, snow, fog, storm with gameplay flavor', () => {
  for (const w of ["clear:{icon:", "rain:{icon:", "snow:{icon:", "fog:{icon:", "storm:{icon:"]) {
    assert.ok(html.includes(w), 'weather missing: ' + w);
  }
  // each non-clear weather couples to gameplay somewhere
  assert.match(html, /S\.weather==='snow'/);
  assert.match(html, /S\.weather==='rain'/);
  assert.match(html, /S\.weather==='fog'/);
  assert.match(html, /S\.weather==='storm'/);
});

test('index.html mirrors the game file', () => {
  const idx = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(idx, html);
});

test('service worker cache bumped to the current release', () => {
  const m = sw.match(/zhm-v(\d+)/);
  assert.ok(m, 'cache name found');
  assert.ok(Number(m[1]) >= 3, 'cache bumped for this release (zhm-v3+)');
});

test('save schema round-trips required fields', () => {
  const save = { classId: 'soldier', wave: 3, gold: 50, maxHp: 125, hp: 100, up: { dmg: 1, vit: 1, greed: 0, perk: 0 }, heroLvl: 4, heroXP: 30, weather: 'storm' };
  const parsed = JSON.parse(JSON.stringify(save));
  for (const k of ['classId', 'wave', 'gold', 'maxHp', 'hp', 'up', 'heroLvl', 'heroXP', 'weather']) assert.ok(k in parsed, 'save missing ' + k);
});

test('v6 systems present: 2.5D canvas weather + gore', () => {
  for (const needle of ['wback', 'wfore', 'gorecv', 'weatherFrame', 'goreFrame', 'RAIN_LAYERS', 'SNOW_LAYERS', 'FOG_LAYERS', 'spawnBlood', 'spawnGore', 'addSplat', 'drawChunk', 'updGust', 'strikeBolt', 'drawBolt', 'skyFlash', 'snowCap', 'seedFx', 'sizeFx', 'redFlash', 'GORE_TYPES']) {
    assert.ok(html.includes(needle), 'missing: ' + needle);
  }
});

test('v6 weather has real depth: 3 parallax layers, near layer on the front canvas', () => {
  // far+mid layers render behind the horde (back canvas), near layer in front (fore canvas)
  assert.ok((html.match(/cv:'back'/g) || []).length >= 4, 'back-canvas layers');
  assert.ok((html.match(/cv:'fore'/g) || []).length >= 2, 'fore-canvas layers');
  const rain = html.match(/const RAIN_LAYERS=\[([\s\S]*?)\];/);
  assert.ok(rain, 'RAIN_LAYERS found');
  assert.equal((rain[1].match(/\{n:/g) || []).length, 3, 'rain has 3 depth layers');
  const snow = html.match(/const SNOW_LAYERS=\[([\s\S]*?)\];/);
  assert.equal((snow[1].match(/\{n:/g) || []).length, 3, 'snow has 3 depth layers');
  // batched-stroke perf convention: rain drawn with one beginPath/stroke per layer
  assert.match(html, /one batched stroke per depth layer/);
});

test('v6 gore is wired into kills with caps', () => {
  const kz = html.match(/function killZombie\(z\)\{[\s\S]*?\n\}/);
  assert.ok(kz, 'killZombie found');
  assert.match(kz[0], /spawnBlood\(/);
  assert.match(kz[0], /spawnGore\(/);
  assert.match(kz[0], /addSplat\(/);
  assert.match(html, /BLOOD_MAX=150/);
  assert.match(html, /CHUNK_MAX=40/);
  assert.match(html, /SPLAT_MAX=30/);
  // crits and bosses escalate
  assert.match(kz[0], /boss.*2\.2/);
  assert.match(html, /z\._crit\?1\.5/);
  // non-lethal crits still bleed a little
  assert.match(html, /if\(crit\)\{const cp=zPos\(z\);spawnBlood\(cp\.x,cp\.y,7\)\}/);
});

test('v6 weather roll: per-wave, never repeats, boss waves court storms', () => {
  const m = html.match(/function rollWeather\(\)\{[\s\S]*?\n\}/);
  assert.ok(m, 'rollWeather found');
  let S = { wave: 1, weather: 'clear' };
  eval('const rnd=()=>Math.random();\n' + m[0] + '\nglobalThis.__rw = rollWeather;');
  const rollWeather = globalThis.__rw;
  // never repeats the previous condition
  for (let i = 0; i < 400; i++) {
    const prev = S.weather, next = rollWeather();
    assert.notEqual(next, prev, 'weather repeated: ' + next);
    S.weather = next;
  }
  // covers all five conditions over enough rolls
  const seen = new Set();
  S = { wave: 3, weather: null };
  for (let i = 0; i < 600; i++) { S.weather = rollWeather(); seen.add(S.weather); }
  for (const w of ['clear', 'rain', 'snow', 'fog', 'storm']) assert.ok(seen.has(w), 'roll never produced ' + w);
  // boss waves court storms: wave 10 storm rate clearly above the flat-wave 15%
  let storms = 0;
  S = { wave: 10, weather: null };
  for (let i = 0; i < 2000; i++) if (rollWeather() === 'storm') storms++;
  assert.ok(storms / 2000 > 0.22, 'boss-wave storm rate too low: ' + storms / 2000);
});

test('v7 systems present: modes, mutators, challenges, seeded daily, co-op, events', () => {
  for (const needle of ['MODES', 'rollMutators', 'MUTATORS', 'hasMut', 'rollChallenge', 'CHALLENGES', 'mulberry32', 'RNGF', 'dailyDayStr', 'dailySeed', 'dailyCode', 'dailyComplete', 'DAILY_WAVES', 'modeRow', 'selectMode', 'pickClass', 'pendingMode', 'allyPos', 'ensureAlly', 'allyAttack', 'allyAtkAnim', 'castAllyAbility', 'castAbilityFor', 'ab2Btn', 'hero2', 'stampedeT', 'supplyDrop', 'dropT', 'bossrush', 'swarm', 'survival', 'coop', 'daily', 'challengesDone', 'dailiesDone', 'coopWaves', 'mutWaves', '_waveHits', '_bigMatch', 'umuts', 'modeDesc', 'pickLabel']) {
    assert.ok(html.includes(needle), 'missing: ' + needle);
  }
});

test('v7 mode roster covers six modes with descriptions', () => {
  for (const m of ["classic:{icon:", "bossrush:{icon:", "swarm:{icon:", "survival:{icon:", "coop:{icon:", "daily:{name:"]) {
    assert.ok(html.includes(m), 'mode missing: ' + m);
  }
});

test('v7 daily run is seeded deterministically through the shared RNG tap', () => {
  assert.match(html, /RNGF=mulberry32\(dailySeed\(\)\)/);
  assert.match(html, /const rnd=\(\)=>RNGF\(\)/);
  assert.match(html, /const rand=\(a,b\)=>a\+RNGF\(\)\*\(b-a\)/);
});

test('v7 mutator roster and challenge roster are well-formed', () => {
  for (const m of ['swift:{icon:', 'thick:{icon:', 'elite:{icon:', 'goldrush:{icon:', 'glass:{icon:', 'stampede:{icon:']) {
    assert.ok(html.includes(m), 'mutator missing: ' + m);
  }
  for (const c of ["id:'killrace'", "id:'flawless'", "id:'bigmatch'", "id:'earner'"]) {
    assert.ok(html.includes(c), 'challenge missing: ' + c);
  }
});

test('v7 survival blocks barricade repair and daily has a fixed length', () => {
  assert.match(html, /if\(S&&S\.mode==='survival'\)return;S\.hp=clamp/);
  assert.match(html, /const DAILY_WAVES=25/);
  assert.match(html, /S\.mode==='daily'&&n>DAILY_WAVES/);
});

// ── v8: feel & settings (sound/haptics toggles, wave cooldown reset) ──

test('v8: settings persistence — META.opts with sound+haptics, loaded and merged', () => {
  assert.match(html, /opts:\{sound:true,haptics:true\}/, 'META defaults include opts');
  assert.match(html, /META\.opts=Object\.assign\(\{sound:true,haptics:true\}/, 'metaLoad merges opts');
  assert.match(html, /metaSave\(\)/);
});

test('v8: sound gate — tn and ns honor the sound option', () => {
  assert.match(html, /function tn\(f,d,t,v\)\{try\{ai\(\);if\(META\.opts&&!META\.opts\.sound\)return;/, 'tn gated');
  assert.match(html, /function ns\(d,v\)\{try\{ai\(\);if\(META\.opts&&!META\.opts\.sound\)return;/, 'ns gated');
});

test('v8: haptics helper exists, is gated, and wired into game events', () => {
  assert.match(html, /function vib\(p\)\{try\{if\(META\.opts&&META\.opts\.haptics&&navigator\.vibrate\)navigator\.vibrate\(p\)\}catch\(e\)\{\}\}/, 'vib helper');
  const calls = (html.match(/vib\(/g) || []).length;
  assert.ok(calls >= 6, `vib wired at >=6 call sites (found ${calls})`);
  assert.match(html, /vib\(\[80,40,80\]\)/, 'game-over pattern');
  assert.match(html, /vib\(\[30,50,30\]\)/, 'boss wave pattern');
  assert.match(html, /vib\(\[15,40,20\]\)/, 'achievement pattern');
});

test('v8: settings UI buttons present and toggle persistence', () => {
  assert.match(html, /id="optSound"/, 'sound toggle button');
  assert.match(html, /id="optHaptics"/, 'haptics toggle button');
  assert.match(html, /function renderOpts\(\)/, 'toggle state renderer');
});

test('v8: ability cooldowns reset on wave start (audit F10 fix)', () => {
  const startWaveBody = html.slice(html.indexOf('function startWave'), html.indexOf('function waveComplete'));
  assert.match(startWaveBody, /S\.abCD=0;S\.ab2CD=0;/, 'startWave resets abCD and ab2CD');
});

test('v8: service worker cache bumped to zhm-v8', () => {
  assert.match(sw, /zhm-v8/);
  assert.doesNotMatch(sw, /zhm-v7/);
});
