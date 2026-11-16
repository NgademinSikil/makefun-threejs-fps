// Bots: nine teammates and opponents with one job each in the loop — see,
// hear, move along routes, hold angles, shoot back in bursts, and play the
// spike objective. No bot ever teleports: all movement goes through the
// world's shared collision mover, and all sight goes through a real raycast.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeMover } from './world.js';

const NAMES_ATTACK = ['Rook', 'Sable', 'Iris', 'Fenn'];
const NAMES_DEFEND = ['Vex', 'Mara', 'Koda', 'Juno', 'Pike'];
const EYE = 1.55;
const VIEW_DIST = 40;
const VIEW_HALF_ANGLE = 1.05; // ~60 degrees
const HEAR_DIST = 26;
const BOT_DAMAGE = 30;
const BOT_HEAD_DAMAGE = 90;

const tmpDir = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpChest = new THREE.Vector3();

export function createBots(scene, world, random, hooks) {
  const mover = makeMover(world.colliders);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const group = new THREE.Group();
  scene.add(group);

  const teamMat = {
    attack: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.6, metalness: 0.05 }),
    defend: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crimson), roughness: 0.6, metalness: 0.05 }),
  };
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.18, 0.62, 0.2);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  const bots = [];
  const hitMeshes = [];

  function buildBot(id, name, team, skill) {
    const mesh = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, teamMat[team]);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.58;
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.13, 0.31, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.13, 0.31, 0);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.22, 1.1, -0.3);
    mesh.add(torso, head, legL, legR, gun);
    mesh.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(mesh);
    const bot = {
      id, name, team, skill,
      mesh, torso, head,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      yaw: 0, hp: 100, alive: true,
      route: [], routeIdx: 0, holdUntil: 0,
      state: 'route', // route | hold | engage | investigate | plant | defuse | retake
      target: null, lastKnown: new THREE.Vector3(), lastKnownAt: -99,
      scanT: random() * 0.2, reaction: 0, burstLeft: 0, burstT: 0, pauseT: 0,
      strafeDir: 1, strafeT: 0,
      progress: 0, // plant/defuse progress 0..1
      fall: 0, walkPhase: 0,
      isCarrier: false, site: null,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) buildBot(`ally${i}`, NAMES_ATTACK[i], 'attack', 0.55 + random() * 0.2);
  for (let i = 0; i < 5; i += 1) buildBot(`enemy${i}`, NAMES_DEFEND[i], 'defend', 0.5 + random() * 0.25);

  function routePoints(names) {
    const pts = [];
    for (const name of names) {
      for (const [x, z] of world.routes[name]) pts.push(new THREE.Vector3(x, 0, z));
    }
    return pts;
  }

  function assignRound(plan) {
    // plan: { attackSite: 'A'|'B', attackSplit: ['toA','toB','toMid',...] }
    let ai = 0;
    let di = 0;
    for (const bot of bots) {
      bot.hp = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.progress = 0;
      bot.target = null;
      bot.state = 'route';
      bot.mesh.rotation.set(0, 0, 0);
      bot.mesh.visible = true;
      if (bot.team === 'attack') {
        const spawn = world.spawns.attack[ai % world.spawns.attack.length];
        bot.pos.copy(spawn);
        bot.yaw = 0; // face north, toward the sites
        const routeName = plan.attackSplit[ai % plan.attackSplit.length];
        bot.route = routePoints([routeName]);
        bot.site = routeName === 'toA' ? world.sites[0] : routeName === 'toB' ? world.sites[1] : null;
        bot.isCarrier = false;
        ai += 1;
      } else {
        const spawn = world.spawns.defend[di % world.spawns.defend.length];
        bot.pos.copy(spawn);
        bot.yaw = Math.PI; // face south, toward attackers
        const holdName = plan.defendSplit[di % plan.defendSplit.length];
        bot.route = routePoints([holdName]);
        bot.site = holdName === 'defA' ? world.sites[0] : holdName === 'defB' ? world.sites[1] : null;
        bot.isCarrier = false;
        di += 1;
      }
      bot.routeIdx = 0;
      bot.mesh.position.copy(bot.pos);
      bot.mesh.rotation.y = bot.yaw;
    }
  }

  function hasLineOfSight(from, to) {
    tmpDir.copy(to).sub(from);
    const dist = tmpDir.length();
    if (dist < 0.01) return true;
    tmpDir.normalize();
    raycaster.set(from, tmpDir);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance > dist - 0.4;
  }

  function chestOf(actor, out) {
    out.copy(actor.pos);
    out.y = (actor.pos.y || 0) + (actor.crouching ? 1.0 : 1.25);
    return out;
  }

  function scan(bot, actors, now) {
    let best = null;
    let bestDist = Infinity;
    tmpEye.copy(bot.pos);
    tmpEye.y += EYE;
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    for (const actor of actors) {
      if (!actor.alive || actor.team === bot.team) continue;
      chestOf(actor, tmpTarget);
      tmpDir.copy(tmpTarget).sub(tmpEye);
      const dist = tmpDir.length();
      if (dist > VIEW_DIST || dist < 0.5) continue;
      tmpDir.normalize();
      if (tmpDir.x * fx + tmpDir.z * fz < Math.cos(VIEW_HALF_ANGLE)) continue;
      if (!hasLineOfSight(tmpEye, tmpTarget)) continue;
      if (dist < bestDist) { bestDist = dist; best = actor; }
    }
    if (best) {
      bot.target = best;
      chestOf(best, bot.lastKnown);
      bot.lastKnownAt = now;
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reaction = 0.35 + random() * 0.35 + (1 - bot.skill) * 0.25;
        bot.burstLeft = 0;
        bot.pauseT = 0;
      }
    } else if (bot.target && now - bot.lastKnownAt > 2.5) {
      bot.target = null;
      if (bot.state === 'engage') bot.state = bot.routeIdx < bot.route.length ? 'route' : 'hold';
    }
  }

  function faceToward(bot, x, z, dt) {
    const want = Math.atan2(-(x - bot.pos.x), -(z - bot.pos.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
  }

  function moveToward(bot, x, z, speed, dt) {
    tmpDir.set(x - bot.pos.x, 0, z - bot.pos.z);
    const dist = tmpDir.length();
    if (dist < 0.05) { bot.vel.set(0, 0, 0); return true; }
    tmpDir.normalize();
    bot.vel.set(tmpDir.x * speed, 0, tmpDir.z * speed);
    mover.move(bot.pos, bot.vel, dt, 1.72);
    faceToward(bot, x, z, dt);
    bot.walkPhase += dt * speed * 2.2;
    return dist < 0.7;
  }

  function fireAt(bot, actor, dt) {
    if (bot.pauseT > 0) { bot.pauseT -= dt; return; }
    if (bot.burstLeft <= 0) {
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.pauseT = 0;
    }
    bot.burstT -= dt;
    if (bot.burstT > 0) return;
    bot.burstT = 0.13;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.pauseT = 0.5 + random() * 0.5;
    chestOf(actor, tmpChest);
    const dist = tmpEye.copy(bot.pos).setY(bot.pos.y + EYE).distanceTo(tmpChest);
    const targetSpeed = actor.vel ? Math.hypot(actor.vel.x, actor.vel.z) : 0;
    let chance = 0.52 - dist * 0.007 - targetSpeed * 0.035;
    if (actor.crouching) chance -= 0.06;
    chance *= 0.7 + bot.skill * 0.6;
    chance = Math.max(0.06, Math.min(0.62, chance));
    const hit = random() < chance;
    const isHead = hit && random() < 0.12;
    tmpEye.copy(bot.pos);
    tmpEye.y += EYE;
    if (hit) {
      hooks.tracer(tmpEye, tmpChest);
      hooks.damageActor(actor, isHead ? BOT_HEAD_DAMAGE : BOT_DAMAGE, isHead, bot);
    } else {
      tmpTarget.copy(tmpChest);
      tmpTarget.x += (random() * 2 - 1) * 1.6;
      tmpTarget.y += (random() * 2 - 1) * 1.0;
      tmpTarget.z += (random() * 2 - 1) * 1.6;
      hooks.tracer(tmpEye, tmpTarget);
    }
    hooks.sound('distant');
  }

  function inSite(bot, site) {
    return Math.abs(bot.pos.x - site.center.x) <= site.half.x && Math.abs(bot.pos.z - site.center.z) <= site.half.z;
  }

  function step(dt, actors, ctx, now) {
    // ctx: { phase, plantedSite, spikePos }
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.mesh.rotation.x = -bot.fall * 1.45;
        continue;
      }
      bot.scanT -= dt;
      if (bot.scanT <= 0) {
        bot.scanT = 0.14 + random() * 0.08;
        scan(bot, actors, now);
      }

      // Objective overrides: plant / defuse / retake.
      if (ctx.phase === 'live' && bot.team === 'attack' && bot.isCarrier && bot.site && inSite(bot, bot.site)) {
        const defendersNear = bots.some((b) => b.alive && b.team === 'defend' && b.pos.distanceTo(bot.pos) < 13);
        if (!defendersNear && !bot.target) {
          bot.state = 'plant';
          bot.progress += dt / 3.5;
          if (bot.progress >= 1) {
            bot.progress = 0;
            bot.state = 'hold';
            hooks.planted(bot, bot.site);
          }
          bot.mesh.position.copy(bot.pos);
          bot.mesh.rotation.y = bot.yaw;
          continue;
        }
        bot.progress = Math.max(0, bot.progress - dt / 2);
      }
      if (ctx.phase === 'planted' && bot.team === 'defend' && ctx.plantedSite) {
        const d = bot.pos.distanceTo(ctx.spikePos);
        if (d < 2.2 && !bot.target) {
          bot.state = 'defuse';
          bot.progress += dt / 5;
          if (bot.progress >= 1) {
            bot.progress = 0;
            bot.state = 'hold';
            hooks.defused(bot);
          }
          bot.mesh.position.copy(bot.pos);
          bot.mesh.rotation.y = bot.yaw;
          continue;
        }
        bot.progress = Math.max(0, bot.progress - dt / 2);
        if (bot.state !== 'retake') {
          bot.state = 'retake';
          bot.route = routePoints([ctx.plantedSite.letter === 'A' ? 'retakeA' : 'retakeB']);
          bot.routeIdx = 0;
        }
      }

      if (bot.target && bot.target.alive) {
        // Engage: strafe, face the target, fire in bursts.
        bot.state = 'engage';
        chestOf(bot.target, tmpChest);
        faceToward(bot, tmpChest.x, tmpChest.z, dt);
        bot.strafeT -= dt;
        if (bot.strafeT <= 0) {
          bot.strafeT = 0.7 + random() * 0.7;
          bot.strafeDir = random() < 0.5 ? -1 : 1;
        }
        tmpDir.set(Math.cos(bot.yaw) * bot.strafeDir, 0, -Math.sin(bot.yaw) * bot.strafeDir);
        bot.vel.copy(tmpDir).multiplyScalar(1.6);
        mover.move(bot.pos, bot.vel, dt, 1.72);
        bot.reaction -= dt;
        if (bot.reaction <= 0) fireAt(bot, bot.target, dt);
      } else if (bot.state === 'investigate' && bot.route.length) {
        const wp = bot.route[bot.routeIdx];
        if (moveToward(bot, wp.x, wp.z, 4.2, dt)) {
          bot.routeIdx += 1;
          if (bot.routeIdx >= bot.route.length) bot.state = 'hold';
        }
      } else if (bot.routeIdx < bot.route.length) {
        const wp = bot.route[bot.routeIdx];
        const speed = ctx.phase === 'planted' && bot.team === 'defend' ? 4.6 : 3.4;
        if (moveToward(bot, wp.x, wp.z, speed, dt)) {
          bot.routeIdx += 1;
          if (bot.routeIdx >= bot.route.length) {
            bot.state = 'hold';
            bot.holdUntil = now + 2 + random() * 3;
          }
        }
      } else {
        // Hold: slow scan, small shuffle to a nearby angle.
        bot.state = 'hold';
        bot.yaw += Math.sin(now * 0.5 + bot.id.length) * 0.12 * dt;
      }
      bot.mesh.position.copy(bot.pos);
      bot.mesh.rotation.y = bot.yaw;
    }
  }

  function hearShot(pos, team) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team || bot.target) continue;
      if (bot.pos.distanceTo(pos) > HEAR_DIST) continue;
      if (bot.state === 'plant' || bot.state === 'defuse') continue;
      bot.state = 'investigate';
      bot.route = [new THREE.Vector3(pos.x + (random() * 4 - 2), 0, pos.z + (random() * 4 - 2))];
      bot.routeIdx = 0;
    }
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp > 0) return false;
    bot.hp = 0;
    bot.alive = false;
    bot.fall = 0;
    bot.target = null;
    return true;
  }

  function reset(plan) {
    assignRound(plan);
  }

  return {
    list: bots,
    hitMeshes,
    step,
    hearShot,
    damage,
    reset,
    aliveCount(team) { return bots.filter((b) => b.alive && b.team === team).length; },
    carrier() { return bots.find((b) => b.isCarrier && b.alive) || null; },
    setCarrier(bot) {
      for (const b of bots) b.isCarrier = false;
      if (bot) bot.isCarrier = true;
    },
  };
}
