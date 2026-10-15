<div align="center">

<img src="./assets/banner.svg" alt="Antigravity Voyager LaTeX Banner" width="100%"/>

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-D97757.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20(Intel%20%7C%20Apple%20Silicon)-141413.svg?style=flat-square)](#)
[![Antigravity](https://img.shields.io/badge/Antigravity-v2.x%20Ready-FAF5EE.svg?style=flat-square&logoColor=141413)](#)
[![Style](https://img.shields.io/badge/Style-Claude%20Minimalist%20Warmth-D97757.svg?style=flat-square)](#)
[![Security](https://img.shields.io/badge/Security-0%20Network%20%7C%20100%25%20Local-27ae60.svg?style=flat-square)](#)

<p align="center">
  <b>专为 Google Antigravity 2.x (macOS) 定制的轻量级 KaTeX 公式排版美化与一键复制增强插件</b><br/>
  <i>告别凌乱重影与右偏顽疾 · 对齐 Claude 极简暖色美学 · 完美兼容中文汉化</i>
</p>

[✨ 核心功能](#-核心功能) •
[⚡ 效果对比](#-效果对比) •
[🚀 极速上手](#-极速上手) •
[🛡️ 架构与安全](#️-架构与安全闭环) •
[🤝 致谢与声明](#-致谢与声明-acknowledgements)

</div>

---

## ⚡ 效果对比

| 体验维度 | Antigravity 原版原生状态 | **安装 Voyager LaTeX 增强后** |
| :--- | :--- | :--- |
| **公式排版对齐** | Chromium MathML 占据左侧宽度，**公式整体向右严重偏离** | **裁剪 MathML 占位，Flexbox 绝对居中，100% 正中优雅呈现** |
| **视觉呈现质感** | 缺少呼吸感，深浅色对比突兀或僵硬 | **Claude 暖色极简纸面美学（`#FAF5EE` / `#141413` / `#D97757`），常态零边框零底色** |
| **一键复制 TeX** | ❌ 无法复制，右键无响应 | **✅ 鼠标悬停淡出微标，单击直接复制纯 LaTeX 源码** |
| **定界符智能包裹** | ❌ 需手动补充 `$$...$$` | **✅ 按住 Option (⌥) 单击公式，自动携带定界符复制** |
| **选区 Cmd+C 复制** | 复制出 KaTeX 内部重影字符与杂乱文本 | **智能拦截还原为标准的 Markdown 源码（如 `$x$` 与 `$$...$$`）** |
| **中文汉化共存** | 修改经常导致汉化丢失或客户端损坏 | **物理级解耦，与任何中文汉化补丁 100% 独立稳定共存** |

---

## 🌟 核心功能

### 1. Claude 极简人文美学 (Minimalist Warmth)
- **纸面基调**：针对追求专注阅读的研究者与开发者，全面对齐 Claude 暖白纸面配色体系（`#FAF5EE` 背景、`#141413` 炭灰文字、`#D97757` 陶土橙强调色）。
- **常态零打扰**：正文中的行内公式与段落间的独立块级公式，在未交互状态下保持**100% 纯净透明、零灰色边框、零底色**，完美融入自然行文流。
- **悬停微反馈**：鼠标移入公式时，极轻柔淡出温润微底色与陶土橙细致边框，右上角浮现极简纸质微标 `📋 复制 LaTeX`；点击即瞬间绿色闪烁反馈并弹出暖色微 Toast。
- **杜绝系统原生灰色气泡**：彻底屏蔽浏览器原生的 `title` 灰色气泡重叠，还视觉一份清爽。

### 2. 彻底根治 Chromium MathML 布局偏移
- KaTeX 渲染时内含 `<span class="katex-mathml">` 语义层，在 Electron 内核下会意外霸占左侧 ~320px 宽度，导致可见公式整体向右漂移。
- 本插件对其施加绝对定位与视口裁剪，释放全部排版空间，彻底实现视口内的**绝对几何居中**。

### 3. 一键提取与智能 Markdown 选区还原
- **单击公式**：直接提取底层 `annotation`、`alttext`、`data-latex` 等原始源文本写入剪贴板。
- **Option (⌥) + 单击**：智能判断行内/块级，分别补齐 `$...$` 或 `$$...$$` 包装。
- **Cmd+C 选区拦截**：用鼠标大面积划选回答文本并复制时，静默穿透 DOM 并把其中的 KaTeX 节点还原为 Markdown 纯文本。

### 4. 完美兼容 Antigravity 2.x 全量 ASAR 架构
- 自动适配 Antigravity 2.0+ 将全部资源封入 `app.asar` 的架构变动。
- 注入点位于 `dist/preload.js` 独立闭环注释块内，不碰触任何业务源码与汉化词典。

---

## 📂 项目结构

```text
antigravity-voyager-latex/
├── assets/
│   └── banner.svg             # 项目官方宣传 Banner
├── 双击安装公式增强.command      # macOS 一键安装脚本（自动提权 + 进程防锁 + 自动重签）
├── 双击卸载还原.command         # macOS 一键卸载脚本（精准回滚至安装前纯净状态）
├── voyager_engine.js           # 适配 Antigravity 2.x 的 ASAR 解包/注入/打包/重签引擎
├── payload/
│   └── voyager-latex.js        # 前端核心交互逻辑（DOM 穿透监听、Claude 样式与 Toast）
├── CHANGELOG.md                # 版本演进日志
├── CONTRIBUTING.md             # 社区贡献指南
├── LICENSE                     # MIT 开源许可证
└── README.md                   # 项目说明文档
```

---

## 🚀 极速上手

### 1. 一键安装
1. 按 `Cmd + Q` 完全退出 Antigravity 客户端。
2. 在访达（Finder）中打开本项目文件夹，**双击运行 `双击安装公式增强.command`**。
3. 终端会提示输入开机密码以授予修改应用目录权限（输入时密码不显示，直接回车）。
4. 提示安装成功后，重新启动 Antigravity 即可尽享丝滑公式交互！

### 2. 一键卸载还原
1. 完全退出 Antigravity 客户端。
2. 双击运行 **`双击卸载还原.command`**。
3. 应用将通过冷备或代码级正则清洗，1 秒内无损恢复至安装前的纯净状态。

---

## 🛡️ 架构与安全闭环

* **纯本地零网络（Zero Network Call）**：代码不含任何 `fetch`、`XMLHttpRequest` 或网络模块，0 远程交互，0 Telemetry 跟踪。
* **零账号与 Token 风控风险**：纯前端 DOM 层样式装饰与剪贴板增强，完全不碰模型推理、通信 RPC 或身份验证头。
* **macOS 签名自愈**：自动化引擎在打包后自动更新 `Contents/Info.plist` 中的 `ElectronAsarIntegrity` 头部校验哈希，并调用原生 `codesign --force --deep --sign -` 重新签名与清理系统隔离标记，彻底杜绝系统“应用已损坏”弹窗。

---

## 🤝 致谢与声明 (Acknowledgements)

本项目在诞生过程中，深受开源社区先驱项目的启发：
* **[Gemini Voyager]**：感谢其在网页端开创的极简公式复制交互范式。
* **[016/Antigravity-Better]**：感谢其在早期版本样式探索上的先驱贡献。
* **[antigravity2汉化] 社区**：感谢汉化生态为 macOS 用户提供的卓越本地化支持。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 协议开源。
