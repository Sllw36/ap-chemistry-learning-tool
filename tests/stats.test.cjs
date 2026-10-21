const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../ap-chem-site/assets/app.js'),'utf8');
const stats=source.slice(source.indexOf('/* ==================== 学习统计 + 排行榜'));
const study=fs.readFileSync(path.join(__dirname,'../ap-chem-site/assets/study-enhancements.js'),'utf8');
const zero=()=>({answered:0,correct:0,onlineSeconds:0});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function app(storage=new Map(),cloud={},hold=false){
  const intervals=[],timers=[],requests=[],pending=[];
  const context={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    location:{hostname:'example.com'},document:{hidden:false,getElementById:()=>null,addEventListener(){}},
    setInterval:(fn,ms)=>intervals.push({fn,ms}),setTimeout:fn=>timers.push(fn),
    fetch:async(url,opts)=>{
      const token=opts.headers.Authorization?.slice(7),body=JSON.parse(opts.body||'{}');
      requests.push({url,token,body});
      if(url.endsWith('/pull')){
        const response={ok:true,data:{stats:{...(cloud[token]||zero())}}};
        if(hold)await new Promise(resolve=>pending.push(resolve));
        return {json:async()=>response};
      }
      cloud[token]=body.stats;return {json:async()=>({ok:true})};
    },addEventListener(){}};
  context.window=context;vm.createContext(context);vm.runInContext(stats,context);
  return {context,storage,requests,pending,holdPull(value){hold=value;},async tick(ms){intervals.filter(i=>i.ms===ms).forEach(i=>i.fn());await flush();},
    async push(){while(timers.length)timers.shift()();await flush();}};
}
function login(storage,name){storage.set('acct_token',name);storage.set('acct_name',name);}
function saved(storage,name){return JSON.parse(storage.get(name?'apchem.stats.v2:'+name:'apchem.stats.v1'));}

test('anonymous history stays local; A and B statistics survive switching and refresh',async()=>{
  const storage=new Map([['apchem.stats.v1',JSON.stringify({answered:50,correct:40,onlineSeconds:600})]]);
  login(storage,'A');const cloud={A:{answered:10,correct:8,onlineSeconds:90},B:zero()};
  const a=app(storage,cloud);await flush();
  a.context.__answerStats(true);await a.push();
  login(storage,'B');a.context.__answerStats(false);await flush();await a.push();
  assert.deepEqual(cloud.B,{answered:1,correct:0,onlineSeconds:0});
  assert.deepEqual(cloud.A,{answered:11,correct:9,onlineSeconds:90});
  login(storage,'A');await a.tick(3000);assert.equal(saved(storage,'A').answered,11);
  const refreshed=app(storage,cloud);await flush();refreshed.context.__answerStats(false);await refreshed.push();
  assert.equal(cloud.A.answered,12);
  storage.delete('acct_token');storage.delete('acct_name');await refreshed.tick(3000);
  assert.deepEqual(saved(storage),{answered:50,correct:40,onlineSeconds:600});
});

test('startup pulls before pushing and retains answers made while pull is in flight',async()=>{
  const storage=new Map();login(storage,'A');
  const cloud={A:{answered:100,correct:70,onlineSeconds:900}};
  const a=app(storage,cloud,true);a.context.__answerStats(true);await a.tick(30000);await a.push();
  assert.equal(a.requests.filter(r=>r.url.endsWith('/push')).length,0);
  a.pending.shift()();await flush();await flush();
  assert.deepEqual(cloud.A,{answered:101,correct:71,onlineSeconds:930});
});

test('an old account pull cannot merge into the new account',async()=>{
  const storage=new Map();login(storage,'A');
  const a=app(storage,{A:{answered:100,correct:80,onlineSeconds:900},B:zero()},true);
  login(storage,'B');await a.tick(3000);a.context.__answerStats(false);
  a.pending.shift()();await flush();assert.equal(saved(storage,'B').answered,1);
  a.pending.shift()();await flush();await a.push();
  const push=a.requests.find(r=>r.url.endsWith('/push'));
  assert.equal(push.token,'B');assert.equal(push.body.stats.answered,1);
});

test('a later panel refresh also finishes pulling before new answers are pushed',async()=>{
  const storage=new Map();login(storage,'A');const cloud={A:zero()};
  const a=app(storage,cloud);await flush();
  a.holdPull(true);a.context.__statsShow();a.context.__answerStats(true);await a.push();
  assert.equal(a.requests.filter(r=>r.url.endsWith('/push')).length,0);
  a.pending.shift()();await flush();await flush();
  assert.deepEqual(cloud.A,{answered:1,correct:1,onlineSeconds:0});
});

test('book MCQ and self-assessment count once per attempt and persist across refresh',async()=>{
  const a=app();
  const bookContext={window:a.context,history:{},save:(key,value)=>a.storage.set(key,JSON.stringify(value)),Date};
  vm.createContext(bookContext);
  const state=study.slice(study.indexOf('  let selected=null'),study.indexOf('  function filtered()'));
  const record=study.slice(study.indexOf('  function record(q,'),study.indexOf('  function renderBookShell()'));
  vm.runInContext(state+record+'\nthis.submit=record;this.reset=resetAnswer;',bookContext);
  bookContext.submit({id:'mcq'},true,1);bookContext.submit({id:'mcq'},true,1);
  bookContext.reset();bookContext.submit({id:'frq'},false);bookContext.submit({id:'frq'},true);
  assert.deepEqual(saved(a.storage),{answered:2,correct:1,onlineSeconds:0});
  assert.equal(JSON.parse(a.storage.get('apchem.bookHistory.v1')).frq.correct,false);
  const refreshed=app(a.storage);refreshed.context.__answerStats(true);
  assert.equal(saved(a.storage).answered,3);
});

test('book buttons record MCQ and self-assessment once, with totals retained on reload',async t=>{
  const http=require('node:http');
  const {chromium}=require('playwright');
  const root=path.resolve(__dirname,'../ap-chem-site');
  const server=http.createServer(async(req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+decodeURIComponent(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
    try{const data=await fs.promises.readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(data);}
    catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  t.after(()=>browser.close());
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
    window.AP_BOOK_DATA={groups:[{id:'chapter01',kind:'chapter',title:'Test',sheets:{mcq:'Source',frq:'Source'},questions:[
      {id:'test-mcq',type:'mcq',number:1,stem:'MCQ',options:['A','B'],answer:0,explanation:'Reason'},
      {id:'test-frq',type:'frq',number:2,stem:'FRQ',options:[],answer:null,explanation:'Reason'},
      {id:'test-frq-2',type:'frq',number:3,stem:'FRQ 2',options:[],answer:null,explanation:'Reason'}]}]};
    location.hash='#/book';
  });
  await page.locator('.book-options input').first().check();
  await page.locator('.book-submit').click();
  const total=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('apchem.stats.v1')));
  assert.equal((await total()).answered,1);
  await page.locator('.book-navigation button').nth(1).click();
  await page.locator('.book-submit').click();
  await page.locator('.book-feedback button').first().click();
  assert.equal(await page.locator('.book-feedback button:disabled').count(),2);
  assert.equal((await total()).answered,2);
  // Mark two FRQs wrong, then resolve the first through the wrong-answer filter.
  await page.locator('.book-navigation button').nth(1).click();
  await page.locator('.book-submit').click();
  await page.locator('.book-feedback button').nth(1).click();
  await page.locator('.book-navigation button').first().click();
  await page.locator('.book-submit').click();
  await page.locator('.book-feedback button').nth(1).click();
  await page.locator('.book-wrong-filter input').check();
  await page.locator('.book-submit').click();
  await page.locator('.book-feedback button').first().click();
  assert.match(await page.locator('.book-question').innerText(),/FRQ 2/);
  assert.equal(await page.locator('.book-feedback').count(),0);
  assert.equal(await page.locator('.book-submit').isEnabled(),true);
  await page.locator('.book-submit').click();
  assert.equal(await page.locator('.book-feedback button:enabled').count(),2);
  const expected=await total();
  await page.reload();
  assert.deepEqual(await total(),expected);
});
