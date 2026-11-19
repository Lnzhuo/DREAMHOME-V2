import * as THREE from 'three';
import { PALETTES } from '../data/room-brief.js';

// Finish geometry belongs to its wall, so cutaway and floor visibility remain in sync.
export function addTimberPanel(wallGroup, wall, palette, length, height) {
  const width=Math.min(1.28,length*.22);
  const panel=new THREE.Group();
  const dx=wall.end.x-wall.start.x, dz=wall.end.y-wall.start.y;
  panel.position.set(wall.end.x-dx/length*width/2, height/2, wall.end.y-dz/length*width/2);
  panel.rotation.y=-Math.atan2(dz,dx);
  const wood=new THREE.MeshStandardMaterial({color:PALETTES[palette].timber,roughness:.81});
  const backing=new THREE.Mesh(new THREE.BoxGeometry(width,height,.035),wood);
  backing.position.z=.046;
  backing.receiveShadow=true;
  panel.add(backing);
  const count=Math.floor(width/.042);
  const battens=new THREE.InstancedMesh(new THREE.BoxGeometry(.028,height,.026),wood,count);
  const matrix=new THREE.Matrix4(), color=new THREE.Color();
  for(let i=0;i<count;i++) {
    battens.setMatrixAt(i,matrix.makeTranslation((i+.5-count/2)*width/count,0,.073));
    battens.setColorAt(i,color.setScalar(.89+.10*Math.sin(i*3.7)));
  }
  battens.castShadow=true;
  battens.receiveShadow=true;
  panel.add(battens);
  wallGroup.add(panel);
}

export function addPanelledWall(group,wall,room,length,height) {
  const feature=new THREE.Group();
  feature.position.set(wall.start.x,0,wall.start.y);
  feature.rotation.y=-Math.atan2(wall.end.y-wall.start.y,wall.end.x-wall.start.x);
  const dado=room.designWallFinish==='dado';
  const material=new THREE.MeshStandardMaterial({color:dado?'#b87e65':'#918674',roughness:.85});
  function strip(w,h,depth,x,y,z) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,depth),material);
    mesh.position.set(x,y,z);
    mesh.castShadow=mesh.receiveShadow=true;
    feature.add(mesh);
  }
  if(dado) {
    strip(length,1.13,.023,length/2,.565,.049);
    strip(length,.038,.046,length/2,1.13,.061);
  } else {
    const gap=.20, span=(length-gap*4)/3, bottom=.32, top=height-.25;
    for(let i=0;i<3;i++) {
      const left=gap+i*(span+gap);
      for(const x of [left,left+span]) strip(.025,top-bottom,.026,x,(top+bottom)/2,.052);
      for(const y of [bottom,top]) strip(span+.025,.025,.026,left+span/2,y,.052);
    }
  }
  group.add(feature);
}

export function dressWindow(group, opening, centerX, centerZ, yaw, roomHeight) {
  const dressing=new THREE.Group();
  dressing.position.set(centerX,0,centerZ);
  dressing.rotation.y=yaw;
  const width=opening.width.value;
  const h=Math.min(roomHeight-.13,opening.height.value+opening.sillHeight.value+.20);
  const linen=new THREE.MeshStandardMaterial({color:'#f1e9dc',side:THREE.DoubleSide,roughness:.97});
  for(const sign of [-1,1]) {
    const breadth=width*.25;
    const geometry=new THREE.PlaneGeometry(breadth,h,64,18);
    const pos=geometry.attributes.position;
    for(let i=0;i<pos.count;i++) {
      const u=pos.getX(i)/breadth+.5, v=pos.getY(i)/h+.5;
      const fold=Math.sin(u*Math.PI*12+.42*Math.sin(v*3+u*6)+.18*Math.cos(u*19));
      pos.setXYZ(i,pos.getX(i)*(1.12-.16*v)+sign*(width*.5-breadth*.18),
        pos.getY(i)+h/2+.045+.022*Math.cos(u*38)*(1-v),.15+fold*(.064+.028*(1-v))+.028*Math.cos(v*4+u*5));
    }
    geometry.computeVertexNormals();
    const curtain=new THREE.Mesh(geometry,linen);
    curtain.receiveShadow=true;
    curtain.castShadow=true;
    dressing.add(curtain);
  }
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(.013,.013,width*1.23,12),
    new THREE.MeshStandardMaterial({color:'#5b4633',metalness:.55,roughness:.4}));
  rod.position.set(0,h+.075,.14);
  rod.rotation.z=Math.PI/2;
  dressing.add(rod);
  group.add(dressing);
}

let panorama;
export function windowDaylight() {
  panorama ??= new THREE.TextureLoader().load('/studio/forest-window.jpg');
  panorama.colorSpace=THREE.SRGBColorSpace;
  const sky=new THREE.MeshBasicMaterial({map:panorama,color:'#fff8e9',side:THREE.DoubleSide,toneMapped:false});
  sky.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vistaPosition;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n vistaPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader='varying vec3 vistaPosition;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 ray=normalize(vistaPosition-cameraPosition);
      vec2 uvVista=vec2(fract(atan(ray.z,ray.x)/6.283185+.58),asin(clamp(ray.y,-1.,1.))/3.141593+.5);
      diffuseColor.rgb*=texture2D(map,uvVista).rgb*1.35;
    `);
  };
  return sky;
}
