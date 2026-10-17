const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function load(){
  const context=vm.createContext({window:{}});
  for(const file of ['study-content.js','lesson-details.js','curriculum.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../ap-chem-site/assets',file),'utf8'),context);
  return context.window;
}
test('migration keeps the original content of merged and formerly out-of-range chapters',()=>{
  const {AP_CURRICULUM:c,AP_STUDY:study}=load();
  const positions={7:'reading-7-2',13:'reading-13-1'},last={chapter:13,tab:'reading'};
  const state=c.migrate(positions,last);
  assert.equal(state.last,study.legacyChapters[13][1]);
  assert.ok(state.positions[study.legacyChapters[7][2]]);
  assert.equal(c.entries.get(state.last).unit,8);
  assert.deepEqual(positions,{7:'reading-7-2',13:'reading-13-1'});
  assert.equal(c.migrate({},null).last,null);
});
test('all old chapter tabs resolve to their own content rather than the same numeric unit',()=>{
  const {AP_CURRICULUM:c,AP_STUDY:study}=load();
  for(let chapter=1;chapter<=14;chapter++){
    for(const tab of ['reading','examples','checks']){
      const id=c.legacy(chapter,tab),entry=c.entries.get(id);
      assert.equal(entry.item.sourceChapter,chapter,`${chapter}/${tab}`);
      assert.equal(entry.tab,tab);
    }
    for(let index=0;index<3;index++)assert.equal(c.legacy(chapter,'reading',`reading-${chapter}-${index}`),study.legacyChapters[chapter][index]);
  }
  assert.equal(c.legacy(99),undefined);
});
test('saved content identity survives unit movement without rewriting user records',()=>{
  const {AP_CURRICULUM:c,AP_LESSONS:lessons}=load();
  const id=c.first(1),entry=c.entries.get(id),state={positions:{[id]:100},last:id};
  const url=c.href(id);
  entry.unit=9;
  lessons[9].sections.push(lessons[1].sections.shift());
  assert.equal(c.latest(state,9),id);
  assert.notEqual(c.latest(state,1),id);
  assert.equal(c.href(id),url);
  assert.equal(state.last,id);
});
