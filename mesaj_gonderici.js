/*
 * mesaj_gonderici.js
 * Hesap.com.tr mesaj sayfasında müşteri ile iletişim kurmak için thread
 * bulma ve mesaj gönderme fonksiyonlarını sağlar. Bu modül, UI
 * tarafından sağlanan alıcı bilgisi ve mesaj metni ile thread’i
 * bulur, mesajı yazar ve gönderir. Dry run modunda sadece log
 * kaydı yapılır.
 */

import {
  MessagesNavRules,
  MessagesThreadMatchRules,
  MessageComposeRules,
} from './kurallar_dom_regex_url.js';
import { LogManager } from './kayit_ve_loglama.js';

/**
 * Belirtilen alıcı ve sipariş için mesaj thread’ini bulur ve mesajı gönderir.
 * @param {Object} params
 * @param {string} params.buyerUsername alıcı kullanıcı adı
 * @param {string|number} params.orderId sipariş id
 * @param {string} params.messageText gönderilecek mesaj
 * @param {boolean} params.dryRun dry run modunda mesaj gönderilmez
 * @param {AbortSignal} params.abortSignal durdurma sinyali
 * @returns {Promise<string>} mesaj durumu
 */
export async function sendMessage({ buyerUsername, orderId, messageText, dryRun = true, abortSignal } = {}) {
  const runId = Date.now().toString();
  try {
    if (abortSignal?.aborted) throw new Error('ABORTED');
    // Mesajlar sayfasına git
    const messagesUrl = MessagesNavRules.MESSAGES_LINK.replace('a[href="','').replace('"]','');
    if (!dryRun) {
      window.location.href = messagesUrl;
    }
    // Thread’i bulmak: yeni sayfa yüklenince DOM query ile yapılabilir. Burada stub.
    const doc = document;
    const threadEl = buyerUsername ? MessagesThreadMatchRules.findThreadByBuyerUsername(doc, buyerUsername) : MessagesThreadMatchRules.findThreadByOrderId(doc, orderId);
    if (!threadEl) {
      LogManager?.addLog({ level: 'warn', module: 'mesaj_gonderici', action: 'find_thread', result: 'not_found', run_id: runId });
      return 'THREAD_NOT_FOUND';
    }
    if (!dryRun) {
      threadEl.click();
      const input = MessageComposeRules.findMessageInput(document);
      if (!input) throw new Error('INPUT_NOT_FOUND');
      if ('value' in input) input.value = messageText;
      else input.textContent = messageText;
      const btn = MessageComposeRules.findSendButton(document);
      if (!btn) throw new Error('SEND_BUTTON_NOT_FOUND');
      btn.click();
    }
    LogManager?.addLog({ level: 'info', module: 'mesaj_gonderici', action: 'send', result: dryRun ? 'dry_run' : 'sent', run_id: runId });
    return dryRun ? 'DRY_RUN' : 'SENT';
  } catch (err) {
    LogManager?.addLog({ level: 'error', module: 'mesaj_gonderici', action: 'send', result: 'error', error: err.message, run_id: runId });
    return 'ERROR';
  }
}