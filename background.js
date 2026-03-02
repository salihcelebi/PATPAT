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
