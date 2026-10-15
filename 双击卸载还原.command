#!/bin/bash
cd "$(dirname "$0")"

export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

if [ "$EUID" -ne 0 ]; then
    echo "======================================================"
    echo " 提示：macOS 还原 /Applications 应用程序需要管理员权限"
    echo " 请在下方输入您的电脑开机密码（输入时密码不显示，直接回车）："
    echo "======================================================"
    exec sudo env "PATH=$PATH" "SUDO_USER=$USER" bash "$0" "$@"
fi

export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

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

if [ $? -ne 0 ]; then
    echo ""
    echo "运行出现错误，请检查上方日志。"
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

echo ""
echo "处理完成。窗口将在 5 秒后自动关闭（或按任意键立即关闭）..."
read -t 5 -n 1 -s -r || true
exit 0
