/*
  Run bazlı log saklar; dedupe + throttle ile compact satırlar üretir.
*/

function nowIso() {
  return new Date().toISOString();
}

function parseTs(ts) {
  const n = Date.parse(ts || '');
  return Number.isFinite(n) ? n : Date.now();
}

export function makeLogStore() {
  let currentRun = null;

  return {
    startRun(meta = {}) {
      currentRun = {
        meta: { ...meta },
        startedAt: nowIso(),
        endedAt: null,
        entries: [],
      };
      return currentRun;
    },
    push(entry = {}) {
      if (!currentRun) this.startRun({ auto: true });
      const row = {
        ts: entry.ts || nowIso(),
        level: entry.level || 'info',
        module: entry.module || '',
        action: entry.action || '',
        result: entry.result || '',
        error: entry.error || '',
        run_id: entry.run_id || '',
      };
      currentRun.entries.push(row);
      return row;
    },
    endRun(meta = {}) {
      if (!currentRun) return null;
      currentRun.endedAt = nowIso();
      currentRun.meta = { ...currentRun.meta, ...meta };
      return currentRun;
    },
    getLastRun() {
      return currentRun?.entries ? [...currentRun.entries] : [];
    },
  };
}

export function compactLinesFromEntries(entries = [], opts = {}) {
  const throttleMs = Number(opts.throttleMs || 350);
  const lines = [];
  const groups = new Map();

  for (const entry of entries) {
    const key = `${entry.module || ''}|${entry.action || ''}|${entry.result || ''}|${entry.error || ''}`;
    const ts = parseTs(entry.ts);
    const prev = groups.get(key);

    if (!prev) {
      groups.set(key, { ...entry, tsNum: ts, count: 1 });
      continue;
    }

    if (ts - prev.tsNum <= throttleMs) {
      prev.count += 1;
      prev.tsNum = ts;
      prev.ts = entry.ts || prev.ts;
      continue;
    }

    lines.push(prev);
    groups.set(key, { ...entry, tsNum: ts, count: 1 });
  }

  for (const row of groups.values()) {
    lines.push(row);
  }

  lines.sort((a, b) => parseTs(a.ts) - parseTs(b.ts));

  return lines.map((row) => {
    const base = [
      row.ts || nowIso(),
      row.level || 'info',
      `${row.module || ''}.${row.action || ''}`,
      String(row.result || ''),
    ];
    if (row.error) base.push(String(row.error));
    if ((row.count || 1) > 1) base.push(`(x${row.count})`);
    return base.join(' | ');
  });
}
