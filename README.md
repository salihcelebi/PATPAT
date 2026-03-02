# AMAÇ
- Mevcut ARAYÜZÜNÜ (tarama ekranı, tablolar, butonlar) BOZMADAN bırak.
- SADECE LOG alanını sadeleştir: filtreler ve gereksiz log butonları gitsin, tek “LOGLARI KOPYALA” kalsın.
- “PAKETİ HAZIRLA” basınca binlerce satır yerine KOMPAKT + DEDUPE + THROTTLE log üret.

# 1) EKLE: ui_simplify.js
- Dosyayı UI'nın yüklendiği JS'e import et:
  import { applySimplify } from "./ui_simplify.js";

- UI render edildikten sonra çağır:
  document.addEventListener("DOMContentLoaded", ()=> applySimplify(document));

Not: Bu, BUTONLARI metnine göre saklar. ID/class bilmeye gerek yok.

# 2) EKLE: log_compact.js
- Mevcut log eklediğin yere şu store'u bağla:

  import { makeLogStore, compactLinesFromEntries } from "./log_compact.js";
  const logStore = makeLogStore();

- Scan başlarken:
  logStore.startRun({ ...meta });

- Scan biterken:
  logStore.endRun({ ...meta });

- Log eklerken (mevcut push/append yerine):
  logStore.push(entry);

# 3) “PAKETİ HAZIRLA” BUTONU
- Zip’e yazacağın metni KOMPAKT üret:
  const lines = compactLinesFromEntries(logStore.getLastRun());
  const compactTxt = lines.join("\n");

- İstersen ham detay için JSONL ayrı dosya:
  const jsonl = logStore.getLastRun().map(e=>JSON.stringify(e)).join("\n");

# 4) “TÜM LOGLARI KOPYALA” BUTONU
- Panoya KOPYALANACAK metin compactTxt olmalı (ham değil).

# NEDEN BU YOL?
- Senin UI’nı ben görmeden, “satır satır patch” atmak riskli.
- Bu paket, UI’yı hiç dağıtmadan LOG alanını temizler ve log spam’ini keser.