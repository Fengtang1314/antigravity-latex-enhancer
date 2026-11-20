'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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

(async () => {
  const { install, uninstall, status } = await import('../manage.mjs');
  const { inspectLegacyAsar } = await import('../compat/legacy-asar.mjs');
  const { platformPaths } = await import('../compat/platform.mjs');

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'latex-lifecycle-'));
  const configDir = path.join(tmpHome, '.gemini', 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const configFile = path.join(configDir, 'config.json');

  // Pre-seed config.json with antigravity-pulse & custom settings
  fs.writeFileSync(
    configFile,
    JSON.stringify(
      {
        plugins: {
          'antigravity-pulse': { enabled: true },
        },
        userSettings: { themeMode: 'THEME_MODE_LIGHT' },
      },
      null,
      2
    )
  );

  // Create fake clean app.asar using @electron/asar if available, or minimal pickle asar
  let asarModule = null;
  try {
    asarModule = await import('@electron/asar');
  } catch {}

  const fakeResDir = path.join(tmpHome, 'FakeApp', 'Contents', 'Resources');
  fs.mkdirSync(fakeResDir, { recursive: true });
  const fakeAsar = path.join(fakeResDir, 'app.asar');
  const cleanSrc = path.join(tmpHome, 'asar-clean');
  fs.mkdirSync(path.join(cleanSrc, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(cleanSrc, 'package.json'), JSON.stringify({ name: 'antigravity', version: '2.33.0' }));
  fs.writeFileSync(path.join(cleanSrc, 'dist', 'preload.js'), '"use strict";\n// clean official preload\n');

  if (asarModule) {
    await asarModule.createPackage(cleanSrc, fakeAsar);
  } else {
    // Construct minimal valid asar archive manually for zero-dependency verification
    const pkgBuf = Buffer.from(JSON.stringify({ name: 'antigravity', version: '2.33.0' }));
    const preloadBuf = Buffer.from('"use strict";\n// clean official preload\n');
    const headerObj = {
      files: {
        'package.json': { size: pkgBuf.length, offset: '0' },
        dist: { files: { 'preload.js': { size: preloadBuf.length, offset: String(pkgBuf.length) } } },
      },
    };
    const jsonBuf = Buffer.from(JSON.stringify(headerObj));
    const alignedJsonLen = Math.ceil(jsonBuf.length / 4) * 4;
    const headerBuf = Buffer.alloc(16 + alignedJsonLen);
    headerBuf.writeUInt32LE(4, 0);
    headerBuf.writeUInt32LE(8 + alignedJsonLen, 4);
    headerBuf.writeUInt32LE(4 + alignedJsonLen, 8);
    headerBuf.writeUInt32LE(jsonBuf.length, 12);
    jsonBuf.copy(headerBuf, 16);
    fs.writeFileSync(fakeAsar, Buffer.concat([headerBuf, pkgBuf, preloadBuf]));
  }

  console.log('\n=== L1 Install into isolated user plugin dir & config.json ===');
  {
    const env = { ...process.env, AG_LATEX_APP_ASAR: fakeAsar };
    await install({ appAsarPath: fakeAsar, home: tmpHome, env });
    const paths = platformPaths({ home: tmpHome, env });

    check('plugin.json installed', fs.existsSync(path.join(paths.pluginDir, 'plugin.json')));
    check('sidecar.json installed', fs.existsSync(path.join(paths.pluginDir, 'sidecars', 'panel', 'sidecar.json')));
    check('payload installed', fs.existsSync(path.join(paths.pluginDir, 'payload', 'voyager-latex.js')));
    check('node_modules NOT copied into runtime plugin', !fs.existsSync(path.join(paths.pluginDir, 'node_modules')));
    check('Antigravity (Debug).app NOT created', !fs.existsSync(path.join(tmpHome, 'Applications', 'Antigravity (Debug).app')));

    const updatedCfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    check('antigravity-latex-enhancer enabled in config.json', updatedCfg.plugins['antigravity-latex-enhancer']?.enabled === true);
    check('antigravity-pulse preserved in config.json', updatedCfg.plugins['antigravity-pulse']?.enabled === true);
    check('userSettings preserved in config.json', updatedCfg.userSettings?.themeMode === 'THEME_MODE_LIGHT');

    const st = await status({ appAsarPath: fakeAsar, home: tmpHome, env });
    check('status reports installed=true enabled=true', st.installed === true && st.enabled === true);
    check('status detects hostVersion 2.33.0', st.hostVersion === '2.33.0');
    check('status reports legacyAppAsarPatched=false', st.legacyAppAsarPatched === false);
    check('status provides debugPortHint when DevToolsActivePort absent', typeof st.debugPortHint === 'string');
  }

  console.log('\n=== L2 Shared DevToolsActivePort recognition ===');
  {
    const env = { ...process.env, AG_LATEX_APP_ASAR: fakeAsar };
    const paths = platformPaths({ home: tmpHome, env });
    fs.mkdirSync(paths.profile, { recursive: true });
    fs.writeFileSync(path.join(paths.profile, 'DevToolsActivePort'), '61576\n/devtools/browser/abc\n');
    const st = await status({ appAsarPath: fakeAsar, home: tmpHome, env });
    check('status detects shared DevToolsActivePort', st.debugPortAvailable === true && st.debugPort === 61576);
    check('debugPortHint omitted when port available', st.debugPortHint === undefined);
  }

  console.log('\n=== L3 Uninstall cleanly removes plugin while preserving pulse & app.asar ===');
  {
    const env = { ...process.env, AG_LATEX_APP_ASAR: fakeAsar };
    await uninstall({ appAsarPath: fakeAsar, home: tmpHome, env });
    const paths = platformPaths({ home: tmpHome, env });
    check('plugin directory removed', !fs.existsSync(paths.pluginDir));
    const updatedCfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    check('latex plugin removed from config.json', updatedCfg.plugins['antigravity-latex-enhancer'] === undefined);
    check('antigravity-pulse still intact after uninstall', updatedCfg.plugins['antigravity-pulse']?.enabled === true);
  }

  console.log('\n=== L4 Legacy app.asar detection blocks install ===');
  {
    const legacyAsar = path.join(fakeResDir, 'legacy.asar');
    const pkgBuf = Buffer.from(JSON.stringify({ name: 'antigravity', version: '2.24.0' }));
    const preloadBuf = Buffer.from('"use strict";\n/* --- VOYAGER-LATEX-START --- */\nconsole.log(1);\n/* --- VOYAGER-LATEX-END --- */\n');
    const headerObj = {
      files: {
        'package.json': { size: pkgBuf.length, offset: '0' },
        dist: { files: { 'preload.js': { size: preloadBuf.length, offset: String(pkgBuf.length) } } },
      },
    };
    const jsonBuf = Buffer.from(JSON.stringify(headerObj));
    const alignedJsonLen = Math.ceil(jsonBuf.length / 4) * 4;
    const headerBuf = Buffer.alloc(16 + alignedJsonLen);
    headerBuf.writeUInt32LE(4, 0);
    headerBuf.writeUInt32LE(8 + alignedJsonLen, 4);
    headerBuf.writeUInt32LE(4 + alignedJsonLen, 8);
    headerBuf.writeUInt32LE(jsonBuf.length, 12);
    jsonBuf.copy(headerBuf, 16);
    fs.writeFileSync(legacyAsar, Buffer.concat([headerBuf, pkgBuf, preloadBuf]));

    const insp = await inspectLegacyAsar(legacyAsar);
    check('inspectLegacyAsar detects patched=true', insp.patched === true && insp.hostVersion === '2.24.0');

    let blocked = false;
    try {
      await install({ appAsarPath: legacyAsar, home: tmpHome, env: { ...process.env, AG_LATEX_APP_ASAR: legacyAsar } });
    } catch (err) {
      blocked = /Detected legacy Voyager injection/i.test(err.message);
    }
    check('install blocks when legacy app.asar injection is present', blocked);
  }

  fs.rmSync(tmpHome, { recursive: true, force: true });

  console.log('\n========================================');
  console.log(`LIFECYCLE TESTS: ${pass} passed, ${fail} failed`);
  if (fail) console.log('FAILURES:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR', e);
  process.exit(2);
});
