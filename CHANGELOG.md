# 更新日志 (Changelog)

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/) 语义化版本规范。

---

## [3.0.0] - 2026-11-20

### 🚀 架构重构：无侵入用户态 Sidecar + 本地 CDP 动态注入
- **彻底告别 `app.asar` 修改与重签名**：
  - 迁移至 `~/.gemini/config/plugins/antigravity-latex-enhancer/` 用户态 Sidecar 插件架构，完全保留 `/Applications/Antigravity.app` 官方签名与 `app.asar` 完整性，不再需要 `sudo`，不再被客户端自动更新覆盖；
  - 复用共享 `<profile>/DevToolsActivePort` 进行轻量级本地 CDP 注入（精确过滤 Antigravity 主 `page` target，不注入第三方本地预览页），不实现自动杀端重启，与 `antigravity-pulse`（`Antigravity (Debug).app`）零冲突协同工作。
- **零外部依赖生命周期管理（`manage.mjs`）**：
  - 提供 `install / uninstall / enable / disable / status` 全套纯 Node.js ESM 管理命令及免 `sudo` 双击 `.command` 脚本；
  - 支持热启停与自动检测旧版 `app.asar` 注入残留；原 `voyager_engine.js` 归档至 `legacy/voyager_engine.js`。
- **前端 Payload（`payload/voyager-latex.js`）全面升级**：
  - 新增版本校验与 `window.__VOYAGER_LATEX_DISPOSE__()` 完整清理生命周期（样式、ShadowRoot 观察器、`rAF`/定时器、事件监听全量回收）；
  - 彻底消除 `innerHTML` 用法（改用 `replaceChildren()`），完整兼容 Trusted Types；
  - 修复超宽公式 `inline-block` vs `inline-flex` CSS 冲突，新增浅色/深色主题与宿主 CSS 变量自适应；
  - 升级为增量子树扫描、实时重读最新 `annotation`、表格单元格制表符分隔复制与双向堆叠间距检测。

---

## [2.3.1] - 2026-10-18

### 🐛 缺陷修复与自愈消肿阈值放行 (Patch)
- **修复归档体积异常校验误判 (自愈消肿放行)**：
  - 修复从早期版本（缺失 `asarUnpack` 规则导致 18MB 虚胖包）迁移自愈时，因外部 347 项依赖被成功剥离至 `app.asar.unpacked/`，导致新归档体积健康回落至 4.8MB 时触发 `origSize * 0.3` 保护误报并中止安装的问题；
  - 明确区隔“契约自愈消肿”与“异常截断损坏”，在启用 `unpackPattern` 时放行正常体积回落，并打印友好日志 `[消肿]`；
  - 补充 `tests/test_engine.js` 中的 `E12` 虚胖归档自愈收缩专项回归测试。

---

## [2.3.0] - 2026-10-18

### 🛡️ 工业级系统工程与红队安全加固 (Hardened Architecture)
- **保留 asarUnpack 契约与自动自愈 (H1 根治)**：
  - 自动解析原 asar 头部 JSON，无损保留官方 `node_modules/chrome-devtools-mcp` 等外部解包契约，打包后断言校验；
  - 归档体积恢复到正常的 ~4.5MB（消除打包导致膨胀至 18MB 的体积冗余），确保 DevTools MCP 外部二进制进程正常加载与唤起；
  - 针对历史版本已被扁平化解包的应用，增加从官方原始备份 `app.asar.bak` 或磁盘残留目录自动提取契约的自愈机制。
- **本地锁定依赖与零提权远程网络 (C1 & M3 根治)**：
  - 安装器内置锁定依赖，彻底废除在 root 提权状态下运行未经版本锁定的远程 `npx @electron/asar`；
  - 真正实现安装阶段与运行阶段 **100% 离线、0 外部网络请求**；
  - 脚本自动检测并修复历史版本在 `~/.npm` 遗留的 root 属主权限污染。
- **同目录原子替换与错误熔断回滚 (H2 & M5 根治)**：
  - 采用同物理分区临时文件 + `fsyncSync` + `renameSync` 原子写入机制，杜绝断电或异常导致的半截文件损坏；
  - 建立严格的错误熔断机制：若 Info.plist 完整性校验同步失败或 `codesign` 失败，立即自动从冷备回滚并以 exit 非 0 退出，绝不误报成功。
- **冷备元数据双文件同事务刷新 (H3 根治)**：
  - `app.asar` 与 `Info.plist` 冷备双文件同事务写入，并生成包含应用版本与 SHA-256 的元数据文件；
  - 跨版本升级后兜底恢复自动检测版本变更，杜绝将旧版本 Info.plist 覆盖到新版应用。
- **卸载前纯净状态自检 (M7 根治)**：
  - 卸载前优先无损检测 `dist/preload.js` 是否包含 Voyager 标记，未安装状态直接退出，避免无谓重打包与签名替换。
- **超宽公式 CSS 居中与滚动容器解耦 (M6 根治)**：
  - 重构 `.katex-display` 布局模型，以 block 容器承载 `overflow-x: auto`，内层 inline-block 居中，彻底根治 Chromium 下 `justify-content: center` 导致的超宽公式左侧被推入负坐标截断且无法向左滚动的 Bug。
- **选区 Cmd+C 复制严格保留段落换行 (M1 根治)**：
  - 递归遍历 DOM 树序列化文本，对 `<p>`、`<div>`、`<li>`、`<br>`、`<tr>` 显式注入换行，在完美还原公式的同时，彻底消除段落与列表文字粘连。
- **点击捕获白名单放行 (M2 根治)**：
  - 放行可编辑区（`contenteditable`）、输入控件、超链接公式与功能按钮，不再调用 `stopPropagation()`，保障宿主事件链路畅通。
- **全量自动化测试套件与 CI (63 项全绿)**：
  - 内置 31 项 Payload 行为测试与 32 项 Engine 事务测试；
  - 新增 GitHub Actions 持续集成工作流（Node 22 / Node 24 矩阵）。

---

## [2.2.0] - 2026-10-17

### 🚀 核心排版与防挤压重构 (Anti-Crowding & Elastic Spacing)
- **相邻块级公式强力弹开引擎 (Adjacent Math Repulsion)**：
  - 新增 `.katex-display + .katex-display` 与 `.voyager-math-stacked` 样式规则，当大模型连续多行输出 `$$` 独立公式而未留空行时，在渲染层物理打破浏览器的外边距合并（Margin Collapse），强制施加 **28px 超大呼吸间距**，彻底杜绝多公式纵向挤压碰撞。
- **正文段落双向弹性安全区 (Prose-Math Barrier)**：
  - 为 `<p>` 段落与公式交界处注入 **20px 弹性隔离盾**，防止密集推导时正文文字与公式“贴脸”。
- **行内复杂公式防爆防刮擦 (Inline Strut Shield)**：
  - 为行内公式（`:not(.katex-display) > .katex`）注入微间距缓冲与 `line-height: normal`，防止包含微商、相量点、上下标的长符号刮擦上下行正文。
- **DOM 级智能堆叠公式探测器**：
  - 在 JavaScript 注入层增加对紧邻前后兄弟公式节点的智能感知，自动挂载 `.voyager-math-stacked` 弹性标记，实现 CSS 与 JS 的双重保障。
- **矩阵与多行对齐外边距加固**：
  - 将 `.katex .mtable` 垂直外边距由 4px 提升至 6px，配合 `\jot` 机制进一步提升多行对齐时的纵向舒展度。

---

## [2.1.0] - 2026-10-15

### 🎨 界面与美学升级 (Claude Minimalist Edition)
- **全面适配 Claude 极简暖色美学**：
  - 采用 `#FAF5EE`（温润象牙暖白纸面）、`#141413`（深炭灰文字）与 `#D97757`（Anthropic Claude 标志性 Terracotta 陶土橙）；
  - 常态下无论块级还是行内公式，均彻底去除灰色边框与背景色，完美融入正文阅读排版；
  - 悬停提示角标重构为极简纸质微标，彻底移除原生 macOS 灰色气泡重叠干扰；
  - 复制成功 Toast 重构为暖白纸面与陶土橙点缀卡片，取代旧版黑底蓝字控制台样式。

### 🐛 核心渲染与对齐修复
- **Chromium MathML 布局偏移消除**：
  - 深入排查 KaTeX 在 Electron 内核下的几何占位机理，对 `<span class="katex-mathml">` 实施绝对定位裁剪与文档流剥离，彻底根治块级公式居中向右偏离 320px 的严重 Bug，达成 100% 水平正中居中。

### 🛡️ 架构与安全加固
- **Shadow DOM 穿透**：引入 `e.composedPath()` 跨越组件边界寻址，解决点击事件重定向丢失上下文的问题。
- **macOS 重签名与完整性闭环**：原子打包临时 `.asar`，同步更新 `Contents/Info.plist` 中的 `ElectronAsarIntegrity` 校验哈希，自动调用 Ad-hoc `codesign` 重新签名。
- **与中文汉化补丁无缝共存**：独立注释块注入，双向解耦，支持随开随关与一键还原。

---

## [1.0.0] - 2026-10-15

### 🎉 初始发布
- 实现针对 Antigravity 2.x `app.asar` 封装架构的代码级注入引擎。
- 支持块级与行内 KaTeX 公式一键复制纯 LaTeX 源码及带 `$$...$$` 定界符代码。
- 支持选区 `Cmd + C` 智能拦截，将公式无缝还原为 Markdown 源码。
- 提供 macOS 下的「双击安装」与「双击卸载还原」免终端脚本。
