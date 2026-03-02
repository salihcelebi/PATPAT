/**
 * ui_simplify.js
 * Sadece log alanını basitleştirir:
 * - Log filtre dropdown'larını gizler
 * - "Seçili Logları Kopyala / TXT Dışa Aktar / JSONL Dışa Aktar / Logları Temizle" gibi butonları gizler
 * - Sadece "Tüm Logları Kopyala" (veya "Logları Kopyala") butonu kalsın diye DOM'u temizler
 *
 * En sağlam yöntem: metne göre seç.
 * Bu dosyayı mevcut UI'na ekleyip DOMContentLoaded'da applySimplify() çağır.
 */

const KEEP_BUTTON_TEXTS = [
  "TÜM LOGLARI KOPYALA",
  "LOGLARI KOPYALA",
];

const HIDE_BUTTON_TEXTS = [
  "SEÇİLİ LOGLARI KOPYALA",
  "TXT DIŞA AKTAR",
  "JSONL DIŞA AKTAR",
  "LOGLARI TEMİZLE",
];

function norm(s){ return (s||"").trim().toUpperCase(); }

function hide(el){
  if (!el) return;
  el.style.display = "none";
  el.setAttribute("data-hidden-by", "ui_simplify");
}

export function applySimplify(root=document){
  // 1) Hide known unwanted buttons by text
  const buttons = Array.from(root.querySelectorAll("button, input[type=button], a, div"));
  for (const el of buttons){
    const t = norm(el.textContent);
    if (!t) continue;

    if (HIDE_BUTTON_TEXTS.includes(t)){
      hide(el);
    }
  }

  // 2) If there is a "logs toolbar" region, hide selects/filters inside it
  const selects = Array.from(root.querySelectorAll("select"));
  for (const s of selects){
    // logs filters often have labels like "SEVİYE", "SAYFA", "MODÜL", "İŞLEM"
    const nearby = (s.closest("label")?.textContent || "") + " " + (s.parentElement?.textContent || "");
    const n = norm(nearby);
    if (n.includes("SEVİYE") || n.includes("SAYFA") || n.includes("MODÜL") || n.includes("İŞLEM")){
      hide(s);
    }
  }

  // 3) If multiple copy buttons exist, keep only the global one
  const copyCandidates = Array.from(root.querySelectorAll("button"));
  const keep = copyCandidates.filter(b => KEEP_BUTTON_TEXTS.includes(norm(b.textContent)));
  if (keep.length){
    for (const b of copyCandidates){
      const t = norm(b.textContent);
      if ((t.includes("KOPYALA") && !KEEP_BUTTON_TEXTS.includes(t)) || HIDE_BUTTON_TEXTS.includes(t)){
        hide(b);
      }
    }
  }
}