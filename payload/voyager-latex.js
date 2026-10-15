/**
 * ==============================================================================
 * Antigravity Voyager LaTeX Enhancer (v2.1 对抗性加固终极版)
 * 灵感来源: Gemini Voyager & 016/Antigravity-Better
 * 
 * 核心特性与架构加固:
 *  1. 完整穿透 Shadow DOM: 样式同步注入 shadowRoot，MutationObserver 深度监听
 *  2. 采用 e.composedPath() 跨越 Shadow 边界捕获点击，彻底解决事件重定向丢失问题
 *  3. requestAnimationFrame 帧率节流调度: 杜绝 AI 高速流式生成时的 DOM 重复扫描与 CPU 飙高
 *  4. 输入框/编辑器绝对免疫: INPUT / TEXTAREA / contentEditable 状态下绝对不干预原生复制
 *  5. 多源 LaTeX 源码提取: 支持 annotation / alttext / data-tex / data-latex / aria-label 多重兜底
 *  6. 纯本地前端交互，零外部网络请求，零 Token/RPC 触碰
 *  7. 行内/块级 KaTeX 公式卡片化美化（适配浅色/深色主题）
 *  8. 单击公式一键复制纯 LaTeX 源码；按住 Option/Alt 点击复制带 $/$$ 定界符源码
 *  9. 选区 Cmd+C 智能拦截还原，杜绝公式复制乱码与重影
 *  10. 全流程 try...catch 防御性封装，任何异常静默降级，绝不影响客户端正常运行
 * ==============================================================================
 */
(function () {
  'use strict';

  if (window.__VOYAGER_LATEX_INITIALIZED__) return;
  window.__VOYAGER_LATEX_INITIALIZED__ = true;

  try {
    const STYLE_ID = 'voyager-latex-styles';
    const CSS_CONTENT = `
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
      /* 常态：完全透明，无边框，无底色，绝对纯净居中，融入 Claude 极简风温润质感 */
      .katex-display,
      .voyager-math-block {
        position: relative !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        text-align: center !important;
        width: 100% !important;
        box-sizing: border-box !important;
        margin: 18px 0 !important;
        padding: 16px 22px !important;
        line-height: normal !important;
        background: transparent !important;
        border: 1px solid transparent !important;
        border-radius: 8px !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        cursor: pointer !important;
        transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease !important;
        user-select: text !important;
      }

      .katex-display > .katex {
        display: inline-flex !important;
        justify-content: center !important;
        align-items: center !important;
        text-align: center !important;
        line-height: normal !important;
        margin: 0 auto !important;
      }

      /* 针对矩阵与对齐环境 (aligned / matrix / cases) 提供安全外边距缓冲 */
      .katex .mtable {
        margin: 4px 0 !important;
      }

      /* 悬浮状态：微淡温润底色与 Claude 陶土橙细致边框 (#D97757) */
      .katex-display:hover,
      .voyager-math-block:hover {
        background: rgba(20, 20, 19, 0.02) !important;
        border-color: rgba(217, 119, 87, 0.28) !important;
        box-shadow: 0 2px 10px rgba(20, 20, 19, 0.03) !important;
      }

      /* 右上角悬浮角标：极简 Claude 纸面风格 (#FAF5EE 背景、#141413 文字、#D97757 强调色细边) */
      .katex-display::after,
      .voyager-math-block::after {
        content: attr(data-voyager-badge);
        position: absolute;
        top: 8px;
        right: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        font-size: 11px;
        font-weight: 500;
        line-height: 1.4;
        padding: 3px 8px;
        border-radius: 5px;
        background: #FAF5EE;
        color: #141413;
        border: 1px solid rgba(217, 119, 87, 0.35);
        box-shadow: 0 2px 6px rgba(20, 20, 19, 0.06);
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

      /* 复制成功状态高亮反馈：Claude 陶土色高亮 */
      .katex-display.voyager-copied,
      .voyager-math-block.voyager-copied {
        border-color: rgba(217, 119, 87, 0.55) !important;
        background: rgba(217, 119, 87, 0.06) !important;
      }
      .katex-display.voyager-copied::after,
      .voyager-math-block.voyager-copied::after {
        opacity: 1 !important;
        background: #D97757 !important;
        color: #FAF5EE !important;
        border-color: #D97757 !important;
      }

      /* ========== 行内公式 (:not(.katex-display) > .katex) ========== */
      :not(.katex-display) > .katex,
      .voyager-math-inline {
        position: relative !important;
        display: inline !important;
        padding: 0 2px !important;
        margin: 0 !important;
        background: transparent !important;
        border: none !important;
        border-radius: 3px !important;
        cursor: pointer !important;
        transition: background-color 0.15s ease !important;
        vertical-align: baseline !important;
      }

      /* 行内公式悬浮状态：微弱陶土橙浅底色 */
      :not(.katex-display) > .katex:hover,
      .voyager-math-inline:hover {
        background: rgba(217, 119, 87, 0.12) !important;
      }

      /* 行内公式复制成功 */
      :not(.katex-display) > .katex.voyager-copied,
      .voyager-math-inline.voyager-copied {
        background: rgba(217, 119, 87, 0.25) !important;
      }

      /* ========== 全局悬浮反馈 Toast（极简 Claude 暖白纸面风） ========== */
      #voyager-latex-toast {
        position: fixed;
        bottom: 28px;
        right: 24px;
        z-index: 999999;
        background: #FAF5EE;
        color: #141413;
        border: 1px solid rgba(217, 119, 87, 0.38);
        border-radius: 8px;
        padding: 8px 14px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        font-size: 12px;
        line-height: 1.5;
        box-shadow: 0 6px 20px rgba(20, 20, 19, 0.09), 0 1px 3px rgba(20, 20, 19, 0.05);
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
      #voyager-latex-toast.show {
        opacity: 1;
        transform: translateY(0);
      }
      #voyager-latex-toast .voyager-toast-icon {
        color: #D97757;
        font-weight: 700;
        font-size: 13px;
      }
      #voyager-latex-toast .voyager-toast-code {
        color: #b85b3b;
        background: rgba(217, 119, 87, 0.08);
        border: 1px solid rgba(217, 119, 87, 0.2);
        border-radius: 4px;
        padding: 1px 6px;
        margin-left: 4px;
        font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
        font-size: 11.5px;
      }
    `;

    // 1. 样式注入函数：支持向 Document 或 ShadowRoot 内部安全注入
    function injectStylesIntoRoot(targetRoot) {
      try {
        if (!targetRoot) return;
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
      } catch (e) {}
    }

    // 2. 右下角轻量 Toast 提示（极简 Claude 暖色版）
    let toastTimer = null;
    function showToast(title, preview) {
      try {
        let toast = document.getElementById('voyager-latex-toast');
        if (!toast) {
          toast = document.createElement('div');
          toast.id = 'voyager-latex-toast';
          (document.body || document.documentElement).appendChild(toast);
        }
        const cleanPreview = (preview || '').replace(/\s+/g, ' ').trim();
        const shortPreview = cleanPreview.length > 36 ? cleanPreview.slice(0, 36) + '...' : cleanPreview;
        
        toast.innerHTML = '';
        
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
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          toast.classList.remove('show');
        }, 1600);
      } catch (e) {}
    }

    // 3. 从 DOM 节点提取原始 LaTeX 源码（多源防御式读取）
    function extractLatex(node) {
      if (!node) return null;
      try {
        // A. 缓存属性优先
        const cached = node.getAttribute('data-voyager-latex') || node.getAttribute('data-latex') || node.getAttribute('data-tex');
        if (cached) return cached.trim();

        // B. KaTeX 标准 MathML 语义注解标签
        const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
        if (annotation && annotation.textContent) {
          return annotation.textContent.trim();
        }

        // C. math alttext / aria-label 属性
        const mathEl = node.querySelector('math[alttext]');
        if (mathEl && mathEl.getAttribute('alttext')) {
          return mathEl.getAttribute('alttext').trim();
        }

        const aria = node.getAttribute('aria-label') || (mathEl && mathEl.getAttribute('aria-label'));
        if (aria && (aria.includes('\\') || aria.includes('='))) {
          return aria.trim();
        }

        // D. 递归向上查找父级
        const katexParent = node.closest('.katex-display, .katex, .voyager-math-block, .voyager-math-inline');
        if (katexParent && katexParent !== node) {
          return extractLatex(katexParent);
        }
      } catch (e) {}
      return null;
    }

    // 追踪所有已被监听的 ShadowRoot，防止重复绑定
    const observedShadowRoots = new WeakSet();

    // 4. 深度遍历并装饰 KaTeX 节点（支持穿透 Shadow DOM）
    function decorateKatexNodes(root) {
      if (!root) return;
      try {
        injectStylesIntoRoot(root);

        const blockNodes = root.querySelectorAll ? root.querySelectorAll('.katex-display:not([data-voyager-ready])') : [];
        blockNodes.forEach((el) => {
          const tex = extractLatex(el);
          if (tex) {
            el.setAttribute('data-voyager-latex', tex);
            el.setAttribute('data-voyager-badge', '📋 复制 LaTeX');
            el.removeAttribute('title');
            el.setAttribute('data-voyager-ready', '1');
          }
        });

        const inlineNodes = root.querySelectorAll ? root.querySelectorAll(':not(.katex-display) > .katex:not([data-voyager-ready])') : [];
        inlineNodes.forEach((el) => {
          const tex = extractLatex(el);
          if (tex) {
            el.setAttribute('data-voyager-latex', tex);
            el.setAttribute('title', '点击复制纯 LaTeX 源码\n按住 Option (Alt) 点击复制带 $ 定界符源码');
            el.setAttribute('data-voyager-ready', '1');
          }
        });

        // 递归穿透并监听所有子级 ShadowRoot
        const allElements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (let i = 0; i < allElements.length; i++) {
          const sr = allElements[i].shadowRoot;
          if (sr) {
            if (!observedShadowRoots.has(sr)) {
              observedShadowRoots.add(sr);
              injectStylesIntoRoot(sr);
              // 对 shadowRoot 挂载独立观察器（带 rAF 节流）
              let shadowRaf = false;
              const shadowObserver = new MutationObserver(() => {
                if (shadowRaf) return;
                shadowRaf = true;
                requestAnimationFrame(() => {
                  shadowRaf = false;
                  decorateKatexNodes(sr);
                });
              });
              shadowObserver.observe(sr, { childList: true, subtree: true });
            }
            decorateKatexNodes(sr);
          }
        }
      } catch (e) {}
    }

    // 5. 写入剪贴板函数
    async function copyToClipboard(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (_) {}
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) {
        return false;
      }
    }

    // 6. 全局捕获点击事件：改用 e.composedPath() 跨越 Shadow DOM 边界寻找公式目标
    document.addEventListener(
      'click',
      async function (e) {
        try {
          const sel = window.getSelection();
          if (sel && sel.toString().trim().length > 0) return;

          // 核心加固：使用 composedPath() 穿透 Shadow DOM，避免 e.target 被重定向为 Shadow Host
          const path = (typeof e.composedPath === 'function') ? e.composedPath() : [e.target];
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
          const isBlock = container.classList.contains('katex-display') || container.classList.contains('voyager-math-block');

          const rawLatex = extractLatex(container) || extractLatex(target);
          if (!rawLatex) return;

          e.preventDefault();
          e.stopPropagation();

          const finalCopy = e.altKey
            ? isBlock
              ? `$$\n${rawLatex}\n$$`
              : `$${rawLatex}$`
            : rawLatex;

          await copyToClipboard(finalCopy);

          container.classList.add('voyager-copied');
          if (isBlock) {
            container.setAttribute(
              'data-voyager-badge',
              e.altKey ? '✓ 已复制 $$' : '✓ 已复制'
            );
          }
          showToast(e.altKey ? '已复制带定界符公式' : '已复制 LaTeX 源码', finalCopy);

          setTimeout(() => {
            container.classList.remove('voyager-copied');
            if (isBlock) {
              container.setAttribute('data-voyager-badge', '📋 复制 LaTeX');
            }
          }, 1400);
        } catch (err) {}
      },
      true
    );

    // 7. 拦截 Cmd+C 框选复制：将选区内的公式无缝还原为 Markdown 源码
    document.addEventListener('copy', function (e) {
      try {
        // 对抗加固：如果用户在输入框、文本域或可编辑区域操作，绝对不干预原生输入复制
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
          return;
        }

        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        const frag = range.cloneContents();
        if (!frag.querySelector('.katex, .voyager-math-block, .voyager-math-inline')) return;

        frag.querySelectorAll('.katex-display, .voyager-math-block').forEach((el) => {
          const tex = extractLatex(el);
          if (tex) {
            const replacement = document.createTextNode(`\n$$\n${tex}\n$$\n`);
            el.parentNode.replaceChild(replacement, el);
          }
        });

        frag.querySelectorAll('.katex, .voyager-math-inline').forEach((el) => {
          const tex = extractLatex(el);
          if (tex) {
            const replacement = document.createTextNode(`$${tex}$`);
            el.parentNode.replaceChild(replacement, el);
          }
        });

        const tempDiv = document.createElement('div');
        tempDiv.appendChild(frag);
        const cleanText = tempDiv.textContent || '';
        if (cleanText && e.clipboardData) {
          e.clipboardData.setData('text/plain', cleanText);
          e.preventDefault();
          showToast('✓ 已复制选中文本（公式已还原为 Markdown）', '');
        }
      } catch (err) {}
    });

    // 8. 启动全局 MutationObserver 监听（带 requestAnimationFrame 帧率节流）
    let globalRaf = false;
    function scheduleGlobalDecoration() {
      if (globalRaf) return;
      globalRaf = true;
      requestAnimationFrame(() => {
        globalRaf = false;
        decorateKatexNodes(document);
      });
    }

    function initObserver() {
      try {
        decorateKatexNodes(document);

        const observer = new MutationObserver(() => {
          scheduleGlobalDecoration();
        });

        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });
      } catch (e) {}
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initObserver);
    } else {
      initObserver();
    }
  } catch (globalErr) {
    // 根级防御保护，绝对不向外抛出任何异常
  }
})();
