# Ember Yard — a three.js tactical FPS

A round-based, Counter-Strike-style tactical FPS that runs offline in a
browser from static files. Original map, art, sounds and names — no copy of
any commercial game.

## The game

- **5v5, round-based.** You are Vanguard (teal) against the Crimson bots.
  First to 5 rounds wins the match (max 9 rounds).
- **Spike objective.** Plant the spike at Site A or B (hold `E`, 3.5 s) or
  eliminate the other team. A planted spike detonates in 35 s unless the
  defenders defuse it (hold `E`, 5 s). A round also ends on the 100 s timer.
- **Money and buy menu.** Start with $1000. Kills pay $300, plants $300,
  round wins $1000, losses $600. Press `B` during the 12 s buy phase to buy
  the Raptor-7 AR ($2500), Hornet-9 SMG ($1400), Breacher-12 shotgun
  ($1100), Longbow DMR ($3800) or Ember Frag grenades ($300, `G` to throw).
- **Gunplay.** Hitscan with headshots (3x damage), recoil, spread that grows
  while moving and shrinks while crouched or aiming (right-click), reloads,
  finite magazines and reserves, tracers and muzzle flash.
- **Bots.** Nine bots with waypoint routes, vision cones with real line of
  sight, hearing (gunshots attract them), burst fire with reaction time,
  strafing, site holds, rotations, planting and defusing.
- **Map.** Ember Yard: a dusk yard with three lanes (west flank, mid doors,
  east flank), two spike sites, crates, containers and pillars, a live
  minimap, and synthesised Web Audio sound effects (no audio files).

## Controls

| Key | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Click / right-click | Fire / aim down sights |
| R | Reload |
| E (hold) | Plant / defuse the spike |
| G | Throw frag grenade |
| B | Buy menu (buy phase) |
| 1 / 2 / 3 | Weapons |
| Ctrl / C | Crouch |
| Space | Jump |

## Play locally

```
node serve.ts
```

then open http://localhost:8080 in desktop Chrome.

## Deterministic screenshots

`?shot=start|play|plant|end&seed=1` renders a fixed frame for capture
(see `shots.json`). The page sets `window.__shotReady` when the frame is
painted twice.

## Hand in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored `vendor/makefun-threejs.ts` library.

## Layout

- `game/index.html` — page + HUD
- `game/src/main.js` — boot, fixed-step loop, shooting, grenades, shots
- `game/src/world.js` — Ember Yard map, collision, routes, sites
- `game/src/bots.js` — bot AI (see / hear / move / shoot / plant / defuse)
- `game/src/rounds.js` — match state machine, score, money
- `game/src/weapons.js` — weapon table + view model
- `game/src/player.js` — movement (accel, crouch, jump, collision)
- `game/src/effects.js` — pooled tracers, sparks, explosions, spike
- `game/src/hud.js` — HUD, buy menu, kill feed, minimap
- `game/src/input.js` — keyboard / mouse / pointer lock
- `game/src/audio.js` — synthesised sound effects (Web Audio only)
- `game/src/palette.js`, `game/src/rng.js` — look plan, seeded RNG

## License

MIT — see `LICENSE`.
