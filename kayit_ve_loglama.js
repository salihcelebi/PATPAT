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
  static listeners = new Set();
  static _saveTimer = null;
  static _inited = false;
  static _KEY = 'PATPAT_LOGS_V1';
  static _MAX = 4000;

  static _nowIso() { return new Date().toISOString(); }

  static _makeId() {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  static _getPage() {
    try { return document?.body?.dataset?.page || 'unknown'; } catch { return 'unknown'; }
  }

  static _parseStack(stack) {
    try {
      const lines = String(stack || '').split('\n').slice(0, 10);
      for (const line of lines) {
        const m = line.match(/\((chrome-extension:\/\/[^)]+)\)/) || line.match(/(chrome-extension:\/\/\S+)/);
        if (!m) continue;
        const url = m[1] || m[0];
        const m2 = String(url).match(/\/([^\/]+):(\d+):(\d+)$/);
        if (m2) return { url: String(url), file: m2[1], line: Number(m2[2]), col: Number(m2[3]) };
      }
    } catch {}
    return { url: '', file: '', line: 0, col: 0 };
  }

  static _scheduleSave() {
    if (LogManager._saveTimer) return;
    LogManager._saveTimer = setTimeout(() => {
      LogManager._saveTimer = null;
      LogManager._persist().catch(() => {});
    }, 400);
  }

  static async _persist() {
    const payload = LogManager.logs.slice(-LogManager._MAX);
    try {
      if (chrome?.storage?.session) await chrome.storage.session.set({ [LogManager._KEY]: payload });
    } catch {}
    try {
      if (chrome?.storage?.local) await chrome.storage.local.set({ [LogManager._KEY]: payload });
    } catch {}
    try {
      sessionStorage.setItem(LogManager._KEY, JSON.stringify(payload));
    } catch {}
  }

  static async init() {
    if (LogManager._inited) return;
    LogManager._inited = true;
    // Yükle: session -> local -> sessionStorage
    let loaded = null;
    try {
      if (chrome?.storage?.session) {
        const r = await chrome.storage.session.get(LogManager._KEY);
        loaded = r?.[LogManager._KEY] || null;
      }
    } catch {}
    if (!loaded) {
      try {
        if (chrome?.storage?.local) {
          const r = await chrome.storage.local.get(LogManager._KEY);
          loaded = r?.[LogManager._KEY] || null;
        }
      } catch {}
    }
    if (!loaded) {
      try {
        const raw = sessionStorage.getItem(LogManager._KEY);
        loaded = raw ? JSON.parse(raw) : null;
      } catch {}
    }
    if (Array.isArray(loaded)) LogManager.logs = loaded;
    LogManager._notify();
  }

  static subscribe(fn) {
    LogManager.listeners.add(fn);
    return () => LogManager.listeners.delete(fn);
  }

  static _notify() {
    for (const fn of LogManager.listeners) {
      try { fn(LogManager.logs); } catch {}
    }
  }

  /**
   * Log ekler. Log formatı zengin JSON.
   * entry: {level,module,action,message,result,error,run_id,meta}
   */
  static addLog(entry) {
    const err = new Error();
    const s = LogManager._parseStack(err.stack);
    const row = {
      id: LogManager._makeId(),
      ts: LogManager._nowIso(),
      level: entry.level || 'info',
      page: entry.page || LogManager._getPage(),
      module: entry.module || '',
      action: entry.action || '',
      message: entry.message || '',
      result: entry.result || '',
      run_id: entry.run_id || '',
      error: entry.error || '',
      file: entry.file || s.file,
      line: entry.line || s.line,
      col: entry.col || s.col,
      url: entry.url || s.url,
      stack: entry.stack || (err.stack || ''),
      meta: entry.meta ?? null,
    };
    LogManager.logs.push(row);
    if (LogManager.logs.length > LogManager._MAX) LogManager.logs.splice(0, LogManager.logs.length - LogManager._MAX);
    LogManager._notify();
    LogManager._scheduleSave();
  }

  static clear() {
    LogManager.logs = [];
    LogManager._notify();
    LogManager._scheduleSave();
  }

  static getLogs({ level = '', search = '', page = '', source = '' } = {}) {
    const q = String(search || '').trim().toLowerCase();
    return LogManager.logs.filter(l => {
      if (level && l.level !== level) return false;
      if (page && l.page !== page) return false;
      if (source && l.module !== source && l.action !== source) return false;
      if (!q) return true;
      const hay = `${l.ts} ${l.level} ${l.page} ${l.module} ${l.action} ${l.message} ${l.result} ${l.error} ${l.file}:${l.line}`.toLowerCase();
      return hay.includes(q);
    });
  }

  static exportJsonl(filters = {}) {
    const entries = LogManager.getLogs(filters);
    return entries.map(e => JSON.stringify(e)).join('\n');
  }

  static exportCsv(filters = {}) {
    const entries = LogManager.getLogs(filters);
    const header = ['ts','level','page','module','action','message','result','run_id','error','file','line','col','url'];
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

  static exportText(filters = {}) {
    const entries = LogManager.getLogs(filters);
    return entries.map(l => `${l.ts} ${l.level.toUpperCase()} ${l.page} ${l.module}.${l.action} ${l.file}:${l.line}:${l.col} ${l.message || l.result || ''} ${l.error ? (' | ' + l.error) : ''}`.trim()).join('\n');
  }
}

// Global singleton kayıt ve log yöneticisi
export const recordStore = new RecordStore();