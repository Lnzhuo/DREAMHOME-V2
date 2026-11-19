import { API_ROUTES } from '../../core/api-contracts.js';
import { createUploadedGlbAsset, estimatedDimensions, fetchJson, assetSourceLabel } from '../../assets/asset-service.js';
import { createPlaceholder } from '../../scene/placeholders.js';
import { loadGlb } from '../../scene/loadModel.js';
import { createModelPreview } from '../preview.js';
import { renderThumbnailDataUrl, renderPlanDataUrl } from '../../assets/thumbnailer.js';
import './asset-preview.css';
import { filterCatalogAssets, requiresReview } from '../../assets/catalog-filters.js';

export class AssetLibrary {
  constructor({ root, assetRepository, onPlace, onJobChange, onCatalogChange }) {
    this.root = root;
    this.assets = assetRepository;
    this.onPlace = onPlace;
    this.onJobChange = onJobChange;
    this.onCatalogChange = onCatalogChange;
    this.sceneAssets = [];
    this.jobs = new Map();
    this.pendingImages = new Map();
    this.sourceFilter = 'all';
    this.planAttempts = new Set();
  }

  async mount() {
    this.root.innerHTML = `
      <div class="dh-row dh-source-filters"><button type="button" class="dh-button dh-secondary" data-action="lux-filter" aria-pressed="false">Lux3D 原创 <span data-role="lux-count">0</span></button><button type="button" class="dh-button dh-secondary" data-action="image-filter" aria-pressed="false">图生 <span data-role="image-count">0</span></button><button type="button" class="dh-button dh-secondary" data-action="all-filter" aria-pressed="true">全部来源</button></div><select class="dh-input" data-field="quality-filter" aria-label="资源质量筛选"><option value="recommended">已验收与我的上传</option><option value="all">全部质量</option><option value="review">待复核</option></select><input class="dh-input" data-field="asset-search" placeholder="搜索家具、沙发、床、柜子…" /><select class="dh-input" data-field="asset-filter"><option value="">全部家具分类</option></select>
      <details class="dh-asset-form"><summary>导入或生成家具</summary>
        <label class="dh-button dh-secondary">导入 GLB<input data-action="glb" type="file" accept=".glb,model/gltf-binary" hidden/></label>
        <details><summary>上传家具照片生成</summary><input data-action="image" type="file" accept="image/jpeg,image/png,image/webp"/><button class="dh-button dh-primary" data-action="image-generate">上传并生成</button></details>
        <details><summary>文字生成家具</summary><textarea class="dh-textarea" data-field="prompt" placeholder="描述家具、材质、颜色和风格"></textarea><button class="dh-button dh-primary" data-action="text-generate">开始生成</button></details>
        <div class="dh-field"><label>估算宽/深/高 m</label><div class="dh-row"><input data-dimension="width" type="number" value="1" min="0.01" step="0.1"/><input data-dimension="depth" type="number" value="1" min="0.01" step="0.1"/><input data-dimension="height" type="number" value="1" min="0.01" step="0.1"/></div></div>
        <div class="dh-field"><label>分类</label><select data-field="category"><option value="sofa">沙发</option><option value="table">桌椅</option><option value="lighting">灯具</option><option value="decor">装饰</option><option value="furniture">其他家具</option></select></div>
      </details>
      <div class="dh-job-list"></div><div class="dh-asset-list"></div>`;
    for (const [action, value] of [['lux-filter','lux3d'],['image-filter','image'],['all-filter','all']]) this.root.querySelector(`[data-action="${action}"]`).addEventListener('click', () => { this.sourceFilter = value; if (value === 'image') this.root.querySelector('[data-field="quality-filter"]').value = 'all'; for (const [name, selected] of [['lux-filter','lux3d'],['image-filter','image'],['all-filter','all']]) this.root.querySelector(`[data-action="${name}"]`).setAttribute('aria-pressed',String(selected === value)); this.renderAssets(); });
    this.root.querySelector('[data-field="quality-filter"]').addEventListener('change', () => this.renderAssets());
    this.root.querySelector('[data-field="asset-search"]').addEventListener('input', () => this.renderAssets());
    this.root.querySelector('[data-field="asset-filter"]').addEventListener('change', () => this.renderAssets());
    this.root.querySelector('[data-action="glb"]').addEventListener('change', (event) => this.importGlb(event.target.files[0]));
    this.root.querySelector('[data-action="image-generate"]').addEventListener('click', () => this.generateFromImage());
    this.root.querySelector('[data-action="text-generate"]').addEventListener('click', () => this.generateFromText());
    this.root.addEventListener('dragstart', (event) => {
      const card = event.target.closest('[data-asset-id]');
      if (card) event.dataTransfer.setData('text/plain', card.dataset.assetId);
    });
    await this.loadCatalog();
    const result = await this.refresh();
    this.planTimer = setTimeout(() => this.upgradeStoredPlans(), 3000);
    this.catalogTimer = setInterval(async () => { try { const changed = await this.loadCatalog(); if (changed) await this.refresh(); } catch (error) { console.warn('资源目录刷新失败', error); } }, 15000);
    return result;
  }

  async loadCatalog() {
    const response = await fetch('/api/library/index.json');
    if (!response.ok) throw new Error(`资源目录读取失败（${response.status}）`);
    const index = await response.json();
    const incoming = index.assets || [];
    const signature = incoming.map(a => `${a.id}:${a.thumbnailUrl || ''}:${a.planThumbnailUrl || ''}:${a.qa?.placementTest || ''}:${a.qa?.visualReview || ''}`).join('|');
    if (signature === this.catalogSignature) return false;
    this.catalogSignature = signature;
    this.catalogAssets = incoming;
    const filter = this.root.querySelector('[data-field="asset-filter"]');
    const previous = filter.value;
    filter.replaceChildren(new Option('全部家具分类', ''));
    for (const category of [...new Set(this.catalogAssets.map(a => a.category))].sort()) {
      const option = document.createElement('option'); option.value = category; option.textContent = category; filter.append(option);
    }
    filter.value = [...filter.options].some(option => option.value === previous) ? previous : '';
    return true;
  }

  async upgradeStoredPlans() {
    try {
      const stored = await this.assets.listAssets();
      const asset = stored.find(a => a.modelUrl?.startsWith('idb://assets/') && !a.planThumbnailUrl && !this.planAttempts.has(a.id));
      if (!asset) return;
      this.planAttempts.add(asset.id);
      const url = await this.assets.resolveAssetUrl(asset);
      try {
        const plan = await renderPlanDataUrl(url);
        await this.assets.putAsset({ asset: { ...asset, planThumbnailUrl: plan.url, planThumbnail: { width: plan.width, height: plan.height, view: plan.view, up: plan.up, right: plan.right, projection: plan.projection } } });
        await this.refresh();
      } finally { URL.revokeObjectURL(url); }
    } catch (error) { console.warn('本地模型俯视图生成失败', error); }
    this.planTimer = setTimeout(() => this.upgradeStoredPlans(), 2000);
  }

  setSceneAssets(assets) {
    this.sceneAssets = assets;
    this.renderAssets();
  }

  dimensions() {
    return estimatedDimensions(
      this.root.querySelector('[data-dimension="width"]').value,
      this.root.querySelector('[data-dimension="depth"]').value,
      this.root.querySelector('[data-dimension="height"]').value,
    );
  }

  async importGlb(file) {
    if (!file) return;
    this.onJobChange?.('正在读取并保存 GLB…', 'loading');
    try {
      const asset = await createUploadedGlbAsset(file);
      const stored = await this.assets.putAsset({ asset, blob: file });
      await this.refresh();
      this.onJobChange?.(`已导入「${stored.name}」，尺寸按模型边界框估算`, 'success');
    } catch (error) { this.onJobChange?.(error.message, 'error'); }
  }

  async generateFromImage() {
    const file = this.root.querySelector('[data-action="image"]').files[0];
    if (!file) return this.onJobChange?.('请先选择家具照片', 'error');
    try {
      this.onJobChange?.('正在上传图片…', 'loading');
      const upload = await fetchJson(API_ROUTES.uploadImage, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      const job = await fetchJson(API_ROUTES.lux3dImage, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: upload.uploadId, name: file.name.replace(/\.[^.]+$/, ''), category: this.root.querySelector('[data-field="category"]').value, dimensions: this.dimensions() }),
      });
      this.pendingImages.set(job.jobId, file);
      this.trackJob(job.jobId);
    } catch (error) { this.onJobChange?.(error.message, 'error'); }
  }

  async generateFromText() {
    const prompt = this.root.querySelector('[data-field="prompt"]').value.trim();
    if (!prompt) return this.onJobChange?.('请先描述想生成的家具', 'error');
    try {
      const job = await fetchJson(API_ROUTES.lux3dText, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, name: prompt.slice(0, 24), category: this.root.querySelector('[data-field="category"]').value, dimensions: this.dimensions() }),
      });
      this.trackJob(job.jobId);
    } catch (error) { this.onJobChange?.(error.message, 'error'); }
  }

  async trackJob(jobId) {
    clearTimeout(this.jobs.get(jobId)?.timer);
    try {
      const job = await fetchJson(API_ROUTES.job(jobId));
      this.jobs.set(jobId, job);
      this.renderJobs();
      if (job.status === 'succeeded') {
        const response = await fetch(job.outputAsset.modelUrl);
        if (!response.ok) throw new Error('归档模型下载失败');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        try { job.outputAsset.thumbnailUrl = await renderThumbnailDataUrl(url); const plan = await renderPlanDataUrl(url); job.outputAsset.planThumbnailUrl = plan.url; job.outputAsset.planThumbnail = { width: plan.width, height: plan.height, view: plan.view, up: plan.up, right: plan.right, projection: plan.projection }; } finally { URL.revokeObjectURL(url); }
        const reference = this.pendingImages.get(jobId);
        if (reference) {
          job.outputAsset.referenceImageUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(reference); });
          job.outputAsset.referenceSource = { author: '用户上传', license: '用户提供', scope: '用户提供的家具参考照片' };
          this.pendingImages.delete(jobId);
        }
        const stored = await this.assets.putAsset({ asset: job.outputAsset, blob });
        this.onJobChange?.(`真实 Lux3D 模型已归档：${stored.name}`, 'success');
        await this.refresh();
        return;
      }
      if (['failed', 'canceled'].includes(job.status)) { this.pendingImages.delete(jobId); return; }
      job.timer = setTimeout(() => this.trackJob(jobId), 2000);
      this.jobs.set(jobId, job);
    } catch (error) { this.onJobChange?.(error.message, 'error'); }
  }

  renderJobs() {
    const list = this.root.querySelector('.dh-job-list');
    list.innerHTML = '';
    for (const job of this.jobs.values()) {
      const item = document.createElement('div');
      item.className = 'dh-job';
      item.textContent = `${job.status} · ${job.errorMessage || job.providerTaskId || job.jobId}`;
      if (job.status === 'failed') {
        const retry = document.createElement('button');
        retry.textContent = '重试';
        retry.addEventListener('click', async () => {
          const next = await fetchJson(API_ROUTES.retryJob(job.jobId), { method: 'POST' });
          this.trackJob(next.jobId);
        });
        item.appendChild(retry);
      }
      list.appendChild(item);
    }
  }

  async refresh() {
    const stored = await this.assets.listAssets();
    const merged = new Map();
    for (const asset of [...this.sceneAssets, ...stored, ...(this.catalogAssets || [])]) merged.set(asset.id, { ...merged.get(asset.id), ...asset });
    for (const asset of stored.filter(a => a.userCalibrated)) { const current = merged.get(asset.id); if (current) merged.set(asset.id, { ...current, dimensions: asset.dimensions, userCalibrated: true }); }
    this.assetList = [...merged.values()];
    this.root.querySelector('[data-role="lux-count"]').textContent = String(this.assetList.filter(a => a.provider === 'aholo-lux3d').length);
    this.root.querySelector('[data-role="image-count"]').textContent = String(this.assetList.filter(a => a.source === 'lux3d_image').length);
    this.renderAssets();
    this.onCatalogChange?.(this.assetList);
    return this.assetList;
  }

  renderAssets() {
    const list = this.root.querySelector('.dh-asset-list');
    if (!list) return;
    list.innerHTML = '';
    const merged = new Map([...this.sceneAssets, ...(this.assetList || [])].map((asset) => [asset.id, asset]));
    if (!merged.size) {
      list.innerHTML = '<div class="dh-empty">资产库为空，请导入 GLB 或生成家具</div>';
      return;
    }
    const query = (this.root.querySelector('[data-field="asset-search"]')?.value || '').trim().toLowerCase();
    const category = this.root.querySelector('[data-field="asset-filter"]')?.value || '';
    const quality = this.root.querySelector('[data-field="quality-filter"]')?.value || 'recommended';
    const ordered = filterCatalogAssets([...merged.values()], { source: this.sourceFilter, quality, category, query });
    if (!ordered.length) { list.innerHTML = '<div class="dh-empty">没有匹配资源，可切换来源、分类或查看待复核资源</div>'; return; }
    for (const asset of ordered) {
      const card = document.createElement('div');
      card.className = 'dh-asset-card';
      card.draggable = true;
      card.dataset.assetId = asset.id;
      const thumb = document.createElement('img');
      thumb.className = 'dh-asset-thumb';
      thumb.alt = asset.name;
      thumb.loading = 'lazy';
      if (asset.thumbnailUrl) thumb.src = asset.thumbnailUrl;
      else { thumb.alt = '暂无缩略图'; }
      const name = document.createElement('div');
      name.className = 'dh-asset-name';
      name.textContent = asset.name;
      name.title = asset.name;
      const source = document.createElement('div');
      source.className = 'dh-asset-source';
      const width = asset.dimensions?.width?.value?.toFixed(2) || '?';
      const depth = asset.dimensions?.depth?.value?.toFixed(2) || '?';
      const height = asset.dimensions?.height?.value?.toFixed(2) || '?';
      const needsScale = (asset.scaleCalibrationRequired && !asset.userCalibrated) || ['width', 'depth', 'height'].some(key => !Number.isFinite(asset.dimensions?.[key]?.value));
      source.textContent = needsScale ? `尺寸待校准 · ${assetSourceLabel(asset)}` : `${width}×${depth}×${height} m · ${assetSourceLabel(asset)}${asset.userCalibrated ? ' · 用户估算' : asset.designReference ? ' · 设计参考，可调' : ''}`;
      if (requiresReview(asset)) card.dataset.quality = 'review';
      if (/待/.test(asset.qa?.visualReview || '')) source.textContent += ' · 待视觉复核';
      else if (requiresReview(asset)) source.textContent += ' · 质量提示';
      if (asset.qa?.axisReview === '异常待修复') source.textContent += ' · 轴向待修复';
      card.draggable = !needsScale && asset.qa?.axisReview !== '异常待修复';
      const place = document.createElement('button');
      place.textContent = '放入房间';
      place.disabled = needsScale || asset.qa?.axisReview === '异常待修复';
      place.addEventListener('click', () => this.onPlace(asset));
      const preview = document.createElement('button');
      preview.textContent = '预览模型';
      preview.addEventListener('click', () => this.preview(asset, preview));
      const license = document.createElement('details');
      const summary = document.createElement('summary'); summary.textContent = '来源与许可'; license.append(summary);
      const detail = document.createElement('div');
      detail.textContent = asset.license ? `${asset.license.author || '作者未知'} · ${asset.license.name || '许可未知'} ${asset.license.version || ''}` : asset.source === 'user_upload' ? '由用户上传，使用权由用户负责' : 'Aholo Lux3D AI 生成 · 个人赛事项目演示 · 公开分发待按套餐确认';
      license.append(detail);
      if (asset.license?.originalUrl) { const link = document.createElement('a'); link.href = asset.license.originalUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '原始来源'; license.append(link); }
      else if (asset.provider === 'aholo-lux3d') { const link = document.createElement('a'); link.href = 'https://www.aholo.cn/hackathon'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '比赛官方页面'; license.append(link); }
      if (asset.referenceSource && typeof asset.referenceSource === 'object') {
        const r = asset.referenceSource, description = document.createElement('div');
        description.textContent = `参考照片：${r.author || '作者未知'} · ${r.license || '许可待核'}`; license.append(description);
        if (r.creator) {
          const creator = document.createElement('div');
          creator.textContent = '原作设计或制作：' + r.creator;
          license.append(creator);
        }
        for (const [url, label] of [[r.sourceUrl, '查看参考照片来源'], [r.licenseUrl, '查看参考照片许可']]) {
          if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
          const line = document.createElement('div');
          const link = document.createElement('a');
          link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = label;
          line.append(link); license.append(line);
        }
      }
      if (requiresReview(asset) && asset.qa?.visualReview) { const note = document.createElement('div'); note.className = 'dh-muted'; note.textContent = asset.qa.visualReview; license.append(note); }
      card.append(thumb, name, source, place, preview, license);
      if ((needsScale || asset.designReference) && asset.qa?.axisReview !== '异常待修复') {
        const calibration = document.createElement('details');
        const anchor = asset.designReference?.anchorAxis;
        const original = asset.dimensions?.[anchor]?.value;
        if (anchor && Number.isFinite(original) && original > 0) {
          const label = { width: '宽', depth: '深', height: '高' }[anchor];
          calibration.innerHTML = `<summary>调整设计参考尺寸</summary><p>设计参考值，非厂家实测；设置${label}后其余尺寸按模型比例变化。</p><input aria-label="参考主轴米" type="number" min="0.01" step="0.01"/><button type="button">保存尺寸并放入</button>`;
          calibration.querySelector('input').value = original;
        } else {
          calibration.innerHTML = '<summary>填写估算尺寸后放置</summary><p>尺寸尚未校准，请输入估算宽、深、高（米）。</p><div class="dh-row"><input aria-label="宽米" type="number" min="0.01" step="0.01" placeholder="宽"/><input aria-label="深米" type="number" min="0.01" step="0.01" placeholder="深"/><input aria-label="高米" type="number" min="0.01" step="0.01" placeholder="高"/></div><button type="button">保存尺寸并放入</button>';
        }
        calibration.querySelector('button').addEventListener('click', async () => {
          let values = [...calibration.querySelectorAll('input')].map(input => Number(input.value));
          if (values.some(value => !Number.isFinite(value) || value <= 0)) { this.onJobChange?.('请填写有效尺寸', 'error'); return; }
          if (anchor && Number.isFinite(original) && original > 0) {
            const ratio = values[0] / original;
            values = ['width', 'depth', 'height'].map(key => asset.dimensions[key].value * ratio);
          }
          const calibrated = { ...asset, dimensions: estimatedDimensions(...values), userCalibrated: true };
          try { await this.assets.putAsset({ asset: calibrated }); await this.refresh(); this.onPlace(calibrated); }
          catch (error) { this.onJobChange?.(error.message, 'error'); }
        });
        card.append(calibration);
      }
      list.appendChild(card);
    }
  }

  async preview(asset, button) {
    button.disabled = true;
    button.textContent = '加载中…';
    try {
      const model = asset.modelUrl
        ? await loadGlb(await this.assets.resolveAssetUrl(asset))
        : createPlaceholder(asset.procedural.kind, asset.procedural.color);
      const overlay = document.createElement('div');
      overlay.className = 'dh-preview-modal';
      const referenceUrl = asset.referenceImageUrl || asset.referenceSource?.inputUrl;
      const card = document.createElement('div'); card.className = `dh-preview-card${referenceUrl ? ' dh-preview-compare' : ''}`;
      const close = document.createElement('button'); close.className = 'dh-preview-close'; close.setAttribute('aria-label', '关闭预览'); close.textContent = '×'; card.append(close);
      const title = document.createElement('h2'); title.className = 'dh-preview-title'; title.textContent = asset.name; card.append(title);
      const grid = document.createElement('div'); grid.className = 'dh-preview-grid';
      if (referenceUrl) {
        const photo = document.createElement('section'); photo.className = 'dh-preview-pane';
        const heading = document.createElement('h3'); heading.textContent = '参考照片'; photo.append(heading);
        const img = document.createElement('img'); img.className = 'dh-reference-photo'; img.src = referenceUrl; img.alt = `${asset.name}的参考照片`; photo.append(img);
        const credit = document.createElement('p'); credit.className = 'dh-preview-caption';
        const ref = asset.referenceSource || {}; credit.textContent = ref.author === '用户上传' ? '用户提供的参考照片' : `参考照片：${ref.author || '来源待核'} · ${ref.license || '许可待核'}`; photo.append(credit);
        if (ref.sourceUrl) { const link = document.createElement('a'); link.href = ref.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '查看原始来源与署名'; photo.append(link); }
        grid.append(photo);
      }
      const modelPane = document.createElement('section'); modelPane.className = 'dh-preview-pane';
      if (referenceUrl) { const heading = document.createElement('h3'); heading.textContent = '生成的 3D 模型'; modelPane.append(heading); }
      const stage = document.createElement('div'); stage.className = 'dh-preview-stage'; modelPane.append(stage);
      const hint = document.createElement('p'); hint.className = 'dh-preview-caption'; hint.textContent = referenceUrl ? '拖动旋转模型；生成结果可能与照片存在差异。' : '拖动旋转模型'; modelPane.append(hint);
      if (referenceUrl && /差异/.test(asset.qa?.visualReview || '')) { const note = document.createElement('p'); note.className = 'dh-preview-caption'; note.textContent = asset.qa.visualReview; modelPane.append(note); }
      grid.append(modelPane); card.append(grid); overlay.append(card); document.body.appendChild(overlay);
      const preview = createModelPreview(stage, model);
      close.addEventListener('click', () => { preview.dispose(); overlay.remove(); });
    } catch (error) { this.onJobChange?.(error.message, 'error'); }
    finally { button.disabled = false; button.textContent = '预览模型'; }
  }

  destroy() {
    clearInterval(this.catalogTimer);
    clearTimeout(this.planTimer);
    for (const job of this.jobs.values()) clearTimeout(job.timer);
    this.assets.revokeUrls();
  }
}
