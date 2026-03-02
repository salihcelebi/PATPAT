/*
 * kurallar_dom_regex_url.js
 * Bu modül, DOM seçicileri, regex kuralları ve URL yardımcılarını tek bir
 * merkezde toplar. Sipariş kartlarını, alıcı/satıcı bilgilerini, mesaj
 * bileşenlerini ve SMM tablolarını yakalamak için kullanılan tüm kurallar
 * burada tanımlanır. Ayrıca URL sayfalama ve normalizasyon yardımcıları da
 * mevcuttur.
 */

// OrderCardRules: sipariş kartı DOM kökleri
export class OrderCardRules {
  static ORDER_CARD_ROOT = '.modern-order-card[data-order-id]';
  static ORDER_CARD_ROOT_EXACT(orderId) {
    return `.modern-order-card[data-order-id="${orderId}"]`;
  }
  static ORDER_ID_TEXT_SPAN = '.modern-order-card .modern-order-id span';
  static ORDER_ACTIONS_BLOCK = '.modern-order-actions';
}

// OrderIdRules: sipariş id’lerini çıkarma regex’leri
export class OrderIdRules {
  static RX_HASH_ORDER_ID = /#(\d{4,})/;
  static RX_HASH_ORDER_ID_GLOBAL = /#(\d{4,})/g;
  static RX_HASH_ORDER_ID_START = /^#(\d+)\b/;
  static RX_SEARCH_PARAM_1 = /[?&]search=(\d+)/;
  static RX_SEARCH_PARAM_2 = /\bsearch=(\d+)\b/;
  static RX_MSG_HASH_ORDER_ID = /#(\d{4,})/;
  static RX_MSG_BARE_ORDER_ID = /\b(\d{6,})\b/;

  static extractFromText(text) {
    const m = String(text ?? '').match(this.RX_HASH_ORDER_ID);
    return m ? m[1] : null;
  }
  static extractFromUrl(url) {
    const s = String(url ?? '');
    const m1 = s.match(this.RX_SEARCH_PARAM_1);
    if (m1) return m1[1];
    const m2 = s.match(this.RX_SEARCH_PARAM_2);
    return m2 ? m2[1] : null;
  }
}

// BuyerRules: sipariş kartından müşteri profil linki ve adı
export class BuyerRules {
  static BUYER_PROFILE_LINK_IN_CARD_EXACT(orderId) {
    return `.modern-order-card[data-order-id="${orderId}"] .modern-order-actions a[href^="https://hesap.com.tr/u/"]`;
  }
  static BUYER_PROFILE_LINK_IN_CARD = '.modern-order-actions a[href^="https://hesap.com.tr/u/"]';
  static BUYER_USERNAME_SPAN_IN_CARD = '.modern-order-actions a[href^="https://hesap.com.tr/u/"] span';
  static RX_USERNAME_FROM_PROFILE_URL = /\/u\/([a-z0-9._-]+)/i;
  static ALL_PROFILE_LINKS = 'a[href^="https://hesap.com.tr/u/"], a[href^="/u/"]';

  static extractUsernameFromProfileUrl(profileUrl) {
    const m = String(profileUrl ?? '').match(this.RX_USERNAME_FROM_PROFILE_URL);
    return m ? m[1] : null;
  }
  static findBuyerUsernameFromOrderCard(orderCardEl, myUsername = 'iqdatam') {
    const links = Array.from(orderCardEl?.querySelectorAll?.('a[href*="/u/"]') ?? []);
    const usernames = links
      .map(a => a.getAttribute('href'))
      .filter(Boolean)
      .map(href => this.extractUsernameFromProfileUrl(href))
      .filter(Boolean);
    const buyer = usernames.find(u => u.toLowerCase() !== String(myUsername).toLowerCase());
    return buyer || null;
  }
}

// SellerRules: satıcı kimliğini header’dan okur
export class SellerRules {
  static SELLER_AVATAR_EXACT(username) {
    return `a.avatar[href="https://hesap.com.tr/u/${username}"]`;
  }
  static SELLER_NAME_EXACT(username) {
    return `a.name[title="${username}"]`;
  }
  static SELLER_AVATAR_GENERAL = '.header-user a.avatar[href*="/u/"]';
  static SELLER_NAME_GENERAL = '.header-user a.name[title]';
  static getMyUsernameFromHeader(doc = document) {
    const el = doc.querySelector(this.SELLER_NAME_GENERAL);
    return el?.getAttribute('title') || el?.textContent?.trim() || null;
  }
  static getMyProfileUrlFromHeader(doc = document) {
    const el = doc.querySelector(this.SELLER_AVATAR_GENERAL);
    return el?.getAttribute('href') || null;
  }
}

// NotificationRules: bildirim panelinden sipariş id’leri çıkarır
export class NotificationRules {
  static NOTIFICATION_LINKS = '.dropdown-notification a[href*="/p/bildirim/"]';
  static NOTIFICATION_TITLE_HAS_ORDER = 'a[title*="sipariş"]';
  static RX_HASH_ORDER_ID_GLOBAL = /#(\d{4,})/g;
  static RX_HASH_ORDER_ID_START = /^#(\d+)\b/;
  static extractOrderIdsFromNotificationText(text) {
    const s = String(text ?? '');
    const out = [];
    let m;
    while ((m = this.RX_HASH_ORDER_ID_GLOBAL.exec(s))) out.push(m[1]);
    return out;
  }
}

// MessagesNavRules: mesajlar sayfa linki
export class MessagesNavRules {
  static MESSAGES_LINK = 'a[href="https://hesap.com.tr/p/mesajlar"]';
  static MESSAGE_COUNT_BADGE = '#messagecount';
}

// MessagesThreadMatchRules: thread bulma
export class MessagesThreadMatchRules {
  static THREAD_LINKS_1 = 'a[href*="/p/mesajlar"]';
  static THREAD_LINKS_2 = 'a[href*="mesaj"]';
  static RX_MSG_HASH_ORDER_ID = /#(\d{4,})/;
  static RX_MSG_BARE_ORDER_ID = /\b(\d{6,})\b/;
  static findThreadByBuyerUsername(doc, buyerUsername) {
    const uname = String(buyerUsername ?? '').trim();
    if (!uname) return null;
    const candidates = [
      ...doc.querySelectorAll(this.THREAD_LINKS_1),
      ...doc.querySelectorAll(this.THREAD_LINKS_2),
      ...doc.querySelectorAll('a'),
      ...doc.querySelectorAll('div'),
    ];
    return candidates.find(el => (el.textContent || '').includes(uname)) || null;
  }
  static findThreadByOrderId(doc, orderId) {
    const oid = String(orderId ?? '').trim();
    if (!oid) return null;
    const candidates = [
      ...doc.querySelectorAll(this.THREAD_LINKS_1),
      ...doc.querySelectorAll(this.THREAD_LINKS_2),
      ...doc.querySelectorAll('a'),
      ...doc.querySelectorAll('div'),
    ];
    return (
      candidates.find(el => {
        const t = el.textContent || '';
        return t.includes(`#${oid}`) || t.includes(oid);
      }) || null
    );
  }
}

// MessageComposeRules: mesaj yazma ve gönderme elementleri
export class MessageComposeRules {
  static INPUT_SELECTORS = [
    'textarea',
    'textarea[name*="message" i]',
    'textarea[placeholder*="mesaj" i]',
    '[contenteditable="true"]',
  ];
  static SEND_BUTTON_SELECTORS = [
    'button[type="submit"]',
    'form button[type="submit"]',
    'button[class*="send" i]',
    'button:has(i)',
  ];
  static findMessageInput(doc = document) {
    for (const sel of this.INPUT_SELECTORS) {
      const el = doc.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  static findSendButton(doc = document) {
    for (const sel of this.SEND_BUTTON_SELECTORS) {
      const el = doc.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
}

// CsrfRules: meta token okur
export class CsrfRules {
  static CSRF_META = 'meta[name="csrf-token"]';
  static getCsrfTokenFromMeta(doc = document) {
    return doc.querySelector(this.CSRF_META)?.getAttribute('content') || null;
  }
}

// SmmOrderMetaRules: .smmYenidenGonderBtn butonundan sipariş bağlamı
export class SmmOrderMetaRules {
  static SMM_BUTTON = '.smmYenidenGonderBtn';
  static ATTR_ORDER_ID = 'data-orderid';
  static ATTR_ORDER_LINK = 'data-orderlink';
  static ATTR_QUANTITY = 'data-quantity';
  static ATTR_SMM_ID = 'data-smmid';
  static readMetaFromButton(btnEl) {
    if (!btnEl) return null;
    return {
      orderid: btnEl.getAttribute(this.ATTR_ORDER_ID),
      orderlink: btnEl.getAttribute(this.ATTR_ORDER_LINK),
      quantity: btnEl.getAttribute(this.ATTR_QUANTITY),
      smmid: btnEl.getAttribute(this.ATTR_SMM_ID),
    };
  }
}

// SmmOrdersUrlRules: anabayiniz.com sipariş URL’lerini tespit eder
export class SmmOrdersUrlRules {
  static RX_ORDERS_PAGE = /^https?:\/\/(?:www\.)?anabayiniz\.com(?:\/tr)?\/orders(?:\/(pending|inprogress|completed|partial|processing|canceled))?\/?(?:\?.*)?$/i;
  static isOrdersUrl(url) {
    return this.RX_ORDERS_PAGE.test(String(url || ''));
  }
}

// SmmOrdersDom: sipariş tablosu ve alan seçicileri
export class SmmOrdersDom {
  static PAGE_TITLE = 'h4';
  static SEARCH_FORM = 'form#history-search[action="/orders"][method="get"]';
  static SEARCH_INPUT = 'form#history-search input[name="search"].form-control';
  static STATUS_TAB_LINKS = '.component_status_tabs ul.nav.nav-pills.tab a.nav-link';
  static TABLE_ROWS = '.orders-history__margin-table .table-bg .table-wr table.table tbody tr';
  static TD_ID = 'td[data-label="ID"]';
  static TD_DATE = 'td[data-label="Tarih"]';
  static TD_LINK = 'td[data-label="Sipariş Linki"].table-link a[target="_blank"]';
  static TD_PRICE = 'td[data-label="Fiyat"]';
  static TD_START = 'td[data-label="Başlangıç"]';
  static TD_QTY = 'td[data-label="Miktar"]';
  static TD_SERVICE = 'td[data-label="Servis"].table-service';
  static TD_STATUS = 'td[data-label="Sipariş Durumu"]';
  static TD_REMAINS = 'td[data-label="Kalan"]';
}

// SmmOrdersRegex: tablo satırlarından veri çıkarmak için regex seti
export class SmmOrdersRegex {
  static RX_INT = /^\s*(\d+)\s*$/;
  static RX_DECIMAL = /^\s*(-?\d+(?:\.\d+)?)\s*$/;
  static RX_DATE_YYYY_MM_DD = /^\s*(\d{4}-\d{2}-\d{2})\s*$/;
  static RX_TIME_HH_MM_SS = /^\s*(\d{2}:\d{2}:\d{2})\s*$/;
  static RX_ANON_R_PARAM = /[?&]r=([^&]+)/i;
  static RX_SERVICE_ROW = /^\s*(\d+)\s*(?:—|--|-)?\s*(.+?)\s*$/;
  static RX_PLATFORM = /\b(tiktok|instagram|youtube)\b/i;
  static RX_SERVICE_TYPE = /\b(beğeni|begeni|takipçi|takipci|izlenme|yorum|kaydet|paylaş|paylas|abone|premium)\b/i;
  static RX_EMOJI_LIKE = /[^\p{L}\p{N}\s\|\-:._/]+/gu;
}

// SmmOrdersParsers: tablo hücrelerini işler
export class SmmOrdersParsers {
  static text(el) {
    return (el?.textContent || '').trim();
  }
  static intFromText(t) {
    const m = String(t || '').match(SmmOrdersRegex.RX_INT);
    return m ? Number(m[1]) : null;
  }
  static decimalFromText(t) {
    const m = String(t || '').match(SmmOrdersRegex.RX_DECIMAL);
    return m ? Number(m[1]) : null;
  }
  static extractDateTimeFromTd(tdDateEl) {
    const spans = Array.from(tdDateEl?.querySelectorAll?.('span.nowrap') || []);
    const dateStr = this.text(spans[0]);
    const timeStr = this.text(spans[1]);
    const date = SmmOrdersRegex.RX_DATE_YYYY_MM_DD.test(dateStr) ? dateStr : null;
    const time = SmmOrdersRegex.RX_TIME_HH_MM_SS.test(timeStr) ? timeStr : null;
    return { date, time, iso: date && time ? `${date}T${time}` : null };
  }
  static resolveOrderLink(aEl) {
    const href = aEl?.getAttribute?.('href') || '';
    const txt = this.text(aEl);
    const m = href.match(SmmOrdersRegex.RX_ANON_R_PARAM);
    if (m?.[1]) {
      try {
        return decodeURIComponent(m[1]);
      } catch {
        return m[1];
      }
    }
    if (/^https?:\/\//i.test(href)) return href;
    if (/^https?:\/\//i.test(txt)) return txt;
    return href || txt || null;
  }
  static parseServiceCell(serviceTextRaw) {
    const raw = String(serviceTextRaw || '').trim();
    const m = raw.match(SmmOrdersRegex.RX_SERVICE_ROW);
    const serviceId = m ? Number(m[1]) : null;
    const serviceFull = m ? m[2].trim() : raw;
    const platform = (serviceFull.match(SmmOrdersRegex.RX_PLATFORM)?.[1] || '').toLowerCase() || null;
    const serviceType = (serviceFull.match(SmmOrdersRegex.RX_SERVICE_TYPE)?.[1] || '').toLowerCase() || null;
    const serviceNameClean = serviceFull.replace(SmmOrdersRegex.RX_EMOJI_LIKE, '').trim();
    return {
      service_id: serviceId,
      service_full: serviceFull,
      platform,
      service_type: serviceType,
      service_name_clean: serviceNameClean,
    };
  }
  static normalizeStatus(statusText) {
    return String(statusText || '').trim();
  }
}

// SmmOrdersRowExtractor: <tr> satırından SMM sipariş satırı çıkarır
export class SmmOrdersRowExtractor {
  static extractFromRow(tr) {
    const id = SmmOrdersParsers.intFromText(
      SmmOrdersParsers.text(tr.querySelector(SmmOrdersDom.TD_ID))
    );
    const dt = SmmOrdersParsers.extractDateTimeFromTd(tr.querySelector(SmmOrdersDom.TD_DATE));
    const orderLink = SmmOrdersParsers.resolveOrderLink(tr.querySelector(SmmOrdersDom.TD_LINK));
    const price = SmmOrdersParsers.decimalFromText(
      SmmOrdersParsers.text(tr.querySelector(SmmOrdersDom.TD_PRICE))
    );
    const start = SmmOrdersParsers.intFromText(
      SmmOrdersParsers.text(tr.querySelector(SmmOrdersDom.TD_START))
    );
    const qty = SmmOrdersParsers.intFromText(
      SmmOrdersParsers.text(tr.querySelector(SmmOrdersDom.TD_QTY))
    );
    const service = SmmOrdersParsers.parseServiceCell(
      SmmOrdersParsers.text(tr.querySelector(SmmOrdersDom.TD_SERVICE))
    );
    const status = SmmOrdersParsers.normalizeStatus(
      SmmOrdersParsers.text(tr.querySelector(SmmOrdersDom.TD_STATUS))
    );
    const remains = SmmOrdersParsers.intFromText(
      SmmOrdersParsers.text(tr.querySelector(SmmOrdersDom.TD_REMAINS))
    );
    return {
      order_id: id,
      date: dt.date,
      time: dt.time,
      datetime_iso: dt.iso,
      order_link: orderLink,
      price,
      start_count: start,
      quantity: qty,
      service_id: service.service_id,
      service_full: service.service_full,
      platform: service.platform,
      service_type: service.service_type,
      service_name_clean: service.service_name_clean,
      status,
      remains,
    };
  }
}

// SmmOrdersPageExtractor: SMM sipariş sayfasından verileri toplar
export class SmmOrdersPageExtractor {
  static getSearchValue(doc = document) {
    return doc.querySelector(SmmOrdersDom.SEARCH_INPUT)?.value?.trim() || null;
  }
  static getStatusTabs(doc = document) {
    return Array.from(doc.querySelectorAll(SmmOrdersDom.STATUS_TAB_LINKS)).map(a => ({
      label: (a.textContent || '').trim(),
      href: a.getAttribute('href') || null,
      isActive: a.classList.contains('active'),
    }));
  }
  static extractAllOrders(doc = document) {
    const rows = Array.from(doc.querySelectorAll(SmmOrdersDom.TABLE_ROWS));
    return rows.map(tr => SmmOrdersRowExtractor.extractFromRow(tr)).filter(o => o.order_id);
  }
  static getBalance(doc = document) {
    // örneğin bakiye bilgisi; UI’de kullanılmaz ama log için tutulabilir
    return null;
  }
  static getCurrencies(doc = document) {
    return [];
  }
}

// SmmOrdersCsrfRules: inline js’ten csrftoken okur
export class SmmOrdersCsrfRules {
  static RX_CSRF_FROM_INLINE = /"csrftoken"\s*:\s*"([^"]+)"/i;
  static getCsrfFromWindow(win = window) {
    return win?.modules?.layouts?.csrftoken || null;
  }
  static getCsrfFromHtml(htmlText) {
    const m = String(htmlText || '').match(this.RX_CSRF_FROM_INLINE);
    return m ? m[1] : null;
  }
}

// SmmOrdersMinimalSchema: saklanacak order alanlarını tanımlar
export class SmmOrdersMinimalSchema {
  static ORDER_COLUMNS = [
    'order_id','date','time','datetime_iso','order_link','price','start_count','quantity','service_id','service_full','platform','service_type','service_name_clean','status','remains','scraped_at','source_url','search_value',
  ];
  static toStoredRow(orderRow, ctx = {}) {
    return {
      ...orderRow,
      scraped_at: new Date().toISOString(),
      source_url: ctx.source_url || (typeof location !== 'undefined' ? location.href : ''),
      search_value: ctx.search_value ?? null,
    };
  }
}

// URL yardımcıları
export function buildPagedUrl(baseUrl, pageNo) {
  const u = String(baseUrl);
  return u.includes('?') ? `${u}&page=${pageNo}` : `${u}?page=${pageNo}`;
}
export function buildStatusUrl(status) {
  return `https://hesap.com.tr/p/sattigim-ilanlar?status=${encodeURIComponent(status)}`;
}
export function buildStatusPageUrl(status, pageNo) {
  const base = buildStatusUrl(status);
  return buildPagedUrl(base, pageNo);
}
export function getQueryParam(url, name) {
  const u = new URL(url, location.origin);
  return u.searchParams.get(name);
}
export function setQueryParam(url, name, value) {
  const u = new URL(url, location.origin);
  u.searchParams.set(name, value);
  return u.toString();
}
// DOM yardımcıları
export function queryOne(doc, sel) {
  return doc.querySelector(sel);
}
export function queryAll(doc, sel) {
  return Array.from(doc.querySelectorAll(sel));
}
export function text(el) {
  return (el?.textContent || '').trim();
}
// Hash helper: basit hash fonksiyonu
export function sampleTextHash(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(h)}`;
}
// Version etiketini loglarda kullanmak üzere dışa aktar
export const RULESET_VERSION = '1.0.0';
// HesapProfileUrlRules: kullanıcı profil URL kuralları
export class HesapProfileUrlRules {
  static BASE = 'https://hesap.com.tr';
  static RX_USERNAME = /^[a-zA-Z0-9._-]{2,64}$/;

  static sanitizeUsername(username) {
    const raw = String(username || '').trim().replace(/^@/, '');
    return this.RX_USERNAME.test(raw) ? raw : '';
  }

  static buildProfileUrl(username) {
    const u = this.sanitizeUsername(username);
    return u ? `${this.BASE}/u/${u}` : '';
  }
}
