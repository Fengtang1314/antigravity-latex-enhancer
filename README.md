# Antigravity LaTeX Enhancer (v3.0.0 · Sidecar + CDP 无侵入版)

专为 **Google Antigravity Desktop 2.33+** 打造的 LaTeX 公式美化与一键复制增强插件。

自 **v3.0.0** 起，插件从“修改 `app.asar` + `codesign` 重签名”迁移为**无侵入用户态 Sidecar + 本地 CDP 动态注入**架构：
- **零侵入、免 `sudo`**：不修改 `/Applications/Antigravity.app`，保留 Google 官方签名与自动更新能力；
- **即插即用、支持热启停**：安装到 `~/.gemini/config/plugins/antigravity-latex-enhancer/`，通过 `~/.gemini/config/config.json` 开关控制，停用或卸载时自动调用 `dispose()` 无痕回收样式与监听器；
- **与 `antigravity-pulse` 无冲突协同**：复用共享 `<profile>/DevToolsActivePort` 进行 CDP 连接与注入，不抢占重启客户端、不修改 `Antigravity (Debug).app`。

---

## 核心特性

1. **公式排版居中与超宽安全滚动**：隐藏 KaTeX MathML 占位层，采用 `inline-block` + `width: max-content` 解耦居中与横向滚动容器，超宽公式从左侧 `0` 坐标起完整滚动无裁切。
2. **智能防挤压呼吸间距**：连续块级公式之间施加 `28px` 间距（`.voyager-math-stacked` 双向检测），段落与公式交界处施加 `20px` 缓冲。
3. **浅色 / 深色主题自适应**：默认保持 Claude 暖白纸面美学（`#FAF5EE` / `#141413` / `#D97757`），并自动跟随宿主 `theme-dark` / `prefers-color-scheme: dark` 与 CSS 变量切换暗色质感。
4. **单击复制与 Option 定界符包裹**：鼠标悬停块级公式显示 `📋 复制 LaTeX` 角标（行内公式保留提示 tooltip），单击复制纯 LaTeX 源码，按住 `Option (⌥)` 单击自动包裹 `$ ... $` 或 `$$ ... $$`。
5. **选区 `Cmd + C` 智能还原**：划选正文、公式、列表与表格内容复制时，将公式还原为 Markdown LaTeX 源码并严格保留段落换行与表格列分隔。
6. **Trusted Types 安全与 Shadow DOM 穿透**：纯 DOM API（`replaceChildren()`，零 `innerHTML`），完整穿透 Shadow DOM 并支持可卸载的 `window.__VOYAGER_LATEX_DISPOSE__()` 生命周期。

---

## 安装与使用（Node.js >= 22，零外部依赖）

### 方式一：命令行管理（推荐）

```bash
# 安装并启用插件（无需 sudo）
node manage.mjs install

# 查看当前状态、调试端口与宿主检测
node manage.mjs status

# 热停用 / 热启用（无需重启客户端）
node manage.mjs disable
node manage.mjs enable

# 卸载插件（不触碰 app.asar）
node manage.mjs uninstall
```

### 方式二：双击脚本（macOS）

- 双击 `双击安装公式增强.command` 完成用户态安装；
- 双击 `双击卸载还原.command` 完成用户态卸载。

> **关于 Antigravity 2.33.0+ 调试端口**：
> 2.33.0+ 默认关闭远程调试端口，需带 `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` 启动客户端（例如使用 `antigravity-pulse` 管理的 `~/Applications/Antigravity (Debug).app`）。若 `DevToolsActivePort` 缺失，`node manage.mjs status` 与侧边栏面板会给出明确诊断提示，本插件不会擅自杀端或重启您的客户端。

> **关于旧版（v2.x）`app.asar` 注入清理**：
> 若之前安装过旧版 `app.asar` 补丁，安装新版时会主动拦截并提示还原。请先完全退出 Antigravity 并运行 `sudo node legacy/voyager_engine.js uninstall`（或覆盖安装官方客户端）恢复纯净应用后再安装 v3.0.0。

---

## 本地测试

```bash
npm test
```

测试套件涵盖：
- `tests/test_payload.js`：31 项核心排版、Shadow DOM、点击复制、选区还原与注入安全测试
- `tests/test_dispose_tt.js`：Trusted Types 零 `innerHTML`、热重载版本校验、`dispose()` 全量清理与 Round 2 边界测试
- `tests/test_runtime_cdp.js`：CDP target 过滤、宿主/预览页隔离、Mock WebSocket 注入/停用/缺失端口诊断与 `SidecarOwner` 仲裁测试
- `tests/test_lifecycle.js`：沙箱 `HOME` 安装/启停/卸载/共享 `DevToolsActivePort` 检测与旧版 `app.asar` 阻断测试
- `tests/test_engine.js`：旧版 `legacy/voyager_engine.js` 归档契约测试（存在 `@electron/asar` 时自动运行）
