import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformPaths } from '../../compat/platform.mjs';
import { SidecarOwner } from '../../compat/sidecar-owner.mjs';
import { RuntimeCdp, computePayloadVersion } from '../../compat/runtime-cdp.mjs';
import { loadSidecarSdk } from './sdk.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, '..', '..');
const paths = platformPaths();

// Release open directory handle on plugin directory before uninstall/update.
try {
  process.chdir(paths.home);
} catch {}

const ownership = process.env.ANTIGRAVITY_SIDECAR_WEB_PORT ? new SidecarOwner(paths.data) : null;

let enabledCache = true;
let enabledCheckedAt = -Infinity;
function isEnabled() {
  if (Date.now() - enabledCheckedAt < 1000) return enabledCache;
  let enabled = true;
  try {
    if (!existsSync(join(PLUGIN_ROOT, 'plugin.json'))) {
      enabled = false;
    }
  } catch {
    enabled = false;
  }
  if (enabled) {
    try {
      const settings = JSON.parse(readFileSync(paths.settings, 'utf8').replace(/^\uFEFF/, ''));
      if (settings && settings.enabled === false) enabled = false;
    } catch {}
  }
  if (enabled) {
    try {
      const config = JSON.parse(readFileSync(paths.pluginConfig, 'utf8').replace(/^\uFEFF/, ''));
      if (config?.plugins?.['antigravity-latex-enhancer']?.enabled === false) enabled = false;
    } catch {}
  }
  enabledCache = enabled;
  enabledCheckedAt = Date.now();
  return enabled;
}

const payloadPath = join(PLUGIN_ROOT, 'payload', 'voyager-latex.js');
const payloadSource = readFileSync(payloadPath, 'utf8');
const payloadVersion = computePayloadVersion(payloadSource);

const runtimeCdp = new RuntimeCdp({
  payloadSource,
  payloadVersion,
  profile: paths.profile,
  dataDir: paths.data,
  owns: () => (ownership ? ownership.isOwner() : true),
  enabled: () => isEnabled(),
});

const statusPayload = () => ({
  ...runtimeCdp.health,
  enabled: isEnabled(),
  pluginDirectory: PLUGIN_ROOT,
});

if (process.env.ANTIGRAVITY_SIDECAR_WEB_PORT) {
  const { SidecarApp, Response } = await loadSidecarSdk();
  if (!(await ownership.claim())) process.exit(0);

  const app = new SidecarApp();
  app.api(
    '/',
    () =>
      new Response(readFileSync(join(HERE, 'index.html'), 'utf8'), {
        contentType: 'text/html; charset=utf-8',
        headers: { 'Cache-Control': 'no-store' },
      }),
    'GET'
  );
  app.page(
    '/app.js',
    () =>
      new Response(readFileSync(join(HERE, 'app.js'), 'utf8'), {
        contentType: 'application/javascript; charset=utf-8',
        headers: { 'Cache-Control': 'no-store' },
      })
  );
  app.api('/api/status', () => statusPayload(), 'GET');
  app.api(
    '/api/reinject',
    async () => {
      if (ownership && !(await ownership.isOwner())) {
        return new Response(JSON.stringify({ error: 'Sidecar ownership changed' }), {
          status: 403,
          contentType: 'application/json',
        });
      }
      await runtimeCdp.reinjectAll();
      return statusPayload();
    },
    'POST'
  );

  await app.run();
  runtimeCdp.start();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const exitTimer = setTimeout(() => process.exit(0), 2000);
    exitTimer.unref();
    await runtimeCdp.stop();
    ownership.stop();
    await app.close();
    process.exit(0);
  };

  // Also exit cleanly if plugin directory is uninstalled from disk.
  const uninstallWatch = setInterval(() => {
    if (!existsSync(join(PLUGIN_ROOT, 'plugin.json'))) {
      void shutdown();
    }
  }, 3000);
  uninstallWatch.unref?.();

  ownership.watch(shutdown);
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      void shutdown();
    });
  }
} else {
  const port = Number(process.env.AG_LATEX_PORT || 17895);
  const server = createServer(async (req, res) => {
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://${host}`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(HERE, 'index.html'), 'utf8'));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/app.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(readFileSync(join(HERE, 'app.js'), 'utf8'));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/preload.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end('// Standalone preview: no host sidecar bridge.');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(statusPayload()));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/reinject') {
      const sameOrigin = req.headers.origin === `http://${host}`;
      if (req.headers.origin && !sameOrigin) {
        res.writeHead(403);
        res.end();
        return;
      }
      await runtimeCdp.reinjectAll();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(statusPayload()));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Antigravity LaTeX Enhancer standalone panel: http://127.0.0.1:${port}`);
  });
  runtimeCdp.start();
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, async () => {
      await runtimeCdp.stop();
      server.close(() => process.exit(0));
    });
  }
}
