#!/bin/bash
set -e
cd "$(dirname "$0")"

# 补充 macOS 常见环境路径（支持 Homebrew / nvm / 官方安装包）
export PATH="/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

echo "======================================================"
echo " Antigravity LaTeX Enhancer v3.0.0 (无侵入 Sidecar 模式)"
echo " 无需 sudo · 不修改 app.asar · 保留官方签名"
echo "======================================================"

if ! command -v node &> /dev/null; then
    echo ""
    echo " [错误] 未检测到 Node.js 环境，请前往 https://nodejs.org 安装后重试。"
    read -n 1 -s -r -p "按任意键退出..."
    exit 1
fi

NODE_VER=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
    echo " [警告] 当前 Node.js 为 v$NODE_VER，建议使用 Node.js >= 22。"
fi

node manage.mjs install

echo ""
echo "当前状态摘要："
node manage.mjs status

echo ""
echo "处理完成。窗口将在 5 秒后自动关闭（或按任意键立即关闭）..."
read -t 5 -n 1 -s -r || true
