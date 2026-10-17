# -*- coding: utf-8 -*-
"""从最新单文件重建站点版（index.html / assets/style.css / assets/app.js）。
   用法：python sync-site.py
   以后单文件改完，跑一次这个脚本就能同步站点版。"""
import io, os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'AP化学学习工具.html'
SITE = ROOT / 'ap-chem-site'

h = io.open(SRC, encoding='utf-8').read()

# ---------- 抽取 ----------
css_s = h.find('<style>') + len('<style>')
css_e = h.find('</style>', css_s)
CSS = h[css_s:css_e]

ns_s = h.find('<noscript><style>')
ns_e = h.find('</style></noscript>', ns_s) + len('</style></noscript>')
NOSCRIPT_STYLE = h[ns_s:ns_e]

inline_scripts = list(re.finditer(r'<script>(.*?)</script>', h, re.S))
assert inline_scripts, 'Missing inline application script'
main_script = inline_scripts[-1]
JS = main_script.group(1)

body_s = h.find('<body>') + len('<body>')
body_e = main_script.start()
BODY = h[body_s:body_e]

assert len(CSS) > 80000 and len(JS) > 1000000, (len(CSS), len(JS))
assert 'nojs-radio' in BODY, '正文里缺少无脚本选择器，抽取出错'

# ---------- 组装 ----------
HEAD = '''<!DOCTYPE html>
<html lang="zh-CN" class="material-app">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>AP Chemistry 学习工具</title>
<meta name="description" content="AP Chemistry 中文可视化学习工具：9 个单元完整课程地图、470+ 道真题练习（含配图题）、错题本与生词本。手机、平板、桌面均可使用。">
<meta name="theme-color" content="#2b6de9">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="AP Chemistry">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta property="og:title" content="AP Chemistry 学习工具">
<meta property="og:description" content="9 个单元 · 470+ 题 · 配图题 · 错题本 · 生词本">
<meta property="og:type" content="website">
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="icon-180.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="stylesheet" href="assets/style.css">
<link rel="stylesheet" href="assets/vendor/katex/katex.min.css">
<link rel="stylesheet" href="assets/study.css">
<link rel="stylesheet" href="assets/material-theme.css">
<link rel="stylesheet" href="assets/material-app.css">
<script src="assets/material-theme.js"></script>
''' + NOSCRIPT_STYLE + '''
</head>
<body>'''

TAIL = '''
<!-- 主应用脚本（与单文件版逐字节一致） -->
<script src="assets/app.js"></script>
<script src="assets/vendor/katex/katex.min.js"></script>
<script src="assets/vendor/katex/contrib/mhchem.min.js"></script>
<script src="assets/vendor/katex/contrib/auto-render.min.js"></script>
<script src="assets/study-content.js"></script>
<script src="assets/topic-notes.js"></script>
<script src="assets/lesson-details.js"></script>
<script src="assets/curriculum.js"></script>
<script src="assets/lecture-glossary.js"></script>
<script src="assets/study-enhancements.js"></script>
<script src="assets/material-app.js"></script>
</body>
</html>
'''

io.open(os.path.join(SITE, 'index.html'), 'w', encoding='utf-8', newline='').write(HEAD + BODY + TAIL)
io.open(os.path.join(SITE, 'assets', 'style.css'), 'w', encoding='utf-8', newline='').write(CSS)
io.open(os.path.join(SITE, 'assets', 'app.js'), 'w', encoding='utf-8', newline='').write(JS)

print('index.html  %.1f KB' % (len((HEAD + BODY + TAIL).encode('utf-8')) / 1024))
print('style.css   %.1f KB' % (len(CSS.encode('utf-8')) / 1024))
print('app.js      %.1f KB' % (len(JS.encode('utf-8')) / 1024))
