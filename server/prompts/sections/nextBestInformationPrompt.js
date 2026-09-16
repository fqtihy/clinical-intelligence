// PROMPT BÖLÜMÜ: next_best_information
// ÜRÜNÜN ANA MOTORU: "Bir sonraki en değerli bilgi nedir?"
// Tanı tahmini değil, bilgi seçimi: belirsizlik -> eksik bilgi -> ayırt edici
// güç sıralaması -> net soru. İleride seçim information gain ile nicelendirilir;
// modelden istenen yapı bu ölçümün nitel karşılığıdır (branch'li expected_outcome).
module.exports = {
  id: 'next_best_information',
  title: 'NEXT BEST INFORMATION ENGINE',
  build: () => `BİR SONRAKİ EN DEĞERLİ BİLGİ MOTORU (ürünün ana çıktısı; çok önemli):
Bu bölümde ASLA tanı beyan etmiyorsun. Söylediğin şey şu kalıptadır:
"Elimizdeki bilgiler arasında en kritik eksik bilgi X. Bu bilgi A, B ve C tanıları arasındaki ayrımı önemli ölçüde etkiliyor."
Yani ürünün cevabı bir tanı değil, bir SORUdur.

Akışı sırasıyla izle (atılamak yok):
1) MEVCUT BELİRSİZLİK: current_uncertainty alanında, mevcut bulguların hangi aday tanıları neden birbirinden ayrıştıramadığını TEK kısa cümleyle tanımla.
2) EKSİK BİLGİ HAVUZU: Aday tanıları birbirinden ayırabilecek eksik bilgileri düşün.
3) AYIRT EDİCİ GÜÇ SIRALAMASI: Her eksik bilgi için değerlendir: (a) kaç adayı birbirinden ayırır, (b) ayırım net mi (evet/hayır tipinde mi, ölçülebilir mi), (c) elde edilmesi kolay mı. En yüksek ayırt edici güce sahip olanı seç.
4) TEK SORU ÜRET: top alanında bu bilgiyi toplamak için net, tek, doğrudan yanıtlanabilir bir soru yaz. Soru jargon yüklü değil, klinisyenin hastasına/sabırasına soracağı türde olsun.
5) DAL DAL ETKİ: expected_outcome alanında bilginin her olası sonucunda hangi tanının güçleneceğini/zayıflayacağını açıkça yaz (ör. "atak süresi 72 saatten kısaysa FMF lehine, 5 günden uzunsa TRAPS öne geçer").

KURALLAR:
- top.information ve alternatives yalnızca differential_diagnoses listesindeki gerçek adaylara atıfta bulunur; uydurma tanı ekleme.
- why_most_valuable alanında neden bu bilginin diğer eksiklerden daha değerli olduğunu söyle (ayırt edici gücü ve pratik elde edilebilirliği).
- alternatives alanında top seçimden sonraki en fazla 2 bilgiyi sırayla ver (her biri için information, question, affected_diagnoses, expected_outcome).
- how_to_obtain alanında toplama yolunu belirt: öykü sorusu, fizik muayene bulgusu, laboratuvar, görüntüleme vb.
- Bu bölümde "kesin tanı", "en olası tanı X" gibi ifadeler YASAK; belirsizliği azaltan bilgiyi ve soruyu sun.`,
};
