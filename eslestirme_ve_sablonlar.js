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
export function generateMessage(orderRow, smmRow, type = 'auto') {
  const paketMiktari = extractPackageQuantity(smmRow?.service_full);
  const tarihGunAy = formatDateToTr(smmRow?.date);
  const durumTrMap = {
    'pending': 'BEKLEMEDE',
    'processing': 'YÜKLENİYOR',
    'completed': 'TAMAMLANDI',
    'cancelled': 'İPTAL',
    'partial': 'KISMİ',
    'inprogress': 'DEVAM EDİYOR',
    'inprogres': 'DEVAM EDİYOR',
    'returnprocess': 'İADE SÜRECİ',
    'problematic': 'SORUNLU',
  };
  const durumTr = durumTrMap[String(smmRow?.status || '').toLowerCase()] || (smmRow?.status || '');
  if (type === 'complaint') {
    return `DEĞERLİ MÜŞTERİMİZ;\n${tarihGunAy} VERMİŞ OLDUĞUNUZ ${smmRow?.order_id || ''} ID NOLU SİPARİŞİNİZ İÇİN AYRINTILAR AŞAĞIDAKİ GİBİDİR\nŞU URL İÇİN HİZMET ALDINIZ  : ${smmRow?.order_link || ''}\nŞU KADAR MİKTAR ALDINIZ : ${paketMiktari ?? 'BİLGİ ALINAMADI'}\nBİZİM SİZE ${durumTr === 'TAMAMLANDI' ? 'GÖNDERDİĞİMİZ' : 'GÖNDERECEĞİMİZ'} ADET : ${smmRow?.quantity ?? ''}\nHİZMETİ BİZDEN ALMADAN ÖNCE SAYI : ${smmRow?.start_count ?? ''} İDİ\nHİZMET DURUMU : ŞU ANDA ${durumTr}`;
  }
  // auto info
  return `DEĞERLİ MÜŞTERİMİZ;\n${tarihGunAy} TARİHLİ ${smmRow?.order_id || ''} ID NOLU SİPARİŞİNİZ ${durumTr} DURUMUNDADIR.\nHERHANGİ BİR İSTEĞİNİZ OLURSA EN GEÇ 5-6 SAAT İÇERİSİNDE CEVAPLIYORUZ`;
}

// Exported functions for other modules
export default {
  matchOrderAndSmm,
  generateMessage,
  checkPolicy,
  extractPackageQuantity,
  formatDateToTr,
};