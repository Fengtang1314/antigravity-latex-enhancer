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

function findAppPath() {
    const candidates = [
        '/Applications/Antigravity.app',
        '/Applications/Antigravity IDE.app',
        path.join(process.env.HOME || '', 'Applications/Antigravity.app'),
        path.join(process.env.HOME || '', 'Applications/Antigravity IDE.app')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
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
    const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
    if (!fs.existsSync(infoPlistPath)) return false;

    try {
        // 检查是否存在 ElectronAsarIntegrity
        const checkRes = runCommandSync(`/usr/libexec/PlistBuddy -c "Print :ElectronAsarIntegrity:Resources/app.asar:hash" "${infoPlistPath}"`);
        if (!checkRes.success) {
            // 不存在该字段则无需更新
            return false;
        }

        const newHash = getAsarHeaderSha256(asarPath);
        console.log(`[完整性] 正在同步 Info.plist 的 ElectronAsarIntegrity 哈希值: ${newHash}`);
        const setRes = runCommandSync(`/usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash ${newHash}" "${infoPlistPath}"`);
        if (setRes.success) {
            console.log(`[完整性] Info.plist 哈希校验值已同步更新成功！`);
            return true;
        } else {
            console.warn(`[警告] 同步 Info.plist 失败: ${setRes.stderr}`);
            return false;
        }
    } catch (e) {
        console.warn(`[警告] 检查 Info.plist 完整性字段出现异常: ${e.message}`);
        return false;
    }
}

function resignAppOnMac(appPath) {
    if (process.platform !== 'darwin') return true;
    console.log(`[签名] 正在清理干扰文件并对应用包进行本地 ad-hoc 深度重签名: ${appPath}`);
    runCommandSync(`find "${appPath}" -name ".DS_Store" -delete 2>/dev/null || true`);
    const res = runCommandSync(`codesign --force --deep --sign - "${appPath}"`);
    if (!res.success) {
        console.warn(`[警告] 重新签名失败: ${res.stderr}`);
        return false;
    }
    runCommandSync(`xattr -cr "${appPath}" 2>/dev/null || true`);
    console.log(`[签名] 重新签名成功！已清除系统隔离标记。`);
    return true;
}

function cleanVoyagerBlock(content) {
    if (!content.includes(MARKER_START)) return content;
    const regex = new RegExp(`\\r?\\n?\\s*${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\r?\\n?`, 'g');
    return content.replace(regex, '\n').trim() + '\n';
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function install(appPath) {
    console.log('======================================================');
    console.log(' 🚀 正在向 Antigravity 2.x 安装 Voyager LaTeX 公式增强');
    console.log('======================================================');
    console.log(`[应用路径] ${appPath}`);

    const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
    if (!fs.existsSync(asarPath)) {
        console.error(`[错误] 未找到核心归档文件: ${asarPath}`);
        process.exit(1);
    }

    const tempDir = path.join(os.tmpdir(), `antigravity_voyager_install_${Date.now()}`);
    console.log(`[解包] 正在使用 npx 提取 app.asar 至临时工作区...`);
    const extRes = runCommandSync(`npx -y @electron/asar extract "${asarPath}" "${tempDir}"`);
    if (!extRes.success || !fs.existsSync(tempDir)) {
        console.error(`[错误] 解包失败: ${extRes.stderr}`);
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

    // 隐患 4 修复：仅当当前包尚未注入 Voyager 时，才将当前包作为冷备
    const backupPath = asarPath + '.before-voyager';
    const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
    const infoPlistBackup = infoPlistPath + '.before-voyager';

    if (!hasExistingVoyager) {
        console.log(`[备份] 检测到当前包为纯净状态，正在建立独立冷备: ${path.basename(backupPath)} ...`);
        fs.copyFileSync(asarPath, backupPath);
        if (fs.existsSync(infoPlistPath) && !fs.existsSync(infoPlistBackup)) {
            fs.copyFileSync(infoPlistPath, infoPlistBackup);
            console.log(`[备份] Info.plist 配置冷备已建立: ${path.basename(infoPlistBackup)}`);
        }
        console.log(`[备份] 独立冷备已安全就绪（绝不触碰官方原始 app.asar.bak）！`);
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

    // 隐患 2 修复：防自杀与原子替换，先打包为临时 asar 文件
    const tmpAsarPath = path.join(os.tmpdir(), `app_voyager_${Date.now()}.asar`);
    console.log(`[打包] 正在将修改后内容打包为临时归档包...`);
    const packRes = runCommandSync(`npx -y @electron/asar pack "${tempDir}" "${tmpAsarPath}"`);
    fs.rmSync(tempDir, { recursive: true, force: true });

    if (!packRes.success || !fs.existsSync(tmpAsarPath)) {
        console.error(`[错误] 打包失败: ${packRes.stderr}`);
        process.exit(1);
    }

    const tmpSize = fs.statSync(tmpAsarPath).size;
    if (tmpSize < 1024 * 1024) {
        console.error(`[错误] 生成的归档包体积异常 (${tmpSize} bytes)，已中止替换以保护应用！`);
        fs.unlinkSync(tmpAsarPath);
        process.exit(1);
    }

    console.log(`[部署] 正在执行原子替换 app.asar (${(tmpSize / 1024 / 1024).toFixed(2)} MB)...`);
    fs.copyFileSync(tmpAsarPath, asarPath);
    fs.unlinkSync(tmpAsarPath);

    // 隐患 3 修复：同步 Info.plist 中的 ElectronAsarIntegrity 校验哈希
    syncAsarIntegrityToInfoPlist(appPath, asarPath);

    // 重新签名
    resignAppOnMac(appPath);

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

    const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
    const backupPath = asarPath + '.before-voyager';

    // 隐患 4 修复：优先采用“解包 -> 正则精准剔除 -> 重包签名”，支持跨版本无损卸载
    const tempDir = path.join(os.tmpdir(), `antigravity_voyager_uninstall_${Date.now()}`);
    console.log(`[还原] 正在解包当前应用以执行代码级精准剔除...`);
    const extRes = runCommandSync(`npx -y @electron/asar extract "${asarPath}" "${tempDir}"`);

    if (extRes.success && fs.existsSync(tempDir)) {
        const preloadPath = path.join(tempDir, 'dist', 'preload.js');
        if (fs.existsSync(preloadPath)) {
            let content = fs.readFileSync(preloadPath, 'utf-8');
            content = cleanVoyagerBlock(content);
            fs.writeFileSync(preloadPath, content, 'utf-8');

            const tmpAsarPath = path.join(os.tmpdir(), `app_uninstall_${Date.now()}.asar`);
            const packRes = runCommandSync(`npx -y @electron/asar pack "${tempDir}" "${tmpAsarPath}"`);
            fs.rmSync(tempDir, { recursive: true, force: true });

            if (packRes.success && fs.existsSync(tmpAsarPath)) {
                fs.copyFileSync(tmpAsarPath, asarPath);
                fs.unlinkSync(tmpAsarPath);
                syncAsarIntegrityToInfoPlist(appPath, asarPath);
                resignAppOnMac(appPath);

                if (fs.existsSync(backupPath)) {
                    fs.unlinkSync(backupPath);
                }
                const infoPlistBackup = path.join(appPath, 'Contents', 'Info.plist.before-voyager');
                if (fs.existsSync(infoPlistBackup)) {
                    fs.unlinkSync(infoPlistBackup);
                }
                console.log(`[√] 代码级精准剔除完成！已无痕剥离 Voyager 代码，保留其余所有环境。`);
                return;
            }
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // 兜底方案：若解包或打包失败，采用冷备文件快速覆盖
    const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
    const infoPlistBackup = infoPlistPath + '.before-voyager';
    if (fs.existsSync(backupPath)) {
        console.log(`[兜底还原] 正在使用冷备文件恢复...`);
        fs.copyFileSync(backupPath, asarPath);
        fs.unlinkSync(backupPath);
        if (fs.existsSync(infoPlistBackup)) {
            fs.copyFileSync(infoPlistBackup, infoPlistPath);
            fs.unlinkSync(infoPlistBackup);
            console.log(`[兜底还原] Info.plist 已还原至冷备配置。`);
        } else {
            syncAsarIntegrityToInfoPlist(appPath, asarPath);
        }
        resignAppOnMac(appPath);
        console.log(`[√] 已通过冷备文件恢复至初始纯净状态！`);
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

if (mode === 'install') {
    install(appPath);
} else if (mode === 'uninstall') {
    uninstall(appPath);
} else {
    console.log(`未知模式: ${mode}，支持 install / uninstall`);
}
