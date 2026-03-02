
```markdown
# Patpat İlan Analizörü (Chrome Extension)

Patpat İlan Analizörü, **hesap.com.tr** üzerindeki satış siparişlerini tarayıp tabloya döken, ardından **anabayiniz.com** üzerinden ilgili SMM sipariş detaylarını çekerek eşleştiren bir Chrome (MV3) eklentisidir. Eklenti, Side Panel içinde çalışan bir arayüz sunar ve tarama sürecini **ilerleme/ETA/hata listesi** ile gerçek zamanlı gösterir. Tarama sonucunda her sipariş satırına tıklayınca SMM detayları açılır, seçilen şablona göre mesaj otomatik üretilir ve politika kontrolünden geçirilir. İsterseniz mesajı panoya kopyalayabilir veya (dry-run kapalıysa) gönderim akışını tetikleyebilirsiniz. Ayrıca tüm süreç **loglanır** ve hem siparişler hem loglar dışa aktarılabilir. :contentReference[oaicite:0]{index=0} :contentReference[oaicite:1]{index=1} :contentReference[oaicite:2]{index=2} :contentReference[oaicite:3]{index=3} :contentReference[oaicite:4]{index=4} :contentReference[oaicite:5]{index=5}

## Özellikler
- **Side Panel UI:** Eklenti ikonuna tıklayınca panel otomatik açılır. :contentReference[oaicite:6]{index=6} :contentReference[oaicite:7]{index=7}
- **Hesap.com.tr taraması:** Status filtreleri ve sayfa limitiyle siparişleri toplar. :contentReference[oaicite:8]{index=8}
- **Anabayiniz.com taraması:** SMM ID listesiyle sipariş detay tablolarını parse eder. :contentReference[oaicite:9]{index=9}
- **Eşleştirme + Şablon Mesaj:** Sipariş–SMM eşleştirir, mesaj üretir, politika kontrolü yapar. :contentReference[oaicite:10]{index=10}
- **Mesaj gönderim akışı:** Mesajlar sayfasında thread bulup mesaj yazma/gönderme adımları. :contentReference[oaicite:11]{index=11}
- **Kayıt deposu + Log sistemi:** Oturum/yerel depolama, filtreleme ve export. :contentReference[oaicite:12]{index=12}
- **Kural merkezi:** DOM seçicileri, regex’ler, URL yardımcıları tek modülde. :contentReference[oaicite:13]{index=13}

## Kurulum (Geliştirme Modu)
1. Chrome’da `chrome://extensions` → **Developer mode** açın.
2. **Load unpacked** ile proje klasörünü seçin (manifest MV3). :contentReference[oaicite:14]{index=14}
3. Chrome sürümünüzün **114+** olduğundan emin olun (sidePanel). :contentReference[oaicite:15]{index=15} :contentReference[oaicite:16]{index=16}
4. `hesap.com.tr` ve `anabayiniz.com` üzerinde giriş yapın (host_permissions gerekir). :contentReference[oaicite:17]{index=17}

## Kullanım
1. Eklenti ikonuna tıklayın → Side Panel açılır. :contentReference[oaicite:18]{index=18}
2. **Mode** seçin: `analysis` veya `complaint`.
3. Status filtrelerini, arama metnini ve sayfa limitini ayarlayın.
4. **Start** ile taramayı başlatın; ilerleme/ETA ve hata listesi izleyin. :contentReference[oaicite:19]{index=19}
5. Tablo satırına tıklayın → SMM detay + mesaj önizleme otomatik dolar. :contentReference[oaicite:20]{index=20}
6. Mesaj politikaya uygunsa kopyalayın veya dry-run kapalıysa gönderimi tetikleyin. :contentReference[oaicite:21]{index=21} :contentReference[oaicite:22]{index=22}

## Politika Notu (Mesaj İçeriği)
Mesaj metninde **FİYAT / HIZ / MAX** gibi kelimeler geçerse politika kontrolü başarısız olur ve gönderim devre dışı kalır. :contentReference[oaicite:23]{index=23} :contentReference[oaicite:24]{index=24}

## Dosya Yapısı (Özet)
- `arayuz_uygulama.js`: UI + state + tarama akışı + tablo/log render. :contentReference[oaicite:25]{index=25}
- `background.js`: Side panel otomatik açma + hata yakalama. :contentReference[oaicite:26]{index=26}
- `kaziyici_hesap_com_tr.js`: Hesap sipariş tarayıcı + HTML parse. :contentReference[oaicite:27]{index=27}
- `kaziyici_anabayiniz_com.js`: Anabayiniz SMM tarayıcı + HTML parse. :contentReference[oaicite:28]{index=28}
- `eslestirme_ve_sablonlar.js`: Eşleştirme + şablon mesaj + politika. :contentReference[oaicite:29]{index=29}
- `mesaj_gonderici.js`: Thread bulma + mesaj yazma/gönderme (dry-run destekli). :contentReference[oaicite:30]{index=30}
- `kayit_ve_loglama.js`: RecordStore + LogManager + export. :contentReference[oaicite:31]{index=31}
- `kurallar_dom_regex_url.js`: DOM/regex/url kuralları ve yardımcılar. :contentReference[oaicite:32]{index=32}

## Sorun Giderme
- Side panel açılmıyorsa Chrome sürümü 114+ olmalı ve `sidePanel` izni gerekli. :contentReference[oaicite:33]{index=33} :contentReference[oaicite:34]{index=34}
- Taramada 401/403 görürseniz ilgili sitede giriş durumunu kontrol edin.
- Log panelinden filtreleyip JSONL/CSV dışa aktararak hata analizi yapın. :contentReference[oaicite:35]{index=35} :contentReference[oaicite:36]{index=36}
```

```text
COPY CODE PENCERESİ — JS DOSYASI 1

1- DOSYA ADI
arayuz_uygulama.js

2- DOSYA AMACI (EN AZ 5 CÜMLE)
Bu dosya, eklentinin Side Panel arayüzünü ve uygulama durumunu (state) yönetir. Kullanıcıdan gelen seçimleri dinler, tarama sürecini başlatır/durdurur ve ilerleme bilgisini UI üzerinde gösterir. Hesap.com.tr ve Anabayiniz tarayıcılarını çağırıp dönen sonuçları RecordStore içine yazar. Tabloyu ve log panelini filtreleyerek render eder; CSV/JSONL export ve pano kopyalama gibi yardımcı işleri yürütür. Ayrıca satır seçimiyle SMM detay panelini doldurur, mesaj şablonu üretir ve politika kontrolüne göre gönderim butonlarını yönetir. :contentReference[oaicite:37]{index=37}

3- DOSYADAKİ FONKSİYONLAR

3.1- formatEta — AMACI (3 CÜMLE)
Milisaniye cinsinden süreyi okunur ETA formatına çevirir. Saniyeyi yukarı yuvarlar, dakika-saniye ayrımı yapar. Geçersiz veya negatif değerlerde “-” döndürerek UI’yi korur.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Milisaniye değerini saniyeye çevirir, yukarı yuvarlar, hesaplar, formatlar.
- Dakika hesaplar, kalan saniyeyi bulur, metin çıktısını üretir.
- Sıfır veya negatif sürelerde güvenli “-” çıktısı döndürür.
- Sonsuz veya NaN değerleri yakalar, UI’de bozuk süre görünmesini engeller.
- Kısa sürelerde yalnız saniye gösterir, okunabilirliği artırır, sade tutar.
- Uzun sürelerde dakika ve saniyeyi birlikte yazar, tahmin netleşir.
- updateScanUI içindeki ETA hesaplarına standart format sağlar, tutarlılık verir.

3.1- setScanBadge — AMACI (3 CÜMLE)
Tarama durum rozetinin metnini ve renk vurgusunu günceller. Hata/uyarı/bilgi seviyelerine göre kenarlık rengini değiştirir. Rozet elemanı yoksa sessizce çıkar, hata üretmez.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Rozet DOM referansını kontrol eder, yoksa fonksiyondan güvenle döner.
- Metin içeriğini set eder, kullanıcıya anlık tarama durumunu gösterir.
- Seviye “error” iken kırmızımsı border rengi uygular, dikkat çeker.
- Seviye “warn” iken sarımsı border rengi uygular, uyarı belirtir.
- Diğer durumlarda varsayılan border rengiyle nötr görünüm sağlar.
- stopScan ve startScan akışlarında durum metnini senkron tutar.
- UI geri bildirimi standardize eder, tarama süreci iletişimini güçlendirir.

3.1- updateScanUI — AMACI (3 CÜMLE)
Tarama ilerleme panelini yüzde, sayaç ve ETA ile günceller. Başarısız sayfaları listeleyip “Tekrar Dene/Atla” butonlarını görünür kılar. scanUI içindeki gerçek zamanlı değerleri DOM’a yansıtır.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- running durumuna göre tarama panelini gösterir veya gizler.
- İşlenen/hedef toplamına göre yüzde hesaplar, progress bar genişliğini ayarlar.
- Sayaç alanlarını günceller, kullanıcıya tarama kapsamını açıkça gösterir.
- Geçen süreyi ölçer, ortalama hızdan kalan süreyi ETA olarak hesaplar.
- Fail listesi boşsa bölümü gizler, UI karmaşasını azaltır.
- Fail listesi doluysa satırları HTML’e çevirir, aksiyon butonları ekler.
- Hata metninde code ve message birleştirir, hızlı debug imkânı verir.

3.1- initRefs — AMACI (3 CÜMLE)
Arayüzde kullanılan tüm DOM elemanlarını tek seferde seçer ve refs içine yazar. Böylece sonraki fonksiyonlar tekrar tekrar query yapmadan hızlı çalışır. Scan UI, tablo, detay paneli ve log paneli referanslarını toplar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Mode, status, arama ve limit input referanslarını DOM’dan alır.
- Start/Stop ve export butonlarını refs içine kaydeder, erişimi kolaylaştırır.
- Scan panel elemanlarını bağlar, ilerleme ve hata render’ını mümkün kılar.
- Orders tablo gövdesi ve boş durum mesajlarını yakalar, render hazırlığı yapar.
- Şablon seçimi ve mesaj aksiyon butonlarını referanslar, etkileşimi sağlar.
- SMM detay alanlarını bir obje altında toplar, doldurmayı basitleştirir.
- Log paneli filtre ve butonlarını bağlar, log yönetimini kolaylaştırır.

3.1- updateTableTitle — AMACI (3 CÜMLE)
Tablonun başlığında toplam ve görünen satır sayılarını gösterir. Filtreleme varsa “Görünen” sayısını ayrıca yazar. Kullanıcıya veri kapsamını anlık olarak netleştirir.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- RecordStore içindeki toplam sipariş sayısını okur, başlığa yazar.
- visibleCount yoksa sadece toplam satırı gösterir, sade bilgi sunar.
- visibleCount farklıysa görünen sayısını parantez içinde ekler, netleştirir.
- renderOrdersTable sonunda çağrılır, tablo değişimlerinde başlık güncel kalır.
- Kullanıcı filtreleme yaptığında sonuç kapsamını anında görmesini sağlar.
- Büyük veri setlerinde “kaç satır” sorusunu tek bakışta çözer.
- UI metnini tek noktadan yönetir, tutarlılık ve bakım kolaylığı sağlar.

3.1- rowMatchesQuery — AMACI (3 CÜMLE)
Arama kutusundaki metne göre bir satırın görünür olup olmayacağını belirler. Satırdaki temel alanları birleştirip küçük harfe çevirerek arar. Boş sorguda tüm satırları eşleşmiş kabul eder.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Boş sorguda true döndürür, filtreleme kapalı davranışı sağlar.
- order_id, status, url ve kullanıcı adlarını tek stringte birleştirir.
- Null alanları filtreler, “undefined” kirlenmesini önler, sonuçları temiz tutar.
- Her şeyi lowercase yapar, büyük-küçük harf farkını ortadan kaldırır.
- includes ile basit ama hızlı eşleşme yapar, UI gecikmesini azaltır.
- renderOrdersTable filtre aşamasında kullanılır, tablo güncellenir.
- Kaynak alanları geniş tutar, tek kutuyla çok alan arama sağlar.

3.1- renderOrdersTable — AMACI (3 CÜMLE)
RecordStore’daki siparişleri tabloya satır satır yazar. Arama sorgusu varsa satırları rowMatchesQuery ile filtreler. Satıra tıklanınca seçim akışını başlatacak event bağlar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- RecordStore’dan sipariş listesini alır, gerekiyorsa sorguyla filtreler.
- Tablo gövdesini temizler, yeni render öncesi eski satırları kaldırır.
- Boş sonuçta “ordersEmpty” göstergesini açar, kullanıcıyı bilgilendirir.
- Her satır için td alanlarını oluşturur, linkleri target blank açar.
- Satır dataset’e orderId yazar, seçim ve highlight için zemin hazırlar.
- Satıra click listener ekler, selectOrderRow çağrısıyla detayları açar.
- Render bitince updateTableTitle ile sayıları günceller, tutarlılık sağlar.

3.1- selectOrderRow — AMACI (3 CÜMLE)
Kullanıcının tıkladığı siparişi “seçili” yapar ve tablo satırını vurgular. Seçilen siparişe bağlı SMM kaydını bulup detay panelini doldurur. Şablon tipine göre mesaj üretip önizlemeyi günceller.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- selectedOrderId değişkenini günceller, uygulama genel seçimi saklar.
- Tablodaki tüm satırları dolaşır, doğru satıra “selected” sınıfı ekler.
- RecordStore’dan orderRow alır, smm_id varsa SMM kaydını çözer.
- fillSmmDetails ile yan panelde detay alanlarını doldurur, görünür kılar.
- templateSelect değerini okur, generateMessage ile mesaj oluşturur.
- Mesaj yoksa boş string kullanır, preview alanında hata oluşmaz.
- updateMessagePreview çağırır, politika ve buton durumlarını senkronlar.

3.1- fillSmmDetails — AMACI (3 CÜMLE)
SMM detay panelindeki alanları güvenli şekilde doldurur. Eksik alanlarda “-” göstererek UI kırılmasını engeller. Link alanını hem href hem metin olarak günceller.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- refs.smmDetails altındaki hedef span/anchor elemanlarını tek noktadan kullanır.
- order_id, date, status gibi temel alanları metin olarak basar, okunur kılar.
- order_link varsa href set eder, yoksa güvenli “#” kullanır.
- start_count, quantity, remains değerlerini null coalescing ile korur.
- service_full metnini doğrudan gösterir, şikayet yanıtı için referans sağlar.
- SMM kaydı yoksa her alana “-” yazar, tutarlı boş durum sunar.
- selectOrderRow akışının UI tarafını tamamlar, kullanıcıya bağlam sağlar.

3.1- updateMessagePreview — AMACI (3 CÜMLE)
Mesaj önizleme textarea’sını günceller ve politika kontrolünü çalıştırır. Politika uygun değilse uyarıyı gösterir ve gönder butonunu kapatır. Ayrıca dryRun durumuna göre gönderim yetkisini yönetir.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Preview alanına metni yazar, boşsa temiz string kullanır.
- checkPolicy ile metni denetler, yasaklı kelime geçince uyarı açar.
- policyWarning görünürlüğünü classList ile yönetir, sade UI sağlar.
- dryRun açıkken btnSendMessage’i devre dışı bırakır, yanlış gönderimi engeller.
- Metin boşsa kopyalama butonunu kapatır, boş kopyalamayı önler.
- Politika ok ve dryRun kapalıysa gönder butonunu aktif eder.
- Kullanıcı ayar değiştirince anında buton durumlarını günceller, güven verir.

3.1- renderLogs — AMACI (3 CÜMLE)
LogManager’dan filtrelenmiş logları alıp log tablosuna basar. Seçim checkbox’ları ve temel sütunları satır satır oluşturur. Log yoksa boş durum bileşenini gösterir.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Seviye filtresini ve arama metnini UI’dan okur, LogManager’a iletir.
- Log tablo gövdesini temizler, tekrar render’da çakışmayı önler.
- Boş sonuçta “logsEmpty” görünür yapar, kullanıcıya bilgi verir.
- Her log için checkbox ekler, seçili log kopyalama akışını destekler.
- ts, level, module, action gibi kolonları sırayla basar, okunabilirlik sağlar.
- LogManager.getLogs çıktısını doğrudan kullanır, tek kaynak doğruluğu korur.
- UI’da logların güncel kalmasını sağlar, debug süresini kısaltır.

3.1- exportCsv — AMACI (3 CÜMLE)
Sipariş tablosunu CSV formatında dışa aktarır. Sütunları sabit bir header ile sıralar ve değerleri kaçışlayarak yazar. Sonunda Blob indirimi başlatıp URL’yi temizler.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- RecordStore’dan siparişleri diziye çevirir, export için hazırlar.
- CSV header alanlarını belirler, her satırda aynı sırayı garanti eder.
- Her hücreyi stringe çevirir, çift tırnakları kaçışlar, CSV bozulmaz.
- Satırları newline ile birleştirir, dosya içeriğini oluşturur.
- Blob üretir, object URL oluşturur, indirme linkini tetikler.
- İndirilen dosya adını “orders.csv” yapar, kullanıcı beklentisine uyar.
- URL.revokeObjectURL ile kaynakları temizler, bellek sızıntısını azaltır.

3.1- exportJsonl — AMACI (3 CÜMLE)
Siparişleri JSON Lines (JSONL) biçiminde dışa aktarır. Her satırı bağımsız JSON objesi olarak yazıp newline ile ayırır. Blob indirimiyle dosyayı kullanıcıya verir.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Sipariş listesini RecordStore’dan alır, JSONL üretimine başlar.
- Her satırı JSON.stringify ile dönüştürür, satır bazlı kayıt sağlar.
- newline ile birleştirir, büyük dosyalarda okunabilir işleme kolaylığı sunar.
- Blob tipini application/json yapar, tarayıcı indirimini düzgün yönetir.
- Object URL üretir, indirme a elementini programatik tıklar.
- Dosya adını “orders.jsonl” yapar, formatı açıkça belirtir.
- URL’yi revoke eder, geçici kaynakları kapatır, temiz çalışma sağlar.

3.1- copyToClipboard — AMACI (3 CÜMLE)
Verilen metni panoya yazmayı dener, başarılıysa kullanıcıyı uyarır. Clipboard API başarısızsa fallback textarea’yı açıp seçili hale getirir. Böylece kopyalama her koşulda kullanıcıya mümkün olur.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Metni stringe çevirir, null değerlerin kopyalamayı bozmasını engeller.
- navigator.clipboard.writeText ile kopyalar, modern tarayıcı yolunu kullanır.
- Başarıda alert gösterir, fallback alanını gizler, UI temiz kalır.
- Hata yakalayınca mesajı alert eder, kullanıcıya nedenini söyler.
- Fallback textarea’ya metni yazar, görünür yapar, seçili hale getirir.
- focus ve select çağırır, kullanıcı Ctrl+C ile kopyalayabilir.
- Log panel “kopyala” butonlarında ortak yardımcı olarak kullanılır.

3.1- getSelectedLogIds — AMACI (3 CÜMLE)
Log tablosunda işaretlenmiş checkbox’lardan log ID listesini çıkarır. Boş veya geçersiz ID’leri filtreleyerek temiz sonuç döndürür. Seçili logları kopyalama/export akışında kullanılır.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- logsBody içinde işaretli checkbox’ları querySelectorAll ile toplar.
- dataset.logId değerlerini map eder, log kimliklerini hızlı çıkarır.
- Boş stringleri filter ile eleyerek geçerli ID listesi döndürür.
- btnCopySelectedLogs akışında seçili logları ayırmak için kullanılır.
- DOM bağımlılığını tek fonksiyonda toplar, tekrar kodu azaltır.
- Checkbox sınıfını sabit tutar, UI değişiminde güncelleme kolaylaşır.
- Kullanıcı seçimiyle log analizini hedefli hale getirir, gürültüyü azaltır.

3.1- downloadTextFile — AMACI (3 CÜMLE)
Metin içeriğini dosya olarak indirmek için genel bir yardımcıdır. Blob ve object URL oluşturarak tarayıcı indirme diyalogunu tetikler. Kısa gecikmeyle URL’yi iptal ederek kaynakları temizler.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Dosya adını ve içerik metnini alır, güvenli stringe çevirir.
- text/plain charset utf-8 blob üretir, Türkçe karakterleri korur.
- Object URL oluşturur, geçici indirme bağlantısı hazırlar.
- a elementini DOM’a ekler, tıklatır, indirmeyi başlatır.
- a elementini kaldırır, sayfada gereksiz node bırakmaz.
- setTimeout ile URL’yi revoke eder, bellek kullanımını düşürür.
- Log export ve diğer metin çıktılarında tekrar kullanılabilir altyapı sağlar.

3.1- retryFailure — AMACI (3 CÜMLE)
Tarama sırasında başarısız olan sayfayı yeniden denemeyi sağlar. Hata türüne göre SMM veya Hesap akışını ayrı yollarla tekrar yürütür. Başarılı olursa RecordStore’u günceller ve log kaydı düşer.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Fail objesini kontrol eder, boşsa işlemi güvenle sonlandırır.
- kind “smm” ise taraAnabayiniz ile sadece ilgili SMM’i yeniden tarar.
- Dönen SMM satırlarını RecordStore’a upsert eder, veri günceller.
- kind “hesap” ise URL’yi fetch eder, HTML’i tekrar parse eder.
- parseHesapOrdersFromHtml ile satır üretir, arama filtresi uygular.
- Tabloyu render eder, başarılı yeniden denemeyi kullanıcıya yansıtır.
- LogManager’a retry kaydı ekler, hata takibini şeffaflaştırır.

3.1- attachEvents — AMACI (3 CÜMLE)
UI bileşenlerinin tüm event listener bağlarını kurar. State güncellemeleri, export, log işlemleri ve mesaj aksiyonlarını tek yerde toplar. Kullanıcı etkileşimlerini uygulama fonksiyonlarına yönlendirir.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Mode ve status seçimlerini state içine yazar, tarama kapsamını belirler.
- Arama input değişince tabloyu yeniden render eder, hızlı filtre sağlar.
- Page limit inputunu parse eder, sayfa sayısını güvenli integer yapar.
- Dry-run toggle değişince preview butonlarını yeniden hesaplar, güven verir.
- Start/Stop butonlarını startScan/stopScan’e bağlar, akışı kontrol eder.
- Log kopyalama, export ve temizleme butonlarını yardımcılarla bağlar.
- Mesaj üretme/gönderme/kopyalama butonlarını sendMessage akışına bağlar.

3.1- startScan — AMACI (3 CÜMLE)
Tarama sürecini başlatır, state ve UI butonlarını “running” moduna alır. Önce Hesap siparişlerini tarar, sonra bulunan SMM ID’lerle Anabayiniz detaylarını çeker. Sonunda tabloyu, logları ve scan özetini günceller.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Tekrar çalışmayı engeller, isRunning kontrolüyle çift tıklamayı önler.
- AbortController oluşturur, stopScan ile iptal edilebilir tarama sağlar.
- RecordStore’u temizler, yeni tarama için eski verileri sıfırlar.
- taraHesap çağırır, progress callback ile scanUI sayaçlarını günceller.
- Hataları scanUI.failures içine ekler, UI’da tekrar dene listesi üretir.
- SMM ID’leri toplayıp taraAnabayiniz çağırır, detayları depoya yazar.
- Özet dağılım üretir, süre ve status dağılımını scanSummary’e basar.

3.1- stopScan — AMACI (3 CÜMLE)
Aktif taramayı iptal etmek için abort sinyali gönderir. UI rozetini “Durduruldu” yapar ve ETA’yı sıfırlar. Ayrıca log kaydı ekleyerek kullanıcı eylemini izlenebilir kılar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- isRunning ve abortController varlığını kontrol eder, güvenli iptal sağlar.
- AbortController.abort çağırır, fetch isteklerinin durmasını tetikler.
- scanUI.running kapatır, badge metnini “Durduruldu” olarak ayarlar.
- ETA alanını “-” yapar, yanlış kalan süre gösterimini engeller.
- Buton durumlarını resetler, Start aktif Stop pasif hale gelir.
- LogManager’a “stop/aborted” kaydı düşer, kullanıcı aksiyonu izlenir.
- updateScanUI çağırır, panel görünümü tarama sonrası tutarlı kalır.

3.1- init — AMACI (3 CÜMLE)
Uygulamanın başlangıç fonksiyonudur ve tüm bileşenleri hazırlar. DOM referanslarını toplar, eventleri bağlar ve log sistemini başlatır. İlk tablo ve log render’ını yaparak UI’yi çalışır hale getirir.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- initRefs çağırır, tüm UI element referanslarını tek seferde kurar.
- attachEvents çağırır, kullanıcı etkileşimlerini fonksiyonlara bağlar.
- LogManager.init ile geçmiş logları yükler, UI’da görünür kılar.
- LogManager.subscribe ile değişimlerde renderLogs tetikler, canlı güncelleme sağlar.
- renderOrdersTable ile boş tablo durumunu doğru gösterir, başlangıç hazırlar.
- renderLogs ile log panelini başlatır, ilk ekranı temiz tutar.
- DOMContentLoaded durumuna göre init’i doğru zamanda çalıştırır, hata önler.

3.1- wireLayoutTabsFix4 (IIFE) — AMACI (3 CÜMLE)
Tablo/Loglar sekmeleri arasında geçişi yönetmek için anında çalışır. Dar panelde çakışmayı azaltmak amacıyla ilgili panelleri show/hide yapar. Detay panelini aç/kapat butonunu da bağlayarak layout kontrolü sağlar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Tab butonlarını DOM’dan alır, eksikse sessizce çıkıp bozulmayı önler.
- logsPanel ve tableWrap alanlarını bulur, görünürlük yönetimi kurar.
- setActive yardımcı fonksiyonuyla hangi sekmenin açık olduğunu belirler.
- Tablo sekmesine tıklayınca tabloyu gösterir, log panelini gizler.
- Log sekmesine tıklayınca log panelini gösterir, tabloyu gizler.
- Detay toggle butonuyla detailsWrap.open değerini tersler, paneli yönetir.
- Hata olursa bootlog’a yazmaya çalışır, debug için iz bırakır.
```

```text
COPY CODE PENCERESİ — JS DOSYASI 2

1- DOSYA ADI
background.js

2- DOSYA AMACI (EN AZ 5 CÜMLE)
Bu dosya, Chrome MV3 Service Worker tarafında çalışan arka plan mantığını yönetir. Eklenti ikonuna tıklanınca Side Panel’in otomatik açılmasını sağlayacak davranışı set eder. Ayrıca Service Worker seviyesinde yakalanmayan hata ve promise rejection olaylarını konsola loglayarak debug sürecini kolaylaştırır. Eklenti kurulumunda (onInstalled) side panel path ve davranış ayarlarını tekrar uygular. UI tarafından gönderilen basit “PING_BG” mesajlarına yanıt vererek bağlantı testi yapılmasını sağlar. :contentReference[oaicite:38]{index=38}

3- DOSYADAKİ FONKSİYONLAR

3.1- log — AMACI (3 CÜMLE)
Arka plan tarafında standart önekle console.log üretir. Böylece tüm BG logları aynı etiket altında toplanır. Debug sırasında kaynak ayrıştırmayı hızlandırır.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Konsola “[PATPAT BG]” önekiyle bilgilendirici çıktılar yazdırır, ayrıştırır.
- Birden çok argümanı destekler, değişken içerikleri tek satırda gösterir.
- Kurulum ve davranış set işlemlerini görünür kılar, debug kolaylaştırır.
- Mesaj dinleyici ping cevaplarında kaynak bilgilerini loglamaya yardım eder.
- Side panel API varlık kontrolü sonuçlarını kullanıcıya dolaylı bildirir.
- Hata takibinde logErr ile birlikte tutarlı format sağlar, okunur.
- Geliştirici konsolunda filtreleme yapmayı kolaylaştırır, zaman kazandırır.

3.1- logErr — AMACI (3 CÜMLE)
Arka plan tarafında standart önekle console.error üretir. Kritik hataları normal loglardan ayırmayı sağlar. Service Worker hatalarında hızlı fark edilirlik sağlar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Konsola “[PATPAT BG]” önekiyle error çıktısı yazar, dikkat çeker.
- Unhandled error ve rejection olaylarında hata detaylarını görünür kılar.
- Side panel API eksikliği gibi kritik durumları net biçimde raporlar.
- try/catch yakalamalarında istisna objesini olduğu gibi yazar, ayrıntı korur.
- Geliştirici konsolunda kırmızı hataları toplar, hızlı triage sağlar.
- Kullanıcı Chrome sürümü uyumsuzken açıklayıcı mesaj üretir, yönlendirir.
- log fonksiyonuyla birlikte BG tarafında standart logging çerçevesi kurar.

3.1- enableSidePanelOnClick — AMACI (3 CÜMLE)
Eklenti ikonuna tıklanınca Side Panel’in açılmasını etkinleştirir. Chrome sidePanel API desteklenmiyorsa uyarı loglar ve çıkır. Başarılı olursa davranışı set edip bilgi logu üretir.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- chrome.sidePanel.setPanelBehavior varlığını kontrol eder, uyumluluk doğrular.
- API yoksa minimum sürüm uyarısı verir, kullanıcıyı doğru sürüme yönlendirir.
- openPanelOnActionClick=true ayarlar, ikon tıklamasında panel açılır.
- Başarı mesajını loglar, kurulumun doğru çalıştığını kanıtlar.
- Hata oluşursa catch ile yakalar, error log basar, sessiz çökmez.
- onInstalled akışında tekrar çağrılır, kalıcı davranış sağlar.
- Worker uyanınca yeniden uygulanır, MV3 yaşam döngüsüne uyum sağlar.

3.1- ensureSidePanelPath — AMACI (3 CÜMLE)
Side Panel’in hangi HTML dosyasını göstereceğini ayarlar. API yoksa hiçbir işlem yapmadan çıkar. Başarılı olursa arayuz.html path ve enabled durumunu set eder.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- chrome.sidePanel.setOptions varlığını kontrol eder, destek yoksa döner.
- Side panel path değerini “arayuz.html” yapar, UI dosyasını bağlar.
- enabled:true ayarlar, panelin kullanılabilir olmasını garanti eder.
- Başarı logu yazar, doğru dosya yüklendiğini debug için gösterir.
- Hataları yakalar, setOptions error’larını konsola basar, görünür kılar.
- onInstalled içinde çağrılır, ilk kurulumda panelin açılmasını sağlar.
- enableSidePanelOnClick sonrası çalışır, davranış ve içerik birlikte tamamlanır.
```



1- DOSYA ADI
eslestirme_ve_sablonlar.js

2- DOSYA AMACI (EN AZ 5 CÜMLE)
Bu dosya, sipariş kayıtları ile SMM detay kayıtlarını eşleştirmek için kullanılır. Eşleştirme sonucuna bir yöntem etiketi ve güven puanı ekleyerek UI’nin karar vermesini kolaylaştırır. SMM servis metninden “paket miktarı” gibi sayısal bilgileri ayıklar ve mesaj içinde kullanıma hazırlar. Tarih alanlarını Türkçe gün/ay formatına çevirerek mesaj şablonlarının tutarlı görünmesini sağlar. Ayrıca mesaj metninde “FİYAT / HIZ / MAX” kelimeleri geçiyor mu diye kontrol ederek politika uyumluluğunu merkezi şekilde yönetir.

3- DOSYADAKİ FONKSİYONLAR

3.1- formatDateToTr ; AMACI (3 CÜMLE)
Tarih string’ini Türkçe “GÜN AYTA” formatına çevirir. “YYYY-MM-DD” ve “DD-MM-YYYY” kalıplarını tanır. Tanıyamazsa orijinal metni bozmadan geri döndürür.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Gelen tarih formatını regex ile doğrular, desteklenmeyen formatı aynen döndürür.
- YYYY-MM-DD biçiminde yıl-ay-gün parçalarını güvenle split eder, değişkene yazar.
- DD-MM-YYYY biçiminde gün-ay-yıl sırasını çözer, doğru alanlara atar.
- Ay indeksini sayıya çevirir, AY_ADLARI dizisinden ay adını seçer.
- Gün değerini parseInt ile sayıya çevirir, baştaki sıfırı kaldırır.
- Son çıktıyı “{gün} {AY}TA” olarak üretir, tutarlı metin sağlar.
- Boş tarih geldiğinde boş string döndürür, mesaj şablonu kırılmaz.

3.1- extractPackageQuantity ; AMACI (3 CÜMLE)
Servis başlığındaki paket miktarını bulmak için metinden ilk sayıyı çıkarır. “HIZ/MAX/FİYAT” gibi parçaları temizleyerek gürültüyü azaltır. Sayı yoksa null döndürerek “bilgi alınamadı” akışını destekler.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Hız/Max/Fiyat parçalarını regex ile temizler, sayı aramasına uygun hale getirir.
- Harf ve sembolleri boşlukla değiştirir, sayıları ayrıştırmayı kolaylaştırır.
- Metni whitespace ile böler, sayısal token’ları filtreleyip liste oluşturur.
- İlk bulunan sayıyı parseInt ile integer’a çevirir, paket miktarı üretir.
- Servis metni boşsa null döndürür, çağıran kodu güvenli tutar.
- Sayı bulunamazsa null döndürür, UI “BİLGİ ALINAMADI” yazabilir.
- SMM service_full alanı değişse bile esnek ayıklama yaklaşımı sağlar.

3.1- calculateConfidence ; AMACI (3 CÜMLE)
Eşleştirme için basit bir güven puanı hesaplar. orderId, smmId ve buyerUsername varlığına göre skor ekler. Skoru 100’ü geçirmeden sınırlar ve geri döndürür.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- score değişkenini sıfırlar, adım adım puan toplama düzeni kurar.
- orderId varsa 50 puan ekler, sipariş kimliği gücünü yansıtır.
- smmId varsa 40 puan ekler, SMM kimliği gücünü yansıtır.
- buyerUsername varsa 10 puan ekler, zayıf doğrulamayı destekler.
- Math.min ile skoru 100’e sınırlar, taşmayı engeller, tutarlılık sağlar.
- Parametreleri destructuring ile alır, çağıran kodu sadeleştirir.
- matchOrderAndSmm içinde tek yerde güven metriği üretir, standardize eder.

3.1- matchOrderAndSmm ; AMACI (3 CÜMLE)
Sipariş kaydı ile SMM kaydını olası kimliklere göre eşleştirir. Önce smm_id üzerinden tam eşleşme dener, sonra order_id fallback uygular. Sonuçta matched/method/confidence alanlarını tek objede döndürür.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- orderRow veya smmRow yoksa matched:false döndürür, güvenli çıkış yapar.
- orderRow.smm_id ile smmRow.order_id eşitliğini string karşılaştırmasıyla kontrol eder.
- Tam eşleşmede method’u “smm_id” yapar, ok değerini true set eder.
- Fallback olarak order_id eşleşmesi dener, method’u “order_id” olarak işaretler.
- calculateConfidence çağırır, orderId/smmId/buyerUsername varlığıyla skor üretir.
- confidence alanını sonuç objesine ekler, UI’nin karar vermesine yardımcı olur.
- Eşleşme yoksa method “none” kalır, veri hatalarını görünür kılar.

3.1- checkPolicy ; AMACI (3 CÜMLE)
Mesaj metnini basit bir politika filtresinden geçirir. Metinde “max / hiz / fiyat” geçiyorsa uygunsuz kabul eder. Uygunsa true döndürerek gönderim butonu akışını açar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Girdi text’i String’e çevirir, null/undefined kaynaklı hataları engeller.
- Regex içinde max/hiz/fiyat kelimelerini case-insensitive olarak yakalar, tarar.
- re.test sonucu true ise politikasız içerik sayar, false döndürür.
- Yasaklı kelime yoksa true döndürür, mesaj gönderimine izin verir.
- Tek noktadan kontrol sağlayarak UI ve gönderici modüllerini tutarlı kılar.
- Kısa ve hızlı çalışır, her preview güncellemesinde kullanılabilir.
- Metin içeriğini değiştirmez, sadece karar üretir, yan etki oluşturmaz.

3.1- generateMessage ; AMACI (3 CÜMLE)
Sipariş ve SMM detaylarına göre mesaj şablonu üretir. type=complaint için detaylı şikayet yanıtı, aksi halde bilgilendirme metni döndürür. Tarihi ve paket miktarını yardımcı fonksiyonlarla hesaplayıp metne gömer.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- extractPackageQuantity ile service_full içinden paket miktarını hesaplar, metne hazırlar.
- formatDateToTr ile tarih alanını “GÜN AYTA” biçimine çevirir, standartlaştırır.
- Durum çeviri haritası kurar, İngilizce status değerlerini Türkçeye map eder.
- status key’ini lowercase yapar, map yoksa orijinal status’u kullanır.
- complaint tipinde detaylı blok üretir, link/miktar/başlangıç/durum alanlarını yazar.
- auto tipinde kısa bilgilendirme üretir, müşteri iletişim tonunu sabit tutar.
- Return string içinde null alanları boş stringe düşürür, metin bozulmaz.
```

Bu çıktı **kayit_ve_loglama.js** içeriğine göre hazırlanmıştır. 

```text
COPY CODE PENCERESİ — JS DOSYASI 4

1- DOSYA ADI
kayit_ve_loglama.js

2- DOSYA AMACI (EN AZ 5 CÜMLE)
Bu dosya, eklentinin bellek içi “kayıt deposu” (RecordStore) ve “log sistemi” (LogManager) altyapısını sağlar. Siparişler ve SMM siparişleri gibi verileri Map koleksiyonlarında tutarak hızlı erişim sunar. LogManager ise zengin log kaydı üretir, filtreler ve farklı formatlarda export eder. Logları hem chrome.storage (session/local) hem sessionStorage üzerine yazıp yükleyerek dayanıklılık sağlar. UI tarafı bu modülü kullanarak tabloyu besler ve log panelini gerçek zamanlı günceller.

3- DOSYADAKİ FONKSİYONLAR

3.1- RecordStore.constructor ; AMACI (3 CÜMLE)
RecordStore içindeki tüm koleksiyonları oluşturur. orders ve smmOrders ana tablolar gibi çalışır. Diğer Map’ler ileride şikayet ve mesaj kuyruğu için ayrılmıştır.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- orders, smmOrders, complaints, messageQueue ve rakipListings Map koleksiyonlarını boş olarak başlatır.
- Koleksiyon isimlerini sabit tutar, diğer modüller için standart arayüz sağlar.
- Map kullanarak ekleme/arama işlemlerini O(1) seviyesine yakınlaştırır.
- Sipariş ve SMM kayıtlarını ayrı tutar, karışmayı ve çakışmayı azaltır.
- Şikayet ve mesaj kuyruğu alanlarını gelecekteki özellikler için hazırlar.
- Tek instance üzerinden yönetim hedefler, uygulama state dağılmasını engeller.
- UI ve scraper modülleri için merkezi veri katmanı oluşturur, düzen sağlar.

3.1- RecordStore.upsertOrder ; AMACI (3 CÜMLE)
Siparişi ekler veya günceller. Aynı order_id varsa scraped_at daha yeniyse üstüne yazar. Eksik order_id gelirse hiçbir işlem yapmaz.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- row ve row.order_id kontrol eder, geçersiz kaydı erken döndürür.
- order_id’yi String’e çevirir, Map key tutarlılığını garanti eder.
- Mevcut kaydı Map’ten okur, güncelleme gerekip gerekmediğini belirler.
- scraped_at tarihlerini karşılaştırır, daha yeni kayıt gelince overwrite eder.
- Eski veriyi korur, kazıma zamanı daha gerideyse değişiklik yapmaz.
- orders Map içine set eder, tablo render’ında kullanılacak kaydı günceller.
- Veri yarışını azaltır, “son kazıyan kazanır” kuralını uygular.

3.1- RecordStore.upsertSmmOrder ; AMACI (3 CÜMLE)
SMM sipariş kaydını ekler veya günceller. Key olarak SMM order_id kullanır. scraped_at daha yeni değilse mevcut kaydı korur.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- row ve row.order_id kontrol eder, boş kaydı sessizce yok sayar.
- order_id’yi String yapar, smmOrders Map anahtarlarını standardize eder.
- Mevcut smm kaydını Map’ten okur, güncelleme ihtiyacını hesaplar.
- scraped_at karşılaştırır, daha yeni kaydı smmOrders içine set eder.
- Eski kaydı korur, aynı SMM için geriye dönük overwrite yapmaz.
- SMM detay paneli için tek kaynak oluşturur, UI’de tutarlılık sağlar.
- Scraper tekrar çalıştığında güncel veriyi seçer, veri kalitesini artırır.

3.1- RecordStore.toArray ; AMACI (3 CÜMLE)
İstenen koleksiyonu dizi olarak döndürür. UI render fonksiyonları için Map.values() çıktısını Array’e çevirir. Tip bulunamazsa boş Map üzerinden güvenli dönüş yapar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- type parametresiyle hedef koleksiyonu seçer, dinamik erişim sağlar.
- this[type] yoksa yeni Map kullanır, null hatalarını engeller.
- values() iterator’ını Array.from ile diziye çevirir, render kolaylaşır.
- UI tablolarına hazır satır listesi üretir, tekrar kodu azaltır.
- Depo iç yapısını saklar, dışarıya sadece dizi arayüzü verir.
- Sıralama yapmaz, çağıran kodun kontrolünde bırakır, esneklik sağlar.
- Farklı koleksiyonlar için tek fonksiyonla export ve UI akışını destekler.

3.1- LogManager._nowIso ; AMACI (3 CÜMLE)
Şu anki zamanı ISO string olarak üretir. Tüm log timestamp’lerini standartlar. Farklı zaman formatlarından doğan karmaşayı önler.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Yeni Date oluşturur, ISO string üretir, timestamp standardını korur daima.
- addLog içindeki ts alanını tek formatta üretir, tutarlılık sağlar.
- Zaman dilimi farklarını ISO formatla normalize eder, karşılaştırmayı kolaylaştırır.
- UI log tablosunda sıralama için güvenilir tarih string’i sağlar.
- Export çıktılarında her satırın aynı zaman şemasında olmasını garantiler.
- Hata ayıklamada “ne zaman oldu” sorusuna net yanıt verir.
- Her çağrıda yeni değer üretir, cache kullanmaz, güncellik korur.

3.1- LogManager._makeId ; AMACI (3 CÜMLE)
Log kaydı için benzersiz id üretir. Date.now ve random hex birleşimi kullanır. UI’de seçim ve filtre işlemlerini kolaylaştırır.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Date.now değerini alır, random hex ekler, benzersiz id üretir hızlı.
- Aynı milisaniyede çok log olsa bile çakışma riskini düşürür.
- Checkbox seçimlerinde stabil anahtar sağlar, DOM dataset kullanımını kolaylaştırır.
- Export sırasında referans id sunar, satır takibini pratikleştirir.
- String formatında döner, JSON ve CSV için sorunsuz taşınır.
- addLog çağrısında her kayda otomatik id verir, manuel yükü kaldırır.
- Basit ama yeterli benzersizlikle performans ve güven dengesini korur.

3.1- LogManager._getPage ; AMACI (3 CÜMLE)
Sayfa bağlamını document dataset üzerinden okur. Erişemezse “unknown” döndürür. Loglara hangi ekranda üretildi bilgisini ekler.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- try/catch içinde document.body.dataset.page okur, hata olursa 'unknown' döndürür güvenle hemen.
- addLog sırasında page alanı boşsa otomatik doldurur, bağlam sağlar.
- UI log panelinde sayfa kolonunu besler, debug hızını artırır.
- DOM erişimi olmayan ortamlarda kırılmayı önler, hata üretmez.
- İleride multi-page senaryolarda analiz için kritik meta veri sağlar.
- Filtre aramasında haystack’e page ekleyerek arama kapsamını genişletir.
- Varsayılan değerle eksik state’i tolere eder, kullanıcı deneyimini korur.

3.1- LogManager._parseStack ; AMACI (3 CÜMLE)
Error stack içinden extension dosyası/line/col bilgisi çıkarır. chrome-extension URL desenlerini arar. Bulamazsa boş değerlerle güvenli obje döndürür.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- stack string’ini satırlara böler, ilk 10 satırı incelemeye alır.
- Her satırda chrome-extension URL desenini regex ile arar, yakalar.
- Yakalanan URL’den dosya adı, satır ve kolon bilgisini parse eder.
- Başarılı olursa {url,file,line,col} döndürür, log zenginleşir.
- Hata olursa boş değerli obje döndürür, addLog akışı bozulmaz.
- Farklı stack formatlarını tolere eder, iki regex yaklaşımı kullanır.
- Debug süresini kısaltır, “hangi dosyada” sorusuna net cevap verir.

3.1- LogManager._scheduleSave ; AMACI (3 CÜMLE)
Logları disk/depoya yazmayı debounce eder. Sürekli log üretiminde her seferinde yazmayı engeller. 400ms sonra _persist çağıracak bir timer kurar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- _saveTimer doluysa tekrar timer kurmaz, gereksiz iş yükünü azaltır.
- setTimeout ile gecikmeli kaydetme planlar, patlama loglarında performans korur.
- Timer tetiklenince _saveTimer’ı null yapar, yeni planlamaya izin verir.
- _persist çağrısını try/catch ile yutar, kaydetme hatası UI’yi bozmaz.
- addLog ve clear sonrası çağrılır, değişiklikleri kalıcılaştırmaya hazırlar.
- Debounce yaklaşımıyla storage limitlerine karşı daha güvenli davranır.
- Sık log akışında IO maliyetini azaltır, eklenti akıcılığını artırır.

3.1- LogManager._persist ; AMACI (3 CÜMLE)
Logların son kısmını farklı depolara yazar. Önce chrome.storage.session, sonra local, sonra sessionStorage dener. Hata olursa sessizce devam ederek dayanıklılık sağlar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- logs dizisinden son _MAX kaydı slice eder, payload boyutunu sınırlar.
- chrome.storage.session varsa set eder, oturum içinde hızlı geri yükleme sağlar.
- chrome.storage.local varsa set eder, tarayıcı restart sonrası kalıcılık sağlar.
- sessionStorage’a JSON string yazar, fallback depolama katmanı oluşturur.
- Her depolama adımını try/catch ile sarar, tek hata tüm akışı durdurmaz.
- Async çalışır, UI thread’i bloklamaz, arka planda saklama yapar.
- Farklı ortam koşullarına uyum sağlar, MV3 kısıtlarında esneklik sunar.

3.1- LogManager.init ; AMACI (3 CÜMLE)
Log sistemini bir kez başlatır. Önce session, sonra local, sonra sessionStorage’tan logları yükler. Yükledikten sonra listener’lara notify eder.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- _inited kontrol eder, init’in tekrar çalışmasını engeller, idempotent davranır.
- chrome.storage.session’dan yüklemeyi dener, varsa loaded değişkenine atar.
- Session boşsa chrome.storage.local’dan yükler, ikinci şans mekanizması sağlar.
- İkisi de yoksa sessionStorage’dan okur, JSON parse ile liste üretir.
- Yüklenen veri array ise logs dizisine atar, state’i geri getirir.
- _notify çağırır, UI log panelini ilk açılışta günceller.
- Hataları yutar, kullanıcı arayüzünün init sırasında çökmesini engeller.

3.1- LogManager.subscribe ; AMACI (3 CÜMLE)
Log değişimlerini dinlemek için callback kaydeder. Dönüşte unsubscribe fonksiyonu verir. UI tarafı bu sayede canlı güncelleme yapar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- listeners Set içine callback ekler, aynı fonksiyon tekrar eklenmez.
- Unsubscribe fonksiyonu döndürür, dinleyiciyi sonradan kaldırmayı sağlar.
- UI render fonksiyonlarının log değişiminde otomatik tetiklenmesini sağlar.
- Set kullandığı için performanslı ekle/sil davranışı sunar, ölçeklenir.
- Memory leak riskini azaltır, komponent kapanınca unsubscribe yapılabilir.
- _notify çağrılarında tüm listener’lar çalışır, veri akışı merkezi olur.
- Basit API sunar, log altyapısını diğer modüller için erişilebilir kılar.

3.1- LogManager._notify ; AMACI (3 CÜMLE)
Tüm dinleyicilere mevcut logs dizisini gönderir. Her callback’i try/catch ile izole eder. Bir dinleyici hata verirse diğerlerini etkilemez.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- listeners Set üzerinde döner, her callback’i sırasıyla çağırır.
- Callback’e logs listesini argüman verir, UI’nin veri kaynağı olur.
- try/catch ile callback hatalarını yutar, zincir kırılmasını engeller.
- init sonrası çağrılır, ilk yüklemede ekranın dolmasını sağlar.
- addLog sonrası çağrılır, canlı log akışını UI’ye taşır.
- clear sonrası çağrılır, UI’den logların anında silinmesini sağlar.
- Merkezi bildirimle modüller arası tutarlı güncelleme sağlar, senkron tutar.

3.1- LogManager.addLog ; AMACI (3 CÜMLE)
Yeni bir log kaydı üretir ve logs dizisine ekler. Stack parse ederek dosya/line/col bilgisi dahil eder. Limit aşarsa en eski logları silerek boyutu kontrol eder.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- Yeni Error oluşturur, stack bilgisini alır, _parseStack ile çözer.
- Zengin row objesi kurar, level/module/action/message gibi alanları doldurur.
- Eksik alanlarda default değerler kullanır, log formatını standardize eder.
- logs dizisine push eder, yeni kaydı sona ekler, sıralama korunur.
- _MAX aşılırsa baştan splice eder, en eski kayıtları temizler.
- _notify çağırır, UI’ye canlı güncelleme gönderir, anlık görünürlük sağlar.
- _scheduleSave çağırır, logları depolamaya hazırlar, kalıcılık sağlar.

3.1- LogManager.clear ; AMACI (3 CÜMLE)
Tüm logları temizler. UI’yi güncellemek için notify tetikler. Ardından kaydetmeyi planlayarak depoda da temizlenmesini sağlar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- logs dizisini boş dizi yapar, tüm kayıtları tek adımda siler.
- _notify çağırır, log panelinin anında boşalmasını sağlar.
- _scheduleSave çağırır, storage içeriğinin de güncellenmesini sağlar.
- Hızlı temizleme sağlar, uzun debug oturumlarında rahat reset imkânı verir.
- Export öncesi “temiz sayfa” almak için kullanıcıya pratik bir yol sunar.
- Dinleyiciler hata verse bile try/catch sayesinde çökmez, devam eder.
- Basit API ile UI butonlarına kolayca bağlanır, kullanım basitleşir.

3.1- LogManager.getLogs ; AMACI (3 CÜMLE)
Logları level ve search filtrelerine göre döndürür. Search metnini lower-case yaparak haystack içinde arar. Filtre boşsa tüm logları verir.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- search parametresini trim ve lowercase yapar, aramayı normalize eder.
- level filtresi varsa l.level eşitliğini kontrol eder, uygun olmayanı eler.
- Haystack string üretir, ts/level/page/module/action gibi alanları birleştirir.
- includes ile arama yapar, basit ve hızlı filtreleme sağlar.
- Filtre yoksa true döndürür, tüm kayıtların görünmesini sağlar.
- UI log panelindeki dropdown ve arama kutusunu doğrudan destekler.
- Export fonksiyonlarına filtrelenmiş liste sağlayarak tutarlı çıktı üretir.

3.1- LogManager.exportJsonl ; AMACI (3 CÜMLE)
Logları JSONL formatında dışa aktarmaya hazırlar. Her log kaydını JSON.stringify ile tek satır yapar. Satırları newline ile birleştirip string döndürür.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- getLogs çağırır, filtreleri uygular, export kapsamını belirler.
- Her entry’yi JSON.stringify ile dönüştürür, satır bazlı kayıt üretir.
- join('\n') ile satırları birleştirir, JSONL standardına uygun sonuç verir.
- Büyük loglarda satır bazlı parse kolaylaştırır, analiz araçlarına uyar.
- UI tarafında downloadTextFile ile indirilebilir metin oluşturur, pratiklik sağlar.
- Filtre parametresi alır, sadece istenen logları export etmeyi mümkün kılar.
- Format sabittir, otomasyon ve arşivleme için güvenilir çıktı sağlar.

3.1- LogManager.exportCsv ; AMACI (3 CÜMLE)
Logları CSV formatında döndürür. Sabit bir header listesi kullanır. Değerleri tırnaklayıp çift tırnakları kaçışlayarak güvenli CSV üretir.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- getLogs çağırır, filtrelenmiş entry listesini export için hazırlar.
- Header dizisini sabit tutar, kolon sırası her zaman aynı kalır.
- Her satırda header alanlarını map eder, row değerlerini sırayla alır.
- Değerleri String’e çevirir, çift tırnakları iki tırnakla kaçışlar.
- Satırları virgülle birleştirir, lines dizisine push eder, CSV oluşturur.
- join('\n') ile tüm satırları birleştirir, tek metin çıktısı üretir.
- Excel ve benzeri araçlarda açılabilir format sağlar, paylaşımı kolaylaştırır.

3.1- LogManager.exportText ; AMACI (3 CÜMLE)
Logları okunabilir düz metin formatında dışa aktarır. Her satırda ts, level, page ve konum bilgisi verir. message/result ve error alanlarını tek satırda toplar.
3.2- GÖREVLERİ (7 MADDE, 10–15 KELİME)
- getLogs çağırır, filtreleri uygular, çıktıdaki satırları seçer.
- level değerini uppercase yapar, görsel taramayı hızlandırır, okunur kılar.
- module.action biçimi üretir, log kaynağını tek bakışta gösterir.
- file:line:col ekler, doğrudan kod satırına gitmeyi kolaylaştırır.
- message yoksa result kullanır, boş satır riskini azaltır.
- error varsa “|” ile ekler, problem detayını satırda görünür yapar.
- join('\n') ile satırları birleştirir, kopyalanabilir tek metin döndürür.
```
