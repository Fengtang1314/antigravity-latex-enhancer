'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
const BASE = path.join(__dirname, 'fixtures');
const ENGINE_SRC = path.join(REPO, 'voyager_engine.js');
const asarPath = path.join(REPO, 'node_modules', '@electron', 'asar');

let pass = 0, fail = 0;
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
function sha(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

let asarModule;

async function setupCase(name, opts = {}) {
  if (!asarModule) {
    asarModule = await import('@electron/asar');
  }
  const root = path.join(BASE, name);
  fs.rmSync(root, { recursive: true, force: true });
  const appDir = path.join(root, 'app', 'Antigravity.app');
  const resDir = path.join(appDir, 'Contents', 'Resources');
  fs.mkdirSync(resDir, { recursive: true });

  const srcDir = path.join(root, 'src');
  fs.mkdirSync(path.join(srcDir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'dist', 'preload.js'), opts.preload !== undefined ? opts.preload : '"use strict";\n// official preload\nconst x = 1;\n');
  fs.writeFileSync(path.join(srcDir, 'dist', 'main.js'), '// main\n');
  fs.writeFileSync(path.join(srcDir, 'package.json'), JSON.stringify({ name: 'antigravity', version: opts.version || '2.24.0' }));

  if (opts.withUnpacked) {
    fs.mkdirSync(path.join(srcDir, 'node_modules', 'chrome-devtools-mcp', 'build'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'node_modules', 'chrome-devtools-mcp', 'build', 'mcp.js'), '// mcp binary');
  }

  const targetAsar = path.join(resDir, 'app.asar');
  const packOpts = {};
  if (opts.withUnpacked) {
    packOpts.unpackDir = 'node_modules/chrome-devtools-mcp*';
  }
  await asarModule.createPackageWithOptions(srcDir, targetAsar, packOpts);

  fs.writeFileSync(
    path.join(appDir, 'Contents', 'Info.plist'),
    '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>' +
      (opts.version || '2.24.0') +
      '</string><key>ElectronAsarIntegrity</key><dict><key>Resources/app.asar</key><dict><key>hash</key><string>abc</string></dict></dict></dict></plist>'
  );

  return root;
}

function run(root, mode, env = {}) {
  const appPath = path.join(root, 'app', 'Antigravity.app');
  const res = cp.spawnSync(process.execPath, [ENGINE_SRC, mode], {
    cwd: REPO,
    env: {
      ...process.env,
      VOYAGER_APP_PATH: appPath,
      ...env
    },
    encoding: 'utf8',
    timeout: 30000
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '', root };
}

(async () => {
  fs.mkdirSync(BASE, { recursive: true });

  console.log('\n=== E1 fresh install (含 H1 unpacked 契约保留) ===');
  {
    const root = await setupCase('e1', { withUnpacked: true });
    const asarFile = path.join(root, 'app', 'Antigravity.app', 'Contents', 'Resources', 'app.asar');
    const origBytes = fs.readFileSync(asarFile);

    const r = run(root, 'install');
    check('exit code 0', r.status === 0, r.stderr);
    check('backup created', fs.existsSync(asarFile + '.before-voyager'));
    check('backup byte-identical to pre-install asar', sha(fs.readFileSync(asarFile + '.before-voyager')) === sha(origBytes));
    check('Info.plist backup created', fs.existsSync(path.join(root, 'app', 'Antigravity.app', 'Contents', 'Info.plist.before-voyager')));
    check('backup metadata created', fs.existsSync(path.join(root, 'app', 'Antigravity.app', 'Contents', 'Resources', 'voyager-backup-meta.json')));

    // 校验 preload 中的标记
    const content = asarModule.extractFile(asarFile, 'dist/preload.js').toString('utf8');
    check('exactly one START marker', content.split('/* --- VOYAGER-LATEX-START --- */').length === 2);
    check('exactly one END marker', content.split('/* --- VOYAGER-LATEX-END --- */').length === 2);
    check('original preload preserved', content.includes('// official preload'));

    // 校验 H1：unpacked 契约是否保留（原为 1 项，现应依然为 1 项）
    const header = asarModule.getRawHeader(asarFile).header.files;
    let unpackedCount = 0;
    (function walk(o) {
      for (const k of Object.keys(o)) {
        if (o[k].unpacked) unpackedCount++;
        if (o[k].files) walk(o[k].files);
      }
    })(header);
    check('H1 修复：重包后 unpacked 外部条目未丢失', unpackedCount > 0, 'count=' + unpackedCount);
  }

  console.log('\n=== E2 re-install idempotency ===');
  {
    const root = await setupCase('e2');
    run(root, 'install');
    const asarFile = path.join(root, 'app', 'Antigravity.app', 'Contents', 'Resources', 'app.asar');
    const coldBackupTime = fs.statSync(asarFile + '.before-voyager').mtimeMs;

    const r2 = run(root, 'install');
    check('second install exits 0', r2.status === 0);
    check('cold backup not overwritten on re-install', fs.statSync(asarFile + '.before-voyager').mtimeMs === coldBackupTime);

    const content = asarModule.extractFile(asarFile, 'dist/preload.js').toString('utf8');
    check('still exactly one START marker', content.split('/* --- VOYAGER-LATEX-START --- */').length === 2);
    check('still exactly one END marker', content.split('/* --- VOYAGER-LATEX-END --- */').length === 2);
  }

  console.log('\n=== E4 Info.plist integrity sync failure (H2加固) ===');
  {
    const root = await setupCase('e4');
    const asarFile = path.join(root, 'app', 'Antigravity.app', 'Contents', 'Resources', 'app.asar');
    const origBytes = fs.readFileSync(asarFile);

    const r = run(root, 'install', { VOYAGER_TEST_FAIL_PLIST: '1' });
    check('E4: exits NON-ZERO on plist integrity failure', r.status !== 0);
    check('E4: does NOT print success banner', !r.stdout.includes('🎉 安装成功'));
    check('E4: automatic rollback restored original asar', sha(fs.readFileSync(asarFile)) === sha(origBytes));
    check('E4: rollback log present', r.stdout.includes('[熔断保护]') || r.stdout.includes('[回滚]'));
  }

  console.log('\n=== E5 codesign failure (H2加固) ===');
  {
    const root = await setupCase('e5');
    const asarFile = path.join(root, 'app', 'Antigravity.app', 'Contents', 'Resources', 'app.asar');
    const origBytes = fs.readFileSync(asarFile);

    const r = run(root, 'install', { VOYAGER_TEST_FAIL_CODESIGN: '1' });
    check('E5: exits NON-ZERO on codesign failure', r.status !== 0);
    check('E5: does NOT print success banner', !r.stdout.includes('🎉 安装成功'));
    check('E5: automatic rollback restored original asar', sha(fs.readFileSync(asarFile)) === sha(origBytes));
  }

  console.log('\n=== E6 uninstall when plugin was never installed (M7修复) ===');
  {
    const root = await setupCase('e6', { withUnpacked: true });
    const asarFile = path.join(root, 'app', 'Antigravity.app', 'Contents', 'Resources', 'app.asar');
    const origMtime = fs.statSync(asarFile).mtimeMs;

    const r = run(root, 'uninstall');
    check('exit 0 on clean app', r.status === 0);
    check('app.asar untouched (no useless repack)', fs.statSync(asarFile).mtimeMs === origMtime);
    check('notice printed', r.stdout.includes('已经是纯净状态') || r.stdout.includes('未注入'));
  }

  console.log('\n=== E7 uninstall after install ===');
  {
    const root = await setupCase('e7');
    run(root, 'install');
    const asarFile = path.join(root, 'app', 'Antigravity.app', 'Contents', 'Resources', 'app.asar');

    const r = run(root, 'uninstall');
    check('uninstall exit 0', r.status === 0);
    const content = asarModule.extractFile(asarFile, 'dist/preload.js').toString('utf8');
    check('markers completely removed', !content.includes('VOYAGER-LATEX-START'));
    check('cold backup deleted after verification', !fs.existsSync(asarFile + '.before-voyager'));
    check('plist backup deleted', !fs.existsSync(path.join(root, 'app', 'Antigravity.app', 'Contents', 'Info.plist.before-voyager')));
  }

  console.log('\n=== E8 truncated marker handling (L2修复) ===');
  {
    const root = await setupCase('e8', {
      preload: '"use strict";\nconst a = 1;\n/* --- VOYAGER-LATEX-START --- */\n// truncated code without end\n'
    });
    const asarFile = path.join(root, 'app', 'Antigravity.app', 'Contents', 'Resources', 'app.asar');

    const r = run(root, 'install');
    check('install on truncated marker exits 0', r.status === 0);
    const content = asarModule.extractFile(asarFile, 'dist/preload.js').toString('utf8');
    check('does NOT produce duplicate START marker', content.split('/* --- VOYAGER-LATEX-START --- */').length === 2);
    check('properly closed with END marker', content.includes('/* --- VOYAGER-LATEX-END --- */'));
  }

  console.log('\n=== E11 version upgrade backup protection (H3修复) ===');
  {
    const root = await setupCase('e11', { version: '2.24.0' });
    const appDir = path.join(root, 'app', 'Antigravity.app');
    const asarFile = path.join(appDir, 'Contents', 'Resources', 'app.asar');
    const plistFile = path.join(appDir, 'Contents', 'Info.plist');

    // 1. 首次在 2.24.0 安装
    run(root, 'install');

    // 2. 模拟官方升级到 2.25.0
    fs.writeFileSync(
      plistFile,
      '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>2.25.0</string></dict></plist>'
    );

    // 3. 执行卸载兜底恢复
    const r = run(root, 'uninstall');
    check('uninstall exits 0', r.status === 0);

    // 4. 验证 Info.plist 没有被旧版 2.24.0 覆盖
    const curPlist = fs.readFileSync(plistFile, 'utf8');
    check('H3 修复：未把旧版 2.24.0 plist 覆盖到 2.25.0 应用上', curPlist.includes('2.25.0'));
  }

  console.log('\n=== E12 bloated asar self-healing & shrink acceptance ===');
  {
    const root = await setupCase('e12', { withUnpacked: true });
    const resDir = path.join(root, 'app', 'Antigravity.app', 'Contents', 'Resources');
    const asarFile = path.join(resDir, 'app.asar');
    const bakFile = path.join(resDir, 'app.asar.bak');

    // 复制当前带 unpack 规则的 asar 作为官方原始冷备 bakFile
    fs.copyFileSync(asarFile, bakFile);

    // 重新制作一个未配置 unpackDir 且注入 >1.2MB 填充数据的虚胖 asar
    const srcDir = path.join(root, 'src');
    const dummyBigFile = path.join(srcDir, 'node_modules', 'chrome-devtools-mcp', 'build', 'big_payload.dat');
    fs.writeFileSync(dummyBigFile, Buffer.alloc(1.2 * 1024 * 1024, 0x42));
    await asarModule.createPackageWithOptions(srcDir, asarFile, {}); // 无 unpack 规则

    const bloatedSize = fs.statSync(asarFile).size;
    check('bloated asar created > 1MB', bloatedSize > 1024 * 1024);

    // 运行 install：自愈机制应当从 bakFile 提取 unpack 契约，重新打包并剥离 big_payload.dat
    // 归档体积大幅收缩，但不应触发体积异常报错
    const r = run(root, 'install');
    check('E12: exit code 0 on unpack self-healing shrink', r.status === 0, r.stderr);
    check('E12: self-healing and shrink logged', r.stdout.includes('[自愈]') && r.stdout.includes('[消肿]'));
    const newSize = fs.statSync(asarFile).size;
    check('E12: archive shrank safely', newSize < bloatedSize * 0.5);
  }

  console.log('\n========================================');
  console.log(`ENGINE TESTS: ${pass} passed, ${fail} failed`);
  if (fail) console.log('FAILURES:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('ENGINE TEST HARNESS ERROR', e);
  process.exit(2);
});
