**BAĞLANTILI**

# Puter.js AI API Referans Rehberi (Chrome Eklentisi MV3 Odaklı)

Puter.js; tek bir birleşik API ile **500+ AI modele** (OpenAI, Anthropic, Google, DeepSeek vb.) erişim sağlayan, **tarayıcı tarafında** çalışabilen bir SDK’dır. Bu rehber; Puter.js’i **Google Chrome Extension (Manifest V3)** içinde **CSP’ye takılmadan** kullanacak şekilde revize edilmiştir.

---

## 0) Chrome Eklentisinde Puter.js Kullanırken “Altın Kurallar” 🛡️

### 0.1 Remote Script YASAK 🚫

* ✅ **Yap:** Puter SDK dosyasını **eklenti içine kopyala** (vendor et).
* ❌ **Yapma:** Popup/Options gibi “extension pages” içinde
  `https://js.puter.com/v2/` gibi **uzaktan script** yükleme.

> Not: MV3’te “extension pages” **remote code** çalıştırmayı engeller. Script’i yerelde tutman gerekir.

### 0.2 Inline Script YASAK 🧱

* ✅ **Yap:** Tüm JavaScript’i `.js` dosyalarına taşı.
* ❌ **Yapma:** `arayuz.html` içinde `<script> ... </script>` inline kod yazma.

### 0.3 Arayüz Sayfası ≠ Service Worker ⚙️

* ✅ **Popup/Options (UI):** `puter.ai.*` çağrılarını UI içinde yapmak en rahatı.
* ✅ **Background Service Worker:** Ağ işleri, mesajlaşma, scheduler gibi arka plan işlerini burada yönet.
* ⚠️ **HTMLImageElement / HTMLAudioElement / HTMLVideoElement** dönen fonksiyonları (txt2img, txt2speech, txt2vid) **UI tarafında** kullan.

---

## 1) Kurulum: MV3 Uyumlu Yapı Oluştur 📦

### 1.1 Dosya Yapısını Kur ✅

```text
extension/
  manifest.json
  popup.html
  popup.js
  lib/
    puter-v2.js
  icons/
    16.png
    48.png
    128.png
```

### 1.2 Puter SDK’yı Yerelleştir 📌

* ✅ `https://js.puter.com/v2/` içeriğini indir.
* ✅ Dosyayı `lib/puter-v2.js` olarak projenin içine koy.
* ❌ Popup/Options içinde CDN’den yükleme yapma.

---

## 2) MV3 Manifest Ayarı (Temel) 🧾

### 2.1 Manifest’i MV3’e Göre Tanımla ✅

> Amaç: Popup aç, scriptleri **self** kaynaktan yükle, CSP’yi temiz tut.

```json
{
  "manifest_version": 3,
  "name": "Puter.js MV3 Extension",
  "version": "1.0.0",
  "description": "Puter.js'i MV3 CSP kurallarına uygun şekilde kullanır.",
  "action": { "default_popup": "popup.html" },
  "permissions": ["storage"],
  "icons": {
    "16": "icons/16.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self';"
  }
}
```

> Eğer Puter SDK bazı senaryolarda WASM/eval isterse (her SDK sürümüne göre değişebilir):

* ✅ Gerekirse ekle: `'wasm-unsafe-eval'`
* ❌ Gerek yoksa ekleme (en sıkı politika daha iyidir)

---

## 3) HTML Kurulumu (CDN YOK, INLINE YOK) 🧩

### 3.1 Popup HTML’e Yalnızca Yerel Script Bağla ✅

```html
<!-- popup.html -->
<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Puter UI</title>
</head>
<body>
  <textarea id="prompt" placeholder="Sorunu yaz..."></textarea>
  <button id="run">Gönder</button>
  <pre id="out">Hazır.</pre>

  <!-- ✅ Yerel Puter SDK -->
  <script src="lib/puter-v2.js"></script>

  <!-- ✅ Yerel uygulama kodu -->
  <script src="popup.js"></script>
</body>
</html>
```

---

## 4) Metin & Sohbet (puter.ai.chat) 💬

### 4.1 Sözdizimi

* ✅ `puter.ai.chat(prompt, options)`

### 4.2 Parametreler

* **prompt**

  * ✅ String: `"Merhaba!"`
  * ✅ Mesaj dizisi: `[{ role: "user", content: "..." }]`
* **options**

  * ✅ `model`: `"gpt-5-nano"` gibi
  * ✅ `stream`: `true/false`
  * ✅ `tools`: function calling ve web_search için
  * ✅ `testMode`: `true` (kredi harcamadan test)

### 4.3 Popup içinde Örnek Kullanım (MV3 Uyumlu) ✅

```js
// popup.js
document.getElementById("run").addEventListener("click", async () => {
  const out = document.getElementById("out");
  const prompt = document.getElementById("prompt").value.trim();
  if (!prompt) return (out.textContent = "⚠️ Metin gir.");

  out.textContent = "⏳ Çalışıyor...";

  try {
    const resp = await puter.ai.chat(prompt, {
      model: "gpt-5-nano",
      testMode: true
    });

    // SDK yanıt formatına göre string ya da objeyi güvenli bas
    out.textContent = typeof resp === "string" ? resp : JSON.stringify(resp, null, 2);
  } catch (e) {
    out.textContent = "❌ Hata: " + (e?.message || String(e));
  }
});
```

---

## 5) Önemli Model & Sağlayıcı Seçimi 🧠

Puter.js tek API ile farklı sağlayıcılara eriştirir. Model seçimini **options.model** ile yap:

### 5.1 OpenAI

* `gpt-4o` (dengeli amiral gemisi)
* `gpt-4o-mini` (hızlı/ucuz)
* `o1-preview` / `o1-mini` (reasoning odaklı)
* `gpt-4-turbo` (klasik yüksek performans)

### 5.2 Anthropic

* `claude-3-5-sonnet` (kodlama + yaratıcı)
* `claude-3-5-haiku` (çok hızlı)
* `claude-3-opus` (derin analiz)
* `claude-3-sonnet`, `claude-3-haiku`

### 5.3 Google (Gemini)

* `gemini-1.5-pro` (çok büyük context)
* `gemini-1.5-flash` (hızlı multimodal)
* `gemini-1.5-flash-8b`
* `gemini-1.0-pro`
* `gemini-ultra`

### 5.4 DeepSeek

* `deepseek-v3` (genel chat)
* `deepseek-r1` (reasoning)
* `deepseek-coder` (kod)
* `deepseek-chat`
* `deepseek-reasoner`

---

## 6) Görsel Analizi & Multimodal 🖼️

* ✅ Multimodal mesajlar desteklenir (örn. `type: "file"` veya `puter_path`).
* ✅ Eklenti tarafında dosyayı **UI’dan seçtir**, içeriği Puter’a uygun formatta gönder.
* ⚠️ Hedef sayfanın CSP’si varsa (content script ile çalışıyorsan) ayrı değerlendirme yap.

---

## 7) Görsel Üretimi (puter.ai.txt2img) 🎨

* ✅ `puter.ai.txt2img(prompt, options)`
* ✅ Dönüş: **HTMLImageElement** (Promise içinde)
* ✅ Örnek modeller: `gpt-image-1.5`, `dall-e-3`, `gemini-2.5-flash-image-preview`
* ✅ UI tarafında `img.src = ...` gibi göster.

> Emir: Görsel üretimi işini **popup/options** içinde yap. Service worker’da DOM yok.

---

## 8) Ses & Konuşma 🔊

### 8.1 Text-to-Speech

* ✅ `puter.ai.txt2speech(text, options)` → **HTMLAudioElement**

### 8.2 Speech-to-Text

* ✅ `puter.ai.speech2txt(audioSource, options)` → transkript

### 8.3 Speech-to-Speech

* ✅ `puter.ai.speech2speech(source, options)` → ses dönüşümü (örn. ElevenLabs)

> Emir: Audio element dönen işleri UI tarafında çalıştır; izin (autoplay vs.) yönetimini unutma.

---

## 9) Video Üretimi (puter.ai.txt2vid) 🎬

* ✅ `puter.ai.txt2vid(prompt, options)`
* ✅ Dönüş: **HTMLVideoElement**
* ✅ Modeller: `sora-2` veya `together` gibi seçenekler

> Emir: Videoyu UI tarafında üret ve `<video>` ile göster.

---

## 10) Gelişmiş Özellikler 🧰

### 10.1 Function Calling (tools) 🔧

* ✅ `tools` ile yerel fonksiyon şemaları tanımla
* ✅ Model `tool_calls` döndürürse:

  * Emir: Tool’u **yerelde çalıştır**
  * Emir: Sonucu modele **geri gönder**

### 10.2 Web Search (OpenAI Modellerinde) 🌐

* ✅ `tools: [{ type: "web_search" }]`

### 10.3 Test Modu ✅

* ✅ `testMode: true` ile kredi harcamadan akışı doğrula
* Emir: Önce testMode ile geliştir, sonra prod’da kapat.

---

## 11) Chrome Eklentisi İçin “Sık Görülen Hatalar” ve Çözüm ✅🧯

### 11.1 “Loading the script ... violates CSP” 🚫

* ✅ Çöz: `https://js.puter.com/v2/` script tag’ini kaldır.
* ✅ Çöz: SDK’yı `lib/puter-v2.js` olarak yerelleştir.

### 11.2 “Executing inline script violates CSP” 🧱

* ✅ Çöz: Tüm inline `<script>...</script>` bloklarını kaldır.
* ✅ Çöz: Kodları `popup.js` / `options.js` gibi dosyalara taşı.

### 11.3 “Invalid or unexpected token” 🧨

* ✅ Çöz: Akıllı tırnakları düz tırnak yap (`“ ”` → `"`, `’` → `'`)
* ✅ Çöz: Dosyayı UTF-8 kaydet.
* ✅ Çöz: Hatalı satırı silip **elle yeniden yaz** (görünmez karakterleri temizler).

---

## 12) Eklenti Mimari Önerisi (Pratik) 🧭

* ✅ **Popup/Options:** Puter çağrılarını yap, UI göster.
* ✅ **Background SW:** Gerekirse mesaj kuyruğu, cache, storage, scheduling yönet.
* ✅ **Content Script (opsiyonel):** Sayfa üstüne UI ekleyeceksen kullan; ama sayfa CSP’sini hesaba kat.

---

