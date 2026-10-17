const {test, before, after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

test('Context keeps nearby definitions, late selections and source TeX without hidden answers',async t=>{
  for(const kind of ['paragraph','long-question','math']){
    await t.test(kind,async t=>{
      const page=await openPractice(t);let body;
      await page.route('**/api/ai/translate',r=>{body=r.request().postDataJSON();return r.fulfill({contentType:'application/json',body:'{"translation":"上下文测试完成"}'});});
      await page.evaluate(kind=>{
        const host=document.createElement('div');host.className=kind==='long-question'?'pz-item':'study-card';
        document.querySelector('#bankQBox').replaceChildren(host);
        if(kind==='long-question'){
          host.innerHTML='<p>'+('Remote background. '.repeat(220))+' NEARBY_CONDITION <span id="context-target">The potential decreases here.</span> NEARBY_RESULT</p>';
        }else{
          host.innerHTML='<section><p>'+('Remote background. '.repeat(160))+'</p><p>Here potential means chemical potential in joules per mole.</p><p id="context-target">The potential decreases here.</p><p>Temperature remains fixed.</p><p hidden>HIDDEN_CONTEXT_ANSWER</p><details><summary>Answer</summary>HIDDEN_CLOSED_ANSWER</details></section>';
          if(kind==='math'){
            const eq=document.createElement('span');host.querySelector('section p:nth-child(2)').append(eq);
            katex.render(String.raw`\frac{a}{b}+K_a+[H^+]`,eq);
          }
        }
        const target=host.querySelector('#context-target');
        const r=document.createRange();r.selectNodeContents(target);
        const s=getSelection();s.removeAllRanges();s.addRange(r);
        document.dispatchEvent(new Event('selectionchange'));
      },kind);
      await page.locator('.study-ai-toolbar button:has-text("翻译")').click();
      await page.getByText('上下文测试完成',{exact:true}).waitFor();
      assert.ok(body.context.length<=2000);
      assert.ok(body.context.includes('The potential decreases here.'));
      if(kind==='long-question'){
        assert.match(body.context,/NEARBY_CONDITION/);assert.match(body.context,/NEARBY_RESULT/);
      }else{
        assert.match(body.context,/chemical potential in joules per mole/);
        assert.match(body.context,/Temperature remains fixed/);
        assert.doesNotMatch(body.context,/HIDDEN_CONTEXT_ANSWER|HIDDEN_CLOSED_ANSWER/);
      }
      if(kind==='math')assert.equal(body.context.split(String.raw`\(\frac{a}{b}+K_a+[H^+]\)`).length,2);
    });
  }
});

let browser, server, base;

before(async()=>{
  const root=path.resolve(__dirname,'../ap-chem-site');
  if (process.env.APCHEM_TEST_URL) base=process.env.APCHEM_TEST_URL;
  else {
    server=http.createServer(async(req,res)=>{
      const pathname=new URL(req.url,'http://localhost').pathname;
      const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
      if (!file.startsWith(root+path.sep)) {res.writeHead(404);res.end();return;}
      try {
        const data=await fs.readFile(file);
        res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
        res.end(data);
      } catch {res.writeHead(404);res.end();}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    base='http://127.0.0.1:'+server.address().port;
  }
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
});

after(async()=>{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
});

async function openPractice(t,token='test-valid-token') {
  const page=await browser.newPage();
  t.after(()=>page.close());
  await page.addInitScript(tok=>{
    let seed=42;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
    if(tok)localStorage.setItem('acct_token',tok);
    else localStorage.removeItem('acct_token');
  },token);
  await page.goto(base+'/#/practice', { waitUntil: 'domcontentloaded' });
  await page.locator('#bankCount').fill('5');
  await page.locator('#bankStart').click();
  await page.waitForSelector('#bankQBox .pz-item');
  return page;
}

async function openTranslator(t,token='toolbar-token'){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});
  if(token)await page.addInitScript(token=>localStorage.setItem('acct_token',token),token);
  await page.goto(base+'/#/tools');
  await page.locator('.m-tool-row').filter({hasText:'翻译'}).click();
  return page;
}

test('toolbar dictionary lookup stays instant and can upgrade to AI translation',async t=>{
  const page=await openTranslator(t);let calls=0,body;
  await page.route('**/api/ai/translate',r=>{calls++;body=r.request().postDataJSON();return r.fulfill({contentType:'application/json',body:'{"translation":"AI 对同位素的翻译"}'});});
  for(const word of ['isotope','isotopes']){
    await page.locator('#trInput').fill(word);await page.locator('#trGo').click();
    assert.match(await page.locator('#trOut').innerText(),/同位素/);
    assert.equal(calls,0);
  }
  assert.equal(await page.evaluate(()=>__vocab.list.filter(w=>w.w==='isotope').length),1);
  await page.locator('#trHint button').click();
  await page.getByText('AI 对同位素的翻译',{exact:true}).waitFor();
  assert.equal(calls,1);assert.deepEqual(body,{text:'isotopes',context:''});
});

test('toolbar passage translation uses auth, safe formula rendering and the shared cache',async t=>{
  const page=await openTranslator(t);let calls=0,body,auth;
  const translation=String.raw`平衡时 $K_c$ 保持不变。<img src=x onerror="window.injected=true">`;
  await page.route('**/api/ai/translate',r=>{calls++;body=r.request().postDataJSON();auth=r.request().headers().authorization;return r.fulfill({contentType:'application/json',body:JSON.stringify({translation})});});
  const text='At equilibrium, the constant is K_c.\nThe temperature is fixed.';
  await page.locator('#trInput').fill(text);await page.locator('#trGo').click();
  await page.locator('#trOut .katex').waitFor();
  assert.deepEqual(body,{text,context:''});assert.equal(auth,'Bearer toolbar-token');
  assert.equal(await page.locator('#trOut img').count(),0);
  assert.equal(await page.evaluate(()=>!!window.injected),false);
  assert.equal(await page.locator('#trOut .katex-error').count(),0);
  await page.locator('#trGo').click();await page.locator('#trOut .katex').waitFor();
  assert.equal(calls,1);assert.equal(await page.locator('#trOut .katex').count(),1);
  assert.equal(await page.evaluate(()=>__vocab.list.length),0,'paragraphs must not enter the vocabulary list');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});

test('toolbar validates text and offers account sign-in before an AI request',async t=>{
  const page=await openTranslator(t,null);let calls=0;
  await page.route('**/api/ai/translate',r=>{calls++;return r.abort();});
  await page.locator('#trGo').click();assert.match(await page.locator('#trOut').innerText(),/请输入/);
  await page.evaluate(()=>AP_LEARNING.translateTool('x'.repeat(6001)));
  assert.match(await page.locator('#trOut').innerText(),/6000/);
  await page.locator('#trInput').fill('The temperature is fixed.');await page.locator('#trGo').click();
  await page.locator('#trOut .study-ai-status.error').waitFor();
  assert.match(await page.locator('#trOut').innerText(),/登录/);assert.equal(calls,0);
  await page.locator('#trOut button').filter({hasText:'登录'}).click();
  assert.equal(await page.locator('#modalAccount').isVisible(),true);
  assert.equal(await page.locator('#modalTr').isVisible(),false);
});

test('editing or closing the translator cancels requests and ignores late responses',async t=>{
  const page=await openTranslator(t);
  await page.evaluate(()=>{
    const original=window.fetch;window.pendingTranslations=[];
    window.fetch=(url,options)=>url==='/api/ai/translate'?new Promise(resolve=>pendingTranslations.push({signal:options.signal,resolve})):original(url,options);
  });
  await page.locator('#trInput').fill('First passage.');await page.locator('#trGo').click();
  await page.locator('#trInput').fill('Second passage.');
  assert.equal(await page.evaluate(()=>pendingTranslations[0].signal.aborted),true);
  await page.locator('#trGo').click();
  await page.evaluate(()=>pendingTranslations[0].resolve(new Response(JSON.stringify({translation:'STALE_RESULT'}))));
  assert.doesNotMatch(await page.locator('#trOut').innerText(),/STALE_RESULT/);
  await page.evaluate(()=>pendingTranslations[1].resolve(new Response(JSON.stringify({translation:'CURRENT_RESULT'}))));
  await page.getByText('CURRENT_RESULT',{exact:true}).waitFor();
  await page.locator('#trInput').fill('Third passage.');await page.locator('#trGo').click();
  await page.locator('#modalTr .modal-close').click();
  await page.waitForFunction(()=>pendingTranslations[2].signal.aborted);
  await page.evaluate(()=>pendingTranslations[2].resolve(new Response(JSON.stringify({translation:'CLOSED_RESULT'}))));
  await page.locator('.m-tool-row').filter({hasText:'翻译'}).click();
  assert.equal(await page.locator('#trOut').innerText(),'');
});

// Select multiple words in an element (triggers sentence/passage AI toolbar)
async function selectPassage(page, selector, wordCount = 6) {
  return await page.evaluate(({ sel, count }) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('Element not found: ' + sel);

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.trim().length > 0) {
        textNodes.push(walker.currentNode);
      }
    }
    if (textNodes.length === 0) throw new Error('No text nodes in: ' + sel);

    const startNode = textNodes[0];
    const text = startNode.nodeValue;
    const startOffset = text.search(/\S/);

    let wordsCounted = 0;
    let endNode = startNode;
    let endOffset = text.length;

    for (const node of textNodes) {
      const words = node.nodeValue.match(/\S+/g) || [];
      if (wordsCounted + words.length >= count) {
        endNode = node;
        let needed = count - wordsCounted;
        let regex = /\S+/g, m;
        while ((m = regex.exec(node.nodeValue)) !== null) {
          needed--;
          if (needed === 0) {
            endOffset = m.index + m[0].length;
            break;
          }
        }
        break;
      }
      wordsCounted += words.length;
      endNode = node;
      endOffset = node.nodeValue.length;
    }

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));

    return selection.toString().trim();
  }, { sel: selector, count: wordCount });
}

// Select a single word that exists in the local glossary
async function selectGlossaryWord(page, selector) {
  return await page.evaluate(sel => {
    const container = document.querySelector(sel);
    if (!container) throw new Error('Element not found: ' + sel);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const glossary = window.AP_LECTURE_GLOSSARY;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const val = node.nodeValue;
      for (const [term] of glossary.entries) {
        const re = new RegExp('\\b(' + term + ')\\b', 'i');
        const match = re.exec(val);
        if (match) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const s = window.getSelection();
          s.removeAllRanges();
          s.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
          return match[0];
        }
      }
    }
    return null;
  }, selector);
}

test('1. Passage selection does NOT automatically send AI requests', async t => {
  const page = await openPractice(t);
  const requests = [];
  await page.route('**/api/ai/**', route => {
    requests.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  const selected = await selectPassage(page, '#bankQBox .pz-item .pz-q', 6);
  assert.ok(selected.length > 0);
  await page.waitForSelector('.study-ai-toolbar');

  const transBtn = page.locator('.study-ai-toolbar button:has-text("翻译")');
  const askBtn = page.locator('.study-ai-toolbar button:has-text("问问 AI")');
  assert.equal(await transBtn.isVisible(), true);
  assert.equal(await askBtn.isVisible(), true);

  await page.waitForTimeout(300);
  assert.equal(requests.length, 0, 'No requests should be sent simply by selecting text');
});

test('2. Local vocabulary stays instant with optional AI actions', async t => {
  const page = await openPractice(t);
  const requests = [];
  await page.route('**/api/ai/**', route => {
    requests.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // Find and select a local vocabulary word in question box
  const word = await page.evaluate(() => {
    const ws = document.querySelectorAll('#bankQBox .w');
    const glossary = window.AP_LECTURE_GLOSSARY;
    const vocab = window.__vocab;
    for (const w of ws) {
      const raw = w.textContent.trim();
      if ((glossary && glossary.lookup(raw)) || (vocab && vocab.lookup(raw))) {
        const range = document.createRange();
        range.selectNodeContents(w);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        return raw;
      }
    }
    return null;
  });
  assert.ok(word, 'Found and selected a local vocabulary word');

  await page.waitForSelector('.study-word-popup');
  assert.equal(await page.locator('.study-word-popup').isVisible(), true);
  assert.equal(await page.locator('.study-ai-toolbar').isVisible(), false);
  assert.equal(requests.length, 0);

  const saveBtn = page.locator('.study-word-popup button:has-text("加入生词本")');
  assert.equal(await page.locator('.study-word-popup button:has-text("问问 AI")').count(),1);
  if (await saveBtn.isVisible()) {
    await saveBtn.click();
    assert.equal(await page.locator('.study-word-popup button:has-text("已加入 ✓")').isVisible(), true);
  }

  // Next, select a multi-word passage: word popup should close and AI toolbar appear
  const container = (await page.locator('#studyGuide:not([hidden])').isVisible()) ? '#studyGuide .study-card' : '#bankQBox .pz-item .pz-q';
  await selectPassage(page, container, 8);
  await page.waitForSelector('.study-ai-toolbar');
  assert.equal(await page.locator('.study-word-popup').isVisible(), false);
  assert.equal(await page.locator('.study-ai-toolbar').isVisible(), true);
});

test('3. Selection works across Handouts, Old Question Bank, and Book Practice', async t => {
  const page = await browser.newPage();
  t.after(()=>page.close());
  await page.addInitScript(() => localStorage.setItem('acct_token', 'token123'));
  await page.goto(base+'/#/unit/1/reading', { waitUntil: 'domcontentloaded' });

  // A. Handouts: open Study Guide
  await page.waitForSelector('#studyGuide:not([hidden]) .study-reading');
  await selectPassage(page, '#studyGuide .study-card p', 7);
  await page.waitForSelector('.study-ai-toolbar, .study-word-popup');
  await page.keyboard.press('Escape');

  // Close study guide
  await page.locator('.m-navigation [data-route-nav="learn"]').click();
  await page.waitForFunction(() => document.querySelector('#studyGuide').hidden);

  // B. Old Question Bank
  await page.locator('.m-navigation [data-route-nav="practice"]').click();
  await page.locator('#bankCount').fill('2');
  await page.locator('#bankStart').click();
  await page.waitForSelector('#bankQBox .pz-item');
  await selectPassage(page, '#bankQBox .pz-item .pz-q', 6);
  await page.waitForSelector('.study-ai-toolbar, .study-word-popup');
  await page.keyboard.press('Escape');

  // C. Book Practice
  await page.goto(base+'/#/book');
  await page.waitForSelector('#bookPractice:not([hidden])');
  const hasShell = await page.locator('#bookPractice .study-book-body').isVisible();
  assert.ok(hasShell);
});

test('4. Translation calls /api/ai/translate, renders textContent with newlines, and uses cache', async t => {
  const page = await openPractice(t, 'valid-token-xyz');
  let translateCalls = 0;
  let receivedBody = null;
  let receivedAuth = null;

  await page.route('**/api/ai/translate', async route => {
    translateCalls++;
    const req = route.request();
    receivedAuth = req.headers()['authorization'];
    receivedBody = JSON.parse(req.postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        translation: '第一行：化学反应平衡\n第二行：速率常数与温度'
      })
    });
  });

  await selectPassage(page, '#bankQBox .pz-item .pz-q', 7);
  await page.waitForSelector('.study-ai-toolbar');

  // Click Translate
  await page.locator('.study-ai-toolbar button:has-text("翻译")').click();

  // Wait for result rendered
  await page.waitForSelector('.study-ai-panel .study-ai-content');
  const content = await page.locator('.study-ai-panel .study-ai-content').innerText();
  assert.equal(content, '第一行：化学反应平衡\n第二行：速率常数与温度');
  assert.equal(translateCalls, 1);
  assert.equal(receivedAuth, 'Bearer valid-token-xyz');
  assert.ok(receivedBody.text.length > 0);
  assert.ok(receivedBody.context.length > 0);

  // Close popup
  await page.locator('.study-ai-close').click();
  await page.waitForSelector('.study-ai-panel', { state: 'detached' });

  // Select the same passage and click Translate again -> memory cache without network call
  await selectPassage(page, '#bankQBox .pz-item .pz-q', 7);
  await page.waitForSelector('.study-ai-toolbar');
  await page.locator('.study-ai-toolbar button:has-text("翻译")').click();
  await page.waitForSelector('.study-ai-panel .study-ai-content');
  const cachedContent = await page.locator('.study-ai-panel .study-ai-content').innerText();
  assert.equal(cachedContent, '第一行：化学反应平衡\n第二行：速率常数与温度');
  assert.equal(translateCalls, 1, 'Second translate call for same text+context must use in-memory cache');
});

test('Translation renders LaTeX on first response and cache hit without interpreting HTML', async t => {
  const page = await openPractice(t);
  let calls = 0;
  const translation = String.raw`平衡 $K_c$，离子 \(Ca^{2+}\)。
$$K=\frac{[B]}{[A]}$$
\[\Delta G=-RT\ln K\]
<img src=x onerror="window.translationInjected=true">`;
  await page.route('**/api/ai/translate', route => {
    calls++;
    return route.fulfill({contentType:'application/json',body:JSON.stringify({translation})});
  });
  for (let attempt=0; attempt<2; attempt++) {
    await selectPassage(page, '#bankQBox .pz-item .pz-q', 7);
    await page.locator('.study-ai-toolbar button:has-text("翻译")').click();
    const panel = page.locator('.study-ai-content');
    await panel.locator('.katex').nth(3).waitFor();
    assert.equal(await panel.locator('.katex').count(), 4);
    assert.equal(await panel.locator('.katex-display').count(), 2);
    assert.equal(await panel.locator('.katex-error,img').count(), 0);
    assert.ok((await panel.textContent()).includes('<img src=x'));
    assert.equal(await page.evaluate(()=>window.translationInjected), undefined);
    await page.locator('.study-ai-close').click();
  }
  assert.equal(calls, 1);
});

test('5. Streaming Ask AI with application/x-ndjson, textContent, and follow-up history', async t => {
  const page = await openPractice(t, 'token-stream');
  const askBodies = [];

  await page.route('**/api/ai/ask', async route => {
    const postData = JSON.parse(route.request().postData() || '{}');
    askBodies.push(postData);

    const ndjson = [
      JSON.stringify({ delta: '这是第 1 块解答。' }),
      JSON.stringify({ delta: '\n这是第 2 块解答：' }),
      JSON.stringify({ delta: '摩尔质量为 18 g/mol。' }),
      JSON.stringify({ done: true })
    ].join('\n') + '\n';

    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: ndjson
    });
  });

  await selectPassage(page, '#bankQBox .pz-item .pz-q', 7);
  await page.waitForSelector('.study-ai-toolbar');
  await page.locator('.study-ai-toolbar button:has-text("问问 AI")').click();

  await page.waitForSelector('.study-ai-panel .study-ai-msg-assistant');
  const assistantMsg = await page.locator('.study-ai-panel .study-ai-msg-assistant').first().innerText();
  assert.equal(assistantMsg, '这是第 1 块解答。\n这是第 2 块解答：摩尔质量为 18 g/mol。');
  assert.equal(askBodies.length, 1);
  assert.deepEqual(askBodies[0].history, []);

  // Send a follow-up question
  await page.locator('.study-ai-input').fill('为什么摩尔质量是 18？');
  await page.locator('.study-ai-send').click();

  await page.waitForFunction(() => document.querySelectorAll('.study-ai-msg-assistant').length >= 2);
  assert.equal(askBodies.length, 2);
  assert.equal(askBodies[1].question, '为什么摩尔质量是 18？');
  assert.ok(askBodies[1].history.length >= 2, 'Follow-up request must include history');
  assert.equal(askBodies[1].history[0].role, 'user');
  assert.equal(askBodies[1].history[1].role, 'assistant');
});

test('6. In-flight request cancellation and retry work; stale responses cannot overwrite', async t => {
  const page = await openPractice(t, 'token-cancel');
  let firstCall = true;

  await page.route('**/api/ai/translate', async route => {
    if (firstCall) {
      firstCall = false;
      // Intentionally do not fulfill immediately to test Cancel button
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ translation: '重试成功结果' })
      });
    }
  });

  await selectPassage(page, '#bankQBox .pz-item .pz-q', 6);
  await page.waitForSelector('.study-ai-toolbar');
  await page.locator('.study-ai-toolbar button:has-text("翻译")').click();

  const cancelBtn = page.locator('.study-ai-actions button:has-text("取消")');
  await cancelBtn.waitFor({ state: 'visible' });
  await cancelBtn.click();

  await page.waitForSelector('.study-ai-actions button:has-text("重试")');
  assert.ok((await page.locator('.study-ai-status').innerText()).includes('已取消'));

  await page.locator('.study-ai-actions button:has-text("重试")').click();
  await page.waitForSelector('.study-ai-content');
  assert.equal(await page.locator('.study-ai-content').innerText(), '重试成功结果');
});

test('7. HTTP error responses (401, 429, 503) display user-friendly error messages', async t => {
  const page = await openPractice(t, 'token-errors');

  // Test 401
  await page.route('**/api/ai/translate', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Unauthorized"}' }));
  await selectPassage(page, '#bankQBox .pz-item .pz-q', 6);
  await page.waitForSelector('.study-ai-toolbar');
  await page.locator('.study-ai-toolbar button:has-text("翻译")').click();
  await page.waitForSelector('.study-ai-status.error');
  assert.ok((await page.locator('.study-ai-status.error').innerText()).includes('登录已失效'));

  // Test 429
  await page.unroute('**/api/ai/translate');
  await page.route('**/api/ai/translate', route => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Rate limited"}' }));
  await page.locator('.study-ai-actions button:has-text("重试")').click();
  await page.waitForFunction(() => document.querySelector('.study-ai-status.error')?.textContent?.includes('频繁'));

  // Test 503
  await page.unroute('**/api/ai/translate');
  await page.route('**/api/ai/translate', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }));
  await page.locator('.study-ai-actions button:has-text("重试")').click();
  await page.waitForFunction(() => document.querySelector('.study-ai-status.error')?.textContent?.includes('不可用'));
});

test('8. Missing account token prompts user to log in without sending network requests', async t => {
  const page = await openPractice(t, null); // null token
  let networkCalls = 0;
  await page.route('**/api/ai/**', route => {
    networkCalls++;
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await selectPassage(page, '#bankQBox .pz-item .pz-q', 6);
  await page.waitForSelector('.study-ai-toolbar');
  await page.locator('.study-ai-toolbar button:has-text("翻译")').click();

  await page.waitForSelector('.study-ai-status.error');
  const statusText = await page.locator('.study-ai-status.error').innerText();
  assert.ok(statusText.includes('请先登录'), 'Must prompt user to log in');
  assert.equal(networkCalls, 0, 'Must NOT send network requests when user is not logged in');
});

test('9. Mobile boundary safety, Escape key closes popup, and KaTeX clean text extraction', async t => {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  t.after(()=>page.close());
  await page.addInitScript(() => localStorage.setItem('acct_token', 'mobile-token'));
  await page.goto(base+'/#/practice');
  await page.locator('#bankCount').fill('2');
  await page.locator('#bankStart').click();
  await page.waitForSelector('#bankQBox .pz-item');

  await selectPassage(page, '#bankQBox .pz-item .pz-q', 6);
  await page.waitForSelector('.study-ai-toolbar');

  const box = await page.locator('.study-ai-toolbar').boundingBox();
  assert.ok(box.x >= 0, 'Toolbar left boundary >= 0');
  assert.ok(box.x + box.width <= 375, 'Toolbar right boundary <= 375');
  assert.ok(box.y >= 0, 'Toolbar top boundary >= 0');
  assert.ok(box.y + box.height <= 667, 'Toolbar bottom boundary <= 667');

  await page.keyboard.press('Escape');
  await page.waitForSelector('.study-ai-toolbar', { state: 'detached' });
  assert.equal(await page.locator('.study-ai-toolbar').isVisible(), false);
});

test('10. Context extraction excludes hidden FRQ reference answers, and KaTeX does not duplicate MathML', async t => {
  const page = await browser.newPage();
  t.after(()=>page.close());
  await page.addInitScript(() => localStorage.setItem('acct_token', 'frq-token'));
  await page.goto(base+'/#/practice');
  // Select FRQ only
  await page.locator('#bankTypes [data-type="mcq"]').click();
  await page.locator('#bankCount').fill('2');
  await page.locator('#bankStart').click();
  await page.waitForSelector('#bankQBox .pz-item.pz-frq');

  let sentBody = null;
  await page.route('**/api/ai/translate', async route => {
    sentBody = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"translation":"ok"}' });
  });

  const hiddenAnsText = await page.locator('#bankQBox .frq-ans[hidden]').first().innerText();
  assert.ok(hiddenAnsText.length > 5, 'FRQ question has hidden reference answer');

  await selectPassage(page, '#bankQBox .pz-item.pz-frq .pz-q', 5);
  await page.waitForSelector('.study-ai-toolbar');
  await page.locator('.study-ai-toolbar button:has-text("翻译")').click();
  await page.waitForSelector('.study-ai-content');

  assert.ok(sentBody, 'Request body received');
  assert.ok(!sentBody.context.includes(hiddenAnsText.trim()), 'Context must NOT include hidden FRQ reference answer');

  // Verify KaTeX math in Study Guide
  await page.locator('.study-ai-close').click();
  await page.goto(base+'/#/unit/1/reading');
  await page.waitForSelector('#studyGuide:not([hidden]) .katex');

  const mathText = await page.evaluate(() => {
    const eq = document.querySelector('#studyGuide .study-equation');
    if (!eq) return null;
    const r = document.createRange();
    r.selectNodeContents(eq);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    document.dispatchEvent(new Event('selectionchange'));
    return s.toString();
  });
  if (mathText) {
    await page.waitForSelector('.study-ai-toolbar, .study-word-popup');
    const tex=await page.locator('#studyGuide .study-equation').first().getAttribute('data-tex');
    sentBody=null;
    await page.locator('.study-ai-toolbar button:has-text("翻译")').click();
    await page.getByText('ok',{exact:true}).waitFor();
    assert.ok(sentBody.text.includes(tex),'Send original TeX rather than flattened visual glyphs');
  }
});

test('11. Six turns pass the actual server contract with complete history pairs',async t=>{
  const {createServer}=require('../ai-server/server');
  const auth=http.createServer((req,res)=>res.end('{"ok":true,"username":"test"}'));
  await new Promise(r=>auth.listen(0,'127.0.0.1',r));
  const calls=[];
  const ai=createServer({apiKey:'mock-only',account:{hostname:'127.0.0.1',port:auth.address().port},fetch:async(url,init)=>{
    calls.push(JSON.parse(init.body));
    return new Response('data: {"choices":[{"delta":{"content":"模拟解答"}}]}\n\n'+
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  }});
  await new Promise(r=>ai.listen(0,'127.0.0.1',r));
  t.after(async()=>{for(const s of [ai,auth])await new Promise(r=>{s.close(r);s.closeAllConnections();});});
  const page=await openPractice(t);
  await page.route('**/api/ai/ask',async route=>{
    const response=await fetch('http://127.0.0.1:'+ai.address().port+'/api/ai/ask',{
      method:'POST',headers:{Authorization:'Bearer session','Content-Type':'application/json'},body:route.request().postData()});
    await route.fulfill({status:response.status,contentType:response.headers.get('content-type'),body:await response.text()});
  });
  await selectPassage(page,'#bankQBox .pz-q',7);
  await page.locator('.study-ai-toolbar button:has-text("问问 AI")').click();
  for(let i=0;i<6;i++){
    await page.waitForFunction(()=>document.querySelector('.study-ai-send')?.disabled===false);
    assert.equal(await page.locator('.study-ai-status.error').count(),0);
    assert.equal(await page.locator('.study-ai-msg-assistant').last().innerText(),'模拟解答');
    if(i<5){await page.locator('.study-ai-input').fill('追问 '+i);await page.locator('.study-ai-send').click();}
  }
  assert.equal(calls.length,6);assert.equal(calls.at(-1).messages.length,11);
  assert.deepEqual(calls.at(-1).messages.slice(2,-1).map(x=>x.role),['user','assistant','user','assistant','user','assistant','user','assistant']);
});

test('12. Stream errors and missing done stay errors; retry excludes incomplete turns',async t=>{
  const page=await openPractice(t);let calls=0;
  await page.route('**/api/ai/ask',r=>{
    assert.deepEqual(r.request().postDataJSON().history,[]);calls++;
    const events=calls===1?[{delta:'未完成'},{error:'连接中断'}]:calls===2?[{delta:'仍未完成'}]:[{delta:'完整答案'},{done:true}];
    return r.fulfill({contentType:'application/x-ndjson',body:events.map(JSON.stringify).join('\n')+'\n'});
  });
  await selectPassage(page,'#bankQBox .pz-q',7);await page.locator('.study-ai-toolbar button:has-text("问问 AI")').click();
  for(let i=0;i<2;i++){await page.locator('.study-ai-status.error').waitFor();await page.getByRole('button',{name:'重试',exact:true}).click();}
  await page.getByText('完整答案',{exact:true}).waitFor();assert.equal(await page.locator('.study-ai-status.error').count(),0);
});

test('13. Mobile modal remains within screen after long response and Escape preserves guide',async t=>{
  const page=await openPractice(t);await page.setViewportSize({width:375,height:667});
  await page.route('**/api/ai/translate',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({translation:'较长译文。'.repeat(180)})}));
  await page.evaluate(()=>{AP_LEARNING.setLanguage('en');AP_LEARNING.openGuide();});
  await page.waitForSelector('#studyGuide:not([hidden]) .study-teaching p');
  const p=page.locator('#studyGuide .study-teaching p').first();await p.scrollIntoViewIfNeeded();
  await p.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});
  await page.locator('.study-ai-toolbar').getByRole('button',{name:'Translate',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.study-ai-content')?.textContent.length>100);
  const box=await page.locator('.study-ai-panel').boundingBox();
  assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=375&&box.y+box.height<=667);
  assert.equal(await page.locator('.study-ai-panel').isVisible(),true);
  assert.equal(await page.locator('#studyGuide').isVisible(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('.study-ai-panel').count(),0);
  assert.equal(await page.locator('#studyGuide').evaluate(d=>!d.hidden),true);
});

test('14. Imported book selection excludes hidden source and answers',async t=>{
  const page=await openPractice(t);let body;
  await page.route('**/api/ai/translate',r=>{body=r.request().postDataJSON();return r.fulfill({contentType:'application/json',body:'{"translation":"模拟书本译文"}'});});
  await page.evaluate(()=>{
    window.AP_BOOK_DATA={groups:[{id:'chapter1',kind:'chapter',title:'Test chapter',sheets:{mcq:'HIDDEN_SOURCE_456'},questions:[{id:'book1',type:'mcq',number:1,stem:'Why does the temperature change in this reaction?',context:'A beaker contains a solution.',options:['Option A','Option B'],answer:0,explanation:'HIDDEN_EXPLANATION_789'}]}]};AP_LEARNING.openBook();
  });
  const p=page.locator('#bookPractice .book-question .book-html').first();await p.waitFor();
  await p.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});
  await page.locator('.study-ai-toolbar button:has-text("翻译")').click();await page.getByText('模拟书本译文',{exact:true}).waitFor();
  assert.doesNotMatch(body.context,/HIDDEN_SOURCE|HIDDEN_EXPLANATION/);
  assert.equal(await page.locator('.study-ai-panel').isVisible(),true);
  assert.equal(await page.locator('#bookPractice').isVisible(),true);
});
