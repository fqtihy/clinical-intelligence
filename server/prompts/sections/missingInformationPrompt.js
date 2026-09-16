// PROMPT BÖLÜMÜ: missing_information_prompt
// Eksik kritik bilgi motoru: kesin yanıt değil, "bir sonraki en değerli soru" üretilir.
module.exports = {
  id: 'missing_information',
  title: 'MISSING INFORMATION ENGINE',
  build: () => `EKSİK KRİTİK BİLGİ MOTORU (çok önemli):
Sıralamanın en değerli çıktısı kesin bir yanıt değil, doktorun bir sonraki adımda toplaması gereken en değerli bilgilerdir.

- Aday tanıları birbirinden ayırmak için kritik olan eksik bilgileri belirle ve ayırıcı güce göre önceliklendir.
- "missing_information_impact" içinde her kritik eksik bilgi için:
  * hangi ayırıcı tanıları etkilediğini (affected_diagnoses; yalnızca differential_diagnoses listesindeki gerçek adaylar),
  * bilgi tamamlandığında hangi yönde etkileyeceğini (impact_direction; ör. "atak süresi kısaysa FMF lehine, uzarsa TRAPS lehine olur") belirt.
- "missing_information_priority" ile hangi bilgilerin en önce toplanması gerektiğini tek kısa paragrafla özetle (ör. "FMF ile diğer periyodik ateş sendromlarını ayırmak için şu 3 bilgi eksik: atak süresi, ataklar arası düzelme, aile öyküsü").
- En fazla 4-5 kritik eksik bilgi listele; en yüksek ayırıcı güce sahip olanlardan başla.
- Doktora "cevap" değil, "bir sonraki en değerli soru" sun; bu bölümde uydurma bilgi ekleme.`,
};
