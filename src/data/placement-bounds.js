function cross(a, b, p) {
  return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
}

function contains(p, polygon) {
  let inside = false;
  for (let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a = polygon[j], b = polygon[i];
    if (Math.abs(cross(a,b,p))<1e-7 && (p.x-a.x)*(p.x-b.x)+(p.y-a.y)*(p.y-b.y)<1e-7) return true;
    if ((a.y>p.y)!==(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside = !inside;
  }
  return inside;
}

export function modelDimensions(asset) {
  const value=k=>asset.dimensions?.[k]?.value ?? .3;
  const fallback={width:value('width'),height:value('height'),depth:value('depth')};
  const bounds=asset.boundingBox || asset.designReference?.rawBounds || asset.qa?.bounds;
  if(!bounds?.max || !bounds?.min) return fallback;
  const raw=bounds.max.map((v,i)=>v-bounds.min[i]);
  if(raw.length!==3 || raw.some(v=>!Number.isFinite(v) || v<=0)) return fallback;
  const ratio=Math.max(...Object.values(fallback))/Math.max(...raw);
  return {width:raw[0]*ratio,height:raw[1]*ratio,depth:raw[2]*ratio};
}

export function fitsPlacement(placement, asset, room) {
  const {width,depth}=modelDimensions(asset);
  const w = width*placement.scale.x/2;
  const h = depth*placement.scale.z/2;
  const cos = Math.cos(placement.rotation.y), sin = Math.sin(placement.rotation.y);
  const corners = [[-w,-h],[w,-h],[w,h],[-w,h]].map(([x,z]) => ({
    x:placement.position.x+x*cos+z*sin, y:placement.position.z-x*sin+z*cos,
  }));
  if (!corners.every(corner=>contains(corner,room.boundary))) return false;
  for (let i=0;i<corners.length;i++) {
    const a=corners[i], b=corners[(i+1)%corners.length];
    for (let j=0;j<room.boundary.length;j++) {
      const p=room.boundary[j], q=room.boundary[(j+1)%room.boundary.length];
      if (cross(a,b,p)*cross(a,b,q)<-1e-9 && cross(p,q,a)*cross(p,q,b)<-1e-9) return false;
    }
  }
  return true;
}
