import * as THREE from 'three';
import { getRoomBounds } from '../data/scene-operations.js';
import { OUTDOOR_COLORS, fenceSegments } from '../data/villa-site.js';

const material = (color, opts={}) => new THREE.MeshStandardMaterial({ color, roughness:.78, ...opts });
function box(group, width,height,depth,x,y,z,mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),mat);
  mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh);
  return mesh;
}
export function createOutdoorZone(root,zone) {
  const group = new THREE.Group(); group.name='outdoor:'+zone.id; group.position.y=zone.elevation;
  root.add(group);
  const shape = new THREE.Shape(zone.boundary.map(p => new THREE.Vector2(p.x,-p.y)));
  const water = zone.type === 'pool';
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI/2),
    material(OUTDOOR_COLORS[zone.type] || '#a6ac94', water ? {roughness:.15,metalness:.18} : {}));
  ground.userData.outdoorZoneId=zone.id; ground.position.y=.01;ground.receiveShadow=true;group.add(ground);
  const b=getRoomBounds(zone);
  if(water) {
    const coping=material('#dfdfd2');
    for(const z of [b.minY,b.maxY]) box(group,b.width+.18,.12,.18,b.centerX,.07,z,coping);
    for(const x of [b.minX,b.maxX]) box(group,.18,.12,b.depth,x,.07,b.centerY,coping);
  }
  if(zone.type==='garage') {
    const frame=material('#727b74'),roof=material('#bdbeb2');
    for(const x of [b.minX+.09,b.maxX-.09])
      for(const z of [b.minY+.09,b.maxY-.09]) box(group,.14,2.5,.14,x,1.25,z,frame);
    const wall=material('#dbd8ca'), thickness=.12;
    box(group,b.width,2.4,thickness,b.centerX,1.2,b.maxY-thickness/2,wall);
    for (const x of [b.minX+thickness/2,b.maxX-thickness/2]) box(group,thickness,2.4,b.depth,x,1.2,b.centerY,wall);
    box(group,b.width,.18,thickness,b.centerX,2.4,b.minY+thickness/2,frame);
    const cover=box(group,b.width+.12,.16,b.depth+.12,b.centerX,2.57,b.centerY,roof);
    cover.userData.exteriorRoof=true;
  }
  const fenceMat=material('#8c7761');
  for(const [x,z,ex,ez] of fenceSegments(zone)) {
    const width=Math.hypot(ex-x,ez-z),height=zone.fence.height;
    const section=new THREE.Group();section.position.set(x,0,z);section.rotation.y=-Math.atan2(ez-z,ex-x);
    group.add(section);
    for(const h of [.24,height-.08]) box(section,width,.09,.075,width/2,h,0,fenceMat);
    const posts=Math.min(256,Math.ceil(width/.8));
    for(let i=0;i<=posts;i++) box(section,.075,height,.075,i*width/posts,height/2,0,fenceMat);
  }
}
export function createVillaRoof(root,building) {
  if (!building.roof?.enabled || !building.floors.length) return;
  const floor=building.floors.reduce((a,b)=>a.elevation>b.elevation?a:b);
  const b=getRoomBounds({boundary:floor.rooms.flatMap(r=>r.boundary)});
  const eaves=.22, rise=building.roof.rise, half=b.width/2+eaves;
  const profile=new THREE.Shape();
  profile.moveTo(-half,0);profile.lineTo(0,rise);profile.lineTo(half,0);
  profile.lineTo(half,-.12);profile.lineTo(-half,-.12);profile.closePath();
  const roof=new THREE.Mesh(new THREE.ExtrudeGeometry(profile,{depth:b.depth+2*eaves,bevelEnabled:false}),material('#7e817b'));
  roof.position.set(building.origin.x+b.centerX,building.origin.y+floor.elevation+floor.floorHeight+.13,building.origin.z+b.minY-eaves);
  roof.name='roof:'+building.id;roof.userData.exteriorRoof=true;roof.castShadow=true;roof.receiveShadow=true;root.add(roof);
}
