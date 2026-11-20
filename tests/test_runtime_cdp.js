'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('path');

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  PASS', name);
  } else {
    fail++;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('  FAIL', name, detail || '');
  }
}

class MockWebSocket {
  constructor(url, handler) {
    this.url = url;
    this.handler = handler;
    this.readyState = 0;
    this.listeners = new Map();
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit('open', {});
    });
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  emit(type, ev) {
    for (const fn of [...(this.listeners.get(type) || [])]) fn(ev);
  }
  send(raw) {
    const msg = JSON.parse(raw);
    const result = this.handler(msg, this);
    queueMicrotask(() => {
      this.emit('message', { data: JSON.stringify({ id: msg.id, result: result || {} }) });
    });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit('close', {});
  }
}

(async () => {
  const { validTarget, RuntimeCdp, computePayloadVersion } = await import('../compat/runtime-cdp.mjs');
  const { SidecarOwner } = await import('../compat/sidecar-owner.mjs');

  console.log('\n=== C1 validTarget filtering ===');
  {
    const port = 61576;
    check(
      'accepts loopback https page target on matching port',
      validTarget(
        {
          id: '1',
          type: 'page',
          url: 'https://127.0.0.1:61579/c/abc',
          webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/1`,
        },
        port
      )
    );
    check(
      'rejects iframe target',
      !validTarget(
        {
          id: '2',
          type: 'iframe',
          url: 'plugin://antigravity-pulse--panel-62788/',
          webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/2`,
        },
        port
      )
    );
    check(
      'rejects data: target',
      !validTarget(
        {
          id: '3',
          type: 'page',
          url: 'data:text/html,hello',
          webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/3`,
        },
        port
      )
    );
    check(
      'rejects mismatched debugger port',
      !validTarget(
        {
          id: '4',
          type: 'page',
          url: 'https://127.0.0.1:61579/',
          webSocketDebuggerUrl: `ws://127.0.0.1:${port + 1}/devtools/page/4`,
        },
        port
      )
    );
    check(
      'rejects non-loopback page host',
      !validTarget(
        {
          id: '5',
          type: 'page',
          url: 'https://example.com/',
          webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/5`,
        },
        port
      )
    );
  }

  console.log('\n=== C2 Host vs Preview target isolation, injection, hot-reload & dispose ===');
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'latex-cdp-test-'));
    const dataDir = path.join(tmpDir, 'data');
    const state = {
      enabled: true,
      hostInitialized: false,
      hostVersion: null,
      hostPreloadScripts: new Map(),
      previewPreloadCount: 0,
      disposeCalls: 0,
      nextScriptId: 1,
    };

    const hostWsUrl = 'ws://127.0.0.1:61576/devtools/page/HOST';
    const previewWsUrl = 'ws://127.0.0.1:61576/devtools/page/PREVIEW';

    const targets = [
      { id: 'HOST', type: 'page', url: 'https://127.0.0.1:61579/c/conv-1', webSocketDebuggerUrl: hostWsUrl },
      { id: 'PREVIEW', type: 'page', url: 'http://127.0.0.1:4173/', webSocketDebuggerUrl: previewWsUrl },
    ];
    targets.port = 61576;

    const fakePayload = 'window.__VOYAGER_LATEX_INITIALIZED__ = true; window.__VOYAGER_LATEX_VERSION__ = window.__VOYAGER_LATEX_EXPECTED_VERSION__;';
    const expectedVersion = computePayloadVersion(fakePayload);

    const { CdpConnection } = await import('../compat/runtime-cdp.mjs');
    const runtime = new RuntimeCdp({
      payloadSource: fakePayload,
      payloadVersion: expectedVersion,
      profile: tmpDir,
      dataDir,
      enabled: () => state.enabled,
      discover: async () => targets,
      connect: (wsUrl, options) => {
        const wsImpl = function (url) {
          return new MockWebSocket(url, (msg) => {
            if (msg.method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'FRAME_1' } } };
            if (msg.method === 'Page.addScriptToEvaluateOnNewDocument') {
              if (url === previewWsUrl) {
                state.previewPreloadCount++;
              } else {
                const id = 'SCR_' + state.nextScriptId++;
                state.hostPreloadScripts.set(id, msg.params.source);
                return { identifier: id };
              }
              return { identifier: 'PREV_1' };
            }
            if (msg.method === 'Page.removeScriptToEvaluateOnNewDocument') {
              state.hostPreloadScripts.delete(msg.params.identifier);
              return {};
            }
            if (msg.method === 'Runtime.evaluate') {
              const expr = msg.params.expression || '';
              if (expr.includes('antigravity-host')) {
                if (url === previewWsUrl) {
                  return { result: { value: { ok: false, reason: 'non-host-page' } } };
                }
                return {
                  result: {
                    value: {
                      ok: true,
                      reason: 'antigravity-host',
                      initialized: state.hostInitialized,
                      version: state.hostVersion,
                      katexCount: 2,
                    },
                  },
                };
              }
              if (expr.includes('__VOYAGER_LATEX_DISPOSE__')) {
                state.disposeCalls++;
                state.hostInitialized = false;
                state.hostVersion = null;
                return { result: { value: true } };
              }
              if (expr.includes('__VOYAGER_LATEX_EXPECTED_VERSION__')) {
                state.hostInitialized = true;
                state.hostVersion = expectedVersion;
                return { result: { value: true } };
              }
            }
            return {};
          });
        };
        return new CdpConnection(wsUrl, { ...options, WebSocketImpl: wsImpl });
      },
    });

    await runtime.tick();
    check('host target injected', state.hostInitialized === true && state.hostVersion === expectedVersion);
    check('host preload script registered', state.hostPreloadScripts.size === 1);
    check('preview target NOT polluted with preload', state.previewPreloadCount === 0);
    check('runtime health is injected with 1 window', runtime.health.state === 'injected' && runtime.health.windows === 1);
    check('integration-state.json persisted', fs.existsSync(path.join(dataDir, 'integration-state.json')));

    // Disable plugin -> must dispose and remove preload script
    state.enabled = false;
    await runtime.tick();
    check('disable invokes dispose() in page', state.disposeCalls === 1 && !state.hostInitialized);
    check('disable removes preload script', state.hostPreloadScripts.size === 0);
    check('health transitions to disabled', runtime.health.state === 'disabled' && runtime.health.windows === 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\n=== C3 Missing DevToolsActivePort diagnosis (passive, no kill/relaunch) ===');
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'latex-cdp-missing-'));
    const runtime = new RuntimeCdp({
      payloadSource: '/* test */',
      profile: tmpDir,
      dataDir: path.join(tmpDir, 'data'),
    });
    await runtime.tick();
    check('missing port reports waiting-debug-port', runtime.health.state === 'waiting-debug-port');
    check('missing port sets reason missing-debug-port', runtime.health.reason === 'missing-debug-port');
    check('missing port marks debugPortAvailable false', runtime.health.debugPortAvailable === false);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\n=== C4 SidecarOwner arbitration ===');
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'latex-owner-'));
    const oldOwner = new SidecarOwner(tmpDir, { pid: process.pid, startedAt: 1000, token: 'old' });
    const newOwner = new SidecarOwner(tmpDir, { pid: process.pid, startedAt: 2000, token: 'new' });
    assert.equal(await oldOwner.claim(), true);
    assert.equal(await newOwner.claim(), true);
    check('new owner supersedes old owner', (await oldOwner.isOwner()) === false && (await newOwner.isOwner()) === true);
    oldOwner.stop();
    newOwner.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\n========================================');
  console.log(`RUNTIME CDP TESTS: ${pass} passed, ${fail} failed`);
  if (fail) console.log('FAILURES:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR', e);
  process.exit(2);
});
