const estimatedDimension = (value) => ({ value, unit: 'm', source: 'estimated' });
const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });

const proceduralAsset = (id, name, category, kind, color, width, depth, height, narrative) => ({
  id,
  name,
  category,
  source: 'procedural',
  modelUrl: null,
  procedural: { kind, color },
  narrative,
  dimensions: {
    width: estimatedDimension(width),
    depth: estimatedDimension(depth),
    height: estimatedDimension(height),
  },
  licenseStatus: 'user_owned',
  createdAt: '2026-11-18T00:00:00.000Z',
});

const placement = (assetId, position, rotationY) => ({
  id: `placement-${assetId}`,
  assetId,
  containerId: 'room-memory',
  position: vec3(...position),
  rotation: vec3(0, rotationY, 0),
  scale: vec3(1, 1, 1),
  locked: false,
  visible: true,
});

export const DEMO_SCENE_DOCUMENT = {
  schemaVersion: '1.0',
  projectId: 'memory-hunt-demo',
  name: '奶油风客厅',
  projectType: 'room',
  coordinateSystem: { unit: 'm', upAxis: 'Y', forwardAxis: '+Z' },
  buildings: [
    {
      id: 'building-memory',
      name: '示例住宅',
      origin: vec3(),
      floors: [
        {
          id: 'floor-memory',
          buildingId: 'building-memory',
          levelIndex: 0,
          elevation: 0,
          floorHeight: 3,
          rooms: [
            {
              id: 'room-memory',
              floorId: 'floor-memory',
              name: '奶油风客厅',
              roomType: 'living_room',
              boundary: [
                { x: -2.6, y: -2.4 },
                { x: 2.6, y: -2.4 },
                { x: 2.6, y: 2.4 },
                { x: -2.6, y: 2.4 },
              ],
              ceilingHeight: estimatedDimension(3),
              dimensionSource: 'estimated',
            },
          ],
          walls: [
            {
              id: 'wall-back',
              floorId: 'floor-memory',
              start: { x: -2.6, y: -2.4 },
              end: { x: 2.6, y: -2.4 },
              thickness: estimatedDimension(0.15),
              height: estimatedDimension(3),
              structuralType: 'unknown',
            },
            {
              id: 'wall-left',
              floorId: 'floor-memory',
              start: { x: -2.6, y: -2.4 },
              end: { x: -2.6, y: 2.4 },
              thickness: estimatedDimension(0.15),
              height: estimatedDimension(3),
              structuralType: 'unknown',
            },
            {
              id: 'wall-right',
              floorId: 'floor-memory',
              start: { x: 2.6, y: -2.4 },
              end: { x: 2.6, y: 2.4 },
              thickness: estimatedDimension(0.15),
              height: estimatedDimension(3),
              structuralType: 'unknown',
            },
          ],
          openings: [
            {
              id: 'window-back',
              wallId: 'wall-back',
              type: 'window',
              offsetFromWallStart: 3.2045,
              width: estimatedDimension(0.806),
              height: estimatedDimension(1.28),
              sillHeight: estimatedDimension(1.31),
            },
          ],
        },
      ],
    },
  ],
  outdoorZones: [],
  assets: [
    proceduralAsset('mug', '缺口马克杯', 'kitchenware', 'mug', '#e8e0d2', 0.26, 0.228791, 0.183032, {
      clue: '它总在最深的夜里，替你留住一点热气。',
      story: '杯口那道缺口，是某个凌晨三点磕在桌沿留下的。那天之后，它成了赶 due 的固定搭子：咖啡、浓茶、偶尔只是热水。它什么都没说，但每一个 deadline 它都在。',
    }),
    proceduralAsset('lamp', '旧台灯', 'lighting', 'lamp', '#f0c979', 0.350118, 0.350118, 0.62, {
      clue: '它替你留住过一小片白天。',
      story: '这盏灯是开学时在二手市场淘的，开关要按两下才亮。后来你习惯了它的脾气，它也习惯了你的作息。很多个夜晚，房间里只有这一圈光，和你。',
    }),
    proceduralAsset('book', '折角笔记本', 'decor', 'book', '#7f9bb3', 0.249333, 0.34, 0.053267, {
      clue: '有一页折了角，藏着一个没说完的计划。',
      story: '本子用到一半就换了新的，但折角那一页一直没舍得撕。上面写着一个旅行计划、三门想修的课，和一句“等忙完这阵子”。现在翻开，字迹已经有点淡了。',
    }),
    proceduralAsset('plant', '窗台绿植', 'plant', 'plant', '#6f9a6b', 0.300437, 0.345665, 0.52, {
      clue: '它不会说话，却记得每一次浇水。',
      story: '刚买来的时候只有三片叶子，你一度以为养不活。没想到一个学期过去，它悄悄长到了窗边。每次出门前浇一点水，回来总能看到新的叶子在往上冒。',
    }),
    proceduralAsset('plush', '旧玩偶', 'toy', 'plush', '#d9a28c', 0.401363, 0.259632, 0.46, {
      clue: '它听过你所有没说出口的话。',
      story: '它陪你的时间比很多好朋友都长。考试周、搬家、心情不好的时候，你都把它放在一伸手就能碰到的地方。棉花已经有点塌了，但抱起来还是老样子。',
    }),
    proceduralAsset('sneaker', '旧球鞋', 'personal_item', 'sneaker', '#c9c2b6', 0.36, 0.129452, 0.135, {
      clue: '它走过最远的路，却总在门口等你。',
      story: '鞋头已经磨白了，鞋带也换过一次。它陪你赶过早八、跑过操场、走过这座城市很多条街。每次出门看到它在门口，就知道今天也能再走远一点。',
    }),
  ],
  placements: [
    placement('mug', [-0.6825, 0.86, -1.64], 0.4),
    placement('lamp', [-1.4625, 0.86, -1.84], -0.3),
    placement('book', [-2.288, 1.27, -0.68], 1.35),
    placement('plant', [1.0075, 1.06, -2.096], 0),
    placement('plush', [1.5925, 0.68, 0.12], -0.6),
    placement('sneaker', [0.975, 0.03, 1.4], 0.8),
  ],
  updatedAt: '2026-11-18T00:00:00.000Z',
};

export function createDemoSceneDocument() {
  return structuredClone(DEMO_SCENE_DOCUMENT);
}
