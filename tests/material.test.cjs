const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
let browser,server,base;
before(async()=>{
  const root=path.resolve(__dirname,'../ap-chem-site');
  server=http.createServer(async(req,res)=>{
    const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(root,'.'+(route==='/'?'/index.html':route));
    if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
    try {res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}
    catch {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function open(t,width=1440,route='/learn'){
  const page=await browser.newPage({viewport:{width,height:900}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});
  await page.goto(base+'/#'+route);return page;
}
async function route(page,route){await page.evaluate(r=>location.hash=r,route);await page.waitForFunction(r=>{
  const id=location.hash.split('/')[2],entry=window.AP_CURRICULUM?.entries.get(id);
  return (location.hash==='#'+r||(r.startsWith('/unit/')&&entry?.unit===Number(r.split('/')[2])&&entry.tab===r.split('/')[3]))&&document.querySelector('.m-content .m-active-page');
},route);await page.waitForTimeout(50);}

test('legacy reading records and bookmarks resolve to content, and migration runs once',async t=>{
  const context=await browser.newContext();t.after(()=>context.close());
  await context.addInitScript(()=>{
    if(localStorage.getItem('seeded'))return;
    localStorage.setItem('seeded','true');
    localStorage.setItem('apchem.reader.positions.v1',JSON.stringify({7:'reading-7-2',13:'reading-13-1'}));
    localStorage.setItem('apchem.reader.last.v1',JSON.stringify({chapter:13,tab:'reading'}));
  });
  const page=await context.newPage();await page.goto(base);
  const expected=await page.evaluate(()=>AP_STUDY.legacyChapters[13][1]);
  assert.equal(await page.locator('.m-resume').getAttribute('href'),'#/read/'+expected);
  await page.locator('.m-resume').click();await page.waitForSelector('#'+expected);
  await page.waitForFunction(id=>document.querySelector(`[data-reading="${id}"]`).getAttribute('aria-current')==='location',expected);
  const ids=await page.evaluate(()=>({old:AP_STUDY.legacyChapters[7][2],next:AP_LESSONS[1].sections[0].id}));
  assert.equal(await page.evaluate(id=>JSON.parse(localStorage.getItem('apchem.reader.v2')).positions[id]>0,ids.old),true);
  await page.goto(base+'/#/learn/13/reading');
  await page.waitForURL('**/#/read/'+await page.evaluate(()=>AP_STUDY.legacyChapters[13][0]));
  assert.equal(new URL(page.url()).hash,'#/read/'+await page.evaluate(()=>AP_STUDY.legacyChapters[13][0]));
  await route(page,'/read/'+ids.next);await route(page,'/tools');await page.reload();await route(page,'/learn');
  assert.equal(await page.locator('.m-resume').getAttribute('href'),'#/read/'+ids.next);
});

test('narrow toolbar controls do not overlap and secondary actions remain available',async t=>{
  const page=await open(t,320,'/unit/1/reading');
  const rects=await page.locator('.m-appbar button:visible').evaluateAll(nodes=>nodes.map(n=>({id:n.id,x:n.getBoundingClientRect().x,right:n.getBoundingClientRect().right})));
  for(let i=1;i<rects.length;i++)assert.ok(rects[i].x>=rects[i-1].right-1,JSON.stringify(rects));
  assert.ok(rects.every(r=>r.x>=0&&r.right<=320));
  await page.locator('#m-more').click();await page.locator('#m-shortcuts button').first().click();
  assert.equal(await page.locator('#modalFormula').isVisible(),true);
});

test('unit book practice uses source chapters while old book links still work',async t=>{
  const page=await open(t,390,'/unit/8/checks');
  await page.evaluate(()=>{window.AP_BOOK_DATA={groups:[8,13].map(id=>({id:'chapter'+String(id).padStart(2,'0'),kind:'chapter',title:'Book '+id,sheets:{mcq:'Source'},questions:[{id:'book-'+id,type:'mcq',number:1,stem:'Question '+id,options:['A','B'],answer:0,explanation:'Reason'}]}))};});
  await page.locator('.lesson-footer button').first().click();
  await page.waitForSelector('.book-question');
  assert.equal(new URL(page.url()).hash,'#/book?section=unit8');
  assert.match(await page.locator('.book-question').innerText(),/Question 13/);
  assert.doesNotMatch(await page.locator('.book-question').innerText(),/Question 8/);
  await route(page,'/book?section=chapter08');
  assert.match(await page.locator('.book-question').innerText(),/Question 8/);
});

test('slow startup never paints the legacy interface before the Material shell',async t=>{
  for(const asset of ['app.js','material-app.js'])for(const colorScheme of ['light','dark']){
    const page=await browser.newPage({colorScheme,viewport:{width:colorScheme==='dark'?390:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>page.close());
    let release,blocked;
    const gate=new Promise(resolve=>release=resolve),requested=new Promise(resolve=>blocked=resolve);
    await page.route('**/assets/'+asset,async request=>{blocked();await gate;await request.continue();});
    const navigation=page.goto(base);
    try{
      await requested;
      await page.locator('#material-startup').waitFor({state:'visible'});
      assert.equal(await page.locator('#material-startup .m-wordmark-chem').isVisible(),true);
      assert.equal(await page.locator('.topbar').isVisible(),false);
      assert.equal(await page.locator('#home').isVisible(),false);
      assert.equal(await page.locator('html').getAttribute('data-theme'),colorScheme);
      assert.equal(await page.locator('.material-ready').count(),0);
    }finally{release();await navigation;}
    assert.equal(await page.locator('.m-shell').isVisible(),true);
    assert.equal(await page.locator('.m-course-row').count(),9);
    assert.equal(await page.locator('#material-startup').count(),0);
    assert.equal(await page.locator('.topbar').isVisible(),false);
    assert.deepEqual(errors,[]);
  }
});

test('failed startup offers a working retry without exposing the legacy interface',async t=>{
  const page=await browser.newPage();t.after(()=>page.close());
  await page.route('**/assets/material-app.js',request=>request.abort());
  await page.goto(base);
  assert.equal(await page.locator('#material-startup p').innerText(),'加载失败');
  assert.equal(await page.locator('#material-startup progress').isVisible(),false);
  assert.equal(await page.locator('.topbar').isVisible(),false);
  await page.unroute('**/assets/material-app.js');
  await page.locator('#material-startup button').click();
  await page.locator('.material-ready .m-shell').waitFor({state:'visible'});
  assert.equal(await page.locator('#material-startup').count(),0);
});

test('the no-script reading fallback remains visible',async t=>{
  const page=await browser.newPage({javaScriptEnabled:false});t.after(()=>page.close());
  await page.goto(base);
  assert.equal(await page.locator('.nojs').isVisible(),true);
  assert.equal(await page.locator('#material-startup').isVisible(),false);
});

test('all chapters, examples, checks and original laboratory panes remain reachable',async t=>{
  const page=await open(t);
  assert.equal(await page.locator('.m-course-row').count(),9);
  for(let chapter=1;chapter<=9;chapter++){
    await route(page,`/unit/${chapter}/reading`);
    assert.equal(await page.locator('#studyGuide').isVisible(),true);
    assert.equal(await page.locator('#studyGuide .study-teaching').count(),await page.evaluate(id=>AP_LESSONS[id].sections.length,chapter));
    assert.equal(await page.locator('#studyGuide .katex-error').count(),0);
    await page.locator('.reader-tabs a').nth(1).click();
    await page.waitForSelector('#studyGuide .study-example');
    assert.equal(await page.locator('#studyGuide .study-example').count(),await page.evaluate(id=>AP_LESSONS[id].examples.length,chapter));
    await page.locator('.reader-tabs a').nth(2).click();
    await page.waitForSelector('#studyGuide .study-check');
    assert.equal(await page.locator('#studyGuide .study-check').count(),await page.evaluate(id=>AP_LESSONS[id].checks.length,chapter));
  }
  const panes=await page.locator('#learnContent .pane').evaluateAll(ns=>ns.map(n=>({id:n.id,unit:n.closest('.unit-panel').id.replace('unit-','')})));
  assert.equal(panes.length,49);
  for(const pane of panes){
    await route(page,`/labs/${pane.unit}/${pane.id}`);
    assert.equal(await page.locator('#'+pane.id).isVisible(),true,pane.id);
    assert.equal(await page.locator('#'+pane.id+' .legacy-lab').getAttribute('open'),'');
  }
});

test('vocabulary lookup, mastery and clearing keep the list and recall state in sync',async t=>{
  const page=await open(t,390,'/review/vocabulary');
  assert.equal(await page.locator('#vClear').isDisabled(),true);
  await page.locator('.v-lookup').click();
  await page.locator('#trInput').fill('isotope');
  await page.locator('#trGo').click();
  await page.locator('#modalTr .modal-close').click();
  assert.equal(await page.locator('.v-item').count(),1);
  await page.locator('[data-pane="v-recite"]').click();
  await page.locator('#recInput').fill('同位素');
  await page.locator('#recCheck').click();
  assert.equal(await page.locator('.rec-fb.ok').count(),1);
  await page.locator('[data-pane="v-list"]').click();
  assert.equal(await page.locator('.v-ok').count(),1);
  await page.evaluate(()=>__vocab.add('orbital'));
  await page.locator('[data-pane="v-recite"]').click();
  await page.locator('#recNext').click();
  await page.locator('#recMark').click();
  await page.locator('[data-pane="v-list"]').click();
  assert.equal(await page.locator('.v-ok').count(),2);
  await page.locator('#vClear').click();
  assert.equal(await page.locator('.v-empty').isVisible(),true);
  await page.locator('[data-pane="v-recite"]').click();
  assert.equal(await page.locator('#recInput').isVisible(),false);
  assert.equal(await page.locator('.rec-fb').isVisible(),false);
  assert.equal(await page.locator('#recState').innerText(),'暂无生词');
  await page.reload();
  assert.equal(await page.locator('#vCount').innerText(),'0');
});

test('reading language is in the app bar, persists, and keeps formulas single',async t=>{
  const page=await open(t,1440,'/unit/1/reading');
  assert.equal(await page.locator('.m-appbar #reading-language').isVisible(),true);
  const formulas=await page.locator('#studyGuide .study-teaching .study-equation').count();
  await page.locator('#reading-language').click();
  await page.locator('#reading-language-menu label').filter({hasText:/^English$/}).click();
  assert.equal(await page.locator('#studyGuide .study-teaching p.chinese').count(),0);
  assert.ok(await page.locator('#studyGuide .study-teaching p.english').count()>0);
  assert.equal(await page.locator('#studyGuide .study-teaching .study-equation').count(),formulas);
  await page.reload();
  assert.equal(await page.evaluate(()=>AP_LEARNING.readingLanguage),'en');
  await page.locator('#reading-language').click();
  await page.locator('#reading-language-menu label').filter({hasText:'中英对照'}).click();
  assert.ok(await page.locator('#studyGuide .study-teaching p.chinese').count()>0);
  assert.equal(await page.locator('#studyGuide .study-teaching .study-equation').count(),formulas);
});

test('mobile directory tracks and restores the reading section with browser navigation',async t=>{
  const page=await open(t,390,'/unit/3/reading');
  await page.locator('#m-directory').click();
  const readingId=await page.evaluate(()=>AP_LESSONS[3].sections[2].id);
  await page.locator(`#directory-dialog [data-reading="${readingId}"]`).click();
  await page.waitForFunction(id=>document.querySelector(`[data-reading="${id}"]`).getAttribute('aria-current')==='location',readingId);
  assert.equal(await page.locator('#directory-dialog').isVisible(),false);
  await page.locator('.m-bottom-nav [data-route-nav="tools"]').click();
  await page.waitForSelector('#tools-page:visible');
  await page.goBack();
  await page.waitForFunction(id=>document.querySelector(`[data-reading="${id}"]`).getAttribute('aria-current')==='location',readingId);
  await page.reload();
  await page.waitForFunction(id=>document.querySelector(`[data-reading="${id}"]`).getAttribute('aria-current')==='location',readingId);
  for(const view of ['/learn','/practice','/review','/review/vocabulary','/labs','/tools']){
    await route(page,view);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),view);
  }
});

function contrast(a,b){
  function luminance(color){const c=color.match(/[\da-f]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
  const [x,y]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (x+.05)/(y+.05);
}
test('six palettes have readable light and dark roles and persist without touching learning data',async t=>{
  const page=await open(t,390);
  await page.evaluate(()=>localStorage.setItem('apchem.vocab.v1','[{"word":"retained"}]'));
  await page.locator('#appearance').click();
  for(const mode of ['light','dark']){
    await page.locator(`.appearance-mode-label:has(input[value="${mode}"])`).click();
    for(const accent of ['blue','green','purple','orange','rose','gray']){
      await page.locator(`.appearance-accent-item[data-accent="${accent}"]`).click();
      const colors=await page.evaluate(()=>{const c=getComputedStyle(document.documentElement);return Object.fromEntries(['surface','on-surface','on-surface-variant','primary','on-primary','primary-container','on-primary-container','secondary-container','on-secondary-container','error','on-error'].map(n=>[n,c.getPropertyValue('--md-sys-color-'+n).trim()]));});
      for(const [fg,bg] of [['on-surface','surface'],['on-surface-variant','surface'],['primary','surface'],['on-primary','primary'],['on-primary-container','primary-container'],['on-secondary-container','secondary-container'],['on-error','error']])assert.ok(contrast(colors[fg],colors[bg])>=4.5,`${mode}/${accent}/${fg}`);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
  }
  await page.keyboard.press('Escape');await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('html').getAttribute('data-theme-accent'),'gray');
  assert.equal(await page.evaluate(()=>localStorage.getItem('apchem.vocab.v1')),'[{"word":"retained"}]');
  await page.locator('#appearance').click();await page.locator('.appearance-mode-label:has(input[value="system"])').click();
  await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
});

test('tools and account dialogs close with Escape and return keyboard focus',async t=>{
  const page=await open(t,768,'/tools');
  for(const [text,id] of [['公式与周期表','modalFormula'],['课程大纲','modalPdf'],['查缺补漏','modalGap'],['翻译','modalTr'],['学习设置','modalSettings']]){
    const button=page.locator('.m-tool-row').filter({hasText:text});await button.click();
    assert.equal(await page.locator('#'+id).isVisible(),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#'+id).isVisible(),false);
    assert.equal(await button.evaluate(n=>n===document.activeElement),true);
  }
  await page.locator('#btnUser').click();assert.equal(await page.locator('#modalAccount').isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#btnUser').evaluate(n=>n===document.activeElement),true);
});

test('system theme is the default and follows the OS, regardless of the legacy theme',async t=>{
  for(const mode of [null,'system'])for(const colorScheme of ['light','dark']){
    const page=await browser.newPage({colorScheme});t.after(()=>page.close());
    await page.addInitScript(mode=>{
      if(mode)localStorage.setItem('apchem.themeMode',mode);
      localStorage.setItem('apchem.theme',matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark');
    },mode);
    await page.goto(base);
    assert.equal(await page.locator('html').getAttribute('data-theme-mode'),'system');
    assert.equal(await page.locator('html').getAttribute('data-theme'),colorScheme);
    assert.equal(await page.locator('html').getAttribute('data-theme-effective'),colorScheme);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme),colorScheme);
    const next=colorScheme==='light'?'dark':'light';
    await page.emulateMedia({colorScheme:next});
    await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,next);
  }
});

test('interface language updates navigation and dynamic pages independently of reading language',async t=>{
  const page=await open(t,1440,'/tools');
  await page.locator('#interface-language').selectOption('en');
  assert.deepEqual(await page.locator('.m-navigation b').allTextContents(),['Learn','Practice','Review','Labs','Tools']);
  await page.locator('.m-navigation [data-route-nav="learn"]').click();
  assert.equal(await page.locator('.m-course-row strong').first().textContent(),'Atomic Structure and Properties');
  await page.locator('.m-course-row').first().click();
  assert.equal(await page.locator('#reading-language .m-language-value').textContent(),'Bilingual');
  assert.ok(await page.locator('#studyGuide p.chinese').count()>0);
  await page.locator('#reading-language').click();
  assert.equal(await page.locator('#reading-language-menu legend').textContent(),'Reading language');
  await page.keyboard.press('Escape');
  await page.locator('#appearance').click();
  assert.equal(await page.locator('.appearance-title').textContent(),'Appearance');
  await page.keyboard.press('Escape');
  await page.reload();
  assert.deepEqual(await page.locator('.m-navigation b').allTextContents(),['Learn','Practice','Review','Labs','Tools']);
  await route(page,'/tools');await page.locator('#interface-language').selectOption('zh');
  assert.deepEqual(await page.locator('.m-navigation b').allTextContents(),['学习','练习','复习','实验','工具']);
});

test('mobile scaling applies to the interface and periodic table scrolls within its panel',async t=>{
  const page=await open(t,390,'/tools');
  await page.locator('.m-tool-row').filter({hasText:'学习设置'}).click();
  await page.locator('#setFont [data-v="1.25"]').click();
  assert.equal(await page.evaluate(()=>document.body.style.zoom),'1.25');
  await page.keyboard.press('Escape');await page.reload();
  assert.equal(await page.evaluate(()=>document.body.style.zoom),'1.25');
  await route(page,'/unit/1/reading');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await route(page,'/tools');await page.locator('.m-tool-row').filter({hasText:'学习设置'}).click();
  await page.locator('#setFont [data-v="1"]').click();await page.keyboard.press('Escape');
  await route(page,'/labs/u1/u1-trends');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('#ptFig').evaluate(n=>n.scrollWidth>n.clientWidth),true);
  assert.equal(await page.locator('#ptFig').evaluate(n=>{n.scrollLeft=100;return n.scrollLeft>0;}),true);
});

test('settings controls stay usable, pet tools stay in settings, and the sidebar fills the scaled viewport',async t=>{
  const page=await open(t,1440,'/tools');
  assert.equal(await page.locator('.m-brand').getAttribute('aria-label'),'AP Chem');
  assert.equal(await page.locator('.m-sidebar-footer').innerText(),'学习设置');
  for(const scale of ['0.9','1','1.25']){
    await page.locator('.m-tool-row').filter({hasText:'学习设置'}).click();
    await page.locator(`#setFont [data-v="${scale}"]`).click();await page.keyboard.press('Escape');
    assert.ok(await page.locator('.m-sidebar').evaluate(n=>Math.abs(n.getBoundingClientRect().bottom-innerHeight)<1));
  }
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    await page.locator('.m-tool-row').filter({hasText:'学习设置'}).click();
    for(const id of ['setFont','setBankMode']){
      assert.ok(await page.locator('#'+id).evaluate(n=>{const buttons=[...n.children].map(b=>b.getBoundingClientRect());return buttons.every(b=>Math.abs(b.top-buttons[0].top)<1)&&n.scrollWidth<=n.clientWidth+1;}));
    }
    await page.locator('#btnPetSettings').click();
    assert.equal(await page.locator('#modalSettings .modal-head h3').textContent(),'区老师');
    assert.equal(await page.locator('.set-sub-head').isVisible(),false);
    assert.equal(await page.locator('#btnPetBack').evaluate(n=>n===document.activeElement),true);
    await page.locator('#setPetColor').fill('#00D4FF');
    assert.equal(await page.evaluate(()=>localStorage.getItem('apchem.petColor')),'#00D4FF');
    await page.locator('.swatch[data-c="#4a7de0"]').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#setPetColor').inputValue(),'#4A7DE0');
    assert.equal(await page.locator('#setPetPanel .pet-items').count(),1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#btnPetBack').click();
    assert.equal(await page.locator('#btnPetSettings').evaluate(n=>n===document.activeElement),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.pet-items').isVisible(),false);
  }
});
