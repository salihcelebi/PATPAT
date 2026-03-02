/*
  Log panelini metne göre sadeleştirir; sadece "LOGLARI KOPYALA" ve "PAKETİ HAZIRLA" bırakır.
*/

function norm(text) {
  return String(text || '').trim().toLowerCase();
}

function findLogPanel(root = document) {
  const logsBody = root.querySelector('#logsBody, #logsEmpty');
  if (logsBody) {
    return logsBody.closest('#logPanel, .log-panel, .card, section, aside, div') || logsBody.parentElement;
  }

  const headers = Array.from(root.querySelectorAll('h3, h4'));
  const logHeader = headers.find((h) => norm(h.textContent).includes('log'));
  if (!logHeader) return null;
  return logHeader.closest('#logPanel, .log-panel, .card, section, aside, div') || logHeader.parentElement;
}

function ensureButton(container, label) {
  const existing = Array.from(container.querySelectorAll('button')).find((b) => norm(b.textContent) === norm(label));
  if (existing) return existing;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = 'btn-log-compact';
  container.appendChild(btn);
  return btn;
}

export function applySimplify(root = document) {
  const panel = findLogPanel(root);
  if (!panel) return null;

  const selects = Array.from(panel.querySelectorAll('select'));
  selects.forEach((sel) => {
    sel.style.display = 'none';
  });

  const hideWords = ['yeniden', 'manuel', 'export', 'dışa', 'temizle', 'seçili', 'jsonl', 'csv', 'tümünü'];
  const buttons = Array.from(panel.querySelectorAll('button'));
  buttons.forEach((btn) => {
    const t = norm(btn.textContent);
    if (!t) return;
    if (t === 'loglari kopyala' || t === 'paketi hazirla') return;
    if (hideWords.some((w) => t.includes(w))) {
      btn.style.display = 'none';
    }
  });

  const actions = panel.querySelector('.log-actions') || panel;
  ensureButton(actions, 'LOGLARI KOPYALA');
  ensureButton(actions, 'PAKETİ HAZIRLA');

  return panel;
}
