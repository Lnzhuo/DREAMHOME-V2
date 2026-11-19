import { STYLE_PRESETS,openStylePreset } from '../../data/style-presets.js';

export function mountStyleGallery(section,catalog,open,featured) {
  const grid=section.querySelector('.dw-look-grid');
  const status=section.querySelector('[role=status]');
  function select(preset, feedback) {
    feedback.textContent = '';
    try { open(openStylePreset(preset.id,catalog)); }
    catch(error) { feedback.textContent=error.message; }
  }

  const lead = STYLE_PRESETS[0];
  featured.innerHTML = `
    <img src="${lead.cover}" width="1280" height="800" fetchpriority="high" alt="${lead.materials}">
    <figcaption class="dw-feature-caption">
      <span><strong>${lead.name}</strong><small>${lead.room}</small></span>
      <button type="button" class="dw-feature-open">打开 3D 样板间</button>
      <p class="dw-feedback" role="status"></p>
    </figcaption>`;
  featured.querySelector('button').onclick = () => select(lead,featured.querySelector('[role=status]'));

  for(const preset of STYLE_PRESETS) {
    const card=document.createElement('button');
    card.type='button';card.className='dw-look';card.dataset.preset=preset.id;
    card.setAttribute('aria-label','使用'+preset.name+' · '+preset.room+'搭配');
    const image=document.createElement('img');
    image.src=preset.cover;image.alt=preset.materials;image.width=1280;image.height=800;
    image.loading='lazy';
    const caption=document.createElement('span'), name=document.createElement('strong'), detail=document.createElement('small');
    const arrow=document.createElement('span');
    arrow.setAttribute('aria-hidden','true');arrow.className='dw-look-open';
    name.textContent=preset.name;
    detail.textContent=preset.room+' · '+preset.materials;
    caption.className='dw-look-caption';caption.append(name,detail,arrow);
    card.append(image,caption);
    card.onclick=()=>select(preset,status);
    grid.append(card);
  }
}
