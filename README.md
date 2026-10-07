# RJL's Zombie Hero Match

Offline match-3 zombie RPG in a single HTML file. Open `zombie-hero-match.html` on your phone - plays fully offline, saves to localStorage.

v8: feel & settings — persisted SOUND and HAPTICS toggles on the title screen (stored in zms_meta), procedural haptics wired into matches, cascades, kills, boss waves, achievements and game-over (navigator.vibrate, gracefully inert where unsupported), and ability cooldowns now reset at every wave start (external-audit F10).

v7: game modes (Classic, Boss Rush, Swarm, Survival, local Co-op 2P, seeded Daily Challenge with shareable score codes), per-wave mutators and optional challenges, supply-drop and stampede random events, 8 new achievements.

v6: 2.5D weather on layered canvases (near/far parallax rain, snow, ground fog, foreground lightning bolts, wind gusts, splashes, snow accumulation), zombie gore on every kill (blood bursts, tumbling chunks, fading splatter - ported from zombietoss), and a smarter weather roll (changes every wave, storms court boss waves).

v5: combos (4-in-a-row, multi-line matches), 20 achievements with a list screen, per-wave weather with light gameplay flavor.

Design package: `openspec/changes/zombie-hero-match/`. Gates: `npm test`.
