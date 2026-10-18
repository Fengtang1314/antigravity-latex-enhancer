<div align="center">

<img src="./assets/banner.svg" alt="Antigravity LaTeX Enhancer Banner" width="100%"/>

<br/>

[![Latest Release](https://img.shields.io/github/v/release/Fengtang1314/antigravity-latex-enhancer?style=for-the-badge&logo=github&color=D97757&label=📦%20下载最新%20Release%20安装包)](https://github.com/Fengtang1314/antigravity-latex-enhancer/releases/latest)

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-D97757.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20(Intel%20%7C%20Apple%20Silicon)-141413.svg?style=flat-square)](#)
[![Antigravity](https://img.shields.io/badge/Antigravity-v2.x%20Ready-FAF5EE.svg?style=flat-square&logoColor=141413)](#)
[![Style](https://img.shields.io/badge/Style-Claude%20Minimalist%20Warmth-D97757.svg?style=flat-square)](#)
[![Security](https://img.shields.io/badge/Security-0%20Network%20%7C%20100%25%20Local-27ae60.svg?style=flat-square)](#)
[![Tests](https://img.shields.io/badge/Tests-63%20Passed%20%7C%20100%25-brightgreen.svg?style=flat-square)](#)

<p align="center">
  <b>专为 Google Antigravity 2.x (macOS) 打造的 LaTeX 公式美化与一键复制增强插件</b><br/>
  <i>彻底告别公式右偏与复制乱码 · 赋予 Claude 极简暖色美学 · 工业级事务回滚与契约保护</i>
</p>

[📥 极速下载与安装](#-极速下载与安装新手友好) •
[🌟 核心特性](#-核心功能亮点) •
[⚡ 效果对比](#-效果对比) •
[🛡️ 架构与安全闭环](#️-架构与安全闭环) •
[❓ 常见问题 (FAQ)](#-常见问题排坑-faq) •
[🤝 致谢与开源协议](#-致谢与声明-acknowledgements)

</div>

---

### 🤔 你是否也在 Antigravity 中遇到过这些抓狂瞬间？

* ❌ **公式严重偏右**：公式明明写了居中，渲染出来却莫名其妙偏向屏幕右侧一大截，左边空出一大片？
* ❌ **复制全成乱码**：大模型推导出漂亮的公式，用鼠标划选复制出来却是一堆碎字符、缺失符号与重影，甚至整段文字粘成一行？
* ❌ **多行堆叠太挤**：分式、求和号和大括号挤压在一起，上下行紧贴碰撞，缺乏视觉呼吸感？
* ❌ **超宽公式截断**：矩阵或长推导超出屏幕宽度时，左侧被切掉且横向滚动条无法滑动回开头？

👉 **本项目专为解决上述痛点而生**：
* 📐 **100% 水平正中居中**：彻底屏蔽 Chromium MathML 占位，解耦居中与横向滚动容器，超宽公式安全居中且支持从开头完整滚动；
* 📋 **鼠标悬浮一键复制**：轻移鼠标淡出微标，**单击直接复制纯 LaTeX 源码**，按住 `Option (⌥)` 自动智能补齐 `$$` 定界符；
* 📝 **选区复制结构保留**：划选包含多段文字、公式与列表的内容复制时，公式自动还原为 Markdown TeX，且严格保留段落换行与列表结构；
* 🎨 **Claude 极简暖色美学**：平时完全透明零多余线框，悬停才轻柔浮现 `#FAF5EE` 暖白纸面质感；
* 🛡️ **工业级工程闭环 (v2.3.0 重构)**：内置依赖 0 网络拉取、Electron `asarUnpack` 契约无损保留、同目录原子替换与失败自动熔断回滚。

---

## 📥 极速下载与安装（新手友好）

### ⚙️ 前置运行环境
* **操作系统**：macOS 11.0 或更高版本（原生适配 Apple Silicon M1/M2/M3/M4 系列及 Intel 芯片）
* **客户端版本**：Google Antigravity 2.x
* **Node.js 环境**：需要 Node.js (推荐 LTS v22 或更高版本，若电脑尚未安装，可前往 [nodejs.org](https://nodejs.org) 下载安装)

---

### 🚀 安装步骤

普通用户无需执行繁琐的手动命令，跟随以下步骤即可完成：

#### 步骤 1：下载安装包
前往仓库右侧的 **[Releases 发行版页面](https://github.com/Fengtang1314/antigravity-latex-enhancer/releases/latest)**，下载预打包好的 **`antigravity-latex-enhancer-v2.3.1.zip`**，解压为一个文件夹。

> 💡 **开发者方式**：也可以克隆本仓库并在本地执行测试：
> ```bash
> git clone https://github.com/Fengtang1314/antigravity-latex-enhancer.git
> cd antigravity-latex-enhancer
> npm install
> npm test
> ```

#### 步骤 2：一键自动安装
1. 按键盘快捷键 `Cmd + Q` **完全退出 Antigravity 客户端**；
2. 在解压出来的文件夹中，**双击运行 `双击安装公式增强.command`**；
3. 系统会弹出终端提示输入电脑开机密码（由于修改 `/Applications` 系统应用目录需要管理员权限，输入密码时屏幕不显示字符，直接回车即可）；
4. 终端提示 `🎉 安装成功！` 后，按任意键关闭终端窗口。

> ⚠️ **macOS 安全提示与放行说明**：
> 从 GitHub 下载的压缩包解压后，macOS Gatekeeper 可能会弹出 *“无法打开，因为无法验证开发者”* 的提示。这是 macOS 对网络下载脚本的默认机制：
> * **放行方式**：**右键点击** `双击安装公式增强.command`，在右键菜单中选择 **“打开”**，然后在弹出的对话框中确认点击 **“打开”** 即可正常运行。

#### 步骤 3：重启尽享丝滑体验
重新打开 Antigravity，所有的公式排版优化与一键复制功能已全自动生效！

---

## 🌟 核心功能亮点

### 功能一：LaTeX 公式排版深度优化与美化
* **彻底根治公式居中向右偏移与超宽截断**：
  KaTeX 在 Electron/Chromium 下渲染时，其内部的 `<span class="katex-mathml">` 会霸占左侧约 320px 宽度导致公式右偏。本插件对其施加排版流裁剪，并重构了排版容器：以 Block 容器作为滚动载体，内层 inline-block 居中对齐，达成 **100% 正中居中**，同时在遇到超宽矩阵或长推导时，横向滚动条从 0 坐标开始，**彻底杜绝左侧内容被截断且无法滚动的 Bug**。
* **Claude 极简人文纸面美学 (Minimalist Warmth)**：
  * **底色系统**：对齐 Claude 暖白纸面配色体系（`#FAF5EE` 纸面底色、`#141413` 炭灰文字、`#D97757` 标志性陶土橙）；
  * **常态零打扰**：无论是行内符号还是独立公式块，平时**完全透明、零边框、零底色**，纯净优雅；
  * **悬停微反馈**：鼠标移上公式时，才轻柔淡出温润微底色与陶土橙细致边框；
  * **屏蔽原生灰色气泡**：去除浏览器原生系统的灰底 Tooltip 气泡，视觉纯粹干净。

### 功能二：一键公式提取与 Markdown 复制增强
* **单击一键提取 TeX 源码**：
  鼠标悬停在公式上浮现 `📋 复制 LaTeX` 微标，**轻轻单击**即可将纯 LaTeX 源码复制到剪贴板，右下角弹出 Claude 暖色微 Toast 提示。
* **按住 Option (⌥) 单击：智能定界符包裹**：
  按住 `Option (Alt)` 点击公式，自动智能包装好 `$$...$$`（块级）或 `$...$`（行内），方便直接粘贴进 Markdown 笔记。
* **交互白名单保护**：
  输入框、可编辑区（`contenteditable`）、超链接公式和功能按钮享受原生事件放行，不阻断光标定位与链接跳转。
* **选区 Cmd+C 智能拦截还原 (v2.3.0 重构)**：
  鼠标大面积划选包含正文段落、公式和列表的多段回答按 `Cmd + C` 时，递归遍历 DOM 树，在还原公式为 Markdown 源码的同时，**严格保留段落物理换行与列表层级，彻底消除文字粘连**。

### 功能三：智能弹性防挤压引擎
* **相邻堆叠公式强力弹开 (Adjacent Math Repulsion)**：
  大模型在长篇学术推导中连续输出多个 `$$` 独立公式而未敲空行时，在渲染层打破浏览器的外边距合并（Margin Collapse），强制施加 **28px 超大呼吸间距**，彻底杜绝连续公式纵向挤压碰撞。
* **正文与公式弹性隔离盾 (Prose-Math Barrier)**：
  在段落 `<p>` 与公式交界处注入 **20px 缓冲安全区**，防止密集推导时正文文字与公式贴脸。

---

## 🛡️ 架构与安全闭环 (v2.3.0 工业级加固)

在 v2.3.0 / v2.3.1 版本中，本项目接受了严格的对抗性红队安全审查（详见 [安全审计完整归档](docs/audit/ADVERSARIAL-REVIEW.md) 与 [交接提示词](docs/audit/HANDOFF-PROMPT.md)），全面重构了底层引擎：

```
[预检阶段] ──> 运行中应用检测 (防止文件截断) + 纯净状态自检 (未安装卸载 no-op)
      │
[解包阶段] ──> 本地内置 asar API 提取 (0 远程网络，锁定依赖) + 自动解析 asarUnpack 契约
      │
[备份阶段] ──> app.asar 与 Info.plist 同事务刷新冷备 + 写入版本与 SHA-256 元数据
      │
[打包阶段] ──> 注入 unpackDir 规则 + 头部契约断言校验 (严防外部二进制丢失)
      │
[部署阶段] ──> 同目录临时文件 + fsync 落盘 + renameSync 毫秒级原子替换
      │
[验签阶段] ──> Info.plist 完整性哈希同步 + ad-hoc 重新签名 + codesign strict 校验
      │
[熔断保护] ──> 任何环节异常立即触发全自动回滚，恢复纯净备份，绝不留下损坏应用
```

1. **依赖内置与零提权网络 (C1 & M3 根治)**：
   发布包内置生产依赖，安装与运行阶段 **100% 离线、0 远程网络调用**，彻底杜绝在 root 提权状态下拉取远程 npm 包；脚本自动自愈由旧版遗留的 `~/.npm` 缓存属主。
2. **保留 asarUnpack 契约 (H1 根治)**：
   自动读取原包头部 JSON，精确保留官方 `node_modules/chrome-devtools-mcp` 等外部解包契约，打包后断言校验，重包后归档体积恢复到正常的 ~4.5MB（不再虚胖至 18MB），确保 DevTools MCP 进程可正常唤起。
3. **同目录原子替换与故障熔断 (H2 & M5 根治)**：
   采用同分区 `fsync` + `renameSync` 原子操作；一旦哈希同步或重签名校验未通过，立即触发事务回滚机制，自动从冷备还原，绝不以 exit 0 误报成功。
4. **版本保护与卸载自检 (H3 & M7 根治)**：
   冷备记录版本元数据，跨版本更新后兜底卸载不覆盖过期 plist；纯净应用运行卸载脚本自动跳过重打包。
5. **完整的自动化测试矩阵**：
   仓库内置 63 项自动化回归测试（31 项 Payload 行为测试 + 32 项 Engine 事务与契约测试），并在 GitHub Actions 中对 macOS 环境（Node 22 / Node 24）配置了持续集成。

---

## ⚡ 效果对比

| 体验维度 | Antigravity 原版原生状态 | **安装本增强插件后 (v2.3.0)** |
| :--- | :--- | :--- |
| **公式居中对齐** | Chromium MathML 占位，**公式整体向右严重偏离** | **裁剪 MathML 占位，Block/Inline 容器解耦，100% 正中居中** |
| **超宽公式展示** | 宽度过大时左侧推入负坐标被裁切，无法向左滚动 | **容器横向滚动条从 0 开始，完整浏览超宽公式无裁切** |
| **一键复制 TeX** | ❌ 无法复制，右键无响应 | **✅ 鼠标悬停淡出微标，单击直接复制纯 LaTeX 源码** |
| **定界符智能包裹** | ❌ 需手动打字补充 `$$...$$` | **✅ 按住 Option (⌥) 单击公式，自动携带定界符复制** |
| **选区 Cmd+C 复制** | 复制出 KaTeX 内部重影字符，段落粘连 | **智能还原为标准 Markdown，严格保留段落换行与列表层级** |
| **底层打包契约** | 原版包含 347 个外部 unpacked 文件 | **完美保留 asarUnpack 契约，与官方保持一致** |
| **中文汉化共存** | 修改经常导致汉化丢失或客户端损坏 | **物理级解耦，与任何中文汉化补丁 100% 独立稳定共存** |

---

## 🔄 一键卸载与签名说明

如果任何时候你不再需要本插件，或者想恢复至安装前的状态：
1. 完全退出 Antigravity 客户端；
2. 双击解压文件夹中的 **`双击卸载还原.command`**；
3. 引擎将执行代码级精准剔除并还原归档与完整性校验。

> ℹ️ **关于 macOS 代码签名的客观说明**：
> - 本插件通过 macOS 本地 ad-hoc 签名与 `ElectronAsarIntegrity` 校验同步，保证了客户端在日常个人开发与使用中免弹窗平稳运行；
> - 由于修改了客户端内部的资源文件，Google 官方的 Developer ID 商业签名与公证证书链无法通过本地脚本无密钥凭空还原；
> - 若你的电脑处于严格的企业 MDM 资产管理环境且强制要求 Google 官方公钥签名，仅需重新下载官方 DMG 拖拽覆盖安装即可恢复原始签名。

---

## ❓ 常见问题排坑 (FAQ)

<details>
<summary><b>Q1: Antigravity 官方后续自动更新了版本，公式插件会失效吗？如何重新激活？</b></summary>

> **解答**：当客户端官方自动更新后，Electron 的 `app.asar` 会被官方新版本覆写。
> 你无需重新下载本插件，只需重新双击运行一次解压包里的 **`双击安装公式增强.command`**，自动化引擎将自动识别新版本并完成热注入与哈希重签，立即恢复公式增强！
</details>

<details>
<summary><b>Q2: 会与社区的 Antigravity 中文汉化补丁冲突吗？</b></summary>

> **解答**：**完全不冲突，100% 独立稳定共存**。
> 本插件采用物理级解耦架构，代码注入在专属隔离沙箱命名空间中，与汉化补丁互不干涉。无论先安装汉化还是先安装公式增强，都不会丢失汉化或造成损坏。
</details>

<details>
<summary><b>Q3: 为什么有时候多行公式内部的上下两行看起来有点挤？该如何排版？</b></summary>

> **解答（排版底层原理解析）**：
> 这是 TeX/KaTeX 排版引擎对多行对齐块（`\begin{aligned}`）的固有特性。TeX 原生多行公式的裸换行符 `\\` 默认间距增量（`\jot`）仅为固定值 $0.25\text{em}$（约 3~4px）。当某一行包含了“超大方括号 + 分母求和号 + 括号外挂下标”这种极端垂直深度时，下标会压低并紧挨着下一行的大写字母。
> 
> **推荐两种排版实践**：
> 1. **独占行展示（强烈推荐）**：含分式、求和号、复杂上下标的公式**一律独占行独立展示（`$$ ... $$`）**，每个公式均拥有独立宽裕的卡片呼吸边距，且可以被单独点击一键复制；
> 2. **显式传入行间距**：如果必须多行等号对齐，在源码换行符后显式加上行距参数（如 `\\[0.8em]` 或 `\\[1.0em]`），强制 TeX 引擎下移基线。
</details>

<details>
<summary><b>Q4: 卸载安全吗？</b></summary>

> **解答**：非常安全。卸载脚本优先执行“解包 -> 剥离注入代码 -> 保留契约重打包”，若遇异常会自动回退至初次安装前建立的独立冷备（`app.asar.before-voyager`），并伴随版本元数据校验，绝不触碰官方原始 `app.asar.bak`。
</details>

---

## 🤝 致谢与声明 (Acknowledgements)

本项目在诞生过程中，深受开源社区先驱项目的启发：
* **[Gemini Voyager]**：感谢其在网页端开创的极简公式复制交互范式。
* **[016/Antigravity-Better]**：感谢其在早期版本样式探索上的先驱贡献。
* **[antigravity2汉化] 社区**：感谢汉化生态为 macOS 用户提供的卓越本地化支持。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 协议开源。
