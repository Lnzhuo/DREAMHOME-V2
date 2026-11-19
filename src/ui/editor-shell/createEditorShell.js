import pkg from '../../../package.json' with { type: 'json' };
export function createEditorShell({ projectName = '未命名客厅' } = {}) {
  const root = document.createElement('div');
  root.className = 'dh-app';
  root.dataset.editorMode = 'ai';
  root.innerHTML = `
    <header class="dh-topbar">
      <button type="button" class="dh-brand" data-action="home" aria-label="打开设计首页" title="选择房间或户型新建项目"><span class="dh-brand-mark" aria-hidden="true">D</span><div><strong>DREAMHOME</strong><span>造梦家空间设计 · v${pkg.version}</span></div></button>
      <input class="dh-project-name" aria-label="项目名称" value="${projectName.replace(/["<>]/g, '')}" />
      <div class="dh-top-actions">
        <button class="dh-button dh-secondary" data-action="settings">API 管理</button>
        <details class="dh-files"><summary>设计文件</summary><div><button data-action="export">导出设计</button><label>导入设计<input data-action="import" type="file" accept=".dreamhome" hidden></label><button data-action="restore">恢复已存版本</button></div></details><span class="dh-save-state" role="status">已保存</span>
        <button class="dh-button dh-secondary" data-action="undo" title="撤销">撤销</button>
        <button class="dh-button dh-secondary" data-action="redo" title="重做">重做</button>
        <button class="dh-button dh-primary" data-action="save">保存项目</button>
      </div>
    </header>
    <main class="dh-workspace">
      <aside class="dh-left">
        <section class="dh-panel dh-assets-section" aria-labelledby="dh-library-heading">
          <h2 class="dh-panel-title" id="dh-library-heading">资源库</h2>
          <div class="dh-library-tabs"><button data-library="furniture" data-active="true">家具</button><button data-library="materials">材料</button></div>
          <div class="dh-asset-library"></div><div class="dh-material-library" hidden></div>
        </section>
        <section class="dh-panel dh-space-section"><div class="dh-panel-title">空间结构</div><div class="dh-space-tree"></div></section>
        <section class="dh-panel dh-projects-section"><div class="dh-panel-title">我的项目</div><div class="dh-project-panel"></div><div class="dh-reference-panel"></div></section>
      </aside>
      <section class="dh-center">
        <div class="dh-editor-bar">
          <div class="dh-editor-modes" role="group" aria-label="编辑模式">
            <button type="button" data-editor-mode-choice="ai" aria-pressed="true">AI 助手</button>
            <button type="button" data-editor-mode-choice="manual" aria-pressed="false">手动调整</button>
          </div>
          <button class="dh-button dh-secondary dh-focus-toggle" type="button" data-action="focus">收起面板</button>
          <div class="dh-mobile-panels">
            <button type="button" data-panel="left" aria-expanded="false">资源库</button>
            <button type="button" data-panel="right" aria-expanded="false">打开助手</button>
          </div>
        </div>
        <div class="dh-toolbar" data-manual-controls hidden></div>
        <div class="dh-view-switch">
          <div class="dh-view-modes" role="group" aria-label="画布视图">
            <button data-view="3d" data-active="true">3D 编辑</button><button data-view="2d">2D 平面</button><button data-view="walk">漫游</button>
          </div>
          <div class="dh-view-actions" role="group" aria-label="取景工具">
            <button data-action="interior">室内取景</button><button data-action="overview">全景</button><button data-action="cutaway" aria-pressed="true">剖视</button><button data-action="still">渲染效果图</button>
          </div>
        </div>
        <div class="dh-canvas-wrap">
          <div class="dh-canvas"></div>
          <div class="dh-walk-pad" aria-label="漫游移动"><button data-walk="w" aria-label="前进">↑</button><button data-walk="a" aria-label="左移">←</button><button data-walk="s" aria-label="后退">↓</button><button data-walk="d" aria-label="右移">→</button></div>
          <div class="dh-floorplan" hidden></div><div class="dh-upload-state" role="status" hidden></div>
        </div>
        <div class="dh-canvas-hint">拖动旋转视角，滚轮缩放。漫游时用方向键移动。</div>
      </section>
      <aside class="dh-right" aria-label="AI 设计助手">
        <section class="dh-panel" data-manual-controls hidden><div class="dh-panel-title">家具属性</div><div class="dh-property-panel"><div class="dh-empty">选择一件家具开始编辑</div></div></section>
        <details class="dh-panel dh-room-section" data-manual-controls open hidden><summary class="dh-panel-title">房间参数</summary><label class="dh-style-select">墙地配色 <select data-action="style"><option value="">选择风格</option></select></label><div class="dh-room-panel"></div></details><section class="dh-panel dh-ai-section"><div class="dh-panel-title">AI 设计助手</div><div class="dh-ai-panel"></div></section>
      </aside>
    </main>`;

  const query = (selector) => root.querySelector(selector);
  const saveState = query('.dh-save-state');
  const uploadState = query('.dh-upload-state');
  const rightPanel = query('.dh-right');
  const aiSection = query('.dh-ai-section');
  const manualSections = root.querySelectorAll('[data-manual-controls]');
  const modeButtons = root.querySelectorAll('[data-editor-mode-choice]');
  const panelButtons = root.querySelectorAll('[data-panel]');

  function setOpenPanel(panel) {
    root.dataset.panel = panel;
    for (const button of panelButtons) {
      const open = button.dataset.panel === panel;
      button.setAttribute('aria-expanded', String(open));
      if (button.dataset.panel === 'right') {
        button.textContent = (open ? '收起' : '打开') + (root.dataset.editorMode === 'ai' ? '助手' : '参数');
      }
    }
  }

  function setEditorMode(mode) {
    const changed = mode !== root.dataset.editorMode;
    const manual = mode === 'manual';
    root.dataset.editorMode = mode;
    aiSection.hidden = manual;
    manualSections.forEach((section) => { section.hidden = !manual; });
    modeButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.editorModeChoice === mode));
    });
    rightPanel.setAttribute('aria-label', manual ? '手动调整参数' : 'AI 设计助手');
    if (changed) {
      rightPanel.scrollTop = 0;
      root.dispatchEvent(new Event('editor-mode-change'));
    }
    setOpenPanel(window.matchMedia('(max-width: 850px)').matches ? 'right' : '');
  }

  for (const button of modeButtons) {
    button.addEventListener('click', () => setEditorMode(button.dataset.editorModeChoice));
  }
  for (const button of panelButtons) {
    button.addEventListener('click', () => {
      setOpenPanel(root.dataset.panel === button.dataset.panel ? '' : button.dataset.panel);
    });
  }
  return {
    root,
    homeButton: query('[data-action="home"]'),
    settingsButton: query('[data-action="settings"]'),
    overviewButton: query('[data-action="overview"]'),
    roomPanel: query('.dh-room-panel'),
    canvas: query('.dh-canvas'),
    floorplan: query('.dh-floorplan'),
    viewButtons: [...root.querySelectorAll('[data-view]')],
    assetLibrary: query('.dh-asset-library'),
    materialLibrary: query('.dh-material-library'),
    libraryTabs: [...root.querySelectorAll('[data-library]')],
    spaceTree: query('.dh-space-tree'),
    propertyPanel: query('.dh-property-panel'),
    aiPanel: query('.dh-ai-panel'),
    projectPanel: query('.dh-project-panel'),
    toolbar: query('.dh-toolbar'),
    projectNameInput: query('.dh-project-name'),
    saveButton: query('[data-action="save"]'),
    undoButton: query('[data-action="undo"]'),
    redoButton: query('[data-action="redo"]'),
    setSaveState(state, message) {
      saveState.dataset.state = state;
      saveState.textContent = message || ({ saving: '保存中…', saved: '已保存', error: '保存失败', dirty: '有未保存修改' }[state] || state);
    },
    setUploadState(state, message) {
      uploadState.hidden = !message;
      uploadState.dataset.state = state;
      uploadState.textContent = message || '';
    },
    setProjectName(name) {
      query('.dh-project-name').value = name;
    },
    destroy() {
      root.remove();
    },
  };
}
