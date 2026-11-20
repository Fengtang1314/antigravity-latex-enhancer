#!/bin/bash
set -e
cd "$(dirname "$0")"

export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

echo "======================================================"
echo " 卸载 Antigravity LaTeX Enhancer (用户态 Sidecar)"
echo " 无需 sudo · 不触碰 Antigravity.app 官方签名"
echo "======================================================"

if ! command -v node &> /dev/null; then
    echo ""
    echo " [错误] 未检测到 Node.js 环境，无法执行卸载。"
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

node manage.mjs uninstall

echo ""
echo "当前状态摘要："
node manage.mjs status

echo ""
echo "处理完成。窗口将在 5 秒后自动关闭（或按任意键立即关闭）..."
read -t 5 -n 1 -s -r || true
exit 0
