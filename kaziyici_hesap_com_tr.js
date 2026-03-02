/*
 * kaziyici_hesap_com_tr.js
 * HESAP.COM.TR sipariş/şikayet sayfalarını tarayarak sipariş listesi elde
 * etmek için kullanılan kazıyıcı fonksiyonları içerir. Bu modül, mod ve
 * durum filtrelerine göre ana sayfa ve status sayfalarını gezerek sipariş
 * kartlarından temel bilgileri çıkarır. Erken durdurma kuralları ve
 * sayfa limitleri uygulanır.
 */

import {
  OrderCardRules,
  OrderIdRules,
  BuyerRules,
  SellerRules,
  buildPagedUrl,
  buildStatusUrl,
  buildStatusPageUrl,
  sampleTextHash,
  RULESET_VERSION,
} from './kurallar_dom_regex_url.js';
import { LogManager } from './kayit_ve_loglama.js';


// FIX5_FETCH_HTML: gerçek tarama için HTML çekme yardımcıları
async function fetchHtml(url, abortSignal) {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    redirect: 'follow',
    signal: abortSignal,
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  if (!res.ok) {
    const err = new Error(`HTTP_${res.status}`);
    err.code = `HTTP_${res.status}`;
    throw err;
  }
  return await res.text();
}

function normalizeQuery(q) {
  return String(q || '').trim().toLowerCase();
}

function orderMatchesQuery(row, q) {
  if (!q) return true;
  const hay = [
    row.order_id,
    row.status,
    row.ilan_url,
    row.buyer_username,
    row.smm_id,
    row.message_url,
    row.source_url
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

/**
 * Sipariş kartından temel bilgileri çıkarır. Bu fonksiyon, Hesap.com.tr
 * sayfasında bulunan order card elemanından sipariş id, durum ve alıcı
 * bilgilerini toplar. İlan URL’si kart içinde link olarak bulunur.
 *
 * @param {Element} cardEl order card DOM elementi
 * @param {Object} ctx ek bağlam (örneğin status etiketi)
 * @returns {Object} sipariş kaydı
 */
function extractOrderFromCard(cardEl, ctx = {}) {
  const idSpan = cardEl.querySelector(OrderCardRules.ORDER_ID_TEXT_SPAN);
  const orderId = OrderIdRules.extractFromText(idSpan?.textContent);
  const ilanHref = cardEl.querySelector('a[href*="/ilan/"]')?.getAttribute('href') || null;
  const ilanLink = ilanHref ? new URL(ilanHref, ctx.source_url || 'https://hesap.com.tr').toString() : null; // FIX5_CTX_DOC
  const docRef = ctx.doc || document; // FIX5_CTX_DOC
  const seller = SellerRules.getMyUsernameFromHeader(docRef) || null;
  const buyer = BuyerRules.findBuyerUsernameFromOrderCard(cardEl, seller) || null;
  // SMM ID, kart metninde “SMM ID:” var mı?
  let smmId = null;
  const cardText = cardEl.textContent || '';
  const smmMatch = cardText.match(/SMM\s*ID\s*:\s*(\d+)/i);
  if (smmMatch) smmId = smmMatch[1];
  return {
    order_id: orderId,
    status: ctx.status || null,
    ilan_url: ilanLink,
    buyer_username: buyer,
    smm_id: smmId,
    message_url: null,
    source_url: ctx.source_url || '',
    page_no: ctx.page_no,
    scraped_at: new Date().toISOString(),
  };
}

/**
 * Verilen HTML metninden sipariş kartlarını bulur ve extractOrderFromCard ile
 * kayıt objeleri üretir.
 *
 * @param {string} html HTML metni
 * @param {Object} ctx ek bağlam (status, source_url, page_no)
 * @returns {Array<Object>} sipariş kayıtları
 */
export function parseHesapOrdersFromHtml(html, ctx = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const cardNodes = Array.from(doc.querySelectorAll(OrderCardRules.ORDER_CARD_ROOT));
  const orders = cardNodes.map(card => extractOrderFromCard(card, { ...ctx, doc })).filter(o => o.order_id);
  return orders;
}

/**
 * HESAP.COM.TR tarayıcısı. Bu fonksiyon, verilen mod ve filtrelere göre
 * siparişleri toplar ve progress callback’leri ile UI’yi günceller. Şu an
 * için bu fonksiyon network isteklerini gerçekleştirmez; bunun yerine
 * içerik script içinde kullanılmak üzere bir iskelet sağlar.
 *
 * @param {Object} params parametreler
 * @param {('analysis'|'complaint')} params.mode analiz veya şikayet modu
 * @param {Array<string>} params.statusFilters seçili status’lar
 * @param {number} params.pageLimit sayfa limiti (0 = sadece ilk sayfa)
 * @param {string} params.searchQuery arama metni
 * @param {AbortSignal} params.abortSignal durdurma sinyali
 * @param {Function} params.onProgress progress callback (url, status, page, rowsFound)
 * @returns {Promise<Object>} tarama sonucu {orders, summary, errors}
 */
export async function taraHesap({ mode = 'analysis', statusFilters = [], pageLimit = 0, searchQuery = '', abortSignal, onProgress = () => {} } = {}) {
  const orders = [];
  const errors = [];
  const statusesToScan = statusFilters && statusFilters.length ? statusFilters : ['pending','processing','completed','cancelled','returnprocess','problematic'];
  const runId = Date.now().toString();
  try {
    for (const status of statusesToScan) {
      // Şikayet modunda öncelik: problematic ardından returnprocess
      if (mode === 'complaint' && !['problematic','returnprocess'].includes(status)) continue;
      const baseUrl = status ? buildStatusUrl(status) : 'https://hesap.com.tr/p/sattigim-ilanlar';
      const maxPages = pageLimit && pageLimit > 0 ? pageLimit : 1;
      for (let page = 1; page <= maxPages; page++) {
        if (abortSignal?.aborted) throw new Error('ABORTED');
        const url = page > 1 ? buildPagedUrl(baseUrl, page) : baseUrl;
        // progress callback
        onProgress({ source_url: url, status, page_no: page, run_id: runId });
        // FIX5_FETCH_HTML: gerçek sayfa içeriğini çek
        onProgress({ source_url: url, status, page_no: page, stage: 'fetch' });
        let html = '';
        try {
          html = await fetchHtml(url, abortSignal);
        } catch (e) {
          const code = e?.code || 'FETCH_ERROR';
          const msg = e?.message || String(e);
          errors.push({ source_url: url, status, page_no: page, code, message: msg, stage: 'fetch' });
          onProgress({ source_url: url, status, page_no: page, stage: 'error', code, message: msg });
          continue;
        }
        let pageOrders = parseHesapOrdersFromHtml(html, { status, source_url: url, page_no: page });
        const q = normalizeQuery(searchQuery);
        if (q) pageOrders = pageOrders.filter(o => orderMatchesQuery(o, q));
        onProgress({ source_url: url, status, page_no: page, stage: 'parsed', rowsFound: pageOrders.length, query: q });
        // erken durdurma: şikayet modunda ilk sayfa boşsa stop
        if (mode === 'complaint' && page === 1 && pageOrders.length === 0) {
          break;
        }
        orders.push(...pageOrders);
        // erken durdurma: eğer pageOrders boşsa ve analiz modunda, sonraki sayfaları atla
        if (pageOrders.length === 0) break;
      }
    }
  } catch (err) {
    errors.push(String(err.message || err));
    LogManager?.addLog({ level: 'error', module: 'kaziyici_hesap', action: 'tarama', result: 'error', error: err.message, run_id: runId });
  }
  return { orders, summary: { count: orders.length }, errors };
}