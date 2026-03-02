// content_script_hesap.js
// HESAP.COM.TR üzerinde çalışır: thread bulur, mesajları çeker, input'a yazar, send'e basar.
// GEREKSİNİM: "CONTENT SCRIPT (HESAP.COM.TR) THREAD BULSUN, INPUT’A YAZSIN, SEND’E BASSIN."
// GEREKSİNİM: "THREAD AÇILINCA SON N MESAJI DOM’DAN ÇEK; N DEĞERİNİ UI’DAN AYARLA."

// Content scripts ES module import desteği sınırlı olabileceği için MSG burada inline tanımlandı.
const MSG = Object.freeze({
  PING:"PING",
  STOP:"STOP",
  FIND_THREAD:"FIND_THREAD",
  MANUAL_THREAD_SELECT_START:"MANUAL_THREAD_SELECT_START",
  MANUAL_THREAD_SELECT_CANCEL:"MANUAL_THREAD_SELECT_CANCEL",
  MANUAL_THREAD_SELECTED:"MANUAL_THREAD_SELECTED",
  FETCH_MESSAGES:"FETCH_MESSAGES",
  SEND_MESSAGE:"SEND_MESSAGE",
  SET_MODE:"SET_MODE"
});

const csLog = (level, message, meta = {}) => {
  try {
    chrome.runtime.sendMessage({ type: "CS_LOG", level, message, meta, ts: new Date().toISOString() });
  } catch {}
};

let manualSelectMode = false;
let lastActiveThreadHint = null; // GEREKSİNİM: "SON AKTİF THREAD" fallback

const SELECTORS = {
  threadList: [
    '[data-testid="message-thread-list"]',
    '.message-thread-list',
    '.threads',
    'aside [role="list"]',
    'body'
  ],
  threadItem: [
    '[data-testid="thread-item"]',
    '.thread-item',
    '[role="listitem"]',
    'a[href*="mesaj"]',
    'a[href*="message"]'
  ],
  threadSearchInput: [
    'input[placeholder*="Ara"]',
    'input[type="search"]',
    'input[name*="search"]'
  ],
  messageList: [
    '[data-testid="message-list"]',
    '.message-list',
    '.messages',
    '[role="log"]',
    '[role="list"]'
  ],
  messageItem: [
    '[data-testid="message-item"]',
    '.message',
    '.message-item',
    '[role="listitem"]'
  ],
  messageInput: [
    'textarea',
    'div[contenteditable="true"]',
    'input[type="text"]'
  ],
  sendButton: [
    'button[type="submit"]',
    'button',
  ],
};

function qAny(selectors, root = document) {
  for (const s of selectors) {
    try {
      const el = root.querySelector(s);
      if (el) return el;
    } catch {}
  }
  return null;
}
function qAllAny(selectors, root = document) {
  for (const s of selectors) {
    try {
      const els = Array.from(root.querySelectorAll(s));
      if (els.length) return els;
    } catch {}
  }
  return [];
}
function normalizeText(t) { return String(t||"").replace(/\s+/g," ").trim().toLowerCase(); }
function extractIlanIdFromUrl(url) {
  try { const m = String(url||"").match(/\/ilan\/(\d+)/i); return m?m[1]:""; } catch { return ""; }
}
function findThreadCandidates() {
  const listRoot = qAny(SELECTORS.threadList) || document;
  return qAllAny(SELECTORS.threadItem, listRoot);
}
function getThreadText(el) { try { return normalizeText(el.innerText||el.textContent); } catch { return ""; } }
function getThreadHref(el) {
  try {
    if (el.tagName === "A") return el.href;
    const a = el.querySelector("a");
    return a?.href || "";
  } catch { return ""; }
}

async function findThread5Ways({ orderId, buyerUsername, ilanUrl, textHint }) {
  const candidates = findThreadCandidates();
  csLog("info","Thread candidates found",{count:candidates.length});

  // 1) ORDER ID
  if (orderId) {
    const key = normalizeText(orderId);
    const hit = candidates.find(el => getThreadText(el).includes(key));
    if (hit) return { ok:true, method:"ORDER_ID", threadEl:hit, href:getThreadHref(hit) };
  }
  // 2) BUYER USERNAME
  if (buyerUsername) {
    const key = normalizeText(buyerUsername);
    const hit = candidates.find(el => getThreadText(el).includes(key));
    if (hit) return { ok:true, method:"BUYER_USERNAME", threadEl:hit, href:getThreadHref(hit) };
  }
  // 3) İLAN ID/URL
  const ilanId = extractIlanIdFromUrl(ilanUrl);
  if (ilanId) {
    const key = normalizeText(ilanId);
    const hit = candidates.find(el => getThreadText(el).includes(key) || getThreadHref(el).includes(ilanId));
    if (hit) return { ok:true, method:"ILAN_ID", threadEl:hit, href:getThreadHref(hit) };
  }
  if (ilanUrl) {
    const key = normalizeText(ilanUrl);
    const hit = candidates.find(el => getThreadHref(el).toLowerCase().includes(key));
    if (hit) return { ok:true, method:"ILAN_URL", threadEl:hit, href:getThreadHref(hit) };
  }
  // 4) SON AKTİF THREAD
  if (lastActiveThreadHint) {
    const hit = candidates.find(el => getThreadHref(el) === lastActiveThreadHint);
    if (hit) return { ok:true, method:"LAST_ACTIVE", threadEl:hit, href:getThreadHref(hit) };
  }
  // 5) METİN İPUCU
  if (textHint) {
    const key = normalizeText(textHint);
    const hit = candidates.find(el => getThreadText(el).includes(key));
    if (hit) return { ok:true, method:"TEXT_HINT", threadEl:hit, href:getThreadHref(hit) };
  }

  // Otomatik arama (varsa)
  const searchInput = qAny(SELECTORS.threadSearchInput);
  if (searchInput && (orderId || buyerUsername || ilanId || textHint)) {
    const query = orderId || buyerUsername || ilanId || textHint;
    try {
      searchInput.focus();
      searchInput.value = query;
      searchInput.dispatchEvent(new Event("input",{bubbles:true}));
      await new Promise(r=>setTimeout(r,600));
      const after = findThreadCandidates();
      const key = normalizeText(query);
      const hit = after.find(el => getThreadText(el).includes(key));
      if (hit) return { ok:true, method:"AUTO_SEARCH", threadEl:hit, href:getThreadHref(hit) };
    } catch (e) {
      csLog("warn","Auto search failed",{error:String(e)});
    }
  }

  return { ok:false, method:"NOT_FOUND" };
}

function clickThread(threadEl){
  try{
    const a = threadEl.tagName==="A" ? threadEl : threadEl.querySelector("a");
    (a||threadEl).click();
    const href = getThreadHref(threadEl);
    if(href) lastActiveThreadHint = href;
    return true;
  } catch { return false; }
}

function parseMessagesFromDom(lastN=10){
  const list = qAny(SELECTORS.messageList) || document;
  const items = qAllAny(SELECTORS.messageItem, list);
  const sliced = items.slice(-Math.max(1,Number(lastN)||10));
  const messages = sliced.map(el=>{
    const text = (el.innerText||el.textContent||"").trim();
    const who = /satıcı|biz|you/i.test(text) ? "us" : "customer";
    const ts = new Date().toISOString();
    return { who, text, ts };
  }).filter(m=>m.text);
  return { count: messages.length, messages };
}

function setMessageInput(text){
  const input = qAny(SELECTORS.messageInput);
  if(!input) return { ok:false, reason:"INPUT_NOT_FOUND" };
  try{
    input.focus();
    if(input.tagName==="DIV" && input.isContentEditable){
      input.textContent = text;
      input.dispatchEvent(new InputEvent("input",{bubbles:true}));
    } else {
      input.value = text;
      input.dispatchEvent(new Event("input",{bubbles:true}));
    }
    return { ok:true };
  } catch(e){
    return { ok:false, reason:"INPUT_SET_FAIL", error:String(e) };
  }
}

function clickSendButton(){
  const btn = qAny(SELECTORS.sendButton);
  if(!btn) return { ok:false, reason:"SEND_BUTTON_NOT_FOUND" };
  try{ btn.click(); return { ok:true }; } catch(e){ return { ok:false, reason:"SEND_CLICK_FAIL", error:String(e) }; }
}

// Manual thread select: kullanıcı thread'e tıklayınca yakala → UI "seçildi ✓"
function onAnyClickCapture(e){
  if(!manualSelectMode) return;
  try{
    const t = e.target;
    const thread = t.closest && t.closest(SELECTORS.threadItem.join(","));
    if(thread){
      const href = getThreadHref(thread);
      if(href) lastActiveThreadHint = href;
      manualSelectMode = false;
      document.removeEventListener("click", onAnyClickCapture, true);
      chrome.runtime.sendMessage({ type: MSG.MANUAL_THREAD_SELECTED, payload:{ href: href||"", text:(thread.innerText||"").trim() } });
    }
  } catch {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
  (async ()=>{
    try{
      if(!msg||!msg.type) return;

      if(msg.type===MSG.PING){
        sendResponse({ ok:true, where:"content_script_hesap", url:location.href });
        return;
      }

      if(msg.type===MSG.MANUAL_THREAD_SELECT_START){
        manualSelectMode = true;
        document.addEventListener("click", onAnyClickCapture, true);
        sendResponse({ ok:true });
        return;
      }

      if(msg.type===MSG.MANUAL_THREAD_SELECT_CANCEL){
        manualSelectMode = false;
        document.removeEventListener("click", onAnyClickCapture, true);
        sendResponse({ ok:true });
        return;
      }

      if(msg.type===MSG.FIND_THREAD){
        const res = await findThread5Ways(msg.payload||{});
        if(res.ok){
          clickThread(res.threadEl);
          sendResponse({ ok:true, method:res.method, href:res.href||"" });
        } else {
          sendResponse({ ok:false, method:res.method });
        }
        return;
      }

      if(msg.type===MSG.FETCH_MESSAGES){
        const lastN = msg.payload?.lastN ?? 10;
        sendResponse({ ok:true, ...parseMessagesFromDom(lastN) });
        return;
      }

      if(msg.type===MSG.SEND_MESSAGE){
        const payload = msg.payload || {};
        const findRes = await findThread5Ways(payload);
        if(findRes.ok){
          clickThread(findRes.threadEl);
          await new Promise(r=>setTimeout(r,500));
        } else {
          sendResponse({ ok:false, reason:"THREAD_NOT_FOUND", method:findRes.method });
          return;
        }

        const setRes = setMessageInput(payload.messageText||"");
        if(!setRes.ok){
          sendResponse({ ok:false, reason:setRes.reason, error:setRes.error||"" });
          return;
        }

        const sendRes = clickSendButton();
        if(!sendRes.ok){
          sendResponse({ ok:false, reason:sendRes.reason, error:sendRes.error||"" });
          return;
        }

        sendResponse({ ok:true, method:findRes.method });
        return;
      }
    } catch(e){
      sendResponse({ ok:false, reason:"CS_EXCEPTION", error:String(e) });
    }
  })();
  return true;
});
