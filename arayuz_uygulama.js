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
import { ensureRulesPackLoaded } from './puter_rules_runtime.js';
import { applySimplify } from './ui_simplify.js';
import { makeLogStore, compactLinesFromEntries } from './log_compact.js';

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
  rulesPack: null,
  aiMode: 'TEMPLATE',
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


const logStore = makeLogStore();
let renderLogsTimer = null;

function scheduleRenderLogs() {
  if (renderLogsTimer) clearTimeout(renderLogsTimer);
  renderLogsTimer = setTimeout(() => {
    renderLogsTimer = null;
    renderLogs();
  }, 250);
}

function pushLog(entry) {
  logStore.push(entry);
  LogManager.addLog(entry);
  scheduleRenderLogs();
}

function bindCompactLogButtons() {
  const buttons = Array.from(document.querySelectorAll('button'));
  const btnCopy = buttons.find((b) => String(b.textContent || '').trim().toUpperCase() === 'LOGLARI KOPYALA');
  const btnPack = buttons.find((b) => String(b.textContent || '').trim().toUpperCase() === 'PAKETİ HAZIRLA');

  if (btnCopy && !btnCopy.dataset.boundCompact) {
    btnCopy.dataset.boundCompact = '1';
    btnCopy.addEventListener('click', async () => {
      const lines = compactLinesFromEntries(logStore.getLastRun());
      const compactTxt = lines.join('\n');
      await copyToClipboard(compactTxt);
    });
  }

  if (btnPack && !btnPack.dataset.boundCompact) {
    btnPack.dataset.boundCompact = '1';
    btnPack.addEventListener('click', () => {
      const entries = logStore.getLastRun();
      const compactTxt = compactLinesFromEntries(entries).join('\n');
      const jsonl = entries.map((e) => JSON.stringify(e)).join('\n');
      downloadTextFile('patpat_logs_compact.txt', compactTxt);
      downloadTextFile('patpat_logs_raw.jsonl', jsonl);
    });
  }
}

function formatEta(ms) {
  if (!isFinite(ms) || ms <= 0) return '-';
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}dk ${r}sn` : `${r}sn`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusLabelTr(status) {
  const map = {
    pending: 'Beklemede',
    processing: 'İşleniyor',
    completed: 'Tamamlandı',
    cancelled: 'İptal',
    returnprocess: 'İade',
    problematic: 'Sorunlu',
    partial: 'Kısmi',
    inprogress: 'Devam Ediyor',
    inprogres: 'Devam Ediyor',
  };
  const key = String(status || '').toLowerCase();
  return map[key] || (status || '-');
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
        const u = escapeHtml(f.source_url || '');
        const why = escapeHtml(`${f.code || 'HATA'}: ${f.message || ''}`);
        const kind = f.kind === 'smm' ? 'SMM' : 'HESAP';
        return `<div class="scan-failure-item" data-idx="${i}">
          <div class="scan-failure-text"><strong>${kind}</strong> — ${u}<br/><span style="color:var(--muted-color)">${why}</span></div>
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
  refs.btnSendMessage = document.getElementById('btnSendMessage') || document.getElementById('btnSendReply');
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
  refs.compactLogsOutput = document.getElementById('compactLogsOutput');
  refs.btnRetry = document.getElementById('btnRetry');
  refs.btnManual = document.getElementById('btnManual');
  refs.btnPuterChatDemo = document.getElementById('btnPuterChatDemo');
  refs.btnReadCustomerMessages = document.getElementById('btnReadCustomerMessages');
  refs.btnAiDraft = document.getElementById('btnAiDraft');
  refs.aiDraftText = document.getElementById('aiDraftText');
  refs.aiAdminNote = document.getElementById('aiAdminNote');
  refs.aiModeTemplate = document.getElementById('aiModeTemplate');
  refs.aiModeManual = document.getElementById('aiModeManual');
  refs.aiModeAutopilot = document.getElementById('aiModeAutopilot');
  refs.statTotalOrders = document.getElementById('statTotalOrders');
  refs.statProblematic = document.getElementById('statProblematic');
  refs.statReturnprocess = document.getElementById('statReturnprocess');
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

function renderOverviewStats() {
  const rows = recordStore.toArray('orders');
  const total = rows.length;
  const problematic = rows.filter((r) => String(r.status || '').toLowerCase() === 'problematic').length;
  const returns = rows.filter((r) => String(r.status || '').toLowerCase() === 'returnprocess').length;
  if (refs.statTotalOrders) refs.statTotalOrders.textContent = String(total);
  if (refs.statProblematic) refs.statProblematic.textContent = String(problematic);
  if (refs.statReturnprocess) refs.statReturnprocess.textContent = String(returns);
}

function getSelectedOrderAndSmm() {
  if (!selectedOrderId) return { orderRow: null, smmRow: null };
  const orderRow = recordStore.orders.get(String(selectedOrderId));
  const smmRow = orderRow?.smm_id ? recordStore.smmOrders.get(String(orderRow.smm_id)) : null;
  return { orderRow, smmRow };
}

function updateAiControls() {
  const { orderRow } = getSelectedOrderAndSmm();
  const hasSelection = Boolean(orderRow);
  if (refs.btnReadCustomerMessages) refs.btnReadCustomerMessages.disabled = !hasSelection;
  if (refs.btnAiDraft) refs.btnAiDraft.disabled = !hasSelection;
  if (refs.aiAdminNote) {
    refs.aiAdminNote.classList.remove('hidden');
    refs.aiAdminNote.textContent = hasSelection
      ? 'Gecikme/İade/Problem tespit edildi; uygun şablon önerildi.'
      : 'Önce tablodan bir sipariş seç.';
  }
}

async function buildPuterDraft(orderRow, smmRow) {
  const selectedType = refs.templateSelect?.value || 'auto';
  const baseTemplate = generateMessage(orderRow, smmRow, selectedType, state.rulesPack);
  const banned = state.rulesPack?.policy?.banned_tokens || ['MAX', 'HIZ', 'FİYAT'];

  if (!(globalThis.puter && puter.ai && typeof puter.ai.chat === 'function')) {
    return baseTemplate;
  }

  const prompt = [
    'Türkçe müşteri destek asistanısın.',
    'Aşağıdaki şablon iskeletini koru, sadece gerekli yerleri nazikçe iyileştir.',
    `Şablon tipi: ${selectedType}`,
    `Sipariş Durumu: ${statusLabelTr(smmRow?.status || orderRow?.status || '')}`,
    `Müşteri: ${orderRow?.buyer_username || '-'}`,
    `Yasaklı kelimeler: ${banned.join(', ')}`,
    'Çıktıda yasaklı kelimeleri kullanma.',
    'Temel şablon:',
    baseTemplate,
  ].join('\n');

  try {
    const aiRes = await puter.ai.chat(prompt);
    const text = String(aiRes ?? '').trim();
    return text || baseTemplate;
  } catch {
    return baseTemplate;
  }
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
    tdStatus.textContent = statusLabelTr(row.status);
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
  renderOverviewStats();
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
  const message = smmRow ? generateMessage(orderRow, smmRow, type, state.rulesPack) : '';
  updateMessagePreview(message);
  if (refs.aiDraftText) refs.aiDraftText.value = message || '';
  updateAiControls();
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
  if (!refs.logsBody || !refs.logsEmpty) {
    return;
  }
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
  if (refs.compactLogsOutput) {
    refs.compactLogsOutput.value = compactLinesFromEntries(logStore.getLastRun()).join('\n');
  }
  applySimplify(document);
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
    pushLog({ level: 'info', module: 'scan', action: 'retry_smm', result: 'ok', message: String(smmId) });
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
  recordStore.orders.forEach((order, key) => {
    if (!order.message_url) {
      const buyer = String(order.buyer_username || '').trim();
      order.message_url = buyer ? `https://hesap.com.tr/u/${encodeURIComponent(buyer)}` : null;
      recordStore.orders.set(key, order);
    }
  });
  renderOrdersTable();
  pushLog({ level: 'info', module: 'scan', action: 'retry_hesap', result: `rows:${rows.length}`, message: url });
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
      const message = smmRow ? generateMessage(orderRow, smmRow, refs.templateSelect.value, state.rulesPack) : '';
      updateMessagePreview(message);
    }
  });
  refs.btnGenerateTemplate.addEventListener('click', () => {
    if (selectedOrderId) {
      const orderRow = recordStore.orders.get(String(selectedOrderId));
      const smmRow = orderRow?.smm_id ? recordStore.smmOrders.get(String(orderRow.smm_id)) : null;
      const message = smmRow ? generateMessage(orderRow, smmRow, refs.templateSelect.value, state.rulesPack) : '';
      updateMessagePreview(message);
    }
  });
  refs.btnSendMessage.addEventListener('click', async (ev) => {
    if (!selectedOrderId) return;

    const orderRow = recordStore.orders.get(String(selectedOrderId));
    const message = refs.messagePreview.value || '';

    if (state.dryRun) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      await copyToClipboard(message);
      pushLog({ level: 'info', module: 'ui', action: 'sendMessage', result: 'DRY_RUN_COPY_ONLY' });
      return;
    }

    const username = String(orderRow?.buyer_username || '').trim();
    if (username) {
      const profileUrl = `https://hesap.com.tr/u/${encodeURIComponent(username)}`;
      await copyToClipboard(message);
      window.open(profileUrl, '_blank', 'noopener,noreferrer');
      pushLog({ level: 'info', module: 'ui', action: 'open_message_profile', result: profileUrl });
      return;
    }

    const result = await sendMessage({
      buyerUsername: orderRow?.buyer_username,
      orderId: orderRow?.order_id,
      messageText: message,
      dryRun: state.dryRun,
    });
    pushLog({ level: result === 'ERROR' ? 'error' : 'warn', module: 'ui', action: 'sendMessageFallback', result });
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
    const compactTxt = compactLinesFromEntries(logStore.getLastRun()).join('\n');
    await copyToClipboard(compactTxt);
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
    const entries = logStore.getLastRun();
    const compactTxt = compactLinesFromEntries(entries).join('\n');
    const jsonl = entries.map((e) => JSON.stringify(e)).join('\n');
    downloadTextFile('patpat_logs_compact.txt', compactTxt);
    downloadTextFile('patpat_logs_raw.jsonl', jsonl);
  });
  if (refs.btnClearLogs) refs.btnClearLogs.addEventListener('click', () => {
    if (!confirm('Loglar temizlensin mi?')) return;
    LogManager.clear();
    renderLogs();
  });
  refs.btnRetry.addEventListener('click', () => {
    // retry son hatalı kayıt; stub
    pushLog({ level: 'info', module: 'ui', action: 'retry', result: 'clicked' });
  });
  refs.btnManual.addEventListener('click', () => {
    // manual handoff; stub
    pushLog({ level: 'info', module: 'ui', action: 'manual', result: 'clicked' });
  });

  if (refs.aiModeTemplate) refs.aiModeTemplate.addEventListener('change', () => { if (refs.aiModeTemplate.checked) state.aiMode = 'TEMPLATE'; });
  if (refs.aiModeManual) refs.aiModeManual.addEventListener('change', () => { if (refs.aiModeManual.checked) state.aiMode = 'MANUAL'; });
  if (refs.aiModeAutopilot) refs.aiModeAutopilot.addEventListener('change', () => { if (refs.aiModeAutopilot.checked) state.aiMode = 'AUTOPILOT'; });

  if (refs.btnReadCustomerMessages) refs.btnReadCustomerMessages.addEventListener('click', () => {
    const { orderRow } = getSelectedOrderAndSmm();
    if (!orderRow) return;
    const username = String(orderRow.buyer_username || '').trim();
    if (!username) return;
    const messagePage = `https://hesap.com.tr/u/${encodeURIComponent(username)}`;
    window.open(messagePage, '_blank', 'noopener,noreferrer');
    pushLog({ level: 'info', module: 'ai', action: 'open_message_page', result: messagePage });
  });

  if (refs.btnAiDraft) refs.btnAiDraft.addEventListener('click', async () => {
    const { orderRow, smmRow } = getSelectedOrderAndSmm();
    if (!orderRow) return;
    refs.btnAiDraft.disabled = true;
    const draft = await buildPuterDraft(orderRow, smmRow);
    if (refs.aiDraftText) refs.aiDraftText.value = draft;
    updateMessagePreview(draft);
    refs.btnAiDraft.disabled = false;
    pushLog({ level: 'info', module: 'ai', action: 'draft', result: `len:${String(draft || '').length}` });
  });

  if (refs.btnPuterChatDemo) {
    refs.btnPuterChatDemo.addEventListener('click', () => {
      const url = chrome.runtime.getURL('puter_chat_demo.html');
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }
}

// Taramayı başlat
async function startScan() {
  if (state.isRunning) return;
  state.isRunning = true;
  refs.btnStart.disabled = true;
  refs.btnStop.disabled = false;
  state.abortController = new AbortController();
  logStore.startRun({ mode: state.mode, statusFilters: [...state.statusFilters], pageLimit: state.pageLimit, searchQuery: state.searchQuery, startedAt: Date.now() });
  pushLog({ level: 'info', module: 'ui', action: 'start', result: 'start' });
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
    pushLog({ level: progress?.stage === 'error' ? 'error' : 'info', module: 'kaziyici_hesap', action: 'progress', result: JSON.stringify(progress).slice(0,160), error: progress?.stage === 'error' ? `${progress.code || ''} ${progress.message || ''}` : '' });
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
      pushLog({ level: 'info', module: 'kaziyici_anabayiniz', action: 'progress', result: JSON.stringify(progress).slice(0,100) });
    } });
    smmOrders.forEach(smm => recordStore.upsertSmmOrder(smm));
  }
  // eşleştirme (basit): order record’un smm_id varsa, smmOrders’dan eşleşen satırı linkle
  recordStore.orders.forEach((order, key) => {
    if (order.smm_id && recordStore.smmOrders.has(String(order.smm_id))) {
      const smm = recordStore.smmOrders.get(String(order.smm_id));
      const buyer = String(order.buyer_username || '').trim();
      order.message_url = buyer ? `https://hesap.com.tr/u/${encodeURIComponent(buyer)}` : null;
      recordStore.orders.set(key, order);
    }
  });
  renderOrdersTable();
  logStore.endRun({ finishedAt: Date.now(), ordersCount: recordStore.orders.size, smmCount: recordStore.smmOrders.size });
  scheduleRenderLogs();

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
    logStore.endRun({ finishedAt: Date.now(), aborted: true });
    pushLog({ level: 'warn', module: 'ui', action: 'stop', result: 'aborted' });
    scanUI.running = false;
    setScanBadge('Durduruldu', 'warn');
    if (refs.scanEta) refs.scanEta.textContent = '-';
    updateScanUI();
  }
  refs.btnStart.disabled = false;
  refs.btnStop.disabled = true;
}

// Başlatıcı
async function init() {
  initRefs();
  attachEvents();

  await LogManager.init();
  try {
    state.rulesPack = await ensureRulesPackLoaded();
    pushLog({
      level: 'info',
      module: 'ui',
      action: 'PUTER_RULES_LOADED',
      result: JSON.stringify({ rules_version: state.rulesPack?.rules_version, md_hash: state.rulesPack?.md_hash }),
    });
  } catch (e) {
    state.rulesPack = null;
    pushLog({
      level: 'warn',
      module: 'ui',
      action: 'PUTER_RULES_LOAD_FAIL',
      error: String(e?.message || e),
    });
  }

  LogManager.subscribe(() => {
    scheduleRenderLogs();
  });
  renderOrdersTable();
  renderLogs();
  if (refs.compactLogsOutput) {
    refs.compactLogsOutput.value = compactLinesFromEntries(logStore.getLastRun()).join('\n');
  }
  applySimplify(document);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
  });
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
