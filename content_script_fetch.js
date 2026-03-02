// content_script_fetch.js
// Sayfa context'inde cookie ile HTML çekip extension tarafına geri döner.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || msg.type !== 'FETCH_HTML_IN_PAGE') return;
      const url = String(msg.url || '');
      if (!url) {
        sendResponse({ ok: false, code: 'BAD_URL', error: 'URL boş' });
        return;
      }

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      const html = await res.text();
      sendResponse({ ok: res.ok, status: res.status, url, html });
    } catch (e) {
      sendResponse({ ok: false, code: 'FETCH_FAIL', error: String(e?.message || e) });
    }
  })();

  return true;
});
