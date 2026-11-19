const ns = 'http://www.w3.org/2000/svg';
const floorsOf = doc => doc.buildings.flatMap(b => b.floors);
function referenceFor(doc, floorId) {
  return floorId === floorsOf(doc)[0]?.id ? doc.referencePlan : doc.referencePlans?.[floorId];
}

export function attachReferencePlan({root, editor, repo, floorplan}) {
  root.innerHTML = `<details><summary>户型图与空间参考</summary>
    <label>本层参考照片或户型图 <input type="file" accept="image/png,image/jpeg,image/webp"></label>
    <label>整张图的实际宽度（米） <input data-width type="number" min="0.2" max="300" step="0.1"></label>
    <div class="dh-row"><button data-scale>应用比例</button><button data-clear>移除底图</button></div>
    <small data-name>上传后可在本层 2D 平面中对照编辑。</small></details>`;
  const widthInput = root.querySelector('[data-width]');
  const nameLabel = root.querySelector('[data-name]');
  let displayedId, displayUrl, lastWidth, uploadTicket = 0;
  const activeFloorId = () => {
    const floors = floorsOf(editor.getSceneDocument());
    return (floors.find(f => f.rooms.some(r => r.id === editor.game.activeRoomId)) || floors[0]).id;
  };
  function set(floorId, ref) {
    editor.runWithHistory(() => {
      const next = structuredClone(editor.getSceneDocument());
      if (floorId === floorsOf(next)[0].id) {
        if (ref) next.referencePlan = ref;
        else delete next.referencePlan;
      } else {
        next.referencePlans ||= {};
        if (ref) next.referencePlans[floorId] = ref;
        else delete next.referencePlans[floorId];
      }
      editor.game.commitScene(next);
    });
  }
  const readWidth = () => {
    const width = Number(widthInput.value);
    if (!Number.isFinite(width) || width < .2 || width > 300) throw new Error('图纸宽度须在 0.2 至 300 米之间');
    return width;
  };
  root.querySelector('input[type=file]').addEventListener('change', async e => {
    const [file] = e.target.files;
    e.target.value = '';
    if (!file) return;
    const ticket = ++uploadTicket;
    try {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12*1024*1024) throw new Error('请选择 12 MB 以内的 JPG、PNG 或 WebP 图片');
      const projectId = editor.getSceneDocument().projectId;
      const floorId = activeFloorId();
      const width = readWidth();
      const bitmap = await createImageBitmap(file);
      const ratio = bitmap.height / bitmap.width;
      bitmap.close();
      const id = await repo.putReference(file);
      if (ticket !== uploadTicket || editor.getSceneDocument().projectId !== projectId || activeFloorId() !== floorId) {
        await repo.deleteAsset(id);
        return;
      }
      set(floorId, {blobId:id, name:file.name, type:file.type, width, ratio});
    } catch(error) { editor.status(error.message,'error'); }
  });
  root.querySelector('[data-scale]').onclick = () => {
    const floorId = activeFloorId();
    const ref = referenceFor(editor.getSceneDocument(), floorId);
    if (!ref) return;
    try { set(floorId, {...ref, width:readWidth()}); }
    catch (error) { editor.status(error.message,'error'); }
  };
  root.querySelector('[data-clear]').onclick = () => { uploadTicket++; set(activeFloorId(), null); };
  floorplan.onRenderFloor = (svg, floor, bounds) => {
    const ref = referenceFor(editor.getSceneDocument(), floor.id);
    const width = ref?.width ?? 10;
    if (displayedId !== ref?.blobId || lastWidth !== width) widthInput.value = width;
    lastWidth = width;
    nameLabel.textContent = ref?.name || '上传后可在本层 2D 平面中对照编辑。';
    if (displayedId !== ref?.blobId) {
      if (displayUrl) URL.revokeObjectURL(displayUrl);
      displayUrl = null;
      displayedId = ref?.blobId;
      if (ref) repo.getAssetBlob(ref.blobId).then(blob => {
        if (displayedId !== ref.blobId) return;
        if (!blob) throw new Error('此楼层的参考图文件已丢失');
        displayUrl = URL.createObjectURL(blob);
        floorplan.render();
      }).catch(error => editor.status(error.message, 'error'));
    }
    if (!ref || !displayUrl) return false;
    const image = document.createElementNS(ns, 'image');
    image.setAttribute('data-reference-plan', floor.id);
    const w = ref.width, h = w * ref.ratio;
    for (const [key, value] of Object.entries({href:displayUrl,x:bounds.centerX-w/2,y:bounds.centerY-h/2,width:w,height:h,opacity:.67,'pointer-events':'none'})) image.setAttribute(key,value);
    svg.insertBefore(image, svg.firstChild);
    return true;
  };
  floorplan.render();
}
