const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const child_process = require('child_process');

// 补全 macOS 运行环境变量
if (process.platform === 'darwin') {
    const extraPaths = ['/usr/local/bin', '/opt/homebrew/bin', '/opt/homebrew/sbin'];
    const currentPaths = (process.env.PATH || '').split(':');
    for (const p of extraPaths) {
        if (!currentPaths.includes(p) && fs.existsSync(p)) {
            currentPaths.unshift(p);
        }
    }
    const nodeBinDir = path.dirname(process.execPath);
    if (!currentPaths.includes(nodeBinDir)) {
        currentPaths.unshift(nodeBinDir);
    }
    process.env.PATH = currentPaths.join(':');
}

const MARKER_START = '/* --- VOYAGER-LATEX-START --- */';
const MARKER_END = '/* --- VOYAGER-LATEX-END --- */';

let cachedAsar = null;
async function getAsar() {
    if (cachedAsar) return cachedAsar;
    try {
        cachedAsar = await import('@electron/asar');
        return cachedAsar;
    } catch (e) {
        const localPath = path.join(__dirname, 'node_modules', '@electron', 'asar', 'lib', 'asar.js');
        if (fs.existsSync(localPath)) {
            cachedAsar = await import(localPath);
            return cachedAsar;
        }
        throw new Error('未检测到本地 @electron/asar 模块，请先运行 npm install 或使用附带内置依赖的完整发布包。');
    }
}

function runCommandSync(cmd) {
    try {
        const stdout = child_process.execSync(cmd, {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 50 * 1024 * 1024
        });
        return { success: true, stdout, stderr: '' };
    } catch (err) {
        return {
            success: false,
            stdout: err.stdout ? err.stdout.toString() : '',
            stderr: err.stderr ? err.stderr.toString() : (err.message || '')
        };
    }
}

function checkRunningApp(appPath) {
    if (process.env.VOYAGER_SKIP_RUNNING_CHECK) return;
    if (!appPath || (!appPath.startsWith('/Applications') && !appPath.includes('/Applications/Antigravity'))) {
        return;
    }
    try {
        const res = child_process.spawnSync('pgrep', ['-f', 'Antigravity.app'], { encoding: 'utf-8' });
        if (res.status === 0 && res.stdout && res.stdout.trim().length > 0) {
            console.error('\n[错误] 检测到 Antigravity 正在运行！');
            console.error('为了防止应用被截断或状态错乱，请先在程序坞中完全退出 (Cmd+Q) Antigravity，然后再执行本操作。\n');
            process.exit(1);
        }
    } catch (e) {}
}

function findAppPath() {
    if (process.env.VOYAGER_APP_PATH && fs.existsSync(process.env.VOYAGER_APP_PATH)) {
        return process.env.VOYAGER_APP_PATH;
    }
    const candidates = [
        process.env.FAKE_APP,
        '/Applications/Antigravity.app',
        '/Applications/Antigravity IDE.app',
        path.join(process.env.HOME || '', 'Applications/Antigravity.app'),
        path.join(process.env.HOME || '', 'Applications/Antigravity IDE.app')
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function getAppVersion(infoPlistPath) {
    if (!fs.existsSync(infoPlistPath)) return 'unknown';
    try {
        const res = child_process.spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', infoPlistPath], { encoding: 'utf-8' });
        if (res.status === 0 && res.stdout) return res.stdout.trim();
    } catch (e) {}
    return 'unknown';
}

/**
 * 读取并解析 asar 头部 JSON 结构
 */
function readAsarHeader(asarPath) {
    const fd = fs.openSync(asarPath, 'r');
    const sizeBuf = Buffer.alloc(16);
    fs.readSync(fd, sizeBuf, 0, 16, 0);
    const headerLen = sizeBuf.readUInt32LE(12);
    const headerBuf = Buffer.alloc(headerLen);
    fs.readSync(fd, headerBuf, 0, headerLen, 16);
    fs.closeSync(fd);
    return JSON.parse(headerBuf.toString('utf-8'));
}

/**
 * 遍历头部树收集所有 unpacked: true 的文件与目录路径
 */
function getUnpackedPaths(header) {
    const out = [];
    function walk(o, p) {
        for (const k of Object.keys(o)) {
            const e = o[k];
            if (!e || typeof e !== 'object') continue;
            if (e.unpacked) out.push(p + k);
            if (e.files) walk(e.files, p + k + '/');
        }
    }
    if (header && header.files) walk(header.files, '');
    return out;
}

/**
 * 将具体 unpacked 文件路径抽象为通配目录规则
 */
function detectUnpackDirPattern(unpackedPaths) {
    if (!unpackedPaths || unpackedPaths.length === 0) return null;
    const roots = new Set();
    for (const p of unpackedPaths) {
        const parts = p.split('/');
        if (parts[0] === 'node_modules' && parts.length > 2) {
            roots.add(`node_modules/${parts[1]}`);
        } else if (parts.length > 1) {
            roots.add(parts[0]);
        } else {
            roots.add(p);
        }
    }
    const arr = Array.from(roots);
    if (arr.length === 0) return null;
    if (arr.length === 1) return `${arr[0]}*`;
    return `{${arr.join(',')}}*`;
}

/**
 * 智能解析并自愈 asarUnpack 契约规则（H1 修复）
 */
function resolveUnpackPattern(asarPath) {
    let header;
    try {
        header = readAsarHeader(asarPath);
    } catch (e) {
        return null;
    }
    let unpacked = getUnpackedPaths(header);

    // 自愈保障：若当前 asar 的 unpacked 丢失，从官方原始 app.asar.bak 提取真实契约
    if (unpacked.length === 0) {
        const officialBak = asarPath + '.bak';
        if (fs.existsSync(officialBak)) {
            try {
                const bakHeader = readAsarHeader(officialBak);
                const bakUnpacked = getUnpackedPaths(bakHeader);
                if (bakUnpacked.length > 0) {
                    console.log(`[自愈] 检测到当前归档 unpacked 契约为空，已从官方原始备份提取契约 (${bakUnpacked.length} 项)！`);
                    unpacked = bakUnpacked;
                }
            } catch (e) {}
        }
    }

    // 磁盘扫描保障：若仍为 0，检测同级磁盘上的 app.asar.unpacked 目录
    if (unpacked.length === 0) {
        const unpackedDir = asarPath + '.unpacked';
        if (fs.existsSync(unpackedDir)) {
            const found = [];
            const nm = path.join(unpackedDir, 'node_modules');
            if (fs.existsSync(nm)) {
                for (const sub of fs.readdirSync(nm)) {
                    if (!sub.startsWith('.')) found.push(`node_modules/${sub}`);
                }
            }
            if (found.length > 0) {
                console.log(`[自愈] 检测到磁盘残留 unpacked 目录，自动推断契约: ${found.join(', ')}`);
                return found.length === 1 ? `${found[0]}*` : `{${found.join(',')}}*`;
            }
        }
    }

    return detectUnpackDirPattern(unpacked);
}

/**
 * 计算 Electron asar 头部 JSON 的 SHA-256 哈希值
 */
function getAsarHeaderSha256(asarPath) {
    const fd = fs.openSync(asarPath, 'r');
    const sizeBuf = Buffer.alloc(16);
    fs.readSync(fd, sizeBuf, 0, 16, 0);
    const headerLen = sizeBuf.readUInt32LE(12);
    const headerBuf = Buffer.alloc(headerLen);
    fs.readSync(fd, headerBuf, 0, headerLen, 16);
    fs.closeSync(fd);
    return crypto.createHash('sha256').update(headerBuf).digest('hex');
}

/**
 * 校验并同步更新 Info.plist 中的 ElectronAsarIntegrity 字段
 */
function syncAsarIntegrityToInfoPlist(appPath, asarPath) {
    if (process.env.VOYAGER_TEST_FAIL_PLIST) {
        console.error(`[测试钩子] 模拟 PlistBuddy 同步失败`);
        return false;
    }
    const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
    if (!fs.existsSync(infoPlistPath)) return false;

    try {
        const checkRes = runCommandSync(`/usr/libexec/PlistBuddy -c "Print :ElectronAsarIntegrity:Resources/app.asar:hash" "${infoPlistPath}"`);
        if (!checkRes.success) {
            return true;
        }

        const newHash = getAsarHeaderSha256(asarPath);
        console.log(`[完整性] 正在同步 Info.plist 的 ElectronAsarIntegrity 哈希值: ${newHash}`);
        const setRes = runCommandSync(`/usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash ${newHash}" "${infoPlistPath}"`);
        if (setRes.success) {
            console.log(`[完整性] Info.plist 哈希校验值已同步更新成功！`);
            return true;
        } else {
            console.error(`[致命错误] 同步 Info.plist 失败: ${setRes.stderr}`);
            return false;
        }
    } catch (e) {
        console.error(`[致命错误] 检查 Info.plist 完整性字段出现异常: ${e.message}`);
        return false;
    }
}

/**
 * 重签名并执行严格检验（H4 加固）
 */
function resignAppOnMac(appPath) {
    if (process.env.VOYAGER_TEST_FAIL_CODESIGN) {
        console.error(`[测试钩子] 模拟 codesign 失败`);
        return false;
    }
    if (process.platform !== 'darwin') return true;
    console.log(`[签名] 正在清理干扰文件并对应用包进行本地 ad-hoc 深度重签名: ${appPath}`);
    runCommandSync(`find "${appPath}" -name ".DS_Store" -delete 2>/dev/null || true`);
    const res = runCommandSync(`codesign --force --deep --sign - "${appPath}"`);
    if (!res.success) {
        console.error(`[致命错误] 重新签名失败: ${res.stderr}`);
        return false;
    }
    // 定向清理系统的 quarantine 隔离属性，替换激进的 xattr -cr
    runCommandSync(`xattr -d com.apple.quarantine "${appPath}" 2>/dev/null || true`);

    const verifyRes = runCommandSync(`codesign --verify --deep --strict "${appPath}"`);
    if (!verifyRes.success) {
        console.error(`[致命错误] 签名完整性严格校验未通过: ${verifyRes.stderr}`);
        return false;
    }
    console.log(`[签名] 重新签名成功并已通过系统严格检验！`);
    return true;
}

function cleanVoyagerBlock(content) {
    if (!content.includes(MARKER_START)) return content;
    if (content.includes(MARKER_END)) {
        const regex = new RegExp(`\\r?\\n?\\s*${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\r?\\n?`, 'g');
        return content.replace(regex, '\n').trim() + '\n';
    } else {
        // L2 修复：START 截断无 END 时，从 START 开始剔除至文件尾部
        const idx = content.indexOf(MARKER_START);
        return content.slice(0, idx).trim() + '\n';
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 紧急回滚状态机
 */
function rollback(appPath, backupAsar, backupPlist) {
    console.log('[回滚] 正在从纯净备份紧急恢复应用...');
    const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
    const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
    try {
        if (fs.existsSync(backupAsar)) {
            fs.copyFileSync(backupAsar, asarPath);
            console.log('[回滚] 已还原核心归档 app.asar');
        }
        if (fs.existsSync(backupPlist)) {
            fs.copyFileSync(backupPlist, infoPlistPath);
            console.log('[回滚] 已还原配置文件 Info.plist');
        }
        syncAsarIntegrityToInfoPlist(appPath, asarPath);
        resignAppOnMac(appPath);
        console.log('[回滚] 回滚完成，应用已恢复初始纯净可用状态。');
    } catch (err) {
        console.error(`[回滚失败] 自动回滚遇到异常: ${err.message}`);
    }
}

async function install(appPath) {
    console.log('======================================================');
    console.log(' 🚀 正在向 Antigravity 安装 Voyager LaTeX 公式增强 v2.3.1');
    console.log('======================================================');
    console.log(`[应用路径] ${appPath}`);

    checkRunningApp(appPath);

    const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
    if (!fs.existsSync(asarPath)) {
        console.error(`[错误] 未找到核心归档文件: ${asarPath}`);
        process.exit(1);
    }

    const asar = await getAsar();
    const unpackPattern = resolveUnpackPattern(asarPath);
    if (unpackPattern) {
        console.log(`[契约] 成功解析并锁定 asarUnpack 规则: ${unpackPattern}`);
    } else {
        console.log(`[契约] 当前归档无 unpacked 规则。`);
    }

    const tempDir = path.join(os.tmpdir(), `antigravity_voyager_install_${Date.now()}`);
    console.log(`[解包] 正在使用本地 asar 提取归档至工作区...`);
    try {
        await asar.extractAll(asarPath, tempDir);
    } catch (err) {
        console.error(`[错误] 解包失败: ${err.message}`);
        process.exit(1);
    }

    const preloadPath = path.join(tempDir, 'dist', 'preload.js');
    if (!fs.existsSync(preloadPath)) {
        console.error(`[错误] 未在解包目录中找到 dist/preload.js`);
        fs.rmSync(tempDir, { recursive: true, force: true });
        process.exit(1);
    }

    let preloadContent = fs.readFileSync(preloadPath, 'utf-8');
    const hasExistingVoyager = preloadContent.includes(MARKER_START);

    const backupAsar = asarPath + '.before-voyager';
    const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
    const backupPlist = infoPlistPath + '.before-voyager';
    const metaPath = path.join(appPath, 'Contents', 'Resources', 'voyager-backup-meta.json');

    // 冷备双文件同事务刷新机制（H3 修复）
    if (!hasExistingVoyager || !fs.existsSync(backupAsar)) {
        console.log(`[备份] 检测到纯净状态，正在同事务刷新冷备与元数据...`);
        fs.copyFileSync(asarPath, backupAsar);
        if (fs.existsSync(infoPlistPath)) {
            fs.copyFileSync(infoPlistPath, backupPlist);
        }
        const meta = {
            appVersion: getAppVersion(infoPlistPath),
            backupTime: new Date().toISOString(),
            asarSha256: crypto.createHash('sha256').update(fs.readFileSync(backupAsar)).digest('hex'),
            unpackPattern: unpackPattern
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        console.log(`[备份] 纯净冷备与版本元数据已安全落盘（绝不触碰官方原始 app.asar.bak）！`);
    } else {
        console.log(`[备份] 当前包已存在 Voyager 模块，执行热更新，保留先前建立的纯净冷备。`);
    }

    console.log(`[注入] 正在向 preload.js 注入 Voyager LaTeX 增强代码...`);
    preloadContent = cleanVoyagerBlock(preloadContent);

    const payloadPath = path.join(__dirname, 'payload', 'voyager-latex.js');
    if (!fs.existsSync(payloadPath)) {
        console.error(`[错误] 未找到 payload/voyager-latex.js 核心代码文件`);
        fs.rmSync(tempDir, { recursive: true, force: true });
        process.exit(1);
    }
    const payloadContent = fs.readFileSync(payloadPath, 'utf-8');
    const injectionBlock = `\n${MARKER_START}\n${payloadContent}\n${MARKER_END}\n`;
    const newPreloadContent = preloadContent.trimEnd() + '\n' + injectionBlock;
    fs.writeFileSync(preloadPath, newPreloadContent, 'utf-8');
    console.log(`[注入] 代码注入成功！保留了所有原有配置与汉化。`);

    const tmpAsarPath = path.join(os.tmpdir(), `app_voyager_${Date.now()}.asar`);
    console.log(`[打包] 正在使用本地 asar 打包归档...`);
    try {
        const packOpts = {};
        if (unpackPattern) packOpts.unpackDir = unpackPattern;
        await asar.createPackageWithOptions(tempDir, tmpAsarPath, packOpts);
    } catch (err) {
        console.error(`[错误] 打包失败: ${err.message}`);
        fs.rmSync(tempDir, { recursive: true, force: true });
        process.exit(1);
    }
    fs.rmSync(tempDir, { recursive: true, force: true });

    if (!fs.existsSync(tmpAsarPath)) {
        console.error(`[错误] 打包生成的临时归档文件不存在`);
        process.exit(1);
    }

    const origSize = fs.statSync(asarPath).size;
    const tmpSize = fs.statSync(tmpAsarPath).size;

    // 体积异常保护（防止打包截断或空包损坏应用）
    // 说明：正常 Antigravity 官方 app.asar 约 4.5MB。若历史版本因丢失 unpacked 规则导致
    // chrome-devtools-mcp (~13.6MB) 误打包进 asar，asar 会虚胖至 ~18MB。
    // 在本次自愈成功恢复 unpack 契约后，外部文件被剥离至 app.asar.unpacked，
    // asar 体积会健康回落至 ~4.8MB (~26% 原体积)，这是完全符合预期的自愈现象。
    let minAllowedSize = 500;
    if (origSize > 1024 * 1024) {
        if (unpackPattern) {
            // 当启用/自愈 unpacked 契约时，外部模块被剥离至 app.asar.unpacked，
            // 归档体积大幅缩减（如 Antigravity 从 18.1MB 回落至 4.8MB）属于预期内的健康消肿。
            minAllowedSize = 500;
            if (tmpSize < origSize * 0.8) {
                console.log(`[消肿] 契约自愈生效：外部模块已剥离至 unpacked 目录，归档体积从 ${(origSize / 1024 / 1024).toFixed(2)} MB 健康回落至 ${(tmpSize / 1024 / 1024).toFixed(2)} MB。`);
            }
        } else {
            minAllowedSize = Math.max(1024 * 1024, Math.floor(origSize * 0.3));
        }
    }

    if (tmpSize < minAllowedSize) {
        console.error(`[错误] 生成的归档包体积异常 (原大小: ${origSize}, 新大小: ${tmpSize} bytes，安全阈值: ${minAllowedSize})，已中止替换以保护应用！`);
        fs.unlinkSync(tmpAsarPath);
        process.exit(1);
    }

    // 契约断言检验（H1 修复断言）
    if (unpackPattern) {
        try {
            const newHeader = readAsarHeader(tmpAsarPath);
            const newUnpacked = getUnpackedPaths(newHeader);
            if (newUnpacked.length === 0) {
                console.error(`[致命错误] 新归档包丢失了 unpacked 契约！已中止部署。`);
                fs.unlinkSync(tmpAsarPath);
                process.exit(1);
            }
            console.log(`[契约校验] 成功核验 unpacked 外部条目保留 (${newUnpacked.length} 项)！`);
        } catch (e) {
            console.error(`[错误] 校验归档头部失败: ${e.message}`);
            fs.unlinkSync(tmpAsarPath);
            process.exit(1);
        }
    }

    // 同目录原子安全替换（M5 修复）
    const targetDir = path.dirname(asarPath);
    const stagedPath = path.join(targetDir, `app.asar.tmp_${Date.now()}`);
    console.log(`[部署] 正在执行同物理目录原子替换 app.asar (${(tmpSize / 1024 / 1024).toFixed(2)} MB)...`);

    let swapped = false;
    try {
        fs.copyFileSync(tmpAsarPath, stagedPath);
        fs.unlinkSync(tmpAsarPath);

        const fd = fs.openSync(stagedPath, 'r');
        fs.fsyncSync(fd);
        fs.closeSync(fd);

        fs.renameSync(stagedPath, asarPath);
        swapped = true;

        // 同步 Info.plist 中的 ElectronAsarIntegrity 校验哈希（H2 修复）
        const syncOk = syncAsarIntegrityToInfoPlist(appPath, asarPath);
        if (!syncOk) {
            throw new Error('同步 Info.plist 的完整性哈希校验值失败');
        }

        // 重新签名并验证（H2 修复）
        const signOk = resignAppOnMac(appPath);
        if (!signOk) {
            throw new Error('应用 macOS 重新签名或验证未通过');
        }
    } catch (err) {
        console.error(`\n[致命故障] ${err.message}`);
        if (fs.existsSync(stagedPath)) {
            try { fs.unlinkSync(stagedPath); } catch (e) {}
        }
        if (swapped) {
            console.log(`[熔断保护] 检测到关键配置失败，正在紧急回滚应用至安全状态...`);
            rollback(appPath, backupAsar, backupPlist);
        }
        process.exit(1);
    }

    console.log('======================================================');
    console.log(' 🎉 安装成功！Voyager LaTeX 公式美化与一键复制已生效！');
    console.log(' 请完全退出 (Cmd+Q) 并重新打开 Antigravity 即可生效。');
    console.log('======================================================');
}

async function uninstall(appPath) {
    console.log('======================================================');
    console.log(' 🧹 正在卸载 Voyager LaTeX 公式增强，恢复纯净状态');
    console.log('======================================================');
    console.log(`[应用路径] ${appPath}`);

    checkRunningApp(appPath);

    const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
    const backupAsar = asarPath + '.before-voyager';
    const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
    const backupPlist = infoPlistPath + '.before-voyager';
    const metaPath = path.join(appPath, 'Contents', 'Resources', 'voyager-backup-meta.json');

    if (!fs.existsSync(asarPath)) {
        console.error(`[错误] 未找到核心归档文件: ${asarPath}`);
        process.exit(1);
    }

    const asar = await getAsar();

    // M7 修复：解包前检查标记，纯净状态直接退出，绝不无谓重包重签
    let hasVoyager = false;
    try {
        const preloadBuf = asar.extractFile(asarPath, 'dist/preload.js');
        if (preloadBuf && preloadBuf.toString('utf-8').includes(MARKER_START)) {
            hasVoyager = true;
        }
    } catch (e) {
        hasVoyager = true;
    }

    if (!hasVoyager) {
        console.log(`[提示] 检测到 Antigravity 已经是纯净状态（未注入 Voyager 增强代码），无需执行重打包。`);
        return;
    }

    const unpackPattern = resolveUnpackPattern(asarPath);
    const tempDir = path.join(os.tmpdir(), `antigravity_voyager_uninstall_${Date.now()}`);
    console.log(`[还原] 正在解包当前应用以执行代码级精准剔除...`);

    try {
        await asar.extractAll(asarPath, tempDir);
        const preloadPath = path.join(tempDir, 'dist', 'preload.js');
        if (fs.existsSync(preloadPath)) {
            let content = fs.readFileSync(preloadPath, 'utf-8');
            content = cleanVoyagerBlock(content);
            fs.writeFileSync(preloadPath, content, 'utf-8');

            const tmpAsarPath = path.join(os.tmpdir(), `app_uninstall_${Date.now()}.asar`);
            const packOpts = {};
            if (unpackPattern) packOpts.unpackDir = unpackPattern;
            await asar.createPackageWithOptions(tempDir, tmpAsarPath, packOpts);
            fs.rmSync(tempDir, { recursive: true, force: true });

            if (fs.existsSync(tmpAsarPath)) {
                const origSize = fs.statSync(asarPath).size;
                const tmpSize = fs.statSync(tmpAsarPath).size;
                let minAllowedSize = 500;
                if (origSize > 1024 * 1024) {
                    minAllowedSize = unpackPattern
                        ? 500
                        : Math.max(1024 * 1024, Math.floor(origSize * 0.3));
                }
                if (tmpSize < minAllowedSize) {
                    fs.unlinkSync(tmpAsarPath);
                    throw new Error(`卸载重新打包体积异常 (原大小: ${origSize}, 新大小: ${tmpSize} bytes)`);
                }

                const targetDir = path.dirname(asarPath);
                const stagedPath = path.join(targetDir, `app.asar.tmp_${Date.now()}`);
                fs.copyFileSync(tmpAsarPath, stagedPath);
                fs.unlinkSync(tmpAsarPath);

                const fd = fs.openSync(stagedPath, 'r');
                fs.fsyncSync(fd);
                fs.closeSync(fd);
                fs.renameSync(stagedPath, asarPath);

                syncAsarIntegrityToInfoPlist(appPath, asarPath);
                resignAppOnMac(appPath);

                if (fs.existsSync(backupAsar)) fs.unlinkSync(backupAsar);
                if (fs.existsSync(backupPlist)) fs.unlinkSync(backupPlist);
                if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);

                console.log(`[√] 代码级精准剔除完成！已无痕剥离 Voyager 代码，保留其余所有环境与契约。`);
                return;
            }
        }
    } catch (err) {
        console.warn(`[警告] 代码级解包剔除遇到异常 (${err.message})，正在尝试冷备安全还原...`);
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }

    // 兜底方案：冷备恢复（H3 修复：防旧版本 plist 覆盖新版应用）
    if (fs.existsSync(backupAsar)) {
        console.log(`[兜底还原] 正在使用冷备文件恢复...`);
        fs.copyFileSync(backupAsar, asarPath);

        let canRestorePlist = fs.existsSync(backupPlist);
        if (canRestorePlist && fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                const curVer = getAppVersion(infoPlistPath);
                if (meta.appVersion && curVer !== 'unknown' && meta.appVersion !== curVer) {
                    console.warn(`[版本保护] 检测到应用已跨版本更新 (${meta.appVersion} -> ${curVer})，跳过恢复旧版 Info.plist，采用实时重算哈希！`);
                    canRestorePlist = false;
                }
            } catch (e) {}
        }

        if (canRestorePlist) {
            fs.copyFileSync(backupPlist, infoPlistPath);
            console.log(`[兜底还原] Info.plist 已还原至冷备配置。`);
        } else {
            syncAsarIntegrityToInfoPlist(appPath, asarPath);
        }

        resignAppOnMac(appPath);

        try {
            if (fs.existsSync(backupAsar)) fs.unlinkSync(backupAsar);
            if (fs.existsSync(backupPlist)) fs.unlinkSync(backupPlist);
            if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
        } catch (e) {}

        console.log(`[√] 已通过冷备文件安全恢复至初始纯净状态！`);
        return;
    }

    console.log(`[提示] 未发现注入的 Voyager 模块或已处于还原状态。`);
}

const mode = process.argv[2] || 'install';
const appPath = findAppPath();

if (!appPath) {
    console.error('[错误] 未能自动定位到 /Applications/Antigravity.app。');
    process.exit(1);
}

(async () => {
    try {
        if (mode === 'install') {
            await install(appPath);
        } else if (mode === 'uninstall') {
            await uninstall(appPath);
        } else {
            console.log(`未知模式: ${mode}，支持 install / uninstall`);
        }
    } catch (err) {
        console.error(`[未捕获异常] ${err.stack || err.message}`);
        process.exit(1);
    }
})();
