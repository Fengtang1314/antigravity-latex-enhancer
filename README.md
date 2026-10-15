<div align="center">

<img src="./assets/banner.svg" alt="Antigravity Voyager LaTeX Banner" width="100%"/>

<br/>

[![Latest Release](https://img.shields.io/github/v/release/Fengtang1314/antigravity-voyager-latex?style=for-the-badge&logo=github&color=D97757&label=📦%20下载最新%20Release%20安装包)](https://github.com/Fengtang1314/antigravity-voyager-latex/releases/latest)

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-D97757.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20(Intel%20%7C%20Apple%20Silicon)-141413.svg?style=flat-square)](#)
[![Antigravity](https://img.shields.io/badge/Antigravity-v2.x%20Ready-FAF5EE.svg?style=flat-square&logoColor=141413)](#)
[![Style](https://img.shields.io/badge/Style-Claude%20Minimalist%20Warmth-D97757.svg?style=flat-square)](#)
[![Security](https://img.shields.io/badge/Security-0%20Network%20%7C%20100%25%20Local-27ae60.svg?style=flat-square)](#)

<p align="center">
  <b>专为 Google Antigravity 2.x (macOS) 定制的轻量级 KaTeX 公式排版美化与一键复制增强插件</b><br/>
  <i>彻底告别公式右偏与复制重影 · 对齐 Claude 极简暖色美学 · 完美兼容中文汉化</i>
</p>

[📥 下载与安装](#-极速下载与安装) •
[✨ 两大核心功能](#-两大核心功能) •
[⚡ 效果对比](#-效果对比) •
[🛡️ 架构与安全](#️-架构与安全闭环) •
[🤝 致谢与声明](#-致谢与声明-acknowledgements)

</div>

---

## 📥 极速下载与安装（新手友好）

普通用户无需打开命令行或终端，跟随以下三步即可轻松搞定：

### 步骤 1：下载安装包
前往仓库右侧的 **[Releases 发行版页面](https://github.com/Fengtang1314/antigravity-voyager-latex/releases/latest)**，下载预打包好的 **`antigravity-voyager-latex-v2.1.0.zip`**，下载后双击解压为一个文件夹。

> 💡 **开发者方式**：也可以直接克隆本仓库：
> ```bash
> git clone https://github.com/Fengtang1314/antigravity-voyager-latex.git
> ```

### 步骤 2：一键自动安装
1. 按键盘快捷键 `Cmd + Q` **完全退出 Antigravity 客户端**；
2. 在解压出来的文件夹中，**双击运行 `双击安装公式增强.command`**；
3. 系统会弹出终端提示输入电脑开机密码以授予应用写入权限（输入时密码不显示，直接回车即可）；
4. 看到提示 `🎉 安装成功！` 后，按任意键关闭终端窗口。

### 步骤 3：重启尽享丝滑体验
重新打开 Antigravity，所有的公式排版优化与一键复制功能已全自动生效！

---

## 🌟 两大核心功能

本项目主要解决两个长期困扰 Antigravity / Electron 用户的高频痛点：

### 功能一：LaTeX 公式排版深度优化与美化
* **彻底根治公式居中向右偏移**：
  KaTeX 在 Electron/Chromium 下渲染时，其内部的 `<span class="katex-mathml">` 语义层会霸占左侧约 320px 的宽度，导致可见公式严重偏向右侧。本插件对其施加绝对定位与排版流裁剪，结合 Flexbox 真正达成 **100% 水平正中居中**。
* **Claude 极简人文纸面美学 (Minimalist Warmth)**：
  * **底色系统**：对齐 Claude 暖白纸面配色体系（`#FAF5EE` 纸面底色、`#141413` 炭灰文字、`#D97757` 标志性陶土橙）；
  * **常态零打扰**：无论是行内符号（如 `$x$`）还是独立公式块，平时**完全透明、零灰色边框、零底色**，像书本正文一样纯净优雅；
  * **悬停微反馈**：鼠标移上公式时，才轻柔淡出温润微底色与陶土橙细致边框；
  * **告别原生灰色气泡**：屏蔽浏览器原生系统的灰底 Tooltip 气泡，视觉纯粹干净。

### 功能二：Voyager 级一键公式提取与 Markdown 复制
* **单击一键提取 TeX 源码**：
  无需费力选中，鼠标悬停在公式上浮现 `📋 复制 LaTeX` 微标，**轻轻单击**即可将纯 LaTeX 源码复制到剪贴板，右下角弹出 Claude 暖色微 Toast 提示。
* **按住 Option (⌥) 单击：智能定界符包裹**：
  需要直接贴进 Markdown 或论文草稿？按住 `Option (Alt)` 点击公式，自动为你智能包装好 `$$...$$`（块级）或 `$...$`（行内）。
* **选区 Cmd+C 智能拦截还原**：
  鼠标大面积划选包含中文字符和公式的整段回答按 `Cmd + C` 时，自动穿透 KaTeX 内部结构，将公式节点无损还原为干净的 Markdown TeX 源码，**彻底告别原生复制产生的重影字符与乱码**。

---

## ⚡ 效果对比

| 体验维度 | Antigravity 原版原生状态 | **安装 Voyager LaTeX 增强后** |
| :--- | :--- | :--- |
| **公式居中对齐** | Chromium MathML 占位，**公式整体向右严重偏离** | **裁剪 MathML 占位，Flexbox 绝对居中，100% 正中优雅呈现** |
| **视觉呈现质感** | 缺少呼吸感，深浅色对比突兀或僵硬 | **Claude 暖色极简纸面美学（`#FAF5EE` / `#141413` / `#D97757`），常态零边框零底色** |
| **一键复制 TeX** | ❌ 无法复制，右键无响应 | **✅ 鼠标悬停淡出微标，单击直接复制纯 LaTeX 源码** |
| **定界符智能包裹** | ❌ 需手动打字补充 `$$...$$` | **✅ 按住 Option (⌥) 单击公式，自动携带定界符复制** |
| **选区 Cmd+C 复制** | 复制出 KaTeX 内部重影字符与杂乱符号 | **智能拦截还原为标准的 Markdown 源码（如 `$x$` 与 `$$...$$`）** |
| **中文汉化共存** | 修改经常导致汉化丢失或客户端损坏 | **物理级解耦，与任何中文汉化补丁 100% 独立稳定共存** |

---

## 🔄 一键卸载与自愈

如果任何时候你不再需要本插件，或者想恢复至安装前的状态：
1. 完全退出 Antigravity 客户端；
2. 双击解压文件夹中的 **`双击卸载还原.command`**；
3. 引擎将调取安装前建立的独立冷备，1 秒内将客户端无痕恢复至初始状态。

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
