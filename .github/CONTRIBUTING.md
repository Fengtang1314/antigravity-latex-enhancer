# 贡献指南 (Contributing Guide)

感谢你关注本项目！我们非常欢迎社区提出宝贵建议、Bug 反馈或提交 Pull Request。

---

## 🛠️ 本地开发与测试流程

1. **环境准备**：
   - macOS 系统（Intel 或 Apple Silicon M 系列芯片均支持）；
   - Node.js (推荐 LTS 版本 18+)。

2. **目录说明**：
   - `payload/voyager-latex.js`：注入到客户端前端渲染进程的核心逻辑与样式定义；
   - `voyager_engine.js`：ASAR 解包、正则注入、打包与重签名自动化引擎。

3. **代码规范**：
   - 纯前端与纯本地交互：严禁在 `payload/voyager-latex.js` 中引入任何外部网络请求或未经审核的第三方库；
   - 保持防御性封装：所有 DOM 探测逻辑均需保持 `try...catch` 防御包裹；
   - 保护原版汉化：注入标记必须保持 `/* --- VOYAGER-LATEX-START --- */` 与 `/* --- VOYAGER-LATEX-END --- */` 闭环。

---

## 🐛 提交 Issue

若你在使用过程中遇到任何排版异常、复制失效或客户端报错，请提交 Issue 并附上：
1. 你的 macOS 版本与芯片架构（如 macOS Sonoma 14.x, Apple M2）；
2. Antigravity 客户端版本号；
3. 复现问题的 LaTeX 公式文本与屏幕截图。

再次感谢你的支持！
