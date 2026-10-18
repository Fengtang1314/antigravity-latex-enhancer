'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REPO = path.resolve(__dirname, '..');
const PAYLOAD = fs.readFileSync(path.join(REPO, 'payload', 'voyager-latex.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log('  PASS', name);
  } else {
    fail++;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('  FAIL', name, detail || '');
  }
}
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

function katex(tex, kind) {
  const mathml = `<span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span>`;
  const vis = `<span class="katex-html" aria-hidden="true">VIS:${tex}</span>`;
  return `<span class="katex">${mathml}${vis}</span>`;
}
function display(tex, id) {
  return `<span class="katex-display"${id ? ` id="${id}"` : ''}>${katex(tex)}</span>`;
}

function makeDom(bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://localhost/'
  });
  const { window } = dom;
  const clipboard = [];
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t) => { clipboard.push(t); } }
  });
  window.document.execCommand = () => true;
  window.eval(PAYLOAD);
  return { dom, window, doc: window.document, clipboard };
}

(async () => {
  console.log('\n=== P1 decoration: blocks, inline, stacked, style injection ===');
  {
    const { window, doc } = makeDom(`
      <p id="p1">Before ${katex('x^2')} after.</p>
      <div id="d1">${display('E=mc^2', 'disp1')}</div>
      <div id="d2">${display('a+b', 'disp2')}</div>
      <div id="d3">${display('c-d', 'disp3')}</div>
      <div id="ce" contenteditable="true">${katex('z+1')}</div>
      <a href="https://example.com/" id="link">${katex('l=1')}</a>
      <div id="dl"><span class="katex" data-latex="q_1">no annotation</span></div>
      <div id="none"><span class="katex"><span class="katex-html">no source at all</span></span></div>
    `);
    await tick(120);
    const inline = doc.querySelector('#p1 .katex');
    check('style element injected', !!doc.getElementById('voyager-latex-styles'));
    check('inline TeX extracted from annotation', inline.getAttribute('data-voyager-latex') === 'x^2');
    check('inline gets native title tooltip', !!inline.getAttribute('title'));
    check('block TeX extracted', doc.getElementById('disp1').getAttribute('data-voyager-latex') === 'E=mc^2');
    check('block badge set', doc.getElementById('disp1').getAttribute('data-voyager-badge') === '📋 复制 LaTeX');
    check('block removes native title', !doc.getElementById('disp1').getAttribute('title'));
    check('second block marked stacked', doc.getElementById('disp2').classList.contains('voyager-math-stacked'));
    check('third block marked stacked', doc.getElementById('disp3').classList.contains('voyager-math-stacked'));
    check('data-latex fallback works', doc.querySelector('#dl .katex').getAttribute('data-voyager-latex') === 'q_1');
    check('unresolvable math left undecorated', !doc.querySelector('#none .katex').getAttribute('data-voyager-latex'));
    check('window init flag set once', window.__VOYAGER_LATEX_INITIALIZED__ === true);
  }

  console.log('\n=== P2 MutationObserver decorates streaming nodes ===');
  {
    const { window, doc } = makeDom('<div id="stream"></div>');
    await tick(60);
    doc.getElementById('stream').innerHTML = display('new=1', 'newdisp');
    await tick(120);
    check('late-arriving formula decorated', doc.getElementById('newdisp').getAttribute('data-voyager-latex') === 'new=1');
  }

  console.log('\n=== P3 click-to-copy & event whitelist (M2加固) ===');
  {
    const baseBody = `
      <p id="p1">Before ${katex('x^2')} after.</p>
      <div id="d1">${display('E=mc^2', 'disp1')}</div>
      <div contenteditable="true" id="ce">${katex('z+1', 'ce')}</div>
      <a href="https://example.com/" id="link">${katex('l=1')}</a>
    `;
    const { window, doc, clipboard } = makeDom(baseBody);
    await tick(120);
    window.getSelection().removeAllRanges();

    // 1. 普通行内公式点击复制
    const inlineVis = doc.querySelector('#p1 .katex-html');
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    inlineVis.dispatchEvent(ev);
    await tick(40);
    check('inline click copies raw TeX', clipboard.at(-1) === 'x^2');
    check('inline click prevents default', ev.defaultPrevented);

    // 2. Alt/Option 复制带定界符
    const dispVis = doc.querySelector('#disp1 .katex-html');
    const evAlt = new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true, altKey: true });
    dispVis.dispatchEvent(evAlt);
    await tick(40);
    check('option-click block adds $$ delimiters', clipboard.at(-1) === '$$\nE=mc^2\n$$');

    // 3. 超链接中的公式点击放行（M2修复：不劫持超链接）
    const linkVis = doc.querySelector('#link .katex-html');
    const evLink = new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    linkVis.dispatchEvent(evLink);
    await tick(40);
    check('click on link inside math is NOT hijacked', !evLink.defaultPrevented);

    // 4. contenteditable 中的公式点击放行（M2修复：不阻断光标与编辑）
    const ceVis = doc.querySelector('#ce .katex-html');
    const beforeLen = clipboard.length;
    const evCe = new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    ceVis.dispatchEvent(evCe);
    await tick(40);
    check('click inside contenteditable is NOT hijacked', !evCe.defaultPrevented && clipboard.length === beforeLen);

    // 5. 存在活动选区时点击不触发复制
    const range = doc.createRange();
    range.selectNodeContents(doc.getElementById('p1'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    const beforeLen2 = clipboard.length;
    doc.querySelector('#disp1 .katex-html').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(40);
    check('click ignored while a selection exists', clipboard.length === beforeLen2);
  }

  console.log('\n=== P4 selection Cmd+C rewrite (M1加固) ===');
  {
    const { window, doc } = makeDom(`
      <div id="copywrap">
        <p>First paragraph.</p>
        <p>Second <span class="katex">${katex('q+r')}</span> end.</p>
        <p>Third para.</p>
        <span class="katex-display">${katex('B=2')}</span>
        <p>Tail.</p>
      </div>
      <textarea id="ta">textarea text</textarea>
    `);
    await tick(120);

    function doCopy(selectionTarget) {
      const range = window.document.createRange();
      range.selectNodeContents(selectionTarget);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      let data = null;
      const ev = new window.Event('copy', { bubbles: true, cancelable: true });
      ev.clipboardData = { setData: (type, value) => { data = { type, value }; } };
      window.document.dispatchEvent(ev);
      return { data, prevented: ev.defaultPrevented };
    }

    const wrap = doc.getElementById('copywrap');
    const { data } = doCopy(wrap);
    check('clipboard text/plain is written', !!data && data.type === 'text/plain');
    const text = data ? data.value : '';
    check('inline math restored as $...$', text.includes('$q+r$'));
    check('display math restored as $$...$$', text.includes('$$\nB=2\n$$'));
    check('paragraph boundaries are PRESERVED (M1修复)', /First paragraph\.\n/.test(text));
    check('block boundaries between paragraphs preserved', text.includes('Second $q+r$ end.\n'));

    // 输入框免疫
    const ta = doc.getElementById('ta');
    ta.focus();
    const r = doCopy(ta);
    check('textarea copy is not intercepted', r.data === null);
  }

  console.log('\n=== P5 Shadow DOM support ===');
  {
    const { window, doc } = makeDom('<div id="host"></div>');
    const host = doc.getElementById('host');
    let sr;
    try { sr = host.attachShadow({ mode: 'open' }); } catch (e) { sr = null; }
    if (!sr) {
      console.log('  (jsdom shadow DOM unsupported, skipped)');
    } else {
      sr.innerHTML = `<div>${display('s=1', 'shadowdisp')}</div><p>In ${katex('sh+1')} text</p>`;
      await tick(150);
      check('style injected into shadow root', !!sr.getElementById('voyager-latex-styles'));
      check('shadow block decorated', sr.getElementById('shadowdisp').getAttribute('data-voyager-latex') === 's=1');
      const clip = [];
      Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => clip.push(t) } });
      window.getSelection().removeAllRanges();
      const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
      sr.querySelector('p .katex-html').dispatchEvent(ev);
      await tick(40);
      check('shadow click copies via composedPath', clip.at(-1) === 'sh+1');
    }
  }

  console.log('\n=== P6 injection safety ===');
  {
    const evil = '<img src=x onerror="window.__XSS=1">';
    const escaped = evil.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const { window, doc } = makeDom(`<div>${display(escaped, 'evil')}</div>`);
    await tick(120);
    window.getSelection().removeAllRanges();
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    doc.querySelector('#evil .katex-html').dispatchEvent(ev);
    await tick(40);
    check('no script execution from annotation payload', window.__XSS === undefined);
    const toast = doc.getElementById('voyager-latex-toast');
    check('toast exists after copy', !!toast);
    check('toast has no injected <img> element', toast && !toast.querySelector('img'));
    check('toast renders annotation as text', toast && toast.textContent.includes('<img'));
  }

  console.log('\n========================================');
  console.log(`PAYLOAD TESTS: ${pass} passed, ${fail} failed`);
  if (fail) console.log('FAILURES:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR', e);
  process.exit(2);
});
