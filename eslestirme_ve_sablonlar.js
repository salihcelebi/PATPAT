/*
 * eslestirme_ve_sablonlar.js
 * Sipariş kayıtları ile SMM detay kayıtlarını eşleştirme ve otomatik
 * mesaj şablonları üretme fonksiyonlarını içerir. Eşleştirme güven
 * puanı hesaplar, servis metinlerinden paket miktarı çıkarır ve tarihleri
 * Türkçe gün/ay formatına çevirir. Mesaj politikasına uygunluk da
 * burada kontrol edilir.
 */

// Türkçe ay adları
const AY_ADLARI = [
  'OCAK','ŞUBAT','MART','NİSAN','MAYIS','HAZİRAN','TEMMUZ','AĞUSTOS','EYLÜL','EKİM','KASIM','ARALIK'
];

/**
 * YYYY-MM-DD veya DD-MM-YYYY string’ini “{GÜN} {AY_ADI}TA” formatına çevirir.
 * @param {string} dateStr
 */
export function formatDateToTr(dateStr) {
  if (!dateStr) return '';
  let y, m, d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    [y, m, d] = dateStr.split('-');
  } else if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    [d, m, y] = dateStr.split('-');
  } else {
    return dateStr;
  }
  const monthName = AY_ADLARI[parseInt(m, 10) - 1] || '';
  return `${parseInt(d, 10)} ${monthName}TA`;
}

/**
 * Servis başlığından paket miktarını çıkarır. HIZ/MAX/FİYAT ibarelerini
 * temizledikten sonra kalan metindeki ilk anlamlı sayıyı döndürür.
 * @param {string} serviceText
 * @returns {number|null}
 */
export function extractPackageQuantity(serviceText) {
  if (!serviceText) return null;
  // HIZ / MAX / FİYAT parçalarını kaldır
  const cleaned = String(serviceText)
    .replace(/\bHız\s*:\s*Günlük\s*\d+\w*/gi, '')
    .replace(/\bMax\s*\d+\w*/gi, '')
    .replace(/\bFiyat\b.*$/gi, '')
    .replace(/[^0-9\s]/g, ' ');
  const nums = cleaned.split(/\s+/).filter(x => /\d+/.test(x));
  return nums.length ? parseInt(nums[0], 10) : null;
}

/**
 * Eşleştirme güven puanı hesaplar.
 * @param {Object} params
 */
function calculateConfidence({ orderId, smmId, buyerUsername }) {
  let score = 0;
  if (orderId) score += 50;
  if (smmId) score += 40;
  if (buyerUsername) score += 10;
  return Math.min(100, score);
}

/**
 * Sipariş kaydı ile SMM kaydını eşleştirir. Eğer smm_id eşleşiyorsa
 * eşleştirme doğrudan yapılır; aksi takdirde order_id veya buyer adı üzerinden
 * zayıf bir eşleştirme denenir.
 * @param {Object} orderRow sipariş kaydı
 * @param {Object} smmRow smm kaydı
 */
export function matchOrderAndSmm(orderRow, smmRow) {
  let method = 'none';
  let ok = false;
  if (!orderRow || !smmRow) return { matched: false, method };
  // smm_id üzerinden tam eşleşme
  if (orderRow.smm_id && smmRow.order_id && String(orderRow.smm_id) === String(smmRow.order_id)) {
    method = 'smm_id';
    ok = true;
  }
  // order_id üzerinden eşleşme (varsayalım aynı id paylaşılamaz ama fallback)
  else if (orderRow.order_id && smmRow.order_id && String(orderRow.order_id) === String(smmRow.order_id)) {
    method = 'order_id';
    ok = true;
  }
  const confidence = calculateConfidence({ orderId: orderRow.order_id, smmId: smmRow.order_id, buyerUsername: orderRow.buyer_username });
  return { matched: ok, method, confidence };
}

/**
 * Politikaya uygunluk kontrolü: mesaj metninde FİYAT/HIZ/MAX kelimesi
 * geçiyorsa false döner.
 * @param {string} text
 */
export function checkPolicy(text) {
  const re = /(\bmax\b|\bhiz\b|\bfiyat\b)/i;
  return !re.test(String(text || ''));
}

/**
 * Mesaj şablonlarını doldurur. Şikayet yanıtı veya otomatik bilgilendirme
 * formatlarını doldurmak için orderRow ve smmRow bilgileri kullanılır.
 * @param {Object} orderRow
 * @param {Object} smmRow
 * @param {('auto'|'complaint')} type
 */
export function generateMessage(orderRow, smmRow, type = 'auto', rulesPack = null) {
  const paketMiktari = extractPackageQuantity(smmRow?.service_full);
  const tarihGunAy = formatDateToTr(smmRow?.date);

  const fallbackStatusMap = {
    pending: 'BEKLEMEDE',
    processing: 'YÜKLENİYOR',
    completed: 'TAMAMLANDI',
    cancelled: 'İPTAL',
    partial: 'KISMİ',
    inprogress: 'DEVAM EDİYOR',
    inprogres: 'DEVAM EDİYOR',
    returnprocess: 'İADE SÜRECİ',
    problematic: 'SORUNLU',
  };

  const statusMap = rulesPack?.status_map && Object.keys(rulesPack.status_map).length
    ? rulesPack.status_map
    : fallbackStatusMap;

  const durumKey = String(smmRow?.status || '').toLowerCase();
  const durumTr = statusMap[durumKey] || (smmRow?.status || '');

  const tplComplaint = rulesPack?.templates?.COMPLAINT;
  const tplAuto = rulesPack?.templates?.AUTO;

  const vars = {
    TARIH: tarihGunAy || '',
    SMM_ORDER_ID: String(smmRow?.order_id || orderRow?.smm_id || orderRow?.order_id || ''),
    ORDER_LINK: String(smmRow?.order_link || orderRow?.ilan_url || ''),
    PAKET_MIKTARI: paketMiktari ?? 'BİLGİ ALINAMADI',
    QUANTITY: String(smmRow?.quantity ?? ''),
    START_COUNT: String(smmRow?.start_count ?? ''),
    DURUM_TR: String(durumTr || ''),
    GONDERIM_IFADESI: durumTr === 'TAMAMLANDI' ? 'GÖNDERDİĞİMİZ' : 'GÖNDERECEĞİMİZ',
  };

  function fill(template) {
    return String(template || '').replace(/{([A-Z0-9_]+)}/g, (_, key) => (vars[key] ?? ''));
  }

  if (type === 'complaint') {
    if (tplComplaint) return fill(tplComplaint);
    return `DEĞERLİ MÜŞTERİMİZ;
${vars.TARIH} VERMİŞ OLDUĞUNUZ ${vars.SMM_ORDER_ID} ID NOLU SİPARİŞİNİZ İÇİN AYRINTILAR AŞAĞIDAKİ GİBİDİR
ŞU URL İÇİN HİZMET ALDINIZ  : ${vars.ORDER_LINK}
ŞU KADAR MİKTAR ALDINIZ : ${vars.PAKET_MIKTARI}
BİZİM SİZE ${vars.GONDERIM_IFADESI} ADET : ${vars.QUANTITY}
HİZMETİ BİZDEN ALMADAN ÖNCE SAYI : ${vars.START_COUNT} İDİ
HİZMET DURUMU : ŞU ANDA ${vars.DURUM_TR}`;
  }

  if (tplAuto) return fill(tplAuto);
  return `DEĞERLİ MÜŞTERİMİZ;
${vars.TARIH} TARİHLİ ${vars.SMM_ORDER_ID} ID NOLU SİPARİŞİNİZ ${vars.DURUM_TR} DURUMUNDADIR.
HERHANGİ BİR İSTEĞİNİZ OLURSA EN GEÇ 5-6 SAAT İÇERİSİNDE CEVAPLIYORUZ`;
}

// Exported functions for other modules
export default {
  matchOrderAndSmm,
  generateMessage,
  checkPolicy,
  extractPackageQuantity,
  formatDateToTr,
};
