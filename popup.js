import { SimpleZip } from "./zip.js";

const $ = (id)=>document.getElementById(id);

const btnCopy = $("btnCopy");
const btnPrepare = $("btnPrepare");
const logBox = $("logBox");
const metaEl = $("meta");
const toastEl = $("toast");

let lastCompactFull = "";

function toast(msg){
  toastEl.textContent = msg;
  toastEl.style.display = "block";
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(()=>{ toastEl.style.display = "none"; }, 1800);
}

function send(type, payload={}){
  return new Promise((resolve)=>{
    chrome.runtime.sendMessage({ type, ...payload }, (resp)=>{
      resolve(resp || { ok:false, error:"NO_RESPONSE" });
    });
  });
}

// Varsayılan: İLK 30 SATIR (ve zaten compact)
async function loadLogs(){
  const full = await send("GET_LOGS", { mode:"compact" });
  if (!full.ok){
    logBox.value = "";
    metaEl.textContent = "LOG ALINAMADI";
    return;
  }
  lastCompactFull = (full.text || "").trim();
  const limited = await send("GET_LOGS", { mode:"compact", limit: 30 });
  logBox.value = (limited.ok ? (limited.text || "") : (full.text || "")).trim();

  const m = full.meta || {};
  const flags = [
    m.hasError ? "HATA VAR" : "",
    (!m.hasError && m.hasWarnOrError) ? "UYARI VAR" : "",
    (!m.hasWarnOrError) ? "TEMİZ" : ""
  ].filter(Boolean).join(" | ");

  metaEl.textContent = `RAW:${m.countRaw||0} KOMPAKT:${m.countCompact||0} | ${flags}`;
}

async function copyAll(){
  const text = (lastCompactFull || "").trim();
  if (!text){
    toast("KOPYALANACAK LOG YOK");
    return;
  }
  try{
    await navigator.clipboard.writeText(text);
    toast("TÜM LOGLAR KOPYALANDI");
  } catch (e){
    // fallback
    logBox.removeAttribute("readonly");
    logBox.value = text;
    logBox.focus();
    logBox.select();
    logBox.setAttribute("readonly","readonly");
    toast("KOPYALAMA İZNİ YOK, METNİ SEÇTİM");
  }
}

async function prepareZip(){
  btnPrepare.disabled = true;
  try{
    const resp = await send("EXPORT_BUNDLE");
    if (!resp.ok){
      toast("PAKET HAZIRLANAMADI");
      return;
    }
    const b = resp.bundle;
    const zip = new SimpleZip();
    zip.addText("logs_compact.txt", b.compactTxt || "");
    zip.addText("logs_full.jsonl", b.jsonl || "");
    zip.addText("meta.json", JSON.stringify({
      run_id: b.currentRunId || "",
      created_at: new Date().toISOString(),
      raw_count: b.countRaw || 0,
      compact_count: b.countCompact || 0,
      has_error: !!b.hasError,
      has_warn_or_error: !!b.hasWarnOrError
    }, null, 2));

    const blob = zip.generateBlob();
    const url = URL.createObjectURL(blob);
    const filename = `patpat_logpaket_${(b.currentRunId || Date.now())}.zip`;

    chrome.downloads.download({ url, filename, saveAs: true }, ()=>{
      if (chrome.runtime.lastError){
        toast("İNDİRME HATASI");
      } else {
        toast("ZIP HAZIR");
      }
      setTimeout(()=>URL.revokeObjectURL(url), 10_000);
    });
  } finally {
    btnPrepare.disabled = false;
  }
}

btnCopy.addEventListener("click", copyAll);
btnPrepare.addEventListener("click", prepareZip);

loadLogs();