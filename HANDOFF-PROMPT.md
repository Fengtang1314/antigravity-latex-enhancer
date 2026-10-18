# 交接提示词：Antigravity LaTeX Enhancer 对抗性审查结果与修复决策

> 使用说明：把下面整段内容交给另一个 AI。它不需要重新做审计；请它基于已有证据判断“该怎么修、先修什么、怎么验证、怎么发布”，并挑战现有结论。
>
> 如果你能访问仓库：请优先阅读 `ADVERSARIAL-REVIEW.md`、`voyager_engine.js`、`payload/voyager-latex.js`、两个 `.command`、`README.md` 和 `tests/`（若已建立）。如果不能访问，以下信息已足够你做决策；不要假设未提供的代码。

---

## 一、你的角色

你是一名资深 macOS / Electron 安全与发布工程师。下面是一份**已经完成**的对抗性审查记录。请不要重新做一遍完整审计，也不要重复罗列问题；你的任务是：

1. 校验严重度排序是否合理；
2. 在“不能碰真实客户端”的约束下，给出最小可行修复集和优先级；
3. 对每个关键问题给出可落地的实现方案（含伪代码/API/断言）；
4. 审查现有的分支、RC、验证、合并、回滚流程，指出更安全的做法；
5. 明确反对任何会引入更大风险的“修复”。

---

## 二、项目背景

- 项目：Antigravity Voyager LaTeX Enhancer `v2.2.0`（macOS 专用）。
- 作用：给 Antigravity（Electron 客户端）增强 KaTeX 公式排版，并支持点击/选区复制 LaTeX 源码。
- 安装方式：
  1. 用户双击 `双击安装公式增强.command`；
  2. 脚本检测到非 root 后执行 `exec sudo env "PATH=$PATH" "SUDO_USER=$USER" bash "$0"`；
  3. 以 root 运行 `node voyager_engine.js install`；
  4. 引擎用 `npx -y @electron/asar extract` 解包 `/Applications/Antigravity.app/Contents/Resources/app.asar`；
  5. 向 `dist/preload.js` 末尾追加 payload；
  6. 用 `npx -y @electron/asar pack` 重新打包；
  7. 用 `fs.copyFileSync` 覆盖原 `app.asar`；
  8. 用 `/usr/libexec/PlistBuddy` 同步 `Info.plist` 的 `ElectronAsarIntegrity` 哈希；
  9. 执行 `codesign --force --deep --sign -` 重签名，再 `xattr -cr` 清扩展属性。
- 卸载方式：同样以 root 解包，用正则删除标记块，重新打包、同步哈希、重签名；若解包/打包失败，则用 `app.asar.before-voyager` 冷备兜底。
- payload 注入到 `dist/preload.js`，运行在 `contextIsolation: true`、`nodeIntegration: false` 的 preload 环境；不改 `dist/utils.js` 的 `webPreferences`。
- 分发：GitHub Release zip，`.command` 未签名、未公证；README 教用户右键“打开”或 `xattr -d com.apple.quarantine *.command` 放行。

### 审查环境

- macOS Darwin 27.0.0
- Antigravity 2.24.0
- Node 24.21.0 / npm 11.19.0
- `@electron/asar` 4.3.1（`engines.node >= 22.12.0`）
- jsdom 30.1.3

### 审查方法

- 静态审计：安装/卸载脚本、`voyager_engine.js`、`payload/voyager-latex.js`、README。
- 真实应用取证：`app.asar`、`app.asar.before-voyager`、官方 `app.asar.bak`、`Info.plist`、`_CodeSignature`。
- 引擎行为测试：49 项，全部通过；其中 4 项专门复现缺陷。
- payload 行为测试：31 项，全部通过。
- asar 往返实验：用真实 `@electron/asar` 构造 `unpackDir` 归档再 extract→pack。
- DOM 扫描插桩：统计每次流式变更触发的全文档 `querySelectorAll('*')` 成本。

### 审查限制（请在方案中考虑）

- **未启动真实 Antigravity 渲染进程做端到端 UI 测试**；DOM 行为用 jsdom 近似。
- 引擎测试中的 `npx`、`codesign`、`PlistBuddy` 是行为模拟；真实打包行为由 asar 往返实验覆盖。
- CSS 布局类问题（超宽公式裁剪）是静态高置信判断，未在真机窄窗验证。
- 未侵入测试 Antigravity 自动更新、MDM、TCC 数据库。
- 汉化补丁的交互只做了静态检查，未做完整兼容性矩阵。

---

## 三、已确认的事实与证据

### 3.1 真实应用状态

- `/Applications/Antigravity.app` 版本 2.24.0。
- 当前 `app.asar`：18,117,198 字节，头部 `unpacked` 条目 **0**；`dist/preload.js` 279,144 字节，恰好一个 Voyager 标记块。
- `app.asar.before-voyager`：18,095,876 字节，`unpacked` 条目 **0**，无 Voyager 标记。
- 官方 `app.asar.bak`：4,486,221 字节，`unpacked` 条目 **347**（全部在 `node_modules/chrome-devtools-mcp` 下），preload 5,407 字节。
- `app.asar.unpacked` 目录仍残留 347 个文件 / 约 14MB，但当前归档头部已不引用它们（成为孤立副本）。
- `ElectronAsarIntegrity` 哈希与当前 asar 头部一致：`2d3c53f1286928d6f64b0a4fcaecf0e75b14b4fde331ae68cb949ef6bbd0da37`，算法 SHA256。
- 签名：`flags=0x2(adhoc)`、`TeamIdentifier=not set`、无 entitlements；`spctl --assess` 为 **rejected**；仍有已失效的公证 ticket。
- `~/.npm`：446 个 root 属主条目；`_cacache` 中 79 个；`_logs` 整体 root 属主；普通 `npm install` 因 EACCES 失败（审查中安装 jsdom 时实际遇到）。
- `@electron/asar@4.3.1` 的 `engines` 为 `{"node": ">=22.12.0"}`。
- 两个 `.command` 在 git 中为 `100755`。

### 3.2 自动化测试结果

**引擎测试：49 passed, 0 failed**

- E1 全新安装：备份字节一致、恰好一个 START/END、payload 逐字保留、使用 npx、使用 `--deep`。
- E2 重复安装幂等，不覆盖冷备。
- E3 打包失败：exit 非 0，原 asar 不变。
- E4 **Info.plist 同步失败：exit 0，仍打印“安装成功”**（缺陷）。
- E5 **codesign 失败：exit 0，仍打印“安装成功”**（缺陷）。
- E6 **未安装时卸载仍执行完整重包**（缺陷）。
- E7 安装后卸载：标记移除、原 preload 保留、备份删除。
- E8 截断标记（START 无 END）：安装追加第二个 START（重复注入）；卸载可扫除两个块。
- E9 缺少 `dist/preload.js`：exit 非 0，归档不变。
- E10 `cleanVoyagerBlock`：单块/多块/CRLF/无标记/尾部空白/START-only。
- E11 **跨版本更新后，兜底卸载恢复过期 Info.plist**（缺陷）。

**payload 测试：31 passed, 0 failed**

- 装饰、堆叠、`data-latex` 回退、无法解析公式不装饰。
- MutationObserver 能装饰流式新增公式。
- 点击复制：行内、Option 定界符、链接点击被劫持、contenteditable 点击被劫持、存在选区时禁用复制。
- 选区复制：`$...$`/`$$...$$` 还原正确；**段落边界丢失**；textarea 免疫。
- Shadow DOM：样式注入、装饰、`composedPath` 点击复制。
- 注入安全：annotation 中恶意 HTML 不执行，toast 使用 `textContent`。

**asar 往返实验**

```
orig.asar unpacked entries: 5
after extract+pack unpacked entries: 0
CONFIRMED: extract+pack silently flattens every unpacked entry into the archive.
```

**DOM 扫描插桩（单次流式变更）**

| 文档规模（行数） | `querySelectorAll('*')` 次数 | 扫描元素数 |
|---|---|---|
| 100 | 1 | 213 |
| 1,000 | 1 | 2,013 |
| 5,000 | 1 | 10,013 |
| 10,000 | 1 | 20,013 |

每帧一次全量 `*` 扫描，成本随文档线性增长。

---

## 四、发现清单

### Critical

#### C1 — 以 root 执行未锁定版本的远程 npm 包

- 位置：`双击安装公式增强.command` 第 8、13 行；`voyager_engine.js` 第 139、190、233、243 行。
- 事实：安装器先提权到 root，再执行 `npx -y @electron/asar ...`（无版本、无 integrity 校验）；`npx` 运行时从 registry 解析最新版。安装器还以 root 直接执行解压目录中的 `node voyager_engine.js`。
- 影响：registry、包维护者账号、CDN、DNS、代理任一环节被攻破，都会以 root 执行任意代码；被篡改的 zip/仿冒仓库天然等价于 root 代码执行。
- 与 README “0 Network / 100% Local” 冲突：安装阶段有网络，且是 root 级远程代码。
- 现有修复方向：加 `package.json` + lockfile，固定 `@electron/asar@4.3.1`；release zip 内置生产依赖；若缺失，用户态 `npm ci --ignore-scripts` + 临时 cache；引擎改用本地 API，不再用 npx；用 `execFileSync` 替代字符串插值。

#### C2 — 未签名/未公证安装器，且指导绕过 Gatekeeper

- 位置：`README.md` 第 75–78 行；两个 `.command` 均未签名。
- 事实：README 教用户右键“打开”或 `xattr -d com.apple.quarantine *.command`；随后脚本立即请求 sudo。
- 影响：攻击者只需投放相似仓库或篡改 Release zip，就能让用户主动去掉 quarantine 并以 root 运行；GitHub/CDN 被攻破时没有第二道防线。
- 现有修复方向：Developer ID 签名的 `.pkg` + notarization + stapling；发布 SHA-256；删除通用 Gatekeeper 绕过指引；短期至少给出明确威胁模型。

### High

#### H1 — `asar extract → pack` 抹掉全部 `unpacked` 条目

- 位置：`voyager_engine.js` 第 139、190、233、243 行；打包命令没有 `--unpack-dir` 或等价参数。
- 证据：真实 asar 库复现 5 → 0；真实应用官方 `.bak` 有 347 个 unpacked，当前归档为 0；`app.asar.unpacked` 仍残留 347 个文件/14MB。
- 影响：违反 Electron `asarUnpack` 契约；`dist/languageServer.js` 的 `setupNodeModules` 依赖 `app.asar.unpacked/node_modules/...` 启动 `chrome-devtools-mcp`；一旦孤立目录被清理或 Electron 按头部解析，DevTools MCP 失效；归档体积膨胀。
- 现有修复方向：读取原头部 `unpacked` 集合，用 `createPackageWithOptions({ unpackDir: <brace glob> })` 保留；打包后断言新旧集合一致；校验 `.unpacked` 文件仍在磁盘。

#### H2 — 致命失败仍 exit 0 并打印“安装成功”

- 位置：`voyager_engine.js` 第 210、213 行（返回值被忽略）；第 92、107 行（仅 warn）；第 215–218 行（无条件成功横幅）。
- 证据：E4（PlistBuddy Set 失败）、E5（codesign 失败）均 exit 0 + “🎉 安装成功”。
- 影响：`ElectronAsarIntegrity` 未更新 → Electron 可能拒绝加载 asar；codesign 失败 → 应用可能无法启动；用户被告知成功，没有恢复指引。
- 现有修复方向：两步任一失败即致命；从冷备恢复 asar + plist；重新签名；exit 非 0；成功前验证头部、preload 标记、`node --check`、`codesign --verify --deep --strict`。

#### H3 — 跨版本更新后，兜底卸载恢复过期 Info.plist

- 位置：`voyager_engine.js` 第 160–166 行（asar 冷备每次刷新；plist 冷备只在不存在时创建）；第 269–280 行（兜底直接覆盖）。
- 证据（E11）：
  1. v1 安装 → 建立 v1 asar/plist 冷备；
  2. 官方更新到 v2；
  3. 重装插件 → asar 冷备刷新为 v2，plist 冷备仍是 v1；
  4. 卸载时 pack 失败 → 恢复 v2 asar + v1 plist → 哈希错配。
- 影响：最需要兜底的场景反而把应用恢复成不可启动状态；恢复后 asar 冷备已被删除。
- 现有修复方向：asar/plist 冷备同事务刷新；旁写 `backup-meta.json`（哈希/版本）；兜底前校验；恢复后重新同步哈希并验签；保留冷备直到验证通过。

#### H4 — 签名不可逆，“无痕恢复”不成立

- 位置：`voyager_engine.js` 第 105 行（`codesign --force --deep --sign -`）、第 110 行（`xattr -cr`）；卸载同样重签（第 250、280 行）；README 第 134、176 行。
- 证据：adhoc、无 TeamIdentifier、无 entitlements、`spctl rejected`；备份只有 asar 与 Info.plist，没有 `_CodeSignature`；卸载后仍是 ad-hoc。
- 影响：TCC（屏幕录制/辅助功能/麦克风/摄像头）可能重新授权；Keychain 可能重新询问；缺少 entitlements 可能影响功能；MDM 可能拒绝；README 的“无痕”会让用户误判。
- 现有修复方向：文档如实说明签名不可恢复；去掉 `xattr -cr`，改为定向删除 `com.apple.quarantine`；验证签名；不要宣称“彻底杜绝系统弹窗”；建议用户需要官方签名时重装官方应用。

### Medium

#### M1 — 选区复制丢失块级边界

- 位置：`payload/voyager-latex.js` 第 490 行 copy 处理器；第 523 行 `tempDiv.textContent`。
- 证据（P4）：`First paragraph.Second ...`，段落间没有换行；`<br>`、`<li>`、`<tr>`、`<td>` 同样被拼接；部分选中公式可能只克隆 `.katex-html`，仍出现乱码。
- 影响：复制多段回答/列表/代码块得到粘连文本。
- 现有修复方向：用 `selection.toString()` 保留换行，或遍历克隆片段对块级元素/`<br>` 插入 `\n`；对部分选中公式扩展 Range 到 `.katex` 边界；补回归测试。

#### M2 — 点击劫持：编辑器、链接、宿主事件

- 位置：`payload/voyager-latex.js` 第 425 行 click 处理器；第 458–459 行无条件 `preventDefault` + `stopPropagation`；没有 contenteditable/input/link 放行。
- 证据（P3）：contenteditable 内公式点击被拦截、光标无法放入；`\href` 链接不跳转；宿主点击处理器收不到事件。
- 影响：可编辑区域中公式位置无法正常编辑；公式内链接不可用；宿主 UI 行为被禁用。
- 现有修复方向：开头放行 `input, textarea, select, [contenteditable], a[href], button, [role=button]`；去掉 `stopPropagation`；只在真正复制时 `preventDefault`；行内公式可改为 Option/Alt 点击或悬浮按钮。

#### M3 — root 运行 npx 污染用户 npm 缓存

- 位置：`.command` 第 13 行（`sudo env` 保留用户 HOME）；引擎第 139 行等（root 下 npx）。
- 证据：`~/.npm` 446 个 root 属主条目；`_cacache` 79 个；普通 `npm install` EACCES。
- 影响：卸载插件后用户 Node 工具链仍损坏，报错与插件无关，难排查。
- 现有修复方向：用户态执行 npx/npm ci + 临时 cache；只有最终写 `/Applications` 和 codesign 用 root；提供 `chown` 修复命令；或随包内置依赖。

#### M4 — 依赖未锁版本，Node 声明与实际不符

- 位置：引擎第 139 行等（`npx -y @electron/asar`）；README 第 53 行（Node 18+）。
- 证据：asar 4.3.1 要求 Node ≥22.12；npx 无 timeout。
- 影响：Node 18/20 用户失败或拿到不同版本；网络卡住时安装器无限等待。
- 现有修复方向：固定版本；Node 版本前置检查；npx 超时；README 更正；`package.json` 加 `engines`。

#### M5 — 非原子替换、无校验、无运行中检测

- 位置：引擎第 205–207 行（注释称“原子替换”，实际 `copyFileSync` 截断）；第 296–299 行（async 未 await，无顶层 catch）；无“应用正在运行”检测。
- 影响：断电/磁盘满/异常会留下截断 asar；对运行中应用替换可能行为异常；未捕获异常可能发生在已修改 plist 之后。
- 现有修复方向：同目录临时文件 + fsync + rename；写入后验证；检测运行中应用并中止；try/catch + 自动恢复；await 入口。

#### M6 — 超宽公式的 flex 居中溢出裁剪

- 位置：`payload/voyager-latex.js` 第 48–64 行：`display:flex; justify-content:center; overflow-x:auto`。
- 分析：flex 居中 + 超宽子项会放在负偏移位置，滚动起点无法到达被裁掉的左侧；窄侧栏/分屏/长 `align`/`cases`/矩阵最易触发；`\tag` 位置可能偏移。
- 现有修复方向：外层滚动、内层 `width:max-content; margin-inline:auto`；或 `justify-content:safe center` + `min-width:0`；窄窗回归测试。

#### M7 — 未安装时的卸载也会重包并重签

- 位置：引擎第 233–261 行；解包前不检查标记。
- 证据（E6）：纯净 fixture 上运行 uninstall，仍观察到 `@electron/asar pack`。
- 影响：无谓触发 H1/H4，扩大变砖面。
- 现有修复方向：先用 `asar.extractFile` 检查 preload 标记；无标记则 no-op；保留冷备直到验证。

### Low

| ID | 位置 | 问题 | 建议 |
|---|---|---|---|
| L1 | payload 第 370 行 vs README 第 96 行 | 行内公式仍设置原生 `title`，与“屏蔽原生 Tooltip”矛盾 | 行内也改自定义徽标，或弱化声明 |
| L2 | 引擎第 115–119 行 | START 无 END 不会被清理；再次安装追加第二个 START；有标记时 trim 整个文件尾部空白 | 检测不完整块并中止/修复 |
| L3 | 引擎第 162 行 | 冷备可能来自已修改的 asar（本机 before-voyager 已是 0 unpacked） | 记录备份来源哈希/版本；提示从官方重装后再备份 |
| L4 | 引擎第 44–49 行；`.command` 第 5 行 | 只找 `/Applications` 与 `~/Applications`；sudo 后 PATH 重置，nvm/volta 的 Node 找不到 | 支持自定义路径；错误提示 nvm/volta |
| L5 | payload `extractLatex` | `aria-label` 含 `\` 或 `=` 就当作 TeX，可能复制人类可读标签 | 仅接受 KaTeX 形态或降低优先级 |
| L6 | payload `extractLatex` | `data-latex`/`data-tex` 回退可能与其他扩展冲突 | 优先 `data-voyager-latex` |
| L7 | payload 第 376 行 | 每帧全文档 `querySelectorAll('*')`，Shadow Root 递归 | 只扫描新增子树；缓存 shadow host |
| L8 | 装饰逻辑 | KaTeX 原地重渲染若保留 `data-voyager-ready`，可能继续用旧 TeX | 重渲染时清除 ready 标记 |
| L9 | 仓库 | 无 CI、无测试、无发布校验和、无 `engines` | 测试入库 + Actions + Release SHA-256 |
| L10 | README 第 134、144 行 | “1 秒/3 秒”未测量 | 改为“通常几十秒（首次需联网）” |
| L11 | 两个 `.command` | `$USER` 可能为空；`SUDO_USER`/HOME 处理不一致 | 用 `id -un`；显式传 HOME；`~/Applications` 可不 sudo |
| L12 | 渲染器 | `dist/utils.js` 动态 `loadURL`；未来严格 CSP 可能拦截注入 `<style>` | 增加 CSP 探测 + `adoptedStyleSheets` 回退 |

---

## 五、现有修复思路（请批判）

1. **分支策略**：从 `main` 开 `fix/installer-hardening`；main 不动；PR 1 修安装器，PR 2 修 payload。
2. **验证策略**：
   - 第 1 层：合成 fixture；
   - 第 2 层：真实 asar 库 + 合成归档；
   - 第 3 层：用 `ditto` 复制真实 app 到测试目录，`VOYAGER_APP_PATH` 指向副本，完整 install/uninstall，全程无 sudo，不碰 `/Applications`；
   - 第 4 层：真机冒烟仅可选，用户明确同意后做，先做完整 bundle 备份。
3. **RC 流程**：从分支 commit 构建 `v2.3.0-rc1.zip`，用户安装 RC 验证；通过后只合并被验证的 commit；从同一文件树构建正式包，逐文件 SHA-256 对比；再打 tag。
4. **根因修复**：固定/内置 asar 依赖；改用 asar API；保留 unpacked；事务化替换；致命失败回滚；plist/asar 冷备同事务；未安装卸载 no-op；定向清 quarantine；补文档。
5. **payload 修复**：复制保留块边界；点击放行编辑器/链接；修复 flex 溢出。

---

## 六、请你回答的问题

1. **严重度校验**：C1/C2 是否被高估或低估？H1–H4 的排序是否合理？有没有“看起来低、实际更高”的问题？
2. **最小可行修复集**：在“不碰真实客户端、不直接改 main”的约束下，先修哪些？哪些可以延后？
3. **C1 供应链**：在“作者没有 Developer ID 证书”和“有证书”两种情况下，分别给出可落地方案；vendor 依赖、`npm ci` + lockfile、签名 `.pkg` 的成本/收益如何取舍？
4. **H1 unpack 保留**：给出具体实现（API、brace glob、目录/文件级 unpacked 的处理、打包后断言）。注意 `@electron/asar` 的 `unpackDir` 只接受单个 pattern 字符串。
5. **H2/H3/M5 事务设计**：给出状态机/伪代码：备份、临时文件、fsync、rename、验证、失败回滚、冷备刷新、运行中检测。哪些步骤必须 root，哪些可以用户态？
6. **M1/M2/M6**：给出最小改动和回归测试设计；复制逻辑如何同时保留块边界、`<br>`、列表/表格，并处理“选区部分落在公式内”？
7. **流程审查**：分支 → RC → 用户验证 → 合并被验证 commit → 正式包逐文件校验，这个流程是否合理？有没有更安全的做法（release branch、pre-release tag、VM/独立用户）？
8. **遗漏风险**：仅基于以上信息，有没有审查中没列出的高风险点？不要假设未提供的代码/环境。
9. **落地计划**：给出按提交/按阶段的计划，每个阶段的验收标准（测试、副本 e2e、真机冒烟、回滚点）。
10. **反对意见**：如果某个“修复”本身会引入更大风险（例如去掉 `xattr -cr` 导致 Gatekeeper 弹窗、保留冷备导致磁盘占用、用户态 npm ci 仍联网），请明确反对并给替代方案。

---

## 七、输出格式要求

请按以下结构输出：

1. **结论**：3–5 条，直接说“先修什么、后修什么、哪些不要做”。
2. **分级**：必须修 / 应该修 / 可以延后（把上面的 ID 重新归类，可调整严重度并说明理由）。
3. **实施方案**：逐项给出代码骨架或伪代码，标注文件/函数/关键行；对不确定的 API 明确说明需要验证。
4. **验证与发布**：测试矩阵、副本 e2e 断言、RC/合并/回滚步骤。
5. **风险清单**：每个修复可能引入的新风险及缓解。
6. **需要补充的信息**：如果信息不足，列出最小补充项；不要编造。

---

## 八、约束

- 不要建议在真实 `/Applications/Antigravity.app` 上反复做破坏性试验；验证优先使用副本/RC。
- 不要建议直接改 `main`；先分支/RC，main 全程保持可发布。
- 不要假设有 Developer ID、公证账号、CI、网络或 root 以外的权限；有/没有两种方案都给。
- 不要重新罗列已知问题；重点是决策、实现和验证。
- 不要基于未提供的代码做推断；信息不足就明确说。
- 如果认为现有审查结论有误，请指出具体证据和替代解释。

---

*以上为完整交接内容。*
