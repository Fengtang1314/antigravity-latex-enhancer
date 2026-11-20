// Non-invasive CDP runtime injector for Antigravity LaTeX Enhancer.
// Reuses the shared <profile>/DevToolsActivePort without killing or relaunching the host.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import { platformPaths } from './platform.mjs';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const SKIP_COOLDOWN_MS = 15000;

export function validTarget(target, port) {
  try {
    if (!target || target.type !== 'page') return false;
    const page = new URL(target.url);
    const ws = new URL(target.webSocketDebuggerUrl);
    return (
      ['http:', 'https:'].includes(page.protocol) &&
      LOOPBACK.has(page.hostname) &&
      ws.protocol === 'ws:' &&
      LOOPBACK.has(ws.hostname) &&
      Number(ws.port) === port
    );
  } catch {
    return false;
  }
}

function jsonGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 1048576) req.destroy(new Error('Renderer discovery response too large'));
      });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error('Renderer discovery unavailable');
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('Renderer discovery timeout')));
    req.end();
  });
}

export async function readDebugPort(profile) {
  const text = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
  if (text.length > 1024) throw new Error('Invalid renderer discovery file');
  const port = Number(text.split(/\r?\n/)[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid renderer port');
  return port;
}

export async function discoverTargets(profile) {
  const port = await readDebugPort(profile);
  const targets = await jsonGet(port, '/json/list');
  if (!Array.isArray(targets)) throw new Error('Invalid renderer discovery response');
  const filtered = targets.filter((target) => validTarget(target, port));
  filtered.port = port;
  return filtered;
}

export class CdpConnection {
  constructor(url, { WebSocketImpl = globalThis.WebSocket, timeout = 5000, onEvent = () => {}, onClose = () => {} } = {}) {
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.timeout = timeout;
    this.onEvent = onEvent;
    this.onClose = onClose;
    this.pending = new Map();
    this.nextId = 0;
    this.closed = false;
  }

  async open() {
    if (!this.WebSocketImpl) throw new Error('This Node runtime has no WebSocket support');
    this.ws = new this.WebSocketImpl(this.url);
    this.ws.addEventListener('message', (event) => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 2097152) return;
        const message = JSON.parse(event.data);
        if (message.id) {
          const item = this.pending.get(message.id);
          if (!item) return;
          this.pending.delete(message.id);
          clearTimeout(item.timer);
          if (message.error) item.reject(new Error('Renderer command failed: ' + message.error.code));
          else item.resolve(message.result || {});
        } else if (message.method) {
          this.onEvent(message);
        }
      } catch {
        // Ignore unrelated/malformed renderer events.
      }
    });
    this.ws.addEventListener('close', () => this.disconnect());
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.close();
        reject(new Error('Renderer connection timeout'));
      }, this.timeout);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); this.close(); reject(new Error('Renderer connection failed')); }, { once: true });
    });
    return this;
  }

  command(method, params = {}) {
    if (this.closed || this.ws?.readyState !== 1) return Promise.reject(new Error('Renderer disconnected'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Renderer command timeout'));
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('Renderer disconnected'));
    }
    this.pending.clear();
    this.onClose();
  }

  close() {
    this.disconnect();
    this.ws?.close();
  }
}

export function computePayloadVersion(payloadSource) {
  return '3.0.0-' + createHash('sha256').update(String(payloadSource || '')).digest('hex').slice(0, 12);
}

export function makePayloadSource(payloadSource, { origin, version = computePayloadVersion(payloadSource) } = {}) {
  const originCheck = origin ? `location.origin === ${JSON.stringify(origin)} && ` : '';
  return `(() => {
    try {
      if (typeof location === 'undefined' || !(${originCheck}(location.protocol === 'http:' || location.protocol === 'https:'))) return;
      if (location.href.startsWith('chrome-error:')) return;
      window.__VOYAGER_LATEX_EXPECTED_VERSION__ = ${JSON.stringify(version)};
      ${payloadSource}
    } catch (_) {}
  })();`;
}

export const HOST_PROBE_EXPR = `(() => {
  try {
    if (!location || (location.protocol !== 'http:' && location.protocol !== 'https:')) {
      return { ok: false, reason: 'non-http' };
    }
    if (location.href.startsWith('chrome-error:')) {
      return { ok: false, reason: 'chrome-error' };
    }
    const isHost = Boolean(document.getElementById('root')) && (
      location.pathname.startsWith('/c/') ||
      Boolean(document.querySelector('[data-testid="model-selector-trigger"], .rounded-composer')) ||
      Boolean(window.__agPulseInlineInstalled) ||
      Boolean(document.body && typeof document.body.className === 'string' && document.body.className.includes('theme-')) ||
      /Antigravity/i.test(document.title || '')
    );
    return {
      ok: isHost,
      reason: isHost ? 'antigravity-host' : 'non-host-page',
      initialized: Boolean(window.__VOYAGER_LATEX_INITIALIZED__),
      version: window.__VOYAGER_LATEX_VERSION__ || null,
      katexCount: document.querySelectorAll('.katex').length
    };
  } catch {
    return { ok: false, reason: 'probe-error' };
  }
})()`;

export class RuntimeCdp {
  constructor({
    payloadSource,
    payloadVersion,
    profile = platformPaths().profile,
    dataDir = platformPaths().data,
    owns = async () => true,
    enabled = async () => true,
    discover = discoverTargets,
    connect = (url, options) => new CdpConnection(url, options),
    interval = 3000,
    hostProbeExpr = HOST_PROBE_EXPR,
  } = {}) {
    this.payloadSource = payloadSource;
    this.payloadVersion = payloadVersion || computePayloadVersion(payloadSource);
    this.profile = profile;
    this.dataDir = dataDir;
    this.owns = owns;
    this.enabled = enabled;
    this.discover = discover;
    this.connect = connect;
    this.interval = interval;
    this.hostProbeExpr = hostProbeExpr;

    this.sessions = new Map();
    this.skipped = new Map();
    this.running = false;
    this.stopping = false;
    this.busy = false;
    this.timer = null;
    this.lastPort = null;
    this.health = {
      state: 'waiting',
      mode: 'sidecar-cdp',
      message: 'Waiting for Antigravity renderer',
      windows: 0,
      payloadVersion: this.payloadVersion,
      debugPortAvailable: false,
      debugPort: null,
    };
  }

  async setHealth(state, message, extra = {}) {
    this.health = {
      state,
      mode: 'sidecar-cdp',
      message,
      windows: this.sessions.size,
      payloadVersion: this.payloadVersion,
      debugPortAvailable: Boolean(extra.debugPortAvailable),
      debugPort: extra.debugPort ?? null,
      ...(extra.reason ? { reason: extra.reason } : {}),
      ...(extra.skippedTargets !== undefined ? { skippedTargets: extra.skippedTargets } : {}),
      checkedAt: new Date().toISOString(),
    };
    if (this.dataDir && (await this.owns())) {
      try {
        await mkdir(this.dataDir, { recursive: true });
        await writeFile(join(this.dataDir, 'integration-state.json'), JSON.stringify(this.health, null, 2) + '\n');
      } catch {
        // State reporting must never crash injection.
      }
    }
  }

  async event(connection, message) {
    if (this.stopping || connection.closed) return;
    const p = message.params || {};
    if (message.method === 'Page.frameNavigated' && p.frame && !p.frame.parentId) {
      connection.frameId = p.frame.id;
      connection.contexts.clear();
      return;
    }
    if (message.method === 'Runtime.executionContextCreated') {
      if (p.context?.auxData?.isDefault && p.context.auxData.frameId === connection.frameId) {
        connection.contexts.add(p.context.id);
      }
      return;
    }
    if (message.method === 'Runtime.executionContextsCleared') {
      connection.contexts.clear();
      return;
    }
    if (message.method === 'Runtime.executionContextDestroyed') {
      connection.contexts.delete(p.executionContextId);
    }
  }

  async attach(target) {
    let connection;
    connection = this.connect(target.webSocketDebuggerUrl, {
      onEvent: (message) => {
        void this.event(connection, message);
      },
    });
    connection.origin = new URL(target.url).origin;
    connection.pageUrl = target.url;
    connection.contexts = new Set();

    try {
      await connection.open();
      if (this.stopping || !(await this.owns())) throw new Error('Sidecar ownership changed');

      const frame = await connection.command('Page.getFrameTree');
      connection.frameId = frame.frameTree?.frame?.id;
      if (!connection.frameId) throw new Error('Main renderer frame unavailable');

      await connection.command('Page.enable');
      await connection.command('Runtime.enable');

      const probeRes = await connection.command('Runtime.evaluate', {
        expression: this.hostProbeExpr,
        returnByValue: true,
      });
      if (probeRes.exceptionDetails) throw new Error('Host probe failed');
      const probe = probeRes.result?.value;
      if (!probe || probe.ok !== true) {
        connection.close();
        return { skipped: true, reason: probe?.reason || 'non-host-page' };
      }

      const guardedSource = makePayloadSource(this.payloadSource, {
        origin: connection.origin,
        version: this.payloadVersion,
      });
      connection.guardedSource = guardedSource;
      const added = await connection.command('Page.addScriptToEvaluateOnNewDocument', { source: guardedSource });
      connection.script = added?.identifier || null;

      if (this.stopping || !(await this.owns())) {
        if (connection.script) {
          await connection.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: connection.script });
        }
        throw new Error('Sidecar ownership changed');
      }

      const evalRes = await connection.command('Runtime.evaluate', { expression: guardedSource });
      if (evalRes.exceptionDetails) throw new Error('Payload initialization failed');
      return { skipped: false, connection };
    } catch (error) {
      try {
        if (connection.script) {
          await connection.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: connection.script });
        }
      } catch {}
      connection.close();
      throw error;
    }
  }

  async detach(connection) {
    if (!connection) return;
    const owned = await this.owns();
    if (owned && !connection.closed) {
      try {
        await connection.command('Runtime.evaluate', {
          expression: `if (typeof location !== 'undefined' && location.origin === ${JSON.stringify(connection.origin)}) { window.__VOYAGER_LATEX_DISPOSE__?.(); }`,
        });
      } catch {
        // Closed/navigated tabs need no disposal; still remove preload script.
      }
    }
    try {
      if (connection.script && !connection.closed) {
        await connection.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: connection.script });
      }
    } catch {}
    connection.close();
  }

  async detachAll() {
    for (const connection of this.sessions.values()) {
      await this.detach(connection);
    }
    this.sessions.clear();
  }

  async reinjectAll() {
    await this.detachAll();
    this.skipped.clear();
    await this.tick();
  }

  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      if (!(await this.owns())) {
        await this.detachAll();
        return;
      }
      if (!(await this.enabled())) {
        await this.detachAll();
        this.skipped.clear();
        await this.setHealth('disabled', 'Antigravity LaTeX Enhancer is disabled', {
          debugPortAvailable: this.lastPort !== null,
          debugPort: this.lastPort,
        });
        return;
      }

      const targets = await this.discover(this.profile);
      const port = targets.port ?? null;
      this.lastPort = port;
      const active = new Set(targets.map((t) => t.webSocketDebuggerUrl));

      if (this.stopping || !(await this.owns())) return;

      for (const [wsUrl, connection] of this.sessions) {
        if (!active.has(wsUrl) || connection.closed) {
          await this.detach(connection);
          this.sessions.delete(wsUrl);
        }
      }

      for (const wsUrl of this.skipped.keys()) {
        if (!active.has(wsUrl)) this.skipped.delete(wsUrl);
      }

      for (const target of targets) {
        const wsUrl = target.webSocketDebuggerUrl;
        const existing = this.sessions.get(wsUrl);
        if (existing && existing.origin !== new URL(target.url).origin) {
          await this.detach(existing);
          this.sessions.delete(wsUrl);
        }
      }

      for (const target of targets) {
        const wsUrl = target.webSocketDebuggerUrl;
        if (this.sessions.has(wsUrl)) continue;
        const skipEntry = this.skipped.get(wsUrl);
        if (skipEntry && skipEntry.url === target.url && Date.now() - skipEntry.at < SKIP_COOLDOWN_MS) {
          continue;
        }
        try {
          const attached = await this.attach(target);
          if (attached.skipped) {
            this.skipped.set(wsUrl, { url: target.url, reason: attached.reason, at: Date.now() });
          } else {
            this.skipped.delete(wsUrl);
            this.sessions.set(wsUrl, attached.connection);
          }
        } catch {
          // Transient attach failure will be retried on the next heartbeat.
        }
      }

      if (this.stopping || !(await this.owns())) {
        await this.detachAll();
        return;
      }

      let totalKatex = 0;
      for (const [wsUrl, connection] of this.sessions) {
        try {
          const res = await connection.command('Runtime.evaluate', {
            expression: this.hostProbeExpr,
            returnByValue: true,
          });
          if (res.exceptionDetails) throw new Error('Renderer not ready');
          const status = res.result?.value;
          if (!status || status.ok !== true) {
            await this.detach(connection);
            this.sessions.delete(wsUrl);
            continue;
          }
          totalKatex += Number(status.katexCount || 0);
          if (!status.initialized || status.version !== this.payloadVersion) {
            if (!(await this.owns())) break;
            if (connection.script) {
              try {
                await connection.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: connection.script });
              } catch {}
            }
            connection.guardedSource = makePayloadSource(this.payloadSource, {
              origin: connection.origin,
              version: this.payloadVersion,
            });
            const added = await connection.command('Page.addScriptToEvaluateOnNewDocument', {
              source: connection.guardedSource,
            });
            connection.script = added?.identifier || null;
            const evalRes = await connection.command('Runtime.evaluate', { expression: connection.guardedSource });
            if (evalRes.exceptionDetails) throw new Error('Payload recovery failed');
          }
        } catch {
          await this.detach(connection);
          this.sessions.delete(wsUrl);
        }
      }

      const state = this.sessions.size > 0 ? 'injected' : 'waiting';
      const msg =
        this.sessions.size > 0
          ? `LaTeX enhancer active on ${this.sessions.size} window(s) (${totalKatex} formula node(s) detected)`
          : 'Debug port active; waiting for Antigravity conversation page';
      await this.setHealth(state, msg, {
        debugPortAvailable: true,
        debugPort: port,
        skippedTargets: this.skipped.size,
      });
    } catch (error) {
      this.lastPort = null;
      const missingPort =
        error?.code === 'ENOENT' ||
        error?.code === 'ECONNREFUSED' ||
        /discovery|port|timeout/i.test(String(error?.message || ''));
      await this.detachAll();
      await this.setHealth(
        missingPort ? 'waiting-debug-port' : 'reconnecting',
        missingPort
          ? 'DevToolsActivePort unavailable; launch Antigravity via Antigravity (Debug).app (managed by antigravity-pulse) with --remote-debugging-port=0 --remote-debugging-address=127.0.0.1.'
          : 'CDP connection unavailable; retrying automatically.',
        {
          reason: missingPort ? 'missing-debug-port' : 'cdp-error',
          debugPortAvailable: false,
          debugPort: null,
        }
      );
    } finally {
      this.busy = false;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.interval);
    this.timer.unref?.();
  }

  async stop() {
    this.running = false;
    this.stopping = true;
    clearInterval(this.timer);
    this.timer = null;
    await this.detachAll();
  }
}
