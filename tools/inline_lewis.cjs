'use strict';
/*
 * Integration of 路易斯结构工坊.html into AP化学学习工具.html.
 *
 * Responsibilities
 *   1. scope every rule under `.lewis-studio` (tokens moved from :root, html/body
 *      mapped to the wrapper), rename @keyframes and namespace the globals;
 *   2. turn the component's literal colours into `--lw-*` custom properties so a
 *      generated dark variant can be emitted next to the untouched light values;
 *   3. bridge the component's design tokens to the host's Material 3 tokens, so
 *      dark/light mode and every accent palette flow through automatically;
 *   4. make the SVG renderer read CSS variables and expose a refresh hook, then
 *      redraw whenever the host changes `data-theme` / `data-theme-accent`;
 *   5. inject markup + scripts before the application script (sync-site.py
 *      treats the last inline <script> as the app).
 *
 *   node tools/inline_lewis.cjs            # first run
 *   node tools/inline_lewis.cjs --reset    # strip the previous block, then inject
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = 'C:/Users/ASUS/Desktop/路易斯结构工坊.html';
const HOST = path.join(ROOT, 'AP化学学习工具.html');
const WRAP = '.lewis-studio';
const MARK = 'AP_LEWIS_INTEGRATION:BEGIN';
const CSS_BEGIN = '/* ===== ' + MARK + ' : styles ===== */';
const CSS_END = '/* ===== AP_LEWIS_INTEGRATION:END (styles) ===== */';
const HTML_BEGIN = '<!-- ' + MARK + ' -->';
const HTML_END = '<!-- AP_LEWIS_INTEGRATION:END -->';
const RESET = process.argv.includes('--reset');

/* ---------------- read ---------------- */
const src = fs.readFileSync(SOURCE, 'utf8');
let host = fs.readFileSync(HOST, 'utf8');

if (host.includes(MARK) && !RESET) {
  console.error('Already integrated. Re-run with --reset to rebuild.');
  process.exit(1);
}
if (host.includes(MARK)) {
  const cutAt = (text, a, b) => {
    const i = text.indexOf(a), j = text.indexOf(b, i);
    if (i < 0 || j < 0) throw new Error('missing markers: ' + a);
    return { text: text.slice(0, i) + text.slice(j + b.length).replace(/^\n/, ''), at: i };
  };
  const cssCut = cutAt(host, CSS_BEGIN, CSS_END);
  host = cssCut.text;
  const htmlCut = cutAt(host, HTML_BEGIN, HTML_END);
  host = htmlCut.text;
  // Older builds placed the launcher script right after the END marker; drop it
  // too, otherwise a duplicate listener would survive the reset.
  const after = host.slice(htmlCut.at);
  const stale = after.match(/^\s*<script>[\s\S]*?<\/script>/);
  if (stale && stale[0].includes('btnLewis')) host = host.slice(0, htmlCut.at) + after.slice(stale[0].length);
  console.log('reset: previous block removed');
}

const cssStart = src.indexOf('<style>') + 7;
const cssEnd = src.indexOf('</style>', cssStart);
let css = src.slice(cssStart, cssEnd);

const bodyStart = src.indexOf('<body>') + 6;
const firstScript = src.indexOf('<script>', bodyStart);
let body = src.slice(bodyStart, firstScript);

const scripts = [];
for (let pos = firstScript; pos >= 0;) {
  const open = src.indexOf('<script>', pos);
  if (open < 0) break;
  const close = src.indexOf('</script>', open);
  scripts.push(src.slice(open + 8, close));
  pos = close + 9;
}
if (scripts.length !== 3) throw new Error('expected 3 inline scripts, found ' + scripts.length);

/* ---------------- colour helpers ---------------- */
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = n => Math.round(255 * f(n)).toString(16).padStart(2, '0');
  return '#' + to(0) + to(8) + to(4);
}
// Two different transforms are needed in dark mode:
//   • surfaces (L >= 85) invert, so paper becomes near-black card stock;
//   • text and hairlines compress toward the light end, because a mid-grey that
//     reads fine on white would be unreadable on a near-black background.
function darkVariant(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const l2 = l >= 85
    ? Math.max(9, Math.min(30, 100 - l))
    : Math.max(52, Math.min(92, 100 - l * 0.55));
  // Near-white surfaces carry a meaningless hue once inverted, so keep them
  // close to neutral instead of producing a saturated olive/grey.
  let s2 = s * 0.8;
  if (l >= 96 || l <= 4) s2 = Math.min(s2, 8);
  else if (l >= 85) s2 = Math.min(s2, 18);
  return hslToHex(h, s2, l2);
}

/* ---------------- 1. literal colours -> --lw-* tokens ---------------- */
// Values inside the component's :root block are its design tokens and are
// bridged to the host palette instead of being inverted.
const rootAt = css.indexOf(':root');
const rootOpen = css.indexOf('{', rootAt);
let depth = 0, rootClose = rootOpen;
for (let i = rootOpen; i < css.length; i++) {
  if (css[i] === '{') depth++;
  else if (css[i] === '}' && --depth === 0) { rootClose = i; break; }
}
const HEAD = css.slice(0, rootClose + 1);
let TAIL = css.slice(rootClose + 1);

// The stage colour is shared by the CSS canvas and the SVG renderer, so it gets
// a stable name instead of an anonymous index.
const NAMED = { '#fbfaf6': '--lw-stage' };
const tokenByValue = new Map();
let tokenSeq = 0;

TAIL = TAIL.replace(/#[0-9a-fA-F]{3,8}\b/g, literal => {
  const key = literal.toLowerCase();
  if (tokenByValue.has(key)) return 'var(' + tokenByValue.get(key) + ')';
  const name = NAMED[key] || '--lw-' + (++tokenSeq);
  tokenByValue.set(key, name);
  return 'var(' + name + ')';
});

// Translucent light surfaces (rgba white overlays) cannot be inverted, so they
// are expressed against --surface instead and follow the theme automatically.
TAIL = TAIL.replace(
  /background(-color)?:\s*rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/g,
  (whole, prop, r, g, b, a) => {
    if (+r < 170 || +g < 170 || +b < 170) return whole;
    const pct = Math.round(+a * 100);
    return 'background' + (prop ? '-color' : '') +
      ': color-mix(in srgb, var(--surface) ' + pct + '%, transparent)';
  });

const lightTokens = [];
for (const [value, name] of tokenByValue) {
  if (name === '--lw-stage') continue;               // declared by the bridge
  lightTokens.push('  ' + name + ': ' + value + ';');
}

/* ---------------- 2. keyframes + globals ---------------- */
const KEYFRAMES = ['riseIn', 'inkReveal', 'nudge'];
for (const name of KEYFRAMES) {
  TAIL = TAIL.replace(new RegExp('@keyframes\\s+' + name + '\\b', 'g'), '@keyframes lewis-' + name);
}
TAIL = TAIL.replace(/(animation(?:-name)?\s*:[^;}]*)/g, chunk =>
  chunk.replace(/\b(riseIn|inkReveal|nudge)\b/g, 'lewis-$1'));

/* ---------------- 3. scope ---------------- */
function splitTop(text, sep) {
  const out = []; let cur = '', depth = 0, quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      cur += c;
      if (c === '\\') { cur += text[++i] || ''; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
function matchBrace(text, open) {
  let depth = 0, quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') { i++; } else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2); if (i < 0) return text.length; i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return text.length;
}
function scopeOne(selector) {
  const sel = selector.trim();
  if (!sel) return sel;
  if (sel === ':root') return WRAP;
  if (sel === 'html' || sel === 'body') return WRAP;
  if (sel === '*') return WRAP + ', ' + WRAP + ' *';
  if (/^body::/.test(sel)) return WRAP + sel.slice(4);
  if (/^html::/.test(sel)) return WRAP + sel.slice(4);
  if (/^::selection/.test(sel)) return WRAP + ' ' + sel + ', ' + WRAP + sel;
  if (sel.indexOf(WRAP) === 0) return sel;
  return WRAP + ' ' + sel;
}
function scopeCss(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    let brace = i, quote = null;
    while (brace < text.length) {
      const c = text[brace];
      if (quote) { if (c === '\\') { brace++; } else if (c === quote) quote = null; brace++; continue; }
      if (c === '"' || c === "'") { quote = c; brace++; continue; }
      if (c === '/' && text[brace + 1] === '*') { brace = text.indexOf('*/', brace + 2) + 2; continue; }
      if (c === '{') break;
      brace++;
    }
    if (brace >= text.length) { out += text.slice(i); break; }

    const raw = text.slice(i, brace);
    const comments = raw.match(/\/\*[\s\S]*?\*\//g) || [];
    const prelude = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const close = matchBrace(text, brace);
    const inner = text.slice(brace + 1, close);
    const head = comments.length ? comments.join('\n') + '\n' : '';

    if (!prelude) out += head;
    else if (prelude.charAt(0) === '@') {
      const at = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
      if (['media', 'supports', 'container', 'layer'].includes(at)) {
        out += head + prelude + '{\n' + scopeCss(inner) + '\n}\n';
      } else {
        out += head + prelude + '{' + inner + '}\n';
      }
    } else {
      out += head + splitTop(prelude, ',').map(scopeOne).join(',\n') + ' {' + inner + '}\n';
    }
    i = close + 1;
  }
  return out;
}

const scoped = scopeCss(HEAD) + scopeCss(TAIL);
if (/\nbody\s*[,{:]|\nhtml\s*[,{:]|^:root/m.test(scoped)) {
  throw new Error('scoping left an unscoped html/body/:root selector');
}

/* ---------------- 4. theme bridge ---------------- */
// The host exposes Material 3 tokens on <html>; they already switch with the
// palette and the effective light/dark mode, so one mapping serves both.
const bridge = [
  '/* ---- 主题桥接：跟随主界面的深浅色与色系 ---- */',
  WRAP + ' {',
  '  --bg: var(--md-sys-color-surface-container, #f0ede4);',
  '  --bg-deep: var(--md-sys-color-surface-container-high, #e8e3d7);',
  '  --surface: var(--md-sys-color-surface-container-lowest, #fcfbf7);',
  '  --surface-soft: var(--md-sys-color-surface-container-low, #f6f3eb);',
  '  --surface-tint: var(--md-sys-color-surface-container-low, #f2f6f1);',
  '  --ink: var(--md-sys-color-on-surface, #17352f);',
  '  --ink-soft: var(--md-sys-color-on-surface-variant, #38544c);',
  '  --muted: var(--md-sys-color-on-surface-variant, #74847c);',
  '  --faint: var(--md-sys-color-outline, #9caaa2);',
  '  --line: var(--md-sys-color-outline-variant, #deddd2);',
  '  --line-strong: var(--md-sys-color-outline, #c9ccc0);',
  '  --green: var(--md-sys-color-primary, #1e5a49);',
  '  --green-2: var(--md-sys-color-primary, #2d7562);',
  '  --green-soft: var(--md-sys-color-primary-container, #e8f0ea);',
  '  --danger: var(--md-sys-color-error, #b6422a);',
  '  --danger-soft: var(--md-sys-color-error-container, #fbe9e2);',
  '  --gold: var(--md-sys-color-tertiary, #bd9653);',
  '  --bond: var(--md-sys-color-on-surface, #294b43);',
  '  --lw-stage: var(--md-sys-color-surface-container-lowest, #fbfaf6);',
  '  --orange: #d55b37;',
  '  --orange-deep: #b74728;',
  '  --orange-soft: #f8e8df;',
  '  --shadow-card: 0 18px 48px rgba(20, 30, 26, 0.10), 0 2px 6px rgba(20, 30, 26, 0.04);',
  '  --shadow-float: 0 24px 60px rgba(20, 30, 26, 0.16);',
  '  color-scheme: light;',
  '}',
  '/* 保留的原生色值（浅色模式与原始设计一致） */',
  WRAP + ' {',
  lightTokens.join('\n'),
  '}',
  '/* 深色模式：逐色取反明度，保留色相关系 */',
  'html[data-theme="dark"] ' + WRAP + ' {',
  '  --orange: #f08c62;',
  '  --orange-deep: #e57b4c;',
  '  --orange-soft: rgba(240, 140, 98, 0.16);',
  '  --shadow-card: 0 18px 48px rgba(0, 0, 0, 0.42), 0 2px 6px rgba(0, 0, 0, 0.24);',
  '  --shadow-float: 0 24px 60px rgba(0, 0, 0, 0.5);',
  '  color-scheme: dark;',
  [...tokenByValue].filter(([, n]) => n !== '--lw-stage')
    .map(([v, n]) => '  ' + n + ': ' + darkVariant(v) + ';').join('\n'),
  '}',
  '/* 深色下重新定义纸张纹理与画布光晕（浅色叠加层无法简单取反） */',
  'html[data-theme="dark"] ' + WRAP + '::before {',
  '  background-image: radial-gradient(rgba(206, 224, 216, 0.10) 0.7px, transparent 0.7px);',
  '  opacity: 0.5;',
  '}',
  'html[data-theme="dark"] ' + WRAP + ' .stage {',
  '  background-image:',
  '    radial-gradient(rgba(188, 208, 198, 0.13) 0.75px, transparent 0.8px),',
  '    radial-gradient(ellipse at 50% 48%, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01) 72%);',
  '}',
  'html[data-theme="dark"] ' + WRAP + ' .canvas-card,',
  'html[data-theme="dark"] ' + WRAP + ' .build-card,',
  'html[data-theme="dark"] ' + WRAP + ' .method-card {',
  '  border-color: color-mix(in srgb, var(--line) 70%, transparent);',
  '}',
  '',
].join('\n');

/* ---------------- 5. patch the renderer ---------------- */
const UI = 2;
const DOC = scripts[UI];
if (!DOC.includes("const STAGE_BG = '#fbfaf6';")) throw new Error('renderer constants not found');

const patchedDoc = DOC
  .replace(
    [
      "  const STAGE_BG = '#fbfaf6';",
      "  const BOND_COLOR = '#294b43';",
      "  const LONE_COLOR = '#d45b37';",
      "  const RADICAL_COLOR = '#b98935';",
      "  const CHARGE_COLOR = '#b5482b';",
      "  const FRAME_COLOR = '#859b8f';",
    ].join('\n'),
    [
      '  /* 颜色改为每次绘制时从 CSS 变量读取，主题切换后重绘即可生效。 */',
      '  function lwColor(name, fallback) {',
      "    var host = document.getElementById('lewisStudio') || document.documentElement;",
      "    var value = getComputedStyle(host).getPropertyValue(name).trim();",
      '    return value || fallback;',
      '  }',
      "  const STAGE_BG = () => lwColor('--lw-stage', '#fbfaf6');",
      "  const BOND_COLOR = () => lwColor('--bond', '#294b43');",
      "  const LONE_COLOR = () => lwColor('--orange', '#d45b37');",
      "  const RADICAL_COLOR = () => lwColor('--gold', '#b98935');",
      "  const CHARGE_COLOR = () => lwColor('--danger', '#b5482b');",
      "  const FRAME_COLOR = () => lwColor('--muted', '#859b8f');",
    ].join('\n'))
  // every remaining mention is a call site (skip the `const NAME = () =>` lines)
  .replace(/(?<!const )\b(STAGE_BG|BOND_COLOR|LONE_COLOR|RADICAL_COLOR|CHARGE_COLOR|FRAME_COLOR)\b(?!\s*\()/g, '$1()');

// expose a redraw hook at the end of the UI IIFE
const tailMarker = '})();';
const tailAt = patchedDoc.lastIndexOf(tailMarker);
if (tailAt < 0) throw new Error('UI IIFE end not found');
const withHook = patchedDoc.slice(0, tailAt) +
  '  /* 供主题切换调用：按当前主题重新绘制 */\n' +
  '  window.AP_LEWIS_REFRESH = function () {\n' +
  '    try { if (dom.formulaInput) draw(dom.formulaInput.value, { silent: true }); } catch (e) { /* noop */ }\n' +
  '  };\n' +
  patchedDoc.slice(tailAt);

const js = [scripts[0], scripts[1], withHook].map(code => code
  .replace(/\bglobal\.LewisEngine\b/g, 'global.AP_LEWIS_ENGINE')
  .replace(/\bglobal\.LewisLayout\b/g, 'global.AP_LEWIS_LAYOUT')
  .replace(/\bwindow\.LewisEngine\b/g, 'window.AP_LEWIS_ENGINE')
  .replace(/\bwindow\.LewisLayout\b/g, 'window.AP_LEWIS_LAYOUT'));

/* ---------------- 6. assembly ---------------- */
const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';

const dialog = [
  HTML_BEGIN,
  '<!-- ============ 路易斯结构工坊（整合自 路易斯结构工坊.html） ============ -->',
  '<button class="lewis-launch" id="btnLewis" type="button" tabindex="-1" aria-hidden="true">路易斯结构工坊</button>',
  '<div class="modal hide lewis-modal" id="modalLewis" role="dialog" aria-modal="true" aria-label="路易斯结构工坊">',
  '  <div class="lewis-studio" id="lewisStudio">',
  '    <button class="lewis-close" type="button" data-close aria-label="关闭路易斯结构工坊">' + CLOSE_ICON + '<span>关闭</span></button>',
  body.replace(/\n\s*$/, '').replace(/^/gm, '    '),
  '  </div>',
  '</div>',
  js.map(code => '<script>' + code + '</script>').join('\n'),
  `<script>
/* 路易斯结构工坊：入口、关闭与主题同步。自包含实现，主应用脚本无需改动。 */
(function () {
  'use strict';
  var btn = document.getElementById('btnLewis');
  var modal = document.getElementById('modalLewis');
  if (!btn || !modal) return;
  function openStudio() {
    Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (m) {
      if (m !== modal) m.classList.add('hide');
    });
    modal.classList.remove('hide');
    if (window.AP_LEWIS_REFRESH) requestAnimationFrame(window.AP_LEWIS_REFRESH);
  }
  function closeStudio() { modal.classList.add('hide'); }
  btn.addEventListener('click', openStudio);
  Array.prototype.forEach.call(modal.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', closeStudio);
  });
  modal.addEventListener('click', function (e) { if (e.target === modal) closeStudio(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.classList.contains('hide')) closeStudio();
  });

  // 深浅色 / 色系切换后立即重绘结构图（CSS 变量已由样式层接管）
  var pending = false;
  function refresh() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      if (window.AP_LEWIS_REFRESH) window.AP_LEWIS_REFRESH();
    });
  }
  new MutationObserver(refresh).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-theme-effective', 'data-theme-accent', 'style']
  });
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refresh);
  }
})();
</script>`,
  HTML_END,
  '',
  '',
].join('\n');

const extraCss = [
  '',
  CSS_BEGIN,
  '/* The workshop keeps its own design tokens; they live on .lewis-studio so',
  '   nothing leaks into the host, and they are bridged to the host palette below. */',
  scoped,
  bridge,
  '/* ---------- host-side frame: launcher + full-bleed modal ---------- */',
  '.lewis-launch{display:none}',
  '.lewis-modal{padding:0;background:var(--md-sys-color-surface-container-high,#e8e3d7);align-items:flex-start;justify-content:flex-start;overflow:auto;overscroll-behavior:contain}',
  '.lewis-modal .lewis-studio{width:100%;flex:0 0 auto}',
  '.lewis-modal .lewis-studio .topbar{padding-right:104px}',
  '.lewis-studio .lewis-close{position:fixed;top:19px;right:28px;z-index:30;display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border-radius:var(--radius-md);border:1px solid var(--line-strong);background:var(--surface);color:var(--ink-soft);font:600 12.5px/1 var(--sans,system-ui);letter-spacing:.04em;cursor:pointer;box-shadow:0 6px 18px rgba(32,49,42,.10);transition:background 160ms ease,border-color 160ms ease,color 160ms ease}',
  '.lewis-studio .lewis-close:hover{background:var(--green-soft);border-color:var(--green-2);color:var(--green)}',
  '.lewis-studio .lewis-close svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round}',
  '@media (max-width:720px){.lewis-studio .lewis-close{top:14px;right:16px;height:34px;padding:0 12px}.lewis-modal .lewis-studio .topbar{padding-right:92px}}',
  CSS_END,
  '',
].join('\n');

/* ---------------- 7. inject ---------------- */
const styleOpen = host.indexOf('<style>');
const styleClose = host.indexOf('</style>', styleOpen);
if (styleOpen < 0 || styleClose < 0) throw new Error('main <style> block not found');
host = host.slice(0, styleClose) + extraCss + host.slice(styleClose);

const lastScript = host.lastIndexOf('<script>');
if (lastScript < 0) throw new Error('application <script> not found');
host = host.slice(0, lastScript) + dialog + host.slice(lastScript);

fs.writeFileSync(HOST, host, 'utf8');

console.log('colour tokens    :', tokenByValue.size, '(stage named)');
console.log('scoped css chars :', scoped.length);
console.log('bridge css chars :', bridge.length);
console.log('scripts          :', js.length);
console.log('host size        :', (host.length / 1048576).toFixed(2), 'MB');
