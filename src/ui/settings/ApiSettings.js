export class ApiSettings extends EventTarget {
  async request(path, options = {}) {
    const response = await fetch('/api/settings/' + path, {
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `设置请求失败（${response.status}）`);
    return body;
  }

  updateStatus(status) {
    this.status = status;
    this.renderStatus();
    this.dispatchEvent(new Event('change'));
    return status;
  }

  refresh() {
    if (!this.refreshing) {
      this.refreshing = this.request('status').then(status => this.updateStatus(status)).finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  open(provider = 'llm') {
    if (this.dialog) {
      this.selectProvider(provider);
      return;
    }
    const dialog = document.createElement('dialog');
    dialog.className = 'dh-api-dialog';
    dialog.setAttribute('aria-labelledby', 'dh-api-title');
    dialog.innerHTML = `
      <header class="dh-api-header">
        <h2 id="dh-api-title">API 设置</h2>
        <button type="button" class="dh-chat-link" data-close-api>关闭</button>
      </header>
      <div class="dh-api-content">
        <nav class="dh-api-tabs" aria-label="API 类型">
          <button type="button" data-settings-tab="llm" aria-pressed="true">AI 设计助手</button>
          <button type="button" data-settings-tab="aholo" aria-pressed="false">Lux3D 模型生成</button>
        </nav>
        <form data-provider="llm">
          <fieldset disabled>
            <div class="dh-api-source">
              <label>当前服务<select name="source">
                <option value="platform">平台模型</option>
                <option value="byok">个人 API</option>
              </select></label>
              <p data-api-status></p>
            </div>
            <div class="dh-api-fields">
              <h3>个人 API</h3>
              <p>使用 OpenAI 兼容服务，可用于设计对话和整套搭配。</p>
              <label>Base URL<input name="baseUrl" type="url" required placeholder="https://api.example.com/v1" autocomplete="off" spellcheck="false" /></label>
              <label>模型名称<input name="model" required placeholder="服务商提供的模型 ID" autocomplete="off" spellcheck="false" /></label>
              <label>API Key<input name="apiKey" type="password" required placeholder="填入服务商提供的密钥" autocomplete="off" /></label>
            </div>
            <div class="dh-api-actions">
              <button class="dh-button dh-primary" type="submit">保存并使用</button>
              <button class="dh-button dh-secondary" type="button" data-test-api>测试当前服务</button>
              <button class="dh-chat-link" type="button" data-delete-api hidden>删除个人配置</button>
            </div>
          </fieldset>
        </form>
        <form data-provider="aholo" hidden>
          <fieldset disabled>
            <div class="dh-api-source">
              <label>当前服务<select name="source">
                <option value="platform">平台服务</option>
                <option value="byok">个人 API</option>
              </select></label>
              <p data-api-status></p>
            </div>
            <div class="dh-api-fields">
              <h3>个人 API</h3>
              <p>使用自己的 Aholo 账户生成 Lux3D 模型。</p>
              <label>区域<select name="region">
                <option value="cn">中国区</option><option value="com">国际区</option>
              </select></label>
              <label>API Key<input name="apiKey" type="password" required placeholder="填入 Aholo 密钥" autocomplete="off" /></label>
            </div>
            <div class="dh-api-actions">
              <button class="dh-button dh-primary" type="submit">保存并使用</button>
              <button class="dh-button dh-secondary" type="button" data-test-api>测试当前服务</button>
              <button class="dh-chat-link" type="button" data-delete-api hidden>删除个人配置</button>
            </div>
          </fieldset>
        </form>
        <p class="dh-api-note" role="status"></p>
        <p class="dh-api-footnote">密钥在服务器会话中加密保存。会话到期或服务重启后需重新填写。个人 API 的调用费用由对应账户承担。</p>
      </div>`;
    this.dialog = dialog;
    for (const button of dialog.querySelectorAll('[data-settings-tab]')) {
      button.onclick = () => this.selectProvider(button.dataset.settingsTab);
    }
    for (const form of dialog.querySelectorAll('form')) this.bindForm(dialog, form);
    dialog.querySelector('[data-close-api]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => {
      for (const form of dialog.querySelectorAll('form')) form.elements.apiKey.value = '';
      dialog.remove();
      if (this.dialog === dialog) this.dialog = null;
    }, { once: true });

    document.body.append(dialog);
    this.selectProvider(provider);
    this.renderStatus();
    this.hydrateFields();
    dialog.showModal();

    if (this.running) return;
    this.run(dialog, async () => {
      await this.refresh();
      this.hydrateFields();
      this.setNote(dialog, '');
    }, '正在读取服务…');
  }

  bindForm(dialog, form) {
    const provider = form.dataset.provider;
    const fields = form.elements;
    fields.source.onchange = () => {
      const source = fields.source.value;
      this.run(dialog, async () => {
        this.updateStatus(await this.request('source', {
          method: 'POST', body: JSON.stringify({ provider, source }),
        }));
        this.setNote(dialog, '服务已切换。', 'success');
      }, '正在切换服务…');
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const payload = { apiKey: fields.apiKey.value.trim() };
      if (provider === 'llm') {
        payload.baseUrl = fields.baseUrl.value.trim();
        payload.model = fields.model.value.trim();
        if (!payload.baseUrl || !payload.model) {
          this.setNote(dialog, '请填写 Base URL 和模型名称。', 'error');
          return;
        }
      } else {
        payload.region = fields.region.value;
      }
      if (!payload.apiKey) {
        this.setNote(dialog, '请填写 API Key。', 'error');
        return;
      }
      this.run(dialog, async () => {
        this.updateStatus(await this.request(provider, { method: 'POST', body: JSON.stringify(payload) }));
        fields.apiKey.value = '';
        this.hydrateFields(provider);
        this.setNote(dialog, '已保存，正在使用个人 API。', 'success');
      }, '正在保存…');
    };
    form.querySelector('[data-test-api]').onclick = () => {
      this.run(dialog, async () => {
        const result = await this.request(provider + '/test', { method: 'POST' });
        const detail = provider === 'llm' ? `模型列表鉴权通过。当前模型为 ${result.model}。` : `只读鉴权通过，区域为 ${result.region}。`;
        this.setNote(dialog, detail, 'success');
      }, '正在测试当前服务…');
    };
    form.querySelector('[data-delete-api]').onclick = () => {
      this.run(dialog, async () => {
        this.updateStatus(await this.request(provider, { method: 'DELETE' }));
        fields.apiKey.value = '';
        this.hydrateFields(provider);
        this.setNote(dialog, '已删除个人配置，服务已切回平台。', 'success');
      }, '正在删除…');
    };
  }

  selectProvider(provider) {
    for (const button of this.dialog.querySelectorAll('[data-settings-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.settingsTab === provider));
    }
    for (const form of this.dialog.querySelectorAll('[data-provider]')) {
      form.hidden = form.dataset.provider !== provider;
    }
    if (!this.running) this.setNote(this.dialog, '');
  }

  renderStatus() {
    if (!this.dialog || !this.status) return;
    for (const form of this.dialog.querySelectorAll('[data-provider]')) {
      const service = this.status[form.dataset.provider];
      const source = form.elements.source;
      source.querySelector('[value="byok"]').disabled = !service.configured;
      source.value = service.source;
      form.querySelector('[data-api-status]').textContent = service.source === 'byok'
        ? '正在使用已保存的个人 API。'
        : (service.platformConfigured ? '正在使用平台服务。' : '平台服务尚未配置。');
      form.querySelector('[data-delete-api]').hidden = !service.configured;
      form.elements.apiKey.placeholder = service.configured ? '已保存密钥，填写新密钥可替换' : '填入服务商提供的密钥';
    }
  }

  hydrateFields(provider) {
    if (!this.dialog || !this.status) return;
    const llm = this.dialog.querySelector('[data-provider="llm"]').elements;
    if (!provider || provider === 'llm') {
      llm.baseUrl.value = this.status.llm.baseUrl;
      llm.model.value = this.status.llm.model;
    }
    if (!provider || provider === 'aholo') {
      this.dialog.querySelector('[data-provider="aholo"]').elements.region.value = this.status.aholo.region;
    }
  }

  setNote(dialog, text, state = '') {
    if (this.dialog !== dialog) return;
    const note = dialog.querySelector('.dh-api-note');
    note.dataset.state = state;
    note.textContent = text;
  }

  async run(dialog, action, pending) {
    if (this.running) return;
    this.running = true;
    this.setNote(dialog, pending);
    for (const inputs of dialog.querySelectorAll('fieldset')) inputs.disabled = true;
    try {
      await action();
    } catch (error) {
      this.renderStatus();
      this.setNote(dialog, error.message, 'error');
    } finally {
      this.running = false;
      for (const inputs of this.dialog?.querySelectorAll('fieldset') || []) inputs.disabled = false;
    }
  }
}
