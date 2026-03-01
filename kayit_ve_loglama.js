/*
 * kayit_ve_loglama.js
 * Veritabanı benzeri basit bir kayıt deposu ve log yönetim sistemi sağlar.
 * Siparişler, SMM siparişleri, şikayetler, mesaj kuyruğu ve loglar için
 * ayrı koleksiyonlar oluşturur. Log girdi formatı JSON line şeklindedir.
 */

export class RecordStore {
  constructor() {
    this.orders = new Map(); // key: order_id, value: row
    this.smmOrders = new Map(); // key: smm_order_id, value: row
    this.complaints = new Map();
    this.messageQueue = new Map();
    this.rakipListings = new Map();
  }
  /**
   * Sipariş ekler veya günceller. Yeni kayıt ya da kazıma zamanı son kazanan
   * kayıt şeklinde saklanır.
   * @param {Object} row
   */
  upsertOrder(row) {
    if (!row || !row.order_id) return;
    const key = String(row.order_id);
    const existing = this.orders.get(key);
    if (!existing || new Date(row.scraped_at) > new Date(existing.scraped_at)) {
      this.orders.set(key, row);
    }
  }
  /**
   * SMM siparişi ekler veya günceller
   * @param {Object} row
   */
  upsertSmmOrder(row) {
    if (!row || !row.order_id) return;
    const key = String(row.order_id);
    const existing = this.smmOrders.get(key);
    if (!existing || new Date(row.scraped_at) > new Date(existing.scraped_at)) {
      this.smmOrders.set(key, row);
    }
  }
  /**
   * Verilen koleksiyonu dizi olarak döndürür
   * @param {string} type 'orders' | 'smmOrders'
   */
  toArray(type) {
    return Array.from((this[type] || new Map()).values());
  }
}

/**
 * Basit log yöneticisi. Log kayıtlarını tutar, filtreler ve export eder.
 */
export class LogManager {
  static logs = [];
  /**
   * Log ekler. Log formatı JSON satırı şeklindedir.
   * @param {Object} entry {level, module, action, result, error, run_id, ...}
   */
  static addLog(entry) {
    const row = {
      ts: new Date().toISOString(),
      level: entry.level || 'info',
      module: entry.module || '',
      action: entry.action || '',
      result: entry.result || '',
      run_id: entry.run_id || '',
      error: entry.error || '',
    };
    LogManager.logs.push(row);
    // sadece son 2000 logu sakla
    if (LogManager.logs.length > 2000) LogManager.logs.splice(0, LogManager.logs.length - 2000);
  }
  /**
   * Belirli bir seviye için logları döndürür
   * @param {string} level '' | 'info' | 'warn' | 'error'
   */
  static getLogs(level = '') {
    if (!level) return LogManager.logs;
    return LogManager.logs.filter(l => l.level === level);
  }
  /**
   * Logları JSONL stringi olarak export eder
   */
  static exportJsonl(level = '') {
    const entries = LogManager.getLogs(level);
    return entries.map(e => JSON.stringify(e)).join('\n');
  }
  /**
   * CSV export
   */
  static exportCsv(level = '') {
    const entries = LogManager.getLogs(level);
    const header = ['ts','level','module','action','result','run_id','error'];
    const lines = [header.join(',')];
    for (const row of entries) {
      const values = header.map(h => {
        const v = row[h] ?? '';
        return `"${String(v).replace(/"/g, '""')}"`;
      });
      lines.push(values.join(','));
    }
    return lines.join('\n');
  }
}

// Global singleton kayıt ve log yöneticisi
export const recordStore = new RecordStore();