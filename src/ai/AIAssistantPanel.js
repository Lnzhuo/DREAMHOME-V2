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
  constructor({ root, executor, onOpenApi, onSourceMismatch }) {
    this.root = root;
    this.executor = executor;
    this.onOpenApi = onOpenApi;
    this.onSourceMismatch = onSourceMismatch;
    this.pendingPlan = null;
    this.requestSequence = 0;
    this.pendingScene = null;
  }

  mount() {
    this.root.innerHTML = `
      <header class="dh-chat-header">
        <h2>AI 设计助手</h2>
        <div class="dh-chat-service">
          <span data-ai-service aria-live="polite">正在读取服务…</span>
          <button class="dh-chat-link" type="button" data-action="ai-settings">API 设置</button>
        </div>
      </header>
      <div class="dh-ai-thread">
        <div class="dh-chat-intro">
          <h3>想怎么改这个空间？</h3>
          <p>描述家具摆放、配色或材质。助手会给出修改方案，等你确认后应用。</p>
          <div class="dh-chat-examples" aria-label="指令示例" role="group">
            <button type="button">把茶几向右移 20 厘米</button>
            <button type="button">把沙发改成深绿色</button>
            <button type="button">给窗边加一盏落地灯</button>
          </div>
        </div>
        <div class="dh-ai-messages" role="log" aria-label="设计对话"></div>
        <div class="dh-ai-preview" role="region" aria-label="修改方案" hidden></div>
        <div class="dh-chat-thinking" role="status"></div>
      </div>
      <div class="dh-chat-footer">
        <form class="dh-ai-form">
          <textarea name="message" rows="3" aria-label="设计指令" placeholder="描述你想调整的细节"></textarea>
          <div class="dh-chat-attachment" hidden>
            <span data-ai-filename></span>
            <button class="dh-chat-link" type="button" data-remove-image>移除</button>
          </div>
          <p class="dh-chat-input-error" role="status"></p>
          <div class="dh-chat-compose-actions">
            <label class="dh-chat-attach">
              <input type="file" data-ai-image accept="image/png,image/jpeg,image/webp" aria-label="添加参考图" />
              <span aria-hidden="true">添加参考图</span>
            </label>
            <button class="dh-button dh-primary" type="submit" disabled>发送</button>
          </div>
        </form>
        <div class="dh-chat-tools">
          <button class="dh-chat-link" data-action="whole-design" type="button">新建整套搭配</button>
          <button class="dh-chat-link" data-action="undo" type="button">撤销上次修改</button>
        </div>
      </div>`;
    this.thread = this.root.querySelector('.dh-ai-thread');
    this.form = this.root.querySelector('form');
    this.input = this.form.elements.message;
    this.fileInput = this.form.querySelector('[data-ai-image]');
    this.submit = this.form.querySelector('[type="submit"]');
    this.root.querySelector('[data-action="ai-settings"]').onclick = () => this.onOpenApi?.();
    this.root.querySelector('[data-action="whole-design"]').onclick = () => this.onCreateDesign?.();
    this.root.querySelector('[data-action="undo"]').onclick = () => {
      this.message(this.executor.undo() ? '已撤销上次修改。' : '当前没有可撤销的修改。');
    };
    for (const example of this.root.querySelectorAll('.dh-chat-examples button')) {
      example.onclick = () => {
        this.input.value = example.textContent;
        this.input.focus();
        this.updateComposer();
      };
    }
    this.input.oninput = () => this.updateComposer();
    this.input.onkeydown = (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (!this.submit.disabled) this.form.requestSubmit();
    };
    this.fileInput.onchange = () => this.updateAttachment();
    this.form.querySelector('[data-remove-image]').onclick = () => {
      this.fileInput.value = '';
      this.updateAttachment();
      this.fileInput.focus();
    };
    this.form.onsubmit = (event) => {
      event.preventDefault();
      const text = this.input.value.trim();
      if (this.busy || !text) return;
      const file = this.fileInput.files[0];
      this.form.reset();
      this.updateAttachment();
      this.send(text, file);
    };
    return this;
  }

  setService(service) {
    this.serviceSource = service?.source;
    const label = this.root.querySelector('[data-ai-service]');
    if (!service) {
      label.textContent = '服务状态未读取';
    } else if (service.source === 'byok') {
      label.textContent = `个人 API · ${service.model}`;
    } else {
      label.textContent = service.platformConfigured ? '平台模型' : '等待配置 API';
    }
    label.title = label.textContent;
  }

  updateComposer() {
    if (this.submit) this.submit.disabled = this.busy || !this.input.value.trim();
  }

  updateAttachment() {
    const file = this.fileInput.files[0];
    const supported = !file || ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
    const oversized = file?.size > 3 * 1024 * 1024;
    const error = supported ? (oversized ? '参考图最大 3 MB。' : '') : '请添加 PNG、JPEG 或 WebP 图片。';
    if (error) this.fileInput.value = '';
    this.form.querySelector('.dh-chat-input-error').textContent = error;
    this.form.querySelector('.dh-chat-attachment').hidden = !file || Boolean(error);
    this.form.querySelector('[data-ai-filename]').textContent = file && !error ? file.name : '';
    this.updateComposer();
  }

  setBusy(busy) {
    this.busy = busy;
    const state = this.root.querySelector('.dh-chat-thinking');
    state.textContent = busy ? '正在生成修改方案…' : '';
    this.updateComposer();
    if (busy) this.scrollToLatest();
  }

  scrollToLatest() {
    if (this.thread) this.thread.scrollTop = this.thread.scrollHeight;
  }

  message(text, role = 'assistant') {
    const messages = this.root.querySelector('.dh-ai-messages');
    const item = document.createElement('p');
    item.className = 'dh-ai-message';
    item.dataset.role = role;
    item.textContent = text;
    messages.appendChild(item);
    this.root.querySelector('.dh-chat-intro').hidden = true;
    this.scrollToLatest();
  }

  clearPreview() {
    this.pendingPlan = null;
    this.pendingScene = null;
    this.root.querySelector('.dh-ai-preview').hidden = true;
  }

  reset() {
    ++this.requestSequence;
    this.clarification = null;
    this.clearPreview();
    this.root.querySelector('.dh-ai-messages').replaceChildren();
    this.root.querySelector('.dh-chat-intro').hidden = false;
    this.form.reset();
    this.updateAttachment();
    this.setBusy(false);
  }

  async send(text, file = this.root.querySelector('[data-ai-image]')?.files[0]) {
    const requestId = ++this.requestSequence;
    const serviceSource = this.serviceSource;
    const sceneDocument = structuredClone(this.executor.editor.getSceneDocument());
    const sceneSnapshot = sceneFingerprint(sceneDocument);
    const previous = this.clarification?.scene === sceneSnapshot ? this.clarification : null;
    const requestText = previous ? `先前要求：${previous.prompt}\n助手对该要求的提问：${previous.questions.join('；')}\n用户的新回复：${text}` : text;
    const prior = this.pendingPlan;
    if (prior) this.message([prior.summary, ...(prior.questions || [])].filter(Boolean).join('\n'));
    this.clarification = null;
    this.clearPreview();
    this.message(file ? `${text}\n参考图 · ${file.name}` : text, 'user');
    this.setBusy(true);
    try {
      if (file && file.size > 3 * 1024 * 1024) throw new Error('参考图最大 3 MB。');
      const libraryResponse = await fetch('/api/library/index.json');
      if (!libraryResponse.ok) throw new Error('无法读取资源库，请重试。');
      const catalog = await libraryResponse.json();
      if (requestId !== this.requestSequence) return;
      if (sceneSnapshot !== sceneFingerprint(this.executor.editor.getSceneDocument())) {
        this.message('项目已发生变化，请重新发送指令。');
        return;
      }
      this.executor.catalog = catalog;
      const image = file ? await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('图片读取失败，请重新添加。'));
        reader.readAsDataURL(file);
      }) : undefined;
      const palette = file ? await referencePalette(file).catch(() => []) : [];
      const message = palette.length
        ? requestText + '\n图片中按像素占比从高到低的参考色为 ' + palette.join('、') + '。如要求修改家具颜色，请根据画面选择与要求匹配的真实色值，用 set_material 的 color 字段生成方案；仅用户要求更换材料时才用 materialId。界面会让用户确认方案。'
        : requestText;
      if (requestId !== this.requestSequence) return;
      const response = await fetch(API_ROUTES.sceneCommand, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, image, serviceSource, sceneDocument: designContext(sceneDocument), selection: { roomId: this.executor.editor.game?.activeRoomId, placementId: this.executor.editor.selectedId } }),
      });
      const body = await response.json().catch(() => ({}));
      if (requestId !== this.requestSequence) return;
      if (sceneSnapshot !== sceneFingerprint(this.executor.editor.getSceneDocument())) {
        this.message('项目已发生变化，请重新发送指令。');
        return;
      }
      if (response.status === 409) this.onSourceMismatch?.();
      if (!response.ok || !body.summary) throw new Error(body.error || `AI 服务暂时不可用（${response.status}）。`);
      if (body.questions?.length) this.clarification = { scene: sceneSnapshot, prompt: previous?.prompt || text, questions: body.questions };
      this.pendingScene = sceneSnapshot;
      this.pendingPlan = body;
      this.showPreview(body);
    } catch (error) {
      if (requestId !== this.requestSequence) return;
      this.clearPreview();
      this.message(error.message, 'error');
      this.clarification = previous;
      if (this.input && !this.input.value) {
        this.input.value = text;
        if (file && !this.fileInput.files.length) {
          const attachment = new DataTransfer();
          attachment.items.add(file);
          this.fileInput.files = attachment.files;
          this.updateAttachment();
        }
      }
    } finally {
      if (requestId === this.requestSequence) this.setBusy(false);
    }
  }

  showPreview(plan) {
    const preview = this.executor.preview(plan);
    const panel = this.root.querySelector('.dh-ai-preview');
    panel.hidden = false;
    panel.replaceChildren();
    const header = document.createElement('p');
    header.className = 'dh-chat-plan-label';
    header.textContent = preview.questions?.length ? '需要确认' : '修改方案';
    const summary = document.createElement('strong');
    summary.textContent = plan.summary;
    panel.append(header, summary);
    for (const [notes, className] of [
      [preview.changes, 'dh-chat-changes'],
      [preview.questions, 'dh-chat-questions'],
      [preview.warnings, 'dh-muted'],
      [preview.errors?.map(error => error.message), 'dh-error'],
    ]) {
      if (!notes?.length) continue;
      const list = document.createElement('ul');
      list.className = className;
      for (const note of notes) {
        const item = document.createElement('li');
        item.textContent = note;
        list.append(item);
      }
      panel.append(list);
    }
    if (preview.canApply) {
      const row = document.createElement('div');
      row.className = 'dh-chat-plan-actions';
      row.innerHTML = '<button type="button" class="dh-button dh-primary">应用修改</button><button type="button" class="dh-button dh-secondary">取消</button>';
      const [apply, cancel] = row.children;
      apply.onclick = () => {
        try {
          if (!this.pendingPlan || this.pendingScene !== sceneFingerprint(this.executor.editor.getSceneDocument())) {
            this.clearPreview();
            this.message('项目已发生变化，请重新发送指令。');
            return;
          }
          this.executor.apply(this.pendingPlan);
          this.message(`已应用 · ${this.pendingPlan.summary}`);
          this.clearPreview();
          this.input.focus({ preventScroll: true });
        } catch (error) {
          this.clearPreview();
          this.message(error.message, 'error');
        }
      };
      cancel.onclick = () => {
        this.clearPreview();
        this.message(`已取消 · ${plan.summary}`);
        this.input.focus({ preventScroll: true });
      };
      panel.append(row);
    }
    this.scrollToLatest();
  }
}
