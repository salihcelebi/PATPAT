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
 * Güvenli HTML fetch helper (MV3 side panel içinde, host_permissions ile).
 * Not: credentials:'include' ile oturum cookie'leri gönderilir.
 */
async function fetchHtml(url, abortSignal) {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    redirect: 'follow',
    signal: abortSignal,
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
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
      try {
        onProgress({ source_url: url, smm_id: smmId, run_id: runId, stage: 'fetch' });
        const html = await fetchHtml(url, abortSignal);
        const rows = parseAnabayinizOrdersFromHtml(html, { source_url: url, smm_id: smmId });
        orders.push(...rows);
        onProgress({ source_url: url, smm_id: smmId, run_id: runId, stage: 'parsed', rowsFound: rows.length });
      } catch (err) {
        errors.push({ source_url: url, smm_id: smmId, code: 'FETCH_OR_PARSE', message: String(err?.message || err), stage: 'error' });
        onProgress({ source_url: url, smm_id: smmId, run_id: runId, stage: 'error', code: 'FETCH_OR_PARSE', message: String(err?.message || err) });
        LogManager?.addLog({ level: 'error', module: 'kaziyici_anabayiniz', action: 'page', result: 'error', error: err?.message, run_id: runId });
      }
    }
  } catch (err) {
    errors.push(String(err.message || err));
    LogManager?.addLog({ level: 'error', module: 'kaziyici_anabayiniz', action: 'tara', result: 'error', error: err.message, run_id: runId });
  }
  return { orders, errors };
}