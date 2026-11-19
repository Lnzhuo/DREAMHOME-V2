import { renderVillaSitePanel } from './VillaSitePanel.js';
import { getRoomBounds } from '../../data/scene-operations.js';
import './room-editor.css';
import { ROOM_TEMPLATES } from '../../data/v2-contracts.js';
import { setRoomShape, addAdjacentRoom, deleteRoom, addWallOpening, moveAdjacentRoom, validateRoomConnections, validateOpenings, validateFurniture } from './topology.js';

const val = (n) => ({value:n, unit:'m', source:'measured'});
const finite = n => Number.isFinite(n) && n > 0;
function reshapeFloor(doc, floor, room, width, depth, height) {
  const b = getRoomBounds(room);
  if (doc.projectType==='villa' && (floor.stairs || floor.stairOpening) && (Math.abs(width-b.width)>1e-6 || Math.abs(depth-b.depth)>1e-6)) throw new Error('本层有楼梯，暂不支持改变平面尺寸；可调整层高及楼梯参数');
  if (![width,depth,height].every(finite) || width < 0.8 || depth < 0.8) throw new Error('长宽至少为 0.8 米，层高须大于零');
  if (floor.openings.some(o => o.sillHeight.value + o.height.value > height)) throw new Error('层高不能低于现有门窗顶部，请先调整门窗高度');
  // Move the far edge and every point beyond it together: neighbouring spaces
  // remain adjacent and no furniture is scaled.
  const map = p => ({x:p.x <= b.minX ? p.x : p.x < b.maxX ? b.minX+(p.x-b.minX)*width/b.width : p.x+width-b.width, y:p.y <= b.minY ? p.y : p.y < b.maxY ? b.minY+(p.y-b.minY)*depth/b.depth : p.y+depth-b.depth});
  const oldLengths = new Map(floor.walls.map(w=>[w.id,Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y)]));
  const ids=new Set(floor.rooms.map(r=>r.id));
  doc.placements.filter(p=>ids.has(p.containerId)).forEach(p=>{const point=map({x:p.position.x,y:p.position.z});p.position.x=point.x;p.position.z=point.y;});
  floor.rooms.forEach(r=>{r.boundary=r.boundary.map(map);});
  floor.walls.forEach(w=>{w.start=map(w.start);w.end=map(w.end);w.height=val(height);});
  floor.openings.forEach(o=>{const w=floor.walls.find(x=>x.id===o.wallId); const length=Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y); const ratio=length/oldLengths.get(w.id); if(o.width.value>length)throw new Error('墙体过短，无法容纳现有门窗'); o.offsetFromWallStart=Math.max(0,Math.min(o.offsetFromWallStart*ratio,length-o.width.value));});
  floor.floorHeight=height; floor.rooms.forEach(r=>r.ceilingHeight=val(height));
  validateOpenings(floor); validateFurniture(doc,floor);
}

export class RoomEditor {
  constructor({root,editor}) { this.root=root; this.editor=editor; }
  mount() { this.unsubscribe=this.editor.subscribe(()=>this.render()); return this; }
  destroy() { this.unsubscribe?.(); }
  change(action) {
    const before=structuredClone(this.editor.getSceneDocument()); const next=structuredClone(before);
    const active=this.editor.game.activeRoomId;
    const floor=next.buildings.flatMap(b=>b.floors).find(f=>f.rooms.some(r=>r.id===active)) || next.buildings[0].floors[0];
    const room=floor.rooms.find(r=>r.id===active) || floor.rooms[0];
    try { const selected = action(next,floor,room); this.editor.game.replaceSceneDocument(next); this.editor.game.setActiveRoom(selected || (floor.rooms.some(r=>r.id===room.id) ? room.id : floor.rooms[0].id)); this.editor.pushHistory(before); this.editor.emit(); }
    catch(e) { this.editor.status?.(e.message,'error'); this.render(); }
  }
  render() {
    const doc=this.editor.getSceneDocument(), floor=doc.buildings.flatMap(b=>b.floors).find(f=>f.rooms.some(r=>r.id===this.editor.game.activeRoomId)) || doc.buildings[0].floors[0];
    const outdoor = doc.outdoorZones.find(z=>z.id===this.editor.game.activeRoomId);
    if (outdoor && doc.projectType==='villa') {
      this.root.innerHTML='<section class="dw-room-editor"><h3 data-outdoor-heading></h3><div data-villa></div></section>';
      this.root.querySelector('[data-outdoor-heading]').textContent=outdoor.name;
      renderVillaSitePanel(this.root.querySelector('[data-villa]'),this);
      return;
    }
    const room=floor.rooms.find(r=>r.id===this.editor.game.activeRoomId) || floor.rooms[0]; const b=getRoomBounds(room);
    const area=floor.rooms.reduce((sum,r)=>sum+Math.abs(r.boundary.reduce((a,p,i)=>{const q=r.boundary[(i+1)%r.boundary.length];return a+p.x*q.y-q.x*p.y;},0))/2,0);
    const ownWalls=floor.walls.filter(w=>w.roomIds?.includes(room.id) || floor.rooms.length===1);
    const openings=floor.openings.filter(o=>ownWalls.some(w=>w.id===o.wallId));
    this.root.innerHTML=`<div class="dw-room-editor"><h3 data-room-heading></h3><form data-room style="display:grid;gap:8px"><label>长（米） <input name="width" type="number" step="0.1" min="0.8" value="${b.width.toFixed(2)}"></label><label>宽（米） <input name="depth" type="number" step="0.1" min="0.8" value="${b.depth.toFixed(2)}"></label><label>层高（米） <input name="height" type="number" step="0.1" min="1.5" value="${room.ceilingHeight.value}"></label><label>墙厚（米） <input name="thickness" type="number" step="0.01" min="0.04" max="1" value="${(ownWalls[0]?.thickness.value || 0.12).toFixed(2)}"></label><label>天花板 <input name="ceiling" type="checkbox" ${room.ceiling !== false ? 'checked' : ''}></label><label>全层踢脚线 <input name="baseboard" type="checkbox" ${floor.baseboard !== false ? 'checked' : ''}></label><button>应用尺寸</button></form><form data-area style="margin-top:12px"><label>${doc.projectType==='villa'?'本层':'整套'}面积（㎡） <input type="number" name="area" min="5" step="1" value="${area.toFixed(1)}"></label> <button>调整</button></form><p style="font-size:12px;color:#69766b">面积为房间净面积之和；调整时家具位置随房间移动，家具尺寸保持不变。</p><div data-shape></div><div data-villa></div><h4>门窗</h4><div data-openings></div></div>`;
    const dimensionsForm=this.root.querySelector('[data-room]');
    for (const [name,title] of [['wallTint','墙面色调'],['floorTint','地板色调']]) {
      const label=document.createElement('label');
      const color=document.createElement('input');
      color.type='color'; color.name=name; color.value=room[name] || '#ffffff';
      label.append(title,color);
      dimensionsForm.insertBefore(label,dimensionsForm.querySelector('button'));
    }
    this.root.querySelector('[data-room-heading]').textContent = `空间参数 · ${room.name}`;
    this.root.querySelector('[data-room]').onsubmit=e=>{e.preventDefault();const d=new FormData(e.currentTarget);this.change((doc,f,r)=>{const thickness=+d.get('thickness');if(!finite(thickness)||thickness<.04||thickness>1)throw new Error('墙厚须在 0.04 至 1 米之间');reshapeFloor(doc,f,r,+d.get('width'),+d.get('depth'),+d.get('height'));if(doc.projectType==='villa'){const floors=doc.buildings.find(b=>b.floors.some(item=>item.id===f.id)).floors;for(const higher of floors.filter(item=>item.levelIndex>f.levelIndex)) higher.elevation += (+d.get('height')-floor.floorHeight); }f.walls.filter(w=>w.roomIds?.includes(r.id)||f.rooms.length===1).forEach(w=>w.thickness=val(thickness));r.ceiling=d.has('ceiling');r.wallTint=d.get('wallTint');r.floorTint=d.get('floorTint');f.baseboard=d.has('baseboard');});};
    this.root.querySelector('[data-area]').onsubmit=e=>{e.preventDefault();const target=+new FormData(e.currentTarget).get('area');if(!finite(target))return;this.change((doc,f)=>{if(doc.projectType==='villa')throw new Error('多层住宅暂不支持按面积缩放，请单独编辑建筑参数');const k=Math.sqrt(target/area);const ids=new Set(f.rooms.map(r=>r.id));doc.placements.filter(p=>ids.has(p.containerId)).forEach(p=>{p.position.x*=k;p.position.z*=k;});f.rooms.forEach(r=>r.boundary.forEach(p=>{p.x*=k;p.y*=k;}));f.walls.forEach(w=>{w.start.x*=k;w.start.y*=k;w.end.x*=k;w.end.y*=k;});f.openings.forEach(o=>{o.offsetFromWallStart*=k;const w=f.walls.find(w=>w.id===o.wallId);const length=Math.hypot(w.end.x-w.start.x,w.end.y-w.start.y);if(o.width.value>length)throw new Error('墙体过短，无法容纳现有门窗');o.offsetFromWallStart=Math.min(o.offsetFromWallStart,length-o.width.value);});validateOpenings(f);validateFurniture(doc,f);});};
    const wrap=this.root.querySelector('[data-shape]');
    wrap.innerHTML=`<label>房间形状 <select data-select><option value="rectangle">矩形</option><option value="long_rectangle">长条形</option><option value="l_shape">L 型</option><option value="bay_window">飘窗结构</option><option value="open_space">开放式</option></select></label><div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap"><select data-add>${ROOM_TEMPLATES.map(t=>`<option value="${t.roomType}">${t.name}</option>`).join('')}</select><button type="button" data-add-button>添加相邻房间</button><button type="button" data-delete ${floor.rooms.length===1?'disabled':''}>删除当前房间</button></div><p style="font-size:12px;color:#69766b">新增房间连接当前房间；删除时会移除房间内家具。</p>`;
    const select=wrap.querySelector('[data-select]');select.value=room.shape || ROOM_TEMPLATES.find(t=>t.id===room.templateId)?.shape || 'rectangle';select.onchange=()=>this.change((doc,f,r)=>{if(doc.projectType==='villa' && r.roomType==='corridor' && (f.stairs||f.stairOpening))throw new Error('楼梯所在走廊暂不支持改变形状');setRoomShape(f,r,select.value);validateFurniture(doc,f);});
    wrap.querySelector('[data-add-button]').onclick=()=>this.change((doc,f,r)=>(doc.projectType==='room' && (doc.projectType='residence'),addAdjacentRoom(f,r,wrap.querySelector('[data-add]').value).id));
    wrap.querySelector('[data-delete]').onclick=()=>this.change((doc,f,r)=>{if(doc.projectType==='villa' && r.roomType==='corridor' && (f.stairs||f.stairOpening))throw new Error('请保留楼梯所在走廊');deleteRoom(doc,f,r);});

    if(doc.projectType==='villa') {
      const v=this.root.querySelector('[data-villa]'); const stair=floor.stairs; const yard=doc.outdoorZones.find(z=>z.type==='courtyard');
      const yardDepth=yard ? Math.max(...yard.boundary.map(p=>p.y))-Math.min(...yard.boundary.map(p=>p.y)) : 0;
      v.innerHTML=`<h4>建筑构件</h4>${stair?`<form data-stair style="display:grid;gap:8px"><label>楼梯宽（米）<input name="width" type="number" min="0.6" max="1.2" step="0.05" value="${stair.width}"></label><label>楼梯长（米）<input name="depth" type="number" min="2" step="0.1" value="${stair.depth}"></label><label>台阶数<input name="steps" type="number" min="8" max="24" step="1" value="${stair.steps}"></label><button>应用楼梯</button></form>`:'<p>本层无上行楼梯。</p>'}${yard?`<form data-yard style="display:grid;gap:8px;margin-top:10px"><label>前庭进深（米）<input name="depth" type="number" min="1" max="30" step="0.1" value="${yardDepth}"></label><button>应用庭院</button></form>`:''}`;
      v.querySelector('[data-stair]')?.addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.currentTarget);this.change((doc,f)=>{const width=+data.get('width'),depth=+data.get('depth'),steps=+data.get('steps');const corridor=f.rooms.find(r=>r.roomType==='corridor'),bounds=getRoomBounds(corridor);if(!finite(width)||!finite(depth)||!Number.isInteger(steps)||steps<8||steps>24||width>bounds.width-.15||depth>bounds.depth-.2)throw new Error('楼梯必须在走廊内，台阶数为 8 至 24');Object.assign(f.stairs,{width,depth,steps});const floors=doc.buildings.find(b=>b.floors.some(item=>item.id===f.id)).floors;const upper=floors.find(item=>item.levelIndex===f.levelIndex+1);if(upper)upper.stairOpening={x:f.stairs.x,z:f.stairs.z,width,depth};});});
      v.querySelector('[data-yard]')?.addEventListener('submit',e=>{e.preventDefault();const depth=+new FormData(e.currentTarget).get('depth');this.change(doc=>{if(!finite(depth)||depth>30)throw new Error('庭院进深须为 1 至 30 米');const zone=doc.outdoorZones.find(z=>z.type==='courtyard');const maxY=Math.max(...zone.boundary.map(p=>p.y));zone.boundary.forEach(p=>{if(p.y<maxY)p.y=maxY-depth;});});});
    }
    if (doc.projectType==='villa') renderVillaSitePanel(this.root.querySelector('[data-villa]'),this);
    const neighbors = floor.rooms.filter(item => item.id !== room.id);
    if (neighbors.length) {
      const form = document.createElement('form');
      form.innerHTML = '<h4>调整相邻关系</h4><label>相邻房间 <select name="target"></select></label><label>放在它的 <select name="side"><option value="east">东侧</option><option value="west">西侧</option><option value="north">北侧</option><option value="south">南侧</option></select></label><button>移动当前房间</button>';
      for (const other of neighbors) form.elements.target.add(new Option(other.name,other.id));
      form.onsubmit = event => {
        event.preventDefault();
        this.change((doc,f,r) => moveAdjacentRoom(doc,f,r,form.elements.target.value,form.elements.side.value));
      };
      wrap.appendChild(form);
    }
    const list=this.root.querySelector('[data-openings]');
    const add = document.createElement('form');
    add.innerHTML = '<label>墙段 <select name="wall"></select></label><label>新增类型 <select name="type"><option value="door">门</option><option value="window">窗</option><option value="archway">敞开通道</option></select></label><button>添加门窗或开口</button>';
    for (const [index, wall] of ownWalls.entries()) {
      const distance = Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y).toFixed(2);
      add.elements.wall.add(new Option('墙 ' + (index+1) + ' · ' + distance + ' m',wall.id));
    }
    add.onsubmit = event => {
      event.preventDefault();
      this.change((_doc,f) => { addWallOpening(f,add.elements.wall.value,add.elements.type.value); });
    };
    if(!openings.length) list.textContent='此房间暂无门窗';
    openings.forEach(o=>{const form=document.createElement('form');form.style='display:grid;gap:4px;margin:8px 0;padding:8px;background:#fff;border:1px solid #e6e4dc;border-radius:8px'; form.innerHTML=`<strong>${o.type==='door'?'门':o.type==='window'?'窗':'开口'}</strong><label>距墙起点（米） <input name="offset" type="number" step="0.05" min="0" value="${o.offsetFromWallStart.toFixed(2)}"></label><label>宽（米） <input name="width" type="number" step="0.05" min="0.1" value="${o.width.value}"></label><label>高（米） <input name="height" type="number" step="0.05" min="0.1" value="${o.height.value}"></label><label>窗台高（米） <input name="sill" type="number" step="0.05" min="0" value="${o.sillHeight.value}"></label>${o.type==='door'?'<label>开启方向 <select name="swing"><option value="inward">向内</option><option value="outward">向外</option></select></label>':''}<button>应用门窗</button>`;if(o.type==='door')form.querySelector('select').value=o.swingDirection||'inward';form.onsubmit=e=>{e.preventDefault();const d=new FormData(form);this.change((doc,f)=>{const item=f.openings.find(x=>x.id===o.id),wall=f.walls.find(w=>w.id===item.wallId),length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y);const offset=+d.get('offset'),width=+d.get('width'),height=+d.get('height'),sill=+d.get('sill');if(!finite(width)||!finite(height)||offset<0||sill<0||offset+width>length||sill+height>wall.height.value)throw new Error('门窗必须位于墙体范围内');Object.assign(item,{offsetFromWallStart:offset,width:val(width),height:val(height),sillHeight:val(sill),swingDirection:d.get('swing')||item.swingDirection});validateOpenings(f);});};const remove=document.createElement('button');remove.type='button';remove.textContent='移除此开口';remove.onclick=()=>this.change((_doc,f)=>{f.openings=f.openings.filter(slot=>slot.id!==o.id);validateRoomConnections(f);});form.append(remove);list.appendChild(form);});
    list.appendChild(add);
  }
}
