````markdown

\# FLOW.md — Patpat İlan Analizörü (Chrome Extension) Akış Dokümanı



Bu doküman, projedeki \*\*tüm JS dosyalarından\*\* çıkarılan bilgiyle eklentinin \*\*uçtan uca çalışma akışını\*\* anlatır.



---



\## 1) Büyük Resim: Mimari Bileşenler



\### A) Background (Service Worker)

\- \*\*Dosya:\*\* `background.js`

\- Görev: Chrome MV3 arka planı.

\- Side Panel davranışını kurar: \*\*ikon tıklayınca panel otomatik açılsın\*\*.

\- `onInstalled` sırasında side panel path’i `arayuz.html` olarak set eder.

\- Unhandled error / rejection loglar.

\- UI’dan gelen `PING\_BG` mesajına cevap verir.



\### B) Side Panel UI (Uygulama)

\- \*\*Dosya:\*\* `arayuz\_uygulama.js`

\- Görev: UI state + event’ler + tarama akışı + tablo/log render + mesaj önizleme.

\- Modülleri çağırır:

&nbsp; - Hesap tarayıcı: `kaziyici\_hesap\_com\_tr.js`

&nbsp; - Anabayiniz tarayıcı: `kaziyici\_anabayiniz\_com.js`

&nbsp; - Şablon/politika: `eslestirme\_ve\_sablonlar.js`

&nbsp; - Mesaj gönderme: `mesaj\_gonderici.js`

&nbsp; - Depo + log: `kayit\_ve\_loglama.js`



\### C) Scraper Katmanı

\- \*\*Hesap:\*\* `kaziyici\_hesap\_com\_tr.js`

&nbsp; - Verilen status + sayfa limitine göre URL’leri dolaşır.

&nbsp; - HTML’i çeker (`fetchHtml`) ve sipariş kartlarından satır üretir (`parseHesapOrdersFromHtml`).

&nbsp; - Query filtresi uygular.

&nbsp; - Complaint modunda erken durdurma uygular (ilk sayfa boşsa dur).

\- \*\*Anabayiniz:\*\* `kaziyici\_anabayiniz\_com.js`

&nbsp; - `smmIds` listesi için arama URL’lerini çağırır.

&nbsp; - HTML’i çeker (`fetchHtml`) ve SMM tablo satırlarını parse eder (`parseAnabayinizOrdersFromHtml`).



\### D) Kurallar / Regex / URL Helper Merkezi

\- \*\*Dosya:\*\* `kurallar\_dom\_regex\_url.js`

\- Görev: DOM seçicileri, regex kuralları ve URL helper’ları.

\- Hem Hesap kartlarını hem Anabayiniz tablo hücrelerini parse eden kurallar burada.



\### E) Eşleştirme + Mesaj Şablonları + Politika

\- \*\*Dosya:\*\* `eslestirme\_ve\_sablonlar.js`

\- Görev:

&nbsp; - Türkçe tarih formatı: `formatDateToTr`

&nbsp; - Servis metninden paket miktarı: `extractPackageQuantity`

&nbsp; - Eşleştirme (confidence): `matchOrderAndSmm`

&nbsp; - Mesaj üretimi: `generateMessage(type=auto|complaint)`

&nbsp; - Politika kontrolü: `checkPolicy` (max/hiz/fiyat geçerse fail)



\### F) Mesaj Gönderici

\- \*\*Dosya:\*\* `mesaj\_gonderici.js`

\- Görev:

&nbsp; - Mesajlar sayfasına gitme (dryRun değilse).

&nbsp; - Buyer username veya orderId ile thread bulma.

&nbsp; - Mesaj input’u bulma, metni yazma, gönder butonuna tıklama.



\### G) Kayıt Deposu + Log Sistemi

\- \*\*Dosya:\*\* `kayit\_ve\_loglama.js`

\- `RecordStore`: orders + smmOrders Map tabanlı.

\- `LogManager`:

&nbsp; - Log üretir, filtreler, export eder (jsonl/csv/text).

&nbsp; - Persist: `chrome.storage.session` → `chrome.storage.local` → `sessionStorage`.



---



\## 2) Entry Points (Başlangıç Noktaları)



\### Manifest

\- \*\*Dosya:\*\* `manifest.json`

\- MV3 + `background.service\_worker = background.js`

\- `side\_panel.default\_path = arayuz.html`

\- `action.default\_popup = arayuz.html`

\- Permissions: `storage, tabs, clipboardRead, clipboardWrite, sidePanel`

\- Host permissions:

&nbsp; - `https://hesap.com.tr/\*`

&nbsp; - `https://anabayiniz.com/\*`

\- Minimum Chrome: `114`



---



\## 3) Veri Sözleşmeleri (Data Contracts)



\### A) Hesap Sipariş Satırı (OrderRow)

Üretim: `extractOrderFromCard` → `parseHesapOrdersFromHtml` → `taraHesap`

Alanlar:

\- `order\_id` (string)

\- `status` (string)

\- `ilan\_url` (string|null)

\- `buyer\_username` (string|null)

\- `smm\_id` (string|null)  // kart metninden “SMM ID: 123”

\- `message\_url` (string|null) // UI şimdilik null set ediyor

\- `source\_url` (string)

\- `page\_no` (number)

\- `scraped\_at` (ISO string)



\### B) Anabayiniz SMM Satırı (SmmRow)

Üretim: `SmmOrdersRowExtractor` → `SmmOrdersPageExtractor` → `SmmOrdersMinimalSchema.toStoredRow`

Alanlar (özet):

\- `order\_id` (number)

\- `date`, `time`, `datetime\_iso`

\- `order\_link`

\- `price`, `start\_count`, `quantity`, `remains`

\- `service\_id`, `service\_full`, `platform`, `service\_type`, `service\_name\_clean`

\- `status`

\- `scraped\_at`, `source\_url`, `search\_value`



\### C) Progress Event (Scraper → UI)

`taraHesap.onProgress` örnek alanlar:

\- `source\_url, status, page\_no, run\_id`

\- `stage`: `fetch | parsed | error`

\- `rowsFound`, `query`

\- error ise: `code`, `message`



`taraAnabayiniz.onProgress` örnek alanlar:

\- `source\_url, smm\_id, run\_id`

\- `stage`: `fetch | parsed | error`

\- `rowsFound`, `code`, `message`



\### D) Failure Object (UI scanUI.failures)

\- `{ kind: 'hesap'|'smm', source\_url, status, page\_no, smm\_id, code, message }`



\### E) Log Row (LogManager.logs)

\- `id, ts, level, page, module, action, message, result, run\_id, error`

\- `file, line, col, url, stack, meta`



---



\## 4) Uçtan Uca Akışlar



\## 4.1 Kurulum / Açılış Akışı



1\. Chrome eklenti yüklenir / güncellenir.

2\. `background.js` → `onInstalled` tetiklenir:

&nbsp;  - `enableSidePanelOnClick()` → `openPanelOnActionClick=true`

&nbsp;  - `ensureSidePanelPath()` → `{ path:"arayuz.html", enabled:true }`

3\. Service worker ayrıca hemen çalışıp aynı ayarları tekrar uygular.

4\. Unhandled hatalar için global error/rejection listener’ları aktiftir.



---



\## 4.2 Side Panel UI Başlatma Akışı



1\. Kullanıcı ikon tıklar → Side Panel açılır.

2\. `arayuz\_uygulama.js` init:

&nbsp;  - `initRefs()` DOM referanslarını bağlar.

&nbsp;  - `attachEvents()` tüm UI event’lerini bağlar.

&nbsp;  - `LogManager.init()` geçmiş logları yükler.

&nbsp;  - `LogManager.subscribe()` log değişince UI re-render eder.

&nbsp;  - `renderOrdersTable()` + `renderLogs()` ilk ekranı basar.

3\. UI ayrıca “Tablo / Loglar” sekmeleri ve “Detay aç/kapat” toggle’ını wire eder.



---



\## 4.3 “Start” → Tarama Akışı (HESAP + ANABAYİNİZ)



\### Adım 0: UI hazırlık

1\. Kullanıcı \*\*Start\*\* tıklar.

2\. `startScan()`:

&nbsp;  - `state.isRunning=true`

&nbsp;  - Start disabled, Stop enabled

&nbsp;  - `AbortController` oluşturur.

&nbsp;  - Log: `ui.start`

&nbsp;  - `recordStore.orders.clear()` ve `recordStore.smmOrders.clear()`

&nbsp;  - `renderOrdersTable()` boş tabloyu gösterir.



> Not: scanUI için `running/startedAt/totalTargets` gibi alanlar kodda var,

> fakat startScan içinde set edilmiyor; progress ile sadece “processed” artıyor.

> Bu yüzden yüzdelik/ETA kısmı pratikte sınırlı çalışabilir.



---



\### Adım 1: Hesap.com.tr taraması

1\. `taraHesap({...})` çağrılır:

&nbsp;  - Parametreler: `mode, statusFilters, pageLimit, searchQuery, abortSignal, onProgress`.

2\. `taraHesap` status listesi:

&nbsp;  - statusFilters boşsa default: `pending, processing, completed, cancelled, returnprocess, problematic`

&nbsp;  - complaint modunda sadece `problematic` ve `returnprocess` taranır.

3\. Her status için:

&nbsp;  - `buildStatusUrl(status)` veya base sayfa URL’i

&nbsp;  - sayfalama: `buildPagedUrl(baseUrl, pageNo)`

4\. Her sayfa için:

&nbsp;  - abort kontrolü (ABORTED ise hata)

&nbsp;  - onProgress(stage: fetch)

&nbsp;  - `fetchHtml(url, abortSignal)` (credentials include)

&nbsp;  - parse: `parseHesapOrdersFromHtml(html,{status,source\_url,page\_no})`

&nbsp;    - DOMParser ile doc üretir

&nbsp;    - `OrderCardRules.ORDER\_CARD\_ROOT` ile kartları bulur

&nbsp;    - `extractOrderFromCard`:

&nbsp;      - order\_id: `OrderIdRules.extractFromText`

&nbsp;      - ilan\_url: `a\[href\*="/ilan/"]`

&nbsp;      - seller: `SellerRules.getMyUsernameFromHeader`

&nbsp;      - buyer: `BuyerRules.findBuyerUsernameFromOrderCard`

&nbsp;      - smm\_id: kart metninden `SMM ID: (\\d+)`

&nbsp;  - query filtresi:

&nbsp;    - `orderMatchesQuery` ile haystack üzerinde includes

&nbsp;  - onProgress(stage: parsed, rowsFound)

5\. Erken durdurma kuralları:

&nbsp;  - complaint modunda: ilk sayfa boşsa o status taraması biter.

&nbsp;  - analiz modunda: bir sayfa boşsa sonraki sayfaları atlar (break).

6\. Hata olursa:

&nbsp;  - errors listesine `{source\_url,status,page\_no,code,message,stage:'fetch'}`

&nbsp;  - onProgress(stage:'error', code, message)



\### Adım 1.1: UI progress handling

\- UI `onProgress` içinde:

&nbsp; - `scanCurrentUrl` günceller.

&nbsp; - stage parsed/error geldiğinde:

&nbsp;   - `processedTargets++` (doneSet ile aynı sayfayı bir kere sayar)

&nbsp;   - error ise `scanUI.failures.push(kind:'hesap',...)`

&nbsp;   - `updateScanUI()` çağırır

&nbsp; - ayrıca her progress event’i loga düşer.



\### Adım 1.2: Sonuçların kaydı

\- `taraHesap` döner:

&nbsp; - `orders.forEach(o => recordStore.upsertOrder(o))`

&nbsp; - errors objeleri UI’de failure listesine eklenir.



---



\### Adım 2: Anabayiniz taraması (SMM detay)

1\. UI `orders` içinden `smmIds = orders.map(o=>o.smm\_id).filter(Boolean)` çıkarır.

2\. `taraAnabayiniz({ smmIds, abortSignal, onProgress })` çağrılır.

3\. Her smmId için:

&nbsp;  - URL: `https://anabayiniz.com/orders?search={smmId}`

&nbsp;  - onProgress(stage: fetch)

&nbsp;  - `fetchHtml(url, abortSignal)` (credentials include)

&nbsp;  - parse: `parseAnabayinizOrdersFromHtml(html, {source\_url, smm\_id})`

&nbsp;    - DOMParser ile doc üretir

&nbsp;    - `SmmOrdersPageExtractor.extractAllOrders(doc)`:

&nbsp;      - `SmmOrdersDom.TABLE\_ROWS` tr listesi

&nbsp;      - `SmmOrdersRowExtractor.extractFromRow(tr)`:

&nbsp;        - ID/date/link/price/start/qty/service/status/remains parse eder

&nbsp;        - service parse: platform + service\_type + clean name

&nbsp;    - `SmmOrdersMinimalSchema.toStoredRow` ile `scraped\_at/source\_url/search\_value` ekler

&nbsp;  - onProgress(stage: parsed, rowsFound)

4\. UI sonuçları kaydeder:

&nbsp;  - `smmOrders.forEach(smm => recordStore.upsertSmmOrder(smm))`



---



\### Adım 3: Basit “linkleme” + tablo render

\- UI tarama sonunda:

&nbsp; - orders içinde `order.smm\_id` varsa ve `recordStore.smmOrders.has(order.smm\_id)` ise

&nbsp;   - order.message\_url şimdilik `null` bırakılır (placeholder)

\- `renderOrdersTable()` ve `renderLogs()` çalışır.

\- Scan summary:

&nbsp; - süre, toplam sonuç, status dağılımı hesaplanır ve yazdırılır.



> Not: `matchOrderAndSmm` modülde var; UI şu anda kullanmıyor.

> Mevcut bağlama, doğrudan `order.smm\_id === smm.order\_id` üzerinden gidiyor.



---



\## 4.4 Satır Seçimi → Detay Panel + Mesaj Üretimi



1\. Kullanıcı tablodaki satıra tıklar.

2\. `selectOrderRow(orderId)`:

&nbsp;  - selected state set edilir, satır highlight yapılır.

&nbsp;  - `orderRow = recordStore.orders.get(orderId)`

&nbsp;  - `smmRow = orderRow.smm\_id ? recordStore.smmOrders.get(orderRow.smm\_id) : null`

3\. `fillSmmDetails(orderRow, smmRow)`:

&nbsp;  - Sağ panel alanları doldurulur (yoksa “-”).

4\. Mesaj otomatik üretilir:

&nbsp;  - `type = templateSelect.value`

&nbsp;  - `message = smmRow ? generateMessage(orderRow, smmRow, type) : ''`

5\. `updateMessagePreview(message)`:

&nbsp;  - `checkPolicy(message)` çalışır:

&nbsp;    - `max|hiz|fiyat` geçiyorsa policy fail.

&nbsp;  - policy fail ise uyarı görünür, gönder butonu disable olur.

&nbsp;  - dryRun true ise gönder butonu yine disable olur.

&nbsp;  - kopyala butonu metin yoksa disable olur.



---



\## 4.5 Şablon Değişimi / Yeniden Üretim



\- `templateSelect change` veya `btnGenerateTemplate click`:

&nbsp; - Seçili sipariş varsa `generateMessage` tekrar çalışır.

&nbsp; - Önizleme/politika tekrar güncellenir.



---



\## 4.6 Mesaj Gönderme Akışı (Dry Run + Live)



1\. Kullanıcı \*\*Gönder\*\* tıklar (policy OK + dryRun=false olmalı).

2\. UI:

&nbsp;  - `sendMessage({ buyerUsername, orderId, messageText, dryRun })`

&nbsp;  - Sonucu loglar.



3\. `sendMessage` (mesaj\_gonderici.js):

&nbsp;  - abort kontrolü

&nbsp;  - messagesUrl çıkarır (selector string’inden basit replace ile)

&nbsp;  - dryRun değilse `window.location.href = messagesUrl`

&nbsp;  - thread bulma:

&nbsp;    - buyerUsername varsa `findThreadByBuyerUsername(doc, buyerUsername)`

&nbsp;    - yoksa `findThreadByOrderId(doc, orderId)`

&nbsp;  - thread yoksa: log warn, `THREAD\_NOT\_FOUND`

&nbsp;  - dryRun değilse:

&nbsp;    - `threadEl.click()`

&nbsp;    - input bul: `MessageComposeRules.findMessageInput`

&nbsp;    - metni yaz (value veya textContent)

&nbsp;    - send button bul: `MessageComposeRules.findSendButton`

&nbsp;    - click

&nbsp;  - log info: `dry\_run` veya `sent`



> Not: Kod içinde “yeni sayfa yüklenince DOM query yapılır” kısmı stub gibi duruyor.

> Gerçek navigasyon sonrası thread bulma için “wait for load / content script” yaklaşımı gerekir.



---



\## 4.7 Stop (Abort) Akışı



1\. Kullanıcı \*\*Stop\*\* tıklar.

2\. `stopScan()`:

&nbsp;  - `abortController.abort()`

&nbsp;  - log warn: `ui.stop aborted`

&nbsp;  - scan badge “Durduruldu”

&nbsp;  - butonlar resetlenir.



---



\## 4.8 Retry Failure Akışı (Şu an: Fonksiyon var, wiring eksik)



\- `retryFailure(f)`:

&nbsp; - `kind==='smm'` ise:

&nbsp;   - `taraAnabayiniz({smmIds:\[id]})`

&nbsp;   - `upsertSmmOrder` ile depoya yazar

&nbsp; - `kind==='hesap'` ise:

&nbsp;   - `fetch(url)` → html

&nbsp;   - `parseHesapOrdersFromHtml` ile rows

&nbsp;   - query filtresi uygular

&nbsp;   - `upsertOrder` ve tablo re-render



> Not: `updateScanUI` HTML içine “Tekrar Dene/Atla” butonları basıyor,

> ancak bu dinamik butonlar için event delegation bağlanmamış.

> Yani retry mekanizması “hazır”, ama UI’da aktif edilmesi gerekiyor.



---



\## 4.9 Export Akışları



\### Orders Export

\- `exportCsv()` → `orders.csv`

\- `exportJsonl()` → `orders.jsonl`



\### Logs Export / Copy / Clear

\- `LogManager.exportText()` → tüm loglar panoya

\- Seçili loglar: checkbox’lardan id listesi ile filtrelenip panoya

\- `LogManager.exportJsonl()` → `patpat\_logs\_{ts}.jsonl`

\- `LogManager.clear()` → tüm logları sıfırlar



---



\## 5) Kurallar Merkezi: Nerede Ne Değişir?



\- Hesap sipariş kart seçicileri: `OrderCardRules.\*`

\- Order id çıkarma: `OrderIdRules.\*`

\- Buyer username çıkarma: `BuyerRules.\*` + username regex

\- URL sayfalama/status: `buildPagedUrl / buildStatusUrl / buildStatusPageUrl`

\- Anabayiniz tablo seçicileri: `SmmOrdersDom.\*`

\- Hücre parse’ları: `SmmOrdersParsers.\*`

\- Service parse: `parseServiceCell` (platform, service\_type, emoji temizleme)

\- Mesaj thread bulma: `MessagesThreadMatchRules.\*`

\- Mesaj input/send button bulma: `MessageComposeRules.\*`

\- Politika kelimeleri: `checkPolicy` regex’i

\- Şablon metinleri: `generateMessage`



---



\## 6) Mermaid Diyagramları (Okunabilir Akış)



\### 6.1 Mimari Akış

```mermaid

flowchart LR

&nbsp; A\[background.js\\nService Worker] -->|sidePanel set| B\[arayuz.html\\nSide Panel UI]

&nbsp; B --> C\[arayuz\_uygulama.js\\nUI + State + Events]

&nbsp; C --> D\[kaziyici\_hesap\_com\_tr.js\\nHesap Scraper]

&nbsp; C --> E\[kaziyici\_anabayiniz\_com.js\\nAnabayiniz Scraper]

&nbsp; C --> F\[eslestirme\_ve\_sablonlar.js\\nTemplate + Policy]

&nbsp; C --> G\[mesaj\_gonderici.js\\nSend Message]

&nbsp; C --> H\[kayit\_ve\_loglama.js\\nRecordStore + LogManager]

&nbsp; D --> I\[kurallar\_dom\_regex\_url.js\\nSelectors + Regex + URL helpers]

&nbsp; E --> I

&nbsp; F --> I

&nbsp; G --> I

````



\### 6.2 StartScan Sequence



```mermaid

sequenceDiagram

&nbsp; participant U as User

&nbsp; participant UI as arayuz\_uygulama.js

&nbsp; participant H as taraHesap()

&nbsp; participant A as taraAnabayiniz()

&nbsp; participant S as RecordStore

&nbsp; participant L as LogManager



&nbsp; U->>UI: Start

&nbsp; UI->>L: addLog(ui.start)

&nbsp; UI->>S: clear orders + smmOrders

&nbsp; UI->>H: taraHesap(params + onProgress)

&nbsp; H-->>UI: onProgress(fetch/parsed/error)

&nbsp; UI->>L: addLog(progress)

&nbsp; H-->>UI: return {orders, errors}

&nbsp; UI->>S: upsertOrder(orders)

&nbsp; UI->>A: taraAnabayiniz(smmIds)

&nbsp; A-->>UI: return {orders:smmOrders}

&nbsp; UI->>S: upsertSmmOrder(smmOrders)

&nbsp; UI->>UI: renderOrdersTable + renderLogs + summary

```



---



\## 7) “Mevcut Durum” Notları (Gerçekçi Durum Tespiti)



\* `matchOrderAndSmm` import edilmiş, ancak UI akışında fiilen kullanılmıyor.

\* scanUI için `running/startedAt/totalTargets` başlangıçta set edilmediği için

&nbsp; yüzde/ETA metrikleri sınırlı kalabilir.

\* “Tekrar Dene/Atla” butonları HTML’de oluşuyor; fakat event wiring eksik.

\* `sendMessage` navigasyon sonrası thread bulma kısmı stub gibi;

&nbsp; gerçek kullanımda sayfa yüklenmesini bekleme/yeniden query gerekebilir.

\* `autoSend` state var; fakat otomatik gönderim akışına bağlanmamış.



---



\## 8) Hızlı Referans: Dosyalar ve Sorumluluklar



\* `background.js` → side panel açma davranışı + hata logları + ping

\* `arayuz\_uygulama.js` → UI state/event + tarama orkestrasyonu + render + export

\* `kaziyici\_hesap\_com\_tr.js` → hesap sipariş tarama + parse + early stop

\* `kaziyici\_anabayiniz\_com.js` → SMM sipariş tarama + parse

\* `kurallar\_dom\_regex\_url.js` → selectors/regex/url helpers + SMM parse sınıfları

\* `eslestirme\_ve\_sablonlar.js` → tarih/paket çıkarma + şablon + politika

\* `mesaj\_gonderici.js` → thread bulma + mesaj yazma/gönderme (dry-run destekli)

\* `kayit\_ve\_loglama.js` → RecordStore + LogManager + persist/export



---



```

```



