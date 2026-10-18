# 对抗性审查报告 — Antigravity Voyager LaTeX Enhancer v2.2.0

- **审查日期**：2026-10-18
- **审查对象**：本仓库 `main`（`e07db8e`，v2.2.0）
- **审查环境**：macOS Darwin 27.0.0 / Antigravity 2.24.0 / Node 24.21.0 / npm 11.19.0 / `@electron/asar` 4.3.1 / jsdom 30.1.3
- **审查方式**：源码静态审计 + 真实已安装应用取证 + 49 项引擎行为测试 + 31 项载荷行为测试 + asar 往返实验 + DOM 扫描量插桩
- **审查结论**：功能主路径可用，注入目标与标记/备份设计基本正确；但作为“以 root 修改已签名应用”的安装器，存在**供应链提权级风险**，并且有 **asarUnpack 契约破坏、致命失败仍报成功、跨版本兜底恢复错配、签名不可逆** 等高危缺陷。README 的若干绝对化声明与实测不符。

> 本次审查**未修改**任何仓库源码；测试脚手架全部位于未跟踪目录 `.review-scratch/`。

---

## 1. 严重度总表

| ID | 级别 | 问题 | 状态 |
|---|---|---|---|
| C1 | Critical | 以 root 运行未锁定版本的远程 `npx @electron/asar`；安装包内代码整体以 root 执行 | 已确认（代码与真实环境） |
| C2 | Critical | 未签名/未公证安装器 + README 指导绕过 Gatekeeper + 立即 sudo | 已确认（README 与签名检查） |
| H1 | High | `asar extract → pack` 静默抹掉全部 `unpacked` 条目，破坏 vendor 的 asarUnpack 契约 | 已复现（5 → 0；真实应用 347 → 0） |
| H2 | High | Info.plist 完整性同步失败、codesign 失败均只警告，仍 exit 0 并打印“安装成功” | 已复现（E4/E5） |
| H3 | High | 应用跨版本更新后，兜底卸载会把**旧版 Info.plist** 恢复到新版应用上 | 已复现（E11） |
| H4 | High | `codesign --deep --sign -` + `xattr -cr` 永久丢弃官方签名/entitlements；卸载不会恢复 | 已确认（adhoc、无 entitlements、spctl rejected） |
| M1 | Medium | 选区 Cmd+C 用 `textContent` 拼接，丢失段落/列表/表格/`<br>` 边界 | 已复现（P4） |
| M2 | Medium | 点击劫持：contenteditable 内公式无法放置光标，`\href` 链接无法打开，宿主点击处理器被 `stopPropagation` | 已复现（P3） |
| M3 | Medium | root 运行 npx 污染用户 `~/.npm`（446 个 root 属主条目），导致普通 `npm install` EACCES | 已确认（真实环境） |
| M4 | Medium | 依赖未锁版本；README 写 Node 18+，实际 asar 4.3.1 要求 Node ≥22.12；npx 无超时 | 已确认 |
| M5 | Medium | 替换非原子、无写入后校验、无运行中检测、无失败回滚 | 静态确认（代码路径） |
| M6 | Medium | `justify-content:center` + `overflow-x:auto` 在超宽公式上会裁剪左侧且无法滚动到开头 | 静态高置信（未在真机窄窗验证） |
| M7 | Medium | 未安装插件时卸载仍会完整解包/重包/重签，无谓破坏 vendor 布局与签名 | 已复现（E6） |
| L1–L12 | Low | 原生 title 与文档矛盾、截断标记重复注入、PATH/nvm、aria-label 误判、每次 rAF 全 DOM 扫描、无 CI/校验和/engines、文档计时夸大等 | 详见第 4 节 |

---

## 2. 审查范围与方法

### 2.1 静态审查文件

- [双击安装公式增强.command](双击安装公式增强.command)
- [双击卸载还原.command](双击卸载还原.command)
- [voyager_engine.js](voyager_engine.js)
- [payload/voyager-latex.js](payload/voyager-latex.js)
- [README.md](README.md)、`CHANGELOG.md`
- 真实应用 `Contents/Resources/app.asar`、`app.asar.before-voyager`、官方 `app.asar.bak`、`Info.plist`、`_CodeSignature`

### 2.2 动态测试脚手架（`.review-scratch/`）

- `engine_tests.js` + `engine_case.js`：仅替换 `findAppPath()` 候选路径，并把 `child_process.execSync` 替换为对 `npx @electron/asar`、PlistBuddy、codesign 的模拟；其余 fs/正则/备份逻辑全部使用真实引擎代码。
- `payload_tests.js`：jsdom 中加载真实 payload，覆盖装饰、MutationObserver、点击复制、选区复制、Shadow DOM、注入安全。
- `asar_roundtrip_test.js`：用真实 `@electron/asar` 构造带 `unpackDir` 的 vendor 风格归档，再做与引擎完全相同的 extract → pack。
- `perf_scan.js`：插桩 `querySelectorAll('*')`，统计单次流式变更触发的全文档扫描元素数。

### 2.3 测试限制

- 引擎测试中的 `npx`/`codesign`/`PlistBuddy` 是行为模拟，不是真实调用；真实打包行为由 `asar_roundtrip_test.js` 用**真实 asar 库**覆盖。
- 未启动真实 Antigravity 渲染进程做端到端 UI 测试；DOM 行为用 jsdom 近似，CSS 布局类问题（M6）只能静态判定。
- 未对 Antigravity 官方更新通道、MDM、TCC 数据库做侵入性实验。

---

## 3. 详细发现

### C1（Critical）— 以 root 执行未锁定版本的远程 npm 包

**位置**

- [双击安装公式增强.command:8](双击安装公式增强.command:8)、[:13](双击安装公式增强.command:13)：脚本在 `EUID != 0` 时立即 `exec sudo ...`，之后 [`:29`](双击安装公式增强.command:29) 以 root 运行 `node voyager_engine.js install`。
- [voyager_engine.js:139](voyager_engine.js:139)、[:190](voyager_engine.js:190)、[:233](voyager_engine.js:233)、[:243](voyager_engine.js:243)：四处 `npx -y @electron/asar ...`。

**证据**

- `npx -y` 不带版本号，运行时从 npm registry 解析**最新版**；没有 lockfile、integrity 校验或固定 tarball。
- 当前缓存到的是 `@electron/asar@4.3.1`，其 `engines` 为 `{"node": ">=22.12.0"}`。
- 运行 npx 的是 root 进程（安装器已提权），并且 `HOME` 仍是用户目录（`sudo env` 未改 HOME）。
- 安装器还以 root 直接执行解压目录中的 `node voyager_engine.js`；一个被篡改的 zip（或仿冒仓库）天然等价于 root 代码执行。

**影响**

- npm registry、包维护者账号、CDN、DNS、代理任一环节被攻破，都会在用户机器上以 root 执行任意代码。
- 本地解压目录若带恶意 `node_modules`，也会进入 root 执行路径。
- 这与 README 的 “0 Network / 100% Local” 安全叙事直接冲突：**安装阶段有网络，且以 root 拉取并执行远程代码**。

**建议**

1. 在仓库内固定并校验 asar 依赖版本（例如 vendored `@electron/asar@4.3.1` + `package-lock.json` + `npm ci --ignore-scripts`），安装器只从本地依赖解析可执行文件。
2. 若仍用 npx：固定 `@electron/asar@4.3.1`，使用 `--offline`/`--prefer-offline`，校验包 tarball 的 SHA-512；明确失败而不是静默换版本。
3. 把“下载/解包/打包”降权到 `SUDO_USER` 执行，只有最终写入 `/Applications` 与 `codesign` 用 root。
4. 用 `execFileSync`/`spawnSync` 传参数数组，替代 `execSync` 字符串插值（[voyager_engine.js:28](voyager_engine.js:28)、[:105](voyager_engine.js:105)），避免引号/元字符类问题。
5. 发布签名并公证的安装器（见 C2），并在 README 提供 SHA-256。

---

### C2（Critical）— 未签名/未公证安装器，且指导用户绕过 Gatekeeper

**位置**

- [README.md:75](README.md:75)–[:78](README.md:78)：明确教用户右键“打开”或 `xattr -d com.apple.quarantine *.command`。
- 两个 `.command` 均为未签名 shell 脚本（git mode 100755），运行后立即请求 sudo。

**证据**

- 仓库没有 Developer ID 签名、公证流程、发布校验和；README 的放行指引是标准的 Gatekeeper 绕过话术。
- `.command` 脚本本身无法被 notarize 成可执行代码；当前形态只能依赖用户“信任来源”。

**影响**

- 攻击者只需投放一个同名/相似仓库或篡改 Release zip，就能让用户主动去掉 quarantine 并以 root 运行。
- 即使作者完全可信，GitHub Release/CDN 被攻破时也没有第二道防线。
- 用户被训练成“看到无法验证开发者就右键打开”，这会降低其对其他恶意软件的警惕。

**建议**

- 使用 Developer ID 签名的 `.pkg`（或签名 helper 二进制）分发，完成 notarization + stapling；至少提供发布产物的 SHA-256 并让用户在安装前核对。
- README 删除 `xattr -d com.apple.quarantine` 这种通用绕过指引，改为“只从官方 Release 下载并核对哈希”。
- 若短期无法签名，明确写出威胁模型：“本工具需要 root 且未签名，请自行审计源码后使用”，不要把“0 Network/100% Local”当作安全背书。

---

### H1（High）— `asar extract → pack` 抹掉全部 `unpacked` 条目

**位置**

- [voyager_engine.js:139](voyager_engine.js:139)（extract）、[:190](voyager_engine.js:190)（pack）、[:233](voyager_engine.js:233) / [:243](voyager_engine.js:243)（卸载同样流程）。
- 打包命令没有 `--unpack-dir` 或等价参数。

**证据**

- `asar_roundtrip_test.js` 用真实 `@electron/asar@4.3.1`：构造带 `unpackDir: 'node_modules/chrome-devtools-mcp'` 的归档，原始头部有 **5 个 unpacked 条目**；执行与引擎相同的 `extractAll` + `createPackage` 后，**unpacked 条目变为 0**，文件被放进归档内部。
- 真实应用：官方 `app.asar.bak` 为 4,486,221 字节，头部有 **347 个 unpacked 条目**（全部位于 `node_modules/chrome-devtools-mcp` 下）；当前 `app.asar` 为 18,117,198 字节，unpacked 条目为 **0**；`app.asar.unpacked` 目录仍残留 **347 个文件 / 约 14MB**，成为孤立副本。
- `dist/languageServer.js` 的 `setupNodeModules` 使用 `process.resourcesPath/app.asar.unpacked/node_modules/...` 启动 `chrome-devtools-mcp`。今天这些孤立文件还在，所以功能暂时没坏；一旦官方更新/清理删除该目录，或 Electron 依据头部 `unpacked` 标记解析，就会失败。

**影响**

- 违反 Electron `asarUnpack` 契约：需要真实文件系统路径的二进制/被 spawn 的 JS 被塞回归档。
- 归档体积膨胀（14MB 重复）；未来版本或清理工具删除 `app.asar.unpacked` 后，DevTools MCP 直接不可用。
- 属于“静默数据/布局破坏”，不会在安装时报错。

**建议**

1. 用 `asar.getRawHeader()` 读取原归档，收集所有 `unpacked: true` 的路径；用 API `createPackageWithOptions({ unpackDir: [...] })` 重新打包，保证新头部 unpacked 集合与旧头部一致。
2. 打包后递归比较新旧头部的 `unpacked` 集合和文件列表（允许 `dist/preload.js` 大小变化），不一致则中止。
3. 保留 `app.asar.unpacked` 与之同步；不要删除孤立文件，直到确认新头部仍引用它们。
4. 增加回归测试：至少覆盖一个 `unpackDir` 条目，断言往返后仍为 unpacked。

---

### H2（High）— 致命步骤失败仍 exit 0 并打印“安装成功”

**位置**

- [voyager_engine.js:210](voyager_engine.js:210)：`syncAsarIntegrityToInfoPlist(...)` 返回值被忽略；失败仅 [:92](voyager_engine.js:92) `console.warn`。
- [voyager_engine.js:213](voyager_engine.js:213)：`resignAppOnMac(...)` 返回值被忽略；失败仅 [:107](voyager_engine.js:107) `console.warn`。
- 成功横幅在 [:215](voyager_engine.js:215)–[:218](voyager_engine.js:218) 无条件打印。

**证据（E4/E5）**

- 模拟 `PlistBuddy Set` 失败：进程 **exit 0**，仍打印“🎉 安装成功”。
- 模拟 `codesign` 失败：进程 **exit 0**，仍打印“🎉 安装成功”。

**影响**

- `ElectronAsarIntegrity` 哈希未更新时，Electron 可能拒绝加载 `app.asar`，应用无法启动。
- codesign 失败时，应用处于签名损坏状态，macOS 可能直接拒绝启动。
- 用户被告知成功并关闭终端，没有任何恢复指引；这是最容易被真实用户撞上的“变砖”路径。

**建议**

- 这两步任何一步失败都视为**致命**：立即从 `.before-voyager` 恢复 `app.asar` 与 `Info.plist`，重新签名，exit 非 0，并打印明确的恢复说明。
- 成功横幅前增加验证：
  - `asar.getRawHeader(asarPath)` 能解析且 `dist/preload.js` 存在；
  - preload 中恰好一个 START/END；
  - `node --check dist/preload.js` 通过；
  - `codesign --verify --deep --strict appPath` 通过；
  - `spctl --assess` 结果如实告知（ad-hoc 必然 rejected，不应宣称“彻底杜绝系统弹窗”）。
- 把 `syncAsarIntegrityToInfoPlist` 的返回值纳入流程；字段不存在时也要明确记录，而不是静默返回 false。

---

### H3（High）— 跨版本更新后，兜底卸载恢复过期的 Info.plist

**位置**

- [voyager_engine.js:160](voyager_engine.js:160)–[:166](voyager_engine.js:166)：asar 冷备在纯净状态下每次覆盖；Info.plist 冷备只在**文件不存在**时创建。
- [voyager_engine.js:269](voyager_engine.js:269)–[:280](voyager_engine.js:280)：兜底路径直接把 `Info.plist.before-voyager` 覆盖回应用。

**证据（E11）**

1. v1 应用安装 → 建立 asar 冷备（v1）与 plist 冷备（v1）。
2. 官方更新到 v2：`app.asar` 与 `Info.plist` 都变成 v2，旧备份仍在。
3. 重新安装插件：检测到新 asar 无标记 → **覆盖 asar 冷备为 v2**；但 plist 冷备已存在 → **不刷新，仍是 v1**。
4. 卸载时若 extract/pack 失败进入兜底：恢复 v2 asar + **v1 Info.plist** → `ElectronAsarIntegrity` 哈希与 v2 asar 不匹配。

测试输出明确为：`fallback restored STALE v1 plist onto v2 app`。

**影响**

- 恰好是最需要兜底的故障场景，反而会把应用恢复成“哈希错配”的不可启动状态。
- 用户会认为“卸载后应用坏了”，且此时 asar 冷备已被删除（[voyager_engine.js:272](voyager_engine.js:272)），恢复手段更少。

**建议**

- 在创建新 asar 冷备的同一分支里，**总是**同步刷新 plist 冷备（先写临时文件再 rename），两者作为一个事务。
- 冷备旁写 `backup-meta.json`：asar SHA-256、Info.plist SHA-256、应用版本；兜底前校验版本/哈希，不匹配则拒绝使用并提示重新安装官方应用。
- 兜底恢复 plist 后，仍重新计算并同步 `ElectronAsarIntegrity` 哈希，再做 `codesign --verify`。
- 保留冷备直到用户确认应用能启动；不要在恢复后立即 `unlink` 唯一副本。

---

### H4（High）— 签名不可逆，“无痕恢复”声明不成立

**位置**

- [voyager_engine.js:105](voyager_engine.js:105)：`codesign --force --deep --sign -`。
- [voyager_engine.js:110](voyager_engine.js:110)：`xattr -cr`，并打印“已清除系统隔离标记”([:111](voyager_engine.js:111))。
- 卸载成功路径同样重签：[:250](voyager_engine.js:250)、[:280](voyager_engine.js:280)。
- README 宣称“1 秒内无痕恢复至初始状态”([README.md:134](README.md:134))、“彻底杜绝系统‘应用已损坏’弹窗”([README.md:176](README.md:176))。

**证据（真实应用）**

- `codesign -dv`：`flags=0x2(adhoc)`、`TeamIdentifier=not set`、无 entitlements。
- `spctl --assess`：`rejected`。
- 仍有 `Notarization Ticket=stapled`，但与 ad-hoc 签名不一致。
- 备份只有 `app.asar` 与 `Info.plist`，没有 `_CodeSignature`；卸载后的重签仍是 ad-hoc，**官方签名/entitlements/公证无法恢复**。

**影响**

- TCC 权限（屏幕录制、辅助功能、麦克风/摄像头）可能重新弹窗或被系统按新身份处理；Keychain/凭据可能重新询问。
- 缺少官方 entitlements 可能影响依赖 hardened runtime/JIT/特定权限的功能。
- 企业 MDM 可能拒绝 ad-hoc 应用；Gatekeeper 仍会拒绝。
- README 的“无痕”会让用户在出问题时误判。

**建议**

- 文档改为：“卸载会移除注入代码并恢复功能，但**不会恢复 Google 的官方签名**；如需完全恢复，请从官方安装包重装 Antigravity。”
- 去掉 `xattr -cr`（这是 Gatekeeper 绕过面）；如确需清 quarantine，单独、显式、用户确认后执行。
- 不要使用已弃用的 `--deep` 作为首选；对嵌套可执行文件逐一签名，或至少用 `codesign --verify --deep --strict` 验证结果。
- 若无法取得官方 entitlements，明确说明可能需要重新授权 TCC/Keychain。
- README 删除“彻底杜绝系统弹窗”的绝对化表述。

---

### M1（Medium）— 选区复制丢失块级边界

**位置**

- [payload/voyager-latex.js:490](payload/voyager-latex.js:490) 的 `copy` 捕获处理器。
- [payload/voyager-latex.js:523](payload/voyager-latex.js:523)：`const cleanText = tempDiv.textContent || '';`。

**证据（P4）**

- 选中两个 `<p>`、一个含行内公式的 `<p>`、一个块公式和尾部 `<p>` 后触发 copy：
  - 行内还原为 `$q+r$` ✅
  - 块公式还原为 `$$\nB=2\n$$` ✅
  - 但段落边界丢失：出现 `First paragraph.Second ...`，`First paragraph.` 后没有换行。
- `<br>`、`<li>`、`<tr>`、`<td>` 同理会被 `textContent` 直接拼接；代码块多行选择会变成一行。
- 若选区起点/终点落在公式内部，`cloneContents()` 可能只克隆 `.katex-html` 而没有 `.katex` 包装，公式仍会以乱码进入剪贴板。

**影响**

- 用户复制多段回答、列表或代码块时得到粘连文本，属于数据保真度回退；比“公式乱码”更隐蔽。

**建议**

- 不要用 `textContent` 处理非公式部分：
  - 优先使用 `window.getSelection().toString()`（浏览器会按渲染结果保留换行），再仅对公式节点做替换；或
  - 遍历克隆片段，对 `P/DIV/LI/TR/BR/H1–H6/PRE` 等块级元素插入 `\n`，再取 `textContent`。
- 对部分选中的公式：把 Range 扩展到最近的 `.katex` 边界，或保留原始 `sel.toString()` 文本，避免克隆半截 DOM。
- 补充 `<p>/<li>/<br>/<td>/<pre>` 的回归测试。

---

### M2（Medium）— 点击劫持：编辑器、链接与宿主事件

**位置**

- [payload/voyager-latex.js:425](payload/voyager-latex.js:425) 的 document 捕获阶段 click 处理器。
- [payload/voyager-latex.js:458](payload/voyager-latex.js:458)–[:459](payload/voyager-latex.js:459)：无条件 `preventDefault()` + `stopPropagation()`。
- 处理器只检查“是否存在选区”，没有检查 `contenteditable`、`input`、`a[href]` 等。

**证据（P3）**

- `.katex` 在 `contenteditable` 内：点击被拦截，光标无法放入公式位置，复制发生且默认行为被取消。
- KaTeX `\href` 链接：点击不跳转，改为复制源码。
- 因为 `stopPropagation` 在 document 捕获阶段执行，应用自身的点击/选择/编辑器逻辑收不到事件。

**影响**

- 在笔记/编辑器类可编辑区域中，公式所在位置无法正常编辑。
- 公式内链接不可用；宿主 UI 的点击行为被意外禁用。
- 对使用 `\href` 的教学/引用内容影响明显。

**建议**

- 处理器开头直接放行：
  ```js
  const el = e.target instanceof Element ? e.target : null;
  if (el && el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], a[href], button, [role="button"]')) return;
  ```
- 去掉 `stopPropagation()`；只在确实复制时 `preventDefault()`。
- 对行内公式考虑改为“Option/Alt + 单击”或悬浮按钮触发复制，普通单击保留原生行为；块公式可保留徽标点击。
- 明确“存在选区时点击不复制”的行为，并在 README 说明。

---

### M3（Medium）— root 运行 npx 污染用户 npm 缓存

**位置**

- [双击安装公式增强.command:13](双击安装公式增强.command:13)：`exec sudo env "PATH=$PATH" "SUDO_USER=$USER" bash "$0"`，`HOME` 仍是用户目录。
- [voyager_engine.js:139](voyager_engine.js:139) 等：root 下执行 `npx`。

**证据（真实环境）**

- `~/.npm` 下 **446 个 root 属主条目**；`~/.npm/_cacache` 中 **79 个 root 属主条目**；`~/.npm/_logs` 整体 root 属主。
- 时间戳与本次安装时间（2026-10-17 02:06）一致。
- 普通 `npm install` 因无法写日志/缓存报 EACCES；改用 `--cache /tmp/...` 后才成功（本次审查安装 jsdom 时实际遇到）。

**影响**

- 卸载插件后，用户的 Node 工具链仍处于损坏状态；报错信息与插件毫无关联，极难排查。
- root 属主文件落在用户可写树中，本身也是不良安全实践。

**建议**

- 以 `SUDO_USER` 身份执行 `npx`（`sudo -u "$SUDO_USER" -H ...`），或为 npx 设置独立的临时 `npm_config_cache` 并在结束时删除。
- 只有最终 `copyFileSync` 到 `/Applications` 与 `codesign` 需要 root。
- 若已经污染，提供修复命令：`sudo chown -R "$(id -un)" ~/.npm`（并在文档中说明）。
- 更好的方案：随包 vendored asar 依赖，彻底不调用 npx。

---

### M4（Medium）— 依赖未锁版本，Node 版本声明与实际不符

**位置**

- [voyager_engine.js:139](voyager_engine.js:139) 等：`npx -y @electron/asar`（无版本）。
- [README.md:53](README.md:53)：Node.js 推荐 v18+。

**证据**

- 当前解析到的 `@electron/asar@4.3.1` 声明 `engines.node >= 22.12.0`。
- Node 18/20 用户会在 npx 安装/运行阶段失败，或拿到行为不同的旧版本。
- `runCommandSync` 没有 timeout（[voyager_engine.js:28](voyager_engine.js:28)），网络卡住时安装器无限等待。

**建议**

- 固定 `@electron/asar` 版本，并在 `.command` 中检查 Node 主版本，给出明确错误。
- README 改为实际要求（Node ≥22.12，或固定到兼容 Node 18 的 asar 版本）。
- 为 npx/解包/打包增加超时（例如 120s）与失败提示。
- `package.json` 增加 `engines` 字段。

---

### M5（Medium）— 非原子替换、无校验、无运行中检测

**位置**

- [voyager_engine.js:205](voyager_engine.js:205)–[:207](voyager_engine.js:207)：注释称“原子替换”，实际 `fs.copyFileSync(tmpAsarPath, asarPath)` 直接截断目标文件。
- [voyager_engine.js:296](voyager_engine.js:296)–[:299](voyager_engine.js:299)：`install(appPath)` / `uninstall(appPath)` 是 async 函数但未 `await`，也没有顶层 `catch`。
- 整个流程没有 `pgrep`/`osascript` 检测 Antigravity 是否正在运行，也没有写入后的 asar/preload 校验。

**影响**

- 断电、磁盘满、进程被杀或复制中途异常，会留下截断的 `app.asar`；备份虽在，但用户可能不知道如何恢复。
- 对正在运行的应用替换 asar，可能导致运行中进程行为异常或缓存/更新器状态不一致。
- 未捕获的异常会以堆栈形式退出，可能发生在已经修改 Info.plist 之后。

**建议**

- 写入同目录临时文件 → `fs.fsync` → `fs.renameSync` 覆盖；保留旧文件直到验证通过。
- 写入前检测应用是否运行；若运行则中止并提示 `Cmd+Q`。
- 写入后验证：头部可解析、`dist/preload.js` 存在、标记恰好一次、`node --check` 通过。
- 用 `try/catch` 包裹 install/uninstall，失败时自动恢复备份并 exit 非 0；`await` 两个入口调用。

---

### M6（Medium）— 超宽公式的 flex 居中溢出裁剪

**位置**

- [payload/voyager-latex.js:48](payload/voyager-latex.js:48)–[:64](payload/voyager-latex.js:64)：`.katex-display, .voyager-math-block { display:flex; justify-content:center; overflow-x:auto; }`。

**分析**

- 在 flex 容器中，`justify-content:center` 会把宽于容器的子项放在负偏移位置；`overflow-x:auto` 的滚动起点从容器左侧开始，**无法滚到被裁掉的左侧内容**。这是 Chromium 上经典的 centered-flex overflow 行为。
- 窄侧栏/分屏/长 `align`、`cases`、矩阵公式最容易触发：公式左边被切掉，且没有滚动条能到达。
- KaTeX 的 `\tag` 依赖内部定位，`display:flex` 改变行盒后编号位置也可能偏移（未真机验证）。

**建议**

- 让滚动容器与居中容器分离：外层 `overflow-x:auto`，内层 `width:max-content; margin-inline:auto;`。
- 或使用 `justify-content: safe center` + `min-width:0`，并给子项 `flex:0 0 auto`。
- 增加窄窗 + 超宽公式的真机截图回归。

---

### M7（Medium）— 未安装时的卸载也会重包并重签

**位置**

- [voyager_engine.js:233](voyager_engine.js:233)–[:261](voyager_engine.js:261)：先解包，再无条件清理/打包/替换/重签。
- 没有在解包前检查 preload 是否含 `MARKER_START`。

**证据（E6）**

- 在一个从未安装插件的纯净 fixture 上运行 uninstall，仍观察到 `@electron/asar pack` 调用。

**影响**

- 对纯净应用做一次无谓的完整重包：触发 H1 的 unpacked 抹除、H4 的签名替换，并增大了变砖面。
- 用户可能只是想“确认卸载干净”，结果反而破坏了原布局。

**建议**

- 先用 `asar.extractFile(asarPath, 'dist/preload.js')` 读取并检查标记；没有标记则打印“未安装”并 exit 0，不重包。
- 若存在 `app.asar.before-voyager`，提示用户可选择用冷备恢复。
- 卸载成功路径不要立即删除唯一冷备；先验证应用可启动，或改名为 `.restored-<timestamp>`。

---

## 4. 低风险与建议（L1–L12）

| ID | 位置 | 问题 | 建议 |
|---|---|---|---|
| L1 | [payload/voyager-latex.js:370](payload/voyager-latex.js:370) vs [README.md:96](README.md:96) | 行内公式仍设置原生 `title`，与“屏蔽原生灰色 Tooltip”矛盾 | 行内也改用自定义徽标，或弱化文档声明 |
| L2 | [voyager_engine.js:115](voyager_engine.js:115)–[:119](voyager_engine.js:119) | START 无 END 的截断块不会被清理；再次安装会追加第二个 START（E8 已复现重复注入）；有标记时会 trim 整个文件尾部空白 | 检测不完整块并中止/修复；只清理块内空白 |
| L3 | [voyager_engine.js:162](voyager_engine.js:162) | 冷备可能来自已经被修改过的 asar（本机 `before-voyager` 已是 0 unpacked，而官方 `.bak` 有 347） | 记录备份来源哈希/版本；若源归档疑似已被重包，提示用户从官方重装后再备份 |
| L4 | [voyager_engine.js:44](voyager_engine.js:44)–[:49](voyager_engine.js:49)；[双击安装公式增强.command:5](双击安装公式增强.command:5) | 只找 `/Applications` 与 `~/Applications`；sudo 后 PATH 重置，nvm/volta 安装的 Node 找不到 | 支持自定义路径；错误信息提示 nvm/volta 与 `node` 绝对路径 |
| L5 | [payload/voyager-latex.js](payload/voyager-latex.js) 的 `extractLatex` | `aria-label` 只要含 `\` 或 `=` 就被当 TeX，可能复制人类可读标签 | 仅接受 KaTeX 生成的 `aria-label` 形态，或降低优先级 |
| L6 | 同上 | `data-latex`/`data-tex` 回退可能与其他扩展属性冲突 | 优先 `data-voyager-latex`，其余仅作最后回退并文档说明 |
| L7 | [payload/voyager-latex.js:376](payload/voyager-latex.js:376) | 每个 rAF 批次执行一次全文档 `querySelectorAll('*')`（外加 Shadow Root 递归） | 只扫描新增子树；缓存 shadow host；无 `.katex` 时跳过；见第 5 节插桩数据 |
| L8 | 装饰逻辑 | KaTeX 原地重渲染若保留父级 `data-voyager-ready`，可能继续使用旧 TeX | 监听子节点变化或在重渲染时清除 ready 标记；增加回归测试 |
| L9 | 仓库 | 无 CI、无测试、无发布校验和、`package.json` 无 `engines` | 把 `.review-scratch` 测试迁入 `tests/`，加 GitHub Actions；Release 附 SHA-256 |
| L10 | [README.md:134](README.md:134)、[:144](README.md:144) | “1 秒/3 秒”未测量；首次 npx + 解包 + 打包 + 重签通常更久 | 改为“通常几十秒（首次需联网）”，或给出实测数据 |
| L11 | 两个 `.command` | `$USER` 在部分启动上下文为空；`SUDO_USER` 可能为空，HOME 处理不一致 | 用 `id -un` 获取用户；显式传递 `HOME`；`~/Applications` 场景可不必 sudo |
| L12 | 渲染器 | `dist/utils.js` 用动态 `win.loadURL(url)`；若未来远端页面启用严格 CSP（`style-src` 无 `'unsafe-inline'`），注入的 `<style>` 可能被拦截 | 增加 CSP 探测与 `adoptedStyleSheets` 回退；每次官方更新后回归 |

---

## 5. 测试证据

### 5.1 引擎行为测试（`engine_tests.js`）

**结果：49 passed, 0 failed**

| 用例 | 覆盖点 | 结果 |
|---|---|---|
| E1 | 全新安装：备份字节一致、恰好一个 START/END、payload 逐字保留、使用 npx、使用 `--deep` | PASS |
| E2 | 重复安装幂等，不覆盖冷备，仍只有一个标记块 | PASS |
| E3 | 打包失败：exit 非 0，`app.asar` 未被修改 | PASS |
| E4 | Info.plist 同步失败：**exit 0 + 成功横幅**（缺陷） | PASS（复现缺陷） |
| E5 | codesign 失败：**exit 0 + 成功横幅**（缺陷） | PASS（复现缺陷） |
| E6 | 未安装时卸载：仍执行完整重包（缺陷） | PASS（复现缺陷） |
| E7 | 安装后卸载：标记移除、原 preload 保留、备份删除 | PASS |
| E8 | 截断标记：安装追加第二个 START；卸载可扫除两个块 | PASS |
| E9 | 缺少 `dist/preload.js`：exit 非 0，归档不变 | PASS |
| E10 | `cleanVoyagerBlock`：单块/多块/CRLF/无标记/尾部空白/START-only | PASS |
| E11 | 跨版本更新后兜底卸载恢复**过期 plist**（缺陷） | PASS（复现缺陷） |

### 5.2 载荷行为测试（`payload_tests.js`）

**结果：31 passed, 0 failed**

- P1：块/行内装饰、样式注入、堆叠标记、`data-latex` 回退、无法解析的公式不装饰。
- P2：MutationObserver 能装饰流式新增公式。
- P3：行内/块点击复制、Option 定界符、链接点击被劫持、contenteditable 点击被劫持、存在选区时禁用复制。
- P4：选区复制还原 `$...$` / `$$...$$`，但**段落边界丢失**；textarea 免疫。
- P5：Shadow DOM 样式注入、装饰、`composedPath` 点击复制。
- P6：annotation 中的恶意 HTML 不会执行，toast 使用 `textContent`，无 `<img>` 注入。

### 5.3 asar 往返实验

```
orig.asar unpacked entries: 5 [...]
after extract+pack unpacked entries: 0 []
CONFIRMED: extract+pack silently flattens every unpacked entry into the archive.
```

### 5.4 全 DOM 扫描插桩（单次流式变更）

| 文档规模（行数） | `querySelectorAll('*')` 次数 | 扫描元素数 |
|---|---|---|
| 100 | 1 | 213 |
| 1,000 | 1 | 2,013 |
| 5,000 | 1 | 10,013 |
| 10,000 | 1 | 20,013 |

每个 rAF 批次一次全量 `*` 扫描，成本随文档线性增长；在长会话 + token 流式渲染下会持续占用主线程。

### 5.5 真实应用取证

- 应用：`/Applications/Antigravity.app`，版本 2.24.0。
- `app.asar`：18,117,198 字节，unpacked 条目 0，preload 279,144 字节，恰好一个 Voyager 块。
- `app.asar.before-voyager`：18,095,876 字节，unpacked 条目 0，无 Voyager 标记（说明该机曾发生过重包）。
- 官方 `app.asar.bak`：4,486,221 字节，unpacked 条目 **347**（全部 `node_modules/chrome-devtools-mcp`），preload 5,407 字节。
- `app.asar.unpacked`：仍残留 347 个文件 / 约 14MB。
- `ElectronAsarIntegrity` 哈希与当前 asar 头部一致：`2d3c53f1...d0da37`（SHA256）。
- 签名：ad-hoc、无 TeamIdentifier、无 entitlements；`spctl --assess` rejected；存在已失效的公证 ticket。
- `~/.npm`：446 个 root 属主条目；`_cacache` 79 个；普通 `npm install` 因 EACCES 失败。

### 5.6 复现命令

```bash
cd .review-scratch
node engine_tests.js
node asar_roundtrip_test.js
NODE_PATH=/tmp/agy-review-deps/node_modules node payload_tests.js
NODE_PATH=/tmp/agy-review-deps/node_modules node perf_scan.js
```

> `payload_tests.js` / `perf_scan.js` 需要 jsdom。若 `/tmp/agy-review-deps` 不存在：
> ```bash
> npm install --prefix /tmp/agy-review-deps --cache /tmp/agy-npm-cache jsdom
> ```
> 引擎测试只在 `.review-scratch/fixtures/` 下写入，不会触碰真实应用。

---

## 6. README 声明 vs 实际行为

| README 声明 | 实际 | 结论 |
|---|---|---|
| “Security 0 Network / 100% Local”([README.md:15](README.md:15)) | 运行时 payload 确实无 fetch/XHR；但**安装阶段以 root 通过 npx 联网拉取并执行远程代码** | 需限定为“运行时”；安装阶段有 root 级网络依赖 |
| “Node.js 推荐 v18+”(README.md:53) | 当前 asar 4.3.1 要求 Node ≥22.12 | 不正确 |
| “屏蔽原生灰色 Tooltip”(README.md:96) | 行内公式仍设置原生 `title`([payload:370](payload/voyager-latex.js:370)) | 部分不符 |
| “100% 水平正中居中”(README.md:41/91) | flex 居中 + overflow 在超宽公式上会裁剪左侧且无法滚动 | 绝对化过强 |
| “1 秒内无痕恢复”(README.md:134) | 需 npx 解包/重包 + codesign；签名变为 ad-hoc，官方签名不恢复 | “1 秒”“无痕”均不成立 |
| “3 秒内热注入”(README.md:144) | 首次需联网安装 npx 依赖，18MB 归档解包/打包 + 重签 | 计时夸大 |
| “物理级解耦，与汉化 100% 共存”(README.md:125/151) | 标记块隔离、互不删除属实；但汉化补丁的 `translateNode` 没有 KaTeX 豁免，会翻译 `title`/`aria-label`/文本节点并遍历 Shadow DOM | 未观察到实际破坏，但“100%”无法保证，应改为“已验证共存” |
| “macOS 签名自愈……彻底杜绝系统‘应用已损坏’弹窗”(README.md:176) | ad-hoc 签名 + `spctl rejected`；无 entitlements；TCC/Keychain 可能重新授权 | 不成立，需重写 |
| “卸载后完全不需要重新下载”(README.md:144) | 重装插件可恢复增强；但若要恢复**官方签名**仍需重装官方应用 | 需区分“功能恢复”与“签名恢复” |

---

## 7. 修复优先级

### P0 — 发布前必须处理

1. **C1**：固定并校验 asar 依赖，取消 root 下的远程 `npx`；改为本地 vendored 依赖 + 用户态执行。
2. **C2**：签名/公证安装器，发布 SHA-256；删除 Gatekeeper 绕过指引。
3. **H1**：保留 `unpacked` 集合；打包后校验头部与文件列表。
4. **H2**：plist 同步/codesign 失败必须致命并回滚；成功前做完整验证。
5. **H3**：asar 与 plist 冷备同事务刷新；兜底恢复后重算哈希。
6. **H4**：停止 `xattr -cr`；文档如实说明签名不可逆。

### P1 — 下一个版本

7. **M1**：选区复制保留块级边界；补 `<p>/<li>/<br>/<td>/<pre>` 测试。
8. **M2**：放行 contenteditable/input/link；移除 `stopPropagation`。
9. **M3**：修复 npm 缓存污染；提供 `chown` 修复命令。
10. **M4**：锁版本、Node 版本检查、npx 超时、README 更正。
11. **M5**：同目录临时文件 + fsync + rename；运行中检测；写入后校验；顶层 catch。
12. **M6**：修复 flex 居中溢出；窄窗超宽公式回归。
13. **M7**：卸载前检查标记，未安装不重包；保留冷备直到验证。

### P2 — 工程化与文档

14. 把 `.review-scratch` 测试迁入 `tests/`，加 CI（Node 22/24 矩阵）。
15. Release 附 SHA-256；`package.json` 加 `engines`；增加 `status`/`verify` 子命令。
16. 精简 README 绝对化措辞，增加“已知限制/恢复官方签名”章节。

---

## 8. 值得肯定之处

- 注入点选择正确：`dist/preload.js` 确实由 `dist/utils.js` 的 `webPreferences.preload` 注册，且 `contextIsolation: true`、`nodeIntegration: false` 未被改动。
- 标记块 + 冷备 + 正则精准剔除的设计方向正确；重复安装幂等、打包失败不覆盖原包（E2/E3）均通过。
- `getAsarHeaderSha256` 的 16 字节 preamble / `readUInt32LE(12)` 头部长度处理正确，实测哈希与 `Info.plist` 一致。
- payload 不使用 Node API、不 eval 外部数据、不做网络请求；annotation 注入测试（P6）无 XSS。
- Shadow DOM 装饰与 `composedPath()` 点击处理实现稳健（P5）。
- 对官方 `app.asar.bak` 保持只读，未触碰。

---

*报告结束。测试脚手架与 fixture 均在 `.review-scratch/`，可随时删除；仓库源码未被修改。*
