/**
 * ==============================================================================
 * Antigravity LaTeX Enhancer (v3.0.0 Sidecar + CDP 动态注入版)
 * 灵感来源: Gemini Voyager & 016/Antigravity-Better
 *
 * 核心特性与架构加固:
 *  1. 完整穿透 Shadow DOM: 样式同步注入 shadowRoot，MutationObserver 深度监听与可回收销毁
 *  2. 采用 e.composedPath() 跨越 Shadow 边界捕获点击，彻底解决事件重定向丢失问题
 *  3. 增量子树扫描 + requestAnimationFrame 节流: 杜绝 AI 流式生成时的全量 DOM 重复扫描
 *  4. 输入框/编辑器绝对免疫: INPUT / TEXTAREA / contentEditable 状态下绝对不干预原生复制
 *  5. 多源 LaTeX 源码提取: 优先实时读取 annotation / alttext，兼顾 data-latex / data-tex 兜底
 *  6. 纯本地前端交互，零外部网络请求，零 Token/RPC 触碰，完全兼容 Trusted Types
 *  7. 行内/块级 KaTeX 公式居中与防挤压美化（自动适配浅色/深色主题及宿主 CSS 变量）
 *  8. 单击公式一键复制纯 LaTeX 源码；按住 Option/Alt 点击复制带 $/$$ 定界符源码
 *  9. 选区 Cmd+C 智能拦截还原，严格保留段落/列表/表格边界
 *  10. 完整生命周期管理: 支持版本校验、热更新与 window.__VOYAGER_LATEX_DISPOSE__() 无痕卸载
 * ==============================================================================
 */
(function () {
  'use strict';

  const VERSION =
    (typeof window.__VOYAGER_LATEX_EXPECTED_VERSION__ === 'string' &&
      window.__VOYAGER_LATEX_EXPECTED_VERSION__) ||
    '3.0.0';

  if (window.__VOYAGER_LATEX_INITIALIZED__) {
    if (window.__VOYAGER_LATEX_VERSION__ === VERSION) return;
    if (typeof window.__VOYAGER_LATEX_DISPOSE__ === 'function') {
      try {
        window.__VOYAGER_LATEX_DISPOSE__();
      } catch (_) {}
    }
  }

  window.__VOYAGER_LATEX_INITIALIZED__ = true;
  window.__VOYAGER_LATEX_VERSION__ = VERSION;

  try {
    const STYLE_ID = 'voyager-latex-styles';
    const TOAST_ID = 'voyager-latex-toast';
    const INLINE_TITLE = '点击复制纯 LaTeX 源码\n按住 Option (Alt) 点击复制带 $ 定界符源码';
    const BADGE_DEFAULT = '📋 复制 LaTeX';

    const CSS_CONTENT = `
      /* 主题变量：默认 Claude 极简暖白，自动跟随宿主暗色模式与自定义强调色 */
      .katex-display,
      .voyager-math-block,
      :not(.katex-display) > .katex,
      .voyager-math-inline,
      #${TOAST_ID} {
        --vl-accent: var(--primary, #D97757);
        --vl-surface: #FAF5EE;
        --vl-fg: var(--foreground, #141413);
        --vl-hover-bg: rgba(20, 20, 19, 0.025);
        --vl-hover-border: rgba(217, 119, 87, 0.30);
        --vl-hover-shadow: 0 2px 10px rgba(20, 20, 19, 0.04);
        --vl-copied-bg: rgba(217, 119, 87, 0.07);
        --vl-copied-border: rgba(217, 119, 87, 0.58);
        --vl-badge-bg: #FAF5EE;
        --vl-badge-fg: #141413;
        --vl-badge-border: rgba(217, 119, 87, 0.36);
        --vl-badge-shadow: 0 2px 6px rgba(20, 20, 19, 0.07);
        --vl-inline-hover: rgba(217, 119, 87, 0.12);
        --vl-inline-copied: rgba(217, 119, 87, 0.25);
        --vl-toast-bg: #FAF5EE;
        --vl-toast-fg: #141413;
        --vl-toast-border: rgba(217, 119, 87, 0.38);
        --vl-toast-shadow: 0 6px 20px rgba(20, 20, 19, 0.09), 0 1px 3px rgba(20, 20, 19, 0.05);
        --vl-toast-code-fg: #b85b3b;
        --vl-toast-code-bg: rgba(217, 119, 87, 0.08);
        --vl-toast-code-border: rgba(217, 119, 87, 0.20);
        --vl-scroll-thumb: rgba(20, 20, 19, 0.18);
      }

      :is(html.dark, body.theme-dark, .theme-dark, .dark) .katex-display,
      :is(html.dark, body.theme-dark, .theme-dark, .dark) .voyager-math-block,
      :is(html.dark, body.theme-dark, .theme-dark, .dark) :not(.katex-display) > .katex,
      :is(html.dark, body.theme-dark, .theme-dark, .dark) .voyager-math-inline,
      :is(html.dark, body.theme-dark, .theme-dark, .dark) #${TOAST_ID},
      :host-context(.theme-dark, .dark) .katex-display,
      :host-context(.theme-dark, .dark) .voyager-math-block,
      :host-context(.theme-dark, .dark) :not(.katex-display) > .katex,
      :host-context(.theme-dark, .dark) .voyager-math-inline {
        --vl-surface: var(--card, #1E1D1B);
        --vl-fg: var(--foreground, #ECEAE4);
        --vl-hover-bg: rgba(255, 255, 255, 0.04);
        --vl-hover-border: rgba(217, 119, 87, 0.42);
        --vl-hover-shadow: 0 2px 12px rgba(0, 0, 0, 0.28);
        --vl-copied-bg: rgba(217, 119, 87, 0.14);
        --vl-copied-border: rgba(217, 119, 87, 0.70);
        --vl-badge-bg: var(--popover, #242320);
        --vl-badge-fg: var(--foreground, #ECEAE4);
        --vl-badge-border: rgba(217, 119, 87, 0.45);
        --vl-badge-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
        --vl-inline-hover: rgba(217, 119, 87, 0.22);
        --vl-inline-copied: rgba(217, 119, 87, 0.36);
        --vl-toast-bg: var(--popover, #242320);
        --vl-toast-fg: var(--foreground, #ECEAE4);
        --vl-toast-border: rgba(217, 119, 87, 0.45);
        --vl-toast-shadow: 0 8px 24px rgba(0, 0, 0, 0.42);
        --vl-toast-code-fg: #F09B7E;
        --vl-toast-code-bg: rgba(217, 119, 87, 0.16);
        --vl-toast-code-border: rgba(217, 119, 87, 0.30);
        --vl-scroll-thumb: rgba(255, 255, 255, 0.22);
      }

      @media (prefers-color-scheme: dark) {
        :is(html:not(.theme-light), body:not(.theme-light)) .katex-display,
        :is(html:not(.theme-light), body:not(.theme-light)) .voyager-math-block,
        :is(html:not(.theme-light), body:not(.theme-light)) :not(.katex-display) > .katex,
        :is(html:not(.theme-light), body:not(.theme-light)) .voyager-math-inline,
        :is(html:not(.theme-light), body:not(.theme-light)) #${TOAST_ID} {
          --vl-surface: var(--card, #1E1D1B);
          --vl-fg: var(--foreground, #ECEAE4);
          --vl-hover-bg: rgba(255, 255, 255, 0.04);
          --vl-hover-border: rgba(217, 119, 87, 0.42);
          --vl-hover-shadow: 0 2px 12px rgba(0, 0, 0, 0.28);
          --vl-copied-bg: rgba(217, 119, 87, 0.14);
          --vl-copied-border: rgba(217, 119, 87, 0.70);
          --vl-badge-bg: var(--popover, #242320);
          --vl-badge-fg: var(--foreground, #ECEAE4);
          --vl-badge-border: rgba(217, 119, 87, 0.45);
          --vl-badge-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
          --vl-inline-hover: rgba(217, 119, 87, 0.22);
          --vl-inline-copied: rgba(217, 119, 87, 0.36);
          --vl-toast-bg: var(--popover, #242320);
          --vl-toast-fg: var(--foreground, #ECEAE4);
          --vl-toast-border: rgba(217, 119, 87, 0.45);
          --vl-toast-shadow: 0 8px 24px rgba(0, 0, 0, 0.42);
          --vl-toast-code-fg: #F09B7E;
          --vl-toast-code-bg: rgba(217, 119, 87, 0.16);
          --vl-toast-code-border: rgba(217, 119, 87, 0.30);
          --vl-scroll-thumb: rgba(255, 255, 255, 0.22);
        }
      }

      /* 核心排版修复：彻底隐藏 KaTeX 的 MathML 语义层，杜绝在 Chromium 中占据左侧空间导致公式右偏 */
      .katex .katex-mathml,
      .katex-display .katex-mathml,
      .voyager-math-block .katex-mathml {
        position: absolute !important;
        clip: rect(1px, 1px, 1px, 1px) !important;
        clip-path: inset(50%) !important;
        width: 1px !important;
        height: 1px !important;
        padding: 0 !important;
        margin: -1px !important;
        border: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        white-space: nowrap !important;
      }

      /* ========== 块级公式 (.katex-display / .voyager-math-block) ========== */
      /* 外层 Block 承担滚动与居中，内层 inline-block 解耦避免超宽时左侧被裁切 */
      .katex-display,
      .voyager-math-block {
        position: relative !important;
        display: block !important;
        text-align: center !important;
        width: 100% !important;
        box-sizing: border-box !important;
        margin: 18px 0 !important;
        padding: 18px 24px !important;
        line-height: normal !important;
        background: transparent !important;
        border: 1px solid transparent !important;
        border-radius: 8px !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        scrollbar-width: thin;
        scrollbar-color: var(--vl-scroll-thumb) transparent;
        cursor: pointer !important;
        transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease !important;
        user-select: text !important;
      }

      .katex-display::-webkit-scrollbar,
      .voyager-math-block::-webkit-scrollbar {
        height: 5px;
      }
      .katex-display::-webkit-scrollbar-thumb,
      .voyager-math-block::-webkit-scrollbar-thumb {
        background: var(--vl-scroll-thumb);
        border-radius: 999px;
      }

      /* 内层公式容器：保持 inline-block 自然宽度，短公式由外层 text-align:center 居中，超宽公式从左起完整滚动 */
      .katex-display > .katex,
      .voyager-math-block > .katex {
        display: inline-block !important;
        width: max-content !important;
        min-width: 0 !important;
        max-width: none !important;
        text-align: initial !important;
        vertical-align: middle !important;
        line-height: normal !important;
        margin: 0 auto !important;
      }

      /* 核心防挤压引擎：连续块级公式堆叠时强力弹开 28px 超大呼吸间距，彻底打破外边距合并 */
      .katex-display + .katex-display,
      .voyager-math-block + .voyager-math-block,
      .katex-display + .voyager-math-block,
      .voyager-math-block + .katex-display,
      .voyager-math-stacked {
        margin-top: 28px !important;
      }

      /* 正文段落与公式之间的双向弹性安全区，防止文字贴脸 */
      p + .katex-display,
      p + .voyager-math-block,
      .katex-display + p,
      .voyager-math-block + p {
        margin-top: 20px !important;
      }

      ul + .katex-display,
      ol + .katex-display,
      .katex-display + ul,
      .katex-display + ol {
        margin-top: 18px !important;
      }

      /* 引用块/提示框内部公式的边距适配 */
      blockquote .katex-display,
      blockquote .voyager-math-block {
        margin: 14px 0 !important;
      }

      /* 针对矩阵与对齐环境 (aligned / matrix / cases) 提供安全外边距缓冲 */
      .katex .mtable {
        margin: 6px 0 !important;
      }

      /* 悬浮状态 */
      .katex-display:hover,
      .voyager-math-block:hover {
        background: var(--vl-hover-bg) !important;
        border-color: var(--vl-hover-border) !important;
        box-shadow: var(--vl-hover-shadow) !important;
      }

      /* 右上角悬浮角标 */
      .katex-display::after,
      .voyager-math-block::after {
        content: attr(data-voyager-badge);
        position: absolute;
        top: 6px;
        right: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        font-size: 11px;
        font-weight: 500;
        line-height: 1.35;
        padding: 2px 8px;
        border-radius: 5px;
        background: var(--vl-badge-bg);
        color: var(--vl-badge-fg);
        border: 1px solid var(--vl-badge-border);
        box-shadow: var(--vl-badge-shadow);
        opacity: 0;
        transform: translateY(-2px);
        transition: opacity 0.16s ease, transform 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
        pointer-events: none;
        white-space: nowrap;
        z-index: 10;
        letter-spacing: 0.01em;
      }

      .katex-display:hover::after,
      .voyager-math-block:hover::after {
        opacity: 1;
        transform: translateY(0);
      }

      /* 复制成功状态高亮反馈 */
      .katex-display.voyager-copied,
      .voyager-math-block.voyager-copied {
        border-color: var(--vl-copied-border) !important;
        background: var(--vl-copied-bg) !important;
      }
      .katex-display.voyager-copied::after,
      .voyager-math-block.voyager-copied::after {
        opacity: 1 !important;
        background: var(--vl-accent) !important;
        color: #FAF5EE !important;
        border-color: var(--vl-accent) !important;
      }

      /* ========== 行内公式 (:not(.katex-display) > .katex) ========== */
      :not(.katex-display) > .katex,
      .voyager-math-inline {
        position: relative !important;
        display: inline !important;
        padding: 0 2.5px !important;
        margin: 0 1px !important;
        background: transparent !important;
        border: none !important;
        border-radius: 3px !important;
        cursor: pointer !important;
        transition: background-color 0.15s ease !important;
        vertical-align: baseline !important;
        line-height: normal !important;
      }

      :not(.katex-display) > .katex:hover,
      .voyager-math-inline:hover {
        background: var(--vl-inline-hover) !important;
      }

      :not(.katex-display) > .katex.voyager-copied,
      .voyager-math-inline.voyager-copied {
        background: var(--vl-inline-copied) !important;
      }

      /* ========== 全局悬浮反馈 Toast ========== */
      #${TOAST_ID} {
        position: fixed;
        bottom: 28px;
        right: 24px;
        z-index: 999999;
        background: var(--vl-toast-bg);
        color: var(--vl-toast-fg);
        border: 1px solid var(--vl-toast-border);
        border-radius: 8px;
        padding: 8px 14px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        font-size: 12px;
        line-height: 1.5;
        box-shadow: var(--vl-toast-shadow);
        pointer-events: none;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        max-width: 480px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      #${TOAST_ID}.show {
        opacity: 1;
        transform: translateY(0);
      }
      #${TOAST_ID} .voyager-toast-icon {
        color: var(--vl-accent);
        font-weight: 700;
        font-size: 13px;
      }
      #${TOAST_ID} .voyager-toast-code {
        color: var(--vl-toast-code-fg);
        background: var(--vl-toast-code-bg);
        border: 1px solid var(--vl-toast-code-border);
        border-radius: 4px;
        padding: 1px 6px;
        margin-left: 4px;
        font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
        font-size: 11.5px;
      }
    `;

    let disposed = false;
    let globalObserver = null;
    let globalRafId = null;
    let domReadyHandler = null;
    let toastTimer = null;

    const activeTimeouts = new Set();
    const elementCopyTimers = new WeakMap();
    const shadowRefSet = new Set();
    const shadowRecords = new WeakMap(); // ShadowRoot -> { observer, rafId, ref }
    const pendingSubtrees = new Set();
    let fullScanQueued = false;

    function trackTimeout(fn, delay) {
      if (disposed) return null;
      const id = setTimeout(() => {
        activeTimeouts.delete(id);
        if (!disposed) fn();
      }, delay);
      activeTimeouts.add(id);
      return id;
    }

    function untrackTimeout(id) {
      if (id == null) return;
      clearTimeout(id);
      activeTimeouts.delete(id);
    }

    function clearNodeChildren(node) {
      if (typeof node.replaceChildren === 'function') {
        node.replaceChildren();
      } else {
        node.textContent = '';
      }
    }

    function injectStylesIntoRoot(targetRoot) {
      try {
        if (disposed || !targetRoot) return;
        const existing = targetRoot.querySelector ? targetRoot.querySelector('#' + STYLE_ID) : null;
        if (existing) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS_CONTENT;

        if (targetRoot === document) {
          (document.head || document.documentElement).appendChild(style);
        } else {
          targetRoot.appendChild(style);
        }
      } catch (_) {}
    }

    function showToast(title, preview) {
      try {
        if (disposed) return;
        let toast = document.getElementById(TOAST_ID);
        if (!toast) {
          toast = document.createElement('div');
          toast.id = TOAST_ID;
          (document.body || document.documentElement).appendChild(toast);
        }
        const cleanPreview = (preview || '').replace(/\s+/g, ' ').trim();
        const shortPreview = cleanPreview.length > 36 ? cleanPreview.slice(0, 36) + '...' : cleanPreview;

        clearNodeChildren(toast);

        const iconSpan = document.createElement('span');
        iconSpan.className = 'voyager-toast-icon';
        iconSpan.textContent = '✓';
        toast.appendChild(iconSpan);

        const textSpan = document.createElement('span');
        textSpan.textContent = title;
        toast.appendChild(textSpan);

        if (shortPreview) {
          const codeSpan = document.createElement('span');
          codeSpan.className = 'voyager-toast-code';
          codeSpan.textContent = shortPreview;
          toast.appendChild(codeSpan);
        }

        toast.classList.add('show');
        untrackTimeout(toastTimer);
        toastTimer = trackTimeout(() => {
          toastTimer = null;
          toast.classList.remove('show');
        }, 1600);
      } catch (_) {}
    }

    function extractLatex(node, { preferFresh = false, depth = 0 } = {}) {
      if (!node || depth > 4) return null;
      try {
        if (!preferFresh && node.getAttribute) {
          const cached =
            node.getAttribute('data-voyager-latex') ||
            node.getAttribute('data-latex') ||
            node.getAttribute('data-tex');
          if (cached) return cached.trim();
        }

        if (node.querySelector) {
          const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
          if (annotation && annotation.textContent) {
            return annotation.textContent.trim();
          }

          const mathEl = node.querySelector('math[alttext]');
          if (mathEl && mathEl.getAttribute('alttext')) {
            return mathEl.getAttribute('alttext').trim();
          }

          const mathAriaEl = node.querySelector('math[aria-label]');
          if (mathAriaEl && mathAriaEl.getAttribute('aria-label')) {
            const mAria = mathAriaEl.getAttribute('aria-label');
            if (mAria.includes('\\') || mAria.includes('=')) {
              return mAria.trim();
            }
          }
        }

        if (node.getAttribute) {
          const cachedFallback =
            node.getAttribute('data-voyager-latex') ||
            node.getAttribute('data-latex') ||
            node.getAttribute('data-tex');
          if (cachedFallback) return cachedFallback.trim();

          const aria = node.getAttribute('aria-label');
          if (aria && aria.length <= 2000 && (aria.includes('\\') || aria.includes('='))) {
            return aria.trim();
          }
        }

        if (node.closest) {
          const katexParent = node.closest('.katex-display, .katex, .voyager-math-block, .voyager-math-inline');
          if (katexParent && katexParent !== node) {
            return extractLatex(katexParent, { preferFresh, depth: depth + 1 });
          }
        }
      } catch (_) {}
      return null;
    }

    function hasBlockDescendant(node) {
      return Boolean(node && node.querySelector && node.querySelector('.katex-display, .voyager-math-block'));
    }

    function isBlockMathElement(node) {
      return Boolean(
        node &&
          node.classList &&
          (node.classList.contains('katex-display') || node.classList.contains('voyager-math-block'))
      );
    }

    function updateStackedState(el) {
      try {
        const prev = el.previousElementSibling;
        let shouldStack = false;
        if (prev) {
          if (isBlockMathElement(prev) || hasBlockDescendant(prev)) {
            shouldStack = true;
          }
        } else if (el.parentElement) {
          const pPrev = el.parentElement.previousElementSibling;
          if (pPrev && (isBlockMathElement(pPrev) || hasBlockDescendant(pPrev))) {
            shouldStack = true;
          }
        }
        el.classList.toggle('voyager-math-stacked', shouldStack);

        // 若当前公式插在已有公式块之前，同步刷新紧邻后继块的防挤压间距
        const next = el.nextElementSibling;
        if (next) {
          if (isBlockMathElement(next)) {
            next.classList.add('voyager-math-stacked');
          } else if (next.querySelectorAll) {
            const nextBlocks = next.querySelectorAll('.katex-display, .voyager-math-block');
            if (nextBlocks.length > 0) nextBlocks[0].classList.add('voyager-math-stacked');
          }
        } else if (el.parentElement && el.parentElement.nextElementSibling) {
          const pNext = el.parentElement.nextElementSibling;
          if (isBlockMathElement(pNext)) {
            pNext.classList.add('voyager-math-stacked');
          } else if (pNext.querySelectorAll) {
            const pNextBlocks = pNext.querySelectorAll('.katex-display, .voyager-math-block');
            if (pNextBlocks.length > 0) pNextBlocks[0].classList.add('voyager-math-stacked');
          }
        }
      } catch (_) {}
    }

    function decorateBlockElement(el) {
      const tex = extractLatex(el, { preferFresh: true });
      if (tex) {
        if (el.getAttribute('data-voyager-latex') !== tex) {
          el.setAttribute('data-voyager-latex', tex);
        }
        if (!el.hasAttribute('data-voyager-badge')) {
          el.setAttribute('data-voyager-badge', BADGE_DEFAULT);
        }
        el.removeAttribute('title');
        el.setAttribute('data-voyager-ready', '1');
      }
      updateStackedState(el);
    }

    function decorateInlineElement(el) {
      const tex = extractLatex(el, { preferFresh: true });
      if (tex) {
        if (el.getAttribute('data-voyager-latex') !== tex) {
          el.setAttribute('data-voyager-latex', tex);
        }
        if (!el.hasAttribute('title') || el.hasAttribute('data-voyager-title')) {
          el.setAttribute('title', INLINE_TITLE);
          el.setAttribute('data-voyager-title', '1');
        }
        el.setAttribute('data-voyager-ready', '1');
      }
    }

    function registerShadowRoot(sr) {
      if (disposed || !sr || shadowRecords.has(sr)) return;
      injectStylesIntoRoot(sr);
      const ref = typeof WeakRef === 'function' ? new WeakRef(sr) : { deref: () => sr };
      shadowRefSet.add(ref);
      const record = {
        ref,
        observer: null,
        rafId: null,
        pending: new Set(),
        fullScan: true
      };
      const observer = new MutationObserver((records) => {
        if (disposed) return;
        for (let i = 0; i < records.length; i++) {
          const r = records[i];
          if (r.addedNodes && r.addedNodes.length) {
            for (let j = 0; j < r.addedNodes.length; j++) {
              const n = r.addedNodes[j];
              if (n && n.nodeType === 1) record.pending.add(n);
            }
          } else if (r.target && r.target.nodeType === 1) {
            record.pending.add(r.target);
          }
        }
        if (record.rafId !== null) return;
        record.rafId = requestAnimationFrame(() => {
          record.rafId = null;
          if (disposed) return;
          if (record.fullScan) {
            record.fullScan = false;
            record.pending.clear();
            decorateSubtree(sr, { scanAllForShadow: true });
            return;
          }
          const nodes = Array.from(record.pending);
          record.pending.clear();
          for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].isConnected) {
              decorateSubtree(nodes[i], { scanAllForShadow: true });
            }
          }
        });
      });
      observer.observe(sr, { childList: true, subtree: true });
      record.observer = observer;
      shadowRecords.set(sr, record);
      decorateSubtree(sr, { scanAllForShadow: true });
    }

    function decorateSubtree(root, { scanAllForShadow = false } = {}) {
      if (disposed || !root) return;
      try {
        if (root === document || (typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot)) {
          injectStylesIntoRoot(root);
        }

        if (root.nodeType === 1) {
          if (isBlockMathElement(root)) {
            decorateBlockElement(root);
          } else if (root.classList && root.classList.contains('katex') && !root.closest('.katex-display, .voyager-math-block')) {
            decorateInlineElement(root);
          } else if (root.closest) {
            const ancestorBlock = root.closest('.katex-display, .voyager-math-block');
            if (ancestorBlock) {
              decorateBlockElement(ancestorBlock);
            } else {
              const ancestorInline = root.closest('.katex');
              if (ancestorInline && !ancestorInline.closest('.katex-display, .voyager-math-block')) {
                decorateInlineElement(ancestorInline);
              }
            }
          }
        }

        if (root.querySelectorAll) {
          const blockNodes = root.querySelectorAll('.katex-display:not([data-voyager-ready]), .voyager-math-block:not([data-voyager-ready])');
          for (let i = 0; i < blockNodes.length; i++) {
            decorateBlockElement(blockNodes[i]);
          }

          const inlineNodes = root.querySelectorAll(':not(.katex-display) > .katex:not([data-voyager-ready])');
          for (let i = 0; i < inlineNodes.length; i++) {
            if (!inlineNodes[i].closest || !inlineNodes[i].closest('.katex-display, .voyager-math-block')) {
              decorateInlineElement(inlineNodes[i]);
            }
          }

          if (scanAllForShadow) {
            if (root.nodeType === 1 && root.shadowRoot) {
              registerShadowRoot(root.shadowRoot);
            }
            const allElements = root.querySelectorAll('*');
            for (let i = 0; i < allElements.length; i++) {
              const sr = allElements[i].shadowRoot;
              if (sr) registerShadowRoot(sr);
            }
          }
        }
      } catch (_) {}
    }

    async function copyToClipboard(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (_) {}
      let ta = null;
      try {
        ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        (document.body || document.documentElement).appendChild(ta);
        ta.select();
        return document.execCommand('copy');
      } catch (_) {
        return false;
      } finally {
        if (ta && ta.parentNode) {
          try { ta.parentNode.removeChild(ta); } catch (_) {}
        }
      }
    }

    async function onDocumentClick(e) {
      try {
        if (disposed) return;
        if (typeof e.button === 'number' && e.button !== 0) return;
        const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
        for (let i = 0; i < path.length; i++) {
          const el = path[i];
          if (el && el.nodeType === 1) {
            if (
              el.isContentEditable ||
              (typeof el.closest === 'function' &&
                el.closest('[contenteditable="true"], [contenteditable=""], a[href], button, [role="button"], input, textarea, select')) ||
              /^(INPUT|TEXTAREA|SELECT|A|BUTTON)$/.test(el.tagName)
            ) {
              return;
            }
          }
        }

        const sel = window.getSelection();
        if (sel && sel.toString().trim().length > 0) return;

        let target = null;
        let blockContainer = null;

        for (let i = 0; i < path.length; i++) {
          const el = path[i];
          if (!el || !el.classList) continue;

          if (el.classList.contains('katex-display') || el.classList.contains('voyager-math-block')) {
            blockContainer = el;
            if (!target) target = el;
            break;
          } else if (el.classList.contains('katex') || el.classList.contains('voyager-math-inline')) {
            if (!target) target = el;
          }
        }

        if (!target) return;

        const container = blockContainer || target;
        const isBlock =
          container.classList.contains('katex-display') ||
          container.classList.contains('voyager-math-block');

        const rawLatex =
          extractLatex(container, { preferFresh: true }) ||
          extractLatex(target, { preferFresh: true });
        if (!rawLatex) return;

        e.preventDefault();

        const finalCopy = e.altKey
          ? isBlock
            ? `$$\n${rawLatex}\n$$`
            : `$${rawLatex}$`
          : rawLatex;

        await copyToClipboard(finalCopy);
        if (disposed) return;

        container.classList.add('voyager-copied');
        if (isBlock) {
          container.setAttribute('data-voyager-badge', e.altKey ? '✓ 已复制 $$' : '✓ 已复制');
        }
        showToast(e.altKey ? '已复制带定界符公式' : '已复制 LaTeX 源码', finalCopy);

        const prevTimer = elementCopyTimers.get(container);
        if (prevTimer) untrackTimeout(prevTimer);
        const timerId = trackTimeout(() => {
          elementCopyTimers.delete(container);
          container.classList.remove('voyager-copied');
          if (isBlock) {
            container.setAttribute('data-voyager-badge', BADGE_DEFAULT);
          }
        }, 1400);
        if (timerId) elementCopyTimers.set(container, timerId);
      } catch (_) {}
    }

    function serializeFragmentToText(node) {
      let text = '';
      function walk(n) {
        if (n.nodeType === 3) {
          text += n.nodeValue;
          return;
        }
        if (n.nodeType === 11) {
          for (let child = n.firstChild; child; child = child.nextSibling) {
            walk(child);
          }
          return;
        }
        if (n.nodeType !== 1) return;
        const tag = n.tagName.toUpperCase();
        if (tag === 'BR') {
          text += '\n';
          return;
        }
        if (tag === 'TD' || tag === 'TH') {
          if (n.previousElementSibling && text.length > 0 && !text.endsWith('\n') && !text.endsWith('\t')) {
            text += '\t';
          }
          for (let child = n.firstChild; child; child = child.nextSibling) {
            walk(child);
          }
          return;
        }
        const isBlock = /^(P|DIV|H[1-6]|LI|TR|BLOCKQUOTE|PRE|HR)$/.test(tag);
        if (isBlock && text.length > 0 && !text.endsWith('\n')) {
          text += '\n';
        }
        for (let child = n.firstChild; child; child = child.nextSibling) {
          walk(child);
        }
        if (isBlock && text.length > 0 && !text.endsWith('\n')) {
          text += '\n';
        }
      }
      walk(node);
      return text.replace(/\n{3,}/g, '\n\n').trim();
    }

    function getDeepActiveElement() {
      let active = document.activeElement;
      let guard = 0;
      while (active && active.shadowRoot && active.shadowRoot.activeElement && guard++ < 10) {
        active = active.shadowRoot.activeElement;
      }
      return active;
    }

    function onDocumentCopy(e) {
      try {
        if (disposed) return;
        const active = getDeepActiveElement();
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
          return;
        }

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        const frag = range.cloneContents();
        if (!frag.querySelector('.katex, .voyager-math-block, .voyager-math-inline')) return;

        frag.querySelectorAll('.katex-display, .voyager-math-block').forEach((el) => {
          const tex = extractLatex(el, { preferFresh: true });
          if (tex && el.parentNode) {
            el.parentNode.replaceChild(document.createTextNode(`\n\n$$\n${tex}\n$$\n\n`), el);
          }
        });

        frag.querySelectorAll('.katex, .voyager-math-inline').forEach((el) => {
          const tex = extractLatex(el, { preferFresh: true });
          if (tex && el.parentNode) {
            el.parentNode.replaceChild(document.createTextNode(`$${tex}$`), el);
          }
        });

        const cleanText = serializeFragmentToText(frag);
        if (cleanText && e.clipboardData) {
          e.clipboardData.setData('text/plain', cleanText);
          e.preventDefault();
          showToast('✓ 已复制选中文本（公式已还原为 Markdown）', '');
        }
      } catch (_) {}
    }

    function flushGlobalPending() {
      globalRafId = null;
      if (disposed) return;
      if (fullScanQueued) {
        fullScanQueued = false;
        pendingSubtrees.clear();
        decorateSubtree(document, { scanAllForShadow: true });
        return;
      }
      const nodes = Array.from(pendingSubtrees);
      pendingSubtrees.clear();
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node && node.isConnected) {
          decorateSubtree(node, { scanAllForShadow: true });
        }
      }
    }

    function scheduleGlobalDecoration(records) {
      if (disposed) return;
      if (Array.isArray(records) && records.length > 0) {
        for (let i = 0; i < records.length; i++) {
          const r = records[i];
          if (r.addedNodes && r.addedNodes.length) {
            for (let j = 0; j < r.addedNodes.length; j++) {
              const n = r.addedNodes[j];
              if (n && n.nodeType === 1) {
                if (n.id === TOAST_ID || n.id === STYLE_ID) continue;
                pendingSubtrees.add(n);
              }
            }
          } else if (r.target && r.target.nodeType === 1) {
            if (r.target.id === TOAST_ID) continue;
            pendingSubtrees.add(r.target);
          }
        }
        if (pendingSubtrees.size === 0 && !fullScanQueued) return;
      } else {
        fullScanQueued = true;
      }

      if (globalRafId !== null) return;
      globalRafId = requestAnimationFrame(flushGlobalPending);
    }

    function cleanRootArtifacts(root) {
      if (!root) return;
      try {
        if (root.querySelector) {
          const styleEl = root.querySelector('#' + STYLE_ID);
          if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        }
        if (root.querySelectorAll) {
          const decorated = root.querySelectorAll('[data-voyager-ready], [data-voyager-latex], [data-voyager-badge], .voyager-math-stacked, .voyager-copied');
          for (let i = 0; i < decorated.length; i++) {
            const el = decorated[i];
            el.removeAttribute('data-voyager-ready');
            el.removeAttribute('data-voyager-latex');
            el.removeAttribute('data-voyager-badge');
            if (el.hasAttribute('data-voyager-title')) {
              el.removeAttribute('title');
              el.removeAttribute('data-voyager-title');
            }
            el.classList.remove('voyager-math-stacked', 'voyager-copied');
          }
        }
      } catch (_) {}
    }

    function dispose() {
      if (disposed) return;
      disposed = true;

      if (globalRafId !== null) {
        try { cancelAnimationFrame(globalRafId); } catch (_) {}
        globalRafId = null;
      }
      pendingSubtrees.clear();

      if (globalObserver) {
        try { globalObserver.disconnect(); } catch (_) {}
        globalObserver = null;
      }

      for (const ref of shadowRefSet) {
        const sr = ref.deref();
        if (!sr) continue;
        const rec = shadowRecords.get(sr);
        if (rec) {
          if (rec.rafId !== null) {
            try { cancelAnimationFrame(rec.rafId); } catch (_) {}
            rec.rafId = null;
          }
          rec.pending.clear();
          if (rec.observer) {
            try { rec.observer.disconnect(); } catch (_) {}
          }
          shadowRecords.delete(sr);
        }
        cleanRootArtifacts(sr);
      }
      shadowRefSet.clear();

      for (const timerId of activeTimeouts) {
        clearTimeout(timerId);
      }
      activeTimeouts.clear();
      toastTimer = null;

      try { document.removeEventListener('click', onDocumentClick, true); } catch (_) {}
      try { document.removeEventListener('copy', onDocumentCopy); } catch (_) {}
      if (domReadyHandler) {
        try { document.removeEventListener('DOMContentLoaded', domReadyHandler); } catch (_) {}
        domReadyHandler = null;
      }

      cleanRootArtifacts(document);

      try {
        const toast = document.getElementById(TOAST_ID);
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
      } catch (_) {}

      try {
        delete window.__VOYAGER_LATEX_INITIALIZED__;
        delete window.__VOYAGER_LATEX_VERSION__;
        delete window.__VOYAGER_LATEX_DISPOSE__;
      } catch (_) {
        window.__VOYAGER_LATEX_INITIALIZED__ = false;
      }
    }

    window.__VOYAGER_LATEX_DISPOSE__ = dispose;

    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('copy', onDocumentCopy);

    function initObserver() {
      if (disposed) return;
      try {
        decorateSubtree(document, { scanAllForShadow: true });
        globalObserver = new MutationObserver((records) => {
          scheduleGlobalDecoration(records);
        });
        globalObserver.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });
      } catch (_) {}
    }

    if (document.readyState === 'loading') {
      domReadyHandler = () => {
        domReadyHandler = null;
        initObserver();
      };
      document.addEventListener('DOMContentLoaded', domReadyHandler);
    } else {
      initObserver();
    }
  } catch (globalErr) {
    // 根级防御保护，绝对不向外抛出任何异常
  }
})();
