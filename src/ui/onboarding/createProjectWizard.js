import { mountStyleGallery } from './style-gallery.js';
import { mountRoomDesigner } from './room-designer.js';
import { ROOM_TEMPLATES, FLOORPLAN_TEMPLATES, ROOM_REFERENCES, VILLA_TEMPLATES, createSingleRoomDocument, createApartmentDocument, createVillaDocument } from '../../data/v2-contracts.js';
import { EXISTING_LUX3D_ASSETS } from '../../assets/generated/existing-lux3d.js';
import { LUX3D_ROOM_SAMPLES, createLux3dRoomSample } from '../../assets/generated/lux3d-room-samples.js';
import { createFurnishedApartment } from '../../data/furnished-apartment.js';
import './wizard.css';

function preview(document) {
  const rooms=document.buildings[0].floors[0].rooms;
  const points=rooms.flatMap(r=>r.boundary), minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxX=Math.max(...points.map(p=>p.x)),maxY=Math.max(...points.map(p=>p.y));
  const polygons=rooms.map((r,i)=>`<polygon points="${r.boundary.map(p=>`${p.x},${p.y}`).join(' ')}" fill="${['#efe6d8','#e5e8df','#eee8e0','#eee1d1'][i%4]}" stroke="#9b8e7d" stroke-width=".12"/>`).join('');
  return `<svg viewBox="${minX-.5} ${minY-.5} ${maxX-minX+1} ${maxY-minY+1}" role="img" aria-label="模板轮廓预览">${polygons}</svg>`;
}
function prepare(doc) { doc.assets=EXISTING_LUX3D_ASSETS.map(a=>structuredClone(a));return doc; }
export function createProjectWizard({canCancel=false,recentProjects=[],onOpenRecent,onOpenApi,catalogAssets=[]}={}) {
  return new Promise((resolve) => {
    const overlay=document.createElement('div');overlay.className='dh-onboarding';
    overlay.innerHTML=`
      <div class="dh-onboarding-card" id="dw-home">
        <header class="dw-header">
          <a class="dw-brand" href="#dw-home">
            <span class="dh-brand-mark" aria-hidden="true">D</span>
            <span><strong>DREAMHOME</strong><small>造梦家空间设计</small></span>
          </a>
          <nav class="dw-nav" aria-label="选择设计起点">
            <a href="#dw-styles">风格样板</a>
            <a href="#dw-room">单个房间</a>
            <a href="#dw-plan">整套平层</a>
            <a href="#dw-villa">别墅庭院</a>
          </nav>
          ${canCancel?'<button type="button" class="dw-cancel">返回编辑器</button>':''}
        </header>
        <main class="dw-main">
          <section class="dw-intro" aria-labelledby="dw-headline">
            <div class="dw-intro-copy">
              <h1 id="dw-headline">从一句话，<br>布置一个家。</h1>
              <p>描述你想要的房间，生成家具、材质和灯光搭配，再打开 3D 编辑器调整细节。</p>
            </div>
            <figure class="dw-feature" data-featured-look></figure>
            <div data-room-designer></div>
          </section>
          <div data-recent></div>
          <section id="dw-styles" class="dw-style-gallery" aria-labelledby="dw-styles-title">
            <div class="dw-title">
              <h2 id="dw-styles-title">风格样板</h2>
              <p>选一套喜欢的搭配，直接打开 3D 空间编辑。</p>
            </div>
            <div class="dw-look-grid"></div><p class="dw-feedback" role="status"></p>
          </section>
          <div data-lux-samples></div>
          <div class="dh-onboarding-types">
            <section id="dw-room">
              <div class="dw-title"><h2>从空房间开始</h2><p>选择房间类型，再调整尺寸和门窗。</p></div>
              <div class="dh-template-grid" data-mode="room"></div>
            </section>
            <section id="dw-plan">
              <div class="dw-title"><h2>设计整套平层</h2><p>从可编辑的示意户型开始，布置每个房间。</p></div>
              <div class="dh-template-grid" data-mode="apartment"></div>
            </section>
            <section id="dw-villa">
              <div class="dw-title"><h2>别墅与庭院</h2><p>选择多层户型，编辑楼梯、庭院和各层房间。</p></div>
              <div class="dh-template-grid" data-mode="villa"></div>
            </section>
          </div>
        </main>
      </div>`;
    const app = document.getElementById('app');
    const previousFocus = document.activeElement;
    if (app) app.inert = true;
    document.body.appendChild(overlay);
    const close = value => {
      overlay.remove();
      if (app) app.inert = false;
      if (canCancel) previousFocus?.focus({ preventScroll: true });
      resolve(value);
    };
    mountRoomDesigner(overlay.querySelector('[data-room-designer]'),catalogAssets,close,onOpenApi);
    const cancel = overlay.querySelector('.dw-cancel');
    if (cancel) {
      cancel.addEventListener('click', () => close(null));
      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') close(null);
      });
      cancel.focus({ preventScroll: true });
    }
    mountStyleGallery(overlay.querySelector('#dw-styles'),catalogAssets,close,overlay.querySelector('[data-featured-look]'));
    const samples = overlay.querySelector('[data-lux-samples]');
    if (catalogAssets.length) {
      samples.className = 'dw-samples';
      const heading = document.createElement('h2');
      heading.textContent = 'Lux3D 原创样板间';
      const apartment = document.createElement('button');
      apartment.type = 'button'; apartment.className = 'dw-apartment-demo';
      apartment.textContent = '打开三室两厅样板房';
      apartment.onclick = () => close(createFurnishedApartment({assets:catalogAssets}));
      const header = document.createElement('div'); header.className='dw-samples-head';
      header.append(heading,apartment);
      const grid = document.createElement('div');
      grid.className = 'dw-sample-grid';
      for (const sample of LUX3D_ROOM_SAMPLES) {
        const scene = createLux3dRoomSample(sample.id, catalogAssets).document;
        if (!scene.placements.length) continue;
        const button = document.createElement('button');
        button.className = 'dw-sample';
        button.type = 'button';
        button.dataset.sample = sample.id;
        const image = document.createElement('img');
        image.src = scene.assets[0].thumbnailUrl;
        image.alt = '';
        image.loading = 'lazy';
        const title = document.createElement('strong');
        title.textContent = sample.name.replace(/^Lux3D\s*/, '');
        const details = document.createElement('small');
        details.textContent = scene.placements.length + ' 件原创家具 · 打开编辑';
        button.append(image, title, details);
        button.onclick = () => close(scene);
        grid.appendChild(button);
      }
      if (grid.childElementCount) samples.append(header, grid);
    }
    function addTemplate(container,template,create) {
      const button=document.createElement('button');button.className='dh-template-card';button.type='button';
      const doc=create();const d=template.defaultDimensions||{width:template.width,depth:template.depth};
      button.innerHTML=`<div class="dw-preview ${template.reference?'dw-preview-photo':''}">${template.reference?`<img src="${template.reference.url}" loading="lazy" alt=""><span class="dw-reference-label">参考照片</span>`:''}<div class="dw-outline">${preview(doc)}</div></div><div class="dw-card-copy"><strong></strong><span></span><small></small></div>`;
      button.querySelector('strong').textContent=template.name;button.querySelector('.dw-card-copy span').textContent=`${d.width} × ${d.depth} m`;button.querySelector('small').textContent=template.description || template.styleTags?.join(' · ')||(template.floors?`${template.floors} 层住宅`:'可编辑平层');
      button.onclick=()=>close(prepare(create()));container.appendChild(button);
    }
    for(const template of ROOM_TEMPLATES)addTemplate(overlay.querySelector('[data-mode="room"]'),template,()=>createSingleRoomDocument(template));
    for(const template of FLOORPLAN_TEMPLATES)addTemplate(overlay.querySelector('[data-mode="apartment"]'),template,()=>createApartmentDocument(template));
    for(const template of VILLA_TEMPLATES)addTemplate(overlay.querySelector('[data-mode="villa"]'),template,()=>createVillaDocument(template));
    const credits=document.createElement('details');credits.className='dw-credits';credits.innerHTML='<summary>参考照片来源与使用许可</summary><p>照片仅供空间参考，非模板实景或尺寸依据；部分预览经缩放压缩，界面裁切显示。Pexels 照片遵循其许可，不可单独出售或用于暗示背书。</p>';for(const ref of Object.values(ROOM_REFERENCES)){const p=document.createElement('p'),a=document.createElement('a'),license=document.createElement('a');a.href=ref.source;a.target='_blank';a.rel='noopener';a.textContent=ref.author;license.href=ref.licenseUrl;license.target='_blank';license.rel='noopener';license.textContent=ref.license;p.append(ref.title ? `${ref.title}：` : '',a,' · ',license);credits.append(p);}overlay.querySelector('#dw-room').append(credits);
    if(recentProjects.length&&onOpenRecent){const wrap=overlay.querySelector('[data-recent]');wrap.className='dw-recent';const heading=document.createElement('h2');heading.textContent='最近项目';wrap.append(heading);for(const project of recentProjects.slice(0,4)){const button=document.createElement('button');button.textContent=project.name||'未命名项目';button.onclick=async()=>{try{const result=await onOpenRecent(project.projectId);if(result)close(result);}catch(error){button.textContent=`打开失败：${error.message}`;}};wrap.append(button);}}
  });
}
