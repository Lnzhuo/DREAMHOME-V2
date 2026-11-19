import { STYLE_PRESETS,openStylePreset } from '../../data/style-presets.js';

export function mountStyleGallery(section,catalog,open) {
  const grid=section.querySelector('.dw-look-grid');
  const status=section.querySelector('[role=status]');
  for(const preset of STYLE_PRESETS) {
    const card=document.createElement('button');
    card.type='button';card.className='dw-look';card.dataset.preset=preset.id;
    card.setAttribute('aria-label','使用'+preset.name+' · '+preset.room+'搭配');
    const image=document.createElement('img');
    image.src=preset.cover;image.alt=preset.materials;image.width=1280;image.height=800;
    const caption=document.createElement('span'), name=document.createElement('strong'), detail=document.createElement('small');
    const arrow=document.createElement('span');
    arrow.setAttribute('aria-hidden','true');arrow.className='dw-look-open';arrow.textContent='↗';
    name.textContent=preset.name;
    detail.textContent=preset.room+' · '+preset.materials;
    caption.className='dw-look-caption';caption.append(name,detail,arrow);
    card.append(image,caption);
    card.onclick=()=>{
      status.textContent='';
      try { open(openStylePreset(preset.id,catalog)); }
      catch(error) { status.textContent=error.message; }
    };
    grid.append(card);
  }
}
