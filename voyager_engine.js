const fs = require('fs');
const path = require('path');
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

function resignAppOnMac(appPath) {
    if (process.platform !== 'darwin') return true;
    console.log(`[签名] 正在对应用包进行本地 ad-hoc 深度重签名: ${appPath}`);
    const res = runCommandSync(`codesign --force --deep --sign - "${appPath}"`);
    if (!res.success) {
        console.warn(`[警告] 重新签名失败: ${res.stderr}`);
        return false;
    }
    runCommandSync(`xattr -cr "${appPath}" 2>/dev/null || true`);
    console.log(`[签名] 重新签名成功！已消除系统篡改拦截。`);
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

function closeAntigravityProcess() {
    if (process.platform === 'darwin') {
        runCommandSync("pkill -9 -f 'Antigravity' 2>/dev/null || true");
    }
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

    const backupPath = asarPath + '.before-voyager';
    if (!fs.existsSync(backupPath)) {
        console.log(`[备份] 首次安装，正在创建当前状态独立冷备: ${path.basename(backupPath)} ...`);
        fs.copyFileSync(asarPath, backupPath);
        console.log(`[备份] 独立冷备已安全建立（绝不覆盖官方原版备份 app.asar.bak）！`);
    } else {
        console.log(`[备份] 已检测到现有冷备文件: ${path.basename(backupPath)}，跳过重复备份。`);
    }

    console.log(`[进程] 正在确保 Antigravity 进程关闭以解除文件锁...`);
    closeAntigravityProcess();

    const tempDir = path.join(os.tmpdir(), `antigravity_voyager_temp_${Date.now()}`);
    console.log(`[解包] 正在使用 npx 提取 app.asar ...`);
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

    console.log(`[注入] 正在向 preload.js 注入 Voyager LaTeX 增强代码...`);
    let preloadContent = fs.readFileSync(preloadPath, 'utf-8');
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
    console.log(`[注入] 代码注入成功！保留了现有的所有汉化配置。`);

    console.log(`[打包] 正在将修改后的内容打包回 app.asar ...`);
    const packRes = runCommandSync(`npx -y @electron/asar pack "${tempDir}" "${asarPath}"`);
    fs.rmSync(tempDir, { recursive: true, force: true });

    if (!packRes.success) {
        console.error(`[错误] 打包失败: ${packRes.stderr}`);
        process.exit(1);
    }

    resignAppOnMac(appPath);

    console.log('======================================================');
    console.log(' 🎉 安装成功！Voyager LaTeX 公式美化与一键复制已生效！');
    console.log(' 重启 Antigravity 即可在聊天面板中直接点击公式复制 LaTeX。');
    console.log('======================================================');
}

async function uninstall(appPath) {
    console.log('======================================================');
    console.log(' 🧹 正在卸载 Voyager LaTeX 公式增强，恢复纯净状态');
    console.log('======================================================');
    console.log(`[应用路径] ${appPath}`);

    const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
    const backupPath = asarPath + '.before-voyager';

    console.log(`[进程] 正在关闭 Antigravity 进程以解除文件锁...`);
    closeAntigravityProcess();

    if (fs.existsSync(backupPath)) {
        console.log(`[还原] 检测到冷备文件 ${path.basename(backupPath)}，正在极速恢复...`);
        fs.copyFileSync(backupPath, asarPath);
        fs.unlinkSync(backupPath);
        resignAppOnMac(appPath);
        console.log(`[√] 已完全恢复至安装公式插件前的原始状态！`);
        return;
    }

    // 备用方案：若无冷备文件，则解包后精准移除标记块
    console.log(`[备用还原] 未找到 .before-voyager 备份，正在解包执行精准剔除...`);
    const tempDir = path.join(os.tmpdir(), `antigravity_voyager_uninstall_${Date.now()}`);
    const extRes = runCommandSync(`npx -y @electron/asar extract "${asarPath}" "${tempDir}"`);
    if (!extRes.success) {
        console.error(`[错误] 解包失败: ${extRes.stderr}`);
        process.exit(1);
    }

    const preloadPath = path.join(tempDir, 'dist', 'preload.js');
    if (fs.existsSync(preloadPath)) {
        let content = fs.readFileSync(preloadPath, 'utf-8');
        content = cleanVoyagerBlock(content);
        fs.writeFileSync(preloadPath, content, 'utf-8');
    }

    runCommandSync(`npx -y @electron/asar pack "${tempDir}" "${asarPath}"`);
    fs.rmSync(tempDir, { recursive: true, force: true });
    resignAppOnMac(appPath);
    console.log(`[√] 已精准剔除 Voyager 注入代码，汉化配置完好无损！`);
}

const os = require('os');
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
