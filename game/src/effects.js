// Pooled effects: tracers, impact sparks and grenades. Pools are allocated once
// and reused, so the hot loop makes no new objects per frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 10;
const SPARK_POOL = 12;

export function createEffects(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a), transparent: true, opacity: 0.95 });
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  let sparkNext = 0;

  // The spike: a small amber device with a blinking light, planted on a site.
  const spike = new THREE.Group();
  const spikeBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.34),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.4 }),
  );
  spikeBody.position.y = 0.11;
  const spikeLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3b30) }),
  );
  spikeLight.position.y = 0.28;
  spike.add(spikeBody, spikeLight);
  spike.visible = false;
  scene.add(spike);

  // Explosion flash: one reusable sphere + light.
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa030), transparent: true, opacity: 0, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(0xff8030), 0, 18);
  scene.add(boomLight);

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function tracer(from, to) {
    const t = tracers[tracerNext];
    tracerNext = (tracerNext + 1) % TRACER_POOL;
    tmpA.copy(to).sub(from);
    const len = tmpA.length() || 0.001;
    t.mesh.position.copy(from).addScaledVector(tmpA, 0.5);
    t.mesh.scale.set(1, 1, len);
    t.mesh.lookAt(to);
    t.mesh.visible = true;
    t.life = 0.07;
  }

  function spark(at, count) {
    for (let i = 0; i < count; i += 1) {
      const s = sparks[sparkNext];
      sparkNext = (sparkNext + 1) % SPARK_POOL;
      s.mesh.position.copy(at);
      s.vel.set(Math.random() * 2 - 1, Math.random() * 1.5, Math.random() * 2 - 1).multiplyScalar(2.5);
      s.mesh.visible = true;
      s.life = 0.25;
    }
  }

  function explode(at) {
    boom.position.copy(at);
    boom.scale.setScalar(0.5);
    boom.visible = true;
    boom.material.opacity = 0.9;
    boomLight.position.copy(at);
    boomLight.position.y += 0.5;
    boomLight.intensity = 60;
    spark(at, 6);
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.y -= 6 * dt;
      if (s.life <= 0) s.mesh.visible = false;
    }
    if (boom.visible) {
      boom.scale.addScalar(dt * 22);
      boom.material.opacity = Math.max(0, boom.material.opacity - dt * 3.2);
      boomLight.intensity = Math.max(0, boomLight.intensity - dt * 260);
      if (boom.material.opacity <= 0) boom.visible = false;
    }
  }

  // One grenade at a time per thrower is enough for this game; main.js owns a
  // small list of live grenades built from this factory.
  function makeGrenade(origin, velocity) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.crimson), roughness: 0.5, metalness: 0.3 }),
    );
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    return {
      mesh,
      vel: velocity.clone(),
      fuse: 2.4,
      alive: true,
      blink: 0,
    };
  }

  function removeGrenade(g) {
    scene.remove(g.mesh);
    g.mesh.geometry.dispose();
  }

  return {
    tracer, spark, explode, step, makeGrenade, removeGrenade, spike, spikeLight, tmpA, tmpB,
  };
}
