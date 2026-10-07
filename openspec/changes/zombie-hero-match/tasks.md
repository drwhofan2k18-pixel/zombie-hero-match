# Tasks: zombie-hero-match

1. [x] Mine TheArchitectit/zombietoss for mechanics (zombie types, spawn weights, SFX, mobile shell)
2. [x] Core shell: single-file HTML, viewport lock, HUD, layout (field/grid split)
3. [x] Match-3 engine: 7x7 grid, swap validation, match detect, cascades, refill, no-move shuffle
4. [x] Touch input: swipe + tap-tap, pointer events
5. [x] Zombie system: 4 types, lanes, march, barricade attacks, HP bars, slow/armor
6. [x] Combat binding: matches -> color effects -> damage, kill rewards, floating feedback
7. [x] Classes: Soldier + Mage with passives and perks
8. [x] Wave loop: spawn schedule, wave clear, upgrade shop, next wave
9. [x] Meta: upgrades, gold economy, game over/restart with carry-over
10. [x] Persistence: localStorage save + Continue on boot, autosave
11. [x] Leaderboard: local scores (zhm_scores), score = kill points + wave bonuses, rank on game over, top-5 on title
12. [x] Repo: public zombie-hero-match, README main, feature branch with openspec + game
13. [x] v2 touch fix: bindTap buttons (touchend+click, dedup), grid touch handlers, tile dataset re-sync
14. [x] v2 swap validity: invalid swaps visibly snap back (flash + bad sfx); verified live
15. [x] v2 hero: left-side sprite, attack swing + class-flavored projectiles on every match
16. [x] v2 hero progression: XP/levels, Lv2 passive + Lv4 active abilities, HUD level/XP bar, cooldown button
17. [x] v2 persistence: hero level/XP + score/kills in zms_save; Continue restores all
18. [x] v2 offline update flow: sw cache zhm-v2/v3 bumps, old-cache cleanup, controllerchange auto-reload
19. [x] v2 audit remediation: ice lane-slow code fix, score/kills persistence, reproducible gate (npm test from fresh clone), package.json name
20. [x] Gates green at pushed head: node --test tests/game.test.js 8/8
21. [x] v4 classes: Ranger, Cleric, Necromancer with distinct visuals + kits (5 total)
22. [x] v4 bosses: every 10th wave spawns a scaled boss; campaign unbounded past 100 waves
23. [x] Gates green at v4 head: 9/9 incl. v4 presence checks; fresh-clone npm test verified
24. [x] v5 combos: 4/5+-in-a-row detection + banners + score bonuses; multi-line simultaneous matches multiply damage +50%/extra line; combo jingle
25. [x] v5 achievements: 20 defs, lifetime stats + unlock map in zms_meta, unlock toasts, list screen (locked/unlocked) on title + game over
26. [x] v5 weather: per-wave roll (clear/rain/snow/fog/storm), CSS-only ambient layers, storm lightning + delayed thunder, gameplay flavor per condition, weather in save
27. [x] v5 gates: tests extended to 12/12 (v5 presence, achievement-def integrity, weather coupling, weather in save schema); fresh-clone npm test verified
28. [x] v6 weather 2.5D: canvas engine with near/far parallax layers (wback/wfore), batched-stroke rain + splashes + wind gusts, snow sway + accumulation, fog banks + foreground drift, storm bolt + sky flash + delayed thunder, clear-sky clouds/dust
29. [x] v6 gore: blood bursts, tumbling chunks (flesh/bone/eyeball/teeth), fading splatter decals; boss/brute/crit scaling; pooled caps; boss red flash
30. [x] v6 weather roll: previous condition excluded, boss waves court storms (30%); zombietoss weather-roll behavior documented (static light rain, debug-key only)
31. [x] v6 gates: tests extended to 16/16 (v6 presence, depth-layer structure, gore wiring/caps, functional rollWeather distribution); fresh-clone npm test verified

## v8 — feel & settings (2026-10-07)
- [x] Persisted sound + haptics options in zms_meta with title-screen toggles
- [x] Procedural haptics on match, cascade, kill, boss wave, achievement, game-over
- [x] Sound gate in tn/ns honoring the sound option
- [x] Audit F10: ability cooldowns reset at wave start
- [x] Gate: 27/27 tests green; sw cache bumped to zhm-v8; index.html mirrored
