/*
 * kaziyici_anabayiniz_com.js
 * Anabayiniz.com üzerinde SMM sipariş detaylarını ve toplu durum sayfalarını
 * kazımak için kullanılan fonksiyonları içerir. Verilen SMM id listesi için
 * arama sayfalarını çağırır ve sipariş tablolarından detayları toplar.
 */

import {
  SmmOrdersUrlRules,
  SmmOrdersDom,
  SmmOrdersRowExtractor,
  SmmOrdersPageExtractor,
  SmmOrdersMinimalSchema,
  buildPagedUrl,
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
    headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
  });
  if (!res.ok) {
    const err = new Error(`HTTP_${res.status}`);
    err.code = `HTTP_${res.status}`;
    throw err;
  }
  return await res.text();
}

/**
 * Verilen HTML metninden SMM sipariş tablosunu parse eder.
 * @param {string} html
 * @param {Object} ctx
 * @returns {Array<Object>}
 */
export function parseAnabayinizOrdersFromHtml(html, ctx = {}) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = SmmOrdersPageExtractor.extractAllOrders(doc);
  return rows.map(row => SmmOrdersMinimalSchema.toStoredRow({ ...row }, ctx));
}

/**
 * Anabayiniz.com SMM siparişlerini tarar. Bu fonksiyon, bir veya birden
 * fazla SMM ID için detay sayfalarını çağırır ve sipariş tablosunu parse eder.
 * Şu an network çağrısı yapmaz; HTML boş döner ve parse fonksiyonunun test
 * edilmesine imkan verir.
 *
 * @param {Object} params
 * @param {string[]} params.smmIds SMM id listesi
 * @param {AbortSignal} params.abortSignal
 * @param {Function} params.onProgress
 * @returns {Promise<Object>} {orders, errors}
 */
export async function taraAnabayiniz({ smmIds = [], abortSignal, onProgress = () => {} } = {}) {
  const orders = [];
  const errors = [];
  const runId = Date.now().toString();
  try {
    for (const smmId of smmIds) {
      if (abortSignal?.aborted) throw new Error('ABORTED');
      const url = `https://anabayiniz.com/orders?search=${encodeURIComponent(smmId)}`;
      // SCOD: BU GEREKSİNİM UYGULANDI - run_id ve temel alanlar stage geçişinde korunur.
      const progressBase = { source_url: url, smm_id: smmId, run_id: runId };
      onProgress({ ...progressBase, stage: 'processing' });
      // FIX5_FETCH_HTML: gerçek sayfa içeriğini çek
      onProgress({ ...progressBase, stage: 'fetch' });
      let html = '';
      try {
        html = await fetchHtml(url, abortSignal);
      } catch (e) {
        const code = e?.code || 'FETCH_ERROR';
        const msg = e?.message || String(e);
        errors.push({ ...progressBase, code, message: msg, stage: 'fetch' });
        onProgress({ ...progressBase, stage: 'error', code, message: msg });
        continue;
      }
      const rows = parseAnabayinizOrdersFromHtml(html, { source_url: url, smm_id: smmId });
      onProgress({ ...progressBase, stage: 'parsed', rowsFound: rows.length });
      orders.push(...rows);
    }
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg === 'ABORTED') {
      errors.push({ code: 'ABORTED', message: 'İptal edildi', run_id: runId });
      LogManager?.addLog({ level: 'warn', module: 'kaziyici_anabayiniz', action: 'tara', result: 'aborted', error: msg, run_id: runId });
    } else {
      errors.push(msg);
      LogManager?.addLog({ level: 'error', module: 'kaziyici_anabayiniz', action: 'tara', result: 'error', error: msg, run_id: runId });
    }
  }
  return { orders, errors };
}