#!/usr/bin/env node
// Zero-dependency user-space lifecycle manager for Antigravity LaTeX Enhancer.
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectLegacyAsar } from './compat/legacy-asar.mjs';
import { PLUGIN_NAME, platformPaths } from './compat/platform.mjs';
import { computePayloadVersion } from './compat/runtime-cdp.mjs';

const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));
const RUNTIME_ENTRIES = ['plugin.json', 'assets', 'compat', 'payload', 'sidecars'];
const IGNORED_NAMES = new Set(['.DS_Store', 'node_modules', '.git', 'dist', 'tests', '__pycache__']);

function readJson(file, fallback = {}) {
  if (!existsSync(file)) return fallback;
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function atomicJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
}

function isPidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function withLifecycleLock(pluginDir, fn) {
  const parent = dirname(pluginDir);
  mkdirSync(parent, { recursive: true });
  const lock = join(parent, `.${PLUGIN_NAME}.lock`);
  try {
    if (lstatSync(lock).isSymbolicLink()) {
      throw new Error('Linked lifecycle lock is unsupported');
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      writeFileSync(lock, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx', mode: 0o600 });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        let holder = null;
        try {
          holder = JSON.parse(readFileSync(lock, 'utf8'));
        } catch {}
        if (holder?.pid ? !isPidAlive(holder.pid) : Date.now() - statSync(lock).mtimeMs > 10000) {
          unlinkSync(lock);
          continue;
        }
      } catch (err) {
        if (err.code === 'ENOENT') continue;
        throw err;
      }
      if (Date.now() > deadline) throw new Error('Another lifecycle operation is running');
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  try {
    return await fn();
  } finally {
    try {
      const cur = JSON.parse(readFileSync(lock, 'utf8'));
      if (cur?.pid === process.pid) unlinkSync(lock);
    } catch {}
  }
}

function assertOwnPluginDir(pluginDir) {
  const pluginsRoot = dirname(pluginDir);
  if (existsSync(pluginDir)) {
    const info = lstatSync(pluginDir);
    if (info.isSymbolicLink()) {
      throw new Error('Plugin destination must be a regular directory, not a symlink.');
    }
    if (existsSync(pluginsRoot) && dirname(realpathSync(pluginDir)) !== realpathSync(pluginsRoot)) {
      throw new Error('Plugin destination resolved outside the plugins root.');
    }
    const manifestPath = join(pluginDir, 'plugin.json');
    if (existsSync(manifestPath)) {
      const manifest = readJson(manifestPath, {});
      if (manifest.name !== PLUGIN_NAME) {
        throw new Error(`Destination belongs to another plugin (${manifest.name || 'unknown'}); refusing to overwrite.`);
      }
    }
  }
}

function readDebugPortInfo(profileDir) {
  const portFile = join(profileDir, 'DevToolsActivePort');
  if (!existsSync(portFile)) return { available: false, port: null, path: portFile };
  try {
    const raw = readFileSync(portFile, 'utf8');
    if (raw.length > 1024) return { available: false, port: null, path: portFile };
    const port = Number(raw.split(/\r?\n/)[0]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { available: false, port: null, path: portFile };
    }
    return { available: true, port, path: portFile };
  } catch {
    return { available: false, port: null, path: portFile };
  }
}

function setEnabled(paths, enabled) {
  assertOwnPluginDir(paths.pluginDir);
  if (!existsSync(join(paths.pluginDir, 'plugin.json'))) {
    throw new Error('Antigravity LaTeX Enhancer is not installed yet. Run install first.');
  }
  const config = readJson(paths.pluginConfig, {});
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Existing config.json has an invalid JSON object shape.');
  }
  if (!config.plugins || typeof config.plugins !== 'object' || Array.isArray(config.plugins)) {
    config.plugins = {};
  }
  const entry =
    config.plugins[PLUGIN_NAME] && typeof config.plugins[PLUGIN_NAME] === 'object'
      ? config.plugins[PLUGIN_NAME]
      : {};
  entry.enabled = Boolean(enabled);
  config.plugins[PLUGIN_NAME] = entry;
  atomicJson(paths.pluginConfig, config);

  const settings = readJson(paths.settings, {});
  settings.enabled = Boolean(enabled);
  settings.mode = 'sidecar-cdp';
  atomicJson(paths.settings, settings);

  console.log(
    enabled
      ? 'Antigravity LaTeX Enhancer enabled (active sidecar injects within ~3s).'
      : 'Antigravity LaTeX Enhancer disabled (active sidecar disposes injected hooks within ~3s).'
  );
}

export async function install({ appAsarPath, home, env } = {}) {
  const paths = platformPaths({ home, env });
  const targetAsar = appAsarPath || paths.appAsar;

  return withLifecycleLock(paths.pluginDir, async () => {
    assertOwnPluginDir(paths.pluginDir);

    const legacy = await inspectLegacyAsar(targetAsar);
    if (legacy.patched) {
      throw new Error(
        `Detected legacy Voyager injection inside ${legacy.asarPath}.\n` +
          'To restore official app signature and avoid double injection, restore the clean app first:\n' +
          '  1. Quit Antigravity (Cmd+Q)\n' +
          '  2. Run: sudo node legacy/voyager_engine.js uninstall  (or reinstall official Antigravity.app)\n' +
          '  3. Re-run: node manage.mjs install'
      );
    }

    const config = readJson(paths.pluginConfig, {});
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Existing ~/.gemini/config/config.json has an incompatible shape.');
    }
    if (config.plugins !== undefined && (typeof config.plugins !== 'object' || Array.isArray(config.plugins))) {
      throw new Error('Existing ~/.gemini/config/config.json plugins field has an incompatible shape.');
    }

    const staging = `${paths.pluginDir}.staging.${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    try {
      for (const entry of RUNTIME_ENTRIES) {
        const src = join(SOURCE_ROOT, entry);
        const dst = join(staging, entry);
        if (!existsSync(src)) {
          throw new Error(`Missing required runtime entry: ${entry}`);
        }
        cpSync(src, dst, {
          recursive: true,
          filter: (p) => {
            const parts = p.split(/[\\/]/);
            return !parts.some((seg) => IGNORED_NAMES.has(seg));
          },
        });
      }
      if (existsSync(paths.pluginDir)) {
        rmSync(paths.pluginDir, { recursive: true, force: true });
      }
      mkdirSync(dirname(paths.pluginDir), { recursive: true });
      renameSync(staging, paths.pluginDir);
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      throw error;
    }

    const settings = readJson(paths.settings, {});
    settings.mode = 'sidecar-cdp';
    settings.enabled = true;
    if (env?.AG_LATEX_PROFILE) {
      settings.profile = paths.profile;
    }
    atomicJson(paths.settings, settings);

    setEnabled(paths, true);

    const debugInfo = readDebugPortInfo(paths.profile);
    console.log('Installed plugin:', paths.pluginDir);
    console.log('Config updated:', paths.pluginConfig);
    if (legacy.hostVersion) {
      console.log(`Antigravity host detected: ${legacy.hostVersion} (official app.asar untouched)`);
    }
    if (!debugInfo.available) {
      console.log(
        'Note: <profile>/DevToolsActivePort was not found. Launch Antigravity via Antigravity (Debug).app ' +
          '(managed by antigravity-pulse) with --remote-debugging-port=0 --remote-debugging-address=127.0.0.1.'
      );
    } else {
      console.log(`Shared DevToolsActivePort detected on 127.0.0.1:${debugInfo.port}.`);
    }
    console.log('Restart Antigravity once if the newly registered sidecar has not been started by the host yet.');
  });
}

export async function uninstall({ appAsarPath, home, env } = {}) {
  const paths = platformPaths({ home, env });
  const targetAsar = appAsarPath || paths.appAsar;

  return withLifecycleLock(paths.pluginDir, async () => {
    assertOwnPluginDir(paths.pluginDir);

    if (existsSync(paths.pluginConfig)) {
      const config = readJson(paths.pluginConfig, {});
      if (config && typeof config === 'object' && !Array.isArray(config)) {
        if (config.plugins && typeof config.plugins === 'object') {
          delete config.plugins[PLUGIN_NAME];
        }
        if (config.sidecars && typeof config.sidecars === 'object') {
          delete config.sidecars[`${PLUGIN_NAME}/panel`];
        }
        atomicJson(paths.pluginConfig, config);
      }
    }

    if (existsSync(paths.settings)) {
      const settings = readJson(paths.settings, {});
      settings.enabled = false;
      atomicJson(paths.settings, settings);
    }

    if (existsSync(paths.pluginDir)) {
      const expectedRoot = realpathSync(dirname(paths.pluginDir));
      const resolvedTarget = realpathSync(paths.pluginDir);
      if (dirname(resolvedTarget) !== expectedRoot) {
        throw new Error('Plugin directory is outside the customization root; refusing to delete.');
      }
      rmSync(resolvedTarget, { recursive: true, force: true });
      console.log('Removed plugin directory:', paths.pluginDir);
    } else {
      console.log('Plugin directory is not installed:', paths.pluginDir);
    }

    const legacy = await inspectLegacyAsar(targetAsar);
    if (legacy.patched) {
      console.log(
        `Warning: ${legacy.asarPath} still contains a legacy app.asar injection. ` +
          'Run `sudo node legacy/voyager_engine.js uninstall` if you also want to clean the app bundle.'
      );
    }

    console.log('Antigravity LaTeX Enhancer uninstalled (app.asar untouched).');
  });
}

export async function status({ appAsarPath, home, env } = {}) {
  const paths = platformPaths({ home, env });
  const targetAsar = appAsarPath || paths.appAsar;
  const manifestPath = join(paths.pluginDir, 'plugin.json');
  const installed = existsSync(manifestPath);

  let configEnabled = false;
  try {
    const config = readJson(paths.pluginConfig, {});
    configEnabled = config?.plugins?.[PLUGIN_NAME]?.enabled !== false && Boolean(config?.plugins?.[PLUGIN_NAME]);
  } catch {}

  let settingsEnabled = true;
  try {
    const settings = readJson(paths.settings, {});
    if (settings.enabled === false) settingsEnabled = false;
  } catch {}

  const enabled = installed && configEnabled && settingsEnabled;
  const legacy = await inspectLegacyAsar(targetAsar);
  const debugInfo = readDebugPortInfo(paths.profile);

  const healthFile = join(paths.data, 'integration-state.json');
  const integrationState = existsSync(healthFile) ? readJson(healthFile, null) : null;

  const ownerFile = join(paths.data, 'active-sidecar.json');
  let sidecarOwner = null;
  if (existsSync(ownerFile)) {
    try {
      const owner = readJson(ownerFile, null);
      if (owner && Number.isSafeInteger(owner.pid)) {
        sidecarOwner = { pid: owner.pid, alive: isPidAlive(owner.pid), startedAt: owner.startedAt };
      }
    } catch {}
  }

  let payloadVersion = null;
  const installedPayload = join(paths.pluginDir, 'payload', 'voyager-latex.js');
  const sourcePayload = join(SOURCE_ROOT, 'payload', 'voyager-latex.js');
  const payloadFile = existsSync(installedPayload) ? installedPayload : existsSync(sourcePayload) ? sourcePayload : null;
  if (payloadFile) {
    payloadVersion = computePayloadVersion(readFileSync(payloadFile, 'utf8'));
  }

  const report = {
    installed,
    enabled,
    mode: 'sidecar-cdp',
    pluginDirectory: paths.pluginDir,
    payloadVersion,
    hostVersion: legacy.hostVersion,
    legacyAppAsarPatched: legacy.patched,
    debugPortAvailable: debugInfo.available,
    debugPort: debugInfo.port,
    sidecarOwner,
    integrationState,
  };

  if (!debugInfo.available) {
    report.debugPortHint =
      'DevToolsActivePort is missing. Antigravity 2.33+ requires --remote-debugging-port=0 --remote-debugging-address=127.0.0.1; ' +
      'launch via ~/Applications/Antigravity (Debug).app (managed by antigravity-pulse).';
  }
  if (legacy.patched) {
    report.legacyWarning =
      `Legacy app.asar injection detected in ${legacy.asarPath}; restore clean app before using Sidecar CDP mode.`;
  }

  return report;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const action = args[0];
  let appAsarPath = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--app-path' && args[i + 1]) {
      appAsarPath = resolve(args[++i]);
    }
  }
  return { action, appAsarPath };
}

async function main() {
  const { action, appAsarPath } = parseArgs(process.argv);
  const paths = platformPaths();

  switch (action) {
    case 'install':
      await install({ appAsarPath });
      break;
    case 'uninstall':
      await uninstall({ appAsarPath });
      break;
    case 'enable':
      await withLifecycleLock(paths.pluginDir, async () => setEnabled(paths, true));
      break;
    case 'disable':
      await withLifecycleLock(paths.pluginDir, async () => setEnabled(paths, false));
      break;
    case 'status': {
      const report = await status({ appAsarPath });
      console.log(JSON.stringify(report, null, 2));
      break;
    }
    default:
      console.error('Usage: node manage.mjs <install|uninstall|enable|disable|status> [--app-path /path/to/app.asar]');
      process.exitCode = 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(`Antigravity LaTeX Enhancer: ${error.message}`);
    process.exit(1);
  });
}
