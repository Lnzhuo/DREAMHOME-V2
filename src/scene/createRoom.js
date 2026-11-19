import * as THREE from 'three';
import { getRoomBounds } from '../data/scene-operations.js';
import { getPBRMaterial } from './materials.js';

function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...options });
}

function box(width, height, depth, material, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function getWallFrame(wall, bounds) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy);
  const direction = { x: dx / length, y: dy / length };
  const midpoint = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const outward = { x: direction.y, y: -direction.x };
  const towardCenter = (bounds.centerX - midpoint.x) * outward.x + (bounds.centerY - midpoint.y) * outward.y;
  if (towardCenter > 0) {
    outward.x *= -1;
    outward.y *= -1;
  }
  return { direction, outward, length, rotationY: -Math.atan2(dy, dx) };
}

function createArchitecture(roomGroup, floor, room, materials, renderedWalls) {
  const bounds = getRoomBounds(room);
  const { wallMat, trimMat, woodMat, definitions } = materials;

  for (const wall of floor.walls) {
    if (renderedWalls?.has(wall.id)) continue;
    if (wall.roomIds && !wall.roomIds.includes(room.id)) continue;
    renderedWalls?.add(wall.id);
    const frame = getWallFrame(wall, bounds);
    const wallGroup = new THREE.Group();
    wallGroup.name = `wall:${wall.id}`;
    wallGroup.userData.wallId = wall.id;
    const adjacent = floor.rooms.find(r=>r.id!==room.id && wall.roomIds?.includes(r.id));
    wallGroup.userData.partition = Boolean(adjacent);
    const otherWallMaterial = adjacent && getPBRMaterial(definitions?.find(m=>m.id===adjacent.wallMaterialId));
    if (otherWallMaterial && /^#[0-9a-f]{6}$/i.test(adjacent.wallTint)) otherWallMaterial.color.multiply(new THREE.Color(adjacent.wallTint));
    const outsideFace = frame.outward.x * (-frame.direction.y) + frame.outward.y*frame.direction.x > 0 ? 4 : 5;
    wallGroup.userData.outward = { x: frame.outward.x, y: 0, z: frame.outward.y };
    roomGroup.add(wallGroup);
    const thickness = wall.thickness.value;
    const height = wall.height.value;
    const openings = floor.openings.filter((opening) => opening.wallId === wall.id);

    const addSegment = (start, end, bottom, top, segmentThickness, outwardOffset, material) => {
      const length = end - start;
      const segmentHeight = top - bottom;
      if (length <= 0 || segmentHeight <= 0) return;
      const along = (start + end) / 2;
      const x = wall.start.x + frame.direction.x * along + frame.outward.x * outwardOffset;
      const z = wall.start.y + frame.direction.y * along + frame.outward.y * outwardOffset;
      const mesh = box(length, segmentHeight, segmentThickness, material, x, (bottom + top) / 2, z, wallGroup);
      mesh.rotation.y = frame.rotationY;
      mesh.userData.roomId = room.id;
      if (material === wallMat) {
        mesh.userData.surfaceType = 'wall';
        if (adjacent) {
          mesh.material = Array(6).fill(wallMat);
          mesh.material[outsideFace] = otherWallMaterial || wallMat;
          mesh.userData.faceRooms = { [outsideFace]: adjacent.id };
        }
      }
    };

    if (!openings.length) {
      addSegment(-thickness, frame.length + thickness, 0, height, thickness, thickness / 3, wallMat);
    } else {
      let cursor = -thickness;
      for (const opening of [...openings].sort((a, b) => a.offsetFromWallStart - b.offsetFromWallStart)) {
        const start = opening.offsetFromWallStart;
        const end = start + opening.width.value;
        addSegment(cursor, start, 0, height, thickness, thickness / 3, wallMat);
        addSegment(start, end, 0, opening.sillHeight.value, thickness, thickness / 3, wallMat);
        addSegment(start, end, opening.sillHeight.value + opening.height.value, height, thickness, thickness / 3, wallMat);
        cursor = end;
      }
      addSegment(cursor, frame.length + thickness, 0, height, thickness, thickness / 3, wallMat);
    }

    if (floor.baseboard !== false) {
    let trimCursor = 0;
    for (const opening of [...openings].filter(o => o.sillHeight.value < 0.12).sort((a,b) => a.offsetFromWallStart - b.offsetFromWallStart)) {
      addSegment(trimCursor, opening.offsetFromWallStart, 0, 0.12, 0.05, -0.04, trimMat);
      trimCursor = opening.offsetFromWallStart + opening.width.value;
    }
    addSegment(trimCursor, frame.length, 0, 0.12, 0.05, -0.04, trimMat);
    }

    for (const opening of openings) {
      if (opening.type === 'door') {
        const sign = opening.swingDirection === 'outward' ? 1 : -1;
        const hingeX=wall.start.x+frame.direction.x*opening.offsetFromWallStart;
        const hingeZ=wall.start.y+frame.direction.y*opening.offsetFromWallStart;
        const leaf = box(opening.width.value, opening.height.value, 0.035, mat('#dfd5c5'), hingeX+frame.outward.x*sign*opening.width.value/2, opening.height.value/2, hingeZ+frame.outward.y*sign*opening.width.value/2, wallGroup);
        leaf.rotation.y=-Math.atan2(frame.outward.y*sign,frame.outward.x*sign);
        leaf.userData.openingId=opening.id;
        continue;
      }
      if (opening.type !== 'window') continue;
      const frameMat = mat('#3a2b20');
      const centerAlong = opening.offsetFromWallStart + opening.width.value / 2;
      const centerY = opening.sillHeight.value + opening.height.value / 2;
      const addFrameBox = (width, boxHeight, depth, along, y, inward, material = frameMat) => {
        const x = wall.start.x + frame.direction.x * along - frame.outward.x * inward;
        const z = wall.start.y + frame.direction.y * along - frame.outward.y * inward;
        const mesh = box(width, boxHeight, depth, material, x, y, z, wallGroup);
        mesh.rotation.y = frame.rotationY;
        return mesh;
      };

      addFrameBox(opening.width.value, 0.08, 0.08, centerAlong, opening.sillHeight.value + 0.04, 0.05);
      addFrameBox(opening.width.value, 0.08, 0.08, centerAlong, opening.sillHeight.value + opening.height.value - 0.04, 0.05);
      addFrameBox(0.08, opening.height.value, 0.08, centerAlong - opening.width.value / 2 + 0.04, centerY, 0.05);
      addFrameBox(0.08, opening.height.value, 0.08, centerAlong + opening.width.value / 2 - 0.04, centerY, 0.05);
      addFrameBox(0.04, opening.height.value - 0.08, 0.04, centerAlong, centerY, 0.06);
      addFrameBox(opening.width.value - 0.08, 0.04, 0.04, centerAlong, centerY, 0.06);

      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(opening.width.value - 0.08, opening.height.value - 0.12),
        new THREE.MeshPhysicalMaterial({
          color: '#e9f4f7', roughness: .18, metalness: .02, transparent: true,
          opacity: .31, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      pane.position.set(
        wall.start.x + frame.direction.x * centerAlong - frame.outward.x * 0.04,
        centerY,
        wall.start.y + frame.direction.y * centerAlong - frame.outward.y * 0.04,
      );
      pane.rotation.y = frame.rotationY;
      wallGroup.add(pane);

      // A continuous sill meets the bottom frame and projects slightly into the room.
      addFrameBox(opening.width.value + 0.08, 0.045, 0.19, centerAlong, Math.max(0.0225, opening.sillHeight.value - 0.0225), 0.07, woodMat);
    }
  }
}
export function createRoom(scene, sceneDocument, roomId, { includeLights = true, renderedWalls = null } = {}) {
  const floors=sceneDocument.buildings.flatMap(building=>building.floors);
  const floorData = floors.find(floor=>floor.rooms.some(room=>room.id===roomId)) || floors[0];
  const roomData = floorData?.rooms.find((room) => room.id === roomId) || floorData?.rooms[0];
  if (!floorData || !roomData) throw new Error('SceneDocument requires a primary room');
  const bounds = getRoomBounds(roomData);

  const room = new THREE.Group();
  room.name = `room:${roomData.id}`;
  scene.add(room);

  const floorMat = getPBRMaterial(sceneDocument.materials?.find((material) => material.id === roomData.floorMaterialId) || { id: 'fallback-floor', baseColor: '#c8ac89', roughness: 0.7, metalness: 0 });
  const wallMat = getPBRMaterial(sceneDocument.materials?.find((material) => material.id === roomData.wallMaterialId) || { id: 'fallback-wall', baseColor: '#f4f0e9', roughness: 0.95, metalness: 0 });
  if (/^#[0-9a-f]{6}$/i.test(roomData.wallTint)) wallMat.color.multiply(new THREE.Color(roomData.wallTint));
  if (/^#[0-9a-f]{6}$/i.test(roomData.floorTint)) floorMat.color.multiply(new THREE.Color(roomData.floorTint));
  const trimMat = mat('#b4a38c');
  const woodMat = mat('#7a563d', { roughness: 0.6 });

  function surfaceGeometry(opening) {
    const shape = new THREE.Shape();
    roomData.boundary.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, -point.y);
      else shape.lineTo(point.x, -point.y);
    });
    shape.closePath();
    if (opening && roomData.roomType === 'corridor') {
      const { x, z, width, depth } = opening;
      const hole = new THREE.Path();
      hole.moveTo(x, -z);
      hole.lineTo(x, -(z + depth));
      hole.lineTo(x + width, -(z + depth));
      hole.lineTo(x + width, -z);
      hole.closePath();
      shape.holes.push(hole);
    }
    return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  }
  const floorGeometry = surfaceGeometry(floorData.stairOpening);
  const floor = new THREE.Mesh(floorGeometry, floorMat);
  floor.receiveShadow = true;
  floor.name = `floor:${floorData.id}`;
  floor.userData.roomId = roomData.id;
  floor.userData.surfaceType = 'floor';
  room.add(floor);
  if (roomData.ceiling !== false) {
    const ceilingGeometry = surfaceGeometry(floorData.stairs);
    const ceiling = new THREE.Mesh(ceilingGeometry, mat('#f6f4ef', { side: THREE.DoubleSide }));
    ceiling.position.y = roomData.ceilingHeight.value;
    ceiling.name = `ceiling:${roomData.id}`;
    ceiling.userData.walkCeiling = true;
    ceiling.userData.roomId = roomData.id;
    ceiling.visible = false;
    room.add(ceiling);
  }
  if (roomData.roomType === 'living_room' && !roomData.templateId && sceneDocument.projectType === 'room') {
    const darkWood = mat('#4f3729', { roughness: 0.65 });
    const propStartIndex = room.children.length;
    box(3, 0.02, 2.4, mat('#8a4f3d', { roughness: 0.98 }), 0, 0.01, 0.3, room);
    box(2.7, 0.022, 2.1, mat('#a86a4f', { roughness: 0.98 }), 0, 0.012, 0.3, room);

    // 书桌（桌面 y = 0.86，马克杯与台灯放在这里）
    box(2.2, 0.08, 0.9, woodMat, -1.7, 0.82, -2.4, room);
    const legPositions = [
      [-2.72, -2.78],
      [-0.68, -2.78],
      [-2.72, -2.02],
      [-0.68, -2.02],
    ];
    legPositions.forEach(([x, z]) => box(0.07, 0.78, 0.07, darkWood, x, 0.39, z, room));
    box(0.9, 0.05, 0.6, darkWood, -1.7, 0.32, -2.4, room);

    // 书架（中层隔板表面 y = 1.27，笔记本在这里）
    box(0.45, 0.05, 2.0, woodMat, -3.75, 0.645, -0.5, room);
    box(0.45, 0.05, 2.0, woodMat, -3.75, 1.245, -0.5, room);
    box(0.45, 0.05, 2.0, woodMat, -3.75, 1.845, -0.5, room);
    box(0.45, 0.05, 2.0, woodMat, -3.75, 2.4, -0.5, room);
    box(0.45, 2.4, 0.05, darkWood, -3.75, 1.2, -1.5, room);
    box(0.45, 2.4, 0.05, darkWood, -3.75, 1.2, 0.5, room);
    // 书架上的装饰书
    const spineColors = ['#9a5b4a', '#5f7a8c', '#c2a15c', '#6f8a63'];
    spineColors.forEach((c, i) => {
      box(0.16, 0.3 + (i % 2) * 0.05, 0.05, mat(c), -3.72, 1.02, -1.25 + i * 0.09, room);
    });

    // 床（床垫表面 y = 0.68，玩偶在这里）
    box(1.8, 0.35, 2.4, darkWood, 2.7, 0.175, 0.8, room);
    box(1.7, 0.18, 2.3, mat('#e6dbc9', { roughness: 0.95 }), 2.7, 0.59, 0.8, room);
    box(1.72, 0.05, 1.4, mat('#8a5a48', { roughness: 0.98 }), 2.7, 0.7, 1.25, room);
    box(1.0, 0.12, 0.4, mat('#f2e9db', { roughness: 0.95 }), 2.7, 0.72, -0.15, room);
    box(1.8, 0.7, 0.08, darkWood, 2.7, 0.35, -0.44, room);

    // 门口地垫（球鞋放在上面，表面 y = 0.03）
    box(1.0, 0.03, 0.8, mat('#3f332a', { roughness: 0.98 }), 1.5, 0.015, 1.75, room);

    // 墙上的相框
    const frameMat = mat('#3a2b20');
    box(0.9, 0.7, 0.04, frameMat, -1.7, 2.05, -2.96, room);
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.58),
      mat('#c9a06a', { emissive: '#5a3c22', emissiveIntensity: 0.15 }),
    );
    art.position.set(-1.7, 2.05, -2.93);
    room.add(art);
    const props = new THREE.Group();
    props.name = 'legacy-living-room-props';
    for (const child of room.children.slice(propStartIndex)) props.add(child);
    props.scale.set(bounds.width / 8, 1, bounds.depth / 6);
    room.add(props);
  }

  createArchitecture(room, floorData, roomData, { wallMat, trimMat, woodMat, definitions:sceneDocument.materials }, renderedWalls);

  let lights = null;
  if (includeLights) {
    const hemi = new THREE.HemisphereLight('#fff1dc', '#4a3527', 0.85);
    room.add(hemi);

    const fill = new THREE.DirectionalLight('#d7deff', 0.32);
    fill.position.set(-4, 3, 4);
    room.add(fill);

    const dir = new THREE.DirectionalLight('#ffe3bd', 1.25);
    const footprints = floorData.rooms.flatMap(r=>r.boundary);
    const envelope = getRoomBounds({boundary:footprints});
    const span = Math.max(envelope.width,envelope.depth,6);
    dir.position.set(envelope.centerX - span*.72, span*1.12, envelope.centerY + span*.6);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -span;
    dir.shadow.camera.right = span;
    dir.shadow.camera.top = span;
    dir.shadow.camera.bottom = -span;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = span*4;
    dir.shadow.bias = -0.0004;
    dir.target.position.set(envelope.centerX, 0, envelope.centerY);
    room.add(dir);
    room.add(dir.target);

    const lampLight = new THREE.PointLight('#ffcf8a', 0.7, 4.5, 1.6);
    lampLight.position.set(-2.25, 1.25, -2.3);
    room.add(lampLight);

    const endingLight = new THREE.PointLight('#ffc978', 0, 14, 1.2);
    endingLight.position.set(0, 2.5, 0.8);
    room.add(endingLight);
    lights = { hemi, dir, lampLight, endingLight };
  }

  return { room, lights };
}
