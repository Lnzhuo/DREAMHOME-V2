import { fitsPlacement } from '../../data/placement-bounds.js';
import { GARDEN_SPACES, YARD_FURNITURE, gardenZone } from '../../data/villa-site.js';
import { getRoomBounds } from '../../data/scene-operations.js';

export function renderVillaSitePanel(root, roomEditor) {
  const {editor} = roomEditor;
  const doc = editor.getSceneDocument();
  const building = doc.buildings[0], yard = doc.outdoorZones.find(z => z.type === 'courtyard');
  if (!yard) return;
  const zone = doc.outdoorZones.find(z => z.id === editor.game.activeRoomId);
  const folder = document.createElement('section');
  root.append(folder);
  folder.innerHTML = `<h4>屋顶与庭院</h4>
   <form data-roof><label><input name="enabled" type="checkbox"> 启用坡屋顶</label><label>屋脊高度（米）<input name="rise" type="number" min="0.2" max="4" step="0.1" required></label><button>应用屋顶</button></form>
   <button type="button" data-exterior>查看建筑外观</button>
   <form data-fence><label><input name="enabled" type="checkbox"> 设置庭院围栏</label><label>围栏高度（米）<input name="height" type="number" min="0.4" max="2.5" step="0.05" required></label>
   <label>入口宽度（米）<input name="gate" type="number" min="0.8" max="6" step="0.1" required></label><button>应用围栏</button></form>
   <h4>室外分区</h4><div data-zones></div><div data-furniture></div>`;
  function change(fn) {
    try {
      editor.runWithHistory(() => {
        const next=structuredClone(editor.getSceneDocument());
        fn(next);
        editor.game.commitScene(next,{rebuild:true});
        if (editor.selectedId && !next.placements.some(p => p.id === editor.selectedId)) editor.selectPlacement(null);
      });
    } catch(error) { editor.status(error.message,'error'); }
  }
  const roof=folder.querySelector('[data-roof]'), fence=folder.querySelector('[data-fence]');
  roof.elements.enabled.checked=building.roof?.enabled ?? false; roof.elements.rise.value=building.roof?.rise ?? 1.2;
  roof.onsubmit=e=>{e.preventDefault();change(next=>{next.buildings[0].roof={enabled:roof.elements.enabled.checked,rise:roof.elements.rise.valueAsNumber};});};
  folder.querySelector('[data-exterior]').onclick=()=>roomEditor.showExterior?.();
  fence.elements.enabled.checked=yard.fence?.enabled ?? false;
  fence.elements.height.value=yard.fence?.height ?? 1.05; fence.elements.gate.value=yard.fence?.gateWidth ?? 2.2;
  fence.onsubmit=e=>{e.preventDefault();change(next=>{next.outdoorZones.find(z=>z.id===yard.id).fence={
    enabled:fence.elements.enabled.checked,height:fence.elements.height.valueAsNumber,gateWidth:fence.elements.gate.valueAsNumber};});};
  const zones=folder.querySelector('[data-zones]');
  function selectButton(z) {
    const b=document.createElement('button');b.type='button';b.textContent='选择'+z.name;b.dataset.selectZone=z.id;
    b.onclick=()=>{editor.game.setActiveRoom(z.id);editor.selectPlacement(null);};return b;
  }
  zones.append(selectButton(yard));
  for(const spec of GARDEN_SPACES) {
    const current=doc.outdoorZones.find(z=>z.type===spec.type);
    const form=document.createElement('form');form.dataset.siteZone=spec.type;
    form.innerHTML=`<label data-caption><input name="enabled" type="checkbox"></label>
      <label>宽（米）<input name="width" type="number" min="1" max="30" step="0.1" required></label>
      <label>进深（米）<input name="depth" type="number" min="1" max="30" step="0.1" required></label><button>应用分区</button>`;
    form.querySelector('[data-caption]').append(spec.name);
    const b=current ? getRoomBounds(current) : spec;
    form.elements.enabled.checked=Boolean(current);form.elements.width.value=b.width.toFixed(1);form.elements.depth.value=b.depth.toFixed(1);
    if(current) form.append(selectButton(current));
    form.onsubmit=e=>{
      e.preventDefault();
      const enabled=form.elements.enabled.checked;
      if(!enabled && !current) return;
      if(!enabled && doc.placements.some(p=>p.containerId===current.id) && !window.confirm('移除此分区及区内家具？可撤销。')) return;
      change(next=>{
        if(!enabled) {
          next.outdoorZones=next.outdoorZones.filter(z=>z.id!==current.id);
          next.placements=next.placements.filter(p=>p.containerId!==current.id);
          return;
        }
        const updated=gardenZone(yard,spec.type,form.elements.width.valueAsNumber,form.elements.depth.valueAsNumber);
        if(current) {
          updated.id=current.id;updated.name=current.name;
          next.outdoorZones[next.outdoorZones.findIndex(z=>z.id===current.id)]=updated;
          const nextBounds=getRoomBounds(updated);
          for(const p of next.placements.filter(p=>p.containerId===current.id)) {
            p.position.x=nextBounds.minX+(p.position.x-b.minX)*nextBounds.width/b.width;
            p.position.z=nextBounds.minY+(p.position.z-b.minY)*nextBounds.depth/b.depth;
            editor.assertWithinBounds(p,next);
          }
        } else next.outdoorZones.push(updated);
      });
    };
    zones.append(form);
  }
  if(zone && zone.type!=='pool') {
    const furniture=folder.querySelector('[data-furniture]');
    for(const {id,label} of YARD_FURNITURE){
      const button=document.createElement('button');button.textContent=label;button.dataset.placeOutdoor=id;
      button.onclick=()=>{try{
        const asset=editor.assets.find(a=>a.id===id);
        if(!asset) throw new Error('目录尚未载入此模型');
        const b=getRoomBounds(zone);
        const preferred=id.includes('plant') ? [.78,.73] : [.42,.48];
        const position={x:b.minX+b.width*preferred[0],y:0,z:b.minY+b.depth*preferred[1]};
        const candidate={position,rotation:{y:0},scale:{x:1,z:1}};
        editor.addAsset(asset,{containerId:zone.id,position:fitsPlacement(candidate,asset,zone)?position:undefined});
      }catch(error){editor.status(error.message,'error');}};
      furniture.append(button);
    }
  }
}
