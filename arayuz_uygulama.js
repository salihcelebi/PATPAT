/*
 * arayuz_uygulama.js
 * UI katmanı ve genel uygulama durum yönetimi. Bu modül, HTML arayüz
 * elemanlarını seçer, kullanıcı etkileşimlerini dinler, kazıyıcıları
 * çalıştırır, eşleştirme ve mesaj üretme fonksiyonlarını çağırır ve
 * sonuçları tabloya ve loglara yansıtır. Tek yönlü veri akışı
 * kullanarak state güncellemeleri yönetilir.
 */

import { taraHesap, parseHesapOrdersFromHtml } from './kaziyici_hesap_com_tr.js';
import { taraAnabayiniz } from './kaziyici_anabayiniz_com.js';
import { matchOrderAndSmm, generateMessage, checkPolicy } from './eslestirme_ve_sablonlar.js';
import { sendMessage } from './mesaj_gonderici.js';
import { recordStore, LogManager } from './kayit_ve_loglama.js';

// Uygulama durumu
const state = {
  mode: 'analysis',
  statusFilters: ['pending','processing','completed','cancelled','returnprocess','problematic'],
  searchQuery: '',
  pageLimit: 0,
  autoSend: false,
  dryRun: true,
  isRunning: false,
  abortController: null,
};

// FIX5: tarama durumu (gerçek zamanlı UI)
const scanUI = {
  running: false,
  startedAt: 0,
  processedTargets: 0,
  totalTargets: 0,
  doneSet: new Set(),
  failures: [], // {kind, source_url, status, page_no, smm_id, code, message}
};

function formatEta(ms) {
  if (!isFinite(ms) || ms <= 0) return '-';
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}dk ${r}sn` : `${r}sn`;
}

function setScanBadge(text, level = 'info') {
  if (!refs.scanStateBadge) return;
  refs.scanStateBadge.textContent = text;
  refs.scanStateBadge.style.borderColor =
    level === 'error' ? 'rgba(207,47,56,0.9)' :
    level === 'warn' ? 'rgba(224,168,0,0.9)' :
    'rgba(255,255,255,0.18)';
}

function updateScanUI() {
  if (!refs.scanStatus) return;
  if (scanUI.running) refs.scanStatus.classList.remove('hidden');
  const pct = scanUI.totalTargets ? Math.min(100, Math.round((scanUI.processedTargets / scanUI.totalTargets) * 100)) : 0;
  if (refs.scanProgressFill) refs.scanProgressFill.style.width = `${pct}%`;
  if (refs.scanPercent) refs.scanPercent.textContent = `${pct}%`;
  if (refs.scanCount) refs.scanCount.textContent = String(scanUI.processedTargets);
  if (refs.scanTotal) refs.scanTotal.textContent = String(scanUI.totalTargets);
  const elapsed = Date.now() - scanUI.startedAt;
  const avg = scanUI.processedTargets > 0 ? elapsed / scanUI.processedTargets : 0;
  const remaining = scanUI.totalTargets - scanUI.processedTargets;
  if (refs.scanEta) refs.scanEta.textContent = scanUI.running ? `ETA: ${formatEta(avg * remaining)}` : '-';

  // failures render
  if (refs.scanFailures) {
    if (!scanUI.failures.length) {
      refs.scanFailures.classList.add('hidden');
      refs.scanFailures.innerHTML = '';
    } else {
      refs.scanFailures.classList.remove('hidden');
      refs.scanFailures.innerHTML = '<div style="font-size:12px;color:var(--muted-color);">Başarısız sayfalar</div>' + scanUI.failures.map((f, i) => {
        const u = f.source_url || '';
        const why = `${f.code || 'HATA'}: ${f.message || ''}`;
        return `<div class="scan-failure-item" data-idx="${i}">
          <div class="scan-failure-text"><strong>${f.kind === 'smm' ? 'SMM' : 'HESAP'}</strong> — ${u}<br/><span style="color:var(--muted-color)">${why}</span></div>
          <div class="scan-failure-actions">
            <button type="button" class="btnRetryFail">Tekrar Dene</button>
            <button type="button" class="btnSkipFail">Atla</button>
          </div>
        </div>`;
      }).join('');
    }
  }
}

// DOM referansları
const refs = {};
function initRefs() {
  refs.modeSelect = document.getElementById('modeSelect');
  refs.statusSelect = document.getElementById('statusSelect');
  refs.searchInput = document.getElementById('searchInput');
  refs.pageLimitInput = document.getElementById('pageLimitInput');
  refs.autoSendToggle = document.getElementById('autoSendToggle');
  refs.dryRunToggle = document.getElementById('dryRunToggle');
  refs.btnStart = document.getElementById('btnStart');
  refs.btnStop = document.getElementById('btnStop');
  refs.btnExportCsv = document.getElementById('btnExportCsv');
  refs.btnExportJson = document.getElementById('btnExportJson');
  // FIX5 scan UI refs
  refs.scanStatus = document.getElementById('scanStatus');
  refs.scanStateBadge = document.getElementById('scanStateBadge');
  refs.scanCurrentUrl = document.getElementById('scanCurrentUrl');
  refs.scanProgressFill = document.getElementById('scanProgressFill');
  refs.scanCount = document.getElementById('scanCount');
  refs.scanTotal = document.getElementById('scanTotal');
  refs.scanPercent = document.getElementById('scanPercent');
  refs.scanEta = document.getElementById('scanEta');
  refs.scanSummary = document.getElementById('scanSummary');
  refs.scanFailures = document.getElementById('scanFailures');
  refs.ordersBody = document.getElementById('ordersBody');
  refs.ordersEmpty = document.getElementById('ordersEmpty');
  refs.tableTitle = document.getElementById('tableTitle');
  refs.templateSelect = document.getElementById('templateSelect');
  refs.btnGenerateTemplate = document.getElementById('btnGenerateTemplate');
  refs.btnSendMessage = document.getElementById('btnSendMessage');
  refs.btnCopyMessage = document.getElementById('btnCopyMessage');
  refs.messagePreview = document.getElementById('messagePreview');
  refs.policyWarning = document.getElementById('policyWarning');
  refs.smmDetails = {
    order_id: document.getElementById('smm_order_id'),
    date: document.getElementById('smm_date'),
    link: document.getElementById('smm_link'),
    start: document.getElementById('smm_start'),
    quantity: document.getElementById('smm_quantity'),
    service: document.getElementById('smm_service'),
    status: document.getElementById('smm_status'),
    remains: document.getElementById('smm_remains'),
  };
  refs.logSearchInput = document.getElementById('logSearchInput');
  refs.logLevelFilter = document.getElementById('logLevelFilter');
  refs.btnCopyAllLogs = document.getElementById('btnCopyAllLogs');
  refs.btnCopySelectedLogs = document.getElementById('btnCopySelectedLogs');
  refs.btnExportLogs = document.getElementById('btnExportLogs');
  refs.btnClearLogs = document.getElementById('btnClearLogs');
  refs.clipboardFallback = document.getElementById('clipboardFallback');
  refs.logsBody = document.getElementById('logsBody');
  refs.logsEmpty = document.getElementById('logsEmpty');
  refs.btnRetry = document.getElementById('btnRetry');
  refs.btnManual = document.getElementById('btnManual');
}

// UI state güncelleme fonksiyonları
function updateTableTitle(visibleCount = null) {
  const total = recordStore.orders.size;
  if (visibleCount === null || visibleCount === total) {
    refs.tableTitle.textContent = `Toplam ${total} satır.`;
  } else {
    refs.tableTitle.textContent = `Toplam ${total} satır. (Görünen: ${visibleCount})`;
  }
}

// FIX5_ROW_MATCH: arama kutusu tabloyu filtrelesin
function rowMatchesQuery(row, q) {
  if (!q) return true;
  const qq = q.toLowerCase();
  const hay = [
    row.order_id,
    row.status,
    row.ilan_url,
    row.buyer_username,
    row.smm_id,
    row.message_url
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(qq);
}

function renderOrdersTable() {
  const allRows = recordStore.toArray('orders');
  const q = (state.searchQuery || '').trim();
  const rows = q ? allRows.filter(r => rowMatchesQuery(r, q)) : allRows;
  refs.ordersBody.innerHTML = '';
  if (!rows.length) {
    refs.ordersEmpty.style.display = 'block';
  } else {
    refs.ordersEmpty.style.display = 'none';
  }
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.orderId = row.order_id;
    // Sipariş ID
    const tdId = document.createElement('td');
    tdId.textContent = row.order_id;
    tr.appendChild(tdId);
    // Durum
    const tdStatus = document.createElement('td');
    tdStatus.textContent = row.status;
    tr.appendChild(tdStatus);
    // İlan URL
    const tdUrl = document.createElement('td');
    if (row.ilan_url) {
      const a = document.createElement('a');
      a.href = row.ilan_url;
      a.target = '_blank';
      a.textContent = row.ilan_url;
      tdUrl.appendChild(a);
    } else {
      tdUrl.textContent = '';
    }
    tr.appendChild(tdUrl);
    // Müşteri
    const tdBuyer = document.createElement('td');
    tdBuyer.textContent = row.buyer_username || '';
    tr.appendChild(tdBuyer);
    // SMM ID
    const tdSmm = document.createElement('td');
    tdSmm.textContent = row.smm_id || '';
    tr.appendChild(tdSmm);
    // Mesaj yolu
    const tdMsg = document.createElement('td');
    if (row.message_url) {
      const a2 = document.createElement('a');
      a2.href = row.message_url;
      a2.target = '_blank';
      a2.textContent = row.message_url;
      tdMsg.appendChild(a2);
    } else {
      tdMsg.textContent = '';
    }
    tr.appendChild(tdMsg);
    // click event for selection
    tr.addEventListener('click', () => selectOrderRow(row.order_id));
    refs.ordersBody.appendChild(tr);
  });
  updateTableTitle(rows.length);
}

// Seçili satır state
let selectedOrderId = null;
function selectOrderRow(orderId) {
  selectedOrderId = orderId;
  // highlight row
  Array.from(refs.ordersBody.children).forEach(tr => {
    tr.classList.toggle('selected', tr.dataset.orderId === String(orderId));
  });
  // smm detayını bul
  const orderRow = recordStore.orders.get(String(orderId));
  const smmRow = orderRow?.smm_id ? recordStore.smmOrders.get(String(orderRow.smm_id)) : null;
  fillSmmDetails(orderRow, smmRow);
  // mesajı otomatik üret
  const type = refs.templateSelect.value;
  const message = smmRow ? generateMessage(orderRow, smmRow, type) : '';
  updateMessagePreview(message);
}

function fillSmmDetails(orderRow, smmRow) {
  const d = refs.smmDetails;
  d.order_id.textContent = smmRow?.order_id || '-';
  d.date.textContent = smmRow?.date || '-';
  d.link.href = smmRow?.order_link || '#';
  d.link.textContent = smmRow?.order_link || '-';
  d.start.textContent = smmRow?.start_count ?? '-';
  d.quantity.textContent = smmRow?.quantity ?? '-';
  d.service.textContent = smmRow?.service_full || '-';
  d.status.textContent = smmRow?.status || '-';
  d.remains.textContent = smmRow?.remains ?? '-';
}

function updateMessagePreview(text) {
  refs.messagePreview.value = text || '';
  const policyOk = checkPolicy(text);
  refs.policyWarning.classList.toggle('hidden', policyOk);
  refs.btnSendMessage.disabled = !policyOk || state.dryRun;
  refs.btnCopyMessage.disabled = !text;
}

// Log panel render
function renderLogs() {
  const level = refs.logLevelFilter?.value || '';
  const search = refs.logSearchInput?.value?.trim?.() || '';
  const logs = LogManager.getLogs({ level, search });
  refs.logsBody.innerHTML = '';
  if (!logs.length) {
    refs.logsEmpty.style.display = 'block';
  } else {
    refs.logsEmpty.style.display = 'none';
  }
  logs.forEach(log => {
    const tr = document.createElement('tr');
    // seçim kutusu
    const tdSel = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'log-select';
    cb.dataset.logId = log.id || '';
    tdSel.appendChild(cb);
    tr.appendChild(tdSel);

    ['ts','level','module','action','result','error'].forEach(key => {
      const td = document.createElement('td');
      td.textContent = log[key] || '';
      tr.appendChild(td);
    });
    refs.logsBody.appendChild(tr);
  });
}

// Export fonksiyonları
function exportCsv() {
  const rows = recordStore.toArray('orders');
  const header = ['order_id','status','ilan_url','buyer_username','smm_id','message_url'];
  const lines = [header.join(',')];
  rows.forEach(row => {
    const values = header.map(h => {
      const v = row[h] ?? '';
      return `"${String(v).replace(/"/g, '""')}"`;
    });
    lines.push(values.join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'orders.csv';
  a.click();
  URL.revokeObjectURL(url);
}
function exportJsonl() {
  const rows = recordStore.toArray('orders');
  const jsonl = rows.map(row => JSON.stringify(row)).join('\n');
  const blob = new Blob([jsonl], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'orders.jsonl';
  a.click();
  URL.revokeObjectURL(url);
}

// Event bağlamaları
// FIX5_LOG_COPY: log kopyalama/temizleme/dışa aktarma yardımcıları
async function copyToClipboard(text) {
  const t = String(text || '');
  try {
    await navigator.clipboard.writeText(t);
    alert('TÜM LOGLAR KOPYALANDI');
    if (refs.clipboardFallback) refs.clipboardFallback.classList.add('hidden');
    return true;
  } catch (e) {
    const msg = e?.message || String(e);
    alert('Kopyalama başarısız: ' + msg);
    if (refs.clipboardFallback) {
      refs.clipboardFallback.value = t;
      refs.clipboardFallback.classList.remove('hidden');
      refs.clipboardFallback.focus();
      refs.clipboardFallback.select();
    }
    return false;
  }
}

function getSelectedLogIds() {
  return Array.from(refs.logsBody.querySelectorAll('input.log-select:checked'))
    .map(cb => cb.dataset.logId)
    .filter(Boolean);
}

function downloadTextFile(filename, content) {
  const blob = new Blob([String(content || '')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

// FIX5: başarısız sayfayı tekrar dene
async function retryFailure(f) {
  if (!f) return;
  if (f.kind === 'smm') {
    const smmId = f.smm_id;
    const { orders } = await taraAnabayiniz({ smmIds: [smmId] });
    orders.forEach(o => recordStore.upsertSmmOrder(o));
    LogManager.addLog({ level: 'info', module: 'scan', action: 'retry_smm', result: 'ok', message: String(smmId) });
    renderLogs();
    return;
  }

  // hesap: url tekrar çek -> parse -> tabloya ekle
  const url = f.source_url;
  if (!url) return;
  const res = await fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const html = await res.text();
  let rows = parseHesapOrdersFromHtml(html, { status: f.status, source_url: url, page_no: f.page_no });
  const q = (state.searchQuery || '').trim();
  if (q) rows = rows.filter(r => rowMatchesQuery(r, q));
  rows.forEach(o => recordStore.upsertOrder(o));
  renderOrdersTable();
  LogManager.addLog({ level: 'info', module: 'scan', action: 'retry_hesap', result: `rows:${rows.length}`, message: url });
  renderLogs();
}

function attachEvents() {
  refs.modeSelect.addEventListener('change', () => {
    state.mode = refs.modeSelect.value;
  });
  refs.statusSelect.addEventListener('change', () => {
    const selected = Array.from(refs.statusSelect.selectedOptions).map(o => o.value);
    state.statusFilters = selected;
  });
  refs.searchInput.addEventListener('input', () => {
    state.searchQuery = refs.searchInput.value.trim();
    renderOrdersTable();
  });
  refs.pageLimitInput.addEventListener('input', () => {
    const v = parseInt(refs.pageLimitInput.value, 10);
    state.pageLimit = isNaN(v) ? 0 : Math.max(0, v);
  });
  refs.autoSendToggle.addEventListener('change', () => {
    state.autoSend = refs.autoSendToggle.checked;
  });
  refs.dryRunToggle.addEventListener('change', () => {
    state.dryRun = refs.dryRunToggle.checked;
    // Güncel dryRun state ile butonları güncelle
    updateMessagePreview(refs.messagePreview.value);
  });
  refs.btnStart.addEventListener('click', startScan);
  refs.btnStop.addEventListener('click', stopScan);
  refs.btnExportCsv.addEventListener('click', exportCsv);
  refs.btnExportJson.addEventListener('click', exportJsonl);
  refs.templateSelect.addEventListener('change', () => {
    // şablon tipi değiştiğinde mesajı yeniden üret
    if (selectedOrderId) {
      const orderRow = recordStore.orders.get(String(selectedOrderId));
      const smmRow = orderRow?.smm_id ? recordStore.smmOrders.get(String(orderRow.smm_id)) : null;
      const message = smmRow ? generateMessage(orderRow, smmRow, refs.templateSelect.value) : '';
      updateMessagePreview(message);
    }
  });
  refs.btnGenerateTemplate.addEventListener('click', () => {
    if (selectedOrderId) {
      const orderRow = recordStore.orders.get(String(selectedOrderId));
      const smmRow = orderRow?.smm_id ? recordStore.smmOrders.get(String(orderRow.smm_id)) : null;
      const message = smmRow ? generateMessage(orderRow, smmRow, refs.templateSelect.value) : '';
      updateMessagePreview(message);
    }
  });
  refs.btnSendMessage.addEventListener('click', async () => {
    if (selectedOrderId) {
      const orderRow = recordStore.orders.get(String(selectedOrderId));
      const message = refs.messagePreview.value;
      const result = await sendMessage({ buyerUsername: orderRow?.buyer_username, orderId: orderRow?.order_id, messageText: message, dryRun: state.dryRun });
      LogManager.addLog({ level: result === 'ERROR' ? 'error' : 'info', module: 'ui', action: 'sendMessage', result });
      renderLogs();
    }
  });
  refs.btnCopyMessage.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(refs.messagePreview.value);
    } catch {
      // ignore
    }
  });
  refs.logLevelFilter.addEventListener('change', renderLogs);
  if (refs.logSearchInput) refs.logSearchInput.addEventListener('input', renderLogs);

  // log araçları
  if (refs.btnCopyAllLogs) refs.btnCopyAllLogs.addEventListener('click', async () => {
    const level = refs.logLevelFilter?.value || '';
    const search = refs.logSearchInput?.value?.trim?.() || '';
    const text = LogManager.exportText({ level, search });
    await copyToClipboard(text);
  });
  if (refs.btnCopySelectedLogs) refs.btnCopySelectedLogs.addEventListener('click', async () => {
    const ids = new Set(getSelectedLogIds());
    const level = refs.logLevelFilter?.value || '';
    const search = refs.logSearchInput?.value?.trim?.() || '';
    const logs = LogManager.getLogs({ level, search }).filter(l => ids.has(l.id));
    const text = logs.map(l => `${l.ts} ${l.level.toUpperCase()} ${l.page} ${l.module}.${l.action} ${l.file}:${l.line}:${l.col} ${l.message || l.result || ''} ${l.error ? (' | ' + l.error) : ''}`.trim()).join('\n');
    await copyToClipboard(text);
  });
  if (refs.btnExportLogs) refs.btnExportLogs.addEventListener('click', () => {
    const level = refs.logLevelFilter?.value || '';
    const search = refs.logSearchInput?.value?.trim?.() || '';
    const jsonl = LogManager.exportJsonl({ level, search });
    downloadTextFile(`patpat_logs_${Date.now()}.jsonl`, jsonl);
  });
  if (refs.btnClearLogs) refs.btnClearLogs.addEventListener('click', () => {
    if (!confirm('Loglar temizlensin mi?')) return;
    LogManager.clear();
    renderLogs();
  });
  refs.btnRetry.addEventListener('click', () => {
    // retry son hatalı kayıt; stub
    LogManager.addLog({ level: 'info', module: 'ui', action: 'retry', result: 'clicked' });
    renderLogs();
  });
  refs.btnManual.addEventListener('click', () => {
    // manual handoff; stub
    LogManager.addLog({ level: 'info', module: 'ui', action: 'manual', result: 'clicked' });
    renderLogs();
  });
}

// Taramayı başlat
async function startScan() {
  if (state.isRunning) return;
  state.isRunning = true;
  refs.btnStart.disabled = true;
  refs.btnStop.disabled = false;
  state.abortController = new AbortController();
  LogManager.addLog({ level: 'info', module: 'ui', action: 'start', result: 'start' });
  renderLogs();
  // temizle mevcut veriler
  recordStore.orders.clear();
  recordStore.smmOrders.clear();
  renderOrdersTable();
  // Hesap tarama
  const { orders, errors } = await taraHesap({ mode: state.mode, statusFilters: state.statusFilters, pageLimit: state.pageLimit, searchQuery: state.searchQuery, abortSignal: state.abortController.signal, onProgress: progress => {
    // scan UI güncelle
    if (progress?.source_url && refs.scanCurrentUrl) refs.scanCurrentUrl.textContent = progress.source_url;
    if (progress?.stage === 'parsed' || progress?.stage === 'error') {
      const key = `${progress.status || ''}:${progress.page_no || ''}`;
      if (!scanUI.doneSet.has(key)) {
        scanUI.doneSet.add(key);
        scanUI.processedTargets += 1;
      }
      if (progress?.stage === 'error') {
        scanUI.failures.push({ kind: 'hesap', source_url: progress.source_url, status: progress.status, page_no: progress.page_no, code: progress.code, message: progress.message });
      }
      updateScanUI();
    }
    LogManager.addLog({ level: progress?.stage === 'error' ? 'error' : 'info', module: 'kaziyici_hesap', action: 'progress', result: JSON.stringify(progress).slice(0,160), error: progress?.stage === 'error' ? `${progress.code || ''} ${progress.message || ''}` : '' });
    renderLogs();
  } });
  orders.forEach(o => recordStore.upsertOrder(o));
  // FIX5_ERRORS_TO_FAIL
  if (Array.isArray(errors)) {
    errors.forEach(e => {
      if (e && typeof e === 'object' && e.source_url) {
        scanUI.failures.push({ kind: 'hesap', source_url: e.source_url, status: e.status, page_no: e.page_no, code: e.code, message: e.message });
      }
    });
    updateScanUI();
  }
  // eğer siparişler varsa SMM detaylarını tarayalım
  const smmIds = orders.map(o => o.smm_id).filter(Boolean);
  if (smmIds.length) {
    const { orders: smmOrders } = await taraAnabayiniz({ smmIds, abortSignal: state.abortController.signal, onProgress: progress => {
      LogManager.addLog({ level: 'info', module: 'kaziyici_anabayiniz', action: 'progress', result: JSON.stringify(progress).slice(0,100) });
      renderLogs();
    } });
    smmOrders.forEach(smm => recordStore.upsertSmmOrder(smm));
  }
  // eşleştirme (basit): order record’un smm_id varsa, smmOrders’dan eşleşen satırı linkle
  recordStore.orders.forEach((order, key) => {
    if (order.smm_id && recordStore.smmOrders.has(String(order.smm_id))) {
      const smm = recordStore.smmOrders.get(String(order.smm_id));
      // baseline: attach message_url placeholder
      order.message_url = null;
      recordStore.orders.set(key, order);
    }
  });
  renderOrdersTable();
  renderLogs();

  // FIX5: scan finish summary
  scanUI.running = false;
  setScanBadge('Tarama Bitti', 'info');
  const elapsedMs = Date.now() - scanUI.startedAt;
  const total = recordStore.orders.size;
  const dist = {};
  recordStore.toArray('orders').forEach(r => { dist[r.status || 'unknown'] = (dist[r.status || 'unknown'] || 0) + 1; });
  if (refs.scanSummary) {
    refs.scanSummary.textContent = `Süre: ${Math.round(elapsedMs/1000)}sn · Toplam sonuç: ${total} · Dağılım: ${Object.keys(dist).length ? JSON.stringify(dist) : '{}'}`;
  }
  updateScanUI();

  state.isRunning = false;
  refs.btnStart.disabled = false;
  refs.btnStop.disabled = true;
}

function stopScan() {
  if (state.isRunning && state.abortController) {
    state.abortController.abort();
  
  // FIX5: scan finish summary
  scanUI.running = false;
  setScanBadge('Tarama Bitti', 'info');
  const elapsedMs = Date.now() - scanUI.startedAt;
  const total = recordStore.orders.size;
  const dist = {};
  recordStore.toArray('orders').forEach(r => { dist[r.status || 'unknown'] = (dist[r.status || 'unknown'] || 0) + 1; });
  if (refs.scanSummary) {
    refs.scanSummary.textContent = `Süre: ${Math.round(elapsedMs/1000)}sn · Toplam sonuç: ${total} · Dağılım: ${Object.keys(dist).length ? JSON.stringify(dist) : '{}'}`;
  }
  updateScanUI();

  state.isRunning = false;
    LogManager.addLog({ level: 'warn', module: 'ui', action: 'stop', result: 'aborted' });
    renderLogs();
    scanUI.running = false;
    setScanBadge('Durduruldu', 'warn');
    if (refs.scanEta) refs.scanEta.textContent = '-';
    updateScanUI();
  }
  refs.btnStart.disabled = false;
  refs.btnStop.disabled = true;
}

// Başlatıcı
function init() {
  initRefs();
  attachEvents();
  // Logları oturumda sakla ve gerçek zamanlı güncelle
  LogManager.init().then(() => {
    renderLogs();
  });
  LogManager.subscribe(() => {
    // çok sık çağrı olursa bile basit render yeterli
    renderLogs();
  });
  renderOrdersTable();
  renderLogs();
}

if (document.readyState === 'loading') {
  if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

} else {
  init();
}


// FIX4_TABS_WIRING: Tablo/Loglar sekmeleri + Detay aç/kapat (dar panelde çakışmayı azalt)
(function wireLayoutTabsFix4(){
  try{
    const tabTable = document.getElementById("tabTable");
    const tabLogs = document.getElementById("tabLogs");
    const tabToggleDetails = document.getElementById("tabToggleDetails");
    if(!tabTable || !tabLogs) return;

    const logsPanel = document.querySelector(".log-panel") || document.getElementById("logPanel") || document.getElementById("logsPanel");
    const tableWrap = document.querySelector(".table-wrap") || document.getElementById("tableWrap");
    const detailsWrap = document.getElementById("detailsWrap");

    const setActive = (which) => {
      if(which === "table"){
        tabTable.classList.add("active"); tabLogs.classList.remove("active");
        if(tableWrap) tableWrap.classList.remove("hidden");
        if(logsPanel) logsPanel.classList.add("hidden");
      } else {
        tabLogs.classList.add("active"); tabTable.classList.remove("active");
        if(logsPanel) logsPanel.classList.remove("hidden");
        if(tableWrap) tableWrap.classList.add("hidden");
      }
    };

    tabTable.addEventListener("click", () => setActive("table"));
    tabLogs.addEventListener("click", () => setActive("logs"));

    if(tabToggleDetails && detailsWrap){
      tabToggleDetails.addEventListener("click", () => {
        detailsWrap.open = !detailsWrap.open;
      });
    }

    // Default: show table
    setActive("table");
  }catch(e){
    try{ window.__PATPAT_BOOTLOG__?.add?.("error","fix4","Sekme bağlama hatası: "+(e?.message||e),"arayuz_uygulama.js",0,0); }catch{}
  }
})();


// FIX6_WIRE_MESSAGING
// GEREKSİNİM 1.1: UI sadece komut üretir; DOM'a dokunmaz.
// GEREKSİNİM 1.2: Background doğru tab'ı bulur/açar/odaklar.
// GEREKSİNİM 1.4: chrome.runtime.sendMessage ile standart haberleşme.
// GEREKSİNİM 2.5: Son N mesajı UI'dan ayarla ve çek.
// GEREKSİNİM 3.4/3.5: Humanize/Bot modu + hız ayarı.
// GEREKSİNİM: GÖNDER butonu hem satır hem detay panelinde olsun.
// GEREKSİNİM: "Thread seç" → kullanıcı tab'da tıklar → UI "seçildi ✓" gösterir.

(async function fix6InitMessagingUI(){
  try {
    const el = (id) => document.getElementById(id);

    const btnSendRow = el("btnSendRow");
    const btnAutoPilot = el("btnAutoPilot");
    const btnThreadSelect = el("btnThreadSelect");
    const threadSelectStatus = el("threadSelectStatus");
    const btnFetchMessages = el("btnFetchMessages");
    const lastNMessages = el("lastNMessages");
    const msgWhoFilter = el("msgWhoFilter");
    const messagesList = el("messagesList");
    const msgThreadStatus = el("msgThreadStatus");
    const speedModeSelect = el("speedModeSelect");
    const speedXRange = el("speedXRange");
    const speedXLabel = el("speedXLabel");

    // Detail send: varsa mevcut butonu yakala; yoksa satır butonu yeter (GEREKSİNİM: ikisinde de olsun -> sonraki revizde id eklenir)
    const btnSendDetail = document.querySelector("#btnSendDetail");

    const uiLog = (level, module, action, message, meta) => {
      try {
        if (typeof addLog === "function") {
          addLog(level, "teksekme", module, action, message || "", meta ? JSON.stringify(meta) : "");
        } else {
          console.log("[FIX6]", level, module, action, message, meta || "");
        }
      } catch {}
    };

    const toast = (text) => { try { alert(text); } catch {} };

    const getSelectedRowData = () => {
      try { if (window.__PATPAT_SELECTED_ROW__) return window.__PATPAT_SELECTED_ROW__; } catch {}
      const tr = document.querySelector("tbody tr.selected") || document.querySelector("tbody tr");
      if (!tr) return null;
      const tds = Array.from(tr.querySelectorAll("td")).map(td => (td.textContent || "").trim());
      const a = tr.querySelector('a[href*="hesap.com.tr"]');
      return { orderId: tds[0]||"", status: tds[1]||"", ilanUrl: a?.href || tds[2]||"", buyerUsername: tds[3]||"", smmId: tds[4]||"" };
    };

    const getMessageTextFromPreview = () => {
      const ta = document.querySelector("#messagePreview") || document.querySelector("textarea");
      return (ta?.value || ta?.textContent || "").trim();
    };

    // MODE/SPEED
    function getModePayload(){
      const kind = speedModeSelect?.value || "humanize";
      const speedX = Number(speedXRange?.value || 1);
      return { kind, speedX };
    }

    if (speedXRange && speedXLabel) {
      const update = () => { speedXLabel.textContent = String(speedXRange.value) + "X"; };
      speedXRange.addEventListener("input", update);
      update();
    }

    async function applyModeToBackground(){
      const m = getModePayload();
      const res = await chrome.runtime.sendMessage({ type:"FIX6_SET_MODE", ...m });
      uiLog(res.ok ? "info":"error", "mode", "set", "MOD AYARLANDI", res);
    }
    speedModeSelect?.addEventListener("change", applyModeToBackground);
    speedXRange?.addEventListener("change", applyModeToBackground);
    applyModeToBackground().catch(()=>{});

    // THREAD SEÇ
    btnThreadSelect?.addEventListener("click", async () => {
      try {
        uiLog("info","thread","manual_select","THREAD SEÇ MODU BAŞLADI");
        if(threadSelectStatus) threadSelectStatus.textContent = "SEÇİLİYOR...";
        const res = await chrome.runtime.sendMessage({ type:"FIX6_MANUAL_THREAD_SELECT_START", payload:{} });
        if(!res.ok){
          if(threadSelectStatus) threadSelectStatus.textContent = "HATA";
          uiLog("error","thread","manual_select_fail","BAŞLATILAMADI",res);
          return;
        }
        toast("HESAP.COM.TR SEKMEDE DOĞRU KONUŞMAYA TIKLA. SONRA BURAYA DÖN.");
      } catch(e){
        uiLog("error","thread","manual_select_exception","HATA",{error:String(e)});
      }
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "MANUAL_THREAD_SELECTED") {
        if(threadSelectStatus) threadSelectStatus.textContent = "SEÇİLDİ ✓";
        if(msgThreadStatus) msgThreadStatus.textContent = "THREAD: SEÇİLDİ ✓";
        uiLog("info","thread","manual_selected","THREAD SEÇİLDİ",msg.payload||{});
      }
      if (msg?.type === "CS_LOG") {
        uiLog(msg.level || "info", "content", "log", msg.message || "", msg.meta || {});
      }
      if (msg?.type === "QUEUE_EVENT") {
        uiLog("info","autopilot", msg.event || "event", "KUYRUK", msg);
      }
    });

    // MESAJLARI ÇEK
    function renderMessages(msgs){
      if(!messagesList) return;
      const who = msgWhoFilter?.value || "all";
      messagesList.innerHTML = "";
      const filtered = msgs.filter(m => who==="all" ? true : m.who===who);
      if(!filtered.length){
        const d=document.createElement("div"); d.className="msg-item"; d.textContent="MESAJ YOK."; messagesList.appendChild(d);
        return;
      }
      filtered.forEach(m=>{
        const item=document.createElement("div");
        item.className="msg-item " + (m.who==="us" ? "us":"customer");
        const meta=document.createElement("div"); meta.className="msg-meta";
        meta.textContent=(m.who==="us" ? "BİZ":"MÜŞTERİ") + " • " + (m.ts||"");
        const body=document.createElement("div"); body.textContent=m.text||"";
        item.appendChild(meta); item.appendChild(body);
        messagesList.appendChild(item);
      });
    }

    btnFetchMessages?.addEventListener("click", async () => {
      try{
        const n = Math.max(1, Number(lastNMessages?.value || 10));
        uiLog("info","messages","fetch","MESAJLAR ÇEKİLİYOR",{n});
        const res = await chrome.runtime.sendMessage({ type:"FIX6_FETCH_MESSAGES", payload:{ lastN:n } });
        if(!res.ok || !res.res?.ok){
          uiLog("error","messages","fetch_fail","MESAJLAR ÇEKİLEMEDİ",res);
          toast("MESAJLAR ÇEKİLEMEDİ. THREAD SAYFASI AÇIK MI?");
          return;
        }
        renderMessages(res.res.messages || []);
        if(msgThreadStatus) msgThreadStatus.textContent="THREAD: OK";
        uiLog("info","messages","fetch_ok","MESAJLAR ÇEKİLDİ",{count:(res.res.messages||[]).length});
      } catch(e){
        uiLog("error","messages","fetch_exception","HATA",{error:String(e)});
      }
    });

    // GÖNDER
    async function doSendSelected(where){
      const row = getSelectedRowData();
      if(!row){ toast("SEÇİLİ SATIR YOK."); return; }
      const messageText = getMessageTextFromPreview();
      if(!messageText){ toast("MESAJ ÖNİZLEME BOŞ."); return; }

      const forward = {
        type:"SEND_MESSAGE",
        payload:{
          orderId: row.orderId,
          buyerUsername: row.buyerUsername,
          ilanUrl: row.ilanUrl,
          textHint: row.buyerUsername,
          messageText,
          lastN: Math.max(1, Number(lastNMessages?.value || 10)),
          targetUrl: row.ilanUrl || ""
        }
      };

      uiLog("info","send","start","GÖNDERİM BAŞLADI ("+where+")",{row});
      const res = await chrome.runtime.sendMessage({ type:"FIX6_SINGLE_SEND", payload:{ targetUrl: row.ilanUrl||"" }, forward });
      if(!res.ok || !res.res?.ok){
        uiLog("error","send","fail","GÖNDERİM BAŞARISIZ",res);
        if(res?.res?.reason==="THREAD_NOT_FOUND"){
          toast("THREAD BULUNAMADI. 'THREAD SEÇ' İLE ELLE SEÇİP TEKRAR DENE.");
        } else {
          toast("GÖNDERİM BAŞARISIZ: " + (res?.res?.reason || res?.error || "BİLİNMEYEN"));
        }
        return;
      }
      uiLog("info","send","ok","GÖNDERİLDİ",res);
      toast("MESAJ GÖNDERİLDİ ✓");
    }

    btnSendRow?.addEventListener("click", ()=>doSendSelected("SATIR"));
    btnSendDetail?.addEventListener?.("click", ()=>doSendSelected("DETAY"));

    // OTOPILOT
    btnAutoPilot?.addEventListener("click", async ()=>{
      try{
        const rows = Array.from(document.querySelectorAll("tbody tr")).slice(0, 500);
        if(!rows.length){ toast("SATIR YOK."); return; }
        const messageText = getMessageTextFromPreview();
        if(!messageText){ toast("MESAJ ÖNİZLEME BOŞ."); return; }

        const n = Math.max(1, Number(lastNMessages?.value || 10));
        const jobs = rows.map(tr=>{
          const a = tr.querySelector('a[href*="hesap.com.tr"]');
          const tds = Array.from(tr.querySelectorAll("td")).map(td => (td.textContent || "").trim());
          return { type:"SEND_MESSAGE", payload:{
            orderId: tds[0]||"",
            buyerUsername: tds[3]||"",
            ilanUrl: a?.href || tds[2]||"",
            textHint: tds[3]||"",
            messageText,
            lastN: n,
            targetUrl: a?.href || ""
          }};
        });

        if(!confirm("TOPLU GÖNDER BAŞLATILSIN MI? (TOPLAM: "+jobs.length+")")) return;
        uiLog("info","autopilot","start","OTOPILOT BAŞLADI",{count:jobs.length});
        const res = await chrome.runtime.sendMessage({ type:"FIX6_QUEUE_START", jobs });
        if(!res.ok){
          uiLog("error","autopilot","start_fail","BAŞLATILAMADI",res);
          toast("OTOPILOT BAŞLATILAMADI");
          return;
        }
        toast("OTOPILOT BAŞLADI ✓");
      } catch(e){
        uiLog("error","autopilot","exception","HATA",{error:String(e)});
      }
    });

  } catch(e){
    try{ window.__PATPAT_BOOTLOG__?.add?.("error","fix6","Mesaj UI init hatası: "+(e?.message||e),"arayuz_uygulama.js",0,0); } catch {}
  }
})();


// EK_FIX_SEND_CLIPBOARD
// 20 MADDE (UI) + PANODA ŞABLON + THREAD AÇ:
// GEREKSİNİM: "GÖNDER'E BASINCA ŞABLON PANODa OLSUN; THREAD SAYFASINA GEÇ; KULLANICI CTRL+V YAPSIN."
// Bu akış otomatik yazma/sending yapmaz; sadece doğru yere yönlendirir ve panoya kopyalar.

(function ekFixSendClipboardAndOpenThread(){
  const el = (id) => document.getElementById(id);

  function toast(msg){
    try{ alert(msg); }catch{}
  }

  async function copyToClipboard(text){
    try{
      await navigator.clipboard.writeText(text || "");
      return { ok:true };
    }catch(e){
      // Fallback: seçilebilir textarea
      try{
        const ta = document.createElement("textarea");
        ta.value = text || "";
        ta.style.cssText = "width:calc(100% - 20px);height:140px;position:fixed;left:10px;right:10px;bottom:60px;z-index:99998;";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
      }catch{}
      return { ok:false, error:String(e) };
    }
  }

  function getPreviewText(){
    const ta = document.querySelector("#messagePreview") || document.querySelector("textarea");
    return (ta?.value || "").trim();
  }

  function getSelectedRow(){
    try{ if (window.__PATPAT_SELECTED_ROW__) return window.__PATPAT_SELECTED_ROW__; } catch {}
    const tr = document.querySelector("tbody tr.selected") || document.querySelector("tbody tr");
    if(!tr) return null;
    const tds = Array.from(tr.querySelectorAll("td")).map(td => (td.textContent || "").trim());
    const a = tr.querySelector('a[href*="hesap.com.tr"]');
    return { orderId: tds[0]||"", buyerUsername: tds[3]||"", ilanUrl: a?.href || tds[2]||"" };
  }

  async function openThreadForSelected(){
    const row = getSelectedRow();
    if(!row) { toast("SEÇİLİ SATIR YOK."); return; }

    const res = await chrome.runtime.sendMessage({
      type: "FIX7_OPEN_THREAD",
      payload: { orderId: row.orderId, buyerUsername: row.buyerUsername, ilanUrl: row.ilanUrl }
    });

    if(!res?.ok){
      toast("THREAD AÇMA BAŞARISIZ. 'THREAD SEÇ' İLE ELLE SEÇ.");
      return;
    }

    if(res.method === "NOT_FOUND"){
      toast("THREAD BULUNAMADI. 'THREAD SEÇ' İLE ELLE SEÇ.");
    } else {
      toast("THREAD AÇILDI ✓  CTRL+V İLE MESAJI YAPIŞTIR.");
    }
  }

  async function onSendClick(){
    const text = getPreviewText();
    if(!text){ toast("MESAJ ÖNİZLEME BOŞ."); return; }
    const c = await copyToClipboard(text);
    if(c.ok){
      toast("MESAJ PANODa ✓  THREAD AÇILIYOR...");
    }else{
      toast("PANO KOPYALAMA BAŞARISIZ. ALTTAKİ ALANDAN KOPYALA.");
    }
    await openThreadForSelected();
  }

  const btnSendRow = el("btnSendRow");
  if(btnSendRow){
    btnSendRow.addEventListener("click", onSendClick);
  }

  const btnOpen = el("btnOpenMessageThread");
  if(btnOpen){
    btnOpen.addEventListener("click", async () => {
      const text = getPreviewText();
      if(text) await copyToClipboard(text);
      await openThreadForSelected();
    });
  }

  // 14: textarea auto-resize
  const preview = document.querySelector("#messagePreview") || document.querySelector("textarea");
  if(preview){
    const resize = () => {
      preview.style.height = "auto";
      preview.style.height = Math.min(preview.scrollHeight, 260) + "px";
    };
    preview.addEventListener("input", resize);
    resize();
  }

  // 19: sayfa limiti 0 engelle
  const pageLimit = el("pageLimitInput");
  if(pageLimit){
    pageLimit.addEventListener("change", () => {
      const v = Number(pageLimit.value || 0);
      if(v < 1){
        pageLimit.value = "1";
        toast("SAYFA LİMİTİ EN AZ 1 OLMALI.");
      }
    });
  }
})();


// EK_UI_ONLY3FILES_V1
// Bu blok sadece ARAYUZ.HTML + STILLER.CSS + ARAYUZ_UYGULAMA.JS içinde çalışacak şekilde yazıldı.
// GEREKSİNİM: ÜST BAR 2 SATIR, 36PX KONTROLLER, OTO GÖNDER/SİMÜLASYON GELİŞMİŞE, PROGRESS BAR,
// GEREKSİNİM: GÖNDER BASINCA ŞABLON PANODA + THREAD SAYFASINI AÇ/ODAKLA + CTRL+V yeterli olsun.
// GEREKSİNİM: HATA YÖNETİMİ + TEMEL TEST/DOĞRULAMA (console self-check).

(function EK_UI(){
  const $ = (id) => document.getElementById(id);

  // ---- Logging (UI log sistemi varsa kullan, yoksa console) ----
  function log(level, msg, meta){
    try{
      if (typeof addLog === "function") {
        // Mevcut projedeki log fonksiyonu varsa kullan.
        addLog(level, "teksekme", "ek_ui", "ui", msg, meta ? JSON.stringify(meta) : "");
      } else {
        console[level === "error" ? "error" : "log"]("[EK_UI]", msg, meta || "");
      }
    }catch{}
  }

  function toast(msg){
    // Basit geri bildirim (GEREKSİNİM: kullanıcı net görsün)
    try{ alert(msg); }catch{}
  }

  // ---- Clipboard helper ----
  async function copyTemplateToClipboard(text){
    // GEREKSİNİM: "GÖNDER'e basınca şablon panoda olsun"
    try{
      await navigator.clipboard.writeText(text || "");
      return { ok:true };
    }catch(e){
      // Hata yönetimi: Clipboard izinleri/HTTPs/permission hatası olabilir.
      // GEREKSİNİM: "Beklenmeyen durumları gerekçelendir" -> fallback textarea basılır.
      try{
        const ta = document.createElement("textarea");
        ta.value = text || "";
        ta.style.cssText = "width:calc(100% - 20px);height:140px;position:fixed;left:10px;right:10px;bottom:60px;z-index:99998;";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
      }catch{}
      return { ok:false, error:String(e) };
    }
  }

  // ---- Selected row resolver ----
  function getSelectedRow(){
    // GEREKSİNİM: "ilgili müşteri ile görüşülen mesajlaşma alanına geç"
    // Not: Seçim mekanizması projede değişebilir; best-effort.
    try{ if (window.__PATPAT_SELECTED_ROW__) return window.__PATPAT_SELECTED_ROW__; }catch{}
    const tr = document.querySelector("tbody tr.selected") || document.querySelector("tbody tr");
    if(!tr) return null;
    const tds = Array.from(tr.querySelectorAll("td")).map(td => (td.textContent || "").trim());
    const a = tr.querySelector('a[href*="hesap.com.tr"]');
    return {
      orderId: tds[0] || "",
      status: tds[1] || "",
      ilanUrl: a?.href || tds[2] || "",
      buyerUsername: tds[3] || "",
      smmId: tds[4] || ""
    };
  }

  // ---- Preview text ----
  function getPreviewText(){
    const ta = $("messagePreview") || document.querySelector("textarea");
    return (ta?.value || "").trim();
  }

  // ---- Auto-resize preview ----
  function wireAutoResize(){
    // GEREKSİNİM: "Mesaj önizleme auto-resize + max-height"
    const ta = $("messagePreview");
    if(!ta) return;
    const resize = () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 260) + "px";
    };
    ta.addEventListener("input", resize);
    resize();
  }

  // ---- Scan status/progress ----
  function setScanStatus({ badge, percent, eta, url }){
    const badgeEl = $("scanBadge");
    const metaEl = $("scanMeta");
    const fill = $("scanBarFill");
    if (badgeEl && badge) badgeEl.textContent = "DURUM: " + badge;
    if (metaEl) metaEl.textContent = `YÜZDE: ${percent ?? 0}% • ETA: ${eta || "-"} • URL: ${url || "-"}`;
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, Number(percent)||0))}%`;
  }

  function wireStopAlways(){
    // GEREKSİNİM: "Her aşamada durdur"
    const btn = $("btnScanStopAlways");
    if(!btn) return;
    btn.addEventListener("click", () => {
      // Var olan stop mekanizmasına dokunmadan, mevcut btnStop varsa tetikle.
      const stop = $("btnStop");
      if(stop) stop.click();
      setScanStatus({ badge:"DURDURULDU", percent:0, eta:"-", url:"-" });
      log("info","GLOBAL DURDUR TETİKLENDİ");
    });
  }

  // ---- Page limit validation ----
  function wirePageLimitValidation(){
    const elp = $("pageLimitInput");
    if(!elp) return;
    elp.addEventListener("change", () => {
      // GEREKSİNİM: sayfa limiti 0 engelle
      const v = Number(elp.value || 0);
      if(v < 1){
        elp.value = "1";
        toast("SAYFA LİMİTİ EN AZ 1 OLMALI.");
      }
    });
  }

  // ---- Open/focus message thread via background ----
  async function openThreadForSelectedRow(row){
    // GEREKSİNİM: "GÖNDER basınca ilgili müşteri mesajlaşma alanına geç"
    // Bu çağrı background.js içinde FIX7_OPEN_THREAD handler'ına gider (daha önce projeye eklendi).
    try{
      const res = await chrome.runtime.sendMessage({
        type: "FIX7_OPEN_THREAD",
        payload: { orderId: row.orderId, buyerUsername: row.buyerUsername, ilanUrl: row.ilanUrl }
      });
      return res;
    }catch(e){
      return { ok:false, error:String(e) };
    }
  }

  // ---- Send button behavior: copy to clipboard then open thread ----
  async function onSendClick(){
    const row = getSelectedRow();
    if(!row){ toast("SEÇİLİ SATIR YOK."); return; }
    const text = getPreviewText();
    if(!text){ toast("MESAJ ÖNİZLEME BOŞ."); return; }

    const c = await copyTemplateToClipboard(text);
    if(c.ok){
      // GEREKSİNİM: "GÖNDER'e basınca otomatik panoda olsun"
      log("info","ŞABLON PANoya KOPYALANDI", { len: text.length });
      toast("MESAJ PANODA ✓  THREAD AÇILIYOR...  SONRA CTRL+V");
    } else {
      log("warn","PANO KOPYALAMA BAŞARISIZ (FALLBACK TEXTAREA BASILDI)", { error: c.error });
      toast("PANO KOPYALAMA BAŞARISIZ. ALTTAKİ ALANDAN KOPYALA, SONRA CTRL+V.");
    }

    const res = await openThreadForSelectedRow(row);
    if(!res?.ok){
      log("error","THREAD AÇMA BAŞARISIZ", res);
      toast("THREAD AÇILAMADI. 'THREAD SEÇ' İLE ELLE SEÇ.");
      return;
    }
    if(res.method === "NOT_FOUND"){
      toast("THREAD BULUNAMADI. 'THREAD SEÇ' İLE ELLE SEÇ. SONRA CTRL+V.");
    } else {
      toast("THREAD AÇILDI ✓  CTRL+V İLE YAPIŞTIR.");
    }
  }

  function wireSendButtons(){
    // GEREKSİNİM: "GÖNDER butonu ikisinde de olsun" -> btnSendRow + btnSendDetail
    const a = $("btnSendRow");
    const b = $("btnSendDetail");
    if(a) a.addEventListener("click", onSendClick);
    if(b) b.addEventListener("click", onSendClick);
  }

  // ---- Basic self-test ----
  function runSelfCheck(){
    // GEREKSİNİM: "En azından temel senaryoları doğrula"
    const checks = [
      ["btnSendRow", !!$("btnSendRow")],
      ["btnSendDetail", !!$("btnSendDetail")],
      ["scanStatusBar", !!$("scanStatusBar")],
      ["pageLimitInput", !!$("pageLimitInput")],
      ["messagePreview", !!$("messagePreview")],
    ];
    const failed = checks.filter(c => !c[1]).map(c => c[0]);
    if(failed.length){
      log("warn","SELF-CHECK EKSİK UI ELEMANLARI", { failed });
    } else {
      log("info","SELF-CHECK OK", { count: checks.length });
    }
  }

  // ---- Wire everything ----
  function initEkUi(){
    try{
      wireAutoResize();
      wireStopAlways();
      wirePageLimitValidation();
      wireSendButtons();
      // Başlangıçta hazır göster
      setScanStatus({ badge:"HAZIR", percent:0, eta:"-", url:"-" });
      runSelfCheck();
    }catch(e){
      log("error","EK_UI init hatası", { error: String(e) });
    }
  }

  // Safe init: DOM hazır mı?
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEkUi);
  } else {
    initEkUi();
  }
})();
