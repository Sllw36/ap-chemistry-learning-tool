const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const assets=path.join(root,'ap-chem-site/assets');
const katex=require(path.join(assets,'vendor/katex/katex.min.js'));
const context={window:{},katex};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(assets,'vendor/katex/contrib/mhchem.min.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(assets,'study-content.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(assets,'topic-notes.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(assets,'lesson-details.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(assets,'lecture-glossary.js'),'utf8'),context);
const study=context.window.AP_STUDY;

test('nine units retain all source content with unique identities and topic-level placement',()=>{
  const lessons=context.window.AP_LESSONS, all=Object.values(lessons);
  const ids=all.flatMap(l=>[...l.sections,...l.examples,...l.checks].map(item=>item.id));
  assert.equal(ids.length,98);
  assert.equal(new Set(ids).size,ids.length);
  for(const [field,count] of [['sections',3],['examples',2],['checks',2]]){
    const items=all.flatMap(l=>l[field]);
    for(let chapter=1;chapter<=14;chapter++)assert.equal(items.filter(i=>i.sourceChapter===chapter).length,count,`${field}: source ${chapter}`);
  }
  for(const [unit,id] of [[1,'empirical-molecular-formulas'],[6,'heating-curves-phase-energy'],[9,'entropy-gibbs-spontaneity'],[4,'net-ionic-equations']]){
    assert.ok(lessons[unit].sections.some(s=>s.id===id),id);
  }
  assert.ok(lessons[1].examples.some(e=>e.id==='example-empirical-molecular-formula'));
  for(const unit of study.chapters){
    const lesson=lessons[unit.id];
    const sources=[...new Set([...lesson.sections,...lesson.examples,...lesson.checks].map(i=>i.sourceChapter))].sort((a,b)=>a-b);
    assert.deepEqual(Array.from(unit.sourceChapters),sources);
  }
  assert.match(study.chapters[5].formula,/\\sum \\nu/);
});

test('every original learning pane has a chapter mapping and both languages',()=>{
  const html=fs.readFileSync(path.join(root,'ap-chem-site/index.html'),'utf8');
  const panes=[...html.matchAll(/<section class="pane(?: on)?" id="([^"]+)"/g)].map(m=>m[1]).filter(id=>!id.startsWith('v-'));
  assert.equal(panes.length,49);
  for(const id of panes){assert.ok(study.paneChapters[id],id);for(const c of study.paneChapters[id])assert.ok(study.chapters.some(ch=>ch.id===c));
    const topic=context.window.AP_TOPICS[id];assert.ok(topic,id);for(let i=0;i<4;i++)assert.ok(topic[i].length>0);if(topic[4])katex.renderToString(topic[4],{throwOnError:true,displayMode:true});}
  assert.equal(study.chapters.length,9);
  for(const c of study.chapters){
    for(const field of ['title','core','why','symbols','example','trap'])for(const lang of ['en','zh'])assert.ok(c[field][lang].length>0,`${c.id}.${field}.${lang}`);
    assert.equal(c.steps.length,3);
    assert.ok(!katex.renderToString(c.formula,{throwOnError:true,displayMode:true,trust:false}).includes('katex-error'));
  }
});

test('both entry points include offline dependencies in the correct order',()=>{
  for(const file of ['AP化学学习工具.html','ap-chem-site/index.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    const scripts=['katex.min.js','contrib/mhchem.min.js','contrib/auto-render.min.js','study-content.js','topic-notes.js','lesson-details.js','curriculum.js','lecture-glossary.js','study-enhancements.js'];
    let last=-1;for(const script of scripts){const index=html.indexOf(script);assert.ok(index>last,`${file}: ${script}`);last=index;}
  }
});

test('each chapter teaches in both languages with a second worked example and self-checks',()=>{
  const lessons=context.window.AP_LESSONS;
  function paired(value,label){for(const lang of ['en','zh'])assert.ok(value?.[lang]?.trim().length>0,`${label}.${lang}`);}
  for(const chapter of study.chapters){
    const lesson=lessons[chapter.id];assert.ok(lesson,`chapter ${chapter.id}`);
    paired(lesson.before,'prerequisites');paired(lesson.goals,'goals');
    assert.ok(lesson.sections.length>=1);
    for(const section of lesson.sections){paired(section.title,'section title');assert.ok(section.paragraphs.length>=2);section.paragraphs.forEach(p=>paired(p,'paragraph'));if(section.tex)paired(section.note,'formula symbols and conditions');}
    paired(lesson.extra.prompt,'example');assert.ok(lesson.extra.steps.length>=3);lesson.extra.steps.forEach(step=>paired(step,'step'));
    assert.ok(lesson.checks.length>=1);for(const check of lesson.checks){paired(check.question,'question');paired(check.answer,'answer');}
    for(const tex of [...lesson.sections.map(s=>s.tex),lesson.extra.tex].filter(Boolean))assert.ok(!katex.renderToString(tex,{throwOnError:true,displayMode:true,trust:false}).includes('katex-error'));
  }
});

test('glossary handles key phrases, plurals and absent entries without invented definitions',()=>{
  const glossary=context.window.AP_LECTURE_GLOSSARY;
  assert.ok(glossary.lookup('  Ionisation   Energy ').e[1].includes('电离能'));
  assert.ok(glossary.lookup('valence electrons').e[1].includes('价电子'));
  assert.ok(glossary.lookup('ISOTOPES').e[1].includes('同位素'));
  assert.equal(glossary.lookup('not-a-real-term'),null);
  const keys=glossary.entries.map(([key])=>key.toLowerCase());assert.equal(new Set(keys).size,keys.length);
});
