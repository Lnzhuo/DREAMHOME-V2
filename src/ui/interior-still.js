import * as THREE from 'three';

// Snapshot geometry and transforms only. Editor handles, hover state and helpers
// do not belong in the render, and the live scene can keep accepting edits.
function snapshot(node,withCeiling) {
  if((!node.visible && !(withCeiling && node.userData.walkCeiling)) || node.isLight || node.isLine) return null;
  let copy;
  if(node.isInstancedMesh) {
    copy=new THREE.InstancedMesh(node.geometry,node.material,node.count);
    copy.instanceMatrix=node.instanceMatrix;
    copy.instanceColor=node.instanceColor;
  } else if(node.isMesh) copy=new THREE.Mesh(node.geometry,node.material);
  else copy=new THREE.Group();
  copy.name=node.name;
  copy.position.copy(node.position);
  copy.quaternion.copy(node.quaternion);
  copy.scale.copy(node.scale);
  for(const child of node.children) {
    const item=snapshot(child,withCeiling);
    if(item) copy.add(item);
  }
  return copy;
}

async function exportView(game) {
  const unloaded=Object.values(game.placementGroups).some(g=>{
    const asset=game.sceneDocument.assets.find(a=>a.id===g.userData.assetId);
    return asset?.modelUrl && !g.userData.hasRealModel;
  });
  if(unloaded) throw new Error('请等房间里的模型全部载入后再精渲。');
  const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
  const scene=new THREE.Scene();
  const room=game.sceneDocument.buildings.flatMap(b=>b.floors).flatMap(f=>f.rooms).find(r=>r.id===game.activeRoomId);
  const withCeiling=room && game.camera.position.y<game.originOf(room.id).y+room.ceilingHeight.value;
  scene.add(snapshot(game.roomGroup,withCeiling));
  for(const g of Object.values(game.placementGroups)) {
    if(!g.visible) continue;
    const group=new THREE.Group();
    group.position.copy(g.position); group.rotation.copy(g.rotation); group.scale.copy(g.scale);
    const content=snapshot(g.userData.content,false);
    if(content) group.add(content);
    scene.add(group);
  }
  const camera=game.camera.clone(); camera.aspect=1.6; camera.updateProjectionMatrix();scene.add(camera);
  for(const [name,position] of [['sun-source',game.lights.dir.getWorldPosition(new THREE.Vector3())],['composition-target',game.controls.target]]) {
    const marker=new THREE.Object3D();marker.name=name;marker.position.copy(position);scene.add(marker);
  }
  scene.updateMatrixWorld(true);
  return new GLTFExporter().parseAsync(scene,{binary:true,maxTextureSize:2048});
}

export async function renderInteriorStill(game) {
  const dialog=document.createElement('dialog');
  dialog.className='dh-still';
  dialog.innerHTML='<header><strong>室内效果图</strong><button type="button" aria-label="关闭效果图">关闭</button></header><p role="status"></p><img hidden alt="当前三维空间的光线追踪效果图"><a hidden download="DreamHome-室内效果图.jpg">保存效果图</a>';
  document.body.append(dialog);dialog.showModal();
  const abort=new AbortController(), status=dialog.querySelector('p'),img=dialog.querySelector('img'),link=dialog.querySelector('a');
  let url;
  dialog.querySelector('button').onclick=()=>dialog.close();
  dialog.onclose=()=>{abort.abort();if(url) URL.revokeObjectURL(url);dialog.remove();};
  try {
    status.textContent='正在读取当前取景和模型材质…';
    const glb=await exportView(game);
    if(abort.signal.aborted) return;
    status.textContent='正在计算窗边日光、材质反射和间接照明，通常需要一至数分钟。';
    const res=await fetch('/api/render/interior',{method:'POST',headers:{'Content-Type':'model/gltf-binary'},body:glb,signal:abort.signal});
    if(!res.ok) throw new Error((await res.json()).error || '渲染失败');
    const blob=await res.blob();
    if(abort.signal.aborted) return;
    url=URL.createObjectURL(blob);img.src=url;link.href=url;img.hidden=link.hidden=false;status.hidden=true;
  } catch(e) {if(!abort.signal.aborted) status.textContent=e.message;}
}
