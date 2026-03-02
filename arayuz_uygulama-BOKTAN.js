/* =========================
FILE: arayuz_uygulama.js (REVİZYON YAMASI)
GEREKSİNİM: READY STATE KONTROLÜYLE INIT GARANTİ
GEREKSİNİM: EKSİK DOM ELEMANLARINDA KIRILMA YERİNE LOG + GÜVENLİ DEVAM
GEREKSİNİM: btnCopyMessage ve clipboard fallback için hata yönetimi
NOT: Orijinal dosyanın tamamını yeniden yazmıyorum; aşağıdaki ekleri dosyanın uygun yerlerine ekle.
========================= */

/* === [EK-1] initRefs sonuna ekle: kritik ref doğrulama ===
   GEREKSİNİM: “ID/SELECTOR uyuşmazlığı” anında tespit edilsin.
*/
function assertRefs() {
  const required = [
    'modeSelect','statusSelect','searchInput','pageLimitInput',
    'autoSendToggle','dryRunToggle',
    'btnStart','btnStop','btnExportCsv','btnExportJson',
    'ordersBody','ordersEmpty','tableTitle',
    'templateSelect','btnGenerateTemplate','btnSendMessage','btnCopyMessage','messagePreview','policyWarning',
    'logLevelFilter','logsBody','logsEmpty','btnRetry','btnManual',
  ];
  const missing = required.filter(id => !document.getElementById(id));
  if (missing.length) {
    // GEREKSİNİM: HATA YÖNETİMİ + SOMUT RAPOR
    LogManager?.addLog({ level: 'error', module: 'arayuz_uygulama', action: 'assertRefs', result: 'missing', error: missing.join(',') });
  }
}

/* === [EK-2] attachEvents içine: clipboard kopyalama için fallback ===
   GEREKSİNİM: clipboard başarısızsa textarea fallback.
*/
async function safeClipboardWrite(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    return { ok: true };
  } catch (e) {
    // fallback: DOM’da varsa göster ve seçilebilir yap
    const fb = document.getElementById('clipboardFallback');
    if (fb) {
      fb.classList.remove('hidden');
      fb.value = String(text || '');
      fb.focus();
      fb.select();
    }
    LogManager?.addLog({ level: 'warn', module: 'arayuz_uygulama', action: 'clipboard', result: 'fallback', error: e?.message || 'clipboard_fail' });
    return { ok: false };
  }
}

/* === [EK-3] init() içinde, initRefs sonrası assertRefs çağır ===
   GEREKSİNİM: init garanti + erken uyarı.
*/
function init() {
  initRefs();
  assertRefs();            // <-- EK
  attachEvents();
  renderOrdersTable();
  renderLogs();
}

/* === [EK-4] btnCopyMessage handler’ını şu şekilde değiştir ===
   GEREKSİNİM: HATA YÖNETİMİ + fallback.
*/
// refs.btnCopyMessage.addEventListener('click', async () => { ... });
refs.btnCopyMessage.addEventListener('click', async () => {
  const txt = refs.messagePreview.value;
  if (!txt) return;
  await safeClipboardWrite(txt);
});

/* === [EK-5] (Opsiyonel) statusSelect change event bubbling’e ihtiyaç varsa:
   GEREKSİNİM: PILL → SELECT tetiklemelerinde bubbling kullanılacak (ui_kablolama_fix zaten yapıyor).
   Burada ekstra bir şey yapmana gerek yok; sadece not.
*/