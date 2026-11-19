import { createOutdoorZone, createVillaRoof } from './createVillaSite.js';
import * as THREE from 'three';
import { createRoom } from './createRoom.js';

export function createBuilding(scene, sceneDocument) {
  const building = new THREE.Group(); building.name = 'dreamhome-building'; scene.add(building);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),new THREE.MeshStandardMaterial({ color:'#ded7ca',roughness:1 }));
  ground.rotation.x=-Math.PI/2;ground.position.y=-0.02;ground.receiveShadow=true;building.add(ground);
  for (const zone of sceneDocument.outdoorZones || []) createOutdoorZone(building,zone);
  for (const definition of sceneDocument.buildings) createVillaRoof(building,definition);
  let lights=null;const renderedWalls=new Set();
  for(const buildingData of sceneDocument.buildings) for(const floor of buildingData.floors) {
    const level=new THREE.Group();level.name=`floor:${floor.id}`;level.userData.floorId=floor.id;level.position.set(buildingData.origin.x,buildingData.origin.y+floor.elevation,buildingData.origin.z);building.add(level);
    for(const room of floor.rooms) {const result=createRoom(level,sceneDocument,room.id,{includeLights:!lights,renderedWalls});if(result.lights)lights=result.lights;}
    if(floor.stairs) {
      const stair=floor.stairs,group=new THREE.Group();group.name=`stairs:${floor.id}`;group.userData.staircase=true;group.userData.floorId=floor.id;
      const material=new THREE.MeshStandardMaterial({color:'#b6a18b',roughness:.8});
      for(let i=0;i<stair.steps;i++) {const rise=floor.floorHeight*(i+1)/stair.steps;const mesh=new THREE.Mesh(new THREE.BoxGeometry(stair.width,rise,stair.depth/stair.steps),material);mesh.position.set(stair.x+stair.width/2,rise/2,stair.z+stair.depth*(i+.5)/stair.steps);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
      level.add(group);
    }
  }
  return {room:building,lights};
}
