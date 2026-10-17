'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {spawn} = require('node:child_process');

function fixture(t, unix = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apchem-regression-'));
  const app = path.join(dir, 'app'), data = path.join(dir, 'data');
  fs.mkdirSync(app); fs.mkdirSync(data);
  fs.copyFileSync(path.join(__dirname, '../server.js'), path.join(app, 'server.js'));
  fs.writeFileSync(path.join(app, 'index.html'), 'TEST PAGE');
  const db = path.join(data, 'users.json'), socket = unix ? path.join(dir, 'api.sock') : '';
  let child, port;
  async function stop() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  }
  t.after(async () => { await stop(); fs.rmSync(dir, {recursive:true, force:true}); });
  function start() {
    return new Promise((resolve, reject) => {
      child = spawn(process.execPath, [path.join(app, 'server.js')], {
        env:{...process.env, HOST:'127.0.0.1', PORT:'0', DATA_FILE:db, SOCKET_PATH:socket}, stdio:['ignore','pipe','pipe']
      });
      let log = '';
      const timer = setTimeout(() => { child.kill(); reject(Error('startup timeout')); }, 5000);
      child.stdout.on('data', c => {
        log += c;
        const match = log.match(/LISTEN (?:tcp [^\n]+:(\d+)|unix )/);
        if (match) { port = Number(match[1]); clearTimeout(timer); resolve(); }
      });
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('exit', code => { clearTimeout(timer); reject(Error('startup exited ' + code)); });
    });
  }
  function request(method, url, body, token, split) {
    return new Promise((resolve,reject) => {
      const payload = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      const headers = {'Content-Type':'application/json'};
      if (payload) headers['Content-Length'] = payload.length;
      if (token) headers.Authorization = 'Bearer ' + token;
      const req = http.request({host:'127.0.0.1',port,socketPath:socket || undefined,path:url,method,headers,agent:false}, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          let body = Buffer.concat(chunks).toString('utf8');
          try { body = JSON.parse(body); } catch {}
          resolve({status:res.statusCode, body});
        });
      });
      req.on('error',reject); req.setTimeout(5000, () => req.destroy(Error('request timeout')));
      if (split) { req.setNoDelay(true); req.write(payload.subarray(0,split)); setTimeout(() => req.end(payload.subarray(split)),50); }
      else req.end(payload);
    });
  }
  return {dir,app,data,db,socket,start,stop,request};
}

test('only the test page is public, even with adjacent private files and encoded paths', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.app,'users.json'),'PRIVATE RECORD'); await f.start();
  assert.deepEqual(await f.request('GET','/'),{status:200,body:'TEST PAGE'});
  for (const url of ['/index.html?x=1','/%69ndex.html']) assert.equal((await f.request('GET',url)).body,'TEST PAGE');
  for (const url of ['/users.json','/server.js','/%75sers.json','/../users.json','/%2e%2e%2fusers.json','/%','/data/users.json']) {
    const r = await f.request('GET',url); assert.equal(r.status,404,url); assert.ok(!JSON.stringify(r.body).includes('PRIVATE RECORD'));
  }
});

test('external data persists across restart; sync remains private and password changes revoke other sessions', async t => {
  const f = fixture(t); await f.start();
  const user = {username:'__proto__',password:'test-password'};
  const first = await f.request('POST','/api/register',user); assert.equal(first.status,200);
  assert.equal((await f.request('POST','/api/register',user)).status,409);
  const token = first.body.token;
  const second = await f.request('POST','/api/login',user); assert.equal(second.status,200);
  const study = {vocab:[{w:'atom',cn:'原子'}],wrong:{q1:{wrong:1,ok:0}}};
  assert.equal((await f.request('POST','/api/sync/push',study,token)).status,200);
  assert.equal((await f.request('POST','/api/sync/pull',{})).status,401);
  const other = await f.request('POST','/api/register',{username:'other',password:'other-password'});
  assert.deepEqual((await f.request('POST','/api/sync/pull',{},other.body.token)).body.data,
    {vocab:[],wrong:{},stats:{answered:0,correct:0,onlineSeconds:0}});
  assert.equal((await f.request('POST','/api/change-password',{username:user.username,newPassword:'new-password'},token)).status,200);
  assert.equal((await f.request('GET','/api/me',undefined,second.body.token)).status,401);
  assert.equal((await f.request('GET','/api/me',undefined,token)).status,200);
  await f.stop(); await f.start();
  assert.equal((await f.request('GET','/api/me',undefined,token)).status,401);
  const login = await f.request('POST','/api/login',{...user,password:'new-password'}); assert.equal(login.status,200);
  const saved = (await f.request('POST','/api/sync/pull',{},login.body.token)).body.data;
  assert.deepEqual(saved.vocab,study.vocab); assert.deepEqual(saved.wrong,study.wrong);
  assert.deepEqual(fs.readdirSync(f.data),['users.json']);
  if (process.platform !== 'win32') assert.equal(fs.statSync(f.db).mode & 0o777,0o600);
});

test('corrupt JSON and malformed schemas are preserved and refuse startup', async t => {
  const f = fixture(t);
  for (const raw of ['{"users":','null','{"users":[]}','{"users":{"alice":{}}}']) {
    fs.writeFileSync(f.db,raw); await assert.rejects(f.start(),/startup exited 1/);
    assert.equal(fs.readFileSync(f.db,'utf8'),raw);
  }
});

test('runtime corruption returns 500 without exposing paths or replacing the file', async t => {
  const f = fixture(t); await f.start(); fs.writeFileSync(f.db,'broken');
  const r = await f.request('POST','/api/register',{username:'alice',password:'test-password'});
  assert.equal(r.status,500); assert.equal(r.body.error,'DATA_UNAVAILABLE');
  assert.ok(!JSON.stringify(r.body).includes(f.dir)); assert.equal(fs.readFileSync(f.db,'utf8'),'broken');
});

// Run as a normal user: root bypasses the POSIX directory permissions under test.
test('real disk write failure preserves existing data and removes temporary files', {skip:process.getuid?.() === 0}, async t => {
  const f = fixture(t); await f.start();
  assert.equal((await f.request('POST','/api/register',{username:'alice',password:'test-password'})).status,200);
  const before = fs.readFileSync(f.db);
  const win = process.platform === 'win32', target = win ? f.db : f.data;
  fs.chmodSync(target,win ? 0o444 : 0o555);
  try {
    const r = await f.request('POST','/api/register',{username:'bob',password:'test-password'});
    assert.equal(r.status,500); assert.equal(r.body.error,'DATA_UNAVAILABLE');
    assert.deepEqual(fs.readFileSync(f.db),before);
  } finally { fs.chmodSync(target,win ? 0o600 : 0o700); }
  assert.deepEqual(fs.readdirSync(f.data),['users.json']);
});

test('malformed or oversized requests do not become database errors or crash the service', async t => {
  const f = fixture(t); await f.start();
  for (const raw of ['{','null','[]']) assert.equal((await f.request('POST','/api/register',raw)).status,400);
  assert.equal((await f.request('POST','/api/register',{padding:'a'.repeat(1000001)})).status,413);
  assert.equal((await f.request('POST','/api/register',{username:'alive',password:'test-password'})).status,200);
});

test('UTF-8 characters split across request chunks survive registration', async t => {
  const f = fixture(t); await f.start();
  const body = JSON.stringify({username:'学化学',password:'test-password'});
  const split = Buffer.from(body).indexOf(Buffer.from('学')) + 1;
  const r = await f.request('POST','/api/register',body,undefined,split);
  assert.equal(r.status,200); assert.equal(r.body.username,'学化学');
});

test('Unix socket supports the isolated service and never removes an occupied path', {skip:process.platform !== 'linux'}, async t => {
  const f = fixture(t,true); await f.start();
  assert.equal((await f.request('GET','/api/me')).status,401);
  assert.equal(fs.statSync(f.socket).mode & 0o777,0o666);
  await f.stop(); fs.rmSync(f.socket,{force:true}); fs.writeFileSync(f.socket,'KEEP');
  await assert.rejects(f.start(),/startup exited 1/); assert.equal(fs.readFileSync(f.socket,'utf8'),'KEEP');
});

test('leaderboard applies the question threshold and a deterministic order', async t => {
  const f = fixture(t); await f.start();
  async function member(name, stats) {
    const r = await f.request('POST','/api/register',{username:name,password:'test-password'});
    assert.equal(r.status,200);
    assert.equal((await f.request('POST','/api/sync/push',{stats},r.body.token)).status,200);
  }
  await member('alice',{answered:12,correct:9,onlineSeconds:3600});
  await member('bob',{answered:30,correct:20});
  await member('carol',{answered:30,correct:20});
  await member('dave',{answered:9,correct:9});

  const lb = await f.request('GET','/api/leaderboard');
  assert.equal(lb.status,200); assert.equal(lb.body.ok,true); assert.equal(lb.body.min,10);
  // 9 题不上榜；同分按用户名升序；其余按做题数降序
  assert.deepEqual(lb.body.leaderboard.map(r=>r.username),['bob','carol','alice']);
  // 只暴露聚合值，不带 token、密码或错题/生词内容
  assert.deepEqual(lb.body.leaderboard[2],{username:'alice',answered:12,correct:9});
  // 读取公开，写入仍需登录
  assert.equal((await f.request('POST','/api/sync/push',{stats:{answered:999}})).status,401);
});

test('statistics are sanitised and accuracy can never exceed 100%', async t => {
  const f = fixture(t); await f.start();
  const reg = await f.request('POST','/api/register',{username:'alice',password:'test-password'});
  const token = reg.body.token;
  const push = stats => f.request('POST','/api/sync/push',{stats},token);
  const pull = async () => (await f.request('POST','/api/sync/pull',{},token)).body.data.stats;

  await push({answered:-5,correct:NaN,onlineSeconds:'abc'});
  assert.deepEqual(await pull(),{answered:0,correct:0,onlineSeconds:0});

  await push({answered:10,correct:9999,onlineSeconds:1});
  const s = await pull();
  assert.equal(s.answered,10);
  assert.equal(s.correct,10);            // 夹紧到 answered，正确率不会超过 100%
  assert.ok(s.correct<=s.answered);

  // 只同步错题/生词（不带 stats）时不得清空统计
  assert.equal((await f.request('POST','/api/sync/push',{vocab:[{w:'atom',cn:'原子'}]},token)).status,200);
  assert.deepEqual(await pull(),s);
});

test('stale device snapshots cannot raise the correct count without new answers', async t => {
  const f=fixture(t); await f.start();
  const reg=await f.request('POST','/api/register',{username:'learner',password:'test-password'});
  const push=stats=>f.request('POST','/api/sync/push',{stats},reg.body.token);
  await push({answered:100,correct:10,onlineSeconds:60});
  for(const answered of [50,100]){
    const result=await push({answered,correct:50,onlineSeconds:60});
    assert.deepEqual(result.body.stats,{answered:100,correct:10,onlineSeconds:60});
  }
  const fresh=await push({answered:110,correct:18,onlineSeconds:70});
  assert.deepEqual(fresh.body.stats,{answered:110,correct:18,onlineSeconds:70});
});

test('an implausible jump is capped instead of trusted, and statistics only grow', async t => {
  const f = fixture(t); await f.start();
  const reg = await f.request('POST','/api/register',{username:'cheat',password:'test-password'});
  const token = reg.body.token;
  await f.request('POST','/api/sync/push',{stats:{answered:10,correct:10,onlineSeconds:60}},token);

  const big = await f.request('POST','/api/sync/push',{stats:{answered:900000,correct:900000,onlineSeconds:99999999}},token);
  assert.equal(big.status,200);
  assert.ok(big.body.stats.answered<1000,'answered='+big.body.stats.answered);   // 被增速护栏截断
  assert.ok(big.body.stats.correct<=big.body.stats.answered);

  const after = (await f.request('POST','/api/sync/pull',{},token)).body.data.stats;
  assert.deepEqual(after,big.body.stats);
  // 统计是累计值：较小的上报不会把已有的数值拉低
  await f.request('POST','/api/sync/push',{stats:{answered:1,correct:1,onlineSeconds:1}},token);
  assert.deepEqual((await f.request('POST','/api/sync/pull',{},token)).body.data.stats,after);
});
