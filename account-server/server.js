#!/usr/bin/env node
/**
 * AP 化学学习工具 · 账号系统后端
 * ------------------------------------------------------------
 * 特点：零依赖（仅用 Node 内置模块）、数据存服务器端（users.json）、
 *       密码以 scrypt + 随机 salt 哈希存储、接口统一 JSON 响应。
 * 启动：node server.js（默认 127.0.0.1:8787；可设置 HOST / PORT）
 * DATA_FILE 指定私有数据文件；SOCKET_PATH 设置后改用 Unix socket。
 * ------------------------------------------------------------
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const SOCKET_PATH = process.env.SOCKET_PATH;
const ROOT = __dirname;
const DB_FILE = path.resolve(process.env.DATA_FILE || path.join(ROOT, 'users.json'));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/* ==================== 数据层（服务器端持久化） ==================== */
function dataError(error) {
  console.error('[account-server] data error: ' + (error.code || error.name));
  return new Error('DATA_UNAVAILABLE');
}
function loadDB() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!isObject(db) || !isObject(db.users) || Object.values(db.users).some(u =>
      !isObject(u) || typeof u.pwd !== 'string' || !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(u.pwd) ||
      (u.data !== undefined && !isObject(u.data)))) throw new Error('Invalid database');
    // Account names such as __proto__ must be ordinary keys.
    db.users = Object.assign(Object.create(null), db.users);
    return db;
  } catch (e) {
    if (e.code === 'ENOENT') return { users: Object.create(null) };
    throw dataError(e);
  }
}
function saveDB(db) {
  const dir = path.dirname(DB_FILE);
  const temp = path.join(dir, '.' + path.basename(DB_FILE) + '.' + crypto.randomBytes(12).toString('hex') + '.tmp');
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(db, null, 2), 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, DB_FILE);
  } catch (e) {
    throw dataError(e);
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (e) { console.error('[account-server] close failed: ' + e.code); } }
    try { fs.unlinkSync(temp); } catch (e) { if (e.code !== 'ENOENT') console.error('[account-server] temporary file cleanup failed'); }
  }
  // Rename has committed; directory fsync is best effort on supporting systems.
  if (process.platform !== 'win32') {
    let dirFd;
    try { dirFd = fs.openSync(dir, 'r'); fs.fsyncSync(dirFd); }
    catch (e) { console.error('[account-server] directory sync failed: ' + e.code); }
    finally { if (dirFd !== undefined) { try { fs.closeSync(dirFd); } catch (e) { console.error('[account-server] directory close failed: ' + e.code); } } }
  }
}

/* ==================== 密码安全：scrypt + 随机 salt ==================== */
function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pwd, stored) {
  const parts = String(stored).split(':');
  if (parts.length !== 2) return false;
  const salt = parts[0], hash = parts[1];
  const test = crypto.scryptSync(pwd, salt, 64);
  const orig = Buffer.from(hash, 'hex');
  // 用定长时间比较，避免时序攻击
  return orig.length === test.length && crypto.timingSafeEqual(orig, test);
}

/* ==================== 会话（token → username，内存保存） ==================== */
const sessions = new Map();
function issueToken(username) {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, username);
  return t;
}
function tokenOf(req) {
  return String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
}

/* ==================== 学习统计（在线时长 / 做题数量 / 正确数） ==================== */
// 硬上限只用于拦截明显荒谬的数值，正常学习数据远低于此。
const STAT_LIMIT = { answered: 200000, correct: 200000, onlineSeconds: 100000000 };
// 两次上传之间允许的最大增量：按经过的挂钟时间折算，并留出离线补传的余量。
// 统计量完全由客户端上报，服务端无法验证其真实性；护栏的作用是阻止"一次请求跳到榜首"。
const ANSWER_RATE_PER_MIN = 120;   // 每分钟最多 120 题（远高于正常作答速度）
const ANSWER_SLACK = 200;          // 单次上传的容错余量
const ONLINE_SLACK = 900;          // 在线时长单次上传的容错余量（秒）

function clampInt(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), max);
}

// 只保留合法的非负整数，并保证 correct ≤ answered（否则正确率会超过 100%）
function sanitizeStats(s) {
  const out = { answered: 0, correct: 0, onlineSeconds: 0 };
  if (isObject(s)) {
    out.answered = clampInt(s.answered, STAT_LIMIT.answered);
    out.correct = Math.min(clampInt(s.correct, STAT_LIMIT.correct), out.answered);
    out.onlineSeconds = clampInt(s.onlineSeconds, STAT_LIMIT.onlineSeconds);
  }
  return out;
}

// 合并一次上传：统计量是累计值，因此只增不减；相对上次接受值，
// 增幅不得超过经过时间所能支撑的速度（首次上传直接采信，避免误伤离线积累的数据）。
function mergeStats(previous, incoming, elapsedMs) {
  const prev = sanitizeStats(previous);
  const next = sanitizeStats(incoming);
  const minutes = Math.max(0, elapsedMs) / 60000;
  const seconds = Math.max(0, elapsedMs) / 1000;
  const maxAnswered = prev.answered + Math.ceil(minutes * ANSWER_RATE_PER_MIN) + ANSWER_SLACK;
  const maxOnline = prev.onlineSeconds + Math.ceil(seconds) + ONLINE_SLACK;
  next.answered = Math.max(prev.answered, Math.min(next.answered, maxAnswered));
  next.onlineSeconds = Math.max(prev.onlineSeconds, Math.min(next.onlineSeconds, maxOnline));
  // 正确数属于同一累计答题快照；旧设备的较小快照不能单独抬高正确率。
  const acceptedAnswers = next.answered - prev.answered;
  next.correct = Math.max(prev.correct, Math.min(next.correct, prev.correct + acceptedAnswers));
  return { answered: next.answered, correct: next.correct, onlineSeconds: next.onlineSeconds };
}

// 排行榜准入门槛：做题数量达到该值才上榜（“超过 10”按 ≥10 理解）
const LEADERBOARD_MIN = 10;

/* ==================== 统一响应工具 ==================== */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function ok(res, extra) { send(res, 200, Object.assign({ ok: true }, extra || {})); }
function fail(res, code, error, message) { send(res, code, { ok: false, error: error, message: message }); }

/* ==================== 请求体解析 ==================== */
function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0, tooLarge = false;
    req.on('data', function (c) {
      if (tooLarge) return;
      size += c.length;
      if (size > 1e6) { tooLarge = true; chunks.length = 0; reject(new Error('PAYLOAD_TOO_LARGE')); return; }
      chunks.push(c);
    });
    req.on('end', function () {
      if (tooLarge) return;
      const data = Buffer.concat(chunks).toString('utf8');
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('BAD_JSON')); }
    });
    req.on('error', reject);
  });
}

/* ==================== 校验规则 ==================== */
const MIN_PWD = 6;                                   // 密码至少 6 个字符（唯一约束）
const NAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{3,20}$/; // 账号名 3–20 位（字母/数字/下划线/中文）

/* ==================== 业务接口 ==================== */

// 注册：账号名唯一；密码 >= 6 位
function handleRegister(res, body) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return fail(res, 400, 'MISSING_FIELD', '账号名和密码不能为空');
  if (!NAME_RE.test(username)) return fail(res, 400, 'INVALID_USERNAME', '账号名需为 3–20 位字母、数字、下划线或中文');
  if (password.length < MIN_PWD) return fail(res, 400, 'PASSWORD_TOO_SHORT', '密码至少需要 6 个字符');

  const db = loadDB();
  if (db.users[username]) return fail(res, 409, 'USERNAME_TAKEN', '该账号名已被注册，请换一个');
  db.users[username] = { pwd: hashPassword(password), createdAt: new Date().toISOString() };
  saveDB(db);

  const token = issueToken(username);
  return ok(res, { token: token, username: username, message: '注册成功' });
}

// 登录
function handleLogin(res, body) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) return fail(res, 400, 'MISSING_FIELD', '账号名和密码不能为空');

  const db = loadDB();
  const u = db.users[username];
  if (!u || !verifyPassword(password, u.pwd)) return fail(res, 401, 'BAD_CREDENTIALS', '账号或密码错误');

  const token = issueToken(username);
  return ok(res, { token: token, username: username, message: '登录成功' });
}

// 修改密码：鉴权用 token（推荐）或原密码；新密码 >= 6 位
function handleChangePassword(res, body, req) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!username || !newPassword) return fail(res, 400, 'MISSING_FIELD', '账号名和新密码不能为空');
  if (newPassword.length < MIN_PWD) return fail(res, 400, 'PASSWORD_TOO_SHORT', '新密码至少需要 6 个字符');

  const db = loadDB();
  const u = db.users[username];
  if (!u) return fail(res, 404, 'USER_NOT_FOUND', '账号不存在');

  const token = tokenOf(req);
  let authed = false;
  if (token && sessions.get(token) === username) authed = true;
  else if (typeof body.oldPassword === 'string' && verifyPassword(body.oldPassword, u.pwd)) authed = true;
  if (!authed) return fail(res, 401, 'BAD_CREDENTIALS', '账号或原密码错误');

  u.pwd = hashPassword(newPassword);
  saveDB(db);
  for (const [t, owner] of sessions) {
    if (owner === username && t !== (sessions.get(token) === username ? token : null)) sessions.delete(t);
  }
  return ok(res, { message: '密码修改成功' });
}

// 登出
function handleLogout(res, req) {
  sessions.delete(tokenOf(req));
  return ok(res, { message: '已登出' });
}

// 当前登录用户（示例：客户端启动时校验 token 是否有效）
function handleMe(res, req) {
  const username = sessions.get(tokenOf(req));
  if (!username) return fail(res, 401, 'UNAUTHORIZED', '未登录或登录已过期');
  return ok(res, { username: username });
}

// 上传学习数据（错题本 + 生词本）
function handleSyncPush(res, body, req) {
  const username = sessions.get(tokenOf(req));
  if (!username) return fail(res, 401, 'UNAUTHORIZED', '未登录或登录已过期');
  const db = loadDB();
  const u = db.users[username];
  if (!u) return fail(res, 404, 'USER_NOT_FOUND', '账号不存在');
  if (!u.data) u.data = {};
  if (body.vocab !== undefined) u.data.vocab = body.vocab;
  if (body.wrong !== undefined) u.data.wrong = body.wrong;
  if (body.stats !== undefined) {
    const previous = isObject(u.data.stats) ? u.data.stats : null;
    const now = Date.now();
    if (previous) {
      const elapsed = now - (Number(u.data.statsAt) || 0);
      u.data.stats = mergeStats(previous, body.stats, elapsed);
    } else {
      // 首次上传：直接采信净化后的值（可能是长期离线积累的真实数据）
      u.data.stats = sanitizeStats(body.stats);
    }
    u.data.statsAt = now;
  }
  u.data.updatedAt = new Date().toISOString();
  saveDB(db);
  return ok(res, { message: '数据已上传到云端', stats: u.data.stats });
}

// 下载学习数据（错题本 + 生词本）
function handleSyncPull(res, req) {
  const username = sessions.get(tokenOf(req));
  if (!username) return fail(res, 401, 'UNAUTHORIZED', '未登录或登录已过期');
  const db = loadDB();
  const u = db.users[username];
  if (!u) return fail(res, 404, 'USER_NOT_FOUND', '账号不存在');
  return ok(res, { data: u.data || { vocab: [], wrong: {}, stats: { answered: 0, correct: 0, onlineSeconds: 0 } } });
}

// 排行榜：做题数量达到门槛的用户，按数量降序（正确数作为次要排序）
function handleLeaderboard(res) {
  const db = loadDB();
  const rows = [];
  for (const name of Object.keys(db.users)) {
    const u = db.users[name];
    const stats = (u.data && u.data.stats) ? sanitizeStats(u.data.stats) : sanitizeStats(null);
    if (stats.answered < LEADERBOARD_MIN) continue;
    rows.push({ username: name, answered: stats.answered, correct: stats.correct });
  }
  rows.sort(function (a, b) {
    if (b.answered !== a.answered) return b.answered - a.answered;
    if (b.correct !== a.correct) return b.correct - a.correct;
    return a.username < b.username ? -1 : (a.username > b.username ? 1 : 0);
  });
  return ok(res, { leaderboard: rows, min: LEADERBOARD_MIN });
}

/* ==================== 静态文件（托管测试页） ==================== */
function serveStatic(res, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); }
  catch (e) { return fail(res, 404, 'NOT_FOUND', '文件不存在'); }
  if (p !== '/' && p !== '/index.html') return fail(res, 404, 'NOT_FOUND', '文件不存在');
  fs.readFile(path.join(ROOT, 'index.html'), function (err, data) {
    if (err) return fail(res, 404, 'NOT_FOUND', '文件不存在');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}

/* ==================== 主服务 ==================== */
const server = http.createServer(function (req, res) {
  const p = (req.url || '/').split('?')[0];

  // CORS（若前端部署在其它域名，可跨域调用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (p.indexOf('/api/') === 0) {
    if (req.method === 'GET' && p === '/api/me') return handleMe(res, req);
    if (req.method === 'GET' && p === '/api/leaderboard') return handleLeaderboard(res);
    if (req.method !== 'POST') return fail(res, 405, 'METHOD_NOT_ALLOWED', '该接口仅支持 POST');
    readBody(req).then(function (body) {
      if (!isObject(body)) return fail(res, 400, 'BAD_JSON', '请求体必须是 JSON 对象');
      if (p === '/api/register') return handleRegister(res, body);
      if (p === '/api/login') return handleLogin(res, body);
      if (p === '/api/change-password') return handleChangePassword(res, body, req);
      if (p === '/api/logout') return handleLogout(res, req);
      if (p === '/api/sync/push') return handleSyncPush(res, body, req);
      if (p === '/api/sync/pull') return handleSyncPull(res, req);
      return fail(res, 404, 'NOT_FOUND', '接口不存在');
    }).catch(function (e) {
      if (e.message === 'BAD_JSON') return fail(res, 400, 'BAD_JSON', '请求体不是合法的 JSON');
      if (e.message === 'PAYLOAD_TOO_LARGE') return fail(res, 413, 'PAYLOAD_TOO_LARGE', '请求体过大');
      return fail(res, 500, e.message === 'DATA_UNAVAILABLE' ? 'DATA_UNAVAILABLE' : 'INTERNAL_ERROR', '数据暂不可用，请稍后重试');
    });
    return;
  }
  return serveStatic(res, p);
});

// Validate existing data before accepting requests. Only one process may write DB_FILE.
try { loadDB(); } catch (e) { process.exit(1); }
server.on('error', e => { console.error('[account-server] listen failed: ' + e.code); process.exit(1); });
if (SOCKET_PATH) {
  // The administrator owns the parent directory; systemd removes stale sockets.
  server.listen(SOCKET_PATH, function () {
    fs.chmodSync(SOCKET_PATH, 0o666);
    console.log('LISTEN unix ' + SOCKET_PATH);
  });
} else {
  server.listen(PORT, HOST, function () {
    console.log('LISTEN tcp ' + HOST + ':' + server.address().port);
  });
}
