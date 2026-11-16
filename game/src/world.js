// Ember Yard: an original dusk map, built from boxes. 46 x 38 m, three lanes
// (west flank, mid doors, east flank) between a south attacker spawn and two
// spike sites in the north yard. Every box is a collider for movement and a
// surface a bullet stops on. Plain geometry only, no models and no textures.
//
// The map also owns the one collision routine: makeMover resolves a box
// against the colliders one axis at a time, so player.js and bots.js share it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const RADIUS = 0.34;

export function makeMover(colliders) {
  const probe = new THREE.Box3();
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }
  // Move a standing body by velocity*dt, sliding along walls. Returns nothing;
  // mutates pos and zeroes blocked velocity components. y is the feet height.
  function move(pos, vel, dt, height) {
    const nextX = pos.x + vel.x * dt;
    if (!overlaps(nextX, pos.y, pos.z, height, 0.04)) pos.x = nextX;
    else vel.x = 0;
    const nextZ = pos.z + vel.z * dt;
    if (!overlaps(pos.x, pos.y, nextZ, height, 0.04)) pos.z = nextZ;
    else vel.z = 0;
  }
  return { overlaps, move };
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'teal' || name === 'crimson' ? 0.5 : 0.92,
      metalness: 0.04,
    });
  }
  const siteAmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal), transparent: true, opacity: 0.28 });
  const siteBmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.28 });

  const colliders = [];
  const shootables = [];
  const solids = []; // top-down footprints, for the minimap

  function box(width, height, depth, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
      solids.push({ x, z, w: width, d: depth });
    }
    return mesh;
  }

  // Ground and outer walls (46 x 38 m, 5 m walls, open dusk sky).
  box(46.4, 0.4, 38.4, 0, -0.2, 0, 'ground');
  box(0.4, 5, 38.4, -23.2, 2.5, 0, 'surface');
  box(0.4, 5, 38.4, 23.2, 2.5, 0, 'surface');
  box(46.4, 5, 0.4, 0, 2.5, -19.2, 'surface');
  box(46.4, 5, 0.4, 0, 2.5, 19.2, 'surface');

  // Mid wall at z = 0 with a double-door gap (x -2..2): the three lanes.
  box(21, 3.4, 0.6, -12.5, 1.7, 0, 'surface');
  box(21, 3.4, 0.6, 12.5, 1.7, 0, 'surface');
  box(4.6, 0.5, 0.7, 0, 3.65, 0, 'hairline'); // lintel over the doors

  // Site A (west yard): container stack, crates, pillar.
  box(4.4, 2.4, 2.2, -19.5, 1.2, -14.5, 'container');
  box(2.2, 2.4, 2.2, -19.5, 3.6, -14.5, 'crate');
  box(1.6, 1.1, 1.6, -13.5, 0.55, -9.5, 'crate');
  box(1.6, 1.1, 1.6, -18.5, 0.55, -8.0, 'crate');
  box(1.2, 3.4, 1.2, -16, 1.7, -16.5, 'hairline');
  box(3.2, 1.0, 1.2, -11.5, 0.5, -13.5, 'hairline');

  // Site B (east yard): container, crates, pillar.
  box(4.4, 2.4, 2.2, 19.5, 1.2, -14.5, 'container');
  box(1.6, 1.1, 1.6, 13.5, 0.55, -9.5, 'crate');
  box(1.6, 1.1, 1.6, 18.5, 0.55, -8.0, 'crate');
  box(1.2, 3.4, 1.2, 16, 1.7, -16.5, 'hairline');
  box(3.2, 1.0, 1.2, 11.5, 0.5, -13.5, 'hairline');
  box(2.2, 2.2, 2.2, 19.5, 1.1, -10.5, 'crate');

  // Mid-lane cover and flank crates.
  box(1.6, 1.1, 1.6, -0.5, 0.55, 6.5, 'crate');
  box(1.6, 1.1, 1.6, 1.2, 0.55, -5.5, 'crate');
  box(1.2, 3.0, 1.2, 0, 1.5, -9.5, 'hairline');
  box(1.6, 1.1, 1.6, -16, 0.55, 3.5, 'crate');
  box(1.6, 1.1, 1.6, 16, 0.55, 3.5, 'crate');
  box(3.0, 1.0, 1.2, -8.5, 0.5, 12.5, 'hairline');
  box(3.0, 1.0, 1.2, 8.5, 0.5, 12.5, 'hairline');
  box(1.2, 2.6, 1.2, -8, 1.3, -3.5, 'hairline');
  box(1.2, 2.6, 1.2, 8, 1.3, -3.5, 'hairline');
  box(2.4, 0.9, 1.2, -20.5, 0.45, 8.5, 'hairline');
  box(2.4, 0.9, 1.2, 20.5, 0.45, 8.5, 'hairline');

  // Spike sites: glowing ground pads and light beams, so each reads at a glance.
  function sitePad(cx, cz, mat, letter) {
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), mat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(cx, 0.02, cz);
    group.add(pad);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 7, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: mat.color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(cx, 3.5, cz);
    group.add(beam);
    return { letter, center: new THREE.Vector3(cx, 0, cz), half: { x: 4, z: 3.5 } };
  }
  const sites = [sitePad(-16, -12, siteAmat, 'A'), sitePad(16, -12, siteBmat, 'B')];

  // Floodlight poles: tall posts with a warm head; the two real lights are below.
  for (const [x, z] of [[-21, 17], [21, 17], [-21, -17], [21, -17]]) {
    box(0.25, 6.5, 0.25, x, 3.25, z, 'hairline');
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }));
    head.position.set(x, 6.6, z);
    group.add(head);
  }

  // Light: low amber sunset key from the west, cool dusk fill, bright hemisphere
  // so the yard reads at a glance instead of sinking into black.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.sky), new THREE.Color(PALETTE.canvas), 1.9);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffb45e), 3.0);
  sun.position.set(-18, 10, 14);
  sun.target.position.set(4, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x7d8fb5), 0.9);
  fill.position.set(14, 12, -12);
  scene.add(fill);
  const glowA = new THREE.PointLight(new THREE.Color(PALETTE.teal), 12, 16);
  glowA.position.set(-16, 4, -12);
  scene.add(glowA);
  const glowB = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 16);
  glowB.position.set(16, 4, -12);
  scene.add(glowB);

  const spawns = {
    attack: [
      new THREE.Vector3(-4, 0, 16), new THREE.Vector3(0, 0, 17),
      new THREE.Vector3(4, 0, 16), new THREE.Vector3(-8, 0, 15), new THREE.Vector3(8, 0, 15),
    ],
    defend: [
      new THREE.Vector3(-6, 0, -16), new THREE.Vector3(0, 0, -17),
      new THREE.Vector3(6, 0, -16), new THREE.Vector3(-13, 0, -15), new THREE.Vector3(13, 0, -15),
    ],
  };

  // Waypoint routes (x, z pairs) the bots walk. Every leg stays in open lane
  // space so straight-line steering never drags a bot through a wall.
  const routes = {
    toA: [[-4, 15], [-9, 10], [-16, 8], [-18, 2], [-17, -5], [-16, -11]],
    toB: [[4, 15], [9, 10], [16, 8], [18, 2], [17, -5], [16, -11]],
    toMid: [[0, 15], [0, 8], [0, 2], [0, -3], [0, -8]],
    defA: [[-13, -15], [-14, -10], [-12, -14], [-19, -9]],
    defB: [[13, -15], [14, -10], [12, -14], [19, -9]],
    defMid: [[0, -15], [-2, -8], [2, -5], [0, -8]],
    retakeA: [[-6, -16], [-10, -12], [-14, -11], [-16, -12]],
    retakeB: [[6, -16], [10, -12], [14, -11], [16, -12]],
    midToA: [[0, -8], [-6, -9], [-12, -10], [-16, -12]],
    midToB: [[0, -8], [6, -9], [12, -10], [16, -12]],
  };

  return { colliders, shootables, group, sites, spawns, routes, solids, makeMover };
}
