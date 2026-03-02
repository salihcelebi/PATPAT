// background.js
// İkona tıklanınca Side Panel'i otomatik açar + hata yakalama logları ekler.

const log = (...args) => console.log("[PATPAT BG]", ...args);
const logErr = (...args) => console.error("[PATPAT BG]", ...args);

// Service Worker seviyesinde yakalanmayan hataları logla
self.addEventListener("error", (event) => {
  logErr("Unhandled error:", event?.message || event);
});

self.addEventListener("unhandledrejection", (event) => {
  logErr("Unhandled rejection:", event?.reason || event);
});

async function enableSidePanelOnClick() {
  try {
    if (!chrome?.sidePanel?.setPanelBehavior) {
      logErr("chrome.sidePanel API yok. Chrome sürümünüz 114+ olmalı.");
      return;
    }
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    log("Side panel behavior enabled: openPanelOnActionClick=true");
  } catch (e) {
    logErr("sidePanel.setPanelBehavior error:", e);
  }
}

async function ensureSidePanelPath() {
  try {
    if (!chrome?.sidePanel?.setOptions) return;
    await chrome.sidePanel.setOptions({ path: "arayuz.html", enabled: true });
    log("Side panel options set: arayuz.html enabled");
  } catch (e) {
    logErr("sidePanel.setOptions error:", e);
  }
}

// Yükleme/yenileme anında da uygula
chrome.runtime.onInstalled.addListener(async (details) => {
  log("onInstalled:", details?.reason);
  await enableSidePanelOnClick();
  await ensureSidePanelPath();
});

// Worker yeniden uyanınca da davranış tekrar set edilsin
enableSidePanelOnClick().then(ensureSidePanelPath);

// Basit ping (UI'dan mesaj atarsan BG logları görebilirsin)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PING_BG") {
    log("PING_BG from", sender?.url || sender?.id);
    sendResponse({ ok: true, ts: Date.now() });
    return true;
  }
});


// FIX6_MESSAGE_PIPELINE
// GEREKSİNİM 1.2: BACKGROUND doğru tab'ı bulsun/açsın/odaklasın.
// GEREKSİNİM 1.4: UI↔Content Script haberleşmesini standardize et (forward).
// GEREKSİNİM 3.3: Rate limit ile spam/IP ban riskini azalt; STOP ile durdur.
// GEREKSİNİM 3.4/3.5: Humanize/Bot modu + 1–10 hız ayarı.

const FIX6 = {
  queue: [],
  running: false,
  stopFlag: false,
  mode: { kind: "humanize", speedX: 3 },
  lastStatus: { running: false, done: 0, total: 0, lastError: "" }
};

function fix6Now(){ return new Date().toISOString(); }

function fix6DelayMs(){
  if(FIX6.mode.kind === "humanize"){
    const min=600, max=1800;
    return Math.floor(min + Math.random()*(max-min));
  }
  const base=1200;
  const x = Math.min(10, Math.max(1, Number(FIX6.mode.speedX)||1));
  const ms = Math.floor(base / x);
  return Math.min(2500, Math.max(160, ms));
}

function fix6Sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function fix6FindOrOpenHesapTab(urlHint){
  const tabs = await chrome.tabs.query({ url: ["https://hesap.com.tr/*"] });
  if(tabs && tabs.length){
    const tab=tabs[0];
    await chrome.tabs.update(tab.id, { active:true });
    await chrome.windows.update(tab.windowId, { focused:true });
    return tab;
  }
  const url = urlHint || "https://hesap.com.tr/";
  return await chrome.tabs.create({ url, active:true });
}

async function fix6SendToContent(tabId, message){
  try{
    return await chrome.tabs.sendMessage(tabId, message);
  } catch(e){
    console.error("[PATPAT BG][FIX6] sendMessage retry:", e);
    await fix6Sleep(800);
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

async function fix6ProcessQueue(){
  if(FIX6.running) return;
  FIX6.running=true;
  FIX6.stopFlag=false;
  FIX6.lastStatus = { running:true, done:0, total: FIX6.queue.length, lastError:"" };

  while(FIX6.queue.length && !FIX6.stopFlag){
    const job = FIX6.queue.shift();
    FIX6.lastStatus.total = FIX6.lastStatus.done + FIX6.queue.length + 1;

    try{
      const tab = await fix6FindOrOpenHesapTab(job?.payload?.targetUrl);
      await fix6Sleep(fix6DelayMs());

      const res = await fix6SendToContent(tab.id, job);
      FIX6.lastStatus.done += 1;

      chrome.runtime.sendMessage({
        type:"QUEUE_EVENT", ts: fix6Now(), event:"job_done", job, res
      }).catch(()=>{});

      await fix6Sleep(fix6DelayMs());
    } catch(e){
      FIX6.lastStatus.lastError = String(e);
      chrome.runtime.sendMessage({
        type:"QUEUE_EVENT", ts: fix6Now(), event:"job_error", job, error:String(e)
      }).catch(()=>{});
      await fix6Sleep(1500);
    }
  }

  FIX6.running=false;
  FIX6.lastStatus.running=false;
  chrome.runtime.sendMessage({
    type:"QUEUE_EVENT", ts: fix6Now(), event:"queue_done", status: FIX6.lastStatus
  }).catch(()=>{});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
  (async ()=>{
    try{
      if(!msg || !msg.type) return;

      // Content script'ten UI'a direkt iletilecek mesaj (THREAD SEÇİLDİ ✓)
      if(msg.type === "MANUAL_THREAD_SELECTED"){
        // UI dinliyor; burada sadece geçiriyoruz.
        chrome.runtime.sendMessage(msg).catch(()=>{});
        sendResponse({ ok:true });
        return;
      }

      if(msg.type === "CS_LOG"){
        chrome.runtime.sendMessage(msg).catch(()=>{});
        sendResponse({ ok:true });
        return;
      }

      if(msg.type === "FIX6_SET_MODE"){
        FIX6.mode = { kind: msg.kind || "humanize", speedX: msg.speedX || 1 };
        sendResponse({ ok:true, mode: FIX6.mode });
        return;
      }

      if(msg.type === "FIX6_QUEUE_START"){
        const jobs = Array.isArray(msg.jobs) ? msg.jobs : [];
        FIX6.queue.push(...jobs);
        sendResponse({ ok:true, queued: FIX6.queue.length });
        fix6ProcessQueue();
        return;
      }

      if(msg.type === "FIX6_QUEUE_STOP"){
        FIX6.stopFlag=true;
        sendResponse({ ok:true });
        return;
      }

      if(msg.type === "FIX6_SINGLE_SEND"){
        const tab = await fix6FindOrOpenHesapTab(msg?.payload?.targetUrl);
        await fix6Sleep(fix6DelayMs());
        const res = await fix6SendToContent(tab.id, msg.forward);
        sendResponse({ ok:true, res });
        return;
      }

      if(msg.type === "FIX6_MANUAL_THREAD_SELECT_START"){
        const tab = await fix6FindOrOpenHesapTab(msg?.payload?.targetUrl);
        const res = await fix6SendToContent(tab.id, { type:"MANUAL_THREAD_SELECT_START" });
        sendResponse({ ok:true, res });
        return;
      }

      if(msg.type === "FIX6_FETCH_MESSAGES"){
        const tab = await fix6FindOrOpenHesapTab(msg?.payload?.targetUrl);
        const res = await fix6SendToContent(tab.id, { type:"FETCH_MESSAGES", payload: msg.payload });
        sendResponse({ ok:true, res });
        return;
      }

    } catch(e){
      sendResponse({ ok:false, error:String(e) });
    }
  })();
  return true;
});


// FIX7_OPEN_THREAD
// GEREKSİNİM: "GÖNDER'E BASINCA İLGİLİ MÜŞTERİ İLE MESAJLAŞMA ALANINA GEÇ."
// Background: hesap.com.tr sekmesini açar/odaklar ve content script ile thread bulmayı dener.

async function ekFindOrOpenHesapTab(){
  const tabs = await chrome.tabs.query({ url: ["https://hesap.com.tr/*"] });
  if(tabs && tabs.length){
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active:true });
    await chrome.windows.update(tab.windowId, { focused:true });
    return tab;
  }
  return await chrome.tabs.create({ url: "https://hesap.com.tr/", active:true });
}

async function ekSendToContent(tabId, msg){
  try { return await chrome.tabs.sendMessage(tabId, msg); }
  catch(e){ await new Promise(r=>setTimeout(r,800)); return await chrome.tabs.sendMessage(tabId, msg); }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async ()=>{
    try{
      if(msg?.type !== "FIX7_OPEN_THREAD") return;
      const tab = await ekFindOrOpenHesapTab();
      const payload = msg.payload || {};
      const res = await ekSendToContent(tab.id, { type:"FIND_THREAD", payload: {
        orderId: payload.orderId || "",
        buyerUsername: payload.buyerUsername || "",
        ilanUrl: payload.ilanUrl || "",
        textHint: payload.buyerUsername || payload.orderId || ""
      }});
      sendResponse({ ok: true, ...(res||{}), method: (res && res.ok) ? res.method : "NOT_FOUND" });
    }catch(e){
      sendResponse({ ok:false, error:String(e) });
    }
  })();
  return true;
});
