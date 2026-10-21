'use strict';
/*
 * Integration of 分子键角3D模型.html into AP化学学习工具.html.
 *
 * The component is a full-page app with its own design tokens and three IDs
 * that already exist in the host (`stage`, `zoomIn`, `zoomOut`), so a plain
 * copy/paste would break both sides. This script:
 *
 *   1. renames every component id with a `geo-` prefix (markup, aria refs,
 *      getElementById and CSS #selectors);
 *   2. scopes every rule under `.geo-studio`;
 *   3. bridges the component's tokens to the host Material tokens, and turns
 *      the remaining literal colours into `--geo-*` variables with a generated
 *      dark variant — except inside the 3D viewport, which is intentionally
 *      dark in both themes;
 *   4. injects markup + script before the application script.
 *
 *   node tools/inline_geometry.cjs [--reset]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = 'C:/Users/ASUS/Desktop/分子键角3D模型.html';
const HOST = path.join(ROOT, 'AP化学学习工具.html');
const WRAP = '.geo-studio';
const MARK = 'AP_GEO_INTEGRATION:BEGIN';
const CSS_BEGIN = '/* ===== ' + MARK + ' : styles ===== */';
const CSS_END = '/* ===== AP_GEO_INTEGRATION:END (styles) ===== */';
const HTML_BEGIN = '<!-- ' + MARK + ' -->';
const HTML_END = '<!-- AP_GEO_INTEGRATION:END -->';
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
  host = cutAt(host, CSS_BEGIN, CSS_END).text;
  const h = cutAt(host, HTML_BEGIN, HTML_END);
  host = h.text;
  const after = host.slice(h.at);
  const stale = after.match(/^\s*<script>[\s\S]*?<\/script>/);
  if (stale && stale[0].includes('geoModal')) host = host.slice(0, h.at) + after.slice(stale[0].length);
  console.log('reset: previous block removed');
}

const cssStart = src.indexOf('<style>') + 7;
const cssEnd = src.indexOf('</style>', cssStart);
let css = src.slice(cssStart, cssEnd);

const bodyStart = src.indexOf('<body>') + 6;
const firstScript = src.indexOf('<script>', bodyStart);
let body = src.slice(bodyStart, firstScript);
const scriptClose = src.indexOf('</script>', firstScript);
let script = src.slice(firstScript + 8, scriptClose);

/* ---------------- 1. id namespace ---------------- */
const ids = [...new Set([...body.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]))];
if (!ids.length) throw new Error('no ids found');
const rename = id => 'geo-' + id;

// CSS first (so the #selectors are rewritten before scoping)
for (const id of ids) {
  css = css.replace(new RegExp('#' + id + '\\b', 'g'), '#' + rename(id));
}
// markup attributes
for (const id of ids) {
  body = body.split('id="' + id + '"').join('id="' + rename(id) + '"');
  body = body.split('for="' + id + '"').join('for="' + rename(id) + '"');
  body = body.split('aria-labelledby="' + id + '"').join('aria-labelledby="' + rename(id) + '"');
  body = body.split('aria-describedby="' + id + '"').join('aria-describedby="' + rename(id) + '"');
}
// script lookups
for (const id of ids) {
  script = script.split("getElementById('" + id + "')").join("getElementById('" + rename(id) + "')");
  script = script.split('getElementById("' + id + '")').join('getElementById("' + rename(id) + '")');
  script = script.split("querySelector('#" + id + "')").join("querySelector('#" + rename(id) + "')");
}
// never let a bare .app lookup escape the wrapper
script = script.replace(/document\.querySelector\('\.app'\)/g,
  "document.getElementById('geoStudio').querySelector('.app')");

/* ---------------- 2. colour helpers ---------------- */
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
function darkVariant(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const l2 = l >= 85 ? Math.max(9, Math.min(30, 100 - l))
                     : Math.max(52, Math.min(92, 100 - l * 0.55));
  let s2 = s * 0.8;
  if (l >= 96 || l <= 4) s2 = Math.min(s2, 8);
  else if (l >= 85) s2 = Math.min(s2, 18);
  return hslToHex(h, s2, l2);
}

/* ---------------- 3. css transform ---------------- */
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

// The 3D viewport is deliberately dark in both themes; its colours must not be
// inverted, otherwise the stage turns white in dark mode.
const KEEP_DARK = /\.stage\b|\.tool-btn\b|\.zoom-readout\b|\.tool-divider\b|\.reset-btn\b|\.legend\b|\.legend-item\b|\.legend-dot\b|\.gesture-note\b|\.gesture-line\b|#geo-scene\b|\.brand-mark\b|\.angle-/;

const tokenByValue = new Map();
let tokenSeq = 0;
function tokenize(decls, track) {
  let out = decls.replace(/#[0-9a-fA-F]{3,8}\b/g, literal => {
    const key = literal.toLowerCase();
    if (tokenByValue.has(key)) return 'var(' + tokenByValue.get(key) + ')';
    const name = '--geo-' + (++tokenSeq);
    tokenByValue.set(key, name);
    return 'var(' + name + ')';
  });
  out = out.replace(/background(-color)?:\s*rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/g,
    (whole, prop, r, g, b, a) => {
      if (+r < 170 || +g < 170 || +b < 170) return whole;
      const pct = Math.round(+a * 100);
      return 'background' + (prop ? '-color' : '') +
        ': color-mix(in srgb, var(--panel-raised) ' + pct + '%, transparent)';
    });
  return out;
}

function transformCss(text) {
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
      if (at === 'keyframes') {
        out += head + prelude.replace(/rise-in\b/g, 'geo-rise-in') + '{' + inner + '}\n';
      } else if (['media', 'supports', 'container', 'layer'].includes(at)) {
        out += head + prelude + '{\n' + transformCss(inner) + '\n}\n';
      } else {
        out += head + prelude + '{' + inner + '}\n';
      }
    } else {
      const selectors = splitTop(prelude, ',').map(scopeOne).join(',\n');
      const keep = KEEP_DARK.test(prelude);
      let bodyOut = inner;
      if (!keep) bodyOut = tokenize(inner);
      else bodyOut = inner.replace(/\brise-in\b/g, 'geo-rise-in');
      out += head + selectors + ' {' + bodyOut + '}\n';
    }
    i = close + 1;
  }
  return out;
}

const scoped = transformCss(css).replace(/\banimation:[^;}]*\brise-in\b/g, m => m.replace('rise-in', 'geo-rise-in'));

/* ---------------- 4. bridge ---------------- */
const bridge = [
  '/* ---- 主题桥接：跟随主界面的深浅色与色系 ---- */',
  WRAP + ' {',
  '  --paper: var(--md-sys-color-surface-container, #eae5da);',
  '  --paper-deep: var(--md-sys-color-surface-container-high, #e2dccf);',
  '  --panel: var(--md-sys-color-surface-container-low, #f6f2e8);',
  '  --panel-raised: var(--md-sys-color-surface-container-lowest, #fbf8f0);',
  '  --ink: var(--md-sys-color-on-surface, #17251f);',
  '  --ink-soft: var(--md-sys-color-on-surface-variant, #576357);',
  '  --muted: var(--md-sys-color-outline, #8b8e80);',
  '  --line: color-mix(in srgb, var(--md-sys-color-outline-variant, #d7d3c7) 70%, transparent);',
  '  --line-strong: var(--md-sys-color-outline-variant, #c4c0b4);',
  '  --green: var(--md-sys-color-primary, #315a46);',
  '  --gold: var(--md-sys-color-tertiary, #c58136);',
  '  --gold-bright: color-mix(in srgb, var(--md-sys-color-tertiary, #c58136) 72%, var(--md-sys-color-surface, #fff));',
  '  --cream: var(--md-sys-color-surface-container-lowest, #f4efe3);',
  '  --stage-deep: #08120f;',
  '  color-scheme: light;',
  '}',
  '/* 保留的原生色值（浅色模式与原始设计一致） */',
  WRAP + ' {',
  [...tokenByValue].map(([v, n]) => '  ' + n + ': ' + v + ';').join('\n'),
  '}',
  '/* 深色模式：表面取反、文字向亮端压缩 */',
  'html[data-theme="dark"] ' + WRAP + ' {',
  '  color-scheme: dark;',
  [...tokenByValue].map(([v, n]) => '  ' + n + ': ' + darkVariant(v) + ';').join('\n'),
  '}',
  '/* 3D 视口保持深色，只用主题色轻扫一层，避免变白 */',
  'html[data-theme="dark"] ' + WRAP + ' .stage {',
  '  background:',
  '    radial-gradient(ellipse at 73% 10%, color-mix(in srgb, var(--gold) 16%, transparent), transparent 35%),',
  '    radial-gradient(ellipse at 30% 84%, color-mix(in srgb, var(--green) 20%, transparent), transparent 44%),',
  '    radial-gradient(ellipse at 50% 47%, #101f1a 0%, #0b1713 29%, #07100c 61%, #040a08 100%);',
  '}',
  '/* 纸面背景与侧栏是浅色渐变，无法整体取反，深色下重绘 */',
  'html[data-theme="dark"] ' + WRAP + ' {',
  '  background:',
  '    radial-gradient(1050px 620px at -6% -9%, color-mix(in srgb, var(--md-sys-color-primary) 14%, transparent), transparent 62%),',
  '    radial-gradient(880px 540px at 104% 2%, color-mix(in srgb, var(--md-sys-color-tertiary) 16%, transparent), transparent 57%),',
  '    linear-gradient(135deg, var(--paper) 0%, color-mix(in srgb, var(--paper) 86%, #000) 100%);',
  '  background-attachment: fixed;',
  '}',
  'html[data-theme="dark"] ' + WRAP + ' .rail {',
  '  background:',
  '    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--gold) 15%, transparent), transparent 31%),',
  '    linear-gradient(155deg, color-mix(in srgb, var(--panel) 96%, transparent) 0%, color-mix(in srgb, var(--panel) 90%, transparent) 100%);',
  '  border-color: color-mix(in srgb, var(--line-strong) 60%, transparent);',
  '}',
  '/* 键角卡片在原设计中就是深色底 + 浅色字，深色模式下保持 */',
  'html[data-theme="dark"] ' + WRAP + ' .angle-card {',
  '  color: #f4efe3;',
  '  background:',
  '    radial-gradient(circle at 91% -12%, color-mix(in srgb, var(--gold) 34%, transparent), transparent 47%),',
  '    radial-gradient(circle at 4% 115%, color-mix(in srgb, var(--green) 30%, transparent), transparent 47%),',
  '    linear-gradient(145deg, #16281f 0%, #101d17 57%, #0b1612 100%);',
  '  border-color: rgba(255, 255, 255, 0.10);',
  '}',
  '/* 纸张栅格与光晕在深色下重绘 */',
  'html[data-theme="dark"] ' + WRAP + '::before {',
  '  background-image:',
  '    linear-gradient(rgba(200, 218, 210, .05) 1px, transparent 1px),',
  '    linear-gradient(90deg, rgba(200, 218, 210, .05) 1px, transparent 1px);',
  '}',
  '',
].join('\n');

/* ---------------- 5. assembly ---------------- */
const CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';

const dialog = [
  HTML_BEGIN,
  '<!-- ============ 分子键角 3D 模型（整合自 分子键角3D模型.html） ============ -->',
  '<button class="geo-launch" id="btnGeo" type="button" tabindex="-1" aria-hidden="true">分子键角 3D 模型</button>',
  '<div class="modal hide geo-modal" id="geoModal" role="dialog" aria-modal="true" aria-label="分子键角 3D 模型">',
  '  <div class="geo-studio" id="geoStudio">',
  '    <button class="geo-close" type="button" data-close aria-label="关闭分子键角 3D 模型">' + CLOSE_ICON + '<span>关闭</span></button>',
  body.replace(/\n\s*$/, '').replace(/^/gm, '    '),
  '  </div>',
  '</div>',
  '<script>' + script + '</script>',
  `<script>
/* 分子键角 3D 模型：入口、关闭与尺寸刷新。自包含，主应用脚本无需改动。 */
(function () {
  'use strict';
  var btn = document.getElementById('btnGeo');
  var modal = document.getElementById('geoModal');
  if (!btn || !modal) return;
  function openGeo() {
    Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (m) {
      if (m !== modal) m.classList.add('hide');
    });
    modal.classList.remove('hide');
    // 画布在 display:none 时测得的尺寸为 0，显示后主动触发一次重测
    requestAnimationFrame(function () { window.dispatchEvent(new Event('resize')); });
  }
  function closeGeo() { modal.classList.add('hide'); }
  btn.addEventListener('click', openGeo);
  Array.prototype.forEach.call(modal.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', closeGeo);
  });
  modal.addEventListener('click', function (e) { if (e.target === modal) closeGeo(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.classList.contains('hide')) closeGeo();
  });
})();
</script>`,
  HTML_END,
  '',
  '',
].join('\n');

const extraCss = [
  '',
  CSS_BEGIN,
  '/* 分子键角 3D 模型：样式全部作用域在 .geo-studio 下 */',
  scoped,
  bridge,
  '/* ---------- host-side frame ---------- */',
  '.geo-launch{display:none}',
  '.geo-modal{padding:0;background:var(--md-sys-color-surface-container-high,#e8e3d7);align-items:flex-start;justify-content:flex-start;overflow:auto;overscroll-behavior:contain}',
  '.geo-modal .geo-studio{width:100%;flex:0 0 auto}',
  '.geo-studio .geo-close{position:fixed;top:18px;right:26px;z-index:30;display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border-radius:12px;border:1px solid var(--line-strong);background:var(--panel-raised);color:var(--ink-soft);font:600 12.5px/1 var(--sans,system-ui);letter-spacing:.04em;cursor:pointer;box-shadow:0 6px 18px rgba(20,30,26,.12);transition:background 160ms ease,border-color 160ms ease,color 160ms ease}',
  '.geo-studio .geo-close:hover{background:var(--cream);border-color:var(--green);color:var(--green)}',
  '.geo-studio .geo-close svg{width:13px;height:13px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round}',
  '.geo-modal .geo-studio .masthead{padding-right:112px}',
  '@media (max-width:720px){.geo-studio .geo-close{top:12px;right:14px;height:34px;padding:0 12px}.geo-modal .geo-studio .masthead{padding-right:100px}}',
  CSS_END,
  '',
].join('\n');

/* ---------------- 6. inject ---------------- */
const styleOpen = host.indexOf('<style>');
const styleClose = host.indexOf('</style>', styleOpen);
if (styleOpen < 0 || styleClose < 0) throw new Error('main <style> block not found');
host = host.slice(0, styleClose) + extraCss + host.slice(styleClose);

const lastScript = host.lastIndexOf('<script>');
if (lastScript < 0) throw new Error('application <script> not found');
host = host.slice(0, lastScript) + dialog + host.slice(lastScript);

fs.writeFileSync(HOST, host, 'utf8');

console.log('renamed ids      :', ids.length, ids.map(rename).join(' '));
console.log('colour tokens    :', tokenByValue.size);
console.log('scoped css chars :', scoped.length);
console.log('host size        :', (host.length / 1048576).toFixed(2), 'MB');
