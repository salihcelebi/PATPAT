/**
 * log_compact.js
 * Drop-in helpers to:
 * - DEDUPE (by id; fallback by signature)
 * - THROTTLE high-frequency repeats (same signature within window => count++)
 * - COMPACT output (hide noisy diag/progress; group repeats as (xN))
 *
 * Usage:
 *   import { makeLogStore, compactLinesFromEntries } from "./log_compact.js";
 *   const store = makeLogStore();
 *   store.push(entry); // whenever you log
 *   const compactText = compactLinesFromEntries(store.getLastRun(), { limit: 30 }).join("\n");
 */

const DEFAULTS = {
  maxLogs: 6000,
  maxRunLogs: 3000,
  maxSeenIds: 12000,
  throttleMs: 1000,
};

function nowIso(){ return new Date().toISOString(); }

function levelRank(l){
  const x = (l||"info").toLowerCase();
  if (x === "error") return 3;
  if (x === "warn" || x === "warning") return 2;
  if (x === "debug") return 0;
  return 1; // info
}

function isDiagCxx(e){
  const mod = (e.module||"").toLowerCase();
  const act = (e.action||"").toLowerCase();
  return mod === "diag" && /^c\d{2}/.test(act);
}

function makeKey(e){
  return [
    (e.level||"info").toLowerCase(),
    (e.module||""),
    (e.action||""),
    (e.message||""),
    (e.result||""),
    (e.url||"")
  ].join("||");
}

export function makeLogStore(opts={}){
  const cfg = { ...DEFAULTS, ...opts };

  let logs = [];
  let runLogs = [];
  let currentRunId = "";
  let seenIds = new Set();

  const recentKeyTs = new Map();
  const recentKeyIdx = new Map();

  function resetSeenIfNeeded(){
    if (seenIds.size > cfg.maxSeenIds) seenIds = new Set();
  }

  function startRun(meta={}){
    currentRunId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    runLogs = [];
    recentKeyTs.clear();
    recentKeyIdx.clear();
    push({
      id:`${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ts: nowIso(),
      level:"info",
      module:"scan",
      action:"scan_started",
      message:"SCAN STARTED",
      meta,
      run_id: currentRunId
    });
    return currentRunId;
  }

  function endRun(meta={}){
    push({
      id:`${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ts: nowIso(),
      level:"info",
      module:"scan",
      action:"scan_finished",
      message:"SCAN FINISHED",
      meta,
      run_id: currentRunId
    });
  }

  function push(entry){
    if (!entry) return;
    if (!entry.ts) entry.ts = nowIso();
    if (!entry.level) entry.level = "info";

    const lvl = levelRank(entry.level);
    if (lvl === 0) return; // DEBUG tamamen kapalı

    // gürültü: diag cxx ve progress (info ise saklama)
    if (lvl < 2 && isDiagCxx(entry)) return;
    if (lvl < 2 && (entry.action||"").toLowerCase() === "progress") return;

    // dedupe by id
    if (entry.id){
      if (seenIds.has(entry.id)) return;
      resetSeenIfNeeded();
      seenIds.add(entry.id);
    }

    // throttle repeats by signature
    const k = makeKey(entry);
    const nowMs = Date.now();
    const last = recentKeyTs.get(k);
    if (last && (nowMs - last) < cfg.throttleMs){
      const idx = recentKeyIdx.get(k);
      if (typeof idx === "number" && runLogs[idx]){
        runLogs[idx]._count = (runLogs[idx]._count || 1) + 1;
        runLogs[idx].ts = entry.ts;
        return;
      }
    }
    recentKeyTs.set(k, nowMs);

    // push global
    logs.push(entry);
    if (logs.length > cfg.maxLogs) logs.splice(0, logs.length - cfg.maxLogs);

    // push run
    if (entry.run_id && entry.run_id === currentRunId){
      runLogs.push(entry);
      if (runLogs.length > cfg.maxRunLogs) runLogs.splice(0, runLogs.length - cfg.maxRunLogs);
      recentKeyIdx.set(k, runLogs.length - 1);
    }
  }

  function getAll(){ return logs.slice(); }
  function getLastRun(){ return runLogs.length ? runLogs.slice() : logs.slice(); }
  function getRunId(){ return currentRunId; }

  return { startRun, endRun, push, getAll, getLastRun, getRunId };
}

function dedupeById(arr){
  const m = new Map();
  for (const e of (arr||[])){
    const k = e && e.id ? e.id : `${e.ts||""}|${e.action||""}|${e.message||""}|${e.url||""}`;
    if (!m.has(k)) m.set(k, e);
  }
  return Array.from(m.values());
}

export function compactLinesFromEntries(entries, { limit=null } = {}){
  const raw = dedupeById(entries || []);

  // UI'da: hata yoksa sadece başla/bitir + warn/error
  const anyWarnErr = raw.some(e => levelRank(e.level) >= 2);

  const filtered = raw.filter(e=>{
    const lvl = levelRank(e.level);
    if (lvl >= 2) return true; // warn/error
    const act = (e.action||"").toLowerCase();
    return act === "scan_started" || act === "scan_finished" || act === "summary";
  });

  // group repeats
  const buckets = new Map();
  for (const e of filtered){
    const k = makeKey(e);
    const b = buckets.get(k) || {count:0, first:e};
    b.count += (e._count || 1);
    buckets.set(k, b);
  }

  const items = Array.from(buckets.values()).sort((a,b)=>{
    const at = Date.parse(a.first.ts||0) || 0;
    const bt = Date.parse(b.first.ts||0) || 0;
    return at - bt;
  });

  const lines = [];
  for (const it of items){
    const e = it.first;
    const ts = (e.ts||"").replace("T"," ").replace("Z","");
    const lvl = (e.level||"info").toUpperCase();
    const mod = (e.module||"").toUpperCase();
    const act = (e.action||"").toUpperCase();
    const msg = (e.message||"").trim();
    const res = (e.result||"").trim();
    const url = (e.url||"").trim();
    const rep = it.count > 1 ? ` (x${it.count})` : "";
    const tail = [res ? `RES:${res}` : "", url ? `URL:${url}` : ""].filter(Boolean).join(" | ");
    lines.push(`${ts} ${lvl} ${mod} ${act}${rep} ${msg}${tail ? " | "+tail : ""}`.trim());
  }

  if (!anyWarnErr && lines.length === 0){
    lines.push(`${nowIso().replace("T"," ").replace("Z","")} INFO SYSTEM READY`);
  }

  return limit ? lines.slice(0, limit) : lines;
}