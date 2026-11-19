import { getRoomBounds } from './scene-operations.js';

export const GARDEN_SPACES = [
  { type:'terrace', name:'露台', side:'right', width:3.6, depth:3.4 },
  { type:'garage', name:'车库', side:'right-back', width:3.6, depth:5.6 },
  { type:'lawn', name:'草坪', side:'left', width:4, depth:4 },
  { type:'pool', name:'泳池', side:'left-back', width:3.2, depth:5.6 },
];
export const OUTDOOR_COLORS = { courtyard:'#d5cbb6', terrace:'#bea485', garage:'#b8bbb7', lawn:'#91a776', pool:'#65adaf' };
export const YARD_FURNITURE = [
  {id:'polyhaven-outdoor-table-chair-set-01',label:'放置户外桌椅'},
  {id:'polyhaven-potted-plant-01',label:'放置盆栽绿植'},
];
export function gardenZone(yard,type,width,depth) {
  const spec = GARDEN_SPACES.find(s => s.type === type);
  if (!spec) throw new Error('未知室外分区');
  width ??= spec.width; depth ??= spec.depth;
  if (![width,depth].every(v => Number.isFinite(v) && v >= 1 && v <= 30)) throw new Error('室外分区长宽须在 1 至 30 米之间');
  const b = getRoomBounds(yard);
  const x = spec.side.startsWith('left') ? b.minX-width : b.maxX;
  const z = spec.side.endsWith('back') ? b.maxY : b.maxY-depth;
  return {id:yard.id+'-'+type, type, name:spec.name, elevation:yard.elevation,
    boundary:[{x,y:z},{x:x+width,y:z},{x:x+width,y:z+depth},{x,y:z+depth}]};
}
export function fenceSegments(yard) {
  if (!yard.fence?.enabled) return [];
  const b = getRoomBounds(yard);
  const mid=b.centerX, half=yard.fence.gateWidth/2;
  // Leave side passages at the house end for the adjacent terrace and lawn.
  return [[b.minX,b.minY,mid-half,b.minY],[mid+half,b.minY,b.maxX,b.minY],
    [b.minX,b.minY,b.minX,Math.max(b.minY,b.maxY-1.2)],[b.maxX,b.minY,b.maxX,Math.max(b.minY,b.maxY-1.2)]]
    .filter(([x,z,ex,ez]) => Math.hypot(ex-x,ez-z)>.05);
}
