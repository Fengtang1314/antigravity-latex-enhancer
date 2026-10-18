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
    echo " 提示：macOS 还原 /Applications 应用程序需要管理员权限"
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
    echo " [错误] 未检测到 Node.js 环境，无法执行还原。"
    echo "======================================================"
    echo ""
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

node voyager_engine.js uninstall

echo ""
echo "处理完成。窗口将在 5 秒后自动关闭（或按任意键立即关闭）..."
read -t 5 -n 1 -s -r || true
exit 0
