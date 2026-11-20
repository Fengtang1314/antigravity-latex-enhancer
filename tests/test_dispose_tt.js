'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REPO = path.resolve(__dirname, '..');
const PAYLOAD = fs.readFileSync(path.join(REPO, 'payload', 'voyager-latex.js'), 'utf8');

let pass = 0;
let fail = 0;
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
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));

function katex(tex) {
  return `<span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">VIS:${tex}</span></span>`;
}
function display(tex, id) {
  return `<span class="katex-display"${id ? ` id="${id}"` : ''}>${katex(tex)}</span>`;
}

function makeDom(bodyHtml, { trapInnerHtml = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${bodyHtml}</body></html>`, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://127.0.0.1:61579/c/test',
  });
  const { window } = dom;
  const clipboard = [];
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t) => clipboard.push(t) },
  });
  window.document.execCommand = () => true;

  if (trapInnerHtml) {
    const desc = Object.getOwnPropertyDescriptor(window.Element.prototype, 'innerHTML');
    Object.defineProperty(window.Element.prototype, 'innerHTML', {
      configurable: true,
      get: desc.get,
      set() {
        throw new Error('TrustedTypes violation: innerHTML assignment forbidden');
      },
    });
  }

  window.eval(PAYLOAD);
  return { dom, window, doc: window.document, clipboard };
}

(async () => {
  console.log('\n=== D1 Trusted Types safety (zero innerHTML usage) ===');
  {
    const { window, doc, clipboard } = makeDom(`<div id="d1">${display('a+b', 'disp1')}</div>`, {
      trapInnerHtml: true,
    });
    await tick(80);
    window.getSelection().removeAllRanges();
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    doc.querySelector('#disp1 .katex-html').dispatchEvent(ev);
    await tick(40);
    const toast = doc.getElementById('voyager-latex-toast');
    check('toast renders without calling innerHTML', Boolean(toast && toast.textContent.includes('a+b')));
    check('clipboard received TeX under Trusted Types trap', clipboard.at(-1) === 'a+b');
  }

  console.log('\n=== D2 Version check & hot-reload replacement ===');
  {
    const { window, doc } = makeDom(`<p id="p1">${katex('x+1')}</p>`);
    await tick(80);
    const firstVer = window.__VOYAGER_LATEX_VERSION__;
    check('initial version recorded', typeof firstVer === 'string' && firstVer.length > 0);

    // Same version re-eval is a no-op
    window.eval(PAYLOAD);
    check('same version keeps single style element', doc.querySelectorAll('#voyager-latex-styles').length === 1);

    // Different expected version disposes old and mounts new
    window.__VOYAGER_LATEX_EXPECTED_VERSION__ = '3.0.0-hotreload';
    window.eval(PAYLOAD);
    await tick(80);
    check('hot-reload updates version', window.__VOYAGER_LATEX_VERSION__ === '3.0.0-hotreload');
    check('hot-reload leaves exactly one style element', doc.querySelectorAll('#voyager-latex-styles').length === 1);
    check('hot-reload re-decorates math', doc.querySelector('#p1 .katex').getAttribute('data-voyager-latex') === 'x+1');
  }

  console.log('\n=== D3 Full dispose() cleanup (Document + Shadow DOM + Events + Observers) ===');
  {
    const { window, doc, clipboard } = makeDom(`
      <p id="p1">${katex('y^2')}</p>
      <div id="d1">${display('A=1', 'disp1')}</div>
      <div id="d2">${display('B=2', 'disp2')}</div>
      <div id="host"></div>
      <div id="stream"></div>
    `);
    const host = doc.getElementById('host');
    const sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = `<div>${display('S=3', 'sdisp')}</div>`;
    await tick(120);

    // Trigger toast & copy highlight so timers/elements exist before dispose
    window.getSelection().removeAllRanges();
    doc.querySelector('#disp1 .katex-html').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    await tick(30);
    check('pre-dispose toast exists', Boolean(doc.getElementById('voyager-latex-toast')));
    check('pre-dispose shadow style exists', Boolean(sr.getElementById('voyager-latex-styles')));

    window.__VOYAGER_LATEX_DISPOSE__();
    await tick(30);

    check('dispose clears __VOYAGER_LATEX_INITIALIZED__', window.__VOYAGER_LATEX_INITIALIZED__ === undefined);
    check('dispose clears __VOYAGER_LATEX_DISPOSE__', window.__VOYAGER_LATEX_DISPOSE__ === undefined);
    check('dispose removes document style', !doc.getElementById('voyager-latex-styles'));
    check('dispose removes shadowRoot style', !sr.getElementById('voyager-latex-styles'));
    check('dispose removes toast', !doc.getElementById('voyager-latex-toast'));
    check('dispose cleans data-voyager-ready', doc.querySelectorAll('[data-voyager-ready]').length === 0);
    check('dispose cleans shadow attributes', sr.querySelectorAll('[data-voyager-ready]').length === 0);
    check('dispose removes script-added inline title', !doc.querySelector('#p1 .katex').hasAttribute('title'));
    check('dispose removes stacked class', !doc.getElementById('disp2').classList.contains('voyager-math-stacked'));

    // Observers must be disconnected
    doc.getElementById('stream').innerHTML = display('late=9', 'latedisp');
    sr.appendChild(doc.createElement('div')).innerHTML = display('slate=9', 'slatedisp');
    await tick(80);
    check('document observer disconnected after dispose', !doc.getElementById('latedisp').hasAttribute('data-voyager-ready'));
    check('shadow observer disconnected after dispose', !sr.getElementById('slatedisp').hasAttribute('data-voyager-ready'));

    // Event listeners must be removed
    const before = clipboard.length;
    const evAfter = new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    doc.querySelector('#disp1 .katex-html').dispatchEvent(evAfter);
    await tick(30);
    check('click listener removed after dispose', !evAfter.defaultPrevented && clipboard.length === before);

    // Re-init works cleanly after dispose
    window.eval(PAYLOAD);
    await tick(80);
    check('re-init after dispose restores decoration', doc.getElementById('latedisp').getAttribute('data-voyager-latex') === 'late=9');
  }

  console.log('\n=== D4 In-place KaTeX update & table copy preservation ===');
  {
    const { window, doc, clipboard } = makeDom(`
      <p id="p1">${katex('old=1')}</p>
      <table id="tbl"><tr><td>A</td><td>${katex('x_1')}</td></tr></table>
    `);
    await tick(80);
    // Simulate in-place KaTeX update without removing data-voyager-ready
    doc.querySelector('#p1 annotation').textContent = 'new=2';
    window.getSelection().removeAllRanges();
    doc.querySelector('#p1 .katex-html').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    await tick(30);
    check('click reads fresh annotation after in-place update', clipboard.at(-1) === 'new=2');

    const range = doc.createRange();
    range.selectNodeContents(doc.getElementById('tbl'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    let copied = null;
    const copyEv = new window.Event('copy', { bubbles: true, cancelable: true });
    copyEv.clipboardData = { setData: (_t, v) => { copied = v; } };
    doc.dispatchEvent(copyEv);
    check('table row copy separates cells with tab', copied === 'A\t$x_1$');
  }

  console.log('\n=== D5 Round 2 adversarial guards (right-click, wrapped display, shadow input copy) ===');
  {
    const { window, doc, clipboard } = makeDom(`
      <div id="wrap"><div class="katex-display"><span class="wrapper">${katex('W=1')}</span></div></div>
      <div id="before-target"></div>
      <div id="after-existing">${display('E=2', 'afterdisp')}</div>
      <div id="shadow-host"></div>
    `);
    await tick(80);
    const wrappedInner = doc.querySelector('#wrap .wrapper .katex');
    check('wrapped .katex inside .katex-display is NOT tagged with inline title', !wrappedInner.hasAttribute('data-voyager-title'));

    // Insert a block formula BEFORE #after-existing dynamically
    doc.getElementById('before-target').innerHTML = display('E=1', 'beforedisp');
    await tick(80);
    check('bidirectional stacked math marks following block', doc.getElementById('afterdisp').classList.contains('voyager-math-stacked'));

    // Non-primary button click must be ignored
    const beforeLen = clipboard.length;
    const rightClick = new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 2 });
    doc.querySelector('#beforedisp .katex-html').dispatchEvent(rightClick);
    await tick(30);
    check('right-click (button=2) does not copy', !rightClick.defaultPrevented && clipboard.length === beforeLen);
  }

  console.log('\n========================================');
  console.log(`DISPOSE & TT TESTS: ${pass} passed, ${fail} failed`);
  if (fail) console.log('FAILURES:\n - ' + failures.join('\n - '));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('HARNESS ERROR', e);
  process.exit(2);
});
