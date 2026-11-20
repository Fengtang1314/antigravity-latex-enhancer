(() => {
  'use strict';

  const host = window.sidecar;
  const transport = host && typeof host.fetch === 'function' ? host.fetch.bind(host) : fetch;
  const $ = (id) => document.getElementById(id);

  function setText(id, val) {
    const el = $(id);
    if (el && el.textContent !== String(val)) el.textContent = String(val);
  }

  function renderStatus(data) {
    if (!data || typeof data !== 'object') return;
    const badge = $('state-badge');
    const state = data.state || 'waiting';
    if (badge) {
      badge.setAttribute('data-state', state);
      badge.textContent = state;
    }
    setText('mode-val', data.mode || 'sidecar-cdp');
    setText('windows-val', String(data.windows ?? 0));
    setText('port-val', data.debugPortAvailable ? `127.0.0.1:${data.debugPort}` : '未检测到 (DevToolsActivePort 缺失)');
    setText('version-val', data.payloadVersion || '—');
    setText('checked-val', data.checkedAt ? new Date(data.checkedAt).toLocaleTimeString() : '—');
    setText('status-msg', data.message || '运行正常');
  }

  async function refresh() {
    try {
      const res = await transport('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      renderStatus(await res.json());
    } catch {
      setText('status-msg', '无法读取 Sidecar 状态接口');
    }
  }

  const btn = $('reinject-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await transport('/api/reinject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (res.ok) renderStatus(await res.json());
      } catch {}
      btn.disabled = false;
    });
  }

  void refresh();
  setInterval(() => { void refresh(); }, 3000);
})();
