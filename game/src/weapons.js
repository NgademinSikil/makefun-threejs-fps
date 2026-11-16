// Weapons: the buy-menu table and the view model. One weapon object owns the
// numbers; main.js owns the ray and the damage. Spread grows with movement and
// shrinks when crouched or aiming down sights, so stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'Kestrel P9', kind: 'pistol', price: 0, damage: 26, headMult: 3, mag: 12, reserve: 48, gap: 0.18, reload: 1.2, spreadStill: 0.004, spreadMove: 0.03, auto: false, pellets: 1, range: 60 },
  rifle: { id: 'rifle', name: 'Raptor-7 AR', kind: 'rifle', price: 2500, damage: 34, headMult: 3, mag: 25, reserve: 75, gap: 0.11, reload: 2.1, spreadStill: 0.003, spreadMove: 0.032, auto: true, pellets: 1, range: 90 },
  smg: { id: 'smg', name: 'Hornet-9 SMG', kind: 'smg', price: 1400, damage: 22, headMult: 3, mag: 32, reserve: 96, gap: 0.07, reload: 1.7, spreadStill: 0.006, spreadMove: 0.036, auto: true, pellets: 1, range: 55 },
  dmr: { id: 'dmr', name: 'Longbow DMR', kind: 'dmr', price: 3800, damage: 80, headMult: 3, mag: 5, reserve: 15, gap: 0.9, reload: 2.6, spreadStill: 0.0008, spreadMove: 0.05, auto: false, pellets: 1, range: 120 },
  shotgun: { id: 'shotgun', name: 'Breacher-12', kind: 'shotgun', price: 1100, damage: 9, headMult: 2, mag: 6, reserve: 18, gap: 0.85, reload: 2.4, spreadStill: 0.02, spreadMove: 0.045, auto: false, pellets: 8, range: 30 },
};

export const GRENADE_PRICE = 300;
export const GRENADE_DAMAGE = 120;
export const GRENADE_RADIUS = 6.5;

export function createWeaponSet(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.2 });

  // One view model, rebuilt per weapon: receiver + barrel + stock, sized by kind.
  // Dark metal with one amber accent, kept small and low so it never blocks the view.
  const model = new THREE.Group();
  model.scale.setScalar(0.62);
  camera.add(model);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    owned: { pistol: { mag: 12, reserve: 48 } },
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    grenades: 0,
    ads: 0, // 0 hip, 1 aimed
  };

  function buildModel(def) {
    for (const child of [...model.children]) {
      model.remove(child);
      child.geometry.dispose();
    }
    const len = def.kind === 'dmr' ? 0.62 : def.kind === 'shotgun' ? 0.52 : def.kind === 'smg' ? 0.36 : def.kind === 'pistol' ? 0.26 : 0.46;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, len), grip);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len * 0.7), grip);
    barrel.position.set(0, 0.025, -len * 0.75);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), accent);
    sight.position.set(0, 0.075, -len * 0.3);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, len * 0.55);
    model.add(receiver, barrel, sight, stock);
    if (def.kind === 'dmr') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), accent);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.05);
      model.add(scope);
    }
    if (def.kind === 'shotgun') {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.2), accent);
      pump.position.set(0, -0.03, -len * 0.6);
      model.add(pump);
    }
    flash.position.set(0.26, -0.2, -0.5 - len);
    flashLight.position.set(0.26, -0.18, -0.5 - len * 0.6);
  }

  function def() { return WEAPONS[state.current]; }
  function ammo() { return state.owned[state.current]; }

  buildModel(def());

  function step(dt, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.ads += ((aiming ? 1 : 0) - state.ads) * Math.min(1, dt * 10);
    const a = state.ads;
    model.position.set(0.26 * (1 - a), -0.24 + 0.06 * a, -0.45 + state.kick);
    model.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - ammo().mag;
        const take = Math.min(need, ammo().reserve);
        ammo().mag += take;
        ammo().reserve -= take;
      }
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
  }

  return {
    state,
    def,
    ammo,
    step,
    ready() {
      return ammo().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (ammo().mag <= 0) return false;
      ammo().mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      const am = ammo();
      if (state.reloadLeft > 0 || am.mag === d.mag || am.reserve === 0) return false;
      state.reloadLeft = d.reload;
      return true;
    },
    spread(speed, crouching) {
      const d = def();
      const move = Math.min(1, speed / 5.2);
      let s = d.spreadStill + move * d.spreadMove;
      if (crouching) s *= 0.55;
      s *= 1 - state.ads * 0.55;
      return s;
    },
    switchTo(id) {
      if (!state.owned[id] || id === state.current) return false;
      state.current = id;
      state.cooldown = 0.25;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      buildModel(def());
      return true;
    },
    buy(id, money) {
      const d = WEAPONS[id];
      if (!d || state.owned[id] || money < d.price) return -1;
      state.owned[id] = { mag: d.mag, reserve: d.reserve };
      return d.price;
    },
    buyGrenade(money) {
      if (state.grenades >= 2 || money < GRENADE_PRICE) return -1;
      state.grenades += 1;
      return GRENADE_PRICE;
    },
    refillAll() {
      for (const id of Object.keys(state.owned)) {
        state.owned[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}
