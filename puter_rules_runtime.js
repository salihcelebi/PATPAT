/*
Kısa açıklama (~15 kelime): puter.md’yi 1 kez parse edip rules pack üretir; hash değişirse yeniden derler.
*/

let _ramPack = null;

function sha256(str) {
  let h = 0;
  let i = 0;
  while (i < str.length) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    i += 1;
  }
  return String(h);
}

function parseListLine(line) {
  return String(line || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeToken(t) {
  return String(t || '').trim().toUpperCase();
}

export function compilePuterMdToPack(md) {
  const versionMatch = md.match(/RULES_VERSION:\s*([0-9.]+)/i);
  const rules_version = versionMatch ? versionMatch[1].trim() : '0.0.0';

  const templates = {};
  const tplRx = /##\s*TEMPLATE:\s*([A-Z0-9_]+)\s*\n```template\s*([\s\S]*?)```/g;
  let m;
  while ((m = tplRx.exec(md)) !== null) {
    templates[normalizeToken(m[1])] = m[2].trim();
  }

  const banned = [];
  const bannedBlock = md.match(/##\s*BANNED_TOKENS\s*([\s\S]*?)(\n#|\n##|$)/i);
  if (bannedBlock) {
    bannedBlock[1].split('\n').map((s) => s.trim()).filter((s) => s.startsWith('-')).forEach((s) => {
      banned.push(normalizeToken(s.replace(/^-/, '').trim()));
    });
  }

  const status_map = {};
  const statusBlock = md.match(/#\s*STATUS_MAP\s*([\s\S]*?)(\n#|\n##|$)/i);
  if (statusBlock) {
    statusBlock[1].split('\n').map((s) => s.trim()).forEach((line) => {
      if (!line.startsWith('-')) return;
      const kv = line.replace(/^-/, '').trim();
      const idx = kv.indexOf('=');
      if (idx === -1) return;
      const key = kv.slice(0, idx).trim().toLowerCase();
      const val = kv.slice(idx + 1).trim().toUpperCase();
      if (key) status_map[key] = val;
    });
  }

  const priority = [];
  const prBlock = md.match(/##\s*PRIORITY\s*([\s\S]*?)(\n##|\n#|$)/i);
  if (prBlock) {
    prBlock[1].split('\n').map((s) => s.trim()).filter((s) => s.startsWith('-')).forEach((s) => {
      priority.push(normalizeToken(s.replace(/^-/, '').trim()));
    });
  }

  const intent_rules = {};
  const intentRx = /##\s*INTENT:\s*([A-Z0-9_]+)\s*\n([\s\S]*?)(?=\n##\s*INTENT:|\n#\s|$)/g;
  while ((m = intentRx.exec(md)) !== null) {
    const intent = normalizeToken(m[1]);
    const body = m[2];
    const sh = body.match(/STATUS_HITS:\s*(.*)/i);
    const kh = body.match(/KEYWORDS_ANY:\s*(.*)/i);
    const status_hits = sh ? parseListLine(sh[1]).map((x) => x.toLowerCase()) : [];
    const keywords_any = kh ? parseListLine(kh[1]).map(normalizeToken) : [];
    intent_rules[intent] = { status_hits, keywords_any };
  }

  return {
    rules_version,
    md_hash: sha256(md),
    templates,
    policy: { banned_tokens: banned },
    status_map,
    intent: {
      priority: priority.length ? priority : ['REFUND', 'PROBLEM', 'ORDER_RELATED', 'OTHER'],
      rules: intent_rules,
    },
    compiled_at: Date.now(),
  };
}

export async function ensureRulesPackLoaded() {
  if (_ramPack) return _ramPack;

  const stored = await chrome.storage.local.get(['puter_rules_pack']);
  const url = chrome.runtime.getURL('puter.md');
  const md = await (await fetch(url)).text();
  const mdHash = sha256(md);

  const existing = stored?.puter_rules_pack;
  if (existing && existing.md_hash === mdHash) {
    _ramPack = existing;
    return _ramPack;
  }

  const pack = compilePuterMdToPack(md);
  await chrome.storage.local.set({ puter_rules_pack: pack });
  _ramPack = pack;
  return _ramPack;
}

export function resetRulesPackCache() {
  _ramPack = null;
}
