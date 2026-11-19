import { createDesignShell, createDesignedRoom, studioDecor } from './designed-room.js';
import { createPlacement } from '../core/api-contracts.js';
import { fitsPlacement, modelDimensions } from './placement-bounds.js';
import { requiresReview } from '../assets/catalog-filters.js';

// Coordinates are measured from the back-left corner. Surface references keep
// accessories on their furniture even when an archived model is recalibrated.
const bedroom = [
  ['rug','8426570',2.55,1.88,{yaw:90,scale:[1.30,.22,1.35]}],
  ['bed','8433400',2.55,1.25],
  ['left','8435943',1.22,.43],['right','8435943',3.88,.43],
  ['lamp','8469514',1.22,.43,{on:'left'}],['books','studio-books',3.88,.43,{on:'right'}],
  ['bench','8469997',2.55,2.72],
  ['art','8429588',2.55,.09,{y:1.57,scale:[1.48,1.48,1]}],
  ['plant','polyhaven-potted-plant-02',.59,1.06],
  ['pendant','8432516',3.88,.52,{ceiling:true,scale:[1.13,1.7,1.13]}],
];
const dining = [
  ['rug','8426570',2.58,2.30,{yaw:90,scale:[1.53,.20,1.55]}],
  ['table','polyhaven-round-wooden-table-01',2.58,2.30,{scale:[1.07,.76,1.07]}],
  ['chair1','8439688',1.88,1.60,{yaw:45}],['chair2','8439688',3.28,1.60,{yaw:-45}],
  ['chair3','8439688',1.88,3.00,{yaw:135}],['chair4','8439688',3.28,3.00,{yaw:-135}],
  ['pendant','polyhaven-hanging-industrial-lamp',2.58,2.30,{ceiling:true,scale:[.90,.73,.90]}],
  ['vase','8435231',2.62,2.30,{on:'table'}],
  ['sideboard','polyhaven-woodentable-03',2.58,.43],
  ['vessel','polyhaven-antique-ceramic-vase-01',2.97,.42,{on:'sideboard',scale:[.74,.74,.74]}],
  ['books','studio-books',2.26,.44,{on:'sideboard',yaw:-9}],
  ['print','studio-hills',2.58,.10,{y:1.31,scale:[.82,.82,1]}],
  ['plant','polyhaven-potted-plant-01',4.41,.66],
];
const study = [
  ['rug','8426570',2.12,1.82,{yaw:90,scale:[1.12,.21,1.22]}],
  ['desk','8428085',1.82,1.94,{scale:[1.50,1,1.45]}],
  ['chair','8424855',1.82,1.14],
  ['desk-lamp','8449410',1.28,1.92,{on:'desk',yaw:22}],
  ['folios','studio-books',2.24,1.95,{on:'desk',yaw:-11}],
  ['case1','8448804',3.30,.31],['case2','8448804',4.17,.31],
  ['reading-set','studio-cloth-books',3.13,.34,{y:1.026}],
  ['essays','studio-cloth-books',3.37,.34,{y:.858,scale:[1.25,1,1]}],
  ['albums','studio-books',3.15,.34,{y:.695,scale:[.85,1,.70]}],
  ['design-set','studio-cloth-books',4.32,.34,{y:.858}],
  ['journals','studio-cloth-books',4.06,.34,{y:.695,scale:[1.3,1,1]}],
  ['ceramic','polyhaven-ceramic-vase-02',3.18,.31,{on:'case1',scale:[.74,.74,.74]}],
  ['shelf-books','studio-books',4.20,.31,{on:'case2'}],
  ['picture','8429588',1.82,.09,{y:1.25,scale:[1.65,1.65,1]}],
  ['plant','polyhaven-potted-plant-01',.57,.61],
  ['light','8434403',1.82,1.92,{ceiling:true,scale:[1.4,1.35,1.4]}],
];

export const STYLE_PRESETS = [
  {id:'sage',name:'林间中古',room:'阅读客厅',palette:'moss',space:'living_room',width:5.8,depth:4.8,
    cover:'/studio/sage-reading-room.jpg',materials:'鼠尾草绿墙面 · 棕皮阅读椅'},
  {id:'terracotta',name:'暖陶假日',room:'双人卧室',palette:'clay',space:'master_bedroom',width:5.0,depth:4.25,
    cover:'/studio/preset-terracotta.jpg',materials:'陶土色墙面 · 软包床尾凳',wallFinish:'dado',items:bedroom},
  {id:'walnut',name:'胡桃晚餐',room:'四人餐厅',palette:'walnut',space:'dining_room',width:5.25,depth:4.8,
    cover:'/studio/preset-walnut.jpg',materials:'深木圆桌 · 金属吊灯',wallFinish:'moulding',items:dining},
  {id:'oak',name:'浅木书斋',room:'独立书房',palette:'linen',space:'study',width:4.85,depth:4.1,
    cover:'/studio/preset-oak.jpg',materials:'浅木书柜 · 可调阅读灯',items:study},
];

export function openStylePreset(id,catalog) {
  const preset=STYLE_PRESETS.find(p=>p.id===id);
  if(!preset) throw new Error('未找到这套预设');
  const brief={...preset,details:['reading','rug','plants','art'],note:''};
  const sample=preset.items ? null : createDesignedRoom(brief,catalog);
  if(sample?.omitted.length) throw new Error('本机模型库缺少样板间用到的'+sample.omitted.join('、')+'。');
  const doc=sample?.document ?? createDesignShell(brief);
  doc.name=preset.name+' · '+preset.room;
  if(!preset.items) return doc;
  const room=doc.buildings[0].floors[0].rooms[0];
  if(preset.wallFinish) room.designWallFinish=preset.wallFinish;
  const models=new Map();
  for(const a of [...catalog.filter(a=>a.modelUrl && !requiresReview(a)),...studioDecor()]) {
    models.set(a.id,a);
    if(a.providerTaskId) models.set(String(a.providerTaskId),a);
  }
  const surfaces=new Map();
  for(const [key,model,x,z,options={}] of preset.items) {
    const asset=models.get(model);
    if(!asset) throw new Error('本机模型库缺少这套搭配所需的家具，请检查资源库后重试。');
    const [sx,sy,sz]=options.scale || [1,1,1];
    const height=modelDimensions(asset).height*sy;
    const y=options.ceiling ? room.ceilingHeight.value-height-.012 : options.on ? surfaces.get(options.on) : options.y || 0;
    const p=createPlacement({id:preset.id+'-'+key,assetId:asset.id,containerId:room.id,
      position:{x,y,z},rotation:{x:0,y:(options.yaw||0)*Math.PI/180,z:0},scale:{x:sx,y:sy,z:sz}});
    if(!Number.isFinite(y) || !fitsPlacement(p,asset,room)) throw new Error('家具尺寸与预设不匹配：'+asset.name);
    if(!doc.assets.some(a=>a.id===asset.id)) doc.assets.push(structuredClone(asset));
    doc.placements.push(p);
    surfaces.set(key,y+height);
  }
  return doc;
}
