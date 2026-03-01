/*
 * arayuz_uygulama.js
 * UI katmanı ve genel uygulama durum yönetimi. Bu modül, HTML arayüz
 * elemanlarını seçer, kullanıcı etkileşimlerini dinler, kazıyıcıları
 * çalıştırır, eşleştirme ve mesaj üretme fonksiyonlarını çağırır ve
 * sonuçları tabloya ve loglara yansıtır. Tek yönlü veri akışı
 * kullanarak state güncellemeleri yönetilir.
 */

import { taraHesap } from './kaziyici_hesap_com_tr.js';
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
  refs.logLevelFilter = document.getElementById('logLevelFilter');
  refs.logsBody = document.getElementById('logsBody');
  refs.logsEmpty = document.getElementById('logsEmpty');
  refs.btnRetry = document.getElementById('btnRetry');
  refs.btnManual = document.getElementById('btnManual');
}

// UI state güncelleme fonksiyonları
function updateTableTitle() {
  const count = recordStore.orders.size;
  refs.tableTitle.textContent = `Toplam ${count} satır.`;
}

function renderOrdersTable() {
  const rows = recordStore.toArray('orders');
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
  updateTableTitle();
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
  const level = refs.logLevelFilter.value;
  const logs = LogManager.getLogs(level);
  refs.logsBody.innerHTML = '';
  if (!logs.length) {
    refs.logsEmpty.style.display = 'block';
  } else {
    refs.logsEmpty.style.display = 'none';
  }
  logs.forEach(log => {
    const tr = document.createElement('tr');
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
    LogManager.addLog({ level: 'info', module: 'kaziyici_hesap', action: 'progress', result: JSON.stringify(progress).slice(0,100) });
    renderLogs();
  } });
  orders.forEach(o => recordStore.upsertOrder(o));
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
  state.isRunning = false;
  refs.btnStart.disabled = false;
  refs.btnStop.disabled = true;
}

function stopScan() {
  if (state.isRunning && state.abortController) {
    state.abortController.abort();
    state.isRunning = false;
    LogManager.addLog({ level: 'warn', module: 'ui', action: 'stop', result: 'aborted' });
    renderLogs();
  }
  refs.btnStart.disabled = false;
  refs.btnStop.disabled = true;
}

// Başlatıcı
function init() {
  initRefs();
  attachEvents();
  renderOrdersTable();
  renderLogs();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
