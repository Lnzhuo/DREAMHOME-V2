export class MaterialLibrary {
  constructor({ root, onApply, onApplyToRoom }) {
    this.root = root;
    this.onApply = onApply;
    this.onApplyToRoom = onApplyToRoom;
    this.materials = [];
    this.edits = new Map();
    this.activeMaterial = null;
  }

  async mount() {
    const response = await fetch('/api/library/index.json');
    const index = await response.json();
    this.materials = index.materials || [];
    this.activeMaterial = this.materials[0] || null;
    this.root.innerHTML = `
      <input class="dh-input" data-field="search" placeholder="搜索材料、木材、瓷砖、织物…" />
      <select class="dh-input" data-field="category"><option value="">全部材料分类</option></select><div class="dh-row" style="margin:8px 0"><button class="dh-button dh-secondary" data-surface="wall">墙面</button><button class="dh-button dh-secondary" data-surface="floor">地板</button></div>
      <div class="dh-muted">拖放材料到画面中的墙、地板或家具</div><label>纹理重复率 <input type="number" min="0.1" max="20" step="0.1" value="2" data-field="repeat" /></label>
      <details class="dh-material-settings"><summary>调整材质参数</summary>
        <strong data-role="current-name"></strong>
        <label>基色 <input type="color" data-param="baseColor"></label>
        <label>粗糙度 <input type="number" min="0" max="1" step="0.05" data-param="roughness"></label>
        <label>金属度 <input type="number" min="0" max="1" step="0.05" data-param="metalness"></label>
        <label>法线强度 <input type="number" min="0" max="3" step="0.1" data-param="normalStrength"></label>
        <label>环境遮蔽强度 <input type="number" min="0" max="2" step="0.1" data-param="aoIntensity"></label>
        <button type="button" class="dh-button dh-secondary" data-reset-material>恢复预设</button>
      </details><div class="dh-asset-list" data-role="list"></div>`;
    const filter = this.root.querySelector('[data-field="category"]');
    for (const category of [...new Set(this.materials.map(m => m.category))].sort()) { const option = document.createElement('option'); option.value = category; option.textContent = category; filter.append(option); }
    filter.addEventListener('change', () => this.render());
    const repeat=this.root.querySelector('[data-field="repeat"]');
    repeat.addEventListener('change', () => {const value=Math.max(.1,Math.min(20,Number(repeat.value)||1));this.edit({repeat:[value,value]});});
    this.root.querySelectorAll('[data-param]').forEach(input => input.addEventListener('change', () => {
      const value=input.type==='color' ? input.value : Math.max(Number(input.min),Math.min(Number(input.max),Number(input.value)));
      if (input.value && (input.type==='color' || Number.isFinite(value))) this.edit({[input.dataset.param]:value});
      else this.showParameters();
    }));
    this.root.querySelector('[data-reset-material]').onclick=()=>{
      if(!this.activeMaterial)return;
      const preset=this.materials.find(m=>m.id===this.activeMaterial.id);
      this.edits.delete(preset.id);this.select(preset);
    };
    this.showParameters();
    this.root.querySelector('[data-field="search"]').addEventListener('input', () => this.render());
    this.root.querySelectorAll('[data-surface]').forEach((button) => {
      button.addEventListener('click', () => this.activeMaterial && this.onApplyToRoom(this.activeMaterial, button.dataset.surface));
    });
    this.root.addEventListener('dragstart', (event) => {
      const card = event.target.closest('[data-material-id]');
      if (card) {
        const material = this.materials.find(entry => entry.id === card.dataset.materialId);
        if (material) this.select(material);
        event.dataTransfer.setData('application/x-dreamhome-material', card.dataset.materialId);
      }
    });
    this.render();
    return this;
  }

  select(preset) {
    this.activeMaterial=this.edits.get(preset.id) || preset;
    this.showParameters();
  }

  edit(patch) {
    if (!this.activeMaterial) return;
    this.activeMaterial={...this.activeMaterial,...patch,presetId:this.activeMaterial.id};
    this.edits.set(this.activeMaterial.id,this.activeMaterial);
    this.showParameters();
  }

  showParameters() {
    const material=this.activeMaterial;
    if(!material) return;
    const defaults={baseColor:'#ffffff',roughness:1,metalness:0,normalStrength:1,aoIntensity:1};
    this.root.querySelector('[data-role="current-name"]').textContent=material.name;
    this.root.querySelector('[data-field="repeat"]').value=material.repeat?.[0] || 1;
    for(const input of this.root.querySelectorAll('[data-param]')){
      const field=input.dataset.param;
      input.value=material[field] ?? defaults[field];
      input.disabled=(field==='normalStrength' && !material.maps?.normalMap) || (field==='aoIntensity' && !material.maps?.aoMap);
    }
  }

  render() {
    const query = this.root.querySelector('[data-field="search"]').value.trim().toLowerCase();
    const list = this.root.querySelector('[data-role="list"]');
    list.innerHTML = '';
    const category = this.root.querySelector('[data-field="category"]').value;
    for (const material of this.materials.filter((entry) => (!category || entry.category === category) && `${entry.name} ${entry.category} ${entry.id}`.toLowerCase().includes(query))) {
      const card = document.createElement('div');
      card.className = 'dh-asset-card';
      card.draggable = true;
      card.dataset.materialId = material.id;
      card.dataset.selected = String(this.activeMaterial?.id === material.id);
      const preview = document.createElement('img');
      preview.className = 'dh-asset-thumb';
      preview.src = material.previewUrl;
      preview.alt = material.name;
      preview.loading = 'lazy';
      const name = document.createElement('div');
      name.className = 'dh-asset-name';
      name.textContent = material.name;
      const meta = document.createElement('div');
      meta.className = 'dh-asset-source';
      meta.textContent = `${material.category} · ${material.source === 'procedural' ? '参数预设' : 'CC0'}`;
      const apply = document.createElement('button');
      apply.textContent = '应用材料';
      apply.addEventListener('click', event => {
        event.stopPropagation();this.select(material);
        this.onApply(this.activeMaterial);this.render();
      });
      card.addEventListener('click', () => {
        this.select(material);
        this.render();
      });
      card.append(preview, name, meta, apply);
      list.appendChild(card);
    }
  }
}
