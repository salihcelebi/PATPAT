import {
  MessagesNavRules,
  MessagesThreadMatchRules,
  MessageComposeRules,
  MessageReadRules,
  HesapProfileUrlRules,
} from './kurallar_dom_regex_url.js';
import { LogManager } from './kayit_ve_loglama.js';

export function openMessagePage(username) {
  const url = HesapProfileUrlRules.buildProfileUrl(username);
  if (!url) {
    LogManager.addLog({ level: 'warn', module: 'mesaj_gonderici', action: 'open_message_page', result: 'username_missing' });
    return '';
  }
  // SCOD: BU GEREKSİNİM UYGULANDI - mesaj sayfası kullanıcı profili URL deseni ile açılır.
  window.open(url, '_blank', 'noopener');
  LogManager.addLog({ level: 'info', module: 'mesaj_gonderici', action: 'open_message_page', result: 'opened', context: { username } });
  return url;
}

export async function readThreadMessages({ buyerUsername, orderId, limit = 8 } = {}) {
  const doc = document;
  const thread = buyerUsername
    ? MessagesThreadMatchRules.findThreadByBuyerUsername(doc, buyerUsername)
    : MessagesThreadMatchRules.findThreadByOrderId(doc, orderId);

  if (!thread) {
    LogManager.addLog({ level: 'error', module: 'mesaj_gonderici', action: 'read_messages', result: 'THREAD_NOT_FOUND', context: { buyerUsername, orderId } });
    return { buyerUsername, orderId, messages: [] };
  }

  try { thread.click(); } catch {}
  const rows = Array.from(doc.querySelectorAll(MessageReadRules.MESSAGE_ROW_SELECTOR));
  const messages = rows.slice(-Math.max(1, limit)).map((row) => {
    const text = row.querySelector(MessageReadRules.MESSAGE_TEXT_SELECTOR)?.textContent?.trim() || '';
    const author = row.querySelector(MessageReadRules.MESSAGE_AUTHOR_SELECTOR)?.textContent?.trim() || '';
    const ts = row.querySelector(MessageReadRules.MESSAGE_TIME_SELECTOR)?.textContent?.trim() || '';
    return { role: author.toLowerCase().includes('siz') ? 'assistant' : 'user', ts, text };
  }).filter(m => m.text);

  LogManager.addLog({ level: 'info', module: 'mesaj_gonderici', action: 'read_messages', result: `ok:${messages.length}`, context: { buyerUsername, orderId, limit } });
  return { buyerUsername, orderId, messages };
}

export async function sendMessage({ buyerUsername, orderId, messageText, text, dryRun = true } = {}) {
  const finalText = String(text || messageText || '').trim();
  if (!finalText) {
    LogManager.addLog({ level: 'error', module: 'mesaj_gonderici', action: 'autopilot_send', result: 'MESSAGE_EMPTY', context: { buyerUsername, orderId } });
    return 'MESSAGE_EMPTY';
  }

  const thread = buyerUsername
    ? MessagesThreadMatchRules.findThreadByBuyerUsername(document, buyerUsername)
    : MessagesThreadMatchRules.findThreadByOrderId(document, orderId);
  if (!thread) {
    LogManager.addLog({ level: 'error', module: 'mesaj_gonderici', action: 'autopilot_send', result: 'THREAD_NOT_FOUND', context: { buyerUsername, orderId } });
    return 'THREAD_NOT_FOUND';
  }

  try {
    if (!dryRun) thread.click();
    const input = MessageComposeRules.findMessageInput(document);
    const btn = MessageComposeRules.findSendButton(document);
    if (!input || !btn) throw new Error('SEND_FAILED');
    if ('value' in input) input.value = finalText;
    else input.textContent = finalText;
    if (!dryRun) btn.click();
    LogManager.addLog({ level: 'info', module: 'mesaj_gonderici', action: 'autopilot_send', result: dryRun ? 'DRY_RUN' : 'SENT', context: { buyerUsername, orderId } });
    return dryRun ? 'DRY_RUN' : 'SENT';
  } catch (e) {
    LogManager.addLog({ level: 'error', module: 'mesaj_gonderici', action: 'autopilot_send', result: 'SEND_FAILED', error: e?.message || String(e), context: { buyerUsername, orderId } });
    return 'SEND_FAILED';
  }
}
