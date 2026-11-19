import { ROOM_TEMPLATES, createSingleRoomDocument } from './v2-contracts.js';
import { modelDimensions, fitsPlacement } from './placement-bounds.js';
import { createPlacement } from '../core/api-contracts.js';
import { requiresReview } from '../assets/catalog-filters.js';
import { SPACES, PALETTES, validBrief } from './room-brief.js';

export function studioDecor() {
  const print={id:'studio-hills',name:'《暮山》胡桃木框版画',category:'decor',source:'licensed_library',
    licenseStatus:'verified',createdAt:'2026-11-19T00:00:00Z',modelUrl:'/assets/models/studio-hills.glb',
    dimensions:Object.fromEntries(Object.entries({width:1.64,height:1.21,depth:.057}).map(([k,value])=>[k,{value,unit:'m',source:'estimated'}]))};
  const books={...print,id:'studio-books',name:'布面装帧画册',modelUrl:'/assets/models/studio-books.glb',
    dimensions:Object.fromEntries(Object.entries({width:.30,height:.0674,depth:.23}).map(([k,value])=>[k,{value,unit:'m',source:'estimated'}]))};
  const row={...books,id:'studio-cloth-books',name:'布面精装藏书',modelUrl:'/assets/models/studio-cloth-books.glb',
    dimensions:Object.fromEntries(Object.entries({width:.273,height:.142,depth:.118}).map(([k,value])=>[k,{value,unit:'m',source:'estimated'}]))};
  return [print,books,row];
}

export function createDesignShell(brief) {
  if (!validBrief(brief)) throw new Error('房间搭配参数无效');
  const {width:w,depth:d,space,palette}=brief;
  const colors=PALETTES[palette];
  const template=ROOM_TEMPLATES.find(t=>t.roomType===space);
  const doc=createSingleRoomDocument({...template,shape:'rectangle'},{dimensions:{width:w,depth:d,height:2.95}});
  const floor=doc.buildings[0].floors[0], room=floor.rooms[0];
  doc.name=colors.name+' · '+SPACES[space];
  room.floorMaterialId=colors.floor;
  room.wallTint=colors.wall;
  room.designPalette=palette;
  const door=floor.openings.find(o=>o.type==='door');
  const window=floor.openings.find(o=>o.type==='window');
  door.wallId=floor.walls[2].id;
  door.offsetFromWallStart=.2;
  window.wallId=floor.walls[3].id;
  window.width.value=Math.min(d*.67,3.3);
  window.height.value=2.36;
  window.sillHeight.value=.23;
  window.offsetFromWallStart=(d-window.width.value)/2;
  return doc;
}

export function createDesignedRoom(brief, catalog) {
  const doc=createDesignShell(brief);
  const {width:w,depth:d,space,palette,details}=brief;
  const floor=doc.buildings[0].floors[0], room=floor.rooms[0];
  const door=floor.openings.find(o=>o.type==='door');
  const has=key=>details.includes(key);
  const byId=new Map(catalog.filter(a=>a.modelUrl && !requiresReview(a)).flatMap(a=>[[a.id,a],[String(a.providerTaskId),a]]));
  for(const asset of studioDecor()) byId.set(asset.id,asset);
  const footprints=[{x:w-.2-door.width.value/2,z:d-.54,hw:door.width.value/2+.08,hd:.54,bottom:0,top:2.1}];
  const omitted=[];
  function place(label,ids,x,z,{yaw=0,y=0,scale=[1,1,1],underlay=false,offsets=[[0,0]],required=false}={}) {
    for(const id of ids.split('|')) {
      const asset=byId.get(id);
      if(!asset) continue;
      const dim=modelDimensions(asset), c=Math.abs(Math.cos(yaw)), s=Math.abs(Math.sin(yaw));
      const hw=(c*dim.width*scale[0]+s*dim.depth*scale[2])/2;
      const hd=(s*dim.width*scale[0]+c*dim.depth*scale[2])/2;
      for(const [dx,dz] of offsets) {
        if(2*hw+.08>w || 2*hd+.08>d) continue;
        const px=Math.max(hw+.04,Math.min(w-hw-.04,x+dx));
        const pz=Math.max(hd+.04,Math.min(d-hd-.04,z+dz));
        const p=createPlacement({id:'design-'+(doc.placements.length+1),assetId:asset.id,containerId:room.id,
          position:{x:px,y,z:pz},rotation:{x:0,y:yaw,z:0},scale:{x:scale[0],y:scale[1],z:scale[2]}});
        const top=y+dim.height*scale[1];
        if(!fitsPlacement(p,asset,room) || (!underlay && footprints.some(f=>y<f.top-.012 && top>f.bottom+.012
          && Math.abs(px-f.x)<hw+f.hw+.025 && Math.abs(pz-f.z)<hd+f.hd+.025))) continue;
        if(!underlay) footprints.push({x:px,z:pz,hw,hd,bottom:y,top});
        if(!doc.assets.some(a=>a.id===asset.id)) doc.assets.push(structuredClone(asset));
        doc.placements.push(p);
        return {x:px,z:pz,top,hw,hd};
      }
    }
    if(required) throw new Error('当前房间或资源库无法放置'+label+'，请检查模型库或调整尺寸。');
    omitted.push(label);
    return null;
  }
  const cx=w*.52;
  const drift=[[0,0],[.30,0],[-.30,0],[0,.36],[0,-.36]];
  const tableVase=table=>table && place('桌面陶器','polyhaven-ceramic-vase-02|8435231',table.x+.15,table.z-.03,{y:table.top,scale:[.76,.76,.76]});
  if (space==='living_room') {
    const sofa=place('沙发',palette==='walnut'?'polyhaven-sofa-03|8394445':'8394445',cx,.68,{required:true});
    const table=place('茶几',palette==='walnut'?'polyhaven-modern-coffee-table-01|8395285':'8395285',cx,sofa.z+sofa.hd+.87,{offsets:drift});
    tableVase(table);
    if(table) place('布面画册','studio-books',table.x-.18,table.z+.09,{yaw:.18,y:table.top});
    // The measured seat height of this specific sofa supports a loose cushion.
    if(doc.assets[0].providerTaskId==='8394445') {
      const cushion=place('沙发靠垫','8429792',sofa.x-.60,sofa.z-.01,{y:.43,yaw:.11,underlay:true});
      if(cushion) doc.placements.at(-1).appearance={color:palette==='moss'?'#899273':palette==='clay'?'#ab6951':'#c0a686'};
    }
    if(has('rug')) place('会客区地毯','8426570',cx,(sofa.z+(table?.z||d*.50))/2+.30,{yaw:Math.PI/2,y:.004,scale:[1.1,.22,1.28],underlay:true});
    const chair=place('休闲椅',has('reading')?'polyhaven-mid-century-lounge-chair|8424855':'8424855|polyhaven-modern-arm-chair-01',has('reading') ? .82 : w-.82,d*.54,{yaw:has('reading') ? .60 : -.80,offsets:drift});
    place('阅读灯','8396095',chair ? chair.x+.10 : .55,chair ? chair.z-chair.hd-.30 : .55,{offsets:drift});
    if(has('tv')) {
      const console=place('电视柜','polyhaven-modern-wooden-cabinet',w*.44,d-.35,{offsets:drift});
      if(console) place('电视','8430601|kenney-televisionmodern',console.x,console.z,{y:console.top,yaw:Math.PI});
    }
  } else if(space==='master_bedroom') {
    const bed=place('双人床',has('storage')?'8433400|8421752':'8426905|8421752',cx,1.04,{required:true,offsets:[[0,0],[-.45,0],[-.85,-.20],[0,-.30]]});
    for(const side of [-1,1]) place('床头柜','8435943|polyhaven-side-table-01',bed.x+side*(bed.hw+.36),.52);
    if(has('rug')) place('床尾地毯','8426570',bed.x,bed.z+bed.hd-.10,{yaw:Math.PI/2,scale:[.82,.2,1.14],underlay:true});
    if(has('reading')) place('卧室阅读椅','8424855',w-.66,d*.63,{yaw:-.65,offsets:drift});
  } else if (space==='study') {
    const desk=place('书桌','8426212|polyhaven-metal-office-desk',cx,.90,{required:true});
    place('工作椅','8436879|polyhaven-dining-chair-02',desk.x,desk.z+desk.hd+.48,{yaw:Math.PI,offsets:drift});
    place('台灯','polyhaven-desk-lamp-arm-01',desk.x+.31,desk.z,{y:desk.top,scale:[.64,.64,.64]});
    place('书架','polyhaven-shelf-01',w-.78,.25);
    if(has('rug')) place('书桌地毯','8426570',desk.x,1.43,{yaw:Math.PI/2,scale:[.83,.2,1],underlay:true});
  } else {
    const table=place('餐桌','8425729|polyhaven-wooden-table-02',w*.50,d*.45,{required:true});
    for(const side of [-1,1]) for(const pos of [-.33,.33]) place('餐椅','8437864|polyhaven-dining-chair-02',table.x+pos,table.z+side*(table.hd+.36),{yaw:side===1?Math.PI:0});
    tableVase(table);
    if(has('rug')) place('餐桌地毯','8426570',table.x,table.z,{scale:[1.18,.20,1.03],underlay:true});
  }
  if(has('work') && space!=='study') {
    const desk=place('办公桌','8426212',.38,d*.74,{yaw:Math.PI/2,offsets:[[0,0],[0,-.4],[0,.45],[w-.85,-.7],[w-.85,-1.4]]});
    if(desk) place('办公椅','8436879|polyhaven-dining-chair-02',desk.x+(desk.x>w/2?-1:1)*(desk.hw+.48),desk.z,{yaw:desk.x>w/2?Math.PI/2:-Math.PI/2,offsets:drift});
  }
  if(has('storage') && space!=='study') place('收纳柜','polyhaven-painted-wooden-cabinet|8426569',w-.54,.48,{offsets:drift});
  if(has('plants')) place('室内绿植','polyhaven-potted-plant-01',space==='living_room' ? Math.min(w-.52,cx+1.60) : .46,.55,{offsets:[[0,0],[0,.55],[0,d*.57],[w-.95,0],[w-.95,d*.52],[.08,d-.99],[w*.34,d-.94]]});
  if(has('art')) place('木框挂画','studio-hills',cx,.075,{y:1.29,scale:[.94,.94,1]});
  const lamp=byId.get('8438850')||byId.get('8426568');
  if(lamp) {
    const h=modelDimensions(lamp).height;
    place('吊灯',lamp.id,cx,d*.43,{y:room.ceilingHeight.value-h-.012});
  }
  return {document:doc,omitted:[...new Set(omitted)]};
}
