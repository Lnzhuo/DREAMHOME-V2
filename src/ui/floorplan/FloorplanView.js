import { OUTDOOR_COLORS, fenceSegments } from '../../data/villa-site.js';
import { getPrimaryRoomContext } from '../../core/api-contracts.js';
import { getRoomBounds } from '../../data/scene-operations.js';
import { modelDimensions } from '../../data/placement-bounds.js';

const NS = 'http://www.w3.org/2000/svg';
const node = (name, attributes = {}) => {
  const element = document.createElementNS(NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
};

function drawStair(svg, stair, isOpening) {
  if (!stair) return;
  const {x, z, width, depth} = stair;
  const group = node('g', { 'data-stair':isOpening ? 'opening' : 'up', 'pointer-events':'none' });
  const title = node('title');
  title.textContent = isOpening ? '通往下层的楼板洞口' : '上行楼梯';
  group.append(title);
  group.append(node('rect', { x, y:z, width, height:depth, fill:isOpening ? 'none' : '#ded1bb',
    stroke:isOpening ? '#686663' : '#88704e', 'stroke-width':.042, 'stroke-dasharray':isOpening ? '.12 .08' : 'none' }));
  if (!isOpening) {
    for (let step=1; step<stair.steps; step++) {
      const y=z+depth*step/stair.steps;
      group.append(node('line',{x1:x,y1:y,x2:x+width,y2:y,stroke:'#9c896d','stroke-width':.025}));
    }
    const mid=x+width/2, start=z+depth*.15, end=z+depth*.85;
    group.append(node('path',{d:`M ${mid} ${start} V ${end} m ${-width*.18} ${-width*.35} l ${width*.18} ${width*.35} l ${width*.18} ${-width*.35}`,
      stroke:'#4e503d','stroke-width':.055,fill:'none'}));
  }
  svg.append(group);
}

export class FloorplanView {
  constructor({ root, editor }) {
    this.root = root;
    this.editor = editor;
  }

  mount() {
    this.unsubscribe = this.editor.subscribe(() => this.render());
    this.root.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.root.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.root.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    this.render();
    return this;
  }

  point(event) {
    const svg = this.root.querySelector('svg');
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }

  updateRect(rect, placement) {
    const asset = this.editor.getSceneDocument().assets.find((entry) => entry.id === placement.assetId);
    const bounds = modelDimensions(asset);
    const width = bounds.width * placement.scale.x;
    const depth = bounds.depth * placement.scale.z;
    const x = placement.position.x - Number(rect.dataset.originX || 0);
    const z = placement.position.z - Number(rect.dataset.originZ || 0);
    rect.setAttribute('x', x - width / 2);
    rect.setAttribute('y', z - depth / 2);
    rect.setAttribute('width', width);
    rect.setAttribute('height', depth);
    rect.setAttribute('transform', `rotate(${-placement.rotation.y * 180 / Math.PI} ${x} ${z})`);
    if (rect.planImage) for (const attr of ['x','y','width','height','transform']) rect.planImage.setAttribute(attr,rect.getAttribute(attr));
  }

  onPointerDown(event, placement, rect) {
    event.preventDefault();
    const point = this.point(event);
    this.dragging = {
      id: placement.id,
      before: structuredClone(this.editor.getSceneDocument()),
      offsetX: point.x - placement.position.x,
      offsetY: point.y - placement.position.z,
      moved: false,
    };
    this.editor.selectPlacement(placement.id);
    this.dragging.rect = this.root.querySelector(`[data-placement-id="${placement.id}"]`);
    this.dragging.rect?.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.dragging) return;
    const point = this.point(event);
    const x = point.x - this.dragging.offsetX;
    const z = point.y - this.dragging.offsetY;
    const placement = this.editor.game.updatePlacementTransform(this.dragging.id, { position: { x, z } });
    this.dragging.moved = true;
    if (this.dragging.rect) this.updateRect(this.dragging.rect, placement);
  }

  onPointerUp() {
    if (!this.dragging) return;
    const { id, before, moved } = this.dragging;
    this.dragging = null;
    if (!moved) return;
    try {
      const placement = this.editor.getSceneDocument().placements.find((entry) => entry.id === id);
      this.editor.assertWithinBounds(placement);
      this.editor.pushHistory(before);
      this.editor.selectPlacement(id);
      this.editor.emit();
    } catch (error) {
      this.editor.game.replaceSceneDocument(before);
      this.editor.selectPlacement(id);
      this.editor.status(`已回滚：${error.message}`, 'error');
    }
    this.render();
  }

  render() {
    if (!this.root) return;
    const sceneDocument = this.editor.getSceneDocument();
    const primary = getPrimaryRoomContext(sceneDocument);
    let activeBuilding = primary.building;
    let floor = primary.floor;
    let room = primary.room;
    if (this.editor.game.activeRoomId) {
      for (const building of sceneDocument.buildings) {
        for (const candidateFloor of building.floors) {
          const candidate = candidateFloor.rooms.find((entry) => entry.id === this.editor.game.activeRoomId);
          if (candidate) {
            activeBuilding = building;
            floor = candidateFloor;
            room = candidate;
          }
        }
      }
    }
    const roomBounds = floor.rooms.map(getRoomBounds);
    const minX = Math.min(...roomBounds.map(b=>b.minX)), minY = Math.min(...roomBounds.map(b=>b.minY));
    const maxX = Math.max(...roomBounds.map(b=>b.maxX)), maxY = Math.max(...roomBounds.map(b=>b.maxY));
    const bounds = {minX,minY,maxX,maxY,width:maxX-minX,depth:maxY-minY,centerX:(minX+maxX)/2,centerY:(minY+maxY)/2};
    const zones = floor.levelIndex === 0 ? sceneDocument.outdoorZones.map(zone => ({
      ...zone, boundary: zone.boundary.map(p => ({ x:p.x-activeBuilding.origin.x, y:p.y-activeBuilding.origin.z }))
    })) : [];
    const zoneIds = new Set(zones.map(z => z.id));
    const extents = [bounds, ...zones.map(getRoomBounds)];
    const viewMinX = Math.min(...extents.map(b => b.minX)), viewMaxX = Math.max(...extents.map(b => b.maxX));
    const viewMinY = Math.min(...extents.map(b => b.minY)), viewMaxY = Math.max(...extents.map(b => b.maxY));
    const margin = 0.65;
    this.root.innerHTML = '';
    const svg = node('svg', {
      viewBox: `${viewMinX - margin} ${viewMinY - margin} ${viewMaxX - viewMinX + margin * 2} ${viewMaxY - viewMinY + margin * 2}`,
      class: 'dh-floorplan-svg',
      role: 'img',
      'aria-label': `${room.name} 2D 平面图`,
    });
    for (const zone of zones) {
      const selected = zone.id === this.editor.game.activeRoomId;
      const polygon = node('polygon', { points:zone.boundary.map(p => p.x + ',' + p.y).join(' '),
        'data-outdoor-zone':zone.id, fill:OUTDOOR_COLORS[zone.type] || '#d8e3ce', stroke:selected?'#486849':'#959c90',
        'stroke-width':selected ? .11 : .045, style:'cursor:pointer' });
      polygon.addEventListener('click',()=>{this.editor.game.setActiveRoom(zone.id);this.editor.selectPlacement(null);});
      svg.append(polygon);
      for (const [x,z,ex,ez] of fenceSegments(zone)) svg.append(node('line',{
        x1:x,y1:z,x2:ex,y2:ez,stroke:'#705e50','stroke-width':.095,'pointer-events':'none','data-fence':zone.id
      }));
      const b = getRoomBounds(zone);
      if(zone.type==='garage') svg.append(node('polyline',{
        points:`${b.minX},${b.minY} ${b.minX},${b.maxY} ${b.maxX},${b.maxY} ${b.maxX},${b.minY}`,
        stroke:'#747770','stroke-width':.1,fill:'none','pointer-events':'none'
      }));
      const label = node('text', { x:b.centerX,y:b.centerY,class:'dh-room-label','text-anchor':'middle','pointer-events':'none' });
      label.textContent = zone.name;
      svg.append(label);
    }
    for (const current of floor.rooms) {
      const polygon = node('polygon', { points: current.boundary.map(point => `${point.x},${point.y}`).join(' '), fill: current.id === room.id ? '#e2efe5' : '#fffaf2', 'data-room-polygon':'true', stroke: '#d4c8b9', 'stroke-width': 0.025, style: 'cursor:pointer' });
      polygon.addEventListener('click', () => { this.editor.game.setActiveRoom(current.id); this.editor.emit(); });
      svg.appendChild(polygon);
      const b = getRoomBounds(current);
      const label = node('text', {x:b.centerX,y:b.centerY,class:'dh-room-label','text-anchor':'middle',style:'pointer-events:none'});
      label.textContent = current.name;
      svg.appendChild(label);
    }

    for (const wall of floor.walls) {
      svg.appendChild(node('line', {
        x1: wall.start.x, y1: wall.start.y, x2: wall.end.x, y2: wall.end.y,
        stroke: '#4b4238', 'stroke-width': wall.thickness.value, 'stroke-linecap': 'square',
      }));
    }
    for (const opening of floor.openings) {
      const wall = floor.walls.find((entry) => entry.id === opening.wallId);
      if (!wall) continue;
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      const dx = (wall.end.x - wall.start.x) / length;
      const dy = (wall.end.y - wall.start.y) / length;
      const start = opening.offsetFromWallStart;
      const end = start + opening.width.value;
      svg.appendChild(node('line', {
        x1: wall.start.x + dx * start, y1: wall.start.y + dy * start,
        x2: wall.start.x + dx * end, y2: wall.start.y + dy * end,
        stroke: '#3c8a68', 'stroke-width': Math.max(0.05, wall.thickness.value * 1.2),
      }));
    }

    if (activeBuilding.roof?.enabled && floor === activeBuilding.floors.reduce((a,b)=>a.elevation>b.elevation?a:b)) {
      const ridge = node('line',{x1:bounds.centerX,y1:bounds.minY-.14,x2:bounds.centerX,y2:bounds.maxY+.14,
        stroke:'#82766b','stroke-width':.045,'stroke-dasharray':'.16 .10','data-roof-ridge':activeBuilding.id,'pointer-events':'none'});
      const title = node('title');title.textContent='坡屋顶屋脊投影';ridge.append(title);svg.append(ridge);
    }
    drawStair(svg, floor.stairs, false);
    drawStair(svg, floor.stairOpening, true);
    const widthLabel = node('text', { x: bounds.centerX, y: bounds.maxY + 0.38, class: 'dh-dimension', 'text-anchor': 'middle' });
    widthLabel.textContent = `${bounds.width.toFixed(2)} m`;
    svg.appendChild(widthLabel);
    const depthLabel = node('text', { x: bounds.minX - 0.36, y: bounds.centerY, class: 'dh-dimension', 'text-anchor': 'middle', transform: `rotate(-90 ${bounds.minX - 0.36} ${bounds.centerY})` });
    depthLabel.textContent = `${bounds.depth.toFixed(2)} m`;
    svg.appendChild(depthLabel);

    for (const placement of sceneDocument.placements.filter((entry) => floor.rooms.some(room => room.id === entry.containerId) || zoneIds.has(entry.containerId))) {
      const asset = sceneDocument.assets.find((entry) => entry.id === placement.assetId);
      if (!asset?.dimensions) continue;
      const rect = node('rect', {
        rx: 0.04,
        fill: asset.appearance?.color || asset.procedural?.color || '#b88a55',
        'fill-opacity': placement.id === this.editor.selectedId ? 0.9 : 0.65,
        stroke: placement.id === this.editor.selectedId ? '#9b6232' : '#5c5144',
        'stroke-width': placement.id === this.editor.selectedId ? 0.045 : 0.018,
        'data-placement-id': placement.id,
        class: 'dh-furniture-footprint',
      });
      if (zoneIds.has(placement.containerId)) {
        rect.dataset.originX = activeBuilding.origin.x;
        rect.dataset.originZ = activeBuilding.origin.z;
      }
      const preview = asset.planThumbnailUrl || this.editor.assets?.find(entry=>entry.id===asset.id)?.planThumbnailUrl;
      if (preview && (/^\/api\/library\/models\/[\w-]+\/plan\.png$/.test(preview) || /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(preview))) {
        const topView = node('image',{href:preview,'pointer-events':'none',preserveAspectRatio:'none'});
        rect.planImage = topView;
        rect.setAttribute('fill-opacity',placement.id===this.editor.selectedId?'0.2':'0.03');
        svg.appendChild(topView);
      }
      this.updateRect(rect, placement);
      rect.addEventListener('pointerdown', (event) => this.onPointerDown(event, placement, rect));
      svg.appendChild(rect);
    }
    if (this.onRenderFloor?.(svg, floor, bounds)) svg.querySelectorAll('[data-room-polygon]').forEach(polygon => polygon.setAttribute('fill-opacity', '0.4'));
    this.root.appendChild(svg);
  }

  destroy() {
    this.unsubscribe?.();
  }
}
