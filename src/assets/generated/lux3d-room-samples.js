import { ROOM_TEMPLATES, createSingleRoomDocument } from '../../data/v2-contracts.js';

// Positions are in metres in the room's Y-up coordinate system.
// Each sample includes verified Lux3D pieces and, when useful, a CC0 accent.
export const LUX3D_ROOM_SAMPLES = [
  { id:'lux-living', name:'Lux3D 奶油风客厅', roomType:'living_room', items:[
    {taskId:'8394445',position:[1.5,0,1.2]}, {taskId:'8395285',position:[2.7,0,2.5]},
    {taskId:'8396095',position:[4.4,0,1.0]}, {taskId:'8426570',position:[2.7,0,2.6]},
    {taskId:'8426568',position:[2.6,2.75,3.4]},
  ]},
  { id:'lux-bedroom', name:'Lux3D 现代卧室', roomType:'master_bedroom', items:[
    {taskId:'8421752',position:[2.1,0,1.45]},
    {assetId:'polyhaven-painted-wooden-nightstand',position:[.65,0,1.0]},
    {assetId:'polyhaven-painted-wooden-nightstand',position:[3.55,0,1.0]},
    {taskId:'8426568',position:[2.1,2.75,2.9]},
  ]},
  { id:'lux-bathroom', name:'Lux3D 卫浴空间', roomType:'bathroom', items:[
    {assetId:'kenney-shower',position:[.75,0,.85]}, {assetId:'kenney-toilet',position:[1.8,0,1.0]},
    {taskId:'8423648',position:[1.8,0,2.25]}, {taskId:'8426568',position:[1.2,2.75,1.5]},
  ]},
  { id:'lux-kitchen', name:'Lux3D 现代厨房', roomType:'kitchen', items:[
    {taskId:'8427862',position:[.55,0,.8]}, {taskId:'8425833',position:[2.55,0,.55]},
    {taskId:'8423657',position:[.55,0,2.0]}, {taskId:'8426568',position:[1.6,2.75,2.1]},
  ]},
  { id:'lux-dining', name:'Lux3D 自然木色餐厅', roomType:'dining_room', items:[
    {taskId:'8425729',position:[1.9,0,2.1]},
    {taskId:'8424854',position:[1.9,0,.9]}, {taskId:'8424855',position:[1.9,0,3.3]},
    {taskId:'8426568',position:[1.9,2.75,2.1]},
  ]},
  { id:'lux-study', name:'Lux3D 原木书房', roomType:'study', items:[
    {taskId:'8426212',position:[1.6,0,.6]}, {taskId:'8424855',position:[1.6,0,1.6]},
    {taskId:'8426568',position:[1.6,2.75,2.4]},
  ]},
  { id:'lux-entry', name:'Lux3D 简约玄关', roomType:'entryway', items:[
    {taskId:'8426569',position:[.65,0,1.85]}, {assetId:'polyhaven-potted-plant-01',position:[1.8,0,1.85]},
    {taskId:'8426568',position:[1.1,2.75,1.1]},
  ]},
];

export function createLux3dRoomSample(sampleId, catalogAssets) {
  const sample = LUX3D_ROOM_SAMPLES.find(item => item.id === sampleId);
  if (!sample) throw new Error('样板不存在');
  const template = ROOM_TEMPLATES.find(item => item.roomType === sample.roomType);
  const doc = createSingleRoomDocument(template, { projectId: `sample-${sample.id}` });
  doc.name = sample.name;
  const room = doc.buildings[0].floors[0].rooms[0], missing = [];
  for (const [index, item] of sample.items.entries()) {
    const asset = catalogAssets.find(entry => item.assetId ? entry.id === item.assetId : String(entry.providerTaskId) === item.taskId);
    const key = item.assetId || item.taskId;
    if (!asset || !asset.thumbnailUrl || !asset.qa?.placementTest?.startsWith('通过') || asset.scaleCalibrationRequired || !asset.qa?.visualReview || /待|需复核|需单独校准|瑕疵|异常|差异|不可拆|不可分|不能独立|额外支架|疑似重复|细节较浅|未目检|未人工|未审核|未复核|未验收/.test(asset.qa.visualReview)) { missing.push(key); continue; }
    if (!doc.assets.some(entry => entry.id === asset.id)) doc.assets.push(structuredClone(asset));
    doc.placements.push({ id: `sample-placement-${key}-${index}`, assetId: asset.id, containerId: room.id,
      position: { x:item.position[0], y:item.position[1], z:item.position[2] }, rotation:{x:0,y:item.rotationY||0,z:0}, scale:{x:1,y:1,z:1}, locked:false, visible:true });
  }
  return {document:doc,missing};
}
