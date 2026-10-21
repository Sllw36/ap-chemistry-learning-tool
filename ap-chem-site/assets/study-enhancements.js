(() => {
  'use strict';
  const assets = new URL('.', document.currentScript.src);
  const content = window.AP_STUDY;
  if (!content) return;
  const $ = id => document.getElementById(id);
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode still works */ } };
  let language = read('apchem.language', 'zh');
  if (!['zh','en'].includes(language)) language = 'zh';
  let readingLanguage = read('apchem.readingLanguage', 'both');
  if (!['zh','en','both'].includes(readingLanguage)) readingLanguage = 'both';
  const isMaterial = () => document.documentElement.classList.contains('material-app');
  const t = (en, zh) => language === 'en' ? en : zh;
  const text = value => value[language];
  const el = (tag, cls, value) => { const n = document.createElement(tag); if (cls) n.className = cls; if (value !== undefined) n.textContent = value; return n; };
  const button = (en, zh, action, cls = 'btn') => { const n = el('button', cls, t(en,zh)); n.type = 'button'; n.addEventListener('click',action); return n; };
  const bilingual = (en,zh) => ({en,zh});
  const lessons=window.AP_LESSONS || {};
  const glossary=window.AP_LECTURE_GLOSSARY;
  const escapeRE=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const termPattern=glossary ? new RegExp('\\b(?:'+glossary.entries.map(([term])=>escapeRE(term)).sort((a,b)=>b.length-a.length).join('|')+')(?:s)?\\b','gi') : null;
  function renderBi(parent, tag, biObj, cls = '', prefix = '') {
    if (!biObj) return;
    if (typeof biObj === 'string') {
      parent.append(el(tag, cls, prefix + biObj));
      return;
    }
    const enText = prefix + (biObj.en ?? '');
    const zhText = prefix + (biObj.zh ?? '');
    if (readingLanguage === 'en') {
      parent.append(el(tag, (cls ? cls + ' ' : '') + 'english', enText));
    } else if (readingLanguage === 'zh') {
      parent.append(el(tag, (cls ? cls + ' ' : '') + 'chinese', zhText));
    } else if (tag === 'h3') {
      const heading=el(tag,cls),en=el('span','english',enText),zh=el('span','chinese',zhText);
      en.lang='en';zh.lang='zh-CN';heading.append(en,zh);parent.append(heading);
    } else {
      parent.append(
        el(tag, (cls ? cls + ' ' : '') + 'english', enText),
        el(tag, (cls ? cls + ' ' : '') + 'chinese', zhText)
      );
    }
  }
  function blockBi(enTitle, zhTitle, biValue, cls = 'study-block') {
    const n = el('section', cls);
    n.append(el('h3', '', t(enTitle, zhTitle)));
    renderBi(n, 'p', biValue);
    return n;
  }
  function emphasise(root) {
    const isEnActive = language === 'en' || readingLanguage === 'en' || readingLanguage === 'both';
    if (!isEnActive || !termPattern) return;
    root.querySelectorAll('.study-card p, .study-card li, .reader-content p, .reader-content li, .study-teaching p, .study-example li').forEach(block=>{
      const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);const nodes=[];
      while(walker.nextNode()){
        if(!walker.currentNode.parentElement.closest('.katex,strong,button,.chinese'))nodes.push(walker.currentNode);
      }
      let count=0;const seen=new Set();
      for(const node of nodes){
        termPattern.lastIndex=0;const raw=node.nodeValue;const fragment=document.createDocumentFragment();let offset=0,match;
        while((match=termPattern.exec(raw))&&count<3){
          const result=glossary.lookup(match[0]);if(!result||seen.has(result.key))continue;
          fragment.append(document.createTextNode(raw.slice(offset,match.index)));
          const term=el('strong','study-term',match[0]);term.dataset.term=match[0];term.tabIndex=0;term.setAttribute('role','button');term.title='查看中文释义 / Chinese meaning';
          fragment.append(term);offset=match.index+match[0].length;count++;seen.add(result.key);
        }
        if(offset){fragment.append(document.createTextNode(raw.slice(offset)));node.replaceWith(fragment);}
      }
    });
  }
  let wordPopup=null;
  function hideWord(){wordPopup?.remove();wordPopup=null;}
  function lookupWord(raw){return glossary?.lookup(raw)||window.__vocab?.lookup(raw)||null;}

  function positionPopup(popup,anchor,modal){
    const bounds=modal?.getBoundingClientRect();
    const left=bounds?bounds.left+modal.clientLeft:0;
    const top=bounds?bounds.top+modal.clientTop:0;
    const right=Math.min(document.documentElement.clientWidth,bounds?left+modal.clientWidth:innerWidth);
    const bottom=Math.min(innerHeight,bounds?top+modal.clientHeight:innerHeight);
    popup.style.maxWidth=Math.max(0,right-left-16)+'px';
    popup.style.maxHeight=Math.max(0,bottom-top-16)+'px';
    if(popup.parentElement!==(modal||document.body))(modal||document.body).append(popup);
    const box=popup.getBoundingClientRect(),gap=8;
    const posX=Math.max(left+8,Math.min(anchor.left,right-box.width-8));
    const height=popup.classList.contains('study-ai-panel')?Math.min(520,bottom-top-16):box.height;
    let posY=anchor.bottom+gap;
    if(posY+height>bottom-8){
      posY=Math.max(top+8,Math.min(anchor.top-height-gap,bottom-height-8));
    }
    popup.style.left=posX+'px';
    popup.style.top=posY+'px';
  }

  function showWord(raw,anchor,scope,context=raw){
    hideAllPopups();const result=lookupWord(raw);
    const popup=el('aside','study-word-popup study-owned');wordPopup=popup;
    popup.setAttribute('role','region');popup.setAttribute('aria-label',t('Chinese word meaning','英文词语中文释义'));
    popup.append(el('strong','study-word-title',raw));
    const close=button('Close','关闭',hideWord,'study-word-close');close.setAttribute('aria-label',t('Close definition','关闭释义'));popup.append(close);
    const meaning=el('p','',result?result.e[1]:t('No local definition found. Try the base form of a single word.','本地词典暂未收录。可以尝试单词原形。'));
    meaning.lang='zh-CN';meaning.setAttribute('role','status');popup.append(meaning);
    if(result){
      const add=button('Save to vocabulary','加入生词本',()=>{
        const entry=window.__vocab?.addEntry?.(result.key,result.e);
        add.textContent=entry?t('Saved ✓','已加入 ✓'):t('Could not save','暂时无法保存');add.disabled=!!entry;
      });popup.append(add);
    }
    const snapshot={text:raw,context,anchor,scope,modal:scope.closest('dialog[open]'),title:raw};
    if(activeSnapshot?.text!==raw||activeSnapshot?.context!==context)askHistory=[];
    activeSnapshot=snapshot;
    const actions=el('div','study-ai-actions');
    actions.append(button('Translate','翻译',()=>openAiTranslate(snapshot)),button('Ask AI','问问 AI',()=>openAiAsk(snapshot)));
    popup.append(actions);
    const modal=scope.closest('dialog[open]');
    positionPopup(popup,anchor,modal);
  }

  const translationCache=new Map();
  function getCachedTranslation(text,context){return translationCache.get(text+'\0'+context);}
  function setCachedTranslation(text,context,translation){
    if(translationCache.size>=50){const first=translationCache.keys().next().value;translationCache.delete(first);}
    translationCache.set(text+'\0'+context,translation);
  }

  let aiPopup=null,activeSnapshot=null,currentAbortController=null,currentRequestId=0,askHistory=[];
  function accountToken(){try{return localStorage.getItem('acct_token');}catch{return '';}}
  function translationFailure(message,status=0){return Object.assign(new Error(message),{translation:true,status});}
  async function requestTranslation(snapshot,signal){
    const cached=getCachedTranslation(snapshot.text,snapshot.context);
    if(cached)return cached;
    const token=accountToken();
    if(!token)throw translationFailure(t('Please sign in first.','请先登录账号后再使用翻译。'),401);
    const resp=await fetch('/api/ai/translate',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
      body:JSON.stringify({text:snapshot.text.slice(0,6000),context:snapshot.context.slice(0,2000)}),signal
    });
    if(!resp.ok){
      let message=t('Service temporarily unavailable. Please try again later.','服务暂时不可用，请稍后重试。');
      if(resp.status===401)message=t('Session expired. Please sign in again.','登录已失效，请重新登录。');
      else if(resp.status===429)message=t('Too many requests. Please try again later.','请求过于频繁，请稍后再试。');
      else if(resp.status!==503){try{const data=await resp.json();if(data.error)message=data.error;}catch{}}
      throw translationFailure(message,resp.status);
    }
    const data=await resp.json();
    if(data.error)throw translationFailure(data.error);
    if(typeof data.translation!=='string'||!data.translation.trim())throw translationFailure(t('Invalid translation. Please retry.','翻译格式异常，请重试。'));
    if(!signal.aborted)setCachedTranslation(snapshot.text,snapshot.context,data.translation);
    return data.translation;
  }
  function translationErrorText(error){return error.translation?error.message:t('Network request failed. Please check your connection.','网络请求失败，请检查连接后重试。');}
  function abortInFlight(){if(currentAbortController){currentAbortController.abort();currentAbortController=null;}currentRequestId++;}
  function hideAiPopup(){abortInFlight();aiPopup?.remove();aiPopup=null;}
  function hideAllPopups(){hideWord();hideAiPopup();}

  function findStudyScope(node){
    if(!node)return null;
    const parent=node.nodeType===1?node:node.parentElement;
    if(!parent||parent.closest('button,input,textarea,select,.study-word-popup,.study-ai-popup'))return null;
    return parent.closest('.study-card,.study-reading,.study-pane-guide,#learnContent .pane,.pz-item,#bankQBox,#bankSession,#bkView,.book-question,.book-context,.study-book-body,#bookPractice,#studyGuide,.reader-content,.study-teaching,.study-page');
  }

  function cleanFragment(fragment){
    fragment.querySelectorAll('details:not([open]),[hidden],.hide,.frq-ans,.pz-fb,.book-feedback,.book-source-sheet,button,style,script,.study-word-popup,.study-ai-popup').forEach(n=>n.remove());
    fragment.querySelectorAll('*').forEach(n=>{if(n.style&&(n.style.display==='none'||n.style.visibility==='hidden'))n.remove();});
    fragment.querySelectorAll('[data-tex]').forEach(eq=>{
      if(eq.dataset.tex)eq.textContent=' '+eq.dataset.tex+' ';
    });
    fragment.querySelectorAll('.katex').forEach(eq=>{
      const tex=eq.querySelector('annotation[encoding="application/x-tex"]');
      if(tex)eq.replaceWith(' \\('+tex.textContent+'\\) ');
      else eq.querySelectorAll('.katex-mathml').forEach(n=>n.remove());
    });
    fragment.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));
    fragment.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,h6,tr').forEach(block=>block.append('\n'));
    return (fragment.textContent||'').replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n\n').trim();
  }

  function extractCleanText(range){
    if(!range||range.collapsed)return '';
    range=range.cloneRange();
    const start=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement)?.closest('.katex');
    const end=(range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement)?.closest('.katex');
    if(start)range.setStartBefore(start);
    if(end)range.setEndAfter(end);
    return cleanFragment(range.cloneContents());
  }

  function extractContext(range,scope){
    const node=range.commonAncestorContainer;
    const parent=node.nodeType===1?node:node.parentElement;
    const block=parent?.closest('section,article,.study-block,.study-teaching,.study-example,.study-check,p,li')||scope;
    const question=parent?.closest('.pz-item,.book-question,.book-context');
    const container=question||(block?.matches('p,li')&&scope.contains(block.parentElement)?block.parentElement:block);
    if(!container)return '';
    const whole=document.createRange();whole.selectNodeContents(container);
    const text=extractCleanText(whole);
    if(text.length<=2000)return text;
    // Measure from the DOM range, so repeated words cannot anchor the wrong occurrence.
    const before=whole.cloneRange();before.setEnd(range.startContainer,range.startOffset);
    const offset=extractCleanText(before).length;
    const selected=extractCleanText(range);
    let start=Math.max(0,offset-Math.max(0,Math.floor((2000-selected.length)/2)));
    // Keep the entire paragraph when it fits, using leftover space for its neighbours.
    if(block&&block!==container&&container.contains(block)){
      const paragraph=document.createRange();paragraph.selectNodeContents(block);
      const paragraphText=extractCleanText(paragraph);
      if(paragraphText.length<=2000){
        const prefix=whole.cloneRange();prefix.setEndBefore(block);
        start=Math.max(0,extractCleanText(prefix).length-Math.floor((2000-paragraphText.length)/2));
      }
    }
    start=Math.min(start,Math.max(0,text.length-2000));
    return text.slice(start,start+2000).trim();
  }

  function showAiToolbar(snapshot){
    hideAllPopups();
    const toolbar=el('div','study-ai-popup study-ai-toolbar study-owned');
    toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label',t('AI Actions','AI 操作'));
    aiPopup=toolbar;
    const btnTrans=button('Translate','翻译',()=>openAiTranslate(snapshot));
    const btnAsk=button('Ask AI','问问 AI',()=>openAiAsk(snapshot));
    toolbar.append(btnTrans,btnAsk);
    if(snapshot.text.length>6000){btnTrans.disabled=btnAsk.disabled=true;toolbar.append(el('span','',t('Select up to 6000 characters.','请将选段缩短至 6000 字以内。')));}
    positionPopup(toolbar,snapshot.anchor,snapshot.modal);
  }

  function openAiTranslate(snapshot){
    abortInFlight();hideWord();
    if(!aiPopup){
      aiPopup=el('aside','study-ai-popup study-ai-panel study-owned');
      aiPopup.setAttribute('role','dialog');
    }else{
      aiPopup.className='study-ai-popup study-ai-panel study-owned';
      aiPopup.replaceChildren();
    }
    aiPopup.setAttribute('role','dialog');aiPopup.setAttribute('aria-label',t('AI Translation','AI 翻译'));
    const head=el('div','study-ai-head');
    head.append(el('strong','study-ai-title',snapshot.title));
    const closeBtn=el('button','study-ai-close','×');
    closeBtn.type='button';closeBtn.setAttribute('aria-label',t('Close','关闭'));
    closeBtn.addEventListener('click',hideAiPopup);
    head.append(closeBtn);aiPopup.append(head);

    const body=el('div','study-ai-body');
    const statusEl=el('div','study-ai-status','');
    const contentEl=el('div','study-ai-content','');
    const actionsEl=el('div','study-ai-actions');
    body.append(statusEl,contentEl,actionsEl);
    aiPopup.append(body);
    positionPopup(aiPopup,snapshot.anchor,snapshot.modal);

    const cached=getCachedTranslation(snapshot.text,snapshot.context);
    if(cached){contentEl.textContent=cached;renderMath(contentEl,true);return;}

    const reqId=++currentRequestId;
    const controller=new AbortController();currentAbortController=controller;
    statusEl.textContent=t('Translating…','正在翻译…');
    actionsEl.append(button('Cancel','取消',()=>controller.abort()));

    requestTranslation(snapshot,controller.signal).then(translation=>{
      if(reqId!==currentRequestId)return;
      statusEl.textContent='';contentEl.textContent=translation;renderMath(contentEl,true);actionsEl.replaceChildren();
    }).catch(err=>{
      if(reqId!==currentRequestId)return;
      if(err.name==='AbortError'){
        statusEl.textContent=t('Request cancelled.','请求已取消。');statusEl.className='study-ai-status';
      }else{
        statusEl.textContent=translationErrorText(err);
        statusEl.className='study-ai-status error';
      }
      actionsEl.replaceChildren(button('Retry','重试',()=>openAiTranslate(snapshot)));
    });
  }

  let toolTranslationAbort=null;
  function resetTranslationTool(){
    toolTranslationAbort?.abort();toolTranslationAbort=null;
    $('trOut').className='tr-out study-owned';$('trOut').replaceChildren();$('trHint').replaceChildren();
  }
  function translateTool(raw,forceAI=false){
    hideAllPopups();resetTranslationTool();
    const text=String(raw??'').trim(),out=$('trOut'),hint=$('trHint');
    out.classList.add('show');
    if(!text||text.length>6000){out.textContent=text?t('Use up to 6000 characters.','请将文本缩短至 6000 字以内。'):t('Enter text to translate.','请输入要翻译的内容。');return;}
    const local=forceAI?null:lookupWord(text);
    if(local){
      const word=el('div','tr-word',local.key);word.append(el('span','tr-pos',local.e[0]));
      out.append(word,el('div','tr-cn',local.e[1]));
      if(local.e[2])out.append(el('div','tr-kp',local.e[2]));
      window.__vocab.addEntry(local.key,local.e);
      hint.append(el('span','',t('Dictionary · Saved to vocabulary','词表 · 已加入生词本')),button('AI translation','AI 翻译',()=>translateTool(text,true)));
      return;
    }
    const controller=new AbortController();toolTranslationAbort=controller;
    const status=el('div','study-ai-status',t('Translating…','正在翻译…'));
    const result=el('div','study-ai-content'),actions=el('div','study-ai-actions');
    actions.append(button('Cancel','取消',()=>controller.abort()));out.append(status,result,actions);
    hint.textContent=t('AI translation','AI 翻译');
    requestTranslation({text,context:''},controller.signal).then(translation=>{
      if(toolTranslationAbort!==controller)return;
      status.textContent='';result.textContent=translation;renderMath(result,true);actions.replaceChildren();
    }).catch(error=>{
      if(toolTranslationAbort!==controller)return;
      status.textContent=error.name==='AbortError'?t('Request cancelled.','请求已取消。'):translationErrorText(error);
      status.classList.toggle('error',error.name!=='AbortError');
      actions.replaceChildren(button('Retry','重试',()=>translateTool(text,true)));
      if(error.status===401)actions.prepend(button('Sign in','登录',()=>{$('modalTr').classList.add('hide');$('btnUser').click();}));
    });
  }
  $('trInput').addEventListener('input',resetTranslationTool);
  new MutationObserver(()=>{if($('modalTr').classList.contains('hide'))resetTranslationTool();}).observe($('modalTr'),{attributes:true,attributeFilter:['class']});

  function openAiAsk(snapshot,customQuestion=null){
    abortInFlight();hideWord();
    if(!aiPopup){
      aiPopup=el('aside','study-ai-popup study-ai-panel study-owned');
      aiPopup.setAttribute('role','dialog');
    }else{
      aiPopup.className='study-ai-popup study-ai-panel study-owned';
      aiPopup.replaceChildren();
    }
    aiPopup.setAttribute('role','dialog');aiPopup.setAttribute('aria-label',t('Ask AI','问问 AI'));
    const head=el('div','study-ai-head');
    head.append(el('strong','study-ai-title',snapshot.title));
    const closeBtn=el('button','study-ai-close','×');
    closeBtn.type='button';closeBtn.setAttribute('aria-label',t('Close','关闭'));
    closeBtn.addEventListener('click',hideAiPopup);
    head.append(closeBtn);aiPopup.append(head);

    const body=el('div','study-ai-body');
    const messagesEl=el('div','study-ai-messages');
    const statusEl=el('div','study-ai-status','');
    const actionsEl=el('div','study-ai-actions');
    const form=el('form','study-ai-form');
    const input=el('input','study-ai-input');
    input.type='text';input.maxLength=1000;input.placeholder=t('Ask a follow-up question…','输入追问内容…');
    input.setAttribute('aria-label',t('Follow-up question','追问内容'));
    const sendBtn=button('Send','发送',()=>{},'btn study-ai-send');sendBtn.type='submit';
    form.append(input,sendBtn);
    form.addEventListener('submit',e=>{
      e.preventDefault();const q=input.value.trim();if(!q||sendBtn.disabled)return;input.value='';openAiAsk(snapshot,q);
    });
    body.append(messagesEl,statusEl,actionsEl,form);aiPopup.append(body);

    const question=customQuestion||t('Please explain this chemistry content and key concepts.','请解释这段化学内容及相关知识点。');
    [...askHistory,{role:'user',content:question}].forEach(item=>{
      const m=el('div','study-ai-msg study-ai-msg-'+item.role);
      m.textContent=item.content;
      messagesEl.append(m);
    });

    positionPopup(aiPopup,snapshot.anchor,snapshot.modal);

    const token=accountToken();
    if(!token){
      statusEl.textContent=t('Please sign in first.','请先登录账号后再使用 AI 问答。');
      statusEl.className='study-ai-status error';
      return;
    }

    const assistantMsgEl=el('div','study-ai-msg study-ai-msg-assistant');
    messagesEl.append(assistantMsgEl);

    const reqId=++currentRequestId;
    const controller=new AbortController();currentAbortController=controller;
    statusEl.textContent=t('AI is thinking…','AI 正在解答…');
    sendBtn.disabled=true;input.disabled=true;
    actionsEl.append(button('Cancel','取消',()=>controller.abort()));

    const historyPayload=askHistory.slice(-8).map(x=>({
      role:x.role,content:String(x.content).slice(0,6000)
    }));

    fetch('/api/ai/ask',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
      body:JSON.stringify({
        text:snapshot.text.slice(0,6000),
        context:snapshot.context.slice(0,2000),
        question:question.slice(0,1000),
        history:historyPayload
      }),
      signal:controller.signal
    }).then(async resp=>{
      if(reqId!==currentRequestId)return;
      if(!resp.ok){
        let msg=t('Service temporarily unavailable. Please try again later.','服务暂时不可用，请稍后重试。');
        if(resp.status===401)msg=t('Session expired. Please sign in again.','登录已失效，请重新登录。');
        else if(resp.status===429)msg=t('Too many requests. Please try again later.','请求过于频繁，请稍后再试。');
        else if(resp.status===503)msg=t('Service temporarily unavailable. Please try again later.','服务暂时不可用，请稍后重试。');
        else{try{const d=await resp.json();if(d.error)msg=d.error;}catch{}}
        if(reqId!==currentRequestId)return;
        assistantMsgEl.remove();sendBtn.disabled=false;input.disabled=false;
        statusEl.textContent=msg;statusEl.className='study-ai-status error';
        actionsEl.replaceChildren(button('Retry','重试',()=>openAiAsk(snapshot,customQuestion)));
        return;
      }
      const reader=resp.body.getReader();
      const decoder=new TextDecoder('utf-8');
      let buffer='',accumulated='',completed=false;
      function consume(line){
        if(!line.trim())return;
        const item=JSON.parse(line);
        if(item.error)throw Error(String(item.error));
        if(typeof item.delta==='string'){
          accumulated+=item.delta;assistantMsgEl.textContent=accumulated;messagesEl.scrollTop=messagesEl.scrollHeight;
        }
        if(item.done===true)completed=true;
      }
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        if(reqId!==currentRequestId)return;
        buffer+=decoder.decode(value,{stream:true});
        const lines=buffer.split('\n');
        buffer=lines.pop();
        for(const line of lines)consume(line);
      }
      consume(buffer+decoder.decode());
      if(reqId!==currentRequestId)return;
      if(!completed||!accumulated.trim())throw Error(t('Answer interrupted. Please retry.','回答连接中断，请重试。'));
      statusEl.textContent='';actionsEl.replaceChildren();
      sendBtn.disabled=false;input.disabled=false;
      askHistory.push({role:'user',content:question},{role:'assistant',content:accumulated.slice(0,6000)});
      if(askHistory.length>8)askHistory=askHistory.slice(-8);
    }).catch(err=>{
      if(reqId!==currentRequestId)return;
      controller.abort();sendBtn.disabled=false;input.disabled=false;
      if(!assistantMsgEl.textContent)assistantMsgEl.remove();
      if(err.name==='AbortError'){
        statusEl.textContent=t('Request cancelled.','请求已取消。');statusEl.className='study-ai-status';
      }else{
        statusEl.textContent=t('Answer incomplete. Please retry.','回答未完成，请重试。');
        statusEl.className='study-ai-status error';
      }
      actionsEl.replaceChildren(button('Retry','重试',()=>openAiAsk(snapshot,customQuestion)));
    });
  }

  function inspectSelection(){
    const selection=window.getSelection();if(!selection||selection.isCollapsed||selection.rangeCount!==1)return;
    const range=selection.getRangeAt(0),node=range.commonAncestorContainer;
    const parent=node.nodeType===1?node:node.parentElement;
    if(!parent||parent.closest('button,input,textarea,select,.study-word-popup,.study-ai-popup'))return;
    const scope=findStudyScope(parent);if(!scope)return;
    if(!scope.contains(range.startContainer)||!scope.contains(range.endContainer))return;

    const cleanText=extractCleanText(range);if(!cleanText||cleanText.length<1)return;

    const isSingleWord=/^[A-Za-z]+(?:['’\-][A-Za-z]+)*(?:\s+[A-Za-z]+(?:['’\-][A-Za-z]+)*){0,3}$/.test(cleanText)&&cleanText.length<=60;
    if(isSingleWord){
      const localResult=lookupWord(cleanText);
      if(localResult){
        hideAiPopup();showWord(cleanText,range.getBoundingClientRect(),scope,extractContext(range,scope));return;
      }
    }

    hideWord();
    const context=extractContext(range,scope);
    if(aiPopup&&activeSnapshot?.text===cleanText&&activeSnapshot?.context===context)return;
    const anchor=range.getBoundingClientRect();
    const modal=scope.closest('dialog[open]');
    let title=cleanText.split('\n')[0].trim();
    if(title.length>36)title=title.slice(0,36)+'…';

    if(!activeSnapshot||activeSnapshot.text!==cleanText||activeSnapshot.context!==context){
      askHistory=[];
    }
    activeSnapshot={text:cleanText,context:context,anchor:anchor,scope:scope,modal:modal,title:title};
    showAiToolbar(activeSnapshot);
  }

  let selectTimer;
  document.addEventListener('selectionchange',()=>{clearTimeout(selectTimer);selectTimer=setTimeout(inspectSelection,250);});
  document.addEventListener('pointerup',event=>{
    if(!event.target.closest('.study-word-popup,.study-ai-popup')){clearTimeout(selectTimer);selectTimer=setTimeout(inspectSelection,30);}
  });
  document.addEventListener('pointerdown',event=>{
    if(event.target.closest('.study-ai-popup button,.study-word-popup button')){event.preventDefault();return;}
    if(!event.target.closest('.study-word-popup,.study-ai-popup'))hideAllPopups();
  });
  document.addEventListener('click',event=>{
    const sel=window.getSelection();
    if(sel&&!sel.isCollapsed&&sel.toString().trim().length>0){
      if(event.target.closest('.w'))event.stopPropagation();
    }
    const term=event.target.closest('.study-term');
    if(term&&window.getSelection()?.isCollapsed)showWord(term.dataset.term,term.getBoundingClientRect(),term.closest('.study-card, .reader-content, #studyGuide, .study-page')||term.parentElement);
  },true);
  document.addEventListener('keydown',event=>{
    const term=event.target.closest('.study-term');
    if(term&&['Enter',' '].includes(event.key)){event.preventDefault();showWord(term.dataset.term,term.getBoundingClientRect(),term.closest('.study-card, .reader-content, #studyGuide, .study-page')||term.parentElement);}
    if(event.key==='Escape'){
      if(aiPopup||wordPopup){event.preventDefault();event.stopPropagation();hideAllPopups();}
    }
  },true);
  document.addEventListener('scroll',event=>{
    if(wordPopup&&!wordPopup.contains(event.target))hideWord();
    if(aiPopup&&!aiPopup.contains(event.target)&&aiPopup.classList.contains('study-ai-toolbar'))hideAiPopup();
  },true);
  window.addEventListener('resize',hideAllPopups);
  window.addEventListener('hashchange',hideAllPopups);

  function readingHint(){if(isMaterial())return null;return el('p','study-lookup-hint',t('Bold terms are key concepts. Select an English word or short term to see its Chinese meaning; click a bold term or focus it and press Enter.','粗体标出英文重点词。选中英文单词或短语可查中文；也可点击重点词，或用 Tab 聚焦后按 Enter。'));}
  const UI = new Map(Object.entries({
    'AP Chemistry 学习工具':'AP Chemistry Learning Tool',
    '首页':'Home','学习':'Learn','题库':'Question bank','错题本':'Review','生词本':'Vocabulary','设置':'Settings',
    '个单词':'words','暂无生词':'No saved words','查过的单词会保存在这里。':'Words you look up appear here.','查词':'Look up a word','清空生词本':'Clear vocabulary',
    '进入 →':'Open →','公式表':'Formula sheet','查缺补漏':'Knowledge check','大纲':'Outline','翻译':'Translation','刷新':'Reload',
    '← 返回首页':'← Home','登录 / 注册':'Sign in / Register','← 返回单元列表':'← All units',
    '9 个单元':'9 units','按小节归类':'Organised by topic','一键练习':'Quick practice','按范围选':'Choose topics','自选题量':'Choose question count',
    '中英双语解析':'Bilingual explanations','自动记录':'Automatic history','三态分类':'Track progress','一键订正':'Retry mistakes','单词列表':'Word list','背诵模式':'Recall practice','自动收录':'Save new words',
    '原子结构与性质':'Atomic Structure and Properties','分子与离子化合物结构与性质':'Molecular and Ionic Compound Structure',
    '分子间作用力与性质':'Intermolecular Forces and Properties','化学反应':'Chemical Reactions','化学动力学':'Kinetics','热力学':'Thermochemistry',
    '化学平衡':'Equilibrium','酸和碱':'Acids and Bases','热力学应用与电化学':'Thermodynamics and Electrochemistry',
    '摩尔与摩尔质量':'Moles and molar mass','质谱与同位素':'Mass spectra and isotopes','元素组成与化学式':'Composition and formulas',
    '混合物与限量反应':'Mixtures and limiting reactants','原子结构':'Atomic structure','电子排布':'Electron configurations','量子数':'Quantum numbers',
    'PES 能谱':'Photoelectron spectroscopy','周期趋势':'Periodic trends','价电子与离子化合物':'Valence electrons and ionic formulas',
    '第一步 · 选择题型':'Step 1 · Question types','第二步 · 选择范围':'Step 2 · Topics','第三步 · 选择题目数量':'Step 3 · Question count',
    '全选':'Select all','清空':'Clear','取全部':'Use all','开始做题':'Start practice','选择题 · 单选，自动判分':'Multiple choice · auto-graded',
    '解答题 · 含评分要点，自评':'Free response · self-assessment','全选本单元':'Select this unit','点击展开':'Expand',
    '学习 · Course Map':'Learn · Course Map',
    'AP Chemistry 全部 9 个单元。点击任意卡片进入该单元的教学空间。':'All nine AP Chemistry units. Select a card to open its learning space.',
    '从原子内部的电子排布，读懂元素性质的周期规律。':'Use electron structure to explain periodic patterns in element properties.',
    '从化学键到分子形状，理解物质为什么长这样。':'Connect bonding and molecular shape to the structure of matter.',
    '分子间作用力、理想气体、溶液与光谱。':'Explore intermolecular forces, ideal gases, solutions, and spectroscopy.',
    '化学方程式的读法与写法：净离子方程式、计量与反应类型。':'Read and write chemical equations; connect stoichiometry to reaction types.',
    '反应快慢的定量描述：速率定律、反应级数与反应机理。':'Describe reaction speed using rate laws, orders, and mechanisms.',
    '反应的能量账：吸热放热、量热法、键焓与盖斯定律。':'Track reaction energy with calorimetry, bond enthalpy, and Hess’s law.',
    '可逆反应的动态平衡：K 与 Q、勒夏特列原理与溶解平衡。':'Analyse dynamic equilibrium using K, Q, Le Châtelier’s principle, and solubility.',
    '酸与碱的定量世界：pH、弱酸平衡、滴定与缓冲溶液。':'Calculate pH, weak-acid equilibria, titration behaviour, and buffer responses.',
    '熵与吉布斯自由能如何决定反应方向，以及电化学。':'Use entropy and Gibbs free energy to understand reaction direction and electrochemistry.',
    '化学键':'Chemical bonds','分子几何':'Molecular geometry','路易斯结构':'Lewis structures','分子间作用力':'Intermolecular forces',
    '理想气体定律':'Ideal gas law','溶液与浓度':'Solutions and concentration','光谱':'Spectroscopy','净离子方程式':'Net ionic equations',
    '化学计量':'Stoichiometry','酸碱反应':'Acid–base reactions','氧化还原':'Redox','速率定律':'Rate laws','反应级数':'Reaction orders',
    '半衰期':'Half-life','反应机理':'Mechanisms','吸热与放热':'Endothermic and exothermic','量热法':'Calorimetry','键焓':'Bond enthalpy','盖斯定律':'Hess’s law',
    '平衡常数 K':'Equilibrium constant K','反应商 Q':'Reaction quotient Q','勒夏特列原理':'Le Châtelier’s principle','溶解平衡':'Solubility equilibria',
    'pH 与 pOH':'pH and pOH','弱酸弱碱':'Weak acids and bases','酸碱滴定':'Acid–base titrations','缓冲溶液':'Buffers','熵':'Entropy','吉布斯自由能':'Gibbs free energy',
    '原电池':'Galvanic cells','电解与法拉第定律':'Electrolysis and Faraday’s law',
    'MCQ 与 FRQ 可以':'MCQ and FRQ can be','同时选择':'selected together',
    '。范围右侧的题量会随题型筛选实时变化。':'. Question counts update with your type selection.',
    '勾选要练习的小节，右侧数字是该范围内的题目总数。':'Select topics to practise. The number on the right is the available question count.',
    '上限就是当前所选范围内的全部题目。':'The limit is the total number of questions in the selected topics.',
    '题目总数':'Questions','已完成':'Completed','进度':'Progress','← 上一道':'← Previous','下一道 →':'Next →',
    'Course Map —— 全部 9 个单元的内容地图，按 AP 官方小节归类，一键进入学习页或练习。':'Explore nine units, with bilingual chapter guides, worked examples, and interactive labs.',
    'Question Bank —— 所有 PDF 题目按小节归好档。先选范围（如 U2.7 分子几何），再选题量，随时开练。':'Choose topics and question counts, or open the imported book practice bank.',
    'Review Book —— 只收录做错的题，分「待订正 / 已订正」两部分，一键重做全部待订正。':'Revisit mistakes and track corrections in the existing question bank.',
    'Vocabulary Book —— 用「翻译」查过的单词会自动收录，集中查看中文释义与知识点，还能进入背诵模式自测。':'Look up chemistry words, save their Chinese meanings, and practise recall.'
  }));
  const unitTitles = [...UI.entries()].filter(([zh])=>['原子结构与性质','分子与离子化合物结构与性质','分子间作用力与性质','化学反应','化学动力学','热力学','化学平衡','酸和碱','热力学应用与电化学'].includes(zh)).sort((a,b)=>b[0].length-a[0].length);
  const originals = new WeakMap();
  function translate(root) {
    const walk = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      if (node.parentElement?.closest('script,style,.katex,.study-owned,.legacy-lab,.book-html')) continue;
      const current = node.nodeValue;
      let original = originals.get(node);
      if (original === undefined) { original = current; originals.set(node, original); }
      const key = original.trim();
      let value = language === 'en' && UI.has(key) ? original.replace(key,UI.get(key)) : original;
      if(language==='en'){
        if(/^Unit \d+/.test(key))for(const [zh,en] of unitTitles)value=value.replace(zh,en);
        value=value.replace(/(\d+) 章/g,'$1 topics').replace(/(\d+) 题/g,'$1 questions').replace(/(\d+) 个小节/g,'$1 topics').replace(/(\d+) 道配套题/g,'$1 practice questions').replace(/^首页\s*\//,'Home /');
      }
      if (node.nodeValue !== value) node.nodeValue = value;
    }
  }
  function renderMath(root, singleDollar = false) {
    if (!window.katex) return;
    root.querySelectorAll('[data-tex]').forEach(n => {
      if (n.dataset.rendered === n.dataset.tex) return;
      try {
        katex.render(n.dataset.tex,n,{displayMode:true,throwOnError:false,trust:false,strict:'warn',output:'htmlAndMathml'});
        n.dataset.rendered = n.dataset.tex;
      } catch { n.textContent = n.dataset.tex; }
    });
    if (window.renderMathInElement) renderMathInElement(root,{
      delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},...(singleDollar?[{left:'$',right:'$',display:false}]:[])],
      throwOnError:false,trust:false,ignoredClasses:['katex','no-math'],
      ignoredTags:['script','noscript','style','textarea','pre','code','option']
    });
  }
  window.AP_renderMath = renderMath;
  function formula(tex) { const f = el('div','study-equation',tex); f.dataset.tex = tex; return f; }
  function chapterCard(c, compact = false) {
    const card = el('article','study-card study-owned');
    card.lang=language==='en'?'en':'zh-CN';
    card.append(el('div','study-eyebrow',t('CHAPTER','第')+' '+c.id+(language === 'zh' ? ' 章' : '')),
      el('h2','',text(c.title)),el('p','study-core',text(c.core)));
    const block = (en,zh,value) => { const n=el('section','study-block'); n.append(el('h3','',t(en,zh)),el('p','',text(value))); return n; };
    const hint = readingHint(); if (hint) card.append(hint);
    const lesson=lessons[c.id];
    if(lesson){
      const roadmap=el('section','study-roadmap');
      roadmap.append(block('Before you start','开始前需要什么',lesson.before),block('What you will learn','学完要会什么',lesson.goals));card.append(roadmap);
      lesson.sections.forEach(section=>{
        const n=el('section','study-teaching');n.append(el('h3','',text(section.title)));
        section.paragraphs.forEach(p=>n.append(el('p','',text(p))));if(section.tex)n.append(formula(section.tex));if(section.note)n.append(el('p','study-symbol-note',text(section.note)));card.append(n);
      });
    }
    const review=el('details','study-recap');review.append(el('summary','',t('Recap: main reasoning and formula','回顾：核心思路与公式')),
      block('Why it works','为什么',c.why),formula(c.formula),block('Symbols, units, and conditions','符号、单位与适用条件',c.symbols));card.append(review);
    const example = el('section','study-example');
    example.append(el('h3','',t('Worked example 1 · follow the reasoning','例题 1 · 跟着思路做')),el('p','',text(c.example)));
    const list = el('ol'); c.steps.forEach(s=>list.append(el('li','',text(s)))); example.append(list); card.append(example);
    if(lesson){
      const extra=el('section','study-example');extra.append(el('h3','',t('Worked example 2 · apply the concept','例题 2 · 应用概念')),el('p','',text(lesson.extra.prompt)));
      const steps=el('ol');lesson.extra.steps.forEach(step=>steps.append(el('li','',text(step))));extra.append(steps);if(lesson.extra.tex)extra.append(formula(lesson.extra.tex));card.append(extra);
      const checks=el('section','study-checks');checks.append(el('h3','',t('Try it yourself before revealing the answer','先独立尝试，再展开答案')));
      lesson.checks.forEach((check,i)=>{const item=el('div','study-check');item.append(el('p','',`${i+1}. ${text(check.question)}`));
        const answer=el('details');answer.append(el('summary','',t('Show answer and reasoning','查看答案与理由')),el('p','',text(check.answer)));item.append(answer);checks.append(item);});card.append(checks);
    }
    card.append(block('Common mistake','常见错误',c.trap));
    const actions = el('div','study-actions');
    actions.append(button('Practise this chapter','练习本章题目',()=>openBook('unit'+c.id)));
    if (compact) actions.append(button('Open all 9 chapters','查看全部 9 章',()=>openGuide(c.id)));
    card.append(actions);
    return card;
  }
  function topicCard(id) {
    const topic=window.AP_TOPICS?.[id];if(!topic)return null;
    const card=el('article','study-card study-owned study-topic');
    card.append(el('div','study-eyebrow',t('THIS TOPIC','本节重点')),el('h2','',t(topic[0],topic[1])),el('p','study-core',t(topic[2],topic[3])));
    card.lang=language==='en'?'en':'zh-CN';if(topic[4])card.append(formula(topic[4]));return card;
  }
  const paneHosts = [];
  document.querySelectorAll('#learnContent .pane').forEach(pane => {
    const ids = content.paneChapters[pane.id]; if (!ids) return;
    const legacy = el('details','legacy-lab');
    const summary = el('summary'); legacy.append(summary);
    while (pane.firstChild) legacy.append(pane.firstChild);
    const host = el('div','study-owned study-pane-guide');
    pane.append(host,legacy); paneHosts.push({pane,host,legacy,summary,ids,id:pane.id});
  });
  const top = document.querySelector('.topbar');
  const controls = el('div','study-toolbar study-owned');
  const languageLabel = el('label','language-label', 'Language / 语言');
  const languageSelect = el('select'); languageSelect.id='studyLanguage'; languageSelect.setAttribute('aria-label','Language / 语言');
  [['zh','中文'],['en','English']].forEach(([value,label])=>{const o=el('option','',label);o.value=value;languageSelect.append(o);});
  languageLabel.append(languageSelect); controls.append(languageLabel);
  const guideButton = button('Study guide','双语讲解',()=>openGuide());
  const bookButton = button('Book practice','书本题库',()=>openBook());
  controls.append(guideButton,bookButton);
  if (!isMaterial() && top) top.append(controls);
  const homeCard = el('div','study-home study-owned');
  if (!isMaterial() && $('home')) {
    const modules = $('home').querySelector('.modules');
    if (modules) $('home').insertBefore(homeCard, modules);
  }
  const bankLink = el('div','study-bank-link study-owned');
  if ($('bankSelView')) $('bankSelView').prepend(bankLink);
  let activeChapter = 1;
  let guideTab = 'reading';
  const guide = isMaterial()
    ? el('section','study-page study-owned')
    : el('dialog','study-dialog study-owned');
  guide.id = 'studyGuide';
  if (isMaterial()) guide.hidden = true;

  const book = isMaterial()
    ? el('section','study-page study-owned')
    : el('dialog','study-dialog study-owned');
  book.id = 'bookPractice';
  if (isMaterial()) book.hidden = true;

  document.body.append(guide,book);
  function header(dialog,title) {
    const h=el('header','study-dialog-head'); h.append(el('h2','',title));
    const actions=el('div','study-dialog-actions');
    actions.append(button('中文','English',()=>{language=language==='en'?'zh':'en';save('apchem.language',language);renderLanguage();}));
    const close=button('Close','关闭',()=>dialog.close()); close.setAttribute('aria-label',t('Close dialog','关闭对话框'));actions.append(close);h.append(actions);return h;
  }
  function showDialog(d) { if (d.tagName?.toLowerCase()==='dialog' && !d.open) d.showModal(); }
  function isGuideVisible() {
    return isMaterial() ? (!guide.hidden && guide.style.display !== 'none') : Boolean(guide.open);
  }
  function isBookVisible() {
    return isMaterial() ? (!book.hidden && book.style.display !== 'none') : Boolean(book.open);
  }
  function setReadingLanguage(val) {
    if (!['zh','en','both'].includes(val)) return;
    readingLanguage = val;
    save('apchem.readingLanguage', readingLanguage);
    if (isGuideVisible()) {
      const scrollY = window.scrollY;
      const scrollTop = guide.scrollTop;
      showGuide(activeChapter, guideTab);
      if (isMaterial()) window.scrollTo(0, scrollY);
      else guide.scrollTop = scrollTop;
    }
  }
  function renderGuide() {
    hideAllPopups();
    guide.replaceChildren(header(guide,t('Bilingual chemistry guide','化学双语学习讲解')));
    const layout=el('div','study-layout'); const nav=el('nav','study-chapter-nav'); nav.setAttribute('aria-label',t('Chapters','章节'));
    content.chapters.forEach(c=>{const b=button(`${c.id}. ${c.title.en}`,`${c.id}. ${c.title.zh}`,()=>{activeChapter=c.id;renderGuide();guide.scrollTop=0;},'study-chapter-button');
      b.setAttribute('aria-current',String(c.id===activeChapter));nav.append(b);});
    const body=el('div','study-reading');
    body.append(el('p','study-source',t('Original study notes reorganised into the nine official AP Chemistry units.','按官方 AP 化学九个单元重新组织的双语讲解。')),
      chapterCard(content.chapters.find(c=>c.id===activeChapter)));
    layout.append(nav,body);guide.append(layout);renderMath(body);emphasise(body);
  }
  function openGuide(id, tab = 'reading') {
    const targetChapter = Number(id) || activeChapter || 1;
    const targetTab = ['reading','examples','checks'].includes(tab) ? tab : 'reading';
    if (isMaterial()) {
      document.dispatchEvent(new CustomEvent('apchem:navigate', {
        detail: { view: 'guide', chapter: targetChapter, tab: targetTab }
      }));
    } else {
      activeChapter = targetChapter;
      guideTab = targetTab;
      renderGuide();
      showDialog(guide);
      guide.scrollTop = 0;
    }
  }
  function showGuide(id, tab = 'reading') {
    hideAllPopups();
    currentBookRequestId++;
    if (id !== undefined && id !== null) {
      const parsed = Number(id);
      if (parsed >= 1 && parsed <= content.chapters.length) activeChapter = parsed;
    }
    if (tab && ['reading','examples','checks'].includes(tab)) {
      guideTab = tab;
    } else {
      guideTab = 'reading';
    }
    const c = content.chapters.find(item => item.id === activeChapter) || content.chapters[0];
    const lesson = lessons[c.id];

    guide.replaceChildren();

    const heading = el('div', 'reader-heading lesson-heading');
    const titleWrap = el('div');
    titleWrap.append(el('h1', '', text(c.title)),el('p','subtext',t(`Unit ${c.id}`,`第 ${c.id} 单元`)));
    heading.append(titleWrap);
    guide.append(heading);

    const nav = el('nav', 'reader-tabs lesson-tabs');
    nav.setAttribute('aria-label', t('Unit sections', '单元内容'));
    const tabsList = [
      ['reading', t('Guide', '讲义')],
      ['examples', t('Worked Examples', '例题')],
      ['checks', t('Practice Checks', '自测')]
    ];
    tabsList.forEach(([tKey, label]) => {
      const a = el('a', tKey === guideTab ? 'reader-tab active' : 'reader-tab');
      a.href = `#/unit/${c.id}/${tKey}`;
      a.textContent = label;
      if (tKey === guideTab) {
        a.setAttribute('aria-current', 'page');
      }
      a.addEventListener('click', e => {
        e.preventDefault();
        openGuide(c.id, tKey);
      });
      nav.append(a);
    });
    guide.append(nav);

    const contentEl = el('article', 'reader-content study-reading study-card');
    contentEl.lang = readingLanguage === 'en' ? 'en' : 'zh-CN';

    if (guideTab === 'reading') {
      if (lesson && lesson.sections) {
        lesson.sections.forEach((section, sIdx) => {
          const secEl = el('section', 'study-teaching reading-section');
          secEl.id = section.id;
          renderBi(secEl, 'h3', section.title, 'section-title');
          section.paragraphs.forEach(pBi => renderBi(secEl, 'p', pBi));
          if (section.tex) secEl.append(formula(section.tex));
          if (section.note) renderBi(secEl, 'p', section.note, 'study-symbol-note');
          contentEl.append(secEl);
        });
      }
      const review = el('details', 'study-recap');
      review.append(
        el('summary', '', t('Unit summary', '单元小结')),
        blockBi('Core concept', '核心概念', c.core),
        blockBi('Prerequisites', '先备知识', lesson.before),
        blockBi('Learning goals', '学习目标', lesson.goals),
        blockBi('Why it works', '为什么', c.why),
        formula(c.formula),
        blockBi('Symbols, units, and conditions', '符号、单位与适用条件', c.symbols)
      );
      contentEl.append(review);
      contentEl.append(blockBi('Common mistake', '常见错误', c.trap, 'study-block study-trap'));

      const footer = el('footer', 'lesson-footer study-actions');
      footer.append(button('Worked examples →', '查看例题 →', () => openGuide(c.id, 'examples'), 'filled btn'));
      contentEl.append(footer);
    } else if (guideTab === 'examples') {
      lesson.examples.forEach((example,i) => {
        const card = el('section','study-example');card.id=example.id;
        card.append(el('h3','example-title',t(`Example ${i+1}`,`例题 ${i+1}`)));
        renderBi(card,'p',example.prompt);
        const steps=el('ol','steps');
        example.steps.forEach(step=>{const li=el('li');renderBi(li,'p',step);steps.append(li);});
        card.append(steps);if(example.tex)card.append(formula(example.tex));contentEl.append(card);
      });

      const footer = el('footer', 'lesson-footer study-actions');
      footer.append(
        button('Practice checks →', '自测 →', () => openGuide(c.id, 'checks'), 'filled btn'),
        button('← Back to guide', '← 返回讲义', () => openGuide(c.id, 'reading'), 'btn textbutton')
      );
      contentEl.append(footer);
    } else if (guideTab === 'checks') {
      if (lesson && lesson.checks) {
        const checksSec = el('section', 'study-checks');
        lesson.checks.forEach((chk, i) => {
          const item = el('div', 'study-check');item.id=chk.id;
          const qWrap = el('div', 'study-check-question');
          renderBi(qWrap, 'p', chk.question, '', `${i + 1}. `);
          item.append(qWrap);

          const ans = el('details', 'study-check-answer');
          ans.append(el('summary', '', t('Show answer and reasoning', '查看答案与理由')));
          const aWrap = el('div', 'study-check-answer-body');
          renderBi(aWrap, 'p', chk.answer);
          ans.append(aWrap);
          item.append(ans);
          checksSec.append(item);
        });
        contentEl.append(checksSec);
      }

      const footer = el('footer', 'lesson-footer study-actions');
      footer.append(
        button('Practise book questions', '练习本书题目', () => openBook('unit'+c.id), 'filled btn'),
        button('← Back to examples', '← 查看例题', () => openGuide(c.id, 'examples'), 'btn textbutton')
      );
      contentEl.append(footer);
    }

    guide.append(contentEl);
    renderMath(contentEl);
    emphasise(contentEl);

    document.dispatchEvent(new CustomEvent('apchem:reader', {
      detail: { chapter: activeChapter, tab: guideTab }
    }));
  }
  guide.addEventListener('close',hideAllPopups);
  book.addEventListener('close',hideAllPopups);
  // Book data is optional, local and loaded only when requested.
  let bookLoad;
  function loadBook() {
    if (window.AP_BOOK_DATA) return Promise.resolve(window.AP_BOOK_DATA);
    if (!bookLoad) bookLoad=new Promise(resolve=>{const s=document.createElement('script');s.src=new URL('book-local/data.js',assets);
      s.onload=()=>resolve(window.AP_BOOK_DATA || null);s.onerror=()=>resolve(null);document.head.append(s);});
    return bookLoad;
  }
  let currentBookRequestId=0;
  let bookData, groupId='all', questionType='all', search='', wrongOnly=false, questionIndex=0;
  let history=read('apchem.bookHistory.v1',{});
  if (!history || typeof history !== 'object' || Array.isArray(history)) history={};
  let selected=null, revealed=false, written='', recorded=false;
  function resetAnswer() { selected=null;revealed=false;written='';recorded=false; }
  function filtered() {
    if (!bookData) return [];
    const unit=content.chapters.find(c=>'unit'+c.id===groupId);
    return bookData.groups.filter(g=>groupId==='all'||(unit ? unit.sourceChapters.includes(Number(g.id.replace('chapter',''))) : g.id===groupId)).flatMap(g=>g.questions.map(q=>({...q,group:g})))
      .filter(q=>(questionType==='all'||q.type===questionType)&&(!wrongOnly||history[q.id]?.correct===false)&&
        (!search||(q.stem+' '+q.group.title).toLowerCase().includes(search.toLowerCase())));
  }
  function bookHtml(html) {
    const div=el('div','book-html');
    // Data is produced by the allowlisting importer; also sanitise at the display boundary.
    const parsed=new DOMParser().parseFromString(html,'text/html');
    const allowed=new Set(['P','DIV','SPAN','B','STRONG','I','EM','U','SUB','SUP','BR','OL','UL','LI','TABLE','THEAD','TBODY','TR','TD','TH','FIGURE','FIGCAPTION','IMG','H3','H4','BLOCKQUOTE']);
    parsed.body.querySelectorAll('*').forEach(n=>{
      if (!allowed.has(n.tagName)) { n.remove();return; }
      for (const a of [...n.attributes]) if (!['src','alt','loading','class','start','rowspan','colspan'].includes(a.name)) n.removeAttribute(a.name);
      if (n.tagName==='IMG') {
        const src=n.getAttribute('src')||'';
        if (!/^__BOOK_ASSETS__\/[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(src)) n.remove();
        else n.src=new URL('book-local/images/'+src.split('/').pop(),assets).href;
      }
    });
    div.append(...parsed.body.childNodes);return div;
  }
  function record(q, correct, choice=null) {
    if (recorded) return;
    recorded=true;
    history[q.id]={correct,choice,at:Date.now()};save('apchem.bookHistory.v1',history);
    if (window.__answerStats) window.__answerStats(correct);
  }
  function renderBookShell() {
    hideAllPopups();
    book.replaceChildren();
    if (!isMaterial()) {
      book.append(header(book, t('Book practice · AP Chemistry Premium 2025', '书本题库 · AP Chemistry Premium 2025')));
    } else {
      const heading = el('div', 'reader-heading lesson-heading');
      const titleWrap = el('div');
      titleWrap.append(
        el('h1', '', t('Book practice', '书本题库')),
        el('p', 'subtext', 'AP Chemistry Premium 2025')
      );
      heading.append(titleWrap);
      book.append(heading);
    }
    const body=el('div','study-book-body'); book.append(body);
    if (!bookData) {
      body.append(el('p','study-source',t('Book practice is currently unavailable.','书本题库暂不可用。')));return;
    }
    body.append(el('p','study-source',t('Original English questions and explanations. Image-only options are preserved for manual review.','保留原书英文题目与解析；图片形式选项保留原样，供手动核对。')));
    const filters=el('div','book-filters');
    function selectControl(label,options,value,onChange) {
      const l=el('label','',label);const s=el('select');options.forEach(([v,title])=>{const o=el('option','',title);o.value=v;s.append(o);});
      s.value=value;s.addEventListener('change',()=>{onChange(s.value);questionIndex=0;resetAnswer();renderBookQuestion();});l.append(s);filters.append(l);
    }
    selectControl(t('Chapter or test','章节 / 测试'),[['all',t('All chapters and tests','全部章节与测试')],...content.chapters.map(c=>['unit'+c.id,t('Unit '+c.id+' · Related book chapters','单元 '+c.id+' · 相关原书章节')]),...bookData.groups.map(g=>[g.id,(g.kind==='chapter' ? String(Number(g.id.slice(7)))+'. ' : '')+g.title])],groupId,v=>groupId=v);
    selectControl(t('Type','题型'),[['all',t('All types','全部题型')],['mcq','MCQ'],['frq','FRQ']],questionType,v=>questionType=v);
    const l=el('label','',t('Search','搜索'));const input=el('input');input.type='search';input.value=search;input.placeholder=t('Search English question text','搜索英文题目');
    input.addEventListener('input',()=>{search=input.value;questionIndex=0;resetAnswer();renderBookQuestion();});l.append(input);filters.append(l);
    const wrong=el('label','book-wrong-filter');const cb=el('input');cb.type='checkbox';cb.checked=wrongOnly;
    cb.addEventListener('change',()=>{wrongOnly=cb.checked;questionIndex=0;resetAnswer();renderBookQuestion();});wrong.append(cb,document.createTextNode(t('Mistakes only','仅看错题')));filters.append(wrong);
    body.append(filters,el('div','book-progress'),el('div','book-question-host'));renderBookQuestion();
  }
  function renderBookQuestion() {
    const host=book.querySelector('.book-question-host');if(!host)return;
    const list=filtered();questionIndex=Math.min(questionIndex,Math.max(0,list.length-1));const q=list[questionIndex];
    host.replaceChildren();const progress=book.querySelector('.book-progress');
    const done=list.filter(x=>history[x.id]).length;progress.textContent=t(`${list.length} questions · ${done} attempted`,`${list.length} 题 · 已练习 ${done} 题`);
    if (!q) {host.append(el('p','',t('No questions match these filters.','当前筛选没有题目。')));return;}
    const nav=el('div','book-navigation');
    const move = delta => { questionIndex+=delta;resetAnswer();renderBookQuestion(); };
    const prev=button('← Previous','← 上一题',()=>move(-1));prev.disabled=questionIndex===0;
    const next=button('Next →','下一题 →',()=>move(1));next.disabled=questionIndex===list.length-1;
    nav.append(prev,el('span','',`${questionIndex+1} / ${list.length}`),next,
      button('Random','随机一题',()=>{questionIndex=Math.floor(Math.random()*list.length);resetAnswer();renderBookQuestion();}));host.append(nav);
    const article=el('article','book-question'); article.lang='en';
    article.append(el('p','study-eyebrow',`${q.group.title} · ${q.type.toUpperCase()} ${q.number}`));
    if(q.context){const context=el('details','book-context');context.open=true;context.append(el('summary','',t('Shared passage / data','共用题干 / 数据')),bookHtml(q.context));article.append(context);}
    article.append(bookHtml(q.stem));
    if (q.options.length) {
      const choices=el('fieldset','book-options');choices.append(el('legend','',t('Select one answer','选择一个答案')));
      q.options.forEach((html,i)=>{const label=el('label','book-option');const radio=el('input');radio.type='radio';radio.name='bookAnswer';radio.value=i;radio.checked=selected===i;
        radio.disabled=revealed;radio.addEventListener('change',()=>{selected=i;const submit=host.querySelector('.book-submit');if(submit)submit.disabled=false;});
        label.append(radio,el('b','',String.fromCharCode(65+i)),bookHtml(html));choices.append(label);});article.append(choices);
    }
    if(q.type==='frq') {
      const label=el('label','book-written',t('Your working (kept while viewing this question)','你的解题过程（当前题目内保留）'));
      const area=el('textarea');area.rows=6;area.value=written;area.addEventListener('input',()=>written=area.value);label.append(area);article.append(label);
    }
    if (!revealed) {
      const submit=button(q.answer!==null?'Check answer':'Show book explanation',q.answer!==null?'检查答案':'查看原书解析',()=>{
        if(q.answer!==null&&selected===null)return;revealed=true;
        if(q.answer!==null){const correct=selected===q.answer;record(q,correct,selected);if(wrongOnly&&correct)resetAnswer();}renderBookQuestion();},'btn book-submit');
      submit.disabled=q.answer!==null&&selected===null;article.append(submit);
    } else {
      const feedback=el('div','book-feedback');feedback.setAttribute('role','status');
      if(q.answer!==null)feedback.append(el('h3',selected===q.answer?'book-correct':'book-incorrect',selected===q.answer?t('Correct','回答正确'):t(`Correct answer: ${String.fromCharCode(65+q.answer)}`,`正确选项：${String.fromCharCode(65+q.answer)}`)));
      else feedback.append(el('p','',t('Compare with the source explanation and assess your work. This question is not auto-graded.','请对照原书解析自行判断；本题不自动判分。')));
      feedback.append(bookHtml(q.explanation || t('No source explanation was found.','没有找到对应的原书解析。')));
      if(q.answer===null) {
        const right=button('I got it right','我答对了',()=>{record(q,true);if(wrongOnly)resetAnswer();renderBookQuestion();progress.textContent=t('Recorded as correct','已记录为答对');});
        const review=button('Review later','加入错题',()=>{record(q,false);renderBookQuestion();progress.textContent=t('Saved for review','已加入书本错题');});
        right.disabled=review.disabled=recorded;
        feedback.append(right,review);
      }
      article.append(feedback);
    }
    const source=el('details','book-source-sheet');source.append(el('summary','',t('Open original question section to verify context','打开原书题目区核对上下文')),bookHtml(q.group.sheets[q.type]));article.append(source);
    host.append(article);renderMath(article);
  }
  function openBook(section = 'all') {
    const targetSection = section || 'all';
    if (isMaterial()) {
      document.dispatchEvent(new CustomEvent('apchem:navigate', {
        detail: { view: 'book', section: targetSection }
      }));
    } else {
      groupId = targetSection;
      questionIndex = 0; resetAnswer();
      book.replaceChildren(header(book, t('Book practice', '书本题库')), el('p', 'study-loading', t('Loading local book…', '正在加载本地题库…')));
      showDialog(book);
      loadBook().then(data => {
        bookData = data;
        renderBookShell();
      });
    }
  }
  async function showBook(section = 'all', isWrongOnly = false) {
    const reqId = ++currentBookRequestId;
    hideAllPopups();
    if (section) groupId = section;
    wrongOnly = Boolean(isWrongOnly);
    questionIndex = 0;
    resetAnswer();
    book.replaceChildren();
    if (!isMaterial()) {
      book.append(header(book, t('Book practice · AP Chemistry Premium 2025', '书本题库 · AP Chemistry Premium 2025')));
    } else {
      const heading = el('div', 'reader-heading lesson-heading');
      const titleWrap = el('div');
      titleWrap.append(
        el('h1', '', t('Book practice', '书本题库')),
        el('p', 'subtext', 'AP Chemistry Premium 2025')
      );
      heading.append(titleWrap);
      book.append(heading);
    }
    const loadingEl = el('p', 'study-loading', t('Loading local book…', '正在加载本地题库…'));
    book.append(loadingEl);
    const data = await loadBook();
    if (reqId !== currentBookRequestId) return;
    bookData = data;
    renderBookShell();
  }
  function closePopups() {
    hideAllPopups();
    currentBookRequestId++;
  }
  function renderLanguage() {
    hideAllPopups();
    document.documentElement.lang=language==='en'?'en':'zh-CN';
    if (languageSelect.parentElement) languageSelect.value=language;
    document.title=t('AP Chemistry · Bilingual Learning','AP Chemistry · 双语学习工具');
    translate(document.body);
    document.querySelectorAll('a[data-pane]').forEach(a=>{const topic=window.AP_TOPICS?.[a.dataset.pane];if(topic)a.textContent=t(topic[0],topic[1]);});
    guideButton.textContent=t('Study guide','双语讲解');bookButton.textContent=t('Book practice','书本题库');
    if (!isMaterial() && homeCard.parentElement) {
      homeCard.replaceChildren(el('div','study-eyebrow',t('UNDERSTAND · APPLY · REVIEW','理解 · 推导 · 练习')),
        el('h2','',t('Understand the chemistry behind the answer.','把原理讲清楚，再把题做明白。')),
        el('p','',t('Learn step by step across 9 bilingual chapters: foundations, explanations, two worked examples per chapter, and self-checks. Select English words for Chinese meanings.','从基础学起：9 章中英讲义，循序解释、每章两道分步例题与自测。英文重点词加粗，支持划词查中文。')),
        button('Explore the study guide','查看双语讲解',()=>openGuide()),button('Open book practice','进入书本题库',()=>openBook()));
    }
    if (bankLink.parentElement) {
      bankLink.replaceChildren(el('span','',t('Practice from your imported book:','练习已导入的书本题目：')),button('Book practice','书本题库',()=>openBook()));
    }
    paneHosts.forEach(({host,legacy,summary})=>{
      host.replaceChildren();delete host.dataset.language;
      legacy.open=isMaterial()||language==='zh';summary.textContent=t('Original interactive lab and detailed notes (Chinese labels)','原有互动实验与详细笔记');
    });
    renderActivePanes();
    // The formula sheet gains typeset equations with explicit units in both languages.
    const sheet=$('ftPaneFormula');
    if(sheet){let h=sheet.querySelector('.study-formulas');if(!h){h=el('div','study-formulas study-owned');sheet.prepend(h);}
      h.replaceChildren(el('h3','',t('Typeset formulas · symbols and units','LaTeX 公式 · 符号与单位')));
      content.chapters.forEach(c=>{const row=el('section','study-formula-row');row.append(el('h4','',text(c.title)),formula(c.formula),el('p','',text(c.symbols)));h.append(row);});renderMath(h);}
    if(isGuideVisible()){
      if(isMaterial())showGuide(activeChapter,guideTab);
      else renderGuide();
    }
    if(isBookVisible()){
      if(isMaterial())showBook(groupId,wrongOnly);
      else if(bookData)renderBookShell();
    }
  }
  function renderActivePanes(){
    paneHosts.forEach(({pane,host,ids,id})=>{
      if(!pane.classList.contains('on')||host.dataset.language===language)return;
      const topic=topicCard(id);host.replaceChildren(...(topic?[topic]:[]),...ids.map(chapter=>chapterCard(content.chapters.find(c=>c.id===chapter),true)));
      host.dataset.language=language;renderMath(host);emphasise(host);
    });
  }
  languageSelect.addEventListener('change',()=>{language=languageSelect.value;save('apchem.language',language);renderLanguage();});
  renderLanguage();
  const paneObserver=new MutationObserver(()=>{hideAllPopups();renderActivePanes();});
  paneHosts.forEach(({pane})=>paneObserver.observe(pane,{attributes:true,attributeFilter:['class']}));
  // Translate newly generated navigation text without observing the animation loops.
  const uiObserver=new MutationObserver(records=>{
    for(const r of records){translate(r.target);for(const n of r.addedNodes)if(n.nodeType===1&&!n.closest('.katex'))renderMath(n);}
  });
  ['learnDirectory','bankRanges','bankSession','crumb','lsTitle','lsMeta'].forEach(id=>{const n=$(id);if(n)uiObserver.observe(n,{childList:true,subtree:true});});
  if(window.__q?.renderQ){const render=window.__q.renderQ;window.__q.renderQ=function(container,...args){const out=render.call(this,container,...args);renderMath(container);return out;};}
  window.AP_LEARNING={
    translateTool,
    resetTranslationTool,
    openGuide,
    openBook,
    showGuide,
    showBook,
    closePopups,
    setLanguage(value){
      if(['zh','en'].includes(value)){
        language=value;
        save('apchem.language',value);
        renderLanguage();
        document.dispatchEvent(new CustomEvent('apchem:language'));
      }
    },
    setReadingLanguage,
    get activeChapter(){return activeChapter;},
    get guideTab(){return guideTab;},
    get readingLanguage(){return readingLanguage;},
    get language(){return language;}
  };
})();
