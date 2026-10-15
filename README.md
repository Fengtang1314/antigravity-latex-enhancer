# Antigravity Voyager LaTeX 公式增强插件 (macOS)

专为 **Google Antigravity 2.x (macOS)** 定制的轻量级 KaTeX 公式排版美化与一键复制增强插件。

完美兼容现有的**中文汉化补丁**，彻底修复 Chromium 内核下公式居中右偏的渲染顽疾，并全面重构对齐 **Claude 极简暖色美学**。

---

## 🌟 核心特性

1. **Claude 极简人文美学 (Minimalist Warmth)**：
   - **底色方案**：适配 `#FAF5EE`（象牙暖白纸面）、`#141413`（温润深炭灰）与 `#D97757`（Anthropic Claude 标志性 Terracotta 陶土橙）。
   - **常态零干扰**：块级公式与行内公式在常态下均为**完全透明、零灰色边框、零底色**，与正文字体自然流动，保持纯净阅读质感。
   - **悬停微交互**：仅当鼠标移动到公式上时，才轻柔淡出浅米纸色温润微底色，右上角淡入浮现极简微标 `📋 复制 LaTeX`。
   - **极简暖色 Toast**：点击复制后，右下角弹出 Claude 纸面白底与陶土橙点缀的轻量微弹窗，彻底告别突兀的控制台黑框蓝底。

2. **彻底修复 Chromium MathML 居中右偏 Bug**：
   - 深入定位 KaTeX 在 Electron/Chromium 下的 DOM 布局机理，对占据宽度的 `<span class="katex-mathml">` 实施绝对定位裁剪与文档流剥离，结合 Flexbox 真正实现块级公式 **100% 绝对正中居中**。

3. **一键提取与智能 Markdown 选区还原**：
   - **单击公式**：直接将纯 LaTeX 源码复制到剪贴板。
   - **Option (⌥) + 单击公式**：自动携带 `$$...$$`（块级）或 `$...$`（行内）定界符复制。
   - **选区 Cmd+C 智能拦截**：鼠标拖选包含中文字符与公式的一整段回答时，智能还原公式为标准的 Markdown TeX 源码，彻底消除原生 KaTeX 复制产生的文字重影与符号错乱。

4. **与中文汉化 100% 独立共存**：
   - 采用独立注释标记（`/* --- VOYAGER-LATEX-START --- */`）注入 `dist/preload.js`。
   - 与任何第三方中文汉化包物理级解耦，互不干扰、互不污染。

5. **macOS Apple Silicon 签名闭环与原子自愈**：
   - 打包全程在系统临时目录生成并校验，执行原子替换，杜绝应用损坏风险。
   - 自动同步更新 `Contents/Info.plist` 中的 `ElectronAsarIntegrity` 校验哈希，并调用原生 `codesign` 深度重签与清除隔离属性，完全杜绝系统拦截。

---

## 📂 项目结构

```text
antigravity-voyager-latex/
├── 双击安装公式增强.command      # macOS 一键安装入口（自动提权 + 进程防锁 + 自动重签）
├── 双击卸载还原.command         # macOS 一键卸载入口（精准回滚至安装前纯净状态）
├── voyager_engine.js           # 适配 Antigravity 2.x 的 ASAR 解包/注入/打包/重签引擎
├── payload/
│   └── voyager-latex.js        # 前端核心交互逻辑（DOM 穿透监听、Claude 样式与 Toast）
├── LICENSE                     # MIT 开源许可证
└── README.md                   # 项目说明文档
```

---

## 🚀 使用方法

### 1. 一键安装
1. 完全退出 Antigravity 应用程序（`Cmd + Q`）。
2. 在访达（Finder）中双击运行 **`双击安装公式增强.command`**。
3. 终端会提示输入电脑开机密码以获得修改权限（输入时密码不显示，直接回车）。
4. 运行完成后重新启动 Antigravity 即可生效。

### 2. 一键卸载还原
1. 完全退出 Antigravity 应用程序。
2. 双击运行 **`双击卸载还原.command`**。
3. 应用将无痕恢复至安装公式插件前的状态。

---

## 🛡️ 安全与隐私边界

* **纯本地前端交互**：零网络请求（0 Fetch / 0 XHR / 0 RPC），绝不向外发送任何数据。
* **零 Token 触碰**：不拦截、不修改任何用户 API Key、Token 或大模型上下行内容，完全规避账号风控。
* **全流程防御性封装**：所有 DOM 探测均经过 `try...catch` 防御包裹，遇到非标准元素静默降级，确保客户端永远稳定运行。

---

## 🤝 致谢与声明 (Acknowledgements)

本项目在开发与设计过程中，深受以下优秀项目的启发与帮助，特此诚挚致谢：
* **[Gemini Voyager]**：灵感来源于网页端公式一键复制体验。
* **[016/Antigravity-Better]**：感谢其在 Antigravity 早期版本样式注入上的先行探索。
* **[antigravity2汉化] 社区**：感谢汉化生态所提供的 macOS 部署经验与架构参考。

---

## 📄 开源许可证

本项目采用 [MIT License](LICENSE) 开源协议。
