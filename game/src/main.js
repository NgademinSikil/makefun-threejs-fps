// Ember Yard — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. 5v5 round-based tactical FPS: plant the spike
// or eliminate the Crimson team, buy between rounds, first to 5 takes the match.
//
// ?shot=start|play|plant|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponSet, WEAPONS, GRENADE_PRICE, GRENADE_DAMAGE, GRENADE_RADIUS } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds, BUY_SECONDS } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 72);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders);
const weapons = createWeaponSet(camera);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 130;
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpBefore = new THREE.Vector3();

const body = player.state;
let playerAlive = true;
let started = false;
let frozen = false;
let shotSafe = false; // runShot's settle steps must not hurt the player
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let shake = 0;
let prevFiring = false;
let lastBeepSecond = -1;
let minimapT = 0;
let qualityTime = 0;
let frameEma = 0;
let qualityTier = 0;
let spectateBot = null;
const grenades = [];
const markerHoldMs = shot ? 4000 : 90;

const playerActor = {
  name: 'You', team: 'attack', isPlayer: true,
  pos: body.position, vel: body.velocity, crouching: false, alive: true,
};
const actors = [playerActor];

function planForRound(round) {
  const a = round % 2 === 1
    ? ['toA', 'toMid', 'toB', 'toA']
    : ['toB', 'toMid', 'toA', 'toB'];
  const d = round % 2 === 1
    ? ['defA', 'defB', 'defMid', 'defA', 'defB']
    : ['defB', 'defA', 'defMid', 'defB', 'defA'];
  return { attackSplit: a, defendSplit: d };
}

const bots = createBots(scene, world, random, {
  tracer(from, to) { effects.tracer(from, to); },
  sound(kind) { if (kind === 'distant') audio.distantShot(); },
  damageActor(actor, dmg, isHead, fromBot) {
    if (actor.isPlayer) damagePlayer(dmg, fromBot);
    else damageBot(actor, dmg, isHead, fromBot);
  },
  planted(bot, site) { rounds.onPlant(site); },
  defused(bot) { rounds.onDefuse(); },
});
for (const bot of bots.list) actors.push(bot);

const rounds = createRounds({
  onRoundStart(round) {
    resetPositions(round);
    hud.hideBuy();
    if (!shot) refreshBuyOpen();
    hud.banner(`ROUND ${round}`, 'Buy phase — press B for the buy menu', 2200);
  },
  onLive() {
    hud.hideBuy();
    hud.banner('GO', 'Plant the spike at Site A or B', 1600);
    audio.buy();
  },
  onRoundEnd(winner, reason, st) {
    effects.spike.visible = false;
    hud.setProgress(null, null);
    if (winner === 'attack') audio.roundWin();
    else audio.roundLose();
    hud.banner(
      winner === 'attack' ? 'ROUND WON' : 'ROUND LOST',
      `${reason} — Vanguard ${st.scoreAttack} : ${st.scoreDefend} Crimson`,
      3600,
    );
    hud.killfeed(`${winner === 'attack' ? 'Vanguard' : 'Crimson'} takes round ${st.round}`, winner === 'attack');
    // Pointer lock stays: the round rolls into the buy phase, where the buy
    // menu is driven by keyboard (1-5) while locked.
  },
  onMatchEnd(winner, st) {
    const text = winner === 'draw'
      ? `Draw — ${st.scoreAttack} : ${st.scoreDefend}`
      : winner === 'attack'
        ? `Vanguard wins the match ${st.scoreAttack} : ${st.scoreDefend}`
        : `Crimson wins the match ${st.scoreDefend} : ${st.scoreAttack}`;
    hud.showOverlay('matchEnd', text);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onPlant(site, st) {
    effects.spike.visible = true;
    effects.spike.position.copy(site.center);
    audio.plant();
    hud.banner('SPIKE PLANTED', `Site ${site.letter} — detonation in 35 seconds`, 3000);
    hud.killfeed(`Spike planted at Site ${site.letter}`, true);
  },
});

function resetPositions(round) {
  const plan = planForRound(round);
  bots.reset(plan);
  player.reset(world.spawns.attack[1], 0);
  playerAlive = true;
  playerActor.alive = true;
  spectateBot = null;
  weapons.refillAll();
  effects.spike.visible = false;
  for (const g of grenades) effects.removeGrenade(g);
  grenades.length = 0;
  hud.setHealth(100);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve);
  hud.setWeapon(weapons.def().name, weapons.state.grenades);
}

function buyItems() {
  const money = rounds.state.money;
  const items = [];
  const keys = { rifle: '1', smg: '2', shotgun: '3', dmr: '4' };
  for (const id of ['rifle', 'smg', 'shotgun', 'dmr']) {
    const d = WEAPONS[id];
    items.push({
      id, key: keys[id], name: d.name, price: d.price,
      stat: `${d.damage} dmg · ${d.mag} mag`,
      owned: !!weapons.state.owned[id],
    });
  }
  items.push({
    id: 'grenade', key: '5', name: 'Ember Frag grenade', price: GRENADE_PRICE,
    stat: `${GRENADE_DAMAGE} max dmg · ${GRENADE_RADIUS} m`,
    owned: weapons.state.grenades >= 2,
  });
  return { items, money };
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'matchEnd') {
    rounds.resetMatch();
    rounds.startRound();
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (rounds.state.phase === 'live' || rounds.state.phase === 'planted') {
    // Only the live game pauses: buy / round-end / match-end have their own UI.
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

// Clicking the canvas re-locks the pointer after Esc (the overlay button
// covers the same case while paused).
renderer.domElement.addEventListener('click', () => {
  if (shot || input.state.locked || rounds.state.phase === 'matchEnd') return;
  input.requestLock();
});

function syncCamera() {
  if (playerAlive) {
    camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
    camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  } else if (spectateBot && spectateBot.alive) {
    camera.position.set(spectateBot.pos.x, spectateBot.pos.y + 1.55, spectateBot.pos.z);
    camera.rotation.set(-0.05, spectateBot.yaw, 0, 'YXZ');
  }
  if (shake > 0) {
    camera.rotation.x += (random() * 2 - 1) * shake * 0.02;
    camera.rotation.y += (random() * 2 - 1) * shake * 0.02;
  }
  const targetFov = body.aiming && playerAlive ? 58 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function damagePlayer(dmg, fromBot) {
  if (!playerAlive || shotSafe) return;
  body.health -= dmg;
  hud.setHealth(body.health);
  hud.damageFlash();
  audio.hurt();
  if (body.health <= 0) {
    body.health = 0;
    playerAlive = false;
    playerActor.alive = false;
    rounds.onDeath();
    spectateBot = bots.list.find((b) => b.alive && b.team === 'attack') || null;
    hud.killfeed(`${fromBot ? fromBot.name : 'Crimson'} ▸ You`, false);
    hud.banner('YOU ARE DOWN', 'Spectating your team — the round fights on', 3000);
    const carrier = bots.carrier();
    if (!carrier) {
      const ally = bots.list.find((b) => b.alive && b.team === 'attack' && b.site);
      if (ally) bots.setCarrier(ally);
    }
    if (document.pointerLockElement) document.exitPointerLock();
    checkEnd();
  }
}

function damageBot(bot, dmg, isHead, fromBot) {
  if (!bot.alive) return;
  const killed = bots.damage(bot, dmg);
  if (killed) {
    const killerTeam = fromBot ? fromBot.team : 'attack';
    hud.killfeed(`${fromBot ? fromBot.name : 'You'} ▸ ${bot.name}${isHead ? ' — headshot' : ''}`, killerTeam === 'attack');
    if (!fromBot) {
      rounds.onKill('defend');
      audio.kill();
    }
    checkEnd();
  }
}

function checkEnd() {
  const attackAlive = (playerAlive ? 1 : 0) + bots.aliveCount('attack');
  const defendAlive = bots.aliveCount('defend');
  rounds.checkElimination(attackAlive, defendAlive, playerAlive);
}

function shoot(spread) {
  if (!weapons.takeRound()) { audio.dry(); return false; }
  const def = weapons.def();
  camera.getWorldDirection(direction);
  const pellets = def.pellets;
  let anyHit = false;
  for (let p = 0; p < pellets; p += 1) {
    tmpVec.copy(direction);
    tmpVec.x += (random() * 2 - 1) * spread;
    tmpVec.y += (random() * 2 - 1) * spread;
    tmpVec.z += (random() * 2 - 1) * spread;
    tmpVec.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, tmpVec);
    const targets = world.shootables.concat(bots.hitMeshes.filter((m) => m.userData.bot.alive));
    const hit = raycaster.intersectObjects(targets, false)[0];
    tmpVec2.copy(camera.position).addScaledVector(tmpVec, hit ? hit.distance : def.range);
    effects.tracer(camera.position, tmpVec2);
    if (!hit) continue;
    const bot = hit.object.userData.bot;
    if (!bot || !bot.alive) {
      effects.spark(hit.point, 2);
      continue;
    }
    const isHead = hit.object.userData.part === 'head';
    let dmg = def.damage * (isHead ? def.headMult : 1);
    if (hit.distance > 25) dmg *= 0.85;
    damageBot(bot, Math.round(dmg), isHead, null);
    hud.hitMarker(bot.hp <= 0, markerHoldMs);
    audio.hit();
    anyHit = true;
  }
  weapons.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.hearShot(body.position, 'attack');
  audio.shot(def.kind);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve);
  return anyHit;
}

function throwGrenade() {
  if (weapons.state.grenades <= 0 || rounds.state.phase === 'buy') return;
  weapons.state.grenades -= 1;
  hud.setWeapon(weapons.def().name, weapons.state.grenades);
  camera.getWorldDirection(direction);
  tmpVec.copy(camera.position).addScaledVector(direction, 0.6);
  tmpVec2.copy(direction).multiplyScalar(14);
  tmpVec2.y += 3.5;
  tmpVec2.x += body.velocity.x * 0.4;
  tmpVec2.z += body.velocity.z * 0.4;
  grenades.push(effects.makeGrenade(tmpVec, tmpVec2));
  audio.reload();
}

function explodeGrenade(g) {
  const at = g.mesh.position;
  effects.explode(at);
  audio.explosion();
  shake = Math.min(1.5, shake + 1);
  bots.hearShot(at, 'attack');
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    const d = bot.pos.distanceTo(at);
    if (d > GRENADE_RADIUS) continue;
    const dmg = Math.round(GRENADE_DAMAGE * (1 - d / (GRENADE_RADIUS + 1)));
    damageBot(bot, dmg, false, null);
  }
  if (playerAlive) {
    const d = body.position.distanceTo(at);
    if (d < GRENADE_RADIUS) damagePlayer(Math.round(GRENADE_DAMAGE * (1 - d / (GRENADE_RADIUS + 1)) * 0.6), null);
  }
}

function stepGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 14 * dt;
    tmpVec.copy(g.mesh.position).addScaledVector(g.vel, dt);
    // Simple bounce: revert the axis that entered a collider.
    tmpBefore.copy(g.mesh.position);
    g.mesh.position.copy(tmpVec);
    if (world.colliders.some((c) => c.containsPoint(g.mesh.position))) {
      g.mesh.position.copy(tmpBefore);
      g.vel.multiplyScalar(-0.35);
      g.vel.y = Math.abs(g.vel.y) * 0.4;
    }
    if (g.mesh.position.y < 0.09) {
      g.mesh.position.y = 0.09;
      g.vel.y = Math.abs(g.vel.y) * 0.4;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    if (g.fuse <= 0) {
      explodeGrenade(g);
      effects.removeGrenade(g);
      grenades.splice(i, 1);
    }
  }
}

function inSite(pos, site) {
  return Math.abs(pos.x - site.center.x) <= site.half.x && Math.abs(pos.z - site.center.z) <= site.half.z;
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;
  rounds.step(dt);

  if (phase === 'matchEnd' || rounds.state.phase === 'matchEnd') {
    weapons.step(dt, false);
    effects.step(dt);
    return;
  }

  if (phase === 'buy') {
    weapons.step(dt, false);
    effects.step(dt);
    return;
  }

  if (playerAlive) {
    player.step(dt, input.state.keys);
    playerActor.crouching = body.crouching;
  }
  weapons.step(dt, body.aiming);
  bots.step(dt, actors, { phase: rounds.state.phase, plantedSite: rounds.state.plantedSite, spikePos: effects.spike.position }, elapsed);
  effects.step(dt);
  stepGrenades(dt);

  // Spike beeps while planted.
  if (rounds.state.phase === 'planted') {
    const sec = Math.ceil(rounds.state.phaseT);
    if (sec !== lastBeepSecond) {
      lastBeepSecond = sec;
      audio.beep();
      effects.spikeLight.material.color.setHex(sec % 2 === 0 ? 0xff3b30 : 0xffd27a);
    }
  }

  // Player plant / defuse: hold E inside a site.
  let progress = null;
  if (playerAlive && (rounds.state.phase === 'live' || rounds.state.phase === 'planted')) {
    const holding = input.state.keys.has('KeyE');
    if (rounds.state.phase === 'live' && holding) {
      const site = world.sites.find((s) => inSite(body.position, s));
      if (site) {
        progress = { label: `Planting spike — Site ${site.letter}`, frac: (progressFrac += dt / 3.5) };
        if (progressFrac >= 1) {
          progressFrac = 0;
          rounds.onPlant(site);
        }
      } else progressFrac = 0;
    } else if (rounds.state.phase === 'planted' && holding) {
      const site = rounds.state.plantedSite;
      if (site && inSite(body.position, site)) {
        progress = { label: `Defusing spike — Site ${site.letter}`, frac: (progressFrac += dt / 5) };
        if (progressFrac >= 1) {
          progressFrac = 0;
          rounds.onDefuse();
        }
      } else progressFrac = 0;
    } else progressFrac = Math.max(0, progressFrac - dt / 2);
  }
  if (progress) hud.setProgress(progress.label, Math.min(1, progress.frac));
  else hud.setProgress(null, null);

  shake = Math.max(0, shake - dt * 2.2);
}
let progressFrac = 0;

function handleKeys() {
  if (input.takePressed('KeyB')) {
    if (rounds.state.phase === 'buy') {
      if (hud.buyVisible()) hud.hideBuy();
      else refreshBuyOpen();
    }
  }
  if (input.takePressed('KeyG')) throwGrenade();
  if (input.takePressed('KeyR')) {
    if (weapons.reload()) audio.reload();
  }
  // During the buy phase the number keys buy (the menu is keyboard-driven
  // while the pointer is locked); otherwise they switch weapons.
  const buyIds = ['rifle', 'smg', 'shotgun', 'dmr', 'grenade'];
  for (let i = 0; i < buyIds.length; i += 1) {
    if (input.takePressed(`Digit${i + 1}`)) {
      if (rounds.state.phase === 'buy') buyItem(buyIds[i]);
      else if (i === 0) {
        const primary = ['rifle', 'smg', 'shotgun', 'dmr'].find((id) => weapons.state.owned[id]);
        if (primary) weapons.switchTo(primary);
      } else if (i === 1) weapons.switchTo('pistol');
      else if (i === 2) {
        const owned = ['rifle', 'smg', 'shotgun', 'dmr'].filter((id) => weapons.state.owned[id]);
        if (owned.length > 1) {
          const idx = owned.indexOf(weapons.state.current);
          weapons.switchTo(owned[(idx + 1) % owned.length]);
        }
      }
    }
  }
}

function buyItem(id) {
  if (id === 'grenade') {
    const cost = weapons.buyGrenade(rounds.state.money);
    if (cost > 0) { rounds.state.money -= cost; audio.buy(); }
    else audio.denied();
  } else {
    const cost = weapons.buy(id, rounds.state.money);
    if (cost >= 0) { rounds.state.money -= cost; weapons.switchTo(id); audio.buy(); }
    else audio.denied();
  }
  hud.setMoney(rounds.state.money);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve);
  hud.setWeapon(weapons.def().name, weapons.state.grenades);
}

function refreshBuyOpen() {
  const { items, money } = buyItems();
  hud.showBuy(items, money, (id) => {
    buyItem(id);
    refreshBuyOpen();
  }, () => hud.hideBuy());
}

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - lastTime) / 1000;
  const dt = Math.min(rawDt, 0.1);
  lastTime = now;
  // Adaptive quality (live play only — screenshots render two fixed frames):
  // on weak GPUs / software rendering, shed pixel ratio, then shadows, so the
  // fixed-step simulation keeps real time instead of crawling.
  if (!shot) {
    qualityTime += rawDt;
    frameEma = frameEma === 0 ? rawDt : frameEma * 0.95 + rawDt * 0.05;
    if (qualityTier === 0 && qualityTime > 4 && frameEma > 0.04) {
      qualityTier = 1;
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      scene.traverse((m) => { if (m.material) m.material.needsUpdate = true; });
      renderer.setSize(window.innerWidth, window.innerHeight);
    } else if (qualityTier === 1 && qualityTime > 10 && frameEma > 0.08) {
      qualityTier = 2;
      renderer.setPixelRatio(0.75);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }
  if (!frozen) {
    const look = input.takeLook();
    if (playerAlive) player.look(look.x, look.y);
    body.aiming = input.state.aiming && playerAlive;
    handleKeys();
    const def = weapons.def();
    const wantFire = input.state.firing && playerAlive && rounds.state.phase !== 'buy';
    if (wantFire && weapons.ready()) {
      if (def.auto || !prevFiring) shoot(shot ? 0 : weapons.spread(player.groundSpeed(), body.crouching));
    }
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    hud.setTimer(rounds.state.phaseT, rounds.state.phase);
    hud.setScore(rounds.state.scoreAttack, rounds.state.scoreDefend, rounds.state.round);
    hud.setMoney(rounds.state.money);
    hud.setAlive((playerAlive ? 1 : 0) + bots.aliveCount('attack'), bots.aliveCount('defend'));
    hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve);
    hud.setWeapon(weapons.def().name, weapons.state.grenades);
    hud.setHealth(body.health);
    hud.setSpread(4 + weapons.spread(player.groundSpeed(), body.crouching) * 900 + (body.aiming ? -2 : 0));
    minimapT -= dt;
    if (minimapT <= 0) {
      minimapT = 0.2;
      hud.drawMinimap(world.solids, world.sites, actors, rounds.state.phase === 'planted' ? effects.spike.position : null);
    }
    const hint = !started
      ? ''
      : rounds.state.phase === 'buy'
        ? 'Buy phase — B opens the buy menu, deploy when ready'
        : rounds.state.phase === 'planted'
          ? 'Spike planted — defend it, or defuse with E at the site'
          : 'Hold E at Site A or B to plant the spike';
    hud.setHint(hint);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function placeBot(name, x, z, yaw, hp = 100) {
  const bot = bots.list.find((b) => b.name === name);
  if (!bot) return null;
  bot.pos.set(x, 0, z);
  bot.yaw = yaw;
  bot.hp = hp;
  bot.alive = hp > 0;
  bot.route = [];
  bot.routeIdx = 0;
  bot.state = 'hold';
  bot.mesh.position.copy(bot.pos);
  bot.mesh.rotation.set(0, yaw, 0);
  return bot;
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  hud.hideBanner();
  shotSafe = true;
  body.pitch = 0;
  if (name === 'start') {
    rounds.resetMatch();
    resetPositions(1);
    rounds.state.phase = 'buy';
    rounds.state.phaseT = BUY_SECONDS;
    body.position.set(0, 0, 16);
    body.yaw = 0;
    settle(20);
    aimAt(new THREE.Vector3(-6, 1.4, -8));
    refreshBuyOpen();
  } else if (name === 'play') {
    rounds.resetMatch();
    resetPositions(1);
    rounds.state.scoreAttack = 1;
    rounds.state.scoreDefend = 1;
    rounds.state.money = 2400;
    rounds.state.phase = 'live';
    rounds.state.phaseT = 83;
    weapons.buy('rifle', 100000);
    weapons.switchTo('rifle');
    body.position.set(0, 0, 7);
    body.yaw = 0;
    placeBot('Vex', 2.5, -4, Math.PI, 40);
    placeBot('Mara', -3.5, -6.5, Math.PI * 0.75);
    placeBot('Koda', 8, 2, Math.PI);
    placeBot('Rook', -4, 9, 0);
    placeBot('Sable', 5, 10, 0);
    settle(20);
    aimAt(new THREE.Vector3(2.5, 1.3, -4));
    shoot(0);
    settle(6);
    aimAt(new THREE.Vector3(2.5, 1.3, -4));
  } else if (name === 'plant') {
    rounds.resetMatch();
    resetPositions(1);
    rounds.state.scoreAttack = 2;
    rounds.state.scoreDefend = 1;
    rounds.state.money = 3100;
    rounds.state.phase = 'planted';
    rounds.state.phaseT = 28;
    rounds.state.plantedSite = world.sites[0];
    effects.spike.visible = true;
    effects.spike.position.copy(world.sites[0].center);
    weapons.buy('rifle', 100000);
    weapons.switchTo('rifle');
    body.position.set(-9, 0, -5);
    body.yaw = 0;
    placeBot('Juno', -12, -8, Math.PI * 0.5);
    placeBot('Pike', -19, -6, Math.PI * 0.25);
    placeBot('Iris', -6, -9, Math.PI);
    settle(20);
    aimAt(new THREE.Vector3(-14, 1.4, -11));
  } else {
    // end: round won, match score 3-1
    rounds.resetMatch();
    resetPositions(1);
    rounds.state.scoreAttack = 3;
    rounds.state.scoreDefend = 1;
    rounds.state.phase = 'roundEnd';
    rounds.state.phaseT = 4;
    rounds.state.roundWinner = 'attack';
    rounds.state.roundReason = 'Site A secured — spike detonated';
    body.position.set(-10, 0, -6);
    body.yaw = 0;
    placeBot('Vex', -14, -10, 0, 0);
    placeBot('Mara', -18, -8, 0, 0);
    placeBot('Rook', -4, -2, 0);
    settle(20);
    aimAt(new THREE.Vector3(-16, 1.2, -12));
    hud.banner('ROUND WON', 'Site A secured — spike detonated — Vanguard 3 : 1 Crimson', 60000);
    hud.killfeed('Vanguard takes round 1 — spike detonated', true);
  }
  hud.setScore(rounds.state.scoreAttack, rounds.state.scoreDefend, rounds.state.round);
  hud.setTimer(rounds.state.phaseT, rounds.state.phase);
  hud.setMoney(rounds.state.money);
  hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve);
  hud.setWeapon(weapons.def().name, weapons.state.grenades);
  hud.setHealth(body.health);
  hud.setAlive((playerAlive ? 1 : 0) + bots.aliveCount('attack'), bots.aliveCount('defend'));
  hud.drawMinimap(world.solids, world.sites, actors, rounds.state.phase === 'planted' ? effects.spike.position : null);
  shotSafe = false;
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetPositions(1);
rounds.startRound();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
