import { createDesignedRoom } from '../../data/designed-room.js';
import { PALETTES, SPACES } from '../../data/room-brief.js';

export function mountRoomDesigner(root, assets, open) {
  root.innerHTML=`
    <form class="dw-brief-form">
      <label for="dw-brief">描述你的房间</label>
      <textarea id="dw-brief" required maxlength="1200" rows="3" placeholder="想要一个鼠尾草绿的客厅，下午能在窗边看书，留点地方放植物。"></textarea>
      <div class="dw-examples"><button type="button">窗边阅读的绿调客厅</button><button type="button">暖陶色的双人卧室</button><button type="button">胡桃木餐厅，四人用餐</button></div>
      <button class="dw-generate" type="submit">生成整套搭配 <span aria-hidden="true">↗</span></button>
    </form>
    <div class="dw-brief-result" aria-live="polite"></div>`;
  const form=root.querySelector('form'), field=form.querySelector('textarea');
  const submit=form.querySelector('[type="submit"]'), result=root.querySelector('.dw-brief-result');
  const examples=['想要一个鼠尾草绿的客厅，窗边可以看书，有绿植和地毯。','想要一间暖陶色的双人卧室，有收纳，床边留一把阅读椅。','四个人平时一起吃饭，想要中古胡桃木餐厅，配一盏温暖的灯。'];
  let revision=0;
  const clear=()=>{revision++;submit.disabled=false;root.removeAttribute('aria-busy');result.replaceChildren();};
  field.oninput=clear;
  form.querySelectorAll('.dw-examples button').forEach((b,i)=>b.onclick=()=>{clear();field.value=examples[i];field.focus();});
  const action=(label,fn)=>{
    const b=document.createElement('button');
    b.type='button';b.className='dw-generate';b.textContent=label;b.onclick=fn;return b;
  };
  async function generate(localOnly=false) {
    if(!field.value.trim()) {field.focus();return;}
    const current=++revision;
    submit.disabled=true;root.setAttribute('aria-busy','true');
    result.textContent='正在根据需求搭配家具、材料和布局…';
    try {
      const res=await fetch('/api/ai/room-design',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:field.value.trim(),localOnly})});
      const data=await res.json();
      if(current!==revision || !root.isConnected) return;
      if(!res.ok) throw new Error(data.error||'生成失败，请重试');
      const {brief,source}=data;
      const {document:scene,omitted}=createDesignedRoom(brief,assets);
      const heading=document.createElement('strong'),summary=document.createElement('p');
      heading.textContent=SPACES[brief.space]+' · '+PALETTES[brief.palette].name;
      const names=[...new Set(scene.assets.map(a=>a.name))];
      summary.textContent=(source==='llm'?'AI 搭配':'本地规则搭配')+' · '+brief.width+' × '+brief.depth+' 米 · '+scene.placements.length+' 件。'+names.join('、')+'。';
      result.replaceChildren(heading,summary);
      if(brief.note){const note=document.createElement('p');note.textContent='搭配意图 · '+brief.note;result.append(note);}
      if(omitted.length){const note=document.createElement('p');note.textContent='受空间或资源库限制，未放入'+omitted.join('、')+'。';result.append(note);}
      result.append(action('打开这套 3D 设计 →',()=>open(scene)));
    } catch(error) {
      if(current!==revision || !root.isConnected) return;
      result.textContent=error.message;
      if(!localOnly) result.append(action('使用本地规则搭配',()=>generate(true)));
    } finally {
      if(current===revision){submit.disabled=false;root.removeAttribute('aria-busy');}
    }
  }
  form.onsubmit=e=>{e.preventDefault();generate();};
}
