(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  const chapters = window.AP_STUDY.chapters;
  const lessons = window.AP_LESSONS;
  const uiText = new Map(Object.entries({
    '跳到正文':'Skip to content','学习':'Learn','练习':'Practice','复习':'Review','实验':'Labs','工具':'Tools','学习统计':'Study stats','排行榜':'Leaderboard','在线时长、做题数量与正确率':'Time, questions and accuracy','做题数量排名与正确率':'Ranked by questions, with accuracy','学习设置':'Settings','课程目录':'Units','关闭目录':'Close chapters','返回':'Back','外观':'Appearance','账号':'Account','课程':'Courses','搜索课程':'Search courses','未找到课程':'No courses found','继续阅读':'Continue reading','按知识点':'By topic','书本题库':'Book practice','错题':'Mistakes','书本错题':'Book mistakes','生词':'Vocabulary','讲义':'Reading','例题':'Examples','自测':'Checks','实验与知识点':'Labs and topics','打开单元':'Open unit','公式与周期表':'Reference','常用公式、符号与元素数据':'Formulas, symbols and elements','课程大纲':'Course outline','AP 单元与知识点':'AP units and topics','查缺补漏':'Topic coverage','按知识点检查掌握情况':'Coverage by topic','词典':'Dictionary','化学词汇与中文释义':'Chemistry terms and definitions','字号、题目呈现与数据备份':'Text size, practice view and backup','界面语言':'Interface language','讲义语言':'Reading language','中英对照':'Bilingual','题型':'Question type','知识点':'Topics','题量':'Questions','界面缩放':'Interface scale','主导航':'Main navigation','底部导航':'Bottom navigation','章节目录':'Units','练习来源':'Practice source','复习内容':'Review source'
  }));
  const uiOriginal=new WeakMap();
  Object.entries({'公式表':'Formula sheet','更多':'More','翻译':'Translation','单词与段落':'Words and passages','翻译原文':'Text to translate','输入英文单词或段落':'Enter an English word or passage'}).forEach(([zh,en])=>uiText.set(zh,en));
  Object.entries({'显示桌宠':'Show pet','尺寸':'Size','颜色':'Color','移动':'Movement','桌宠':'Pet','设置保存在此设备。':'Saved on this device.','页脚署名的字号':'Footer credit size','自定义区老师颜色 HEX':'Custom pet color HEX'}).forEach(([zh,en])=>uiText.set(zh,en));
  const isEnglish=()=>window.AP_LEARNING.language==='en';
  function localize(root){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while(n=walker.nextNode()){
      const raw=uiOriginal.get(n)||n.textContent.trim();
      if(uiText.has(raw)){uiOriginal.set(n,raw);n.textContent=isEnglish()?uiText.get(raw):raw;}
    }
    root.querySelectorAll('[aria-label],[title],[placeholder]').forEach(n=>['aria-label','title','placeholder'].forEach(attr=>{const value=n.getAttribute(attr);if(!value)return;const original=[...uiText].find(([zh,en])=>value===zh||value===en)?.[0];if(original)n.setAttribute(attr,isEnglish()?uiText.get(original):original);}));
  }
  const paths = {
    book:'M3 4h7a3 3 0 0 1 2 1 3 3 0 0 1 2-1h7v15h-7a3 3 0 0 0-2 1 3 3 0 0 0-2-1H3zM12 5v15',
    quiz:'M14 3H5v18h14V8zM14 3v5h5M8 13l2 2 5-5M8 18h7',
    review:'M5 3h14v18l-7-4-7 4z',
    lab:'M9 3h6M10 3v7L4 19q-1 2 2 2h12q3 0 2-2l-6-9V3M8 15h8',
    tools:'M4 4h16v16H4zM8 8h8M8 12h3M15 11v6M12 14h6',
    chart:'M5 20V10M12 20V4M19 20v-6M3 20h18',
    trophy:'M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0zM6 5H3v3a3 3 0 0 0 3 3M18 5h3v3a3 3 0 0 1-3 3',
    menu:'M4 6h16M4 12h16M4 18h16',
    back:'m14 5-7 7 7 7M7 12h14',
    arrow:'m9 5 7 7-7 7',
    close:'m6 6 12 12M6 18 18 6',
    palette:'M12 3a9 9 0 1 0 0 18 2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a6 6 0 0 0 6-5c-1-3-5-5-9-5zM7 8h.01M11 6h.01M16 7h.01M5 12h.01',
    user:'M8 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0M4 21v-2a8 8 0 0 1 16 0v2',
    translate:'m4 5 12 0M10 3v2M6 5c0 5 4 9 8 10M14 5c0 5-4 9-10 10M14 21l4-10 4 10M15.5 17h5',
    search:'M10 3a7 7 0 1 0 0 14 7 7 0 1 0 0-14m5 12 6 6',
    formula:'M18 5H8l5 7-5 7h10'
  };
  const icon = name => `<svg class="m-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
  const node = (tag, cls, text) => { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
  const link = (label, href, cls='') => { const n=node('a',cls,label);n.href=href;return n; };
  const navItems = [['learn','学习','book'],['practice','练习','quiz'],['review','复习','review'],['labs','实验','lab'],['tools','工具','tools']];
  const navMarkup = () => navItems.map(([id,label,i])=>`<a href="#/${id}" class="m-nav-link" data-route-nav="${id}"><span>${icon(i)}</span><b>${label}</b></a>`).join('');
  const legacyShow = window.__showModule;
  const legacyChapter = window.__goChapter;
  let rendering = false, currentRoute = '', chapterId = 1, guideTab='reading', readingPoint='', renderedHash='';
  const curriculum = window.AP_CURRICULUM;
  const reader = read('apchem.reader.v2',null) || curriculum.migrate(read('apchem.reader.positions.v1',{}),read('apchem.reader.last.v1',null));
  save('apchem.reader.v2',reader);
  const unitHref = (id,tab='reading') => tab==='reading' ? curriculum.href(curriculum.latest(reader,id)) : `#/unit/${id}/${tab}`;
  const shell = node('div','m-shell');
  shell.innerHTML = `<a class="m-skip" href="#main-content">跳到正文</a>
    <aside class="m-sidebar"><a class="m-brand" href="#/learn" aria-label="AP Chem"><span class="m-wordmark-ap">AP</span><span class="m-wordmark-chem">Chem</span></a><nav class="m-navigation" aria-label="主导航">${navMarkup()}</nav><div id="directory-slot"></div><div class="m-sidebar-footer"><button id="m-settings" type="button">学习设置</button></div></aside>
    <div class="m-workspace"><header class="m-appbar"><div class="m-appbar-left"><button id="m-back" class="m-icon-button" type="button" aria-label="返回">${icon('back')}</button><button id="m-directory" class="m-icon-button" type="button" aria-label="课程目录" aria-haspopup="dialog" aria-expanded="false" aria-controls="directory-dialog">${icon('menu')}</button><span id="m-location">课程</span></div><div class="m-appbar-actions"><button id="appearance" class="m-icon-button" type="button" aria-label="外观" title="外观">${icon('palette')}</button><div id="account-slot"></div></div></header><main id="main-content" class="m-content" tabindex="-1"></main></div><nav class="m-bottom-nav" aria-label="底部导航">${navMarkup()}</nav>`;
  document.body.prepend(shell);
  const main=$('main-content');
  shell.querySelector('.m-skip').onclick=e=>{e.preventDefault();main.focus();main.scrollIntoView();};
  const readingLanguage=node('button','m-language-button');readingLanguage.id='reading-language';readingLanguage.type='button';readingLanguage.setAttribute('popovertarget','reading-language-menu');readingLanguage.setAttribute('aria-label','讲义语言');readingLanguage.innerHTML=icon('translate')+'<span class="m-language-value">中英对照</span><svg class="m-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
  $('appearance').before(readingLanguage);
  const formulaButton=node('button','m-icon-button');formulaButton.id='m-formula';formulaButton.type='button';formulaButton.setAttribute('aria-label','公式表');formulaButton.title='公式表';formulaButton.innerHTML=icon('formula');
  formulaButton.onclick=()=>{const target=document.getElementById('btnFormula');if(target)target.click();};
  $('appearance').before(formulaButton);
  const translateButton=node('button','m-icon-button');translateButton.id='m-translate';translateButton.type='button';translateButton.setAttribute('aria-label','翻译');translateButton.title='翻译';translateButton.innerHTML=icon('translate');
  translateButton.onclick=()=>{const target=document.getElementById('btnTrans');if(target)target.click();};
  $('m-formula').before(translateButton);
  const more=node('button','m-icon-button m-more');more.id='m-more';more.type='button';more.setAttribute('aria-label','更多');more.setAttribute('popovertarget','m-shortcuts');more.innerHTML='<svg class="m-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>';
  $('appearance').before(more);
  const shortcuts=node('div','m-shortcuts');shortcuts.id='m-shortcuts';shortcuts.setAttribute('popover','auto');
  [['公式表','formula','btnFormula'],['翻译','translate','btnTrans']].forEach(([label,i,id])=>{const b=node('button');b.type='button';b.innerHTML=icon(i)+`<span>${label}</span>`;b.onclick=()=>{shortcuts.hidePopover();$(id).click();};shortcuts.append(b);});document.body.append(shortcuts);
  shortcuts.addEventListener('beforetoggle',e=>{if(e.newState==='open'){const r=more.getBoundingClientRect();shortcuts.style.top=(r.bottom+8)+'px';shortcuts.style.right=Math.max(12,innerWidth-r.right)+'px';localize(shortcuts);}});
  const languageMenu=node('div','m-language-menu');languageMenu.id='reading-language-menu';languageMenu.setAttribute('popover','auto');languageMenu.innerHTML='<fieldset><legend>讲义语言</legend>'+[['both','中英对照'],['zh','中文'],['en','English']].map(([value,label])=>`<label><input type="radio" name="reading-language" value="${value}"><span>${label}</span></label>`).join('')+'</fieldset>';document.body.append(languageMenu);
  function syncReadingLanguage(){const value=window.AP_LEARNING.readingLanguage||'both';languageMenu.querySelector(`input[value="${value}"]`).checked=true;readingLanguage.querySelector('.m-language-value').textContent={both:isEnglish()?'Bilingual':'中英对照',zh:'中文',en:'English'}[value];}
  languageMenu.addEventListener('beforetoggle',e=>{if(e.newState==='open'){syncReadingLanguage();const r=readingLanguage.getBoundingClientRect();languageMenu.style.top=(r.bottom+8)+'px';languageMenu.style.right=Math.max(12,innerWidth-r.right)+'px';}});
  languageMenu.onchange=e=>{window.AP_LEARNING.setReadingLanguage(e.target.value);syncReadingLanguage();languageMenu.hidePopover();readingLanguage.focus();};
  const oldHome=$('home');oldHome.hidden=true;
  const originalTop=document.querySelector('.topbar');originalTop.hidden=true;
  const account=$('btnUser');account.className='m-account';$('account-slot').append(account);account.title='账号';
  account.style.setProperty('--account-icon',`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${paths.user}"/></svg>`)}")`);
  const pages={};
  ['mod-learn','mod-bank','mod-wrong','mod-vocab','mod-stats','mod-rank','studyGuide','bookPractice'].forEach(id=>{const p=$(id);if(p){main.append(p);p.hidden=true;pages[id]=p;}});
  const courses=node('section','m-courses');courses.id='courses-page';main.prepend(courses);pages.courses=courses;
  const practiceNav=node('nav','m-page-tabs');practiceNav.setAttribute('aria-label','练习来源');practiceNav.innerHTML='<a href="#/practice">按知识点</a><a href="#/book">书本题库</a>';main.append(practiceNav);
  const reviewNav=node('nav','m-page-tabs');reviewNav.setAttribute('aria-label','复习内容');reviewNav.innerHTML='<a href="#/review">错题</a><a href="#/review/book">书本错题</a><a href="#/review/vocabulary">生词</a>';main.append(reviewNav);
  const labs=node('section','m-labs');labs.id='labs-page';main.append(labs);pages.labs=labs;
  const tools=node('section','m-tools');tools.id='tools-page';main.append(tools);pages.tools=tools;
  const directory=node('nav','m-directory-tree');directory.id='course-directory';directory.setAttribute('aria-label','章节目录');
  const dirTitle=node('h2','m-directory-title','课程目录');directory.append(dirTitle);
  chapters.forEach(c=>{
    const details=node('details','m-chapter');details.dataset.chapter=c.id;
    const summary=node('summary');summary.innerHTML=`<span class="m-number">${String(c.id).padStart(2,'0')}</span><span>${c.title.zh}</span>${icon('arrow')}`;
    details.append(summary);const items=node('div','m-chapter-items');
    items.append(link('讲义',`#/unit/${c.id}/reading`,'m-chapter-reading'));
    const sub=node('div','m-reading-points');
    (lessons[c.id]?.sections||[]).forEach(s=>{const a=link(s.title.zh,curriculum.href(s.id));a.dataset.reading=s.id;sub.append(a);});
    items.append(sub,link('例题',unitHref(c.id,'examples')),link('自测',unitHref(c.id,'checks')));details.append(items);directory.append(details);
  });
  $('directory-slot').append(directory);
  const drawer=node('dialog','m-directory-dialog');drawer.id='directory-dialog';drawer.setAttribute('aria-label','课程目录');drawer.innerHTML=`<div class="m-dialog-heading"><h2>课程目录</h2><button class="m-icon-button" aria-label="关闭目录">${icon('close')}</button></div><div id="mobile-directory-slot"></div>`;document.body.append(drawer);
  const compact=matchMedia('(max-width: 1099px)');
  function positionDirectory(){if(drawer.open)drawer.close();(compact.matches?$('mobile-directory-slot'):$('directory-slot')).append(directory);}
  compact.addEventListener('change',positionDirectory);positionDirectory();
  $('m-directory').onclick=()=>{drawer.showModal();$('m-directory').setAttribute('aria-expanded','true');const active=directory.querySelector('.is-current');if(active)active.scrollIntoView({block:'nearest'});};
  drawer.querySelector('button').onclick=()=>drawer.close();drawer.addEventListener('close',()=>$('m-directory').setAttribute('aria-expanded','false'));
  drawer.addEventListener('click',e=>{if(e.target===drawer&&e.clientX>drawer.getBoundingClientRect().right)drawer.close();});
  $('m-settings').onclick=()=>$('btnSettings').click();
  $('m-back').onclick=()=>{if(currentRoute.startsWith('/unit/'))go('/learn');else if(currentRoute.startsWith('/labs/'))go('/labs');else if(currentRoute.startsWith('/review/'))go('/review');else if(currentRoute==='/stats'||currentRoute==='/rank')go('/tools');else go('/learn');};
  function courseList(){
    courses.replaceChildren();const heading=node('div','m-page-heading');heading.append(node('h1','','课程'),node('span','m-count',`${chapters.length} ${isEnglish()?"units":"单元"}`));courses.append(heading);
    if(curriculum.entries.has(reader.last)){const c=chapters.find(c=>c.id===curriculum.entries.get(reader.last).unit);const resume=link('',curriculum.href(reader.last),'m-resume');resume.innerHTML=`${icon('book')}<span><small>继续阅读</small><strong>${c.title[window.AP_LEARNING.language]}</strong></span>${icon('arrow')}`;courses.append(resume);}
    const search=node('label','m-search');search.innerHTML=`${icon('search')}<input type="search" aria-label="搜索课程" placeholder="搜索课程" autocomplete="off">`;courses.append(search);
    const list=node('div','m-course-list');chapters.forEach(c=>{const a=link('',unitHref(c.id),'m-course-row');a.dataset.search=`${c.title.zh} ${c.title.en}`.toLowerCase();const sections=lessons[c.id]?.sections||[];a.innerHTML=`<span class="m-course-number">${String(c.id).padStart(2,'0')}</span><span><strong>${c.title[window.AP_LEARNING.language]}</strong><small>${c.title[isEnglish()?"zh":"en"]}</small></span><span class="m-course-meta">${sections.length} ${isEnglish()?"sections":"节"}</span>${icon('arrow')}`;list.append(a);});courses.append(list);
    const empty=node('p','m-empty','未找到课程');empty.hidden=true;courses.append(empty);search.querySelector('input').oninput=e=>{const value=e.target.value.trim().toLowerCase();let count=0;list.querySelectorAll('a').forEach(a=>{a.hidden=!a.dataset.search.includes(value);if(!a.hidden)count++;});empty.hidden=!!count;};
  }
  const labUnits=[...document.querySelectorAll('#learnContent .unit-panel')].map(p=>({id:p.id.replace('unit-',''),title:document.querySelector(`.unit-card[data-unit="${p.id.replace('unit-','')}"] h2`)?.textContent||p.id,panes:[...p.querySelectorAll('.tab[data-pane]')].map(a=>({id:a.dataset.pane,title:a.textContent}))}));
  function unitTitle(unit){return chapters.find(c=>'u'+c.id===unit.id)?.title[window.AP_LEARNING.language]||unit.title;}
  function labList(){labs.replaceChildren(node('h1','','实验与知识点'));const list=node('div','m-lab-list');labUnits.forEach((unit,i)=>{const d=node('details','m-lab-unit'),s=node('summary');s.innerHTML=`<span class="m-course-number">${String(i+1).padStart(2,'0')}</span><strong>${unitTitle(unit)}</strong>${icon('arrow')}`;d.append(s);const links=node('div','m-lab-topics');unit.panes.forEach(p=>links.append(link(isEnglish()?(window.AP_TOPICS[p.id]?.[0]||p.title):p.title,`#/labs/${unit.id}/${p.id}`)));if(!unit.panes.length)links.append(link('打开单元',`#/labs/${unit.id}/${unit.id}`));d.append(links);list.append(d);});labs.append(list);}
  const toolEntries=[['公式与周期表','常用公式、符号与元素数据','btnFormula','tools',null],['课程大纲','AP 单元与知识点','btnPdf','book',null],['查缺补漏','按知识点检查掌握情况','btnGap','quiz',null],['翻译','单词与段落','btnTrans','translate',null],['学习统计','在线时长、做题数量与正确率',null,'chart','/stats'],['排行榜','做题数量排名与正确率',null,'trophy','/rank'],['学习设置','字号、题目呈现与数据备份','btnSettings','tools',null]];
  tools.append(node('h1','','工具'));const toolList=node('div','m-tool-list');toolEntries.forEach(([label,desc,target,i,route])=>{const b=node('button','m-tool-row');b.type='button';b.innerHTML=`${icon(i)}<span><strong>${label}</strong><small>${desc}</small></span>${icon('arrow')}`;b.onclick=()=>route?go(route):$(target).click();toolList.append(b);});tools.append(toolList);
  const uiLanguage=node('label','m-ui-language','界面语言');const uiSelect=node('select');uiSelect.id='interface-language';uiSelect.setAttribute('aria-label','界面语言');uiSelect.innerHTML='<option value="zh">中文</option><option value="en">English</option>';uiSelect.value=window.AP_LEARNING.language;uiSelect.onchange=()=>window.AP_LEARNING.setLanguage(uiSelect.value);uiLanguage.append(uiSelect);tools.append(uiLanguage);
  // Keep the existing controllers and persistent data; only navigation changes owner.
  function go(path){if(location.hash==='#'+path)render();else location.hash=path;}
  window.AP_SHELL={go};
  const moduleRoutes={home:'/learn',learn:'/labs',bank:'/practice',wrong:'/review',vocab:'/review/vocabulary'};
  window.__showModule=m=>rendering?legacyShow(m):go(moduleRoutes[m]||'/learn');
  window.__goChapter=(unit,pane)=>rendering?legacyChapter(unit,pane):go(`/labs/${unit}/${pane}`);
  document.addEventListener('apchem:navigate',e=>{const d=e.detail;if(d.view==='guide')go(unitHref(Number(d.chapter)||chapterId,d.tab||'reading').slice(1));if(d.view==='book')go('/book'+(d.section&&d.section!=='all'?'?section='+encodeURIComponent(d.section):''));});
  document.addEventListener('click',e=>{const tab=e.target.closest('#learnContent .tab[data-pane]');if(!tab||rendering)return;e.preventDefault();e.stopImmediatePropagation();go(`/labs/${tab.closest('.unit-panel').id.replace('unit-','')}/${tab.dataset.pane}`);},true);
  $('backDir').addEventListener('click',()=>go('/labs'));
  directory.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;if(drawer.open)drawer.close();if(a.dataset.reading){e.preventDefault();go(a.hash.slice(1));}});
  function remember(){if(currentRoute.startsWith('/unit/')&&guideTab==='reading'&&readingPoint){reader.positions[readingPoint]=Date.now();reader.last=readingPoint;save('apchem.reader.v2',reader);}}
  function syncDirectory(){directory.querySelectorAll('.m-chapter').forEach(d=>{const active=currentRoute.startsWith('/unit/')&&Number(d.dataset.chapter)===chapterId;d.classList.toggle('is-current',active);if(active)d.open=true;d.querySelector('.m-reading-points').hidden=!active||guideTab!=='reading';d.querySelectorAll('a').forEach(a=>a.setAttribute('aria-current',active&&!a.dataset.reading&&((a.classList.contains('m-chapter-reading')&&guideTab==='reading')||a.hash.endsWith('/'+guideTab))?'page':'false'));});}
  function updatePosition(){if(location.hash!==renderedHash||!currentRoute.startsWith('/unit/')||guideTab!=='reading')return;const sections=[...$('studyGuide').querySelectorAll('.study-teaching[id]')].filter(n=>!n.hidden);if(!sections.length)return;let active=sections[0];for(const section of sections)if(section.getBoundingClientRect().top<innerHeight*.4)active=section;if(readingPoint!==active.id){readingPoint=active.id;history.replaceState(null,'',curriculum.href(readingPoint));renderedHash=location.hash;}directory.querySelectorAll('[data-reading]').forEach(a=>a.setAttribute('aria-current',a.dataset.reading===readingPoint?'location':'false'));}
  let scrollFrame;window.addEventListener('scroll',()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=null;updatePosition();});},{passive:true});window.addEventListener('pagehide',remember);
  function setPage(p){p.hidden=false;p.classList.add('m-active-page');}
  function render(){
    remember();window.AP_LEARNING.closePopups?.();if(drawer.open)drawer.close();
    const hash=location.hash.slice(1)||'/learn',parts=hash.split('?'),query=new URLSearchParams(parts[1]||'');
    let route=parts[0],segments=route.split('/').filter(Boolean),targetId='';
    if(segments[0]==='learn'&&segments[1]){
      const id=curriculum.legacy(segments[1],segments[2]||'reading');
      history.replaceState(null,'',curriculum.href(id));return render();
    }
    if(['read','example','check'].includes(segments[0])){
      const entry=curriculum.entries.get(segments[1]);
      if(!entry||{read:'reading',example:'examples',check:'checks'}[segments[0]]!==entry.tab){history.replaceState(null,'','#/learn');return render();}
      targetId=segments[1];route=`/unit/${entry.unit}/${entry.tab}`;segments=['unit',String(entry.unit),entry.tab];
    }
    readingPoint='';
    if(!['learn','unit','practice','book','review','labs','tools','stats','rank'].includes(segments[0])){history.replaceState(null,'','#/learn');return render();}
    currentRoute=route;rendering=true;legacyShow('home');oldHome.hidden=true;
    Object.values(pages).forEach(p=>{p.hidden=true;p.classList.remove('m-active-page');});practiceNav.hidden=true;reviewNav.hidden=true;
    let title='课程',active=segments[0],focusTarget;
    if(segments[0]==='learn'||segments[0]==='unit'){
      active='learn';
      const found=chapters.find(c=>c.id===Number(segments[1]));
      if(!found){courseList();setPage(courses);focusTarget=courses.querySelector('h1');}
      else{chapterId=found.id;guideTab=['reading','examples','checks'].includes(segments[2])?segments[2]:'reading';title=found.title[window.AP_LEARNING.language];targetId=targetId||(guideTab==='reading'?curriculum.latest(reader,chapterId):curriculum.first(chapterId,guideTab));reader.last=targetId;save('apchem.reader.v2',reader);setPage(pages.studyGuide);window.AP_LEARNING.showGuide(chapterId,guideTab);focusTarget=pages.studyGuide.querySelector('h1,h2');}
    }else if(segments[0]==='practice'){
      title='练习';practiceNav.hidden=false;main.insertBefore(practiceNav,pages['mod-bank']);legacyShow('bank');setPage(pages['mod-bank']);
    }else if(segments[0]==='book'){
      title='书本题库';active='practice';practiceNav.hidden=false;main.insertBefore(practiceNav,pages.bookPractice);setPage(pages.bookPractice);window.AP_LEARNING.showBook(query.get('section')||'all');
    }else if(segments[0]==='review'){
      title='复习';reviewNav.hidden=false;const vocabulary=segments[1]==='vocabulary';if(segments[1]==='book'){main.insertBefore(reviewNav,pages.bookPractice);setPage(pages.bookPractice);window.AP_LEARNING.showBook('all',true);}else{const id=vocabulary?'mod-vocab':'mod-wrong';main.insertBefore(reviewNav,pages[id]);legacyShow(vocabulary?'vocab':'wrong');setPage(pages[id]);}
    }else if(segments[0]==='labs'){
      title='实验与知识点';const unit=labUnits.find(u=>u.id===segments[1]);if(unit){legacyChapter(unit.id,segments[2]||unit.panes[0]?.id||unit.id);setPage(pages['mod-learn']);pages['mod-learn'].querySelectorAll('.legacy-lab').forEach(d=>d.open=true);title=unitTitle(unit);}else{labList();setPage(labs);}
    }else if(segments[0]==='tools'){title='工具';setPage(tools);}
    else if(segments[0]==='stats'){title='学习统计';active='tools';legacyShow('stats');setPage(pages['mod-stats']);}
    else if(segments[0]==='rank'){title='排行榜';active='tools';legacyShow('rank');setPage(pages['mod-rank']);}
    title=isEnglish()?(uiText.get(title)||title):title;$('m-location').textContent=title;$('m-back').hidden=route==='/learn';document.title=`${title} · AP Chemistry`;
    document.documentElement.dataset.view=active;readingLanguage.hidden=!route.startsWith('/unit/');syncReadingLanguage();
    document.querySelectorAll('[data-route-nav]').forEach(a=>{const selected=a.dataset.routeNav===active;a.setAttribute('aria-current',selected?'page':'false');});
    [...practiceNav.children,...reviewNav.children].forEach(a=>a.setAttribute('aria-current',a.hash==='#'+route?'page':'false'));
    syncShellLanguage();syncDirectory();rendering=false;renderedHash=location.hash;window.scrollTo(0,0);if(focusTarget){focusTarget.tabIndex=-1;focusTarget.focus({preventScroll:true});}
    if(route.startsWith('/unit/')){requestAnimationFrame(()=>{const target=$(targetId);if(target)target.scrollIntoView({block:'start'});updatePosition();});}
  }
  function syncShellLanguage(){
    const lang=window.AP_LEARNING.language;
    [shell.querySelector('.m-sidebar'),shell.querySelector('.m-appbar'),shell.querySelector('.m-bottom-nav'),practiceNav,reviewNav,courses,labs,tools,languageMenu,$('modalSettings'),drawer.querySelector('.m-dialog-heading'),...document.querySelectorAll('.module-head,#bankSelView h3,#bankQuizView h3')].forEach(localize);
    chapters.forEach(c=>{const d=directory.querySelector(`[data-chapter="${c.id}"]`);d.querySelector('summary>span:nth-child(2)').textContent=c.title[lang];d.querySelectorAll('[data-reading]').forEach((a,i)=>a.textContent=lessons[c.id].sections[i].title[lang]);});
    localize(directory);uiSelect.value=lang;
    readingLanguage.querySelector('.m-language-value').textContent=({both:isEnglish()?'Bilingual':'中英对照',zh:'中文',en:'English'})[window.AP_LEARNING.readingLanguage];
  }
  document.addEventListener('apchem:language',()=>{syncShellLanguage();render();});
  document.addEventListener('apchem:reader',()=>{syncDirectory();syncReadingLanguage();requestAnimationFrame(updatePosition);});
  window.addEventListener('hashchange',render);
  // Clear labels that described the old navigation rather than the learning task.
  const textReplacements={'第一步 · 选择题型':'题型','第二步 · 选择范围':'知识点','第三步 · 选择题目数量':'题量','题库 · Question Bank':'练习','学习 · Course Map':'实验与知识点','做题空间':'练习','错题本 · Review Book':'错题','生词本 · Vocabulary Book':'生词'};
  document.querySelectorAll('.module-head h2,#bankSelView h3,#bankQuizView h3').forEach(n=>{if(textReplacements[n.textContent])n.textContent=textReplacements[n.textContent];});
  document.querySelectorAll('#bankSelView .lead,.module-head p').forEach(n=>n.hidden=true);
  $('setTheme').closest('.set-row').hidden=true;
  $('setFont').closest('.set-row').querySelector('.set-info span').textContent='界面缩放';
  $('setWm').closest('.set-row').querySelector('.set-info span').textContent='页脚署名的字号';
  // Settings keep the existing controllers, with a single header for each pane.
  const settings=$('modalSettings'),settingsTitle=settings.querySelector('.modal-head h3'),petPanel=$('setPetPanel'),petBack=$('btnPetBack'),petEntry=$('btnPetSettings');
  const petInfo=$('rowPetEntry').querySelector('.set-info');petInfo.querySelector('span').textContent='桌宠';
  petEntry.replaceChildren(petInfo,$('setPetEntryState'));petEntry.insertAdjacentHTML('beforeend',icon('arrow'));
  $('rowPetEntry').replaceChildren(petEntry);
  petEntry.className='m-settings-entry';petEntry.setAttribute('aria-label','区老师');
  petBack.className='m-icon-button';petBack.innerHTML=icon('back');petBack.setAttribute('aria-label','返回');petBack.hidden=true;
  settingsTitle.before(petBack);petPanel.querySelector('.set-sub-head').hidden=true;
  settings.querySelector('.set-note').textContent='设置保存在此设备。';
  const petRows=petPanel.querySelectorAll('.set-info');
  ['显示桌宠','尺寸','颜色','移动'].forEach((label,i)=>{petRows[i].querySelector('b').textContent=label;petRows[i].querySelector('span').hidden=true;});
  $('setBankMode').closest('.set-row').querySelector('.set-info span').hidden=true;
  const petItems=document.querySelector('.pet-items');petPanel.append(petItems);
  function syncSettingsPane(){
    const pet=petPanel.classList.contains('on');petBack.hidden=!pet;
    settingsTitle.textContent=pet?'区老师':(isEnglish()?'Settings':'设置');
    localize(settings);
    if(!settings.classList.contains('hide'))(pet?petBack:petEntry).focus();
  }
  new MutationObserver(syncSettingsPane).observe(petPanel,{attributes:true,attributeFilter:['class']});
  // Some legacy dialogs focus an input synchronously when opened.
  let modalTrigger;
  document.addEventListener('click',e=>{const trigger=e.target.closest('button,a,summary');if(trigger?.getClientRects().length&&!trigger.closest('.modal'))modalTrigger=trigger;},true);
  // Existing modal actions stay connected to their controllers and gain focus management.
  document.querySelectorAll('.modal').forEach(modal=>{modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');const heading=modal.querySelector('h3');if(heading){if(!heading.id)heading.id=modal.id+'-title';modal.setAttribute('aria-labelledby',heading.id);}let wasOpen=false,lastFocus=null;new MutationObserver(()=>{const open=!modal.classList.contains('hide');if(open===wasOpen)return;wasOpen=open;if(open){lastFocus=modal.contains(document.activeElement)?modalTrigger:document.activeElement;[...modal.querySelectorAll('input:not([type=hidden]),button,select,textarea')].find(n=>!n.disabled&&n.getClientRects().length)?.focus();}else if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});document.body.classList.toggle('m-modal-open',[...document.querySelectorAll('.modal')].some(m=>!m.classList.contains('hide')));}).observe(modal,{attributes:true,attributeFilter:['class']});});
  document.addEventListener('keydown',e=>{const modal=[...document.querySelectorAll('.modal:not(.hide)')].at(-1);if(!modal)return;if(e.key==='Escape'){modal.querySelector('.modal-close')?.click();e.preventDefault();}if(e.key==='Tab'){const focusable=[...modal.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){last?.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first?.focus();e.preventDefault();}}});
  render();
  document.documentElement.classList.add('material-ready');
  document.documentElement.classList.remove('material-loading');
  $('material-startup').remove();
})();
