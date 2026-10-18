#!/bin/bash
set -e
cd "$(dirname "$0")"

# 补充 macOS 常见环境路径
export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

# 获取真实用户名
REAL_USER="${SUDO_USER:-$(id -un)}"

# 检查管理员权限，若不是 root 则自动通过 sudo 提权
if [ "$EUID" -ne 0 ]; then
    echo "======================================================"
    echo " 提示：macOS 修改 /Applications 应用程序需要管理员权限"
    echo " 请在下方输入您的电脑开机密码（输入时密码不显示，直接回车）："
    echo "======================================================"
    exec sudo env "PATH=$PATH" "SUDO_USER=$REAL_USER" "HOME=/Users/$REAL_USER" bash "$0" "$@"
fi

# 自愈检查（M3 修复）：自动修复由旧版工具产生的 ~/.npm root 属主权限污染
if [ -n "$SUDO_USER" ] && [ -d "/Users/$SUDO_USER/.npm" ]; then
    chown -R "$SUDO_USER" "/Users/$SUDO_USER/.npm" 2>/dev/null || true
fi

if ! command -v node &> /dev/null; then
    echo ""
    echo "======================================================"
    echo " [错误] 未检测到 Node.js 环境，无法执行安装。"
    echo " 请前往 https://nodejs.org 下载安装 Node.js 后重试。"
    echo "======================================================"
    echo ""
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

# 检查 Node 版本要求（M4 修复）
NODE_VER=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo ""
    echo "======================================================"
    echo " [警告] 检测到当前 Node.js 版本为 v$NODE_VER"
    echo " 现代 asar 打包引擎建议使用 Node.js >= 22 (推荐 LTS 22.x/24.x)"
    echo " 若后续运行出现异常，请前往 https://nodejs.org 更新 Node.js。"
    echo "======================================================"
    echo ""
fi

# 确保本地依赖存在（C1 修复：绝不在 root 下跑远程 npx）
if [ ! -d "node_modules/@electron/asar" ]; then
    echo "[环境] 正在初始化本地锁定依赖..."
    if [ -n "$SUDO_USER" ]; then
        sudo -u "$SUDO_USER" npm install --prefer-offline --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
    else
        npm install --prefer-offline --no-audit --no-fund
    fi
fi

node voyager_engine.js install

echo ""
echo "处理完成。窗口将在 5 秒后自动关闭（或按任意键立即关闭）..."
read -t 5 -n 1 -s -r || true
