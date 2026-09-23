# RJL's Zombie Hero Match — v7.1

Offline match-3 zombie RPG in a single HTML file. Open `index.html` on your phone — it plays fully offline and saves to `localStorage`.

**v7.1** is an integrity release. It adds no new content. It makes the game do what its own title cards say, and replaces a `grep`-based gate with one that actually runs the game.

```
┌──────────────────────────────────────────────────────────────────┐
│  v7   : 12 pass / 14 fail  (behavioural suite)   21/21 smoke ✅  │  ← the gate could not see
│  v7.1 : 36 pass /  0 fail  (behavioural suite)   10/10 smoke ✅  │  ← the 14 failures are D-1…D-8
└──────────────────────────────────────────────────────────────────┘
```

Read `../ZHM-Assessment-Report.md` for the findings (D-1 … D-18), `../ZHM-Roadmap.md` for what is next, `../ZHM-Fix-Prompts.md` for ready-to-run work packages.

---

## Run it

Open `index.html`. That is the whole install. It works from `file://`, from a local server, and from GitHub Pages. After the first load it works in airplane mode.

Controls: **tap a tile then tap a neighbour**, or **swipe**. The hero stands at the barricade on the left and attacks every match you make.

## Test it

```sh
npm test          # build check + 26 behavioural tests + 10 smoke tests
npm run build     # regenerate index.html from zombie-hero-match.html
npm run check     # CI mode: fail if index.html is stale
```

Zero dependencies. Node 20+.

---

## What v7.1 fixed

| # | Finding | Was | Now |
|---|---|---|---|
| **D-1** | Daily Challenge determinism | one RNG stream shared by gameplay **and** gore/lightning/particles; `continueGame` re-seeded from wave 1 | four streams (`RSPN`/`RWAVE` seeded per *(day, wave)*; `RPLY`/`RFX` never seeded) and the whole horde pre-rolled at wave start |
| **D-2** | `applySave` full-heals from a `hp:0` save (`d.hp \|\| S.maxHp`) | free full heal | `hp:0` restores to `0` |
| **D-3** | death left the run resumable | `gameOver()` saved the dead run | death writes the documented carry-over save at **wave 1**; Survival/Daily still wipe it |
| **D-4** | Boss Rush | 1 boss + 3 regulars, no extra scaling | every spawn is a boss, scaling +60% faster |
| **D-5** | `mutwin` copy | "under 2 mutators", unlocked at 2+ | "2 or more mutators active" |
| **D-6** | multi-colour matches | every group hit one zombie | one frontmost target per colour group |
| **D-7** | service worker | deleted every cache on the origin | only deletes `zhm-*` |
| **D-8** | mobile frame budget | `field.clientWidth` read once per zombie per frame | geometry snapshotted in `syncFieldBox()` |
| **D-10** | save payload | 13 fields, no muts/challenge/cooldowns | +`muts`, `chal`+`prog`, `abCD`, `ab2CD`, `alive` |
| **D-11** | two 80 KB files hand-mirrored | test enforced the mirror | `scripts/build.mjs` generates `index.html` |
| **D-12** | Survival claimed "no repairs" | 1-HP clamp per wave + a drop that toasted "patched!" and did nothing | clamp floor is 0, Survival drops always pay gold |
| **D-9** | the gate | 21 presence-greps, 0 calls into game logic | 26 real behavioural tests + a smoke gate labelled as such |

Also fixed along the way: `ovUpgrade` no longer sits under the death panel, and the achievement list is not rebuilt while hidden.

---

## File map

| Path | What it is |
|---|---|
| `zombie-hero-match.html` | **the source** — the entire game, inline |
| `index.html` | **build artefact** — generated, byte-identical, served at the site root |
| `sw.js` | offline cache (`zhm-v7-1`), namespaced cleanup |
| `scripts/build.mjs` | generates `index.html`; `--check` for CI |
| `tests/harness.mjs` | headless DOM stub + game loader. Zero deps. Instruments geometry reads so perf claims are measurements |
| `tests/behavior.test.js` | **the gate that matters** — drives real functions through `__ZT` / module scope |
| `tests/static.test.js` | smoke gate only (presence checks). Header explains exactly what it can and cannot prove |
| `docs/qa/` | the 2026-09-13 external audit (still worth reading — F2/F4/F5 became D-13/D-14/D-9) |
| `openspec/` | the v1 design package (**stale**, see roadmap 9.2) |

---

## Design notes worth knowing

**Four random streams, on purpose.** `RSPN` (horde) and `RWAVE` (weather / mutators / challenges) are seeded per *(day, wave)*. `RPLY` (board deals, crits, pick-a-target) and `RFX` (gore, lightning, wind, particles) are **never** seeded. That is the honest version of "identical weather, mutators and spawns for every player": *composition* is shared, *boards and dice* are yours. Any patch that routes a particle through a seeded stream breaks the Daily again — `tests/behavior.test.js` has a test that installs recording stubs and asserts exactly that.

**The horde is pre-rolled.** `rollHorde(n)` decides every zombie in a wave — type, lane, HP, speed, spawn gap, stampede pack position — at wave start, into `S.horde[]`. Spawning is a replay. This is what makes the guarantee survive frame rate, kill speed and screen size.

**Death means it.** `gameOver()` immediately writes the carry-over save at wave 1, which is what the death screen has always promised. There is no dead run sitting in `localStorage` to resume.

## Known gaps (see the roadmap)

- **D-18** — the perk upgrade is still a no-op purchase for Ranger / Cleric / Necro (it is shown the Mage perk card). Tracked as roadmap 8.2; deliberately not patched here because the right fix is real perks, not a hidden card.
- **D-15** — the match-size multiplier is self-consistent (`3→24, 4→48, 5→80`) but the spec words it ambiguously. Needs a decision.
- **D-13/D-14** — the OpenSpec package is 7 versions behind the artefact and there is no CI.
- No `LICENSE` in the upstream repo.
- Real-device feel, iOS WebAudio unlock and true airplane-mode play are unverified — the harness proves logic, not pixels.
