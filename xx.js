// xx.js – Patpat İlan Tarayıcı ve Gelişmiş Loglama

/*
 * Bu betik, kullanıcıdan herhangi bir manuel giriş beklemeden aktif sekme URL'si
 * ve pano (clipboard) içerisindeki URL listesini okuyarak ilan URL'lerini analiz eder.
 * İlan ID'si, platform ve hizmet bilgileri URL'nin kendisinden (metin parse) çıkarılır.
 * Sonuçlar tabloya yazılır ve filtrelenebilir. Seçilen satırlar kopyalanabilir ve dışa
 * aktarılabilir. Ayrıntılı loglama mekanizması ile hata, uyarı ve bilgi mesajları
 * gerçek zamanlı olarak toplanır, filtrelenebilir, kopyalanabilir ve dışa aktarılabilir.
 */

(function() {
  'use strict';

  // Tanımlar ve durum objeleri
  const SERVICES = ['hesap','takipci','begeni','izlenme','yorum','canli','kaydet','paylasim','repost','reklam'];
  const PLATFORMS = ['youtube','tiktok','instagram'];

  const state = {
    rows: [],        // Tüm analiz edilen ilan satırları
    logs: [],        // Toplanan log kayıtları
    nextRowId: 0,    // Satırlara benzersiz ID atamak için sayaç
    nextLogId: 0     // Loglara benzersiz ID atamak için sayaç
  };

  // Elemanlar
  let selPlatformFilter, selServiceFilter;
  let btnScan, btnClear, btnCopySelected, btnCopyAll, btnExportCsv, btnExportJson;
  let tblBody, tblEmpty, scanStats;
  let selLogLevel, logSearch, btnCopyLogs, btnCopySelectedLogs, btnClearLogs, btnExportLogs;
  let tblLogsBody, logsEmpty;

  /** Helper: Türkçe karakterleri normalize eder. */
  function normalizeTurkish(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u');
  }

  /** URL'den ilan_id, platform ve hizmeti çıkarır. */
  function parseUrl(raw) {
    try {
      const url = new URL(raw);
      const pathname = url.pathname || '';
      const idMatch = pathname.match(/^\/ilan\/(\d+)-/);
      const ilanId = idMatch ? idMatch[1] : '';

      // platform tespiti
      let platform = '';
      for (const p of PLATFORMS) {
        const rx = new RegExp(p, 'i');
        if (rx.test(url.hostname) || rx.test(pathname)) {
          platform = p;
          break;
        }
      }

      // hizmet tespiti (regex.txt içerikleri burada sabit dizide)
      let service = '';
      const normPath = normalizeTurkish(pathname);
      for (const s of SERVICES) {
        const rx = new RegExp(`\\b${s}\\b`, 'i');
        if (rx.test(normPath)) {
          service = s;
          break;
        }
      }

      const proof = [];
      if (ilanId) proof.push('URL: ilan_id');
      if (platform) proof.push('URL: platform');
      if (service) proof.push('URL: hizmet');
      return { ilanId, platform, service, url: raw, proof: proof.join(', ') };
    } catch (e) {
      log('error', `URL parse hatası: ${raw}`);
      return { ilanId: '', platform: '', service: '', url: raw, proof: '' };
    }
  }

  /** Log ekler ve günceller. */
  function log(level, message) {
    const timestamp = new Date().toISOString();
    // Stack'ten kaynak dosya ve satır numarasını çıkar
    let source = '';
    try {
      const stackLines = new Error().stack?.split('\n') || [];
      // stackLines[0] = Error, stackLines[1] = current line, stackLines[2] = caller
      for (const line of stackLines) {
        if (line.includes('xx.js')) {
          const match = line.match(/xx.js:(\d+):(\d+)/);
          if (match) {
            source = `xx.js:${match[1]}`;
            break;
          }
        }
      }
    } catch {
      source = '';
    }
    const entry = { id: state.nextLogId++, time: timestamp, level, source, message };
    state.logs.push(entry);
    // Persist to localStorage
    try {
      localStorage.setItem('patpat_logs', JSON.stringify(state.logs));
    } catch {}
    renderLogs();
  }

  /** LocalStorage'dan logları yükler. */
  function loadLogs() {
    try {
      const json = localStorage.getItem('patpat_logs');
      const arr = json ? JSON.parse(json) : [];
      state.logs = Array.isArray(arr) ? arr : [];
      state.nextLogId = state.logs.reduce((max, l) => Math.max(max, l.id + 1), 0);
    } catch {
      state.logs = [];
    }
  }

  /** Seçilen filtrelere göre satırları render eder. */
  function renderTable() {
    const pf = selPlatformFilter.value;
    const sf = selServiceFilter.value;
    const fragment = document.createDocumentFragment();
    let shown = 0;
    state.rows.forEach(row => {
      const matchPlatform = !pf || row.platform === pf;
      const matchService = !sf || row.service === sf;
      if (matchPlatform && matchService) {
        const tr = document.createElement('tr');
        const cbTd = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'checkbox';
        cb.dataset.rowId = row.id;
        cbTd.appendChild(cb);
        tr.appendChild(cbTd);
        tr.innerHTML += `<td>${row.ilanId || ''}</td><td>${row.platform || ''}</td><td>${row.service || ''}</td><td>${row.url || ''}</td><td>${row.proof || ''}</td>`;
        fragment.appendChild(tr);
        shown++;
      }
    });
    tblBody.innerHTML = '';
    tblBody.appendChild(fragment);
    tblEmpty.style.display = shown ? 'none' : 'block';
    scanStats.textContent = `Toplam ${state.rows.length} satır.`;
  }

  /** Log tablosunu filtreleyip render eder. */
  function renderLogs() {
    const levelFilter = selLogLevel.value;
    const searchTerm = logSearch.value.toLowerCase();
    const fragment = document.createDocumentFragment();
    let shown = 0;
    state.logs.forEach(logEntry => {
      const matchLevel = !levelFilter || logEntry.level === levelFilter;
      const matchSearch = !searchTerm || logEntry.message.toLowerCase().includes(searchTerm) || (logEntry.source || '').toLowerCase().includes(searchTerm);
      if (matchLevel && matchSearch) {
        const tr = document.createElement('tr');
        const cbTd = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'checkbox';
        cb.dataset.logId = logEntry.id;
        cbTd.appendChild(cb);
        tr.appendChild(cbTd);
        tr.innerHTML += `<td>${logEntry.time}</td><td>${logEntry.level}</td><td>${logEntry.source || ''}</td><td>${logEntry.message}</td>`;
        fragment.appendChild(tr);
        shown++;
      }
    });
    tblLogsBody.innerHTML = '';
    tblLogsBody.appendChild(fragment);
    logsEmpty.style.display = shown ? 'none' : 'block';
  }

  /** Aktif sekme URL'si ve panodan URL listesini okur ve satırları oluşturur. */
  async function scan() {
    log('info', 'Taramaya başlandı');
    try {
      const urls = [];
      // Aktif sekme URL'sini al; chrome.tabs sorgusu desteklenmiyorsa yoksay
      try {
        if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
          const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          const tab = tabs && tabs[0];
          if (tab?.url) urls.push(tab.url);
        }
      } catch (e) {
        // tabs API erişilemezse uyarı üret ve devam et
        log('warn', 'Aktif sekme okunamadı');
      }
      // Panodaki metni oku
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          const potential = clipText.split(/\s+/).filter(Boolean);
          potential.forEach(u => urls.push(u));
        }
      } catch (err) {
        log('warn', 'Panodan okuma başarısız');
      }
      // Tekilleştir ve geçerli URL'leri süz
      const uniqueUrls = [...new Set(urls.filter(u => /^https?:\/\//i.test(u)))];
      if (!uniqueUrls.length) {
        log('warn', 'Tarama için URL bulunamadı');
      } else {
        uniqueUrls.forEach(u => {
          const info = parseUrl(u);
          const row = { ...info, id: state.nextRowId++ };
          state.rows.push(row);
          log('info', `İşlendi: ${u}`);
        });
        renderTable();
      }
    } catch (err) {
      log('error', `Tarama hatası: ${err && err.message}`);
    }
    log('info', 'Tarama tamamlandı');
  }

  /** Sonuç tablosundaki seçimlere göre satırları kopyalar. */
  async function copyRows(selectedOnly) {
    const selectedIds = [];
    if (selectedOnly) {
      document.querySelectorAll('#tblBody input[type="checkbox"]').forEach(cb => { if (cb.checked) selectedIds.push(Number(cb.dataset.rowId)); });
    }
    const rowsToCopy = state.rows.filter(r => !selectedOnly || selectedIds.includes(r.id));
    if (!rowsToCopy.length) {
      log('warn', selectedOnly ? 'Seçili satır bulunamadı' : 'Kopyalanacak satır yok');
      return;
    }
    const text = rowsToCopy.map(r => `${r.ilanId}\t${r.platform}\t${r.service}\t${r.url}\t${r.proof}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      log('info', selectedOnly ? 'Seçili satırlar kopyalandı' : 'Tüm satırlar kopyalandı');
    } catch {
      log('error', 'Panoya kopyalama hatası');
    }
  }

  /** Sonuçları JSON olarak dışa aktarır. */
  function exportJson() {
    const blob = new Blob([JSON.stringify(state.rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ilanlar_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
    log('info', 'JSON dışa aktarıldı');
  }

  /** Sonuçları CSV olarak dışa aktarır. */
  function exportCsv() {
    const header = ['ilan_id','platform','hizmet','ilan_url','kanit'];
    const lines = [header.join(',')];
    state.rows.forEach(r => {
      const vals = [r.ilanId,r.platform,r.service,r.url,r.proof];
      const esc = v => `"${String(v||'').replace(/"/g,'""')}"`;
      lines.push(vals.map(esc).join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ilanlar_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
    log('info', 'CSV dışa aktarıldı');
  }

  /** Log tablosundaki seçimlere göre logları kopyalar. */
  async function copyLogs(selectedOnly) {
    const selectedIds = [];
    if (selectedOnly) {
      document.querySelectorAll('#tblLogsBody input[type="checkbox"]').forEach(cb => { if (cb.checked) selectedIds.push(Number(cb.dataset.logId)); });
    }
    const logsToCopy = state.logs.filter(l => !selectedOnly || selectedIds.includes(l.id));
    if (!logsToCopy.length) {
      log('warn', selectedOnly ? 'Seçili log bulunamadı' : 'Kopyalanacak log yok');
      return;
    }
    const text = logsToCopy.map(l => `${l.time}\t${l.level}\t${l.source}\t${l.message}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      log('info', selectedOnly ? 'Seçili loglar kopyalandı' : 'Tüm loglar kopyalandı');
    } catch {
      log('error', 'Logları panoya kopyalama hatası');
    }
  }

  /** Logları JSON dosyası olarak dışa aktarır. */
  function exportLogs() {
    const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loglar_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
    log('info', 'Loglar dışa aktarıldı');
  }

  /** Logları temizler ve onay ister. */
  function clearLogs() {
    if (!confirm('Tüm loglar temizlensin mi?')) return;
    state.logs = [];
    state.nextLogId = 0;
    localStorage.removeItem('patpat_logs');
    renderLogs();
    log('info', 'Loglar temizlendi');
  }

  /** UI elementlerini bağlar ve olay dinleyicilerini kurar. */
  function bind() {
    selPlatformFilter = document.getElementById('selPlatformFilter');
    selServiceFilter = document.getElementById('selServiceFilter');
    btnScan = document.getElementById('btnScan');
    btnClear = document.getElementById('btnClear');
    btnCopySelected = document.getElementById('btnCopySelected');
    btnCopyAll = document.getElementById('btnCopyAll');
    btnExportCsv = document.getElementById('btnExportCsv');
    btnExportJson = document.getElementById('btnExportJson');
    tblBody = document.getElementById('tblBody');
    tblEmpty = document.getElementById('tblEmpty');
    scanStats = document.getElementById('scanStats');
    selLogLevel = document.getElementById('selLogLevel');
    logSearch = document.getElementById('logSearch');
    btnCopyLogs = document.getElementById('btnCopyLogs');
    btnCopySelectedLogs = document.getElementById('btnCopySelectedLogs');
    btnClearLogs = document.getElementById('btnClearLogs');
    btnExportLogs = document.getElementById('btnExportLogs');
    tblLogsBody = document.getElementById('tblLogsBody');
    logsEmpty = document.getElementById('logsEmpty');

    btnScan.addEventListener('click', scan);
    btnClear.addEventListener('click', () => {
      if (!confirm('Tüm sonuçları temizlemek istiyor musunuz?')) return;
      state.rows = [];
      state.nextRowId = 0;
      renderTable();
      log('info', 'Sonuçlar temizlendi');
    });
    selPlatformFilter.addEventListener('change', renderTable);
    selServiceFilter.addEventListener('change', renderTable);
    btnCopySelected.addEventListener('click', () => copyRows(true));
    btnCopyAll.addEventListener('click', () => copyRows(false));
    btnExportCsv.addEventListener('click', exportCsv);
    btnExportJson.addEventListener('click', exportJson);
    selLogLevel.addEventListener('change', renderLogs);
    logSearch.addEventListener('input', () => {
      // filtre uygulandıkça render
      renderLogs();
    });
    btnCopyLogs.addEventListener('click', () => copyLogs(false));
    btnCopySelectedLogs.addEventListener('click', () => copyLogs(true));
    btnClearLogs.addEventListener('click', clearLogs);
    btnExportLogs.addEventListener('click', exportLogs);
  }

  /** Sayfa yüklendiğinde çalışır. */
  function init() {
    bind();
    loadLogs();
    renderTable();
    renderLogs();
    log('info', 'Uygulama başlatıldı');
  }

  // DOM hazır olduğunda init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();