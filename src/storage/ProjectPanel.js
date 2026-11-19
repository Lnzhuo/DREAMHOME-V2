function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export class ProjectPanel {
  constructor({ root, projectRepository, onOpen, onCreate }) {
    this.root = root;
    this.projects = projectRepository;
    this.onOpen = onOpen;
    this.onCreate = onCreate;
  }

  mount() {
    this.root.innerHTML = '<button class="dh-button dh-secondary" data-action="new">新建设计</button><div class="dh-project-list"></div>';
    this.root.querySelector('[data-action="new"]').addEventListener('click', () => this.onCreate());
    this.root.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-project]');
      if (!button) return;
      if (button.dataset.action === 'open') await this.onOpen(button.dataset.project);
      if (button.dataset.action === 'delete' && window.confirm('确定删除这个项目？家具资产库不会被删除。')) {
        await this.projects.deleteProject(button.dataset.project);
        await this.refresh();
      }
    });
    return this.refresh();
  }

  async refresh(currentProjectId) {
    const projects = await this.projects.listProjects();
    const list = this.root.querySelector('.dh-project-list');
    if (!projects.length) {
      list.innerHTML = '<div class="dh-empty">还没有保存的项目</div>';
      return;
    }
    list.innerHTML = projects.map((project) => `<div class="dh-project-item"><button data-action="open" data-project="${escapeHtml(project.projectId)}">${project.projectId === currentProjectId ? '● ' : ''}${escapeHtml(project.name)}</button><button data-action="delete" data-project="${escapeHtml(project.projectId)}" title="删除">删除</button></div>`).join('');
  }
}
