# 更新日志 (Changelog)

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/) 语义化版本规范。

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
