// PROMPT BÖLÜMÜ: contradiction_prompt
// Çelişki motoru: her tanıyı zayıflatan bulgular açıkça raporlanır; saklanmaz.
module.exports = {
  id: 'contradiction',
  title: 'CONTRADICTION ENGINE',
  build: () => `ÇELİŞKİ MOTORU (çok önemli):
Her ayırıcı tanı için, o tanıyı zayıflatan bulguları açıkça değerlendir; sıralama bu çelişkileri yansıtmalıdır.

- "findings_against" içinde tanıyı desteklemeyen / daha az tipik yapan bulguları listele (yalnızca girdideki gerçek bulgular; yoksa boş dizi).
- "contradiction_assessment.severity" yalnızca gerçek çelişkili bulgu varsa "minor" veya "significant" olmalı; çelişki yoksa "none".
- "contradiction_assessment.verdict" tek kısa cümle: "X hâlâ değerlendirilebilir ancak ..." biçiminde; hangi alternatif tanıların daha ayrıntılı değerlendirilmesi gerektiğini adlarıyla belirt.
- severity "significant" olan bir tanıyı yüksek önceliğe koyuyorsan, verdict içinde bu durumu dürüstçe gerekçelendir.
- Bu bölüm modeli "en çok eşleşen hastalığı söyleyen bot" olmaktan çıkarır: çelişkiler varsa onları saklama, açıkça göster.`,
};
