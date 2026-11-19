import { createModelPreview } from './preview.js';

function el(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function createHUD({ objects, project, onClue, onReset, onRestart }) {
  const root = el(`
    <div class="hud">
      <div class="topbar">
        <div class="brand">
          <h1>${project.title}</h1>
          <p>${project.subtitle}</p>
        </div>
        <div class="progress-pill">已找回 <strong id="found-count">0</strong> / ${objects.length} 段记忆</div>
      </div>
      <aside class="clue-panel">
        <h2>记忆线索</h2>
        <ul class="clue-list">
          ${objects
            .map(
              (item) => `
            <li>
              <button class="clue-item" data-id="${item.id}">
                <span class="clue-name"><span class="status-dot">○</span>${item.name}</span>
                <span class="clue-text">${item.clue}</span>
              </button>
            </li>`,
            )
            .join('')}
        </ul>
      </aside>
      <div class="bottom-bar">
        <button class="ghost-btn" data-action="behind">制作幕后</button>
        <button class="ghost-btn" data-action="reset">重置视角</button>
        <span class="control-hint">拖动旋转 · 滚轮缩放 · 点击物品读故事</span>
      </div>
    </div>
  `);
  document.body.appendChild(root);

  const startOverlay = el(`
    <div class="overlay">
      <div class="card">
        <h2>${project.title}</h2>
        <p class="sub">${project.subtitle}</p>
        <p>${project.intro}</p>
        <ul>
          <li>6 件旧物，6 段被它们记住的小事</li>
          <li>点击物品，查看「原始照片 → 3D 模型 → 记忆故事」</li>
          <li>集齐全部记忆，看看这个房间会发生什么</li>
        </ul>
        <button class="primary-btn" id="start-btn">进入房间</button>
        <div class="credit-line">${project.credit}<br/>建议使用电脑浏览器体验</div>
      </div>
    </div>
  `);
  document.body.appendChild(startOverlay);

  const behindOverlay = el(`
    <div class="overlay" hidden>
      <button class="modal-close" aria-label="关闭">×</button>
      <div class="card">
        <h3>这间房间是怎么做出来的</h3>
        <p class="sub">从一张照片，到可以走进去的 3D 记忆</p>
        <div class="pipeline">
          <div class="pipeline-step"><div class="num">1</div><div><strong>拍摄日常物品</strong><span>纯色背景、光线均匀、主体完整，每件物品拍一张清晰照片。</span></div></div>
          <div class="pipeline-step"><div class="num">2</div><div><strong>Aholo Lux3D 图生 3D</strong><span>上传照片生成 3DGS 快速预览，再生成带 PBR 材质的 Mesh，可预览、可编辑。</span></div></div>
          <div class="pipeline-step"><div class="num">3</div><div><strong>导出 GLB 并优化</strong><span>控制面数后导出 GLB，放入 assets/models，页面自动替换占位模型。</span></div></div>
          <div class="pipeline-step"><div class="num">4</div><div><strong>Three.js 搭建记忆房间</strong><span>房间、家具、光照、相机与拾取交互，模型按统一尺寸归一化。</span></div></div>
          <div class="pipeline-step"><div class="num">5</div><div><strong>线索与叙事</strong><span>每件物品配一条线索和一段记忆，集齐后触发房间灯光结局。</span></div></div>
        </div>
        <p style="margin-top:18px">技术栈：Aholo Lux3D（图生 3D） · Three.js · Vite。未接入真实模型的物品会显示占位几何体，并在记忆卡片中标注。</p>
        <button class="primary-btn" data-close>回到房间</button>
      </div>
    </div>
  `);
  document.body.appendChild(behindOverlay);

  const memoryOverlay = el(`<div class="overlay" hidden></div>`);
  document.body.appendChild(memoryOverlay);

  const endOverlay = el(`
    <div class="overlay" hidden>
      <div class="card">
        <h3>记忆已集齐</h3>
        <p class="sub">6 / 6 段记忆 · 房间亮起来了</p>
        <p>谢谢你，替这个房间找回了它记住的东西。</p>
        <p>杯子还记得深夜的热气，台灯还记得那圈不肯熄灭的光，绿植还记得每一次浇水，玩偶还记得那些没说出口的话。它们一直都在，只是我们平时走得太快，忘了回头看一眼。</p>
        <p>这一次，我们把它们重新做回了 3D 的样子，也把那段日子，重新走了一遍。</p>
        <button class="primary-btn" id="restart-btn">再玩一次</button>
        <button class="ghost-btn" id="ending-behind" style="width:100%;margin-top:12px">看看这间房间是怎么做的</button>
        <div class="credit-line">${project.credit}</div>
      </div>
    </div>
  `);
  document.body.appendChild(endOverlay);

  const toastEl = el(`<div class="toast"></div>`);
  document.body.appendChild(toastEl);
  let toastTimer;
  let activePreview = null;

  root.querySelector('[data-action="behind"]').addEventListener('click', () => {
    behindOverlay.hidden = false;
  });
  root.querySelector('[data-action="reset"]').addEventListener('click', () => onReset?.());
  behindOverlay.querySelector('.modal-close').addEventListener('click', () => {
    behindOverlay.hidden = true;
  });
  behindOverlay.querySelector('[data-close]').addEventListener('click', () => {
    behindOverlay.hidden = true;
  });
  behindOverlay.addEventListener('click', (event) => {
    if (event.target === behindOverlay) behindOverlay.hidden = true;
  });
  endOverlay.querySelector('#restart-btn').addEventListener('click', () => onRestart?.());
  endOverlay.querySelector('#ending-behind').addEventListener('click', () => {
    behindOverlay.hidden = false;
  });

  root.querySelectorAll('.clue-item').forEach((button) => {
    button.addEventListener('click', () => {
      onClue?.(button.dataset.id);
      toast('镜头已移向线索附近，点击物品就能读它的故事');
    });
  });

  startOverlay.querySelector('#start-btn').addEventListener('click', () => {
    startOverlay.hidden = true;
  });

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  function markFound(id, count) {
    root.querySelector('#found-count').textContent = String(count);
    const button = root.querySelector(`.clue-item[data-id="${id}"]`);
    if (button) {
      button.classList.add('found');
      button.querySelector('.status-dot').textContent = '●';
    }
  }

  function closeMemory() {
    if (activePreview) {
      activePreview.dispose();
      activePreview = null;
    }
    memoryOverlay.hidden = true;
    memoryOverlay.innerHTML = '';
  }

  function openMemory(data, { collected, onCollect, getModel }) {
    const hasModel = data.hasModel;
    const modelBadge = !hasModel
      ? '占位模型 · 等待 Lux3D 生成资产'
      : data.asset?.source === 'lux3d_image'
        ? '3D 模型 · Aholo Lux3D 图生 3D'
        : data.asset?.source === 'lux3d_text'
          ? '3D 模型 · Aholo Lux3D 文生 3D'
          : '3D 模型 · 本地资产（来源待核验）';
    const card = el(`
      <div class="card">
        <span class="badge">${modelBadge}</span>
        <h3>${data.name}</h3>
        <p class="sub">线索：${data.clue}</p>
        <div class="memory-grid">
          <div>
            <div class="memory-photo"></div>
            <div class="media-label">原始照片</div>
          </div>
          <div>
            <div class="model-preview"></div>
            <div class="media-label">3D 模型 · 可拖动旋转</div>
          </div>
        </div>
        <p class="memory-story">${data.story}</p>
        <button class="primary-btn">${collected ? '已收藏这段记忆' : '收下这段记忆'}</button>
        <div class="credit-line">原始照片 → Lux3D 生成 3D 模型 → 放回房间</div>
      </div>
    `);

    const closeButton = el(`<button class="modal-close" aria-label="关闭">×</button>`);
    closeButton.addEventListener('click', closeMemory);

    const photoBox = card.querySelector('.memory-photo');
    const img = new Image();
    img.alt = `${data.name} 的原始照片`;
    const candidates = ['jpg', 'jpeg', 'png', 'webp'].map((ext) => `assets/photos/${data.id}.${ext}`);
    let attempt = 0;
    img.addEventListener('error', () => {
      attempt += 1;
      if (attempt < candidates.length) {
        img.src = candidates[attempt];
      } else {
        photoBox.innerHTML =
          '<div class="placeholder-text">原始照片位<br/>assets/photos/' +
          data.id +
          '.jpg<br/><br/>生成后可对照「照片 → 3D」效果</div>';
      }
    });
    img.src = candidates[0];
    photoBox.appendChild(img);

    const previewBox = card.querySelector('.model-preview');
    const sourceModel = getModel?.(data.id);
    if (previewBox && sourceModel) {
      activePreview = createModelPreview(previewBox, sourceModel);
    } else if (previewBox) {
      previewBox.innerHTML = '<div class="placeholder-text">模型加载中…</div>';
    }

    card.querySelector('.primary-btn').addEventListener('click', () => {
      if (collected) {
        closeMemory();
        return;
      }
      onCollect?.(data.id);
    });

    memoryOverlay.innerHTML = '';
    memoryOverlay.appendChild(closeButton);
    memoryOverlay.appendChild(card);
    memoryOverlay.hidden = false;
    memoryOverlay.onclick = (event) => {
      if (event.target === memoryOverlay) closeMemory();
    };
  }

  return {
    toast,
    markFound,
    openMemory,
    closeMemory,
    showEnding: () => {
      endOverlay.hidden = false;
    },
  };
}
