import { API_ROUTES } from '../core/api-contracts.js';

// Autosave timestamps change while inference is running. Only a change to
// editable data or project identity invalidates the user's pending command.
const sceneFingerprint = scene => JSON.stringify(scene,(key,value)=>key==='updatedAt'?undefined:value);

function designContext(scene) {
  return {
    buildings: (scene.buildings || []).map(b => ({ floors:(b.floors || []).map(f=>({ rooms:(f.rooms || []).map(({id,name,boundary})=>({id,name,boundary})) })) })),
    assets:(scene.assets || []).map(({id,name,category,dimensions})=>({id,name,category,dimensions})),
    placements:(scene.placements || []).map(({id,assetId,containerId,position,rotation})=>({id,assetId,containerId,position,rotation})),
    materials:(scene.materials || []).map(({id,name,category})=>({id,name,category})),
  };
}
async function referencePalette(file) {
  const bitmap=await createImageBitmap(file);
  try {
    const canvas=document.createElement('canvas');
    canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(bitmap,0,0,64,64);
    const pixels=ctx.getImageData(0,0,64,64).data, bins=new Map();
    for (let i=0;i<pixels.length;i+=4) {
      if(pixels[i+3]<128) continue;
      const [r,g,b]=pixels.subarray(i,i+3), key=(r>>4)*256+(g>>4)*16+(b>>4);
      const sum=bins.get(key)||[0,0,0,0];
      sum[0]+=r;sum[1]+=g;sum[2]+=b;sum[3]++;bins.set(key,sum);
    }
    return [...bins.values()].sort((a,b)=>b[3]-a[3]).slice(0,4)
      .map(sum=>'#'+sum.slice(0,3).map(v=>Math.round(v/sum[3]).toString(16).padStart(2,'0')).join(''));
  } finally { bitmap.close(); }
}

export class AIAssistantPanel {
  constructor({ root, executor, onStatus }) {
    this.root = root;
    this.executor = executor;
    this.onStatus = onStatus;
    this.pendingPlan = null;
    this.requestSequence = 0;
    this.pendingScene = null;
  }

  mount() {
    this.root.innerHTML = `
      <div class="dh-ai-messages"><div class="dh-ai-message">描述想调整的家具、位置或墙地材料，也可以附一张参考图。查看方案后再应用。</div></div>
      <button class="dh-button dh-secondary" data-action="whole-design" type="button">按描述新建整套搭配</button>
      <form class="dh-ai-form"><div class="dh-ai-input-row"><input class="dh-input" placeholder="例如：把茶几向右移 20 厘米" aria-label="设计指令"/><button class="dh-button dh-primary" type="submit">发送</button></div></form>
      <label>参考图片（可选） <input type="file" data-ai-image accept="image/png,image/jpeg,image/webp" /></label>
      <div class="dh-ai-preview" hidden></div>
      <div class="dh-row"><button class="dh-button dh-secondary" data-action="undo" type="button">撤销上次修改</button></div>`;
    this.root.querySelector('[data-action="whole-design"]')?.addEventListener('click',()=>this.onCreateDesign?.());
    this.root.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = this.root.querySelector('input');
      if (input.value.trim()) this.send(input.value.trim());
      input.value = '';
    });
    this.root.querySelector('[data-action="undo"]').addEventListener('click', () => this.executor.undo());
    return this;
  }

  message(text, role = 'assistant') {
    const messages = this.root.querySelector('.dh-ai-messages');
    const item = document.createElement('div');
    item.className = 'dh-ai-message';
    item.dataset.role = role;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  async send(text) {
    const requestId = ++this.requestSequence;
    const sceneDocument = structuredClone(this.executor.editor.getSceneDocument());
    const sceneSnapshot = sceneFingerprint(sceneDocument);
    const previous = this.clarification?.scene === sceneSnapshot ? this.clarification : null;
    const requestText = previous ? `先前要求：${previous.prompt}\n助手对该要求的提问：${previous.questions.join('；')}\n用户的新回复：${text}` : text;
    this.clarification = null;
    this.pendingPlan = null;
    this.pendingScene = null;
    this.root.querySelector('.dh-ai-preview').hidden = true;
    this.message(text, 'user');
    this.message('正在请求真实 AI 服务…');
    try {
      const libraryResponse = await fetch('/api/library/index.json');
      if (!libraryResponse.ok) throw new Error('无法读取资源库');
      const catalog = await libraryResponse.json();
      if (requestId !== this.requestSequence) return;
      if (sceneSnapshot !== sceneFingerprint(this.executor.editor.getSceneDocument())) { this.message('项目已发生变化，请重新发送指令'); return; }
      this.executor.catalog = catalog;
      const file = this.root.querySelector('[data-ai-image]').files[0];
      if (file && file.size > 3 * 1024 * 1024) throw new Error('参考图片不能超过 3 MB');
      const image = file ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file); }) : undefined;
      const palette = file ? await referencePalette(file).catch(()=>[]) : [];
      const message = palette.length
        ? requestText + '\n图片中按像素占比从高到低的参考色为 ' + palette.join('、') + '。如要求修改家具颜色，请根据画面选择与要求匹配的真实色值，用 set_material 的 color 字段生成方案；仅用户要求更换材料时才用 materialId。界面会让用户确认方案。'
        : requestText;
      const response = await fetch(API_ROUTES.sceneCommand, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, image, sceneDocument:designContext(sceneDocument), selection: { roomId: this.executor.editor.game?.activeRoomId, placementId: this.executor.editor.selectedId } }),
      });
      const body = await response.json();
      if (requestId !== this.requestSequence) return;
      if (sceneSnapshot !== sceneFingerprint(this.executor.editor.getSceneDocument())) { this.message('项目已发生变化，请重新发送指令'); return; }
      if (!response.ok) throw new Error(body.error || `AI 服务不可用（${response.status}）`);
      if (body.questions?.length) this.clarification = { scene:sceneSnapshot, prompt:previous?.prompt || text, questions:body.questions };
      this.pendingScene = sceneSnapshot;
      this.pendingPlan = body;
      this.showPreview(body);
    } catch (error) {
      if (requestId !== this.requestSequence) return;
      this.message(error.message);
      this.onStatus?.(error.message, 'error');
    }
  }

  showPreview(plan) {
    const preview = this.executor.preview(plan);
    const panel = this.root.querySelector('.dh-ai-preview');
    panel.hidden = false;
    panel.innerHTML = '';
    const summary = document.createElement('strong');
    summary.textContent = plan.summary;
    const list = document.createElement('ul');
    for (const change of preview.changes) {
      const item = document.createElement('li');
      item.textContent = change;
      list.appendChild(item);
    }
    panel.append(summary, list);
    for (const question of preview.questions || []) {
      const item = document.createElement('div');
      item.className = 'dh-error';
      item.textContent = `需要确认：${question}`;
      panel.appendChild(item);
    }
    for (const warning of preview.warnings || []) {
      const item = document.createElement('div');
      item.className = 'dh-muted';
      item.textContent = warning;
      panel.appendChild(item);
    }
    for (const error of preview.errors || []) {
      const item = document.createElement('div');
      item.className = 'dh-error';
      item.textContent = error.message;
      panel.appendChild(item);
    }
    if (preview.canApply) {
      const row = document.createElement('div');
      row.className = 'dh-row';
      const apply = document.createElement('button');
      apply.className = 'dh-button dh-primary';
      apply.textContent = '应用修改';
      const cancel = document.createElement('button');
      cancel.className = 'dh-button dh-secondary';
      cancel.textContent = '取消';
      apply.addEventListener('click', () => {
        try {
          if (!this.pendingPlan || this.pendingScene !== sceneFingerprint(this.executor.editor.getSceneDocument())) { panel.hidden = true; this.pendingPlan = null; this.message('项目已发生变化，请重新发送指令'); return; }
          this.executor.apply(this.pendingPlan);
          this.message(`已应用：${this.pendingPlan.summary}`);
          panel.hidden = true;
          this.pendingPlan = null;
        } catch (error) { this.message(error.message); }
      });
      cancel.addEventListener('click', () => { panel.hidden = true; this.pendingPlan = null; });
      row.append(apply, cancel);
      panel.appendChild(row);
    }
  }
}
