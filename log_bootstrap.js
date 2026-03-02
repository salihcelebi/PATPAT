// log_bootstrap.js
// Erken hataları yakala + temel log paneli. CSS gerçekten yüklenmiş mi kontrol eder.

(() => {
  const KEY = "PATPAT_BOOT_LOGS";
  const MAX = 2000;

  const nowIso = () => new Date().toISOString();

  const parseStackForFileLine = (stack) => {
    try {
      const lines = String(stack || "").split("\n");
      for (const line of lines) {
        const m = line.match(/\/([^\/\s)]+):(\d+):(\d+)\)?$/);
        if (m) return { file: m[1], line: Number(m[2]), col: Number(m[3]) };
      }
    } catch {}
    return { file: "", line: 0, col: 0 };
  };

  const load = () => {
    try {
      const raw = sessionStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  };

  const save = (arr) => {
    try { sessionStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX))); } catch {}
  };

  const bootLogs = load();

  const add = (level, source, msg, file, line, col) => {
    const row = { ts: nowIso(), level, source, file: file || "", line: line || 0, col: col || 0, msg: String(msg || "") };
    bootLogs.push(row);
    save(bootLogs);
    render();
  };

  // UI
  let root, listEl, toggleBtn, copyBtn, clearBtn, searchEl, levelSel;

  const ensureUI = () => {
    if (root) return;
    root = document.createElement("div");
    root.id = "patpatBootOverlay";
    root.style.cssText = [
      "position:fixed","left:10px","right:10px","bottom:10px","max-height:36vh",
      "z-index:99999","background:#ffffff","color:#111","border:1px solid #ddd",
      "border-radius:12px","box-shadow:0 10px 30px rgba(0,0,0,0.12)",
      "font-family:system-ui, sans-serif","font-size:12px","overflow:hidden"
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid #eee;flex-wrap:wrap;";
    const title = document.createElement("strong");
    title.textContent = "PATPAT BOOT LOG";
    title.style.cssText = "margin-right:auto;";

    levelSel = document.createElement("select");
    levelSel.style.cssText = "height:30px;border-radius:10px;border:1px solid #ddd;padding:0 8px;";
    levelSel.innerHTML = `<option value="">Seviye (hepsi)</option><option value="info">Bilgi</option><option value="warn">Uyarı</option><option value="error">Hata</option>`;
    levelSel.addEventListener("change", render);

    searchEl = document.createElement("input");
    searchEl.placeholder = "Ara...";
    searchEl.style.cssText = "height:28px;border-radius:10px;border:1px solid #ddd;padding:0 8px;min-width:220px;";
    searchEl.addEventListener("input", render);

    copyBtn = document.createElement("button");
    copyBtn.textContent = "TÜM LOGLARI KOPYALA";
    copyBtn.style.cssText = "padding:6px 10px;border-radius:10px;border:1px solid #ddd;background:#f7f7f7;cursor:pointer;";
    copyBtn.addEventListener("click", async () => {
      const text = bootLogs.map(r => `${r.ts} ${r.level.toUpperCase()} ${r.source} ${r.file}:${r.line}:${r.col} ${r.msg}`).join("\n");
      try {
        await navigator.clipboard.writeText(text || "");
        alert("TÜM LOGLAR KOPYALANDI");
      } catch (e) {
        alert("Kopyalama başarısız: " + (e?.message || e));
        const ta = document.createElement("textarea");
        ta.value = text || "";
        ta.style.cssText = "width:100%;height:120px;margin-top:8px;";
        root.appendChild(ta);
        ta.focus();
        ta.select();
      }
    });

    clearBtn = document.createElement("button");
    clearBtn.textContent = "TEMİZ";
    clearBtn.style.cssText = "padding:6px 10px;border-radius:10px;border:1px solid #ddd;background:#f7f7f7;cursor:pointer;";
    clearBtn.addEventListener("click", () => {
      if (!confirm("Loglar temizlensin mi?")) return;
      bootLogs.splice(0, bootLogs.length);
      save(bootLogs);
      render();
    });

    toggleBtn = document.createElement("button");
    toggleBtn.textContent = "GİZLE";
    toggleBtn.style.cssText = "padding:6px 10px;border-radius:10px;border:1px solid #ddd;background:#f7f7f7;cursor:pointer;";
    toggleBtn.addEventListener("click", () => {
      const hidden = listEl.style.display === "none";
      listEl.style.display = hidden ? "block" : "none";
      toggleBtn.textContent = hidden ? "GİZLE" : "GÖSTER";
    });

    header.appendChild(title);
    header.appendChild(levelSel);
    header.appendChild(searchEl);
    header.appendChild(copyBtn);
    header.appendChild(clearBtn);
    header.appendChild(toggleBtn);

    listEl = document.createElement("div");
    listEl.style.cssText = "display:block;overflow:auto;max-height:28vh;padding:8px;";

    root.appendChild(header);
    root.appendChild(listEl);
    document.documentElement.appendChild(root);
  };

  const render = () => {
    ensureUI();
    const level = levelSel?.value || "";
    const q = (searchEl?.value || "").toLowerCase().trim();

    const rows = bootLogs.filter(r => {
      const okLevel = !level || r.level === level;
      const hay = `${r.source} ${r.file}:${r.line}:${r.col} ${r.msg}`.toLowerCase();
      const okQ = !q || hay.includes(q);
      return okLevel && okQ;
    });

    listEl.innerHTML = "";
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.textContent = "Henüz log yok.";
      empty.style.cssText = "color:#666;padding:6px 2px;";
      listEl.appendChild(empty);
      return;
    }

    for (const r of rows.slice(-400)) {
      const line = document.createElement("div");
      const badge = r.level === "error" ? "❌" : r.level === "warn" ? "⚠️" : "ℹ️";
      line.textContent = `${badge} ${r.ts} ${r.source} ${r.file}:${r.line}:${r.col} — ${r.msg}`;
      line.style.cssText = "padding:4px 0;border-bottom:1px dashed #eee;white-space:pre-wrap;";
      listEl.appendChild(line);
    }
  };

  // Hooks
  window.addEventListener("error", (e) => {
    const { file, line, col } = parseStackForFileLine(e?.error?.stack || "");
    add("error", "window.error", e?.message || e, file || (e?.filename || ""), line || (e?.lineno || 0), col || (e?.colno || 0));
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e?.reason;
    const { file, line, col } = parseStackForFileLine(reason?.stack);
    add("error", "window.unhandledrejection", reason?.message || reason, file, line, col);
  });

  // CSS doğrulama: stiller.css gerçek stylesheet olarak yüklendi mi?
  const isStillerLoaded = () => {
    try {
      return Array.from(document.styleSheets || []).some(ss => (ss.href || "").includes("stiller.css"));
    } catch {
      // Cross-origin vb. hata verirse link tag'ına bak
      return !!document.querySelector('link[rel="stylesheet"][href*="stiller.css"]');
    }
  };

  window.addEventListener("DOMContentLoaded", () => {
    try {
      // FIX5_BOOT_DELAY: stiller.css yüklenmesi DOMContentLoaded sonrası kısa süre alabilir
      setTimeout(() => {
        try {
          if (!isStillerLoaded()) {
            add("warn", "bootstrap", "stiller.css yüklenmemiş görünüyor; minimal tema basıldı.", "log_bootstrap.js", 0, 0);
            const style = document.createElement("style");
            style.textContent = `body{background:#11132a;color:#f2edff;font-family:system-ui,sans-serif;} button,select,input,textarea{border:1px solid #444;background:#191633;color:#f2edff;}`;
            document.head.appendChild(style);
          }
          add("info", "bootstrap", "SYSTEM READY", "log_bootstrap.js", 0, 0);
          // hata yoksa paneli otomatik küçült
          try { if (bootLogs.filter(l => l.level === 'error').length === 0 && listEl) listEl.style.display = 'none'; } catch {}
        } catch (e2) {
          add("error", "bootstrap", "Bootstrap geç kontrol hatası: " + (e2?.message || e2), "log_bootstrap.js", 0, 0);
        }
      }, 200);
    } catch (e) {
      add("error", "bootstrap", "Bootstrap DOMContentLoaded hatası: " + (e?.message || e), "log_bootstrap.js", 0, 0);
    }
  });
  // FIX5_BOOT_DELAY

  window.__PATPAT_BOOTLOG__ = { add };
})();
