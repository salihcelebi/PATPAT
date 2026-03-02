import { taraHesap } from './kaziyici_hesap_com_tr.js';
import { taraAnabayiniz } from './kaziyici_anabayiniz_com.js';
import { generateMessage, checkPolicy, getTemplatePack } from './eslestirme_ve_sablonlar.js';
import { sendMessage, readThreadMessages, openMessagePage } from './mesaj_gonderici.js';
import { recordStore, LogManager } from './kayit_ve_loglama.js';
import { HesapProfileUrlRules } from './kurallar_dom_regex_url.js';

const state = {
  mode: 'analysis', statusFilters: ['returnprocess', 'problematic'], searchQuery: '', pageLimit: 1,
  autoSend: false, dryRun: true, isRunning: false, abortController: null,
  aiMode: 'TEMPLATE', selectedOrderId: null, lastMessagePack: null, lastDecision: null,
};

const refs = {};

function initRefs() {
  ['modeSelect','statusSelect','searchInput','pageLimitInput','autoSendToggle','dryRunToggle','btnStart','btnStop','btnExportCsv','btnExportJson','ordersBody','ordersEmpty','tableTitle','templateSelect','btnGenerateTemplate','btnCopyMessage','messagePreview','policyWarning','logSearchInput','logLevelFilter','logPageFilter','logSourceFilter','btnCopyAllLogs','btnCopySelectedLogs','btnExportLogs','btnClearLogs','logsBody','logsEmpty','btnRetry','btnManual','app','logToggle','logStateBtn','scanStateBadge','scanCurrentUrl','scanProgressFill','scanCount','scanTotal','scanPercent','scanEta','scanSummary','btnReadCustomerMessages','btnAiDraft','btnAdminAlerts','aiAutopilotBadge','aiDraftText','aiAdminNote','btnSendReply','btnOpenMessagePage','aiModeTemplate','aiModeManual','aiModeAutopilot'].forEach(id=>refs[id]=document.getElementById(id));
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
}

function log(action, level='info', result='', error='', context={}) {
  LogManager.addLog({ level, module: action.startsWith('ai_') ? 'ai' : 'ui', action, result, error, context: { mode: state.aiMode, ...context } });
}

function getSelectedOrder() {
  return state.selectedOrderId ? recordStore.orders.get(String(state.selectedOrderId)) : null;
}

function setAiControlsEnabled(enabled) {
  // SCOD: BU GEREKSİNİM UYGULANDI - seçili sipariş yoksa AI butonları pasif yönetiliyor.
  ['btnReadCustomerMessages','btnAiDraft','btnSendReply'].forEach(id => { if (refs[id]) refs[id].disabled = !enabled; });
  const row = getSelectedOrder();
  const hasUser = !!HesapProfileUrlRules.buildProfileUrl(row?.buyer_username || '');
  if (refs.btnOpenMessagePage) refs.btnOpenMessagePage.disabled = !enabled || !hasUser;
}

function applyAiModeUI() {
  const mode = state.aiMode;
  const editable = mode === 'MANUAL';
  refs.aiDraftText.readOnly = !editable;
  refs.aiAutopilotBadge.classList.toggle('hidden', mode !== 'AUTOPILOT');
  refs.btnSendReply.disabled = mode === 'AUTOPILOT' || !getSelectedOrder();
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

function renderOrdersTable() {
  const q = state.searchQuery.toLowerCase();
  const rows = recordStore.toArray('orders').filter(r => !q || `${r.order_id} ${r.status} ${r.ilan_url} ${r.buyer_username} ${r.smm_id}`.toLowerCase().includes(q));
  refs.ordersBody.innerHTML = '';
  refs.ordersEmpty.style.display = rows.length ? 'none' : 'block';
  refs.tableTitle.textContent = `Toplam ${recordStore.orders.size} satır. (Görünen: ${rows.length})`;
  rows.forEach(row => {
    const tr = document.createElement('tr'); tr.dataset.orderId = row.order_id;
    [row.order_id, row.status, row.ilan_url || '', row.buyer_username || '', row.smm_id || '', row.message_url || ''].forEach(v => { const td=document.createElement('td'); td.textContent=v; tr.appendChild(td); });
    tr.addEventListener('click', () => {
      state.selectedOrderId = row.order_id;
      Array.from(refs.ordersBody.children).forEach(x => x.classList.toggle('selected', x.dataset.orderId === String(row.order_id)));
      const smmRow = row?.smm_id ? recordStore.smmOrders.get(String(row.smm_id)) : null;
      fillSmmDetails(row, smmRow);
      refs.messagePreview.value = generateMessage(row, smmRow, refs.templateSelect.value);
      setAiControlsEnabled(true);
      applyAiModeUI();
    });
    refs.ordersBody.appendChild(tr);
  });
}

function renderLogs() {
  const level = refs.logLevelFilter?.value || '';
  const search = refs.logSearchInput?.value?.trim?.() || '';
  const page = refs.logPageFilter?.value || '';
  const source = refs.logSourceFilter?.value || '';
  const logs = LogManager.getLogs({ level, search, page, source });
  refs.logsBody.innerHTML = '';
  refs.logsEmpty.style.display = logs.length ? 'none' : 'block';
  logs.forEach(logRow => {
    const tr = document.createElement('tr');
    const c=document.createElement('input'); c.type='checkbox'; c.className='log-select'; c.dataset.logId=logRow.id; const td=document.createElement('td'); td.appendChild(c); tr.appendChild(td);
    ['ts','level','page','module','action','result','error'].forEach(k=>{ const t=document.createElement('td'); t.textContent=logRow[k]||''; tr.appendChild(t); });
    const loc=document.createElement('td'); loc.textContent=`${logRow.file||'-'}:${logRow.line||0}`; tr.appendChild(loc);
    refs.logsBody.appendChild(tr);
  });
}

function coerceDecision(raw, mode) {
  const base = { mode, intent: 'OTHER', send_allowed: false, escalate: false, is_customer_right: 'UNKNOWN', template_id: 'TPL_STATUS', reply: '', admin_note: '', ask: '' };
  return { ...base, ...(raw || {}) };
}

async function runPuterDecision(context) {
  const prompt = "SUPPORT AGENT. READ messages+order. PICK template_id. WRITE TURKISH SHORT HUMAN. NEVER CERTAIN; SAY 'KAYITLARA GÖRE'. MAX 1 QUESTION. RULE: IF status in [IADE,SORUNLU] => send_allowed=false, escalate=true. OUTPUT ONLY JSON: {intent,send_allowed,escalate,is_customer_right,template_id,reply,admin_note,ask}.";
  try {
    // SPJS: BU GEREKSİNİM UYGULANDI - puter.ai çağrısı tek JSON şemasına zorlanır.
    if (window.puter?.ai?.chat) {
      const payload = [{ role: 'user', content: `${prompt}\n${JSON.stringify(context)}` }];
      const res = await window.puter.ai.chat(payload, { model: 'gpt-5-nano', max_tokens: 400, temperature: 0.3 });
      const txt = String(res?.message?.content || res?.text || res || '{}').trim();
      return JSON.parse(txt);
    }
  } catch (e) {
    log('ai_decision', 'error', 'PUTER_ERROR', e?.message || String(e), { orderId: context.orderPack.order_id, username: context.orderPack.buyer_username });
  }
  return { intent: 'STATUS', send_allowed: false, escalate: false, is_customer_right: 'UNKNOWN', template_id: 'TPL_STATUS', reply: context.templates[0]?.text || '', admin_note: 'Puter.js yok, fallback kullanıldı.', ask: '' };
}

async function onReadMessages() {
  const order = getSelectedOrder();
  if (!order) return;
  state.lastMessagePack = await readThreadMessages({ buyerUsername: order.buyer_username, orderId: order.order_id, limit: 8 });
  log('read_messages', 'info', `count:${state.lastMessagePack.messages.length}`, '', { orderId: order.order_id, username: order.buyer_username });
  renderLogs();
}

async function onAiDraft() {
  const order = getSelectedOrder(); if (!order) return;
  if (!state.lastMessagePack?.messages?.length) await onReadMessages();
  const smm = order?.smm_id ? recordStore.smmOrders.get(String(order.smm_id)) : null;
  const templates = getTemplatePack(order, smm).slice(0, 4);
  const context = { mode: state.aiMode, orderPack: { order_id: order.order_id, status: smm?.status || order.status, buyer_username: order.buyer_username, service_short: smm?.service_full || '' }, messagePack: { messages: (state.lastMessagePack?.messages || []).slice(-8) }, templates };
  const decisionRaw = await runPuterDecision(context);
  const decision = coerceDecision(decisionRaw, state.aiMode);
  const statusUpper = String(context.orderPack.status || '').toUpperCase();
  if (['IADE','SORUNLU'].includes(statusUpper)) {
    decision.send_allowed = false; decision.escalate = true;
  }
  state.lastDecision = decision;
  refs.aiDraftText.value = String(decision.reply || '').slice(0, 700);
  refs.aiAdminNote.textContent = String(decision.admin_note || '').slice(0, 300);
  refs.aiAdminNote.classList.toggle('hidden', !decision.admin_note);
  refs.btnAdminAlerts.classList.toggle('hidden', !decision.escalate);
  log('ai_draft', 'info', decision.template_id, '', { orderId: order.order_id, username: order.buyer_username });
  log('ai_decision', decision.escalate ? 'warn' : 'info', `${decision.intent}|send:${decision.send_allowed}|esc:${decision.escalate}`, '', { orderId: order.order_id, username: order.buyer_username });

  if (state.aiMode === 'AUTOPILOT' && decision.send_allowed && !decision.escalate) {
    // SCOD: BU GEREKSİNİM UYGULANDI - autopilot gate yalnız güvenli kararda otomatik gönderim yapar.
    const result = await sendMessage({ buyerUsername: order.buyer_username, orderId: order.order_id, text: refs.aiDraftText.value, dryRun: state.dryRun });
    log('autopilot_send', result === 'SENT' || result === 'DRY_RUN' ? 'info' : 'error', result, '', { orderId: order.order_id, username: order.buyer_username });
  }
  renderLogs();
}

async function startScan() {
  if (state.isRunning) return;
  state.isRunning = true;
  refs.btnStart.disabled = true; refs.btnStop.disabled = false;
  state.abortController = new AbortController();
  recordStore.orders.clear(); recordStore.smmOrders.clear();
  refs.scanStateBadge.textContent = 'Taranıyor';

  const { orders } = await taraHesap({ mode: state.mode, statusFilters: state.statusFilters, pageLimit: state.pageLimit, searchQuery: state.searchQuery, abortSignal: state.abortController.signal });
  orders.forEach(o => recordStore.upsertOrder(o));
  const smmIds = orders.map(o => o.smm_id).filter(Boolean);
  if (smmIds.length) {
    const { orders: smmOrders } = await taraAnabayiniz({ smmIds, abortSignal: state.abortController.signal });
    smmOrders.forEach(o => recordStore.upsertSmmOrder(o));
  }
  renderOrdersTable();
  refs.scanStateBadge.textContent = 'Bitti';
  state.isRunning = false;
  refs.btnStart.disabled = false; refs.btnStop.disabled = true;
}

function stopScan() {
  state.abortController?.abort?.();
  state.isRunning = false;
  refs.btnStart.disabled = false; refs.btnStop.disabled = true;
  refs.scanStateBadge.textContent = 'Durduruldu';
}

function attachEvents() {
  refs.modeSelect.addEventListener('change', () => state.mode = refs.modeSelect.value);
  refs.statusSelect.addEventListener('change', () => state.statusFilters = Array.from(refs.statusSelect.selectedOptions).map(x => x.value));
  refs.searchInput.addEventListener('input', () => { state.searchQuery = refs.searchInput.value.trim(); renderOrdersTable(); });
  refs.pageLimitInput.addEventListener('input', () => state.pageLimit = Math.max(1, Number(refs.pageLimitInput.value || 1)));
  refs.autoSendToggle.addEventListener('change', () => state.autoSend = refs.autoSendToggle.checked);
  refs.dryRunToggle.addEventListener('change', () => state.dryRun = refs.dryRunToggle.checked);
  refs.btnStart.addEventListener('click', startScan); refs.btnStop.addEventListener('click', stopScan);

  [refs.aiModeTemplate, refs.aiModeManual, refs.aiModeAutopilot].forEach(r => r?.addEventListener('change', () => {
    state.aiMode = document.querySelector('input[name="aiMode"]:checked')?.value || 'TEMPLATE';
    applyAiModeUI();
  }));

  refs.btnReadCustomerMessages.addEventListener('click', onReadMessages);
  refs.btnAiDraft.addEventListener('click', onAiDraft);
  refs.btnAdminAlerts.addEventListener('click', () => {
    const d = state.lastDecision || {};
    alert(`YÖNETİCİ NOTU:\n${d.admin_note || '-'}\n\nMÜŞTERİ İDDİASI:\n${state.lastMessagePack?.messages?.slice(-1)?.[0]?.text || '-'}\n\nSİSTEM GERÇEĞİ:\n${getSelectedOrder()?.status || '-'}`);
    log('admin_alert', 'warn', 'shown', '', { orderId: getSelectedOrder()?.order_id, username: getSelectedOrder()?.buyer_username });
    renderLogs();
  });
  refs.btnOpenMessagePage.addEventListener('click', () => {
    const o = getSelectedOrder();
    if (!o?.buyer_username) return log('open_message_page', 'warn', 'username_missing');
    openMessagePage(o.buyer_username);
    log('open_message_page', 'info', 'opened', '', { orderId: o.order_id, username: o.buyer_username });
    renderLogs();
  });

  refs.btnSendReply.addEventListener('click', async () => {
    const o = getSelectedOrder(); if (!o) return;
    // SADM: BU GEREKSİNİM UYGULANDI - TEMPLATE/MANUAL gönderimi admin butonuna bırakıldı.
    const result = await sendMessage({ buyerUsername: o.buyer_username, orderId: o.order_id, text: refs.aiDraftText.value, dryRun: state.dryRun });
    log('autopilot_send', result === 'SENT' || result === 'DRY_RUN' ? 'info' : 'error', result, '', { orderId: o.order_id, username: o.buyer_username });
    renderLogs();
  });

  refs.btnGenerateTemplate.addEventListener('click', () => {
    const o = getSelectedOrder();
    const smm = o?.smm_id ? recordStore.smmOrders.get(String(o.smm_id)) : null;
    refs.messagePreview.value = generateMessage(o, smm, refs.templateSelect.value);
    refs.policyWarning.classList.toggle('hidden', checkPolicy(refs.messagePreview.value));
  });
  refs.btnCopyMessage.addEventListener('click', () => navigator.clipboard?.writeText?.(refs.messagePreview.value || ''));

  refs.logLevelFilter.addEventListener('change', renderLogs);
  refs.logPageFilter.addEventListener('change', renderLogs);
  refs.logSourceFilter.addEventListener('change', renderLogs);
  refs.logSearchInput.addEventListener('input', renderLogs);
  refs.btnClearLogs.addEventListener('click', () => { if (confirm('Loglar temizlensin mi?')) { LogManager.clear(); renderLogs(); } });
  refs.btnExportLogs.addEventListener('click', () => {
    const txt = LogManager.exportJsonl({ level: refs.logLevelFilter.value, search: refs.logSearchInput.value, page: refs.logPageFilter.value, source: refs.logSourceFilter.value });
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'})); a.download=`patpat_logs_${Date.now()}.jsonl`; a.click();
  });
}

function wireLogPanelState() {
  const key = 'PATPAT_LOG_PANEL_CLOSED';
  const apply = (closed) => { refs.app.classList.toggle('logs-closed', closed); refs.logStateBtn.textContent = closed ? 'AÇ ▼' : 'KAPAT ▲'; localStorage.setItem(key, closed ? '1':'0'); };
  apply(localStorage.getItem(key) === '1');
  refs.logToggle.addEventListener('click', (ev) => { if (ev.target.closest('[data-stop-toggle="1"]')) return; apply(!refs.app.classList.contains('logs-closed')); });
}

async function init() {
  initRefs(); attachEvents(); wireLogPanelState();
  await LogManager.init(); LogManager.subscribe(renderLogs);
  renderOrdersTable(); renderLogs(); setAiControlsEnabled(false); applyAiModeUI();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
