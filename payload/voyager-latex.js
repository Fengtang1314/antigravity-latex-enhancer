/**
 * ==============================================================================
 * Antigravity Voyager LaTeX Enhancer
 * 灵感来源: Gemini Voyager & 016/Antigravity-Better
 * 
 * 核心特性:
 *  1. 纯本地前端交互，零外部网络请求，零 Token/RPC 触碰
 *  2. 行内/块级 KaTeX 公式卡片化美化（适配浅色/深色主题）
 *  3. 单击公式一键复制纯 LaTeX 源码；按住 Option/Alt 点击复制带 $/$$ 定界符源码
 *  4. 选区 Cmd+C 智能拦截还原，杜绝公式复制乱码与重影
 *  5. 全流程 try...catch 防御性封装，任何异常静默降级，绝不影响客户端正常运行
 * ==============================================================================
 */
(function () {
  'use strict';

  if (window.__VOYAGER_LATEX_INITIALIZED__) return;
  window.__VOYAGER_LATEX_INITIALIZED__ = true;

  try {
    // 1. 注入 Voyager 风格卡片 CSS 样式
    const STYLE_ID = 'voyager-latex-styles';
    function injectStyles() {
      try {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
          /* ========== 块级公式 (.katex-display / .voyager-math-block) 代码块卡片 ========== */
          .katex-display,
          .voyager-math-block {
            position: relative !important;
            display: block !important;
            margin: 12px 0 !important;
            padding: 14px 18px !important;
            background: rgba(128, 128, 128, 0.08) !important;
            border: 1px solid rgba(128, 128, 128, 0.22) !important;
            border-radius: 8px !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            cursor: pointer !important;
            transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease !important;
            user-select: text !important;
          }

          .katex-display:hover,
          .voyager-math-block:hover {
            background: rgba(77, 159, 255, 0.09) !important;
            border-color: rgba(77, 159, 255, 0.55) !important;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12) !important;
          }

          /* 右上角悬浮提示角标 */
          .katex-display::after,
          .voyager-math-block::after {
            content: attr(data-voyager-badge);
            position: absolute;
            top: 6px;
            right: 8px;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
            font-size: 11px;
            font-weight: 500;
            line-height: 1.4;
            padding: 2px 7px;
            border-radius: 4px;
            background: rgba(30, 30, 30, 0.85);
            color: #e6edf3;
            border: 1px solid rgba(255, 255, 255, 0.16);
            opacity: 0;
            transform: translateY(-2px);
            transition: opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease;
            pointer-events: none;
            white-space: nowrap;
            z-index: 10;
          }

          .katex-display:hover::after,
          .voyager-math-block:hover::after {
            opacity: 1;
            transform: translateY(0);
          }

          /* 复制成功状态高亮反馈 */
          .katex-display.voyager-copied,
          .voyager-math-block.voyager-copied {
            border-color: rgba(46, 204, 113, 0.85) !important;
            background: rgba(46, 204, 113, 0.12) !important;
          }
          .katex-display.voyager-copied::after,
          .voyager-math-block.voyager-copied::after {
            opacity: 1 !important;
            background: rgba(39, 174, 96, 0.95) !important;
            color: #ffffff !important;
            border-color: rgba(255, 255, 255, 0.3) !important;
          }

          /* ========== 行内公式 (:not(.katex-display) > .katex) 胶囊卡片 ========== */
          :not(.katex-display) > .katex,
          .voyager-math-inline {
            position: relative;
            display: inline-block;
            padding: 1px 6px !important;
            margin: 0 2px !important;
            background: rgba(128, 128, 128, 0.12) !important;
            border: 1px solid rgba(128, 128, 128, 0.22) !important;
            border-radius: 5px !important;
            cursor: pointer !important;
            transition: background-color 0.16s ease, border-color 0.16s ease !important;
            vertical-align: baseline;
          }

          :not(.katex-display) > .katex:hover,
          .voyager-math-inline:hover {
            background: rgba(77, 159, 255, 0.16) !important;
            border-color: rgba(77, 159, 255, 0.65) !important;
          }

          :not(.katex-display) > .katex.voyager-copied,
          .voyager-math-inline.voyager-copied {
            background: rgba(46, 204, 113, 0.22) !important;
            border-color: rgba(46, 204, 113, 0.88) !important;
          }

          /* 全局悬浮反馈 Toast */
          #voyager-latex-toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            background: rgba(24, 26, 31, 0.95);
            color: #f0f6fc;
            border: 1px solid rgba(77, 159, 255, 0.45);
            border-radius: 8px;
            padding: 8px 14px;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", monospace;
            font-size: 12px;
            box-shadow: 0 6px 22px rgba(0, 0, 0, 0.38);
            pointer-events: none;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 0.18s ease, transform 0.18s ease;
            max-width: 450px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          #voyager-latex-toast.show {
            opacity: 1;
            transform: translateY(0);
          }
          #voyager-latex-toast .voyager-toast-code {
            color: #79c0ff;
            margin-left: 6px;
            font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
          }
        `;
        (document.head || document.documentElement).appendChild(style);
      } catch (e) {
        // 静默保护
      }
    }

    // 2. 右下角轻量 Toast 提示
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
        const shortPreview = cleanPreview.length > 40 ? cleanPreview.slice(0, 40) + '...' : cleanPreview;
        toast.textContent = title + ' ';
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

    // 3. 从 DOM 节点提取原始 LaTeX 源码
    function extractLatex(node) {
      if (!node) return null;
      try {
        const cached = node.getAttribute('data-voyager-latex') || node.getAttribute('data-latex');
        if (cached) return cached.trim();

        const annotation = node.querySelector('annotation[encoding="application/x-tex"]');
        if (annotation && annotation.textContent) {
          return annotation.textContent.trim();
        }

        const mathEl = node.querySelector('math[alttext]');
        if (mathEl && mathEl.getAttribute('alttext')) {
          return mathEl.getAttribute('alttext').trim();
        }

        const katexParent = node.closest('.katex-display, .katex, .voyager-math-block, .voyager-math-inline');
        if (katexParent && katexParent !== node) {
          return extractLatex(katexParent);
        }
      } catch (e) {}
      return null;
    }

    // 4. 为已渲染的 KaTeX 节点打上标记与角标
    function decorateKatexNodes(root) {
      if (!root) return;
      try {
        const blockNodes = root.querySelectorAll ? root.querySelectorAll('.katex-display:not([data-voyager-ready])') : [];
        blockNodes.forEach((el) => {
          const tex = extractLatex(el);
          if (tex) {
            el.setAttribute('data-voyager-latex', tex);
            el.setAttribute('data-voyager-badge', '📋 点击复制 LaTeX');
            el.setAttribute('title', '点击复制纯 LaTeX 源码\n按住 Option (Alt) 点击复制带 $$ 定界符源码');
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

        // 递归穿透 Shadow DOM
        const allElements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (let i = 0; i < allElements.length; i++) {
          if (allElements[i].shadowRoot) {
            decorateKatexNodes(allElements[i].shadowRoot);
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

    // 6. 全局捕获点击事件：点击任意公式触发复制
    document.addEventListener(
      'click',
      async function (e) {
        try {
          const sel = window.getSelection();
          if (sel && sel.toString().trim().length > 0) return;

          const target = e.target.closest ? e.target.closest('.katex-display, .katex, .voyager-math-block, .voyager-math-inline') : null;
          if (!target) return;

          const container = target.closest('.katex-display, .voyager-math-block') || target;
          const isBlock = container.classList.contains('katex-display') || container.classList.contains('voyager-math-block');

          const rawLatex = extractLatex(container);
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
              e.altKey ? '✓ 已复制 $$...$$' : '✓ 已复制 LaTeX 源码'
            );
          }
          showToast(e.altKey ? '✓ 已复制带定界符公式:' : '✓ 已复制纯 LaTeX 源码:', finalCopy);

          setTimeout(() => {
            container.classList.remove('voyager-copied');
            if (isBlock) {
              container.setAttribute('data-voyager-badge', '📋 点击复制 LaTeX');
            }
          }, 1500);
        } catch (err) {}
      },
      true
    );

    // 7. 拦截 Cmd+C 框选复制：将选中区域公式还原为 Markdown 源码
    document.addEventListener('copy', function (e) {
      try {
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

    // 8. 启动 MutationObserver 监听
    function initObserver() {
      try {
        injectStyles();
        decorateKatexNodes(document.body || document.documentElement);

        const observer = new MutationObserver(() => {
          decorateKatexNodes(document.body || document.documentElement);
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
    // 根级保护，绝对不向外抛出任何异常
  }
})();
