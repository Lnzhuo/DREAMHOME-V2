import * as THREE from 'three';

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.06,
    ...options,
  });
}

function mesh(geometry, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function mug(color) {
  const g = new THREE.Group();
  const body = material(color, { roughness: 0.35 });
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.062, 0.12, 28), body, 0, 0.06, 0));
  g.add(
    mesh(
      new THREE.CylinderGeometry(0.066, 0.066, 0.004, 28),
      material('#4a2c1c', { roughness: 0.2 }),
      0,
      0.117,
      0,
    ),
  );
  const handle = mesh(new THREE.TorusGeometry(0.042, 0.011, 10, 24), body, 0.085, 0.062, 0);
  handle.rotation.y = Math.PI / 2;
  g.add(handle);
  return g;
}

function lamp(color) {
  const g = new THREE.Group();
  const metal = material('#5c4a3a', { metalness: 0.45, roughness: 0.4 });
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.025, 28), metal, 0, 0.0125, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 12), metal, 0, 0.17, 0));
  const shade = mesh(
    new THREE.ConeGeometry(0.12, 0.13, 28, 1, true),
    material(color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25 }),
    0,
    0.36,
    0,
  );
  g.add(shade);
  g.add(
    mesh(
      new THREE.SphereGeometry(0.032, 16, 12),
      material('#fff3d0', { emissive: '#ffdf9e', emissiveIntensity: 1.4 }),
      0,
      0.32,
      0,
    ),
  );
  return g;
}

function book(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.045, 0.3), material(color), 0, 0.0225, 0));
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.032, 0.285), material('#f3ead9'), 0.008, 0.024, 0));
  g.add(mesh(new THREE.BoxGeometry(0.02, 0.002, 0.12), material('#c9563c'), 0.03, 0.046, 0.05));
  return g;
}

function plant(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.085, 0.062, 0.12, 24), material('#b26a4a'), 0, 0.06, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.012, 24), material('#3a2a20'), 0, 0.118, 0));
  const leafMat = material(color, { roughness: 0.75 });
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    const leaf = mesh(new THREE.ConeGeometry(0.028, 0.2 + (i % 3) * 0.04, 8), leafMat);
    leaf.position.set(Math.cos(angle) * 0.035, 0.22, Math.sin(angle) * 0.035);
    leaf.rotation.set(Math.sin(angle) * 0.45, 0, -Math.cos(angle) * 0.45);
    g.add(leaf);
  }
  return g;
}

function plush(color) {
  const g = new THREE.Group();
  const fur = material(color, { roughness: 0.95 });
  const body = mesh(new THREE.SphereGeometry(0.115, 24, 18), fur, 0, 0.115, 0);
  body.scale.set(1, 1.05, 0.9);
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.085, 24, 18), fur, 0, 0.26, 0));
  g.add(mesh(new THREE.SphereGeometry(0.036, 14, 10), fur, -0.055, 0.325, 0));
  g.add(mesh(new THREE.SphereGeometry(0.036, 14, 10), fur, 0.055, 0.325, 0));
  g.add(mesh(new THREE.SphereGeometry(0.045, 14, 10), fur, -0.115, 0.13, 0.01));
  g.add(mesh(new THREE.SphereGeometry(0.045, 14, 10), fur, 0.115, 0.13, 0.01));
  const eye = material('#2b2019', { roughness: 0.3 });
  g.add(mesh(new THREE.SphereGeometry(0.009, 8, 8), eye, -0.03, 0.27, 0.075));
  g.add(mesh(new THREE.SphereGeometry(0.009, 8, 8), eye, 0.03, 0.27, 0.075));
  g.add(mesh(new THREE.SphereGeometry(0.04, 14, 10), material('#f3e3d3'), 0, 0.235, 0.062));
  return g;
}

function sneaker(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.27, 0.028, 0.105), material('#f0ece2'), 0, 0.014, 0));
  const upper = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.095), material(color), -0.02, 0.058, 0);
  upper.rotation.z = 0.06;
  g.add(upper);
  g.add(mesh(new THREE.SphereGeometry(0.052, 16, 12), material(color), 0.1, 0.045, 0));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.075, 0.095), material(color), -0.115, 0.065, 0));
  for (let i = 0; i < 3; i += 1) {
    g.add(mesh(new THREE.BoxGeometry(0.008, 0.004, 0.08), material('#f0ece2'), -0.03 + i * 0.03, 0.09, 0));
  }
  return g;
}

export function createPlaceholder(kind, color) {
  const factories = { mug, lamp, book, plant, plush, sneaker };
  const factory = factories[kind] || factories.mug;
  const group = factory(color);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}
