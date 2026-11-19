import { assertSceneDocument } from './scene-document.js';

function commit(candidate) {
  candidate.updatedAt = new Date().toISOString();
  return assertSceneDocument(candidate);
}

export function findRoomContext(sceneDocument, roomId) {
  for (const building of sceneDocument.buildings) {
    for (const floor of building.floors) {
      const room = floor.rooms.find((entry) => entry.id === roomId);
      if (room) return { building, floor, room };
    }
  }
  return null;
}

export function getRoomBounds(room) {
  const xs = room.boundary.map((point) => point.x);
  const ys = room.boundary.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    depth: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

export function addPlacement(sceneDocument, placement) {
  const candidate = structuredClone(sceneDocument);
  candidate.placements.push(structuredClone(placement));
  return commit(candidate);
}

export function removePlacement(sceneDocument, placementId) {
  const candidate = structuredClone(sceneDocument);
  const index = candidate.placements.findIndex((entry) => entry.id === placementId);
  if (index < 0) throw new Error(`Unknown placement ${placementId}`);
  candidate.placements.splice(index, 1);
  return commit(candidate);
}

export function updatePlacementTransform(sceneDocument, placementId, transform) {
  const candidate = structuredClone(sceneDocument);
  const placement = candidate.placements.find((entry) => entry.id === placementId);
  if (!placement) throw new Error(`Unknown placement ${placementId}`);
  for (const key of ['position', 'rotation', 'scale']) {
    if (transform[key] !== undefined) placement[key] = { ...placement[key], ...transform[key] };
  }
  return commit(candidate);
}

export function updateRoomDimensions(sceneDocument, roomId, dimensions, source = 'estimated') {
  const { width, depth, height } = dimensions;
  if (![width, depth, height].every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)) {
    throw new Error('Room width, depth and height must be positive finite numbers');
  }

  const candidate = structuredClone(sceneDocument);
  const context = findRoomContext(candidate, roomId);
  if (!context) throw new Error(`Unknown room ${roomId}`);
  const { floor, room } = context;
  const bounds = getRoomBounds(room);
  const nextMinX = bounds.centerX - width / 2;
  const nextMinY = bounds.centerY - depth / 2;
  const scaleX = width / bounds.width;
  const scaleY = depth / bounds.depth;
  const mapPoint = (point) => ({
    x: nextMinX + (point.x - bounds.minX) * scaleX,
    y: nextMinY + (point.y - bounds.minY) * scaleY,
  });

  room.boundary = room.boundary.map(mapPoint);
  room.ceilingHeight = { value: height, unit: 'm', source };
  room.dimensionSource = source;
  floor.floorHeight = height;

  const wallLengthRatios = new Map();
  for (const wall of floor.walls) {
    const oldLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    wall.start = mapPoint(wall.start);
    wall.end = mapPoint(wall.end);
    const newLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    wallLengthRatios.set(wall.id, oldLength > 0 ? newLength / oldLength : 1);
    wall.height = { value: height, unit: 'm', source };
  }
  for (const opening of floor.openings) {
    opening.offsetFromWallStart *= wallLengthRatios.get(opening.wallId) || 1;
  }
  return commit(candidate);
}
