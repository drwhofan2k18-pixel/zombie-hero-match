# QA Deep Audit - 2026-09-23

Auditor: independent deep QA pass (`audit/qa-deep-2026-09-23`).
Scope: full read of `zombie-hero-match.html` (1,674 lines), `sw.js`, `scripts/build.mjs`,
`tests/`, plus the newer **v7.1 working copy** found on the local disk
(`/media/discord/.../Zombie`), which is **ahead of `main`** (main is v7).

## 0. Test / build gate status

| Check | Result |
|---|---|
| `npm run check` (index.html freshness) | PASS |
| `node --test tests/*.test.js` (36 tests, v7.1 copy) | **36 / 36 PASS** |
| Seeded stream reproducibility (same day+wave key) | PASS (verified independently) |
| Day-key collisions across all of 2026 | 0 (verified) |
| `index.html` byte-identical to game file (v7.1 copy) | PASS |
| sw.js cache namespaced (`zhm-*`) and bumped | PASS |

## 1. Main vs local working copy

`main` is v7. The local disk copy is **v7.1**: split RNG streams
(srand/wrand/prand/fxrnd), per-(day,wave) horde keys, pre-rolled hordes,
survival drop guard, 0-HP save fix, `syncFieldBox` perf fix, namespaced SW cache.
All v7.1 claims were verified against the code; nothing in the changelog comments
is false. **Recommendation: publish the v7.1 working copy to `main` as its own PR**
- it is currently un-versioned anywhere and represents real fixes.

## 2. Findings (v7.1 working copy)

### M-1. Pending supply drop is lost on reload (Medium)
`saveGame()` (L468) persists muts/chal/abCD but **not `dropT`/`dropSpec`**, and the
5 s autosave runs mid-wave. `startWave(...,keepRolls=true)` resets `S.dropT=0`
(L1386), so a reload during an active drop silently deletes it. The drop *contents*
are seeded (good), but the drop itself is not. Fix: persist `dropT`+`dropSpec`, or
re-derive `dropT` from `dropRng` on continue.

### M-2. `dailyWaveCode` is ambiguous (Low/Med)
`dailyWaveCode()` (L294) maps zombie types to `type[0]`: both **regular** and
**runner** become `'r'`. Two players comparing wave codes cannot distinguish a
runner-heavy wave from a regular-heavy one, which undermines the "compare codes"
promise. Use a unique letter per type.

### L-1. Corrupt save can crash `updateHud` (Low)
`updateHud()` (L1526) does `MUTATORS[m].icon` for every saved mut. `applySave()`
copies muts from localStorage verbatim; one hand-edited/legacy key (e.g. from a
future rename) throws a TypeError and blanks the HUD. Filter saved muts against
`MUTATORS` in `applySave()` (chal already gets this treatment at L480).

### L-2. `rollMutators` can silently under-deliver (Low)
The count loop (L314) re-draws when it picks a duplicate but does not retry, so a
"2 mutators" roll can yield 1. Cosmetic but makes seeded runs differ in mutator
count between intended vs actual. Draw from the remaining keys instead.

### L-3. `shuffleGrid` guard exhaustion is unhandled (Low)
If 80 shuffle attempts fail to produce a match-free, move-having board (L591), the
board is left in whatever state the last attempt made - potentially no valid moves,
soft-locking the board until a lucky cascade. Probability is tiny on a 7x7/5-color
board, but a forced re-deal (buildGrid) is a cheap safety net.

### L-4. Starting a new run deletes the existing save with no confirmation (Low, UX/data)
`pickClass()` (L1610) `removeItem('zms_save')` before `newGame()`. One misclick on
a class button destroys a long run. Consider a confirm, or keep the old save until
wave 1 of the new run commits its first autosave.

### L-5. Yesterday's Daily can be continued today (Low, by-design?)
A Daily save keeps `S.day`; on a later day, Continue resumes the *old* seed and the
resulting daily code is still presented as "today's run". If cross-day continuation
is intended, fine - but `btnContinue` and `dailyComplete()` copy both say "today",
which is then wrong.

### N-1. Notes (no action required)
- `metaSave()` runs on every kill (L1137) - a localStorage write per kill. Fine at
  current scale; batch if kill rates rise (Swarm late waves).
- Arrow-storm `setTimeout` callbacks (L429) check `S.over` but not `S.screen`;
  currently harmless because `S.zombies` is empty between waves.
- `spawnProj`/`impact` aim at a snapshot position; a moving zombie can be hit by an
  explosion drawn slightly behind it. Cosmetic.
- `dailyCode` checksum (`%46656`) is trivially forgeable - acceptable for a local,
  honour-system leaderboard; do not market codes as anti-cheat.
- Co-op ally ability unlock gates on P1's `S.heroLvl` (L357) - matches the
  "passives stack" copy, but worth documenting explicitly.

## 3. What was checked and found sound
- RNG stream separation (v7.1 D-1 fix): gameplay streams are correctly per-(day,wave)
  keyed; prand/fxrnd never affect horde composition. Verified by code path review
  and independent reproduction of `mulberry32` keys.
- Survival: all heal paths (`healBarricade`, drops, cleric blessing, smite) are
  correctly blocked.
- 0-HP save exploit from v7 closed (`applySave` L476).
- Death/restart save contract (L1455): dead runs are no longer resumable.
- sw.js: namespaced cache deletion (no longer wipes sibling apps), correct
  network-first-ish cache fill, guarded fallback.
- Build gate: `index.html` is a true build artefact with a `--check` CI tripwire.
- Input handling (touchend+click suppression window), grid swap/collapse/cascade
  logic, match detection, and the `wouldMatch` undo are correct on review.
- Test suite: 36/36 pass; hooks in `__ZT` cover the real logic surface.

## 4. Suggested PR sequence
1. This audit report (this branch).
2. Publish the local v7.1 working copy to `main` (it is un-versioned risk right now).
3. Fix M-1 and M-2 with a test each; L-1..L-4 opportunistic.
