/*
  Kısa açıklama (~15 kelime): puter.ai.chat ile mesaj gönderir; cevabı out div’ine basar, hatayı yakalar.
*/

const $msg = document.getElementById('msg');
const $send = document.getElementById('send');
const $out = document.getElementById('out');

function appendLine(prefix, text) {
  $out.textContent += `${prefix}${text}\n`;
}

async function cevapUret(kullaniciMesaji) {
  try {
    // Puter.js'in chat metodu çağrılır
    const cevap = await puter.ai.chat(kullaniciMesaji);
    console.log('AI Yanıtı:', cevap);
    return String(cevap ?? '');
  } catch (hata) {
    console.error('Puter Entegrasyon Hatası:', hata);
    return 'Üzgünüm, şu an yanıt veremiyorum.';
  }
}

async function handleSend() {
  const text = String($msg.value || '').trim();
  if (!text) return;

  $send.disabled = true;
  appendLine('[SEN] ', text);
  $msg.value = '';

  const reply = await cevapUret(text);
  appendLine('[AI]  ', reply);
  $send.disabled = false;
}

$send.addEventListener('click', handleSend);
$msg.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSend();
});
