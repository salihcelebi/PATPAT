/*
 * eslestirme_ve_sablonlar.js
 */

const AY_ADLARI = ['OCAK','ŞUBAT','MART','NİSAN','MAYIS','HAZİRAN','TEMMUZ','AĞUSTOS','EYLÜL','EKİM','KASIM','ARALIK'];

export function formatDateTR(dateStr) {
  if (!dateStr) return '';
  const iso = String(dateStr).slice(0, 10);
  const parts = iso.split('-');
  if (parts.length !== 3) return String(dateStr);
  const [y, m, d] = parts.map(Number);
  const ay = AY_ADLARI[(m || 1) - 1] || '';
  return `${d} ${ay} ${y}`;
}

export function normalizeServiceShort(serviceText) {
  const raw = String(serviceText || '').trim();
  if (!raw) return '';
  const cut = raw.split('|')[0].split('-')[0].trim();
  return cut || raw;
}

function statusTR(s) {
  const m = {
    pending: 'BEKLEMEDE', processing: 'YÜKLENİYOR', completed: 'TAMAMLANDI', cancelled: 'İPTAL',
    returnprocess: 'İADE', problematic: 'SORUNLU', partial: 'KISMİ', inprogress: 'YÜKLENİYOR',
  };
  return m[String(s || '').toLowerCase()] || String(s || '').toUpperCase();
}

export function getTemplatePack(orderRow = {}, smmRow = {}) {
  const vars = {
    '{DATE_TR}': formatDateTR(smmRow.date || orderRow.scraped_at || ''),
    '{ORDER_ID}': String(orderRow.order_id || smmRow.order_id || ''),
    '{LINK}': String(smmRow.order_link || orderRow.ilan_url || ''),
    '{SERVICE_SHORT}': normalizeServiceShort(smmRow.service_full || ''),
    '{STATUS}': statusTR(smmRow.status || orderRow.status || ''),
    '{REMAINING}': String(smmRow.remains ?? '-'),
  };
  // SCOD: BU GEREKSİNİM UYGULANDI - minimum 4 kısa template paketi sabitlendi.
  const templates = [
    { id: 'TPL_STATUS', text: 'Merhaba, {DATE_TR} tarihli {ORDER_ID} siparişiniz {STATUS}. Kayıtlara göre hizmet: {SERVICE_SHORT}.' },
    { id: 'TPL_DONE', text: 'Merhaba, {ORDER_ID} siparişiniz kayıtlarımıza göre tamamlandı. Link: {LINK}.' },
    { id: 'TPL_REFUND', text: 'Merhaba, {ORDER_ID} için kayıtlarımıza göre iade/iptal süreci açık. Kalan: {REMAINING}.' },
    { id: 'TPL_PROBLEM', text: 'Merhaba, {ORDER_ID} siparişinizde sorun kaydı var. Kayıtlara göre kontrol edip dönüş yapacağız.' },
  ];
  const applyVars = (t) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(k, v), t);
  return templates.map(t => ({ ...t, text: applyVars(t.text) }));
}

export function matchOrderAndSmm(orderRow, smmRow) {
  if (!orderRow || !smmRow) return { matched: false, method: 'none', confidence: 0 };
  const matched = String(orderRow.smm_id || '') === String(smmRow.order_id || '');
  return { matched, method: matched ? 'smm_id' : 'none', confidence: matched ? 95 : 35 };
}

export function checkPolicy(text) {
  return !/(\bmax\b|\bhiz\b|\bfiyat\b)/i.test(String(text || ''));
}

export function generateMessage(orderRow, smmRow, type = 'auto') {
  const pack = getTemplatePack(orderRow, smmRow);
  if (type === 'complaint') return pack.find(x => x.id === 'TPL_PROBLEM')?.text || '';
  return pack.find(x => x.id === 'TPL_STATUS')?.text || '';
}

export default { matchOrderAndSmm, generateMessage, checkPolicy, getTemplatePack, normalizeServiceShort, formatDateTR };
