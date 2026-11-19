export class ApiSettings {
  async request(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `请求失败（${response.status}）`);
    return body;
  }

  async open() {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    this.overlay.className = 'dh-preview-modal';
    this.overlay.innerHTML = `
      <div class="dh-preview-card" style="height:auto;max-height:90vh;overflow:auto;width:min(680px,94vw)">
        <button class="dh-preview-close" aria-label="关闭">×</button>
        <h2>AI 服务与 API 管理</h2>
        <p class="dh-muted">密钥仅在服务端会话内加密保存和调用（服务重启或会话过期后需重新填写），不写入项目、浏览器存储或导出包。使用自有 Key 时费用由相应账户承担。</p>
        <section><h3>Aholo / Lux3D</h3><label>服务来源 <select data-source="aholo"><option value="platform">平台</option><option value="byok">个人 Key</option></select></label><div data-aholo-status class="dh-muted"></div>
          <div class="dh-field"><label>区域</label><select data-field="region"><option value="cn">中国区 cn</option><option value="com">国际区 com</option></select></div>
          <div class="dh-field"><label>API Key</label><input data-field="aholo-key" type="password" autocomplete="off" placeholder="输入后保存，不回显" /></div>
          <div class="dh-row"><button class="dh-button dh-primary" data-action="aholo-save">保存 / 替换</button><button class="dh-button dh-secondary" data-action="aholo-test">连接测试</button><button class="dh-button dh-secondary" data-action="aholo-delete">删除</button></div>
        </section>
        <section><h3>LLM（OpenAI 兼容）</h3><label>服务来源 <select data-source="llm"><option value="platform">平台</option><option value="byok">个人 Key</option></select></label><div data-llm-status class="dh-muted"></div>
          <div class="dh-field"><label>Base URL</label><input data-field="llm-base" type="url" placeholder="https://provider.example.com/v1" /></div>
          <div class="dh-field"><label>Model</label><input data-field="llm-model" placeholder="模型名称" /></div>
          <div class="dh-field"><label>API Key</label><input data-field="llm-key" type="password" autocomplete="off" placeholder="输入后保存，不回显" /></div>
          <div class="dh-row"><button class="dh-button dh-primary" data-action="llm-save">保存 / 替换</button><button class="dh-button dh-secondary" data-action="llm-test">连接测试</button><button class="dh-button dh-secondary" data-action="llm-delete">删除</button></div>
        </section>
        <div data-settings-message role="status" class="dh-muted"></div>
      </div>`;
    document.body.appendChild(this.overlay);
    this.overlay.querySelector('.dh-preview-close').addEventListener('click', () => this.close());
    this.overlay.querySelector('[data-action="aholo-save"]').addEventListener('click', () => this.saveAholo().catch((error) => this.message(error.message, true)));
    this.overlay.querySelector('[data-action="aholo-test"]').addEventListener('click', () => this.testAholo().catch((error) => this.message(error.message, true)));
    this.overlay.querySelector('[data-action="aholo-delete"]').addEventListener('click', () => this.deleteAholo().catch((error) => this.message(error.message, true)));
    this.overlay.querySelector('[data-action="llm-save"]').addEventListener('click', () => this.saveLlm().catch((error) => this.message(error.message, true)));
    this.overlay.querySelector('[data-action="llm-test"]').addEventListener('click', () => this.testLlm().catch((error) => this.message(error.message, true)));
    this.overlay.querySelector('[data-action="llm-delete"]').addEventListener('click', () => this.deleteLlm().catch((error) => this.message(error.message, true)));
    for (const provider of ['aholo', 'llm']) this.overlay.querySelector(`[data-source="${provider}"]`).addEventListener('change', async (event) => {
      try { await this.request('/api/settings/source', { method: 'POST', body: JSON.stringify({ provider, source: event.target.value }) }); await this.load(); this.message('服务来源已切换'); }
      catch (error) { this.message(error.message, true); await this.load(); }
    });
    await this.load();
  }

  message(text, error = false) {
    const element = this.overlay.querySelector('[data-settings-message]');
    element.textContent = text;
    element.className = error ? 'dh-error' : 'dh-success';
  }

  async load() {
    const status = await this.request('/api/settings/status');
    this.overlay.querySelector('[data-source="aholo"]').value = status.aholo.source;
    this.overlay.querySelector('[data-source="llm"]').value = status.llm.source;
    this.overlay.querySelector('[data-aholo-status]').textContent = status.aholo.source === 'platform' ? (status.aholo.platformConfigured ? '当前使用平台配置' : '平台未配置') : `当前使用个人 Key ${status.aholo.keyMask} · ${status.aholo.region}`;
    this.overlay.querySelector('[data-field="region"]').value = status.aholo.region || 'cn';
    this.overlay.querySelector('[data-llm-status]').textContent = status.llm.source === 'platform' ? (status.llm.platformConfigured ? '当前使用平台配置' : '平台未配置真实 LLM') : `当前使用个人 Key ${status.llm.keyMask} · ${status.llm.model}`;
    this.overlay.querySelector('[data-field="llm-base"]').value = status.llm.baseUrl;
    this.overlay.querySelector('[data-field="llm-model"]').value = status.llm.model;
  }

  async saveAholo() {
    const input = this.overlay.querySelector('[data-field="aholo-key"]');
    if (!input.value.trim()) return this.message('请输入 Aholo API Key', true);
    await this.request('/api/settings/aholo', { method: 'POST', body: JSON.stringify({ apiKey: input.value.trim(), region: this.overlay.querySelector('[data-field="region"]').value }) });
    input.value = '';
    await this.load();
    this.message('Aholo 配置已加密保存');
  }

  async testAholo() {
    const result = await this.request('/api/settings/aholo/test', { method: 'POST' });
    this.message(`只读鉴权成功：${result.region}，未创建生成任务`);
  }

  async deleteAholo() {
    await this.request('/api/settings/aholo', { method: 'DELETE' });
    await this.load();
    this.message('Aholo 用户 Key 已删除');
  }

  async saveLlm() {
    const key = this.overlay.querySelector('[data-field="llm-key"]');
    const baseUrl = this.overlay.querySelector('[data-field="llm-base"]').value.trim();
    const model = this.overlay.querySelector('[data-field="llm-model"]').value.trim();
    if (!key.value.trim() || !baseUrl || !model) return this.message('LLM Key、Base URL 和 Model 必填', true);
    await this.request('/api/settings/llm', { method: 'POST', body: JSON.stringify({ apiKey: key.value.trim(), baseUrl, model }) });
    key.value = '';
    await this.load();
    this.message('LLM 配置已加密保存');
  }

  async testLlm() {
    const result = await this.request('/api/settings/llm/test', { method: 'POST' });
    this.message(`LLM 连接成功：${result.model}，未调用生成内容`);
  }

  async deleteLlm() {
    await this.request('/api/settings/llm', { method: 'DELETE' });
    await this.load();
    this.message('LLM 用户 Key 已删除');
  }

  close() {
    this.overlay?.remove();
    this.overlay = null;
  }
}
