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
      onProgress({ source_url: url, smm_id: smmId, run_id: runId });
      // TODO: fetch HTML from url; currently returns empty string for test
      const html = '';
      const rows = parseAnabayinizOrdersFromHtml(html, { source_url: url, smm_id: smmId });
      orders.push(...rows);
    }
  } catch (err) {
    errors.push(String(err.message || err));
    LogManager?.addLog({ level: 'error', module: 'kaziyici_anabayiniz', action: 'tara', result: 'error', error: err.message, run_id: runId });
  }
  return { orders, errors };
}