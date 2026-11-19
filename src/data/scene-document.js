export const DIMENSION_SOURCES = ['measured', 'plan_label', 'predicted', 'estimated', 'unknown'];
export const ASSET_SOURCES = ['lux3d_image', 'lux3d_text', 'user_upload', 'licensed_library', 'procedural'];

const PROJECT_TYPES = new Set(['room', 'residence', 'villa', 'outdoor']);
const STRUCTURAL_TYPES = new Set(['partition', 'exterior', 'unknown']);
const OPENING_TYPES = new Set(['door', 'window', 'archway']);
const LICENSE_STATUSES = new Set(['verified', 'user_owned', 'unknown', 'restricted', 'provider_terms_check']);
const OUTDOOR_TYPES = new Set(['garden', 'pool', 'terrace', 'driveway', 'lawn', 'courtyard', 'garage', 'other']);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(errors, path, message) {
  errors.push({ path, message });
}

function requiredString(value, path, errors) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(errors, path, 'Expected a non-empty string');
    return false;
  }
  return true;
}

function requiredArray(value, path, errors) {
  if (!Array.isArray(value)) {
    fail(errors, path, 'Expected an array');
    return [];
  }
  return value;
}

function registerId(entity, path, ids, errors) {
  if (!requiredString(entity?.id, `${path}.id`, errors)) return;
  if (ids.has(entity.id)) {
    fail(errors, `${path}.id`, `Duplicate id; first declared at ${ids.get(entity.id)}`);
    return;
  }
  ids.set(entity.id, path);
}

function validateTimestamp(value, path, errors) {
  if (requiredString(value, path, errors) && Number.isNaN(Date.parse(value))) {
    fail(errors, path, 'Expected a valid date-time string');
  }
}

function validateVec2(value, path, errors) {
  if (!isRecord(value)) {
    fail(errors, path, 'Expected a Vec2 object');
    return false;
  }
  let valid = true;
  for (const key of ['x', 'y']) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
      fail(errors, `${path}.${key}`, 'Expected a finite number');
      valid = false;
    }
  }
  return valid;
}

function validateVec3(value, path, errors, { positive = false } = {}) {
  if (!isRecord(value)) {
    fail(errors, path, 'Expected a Vec3 object');
    return false;
  }
  let valid = true;
  for (const key of ['x', 'y', 'z']) {
    const component = value[key];
    if (typeof component !== 'number' || !Number.isFinite(component) || (positive && component <= 0)) {
      fail(errors, `${path}.${key}`, positive ? 'Expected a number greater than zero' : 'Expected a finite number');
      valid = false;
    }
  }
  return valid;
}

function validatePolygon(value, path, errors) {
  const points = requiredArray(value, path, errors);
  if (points.length < 3) fail(errors, path, 'Expected at least three points');
  let valid = points.length >= 3;
  points.forEach((point, index) => {
    if (!validateVec2(point, `${path}[${index}]`, errors)) valid = false;
  });
  if (valid) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    if (Math.abs(area) < 1e-8) fail(errors, path, 'Expected a polygon with non-zero area');
  }
}

function validateDimension(value, path, errors, { allowUnknownNull = false, allowZero = false } = {}) {
  if (!isRecord(value)) {
    fail(errors, path, 'Expected a Dimension object');
    return;
  }
  if (value.unit !== 'm') fail(errors, `${path}.unit`, 'Expected unit m');
  if (!DIMENSION_SOURCES.includes(value.source)) {
    fail(errors, `${path}.source`, 'Unknown dimension source');
  }
  if (value.source === 'unknown') {
    if (!allowUnknownNull || value.value !== null) {
      fail(errors, `${path}.value`, 'Unknown dimensions must use null');
    }
  } else if (
    typeof value.value !== 'number' ||
    !Number.isFinite(value.value) ||
    (allowZero ? value.value < 0 : value.value <= 0)
  ) {
    fail(errors, `${path}.value`, allowZero ? 'Expected a non-negative number' : 'Expected a number greater than zero');
  }
  if (
    value.confidence !== undefined &&
    (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)
  ) {
    fail(errors, `${path}.confidence`, 'Expected a number between 0 and 1');
  }
}

function validateAsset(asset, path, ids, assetIds, errors) {
  if (!isRecord(asset)) {
    fail(errors, path, 'Expected an Asset object');
    return;
  }
  registerId(asset, path, ids, errors);
  if (asset.id) assetIds.add(asset.id);
  requiredString(asset.name, `${path}.name`, errors);
  requiredString(asset.category, `${path}.category`, errors);
  if (!ASSET_SOURCES.includes(asset.source)) fail(errors, `${path}.source`, 'Unknown asset source');
  if (!LICENSE_STATUSES.has(asset.licenseStatus)) fail(errors, `${path}.licenseStatus`, 'Unknown license status');
  validateTimestamp(asset.createdAt, `${path}.createdAt`, errors);

  if (asset.source === 'procedural') {
    if (asset.modelUrl !== null) fail(errors, `${path}.modelUrl`, 'Procedural assets must not claim a model URL');
    if (!isRecord(asset.procedural)) {
      fail(errors, `${path}.procedural`, 'Procedural assets require procedural metadata');
    } else {
      requiredString(asset.procedural.kind, `${path}.procedural.kind`, errors);
      if (typeof asset.procedural.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(asset.procedural.color)) {
        fail(errors, `${path}.procedural.color`, 'Expected a six-digit hex color');
      }
    }
  } else {
    requiredString(asset.modelUrl, `${path}.modelUrl`, errors);
  }

  if (asset.source === 'lux3d_image' || asset.source === 'lux3d_text') {
    if (requiredString(asset.providerTaskId, `${path}.providerTaskId`, errors)) {
      if (/REPLACE|PLACEHOLDER|your_api/i.test(asset.providerTaskId)) {
        fail(errors, `${path}.providerTaskId`, 'Placeholder task ids are not valid Lux3D evidence');
      }
    }
    if (asset.provider !== 'aholo-lux3d') fail(errors, `${path}.provider`, 'Lux3D assets must identify aholo-lux3d');
  }

  if (!isRecord(asset.dimensions)) {
    fail(errors, `${path}.dimensions`, 'Expected width, depth and height dimensions');
  } else {
    for (const key of ['width', 'depth', 'height']) {
      validateDimension(asset.dimensions[key], `${path}.dimensions.${key}`, errors, { allowUnknownNull: true });
    }
  }
  if (asset.sourceImageIds !== undefined) {
    requiredArray(asset.sourceImageIds, `${path}.sourceImageIds`, errors).forEach((id, index) => {
      requiredString(id, `${path}.sourceImageIds[${index}]`, errors);
    });
  }
}

function validateWall(wall, path, floorId, ids, errors) {
  if (!isRecord(wall)) {
    fail(errors, path, 'Expected a Wall object');
    return { wall: null, length: null };
  }
  registerId(wall, path, ids, errors);
  if (wall.floorId !== floorId) fail(errors, `${path}.floorId`, 'Wall must reference its containing floor');
  const startValid = validateVec2(wall.start, `${path}.start`, errors);
  const endValid = validateVec2(wall.end, `${path}.end`, errors);
  validateDimension(wall.thickness, `${path}.thickness`, errors);
  validateDimension(wall.height, `${path}.height`, errors);
  if (!STRUCTURAL_TYPES.has(wall.structuralType)) fail(errors, `${path}.structuralType`, 'Unknown structural type');
  let length = null;
  if (startValid && endValid) {
    length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (length <= 0) fail(errors, path, 'Wall start and end must differ');
  }
  return { wall, length };
}

function validateOpening(opening, path, walls, ids, errors) {
  if (!isRecord(opening)) {
    fail(errors, path, 'Expected an Opening object');
    return;
  }
  registerId(opening, path, ids, errors);
  if (!OPENING_TYPES.has(opening.type)) fail(errors, `${path}.type`, 'Unknown opening type');
  if (!Number.isFinite(opening.offsetFromWallStart) || opening.offsetFromWallStart < 0) {
    fail(errors, `${path}.offsetFromWallStart`, 'Expected a non-negative offset in meters');
  }
  validateDimension(opening.width, `${path}.width`, errors);
  validateDimension(opening.height, `${path}.height`, errors);
  validateDimension(opening.sillHeight, `${path}.sillHeight`, errors, { allowZero: true });

  const wallEntry = walls.get(opening.wallId);
  if (!wallEntry) {
    fail(errors, `${path}.wallId`, 'Opening must reference a wall on the same floor');
    return;
  }
  if (wallEntry.length !== null && typeof opening.width?.value === 'number') {
    if (opening.offsetFromWallStart + opening.width.value > wallEntry.length) {
      fail(errors, path, 'Opening exceeds its wall length');
    }
  }
  if (typeof opening.sillHeight?.value === 'number' && typeof opening.height?.value === 'number') {
    if (opening.sillHeight.value + opening.height.value > wallEntry.wall.height?.value) {
      fail(errors, path, 'Opening exceeds its wall height');
    }
  }
}

function validateStair(floor, key, path, errors) {
  const item = floor[key];
  if (item === undefined) return;
  if (!isRecord(item)) return fail(errors, path, 'Expected staircase geometry');
  for (const field of ['x', 'z', 'width', 'depth']) {
    if (!Number.isFinite(item[field])) return fail(errors, path + '.' + field, 'Expected a finite number');
  }
  if (item.width < 0.6 || item.width > 1.2 || item.depth < 2) {
    fail(errors, path, 'Stair width must be 0.6–1.2 m and depth at least 2 m');
  }
  if (key === 'stairs' && (!Number.isInteger(item.steps) || item.steps < 8 || item.steps > 24)) {
    fail(errors, path + '.steps', 'Expected 8–24 steps');
  }
  const corridor = Array.isArray(floor.rooms) && floor.rooms.find(room => room?.roomType === 'corridor');
  if (!Array.isArray(corridor?.boundary) || !corridor.boundary.length) return fail(errors, path, 'Staircase requires a corridor');
  if (!corridor.boundary.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of corridor.boundary) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.y); maxZ = Math.max(maxZ, point.y);
  }
  if (item.x < minX || item.x + item.width > maxX || item.z < minZ || item.z + item.depth > maxZ) {
    fail(errors, path, 'Staircase must fit inside the corridor');
  }
}

function validateReference(ref, path, errors) {
  if (!isRecord(ref)) return fail(errors, path, 'Expected a floor reference image');
  requiredString(ref.name, path + '.name', errors);
  requiredString(ref.blobId, path + '.blobId', errors);
  if (!['image/png','image/jpeg','image/webp'].includes(ref.type)) fail(errors, path + '.type', 'Unsupported image format');
  if (!Number.isFinite(ref.width) || ref.width < 0.2 || ref.width > 300) fail(errors, path + '.width', 'Expected 0.2–300 m');
  if (!Number.isFinite(ref.ratio) || ref.ratio <= 0 || !Number.isFinite(ref.width * ref.ratio)) {
    fail(errors, path + '.ratio', 'Expected a finite positive image aspect ratio');
  }
}

function validateBuilding(building, path, ids, roomIds, floorIds, errors) {
  if (!isRecord(building)) {
    fail(errors, path, 'Expected a Building object');
    return;
  }
  registerId(building, path, ids, errors);
  requiredString(building.name, `${path}.name`, errors);
  if (building.roof !== undefined && (!isRecord(building.roof) || typeof building.roof.enabled !== 'boolean' ||
      !Number.isFinite(building.roof.rise) || building.roof.rise < 0.2 || building.roof.rise > 4)) {
    fail(errors, path+'.roof', 'Expected a roof with 0.2–4 m rise');
  }
  validateVec3(building.origin, `${path}.origin`, errors);
  requiredArray(building.floors, `${path}.floors`, errors).forEach((floor, floorIndex) => {
    const floorPath = `${path}.floors[${floorIndex}]`;
    if (!isRecord(floor)) {
      fail(errors, floorPath, 'Expected a Floor object');
      return;
    }
    registerId(floor, floorPath, ids, errors);
    floorIds.add(floor.id);
    validateStair(floor, 'stairs', floorPath + '.stairs', errors);
    validateStair(floor, 'stairOpening', floorPath + '.stairOpening', errors);
    if (floor.baseboard !== undefined && typeof floor.baseboard !== 'boolean') fail(errors, floorPath + '.baseboard', 'Expected a boolean');

    if (floor.buildingId !== building.id) fail(errors, `${floorPath}.buildingId`, 'Floor must reference its containing building');
    if (!Number.isInteger(floor.levelIndex)) fail(errors, `${floorPath}.levelIndex`, 'Expected an integer');
    if (typeof floor.elevation !== 'number' || !Number.isFinite(floor.elevation)) {
      fail(errors, `${floorPath}.elevation`, 'Expected a finite number');
    }
    if (!Number.isFinite(floor.floorHeight) || floor.floorHeight <= 0) {
      fail(errors, `${floorPath}.floorHeight`, 'Expected a number greater than zero');
    }

    requiredArray(floor.rooms, `${floorPath}.rooms`, errors).forEach((room, roomIndex) => {
      const roomPath = `${floorPath}.rooms[${roomIndex}]`;
      if (!isRecord(room)) {
        fail(errors, roomPath, 'Expected a Room object');
        return;
      }
      registerId(room, roomPath, ids, errors);
      if (room.id) roomIds.add(room.id);
      requiredString(room.name, `${roomPath}.name`, errors);
      requiredString(room.roomType, `${roomPath}.roomType`, errors);
      if (room.floorId !== floor.id) fail(errors, `${roomPath}.floorId`, 'Room must reference its containing floor');
      validatePolygon(room.boundary, `${roomPath}.boundary`, errors);
      if (room.ceiling !== undefined && typeof room.ceiling !== 'boolean') fail(errors, roomPath + '.ceiling', 'Expected a boolean');
      validateDimension(room.ceilingHeight, `${roomPath}.ceilingHeight`, errors);
      if (!DIMENSION_SOURCES.includes(room.dimensionSource)) {
        fail(errors, `${roomPath}.dimensionSource`, 'Unknown dimension source');
      }
    });

    const containingRooms = new Set(Array.isArray(floor.rooms) ? floor.rooms.map(room => room?.id) : []);
    const walls = new Map();
    requiredArray(floor.walls, `${floorPath}.walls`, errors).forEach((wall, wallIndex) => {
      const wallPath = `${floorPath}.walls[${wallIndex}]`;
      const entry = validateWall(wall, wallPath, floor.id, ids, errors);
      if (wall?.roomIds !== undefined && (!Array.isArray(wall.roomIds) || wall.roomIds.some(id => !containingRooms.has(id)))) {
        fail(errors, wallPath + '.roomIds', 'Shared walls must reference rooms on the same floor');
      }
      if (wall?.id) walls.set(wall.id, entry);
    });
    requiredArray(floor.openings, `${floorPath}.openings`, errors).forEach((opening, openingIndex) => {
      validateOpening(opening, `${floorPath}.openings[${openingIndex}]`, walls, ids, errors);
    });
  });
}

export function validateSceneDocument(sceneDocument) {
  const errors = [];
  if (!isRecord(sceneDocument)) {
    return { valid: false, errors: [{ path: '$', message: 'Expected a SceneDocument object' }] };
  }

  const ids = new Map();
  const assetIds = new Set();
  const roomIds = new Set();
  const floorIds = new Set();
  const outdoorZoneIds = new Set();

  if (sceneDocument.schemaVersion !== '1.0') fail(errors, 'schemaVersion', 'Expected schemaVersion 1.0');
  requiredString(sceneDocument.projectId, 'projectId', errors);
  requiredString(sceneDocument.name, 'name', errors);
  if (!PROJECT_TYPES.has(sceneDocument.projectType)) fail(errors, 'projectType', 'Unknown project type');
  validateTimestamp(sceneDocument.updatedAt, 'updatedAt', errors);

  if (!isRecord(sceneDocument.coordinateSystem)) {
    fail(errors, 'coordinateSystem', 'Expected a coordinate system');
  } else {
    if (sceneDocument.coordinateSystem.unit !== 'm') fail(errors, 'coordinateSystem.unit', 'Expected meters');
    if (sceneDocument.coordinateSystem.upAxis !== 'Y') fail(errors, 'coordinateSystem.upAxis', 'Expected Y-up');
    if (!['+Z', '-Z'].includes(sceneDocument.coordinateSystem.forwardAxis)) {
      fail(errors, 'coordinateSystem.forwardAxis', 'Expected +Z or -Z');
    }
  }

  if (sceneDocument.site !== undefined) {
    if (!isRecord(sceneDocument.site)) {
      fail(errors, 'site', 'Expected a Site object');
    } else {
      registerId(sceneDocument.site, 'site', ids, errors);
      requiredString(sceneDocument.site.name, 'site.name', errors);
      validatePolygon(sceneDocument.site.boundary, 'site.boundary', errors);
      if (!DIMENSION_SOURCES.includes(sceneDocument.site.elevationSource)) {
        fail(errors, 'site.elevationSource', 'Unknown dimension source');
      }
    }
  }

  requiredArray(sceneDocument.buildings, 'buildings', errors).forEach((building, index) => {
    validateBuilding(building, `buildings[${index}]`, ids, roomIds, floorIds, errors);
  });

  if (sceneDocument.referencePlan !== undefined) validateReference(sceneDocument.referencePlan, 'referencePlan', errors);
  if (sceneDocument.referencePlans !== undefined) {
    if (!isRecord(sceneDocument.referencePlans)) fail(errors, 'referencePlans', 'Expected references by floor ID');
    else for (const [id, ref] of Object.entries(sceneDocument.referencePlans)) {
      if (!floorIds.has(id)) fail(errors, 'referencePlans.' + id, 'Reference image must belong to an existing floor');
      validateReference(ref, 'referencePlans.' + id, errors);
    }
  }

  requiredArray(sceneDocument.outdoorZones, 'outdoorZones', errors).forEach((zone, index) => {
    const path = `outdoorZones[${index}]`;
    if (!isRecord(zone)) {
      fail(errors, path, 'Expected an OutdoorZone object');
      return;
    }
    registerId(zone, path, ids, errors);
    if (zone.id) outdoorZoneIds.add(zone.id);
    requiredString(zone.name, `${path}.name`, errors);
    if (!OUTDOOR_TYPES.has(zone.type)) fail(errors, `${path}.type`, 'Unknown outdoor zone type');
    validatePolygon(zone.boundary, `${path}.boundary`, errors);
    if (zone.fence !== undefined) {
      const fence = zone.fence;
      if (zone.type !== 'courtyard' || !isRecord(fence) || typeof fence.enabled !== 'boolean' ||
          !Number.isFinite(fence.height) || fence.height < .4 || fence.height > 2.5 ||
          !Number.isFinite(fence.gateWidth) || fence.gateWidth < .8 || fence.gateWidth > 6) {
        fail(errors, path+'.fence', 'Expected a courtyard fence height of 0.4–2.5 m and a 0.8–6 m gate');
      } else if (Array.isArray(zone.boundary) && zone.boundary.every(p => Number.isFinite(p?.x))) {
        const xs = zone.boundary.map(p => p.x);
        if (fence.gateWidth > Math.max(...xs)-Math.min(...xs)-.2) fail(errors, path+'.fence.gateWidth', 'Gate exceeds the courtyard boundary');
      }
    }
    if (typeof zone.elevation !== 'number' || !Number.isFinite(zone.elevation)) {
      fail(errors, `${path}.elevation`, 'Expected a finite number');
    }
  });

  requiredArray(sceneDocument.assets, 'assets', errors).forEach((asset, index) => {
    validateAsset(asset, `assets[${index}]`, ids, assetIds, errors);
  });

  requiredArray(sceneDocument.placements, 'placements', errors).forEach((placement, index) => {
    const path = `placements[${index}]`;
    if (!isRecord(placement)) {
      fail(errors, path, 'Expected a Placement object');
      return;
    }
    registerId(placement, path, ids, errors);
    if (!assetIds.has(placement.assetId)) fail(errors, `${path}.assetId`, 'Placement references a missing asset');
    if (!roomIds.has(placement.containerId) && !outdoorZoneIds.has(placement.containerId)) {
      fail(errors, `${path}.containerId`, 'Placement references a missing room or outdoor zone');
    }
    validateVec3(placement.position, `${path}.position`, errors);
    validateVec3(placement.rotation, `${path}.rotation`, errors);
    validateVec3(placement.scale, `${path}.scale`, errors, { positive: true });
    if (typeof placement.locked !== 'boolean') fail(errors, `${path}.locked`, 'Expected a boolean');
    if (typeof placement.visible !== 'boolean') fail(errors, `${path}.visible`, 'Expected a boolean');
  });

  if (sceneDocument.projectType === 'room' && roomIds.size !== 1) {
    fail(errors, 'projectType', 'A room project must contain exactly one room');
  }

  return { valid: errors.length === 0, errors };
}

export function assertSceneDocument(sceneDocument) {
  const result = validateSceneDocument(sceneDocument);
  if (!result.valid) {
    const error = new Error(`Invalid SceneDocument: ${result.errors.map((entry) => `${entry.path}: ${entry.message}`).join('; ')}`);
    error.name = 'SceneDocumentValidationError';
    error.errors = result.errors;
    throw error;
  }
  return sceneDocument;
}
