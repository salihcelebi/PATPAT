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



async function fetchHtmlFromMatchingTab(url) {
  const u = new URL(url);
  const origin = u.origin;

  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const active = activeTabs.find((t) => String(t.url || '').startsWith(origin));

  let tab = active;
  if (!tab) {
    const sameOriginTabs = await chrome.tabs.query({ url: `${origin}/*` });
    tab = sameOriginTabs[0];
  }

  if (!tab?.id) {
    throw new Error(`MATCHING_TAB_NOT_FOUND:${origin}`);
  }

  const response = await chrome.tabs.sendMessage(tab.id, { type: 'FETCH_HTML_IN_PAGE', url });
  if (!response?.ok) {
    throw new Error(response?.error || response?.code || 'FETCH_HTML_IN_PAGE_FAIL');
  }
  return response.html || '';
}

// Basit ping (UI'dan mesaj atarsan BG logları görebilirsin)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'PING_BG') {
      log('PING_BG from', sender?.url || sender?.id);
      sendResponse({ ok: true, ts: Date.now() });
      return;
    }

    if (msg?.type === 'FETCH_HTML_FROM_TAB') {
      try {
        const html = await fetchHtmlFromMatchingTab(String(msg.url || ''));
        sendResponse({ ok: true, html });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
      return;
    }
  })();

  return true;
});
